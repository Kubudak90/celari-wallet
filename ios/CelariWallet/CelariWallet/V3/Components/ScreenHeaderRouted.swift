// V3/Components/ScreenHeaderRouted.swift
//
// Like ScreenHeader, but for views routed via store.screen state instead
// of NavigationStack. Caller supplies an explicit back closure (typically
// `{ store.screen = .dashboard }`).

import SwiftUI

struct ScreenHeaderRouted: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        ZStack {
            Text(title)
                .font(V3Fonts.h3(17))
                .foregroundColor(V3Colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .center)

            HStack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(V3Colors.textPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                Spacer()
                Color.clear.frame(width: 44, height: 44)
            }
        }
        .frame(height: 44)
        .padding(.horizontal, 8)
    }
}
