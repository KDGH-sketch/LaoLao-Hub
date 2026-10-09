// Content rows completed from their type's defaults (js/shared/shape.js).
// Run: node scripts/test_shape.mjs
import { fillDefaults, shapeItem, shapeAll } from "../js/shared/shape.js";
import { SCHEMAS } from "../js/admin/schemas.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); if (!c) failed++; };

const d = shapeItem("dialogues", { id: "d1", status: "published" });
ok(d.level === 1 && Array.isArray(d.lines) && d.title.en === "" && d.id === "d1" && d.status === "published", "a row with almost nothing gets level, lines and title (the dialogue page crashed on lines.forEach)", d);
const l = shapeItem("lessons", { id: "l1", title: { en: "Hi" }, level: 3 });
ok(l.level === 3 && l.title.en === "Hi" && l.title.lo === "" && Array.isArray(l.vocab), "existing values are kept, missing languages and lists added", l);
ok(shapeItem("lessons", { id: "x", title: "Plain text" }).title.en === "Plain text", "a title stored as plain text becomes { en }");
ok(shapeItem("lessons", { id: "x", vocab: "ກິນ\nດື່ມ" }).vocab.join() === "ກິນ,ດື່ມ", "a list stored as text becomes a list");
ok(shapeItem("releases", { id: "r" }).date === "", "a release without a date stays without one (not today's date)");
ok(shapeItem("patterns", { id: "p", n: 4 }).hz === "" && shapeItem("vocabulary", { id: "v" }).hz === "", "patterns and words get an empty Lao text instead of undefined");
const fd = fillDefaults({ a: { b: 1, c: [] }, d: 0 }, { a: { b: 5 }, e: "keep" });
ok(fd.a.b === 5 && Array.isArray(fd.a.c) && fd.d === 0 && fd.e === "keep", "nested objects are completed field by field; extra fields stay", fd);
const defs = { a: [1] }; const one = fillDefaults(defs, {}); one.a.push(2);
ok(defs.a.length === 1, "defaults are copied, never shared between rows");
ok(shapeItem("unknown-type", { id: 1 }).id === 1 && shapeItem("lessons", null) === null, "unknown types and empty rows pass through");
ok(shapeAll("quizzes", [{ id: "q" }])[0].questions.length === 0, "shapeAll");
ok(Object.keys(SCHEMAS).every(t => !SCHEMAS[t].defaults || typeof shapeItem(t, { id: "z" }) === "object"), "every content type with defaults can be completed (" + Object.keys(SCHEMAS).length + " types)");
const when = new Date("2026-01-02"); ok(shapeItem("lessons", { id: "x", updatedAt: when }).updatedAt === when, "dates stay dates");

console.log(failed ? `\n${failed} shape checks FAILED` : "\nAll shape checks passed");
process.exit(failed ? 1 : 0);
