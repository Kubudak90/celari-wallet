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
            .padding(.bottom, 8)

            ScrollView {
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
                        Divider().background(V3Colors.border).padding(.horizontal, 16)
                    }
                }
            }
        }
        .background(V3Colors.bgBase)
    }

    private func parseUSD(_ s: String) -> Double {
        let cleaned = s.replacingOccurrences(of: "$", with: "")
                       .replacingOccurrences(of: ",", with: "")
        return Double(cleaned) ?? 0
    }
}
