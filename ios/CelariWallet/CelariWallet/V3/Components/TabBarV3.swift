// V3/Components/TabBarV3.swift

import SwiftUI

enum V3Tab: String, CaseIterable, Identifiable {
    case home, assets, activity, discover, settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home:     return "Home"
        case .assets:   return "Assets"
        case .activity: return "Activity"
        case .discover: return "Discover"
        case .settings: return "Settings"
        }
    }

    var symbol: String {
        switch self {
        case .home:     return "house"
        case .assets:   return "square.stack.3d.up"
        case .activity: return "clock.arrow.circlepath"
        case .discover: return "safari"
        case .settings: return "gearshape"
        }
    }
}

struct TabBarV3: View {
    @Binding var activeTab: V3Tab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(V3Tab.allCases) { tab in
                tabButton(tab)
            }
        }
        .frame(height: 64)
        .background(
            V3Colors.bgElevated
                .overlay(
                    Rectangle()
                        .fill(V3Colors.border)
                        .frame(height: 0.5),
                    alignment: .top
                )
        )
    }

    private func tabButton(_ tab: V3Tab) -> some View {
        Button {
            withAnimation(V3Motion.fast) { activeTab = tab }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.symbol)
                    .font(.system(size: 20, weight: .regular))
                Text(tab.title)
                    .font(V3Fonts.caption(10))
            }
            .foregroundColor(activeTab == tab ? V3Colors.goldPrimary : V3Colors.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(
                Rectangle()
                    .fill(V3Colors.goldPrimary)
                    .frame(height: 2)
                    .opacity(activeTab == tab ? 1 : 0)
                    .padding(.horizontal, 24),
                alignment: .top
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    StatefulPreviewWrapper(V3Tab.home) { tab in
        VStack(spacing: 0) {
            Spacer()
            TabBarV3(activeTab: tab)
        }
        .background(V3Colors.bgBase)
    }
}

// Helper for live-editable previews
private struct StatefulPreviewWrapper<T, V: View>: View {
    @State private var state: T
    let content: (Binding<T>) -> V

    init(_ initial: T, @ViewBuilder content: @escaping (Binding<T>) -> V) {
        _state = State(initialValue: initial)
        self.content = content
    }
    var body: some View { content($state) }
}
