// V3/Components/CelariLogoView.swift

import SwiftUI

/// Celari brand mark or full lockup, rendered from the Asset Catalog vector
/// imagesets (`LogoMark`, `LogoLockup`). Appearance-adaptive: the light
/// variant swaps to a dark-tinted mono mark automatically.
struct CelariLogoView: View {
    enum Variant {
        case mark
        case lockup
    }

    let variant: Variant
    var height: CGFloat = 32

    var body: some View {
        Image(variant == .mark ? "LogoMark" : "LogoLockup")
            .resizable()
            .renderingMode(.original)
            .aspectRatio(contentMode: .fit)
            .frame(height: height)
            .accessibilityLabel(variant == .mark ? "Celari" : "Celari, privacy-first wallet")
    }
}

#Preview("Mark — dark") {
    CelariLogoView(variant: .mark, height: 80)
        .padding()
        .background(V3Colors.bgBase)
        .preferredColorScheme(.dark)
}

#Preview("Lockup — light") {
    CelariLogoView(variant: .lockup, height: 120)
        .padding()
        .background(V3Colors.bgBase)
        .preferredColorScheme(.light)
}
