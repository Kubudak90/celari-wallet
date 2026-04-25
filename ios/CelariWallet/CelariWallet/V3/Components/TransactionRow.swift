// V3/Components/TransactionRow.swift

import SwiftUI

struct TransactionRow: View {
    enum Direction {
        case sent
        case received
    }

    let direction: Direction
    let amount: String           // "0.5 ETH"
    let counterparty: String     // truncated address or contact name
    let timestamp: Date
    let valueUSD: Double?

    private var symbol: String {
        direction == .sent ? "arrow.up.right" : "arrow.down.left"
    }
    private var amountColor: Color {
        direction == .sent ? V3Colors.textPrimary : V3Colors.statusUp
    }
    private var amountPrefix: String {
        direction == .sent ? "−" : "+"
    }
    private static let timeFmt: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()
    private var formattedValueUSD: String? {
        guard let v = valueUSD else { return nil }
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: v))
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(V3Colors.border, lineWidth: 1)
                    .frame(width: 36, height: 36)
                Image(systemName: symbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(direction == .sent ? V3Colors.textSecondary : V3Colors.statusUp)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(direction == .sent ? "Sent" : "Received")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                Text(counterparty)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(amountPrefix)\(amount)")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(amountColor)
                if let v = formattedValueUSD {
                    Text(v)
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textSecondary)
                } else {
                    Text(Self.timeFmt.localizedString(for: timestamp, relativeTo: Date()))
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textMuted)
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 4)
    }
}

#Preview {
    VStack(spacing: 0) {
        TransactionRow(
            direction: .sent, amount: "0.5 ETH",
            counterparty: "0x7a3f…8f2b",
            timestamp: Date().addingTimeInterval(-3600),
            valueUSD: 1432.18
        )
        TransactionRow(
            direction: .received, amount: "0.215 BTC",
            counterparty: "alex.celari",
            timestamp: Date().addingTimeInterval(-86400),
            valueUSD: nil
        )
    }
    .padding(.horizontal, 12)
    .background(V3Colors.bgBase)
}
