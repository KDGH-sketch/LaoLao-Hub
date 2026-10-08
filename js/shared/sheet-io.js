// Spreadsheet files without a library: write and read .xlsx (Excel), and read CSV / TSV.
// .xlsx is a zip of XML files. Writing stores the files uncompressed (Excel accepts that); reading inflates them with the
// browser's own DecompressionStream. Works offline, in every current browser and in Node 18+ (tests: scripts/test_sheet_io.mjs).

// ---------- zip ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes){ let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const enc = new TextEncoder();
function zipStore(files){
  const parts = [], central = []; let offset = 0;
  for (const [name, text] of files){
    const data = typeof text === "string" ? enc.encode(text) : text, nm = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nm);
    offset += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of all){ out.set(p, o); o += p.length; }
  return out;
}
async function inflateRaw(bytes){
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function unzip(buffer){
  const u8 = new Uint8Array(buffer), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder();
  let e = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50){ e = i; break; }
  if (e < 0) throw new Error("not_zip");
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
  for (let i = 0; i < count; i++){
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad_zip");
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u8.subarray(start, start + csize);
    files[name] = { method, raw };
    p += 46 + nlen + xlen + clen;
  }
  return { names: Object.keys(files), async text(name){ const f = files[name]; if (!f) return null; const b = f.method === 8 ? await inflateRaw(f.raw) : f.raw; return dec.decode(b); } };
}

// ---------- xml helpers ----------
const XE = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": "\"", "&apos;": "'" };
const unxml = s => String(s).replace(/&(lt|gt|amp|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, n, d, x) => n ? XE[m] : String.fromCodePoint(d ? +d : parseInt(x, 16)));
const xml = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const attr = (tag, name) => { const m = tag.match(new RegExp("\\s" + name + "=\"([^\"]*)\"")); return m ? unxml(m[1]) : null; };
const texts = frag => [...frag.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map(m => unxml(m[1] || "")).join("");
export const colName = i => { let s = ""; i++; while (i){ const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
const colIndex = ref => { const L = ref.replace(/\d+/g, ""); let n = 0; for (const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

// ---------- write .xlsx ----------
// sheets: [{ name, rows: [[cell…]…], widths: [chars…], header: true (bold, frozen first row), lists: { colIndex: ["a","b"] } (drop-down) }]
export function writeXlsx(sheets){
  const files = [];
  const sheetXml = s => {
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => v === "" || v == null ? "" :
      `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${s.header && ri === 0 ? " s=\"1\"" : " s=\"2\""}><is><t xml:space="preserve">${xml(v)}</t></is></c>`).join("") + "</row>").join("");
    const cols = (s.widths || []).length ? "<cols>" + s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>" : "";
    const pane = s.header ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    const lists = Object.entries(s.lists || {});
    const dv = lists.length ? `<dataValidations count="${lists.length}">` + lists.map(([c, opts]) =>
      `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(+c)}2:${colName(+c)}2000"><formula1>"${xml(opts.join(","))}"</formula1></dataValidation>`).join("") + "</dataValidations>" : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows}</sheetData>${dv}</worksheet>`;
  };
  files.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + `</Types>`]);
  files.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  files.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    sheets.map((s, i) => `<sheet name="${xml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + `</sheets></workbook>`]);
  files.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  // styles: 0 default, 1 bold header on a light fill, 2 wrapped text (Lao fits in the cell)
  files.push(["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`]);
  sheets.forEach((s, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]));
  return zipStore(files);
}

// ---------- read .xlsx ----------
// Returns every sheet as rows of strings: [{ name, rows: [[…]…] }]. Shared strings, inline strings, rich text, numbers and booleans.
export async function readXlsx(buffer){
  const z = await unzip(buffer);
  const wb = await z.text("xl/workbook.xml"); if (!wb) throw new Error("not_xlsx");
  const rels = (await z.text("xl/_rels/workbook.xml.rels")) || "";
  const relMap = {}; for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) relMap[attr(m[0], "Id")] = attr(m[0], "Target");
  const ssXml = (await z.text("xl/sharedStrings.xml")) || "";
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const out = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)){
    const name = attr(m[0], "name"), rid = attr(m[0], "r:id");
    let target = relMap[rid] || ""; target = target.replace(/^\//, ""); if (!target.startsWith("xl/")) target = "xl/" + target;
    const sx = await z.text(target); if (!sx) continue;
    const rows = [];
    for (const r of sx.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)){
      const ri = (+attr("<row" + (r[1] || r[3] || ""), "r") || rows.length + 1) - 1, row = [];
      for (const c of (r[2] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const tag = "<c" + c[1], ref = attr(tag, "r"), tp = attr(tag, "t"), body = c[2] || "";
        const ci = ref ? colIndex(ref) : row.length, v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = "";
        if (tp === "s") val = shared[+v] ?? "";
        else if (tp === "inlineStr") val = texts(body);
        else if (tp === "b") val = v === "1" ? "TRUE" : "FALSE";
        else if (v != null) val = unxml(v);
        row[ci] = val;
      }
      rows[ri] = Array.from(row, x => x ?? "");
    }
    out.push({ name, rows: Array.from(rows, x => x || []) });
  }
  return out;
}

// ---------- CSV / TSV ----------
// Delimiter: comma, semicolon (Excel in Lao, French, German… regional settings) or tab, whichever splits the header best.
export function detectDelimiter(text){
  const line = text.split(/\r?\n/).find(l => l.trim()) || "";
  const count = d => { let n = 0, q = false; for (const ch of line){ if (ch === "\"") q = !q; else if (ch === d && !q) n++; } return n; };
  const best = [",", ";", "\t"].map(d => [d, count(d)]).sort((a, b) => b[1] - a[1])[0];
  return best[1] ? best[0] : ",";
}
// RFC 4180: quoted fields, "" inside quotes, line breaks inside quotes
export function parseCsv(text, delimiter){
  text = String(text).replace(/^﻿/, "");
  const d = delimiter || detectDelimiter(text), rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (q){ if (ch === "\""){ if (text[i + 1] === "\""){ f += "\""; i++; } else q = false; } else f += ch; continue; }
    if (ch === "\"" && f === "") q = true;
    else if (ch === d){ row.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r"){ if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += ch;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return { rows: rows.filter(r => r.some(c => String(c).trim() !== "")), delimiter: d };
}
export function toCsv(rows){ return "﻿" + rows.map(r => r.map(v => /[",\n\r;]/.test(v = String(v ?? "")) ? "\"" + v.replace(/"/g, "\"\"") + "\"" : v).join(",")).join("\r\n"); }
// Text files: UTF-8 (with or without BOM) or UTF-16 (Excel "Unicode text"). Anything else is read as Windows-1252 and flagged,
// because Lao letters cannot survive that encoding.
export function decodeText(buffer){
  const u8 = new Uint8Array(buffer);
  if (u8[0] === 0xFF && u8[1] === 0xFE) return { text: new TextDecoder("utf-16le").decode(u8.subarray(2)), encoding: "utf-16le" };
  if (u8[0] === 0xFE && u8[1] === 0xFF) return { text: new TextDecoder("utf-16be").decode(u8.subarray(2)), encoding: "utf-16be" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, ""), encoding: "utf-8" }; }
  catch(e){ return { text: new TextDecoder("windows-1252").decode(u8), encoding: "windows-1252", lossy: true }; }
}

// ---------- one entry point ----------
// { name, buffer } → { rows, sheet, format, warnings: [code…] }. Reads the sheet called "Data" (our templates) or the first one.
export async function readSheetFile({ name, buffer }){
  const ext = String(name || "").toLowerCase().split(".").pop(), u8 = new Uint8Array(buffer), warnings = [];
  const isZip = u8[0] === 0x50 && u8[1] === 0x4B;
  if (ext === "xls" && !isZip) throw new Error("xls_old");
  if (isZip){
    const sheets = await readXlsx(buffer);
    const s = sheets.find(x => /^(data|ຂໍ້ມູນ)$/i.test(x.name)) || sheets.find(x => x.rows.some(r => r.some(Boolean))) || sheets[0];
    if (!s) throw new Error("empty");
    return { rows: s.rows.filter(r => r.some(c => String(c).trim() !== "")), sheet: s.name, sheets: sheets.map(x => x.name), format: "xlsx", warnings };
  }
  if (u8[0] === 0xD0 && u8[1] === 0xCF) throw new Error("xls_old");
  const d = decodeText(buffer);
  if (d.lossy) warnings.push("not_utf8");
  const p = parseCsv(d.text, ext === "tsv" ? "\t" : undefined);
  if (p.rows.length && p.rows[0].length === 1 && /[,;\t]/.test(p.rows[0][0])) warnings.push("one_column");
  return { rows: p.rows, format: "csv", delimiter: p.delimiter, encoding: d.encoding, warnings };
}
