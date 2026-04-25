// V3/Views/LoadingViewV3.swift

import SwiftUI

struct LoadingViewV3: View {
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            CelariLogoView(variant: .lockup, height: 80)
                .opacity(pulse ? 1.0 : 0.6)
                .scaleEffect(pulse ? 1.0 : 0.96)
                .animation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true), value: pulse)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
        .onAppear { pulse = true }
    }
}

#Preview { LoadingViewV3() }
