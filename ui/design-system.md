# Design System — beUI-native (v1)

A standalone design system built **on top of beUI's own theme contract**
(https://beui.dev). Everything here uses the variables beUI components already
read, so `bunx --bun shadcn add @beui/<component>` drops a component in and it
looks correct with zero overrides.

Values below were read off beUI's live site (Aug 2026), not from memory.

---

## 1. Direction

Clean, dark-first, expensive. The look comes from **restraint plus motion
quality**, not from ornament:

- Near-black canvas, one step of elevation, hairline borders instead of shadows.
- One accent (cyan), used almost never — a status dot, a focus ring, one
  primary action per screen. The moment accent appears twice in a viewport it
  stops reading as expensive.
- Type does the hierarchy work: Geist at 3-4 sizes, weight and color for
  emphasis, never decorative color.
- Motion is the luxury signal. Everything springs on `--ease-out`
  (`cubic-bezier(.16, 1, .3, 1)`), 150-400ms, no linear easing anywhere.
- Generous vertical rhythm, tight horizontal density.

Reference feel: Linear, Vercel, Family app. Not: dashboards with 12 chart colors.

---

## 2. Token contract (do not rename — beUI reads these)

beUI is shadcn-registry-distributed, so it consumes the standard shadcn variable
names plus a handful of its own. These are the exact values beUI ships. Adopt
them as-is; that is the whole point of "no overrides."

### Core surfaces

| Variable | Dark (default) | Light |
|---|---|---|
| `--background` | `#151515` | `#fcfcfc` |
| `--foreground` | `#f2f2f2` | `#0b0b0b` |
| `--card` | `#1c1c1c` | `#f5f5f5` |
| `--card-foreground` | `#f2f2f2` | `#0b0b0b` |
| `--popover` | `#1c1c1c` | `#f5f5f5` |
| `--popover-foreground` | `#f2f2f2` | `#0b0b0b` |
| `--primary` | `#f2f2f2` | `#0b0b0b` |
| `--primary-foreground` | `#151515` | `#fcfcfc` |
| `--secondary` | `#1c1c1c` | `#f5f5f5` |
| `--secondary-foreground` | `#f2f2f2` | `#0b0b0b` |
| `--muted` | `#1c1c1c` | `#f5f5f5` |
| `--muted-foreground` | `#868686` | `#636363` |

Note: `--primary` is **not** the accent. It is inverted foreground — a white
button on black. That inversion is the primary action; the cyan is not.

### Accent & semantic

| Variable | Dark | Light |
|---|---|---|
| `--accent` | `#00dfe1` | `#00c5c7` |
| `--accent-foreground` | `#151515` | `#0b0b0b` |
| `--destructive` / `--danger` | `#ee343b` | same |
| `--success` | `#00be6a` | same |
| `--warning` | `#f9a300` | same |
| `--neon` | `#45e159` | same |
| `--violet` | `#a672ff` | same |

`--neon` and `--violet` exist for gradients and decorative marks only. Never use
them for state.

### Lines & focus

| Variable | Dark | Light |
|---|---|---|
| `--border` | `rgba(255,255,255,0.05)` | `rgba(11,11,11,0.06)` |
| `--input` | `rgba(255,255,255,0.05)` | `rgba(11,11,11,0.06)` |
| `--ring` | `rgba(255,255,255,0.10)` | `rgba(11,11,11,0.12)` |

Borders are hairlines at 5-6% alpha. This is the single biggest "expensive"
lever — a 1px border at `#333` looks cheap; the same border at 5% white does not.

### Glass

| Variable | Dark | Light |
|---|---|---|
| `--glass-thin-bg` | `rgba(21,21,21,0.45)` | `rgba(255,255,255,0.45)` |
| `--glass-bg` | `rgba(28,28,28,0.55)` | `rgba(252,252,252,0.55)` |
| `--glass-strong-bg` | `rgba(28,28,28,0.60)` | `rgba(255,255,255,0.70)` |
| `--glass-border` | `rgba(255,255,255,0.08)` | `rgba(11,11,11,0.08)` |

Always paired with `backdrop-filter: blur(12px)` (`--blur-md`) or `24px`
(`--blur-xl`). Glass is for floating layers only: sheets, command palette, dock,
sticky headers. Never for a static card.

### Gradients

```
--gradient-accent: linear-gradient(to right, #00dfe1 0%, #a672ff 100%);
--gradient-bg:     linear-gradient(135deg, #050505 0%, #0c0f10 100%);
```

`--gradient-accent` is a once-per-page element (hero mark, pro badge). Not a
button fill.

### Motion

```
--ease-out:     cubic-bezier(.16, 1, .3, 1);   /* default for everything */
--ease-in-out:  cubic-bezier(.77, 0, .175, 1); /* two-way morphs */
--ease-drawer:  cubic-bezier(.32, .72, 0, 1);  /* sheets, drawers, dock */
```

Durations: 150ms micro (hover, press), 250ms standard (enter/exit, tabs),
400ms layout morph (modal resize, island). Nothing over 500ms.
Spring-driven `layoutId` transitions (Motion) are preferred over CSS transitions
for anything that changes position or size.

---

## 3. Typography

- **Sans:** Geist (`--font-sans`) — all UI, labels, body, headings.
- **Mono:** Geist Mono (`--font-mono`) — numerals, code, timestamps, IDs, keys.

Ship the fonts locally (`next/font` with Geist) rather than a CDN; beUI assumes
these two are present.

### Scale (Tailwind 4 defaults, already in beUI's theme)

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `text-xs` | 12px | 1.33 | 500 | badges, meta, timestamps |
| `text-sm` | 14px | 1.43 | 400/500 | body, list rows, labels |
| `text-base` | 16px | 1.5 | 400 | prose, input text |
| `text-lg` | 18px | 1.55 | 500 | card titles |
| `text-xl` | 20px | 1.4 | 600 | section headers |
| `text-2xl` | 24px | 1.33 | 600 | page titles |
| `text-5xl`+ | 48px+ | 1.0 | 600 | marketing hero only |

Weights: 400 body, 500 UI labels, 600 headings. **700 is off-limits** — bold
reads cheap against Geist's own optical weight.

Tracking: `-0.02em` on anything 24px and up (`tracking-tight`), default below.
Never positive tracking except on uppercase micro-labels (`tracking-wider`,
`text-xs`, `--muted-foreground`).

Color hierarchy is two steps only: `--foreground` for content,
`--muted-foreground` for everything secondary. There is no third gray.

---

## 4. Spacing

Tailwind 4 base: `--spacing: 0.25rem` (4px). Use `1, 2, 3, 4, 6, 8, 12, 16`
(4-64px). Skip 5, 7, 9 — an irregular scale is what makes layouts look
hand-drifted.

- Card padding: `p-4` (16px) compact, `p-6` (24px) default.
- Section gap: `gap-6` inside a card, `gap-12` between page sections.
- List rows: no gap. Separate with a `border-border` divider.
- Page gutter: `px-4` mobile, `px-6` tablet, `px-8` desktop, `max-w-5xl` content.

---

## 5. Shape & elevation

beUI leaves `--radius` unset and uses the Tailwind radius scale directly:

| Class | Value | Use |
|---|---|---|
| `rounded-md` | 6px | nav links, small inline chips, segmented tabs |
| `rounded-lg` | 8px | buttons, inputs, avatars |
| `rounded-xl` | 12px | cards, panels, tooltips |
| `rounded-2xl` | 16px | modals, sheets, icon buttons, feature cards |
| `rounded-full` | pill | badges, dots, CTA pills, switches |

Rule: a container is always one step rounder than the things inside it. A
`rounded-2xl` card holding `rounded-lg` buttons. Never the reverse.

**Elevation is border, not shadow.** Default card = `bg-card` + `border
border-border`, no shadow. Shadows only on true overlays (modal, popover,
dropdown, toast), and only `0 8px 24px rgba(0,0,0,0.24)` in dark /
`0 8px 24px rgba(0,0,0,0.08)` in light. Never a colored shadow, never a glow
except a deliberate accent focus state.

---

## 6. Components

Where beUI ships a component, use it and do not restyle it. These rules are for
composition and for the primitives beUI doesn't cover.

**Buttons** (beUI `Button`, `StatefulButton`, `MagneticButton`)
- Primary: `bg-primary text-primary-foreground`, `rounded-lg`, `h-9`, `text-sm`
  `font-medium`. One per view.
- Secondary: `bg-secondary text-secondary-foreground border border-border`.
- Ghost: transparent, `text-muted-foreground`, `hover:text-foreground
  hover:bg-secondary`. This is the default for row actions.
- Destructive: ghost `text-destructive` until the confirm step, then filled.
- Accent-filled buttons: allowed once per app, on the single conversion action.
- Press feedback is spring scale (`0.97`), not opacity.

**Inputs**
- `bg-transparent`, `border border-input`, `rounded-lg`, `h-9`, `text-sm`.
- Focus: `ring-2 ring-ring` — the neutral ring, not accent. Accent focus rings
  everywhere is the fastest way to look like a template.
- Error: `border-destructive` + `text-xs text-destructive` message below,
  never a red background fill.

**Cards**
- `bg-card border border-border rounded-xl p-6`. No shadow, no gradient.
- Card title `text-lg font-medium`, supporting copy `text-sm
  text-muted-foreground`.
- Hover on interactive cards: border goes to `--glass-border` (8%) and the card
  lifts `-1px` over 150ms. Nothing else moves.

**Badges / status**
- `rounded-full px-2 py-0.5 text-xs font-medium`, `bg-secondary
  text-muted-foreground` by default.
- State badges tint text only, on `bg-secondary`: `text-success`,
  `text-warning`, `text-destructive`. No saturated fills.
- A 6px `rounded-full` dot in the state color is preferred over a badge whenever
  the label is already in the row.

**Lists / tables**
- Row height 44px minimum (touch). `text-sm`, dividers via `border-border`.
- Numerals in `font-mono` with `tabular-nums` so columns align.
- Row hover `bg-secondary`, 150ms. No zebra striping.

**Overlays** (beUI `Morphing Modal`, `Bottom Sheet`, `Drawer`, `Command Palette`)
- Glass surface + `--blur-md`, `rounded-2xl`, `--glass-border`.
- Backdrop `rgba(0,0,0,0.5)` + `blur(4px)`.
- Sheets and drawers animate on `--ease-drawer`; modals morph height rather
  than cross-fading between sizes.

**Navigation**
- Mobile: bottom bar, glass, max 5 items, icon + `text-xs` label. Active =
  `text-foreground`; inactive = `text-muted-foreground`. The active indicator is
  a shared-layout pill (beUI `Tabs` / `Dock`), not a color change alone.
- Desktop: left rail, `rounded-md` items, same active treatment.

**Toasts** (beUI `Animated Toast Stack`)
- Glass, `rounded-xl`, stacked with scale falloff. Status conveyed by a leading
  icon in `--success` / `--destructive`, never by tinting the whole toast.

**Empty states**
- One line of `text-sm text-muted-foreground` stating what's missing, plus the
  single primary action. No illustrations, no icons larger than 24px.

**Icons**
- `lucide-react`, 16px in rows and buttons, 20px in nav, stroke 1.5 (not the 2
  default — 1.5 matches Geist's stroke weight). One library, never filled sets.

---

## 7. Integration

```bash
bunx --bun shadcn add @beui/<component>
```

Requirements for zero-override drop-in:
1. Tailwind v4 with `@theme` carrying the variables in §2, both `:root` and
   `.dark`.
2. React 19, `motion` (Framer Motion) installed.
3. Geist + Geist Mono loaded as `--font-sans` / `--font-mono`.
4. `tailwind-merge` + `clsx` (`cn()` helper) present — beUI components assume it.

If a component needs a visual change, change it via the tokens in §2, never by
patching the component file. A patched component stops receiving upstream fixes
and is how a design system rots.

---

## 8. Accessibility floor

- Contrast: `--muted-foreground` on `--background` is the floor (~5.0:1 dark, ~6.0:1 light). Do not
  introduce a lighter gray.
- `--accent` on `--background` fails for body text. Accent is for fills, dots,
  and 12px+ semibold labels on `--accent-foreground` backgrounds only.
- Focus is always visible: `ring-2 ring-ring` with `ring-offset-2
  ring-offset-background`. Never `outline: none` without a replacement.
- Touch targets 44px minimum.
- Every animation respects `prefers-reduced-motion` — beUI components already do
  this; anything hand-built must too.

---

## 9. Not in v1

- No chart/data-viz palette. When it's needed, derive it from `--accent`,
  `--violet`, `--neon` in that order — do not invent a 12-color ramp.
- No per-category color coding.
- No illustration or empty-state art system.
- No second accent. One is the point.
