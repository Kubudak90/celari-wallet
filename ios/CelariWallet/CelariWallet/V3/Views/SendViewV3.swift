// V3/Views/SendViewV3.swift
//
// Phase B+ wiring: Review Transaction CTA invokes PXEBridge.transfer the
// way SendViewV2 does. State seeds from `store.sendForm` so the Shield
// quick action on Home can pre-fill recipient + transferType.

import SwiftUI

struct SendViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge
    @Environment(\.dismiss) private var dismiss

    @State private var amount: String = ""
    @State private var recipient: String = ""
    @State private var selectedSymbol: String? = nil
    @State private var transferMode: TransferType = .privateTransfer
    @State private var sending = false

    private var selectedToken: Token? {
        if let sym = selectedSymbol, let t = store.tokens.first(where: { $0.symbol == sym }) {
            return t
        }
        return store.tokens.first
    }

    private var parsedAmountUSD: Double? {
        guard let v = Double(amount), let token = selectedToken else { return nil }
        let cleaned = token.value
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
        let priceUSD = (Double(cleaned) ?? 0) / max(Double(token.balance) ?? 1, 0.000001)
        return v * priceUSD
    }

    private var canSubmit: Bool {
        !sending
            && !recipient.trimmingCharacters(in: .whitespaces).isEmpty
            && (Double(amount) ?? 0) > 0
            && selectedToken != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "Send")

            ScrollView {
                VStack(spacing: 16) {
                    AmountInput(
                        amount: $amount,
                        tokenSymbol: selectedToken?.symbol ?? "ETH",
                        usdSubtotal: parsedAmountUSD
                    )

                    transferModeRow
                    toCard
                    networkCard
                    feeCard
                    summaryCard
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }

            PrimaryButton(
                title: sending ? "Sending…" : "Review Transaction",
                action: performSend,
                isEnabled: canSubmit
            )
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
        .onAppear(perform: seedFromSendForm)
    }

    /// Pre-fill from `store.sendForm` (set by Home's Shield action, etc.)
    private func seedFromSendForm() {
        let form = store.sendForm
        if !form.to.isEmpty { recipient = form.to }
        if !form.amount.isEmpty { amount = form.amount }
        if !form.token.isEmpty { selectedSymbol = form.token }
        transferMode = form.transferType
        // Reset the form so a future Send tap from Home starts clean.
        store.sendForm = SendForm()
    }

    private var transferModeRow: some View {
        HStack(spacing: 8) {
            ForEach(TransferType.allCases, id: \.self) { mode in
                Button {
                    transferMode = mode
                } label: {
                    Text(mode.label)
                        .font(V3Fonts.caption(11))
                        .tracking(1.0)
                        .foregroundColor(transferMode == mode ? V3Colors.bgBase : V3Colors.textSecondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: V3Radius.pill)
                                .fill(transferMode == mode ? V3Colors.goldGradient
                                                           : LinearGradient(colors: [V3Colors.bgRaised],
                                                                            startPoint: .top, endPoint: .bottom))
                        )
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
    }

    private var toCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("To")
                .font(V3Fonts.caption(13))
                .foregroundColor(V3Colors.textSecondary)

            HStack(spacing: 8) {
                TextField("Address, ENS or .celari", text: $recipient)
                    .textFieldStyle(.plain)
                    .font(V3Fonts.body(15))
                    .foregroundColor(V3Colors.textPrimary)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                Button {
                    // Reserved for QR scanner integration (Phase B+)
                } label: {
                    Image(systemName: "qrcode.viewfinder")
                        .font(.system(size: 16, weight: .regular))
                        .foregroundColor(V3Colors.textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(V3Colors.bgRaised)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        }
        .v3Card()
    }

    private var networkCard: some View {
        HStack(spacing: 12) {
            Image("LogoMark")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text("Network")
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
                Text(store.network)
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
            }
            Spacer()
        }
        .v3Card()
    }

    private var feeCard: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Estimated fee")
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
                Text("Sponsored")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.statusUp)
                Text("Gas paid by SponsoredFPC")
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textMuted)
            }
            Spacer()
        }
        .v3Card()
    }

    private var summaryCard: some View {
        VStack(spacing: 10) {
            summaryRow("You send",
                       value: "\(amount.isEmpty ? "0" : amount) \(selectedToken?.symbol ?? "")")
            summaryRow("Mode", value: transferMode.label)
            summaryRow("Estimated fee", value: "Sponsored")
            Divider().background(V3Colors.border)
            summaryRow("Total",
                       value: "\(amount.isEmpty ? "0" : amount) \(selectedToken?.symbol ?? "")",
                       emphasised: true)
        }
        .v3Card()
    }

    private func summaryRow(_ label: String, value: String, emphasised: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(emphasised ? V3Fonts.bodyMedium(15) : V3Fonts.body(14))
                .foregroundColor(emphasised ? V3Colors.textPrimary : V3Colors.textSecondary)
            Spacer()
            Text(value)
                .font(V3Fonts.bodyMedium(15))
                .foregroundColor(V3Colors.textPrimary)
        }
    }

    private func performSend() {
        guard canSubmit, let token = selectedToken else { return }
        let symbol = token.symbol
        guard let tokenAddr = store.tokenAddresses[symbol] ?? token.contractAddress else {
            store.showToast("Token address not found for \(symbol)", type: .error)
            return
        }
        sending = true
        Task {
            UIApplication.shared.isIdleTimerDisabled = true
            defer {
                sending = false
                UIApplication.shared.isIdleTimerDisabled = false
            }
            do {
                _ = try await pxeBridge.transfer(
                    to: recipient,
                    amount: amount,
                    tokenAddress: tokenAddr,
                    transferType: transferMode.rawValue
                )
                store.showToast("Transfer sent", type: .success)
                await store.fetchBalances()
                await MainActor.run { dismiss() }
            } catch {
                store.showToast("Send failed: \(error.localizedDescription)", type: .error)
            }
        }
    }
}
