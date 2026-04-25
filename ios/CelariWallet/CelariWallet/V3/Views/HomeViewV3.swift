// V3/Views/HomeViewV3.swift

import SwiftUI

struct HomeViewV3: View {
    @Environment(WalletStore.self) private var store

    /// Path binding owned by RootViewV3; HomeViewV3 mutates it to push routes.
    @Binding var path: [HomeRoute]

    @State private var balanceHidden = false

    private var totalUSD: Double {
        parseUSD(store.totalValue)
    }

    private var topAssets: [Token] {
        Array(store.tokens.prefix(3))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header
                BalanceHeader(
                    totalUSD: totalUSD,
                    percentChange: 0,
                    hidden: balanceHidden,
                    onTogglePrivacy: { balanceHidden.toggle() }
                )
                quickActionsRow
                accountsSection
                assetsSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
    }

    private var header: some View {
        HStack {
            Color.clear.frame(width: 32, height: 32)   // left spacer for centering
            Spacer()
            CelariLogoView(variant: .lockup, height: 22)
            Spacer()
            Button {
                // Reserved for QR scan / WalletConnect (Phase B+)
            } label: {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundColor(V3Colors.textPrimary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
    }

    private var quickActionsRow: some View {
        HStack(spacing: 0) {
            QuickActionButton(title: "Send",    systemSymbol: "arrow.up")    { path.append(.send) }
            Spacer()
            QuickActionButton(title: "Receive", systemSymbol: "arrow.down")  { path.append(.receive) }
            Spacer()
            QuickActionButton(title: "Swap",    systemSymbol: "arrow.left.arrow.right") { path.append(.swap) }
            Spacer()
            QuickActionButton(title: "Buy",     systemSymbol: "plus")        { path.append(.buy) }
        }
    }

    private var accountsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Accounts")
                    .font(V3Fonts.h3(17))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
                Button {
                    store.screen = .addAccount
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(V3Colors.goldPrimary)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(V3Colors.goldPrimary, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            VStack(spacing: 12) {
                ForEach(Array(store.accounts.enumerated()), id: \.element.id) { index, account in
                    AccountCard(
                        name: account.label,
                        balanceUSD: index == store.activeAccountIndex ? totalUSD : 0,
                        assetCount: index == store.activeAccountIndex ? store.tokens.count : 0,
                        isActive: index == store.activeAccountIndex
                    ) {
                        store.activeAccountIndex = index
                    }
                }
            }
        }
    }

    private var assetsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Assets")
                .font(V3Fonts.h3(17))
                .foregroundColor(V3Colors.textPrimary)

            VStack(spacing: 0) {
                ForEach(topAssets, id: \.id) { token in
                    AssetRow(
                        name: token.name,
                        symbol: token.symbol,
                        amount: token.balance,
                        amountUnit: token.symbol,
                        valueUSD: parseUSD(token.value),
                        percentChange: nil,
                        iconHex: token.color
                    )
                    if token.id != topAssets.last?.id {
                        Divider().background(V3Colors.border)
                    }
                }
            }
            .padding(.horizontal, 12)
            .background(V3Colors.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                    .stroke(V3Colors.border, lineWidth: 1)
            )
        }
    }

    /// Parse a `$12,458.73`-style string into a Double. Returns 0 on failure.
    private func parseUSD(_ s: String) -> Double {
        let cleaned = s.replacingOccurrences(of: "$", with: "")
                       .replacingOccurrences(of: ",", with: "")
        return Double(cleaned) ?? 0
    }
}
