// V3/Views/ConfirmTxViewV3.swift
//
// Replaces V1 ConfirmTxView. Same biometric gate + transfer + activity
// recording logic, V3 chrome.

import SwiftUI

struct ConfirmTxViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    @State private var confirming = false

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Confirm Transaction") {
                store.screen = .dashboard
            }

            VStack(spacing: 20) {
                Spacer()

                ZStack {
                    Circle()
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                        .frame(width: 80, height: 80)
                    Image(systemName: "checkmark")
                        .font(.system(size: 28, weight: .light))
                        .foregroundColor(V3Colors.goldPrimary)
                }

                Text("APPROVE TRANSACTION")
                    .font(V3Fonts.caption(11))
                    .tracking(1.5)
                    .foregroundColor(V3Colors.textSecondary)

                summaryCard

                Spacer()

                HStack(spacing: 12) {
                    SecondaryButton(title: "Reject") {
                        store.screen = .dashboard
                    }

                    PrimaryButton(
                        title: confirming ? "Approving…" : "Approve",
                        action: confirm,
                        isEnabled: !confirming
                    )
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private var summaryCard: some View {
        VStack(spacing: 10) {
            detailRow("Type", store.sendForm.transferType.label)
            detailRow("Token", store.sendForm.token)
            detailRow("Amount", store.sendForm.amount)
            if !store.sendForm.to.isEmpty {
                detailRow("To", String(store.sendForm.to.prefix(12)) + "…")
            }
        }
        .v3Card()
        .padding(.horizontal, 16)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(V3Fonts.caption(12))
                .foregroundColor(V3Colors.textSecondary)
            Spacer()
            Text(value)
                .font(V3Fonts.bodyMedium(14))
                .foregroundColor(V3Colors.textPrimary)
        }
    }

    private func confirm() {
        confirming = true
        Task {
            do {
                try await store.passkeyManager.authenticateWithBiometrics(
                    reason: "Authenticate to approve transaction"
                )

                let tokenAddress = store.tokenAddresses[store.sendForm.token] ?? ""
                _ = try await pxeBridge.transfer(
                    to: store.sendForm.to,
                    amount: store.sendForm.amount,
                    tokenAddress: tokenAddress,
                    transferType: store.sendForm.transferType.rawValue
                )

                let activity = Activity(
                    type: .send,
                    label: "Sent \(store.sendForm.token)",
                    amount: "-\(store.sendForm.amount) \(store.sendForm.token)",
                    isPrivate: store.sendForm.transferType.isPrivate
                )
                store.activities.insert(activity, at: 0)
                store.saveActivities()

                store.showToast("Transaction confirmed", type: .success)
                store.sendForm = SendForm()

                await store.fetchBalances()

                store.screen = .dashboard
            } catch {
                store.showToast("Failed: \(error.localizedDescription)", type: .error)
            }
            confirming = false
        }
    }
}
