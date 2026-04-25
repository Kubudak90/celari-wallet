// V3/Components/PrimaryButton.swift

import SwiftUI

/// Gold-gradient CTA used for the primary action on a screen.
/// Height 52, full-width by default. Use inside a container that provides
/// horizontal padding (24 or 16 depending on the screen).
struct PrimaryButton: View {
    let title: String
    let action: () -> Void

    var isEnabled: Bool = true

    @State private var isPressed = false

    var body: some View {
        Button(action: {
            guard isEnabled else { return }
            action()
        }) {
            Text(title)
                .font(V3Fonts.bodyMedium(16))
                .foregroundColor(V3Colors.bgBase)   // dark text on gold
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(
                    RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous)
                        .fill(V3Colors.goldGradient)
                )
                .scaleEffect(isPressed ? 0.97 : 1.0)
                .opacity(isEnabled ? 1.0 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .pressEvents(
            onPress:  { withAnimation(V3Motion.press) { isPressed = true } },
            onRelease:{ withAnimation(V3Motion.press) { isPressed = false } }
        )
    }
}

// Helper for press gesture since SwiftUI Button doesn't expose press state.
private struct PressGestureViewModifier: ViewModifier {
    var onPress: () -> Void
    var onRelease: () -> Void

    func body(content: Content) -> some View {
        content.simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in onPress() }
                .onEnded   { _ in onRelease() }
        )
    }
}

extension View {
    fileprivate func pressEvents(onPress: @escaping () -> Void, onRelease: @escaping () -> Void) -> some View {
        modifier(PressGestureViewModifier(onPress: onPress, onRelease: onRelease))
    }
}

#Preview {
    VStack(spacing: 16) {
        PrimaryButton(title: "Get Started") {}
        PrimaryButton(title: "Disabled", action: {}, isEnabled: false)
    }
    .padding()
    .background(V3Colors.bgBase)
}
