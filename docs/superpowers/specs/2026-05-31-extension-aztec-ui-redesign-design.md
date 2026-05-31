# Celari Extension — Aztec UI Redesign

**Date:** 2026-05-31
**Scope:** Chrome extension popup only (`extension/`). iOS app is explicitly out of scope this round.
**Goal:** Port the Aztec visual language from the `celari-wallet-new-ui` design prototype onto the existing extension popup **without losing any feature**. Surface a testnet faucet and keep logs/PXE-sync visible.

---

## 1. Context

- **Existing popup** (`extension/public/`): a ~3900-line **vanilla JS** module (`src/pages/popup.js`) that renders into `#root`. Architecture:
  - State object `store` with a `store.screen` key.
  - `setState(updates)` merges into `store` then calls `render()`.
  - `render()` → `_renderImpl()` does `switch(store.screen)` → calls a `renderX()` that returns an **HTML template string**, sets it via `innerHTML`, then calls a matching `bindX()` to attach event listeners.
  - All dynamic values pass through `escapeHtml()` (XSS-safe). This must stay.
  - Styling: `styles/tokens.css` (current "gold" palette, auto-generated) + `styles/popup.css` (~1100 lines).
  - Fonts already **self-hosted** (`public/fonts/inter-variable.ttf`, `Outfit-Light.ttf`).
  - Communicates with `src/background.js` (service worker) and the offscreen PXE document via `chrome.runtime` messages.

- **Design source** (`/Users/huseyinarslan/Desktop/celari-wallet-new-ui/`): a **React design prototype** (mockup, not shipped code). The reusable artifacts we port FROM:
  - `aztec-tokens.css` — palette (parchment/ink/chartreuse/orchid/aqua/malachite), type families (Martel/EB Garamond display+serif, Geist body, Geist Mono), spacing/radii/motion scales.
  - `wallet.css` — the `.celari` component layer: `--c-*` theme variables, `[data-theme="dark"]` (malachite), component classes (`.cel-card`, `.cel-btn`, `.cel-dot`, `.cel-state`, `.cel-field`, `.cel-row`, `.cel-ic`, `.cel-tabbar`, `.cel-display/serif/mono/eyebrow/num`).
  - `atoms.jsx` — `ICON_PATHS` (Lucide-style inline SVG), `CelariMark`/`CelariLockup` brand SVG, primitive components.
  - `ext-screens.jsx` — extension-specific screen mockups (8 screens, see §4).
  - `screenshots/` — reference renders (ext.png, overview.png, variants.png).

### Decisions locked (from brainstorming)
| Decision | Choice |
|---|---|
| Implementation approach | **Restyle the existing vanilla JS in place.** Keep all logic/state/messaging; replace only the visual layer (HTML templates + CSS). No React. |
| Default theme | **Follow system** (`prefers-color-scheme`), with a System/Light/Dark override in Settings. |
| Fonts | **Self-host** Geist + Geist Mono + EB Garamond + Martel (woff2), same `@font-face` pattern as today. |
| Faucet placement | Dashboard chip/action, visible only on faucet-capable networks (testnet/alpha/devnet); hidden on mainnet. |
| Bottom tab-bar | **Not added** for the 360×600 popup; existing navigation is preserved. |

---

## 2. Goals / Non-goals

**Goals**
- Every current popup screen adopts the Aztec visual language.
- Zero feature regression: passkey (create/unlock/lock), faucet, logs/PXE-sync, network switching, Send (private/public/shield/unshield), Receive, Activity, multi-account, backup/restore, WalletConnect + dApp approve (ws-approve/ws-sign/wc-approve), NFT (list/detail/add-contract).
- Faucet surfaced on testnet; logs/sync visible at a glance.
- Theme follows system with manual override.

**Non-goals**
- No changes to iOS app, contracts, SDK, bridge.
- No changes to `background.js` message contracts, PXE/offscreen logic, or `chrome.runtime` message types/state keys.
- No new dependencies (no React/bundled UI framework in the popup).
- No bottom tab-bar.

---

## 3. Design system port

### 3.1 `styles/tokens.css` (rewrite)
Replace the gold palette with Aztec tokens. Provide both:
- **Brand/scale tokens** (from `aztec-tokens.css`): `--font-display`, `--font-serif`, `--font-body`, `--font-mono`, type scale, `--sp-*`, `--r-*`, `--ease-out/inout`, `--dur-*`.
- **Theme tokens** (from `wallet.css` `.celari` block): `--c-ground`, `--c-ground-2`, `--c-card`, `--c-card-2`, `--c-ink`, `--c-muted`, `--c-subtle`, `--c-hairline`, `--c-hairline-2`, `--c-field`, `--c-cta`, `--c-cta-fg`, `--c-cta-hover`, `--c-priv`, `--c-priv-dot`, `--c-pub`, `--c-pub-ring`, `--c-proving`, `--c-up`, `--c-down`.

Light (parchment) = default; `[data-theme="dark"]` = malachite. (`tokens.css` is noted as "generated"; since the popup design system now lives here, we either update the generator source or replace the file and drop the "do not edit" provenance — decided at implementation, but the shipped file must contain the Aztec tokens.)

### 3.2 `styles/popup.css` (port)
Bring in the `.cel-*` component classes from `wallet.css`. Keep the popup at 360px width. Map/retain any legacy class names still referenced by `popup.js` until their templates are migrated, so nothing renders unstyled mid-migration.

### 3.3 Fonts
Add woff2 files to `public/fonts/`:
- Geist (body), Geist Mono (data/labels), EB Garamond (serif), Martel (display).
`@font-face` declarations in `tokens.css`. Extend `build.mjs` so the font assets are copied into `dist/`. CSP unchanged (self-host avoids `font-src` issues).

### 3.4 Icons & brand mark
Port `ICON_PATHS` and `CelariMark` into a small vanilla helper used by the templates, e.g. `icon(name, {size, stroke})` returning an inline `<svg>` string, and `celariMark(size)` / `celariLockup(size)`. Strokes 1.5px, `currentColor`. All template interpolation keeps `escapeHtml()` for dynamic data (icon names are from a fixed allow-list, not user input).

### 3.5 Theme controller
Extend existing `applyTheme()`/`setTheme()`:
- Persist preference (`system` | `light` | `dark`) in `chrome.storage`.
- On `system`, read `window.matchMedia('(prefers-color-scheme: dark)')` and listen for changes.
- Apply `data-theme` to the popup root wrapper (add a `.celari` wrapper class on the root container so the `--c-*` cascade matches the design).

---

## 4. Screen inventory

### 4.1 Mocked in `ext-screens.jsx` (port 1:1)
1. **Onboarding** — Celari mark, "Welcome to celari", feature list (Self-custody / Passkey login / No tracking), "Create with passkey" primary, "Restore existing account" ghost.
2. **Lock** — Celari mark, lock icon, "Wallet locked", "Unlock with passkey".
3. **Dashboard** — balance card (Total balance + eye toggle, private/public split with dots, address mono + copy), action row **Send / Receive / Shield**, Tokens/Activity tabs, token rows with priv/pub dots, activity rows.
4. **Send** — amount card, Private/Public/Shield mode toggle, "To" field (Address or Celari ID), Network card, "Estimated fee → Sponsored", "Review transaction".
5. **Receive** — QR card, Celari ID, copy address.
6. **Activity** — full activity list (in/out/shield icons, hybrid dots).
7. **Settings** — "ALPHA — testnet funds only" banner, rows: Network, PXE endpoint, Proving backend, Require passkey / tx. (Extended below with Theme + Faucet entry + Logs entry.)
8. **dApp Approve** (ws-approve) — connection request, dApp identity, permission checklist, privacy note, Reject / Connect.

### 4.2 Not mocked — restyle into the same language (feature-preserving)
- prf-unsupported, deploy-banner, sync-bar, account-selector
- ws-sign (transaction signing w/ passkey), wc-approve (WalletConnect session proposal), wallet-connect management (URI input + active sessions)
- add-account, backup (export), restore (import)
- NFT: nft-list, nft-detail, add-nft-contract
- loading, toast

Each keeps its current behavior, message dispatches, and validation (`isValidAddress`, `isValidAmount`, passkey gating). Only markup/classes change.

> Implementation note: exact `renderX`/`bindX` function names and line numbers must be re-confirmed by reading `popup.js` directly during implementation (the exploration pass reported approximate ranges).

---

## 5. Faucet (testnet) & Logs

### 5.1 Faucet
- Keep the existing flow entirely: cooldown via `src/lib/faucet-cooldown.js` (1h), Nethermind Fee-Juice claim, `CLAIM_READY_REFRESH` refresh, deploy hand-off.
- **Surfacing:** a Faucet action/chip on the Dashboard, rendered only when the active network is faucet-capable (testnet / "Aztec Alpha" / devnet / local). Hidden on mainnet. The faucet-capability check reuses the network value already in `store`.
- Restyle the faucet screen in Aztec language; show cooldown countdown text on the button.
- Settings shows the "ALPHA — testnet funds only" banner (matches mockup) when on a testnet-class network.

### 5.2 Logs / PXE sync
- **There is no logs viewer today** — only a sync bar (`renderSyncBar()` + `startSyncPolling()` via `PXE_SYNC_STATUS`). This is **new work**: add a session log ring buffer that tees `console.*`, plus a Logs screen that displays it (newest-first, level-coloured, with Clear).
- Add the mockup's **status pill** on the Dashboard ("Synced · Block N · X account(s)"), restyled from the existing sync bar; tapping it opens the Logs screen.
- Logs also reachable from Settings (Actions group).

---

## 6. Build & verification
- Build: `node extension/build.mjs` (3-pass esbuild). Confirm new font assets land in `dist/` and the popup loads them.
- Manual: load/reload at `chrome://extensions`, open popup (360×600), walk every screen in both light and dark (toggle system appearance + manual override), verify:
  - faucet appears on testnet, hidden on mainnet, cooldown works;
  - logs/sync pill shows and opens logs;
  - dApp approve / ws-sign / WalletConnect flows still function;
  - passkey create/unlock/lock unaffected;
  - no console errors / no unstyled elements.
- `do NOT edit` rules respected: `extension/dist/`, iOS `Resources/offscreen.js`, `*.wasm`, `*.gz` are generated — change sources only.

---

## 7. Risks & mitigations
- **Large single file** (`popup.js` ~3900 lines): migrate screen-by-screen; keep legacy CSS class aliases until each template is converted so the popup never renders unstyled.
- **CSP / fonts**: mitigated by self-hosting (no external `font-src`).
- **Theme regressions**: centralize theme application; test both themes per screen.
- **Hidden feature coupling** (e.g. a class name used by JS for selection, not just styling): when renaming/replacing classes, grep `popup.js` for the class string before removing it.
- **Recompile/onboarding caveat** is unrelated (UI-only change; no contract bump).

---

## 8. Open items
None blocking. Faucet placement and tab-bar resolved (see §1 decisions). Theme override UI copy and exact Dashboard chip layout to be finalized during implementation against the screenshots.
