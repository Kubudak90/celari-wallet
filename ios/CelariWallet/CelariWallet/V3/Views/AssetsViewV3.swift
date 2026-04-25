// V3/Views/AssetsViewV3.swift

import SwiftUI

struct AssetsViewV3: View {
    @Environment(WalletStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Assets")
                    .font(V3Fonts.h1(28))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
                Button {
                    store.screen = .addToken
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(V3Colors.goldPrimary)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(V3Colors.goldPrimary, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 16)

            ScrollView {
                if store.tokens.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 0) {
                        ForEach(store.tokens, id: \.id) { token in
                            AssetRow(
                                name: token.name,
                                symbol: token.symbol,
                                amount: token.balance,
                                amountUnit: token.symbol,
                                valueUSD: parseUSD(token.value),
                                percentChange: nil,
                                iconHex: token.color
                            )
                            if token.id != store.tokens.last?.id {
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
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
        }
        .background(V3Colors.bgBase)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer().frame(height: 80)
            Image(systemName: "square.stack.3d.up")
                .font(.system(size: 36, weight: .light))
                .foregroundColor(V3Colors.textMuted)
            Text("No assets yet")
                .font(V3Fonts.bodyMedium(15))
                .foregroundColor(V3Colors.textPrimary)
            Text("Tokens you receive will appear here.")
                .font(V3Fonts.caption(13))
                .foregroundColor(V3Colors.textSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func parseUSD(_ s: String) -> Double {
        let cleaned = s.replacingOccurrences(of: "$", with: "")
                       .replacingOccurrences(of: ",", with: "")
        return Double(cleaned) ?? 0
    }
}
