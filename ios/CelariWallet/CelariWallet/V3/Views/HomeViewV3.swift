// V3/Views/HomeViewV3.swift

import SwiftUI

struct HomeViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    /// Path binding owned by RootViewV3; HomeViewV3 mutates it to push routes.
    @Binding var path: [HomeRoute]

    @State private var balanceHidden = false
    @State private var showFaucetAlert = false
    @State private var showLogsSheet = false
    @State private var savedBrightness: CGFloat = 0.5

    private var totalUSD: Double {
        parseUSD(store.totalValue)
    }

    private var topAssets: [Token] {
        Array(store.tokens.prefix(3))
    }

    private var needsDeploy: Bool {
        store.activeAccount?.deployed == false
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header
                BalanceHeader(
                    totalUSD: totalUSD,
                    percentChange: 0,
                    hidden: balanceHidden,
                    onTogglePrivacy: { balanceHidden.toggle() }
                )
                quickActionsRow
                if needsDeploy { deployBanner }
                accountsSection
                assetsSection
                toolsSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .alert("Request Faucet", isPresented: $showFaucetAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Request") { requestFaucet() }
        } message: {
            Text("Testnet faucet may take 10-15 minutes for proof generation. Keep the screen on; it dims automatically to save battery.")
        }
        .sheet(isPresented: $showLogsSheet) {
            PXELogsSheet()
        }
    }

    private var header: some View {
        HStack {
            Color.clear.frame(width: 32, height: 32)
            Spacer()
            CelariLogoView(variant: .lockup, height: 22)
            Spacer()
            Button {
                // Reserved for QR scan / WalletConnect (Phase B+)
            } label: {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundColor(V3Colors.textPrimary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
    }

    private var quickActionsRow: some View {
        HStack(spacing: 0) {
            QuickActionButton(title: "Send",    systemSymbol: "arrow.up")    { path.append(.send) }
            Spacer()
            QuickActionButton(title: "Receive", systemSymbol: "arrow.down")  { path.append(.receive) }
            Spacer()
            QuickActionButton(title: "Swap",    systemSymbol: "arrow.left.arrow.right") { path.append(.swap) }
            Spacer()
            QuickActionButton(title: "Buy",     systemSymbol: "plus")        { path.append(.buy) }
        }
    }

    private var deployBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt.fill")
                .font(.system(size: 16))
                .foregroundColor(V3Colors.goldPrimary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Deploy your account")
                    .font(V3Fonts.bodyMedium(14))
                    .foregroundColor(V3Colors.textPrimary)
                Text(store.deployStep.isEmpty
                     ? "One-time on-chain setup before you can transact."
                     : store.deployStep)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
                    .lineLimit(2)
            }
            Spacer()
            Button {
                Task { await store.deployActiveAccount(pxeBridge: pxeBridge) }
            } label: {
                if store.deploying {
                    ProgressView().tint(V3Colors.bgBase)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: V3Radius.button).fill(V3Colors.goldGradient))
                } else {
                    Text("Deploy")
                        .font(V3Fonts.bodyMedium(14))
                        .foregroundColor(V3Colors.bgBase)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: V3Radius.button).fill(V3Colors.goldGradient))
                }
            }
            .buttonStyle(.plain)
            .disabled(store.deploying)
        }
        .v3Card()
    }

    private var accountsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Accounts")
                    .font(V3Fonts.h3(17))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
                Button {
                    store.screen = .addAccount
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(V3Colors.goldPrimary)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(V3Colors.goldPrimary, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }

            VStack(spacing: 12) {
                ForEach(Array(store.accounts.enumerated()), id: \.element.id) { index, account in
                    AccountCard(
                        name: account.label,
                        balanceUSD: index == store.activeAccountIndex ? totalUSD : 0,
                        assetCount: index == store.activeAccountIndex ? store.tokens.count : 0,
                        isActive: index == store.activeAccountIndex
                    ) {
                        store.activeAccountIndex = index
                    }
                }
            }
        }
    }

    private var assetsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Assets")
                .font(V3Fonts.h3(17))
                .foregroundColor(V3Colors.textPrimary)

            VStack(spacing: 0) {
                ForEach(topAssets, id: \.id) { token in
                    AssetRow(
                        name: token.name,
                        symbol: token.symbol,
                        amount: token.balance,
                        amountUnit: token.symbol,
                        valueUSD: parseUSD(token.value),
                        percentChange: nil,
                        iconHex: token.color
                    )
                    if token.id != topAssets.last?.id {
                        Divider().background(V3Colors.border)
                    }
                }
            }
            .padding(.horizontal, 12)
            .background(V3Colors.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                    .stroke(V3Colors.border, lineWidth: 1)
            )
        }
    }

    private var toolsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Tools")
                .font(V3Fonts.h3(17))
                .foregroundColor(V3Colors.textPrimary)

            HStack(spacing: 12) {
                toolButton(symbol: "drop.fill", label: "Faucet") {
                    showFaucetAlert = true
                }
                toolButton(symbol: "shield.lefthalf.filled", label: "Shield") {
                    store.sendForm = SendForm()
                    store.sendForm.transferType = .shield
                    store.sendForm.to = store.activeAccount?.address ?? ""
                    path.append(.send)
                }
                toolButton(symbol: "terminal", label: "Logs") {
                    showLogsSheet = true
                }
            }
        }
    }

    private func toolButton(symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(V3Colors.goldPrimary)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle().stroke(V3Colors.border, lineWidth: 1)
                    )
                Text(label)
                    .font(V3Fonts.caption(11))
                    .foregroundColor(V3Colors.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(V3Colors.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                    .stroke(V3Colors.border, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    /// Parse a `$12,458.73`-style string into a Double. Returns 0 on failure.
    private func parseUSD(_ s: String) -> Double {
        let cleaned = s.replacingOccurrences(of: "$", with: "")
                       .replacingOccurrences(of: ",", with: "")
        return Double(cleaned) ?? 0
    }

    private func requestFaucet() {
        guard let account = store.activeAccount else { return }
        store.showToast("Requesting faucet tokens…")
        savedBrightness = UIScreen.main.brightness
        UIScreen.main.brightness = 0.1
        Task {
            UIApplication.shared.isIdleTimerDisabled = true
            defer {
                UIApplication.shared.isIdleTimerDisabled = false
                UIScreen.main.brightness = savedBrightness
            }
            do {
                _ = try await pxeBridge.faucet(address: account.address)
                store.showToast("Faucet tokens received", type: .success)
                await store.fetchBalances()
            } catch {
                store.showToast("Faucet failed: \(error.localizedDescription)", type: .error)
            }
        }
    }
}

/// Sheet wrapper around the existing PXELogViewV2 so V3 surfaces logs without
/// duplicating the log-viewer implementation. Phase C consolidates this into
/// a V3-styled component.
private struct PXELogsSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("PXE Logs")
                    .font(V3Fonts.h3(17))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
                Button("Done") { dismiss() }
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.goldPrimary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider().background(V3Colors.border)

            PXELogViewV2()
                .background(V3Colors.bgBase)
        }
        .background(V3Colors.bgBase)
    }
}
