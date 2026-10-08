// Spreadsheet import: the .xlsx writer/reader and CSV parser (js/shared/sheet-io.js) and the import rules
// (js/admin/import-map.js). Optional: node scripts/test_import.mjs --write <dir>  writes the three templates to <dir>.
// Run: node scripts/test_import.mjs
import fs from "fs";
import path from "path";
import { writeXlsx, readXlsx, readSheetFile, parseCsv, detectDelimiter, decodeText, toCsv, crc32, unzip } from "../js/shared/sheet-io.js";
import { TYPES, templateSheets, matchHeaders, guessType, validateRows, toContent, message } from "../js/admin/import-map.js";

let failed = 0;
const ok = (c, m, d) => { console.log((c ? "  PASS " : "  FAIL ") + m + (!c && d !== undefined ? "  → " + JSON.stringify(d).slice(0, 400) : "")); if (!c) failed++; };
const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

console.log(".xlsx writer and reader");
ok(crc32(new TextEncoder().encode("The quick brown fox jumps over the lazy dog")) === 0x414FA339, "zip checksum (CRC-32) is correct");
for (const type of Object.keys(TYPES)){
  const sheets = templateSheets(type), bytes = writeXlsx(sheets);
  const back = await readXlsx(ab(bytes));
  ok(back.length === 2 && back[0].name === "Data" && back[1].name === "Guide", type + " template: a Data sheet and a Guide sheet");
  ok(JSON.stringify(back[0].rows) === JSON.stringify(sheets[0].rows.map(r => { const a = r.slice(); while (a.length && a[a.length - 1] === "") a.pop(); return a; })),
    type + " template: every header and sample cell reads back exactly, each in its own column (" + sheets[0].rows[0].length + " columns)", back[0].rows[0]);
  if (process.argv[2] === "--write") fs.writeFileSync(path.join(process.argv[3], `LaoLao_${type}_template.xlsx`), bytes);
}
const tricky = [["Lao", "English"], ["ຂ້ອຍ & ເຈົ້າ <ok>", "a, \"quoted\"; text\nnew line"], ["", "only B"], ["ກ", ""]];
const rt = await readXlsx(ab(writeXlsx([{ name: "Data", header: true, rows: tricky }])));
ok(rt[0].rows[1][0] === "ຂ້ອຍ & ເຈົ້າ <ok>" && rt[0].rows[1][1] === tricky[1][1], "special characters (& < > , ; quotes, line breaks) survive");
ok(rt[0].rows[2][0] === "" && rt[0].rows[2][1] === "only B" && rt[0].rows[3][0] === "ກ", "empty cells keep the other cells in the right column");
const z = await unzip(ab(writeXlsx(templateSheets("vocabulary"))));
const sheetXml = await z.text("xl/worksheets/sheet1.xml");
ok(/<pane ySplit="1"/.test(sheetXml) && /<dataValidation type="list"[^>]*sqref="F2:F2000"/.test(sheetXml) && /<dataValidation type="list"[^>]*sqref="G2:G2000"/.test(sheetXml),
  "template: header row frozen, drop-down lists for PartOfSpeech and Stage");
// a deflate-compressed xlsx (what Excel itself saves) is read too
if (typeof CompressionStream !== "undefined"){
  const { deflateRawSync } = await import("zlib");
  const files = [["[Content_Types].xml", "<Types/>"], ["xl/workbook.xml", `<workbook xmlns:r="r"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/sharedStrings.xml", `<sst><si><t>Lao</t></si><si><r><t>ກິ</t></r><r><t>ນ</t></r></si><si><t xml:space="preserve">to eat </t></si></sst>`],
    ["xl/worksheets/sheet1.xml", `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3"><v>3</v></c><c r="C3" t="b"><v>1</v></c></row></sheetData></worksheet>`]];
  // build a real deflated zip by hand
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  for (const [name, text] of files){
    const data = enc.encode(text), comp = new Uint8Array(deflateRawSync(data)), nm = enc.encode(name), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  const cdb = Buffer.concat(cd), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  const zip = Buffer.concat([...parts, cdb, end]);
  const r = await readSheetFile({ name: "excel.xlsx", buffer: ab(new Uint8Array(zip)) });
  ok(r.format === "xlsx" && JSON.stringify(r.rows) === JSON.stringify([["Lao", "", "to eat "], ["ກິນ", "3", "TRUE"]]), "an Excel-style file: compressed, shared and rich-text strings, numbers, booleans, skipped rows", r.rows);
}

console.log("\nCSV");
ok(detectDelimiter("Lao;English;Chinese\nກິນ;to eat;吃") === ";", "semicolons (Excel with Lao regional settings) are detected");
ok(detectDelimiter("Lao\tEnglish\n") === "\t" && detectDelimiter("Lao,English\n") === ",", "tabs and commas are detected");
const c1 = parseCsv("﻿Lao,English,Topic\r\nກິນ,\"to eat, consume\",food\r\nດື່ມ,\"say \"\"hi\"\"\",\"a\nb\"\r\n\r\n");
ok(c1.rows.length === 3 && c1.rows[1][1] === "to eat, consume" && c1.rows[2][1] === "say \"hi\"" && c1.rows[2][2] === "a\nb" && c1.rows[0][0] === "Lao",
  "quotes, commas inside quotes, doubled quotes, line breaks, BOM and blank lines", c1.rows);
const c2 = parseCsv("Lao;English\nກິນ;to eat");
ok(c2.rows[1][0] === "ກິນ" && c2.rows[1][1] === "to eat", "a semicolon CSV splits into columns (it used to stay in one column)");
const back = parseCsv(toCsv([["Lao", "English"], ["ກິນ", "to eat, consume"]]).replace(/^﻿/, ""));
ok(back.rows[1][1] === "to eat, consume", "our CSV export reads back the same");
ok(decodeText(new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode("ກິນ")])).text === "ກິນ", "UTF-8 with BOM");
ok(decodeText(new Uint8Array([0xFF, 0xFE, 0x81, 0x0E])).text === "ກ", "UTF-16 (Excel 'Unicode Text')");
const ansi = decodeText(new Uint8Array([0x4C, 0x61, 0x6F, 0x2C, 0x3F, 0x3F, 0xE9]));
ok(ansi.lossy && ansi.encoding === "windows-1252", "a file that isn't UTF-8 is flagged (Lao letters can't survive it)");
const legacy = await readSheetFile({ name: "old.csv", buffer: ab(new Uint8Array([0x4C, 0x61, 0x6F, 0x3B, 0x45, 0x6E, 0x0A, 0x3F, 0x3F, 0x3F, 0x3B, 0x65, 0x61, 0x74, 0xE9])) });
ok(legacy.warnings.includes("not_utf8") && legacy.rows[1][0] === "???", "plain 'CSV' saved by Excel: read, with a warning", legacy);
let xlsErr = ""; try { await readSheetFile({ name: "old.xls", buffer: ab(new Uint8Array([0xD0, 0xCF, 0x11, 0xE0])) }); } catch(e){ xlsErr = e.message; }
ok(xlsErr === "xls_old", "old .xls files get a clear 'save as .xlsx' error");

console.log("\nheaders");
const hv = matchHeaders(["  lao ", "ROMANIZATION", "english meaning", "Part of speech", "level", "Notes"], "vocabulary");
ok(hv.map.lao === 0 && hv.map.py === 1 && hv.map.en === 2 && hv.map.pos === 3 && hv.map.stage === 4, "headers match in any order, case and spacing, with other common names", hv.map);
ok(hv.unknown.join() === "Notes" && hv.missing.length === 0, "unknown columns are listed (and ignored)");
ok(matchHeaders(["English"], "vocabulary").missing.join() === "Lao", "a missing required column is reported");
ok(guessType(templateSheets("grammar")[0].rows[0]) === "grammar" && guessType(templateSheets("patterns")[0].rows[0]) === "patterns", "the content type can be recognised from the headers");

console.log("\nchecking rows");
const V = TYPES.vocabulary.columns.map(c => c.header);
const row = o => V.map(h => o[h] ?? "");
const rows = [V, row({ Lao: "ກິນ", English: "to eat" }), row({ Lao: "kin", English: "x" }), row({ Lao: "ດື່ມ" }), row({ Lao: "ນອນ", English: "sleep", Stage: "9" }),
  row({ Lao: "ກິນ", English: "again" }), row({ Lao: "???", English: "lost" }), row({ Lao: "ໄປ", English: "go", PartOfSpeech: "Verb", Access: "premium" }), row({ Lao: "ມາ", English: "come", PartOfSpeech: "xyz" }), row({}),
  row({ Lao: "ເຂົ້າ", English: "rice", Access: "gold" })];
const res = validateRows(rows, "vocabulary", { existing: [{ id: "ໄປ", hz: "ໄປ", py: "pai", tr: { en: { meaning: "to go" }, lo: { meaning: "" }, zh: { meaning: "去" } }, level: 1, version: 3, createdAt: "x", status: "published", examples: [], tags: ["core"] }] });
const by = l => res.rows.find(r => r.line === l);
ok(res.summary.rows === 9, "the empty row is skipped (9 rows checked)", res.summary);
ok(by(2).action === "new" && !by(2).errors.length, "row 2: a good new word");
ok(by(3).errors.some(e => e.code === "not_lao"), "row 3: Lao column without Lao script → error");
ok(by(4).errors.some(e => e.code === "meaning"), "row 4: no meaning → error");
ok(by(5).errors.some(e => e.code === "stage"), "row 5: Stage 9 → error");
ok(by(6).errors.some(e => e.code === "duplicate" && e.value === 2), "row 6: the same word twice in the file → error pointing at row 2");
ok(by(7).errors.some(e => e.code === "lao_lost"), "row 7: '???' (Lao letters lost by a non-UTF-8 CSV) → error explaining how to save");
ok(by(8).action === "update" && by(8).fields.pos === "v" && by(8).fields.access === "premium", "row 8: an existing word → update; 'Verb' → v");
ok(by(9).warnings.some(w => w.code === "pos") && by(9).action === "new", "row 9: unknown part of speech → warning, still imported");
ok(by(11).errors.some(e => e.code === "access"), "row 11: unknown access level → error");
ok(res.summary.new === 2 && res.summary.update === 1 && res.summary.error === 6, "summary: new / update / errors", res.summary);
ok(/row 2/.test(message({ code: "duplicate", value: 2 })), "errors have readable messages");

console.log("\nstored content");
const rom = t => ({ py: "ROM(" + t + ")", tokens: [{ z: t, p: "x" }] });
const nw = toContent({ fields: { lao: "ກິນ", py: "", en: "to eat", lo: "", zh: "吃", pos: "v", stage: "2", tags: "food, daily", exLo: "ຂ້ອຍກິນເຂົ້າ", exEn: "I eat rice", access: "" }, existing: null }, "vocabulary", { romanize: rom, who: "admin1", status: "draft" });
ok(nw.id === "ກິນ" && nw.data.hz === "ກິນ" && nw.data.py === "rom(ກິນ)" && nw.data.level === 2 && nw.data.pos === "v" && nw.data.access === "free" && nw.data.status === "draft" && nw.data.version === 1,
  "new word: id, romanization made automatically, stage, access, status", nw);
ok(nw.data.tr.en.meaning === "to eat" && nw.data.tr.zh.meaning === "吃" && nw.data.tr.lo.meaning === "" && nw.data.tags.join() === "food,daily", "meanings in tr.en / tr.lo / tr.zh, tags split");
ok(nw.data.examples[0].zh === "ຂ້ອຍກິນເຂົ້າ" && nw.data.examples[0].tr.en === "I eat rice" && nw.data.examples[0].py && nw.data.examples[0].tokens,
  "example stored the way the app reads it ({zh, py, tokens, tr:{en}}; it used to be {zh, en})", nw.data.examples[0]);
const up = toContent(by(8), "vocabulary", { romanize: rom, who: "admin2" });
ok(up.id === "ໄປ" && up.data.tr.en.meaning === "go" && up.data.tr.zh.meaning === "去" && up.data.py === "pai" && up.data.tags.join() === "core" && up.data.createdAt === "x" && up.data.status === "published" && up.data.version === 4 && up.data.access === "premium",
  "update: changes only the filled cells, keeps the rest (Chinese, romanization, tags, created, status), version +1", up.data);
const g = toContent({ fields: { titleEn: "Past with ແລ້ວ", titleLo: "", titleZh: "", structure: "S + V + ແລ້ວ", exEn: "Done.", exLo: "", exZh: "", stage: "", examples: "ຂ້ອຍກິນແລ້ວ; ລາວໄປແລ້ວ", examplesEn: "I ate.; He went." }, existing: null }, "grammar", {});
ok(g.id === "g-past-with" && g.data.title.en === "Past with ແລ້ວ" && g.data.tr.en.explain === "Done." && Array.isArray(g.data.tr.lo.usage) && g.data.examples.length === 2 && g.data.examples[1].tr.en === "He went." && g.data.level === 1,
  "grammar: title, explanation (tr.*.explain), examples with translations, stage 1 by default", g);
const p = toContent({ fields: { lao: "ຢາກ…", py: "", formula: "S + ຢາກ + V", en: "want to", lo: "", zh: "", stage: "1", ex1: "ຂ້ອຍຢາກໄປ", ex1En: "I want to go", ex2: "", ex2En: "", ex3: "", ex3En: "" }, existing: null }, "patterns", { nextN: 42, romanize: rom });
ok(p.id === "p042" && p.data.n === 42 && p.data.gloss === "want to" && p.data.tr.en.meaning === "want to" && p.data.examples[0].tr.en === "I want to go" && p.data.sec === "A" && Array.isArray(p.data.gen),
  "pattern: numbered p042, meaning, examples, the fields the pattern page needs", p);

console.log(failed ? `\n${failed} import checks FAILED` : "\nAll import checks passed");
process.exit(failed ? 1 : 0);
