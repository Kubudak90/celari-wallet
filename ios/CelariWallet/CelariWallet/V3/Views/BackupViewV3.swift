// V3/Views/BackupViewV3.swift
//
// Replaces BackupViewV2. Same export logic + biometric gate, V3 chrome.

import SwiftUI

struct BackupViewV3: View {
    @Environment(WalletStore.self) private var store

    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var exporting = false

    private var canExport: Bool {
        password.count >= 8 && password == confirmPassword
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeaderRouted(title: "Backup Wallet") {
                store.screen = .dashboard
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    warningBanner

                    VStack(alignment: .leading, spacing: 12) {
                        passwordField(label: "PASSWORD",
                                      placeholder: "Enter password",
                                      text: $password)
                        passwordField(label: "CONFIRM PASSWORD",
                                      placeholder: "Confirm password",
                                      text: $confirmPassword)

                        if !password.isEmpty && !confirmPassword.isEmpty && password != confirmPassword {
                            Text("Passwords do not match")
                                .font(V3Fonts.caption(12))
                                .foregroundColor(V3Colors.statusDown)
                        }
                    }

                    Text("Store your backup file in a safe location. You'll need the password to restore it.")
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textMuted)
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }

            PrimaryButton(
                title: exporting ? "Exporting…" : "Export Backup",
                action: { Task { await exportBackup() } },
                isEnabled: canExport && !exporting
            )
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private var warningBanner: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.shield")
                .font(.system(size: 16, weight: .regular))
                .foregroundColor(V3Colors.goldPrimary)
            Text("Your backup will be encrypted with the password you set below.")
                .font(V3Fonts.body(13))
                .foregroundColor(V3Colors.textPrimary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(V3Colors.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous)
                .stroke(V3Colors.goldPrimary.opacity(0.4), lineWidth: 1)
        )
    }

    private func passwordField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(V3Fonts.caption(11))
                .tracking(1.0)
                .foregroundColor(V3Colors.textSecondary)
            SecureField(placeholder, text: text)
                .font(V3Fonts.body(15))
                .foregroundColor(V3Colors.textPrimary)
                .padding(14)
                .background(V3Colors.bgRaised)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.button, style: .continuous))
        }
    }

    private func exportBackup() async {
        guard let account = store.activeAccount else { return }
        exporting = true
        do {
            try await store.passkeyManager.authenticateWithBiometrics(reason: "Authenticate to export backup")
            let payload = BackupManager.buildBackupPayload(account: account)
            let encrypted = try await BackupManager.encryptAsync(data: payload, password: password)

            let fileName = "celari-backup-\(account.label.replacingOccurrences(of: " ", with: "-")).enc"
            let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
            try encrypted.write(to: tempUrl)

            await MainActor.run {
                let activityVC = UIActivityViewController(activityItems: [tempUrl], applicationActivities: nil)
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let root = windowScene.windows.first?.rootViewController {
                    root.present(activityVC, animated: true)
                }
            }
            store.lastBackupDate = Date().timeIntervalSince1970
            store.showToast("Backup exported", type: .success)
        } catch {
            store.showToast("Backup failed: \(error.localizedDescription)", type: .error)
        }
        exporting = false
    }
}
