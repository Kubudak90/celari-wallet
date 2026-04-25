// V3/Views/ActivityViewV3.swift

import SwiftUI

struct ActivityViewV3: View {
    @Environment(WalletStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Activity")
                    .font(V3Fonts.h1(28))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            if store.activities.isEmpty {
                empty
            } else {
                list
            }
        }
        .background(V3Colors.bgBase)
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(store.activities, id: \.id) { activity in
                    TransactionRow(
                        direction: activity.type == .send ? .sent : .received,
                        amount: activity.amount,
                        counterparty: activity.label,
                        timeLabel: activity.time
                    )
                    Divider().background(V3Colors.border).padding(.horizontal, 16)
                }
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 36, weight: .light))
                .foregroundColor(V3Colors.textMuted)
            Text("No activity yet")
                .font(V3Fonts.bodyMedium(15))
                .foregroundColor(V3Colors.textPrimary)
            Text("Your transactions will appear here.")
                .font(V3Fonts.caption(13))
                .foregroundColor(V3Colors.textSecondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
