# Celari Brand Guide

Practical reference for using the Celari identity across product, marketing, and partner contexts. The source of truth for all values is `design-tokens/tokens.json` — when this guide and the tokens disagree, the tokens are correct.

---

## Logo

### Construction

The mark is a gold "C" arc with an almond-shaped leaf set into the opening at -22°. The C uses a 380→260 outer/inner radius (1024 viewBox), giving a stroke ratio of ~31% — heavy enough to read at favicon sizes, restrained enough to feel editorial at hero sizes.

The wordmark "CELARI" is set in **Outfit Light (300)** with `tracking 0.3em`, all-caps. The lockup pairs mark and wordmark with the wordmark's cap-height matching the mark's inner counter.

### Variants

| File | Purpose |
|---|---|
| `logo-mark.svg` | Gold gradient mark — primary use on dark surfaces |
| `logo-mark-mono-dark.svg` | Solid dark mark for light backgrounds (#141416) |
| `logo-mark-mono-light.svg` | Solid light mark for dark backgrounds (#F7F6F1) |
| `logo-lockup.svg` | Gold mark + wordmark — primary lockup |
| `logo-lockup-mono-dark.svg` | Mono dark lockup for light backgrounds |
| `wordmark.svg` | Standalone wordmark — use only when the mark already appears nearby |

### Clear space

Reserve clear space equal to the mark's inner counter (the "leaf chamber") on all sides. Nothing — type, imagery, edges — may enter this zone.

### Minimum sizes

- **Mark only:** 16px (favicon) / 16pt
- **Lockup:** 96px / 96pt — below this, drop the wordmark and use the mark alone

### Don't

- Recolor the gold gradient (use the mono variants if gold won't work on the target background)
- Skew, rotate, or shear the mark
- Re-letter the wordmark (it is not Outfit Light at any weight; the geometry is finalized)
- Place the gold mark on light cream backgrounds — contrast falls below WCAG UI threshold (use mono-dark instead)
- Add drop shadows, outer glows, or "shine" effects beyond the in-built gradient

---

## Color

Celari is **dark-first**. The light theme exists for accessibility and platform conventions, not as a co-equal expression of the brand.

### Dark palette (primary)

| Token | Value | Usage |
|---|---|---|
| `bg.base` | `#0A0A0B` | App background |
| `bg.elevated` | `#141416` | Cards, sheets |
| `bg.raised` | `#1C1C1F` | Inputs, raised tiles |
| `border.subtle` | `#26262A` | Hairlines |
| `text.primary` | `#FFFFFF` | Headings, primary copy |
| `text.secondary` | `#A8A8B0` | Secondary copy |
| `text.muted` | `#6B6B73` | Captions, labels |
| `status.up` | `#34D399` | Positive change, success |
| `status.down` | `#F87171` | Negative change, error |

### Light palette (secondary)

| Token | Value | Usage |
|---|---|---|
| `bg.base` | `#F7F6F1` | App background (warm off-white) |
| `bg.elevated` | `#FFFFFF` | Cards |
| `bg.raised` | `#ECEBE5` | Raised tiles |
| `border.subtle` | `#E0DFD9` | Hairlines |
| `text.primary` | `#0A0A0B` | Headings |
| `text.secondary` | `#525258` | Secondary copy |
| `text.muted` | `#8A8A92` | Captions |
| `status.up` | `#059669` | Positive |
| `status.down` | `#DC2626` | Negative |

### Gold (theme-agnostic)

| Token | Value | Usage |
|---|---|---|
| `gold.primary` | `#D4A853` | Primary gold — use on **dark** surfaces |
| `gold.soft` | `#B8924A` | Lower-emphasis gold on dark |
| `gold.glow` | `#E8C878` | Highlight stop in gradients |
| `gold.deep` | `#8A6F38` | **Use as foreground gold on light surfaces** — the only gold value that meets WCAG AA on `#F7F6F1` |

### Accessibility

Run `npm run brand:audit` to print the contrast matrix. Required pass criteria:

- All text-on-bg pairs meet **WCAG AA 4.5:1**
- All UI/icon-on-bg pairs meet **WCAG AA 3:1**
- Gold-on-dark passes both (8.98:1 on `bg.base`)
- Gold-on-light: use `gold.deep` for foreground, `gold.primary` for decorative-only

---

## Typography

| Role | Family | Weight | Notes |
|---|---|---|---|
| Wordmark | Outfit | 300 (Light) | Tracking `0.3em`, all-caps, never substituted |
| Headings / UI | Inter | 500–600 | System sans fallback chain |
| Body | Inter | 400–500 | |
| Numeric / monospace | SF Pro Rounded (system) | — | Tabular figures for balances and amounts |

Variable font files live in `website/public/fonts/` and `ios/CelariWallet/CelariWallet/Resources/`. Add new weights only by extending the variable axis range — do not introduce a static cut.

---

## Motion

| Token | Value | Usage |
|---|---|---|
| `motion.duration.fast` | `150ms` | Hover states, small toggles |
| `motion.duration.base` | `200ms` | Standard transitions, sheet open |
| `motion.duration.slow` | `300ms` | Modal enter, hero reveal |
| `motion.easing.standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default for everything unless noted |

Avoid spring physics that exceed `slow`. Celari motion is restrained — the brand is "quiet privacy," not "playful interaction."

---

## Voice & tone

- **Quiet, confident, technical-when-warranted.** Privacy is the product; every line of copy should make the reader feel held, not lectured.
- **No marketing exclamations.** No emoji in product surfaces. Em-dashes are fine; em-dashes followed by smiley faces are not.
- **Specific over abstract.** "Aztec encrypted rollup" beats "next-gen privacy chain." "WebAuthn passkey" beats "secure login."
- **Turkish + English parity.** Every user-facing string ships in both — see `website/messages/` and iOS `Localizable.strings`.

---

## Asset inventory

Generated by `npm run brand:export`. Outputs live in `branding/exports/`:

| Path | Contents |
|---|---|
| `logo-*.svg` | Mark + lockup + wordmark sources |
| `app-icon-{dark,light,tinted}-1024.png` | iOS AppIcon masters (the tinted variant feeds iOS 18's tinted-mode appearance) |
| `app-icon/*.png` | Per-size iOS AppIcon renders |
| `extension/icon-{16,32,48,128}.png` | Chrome MV3 toolbar / store icons |
| `favicon.ico`, `favicon-source.svg` | Website favicons |
| `og-dark.png` | Open Graph / Twitter card image |
| `social/*.png` | Twitter banner, Discord banner, Chrome Web Store marquee/tile/screenshot, App Store hero |
| `celari-press-kit.zip` | Bundled distribution archive (SVGs + PNGs + app icons + colors + README) |

`tokens-preview.html` renders the live palette and motion samples — useful for design review.

---

## Permitted & prohibited use

**Permitted:**

- Press, partner integration, app store listings, social media
- Articles, videos, tutorials, presentations referencing Celari
- Reproduction in product reviews and security research write-ups

**Prohibited:**

- Implying endorsement or partnership without prior written approval
- Modifying logo geometry, colors, or wordmark spacing/tracking
- Recoloring the gold gradient with non-brand hues
- Placing the gold mark on backgrounds that obscure it (use the mono variants when contrast is poor)
- Using the mark as a generic "privacy" or "Aztec" icon

---

## Contact

For brand questions, partner inquiries, or trademark concerns: <https://celariwallet.com>
