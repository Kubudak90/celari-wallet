// V3/Views/AddNftContractViewV3.swift

import SwiftUI

struct AddNftContractViewV3: View {
    @Environment(WalletStore.self) private var store

    @State private var contractAddress: String = ""
    @State private var name: String = ""
    @State private var symbol: String = ""

    private var canSubmit: Bool { !contractAddress.isEmpty && !name.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Add NFT Contract") {
                store.screen = .dashboard
            }

            ScrollView {
                VStack(spacing: 12) {
                    field("CONTRACT ADDRESS", placeholder: "0x…", text: $contractAddress, mono: true)
                    field("COLLECTION NAME", placeholder: "My NFT Collection", text: $name)
                    field("SYMBOL", placeholder: "NFT", text: $symbol)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }

            PrimaryButton(title: "Add Contract", action: addContract, isEnabled: canSubmit)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private func field(_ label: String, placeholder: String, text: Binding<String>, mono: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(V3Fonts.caption(11))
                .tracking(1.0)
                .foregroundColor(V3Colors.textSecondary)
            TextField(placeholder, text: text)
                .font(mono ? V3Fonts.mono(13) : V3Fonts.body(15))
                .foregroundColor(V3Colors.textPrimary)
                .autocapitalization(.none)
                .padding(14)
                .background(V3Colors.bgRaised)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        }
    }

    private func addContract() {
        let contract = NFTContract(address: contractAddress, name: name, symbol: symbol)
        store.customNftContracts.append(contract)
        store.saveNftContracts()
        store.showToast("NFT contract added", type: .success)
        store.screen = .dashboard
    }
}
