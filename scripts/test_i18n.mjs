// Every interface text exists in English, Lao and Chinese, and none still describes the old Chinese-learning app.
// Run: node scripts/test_i18n.mjs
import { I18N } from "../js/shared/i18n.js";

let failed = 0;
const ok = (cond, name) => { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failed++; };
const keys = Object.keys(I18N.en);
for (const l of ["lo", "zh"]){
  const missing = keys.filter(k => !(k in I18N[l]));
  ok(!missing.length, `${l}: all ${keys.length} texts translated` + (missing.length ? " — missing: " + missing.slice(0, 10).join(", ") : ""));
  const extra = Object.keys(I18N[l]).filter(k => !(k in I18N.en));
  ok(!extra.length, `${l}: no texts without an English original` + (extra.length ? " — " + extra.join(", ") : ""));
}
const OLD = /Mandarin|Chinese Sentence|pinyin|Pinyin|中文|汉字|拼音|汉语|学路|ພາສາຈີນ|ພິນອິນ/;
const old = [];
for (const l of ["en", "lo", "zh"]) for (const [k, v] of Object.entries(I18N[l])) if (OLD.test(v)) old.push(`${l}.${k}`);
ok(!old.length, "no text still describes learning Chinese" + (old.length ? " — " + old.join(", ") : ""));
for (const l of ["en", "lo", "zh"]){
  const empty = Object.entries(I18N[l]).filter(([, v]) => typeof v !== "string" || !v.trim()).map(([k]) => k);
  ok(!empty.length, `${l}: no empty texts` + (empty.length ? " — " + empty.join(", ") : ""));
}
console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
