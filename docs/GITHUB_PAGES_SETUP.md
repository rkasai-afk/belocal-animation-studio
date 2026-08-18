# Getting BeLocal Animation Studio onto a live URL (GitHub Pages)

Two ways to do this. **Path A needs zero credentials from you shared with me** — you do a two-minute upload yourself. **Path B lets me push updates for you going forward**, at the cost of sharing a scoped access token. Either way ends with a real URL, and either can later sit behind your own domain (see Part 3).

The file to publish is `index.html` (renamed from the tool you already have — GitHub Pages serves `index.html` automatically as the homepage of whatever URL it's given).

---

## Path A — you upload once, no credentials shared (recommended)

1. Go to [github.com/new](https://github.com/new) (log in first if needed).
2. Repository name: something like `belocal-animation-studio`. Keep it **Public** (GitHub Pages' free tier requires a public repo unless you're on a paid GitHub plan). Don't add a README — leave it empty.
3. Click **Create repository**.
4. On the new repo's page, click **uploading an existing file** (or the **Add file → Upload files** button).
5. Drag in `index.html` (attached below). Commit directly to `main`.
6. Go to **Settings → Pages** (left sidebar of the repo).
7. Under **Build and deployment → Source**, choose **Deploy from a branch**. Branch: `main`, folder: `/ (root)`. Save.
8. Wait about a minute, then refresh — GitHub shows the live URL at the top of that same Pages settings page. It'll look like:
   `https://yourusername.github.io/belocal-animation-studio/`

That's it — that URL is live, works on any device, and every time you want to update the tool, you just repeat step 4–5 (drag a new `index.html` over the old one) or ask me for the next version and do the same drag-and-drop.

---

## Path B — I push updates for you directly

If you'd rather not re-upload by hand every time there's a new version, you can let me push directly:

1. Create the empty repo yourself (steps 1–3 above).
2. Go to [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta) → **Generate new token** (fine-grained).
3. Set **Repository access** to **Only select repositories** → pick the one repo you just created. Do not grant access to all repos.
4. Under **Permissions → Repository permissions**, set **Contents** to **Read and write**. Leave everything else as **No access**.
5. Set an expiration (30–90 days is reasonable — you can always issue a new one later).
6. Generate it, copy the token, and paste it to me in chat along with the repo's URL.

With that scoped token I can push `index.html`, enable Pages, and hand you back the live URL in one go — and push again automatically whenever you ask for a new version, no manual upload needed. The token only ever touches that one repo's file contents; it can't see or touch anything else in your GitHub account. You can revoke it anytime from that same token settings page.

---

## Part 3 — reaching it through your own webpage/domain instead of a *.github.io URL

Two ways to make it feel like part of your own site, once Path A or B is live:

**Simplest: just link to it.** Add a link or button on your existing website's nav/tools page that points to the `github.io` URL. Zero extra setup, works immediately.

**Fuller integration: put it on your own subdomain.** If you own a domain (e.g. `belocal.jp` or whatever your site runs on), you can make the tool live at something like `tools.belocal.jp` or `animations.belocal.jp` instead of a `github.io` address:

1. Tell me the subdomain you want (e.g. `tools.belocal.jp`).
2. I add a `CNAME` file containing just that subdomain to the repo (or you type it into the "Custom domain" box in the same **Settings → Pages** screen from Path A — GitHub creates the file for you automatically).
3. In your domain's DNS settings (wherever you manage `belocal.jp` — your registrar or DNS host), add one **CNAME record**: `tools` (or whatever subdomain) → `yourusername.github.io`.
4. Once that DNS record propagates (usually minutes, sometimes up to a few hours), `tools.belocal.jp` serves the tool directly, with GitHub handling hosting/HTTPS for free behind the scenes.

Your existing website doesn't need to change at all for this — the subdomain lives alongside it, hosted separately, and you can link to it from your site's navigation just like any other page.

---

## What I need from you to move forward

- Which path (A or B)?
- If you want the custom-subdomain setup in Part 3: your domain name and which subdomain you'd like (e.g. `tools`, `animations`, `studio`).
