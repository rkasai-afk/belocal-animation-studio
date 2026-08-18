# BeLocal Animation System — Research & Architecture Brief

This covers what I found researching professional explainer-video technique, the architecture decision behind the v2 rebuild, and how the system is meant to grow from here without repeated ground-up rebuilding.

## 1. What "professional explainer" technique actually breaks down into

Written breakdowns of Johnny Harris's specific technique are thin — most real analysis of his work lives in After-Effects tutorial videos on YouTube rather than articles, so I can describe the pattern from those titles and general knowledge but couldn't extract frame-by-frame specifics through text research alone. If you want his exact camera-move math or timing curves, the honest path is watching a couple of the breakdown videos together and I translate what you point at into settings in the tool — text research hits a wall here that video-source research wouldn't.

What did come back clearly, and is genuinely buildable, is the shared vocabulary across Vox, Johnny Harris, Kurzgesagt, and similar channels:

- **Text moves with the voiceover, not before or after it.** On-screen text is timed to land on the word it's emphasizing, not just fade in at the start of a sentence. This is why the v2 editor's animation delay is in milliseconds per layer, not a single global timing — you can nudge one word to land exactly where the narration hits it.
- **A restricted palette, used consistently.** Three to four accent colors max, reused as a system (a color always means the same thing — e.g., amber always means "changing/uncertain"). This matches the color logic already built into your production docs (green/amber/red status badges) — the tool inherits that same palette rather than introducing a new one.
- **Motion explains, it doesn't decorate.** Every animation should be doing interpretive work — a number counts up because the count itself is the point, a card slides in from the direction that matches the logic (e.g., "before" enters from the left, "after" from the right). Motion without a reason reads as generic, which was your original complaint.
- **Maps and charts get a "handcrafted" treatment** — consistent line weights, textures, or overlays so they read as authored rather than auto-generated. This is the argument for the free-form editor over rigid templates: a template guarantees consistency but reads as generic; hand-placement (even from a template starting point) is what gives it a made-by-someone feel.
- **Mixed media is treated consistently** — when real footage and graphics sit in the same shot, matching overlays/treatments keep them from feeling like two different videos stitched together. This is the direct justification for background media with opacity control: a dimmed real photo behind text reads as one continuous visual language instead of "stock photo, then a slide."

Sources: [How Johnny Harris Mastered Visual Storytelling on YouTube](https://medium.com/@LMK_writing/how-johnny-harris-mastered-visual-storytelling-on-youtube-343ddf9160ec), [How we got inspired by VOX-style videos for our UI and video design](https://thoughts.bearicorn.com/vox-style-videos-b7ac47421bfe), [Kinetic typography](https://en.wikipedia.org/wiki/Kinetic_typography), and the After Effects breakdown videos: [Epic Johnny Harris Style Text Animation](https://www.youtube.com/watch?v=Sxj0CSPmTjo), [Break Down of Johnny Harris's Camera Animation Style](https://www.youtube.com/watch?v=w27dV-3lQjg), [Animate Like Johnny Harris | VOX Style](https://www.youtube.com/watch?v=5iMo97AKz6Q).

## 2. Why the tool was rebuilt around Fabric.js

The first version (the one you gave feedback on) hand-coded every pixel position directly onto a canvas — every template was a JavaScript function with hardcoded coordinates. That's why editing size/placement wasn't possible: there was nothing to select or drag, just a drawing routine. To give you real control without a wall of numeric fields, the standard solution is an *object model* — treat every piece of text, every shape, every image as an independent, selectable, draggable, resizable thing, the way Canva or PowerPoint does it.

I compared the three real options for this in a browser:

| Library | Verdict |
|---|---|
| **Fabric.js** | Built-in drag/resize/rotate handles, inline text editing, image opacity/filters, and `canvas.toJSON()` for saving — a complete design-editor object model out of the box. **Chosen.** |
| Konva.js | Similar interaction model but weaker text editing and no built-in save format — would mean building more of this myself. |
| PixiJS | Built for games/performance, not design editing — wrong tool for this job. |

Fabric.js is a mature, actively maintained library (v7, 300KB minified) and — critically — it's embeddable as a single inline script, so the tool stays a self-contained file you can open anywhere with no install, exactly like the first version.

Source: [Fabric.js vs Konva vs PixiJS comparison](https://www.pkgpulse.com/blog/fabricjs-vs-konva-vs-pixijs-canvas-2d-graphics-libraries-2026).

## 3. How the new architecture answers each thing you asked for

**"Edit the size/placement of each text."** Every layer is now a real Fabric object. Click it, drag it anywhere, drag a corner handle to resize it, type directly into it. No numeric X/Y fields needed — direct manipulation *is* the control, which is also why it doesn't feel complicated: you're moving things, not filling out a form about where they should go.

**"As much control as possible without making it too complicated."** The side panel only shows what's relevant to what you've selected — text gets a content box, font size, and color; shapes get a fill color. Every layer additionally gets one opacity slider and one animation dropdown (fade / pop / slide from a direction / count-up for numbers) with a single delay field. That's the entire vocabulary — deliberately not exposing duration, easing curves, or rotation-timing as separate controls, because those are the kind of knobs that turn a tool powerful and unusable at the same time.

**"Insert videos/pictures in the background, control opacity."** Built. A background layer takes any image or video file, sits behind every other layer, and has one opacity slider — lower it to dim a bright shot for text legibility, raise it for something already moody. Video plays live during preview and gets baked into the recording.

**"Mapping animators in the future."** The layer system is typed (`text`, `rect`, `circle` today), and the properties panel and animation engine are both written generically against "whatever the selected layer's type is" rather than hardcoded per-template. Adding a `map` layer type later means writing one new renderer function and registering it — the panel, the drag/resize handles, the animation-in system, and the recorder all already work with any layer type without changes. I did not build the map renderer itself yet — a Japan/regional map is its own real project (geographic path data, pin placement, zoom regions) — but the seat it plugs into already exists.

**"Easy to add features, not building from scratch each time."** This is the actual point of the rebuild. A template is now a plain JSON list of layers — position, size, color, and one animation each. Adding a new template is authoring a new JSON object, not writing new drawing code. Proof of this: the three starter templates (Stat Reveal, Category Cards, Checklist Reveal) took far less code than the equivalent hand-drawn versions in v1, because they're all just data fed through the same rendering path. When you want a new template, tell me what it should show and I write the JSON — it's a fast, mechanical addition, not a rebuild.

## 4. What shipped now vs. what's next

Shipped and tested: the free-form editor itself (drag, resize, rotate, inline text editing, delete), three starter templates, add-your-own text/rectangle/circle layers, six animation styles including auto-detected number count-up, four embedded font pairings, background image and video with opacity, save/load a scene as a `.json` project file, and record-to-WebM.

Deliberately not built yet, in rough priority order: the remaining template presets (Process Flow, Before/After, Dot-Grid) ported into the new free-form system — the six templates from v1 still exist as one-click generators in the original Studio if you need them meanwhile; a proper map layer; and an org/family-tree layer (needed for Episode 11 specifically). Also worth knowing: Dot-Grid's 465 individual dots don't make sense as 465 draggable objects, so that one will likely stay a "generated group" you configure with a couple of numbers rather than a fully free-form layer — I'll flag that trade-off when I build it rather than surprise you with it.

## 5. Usability notes — why a few things work the way they do

Multi-selecting several layers (dragging a selection box) shows a simplified panel instead of per-layer controls, because averaging six different fonts/colors/animations into one form gets confusing fast — better to ask you to select one at a time. The animation-in delay is the only timing number exposed; duration is fixed per animation type so two clips built by different people still feel consistent. Recording always exports WebM rather than MP4 because that's what a browser can produce natively without a server — send me the file in any session and I'll convert it if your editor needs MP4.
