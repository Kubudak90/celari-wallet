// V3/Components/BalanceHeader.swift

import SwiftUI

struct BalanceHeader: View {
    let totalUSD: Double
    let percentChange: Double
    var hidden: Bool = false
    var onTogglePrivacy: () -> Void = {}

    private var formattedTotal: String {
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: totalUSD)) ?? "$0.00"
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                Text("Total Balance")
                    .font(V3Fonts.caption(13))
                    .foregroundColor(V3Colors.textSecondary)

                Button(action: onTogglePrivacy) {
                    Image(systemName: hidden ? "eye" : "eye.slash")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(V3Colors.textSecondary)
                }
                .buttonStyle(.plain)
            }

            Text(hidden ? "••••••" : formattedTotal)
                .font(V3Fonts.balance(36))
                .foregroundColor(V3Colors.textPrimary)
                .contentTransition(.numericText())
                .animation(V3Motion.base, value: totalUSD)

            PercentChangePill(percent: percentChange, trailingLabel: "Today")
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    VStack(spacing: 24) {
        BalanceHeader(totalUSD: 12458.73, percentChange: 2.35)
        BalanceHeader(totalUSD: 4921.18, percentChange: -1.23, hidden: true)
    }
    .padding()
    .background(V3Colors.bgBase)
}
