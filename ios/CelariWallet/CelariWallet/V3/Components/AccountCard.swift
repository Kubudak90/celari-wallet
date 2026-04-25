// V3/Components/AccountCard.swift

import SwiftUI

struct AccountCard: View {
    let name: String
    let balanceUSD: Double
    let assetCount: Int
    var isActive: Bool = false
    let action: () -> Void

    private var formattedBalance: String {
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: balanceUSD)) ?? "$0.00"
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image("LogoMark")
                    .resizable()
                    .renderingMode(.original)
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(V3Fonts.bodyMedium(15))
                        .foregroundColor(V3Colors.textPrimary)
                    Text("\(assetCount) Asset\(assetCount == 1 ? "" : "s")")
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textSecondary)
                }

                Spacer()

                Text(formattedBalance)
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(V3Colors.textMuted)
            }
            .padding(16)
            .background(V3Colors.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                    .stroke(isActive ? V3Colors.goldPrimary : V3Colors.border,
                            lineWidth: isActive ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    VStack(spacing: 12) {
        AccountCard(name: "Main Wallet", balanceUSD: 8732.21, assetCount: 6, isActive: true) {}
        AccountCard(name: "Savings", balanceUSD: 3726.52, assetCount: 3) {}
    }
    .padding()
    .background(V3Colors.bgBase)
}
