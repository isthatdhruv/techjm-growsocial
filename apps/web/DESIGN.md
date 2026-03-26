# TechJM Design System: The Ethereal Frontier

Generated via Stitch (Project ID: `10472650580003408489`)

## Creative North Star: "The Synthetic Aurora"

Built on the philosophy of **Ethereal Depth** — the UI is a multi-dimensional environment of light and shadow. Premium, futuristic, AI cockpit aesthetic.

## Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `accent` | `#E94560` | CTAs, highlights, interactive elements |
| `blue` | `#0F3460` | Secondary accents, gradients |
| `surface` | `#111125` | Base background |
| `surface-dim` | `#0c0c20` | Deepest surfaces |
| `surface-low` | `#1a1a2e` | Card backgrounds |
| `surface-mid` | `#1e1e32` | Container backgrounds |
| `surface-high` | `#28283d` | Interactive surfaces |
| `surface-highest` | `#333348` | Floating/modal surfaces |
| `text` | `#e2e0fc` | Primary text |
| `text-muted` | `#A0A0B0` | Body/secondary text |

## Glassmorphism Rules

All primary containers use:
- **Fill:** `rgba(26, 26, 46, 0.6)`
- **Backdrop Blur:** `20px`
- **Border:** `1px solid rgba(255, 255, 255, 0.08)`
- **Border Radius:** `16px` (cards), `12px` (buttons), `24px` (large containers)

### Hover States
- Border shifts to `rgba(233, 69, 96, 0.3)`
- Backdrop blur increases from 20px to 30px

## Background Treatment

Radial gradient glows on the base `#111125`:
- `#E94560` at 8-10% opacity (ambient warmth)
- `#0F3460` at 12-15% opacity (depth)
- Optional grid overlay at 3% opacity

## Typography

Font: **Inter** — all weights 400/500/600/700

| Scale | Size | Weight | Usage |
|-------|------|--------|-------|
| Display | 64px | Bold | Hero headings |
| Headline | 36px | Bold | Section headings |
| Title | 18px | Semibold | Card titles |
| Body | 16px | Regular | Body text |
| Label | 12-13px | Bold, uppercase, tracked | Section labels |

## Tailwind Utilities

```
.glass        — standard glassmorphism card
.glass-nav    — navigation bar glass
.glass-hover  — hover effect (combine with .glass)
.glow-accent  — large red glow shadow
.glow-accent-sm — subtle red glow shadow
.bg-grid      — subtle grid overlay
```

## Do's and Don'ts

**Do:**
- Use negative space generously between sections
- Layer radial glows in background corners
- Use tonal shifts for section boundaries

**Don't:**
- Use opaque borders (breaks glass illusion)
- Use pure black `#000000` (kills depth)
- Crowd glass containers with too many elements
- Use standard drop shadows
