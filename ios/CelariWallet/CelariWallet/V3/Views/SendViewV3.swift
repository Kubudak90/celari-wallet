// V3/Views/SendViewV3.swift
//
// Phase B: chrome and form layout match the reference mockup. The Review
// Transaction CTA is intentionally a stub — Phase B+ wires it to
// PXEBridge.transfer(to:amount:tokenAddress:transferType:) the way
// SendViewV2 does today.

import SwiftUI

struct SendViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge
    @Environment(\.dismiss) private var dismiss

    @State private var amount: String = ""
    @State private var recipient: String = ""

    private var selectedToken: Token? { store.tokens.first }

    private var parsedAmountUSD: Double? {
        guard let v = Double(amount), let token = selectedToken else { return nil }
        let cleaned = token.value
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
        let priceUSD = (Double(cleaned) ?? 0) / max(Double(token.balance) ?? 1, 0.000001)
        return v * priceUSD
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

                    toCard
                    networkCard
                    feeCard
                    summaryCard
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }

            PrimaryButton(title: "Review Transaction") {
                store.showToast("Review flow ships in Phase B+ wiring", type: .success)
                dismiss()
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
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
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(V3Colors.textMuted)
        }
        .v3Card()
    }

    private var feeCard: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Estimated fee")
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
                Text("$1.42")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                Text("0.000492 ETH")
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textMuted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(V3Colors.textMuted)
        }
        .v3Card()
    }

    private var summaryCard: some View {
        VStack(spacing: 10) {
            summaryRow("You send",
                       value: "\(amount.isEmpty ? "0" : amount) \(selectedToken?.symbol ?? "ETH")")
            summaryRow("Estimated fee", value: "$1.42")
            Divider().background(V3Colors.border)
            summaryRow("Total",
                       value: parsedAmountUSD.map { String(format: "$%.2f", $0 + 1.42) } ?? "—",
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
}
