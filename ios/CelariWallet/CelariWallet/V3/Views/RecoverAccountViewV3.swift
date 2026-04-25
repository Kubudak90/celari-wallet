// V3/Views/RecoverAccountViewV3.swift
//
// Replaces RecoverAccountViewV2. Same 4-step flow (input → waiting →
// timeLock → complete), all relay + pxeBridge calls preserved verbatim,
// V3 chrome.

import SwiftUI

struct RecoverAccountViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    enum Step { case input, waiting, timeLock, complete }

    @State private var step: Step = .input
    @State private var accountAddress = ""
    @State private var password = ""
    @State private var processing = false
    @State private var recoveryId = ""
    @State private var approvalCount = 0
    @State private var thresholdMet = false
    @State private var guardianStatuses: [Bool] = [false, false, false]
    @State private var newPubKeyX = ""
    @State private var newPubKeyY = ""
    @State private var polling = false
    @State private var pollAttempts = 0
    @State private var timeLockStart: Date?
    @State private var canExecuteChain: Bool = false
    @State private var recoveryDeadline: Date = .distantFuture

    private let relayBaseUrl = "https://recovery.celariwallet.com"
    private let maxPollAttempts = 120

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Recover Account") {
                store.screen = .onboarding
            }

            ScrollView {
                VStack(spacing: 20) {
                    switch step {
                    case .input:    inputStep
                    case .waiting:  waitingStep
                    case .timeLock: timeLockStep
                    case .complete: completeStep
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 32)
            }
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    // MARK: - Step 1: Input

    private var inputStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Account Recovery")
                    .font(V3Fonts.h2(22))
                    .foregroundColor(V3Colors.textPrimary)
                Text("Enter your account address and recovery password to start the recovery process.")
                    .font(V3Fonts.body(14))
                    .foregroundColor(V3Colors.textSecondary)
            }

            VStack(alignment: .leading, spacing: 12) {
                labelledField("ACCOUNT ADDRESS") {
                    TextField("0x…", text: $accountAddress)
                        .font(V3Fonts.mono(14))
                        .foregroundColor(V3Colors.textPrimary)
                        .autocapitalization(.none)
                }
                labelledField("RECOVERY PASSWORD") {
                    SecureField("Password", text: $password)
                        .font(V3Fonts.body(15))
                        .foregroundColor(V3Colors.textPrimary)
                }
            }

            PrimaryButton(
                title: processing ? "Starting…" : "Start Recovery",
                action: { Task { await startRecovery() } },
                isEnabled: !accountAddress.isEmpty && !password.isEmpty && !processing
            )
        }
    }

    // MARK: - Step 2: Waiting

    private var waitingStep: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                    .frame(width: 80, height: 80)
                Image(systemName: "envelope.badge")
                    .font(.system(size: 32, weight: .light))
                    .foregroundColor(V3Colors.goldPrimary)
            }
            .padding(.top, 12)

            Text("WAITING FOR GUARDIANS")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.textSecondary)

            Text("Approval requests have been sent to your guardians. Ask 2 of 3 to approve.")
                .font(V3Fonts.body(14))
                .foregroundColor(V3Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)

            HStack(spacing: 16) {
                ForEach(0..<3, id: \.self) { i in
                    VStack(spacing: 6) {
                        Circle()
                            .fill(guardianStatuses[i] ? V3Colors.statusUp : V3Colors.bgRaised)
                            .overlay(
                                Image(systemName: guardianStatuses[i] ? "checkmark" : "person")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(guardianStatuses[i] ? V3Colors.bgBase : V3Colors.textMuted)
                            )
                            .frame(width: 44, height: 44)
                        Text("Guardian \(i + 1)")
                            .font(V3Fonts.mono(10))
                            .foregroundColor(V3Colors.textSecondary)
                    }
                }
            }

            Text("\(approvalCount)/2 approvals")
                .font(V3Fonts.mono(14))
                .foregroundColor(thresholdMet ? V3Colors.statusUp : V3Colors.goldPrimary)

            SecondaryButton(title: polling ? "Checking…" : "Check Status",
                            action: { Task { await checkStatus() } },
                            isEnabled: !polling)
        }
    }

    // MARK: - Step 3: Time-Lock

    private var timeLockStep: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                    .frame(width: 88, height: 88)
                Image(systemName: "lock.badge.clock")
                    .font(.system(size: 36, weight: .light))
                    .foregroundColor(V3Colors.goldPrimary)
            }
            .padding(.top, 12)

            Text("24H TIME-LOCK")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.goldPrimary)

            Text("Guardian threshold reached. For security, there is a 24-hour waiting period before recovery can be finalized.")
                .font(V3Fonts.body(14))
                .foregroundColor(V3Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)

            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = max(0, recoveryDeadline.timeIntervalSince(context.date))
                let hours = Int(remaining) / 3600
                let minutes = (Int(remaining) % 3600) / 60
                let seconds = Int(remaining) % 60

                VStack(spacing: 16) {
                    Text("Recovery Time-Lock")
                        .font(V3Fonts.bodyMedium(15))
                        .foregroundColor(V3Colors.textPrimary)

                    Text(String(format: "%02d:%02d:%02d", hours, minutes, seconds))
                        .font(.system(size: 44, weight: .bold, design: .monospaced))
                        .foregroundColor(remaining > 0 ? V3Colors.textSecondary : V3Colors.statusUp)

                    if remaining <= 0 {
                        PrimaryButton(
                            title: processing ? "Finalizing…" : "Finalize Recovery",
                            action: { Task { await finalizeRecovery() } },
                            isEnabled: !processing
                        )
                    } else {
                        Text("Recovery will be available when countdown reaches zero")
                            .font(V3Fonts.caption(12))
                            .foregroundColor(V3Colors.textMuted)
                            .multilineTextAlignment(.center)
                    }
                }
            }
            .onAppear {
                if timeLockStart == nil { timeLockStart = Date() }
                if recoveryDeadline == .distantFuture, let start = timeLockStart {
                    recoveryDeadline = start.addingTimeInterval(86400)
                }
                Task { await refreshCountdownFromChain() }
            }
        }
    }

    // MARK: - Step 4: Complete

    private var completeStep: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .stroke(V3Colors.statusUp, lineWidth: 1.5)
                    .frame(width: 88, height: 88)
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 36, weight: .light))
                    .foregroundColor(V3Colors.statusUp)
            }
            .padding(.top, 12)

            Text("ACCOUNT RECOVERED")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.statusUp)

            Text("Your account has been recovered with a new signing key. You can now use your wallet normally.")
                .font(V3Fonts.body(14))
                .foregroundColor(V3Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)

            PrimaryButton(title: "Go to Dashboard") {
                store.screen = .dashboard
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Helpers

    private func labelledField<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(V3Fonts.caption(11))
                .tracking(1.0)
                .foregroundColor(V3Colors.textSecondary)
            content()
                .padding(14)
                .background(V3Colors.bgRaised)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        }
    }

    // MARK: - Actions (preserved from V2)

    private func startRecovery() async {
        processing = true
        do {
            let keys = try await pxeBridge.generateKeys()
            newPubKeyX = keys["pubKeyX"] as? String ?? ""
            newPubKeyY = keys["pubKeyY"] as? String ?? ""

            guard let url = URL(string: "\(relayBaseUrl)/api/initiate") else { return }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let body: [String: Any] = [
                "accountAddress": accountAddress,
                "newPubKeyX": newPubKeyX,
                "newPubKeyY": newPubKeyY
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, _) = try await URLSession.shared.data(for: request)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let rid = json["recoveryId"] as? String {
                recoveryId = rid
                step = .waiting
            }
        } catch {
            store.showToast("Recovery start failed: \(error.localizedDescription)", type: .error)
        }
        processing = false
    }

    private func checkStatus() async {
        pollAttempts += 1
        if pollAttempts > maxPollAttempts {
            store.showToast("Max status checks reached. Contact your guardians directly to approve.", type: .error)
            return
        }
        polling = true
        do {
            guard let url = URL(string: "\(relayBaseUrl)/api/status?rid=\(recoveryId)") else { return }
            let (data, _) = try await URLSession.shared.data(from: url)
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                approvalCount = json["approvalCount"] as? Int ?? 0
                thresholdMet = json["thresholdMet"] as? Bool ?? false
                if let statuses = json["guardianStatuses"] as? [Bool] {
                    guardianStatuses = statuses
                }
                if thresholdMet {
                    timeLockStart = Date()
                    step = .timeLock
                }
            }
        } catch {
            store.showToast("Status check failed (attempt \(pollAttempts)/\(maxPollAttempts))", type: .error)
        }
        polling = false
    }

    private func refreshCountdownFromChain() async {
        do {
            let status = try await pxeBridge.checkRecoveryStatus()
            if let active = status["active"] as? Bool, active,
               let startBlock = status["startBlock"] as? Int,
               let currentBlock = status["currentBlock"] as? Int {
                let blocksRemaining = max(0, 7200 - (currentBlock - startBlock))
                let remainingSeconds = Double(blocksRemaining) * 12.0
                recoveryDeadline = Date().addingTimeInterval(remainingSeconds)
                store.scheduleRecoveryNotification(deadline: recoveryDeadline)

                if blocksRemaining == 0 {
                    canExecuteChain = true
                }
            }
        } catch {
            // Silently fall back to local timer on failure
        }
    }

    private func finalizeRecovery() async {
        processing = true
        do {
            _ = try await pxeBridge.initiateRecovery(
                newKeyX: newPubKeyX,
                newKeyY: newPubKeyY,
                guardianKeyA: "",
                guardianKeyB: ""
            )
            _ = try await pxeBridge.executeRecovery(
                newKeyX: newPubKeyX,
                newKeyY: newPubKeyY
            )
            step = .complete
            store.showToast("Account recovered", type: .success)
        } catch {
            store.showToast("Recovery failed: \(error.localizedDescription)", type: .error)
        }
        processing = false
    }
}
