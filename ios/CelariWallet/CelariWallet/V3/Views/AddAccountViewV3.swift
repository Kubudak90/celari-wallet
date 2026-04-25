// V3/Views/AddAccountViewV3.swift
//
// Replaces AddAccountViewV2. Same logic (createPasskeyAccount), V3 chrome.

import SwiftUI

struct AddAccountViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge
    @Environment(\.dismiss) private var dismiss

    @State private var creating = false

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Add Account") {
                store.screen = .dashboard
            }

            Spacer()

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                        .frame(width: 88, height: 88)
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 36, weight: .light))
                        .foregroundColor(V3Colors.goldPrimary)
                }

                Text("Add Account")
                    .font(V3Fonts.h2(24))
                    .foregroundColor(V3Colors.textPrimary)

                Text("Create a new passkey-authenticated account with Face ID or Touch ID.")
                    .font(V3Fonts.body(15))
                    .foregroundColor(V3Colors.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            VStack(spacing: 12) {
                PrimaryButton(
                    title: creating ? "Creating…" : "Create with Passkey",
                    action: createAccount,
                    isEnabled: !creating
                )
                SecondaryButton(title: "Restore from backup") {
                    store.screen = .restore
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private func createAccount() {
        creating = true
        Task {
            do {
                try await store.createPasskeyAccount(pxeBridge: pxeBridge)
                store.screen = .dashboard
            } catch {
                store.showToast("Account creation failed: \(error.localizedDescription)", type: .error)
            }
            creating = false
        }
    }
}

