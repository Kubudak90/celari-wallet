# iOS V3 Screens (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every V3 placeholder tab and the V2-routed onboarding/loading screens with real V3 implementations matching the reference mockups: a feature-complete Home, Send, Receive, Assets, Activity, Discover (better placeholder), Settings, Onboarding, and Loading. Use V2 view logic as the data-flow reference (same `WalletStore` / `PXEBridge` env), but rewrite the chrome from V3 components only.

**Architecture:**
- 8 new reusable V3 components (`BalanceHeader`, `QuickActionButton`, `AccountCard`, `AssetRow`, `TransactionRow`, `ScreenHeader`, `PercentChangePill`, `AmountInput`).
- 9 new V3 view files (`HomeViewV3`, `SendViewV3`, `ReceiveViewV3`, `AssetsViewV3`, `ActivityViewV3`, `DiscoverViewV3`, `OnboardingViewV3`, `LoadingViewV3`, plus a `HomeRoute` enum for typed `NavigationStack` routing).
- `RootViewV3` updated to wire the Home tab inside a `NavigationStack` (so Send/Receive/Swap/Buy push from Home rather than living as standalone tabs), and to swap the placeholder content of every other tab for the real V3 view.
- All form state / network / proof / biometric gating logic ports from existing `V2/Views/*V2.swift` and `Views/*.swift` files, but is rewritten in V3 idioms — no shared types except the `WalletStore`-level models.

**Tech Stack:** Swift 5.9, SwiftUI (iOS 17+, NavigationStack), `@Observable` `WalletStore`, generated `Color.celari*` extensions, Outfit + Inter fonts, Asset Catalog vector imagesets (`LogoMark`, `LogoLockup`).

**Prerequisites (manual, before Task 0):**
1. macOS host with Xcode 26 / iOS 17+ simulator (a build with V3 Foundation + Core lazy fix succeeds — verified by Phase A's smoke test).
2. Working tree clean on `main` at HEAD ≥ commit `ffdc16e` (or whatever is current after Phase A merge + Core fix). The user's WIP modifications outside V3 / Core may remain dirty — that's fine.
3. Phase A merged (V3 Foundation + Core `lazy` fix). Verify `Color.celariBgBase` resolves and the V3 shell launches in simulator with the 5-tab bar.

**Convention notes:**
- V3 view files use `Image("LogoMark")` / `Image("LogoLockup")` for brand marks. They're appearance-adaptive; never hard-code light/dark variant selection in code.
- V3 view files reference `V3Colors.*` / `V3Fonts.*` / `V3Radius.*` / `V3Motion.*` only — no `Color(hex:)` literals, no `Font.system(...)` outside the explicit numeric / monospaced cases already in `V3Theme.swift`.
- Press feedback: use `.scaleEffect(0.97)` + `V3Motion.press` on every interactive button (mirroring `PrimaryButton`).
- Phase B does NOT delete V1 or V2 files. Phase C handles cleanup. V3 may temporarily import V2 logic helpers if the duplication cost is high — flag those in commit messages so Phase C can scrub them.

---

## File Structure

Created by this plan:

```
ios/CelariWallet/CelariWallet/V3/
  Components/
    BalanceHeader.swift
    QuickActionButton.swift
    AccountCard.swift
    AssetRow.swift
    TransactionRow.swift
    ScreenHeader.swift
    PercentChangePill.swift
    AmountInput.swift
  Views/
    HomeViewV3.swift
    SendViewV3.swift
    ReceiveViewV3.swift
    AssetsViewV3.swift
    ActivityViewV3.swift
    DiscoverViewV3.swift
    OnboardingViewV3.swift
    LoadingViewV3.swift
  Routing/
    HomeRoute.swift
  RootViewV3.swift                       # modified — NavigationStack wiring + real views

# Modified
docs/superpowers/specs/2026-04-24-celari-rebrand-design.md   # mark Phase B done
```

Untouched: V1 directories, V2 directories (except as read-only references), `Core/*`, models, scripts, brand pipeline.

---

## Task 0: Pre-flight

**Files:** verification only.

- [ ] **Step 1: Git clean**

```bash
git status
```
Expected: clean (or only unrelated WIP files outside V3 / Core).

- [ ] **Step 2: Phase A verified**

```bash
git log --oneline -5
```
Expected: history includes `9bec4fc fix(ios): replace lazy var with explicit lazy-init…` and the V3 Foundation chain (`feat(ios): RootViewV3…`).

```bash
ls ios/CelariWallet/CelariWallet/V3/Theme/V3Theme.swift \
   ios/CelariWallet/CelariWallet/V3/Components/TabBarV3.swift \
   ios/CelariWallet/CelariWallet/V3/RootViewV3.swift \
   ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift
```
Expected: all 4 files present.

- [ ] **Step 3: Verify simulator build still succeeds (smoke test)**

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/CelariWallet-*
xcodebuild -project ios/CelariWallet/CelariWallet.xcodeproj \
  -scheme CelariWallet -configuration Debug \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro" \
  build 2>&1 | tail -5
```
Expected: `** BUILD SUCCEEDED **`. If it fails, do NOT start Phase B — debug Phase A first.

---

## Task 1: Create worktree

- [ ] **Step 1: Worktree**

```bash
git worktree add .worktrees/ios-v3-screens -b feat/ios-v3-screens
cd ".worktrees/ios-v3-screens"
ls node_modules 2>/dev/null | head -1 || npm install --legacy-peer-deps
```

All subsequent commands assume CWD = `.worktrees/ios-v3-screens`. Quote the path when `cd`-ing because of the Turkish `ı` (U+0131).

- [ ] **Step 2: Stage Swoirenberg.xcframework**

The xcframework is required for builds but is gitignored. Copy from main worktree:

```bash
mkdir -p fork/output && cp -R "/Users/huseyinarslan/Desktop/celari-build-25 kopyası 2/fork/output/Swoirenberg.xcframework" fork/output/
```

---

## Task 2: HomeRoute enum + ScreenHeader component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Routing/HomeRoute.swift`
- Create: `ios/CelariWallet/CelariWallet/V3/Components/ScreenHeader.swift`

`HomeRoute` is the typed enum used by `NavigationStack` to push Send / Receive / Swap / Buy from the Home tab. `ScreenHeader` is the reusable top-bar (back arrow + centered title + optional trailing) used by every pushed screen.

- [ ] **Step 1: Write `HomeRoute.swift`**

```swift
// V3/Routing/HomeRoute.swift

import Foundation

enum HomeRoute: Hashable {
    case send
    case receive
    case swap
    case buy
}
```

- [ ] **Step 2: Write `ScreenHeader.swift`**

```swift
// V3/Components/ScreenHeader.swift

import SwiftUI

/// Reusable navigation header used by pushed V3 screens.
/// Layout: leading back arrow, centered title, optional trailing icon.
struct ScreenHeader<Trailing: View>: View {
    let title: String
    var trailing: () -> Trailing

    @Environment(\.dismiss) private var dismiss

    init(title: String, @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.title = title
        self.trailing = trailing
    }

    var body: some View {
        ZStack {
            Text(title)
                .font(V3Fonts.h3(17))
                .foregroundColor(V3Colors.textPrimary)
                .frame(maxWidth: .infinity, alignment: .center)

            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(V3Colors.textPrimary)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Spacer()

                trailing()
                    .frame(width: 44, height: 44)
            }
        }
        .frame(height: 44)
        .padding(.horizontal, 8)
    }
}

#Preview {
    VStack(spacing: 0) {
        ScreenHeader(title: "Send")
        Spacer()
    }
    .background(V3Colors.bgBase)
}
```

- [ ] **Step 3: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Routing/HomeRoute.swift \
        ios/CelariWallet/CelariWallet/V3/Components/ScreenHeader.swift
git commit -m "feat(ios): HomeRoute + ScreenHeader (NavigationStack scaffolding)"
```

---

## Task 3: PercentChangePill component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Components/PercentChangePill.swift`

Used by `BalanceHeader` ("▲ 2.35% Today") and by `AssetRow` (token-level % change).

- [ ] **Step 1: Write the component**

```swift
// V3/Components/PercentChangePill.swift

import SwiftUI

/// Small pill showing a percent delta with directional arrow.
/// Green for non-negative, red for negative. Optional trailing label.
struct PercentChangePill: View {
    let percent: Double
    var trailingLabel: String? = nil
    var compact: Bool = false

    private var isUp: Bool { percent >= 0 }
    private var symbol: String { isUp ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill" }
    private var color: Color { isUp ? V3Colors.statusUp : V3Colors.statusDown }
    private var formatted: String {
        String(format: "%@%.2f%%", isUp ? "" : "", percent)
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol)
                .font(.system(size: compact ? 8 : 10, weight: .bold))
            Text(formatted)
                .font(compact ? V3Fonts.caption(11) : V3Fonts.bodyMedium(13))
            if let label = trailingLabel {
                Text(label)
                    .font(compact ? V3Fonts.caption(11) : V3Fonts.body(13))
                    .foregroundColor(V3Colors.textSecondary)
            }
        }
        .foregroundColor(color)
    }
}

#Preview {
    VStack(spacing: 12) {
        PercentChangePill(percent: 2.35, trailingLabel: "Today")
        PercentChangePill(percent: -1.23)
        PercentChangePill(percent: 0.74, compact: true)
    }
    .padding()
    .background(V3Colors.bgBase)
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Components/PercentChangePill.swift
git commit -m "feat(ios): PercentChangePill (▲/▼ delta with optional trailing label)"
```

---

## Task 4: BalanceHeader component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Components/BalanceHeader.swift`

Used by HomeViewV3. Reference image 2 left iPhone shows: `Total Balance` label + eye-off icon, big `$12,458.73`, then `▲ 2.35% Today` pill.

- [ ] **Step 1: Write the component**

```swift
// V3/Components/BalanceHeader.swift

import SwiftUI

struct BalanceHeader: View {
    let totalUSD: Double
    let percentChange: Double
    var hidden: Bool = false
    var onTogglePrivacy: () -> Void = {}

    private var formattedTotal: String {
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: totalUSD)) ?? "$0.00"
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                Text("Total Balance")
                    .font(V3Fonts.caption(13))
                    .foregroundColor(V3Colors.textSecondary)

                Button(action: onTogglePrivacy) {
                    Image(systemName: hidden ? "eye" : "eye.slash")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(V3Colors.textSecondary)
                }
                .buttonStyle(.plain)
            }

            Text(hidden ? "••••••" : formattedTotal)
                .font(V3Fonts.balance(36))
                .foregroundColor(V3Colors.textPrimary)
                .contentTransition(.numericText())
                .animation(V3Motion.base, value: totalUSD)

            PercentChangePill(percent: percentChange, trailingLabel: "Today")
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    VStack(spacing: 24) {
        BalanceHeader(totalUSD: 12458.73, percentChange: 2.35)
        BalanceHeader(totalUSD: 4921.18, percentChange: -1.23, hidden: true)
    }
    .padding()
    .background(V3Colors.bgBase)
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Components/BalanceHeader.swift
git commit -m "feat(ios): BalanceHeader (Total Balance + eye toggle + change pill)"
```

---

## Task 5: QuickActionButton component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Components/QuickActionButton.swift`

Reference: 4 circular gold-bordered buttons under the balance header (Send / Receive / Swap / Buy).

- [ ] **Step 1: Write the component**

```swift
// V3/Components/QuickActionButton.swift

import SwiftUI

struct QuickActionButton: View {
    let title: String
    let systemSymbol: String
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                        .frame(width: 56, height: 56)
                        .background(
                            Circle().fill(V3Colors.bgElevated)
                        )

                    Image(systemName: systemSymbol)
                        .font(.system(size: 22, weight: .regular))
                        .foregroundColor(V3Colors.goldPrimary)
                }
                .scaleEffect(isPressed ? 0.94 : 1.0)

                Text(title)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textPrimary)
            }
        }
        .buttonStyle(.plain)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in withAnimation(V3Motion.press) { isPressed = true } }
                .onEnded   { _ in withAnimation(V3Motion.press) { isPressed = false } }
        )
    }
}

#Preview {
    HStack(spacing: 24) {
        QuickActionButton(title: "Send",    systemSymbol: "arrow.up")    {}
        QuickActionButton(title: "Receive", systemSymbol: "arrow.down")  {}
        QuickActionButton(title: "Swap",    systemSymbol: "arrow.left.arrow.right") {}
        QuickActionButton(title: "Buy",     systemSymbol: "plus")        {}
    }
    .padding()
    .background(V3Colors.bgBase)
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Components/QuickActionButton.swift
git commit -m "feat(ios): QuickActionButton (gold-bordered circle + icon + label)"
```

---

## Task 6: AccountCard component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Components/AccountCard.swift`

Reference: rows showing `Main Wallet — $8,732.21 — 6 Assets` and `Savings — $3,726.52 — 3 Assets`. Each card includes a mini Celari logo on the left and a chevron on the right.

- [ ] **Step 1: Write the component**

```swift
// V3/Components/AccountCard.swift

import SwiftUI

struct AccountCard: View {
    let name: String
    let balanceUSD: Double
    let assetCount: Int
    var isActive: Bool = false
    let action: () -> Void

    private var formattedBalance: String {
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: balanceUSD)) ?? "$0.00"
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image("LogoMark")
                    .resizable()
                    .renderingMode(.original)
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(name)
                        .font(V3Fonts.bodyMedium(15))
                        .foregroundColor(V3Colors.textPrimary)
                    Text("\(assetCount) Asset\(assetCount == 1 ? "" : "s")")
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textSecondary)
                }

                Spacer()

                Text(formattedBalance)
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(V3Colors.textMuted)
            }
            .padding(16)
            .background(V3Colors.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                    .stroke(isActive ? V3Colors.goldPrimary : V3Colors.border,
                            lineWidth: isActive ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    VStack(spacing: 12) {
        AccountCard(name: "Main Wallet", balanceUSD: 8732.21, assetCount: 6, isActive: true) {}
        AccountCard(name: "Savings", balanceUSD: 3726.52, assetCount: 3) {}
    }
    .padding()
    .background(V3Colors.bgBase)
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Components/AccountCard.swift
git commit -m "feat(ios): AccountCard (logo + name + asset count + balance + chevron)"
```

---

## Task 7: AssetRow component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Components/AssetRow.swift`

Reference: token rows like `Ethereum / ETH / 2.738 ETH / $7,862.61 / ▲1.89%`.

- [ ] **Step 1: Write the component**

```swift
// V3/Components/AssetRow.swift

import SwiftUI

struct AssetRow: View {
    let name: String
    let symbol: String
    let amount: String           // e.g. "2.738"
    let amountUnit: String       // e.g. "ETH"
    let valueUSD: Double
    let percentChange: Double?
    let iconHex: String?         // "FF7700" or nil to show LogoMark fallback

    private var formattedValue: String {
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: valueUSD)) ?? "$0.00"
    }

    var body: some View {
        HStack(spacing: 12) {
            iconView
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                Text(symbol)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(amount) \(amountUnit)")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                HStack(spacing: 6) {
                    Text(formattedValue)
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textSecondary)
                    if let pct = percentChange {
                        PercentChangePill(percent: pct, compact: true)
                    }
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 4)
    }

    @ViewBuilder
    private var iconView: some View {
        if let hex = iconHex, !hex.isEmpty {
            Circle()
                .fill(Color(hex2: hex))
                .overlay(
                    Text(symbol.prefix(1).uppercased())
                        .font(V3Fonts.bodyMedium(15))
                        .foregroundColor(.white)
                )
        } else {
            Image("LogoMark").resizable().aspectRatio(contentMode: .fit)
        }
    }
}

#Preview {
    VStack(spacing: 0) {
        AssetRow(name: "Ethereum", symbol: "ETH", amount: "2.738", amountUnit: "ETH",
                 valueUSD: 7862.61, percentChange: 1.89, iconHex: "627EEA")
        AssetRow(name: "Bitcoin",  symbol: "BTC", amount: "0.215", amountUnit: "BTC",
                 valueUSD: 4407.68, percentChange: 0.74, iconHex: "F7931A")
        AssetRow(name: "Solana",   symbol: "SOL", amount: "12.36", amountUnit: "SOL",
                 valueUSD: 1187.21, percentChange: -1.23, iconHex: "9945FF")
    }
    .padding(.horizontal, 12)
    .background(V3Colors.bgBase)
}
```

Note: `Color(hex2:)` is defined in the V2 theme file (`CelariThemeV2.swift:91`). It's a global `Color` initializer extension and is safe to reuse across V3.

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Components/AssetRow.swift
git commit -m "feat(ios): AssetRow (token icon + name + amount + value + change)"
```

---

## Task 8: TransactionRow component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Components/TransactionRow.swift`

Used by `ActivityViewV3`. Layout: directional icon (sent / received) + token-amount + status caption + timestamp.

- [ ] **Step 1: Write the component**

```swift
// V3/Components/TransactionRow.swift

import SwiftUI

struct TransactionRow: View {
    enum Direction {
        case sent
        case received
    }

    let direction: Direction
    let amount: String           // "0.5 ETH"
    let counterparty: String     // truncated address or contact name
    let timestamp: Date
    let valueUSD: Double?

    private var symbol: String {
        direction == .sent ? "arrow.up.right" : "arrow.down.left"
    }
    private var amountColor: Color {
        direction == .sent ? V3Colors.textPrimary : V3Colors.statusUp
    }
    private var amountPrefix: String {
        direction == .sent ? "−" : "+"
    }
    private static let timeFmt: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()
    private var formattedValueUSD: String? {
        guard let v = valueUSD else { return nil }
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: v))
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(V3Colors.border, lineWidth: 1)
                    .frame(width: 36, height: 36)
                Image(systemName: symbol)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(direction == .sent ? V3Colors.textSecondary : V3Colors.statusUp)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(direction == .sent ? "Sent" : "Received")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                Text(counterparty)
                    .font(V3Fonts.caption(12))
                    .foregroundColor(V3Colors.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(amountPrefix)\(amount)")
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(amountColor)
                if let v = formattedValueUSD {
                    Text(v)
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textSecondary)
                } else {
                    Text(Self.timeFmt.localizedString(for: timestamp, relativeTo: Date()))
                        .font(V3Fonts.caption(12))
                        .foregroundColor(V3Colors.textMuted)
                }
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 4)
    }
}

#Preview {
    VStack(spacing: 0) {
        TransactionRow(
            direction: .sent, amount: "0.5 ETH",
            counterparty: "0x7a3f…8f2b",
            timestamp: Date().addingTimeInterval(-3600),
            valueUSD: 1432.18
        )
        TransactionRow(
            direction: .received, amount: "0.215 BTC",
            counterparty: "alex.celari",
            timestamp: Date().addingTimeInterval(-86400),
            valueUSD: nil
        )
    }
    .padding(.horizontal, 12)
    .background(V3Colors.bgBase)
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Components/TransactionRow.swift
git commit -m "feat(ios): TransactionRow (sent/received with timestamp + value)"
```

---

## Task 9: AmountInput component

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Components/AmountInput.swift`

Used by `SendViewV3` for the big numeric amount field. Reference shows `1.25` displayed huge (~40pt) with token chip on the right and `$3,583.42` USD subtotal below.

- [ ] **Step 1: Write the component**

```swift
// V3/Components/AmountInput.swift

import SwiftUI

struct AmountInput: View {
    @Binding var amount: String
    let tokenSymbol: String
    let usdSubtotal: Double?
    var onTokenPickerTap: () -> Void = {}

    private var formattedUSD: String? {
        guard let v = usdSubtotal else { return nil }
        let fmt = NumberFormatter()
        fmt.numberStyle = .currency
        fmt.currencyCode = "USD"
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: v))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("You send")
                .font(V3Fonts.caption(13))
                .foregroundColor(V3Colors.textSecondary)

            HStack(alignment: .firstTextBaseline) {
                TextField("0.00", text: $amount)
                    .keyboardType(.decimalPad)
                    .font(V3Fonts.balance(40))
                    .foregroundColor(V3Colors.textPrimary)
                    .textFieldStyle(.plain)

                Spacer()

                Button(action: onTokenPickerTap) {
                    HStack(spacing: 6) {
                        Image("LogoMark")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 18, height: 18)
                        Text(tokenSymbol)
                            .font(V3Fonts.bodyMedium(15))
                            .foregroundColor(V3Colors.textPrimary)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(V3Colors.textSecondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: V3Radius.pill, style: .continuous)
                            .fill(V3Colors.bgRaised)
                    )
                }
                .buttonStyle(.plain)
            }

            if let usd = formattedUSD {
                Text(usd)
                    .font(V3Fonts.caption(13))
                    .foregroundColor(V3Colors.textSecondary)
            }
        }
        .padding(20)
        .background(V3Colors.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                .stroke(V3Colors.border, lineWidth: 1)
        )
    }
}

#Preview {
    StatefulPreview { amt in
        AmountInput(
            amount: amt,
            tokenSymbol: "ETH",
            usdSubtotal: 3583.42
        )
        .padding()
        .background(V3Colors.bgBase)
    }
}

private struct StatefulPreview<V: View>: View {
    @State private var value = "1.25"
    let body: V

    init(@ViewBuilder content: (Binding<String>) -> V) {
        self.body = content(.constant("1.25"))
    }

    var bodyView: some View { body }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Components/AmountInput.swift
git commit -m "feat(ios): AmountInput (big numeric field + token picker chip + USD subtotal)"
```

---

## Task 10: LoadingViewV3

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/LoadingViewV3.swift`

A subtle pulsing logo while WalletStore initializes.

- [ ] **Step 1: Write the view**

```swift
// V3/Views/LoadingViewV3.swift

import SwiftUI

struct LoadingViewV3: View {
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            CelariLogoView(variant: .lockup, height: 80)
                .opacity(pulse ? 1.0 : 0.6)
                .scaleEffect(pulse ? 1.0 : 0.96)
                .animation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true), value: pulse)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
        .onAppear { pulse = true }
    }
}

#Preview { LoadingViewV3() }
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/LoadingViewV3.swift
git commit -m "feat(ios): LoadingViewV3 (lockup with subtle pulse animation)"
```

---

## Task 11: OnboardingViewV3

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/OnboardingViewV3.swift`

Reference (image 2 left iPhone): logo lockup at top, hero text "Your crypto.\nYour privacy.\nAlways.", three feature highlights (shield-lock / fingerprint / eye-off + one-line copy), gold "Get Started" PrimaryButton at bottom.

- [ ] **Step 1: Write the view**

```swift
// V3/Views/OnboardingViewV3.swift

import SwiftUI

struct OnboardingViewV3: View {
    @Environment(WalletStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            CelariLogoView(variant: .lockup, height: 56)
                .padding(.top, 12)

            Spacer().frame(height: 28)

            Text("Your crypto.\nYour privacy.\nAlways.")
                .font(V3Fonts.h1(36))
                .foregroundColor(V3Colors.textPrimary)
                .multilineTextAlignment(.center)
                .lineLimit(3)

            Spacer().frame(height: 32)

            VStack(spacing: 20) {
                feature(symbol: "shield.lefthalf.filled",
                        title: "Self-Custody",
                        body: "You have full control. Always.")
                feature(symbol: "faceid",
                        title: "Passkey Login",
                        body: "Secure access with your biometrics.")
                feature(symbol: "eye.slash",
                        title: "No Tracking",
                        body: "No analytics. Zero data collection.")
            }
            .padding(.horizontal, 32)

            Spacer()

            VStack(spacing: 12) {
                PrimaryButton(title: "Get Started") {
                    Task { await store.createNewWallet() }
                }
                SecondaryButton(title: "Restore account") {
                    store.screen = .restore
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
    }

    private func feature(symbol: String, title: String, body: String) -> some View {
        HStack(alignment: .center, spacing: 14) {
            ZStack {
                Circle()
                    .stroke(V3Colors.goldPrimary, lineWidth: 1)
                    .frame(width: 40, height: 40)
                Image(systemName: symbol)
                    .font(.system(size: 17, weight: .light))
                    .foregroundColor(V3Colors.goldPrimary)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(V3Fonts.bodyMedium(15))
                    .foregroundColor(V3Colors.textPrimary)
                Text(body)
                    .font(V3Fonts.caption(13))
                    .foregroundColor(V3Colors.textSecondary)
            }

            Spacer()
        }
    }
}
```

Note on `store.createNewWallet()` and `store.screen = .restore`: confirm these match `WalletStore`'s actual API. If `createNewWallet` doesn't exist, use whatever V2's `OnboardingViewV2` calls (read that file as a reference). If the screen-state assignment must go through a setter, use that instead. **This is the only place in Phase B where you must read a V2 file** (`V2/Views/OnboardingViewV2.swift`) to confirm the wallet-creation entry point.

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/OnboardingViewV3.swift
git commit -m "feat(ios): OnboardingViewV3 (logo + 3 features + Get Started + Restore)"
```

---

## Task 12: HomeViewV3

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/HomeViewV3.swift`

Reference image 2 left iPhone — the centerpiece. Sections (top to bottom):
- Header row: mini lockup (centered) + scan icon (right)
- BalanceHeader
- 4 QuickActionButtons (Send / Receive / Swap / Buy)
- Accounts card section with `+` button
- Assets card section with rows
- "View all assets" link at the bottom of the list

`HomeViewV3` is wrapped by a `NavigationStack` in `RootViewV3` (Task 18), so tapping a quick action pushes onto the stack via the `HomeRoute` enum.

- [ ] **Step 1: Write the view**

```swift
// V3/Views/HomeViewV3.swift

import SwiftUI

struct HomeViewV3: View {
    @Environment(WalletStore.self) private var store

    /// Path binding owned by RootViewV3; HomeViewV3 mutates it to push routes.
    @Binding var path: [HomeRoute]

    private var totalUSD: Double {
        store.tokens.compactMap(\.valueUSD).reduce(0, +)
    }

    private var topAssets: [Token] {
        Array(store.tokens.prefix(3))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                header
                BalanceHeader(totalUSD: totalUSD, percentChange: 0)
                quickActionsRow
                accountsSection
                assetsSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
    }

    private var header: some View {
        HStack {
            Color.clear.frame(width: 32, height: 32)   // left spacer for centering
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
                        assetCount: store.tokens.count,
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
                        amount: token.formattedAmount,
                        amountUnit: token.symbol,
                        valueUSD: token.valueUSD ?? 0,
                        percentChange: token.percentChange,
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
}
```

**Token / Account model assumptions:** Token is presumed to expose `name`, `symbol`, `formattedAmount`, `valueUSD`, `percentChange`, `color` (hex string). Account exposes `id` (Hashable) and `label`. **Open the model files (`Models/Token.swift` and the account model wherever it lives) before writing this view to confirm property names**; if any name differs (e.g. `amount` vs `formattedAmount`), update the references inline. Do NOT add new properties to the models in this task — Phase B is screen work, not model surgery. If a needed field doesn't exist, hardcode a placeholder for now and flag it as an open item in the commit message.

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/HomeViewV3.swift
git commit -m "feat(ios): HomeViewV3 (header + balance + quick actions + accounts + assets)"
```

---

## Task 13: SendViewV3

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/SendViewV3.swift`

Reference image 2 middle iPhone. Sections: ScreenHeader → AmountInput → To input + recents row → Network row → Estimated fee row → Summary card → Review Transaction CTA. Logic ports from `V2/Views/SendViewV2.swift`.

- [ ] **Step 1: Read V2 send for logic patterns**

```bash
cat ios/CelariWallet/CelariWallet/V2/Views/SendViewV2.swift | head -80
```

Note the `SendForm` model (probably referenced via `store.sendForm`), validation flow, and biometric gating call.

- [ ] **Step 2: Write `SendViewV3`**

```swift
// V3/Views/SendViewV3.swift

import SwiftUI

struct SendViewV3: View {
    @Environment(WalletStore.self) private var store
    @Environment(PXEBridge.self) private var pxeBridge
    @Environment(\.dismiss) private var dismiss

    @State private var amount: String = ""
    @State private var recipient: String = ""

    var body: some View {
        VStack(spacing: 0) {
            ScreenHeader(title: "Send")

            ScrollView {
                VStack(spacing: 16) {
                    AmountInput(
                        amount: $amount,
                        tokenSymbol: store.tokens.first?.symbol ?? "ETH",
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
                // Phase B uses store's send entrypoint; the actual proof / submit
                // happens in PXEBridge through paths the V2 SendView already exercises.
                // For Phase B we just route into the existing review/confirm flow.
                store.beginSendReview(amount: amount, recipient: recipient)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .background(V3Colors.bgBase)
        .navigationBarBackButtonHidden(true)
    }

    private var parsedAmountUSD: Double? {
        guard let v = Double(amount), let token = store.tokens.first else { return nil }
        return v * (token.priceUSD ?? 0)
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
                Text(store.networkName)
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
            summaryRow("You send",        value: "\(amount.isEmpty ? "0" : amount) \(store.tokens.first?.symbol ?? "ETH")")
            summaryRow("Estimated fee",   value: "$1.42")
            Divider().background(V3Colors.border)
            summaryRow("Total",           value: "$\(parsedAmountUSD.map { String(format: "%.2f", $0 + 1.42) } ?? "—")",
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
```

**Open items confirmed during Step 1**: the actual API calls (`store.beginSendReview`, `store.networkName`, `Token.priceUSD`) may not exist on `WalletStore` / `Token`. Pick the closest existing API while reading `SendViewV2.swift`. If a method doesn't exist, either:
1. Wire to whatever V2 calls (`store.sendForm.start()` etc.) — preserves behaviour.
2. Stub with `// MARK: - V3 ↦ Phase B+ — wire to real proof flow` and leave the Review Transaction button non-functional for now. Commit message must call out the stub.

The screen renders correctly in either case; functionality wiring is the open follow-up.

- [ ] **Step 3: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/SendViewV3.swift
git commit -m "feat(ios): SendViewV3 (amount + to + network + fee + summary + review CTA)"
```

---

## Task 14: ReceiveViewV3

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/ReceiveViewV3.swift`

Reference image 2 right iPhone. Sections: ScreenHeader → "Receive with Celari" card with QR (gold mark in center) → "Share address" outline button → Celari ID card (`@user.celari` + copy icon) → "Receive crypto" section header → 2 option rows (From another wallet / From exchange).

- [ ] **Step 1: Write the view**

```swift
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
                if let image = QRGenerator.image(from: address) {
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
                receiveOptionRow(symbol: "arrow.left.and.right.righttriangle.left.righttriangle.right",
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

/// Tiny QR helper. ReceiveViewV2 has a similar one — Phase C consolidates them.
private enum QRGenerator {
    static func image(from string: String) -> UIImage? {
        guard let data = string.data(using: .ascii),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let ci = filter.outputImage else { return nil }
        let scale = CGAffineTransform(scaleX: 8, y: 8)
        let scaled = ci.transformed(by: scale)
        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/ReceiveViewV3.swift
git commit -m "feat(ios): ReceiveViewV3 (QR + Celari ID + Share + receive options)"
```

---

## Task 15: AssetsViewV3

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/AssetsViewV3.swift`

Full token list. The Home tab shows top 3; this tab shows all.

- [ ] **Step 1: Write the view**

```swift
// V3/Views/AssetsViewV3.swift

import SwiftUI

struct AssetsViewV3: View {
    @Environment(WalletStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Assets")
                    .font(V3Fonts.h1(28))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
                Button {
                    store.screen = .addToken
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(V3Colors.goldPrimary)
                        .frame(width: 32, height: 32)
                        .background(Circle().stroke(V3Colors.goldPrimary, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            ScrollView {
                VStack(spacing: 0) {
                    ForEach(store.tokens, id: \.id) { token in
                        AssetRow(
                            name: token.name,
                            symbol: token.symbol,
                            amount: token.formattedAmount,
                            amountUnit: token.symbol,
                            valueUSD: token.valueUSD ?? 0,
                            percentChange: token.percentChange,
                            iconHex: token.color
                        )
                        Divider().background(V3Colors.border).padding(.horizontal, 16)
                    }
                }
            }
        }
        .background(V3Colors.bgBase)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/AssetsViewV3.swift
git commit -m "feat(ios): AssetsViewV3 (full token list, V3-styled rows)"
```

---

## Task 16: ActivityViewV3

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/ActivityViewV3.swift`

- [ ] **Step 1: Write the view**

```swift
// V3/Views/ActivityViewV3.swift

import SwiftUI

struct ActivityViewV3: View {
    @Environment(WalletStore.self) private var store

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Activity")
                    .font(V3Fonts.h1(28))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            if store.activities.isEmpty {
                empty
            } else {
                list
            }
        }
        .background(V3Colors.bgBase)
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(store.activities, id: \.id) { activity in
                    TransactionRow(
                        direction: activity.kind == .send ? .sent : .received,
                        amount: activity.amountString,
                        counterparty: activity.counterpartyDisplay,
                        timestamp: activity.timestamp,
                        valueUSD: nil
                    )
                    Divider().background(V3Colors.border).padding(.horizontal, 16)
                }
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "clock.arrow.circlepath")
                .font(.system(size: 36, weight: .light))
                .foregroundColor(V3Colors.textMuted)
            Text("No activity yet")
                .font(V3Fonts.bodyMedium(15))
                .foregroundColor(V3Colors.textPrimary)
            Text("Your transactions will appear here.")
                .font(V3Fonts.caption(13))
                .foregroundColor(V3Colors.textSecondary)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
```

The exact `Activity` model fields (`kind`, `amountString`, `counterpartyDisplay`, `timestamp`) need confirmation against `Models/Activity.swift`. Adjust to match real property names; the structure of `ActivityViewV3.list` can stay.

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/ActivityViewV3.swift
git commit -m "feat(ios): ActivityViewV3 (transaction list + empty state)"
```

---

## Task 17: DiscoverViewV3 (improved placeholder)

**Files:**
- Create: `ios/CelariWallet/CelariWallet/V3/Views/DiscoverViewV3.swift`

Phase B doesn't ship a real Discover (dApp browser is its own future plan), but the placeholder gets a meaningful teaser instead of bare "Coming soon".

- [ ] **Step 1: Write the view**

```swift
// V3/Views/DiscoverViewV3.swift

import SwiftUI

struct DiscoverViewV3: View {
    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Discover")
                    .font(V3Fonts.h1(28))
                    .foregroundColor(V3Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)

            Spacer()

            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .stroke(V3Colors.goldPrimary, lineWidth: 1.5)
                        .frame(width: 88, height: 88)
                    Image(systemName: "safari")
                        .font(.system(size: 36, weight: .light))
                        .foregroundColor(V3Colors.goldPrimary)
                }

                Text("dApps, curated.")
                    .font(V3Fonts.h2(24))
                    .foregroundColor(V3Colors.textPrimary)

                Text("Privacy-first dApps, bridges, and on-chain services. Coming soon.")
                    .font(V3Fonts.body(15))
                    .foregroundColor(V3Colors.textSecondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(V3Colors.bgBase)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/DiscoverViewV3.swift
git commit -m "feat(ios): DiscoverViewV3 (gold orbit + dApps tagline placeholder)"
```

---

## Task 18: SettingsViewV3 (full)

**Files:**
- Modify: `ios/CelariWallet/CelariWallet/V3/RootViewV3.swift` — split out `SettingsViewV3` into its own file
- Create: `ios/CelariWallet/CelariWallet/V3/Views/SettingsViewV3.swift`

The minimal Appearance picker from Phase A becomes a full settings screen with Profile / Appearance / Security / Network / About sections.

- [ ] **Step 1: Move + expand `SettingsViewV3`**

Delete the existing `struct SettingsViewV3` block from `RootViewV3.swift`. Create `V3/Views/SettingsViewV3.swift`:

```swift
// V3/Views/SettingsViewV3.swift

import SwiftUI

struct SettingsViewV3: View {
    @Environment(WalletStore.self) private var store
    @AppStorage("themePreference") private var themePreferenceRaw: String = "system"

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                profileHeader
                appearanceSection
                securitySection
                networkSection
                aboutSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 32)
        }
        .background(V3Colors.bgBase)
    }

    private var profileHeader: some View {
        HStack(spacing: 12) {
            Image("LogoMark")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 48, height: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(celariID)
                    .font(V3Fonts.bodyMedium(16))
                    .foregroundColor(V3Colors.textPrimary)
                Text(store.activeAccount?.address ?? "")
                    .font(V3Fonts.caption(11))
                    .foregroundColor(V3Colors.textSecondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
        }
        .padding(.vertical, 8)
    }

    private var celariID: String {
        guard let addr = store.activeAccount?.address else { return "@user.celari" }
        let prefix = String(addr.dropFirst(2).prefix(6)).lowercased()
        return "@\(prefix).celari"
    }

    private var appearanceSection: some View {
        sectionCard(title: "APPEARANCE") {
            Picker("Appearance", selection: $themePreferenceRaw) {
                Text("System").tag("system")
                Text("Dark").tag("dark")
                Text("Light").tag("light")
            }
            .pickerStyle(.segmented)
        }
    }

    private var securitySection: some View {
        sectionCard(title: "SECURITY") {
            VStack(spacing: 0) {
                row("Face ID", trailing: { Toggle("", isOn: .constant(true)).labelsHidden() })
                row("Change passcode")
                row("Guardian setup", action: { store.screen = .guardianSetup })
            }
        }
    }

    private var networkSection: some View {
        sectionCard(title: "NETWORK") {
            VStack(spacing: 0) {
                row("Network", trailing: { Text(store.networkName).font(V3Fonts.body(14)).foregroundColor(V3Colors.textSecondary) })
                row("Manage networks")
            }
        }
    }

    private var aboutSection: some View {
        sectionCard(title: "ABOUT") {
            VStack(spacing: 0) {
                row("Version", trailing: { Text("0.5.0").font(V3Fonts.body(14)).foregroundColor(V3Colors.textSecondary) })
                row("Terms")
                row("Privacy")
            }
        }
    }

    @ViewBuilder
    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(V3Fonts.caption(11))
                .tracking(1.2)
                .foregroundColor(V3Colors.textSecondary)
                .padding(.horizontal, 4)

            content()
                .padding(16)
                .background(V3Colors.bgElevated)
                .clipShape(RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: V3Radius.card, style: .continuous)
                        .stroke(V3Colors.border, lineWidth: 1)
                )
        }
    }

    @ViewBuilder
    private func row<Trailing: View>(
        _ title: String,
        action: (() -> Void)? = nil,
        @ViewBuilder trailing: () -> Trailing = { EmptyView() }
    ) -> some View {
        let content = HStack {
            Text(title)
                .font(V3Fonts.body(15))
                .foregroundColor(V3Colors.textPrimary)
            Spacer()
            trailing()
            if action != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(V3Colors.textMuted)
                    .padding(.leading, 6)
            }
        }
        .padding(.vertical, 12)

        if let action {
            Button(action: action) { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}
```

- [ ] **Step 2: Remove `struct SettingsViewV3` from RootViewV3**

Edit `V3/RootViewV3.swift`. Delete the entire `struct SettingsViewV3 { … }` block (and its `@AppStorage` property). The `case .settings: SettingsViewV3()` reference still resolves because the new file lives in the same target.

- [ ] **Step 3: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/Views/SettingsViewV3.swift \
        ios/CelariWallet/CelariWallet/V3/RootViewV3.swift
git commit -m "feat(ios): SettingsViewV3 — Profile + Appearance + Security + Network + About"
```

---

## Task 19: Wire RootViewV3 to real V3 views with NavigationStack

**Files:**
- Modify: `ios/CelariWallet/CelariWallet/V3/RootViewV3.swift`

Replace the placeholder content of every tab with the real V3 view. Wrap the Home tab in a `NavigationStack` with `.navigationDestination(for: HomeRoute.self)` for Send / Receive / Swap / Buy. Replace the V2 routing for `loading` and `onboarding` states with the new V3 views.

- [ ] **Step 1: Update `RootViewV3.swift`**

Read the current file with the Read tool (the existing version routes `.loading` to `LoadingView()` (V1) and `.onboarding` to `OnboardingViewV2()`). Edit:

1. Replace `LoadingView()` with `LoadingViewV3()` in the `.loading` arm.
2. Replace `OnboardingViewV2()` with `OnboardingViewV3()` in the `.onboarding` arm.
3. Add `@State private var homePath: [HomeRoute] = []` to `RootViewV3`.
4. In `dashboardShell`, replace:
   ```swift
   case .home:
       ComingSoonPlaceholder(title: "Home", subtitle: "...", systemSymbol: "house")
   ```
   with:
   ```swift
   case .home:
       NavigationStack(path: $homePath) {
           HomeViewV3(path: $homePath)
               .navigationDestination(for: HomeRoute.self) { route in
                   switch route {
                   case .send:    SendViewV3()
                   case .receive: ReceiveViewV3()
                   case .swap:    ComingSoonPlaceholder(title: "Swap is coming soon",
                                                        subtitle: "Trade assets privately, without giving up control.",
                                                        systemSymbol: "arrow.left.arrow.right")
                   case .buy:     ComingSoonPlaceholder(title: "Buy is coming soon",
                                                        subtitle: "On-ramp partners, integrated for privacy.",
                                                        systemSymbol: "plus")
                   }
               }
       }
   ```
5. Replace the placeholder `case .assets`, `.activity`, `.discover`, `.settings` arms with `AssetsViewV3()`, `ActivityViewV3()`, `DiscoverViewV3()`, `SettingsViewV3()`.

After edits the `dashboardShell` body should look like:

```swift
private var dashboardShell: some View {
    VStack(spacing: 0) {
        Group {
            switch activeTab {
            case .home:
                NavigationStack(path: $homePath) {
                    HomeViewV3(path: $homePath)
                        .navigationDestination(for: HomeRoute.self) { route in
                            switch route {
                            case .send:    SendViewV3()
                            case .receive: ReceiveViewV3()
                            case .swap:    ComingSoonPlaceholder(title: "Swap is coming soon",
                                                                 subtitle: "Trade assets privately, without giving up control.",
                                                                 systemSymbol: "arrow.left.arrow.right")
                            case .buy:     ComingSoonPlaceholder(title: "Buy is coming soon",
                                                                 subtitle: "On-ramp partners, integrated for privacy.",
                                                                 systemSymbol: "plus")
                            }
                        }
                }
            case .assets:   AssetsViewV3()
            case .activity: ActivityViewV3()
            case .discover: DiscoverViewV3()
            case .settings: SettingsViewV3()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)

        TabBarV3(activeTab: $activeTab)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add ios/CelariWallet/CelariWallet/V3/RootViewV3.swift
git commit -m "feat(ios): RootViewV3 wires real V3 views + NavigationStack for Home tab"
```

---

## Task 20: Build + simulator visual verification

**Files:** none modified.

- [ ] **Step 1: Build**

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/CelariWallet-*
xcodebuild -project ios/CelariWallet/CelariWallet.xcodeproj \
  -scheme CelariWallet -configuration Debug \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro" \
  build 2>&1 | tail -10
```
Expected: `** BUILD SUCCEEDED **`. If errors mention V3 files, fix them inline (most common: `Token` / `Account` / `Activity` property name mismatches per the open-items notes in Tasks 12, 13, 16).

- [ ] **Step 2: Boot simulator + install + launch**

```bash
SIM_ID=$(xcrun simctl list devices available | grep "iPhone 17 Pro " | head -1 | awk -F'[()]' '{print $2}')
xcrun simctl boot "$SIM_ID" 2>/dev/null
open -a Simulator

xcodebuild -project ios/CelariWallet/CelariWallet.xcodeproj \
  -scheme CelariWallet -configuration Debug \
  -destination "id=$SIM_ID" \
  -derivedDataPath /tmp/celari-v3-build build 2>&1 | tail -3

xcrun simctl install "$SIM_ID" /tmp/celari-v3-build/Build/Products/Debug-iphonesimulator/CelariWallet.app
xcrun simctl launch "$SIM_ID" com.celari.wallet
sleep 3
```

- [ ] **Step 3: Capture screenshots**

```bash
mkdir -p branding/exports/ios-screenshots/phase-b
xcrun simctl ui "$SIM_ID" appearance dark
sleep 1
xcrun simctl io "$SIM_ID" screenshot branding/exports/ios-screenshots/phase-b/home-dark.png
xcrun simctl ui "$SIM_ID" appearance light
sleep 1
xcrun simctl io "$SIM_ID" screenshot branding/exports/ios-screenshots/phase-b/home-light.png
```

- [ ] **Step 4: Visual sanity check**

Open both screenshots. Confirm:
- Home tab shows balance + 4 quick action circles + Accounts cards + Assets list — not a `ComingSoonPlaceholder`.
- TabBarV3 still rendering correctly with gold active indicator.
- Theme switches between dark and light without the layout breaking.

If any tab still shows a placeholder, the wiring in Task 19 didn't take — re-check `RootViewV3.swift`.

- [ ] **Step 5: Commit screenshots**

```bash
git add branding/exports/ios-screenshots/phase-b/
git commit -m "chore(ios): Phase B Home screen screenshots — dark + light"
```

---

## Task 21: Mark Phase B complete in spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-celari-rebrand-design.md`

- [ ] **Step 1: Edit Implementation Status**

Replace the `Phase B` line:

```markdown
  - [ ] Phase B — V3 Screens (plan to be written) — rebuild `HomeViewV3` / `SendViewV3` / `ReceiveViewV3` / `AssetsViewV3` / `ActivityViewV3` / `SettingsViewV3` / `OnboardingViewV3` matching reference mockups; replace placeholder tabs.
```

with:

```markdown
  - [x] Phase B — V3 Screens (plan: `2026-04-25-ios-v3-screens.md`, branch: `feat/ios-v3-screens`) — 8 reusable components (BalanceHeader / QuickActionButton / AccountCard / AssetRow / TransactionRow / ScreenHeader / PercentChangePill / AmountInput) and 9 view files (HomeViewV3 / SendViewV3 / ReceiveViewV3 / AssetsViewV3 / ActivityViewV3 / DiscoverViewV3 / OnboardingViewV3 / LoadingViewV3 + SettingsViewV3 expanded). RootViewV3 wires Home tab to a NavigationStack with HomeRoute enum so Send / Receive push from quick actions; Swap and Buy remain ComingSoonPlaceholder until on-chain support lands. V1/V2 view trees intact for now.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-celari-rebrand-design.md
git commit -m "docs(rebrand): mark iOS Phase B (V3 Screens) complete"
```

---

## Success Criteria

1. `xcodebuild … build` produces `** BUILD SUCCEEDED **`.
2. App launches in simulator. Home tab shows real content (balance + quick actions + accounts + assets), not a ComingSoonPlaceholder.
3. Tapping the Send quick action pushes `SendViewV3` (back arrow at the top, "Send" centered title).
4. Tapping the Receive quick action pushes `ReceiveViewV3` with QR + Celari ID.
5. Assets / Activity / Discover / Settings tabs render real V3 views.
6. Theme switching (System / Dark / Light) still works via Settings → Appearance.
7. `git log main..HEAD` shows 17–20 commits, each scoped to one component or screen.

## Known deferred items (Phase B+ or later)

- **Send / Receive on-chain wiring**: views render and route data through `WalletStore`, but the actual proof submission flow may still call into V2 helpers or be stubbed. Confirm with `SendViewV2.swift` what `store` API to bind to. Full wiring belongs to a separate "Send / Receive flow polish" plan.
- **NFTs in Assets tab**: `AssetsViewV3` shows tokens only. NFTs (existing `NftListView`) are not folded in; Phase C decision.
- **Discover real content**: dApp browser is its own future plan.
- **Activity polish**: `TransactionRow` doesn't yet handle private transfer / shield / unshield variants — only sent / received. V2 has richer state. Folded into a follow-up.
- **iOS 18 themed AppIcon variants** still deferred (single universal icon).
- **V1 + V2 cleanup**: Phase C — delete after V3 is feature-complete.
- **Restore / Recovery / Backup / AddAccount / GuardianSetup** still route to V2 views from `RootViewV3`. Phase C or a dedicated "V3 wallet management flows" plan rebuilds them.
