# zkuat pitch deck

The 4-minute judge pitch for Hack Buenos Aires 2026. Slidev, exported to PPTX, presented from
Google Slides.

```bash
npm --prefix slides install
npx playwright install chromium      # once, if the browser is missing
npm --prefix slides run dev          # http://localhost:3030
npm --prefix slides run export       # → slides/zkuat-pitch.pptx
```

## Shape of the talk

8 slides, **2:30 of slides + 1:30 of live demo = 4:00 flat**. Per-slide timings are in the speaker
notes, which ride through the pptx export as PowerPoint speaker notes.

| # | Slide | Time |
|---|---|---|
| 1 | Cover | 0:10 |
| 2 | The evidence is the exposure | 0:20 |
| 3 | The asymmetry | 0:30 |
| 4 | How it works | 0:25 |
| 5 | Why this needs Midnight | 0:35 |
| 6 | **Live demo** | 1:30 |
| 7 | Status & what's next | 0:20 |
| 8 | Close | 0:10 |

Slide 3 has one click. Everything else is static.

Slide 7 is the first thing to cut if you are running long. Slide 6 is a holding slide whose four
beats double as a script — if the demo does not come up, talk over it and keep moving.

## Exporting

Text in a Slidev PPTX is **not editable**. Each slide is rasterised to a PNG and embedded as the
slide background, so the deck has to be final before you export — there is no fixing a typo in
Google Slides afterwards.

```
slidev export --format pptx --with-clicks --scale 2 --timeout 60000 --wait 1500
```

Producing **9 pages** from 8 slides: slide 3's two-step reveal exports as two, so the reveal still
works when you present from Google Slides. `npm run export:flat` collapses it back to 8 if you would
rather not click twice.

Three things about that command, all checked against this deck rather than the docs:

- **`--scale 2`** sets Playwright's `deviceScaleFactor`, so the 980px canvas rasterises at 1960×1104
  and stays crisp when Google Slides projects it at 1920×1080. Without it the deck looks soft. The
  flag is real but is missing from the CLI options table on sli.dev.
- **`--with-clicks` must be passed explicitly.** The docs say it defaults to true for pptx; on
  v52.19.0 exporting without it produced 8 pages, with the reveal collapsed.
- **`--per-slide` cannot be combined with it.** With `--per-slide` the click steps are silently
  dropped — 8 pages again, with or without `--with-clicks`. That flag is the documented workaround
  for the "wrong global layer state" bug, so dropping it is a real trade; it is safe here because the
  footer is `slide-bottom.vue` rather than `global-bottom.vue`, and the exported frames were checked
  to confirm each page carries its own page number. **If you add a `global-*.vue` layer, re-check
  that.**

Exporting needs internet: Geist and Geist Mono are pulled from Google Fonts at render time. They
bake into the raster, so the presenting machine needs neither the fonts nor a network connection.

`npm run export:png` writes numbered frames to `export/` — useful for eyeballing what actually
lands in the pptx without opening PowerPoint.

## Constraints this deck respects

Because every slide becomes an image:

- no Monaco editor, no `iframe`, no `<video>`, no remote images, no drawing layer;
- no Mermaid or PlantUML — the diagrams are hand-built HTML/CSS so they use the design tokens and
  render deterministically;
- transitions and motion are decorative only; nothing depends on them;
- a demo video cannot ride through the export. If one is ever added, insert the `.mp4` into the
  Google Slides deck by hand on its own slide.

## Design

Tokens come from `ui/src/app/globals.css` (`:root`, light) and the rules in `ui/design-system.md`:
elevation is border not shadow, two grays only, accent at most once per slide as a dot or fill and
never as body text, weights 400/500/600 with 700 off-limits, numerals in Geist Mono with
`tabular-nums`.

One value is deliberately changed for projection — `--border` goes from 6% to 14% alpha. The reason
is written out in `styles/index.css`. Nothing in `ui/` is affected.

### The one editing rule

**Never write `<h1>`, `<h2>`, `<h3>` or `<p>` in `slides.md` or a component.** theme-default styles
those elements as `.slidev-layout h1 { … }`, which out-specifies every UnoCSS utility — a
`text-[13px]` or `mt-4` on a `<p>` is silently ignored and you get 16px with no margin, with nothing
in the console to tell you. Use `<div>`/`<span>` plus the type shortcuts (`zk-h1`, `zk-h3`,
`zk-lead`, `zk-body`, `zk-eyebrow`, `zk-meta`) defined in `uno.config.ts`.

## Claim discipline

The wording is bounded by the trust-boundary list in the repo `CLAUDE.md`. The deck claims zkuat
proves **policy evaluation over accepted evidence**. It does not claim signed evidence, an honest
scanner, or a chain-backed public verifier. Slide 7 states the GitHub Actions measurement assumption
out loud. Keep it that way when editing.
