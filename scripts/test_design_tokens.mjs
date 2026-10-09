// One design system for the learner app and the admin (css/app.css tokens and components). Static checks:
//   - no Tailwind (it reset the admin's headings, lists and buttons, so the two apps looked different)
//   - no raw colours in the app code: colours come from the tokens, so Day and Night both work
//     (illustrations, the handwriting canvas and the printable receipt are allowed their own colours)
//   - every var(--x) used is defined somewhere
//   - every colour token of Day is redefined for Night and for System-dark
//   - css/admin.css does not restyle the shared components (sidebar, menu items, cards, buttons, chips, inputs)
// Run: node scripts/test_design_tokens.mjs
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "..");
const read = p => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).replace(/\\/g, "/")]);
let failed = 0;
const ok = (c, m, detail) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && detail ? "\n       " + detail : "")); if (!c) failed++; };

const js = walk("js").filter(f => f.endsWith(".js"));
const css = ["css/app.css", "css/admin.css"];
const html = ["index.html", "admin/index.html"];

ok(![...html, ...js].some(f => /tailwind/i.test(read(f))), "no Tailwind in the pages or the code");
// Safari before 17 gives every <button> "align-items: flex-start": button-cards then shrink their content (the practice
// cards broke on iPad). The reset must stay (Safari itself is checked by scripts/qa_safari.mjs).
ok(/^button\{align-items:stretch\}$/m.test(read("css/app.css")), "buttons stretch their content in every browser (Safari's flex-start reset is in css/app.css)");

// raw colours in code
const ART = [/welcome-scenes\.js$/, /lao-decorations\.js$/, /\/handwriting\//, /views-billing\.js$/ /* printable receipt */, /admin\/schemas\.js$/ /* placeholder text */, /logo-data\.js$/ /* brand logo */];
const raw = [];
for (const f of js.filter(f => !ART.some(r => r.test(f)))){
  read(f).split("\n").forEach((line, i) => { const m = line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|rgba?\(\s*\d/);
    if (m && !/^\s*\/\//.test(line) && !/["'`]#[0-9a-fA-F]{3,6}["'`]\s*[,)]?\s*\/\/ data/.test(line)) raw.push(`${f}:${i + 1} ${m[0]}`); });
}
ok(!raw.length, "no raw colours in the app code (tokens only)", raw.slice(0, 12).join("\n       "));

// undefined custom properties
const defined = new Set(), used = new Map();
for (const f of [...css, ...js, ...html]){
  const s = read(f);
  for (const m of s.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  for (const m of s.matchAll(/setProperty\(\s*["'](--[\w-]+)/g)) defined.add(m[1]);                 // set at run time
  for (const m of s.matchAll(/var\((--[\w-]+)(\s*,|\$\{)?/g)) if (!m[2] && !m[1].endsWith("-") && !used.has(m[1])) used.set(m[1], f);   // var(--x, fallback) and names built in code (var(--tone-${n})) are fine
}
const missing = [...used].filter(([k]) => !defined.has(k)).map(([k, f]) => `${k} (${f})`);
ok(!missing.length, "every var(--x) used is defined", missing.join(", "));

// Day colour tokens must exist for Night and System-dark
const app = read("css/app.css");
const block = start => { const i = app.indexOf(start); return app.slice(i, app.indexOf("}", i)); };
const tokens = s => new Set([...s.matchAll(/(--[\w-]+)\s*:\s*(#|rgba?\(|linear-gradient)/g)].map(m => m[1]));
const day = tokens(block(":root{")), night = tokens(block(':root[data-theme="dark"]{')), system = tokens(block(':root[data-theme="auto"]{'));
const noNight = [...day].filter(k => !night.has(k)), noSystem = [...day].filter(k => !system.has(k));
ok(day.size > 20 && !noNight.length, `all ${day.size} Day colour tokens have a Night value`, noNight.join(", "));
ok(!noSystem.length, "and a System-dark value", noSystem.join(", "));

// the admin stylesheet must not restyle shared components
const adminCss = read("css/admin.css");
const shared = /(^|\})\s*(\.adm\s+)?(\.side|\.nav-btn|\.card|\.btn|\.chip|\.input|\.pagehead|\.topbar\s*\{|\.brand)\b[^{]*\{[^}]*(background|color|border|font)/m;
const offending = adminCss.split("}").map(r => r.trim()).filter(r => /^(\.adm\s+)?(\.side|\.nav-btn|\.card|\.btn|\.chip|\.input|\.pagehead|\.brand)([\s.:\[{]|$)/.test(r) && /(background|color|font-family|border-radius)\s*:/.test(r));
ok(!offending.length && !shared.test(""), "css/admin.css does not restyle the shared sidebar, cards, buttons, chips or inputs", offending.slice(0, 5).join(" }\n       "));

console.log(failed ? `\n${failed} design token checks FAILED` : "\nAll design token checks passed");
process.exit(failed ? 1 : 0);
