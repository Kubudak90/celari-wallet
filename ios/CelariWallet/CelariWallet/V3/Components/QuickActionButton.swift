// V3/Components/QuickActionButton.swift

import SwiftUI

struct QuickActionButton: View {
    let title: String
    let systemSymbol: String
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                        .frame(width: 56, height: 56)
                        .background(
                            Circle().fill(V3Colors.bgElevated)
                        )

                    Image(systemName: systemSymbol)
                        .font(.system(size: 22, weight: .regular))
                        .foregroundColor(V3Colors.goldPrimary)
                }
                .scaleEffect(isPressed ? 0.94 : 1.0)

                Text(title)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textPrimary)
            }
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in withAnimation(V3Motion.press) { isPressed = true } }
                .onEnded   { _ in withAnimation(V3Motion.press) { isPressed = false } }
        )
    }
}

#Preview {
    HStack(spacing: 24) {
        QuickActionButton(title: "Send",    systemSymbol: "arrow.up")    {}
        QuickActionButton(title: "Receive", systemSymbol: "arrow.down")  {}
        QuickActionButton(title: "Swap",    systemSymbol: "arrow.left.arrow.right") {}
        QuickActionButton(title: "Buy",     systemSymbol: "plus")        {}
    }
    .padding()
    .background(V3Colors.bgBase)
}
