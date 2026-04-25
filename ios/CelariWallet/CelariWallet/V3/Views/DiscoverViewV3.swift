// V3/Views/DiscoverViewV3.swift

import SwiftUI

struct DiscoverViewV3: View {
    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Discover")
                    .font(V3Fonts.h1(28))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            Spacer()

            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                        .frame(width: 88, height: 88)
                    Image(systemName: "safari")
                        .font(.system(size: 36, weight: .light))
                        .foregroundColor(V3Colors.goldPrimary)
                }

                Text("dApps, curated.")
                    .font(V3Fonts.h2(24))
                    .foregroundColor(V3Colors.textPrimary)

                Text("Privacy-first dApps, bridges, and on-chain services. Coming soon.")
                    .font(V3Fonts.body(15))
                    .foregroundColor(V3Colors.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
    }
}
