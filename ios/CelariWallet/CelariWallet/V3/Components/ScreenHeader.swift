// V3/Components/ScreenHeader.swift

import SwiftUI

/// Reusable navigation header used by pushed V3 screens.
/// Layout: leading back arrow, centered title, optional trailing icon.
struct ScreenHeader<Trailing: View>: View {
    let title: String
    var trailing: () -> Trailing

    @Environment(\.dismiss) private var dismiss

    init(title: String, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing
    }

    var body: some View {
        ZStack {
            Text(title)
                .font(V3Fonts.h3(17))
                .foregroundColor(V3Colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .center)

            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(V3Colors.textPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Spacer()

                trailing()
                    .frame(width: 44, height: 44)
            }
        }
        .frame(height: 44)
        .padding(.horizontal, 8)
    }
}

#Preview {
    VStack(spacing: 0) {
        ScreenHeader(title: "Send")
        Spacer()
    }
    .background(V3Colors.bgBase)
}
