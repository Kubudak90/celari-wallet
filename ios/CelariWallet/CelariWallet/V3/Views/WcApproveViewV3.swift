// V3/Views/WcApproveViewV3.swift
//
// Replaces V1 WcApproveView. WalletConnect proposal approval, V3 chrome.

import SwiftUI

struct WcApproveViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    @State private var approving = false

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Session Proposal") {
                store.screen = .dashboard
            }

            if let proposal = store.wcProposal {
                proposalBody(proposal)
            } else {
                VStack {
                    Spacer()
                    Text("No pending proposals")
                        .font(V3Fonts.body(15))
                        .foregroundColor(V3Colors.textMuted)
                    Spacer()
                }
            }
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private func proposalBody(_ proposal: WCProposal) -> some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 12)

            ZStack {
                Circle()
                    .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                    .frame(width: 80, height: 80)
                Image(systemName: "link")
                    .font(.system(size: 28, weight: .light))
                    .foregroundColor(V3Colors.goldPrimary)
            }

            VStack(spacing: 4) {
                Text(proposal.peerName)
                    .font(V3Fonts.h2(20))
                    .foregroundColor(V3Colors.textPrimary)

                Text(proposal.peerUrl)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
            }

            Text("This dApp wants to connect to your wallet")
                .font(V3Fonts.body(14))
                .foregroundColor(V3Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            VStack(alignment: .leading, spacing: 8) {
                Text("REQUESTED PERMISSIONS")
                    .font(V3Fonts.caption(11))
                    .tracking(1.5)
                    .foregroundColor(V3Colors.textSecondary)

                VStack(spacing: 8) {
                    permissionRow("View account address")
                    permissionRow("Request transaction signatures")
                    permissionRow("View balances")
                }
                .v3Card()
            }
            .padding(.horizontal, 16)

            Spacer()

            HStack(spacing: 12) {
                SecondaryButton(title: "Reject") {
                    reject(proposal)
                }

                PrimaryButton(
                    title: approving ? "Approving…" : "Approve",
                    action: { approve(proposal) },
                    isEnabled: !approving
                )
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    private func permissionRow(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 14))
                .foregroundColor(V3Colors.statusUp)
            Text(text)
                .font(V3Fonts.body(13))
                .foregroundColor(V3Colors.textPrimary)
            Spacer()
        }
    }

    private func approve(_ proposal: WCProposal) {
        approving = true
        Task {
            do {
                let namespaces: [String: Any] = [
                    "aztec": [
                        "accounts": [store.activeAccount?.address ?? ""],
                        "methods": ["aztec_sendTransaction", "aztec_getBalances"],
                        "events": ["accountsChanged"]
                    ]
                ]
                _ = try await pxeBridge.wcApprove(id: proposal.id, namespaces: namespaces)
                store.wcProposal = nil
                store.showToast("Session approved", type: .success)
                store.screen = .walletConnect
            } catch {
                store.showToast("Approval failed: \(error.localizedDescription)", type: .error)
            }
            approving = false
        }
    }

    private func reject(_ proposal: WCProposal) {
        Task {
            _ = try? await pxeBridge.wcReject(id: proposal.id)
            store.wcProposal = nil
            store.screen = .dashboard
        }
    }
}
