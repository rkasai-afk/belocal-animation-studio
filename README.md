# BeLocal Animation Studio v2

Free-form browser editor for B-roll/explainer animations used in the BeLocal Japan
Explainer Series. Drag, resize, and animate text/shape/media layers; seven starter
templates; record straight to WebM. No install, no account — open `index.html` in any
browser, or use the live version.

**Live:** http://www.animate.adaptinc.jp/

## For editors (using the tool)

Just open `index.html`, or the live URL above. Pick a template, drag things around, hit
Record.

## For development (Claude Code / anyone editing this project)

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, gotchas, and workflow — Claude
Code reads it automatically. Quick version:

```bash
npm install
npm run build   # assembles src/ into index.html
npm test        # build + full Playwright regression suite
```

Edit files under `src/`, never `index.html` directly (it's a generated build artifact).

## Deploying

This repo *is* the deployment — GitHub Pages serves `index.html` straight from the `main`
branch root. Commit and push, and the live site updates within about a minute. See
[`docs/GITHUB_PAGES_SETUP.md`](./docs/GITHUB_PAGES_SETUP.md) for how the custom domain
(`www.animate.adaptinc.jp`) is wired up.

## Background

[`docs/Research_and_Architecture_Brief.md`](./docs/Research_and_Architecture_Brief.md) has
the reasoning behind the Fabric.js-based architecture and notes on explainer-video technique
this tool's defaults were built around.
