// V3/Components/AssetRow.swift

import SwiftUI

struct AssetRow: View {
    let name: String
    let symbol: String
    let amount: String           // e.g. "2.738"
    let amountUnit: String       // e.g. "ETH"
    let valueUSD: Double
    let percentChange: Double?
    let iconHex: String?         // "FF7700" or nil to show LogoMark fallback

    private var formattedValue: String {
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: valueUSD)) ?? "$0.00"
    }

    var body: some View {
        HStack(spacing: 12) {
            iconView
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                Text(symbol)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(amount) \(amountUnit)")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                HStack(spacing: 6) {
                    Text(formattedValue)
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textSecondary)
                    if let pct = percentChange {
                        PercentChangePill(percent: pct, compact: true)
                    }
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private var iconView: some View {
        if let hex = iconHex, !hex.isEmpty {
            Circle()
                .fill(Color(hex2: hex))
                .overlay(
                    Text(symbol.prefix(1).uppercased())
                        .font(V3Fonts.bodyMedium(15))
                        .foregroundColor(.white)
                )
        } else {
            Image("LogoMark").resizable().aspectRatio(contentMode: .fit)
        }
    }
}

#Preview {
    VStack(spacing: 0) {
        AssetRow(name: "Ethereum", symbol: "ETH", amount: "2.738", amountUnit: "ETH",
                 valueUSD: 7862.61, percentChange: 1.89, iconHex: "627EEA")
        AssetRow(name: "Bitcoin",  symbol: "BTC", amount: "0.215", amountUnit: "BTC",
                 valueUSD: 4407.68, percentChange: 0.74, iconHex: "F7931A")
        AssetRow(name: "Solana",   symbol: "SOL", amount: "12.36", amountUnit: "SOL",
                 valueUSD: 1187.21, percentChange: -1.23, iconHex: "9945FF")
    }
    .padding(.horizontal, 12)
    .background(V3Colors.bgBase)
}
