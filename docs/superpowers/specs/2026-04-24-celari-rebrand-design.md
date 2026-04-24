# Celari Rebrand — Design Spec

**Date:** 2026-04-24
**Status:** Draft (pending user review)
**Scope:** Full visual rebrand (logo + tokens + layout adaptation) across brand system, iOS app, website, and Chrome extension. Placeholder UI for mockup features not yet implemented (Swap/Discover/Buy/Celari ID).

---

## 1. Goals

- Replace existing logo and visual language with the new gold + deep-black "C + leaf" identity shown in provided reference mockups.
- Establish a single source-of-truth for design tokens that feeds all three platforms.
- Adapt iOS, website, and extension layouts to match reference mockups — including scaffolding for currently-unbuilt UI (Swap tab, Discover tab, Buy action, multi-account selector, Celari ID display).
- Ship dark + light themes. Dark is default.
- Preserve all existing wallet functionality; no behavior regressions.

## 2. Non-Goals

- Building real functionality behind placeholder UIs (Buy flow backend, Discover dApp browser, Swap execution, Celari ID namespace). These remain in later roadmap phases.
- Light theme for currently unbuilt features — placeholders stay dark-primary.
- Refactoring unrelated code paths or architecture.
- Replacing third-party icon libraries end-to-end — brand-critical icons are custom, functional icons use libraries (Lucide web/ext, SF Symbols iOS).

## 3. Key Decisions (captured from brainstorming)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Pencil scope | Brand system + all screen mockups | Pixel-perfect reference for implementation |
| 2 | Logo source | Draw new logo as vector in Pencil | Clean source, all export sizes remain crisp |
| 3 | Rebrand depth | Visual + layout adaptation + placeholders for missing UI | Matches mockup visually without expanding feature scope |
| 4 | Platform order | Brand → iOS → Website → Extension | iOS is primary product and largest surface |
| 5 | Themes | Dark (default) + Light | Light variant already present in reference app icon |
| 6 | Motion | Subtle premium (150–250ms, ease-out, minimal spring) | Matches privacy-first, non-flashy tone |
| 7 | Icons | Hybrid: brand-critical custom, functional from libraries | Quality where it matters, pragmatic elsewhere |
| 8 | Token pipeline | `tokens.json` source + build scripts → per-platform outputs | Single source of truth without Style Dictionary overhead |

## 4. Design Tokens

### 4.1 Colors — Dark (default)

```
bg/base         #0A0A0B      canvas/body
bg/elevated     #141416      card, panel
bg/raised       #1C1C1F      nested panel, input
border/subtle   #26262A      hairline, separator

gold/primary    #D4A853      brand tone — wordmark, CTA, icons
gold/soft       #B8924A      hover/pressed
gold/glow       #E8C878      gradient highlight

text/primary    #FFFFFF
text/secondary  #A8A8B0
text/muted      #6B6B73

status/up       #34D399
status/down     #F87171
```

### 4.2 Colors — Light

```
bg/base         #F7F6F1      warm off-white
bg/elevated     #FFFFFF
bg/raised       #ECEBE5
border/subtle   #E0DFD9

gold/primary    #D4A853      (shared)
gold/soft       #B8924A      (shared)
gold/deep       #8A6F38      legible gold on light — wordmark, icons

text/primary    #0A0A0B
text/secondary  #525258
text/muted      #8A8A92

status/up       #059669
status/down     #DC2626

logo/mono-dark  #141416      black C+leaf on light (matches white app icon variant)
```

### 4.3 Typography

- **Wordmark** — `Outfit Light` (weight 300), letter-spacing `0.3em` (very wide tracking, per reference). `Outfit Thin` (weight 100) also bundled for extra-large lockups where the thinner cut reads better.
- **UI body (web/extension)** — `Inter` at weights 400/500/600.
- **iOS body** — SF Pro (system default); wordmark uses bundled `Outfit-Light.ttf` + wide tracking. Inter also bundled for cross-platform parity where SF Pro isn't ideal.

### 4.4 Geometry

- Corner radius: card `16pt`, button `12pt`, chip/badge `8pt`, app icon `22%` (iOS standard).
- Shadow/glow: only on CTAs and logo — `0 0 40px rgba(212, 168, 83, 0.12)` in dark, `0 0 24px rgba(212, 168, 83, 0.18)` on light.
- Borders: `1px` hairline using `border/subtle`.

### 4.5 Motion

- Default duration: `200ms`.
- Fast: `150ms` (button press, small state changes).
- Slow: `300ms` (modal, page transitions).
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard curve).
- Press feedback: `scale 0.97` + gold glow fade-in.
- List entry: `fade + translateY(8px)`, stagger `40ms`.
- Logo entry: mark fade first, leaf fade second (200ms offset).
- Number transitions: digit counter, 300ms ease-out.

## 5. Token Pipeline (Brand System Foundation)

### 5.1 Directory layout

```
design-tokens/
  tokens.json           # W3C DTCG source of truth
  build.mjs             # generates all platform outputs; run via root npm script
  README.md
  # dependencies (none beyond Node stdlib) — consumed by root package.json's "tokens" script

branding/
  celari-brand-system.pen       # Pencil master document
  exports/                      # Pencil → SVG/PNG exports
    logo-mark.svg
    logo-mark-mono-dark.svg
    logo-mark-mono-light.svg
    logo-lockup.svg
    logo-lockup-mono-dark.svg
    wordmark.svg
    app-icon-dark-1024.png
    app-icon-light-1024.png
    favicon-source.svg
    hero-phone-home.png         # used by website Hero
    icons/
      feature-shield-lock.svg
      feature-fingerprint.svg
      feature-eye-off.svg
      feature-zero-trace.svg
      action-send.svg
      action-receive.svg
      action-swap.svg
      action-buy.svg
  scripts/
    generate-logo-variants.mjs    # Sharp: app icon → 1024/180/120/80/60/40/29/20
    generate-favicon.mjs          # Sharp: favicon → 512/192/48/32/16 + .ico
    generate-extension-icons.mjs  # 16/32/48/128 PNG
    generate-og.mjs               # OG image 1200×630
    copy-to-extension.mjs         # manifest-targeted icon copy

backup-before-fixes/branding-v1/  # old assets preserved before migration
```

### 5.2 Build outputs

1. `website/src/styles/tokens.css` — CSS custom properties, `:root` (dark) + `[data-theme="light"]`.
2. `extension/public/styles/tokens.css` — same format.
3. `ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift` — `Color` extensions with dark/light dynamic colors.
4. `ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/` — per-color `.colorset` with Any Appearance + Dark Appearance.
5. `branding/exports/tokens-preview.html` — standalone visual check page.

### 5.3 Root `package.json` scripts

```
"tokens": "node design-tokens/build.mjs"
"brand:export": "npm run tokens && node branding/scripts/generate-logo-variants.mjs && node branding/scripts/generate-favicon.mjs && node branding/scripts/generate-extension-icons.mjs && node branding/scripts/generate-og.mjs && node branding/scripts/copy-to-extension.mjs"
```

### 5.4 `tokens.json` shape (excerpt)

```json
{
  "color": {
    "bg": {
      "base":     { "$dark": "#0A0A0B", "$light": "#F7F6F1" },
      "elevated": { "$dark": "#141416", "$light": "#FFFFFF" }
    },
    "gold": {
      "primary": { "$value": "#D4A853" },
      "soft":    { "$value": "#B8924A" }
    }
  },
  "radius": { "card": "16px", "button": "12px", "chip": "8px" },
  "motion": {
    "duration": { "fast": "150ms", "base": "200ms", "slow": "300ms" },
    "easing":   { "standard": "cubic-bezier(0.4, 0, 0.2, 1)" }
  },
  "font": {
    "family": {
      "wordmark": "Outfit, system-ui, sans-serif",
      "body":     "Inter, system-ui, sans-serif"
    }
  }
}
```

### 5.5 Migration safety

- Existing `branding/celari-logo-*.png`, `logo/celari_*.png` → moved to `backup-before-fixes/branding-v1/` before new assets overwrite.
- `Resources/Generated/` added to `.gitignore` with CI step to run `npm run tokens` before build.
- Old Asset Catalog colors not deleted until all iOS views migrated and build passes.

## 6. Pencil Document Structure

> **Status (2026-04-24):** Deferred. Pencil MCP was unreachable during Brand System Foundation implementation, so logo and icon masters were authored directly as hand-coded SVG under `branding/exports/`. The structure below describes the intended master document if Pencil becomes available later — see Implementation Status at the bottom of this spec. The iOS / Website / Extension rebrand plans reference SVG exports, not the `.pen`, so nothing downstream depends on this document.

Single file: `branding/celari-brand-system.pen`, 4 pages.

**Page 1 — Brand System Foundation**
- Logo lockup hero (center): gold "C + leaf" mark + `CELARI` wordmark + `PRIVACY FIRST WALLET` tagline.
- Logo variants grid: Symbol / Wordmark / Lockup / App Icon Dark / App Icon Light.
- Color swatches: full dark + light palette rows with hex labels.
- Typography specimen: wordmark (Outfit Light), Inter sample (H1 / H2 / body / caption).
- Feature icons row: shield-lock / fingerprint / eye-off / zero-trace.
- Quick action icons row: send / receive / swap / buy.
- Tab bar icons row: home / assets / activity / discover / settings.

**Page 2 — iOS Screens** (iPhone 14 Pro frames, 390×844)
- Onboarding (logo hero + CTA + three feature highlights)
- Home / Dashboard (reference mockup 1:1)
- Send (reference mockup 1:1)
- Receive (reference mockup 1:1, with Celari ID display)
- Swap placeholder ("Coming soon" state in brand style)
- Discover placeholder (same component pattern)
- Settings (existing structure, new theme, Appearance section visible)
- Tab bar detail (5 tabs enlarged)

**Page 3 — Website** (desktop 1440 width)
- Landing hero (reference mockup 1:1)
- Features strip (4 pillars)
- Privacy section: "Built for a private financial future"
- Footer (minimal, logo + links)

**Page 4 — Extension**
- Popup unlocked (360×600): compact balance + quick actions + top assets
- Popup locked (passkey prompt with logo hero)
- Onboarding (create / restore)
- Sidepanel (400×700): full dashboard analogue
- Settings modal

Each frame has a title label and one-line purpose note.

## 7. iOS Rebrand Plan

### 7.1 File structure additions

```
ios/CelariWallet/CelariWallet/
  Resources/
    Generated/Tokens.swift        # auto-generated
    Fonts/
      Outfit-Light.ttf
      Outfit-Thin.ttf
      Inter-Regular.ttf
      Inter-Medium.ttf
      Inter-SemiBold.ttf
  Theme/
    CelariTheme.swift             # token accessors
    ViewModifiers.swift           # .celariCard(), .celariButton(style:), .goldGlow()
    MotionPresets.swift           # Animation.celariFast/.celariBase/.celariSlow
  Components/
    PrimaryButton.swift
    SecondaryButton.swift
    QuickActionButton.swift
    AssetRow.swift
    AccountCard.swift
    CelariLogoView.swift
    BalanceHeader.swift
    ComingSoonPlaceholder.swift
```

### 7.2 RootView restructure

- `TabView` with 5 tabs (custom appearance, gold tint):
  1. **Home** — rebuilt `DashboardView`
  2. **Assets** — merged `TokenListView` + `NftListView`
  3. **Activity** — rethemed `ActivityListView`
  4. **Discover** — `ComingSoonPlaceholder` with dApp browser preview illustration
  5. **Settings** — rebuilt with Appearance section

### 7.3 Screen migration plan

| # | View | Action |
|---|---|---|
| 1 | OnboardingView | Rebuild: logo hero + single "Get Started" CTA + three feature highlights |
| 2 | DashboardView | Rebuild: BalanceHeader + Quick actions row + AccountSelector + AssetList |
| 3 | SendView | Rebuild: 5-section layout matching mockup (amount, to, network, fee, summary) |
| 4 | ReceiveView | Rebuild: Celari logo header + QR with center logo + Share + Celari ID + Receive options |
| 5 | Tab bar | New: custom TabView appearance, gold accent |
| 6 | SettingsView | Rebuild: sectioned list + Appearance (System/Dark/Light) + existing items retheme |
| 7 | Swap / Discover / Buy | Placeholder: `ComingSoonPlaceholder` component |
| 8 | ConfirmTxView, WcApproveView | Retheme |
| 9 | BackupView, RestoreView | Retheme |
| 10 | Recovery/GuardianSetupView, RecoverAccountView | Retheme |
| 11 | NftDetailView, AddTokenView, AddAccountView, AddNftContractView | Retheme |
| 12 | LoadingView | Rebuild: logo + subtle pulse animation |

### 7.4 Celari ID placeholder

- Receive screen displays `@<first-6-hex>.celari` derived deterministically from the user's wallet address.
- Info icon on the row with tooltip: "Celari ID names coming soon" (links nowhere in this scope).
- No network calls, no namespace resolution. Real namespace work belongs to a later spec.

### 7.5 Theme management

- `@AppStorage("themePreference")` with values `"system"` (default) / `"dark"` / `"light"`.
- `CelariWalletApp` top-level `.preferredColorScheme()` derived from the pref.
- Settings → Appearance → 3-option picker.

### 7.6 AppIcon + Fonts

- `Assets.xcassets/AppIcon.appiconset` replaced with `app-icon-dark-1024.png` (gold-on-dark variant) from `branding/exports/`.
- Existing `AppIcon.png` moved to `backup-before-fixes/branding-v1/`.
- `Info.plist` `UIAppFonts` updated with Outfit + Inter files; `project.yml` for xcodegen updated to include `Resources/Fonts/`.

### 7.7 Color migration

- Existing views likely use hard-coded `Color.black`, `Color.white`, `Color(.systemBackground)` etc.
- One sweep per view during its migration: replace hard-coded colors with `Color.celariBgBase`, `Color.celariTextPrimary` etc. from `Tokens.swift`.
- Unused/legacy Asset Catalog colors removed after all views migrated.

## 8. Website Rebrand Plan

### 8.1 Token integration

- `website/src/styles/tokens.css` (auto-generated) imported into `globals.css`.
- `tailwind.config.ts` updated: `colors.gold.*`, `colors.bg.*`, `borderRadius`, `fontFamily` reference `var(--token-*)`.
- `next/font` imports Outfit and Inter in `layout.tsx`.

### 8.2 Component plan

| Component | Action |
|---|---|
| Logo.tsx | Rebuild — SVG import, `variant` prop (mark / lockup / wordmark) |
| Header.tsx | Rebuild — nav + Download CTA + ThemeToggle + LanguageSwitcher |
| Hero.tsx | Rebuild — split-color headline + subtitle + Download iOS/Android CTAs + shield badge + right-side PhoneMockup + RadialRings |
| Features.tsx | Rebuild — 4-pillar strip, outline icons, compact copy |
| PrivacySection.tsx | **New** — "Built for a private financial future" layout |
| HowItWorks.tsx | Retheme |
| Roadmap.tsx | Retheme |
| AztecSection.tsx | Retheme |
| WaitlistCTA.tsx | Retheme (kept for email capture; Hero has Download CTAs instead) |
| Footer.tsx | Rebuild — logo + 3 columns + social + copyright |
| DecoElements.tsx | Rebuild — gold radial rings, subtle rotation animation |
| ScrollAnimation.tsx | Keep, retheme |
| LanguageSwitcher.tsx | Retheme |
| bridge/* | Retheme (content unchanged) |

### 8.3 New components

- `ThemeToggle.tsx` — System/Dark/Light, `<html data-theme>` + localStorage.
- `PhoneMockup.tsx` — iPhone frame with Home screenshot overlay and gold glow.
- `RadialRings.tsx` — 3–4 concentric gold rings with light parallax.

### 8.4 Layout & metadata

- `layout.tsx` — `<html data-theme>`, `prefers-color-scheme` matcher, fonts loaded, updated `<title>` / description / OG meta.
- `public/og-dark.png` regenerated via `branding/scripts/generate-og.mjs`.
- `public/favicon.png` + `favicon.ico` + `apple-touch-icon.png` regenerated.

### 8.5 i18n

- Existing `messages/` translations preserved.
- New copy keys (`hero.headline`, `hero.subtitle`, `privacy.title`, etc.) added.
- English + Turkish mandatory; other locales fall back to English (non-blocking).

### 8.6 Performance

- Fonts: `display: swap` + preload.
- Logo SVG inlined (no extra request).
- Hero image via `next/image` with `priority`.
- Target: Lighthouse score equals or exceeds current baseline.

## 9. Extension Rebrand Plan

### 9.1 Token integration

- `extension/public/styles/tokens.css` (auto-generated) linked from `popup.html` and `sidepanel.html`.
- Existing stylesheets rewritten on top of tokens (or superseded by `celari-theme.css`; existing CSS deprecated).
- Fonts: subset Outfit + Inter placed in `extension/public/fonts/`.

### 9.2 manifest.json

- `icons` (16/32/48/128) replaced via `branding/scripts/copy-to-extension.mjs`.
- `action.default_icon` uses the same set.
- `name` / `description` unchanged (visual rebrand only).

### 9.3 popup.html (rebuild)

- Header: mini Celari logo + settings/menu icon.
- Balance: compact `$12,458.73` + small percent-change pill.
- Quick actions row (Send / Receive / Swap / Buy).
- Top 3–5 assets with "View all" CTA.
- Footer bar: lock status / Face ID / connection badge.

### 9.4 Locked state

- Logo hero + "Unlock with passkey" CTA. Lock logic untouched.

### 9.5 sidepanel.html

- Full dashboard analogue at 400×700: balance + quick actions + account cards + full assets + activity preview.

### 9.6 Onboarding / settings modal

- Single-page: Logo + "Create account" / "Restore" + passkey prompt.
- Settings modal: Network / Appearance toggle / About / Disconnect.

### 9.7 JS bundle reconciliation

- `extension/public/src/pages/popup.js` framework (vanilla / React / Svelte) confirmed at implementation-plan time.
- Strategy: prefer re-skin via CSS tokens; edit JS only where hard-coded styles or structural layout blocks the new design.
- `background.js`, `offscreen.js` — branding references (if any) updated; no UI impact.

### 9.8 Theme

- Dark default. `chrome.storage.local["themePreference"]` persists choice.
- Popup/sidepanel startup reads pref and sets `<html data-theme>`.
- No dynamic system icon swap (Chrome extension limitation) — single gold-on-dark toolbar icon.

### 9.9 Build pipeline

- `node extension/build.mjs` unchanged (3-pass esbuild preserved per CLAUDE.md).
- Token CSS built before extension build: `npm run tokens && npm run build:extension`.
- `extension/dist/` remains generated, not hand-edited.

## 10. Cross-Cutting Concerns

### 10.1 Backup & reversibility

- All replaced asset files moved to `backup-before-fixes/branding-v1/` before new ones land.
- Rebrand work lives on a feature branch; merge only after all platforms build and visual QA passes.
- Commit granularity: one commit per platform milestone (brand system, iOS shell, each rebuilt screen cluster, website section, extension section).

### 10.2 Testing strategy

- **Unit tests** — no new unit tests required; no business-logic changes.
- **Visual QA** — for each rebuilt view / page:
  - iOS: SwiftUI previews in both `.dark` and `.light`.
  - Website: manual check in Chrome desktop (1440) and mobile (390) breakpoints, both themes.
  - Extension: manual check in popup + sidepanel, both themes.
- **Regression check** — existing flows (send/receive/backup/restore/WC) must still complete end-to-end. Manual smoke tests before merge.
- **Build green** — iOS archive builds, `npm run build` for website, `node extension/build.mjs` all pass.

### 10.3 Dependencies

- New npm dev dependency: `sharp` (image resizing).
- New fonts bundled: Outfit (Light/Thin), Inter (Regular/Medium/SemiBold) — SIL OFL / OFL-licensed, redistribution OK.
- New icon library (web/extension): `lucide-react` or `lucide` (MIT).

### 10.4 Sequencing with roadmap

- Phase 1 (Weeks 1-2 of CLAUDE.md roadmap) — Brand System + iOS foundation work overlaps; priority shared with SDK v4.1.2 upgrade. Risk flagged: rebrand + SDK upgrade simultaneously in iOS is heavy.
- Phase 2 (Weeks 3-4) — iOS screen migration continues while Guardian/Bridge contracts ship.
- Phase 3 (Weeks 5-6) — Website rebrand + Extension rebrand happen here, after iOS primary screens are complete.
- TestFlight (Phase 5) must reflect the new brand; gate rebrand work to complete before Week 9.

## 11. Open Items (to resolve during implementation planning)

1. `extension/public/src/pages/popup.js` framework (vanilla / React / Svelte) — determines re-skin vs rebuild decision.
2. Exact number of bundled Outfit weights vs using `next/font` variable font (web only) — decision during website phase.
3. Whether `HowItWorks.tsx` and `AztecSection.tsx` stay as separate sections or one of them is cut during Features/PrivacySection additions.
4. Whether `WaitlistCTA.tsx` stays on the landing page given Hero now has Download CTAs.
5. iOS NFT screens' fate if NFTs are deprioritized — for now they are rethemed, but if deprecation is planned, they are removed instead.

## 12. Success Criteria

- New logo and color system present on all three platforms.
- All rebuilt screens match the provided reference mockups within 95% visual fidelity at target breakpoints.
- Placeholder screens (Swap / Discover / Buy) render cleanly in brand style and do not appear broken.
- Dark and light themes both render without contrast or token gaps.
- Existing wallet flows (create / restore / send / receive / WC connect / backup) complete without regression.
- Design tokens flow from `tokens.json` to all three platforms via a single `npm run tokens` step.
- Pencil master document `branding/celari-brand-system.pen` is the authoritative visual reference.

---

## Implementation Status

- [x] **Brand System Foundation** (plan: `2026-04-24-brand-system-foundation.md`, branch: `feat/rebrand-foundation`) — tokens pipeline, hand-coded logo SVGs, asset generator scripts. Pencil master deferred: Pencil MCP was unreachable during implementation, so logo and icon masters were authored directly as SVG. A `.pen` document can be reconstructed later by importing the committed SVGs if/when Pencil becomes available.
- [ ] iOS Rebrand — plan to be written.
- [ ] Website Rebrand — plan to be written.
- [ ] Extension Rebrand — plan to be written.
