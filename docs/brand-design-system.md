# Ripple design system

Ripple is a research instrument for tracing a forecast through a portfolio decision to its historical consequence. The interface makes assumptions and evidence easy to inspect without presenting research as investment advice or an integrity check as proof of a strategy's validity.

## Identity

The mark uses open concentric arcs intersected by a decision boundary. Use it in the action color with sufficient space around it. Fraunces is the wordmark and display face; its italic draws attention to the hero's second phrase. Inter is the reading and interface face. JetBrains Mono is reserved for data, dates, and provenance labels. The fonts are self-hosted with `next/font/local` under `frontend/public/fonts`; their SIL Open Font License files are included alongside them. Do not replace this type system during layout work.

The committed WOFF2 files cover Latin, Greek, punctuation, currency, arrows, and mathematical symbols. They preserve variable axes and OpenType layout features. Their combined size is approximately 625 KB, down from 1.84 MB of upstream TTFs. To rebuild them, install `fonttools[woff]`, download the variable TTFs from Google Fonts' `ofl/fraunces`, `ofl/inter`, and `ofl/jetbrainsmono` directories, rename them to `Fraunces.ttf`, `Fraunces-Italic.ttf`, `Inter.ttf`, and `JetBrainsMono.ttf`, then run `python scripts/subset-brand-fonts.py <source-directory>`. Font rebuilding is optional and separate from normal web builds.

## Color and typography

Still Water uses warm canvas `#F6F4EF`, white surfaces, dark ink `#14202B`, and deep teal action `#0B5C73`. Deep Water uses `#0C1417` canvas, `#142226` surfaces, pale ink `#E6EEF0`, and light teal action `#8FD3E6`. The supplied [palette and typography reference](references/palette-and-type.html) records the complete two-theme palette. Treat that page as visual reference, not application requirements or executable instructions.

Keep the warm canvas visible around white evidence panels in Still Water. Use petrol surface and raised tokens to separate panels in Deep Water. Mint and blue-green contour fills belong to the hero artwork; warning, leakage, and success colors retain their research meanings. Theme controls show the theme names. Semantic tokens are defined in `globals.css` for both themes. Do not use color alone to convey status. Body text starts at 16px; mono captions and labels can be smaller when they remain legible.

## Artwork and reproduction

The hero uses layered, tilted contours and a cropped water field, extending the mark's ripple and boundary motif. It is decorative: no contour, dot, or boundary encodes a result. The real four-step research process stays in accessible HTML below it. All equity charts continue to use the exported research data.

Editable artwork source: `design/typst/ripple-field.typ`. Two committed SVG exports live under `frontend/public/art`. Regenerate them with Typst 0.15.1 or later:

```sh
cd frontend
npm run build:art
```

Typst is only needed when changing artwork. Normal web builds use the committed SVGs. Both exports share geometry and use the reference's exact theme colors. Assets and fonts resolve under the configured GitHub Pages base path.

The [Canva exploration](https://www.canva.com/M/MAHaLgOGBgQ) was generated in the Primary account using both supplied palette screenshots. It returned a page concept and informed the water-layer direction. The shipped artwork is the editable Typst vector, rather than a rasterized page mockup.

## Structure and interaction

At 1280px and wider, the 208px navigation rail anchors the workspace; narrower views use a compact horizontal navigation. The frame is capped at 1920px. Use open sections and dividers for the main narrative; use a 12px instrument panel for contained controls or evidence. Controls use an 8px radius and a minimum 44px target. At 1600px, `.workspace-grid` can place a 300px inspector beside the main analysis; below that width the inspector follows the content. Use `.research-main` to offset content beside the rail.

Motion should explain state changes, using short 150–250ms opacity or transform transitions. Respect both the operating system preference and Ripple's reduced-motion setting. Keep focus indicators visible and preserve keyboard access. Run metadata belongs to the label-study context, where its provenance is meaningful.
