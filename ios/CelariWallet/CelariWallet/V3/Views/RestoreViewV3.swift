// V3/Views/RestoreViewV3.swift
//
// Replaces RestoreViewV2. Same restore logic + biometric gate, V3 chrome.

import SwiftUI
import UniformTypeIdentifiers

struct RestoreViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge

    @State private var selectedFileName = ""
    @State private var fileData: Data?
    @State private var password = ""
    @State private var restoring = false
    @State private var showFilePicker = false

    private var canRestore: Bool {
        fileData != nil && !password.isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Restore Wallet") {
                store.screen = store.accounts.isEmpty ? .onboarding : .dashboard
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    fileField
                    passwordFieldView

                    Text("Choose your encrypted backup file (.enc) and enter the password you set during backup.")
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textMuted)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }

            PrimaryButton(
                title: restoring ? "Restoring…" : "Restore Wallet",
                action: { Task { await restoreWallet() } },
                isEnabled: canRestore && !restoring
            )
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: [.json, .data],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                _ = url.startAccessingSecurityScopedResource()
                defer { url.stopAccessingSecurityScopedResource() }
                if let data = try? Data(contentsOf: url) {
                    fileData = data
                    selectedFileName = url.lastPathComponent
                }
            }
        }
    }

    private var fileField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("BACKUP FILE")
                .font(V3Fonts.caption(11))
                .tracking(1.0)
                .foregroundColor(V3Colors.textSecondary)

            Button { showFilePicker = true } label: {
                HStack(spacing: 12) {
                    Image(systemName: fileData != nil ? "doc.fill" : "doc.badge.plus")
                        .font(.system(size: 20, weight: .light))
                        .foregroundColor(fileData != nil ? V3Colors.statusUp : V3Colors.textMuted)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(fileData != nil ? selectedFileName : "Tap to select file")
                            .font(V3Fonts.bodyMedium(14))
                            .foregroundColor(fileData != nil ? V3Colors.textPrimary : V3Colors.textMuted)
                        if let data = fileData {
                            Text("\(data.count / 1024) KB")
                                .font(V3Fonts.mono(11))
                                .foregroundColor(V3Colors.textSecondary)
                        }
                    }

                    Spacer()

                    if fileData != nil {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundColor(V3Colors.statusUp)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(V3Colors.bgRaised)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous)
                        .stroke(fileData != nil ? V3Colors.statusUp.opacity(0.3) : V3Colors.border,
                                style: fileData != nil ? StrokeStyle(lineWidth: 1) : StrokeStyle(lineWidth: 1, dash: [6]))
                )
            }
            .buttonStyle(.plain)
        }
    }

    private var passwordFieldView: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("PASSWORD")
                .font(V3Fonts.caption(11))
                .tracking(1.0)
                .foregroundColor(V3Colors.textSecondary)
            SecureField("Backup password", text: $password)
                .font(V3Fonts.body(15))
                .foregroundColor(V3Colors.textPrimary)
                .padding(14)
                .background(V3Colors.bgRaised)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        }
    }

    private func restoreWallet() async {
        guard let data = fileData else { return }
        restoring = true
        do {
            let payload = try await BackupManager.decryptAsync(encryptedData: data, password: password)
            let account = try BackupManager.restoreAccount(from: payload)

            if store.accounts.contains(where: { $0.address == account.address }) {
                store.showToast("This account is already imported", type: .error)
                restoring = false
                return
            }

            store.accounts.append(account)
            store.activeAccountIndex = store.accounts.count - 1
            store.saveAccounts()
            store.tokens = Token.defaults

            if account.deployed && store.pxeInitialized {
                await store.reRegisterAccount(pxeBridge: pxeBridge, account: account)
            }
            await store.fetchBalances()

            store.screen = .dashboard
            store.showToast("Wallet restored", type: .success)
        } catch {
            store.showToast("Restore failed: \(error.localizedDescription)", type: .error)
        }
        restoring = false
    }
}
