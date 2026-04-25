// V3/Components/PXELogView.swift
//
// Replaces V2 PXELogViewV2. Same scrollable log feed with timestamp,
// level icon, message — V3 chrome.

import SwiftUI

struct PXELogView: View {
    @Environment(WalletStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                HStack(spacing: 6) {
                    Circle()
                        .fill(V3Colors.statusUp)
                        .frame(width: 6, height: 6)
                    Text("PXE LOG")
                        .font(V3Fonts.caption(10))
                        .tracking(1.5)
                        .foregroundColor(V3Colors.textSecondary)
                }
                Spacer()
                Text("\(store.pxeLogs.count)")
                    .font(V3Fonts.mono(10))
                    .foregroundColor(V3Colors.textSecondary)
                Button { store.clearPXELogs() } label: {
                    Image(systemName: "trash")
                        .font(.system(size: 11))
                        .foregroundColor(V3Colors.textSecondary)
                }
                .padding(.leading, 8)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(V3Colors.bgElevated)
            .overlay(alignment: .bottom) {
                Rectangle().fill(V3Colors.border).frame(height: 0.5)
            }

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        ForEach(store.pxeLogs) { entry in
                            HStack(alignment: .top, spacing: 4) {
                                Text(entry.timeString)
                                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                                    .foregroundColor(V3Colors.textMuted)
                                Text(entry.levelIcon)
                                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .foregroundColor(colorForLevel(entry.level))
                                Text(cleanMessage(entry.message))
                                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                                    .foregroundColor(colorForLevel(entry.level))
                                    .lineLimit(3)
                                    .textSelection(.enabled)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 1)
                            .id(entry.id)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .onChange(of: store.pxeLogs.count) {
                    if let last = store.pxeLogs.last {
                        withAnimation(.easeOut(duration: 0.15)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .background(V3Colors.bgElevated)
    }

    private func colorForLevel(_ level: String) -> Color {
        switch level {
        case "error": return V3Colors.statusDown
        case "warn":  return V3Colors.goldPrimary
        default:      return V3Colors.textSecondary
        }
    }

    private func cleanMessage(_ msg: String) -> String {
        msg.replacingOccurrences(of: "[PXE] ", with: "")
           .replacingOccurrences(of: "[PXE-JS:log] ", with: "")
           .replacingOccurrences(of: "[PXE-JS:error] ", with: "")
           .replacingOccurrences(of: "[PXE-JS:warn] ", with: "")
           .replacingOccurrences(of: "[AuthWit] ", with: "")
    }
}
