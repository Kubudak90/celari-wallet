// V3/Views/OnboardingViewV3.swift

import SwiftUI

struct OnboardingViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge
    @State private var creating = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            CelariLogoView(variant: .lockup, height: 56)
                .padding(.top, 12)

            Spacer().frame(height: 28)

            Text("Your crypto.\nYour privacy.\nAlways.")
                .font(V3Fonts.h1(36))
                .foregroundColor(V3Colors.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(3)

            Spacer().frame(height: 32)

            VStack(spacing: 20) {
                feature(symbol: "shield.lefthalf.filled",
                        title: "Self-Custody",
                        body: "You have full control. Always.")
                feature(symbol: "faceid",
                        title: "Passkey Login",
                        body: "Secure access with your biometrics.")
                feature(symbol: "eye.slash",
                        title: "No Tracking",
                        body: "No analytics. Zero data collection.")
            }
            .padding(.horizontal, 32)

            Spacer()

            VStack(spacing: 12) {
                PrimaryButton(title: creating ? "Creating…" : "Get Started",
                              action: createWallet,
                              isEnabled: !creating)
                SecondaryButton(title: "Restore account") {
                    store.screen = .restore
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
    }

    private func createWallet() {
        creating = true
        Task {
            do {
                try await store.createPasskeyAccount(pxeBridge: pxeBridge)
            } catch {
                store.showToast("Wallet creation failed: \(error.localizedDescription)", type: .error)
            }
            creating = false
        }
    }

    private func feature(symbol: String, title: String, body: String) -> some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle()
                    .stroke(V3Colors.goldPrimary, lineWidth: 1)
                    .frame(width: 40, height: 40)
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .light))
                    .foregroundColor(V3Colors.goldPrimary)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                Text(body)
                    .font(V3Fonts.caption(13))
                    .foregroundColor(V3Colors.textSecondary)
            }

            Spacer()
        }
    }
}
