// V3/RootViewV3.swift

import SwiftUI

/// V3 root view. Wires the 5-tab bottom bar to real V3 screens. The Home
/// tab is wrapped in a `NavigationStack` so Send / Receive / Swap / Buy
/// push from quick-action taps. Restore / Recovery / Backup / AddAccount
/// states still delegate to V2 views (rebuilt in a later plan).
struct RootViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge
    @State private var activeTab: V3Tab = .home
    @State private var homePath: [HomeRoute] = []

    var body: some View {
        ZStack {
            V3Colors.bgBase.ignoresSafeArea()

            Group {
                switch store.screen {
                case .loading:
                    LoadingViewV3()
                case .onboarding:
                    OnboardingViewV3()
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
                    NavigationStack(path: $homePath) {
                        HomeViewV3(path: $homePath)
                            .navigationDestination(for: HomeRoute.self) { route in
                                switch route {
                                case .send:
                                    SendViewV3()
                                case .receive:
                                    ReceiveViewV3()
                                case .swap:
                                    ComingSoonPlaceholder(
                                        title: "Swap is coming soon",
                                        subtitle: "Trade assets privately, without giving up control.",
                                        systemSymbol: "arrow.left.arrow.right"
                                    )
                                case .buy:
                                    ComingSoonPlaceholder(
                                        title: "Buy is coming soon",
                                        subtitle: "On-ramp partners, integrated for privacy.",
                                        systemSymbol: "plus"
                                    )
                                }
                            }
                    }
                case .assets:
                    AssetsViewV3()
                case .activity:
                    ActivityViewV3()
                case .discover:
                    DiscoverViewV3()
                case .settings:
                    SettingsViewV3()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            TabBarV3(activeTab: $activeTab)
        }
    }
}
