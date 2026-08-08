import { defineConfig } from 'unocss'

/**
 * Design tokens lifted from `ui/src/app/globals.css` (`:root`, the light theme)
 * and `ui/design-system.md`. Values are inlined as hex rather than `var(--x)`
 * so UnoCSS opacity modifiers (`bg-success/10`) resolve — the deck is
 * `colorSchema: light` only, so there is no runtime theme swap to preserve.
 *
 * The one deviation from the UI is `hairline`. See styles/index.css.
 */
export default defineConfig({
  theme: {
    colors: {
      background: '#fcfcfc',
      foreground: '#0b0b0b',
      card: '#f5f5f5',
      muted: '#636363',
      accent: '#00c5c7',
      success: '#00be6a',
      warning: '#f9a300',
      danger: '#ee343b',
      violet: '#a672ff',
      hairline: 'rgba(11, 11, 11, 0.14)',
    },
    fontFamily: {
      sans: 'Geist, ui-sans-serif, system-ui, sans-serif',
      mono: '"Geist Mono", ui-monospace, SFMono-Regular, monospace',
    },
  },

  /*
   * The type scale, as shortcuts rather than base element styles.
   *
   * theme-default styles `h1`/`h3`/`p` through `.slidev-layout h1 { … }`, which
   * out-specifies every UnoCSS utility — a `text-[13px]` on a `<p>` is silently
   * ignored. So the deck uses `<div>`/`<span>` throughout and carries type here
   * instead. Do not reintroduce bare heading or paragraph tags in slides.md.
   *
   * Sizes are tuned for the 980px canvas. Weights are 400/500/600 only;
   * design-system.md §3 puts 700 off-limits against Geist's optical weight.
   */
  shortcuts: {
    'zk-h1': 'text-[30px] leading-[1.15] font-semibold tracking-[-0.022em] text-foreground',
    'zk-h1-xl': 'text-[48px] leading-[1.05] font-semibold tracking-[-0.028em] text-foreground',
    'zk-h3': 'text-[14px] font-medium tracking-[-0.01em] text-foreground',
    'zk-lead': 'text-[16px] leading-[1.62] text-muted',
    'zk-body': 'text-[12.5px] leading-[1.55] text-muted',
    'zk-body-md': 'text-[13px] leading-[1.55] text-muted',
    // The only place positive tracking is allowed (design-system.md §3).
    'zk-eyebrow': 'text-[11px] font-medium uppercase tracking-[0.09em] text-muted',
    'zk-meta': 'font-mono text-[12px] tabular-nums text-muted',

    // Elevation is border, never shadow (design-system.md §5).
    'zk-card': 'bg-card border border-hairline rounded-2xl',
    // List rows separate with a divider, no gap, no zebra (design-system.md §6).
    'zk-row': 'flex items-center gap-3 border-b border-hairline py-2 last:border-b-0',
  },
})
