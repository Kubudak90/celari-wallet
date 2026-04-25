// V3/Components/SecondaryButton.swift

import SwiftUI

/// Outlined gold button used for secondary / tertiary actions. Same height
/// and corner radius as PrimaryButton.
struct SecondaryButton: View {
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
                .foregroundColor(V3Colors.goldPrimary)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(
                    RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous)
                        .fill(Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous)
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                )
                .scaleEffect(isPressed ? 0.97 : 1.0)
                .opacity(isEnabled ? 1.0 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in withAnimation(V3Motion.press) { isPressed = true } }
                .onEnded   { _ in withAnimation(V3Motion.press) { isPressed = false } }
        )
    }
}

#Preview {
    VStack(spacing: 16) {
        SecondaryButton(title: "Restore account") {}
    }
    .padding()
    .background(V3Colors.bgBase)
}
