// V3/Views/GuardianSetupViewV3.swift
//
// Replaces GuardianSetupViewV2. Same 3-step flow (input → processing →
// done), V3 chrome. Guardian key generation, hashing, and pxeBridge call
// preserved verbatim.

import SwiftUI
import CryptoKit

struct GuardianSetupViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    enum Step { case input, processing, done }

    @State private var step: Step = .input
    @State private var guardian1Email = ""
    @State private var guardian2Email = ""
    @State private var guardian3Email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var guardianKeys: [GuardianKeyV3] = []
    @State private var processing = false

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Guardian Setup") {
                store.screen = .dashboard
            }

            ScrollView {
                VStack(spacing: 20) {
                    switch step {
                    case .input:      inputStep
                    case .processing: processingStep
                    case .done:       doneStep
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
                Text("Social Recovery")
                    .font(V3Fonts.h2(22))
                    .foregroundColor(V3Colors.textPrimary)
                Text("Designate 3 trusted guardians who can help recover your account. Any 2 of 3 must approve a recovery request.")
                    .font(V3Fonts.body(14))
                    .foregroundColor(V3Colors.textSecondary)
            }

            VStack(spacing: 12) {
                guardianField("GUARDIAN 1", placeholder: "alice@example.com", text: $guardian1Email)
                guardianField("GUARDIAN 2", placeholder: "bob@example.com", text: $guardian2Email)
                guardianField("GUARDIAN 3", placeholder: "carol@example.com", text: $guardian3Email)
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("RECOVERY PASSWORD")
                    .font(V3Fonts.caption(11))
                    .tracking(1.0)
                    .foregroundColor(V3Colors.textSecondary)

                secureField("Password (8+ characters)", text: $password)
                secureField("Confirm password", text: $confirmPassword)

                if !password.isEmpty && !confirmPassword.isEmpty && password != confirmPassword {
                    Text("Passwords do not match")
                        .font(V3Fonts.caption(11))
                        .foregroundColor(V3Colors.statusDown)
                }
            }

            PrimaryButton(
                title: processing ? "Setting up…" : "Setup Guardians",
                action: { Task { await setupGuardians() } },
                isEnabled: canSubmit && !processing
            )
        }
    }

    // MARK: - Step 2: Processing

    private var processingStep: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 60)
            ProgressView()
                .scaleEffect(1.5)
                .tint(V3Colors.goldPrimary)

            Text("SETTING UP GUARDIANS")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.textSecondary)

            Text("Storing guardian hashes on-chain.\nThis may take a few minutes.")
                .font(V3Fonts.body(14))
                .foregroundColor(V3Colors.textSecondary)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Step 3: Done

    private var doneStep: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .stroke(V3Colors.statusUp, lineWidth: 1.5)
                    .frame(width: 88, height: 88)
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 36, weight: .light))
                    .foregroundColor(V3Colors.statusUp)
            }
            .padding(.top, 12)

            Text("GUARDIANS CONFIGURED")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.statusUp)

            Text("Share each guardian's unique key with them securely. They will need it to approve a recovery request.")
                .font(V3Fonts.body(14))
                .foregroundColor(V3Colors.textSecondary)
                .multilineTextAlignment(.center)

            ForEach(guardianKeys) { gk in
                VStack(alignment: .leading, spacing: 6) {
                    Text(gk.email)
                        .font(V3Fonts.bodyMedium(14))
                        .foregroundColor(V3Colors.textPrimary)

                    HStack {
                        Text(gk.key.prefix(20) + "..." + gk.key.suffix(8))
                            .font(V3Fonts.mono(11))
                            .foregroundColor(V3Colors.textSecondary)
                        Spacer()
                        Button {
                            UIPasteboard.general.string = gk.key
                            store.showToast("Key copied", type: .success)
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.system(size: 13))
                                .foregroundColor(V3Colors.goldPrimary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .v3Card()
            }

            PrimaryButton(title: "Done") {
                store.screen = .dashboard
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Helpers

    private var canSubmit: Bool {
        [guardian1Email, guardian2Email, guardian3Email].allSatisfy { $0.contains("@") } &&
        password.count >= 8 &&
        password == confirmPassword
    }

    private func guardianField(_ label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(V3Fonts.caption(11))
                .tracking(1.0)
                .foregroundColor(V3Colors.textSecondary)
            TextField(placeholder, text: text)
                .font(V3Fonts.body(15))
                .foregroundColor(V3Colors.textPrimary)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)
                .padding(14)
                .background(V3Colors.bgRaised)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        }
    }

    private func secureField(_ placeholder: String, text: Binding<String>) -> some View {
        SecureField(placeholder, text: text)
            .font(V3Fonts.body(15))
            .foregroundColor(V3Colors.textPrimary)
            .padding(14)
            .background(V3Colors.bgRaised)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
    }

    private func setupGuardians() async {
        processing = true
        step = .processing

        let keys = (0..<3).map { _ in
            Data((0..<32).map { _ in UInt8.random(in: 0...255) })
        }
        let emails = [guardian1Email, guardian2Email, guardian3Email]

        guardianKeys = zip(emails, keys).map { email, key in
            GuardianKeyV3(email: email, key: key.map { String(format: "%02x", $0) }.joined())
        }

        let hashes = keys.map { key -> String in
            let digest = SHA256.hash(data: key)
            let truncated = Array(digest.prefix(31))
            return "0x" + truncated.map { String(format: "%02x", $0) }.joined()
        }

        let recoveryPayload: [String: Any] = [
            "guardians": emails,
            "threshold": 2,
            "createdAt": ISO8601DateFormatter().string(from: Date()),
            "account": store.activeAccount?.address ?? ""
        ]
        let payloadData = try? JSONSerialization.data(withJSONObject: recoveryPayload)
        let cidHash = SHA256.hash(data: payloadData ?? Data())
        let cidHex = cidHash.map { String(format: "%02x", $0) }.joined()
        let cidPart1 = "0x" + String(cidHex.prefix(62))
        let cidPart2 = "0x" + String(cidHex.suffix(from: cidHex.index(cidHex.startIndex, offsetBy: 62))).padding(toLength: 62, withPad: "0", startingAt: 0)

        if let payloadData {
            let recoveryPath = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("celari/recovery")
            try? FileManager.default.createDirectory(at: recoveryPath!, withIntermediateDirectories: true)
            try? payloadData.write(to: recoveryPath!.appendingPathComponent("\(cidHex.prefix(16)).json"))
        }

        do {
            _ = try await pxeBridge.setupGuardians(
                guardianHash0: hashes[0],
                guardianHash1: hashes[1],
                guardianHash2: hashes[2],
                threshold: 2,
                cidPart1: cidPart1,
                cidPart2: cidPart2
            )
            step = .done
            store.showToast("Guardians configured", type: .success)
        } catch {
            store.showToast("Guardian setup failed: \(error.localizedDescription)", type: .error)
            step = .input
        }

        processing = false
    }
}

struct GuardianKeyV3: Identifiable {
    let id = UUID()
    let email: String
    let key: String
}
