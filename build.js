/*
 * Assembles src/studio_v2_template.html + src/fonts_embed.css + src/fabric.min.js +
 * src/app.js into a single self-contained index.html at the repo root.
 *
 * That output is the deployed artifact — it's what GitHub Pages serves, and it's
 * also what a user can double-click and open directly with no build step. Always
 * run this after editing anything in src/, then run the tests, before committing.
 *
 * CRITICAL: the placeholder substitutions below MUST use a function replacer
 * (`() => content`), not a bare string. fabric.min.js (and potentially future
 * embedded libraries) contain literal `$&`, `` $` ``, `$'` sequences that
 * String.prototype.replace() interprets as special regex replacement-pattern
 * tokens when the replacement argument is a plain string — this silently
 * corrupts the output (extra/garbled characters, syntax errors, "fabric is not
 * defined" at runtime). A function replacer's return value is always inserted
 * literally. This bit us once already; do not "simplify" it back to a string.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');

const template = fs.readFileSync(path.join(SRC, 'studio_v2_template.html'), 'utf8');
const fonts = fs.readFileSync(path.join(SRC, 'fonts_embed.css'), 'utf8');
const fabricJs = fs.readFileSync(path.join(SRC, 'fabric.min.js'), 'utf8');
const appJs = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');

let html = template;
html = html.replace('/*FONT_FACES_PLACEHOLDER*/', () => fonts);
html = html.replace('/*FABRIC_JS_PLACEHOLDER*/', () => fabricJs);
html = html.replace('/*APP_JS_PLACEHOLDER*/', () => appJs);

const outPath = path.join(ROOT, 'index.html');
fs.writeFileSync(outPath, html);
console.log(`Built index.html — ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
