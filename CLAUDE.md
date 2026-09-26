# Cygne Development Rules

## Git Workflow
- Always commit directly to main branch
- Never create feature branches
- Always push to origin/main after commits

## Design System
All tokens live in `:root` in `src/index.css`.

- Fonts: Fungis Heavy (titles/buttons), Fungis Normal (body)
- No Pinyon Script, no Reenie Beanie anywhere
- All buttons: outlined inky moss style, no solid black
- Logo always: <img src="/cygne-logo.png" />

### Tokens
- Type scale (1.25 ratio): --text-xs 11px, --text-sm 13px, --text-md 16px, --text-lg 20px, --text-xl 26px, --text-2xl clamp(28px, 8.2vw, 34px) (fluid)
- --text-nav 10px: bottom-nav labels only — the one exception to the 11px minimum, matching the iOS tab bar label size
- Spacing (4px rhythm): --space-1 4px, --space-2 8px, --space-3 12px, --space-4 16px, --space-5 20px, --space-6 24px, --space-8 32px, --space-10 40px, --space-12 48px, --space-16 64px
- Radius: --radius 12px, --radius-sheet 20px 20px 0 0, --radius-pill 999px
- Tracking: --tracking-label 0.12em, --tracking-display 0.15em
- Colors: --color-ivory #faf9f4, --color-ivory-shadow #f0ebe0, --color-ink #1c1c1a, --color-inky-moss #2d3d2b, --color-stone #5a5a5a, --color-pebble #7a7a7a, --color-bronze #8b7355, --color-sage #7a9070, --color-gold #c49040, --color-alert #c06060
- RGB channels (for alpha variants): --rgb-ivory 250,249,244; --rgb-moss 45,61,43; --rgb-ink 28,28,26; --rgb-bronze 139,115,85; --rgb-sage 122,144,112; --rgb-gold 196,144,64; --rgb-silver 192,192,192; --rgb-pebble 122,122,122; --rgb-alert 192,96,96
- Opacity steps: 0.08, 0.16, 0.32, 0.56, 0.82, 0.94 — e.g. rgba(var(--rgb-moss), 0.32), or withAlpha("moss", 0.32) from src/utils.jsx

Never hard-code sizes, spacing, radii, tracking, or colors; use tokens.
