// V3/Views/AddTokenViewV3.swift
//
// Replaces V1 AddTokenView. Same custom token registration, V3 chrome.

import SwiftUI

struct AddTokenViewV3: View {
    @Environment(WalletStore.self) private var store

    @State private var contractAddress: String = ""
    @State private var name: String = ""
    @State private var symbol: String = ""
    @State private var decimals: String = "18"

    private var canSubmit: Bool {
        !contractAddress.isEmpty && !name.isEmpty && !symbol.isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Add Custom Token") {
                store.screen = .dashboard
            }

            ScrollView {
                VStack(spacing: 12) {
                    field("CONTRACT ADDRESS",
                          placeholder: "0x…",
                          text: $contractAddress,
                          mono: true)
                    field("TOKEN NAME",
                          placeholder: "My Token",
                          text: $name)
                    field("SYMBOL",
                          placeholder: "TKN",
                          text: $symbol)
                    field("DECIMALS",
                          placeholder: "18",
                          text: $decimals,
                          mono: true,
                          keyboard: .numberPad)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }

            PrimaryButton(title: "Add Token", action: addToken, isEnabled: canSubmit)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private func field(_ label: String,
                       placeholder: String,
                       text: Binding<String>,
                       mono: Bool = false,
                       keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(V3Fonts.caption(11))
                .tracking(1.0)
                .foregroundColor(V3Colors.textSecondary)
            TextField(placeholder, text: text)
                .font(mono ? V3Fonts.mono(13) : V3Fonts.body(15))
                .foregroundColor(V3Colors.textPrimary)
                .keyboardType(keyboard)
                .autocapitalization(.none)
                .padding(14)
                .background(V3Colors.bgRaised)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        }
    }

    private func addToken() {
        if store.customTokens.contains(where: {
            $0.contractAddress == contractAddress || $0.symbol == symbol
        }) {
            store.showToast("Token already exists: \(symbol)", type: .error)
            store.screen = .dashboard
            return
        }
        let token = CustomToken(
            contractAddress: contractAddress,
            name: name,
            symbol: symbol,
            decimals: Int(decimals) ?? 18
        )
        store.customTokens.append(token)
        store.saveCustomTokens()
        store.tokenAddresses[symbol] = contractAddress
        store.showToast("Token added: \(symbol)", type: .success)
        store.screen = .dashboard
        Task { await store.fetchBalances() }
    }
}
