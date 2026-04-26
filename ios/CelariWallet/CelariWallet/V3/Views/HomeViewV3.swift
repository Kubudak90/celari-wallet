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
                pxeStateChip
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

    @ViewBuilder
    private var pxeStateChip: some View {
        switch store.pxeState {
        case .ready, .notStarted:
            // .ready → no chip, balances are live; .notStarted → init flow not entered yet, also silent.
            EmptyView()
        case .initializing:
            pxeChip(text: "Connecting to PXE...", tint: V3Colors.goldSoft, showSpinner: true)
        case .syncing(let progress):
            pxeChip(text: progress.isEmpty ? "Syncing..." : "Syncing — \(progress)", tint: V3Colors.goldSoft, showSpinner: true)
        case .failed(let error):
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(V3Colors.statusDown)
                Text("PXE failed — tap to retry")
                    .font(V3Fonts.body(13))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer(minLength: 0)
                Text(error.prefix(60).description)
                    .font(V3Fonts.body(11))
                    .foregroundColor(V3Colors.textMuted)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(V3Colors.bgElevated)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(V3Colors.statusDown.opacity(0.4), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .contentShape(Rectangle())
            .onTapGesture {
                Task { await store.retryPXEInit() }
            }
        }
    }

    private func pxeChip(text: String, tint: Color, showSpinner: Bool) -> some View {
        HStack(spacing: 8) {
            if showSpinner {
                ProgressView()
                    .scaleEffect(0.6)
                    .tint(tint)
                    .frame(width: 12, height: 12)
            }
            Text(text)
                .font(V3Fonts.body(12))
                .foregroundColor(V3Colors.textSecondary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(V3Colors.bgElevated)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(tint.opacity(0.3), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
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

/// Sheet wrapper around PXELogView so V3 surfaces logs without nested
/// chrome inside the component itself.
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

            PXELogView()
                .background(V3Colors.bgBase)
        }
        .background(V3Colors.bgBase)
    }
}
