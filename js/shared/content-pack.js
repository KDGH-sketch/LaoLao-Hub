// The LaoLao curriculum pack (data/curriculum-pack.json, built by scripts/build_pack.mjs from content/curriculum/):
// lessons, words, sentence patterns, grammar, dialogues, quizzes, culture stories and learning paths for Stage 1–6.
// Importing only ADDS what is not there yet (same id): nothing the team has written or edited is changed. Used by
// Admin → All content → Curriculum pack and by demo mode. Tests: scripts/test_pack.mjs, scripts/e2e_pack.mjs.
export const PACK_TYPES = ["vocabulary", "patterns", "grammar", "dialogues", "quizzes", "lessons", "culture", "paths"];

export async function loadPack(url = new URL("../../data/curriculum-pack.json", import.meta.url)){
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error("The curriculum pack could not be loaded (" + r.status + ")");
  return r.json();
}
// what an import would do: per type, how many items are new and how many are already there
export async function planPack(api, pack){
  const out = {}; let add = 0, have = 0;
  for (const type of PACK_TYPES){
    const list = (pack.items && pack.items[type]) || [];
    const existing = new Set((await api.db.list(type).catch(() => [])).map(x => String(x.id)));
    const n = list.filter(x => !existing.has(String(x.id))).length;
    out[type] = { add: n, existing: list.length - n, total: list.length }; add += n; have += list.length - n;
  }
  return { types: out, add, existing: have };
}
// add the new items (a few writes at a time); onStep(done, total, type)
export async function importPack(api, pack, who, { onStep = () => {}, concurrency = 6 } = {}){
  const now = new Date(), jobs = [];
  for (const type of PACK_TYPES){
    const list = (pack.items && pack.items[type]) || [];
    const existing = new Set((await api.db.list(type).catch(() => [])).map(x => String(x.id)));
    for (const item of list) if (!existing.has(String(item.id))){
      const { id, ...data } = item;
      jobs.push({ type, path: `${type}/${id}`, data: Object.assign(data, { version: 1, createdAt: now, updatedAt: now, createdBy: who, updatedBy: who, source: "curriculum-pack" }) });
    }
  }
  let done = 0, failed = [];
  onStep(0, jobs.length, "");
  const run = async () => { while (jobs.length){ const j = jobs.shift();
    try { await api.db.set(j.path, j.data); } catch(e){ failed.push({ path: j.path, error: String(e && e.message || e) }); }
    done++; onStep(done, done + jobs.length, j.type); } };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, run));
  return { added: done - failed.length, failed };
}
