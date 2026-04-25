// V3/Components/AmountInput.swift

import SwiftUI

struct AmountInput: View {
    @Binding var amount: String
    let tokenSymbol: String
    let usdSubtotal: Double?
    var onTokenPickerTap: () -> Void = {}

    private var formattedUSD: String? {
        guard let v = usdSubtotal else { return nil }
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: v))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("You send")
                .font(V3Fonts.caption(13))
                .foregroundColor(V3Colors.textSecondary)

            HStack(alignment: .firstTextBaseline) {
                TextField("0.00", text: $amount)
                    .keyboardType(.decimalPad)
                    .font(V3Fonts.balance(40))
                    .foregroundColor(V3Colors.textPrimary)
                    .textFieldStyle(.plain)

                Spacer()

                Button(action: onTokenPickerTap) {
                    HStack(spacing: 6) {
                        Image("LogoMark")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 18, height: 18)
                        Text(tokenSymbol)
                            .font(V3Fonts.bodyMedium(15))
                            .foregroundColor(V3Colors.textPrimary)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(V3Colors.textSecondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: V3Radius.pill, style: .continuous)
                            .fill(V3Colors.bgRaised)
                    )
                }
                .buttonStyle(.plain)
            }

            if let usd = formattedUSD {
                Text(usd)
                    .font(V3Fonts.caption(13))
                    .foregroundColor(V3Colors.textSecondary)
            }
        }
        .padding(20)
        .background(V3Colors.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                .stroke(V3Colors.border, lineWidth: 1)
        )
    }
}

#Preview {
    AmountInputPreview()
}

private struct AmountInputPreview: View {
    @State private var amount = "1.25"
    var body: some View {
        AmountInput(amount: $amount, tokenSymbol: "ETH", usdSubtotal: 3583.42)
            .padding()
            .background(V3Colors.bgBase)
    }
}
