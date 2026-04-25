// V3/RootViewV3.swift

import SwiftUI

/// V3 root view. Uses the reference-aligned 5-tab bottom bar. Tab contents
/// are placeholders until Phase B lands real Home / Assets / Activity /
/// Discover / Settings screens. Non-dashboard app states (loading,
/// onboarding, backup, restore, recovery) delegate to existing V2 views
/// for now — Phase B will rebuild those too.
struct RootViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge
    @State private var activeTab: V3Tab = .home

    var body: some View {
        ZStack {
            V3Colors.bgBase.ignoresSafeArea()

            Group {
                switch store.screen {
                case .loading:
                    LoadingView()
                case .onboarding:
                    OnboardingViewV2()
                case .restore:
                    RestoreViewV2()
                case .recoverAccount:
                    RecoverAccountViewV2()
                case .guardianSetup:
                    GuardianSetupViewV2()
                case .backup:
                    BackupViewV2()
                case .addAccount:
                    AddAccountViewV2()
                default:
                    dashboardShell
                }
            }
            .animation(.easeInOut(duration: 0.2), value: store.screen)
        }
    }

    private var dashboardShell: some View {
        VStack(spacing: 0) {
            Group {
                switch activeTab {
                case .home:
                    ComingSoonPlaceholder(
                        title: "Home",
                        subtitle: "Your balance, quick actions, and assets will land here in Phase B.",
                        systemSymbol: "house"
                    )
                case .assets:
                    ComingSoonPlaceholder(
                        title: "Assets",
                        subtitle: "Full token list and portfolio breakdown, coming soon.",
                        systemSymbol: "square.stack.3d.up"
                    )
                case .activity:
                    ComingSoonPlaceholder(
                        title: "Activity",
                        subtitle: "Transaction history across all your accounts.",
                        systemSymbol: "clock.arrow.circlepath"
                    )
                case .discover:
                    ComingSoonPlaceholder(
                        title: "Discover",
                        subtitle: "dApps, bridges, and on-chain services curated for privacy.",
                        systemSymbol: "safari"
                    )
                case .settings:
                    SettingsViewV3()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            TabBarV3(activeTab: $activeTab)
        }
    }
}

/// Minimal Settings placeholder that exposes the Appearance picker.
/// Phase B replaces with a full V3 settings screen.
struct SettingsViewV3: View {
    @AppStorage("themePreference") private var themePreferenceRaw: String = "system"

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack {
                CelariLogoView(variant: .lockup, height: 28)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            VStack(alignment: .leading, spacing: 10) {
                Text("APPEARANCE")
                    .font(V3Fonts.caption(11))
                    .tracking(1.2)
                    .foregroundColor(V3Colors.textSecondary)

                Picker("Appearance", selection: $themePreferenceRaw) {
                    Text("System").tag("system")
                    Text("Dark").tag("dark")
                    Text("Light").tag("light")
                }
                .pickerStyle(.segmented)
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
    }
}
