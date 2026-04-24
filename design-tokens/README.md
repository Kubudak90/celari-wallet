# Celari Design Tokens

Single source of truth for Celari colors, radius, motion, typography, and shadows.

## Edit

1. Change values in `tokens.json` (W3C DTCG format).
2. From repo root, run `npm run tokens`.
3. Commit `tokens.json`. Per-platform outputs regenerate on demand.

## Outputs (auto-generated)

| Path | Consumer |
|---|---|
| `website/src/styles/tokens.css` | Next.js website, imported by `globals.css` |
| `extension/public/styles/tokens.css` | Chrome extension popup + sidepanel |
| `ios/CelariWallet/CelariWallet/Resources/Generated/Tokens.swift` | SwiftUI Color + constants (gitignored — built in CI) |
| `ios/CelariWallet/CelariWallet/Assets.xcassets/Colors/` | SwiftUI `Color("…")` Asset Catalog lookups |
| `branding/exports/tokens-preview.html` | Visual swatch grid |

## Token naming conventions

- `{group}/{…sub}/{leaf}` → kebab in CSS (`--color-bg-base`), camel in Swift (`celariBgBase`), pascal in xcassets (`BgBase.colorset`).
- `$dark` + `$light` for dual-theme. `$value` for theme-agnostic (e.g., gold tones).
