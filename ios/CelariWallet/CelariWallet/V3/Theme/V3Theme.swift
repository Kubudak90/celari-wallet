// V3/Theme/V3Theme.swift
//
// Thin aliasing layer that routes V3 views through the generated
// token pipeline (Resources/Generated/Tokens.swift). Do not hard-code
// hex values here — edit design-tokens/tokens.json and run
// `npm run tokens` to regenerate.

import SwiftUI

// MARK: - Colors

enum V3Colors {
    // Surfaces
    static let bgBase     = Color.celariBgBase
    static let bgElevated = Color.celariBgElevated
    static let bgRaised   = Color.celariBgRaised

    // Borders
    static let border     = Color.celariBorderSubtle

    // Gold
    static let goldPrimary = Color.celariGoldPrimary
    static let goldSoft    = Color.celariGoldSoft
    static let goldGlow    = Color.celariGoldGlow
    static let goldDeep    = Color.celariGoldDeep

    // Text
    static let textPrimary   = Color.celariTextPrimary
    static let textSecondary = Color.celariTextSecondary
    static let textMuted     = Color.celariTextMuted

    // Status
    static let statusUp   = Color.celariStatusUp
    static let statusDown = Color.celariStatusDown

    // Gradients
    static let goldGradient = LinearGradient(
        colors: [Color.celariGoldGlow, Color.celariGoldSoft],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - Typography

enum V3Fonts {
    // Wordmark / display — Outfit Light with generous tracking at render time
    static func wordmark(_ size: CGFloat) -> Font {
        .custom("Outfit-Light", size: size, relativeTo: .largeTitle)
    }
    static func displayThin(_ size: CGFloat) -> Font {
        .custom("Outfit-Thin", size: size, relativeTo: .largeTitle)
    }

    // Headings — Inter SemiBold (headline-weight sans for app UI)
    static func h1(_ size: CGFloat = 34) -> Font {
        .custom("Inter-SemiBold", size: size, relativeTo: .largeTitle)
    }
    static func h2(_ size: CGFloat = 24) -> Font {
        .custom("Inter-SemiBold", size: size, relativeTo: .title)
    }
    static func h3(_ size: CGFloat = 18) -> Font {
        .custom("Inter-SemiBold", size: size, relativeTo: .title2)
    }

    // Body — Inter
    static func body(_ size: CGFloat = 16) -> Font {
        .custom("Inter-Regular", size: size, relativeTo: .body)
    }
    static func bodyMedium(_ size: CGFloat = 16) -> Font {
        .custom("Inter-Medium", size: size, relativeTo: .body)
    }
    static func caption(_ size: CGFloat = 13) -> Font {
        .custom("Inter-Regular", size: size, relativeTo: .caption)
    }

    // Numeric — SF Pro Rounded Bold, best for balance and large $ amounts
    static func balance(_ size: CGFloat = 36) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }

    // Monospaced labels — SF Mono
    static func mono(_ size: CGFloat = 13) -> Font {
        .system(size: size, weight: .medium, design: .monospaced)
    }
}

// MARK: - Radius

enum V3Radius {
    static let card:   CGFloat = 16
    static let button: CGFloat = 12
    static let chip:   CGFloat = 8
    static let pill:   CGFloat = 999
}

// MARK: - Motion

enum V3Motion {
    static let fast:     Animation = .easeOut(duration: 0.15)
    static let base:     Animation = .easeOut(duration: 0.20)
    static let slow:     Animation = .easeOut(duration: 0.30)
    static let press:    Animation = .easeOut(duration: 0.10)
}

// MARK: - View modifiers

struct CelariCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(V3Colors.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                    .stroke(V3Colors.border, lineWidth: 1)
            )
    }
}

extension View {
    /// V3 card chrome (rounded panel + hairline border on V3Colors.bgElevated).
    /// Named `v3Card` to avoid colliding with the V1 `celariCard()` extension.
    func v3Card() -> some View { modifier(CelariCardModifier()) }

    /// Subtle gold glow for featured CTAs and the logo.
    func v3GoldGlow(radius: CGFloat = 24, opacity: Double = 0.18) -> some View {
        self.shadow(color: V3Colors.goldPrimary.opacity(opacity), radius: radius, x: 0, y: 0)
    }
}
