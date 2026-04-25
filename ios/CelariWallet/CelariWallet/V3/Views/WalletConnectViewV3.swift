// V3/Views/WalletConnectViewV3.swift
//
// Replaces V1 WalletConnectView. Pair via wc:// URI + active session list,
// V3 chrome.

import SwiftUI

struct WalletConnectViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    @State private var wcUri: String = ""
    @State private var pairing = false

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "WalletConnect") {
                store.screen = .dashboard
            }

            ScrollView {
                VStack(spacing: 20) {
                    pairCard
                    sessionsSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
        .onAppear { loadSessions() }
    }

    private var pairCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("CONNECT DAPP")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.textSecondary)

            HStack(spacing: 8) {
                TextField("wc:…", text: $wcUri)
                    .font(V3Fonts.mono(13))
                    .foregroundColor(V3Colors.textPrimary)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .background(V3Colors.bgRaised)
                    .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
            }

            PrimaryButton(
                title: pairing ? "Pairing…" : "Connect",
                action: pair,
                isEnabled: !wcUri.isEmpty && !pairing
            )
        }
    }

    private var sessionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ACTIVE SESSIONS")
                .font(V3Fonts.caption(11))
                .tracking(1.5)
                .foregroundColor(V3Colors.textSecondary)

            if store.wcSessions.isEmpty {
                Text("No active sessions")
                    .font(V3Fonts.body(14))
                    .foregroundColor(V3Colors.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            } else {
                VStack(spacing: 8) {
                    ForEach(store.wcSessions) { session in
                        sessionRow(session)
                    }
                }
            }
        }
    }

    private func sessionRow(_ session: WCSession) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(V3Colors.statusUp, lineWidth: 1)
                    .frame(width: 32, height: 32)
                Image(systemName: "link")
                    .font(.system(size: 12, weight: .light))
                    .foregroundColor(V3Colors.statusUp)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(session.peerName)
                    .font(V3Fonts.bodyMedium(14))
                    .foregroundColor(V3Colors.textPrimary)
                Text(session.peerUrl)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                disconnect(session.topic)
            } label: {
                Text("DISCONNECT")
                    .font(V3Fonts.caption(11))
                    .tracking(0.5)
                    .foregroundColor(V3Colors.statusDown)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .overlay(
                        RoundedRectangle(cornerRadius: V3Radius.chip)
                            .stroke(V3Colors.statusDown.opacity(0.4), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(V3Colors.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                .stroke(V3Colors.border, lineWidth: 1)
        )
    }

    private func loadSessions() {
        Task {
            do {
                let result = try await pxeBridge.wcSessions()
                if let sessions = result["sessions"] as? [[String: Any]] {
                    store.wcSessions = sessions.compactMap { dict in
                        guard let topic = dict["topic"] as? String else { return nil }
                        return WCSession(
                            topic: topic,
                            peerName: dict["peer"] as? String ?? "Unknown dApp",
                            peerUrl: dict["peerUrl"] as? String ?? "",
                            chains: dict["chains"] as? [String] ?? [],
                            expiry: dict["expiry"] as? Int
                        )
                    }
                }
            } catch {
                print("[WalletConnectViewV3] Failed to load sessions: \(error)")
            }
        }
    }

    private func pair() {
        pairing = true
        Task {
            do {
                _ = try await pxeBridge.wcPair(uri: wcUri)
                wcUri = ""
                store.showToast("Pairing initiated", type: .success)
            } catch {
                store.showToast("Pairing failed: \(error.localizedDescription)", type: .error)
            }
            pairing = false
        }
    }

    private func disconnect(_ topic: String) {
        Task {
            do {
                _ = try await pxeBridge.wcDisconnect(topic: topic)
                store.wcSessions.removeAll { $0.topic == topic }
                store.showToast("Disconnected", type: .success)
            } catch {
                store.showToast("Disconnect failed", type: .error)
            }
        }
    }
}
