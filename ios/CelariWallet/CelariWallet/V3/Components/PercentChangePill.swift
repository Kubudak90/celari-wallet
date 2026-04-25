// V3/Components/PercentChangePill.swift

import SwiftUI

/// Small pill showing a percent delta with directional arrow.
/// Green for non-negative, red for negative. Optional trailing label.
struct PercentChangePill: View {
    let percent: Double
    var trailingLabel: String? = nil
    var compact: Bool = false

    private var isUp: Bool { percent >= 0 }
    private var symbol: String { isUp ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill" }
    private var color: Color { isUp ? V3Colors.statusUp : V3Colors.statusDown }
    private var formatted: String {
        String(format: "%@%.2f%%", isUp ? "" : "", percent)
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.system(size: compact ? 8 : 10, weight: .bold))
            Text(formatted)
                .font(compact ? V3Fonts.caption(11) : V3Fonts.bodyMedium(13))
            if let label = trailingLabel {
                Text(label)
                    .font(compact ? V3Fonts.caption(11) : V3Fonts.body(13))
                    .foregroundColor(V3Colors.textSecondary)
            }
        }
        .foregroundColor(color)
    }
}

#Preview {
    VStack(spacing: 12) {
        PercentChangePill(percent: 2.35, trailingLabel: "Today")
        PercentChangePill(percent: -1.23)
        PercentChangePill(percent: 0.74, compact: true)
    }
    .padding()
    .background(V3Colors.bgBase)
}
