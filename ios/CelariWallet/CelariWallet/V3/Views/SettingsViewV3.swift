// V3/Views/SettingsViewV3.swift

import SwiftUI

struct SettingsViewV3: View {
    @Environment(WalletStore.self) private var store
    @AppStorage("themePreference") private var themePreferenceRaw: String = "system"

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                profileHeader
                appearanceSection
                securitySection
                networkSection
                aboutSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .background(V3Colors.bgBase)
    }

    private var profileHeader: some View {
        HStack(spacing: 12) {
            Image("LogoMark")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(celariID)
                    .font(V3Fonts.bodyMedium(16))
                    .foregroundColor(V3Colors.textPrimary)
                Text(store.activeAccount?.address ?? "")
                    .font(V3Fonts.caption(11))
                    .foregroundColor(V3Colors.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
        }
        .padding(.vertical, 8)
    }

    private var celariID: String {
        guard let addr = store.activeAccount?.address else { return "@user.celari" }
        let prefix = String(addr.dropFirst(2).prefix(6)).lowercased()
        return "@\(prefix).celari"
    }

    private var appearanceSection: some View {
        sectionCard(title: "APPEARANCE") {
            Picker("Appearance", selection: $themePreferenceRaw) {
                Text("System").tag("system")
                Text("Dark").tag("dark")
                Text("Light").tag("light")
            }
            .pickerStyle(.segmented)
        }
    }

    private var securitySection: some View {
        sectionCard(title: "SECURITY") {
            VStack(spacing: 0) {
                row("Face ID", trailing: { Toggle("", isOn: .constant(true)).labelsHidden() })
                row("Change passcode")
                row("Guardian setup", action: { store.screen = .guardianSetup })
            }
        }
    }

    private var networkSection: some View {
        sectionCard(title: "NETWORK") {
            VStack(spacing: 0) {
                row("Network", trailing: {
                    Text(store.network).font(V3Fonts.body(14)).foregroundColor(V3Colors.textSecondary)
                })
                row("Manage networks")
            }
        }
    }

    private var aboutSection: some View {
        sectionCard(title: "ABOUT") {
            VStack(spacing: 0) {
                row("Version", trailing: {
                    Text("0.5.0").font(V3Fonts.body(14)).foregroundColor(V3Colors.textSecondary)
                })
                row("Terms")
                row("Privacy")
            }
        }
    }

    @ViewBuilder
    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(V3Fonts.caption(11))
                .tracking(1.2)
                .foregroundColor(V3Colors.textSecondary)
                .padding(.horizontal, 4)

            content()
                .padding(16)
                .background(V3Colors.bgElevated)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                        .stroke(V3Colors.border, lineWidth: 1)
                )
        }
    }

    @ViewBuilder
    private func row<Trailing: View>(
        _ title: String,
        action: (() -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) -> some View {
        let content = HStack {
            Text(title)
                .font(V3Fonts.body(15))
                .foregroundColor(V3Colors.textPrimary)
            Spacer()
            trailing()
            if action != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(V3Colors.textMuted)
                    .padding(.leading, 6)
            }
        }
        .padding(.vertical, 12)

        if let action {
            Button(action: action) { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}
