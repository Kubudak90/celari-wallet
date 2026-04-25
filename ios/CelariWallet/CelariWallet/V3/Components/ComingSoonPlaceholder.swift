// V3/Components/ComingSoonPlaceholder.swift

import SwiftUI

/// Full-screen "Coming soon" placeholder used for unbuilt tabs
/// (Swap / Discover / Buy) and screens deferred to later rebrand phases.
struct ComingSoonPlaceholder: View {
    let title: String
    let subtitle: String
    var systemSymbol: String? = nil

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Circle()
                .stroke(V3Colors.goldPrimary, lineWidth: 2)
                .frame(width: 80, height: 80)
                .overlay {
                    if let sym = systemSymbol {
                        Image(systemName: sym)
                            .font(.system(size: 32, weight: .light))
                            .foregroundColor(V3Colors.goldPrimary)
                    }
                }

            Text(title)
                .font(V3Fonts.h2(24))
                .foregroundColor(V3Colors.textPrimary)

            Text(subtitle)
                .font(V3Fonts.body(16))
                .foregroundColor(V3Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
    }
}

#Preview {
    ComingSoonPlaceholder(
        title: "Swap is coming soon",
        subtitle: "Trade assets privately, without giving up control.",
        systemSymbol: "arrow.left.arrow.right"
    )
}
