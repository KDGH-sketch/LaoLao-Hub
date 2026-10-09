// Every content row in one complete shape. Rows in a live database can miss fields (older versions of the app, imports,
// rows typed in by hand): a page that reads row.level or row.lines then shows "Stage undefined" or crashes.
// shapeItem() fills every missing field from the type's defaults (the same ones the admin editor uses for a new item,
// js/admin/schemas.js), at the place content enters the app, so no page has to guard each field.
// Tested by scripts/test_shape.mjs and scripts/qa_null_text.mjs.
import { SCHEMAS } from "../admin/schemas.js";

const plain = v => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date);
const clone = v => Array.isArray(v) ? v.map(clone) : plain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
// missing (null / undefined) fields come from def; objects are completed field by field; a wrong type is replaced
export function fillDefaults(def, row){
  if (!plain(def) || !plain(row)) return row;
  const out = Object.assign({}, row);
  for (const k in def){
    const d = def[k], v = row[k];
    if (v === null || v === undefined) out[k] = clone(d);
    else if (plain(d)) out[k] = plain(v) ? fillDefaults(d, v) : (typeof v === "string" && Object.keys(d).includes("en") ? Object.assign(clone(d), { en: v }) : v);
    else if (Array.isArray(d) && !Array.isArray(v)) out[k] = typeof v === "string" && v ? v.split(/\n/).map(x => x.trim()).filter(Boolean) : clone(d);
  }
  return out;
}
// Fields whose default only makes sense for a brand-new item (e.g. today's date) stay empty when a stored row lacks them.
const NEW_ONLY = { releases: ["date"], festivals: ["month"] };
export function shapeItem(type, row){
  const s = SCHEMAS[type];
  if (!row || !s || !s.defaults) return row;
  const out = fillDefaults(s.defaults, row);
  for (const k of NEW_ONLY[type] || []) if (row[k] === null || row[k] === undefined) out[k] = "";
  return out;
}
export const shapeAll = (type, rows) => (rows || []).map(r => shapeItem(type, r));
