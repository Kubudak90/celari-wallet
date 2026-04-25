// V3/Views/NftDetailViewV3.swift
//
// Replaces V1 NftDetailView. NFT transfer with mode selector + biometric
// gate, V3 chrome.

import SwiftUI

struct NftDetailViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    @State private var recipientAddress: String = ""
    @State private var transferMode: String = "private"
    @State private var transferring = false

    private var nft: NFTItem? {
        guard let detail = store.nftDetail else { return nil }
        return store.nfts.first { $0.contractAddress == detail.contractAddress && $0.tokenId == detail.tokenId }
    }

    private var isValidAddress: Bool {
        recipientAddress.hasPrefix("0x") && recipientAddress.count >= 42
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "NFT Detail") {
                store.screen = .dashboard
            }

            if let nft {
                content(nft)
            } else {
                VStack {
                    Spacer()
                    Text("NFT not found")
                        .font(V3Fonts.body(15))
                        .foregroundColor(V3Colors.textMuted)
                    Spacer()
                }
            }
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private func content(_ nft: NFTItem) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                        .frame(width: 80, height: 80)
                    Text("N")
                        .font(V3Fonts.h1(34))
                        .foregroundColor(V3Colors.goldPrimary)
                }
                .padding(.top, 16)

                VStack(spacing: 4) {
                    Text(nft.contractName)
                        .font(V3Fonts.h3(17))
                        .foregroundColor(V3Colors.textPrimary)
                    Text("Token #\(nft.tokenId)")
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textSecondary)

                    Text(nft.isPrivate ? "PRIVATE" : "PUBLIC")
                        .font(V3Fonts.caption(11))
                        .tracking(1.2)
                        .foregroundColor(nft.isPrivate ? V3Colors.statusUp : V3Colors.goldPrimary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .overlay(
                            RoundedRectangle(cornerRadius: V3Radius.chip)
                                .stroke((nft.isPrivate ? V3Colors.statusUp : V3Colors.goldPrimary).opacity(0.4),
                                        lineWidth: 1)
                        )
                }

                Divider().background(V3Colors.border)

                transferCard

                PrimaryButton(
                    title: transferring ? "Transferring…" : "Transfer NFT",
                    action: { transferNft(nft) },
                    isEnabled: isValidAddress && !transferring
                )
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
    }

    private var transferCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("TRANSFER NFT")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.textSecondary)

            HStack(spacing: 8) {
                ForEach(["private", "public", "shield", "unshield"], id: \.self) { mode in
                    Button { transferMode = mode } label: {
                        Text(mode.uppercased())
                            .font(V3Fonts.caption(10))
                            .tracking(1.0)
                            .foregroundColor(transferMode == mode ? V3Colors.bgBase : V3Colors.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(
                                RoundedRectangle(cornerRadius: V3Radius.pill)
                                    .fill(transferMode == mode
                                          ? AnyShapeStyle(V3Colors.goldGradient)
                                          : AnyShapeStyle(V3Colors.bgRaised))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("RECIPIENT")
                    .font(V3Fonts.caption(11))
                    .tracking(1.0)
                    .foregroundColor(V3Colors.textSecondary)
                TextField("0x…", text: $recipientAddress)
                    .font(V3Fonts.mono(13))
                    .foregroundColor(V3Colors.textPrimary)
                    .autocapitalization(.none)
                    .padding(14)
                    .background(V3Colors.bgRaised)
                    .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
            }
        }
    }

    private func transferNft(_ nft: NFTItem) {
        guard isValidAddress else {
            store.showToast("Invalid address — must start with 0x", type: .error)
            return
        }
        transferring = true
        Task {
            do {
                try await store.passkeyManager.authenticateWithBiometrics(reason: "Authenticate to transfer NFT")
                _ = try await pxeBridge.transferNft(
                    contractAddress: nft.contractAddress,
                    tokenId: nft.tokenId,
                    to: recipientAddress,
                    mode: transferMode
                )
                store.showToast("NFT transferred", type: .success)
                store.screen = .dashboard
            } catch {
                store.showToast("Transfer failed: \(error.localizedDescription)", type: .error)
            }
            transferring = false
        }
    }
}
