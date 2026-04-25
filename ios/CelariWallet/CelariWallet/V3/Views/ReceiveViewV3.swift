// V3/Views/ReceiveViewV3.swift

import SwiftUI

struct ReceiveViewV3: View {
    @Environment(WalletStore.self) private var store

    private var celariID: String {
        guard let addr = store.activeAccount?.address else { return "@user.celari" }
        let prefix = String(addr.dropFirst(2).prefix(6)).lowercased()
        return "@\(prefix).celari"
    }

    private var address: String {
        store.activeAccount?.address ?? ""
    }

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "Receive")

            ScrollView {
                VStack(spacing: 16) {
                    qrCard
                    SecondaryButton(title: "Share address") {
                        share(text: address)
                    }
                    celariIDCard
                    receiveOptions
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private var qrCard: some View {
        VStack(spacing: 16) {
            Text("Receive with")
                .font(V3Fonts.caption(13))
                .foregroundColor(V3Colors.textSecondary)
            CelariLogoView(variant: .lockup, height: 24)

            ZStack {
                if let image = ReceiveQRGenerator.image(from: address) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 220, height: 220)
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(V3Colors.bgRaised)
                        .frame(width: 220, height: 220)
                }
                Image("LogoMark")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 48, height: 48)
                    .padding(8)
                    .background(V3Colors.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .padding(12)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .v3Card()
    }

    private var celariIDCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Your Celari ID")
                .font(V3Fonts.caption(12))
                .foregroundColor(V3Colors.textSecondary)

            HStack {
                Text(celariID)
                    .font(V3Fonts.bodyMedium(16))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
                Button {
                    UIPasteboard.general.string = celariID
                    store.showToast("Copied", type: .success)
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(V3Colors.goldPrimary)
                }
                .buttonStyle(.plain)
            }

            Text("Others can send you crypto using your Celari ID or scan the QR code. Celari ID names coming soon.")
                .font(V3Fonts.caption(12))
                .foregroundColor(V3Colors.textMuted)
        }
        .v3Card()
    }

    private var receiveOptions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Receive crypto")
                .font(V3Fonts.h3(17))
                .foregroundColor(V3Colors.textPrimary)

            VStack(spacing: 8) {
                receiveOptionRow(symbol: "wallet.pass",
                                 title: "From another wallet",
                                 subtitle: "Share your address")
                receiveOptionRow(symbol: "building.columns",
                                 title: "From exchange",
                                 subtitle: "Transfer from exchange")
            }
        }
    }

    private func receiveOptionRow(symbol: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().stroke(V3Colors.border, lineWidth: 1).frame(width: 36, height: 36)
                Image(systemName: symbol)
                    .font(.system(size: 14, weight: .light))
                    .foregroundColor(V3Colors.goldPrimary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(V3Fonts.bodyMedium(15)).foregroundColor(V3Colors.textPrimary)
                Text(subtitle).font(V3Fonts.caption(12)).foregroundColor(V3Colors.textSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(V3Colors.textMuted)
        }
        .padding(16)
        .background(V3Colors.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                .stroke(V3Colors.border, lineWidth: 1)
        )
    }

    private func share(text: String) {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first,
            let root = scene.windows.first?.rootViewController else { return }
        let av = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        root.present(av, animated: true)
    }
}

import CoreImage.CIFilterBuiltins

/// Tiny QR helper. ReceiveViewV2 has a similar one — Phase C consolidates them.
private enum ReceiveQRGenerator {
    static func image(from string: String) -> UIImage? {
        guard !string.isEmpty,
              let data = string.data(using: .ascii) else { return nil }
        let filter = CIFilter.qrCodeGenerator()
        filter.message = data
        filter.correctionLevel = "M"
        guard let ci = filter.outputImage else { return nil }
        let scale = CGAffineTransform(scaleX: 8, y: 8)
        let scaled = ci.transformed(by: scale)
        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
