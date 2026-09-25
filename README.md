# metafab.dev

The Metafab product website. A dependency-free static site, informed by the Mark I and Mark II prototypes.

## Preview

From the repository root:

```sh
python3 -m http.server 4180
```

Open http://localhost:4180. The website is in `index.html` and `assets/`; the existing prototypes remain in `mark-one/prototype/` and `mark-two/prototype/`.

## Deployment

Serve the repository root from any static host. There is no build step. Include both prototype directories so the demo links work. Set `metafab.dev` as the host's custom domain and configure DNS with that provider. The domain has not been configured or deployed by this change.

The site uses a dark, product-led visual design with local SVG/CSS illustrations, a lightweight WebGL light field, and system fonts. There are no external services or tracking. The three-mode preview uses illustrative data; the linked prototypes do not execute real agent work. The interactive preview supports System, Factory, and Outputs views, artifact inspection, and a Delivery subsystem drill-down. Keyboard users can switch demo tabs with the arrow keys, Home, and End; Escape closes inspectors or returns from a subsystem. Animation respects reduced-motion preferences. The WebGL field uses a bounded rendering resolution, pauses offscreen and in background tabs, and falls back to a static CSS atmosphere when WebGL is unavailable. The prominent perspective buttons stay synchronized with the keyboard-accessible demo tabs.
