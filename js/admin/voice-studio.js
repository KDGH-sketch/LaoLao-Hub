// Admin → Voice Studio: record the narration for the app with your own voice.
// Record WORDS once; any sentence whose words are all recorded plays by itself (js/shared/speech.js stitches them).
// Record whole SENTENCES only where natural flow matters (dialogues, key examples).
//   - the to-do list comes from the content (vocabulary, dictionary, the words inside every example and dialogue line),
//     ranked by impact: "completes 3 sentences", "used in 12", "requested 4× by learners"
//   - a take stops by itself after you go quiet, is trimmed, evened out and saved as a small WAV (plays everywhere)
//   - recordings are rows of the "audio" content type (text, url, qc) and files in the laolao-assets storage bucket;
//     learners hear them after the next Publish, like any other content
import { h, icon, toast, confirmDialog, errText, tr } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { saveContent } from "../shared/content.js";
import { loadDict, dict } from "../shared/dict.js";
import { normText, planSentence, missingPieces, processTake, textId } from "../shared/audio-proc.js";
import { isComputerVoice } from "../shared/speech.js";
import { S, L, t, canEditMenu, markUnpublished, audit } from "./state.js";
import { publishFlow } from "./main.js";

const LAO = /[຀-໿]/;
const SENTENCE_TYPES = ["patterns", "lessons", "grammar", "dialogues", "vocabulary", "dictionary"];
const MAX_MS = { word: 10000, sentence: 25000 };

// Everything that could be narrated, from the content: words (with romanization and meaning) and sentences
async function collect(){
  const [rows, requests, ...lists] = await Promise.all([
    S.api.db.list("audio").catch(() => []),
    S.api.db.list("activity", { where: [["type", "==", "audio_missing"]] }).catch(() => []),
    ...SENTENCE_TYPES.map(ty => S.api.db.list(ty).catch(() => []))]);
  await loadDict().catch(() => null);
  const D = dict(), byType = Object.fromEntries(SENTENCE_TYPES.map((ty, i) => [ty, lists[i]]));
  const words = new Map(), sentences = new Map();
  const addWord = (text, rom, mean, from) => { const k = normText(text); if (!k || !LAO.test(k) || k.length > 24) return;
    const w = words.get(k) || { key: k, text: text.trim(), rom: "", mean: "", from: new Set(), kind: "word" };
    if (!w.rom && rom) w.rom = rom; if (!w.mean && mean) w.mean = mean; if (from) w.from.add(from); words.set(k, w); };
  for (const v of byType.vocabulary) addWord(v.hz, v.py, v.tr && v.tr.en && v.tr.en.meaning, "vocabulary");
  for (const d of byType.dictionary) addWord(d.hz, d.p, d.en, "dictionary");
  for (const ty of SENTENCE_TYPES) for (const doc of byType[ty]) for (const arr of ["examples", "lines"]) for (const x of (Array.isArray(doc[arr]) ? doc[arr] : [])){
    if (!x || typeof x !== "object" || !LAO.test(x.zh || "")) continue;
    const k = normText(x.zh); if (!k) continue;
    if (!sentences.has(k)) sentences.set(k, { key: k, text: x.zh.trim(), rom: x.py || "", mean: (x.tr && (x.tr.en || x.tr)) || x.en || "", from: `${ty}:${doc.id}`, dialogue: ty === "dialogues", kind: "sentence" });
    for (const tk of (x.tokens || [])) if (tk && tk.z) addWord(tk.z, tk.p, "", "sentence");
  }
  const recorded = new Map(rows.filter(r => r.url && r.text && !isComputerVoice(r)).map(r => [normText(r.text), r]));   // your voice
  const computer = new Map(rows.filter(r => r.url && r.text && isComputerVoice(r)).map(r => [normText(r.text), r]));   // Azure
  const isWord = k => words.has(k) || !!D[k];
  // the words inside each sentence (the dictionary splits Lao, which has no spaces)
  for (const s of sentences.values()) for (const k of missingPieces(s.text, () => false, isWord)) if (LAO.test(k)) addWord(k, D[k] && D[k].p, D[k] && D[k].en, "sentence");
  for (const w of words.values()){ const d = D[w.key]; if (d){ if (!w.rom) w.rom = d.p || ""; if (!w.mean) w.mean = d.en || ""; } }
  const asked = new Map(), askedText = new Map();
  for (const r of requests){ const k = normText(r.ref); if (k){ asked.set(k, (asked.get(k) || 0) + 1); if (!askedText.has(k)) askedText.set(k, String(r.ref).trim()); } }
  return { rows, recorded, computer, words, sentences, asked, askedText, isWord };
}

// Coverage and the ranked to-do lists
function rank(model){
  const { recorded, words, sentences, isWord } = model, has = k => recorded.has(k), asked = new Map(model.asked);
  const usage = new Map(), unlocks = new Map(), sentenceState = [];
  for (const s of sentences.values()){
    const plan = planSentence(s.text, has);
    const parts = missingPieces(s.text, () => false, isWord);
    for (const p of parts) usage.set(p, (usage.get(p) || 0) + 1);
    const missing = plan ? [] : missingPieces(s.text, has, isWord);
    if (missing.length === 1) unlocks.set(missing[0], (unlocks.get(missing[0]) || 0) + 1);
    const byComputer = !plan && !!planSentence(s.text, k => model.computer.has(k));
    sentenceState.push(Object.assign({}, s, { state: plan ? (plan.length === 1 && has(s.key) ? "whole" : "stitched") : byComputer ? "computer" : "missing", missing, asked: asked.get(s.key) || 0 }));
  }
  // a requested sentence also asks for its missing words
  for (const s of sentenceState) if (s.asked) for (const m of s.missing) asked.set(m, (asked.get(m) || 0) + s.asked);
  const todo = [...words.values()].filter(w => !has(w.key)).map(w => Object.assign({}, w, { used: usage.get(w.key) || 0, unlocks: unlocks.get(w.key) || 0, asked: asked.get(w.key) || 0 }));
  todo.forEach(w => { w.score = w.unlocks * 100 + w.asked * 25 + w.used * 5 + (w.from.has("vocabulary") ? 3 : 0) - w.key.length * 0.01; });
  todo.sort((a, b) => b.score - a.score);
  // requests for text that is not in the content (e.g. typed in the dictionary): listed as they are
  const otherAsked = [...model.asked].filter(([k]) => !sentences.has(k) && !words.has(k) && !has(k) && !model.computer.has(k))
    .map(([k, n]) => ({ key: k, text: model.askedText.get(k) || k, rom: "", mean: "", kind: k.length > 12 ? "sentence" : "word", from: new Set(), asked: n, missing: [], state: "missing" }));
  const sentTodo = sentenceState.filter(s => s.state !== "whole").sort((a, b) => (b.asked - a.asked) || (b.dialogue - a.dialogue) || (a.missing.length - b.missing.length));
  const wordsDone = [...words.keys()].filter(has).length;
  return { todo, sentTodo, sentenceState, usage, otherAsked,
    stats: { words: words.size, wordsDone, sentences: sentences.size, playable: sentenceState.filter(s => s.state !== "missing").length,
      whole: sentenceState.filter(s => s.state === "whole").length, computer: sentenceState.filter(s => s.state === "computer").length, requests: [...model.asked.values()].reduce((a, b) => a + b, 0) } };
}

export async function viewVoiceStudio(){
  const canEdit = canEditMenu("audioStudio");
  const root = h("div",{class:"stack-l vs"});
  let model = await collect(), ranked = rank(model);
  let tab = "todo", kind = "word", active = null, take = null, takeUrl = null, saving = false, showN = 40, query = "";
  let mic = null;                                            // { ctx, stream, src, proc } while the studio is open

  // ---------- header and coverage ----------
  const head = h("div",{class:"pagehead"},
    h("span",{class:"eyebrow"}, L(["Narration","ການບັນຍາຍ","配音"])),
    h("h1",null, L(["Voice Studio","ສະຕູດິໂອບັນທຶກສຽງ","录音室"])),
    h("p",null, L(["Record each word once in your own voice. Any sentence whose words are all recorded plays by itself, so you only record whole sentences where natural flow matters, like dialogues.",
      "ບັນທຶກແຕ່ລະຄຳດ້ວຍສຽງຂອງທ່ານເທື່ອດຽວ. ປະໂຫຍກທີ່ທຸກຄຳຖືກບັນທຶກແລ້ວຈະຫຼິ້ນໄດ້ເອງ, ບັນທຶກທັງປະໂຫຍກສະເພາະບ່ອນທີ່ຕ້ອງການຄວາມເປັນທຳມະຊາດ ເຊັ່ນ ບົດສົນທະນາ.",
      "每个词用你自己的声音录一次。句子里的词全部录好后会自动拼读，只有对话等需要自然语流的地方才需要整句录音。"])));
  const stats = h("div",{class:"kpi-row"});
  const pubBar = h("div");
  const drawStats = () => {
    const s = ranked.stats, pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
    const card = (n, label, ic, tone, sub) => h("div",{class:"card kpi-card"}, h("span",{class:"kpi-ic tone-"+tone}, icon(ic)), h("div",{class:"kpi-t"}, h("b",null,n), h("span",null,label), sub ? h("span",{class:"vs-sub"},sub) : null));
    stats.replaceChildren(
      card(pct(s.wordsDone, s.words), L(["Words recorded","ຄຳທີ່ບັນທຶກແລ້ວ","已录词语"]), "mic", "accent", `${s.wordsDone} / ${s.words}`),
      card(pct(s.playable, s.sentences), L(["Sentences that play","ປະໂຫຍກທີ່ຫຼິ້ນໄດ້","可播放的句子"]), "sound", "jade", `${s.playable} / ${s.sentences}` + (s.computer ? " · " + L([`${s.computer} by computer voice`,`${s.computer} ດ້ວຍສຽງຄອມ`,`${s.computer} 句为电脑语音`]) : "")),
      card(s.whole, L(["Whole-sentence recordings","ບັນທຶກທັງປະໂຫຍກ","整句录音"]), "speaker", "violet"),
      card(s.requests, L(["Learner requests","ຄຳຂໍຈາກຜູ້ຮຽນ","学员请求"]), "users", s.requests ? "warn" : "neutral"));
    pubBar.replaceChildren(...(S.bundle && S.bundle.dirty ? [h("div",{class:"banner vs-pub"}, icon("upload"),
      h("span",null, L(["New recordings reach learners after you publish.","ສຽງໃໝ່ຈະເຖິງຜູ້ຮຽນຫຼັງຈາກເຜີຍແຜ່.","新录音发布后学员才能听到。"])),
      h("button",{class:"btn sm primary",onclick:async()=>{ await publishFlow(); drawStats(); }}, t("publish_now")))] : []));
  };

  // ---------- recorder ----------
  const big = h("div",{class:"vs-text",lang:"lo"}), rom = h("div",{class:"vs-rom"}), mean = h("div",{class:"vs-mean"}), ctxLine = h("div",{class:"vs-ctx"});
  const ring = h("span",{class:"vs-ring","aria-hidden":"true"});
  const timer = h("span",{class:"vs-timer mono"}, "0.0 s");
  const recBtn = h("button",{class:"vs-mic",type:"button","aria-label":L(["Record","ບັນທຶກ","录音"])}, ring, icon("mic"));
  const wave = h("canvas",{class:"vs-wave",width:"640",height:"90","aria-hidden":"true"});
  const takeInfo = h("div",{class:"vs-info",role:"status","aria-live":"polite"});
  const playBtn = h("button",{class:"btn",type:"button",disabled:true}, icon("play"), L(["Play","ຫຼິ້ນ","播放"]), h("kbd",null,"P"));
  const redoBtn = h("button",{class:"btn ghost",type:"button",disabled:true}, icon("repeat"), L(["Again","ອັດໃໝ່","重录"]), h("kbd",null,"R"));
  const saveBtn = h("button",{class:"btn primary",type:"button",disabled:true}, icon("check"), L(["Save & next","ບັນທຶກ ແລະ ຕໍ່ໄປ","保存并下一个"]), h("kbd",null,"Enter"));
  const skipBtn = h("button",{class:"btn ghost",type:"button"}, L(["Skip","ຂ້າມ","跳过"]), h("kbd",null,"S"));
  const oldPlay = h("div",{class:"vs-old"});
  const custom = h("input",{class:"input",placeholder:L(["Type any Lao word or sentence to record it","ພິມຄຳ ຫຼື ປະໂຫຍກພາສາລາວເພື່ອບັນທຶກ","输入任意老挝语词句来录音"]),lang:"lo","aria-label":L(["Record any text","ບັນທຶກຂໍ້ຄວາມໃດກໍໄດ້","录任意文本"])});
  const recorder = h("section",{class:"card vs-rec"},
    h("div",{class:"vs-card-text"}, big, rom, mean, ctxLine, oldPlay),
    h("div",{class:"vs-controls"}, recBtn, h("div",{class:"vs-state"}, timer, h("small",null, L(["Space to start or stop. It stops by itself when you go quiet.","Space ເພື່ອເລີ່ມ ຫຼື ຢຸດ. ຈະຢຸດເອງເມື່ອທ່ານງຽບ.","按空格开始或停止，安静后会自动停止。"])))),
    wave, takeInfo,
    h("div",{class:"vs-actions"}, playBtn, redoBtn, saveBtn, skipBtn),
    h("form",{class:"vs-custom",onsubmit:e=>{ e.preventDefault(); const v = custom.value.trim(); if (!LAO.test(v)) return toast(L(["Type Lao text","ພິມພາສາລາວ","请输入老挝文"]),"err");
      const k = normText(v); select(model.words.get(k) || model.sentences.get(k) || { key:k, text:v, rom:"", mean:"", kind: v.length > 12 || /\s/.test(v) ? "sentence" : "word", from:new Set() }); custom.value = ""; }},
      custom, h("button",{class:"btn",type:"submit"}, icon("mic"), L(["Record this","ບັນທຶກອັນນີ້","录这个"]))));

  const setRecording = on => { recorder.classList.toggle("is-rec", on); recBtn.setAttribute("aria-pressed", String(on)); recBtn.setAttribute("aria-label", on ? L(["Stop","ຢຸດ","停止"]) : L(["Record","ບັນທຶກ","录音"])); };
  const drawWave = samples => {
    const g = wave.getContext("2d"), W = wave.width, H = wave.height, css = getComputedStyle(document.documentElement);
    g.clearRect(0, 0, W, H);
    if (!samples || !samples.length) return;
    g.fillStyle = css.getPropertyValue("--accent").trim() || "gray";
    const step = samples.length / W;
    for (let x = 0; x < W; x++){ let lo = 0, hi = 0; for (let i = Math.floor(x * step); i < Math.floor((x + 1) * step); i++){ const v = samples[i] || 0; if (v < lo) lo = v; if (v > hi) hi = v; }
      g.fillRect(x, H / 2 - hi * H / 2, 1, Math.max(1, (hi - lo) * H / 2)); }
  };
  const resetTake = () => { take = null; if (takeUrl) URL.revokeObjectURL(takeUrl); takeUrl = null; drawWave(null); takeInfo.textContent = ""; takeInfo.className = "vs-info"; playBtn.disabled = redoBtn.disabled = saveBtn.disabled = true; };

  function select(item){
    if (!canEdit) return;
    stopRecording(true); resetTake();
    active = item;
    big.textContent = item.text; rom.textContent = item.rom || ""; mean.textContent = typeof item.mean === "string" ? item.mean : tr(item.mean, lang()) || "";
    const used = ranked.usage.get(item.key) || 0, w = ranked.todo.find(x => x.key === item.key);
    ctxLine.replaceChildren(...[
      h("span",{class:"chip"}, item.kind === "sentence" ? L(["Sentence","ປະໂຫຍກ","句子"]) : L(["Word","ຄຳ","词"])),
      used ? h("span",{class:"chip acc"}, L([`Used in ${used} sentences`,`ໃຊ້ໃນ ${used} ປະໂຫຍກ`,`出现在 ${used} 个句子中`])) : null,
      w && w.unlocks ? h("span",{class:"chip lv"}, L([`Completes ${w.unlocks}`,`ເຮັດໃຫ້ຄົບ ${w.unlocks}`,`补全 ${w.unlocks} 句`])) : null,
      w && w.asked ? h("span",{class:"chip warn"}, L([`Requested ${w.asked}×`,`ຖືກຂໍ ${w.asked} ຄັ້ງ`,`被请求 ${w.asked} 次`])) : null].filter(Boolean));
    const old = model.recorded.get(item.key);
    const comp = model.computer.get(item.key);
    oldPlay.replaceChildren(...[old ? h("button",{class:"btn sm ghost",type:"button",onclick:()=>new Audio(old.url).play().catch(()=>{})}, icon("play"), L(["Current recording","ສຽງປັດຈຸບັນ","当前录音"])) : null,
      comp ? h("button",{class:"btn sm ghost",type:"button",onclick:()=>new Audio(comp.url).play().catch(()=>{})}, icon("speaker"), L(["Computer voice","ສຽງຄອມພິວເຕີ","电脑语音"])) : null].filter(Boolean));
    draw(); if (typeof drawCv === "function" && cvStatus) drawCv();
  }
  const nextItem = () => {
    const list = tab === "sentences" ? ranked.sentTodo : ranked.todo;
    const i = list.findIndex(x => active && x.key === active.key);
    const next = list[i + 1] || list.find(x => !active || x.key !== active.key);
    if (next) select(next); else { active = null; big.textContent = L(["All done here. Great work!","ສຳເລັດໝົດແລ້ວ. ເກັ່ງຫຼາຍ!","全部完成，太棒了！"]); rom.textContent = mean.textContent = ""; ctxLine.replaceChildren(); oldPlay.replaceChildren(); }
  };

  // microphone: opened once, kept while the studio is open, closed when the page is left
  async function openMic(){
    if (mic) return mic;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(L(["This browser can't record. Use Chrome, Edge, Safari or Firefox over https.","ບຣາວເຊີນີ້ບັນທຶກບໍ່ໄດ້.","此浏览器无法录音。"]));
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain();
    mute.gain.value = 0; src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    mic = { ctx, stream, src, proc };
    const release = () => { if (!root.isConnected){ closeMic(); document.removeEventListener("keydown", onKey); clearInterval(watch); } };
    const watch = setInterval(release, 1000);
    return mic;
  }
  function closeMic(){ if (!mic) return; try { mic.proc.disconnect(); mic.src.disconnect(); mic.stream.getTracks().forEach(tk => tk.stop()); mic.ctx.close(); } catch(e){} mic = null; }

  let rec = null;                                            // the take being recorded
  async function startRecording(){
    if (!active || saving || rec) return;
    try { await openMic(); } catch(e){ toast(e.name === "NotAllowedError" ? L(["Allow the microphone in the browser's address bar, then try again.","ອະນຸຍາດໄມໂຄຣໂຟນໃນແຖບທີ່ຢູ່, ແລ້ວລອງໃໝ່.","请在地址栏允许麦克风后重试。"]) : errText(e), "err"); return; }
    if (mic.ctx.state === "suspended") await mic.ctx.resume();
    resetTake();
    const rate = mic.ctx.sampleRate, max = MAX_MS[active.kind === "sentence" ? "sentence" : "word"];
    rec = { chunks: [], n: 0, heard: false, quiet: 0, floor: 0, t0: performance.now() };
    setRecording(true);
    mic.proc.onaudioprocess = e => {
      if (!rec) return;
      const d = new Float32Array(e.inputBuffer.getChannelData(0)); rec.chunks.push(d); rec.n += d.length;
      let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; const rms = Math.sqrt(s / d.length);
      const ms = rec.n / rate * 1000;
      if (ms < 250) rec.floor = Math.max(rec.floor, rms);                // the room's noise in the first moment
      const speech = Math.max(0.02, rec.floor * 3.5);
      if (rms > speech) { rec.heard = true; rec.quiet = 0; } else if (rec.heard) rec.quiet += d.length / rate * 1000;
      ring.style.transform = `scale(${1 + Math.min(0.45, rms * 6)})`;
      timer.textContent = (ms / 1000).toFixed(1) + " s";
      if ((rec.heard && rec.quiet > (active.kind === "sentence" ? 1100 : 750)) || ms > max) stopRecording();
    };
  }
  function stopRecording(discard){
    if (!rec) return;
    const r = rec; rec = null; setRecording(false); ring.style.transform = "";
    if (mic) mic.proc.onaudioprocess = null;
    if (discard) return;
    const all = new Float32Array(r.n); let o = 0; for (const c of r.chunks){ all.set(c, o); o += c.length; }
    const out = processTake(all, mic ? mic.ctx.sampleRate : 48000);
    take = out; drawWave(out.samples);
    const warn = [];
    if (out.empty) warn.push(L(["We didn't hear anything. Check the microphone and try again.","ບໍ່ໄດ້ຍິນຫຍັງ. ກວດໄມໂຄຣໂຟນແລ້ວລອງໃໝ່.","没有听到声音，请检查麦克风后重试。"]));
    else if (out.peak < 0.06) warn.push(L(["Very quiet: move closer to the microphone.","ສຽງເບົາຫຼາຍ: ເຂົ້າໃກ້ໄມໂຄຣໂຟນ.","声音太小：请靠近麦克风。"]));
    if (out.clipped) warn.push(L(["Too loud, it distorted: move back a little.","ສຽງດັງເກີນ: ຖອຍອອກໜ້ອຍໜຶ່ງ.","声音过大失真：请离远一点。"]));
    takeInfo.className = "vs-info" + (warn.length ? " warn" : " ok");
    takeInfo.textContent = warn.length ? warn.join(" ") : L([`${(out.durationMs / 1000).toFixed(1)} s · trimmed and evened out. Listen, then save.`,`${(out.durationMs / 1000).toFixed(1)} ວິ · ຕັດ ແລະ ປັບສຽງແລ້ວ. ຟັງ ແລ້ວບັນທຶກ.`,`${(out.durationMs / 1000).toFixed(1)} 秒 · 已裁剪并统一音量，试听后保存。`]);
    if (out.empty) { take = null; return; }
    takeUrl = URL.createObjectURL(new Blob([out.wav], { type: "audio/wav" }));
    playBtn.disabled = redoBtn.disabled = saveBtn.disabled = false;
    playTake();
  }
  const playTake = () => { if (takeUrl) new Audio(takeUrl).play().catch(() => {}); };

  async function saveTake(){
    if (!take || !active || saving) return;
    saving = true; saveBtn.disabled = true;
    try {
      const prev = model.recorded.get(active.key) || model.rows.find(r => normText(r.text) === active.key && !isComputerVoice(r));
      const id = prev ? prev.id : "rec-" + textId(active.key);
      const file = new File([take.wav], `${id}.wav`, { type: "audio/wav" });
      const url = await S.api.storage.upload(file, `audio/voice/${id}-${Date.now().toString(36)}.wav`);
      const data = Object.assign({}, prev || {}, { text: active.text, lang: "lo", type: active.kind === "sentence" ? "sentence" : "word", speaker: S.me.name || S.me.email || "",
        speed: "normal", url, durationMs: take.durationMs, status: "published", access: (prev && prev.access) || "free", qc: "needs_review", source: "studio" });
      delete data.id;
      await saveContent(S.api, "audio", id, data, S.me.uid);
      markUnpublished(); audit("record", "audio/" + id, active.text);
      const row = Object.assign({ id }, data);
      model.rows = model.rows.filter(r => r.id !== id).concat(row); model.recorded.set(active.key, row);
      ranked = rank(model);
      S.leaveGuard = null;
      toast(L(["Saved","ບັນທຶກແລ້ວ","已保存"]) + " · " + active.text, "ok");
      resetTake(); drawStats(); nextItem();
    } catch(e){ toast(errText(e), "err"); saveBtn.disabled = false; }
    saving = false;
  }
  recBtn.onclick = () => rec ? stopRecording() : startRecording();
  playBtn.onclick = playTake; redoBtn.onclick = () => { resetTake(); startRecording(); };
  saveBtn.onclick = saveTake; skipBtn.onclick = () => { stopRecording(true); resetTake(); nextItem(); };
  S.leaveGuard = () => !!take;                                 // an unsaved take asks before leaving

  const onKey = e => {
    if (!root.isConnected || e.target.closest("input,textarea,select,[contenteditable]") || e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".dialog:not(.out)")) return;
    const k = e.key.toLowerCase();
    if (k === " "){ e.preventDefault(); recBtn.click(); }
    else if (k === "enter" && take){ e.preventDefault(); saveTake(); }
    else if (k === "p" && take){ playTake(); }
    else if (k === "r" && !rec){ redoBtn.disabled ? startRecording() : redoBtn.click(); }
    else if (k === "s"){ skipBtn.click(); }
  };
  document.addEventListener("keydown", onKey);

  // ---------- computer voice (Azure, through the "tts" Edge Function; docs/AZURE_VOICE.md) ----------
  const cv = h("section",{class:"card vs-cvcard"});
  let cvStatus = null, cvBusy = false, cvVoice = "lo-LA-KeomanyNeural", cvSlow = false;
  const cvProgress = h("div",{class:"vs-info",role:"status","aria-live":"polite"});
  async function generate(items){
    if (cvBusy || !items.length) return;
    const chars = items.reduce((n, x) => n + x.text.length, 0), left = cvStatus ? cvStatus.limit - cvStatus.used : 0;
    if (chars > left) return toast(L([`That is ${chars} characters; ${left} are left this month.`,`ນັ້ນແມ່ນ ${chars} ຕົວອັກສອນ; ເຫຼືອ ${left} ໃນເດືອນນີ້.`,`共 ${chars} 个字符，本月只剩 ${left} 个。`]), "err");
    if (items.length > 1 && !await confirmDialog(L(["Computer voice","ສຽງຄອມພິວເຕີ","电脑语音"]),
      L([`Create computer-voice audio for ${items.length} texts (${chars} characters of this month's ${cvStatus.limit - cvStatus.used} left)? Your own recordings always play first.`,
        `ສ້າງສຽງຄອມພິວເຕີ ${items.length} ຂໍ້ຄວາມ (${chars} ຕົວອັກສອນ)? ສຽງຂອງທ່ານຈະຫຼິ້ນກ່ອນສະເໝີ.`, `为 ${items.length} 段文字生成电脑语音（${chars} 个字符）？你自己的录音始终优先播放。`]),
      L(["Create","ສ້າງ","生成"]), t("cancel"))) return;
    cvBusy = true; drawCv();
    let done = 0, failed = 0;
    try {
      for (let i = 0; i < items.length; i += 10){
        const batch = items.slice(i, i + 10);
        cvProgress.textContent = L([`Creating ${Math.min(i + batch.length, items.length)} of ${items.length}…`,`ກຳລັງສ້າງ ${Math.min(i + batch.length, items.length)} ຈາກ ${items.length}…`,`正在生成 ${Math.min(i + batch.length, items.length)} / ${items.length}…`]);
        const res = await S.api.tts.speak(batch.map(x => x.text), cvVoice, cvSlow);
        if (cvStatus && res.used != null) cvStatus.used = res.used;
        for (let j = 0; j < res.items.length; j++){
          const it = res.items[j], src = batch[j];
          if (it.error){ failed++; if (it.error === "azure_key_rejected") throw Object.assign(new Error(L(["Azure refused the key. Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.","Azure ປະຕິເສດກະແຈ.","Azure 拒绝了密钥，请检查设置。"])), {}); continue; }
          const mime = it.mime || "audio/mpeg", ext = mime === "audio/wav" ? "wav" : "mp3";
          const bytes = Uint8Array.from(atob(it.audio), c => c.charCodeAt(0));
          const id = "tts-" + textId(src.key);
          const url = await S.api.storage.upload(new File([bytes], `${id}.${ext}`, { type: mime }), `audio/tts/${id}-${Date.now().toString(36)}.${ext}`);
          const voice = (cvStatus.voices || []).find(v => v.id === cvVoice);
          const data = { text: src.text, lang: "lo", type: src.kind === "sentence" || src.text.length > 12 ? "sentence" : "word", speaker: "Azure · " + (voice ? voice.label : cvVoice), voice: cvVoice,
            speed: cvSlow ? "slow" : "normal", url, status: "published", access: "free", qc: "needs_review", source: "azure" };
          await saveContent(S.api, "audio", id, data, S.me.uid);
          const row = Object.assign({ id }, data);
          model.rows = model.rows.filter(r => r.id !== id).concat(row); model.computer.set(src.key, row);
          done++;
        }
      }
      markUnpublished(); audit("tts", "audio", `${done} texts`);
      toast(L([`Created ${done}` + (failed ? `, ${failed} failed` : ""), `ສ້າງ ${done}` + (failed ? `, ລົ້ມເຫຼວ ${failed}` : ""), `已生成 ${done}` + (failed ? `，失败 ${failed}` : "")]), failed ? "err" : "ok");
    } catch(e){
      toast(e.code === "monthly_limit" ? L(["This month's character limit is reached.","ຮອດຂີດຈຳກັດຂອງເດືອນນີ້ແລ້ວ.","本月字符额度已用完。"]) : e.code === "not_configured" || e.code === "tts_unavailable" ? L(["The computer voice isn't connected yet.","ສຽງຄອມພິວເຕີຍັງບໍ່ໄດ້ເຊື່ອມຕໍ່.","电脑语音尚未连接。"]) : errText(e), "err");
    }
    cvBusy = false; cvProgress.textContent = "";
    ranked = rank(model); drawStats(); draw(); drawCv();
  }
  const cvTargets = () => {
    const sent = ranked.sentenceState.filter(s => s.state === "missing");
    const asked = ranked.sentenceState.filter(s => s.asked && s.state === "missing").concat(ranked.todo.filter(w => w.asked && !model.computer.has(w.key)), ranked.otherAsked);
    return { sent, asked };
  };
  function drawCv(){
    const st = cvStatus;
    if (!st){ cv.replaceChildren(h("h3",null, icon("speaker"), " ", L(["Computer voice (Azure)","ສຽງຄອມພິວເຕີ (Azure)","电脑语音（Azure）"])), h("p",{class:"muted small"}, L(["Checking the connection…","ກຳລັງກວດການເຊື່ອມຕໍ່…","正在检查连接…"]))); return; }
    const title = h("h3",null, icon("speaker"), " ", L(["Computer voice (Azure)","ສຽງຄອມພິວເຕີ (Azure)","电脑语音（Azure）"]),
      h("span",{class:"chip " + (st.configured ? "lv" : "warn")}, st.configured ? (st.demo ? L(["Demo tone","ສຽງທົດລອງ","演示音"]) : L(["Connected","ເຊື່ອມຕໍ່ແລ້ວ","已连接"])) : L(["Not connected","ຍັງບໍ່ເຊື່ອມຕໍ່","未连接"])));
    if (!st.configured){
      cv.replaceChildren(title, h("p",{class:"small"}, L(["Fill the gaps with Microsoft Azure's Lao voices (Keomany, Chanthavong) until you have recorded them yourself. Your recordings always play first.",
        "ຕື່ມຊ່ອງຫວ່າງດ້ວຍສຽງລາວຂອງ Azure ຈົນກວ່າທ່ານຈະບັນທຶກເອງ. ສຽງຂອງທ່ານຈະຫຼິ້ນກ່ອນສະເໝີ.","在你亲自录音之前，可用 Azure 的老挝语语音填补空缺。你的录音始终优先。"])),
        h("p",{class:"small muted"}, L(["To connect: create a free Azure Speech resource, then deploy the tts function and set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION. Step by step: docs/AZURE_VOICE.md in the project.",
          "ວິທີເຊື່ອມຕໍ່: ເບິ່ງ docs/AZURE_VOICE.md.","连接方法见项目中的 docs/AZURE_VOICE.md。"])));
      return;
    }
    const { sent, asked } = cvTargets(), pct = st.limit ? Math.min(100, Math.round(st.used / st.limit * 100)) : 0;
    const voiceSel = h("select",{class:"input sm","aria-label":L(["Voice","ສຽງ","声音"]),onchange:e=>{ cvVoice = e.target.value; }}, (st.voices || []).map(v => h("option",{value:v.id,selected:v.id === cvVoice}, v.label)));
    const slow = h("label",{class:"row small"}, h("input",{type:"checkbox",checked:cvSlow,onchange:e=>{ cvSlow = e.target.checked; }}), L(["Slower","ຊ້າລົງ","慢一点"]));
    const btn = (label, list, primary) => h("button",{class:"btn sm" + (primary ? " primary" : ""),type:"button",disabled:cvBusy || !list.length,onclick:()=>generate(list)}, label);
    cv.replaceChildren(title,
      h("div",{class:"vs-meter","aria-label":L(["Characters used this month","ຕົວອັກສອນທີ່ໃຊ້ເດືອນນີ້","本月已用字符"])}, h("i",{style:`width:${pct}%`})),
      h("p",{class:"small muted"}, L([`${st.used.toLocaleString()} of ${st.limit.toLocaleString()} characters used this month`,`ໃຊ້ແລ້ວ ${st.used.toLocaleString()} ຈາກ ${st.limit.toLocaleString()} ຕົວອັກສອນໃນເດືອນນີ້`,`本月已用 ${st.used.toLocaleString()} / ${st.limit.toLocaleString()} 个字符`]) + (st.region ? " · " + st.region : "")),
      h("div",{class:"vs-cvrow"}, voiceSel, slow),
      h("div",{class:"vs-actions"},
        btn(L(["This text","ຂໍ້ຄວາມນີ້","当前文本"]), active ? [active] : [], true),
        btn(L([`Learner requests (${asked.length})`,`ຄຳຂໍ (${asked.length})`,`学员请求（${asked.length}）`]), asked),
        btn(L([`Sentences without audio (${sent.length})`,`ປະໂຫຍກທີ່ບໍ່ມີສຽງ (${sent.length})`,`无音频的句子（${sent.length}）`]), sent)),
      cvProgress,
      h("p",{class:"small muted"}, L(["Each text is created once and saved; learners hear it after you publish. Your own recording of a text always plays instead.",
        "ແຕ່ລະຂໍ້ຄວາມສ້າງເທື່ອດຽວ ແລະ ບັນທຶກໄວ້; ຜູ້ຮຽນໄດ້ຍິນຫຼັງເຜີຍແຜ່. ສຽງທີ່ທ່ານບັນທຶກເອງຈະຫຼິ້ນແທນສະເໝີ.","每段文字只生成一次并保存，发布后学员即可听到。你自己的录音始终优先播放。"])));
  }
  drawCv();
  if (S.api.tts) S.api.tts.status().then(st => { cvStatus = st || { configured: false }; drawCv(); }); else { cvStatus = { configured: false }; drawCv(); }

  // ---------- lists ----------
  const tabs = h("div",{class:"tabs",role:"tablist"});
  const listBox = h("div",{class:"vs-list"});
  const search = h("input",{class:"input",type:"search",placeholder:L(["Find a word or sentence","ຊອກຫາຄຳ ຫຼື ປະໂຫຍກ","查找词或句子"]),"aria-label":L(["Find","ຊອກຫາ","查找"]),oninput:e=>{ query = normText(e.target.value) || e.target.value.trim(); showN = 40; draw(); }});
  const item = (x, extra) => h("button",{class:"vs-item"+(active && active.key === x.key ? " on" : ""),type:"button",onclick:()=>select(x)},
    h("span",{class:"vs-item-t",lang:"lo"}, x.text), h("span",{class:"vs-item-r"}, x.rom || ""), h("span",{class:"vs-item-m"}, typeof x.mean === "string" ? x.mean : tr(x.mean, lang()) || ""), h("span",{class:"vs-item-b"}, ...extra.filter(Boolean)));
  const more = n => n > showN ? h("button",{class:"btn ghost sm vs-more",type:"button",onclick:()=>{ showN += 60; draw(); }}, L([`Show more (${n - showN})`,`ສະແດງເພີ່ມ (${n - showN})`,`显示更多（${n - showN}）`])) : null;
  const match = x => !query || x.key.includes(query) || (x.rom || "").toLowerCase().includes(query.toLowerCase()) || String(typeof x.mean === "string" ? x.mean : "").toLowerCase().includes(query.toLowerCase());
  function draw(){
    const counts = { todo: ranked.todo.length, sentences: ranked.sentTodo.length, requests: ranked.sentenceState.filter(s => s.asked).length + ranked.todo.filter(w => w.asked).length + ranked.otherAsked.length, done: model.rows.filter(r => r.url).length };
    tabs.replaceChildren(...[["todo", L(["Words to record","ຄຳທີ່ຕ້ອງບັນທຶກ","待录词语"])], ["sentences", L(["Sentences","ປະໂຫຍກ","句子"])], ["requests", L(["Learner requests","ຄຳຂໍຈາກຜູ້ຮຽນ","学员请求"])], ["done", L(["Recorded","ບັນທຶກແລ້ວ","已录音"])]]
      .map(([id, label]) => h("button",{role:"tab","aria-selected":String(tab === id),onclick:()=>{ tab = id; showN = 40; draw(); }}, label, h("span",{class:"vs-count"}, counts[id]))));
    let rows = [];
    if (tab === "todo"){
      const list = ranked.todo.filter(match);
      rows = list.slice(0, showN).map(w => item(w, [w.unlocks ? h("span",{class:"chip lv"}, L([`completes ${w.unlocks}`,`ຄົບ ${w.unlocks}`,`补全 ${w.unlocks}`])) : null,
        w.asked ? h("span",{class:"chip warn"}, `${w.asked}×`) : null, w.used ? h("span",{class:"chip"}, L([`in ${w.used}`,`ໃນ ${w.used}`,`${w.used} 句`])) : null]));
      if (!list.length) rows = [h("p",{class:"muted"}, L(["Every word is recorded.","ທຸກຄຳຖືກບັນທຶກແລ້ວ.","所有词语都已录音。"]))];
      rows.push(more(list.length));
    } else if (tab === "sentences" || tab === "requests"){
      const list = (tab === "requests" ? ranked.sentenceState.filter(s => s.asked).concat(ranked.todo.filter(w => w.asked), ranked.otherAsked) : ranked.sentenceState).filter(match)
        .sort((a, b) => (b.asked || 0) - (a.asked || 0) || ((a.state === "missing") - (b.state === "missing")) * -1);
      rows = list.slice(0, showN).map(s => s.kind === "word" ? item(s, [h("span",{class:"chip warn"}, `${s.asked}×`)]) : h("div",{class:"vs-sent"},
        item(s, [s.asked ? h("span",{class:"chip warn"}, `${s.asked}×`) : null,
          s.state === "whole" ? h("span",{class:"chip lv"}, icon("check"), L(["Whole recording","ບັນທຶກທັງປະໂຫຍກ","整句录音"]))
          : s.state === "stitched" ? h("span",{class:"chip acc"}, icon("sound"), L(["Plays from words","ຫຼິ້ນຈາກຄຳ","由词语拼读"]))
          : s.state === "computer" ? h("span",{class:"chip violet"}, icon("speaker"), L(["Computer voice","ສຽງຄອມພິວເຕີ","电脑语音"]))
          : h("span",{class:"chip warn"}, L([`${s.missing.length} word(s) missing`,`ຂາດ ${s.missing.length} ຄຳ`,`缺 ${s.missing.length} 个词`]))]),
        s.missing.length ? h("div",{class:"vs-missing"}, s.missing.map(m => h("button",{class:"chip",type:"button",lang:"lo",onclick:()=>select(model.words.get(m) || { key:m, text:m, rom:"", mean:"", kind:"word", from:new Set() })}, icon("mic"), m))) : null));
      if (!list.length) rows = [h("p",{class:"muted"}, tab === "requests" ? L(["No requests yet. When learners tap play on something without audio, it shows up here.","ຍັງບໍ່ມີຄຳຂໍ.","暂无请求。学员点击没有录音的内容时会显示在这里。"]) : L(["No sentences found.","ບໍ່ພົບປະໂຫຍກ.","没有找到句子。"]))];
      rows.push(more(list.length));
    } else {
      const list = model.rows.filter(r => r.url).map(r => Object.assign({ key: normText(r.text) }, r)).filter(match).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      rows = list.slice(0, showN).map(r => h("div",{class:"vs-done"},
        h("button",{class:"btn sm icon-only",type:"button","aria-label":L(["Play","ຫຼິ້ນ","播放"]),onclick:()=>new Audio(r.url).play().catch(()=>{})}, icon("play")),
        h("span",{class:"vs-item-t",lang:"lo"}, r.text), h("span",{class:"chip" + (isComputerVoice(r) ? " violet" : "")}, isComputerVoice(r) ? L(["Computer voice","ສຽງຄອມພິວເຕີ","电脑语音"]) : L(["Your voice","ສຽງຂອງທ່ານ","你的声音"])), h("span",{class:"chip"}, r.type || "word"),
        canEdit ? h("select",{class:"input sm","aria-label":L(["Review status","ສະຖານະກວດ","审核状态"]),onchange:async e=>{ try { await saveContent(S.api, "audio", r.id, Object.assign({}, r, { qc: e.target.value, id: undefined, key: undefined }), S.me.uid); r.qc = e.target.value; toast(t("saved"), "ok"); } catch(err){ toast(errText(err), "err"); } }},
          [["needs_review", L(["Needs review","ລໍຖ້າກວດ","待审核"])], ["verified", L(["Approved","ອະນຸມັດແລ້ວ","已通过"])]].map(([v, l]) => h("option",{value:v,selected:(r.qc || "needs_review") === v}, l))) : h("span",{class:"chip"}, r.qc || ""),
        canEdit ? h("button",{class:"btn sm ghost",type:"button",onclick:()=>{ select(model.words.get(r.key) || model.sentences.get(r.key) || { key:r.key, text:r.text, rom:"", mean:"", kind:r.type === "sentence" ? "sentence" : "word", from:new Set() }); window.scrollTo({ top: 0, behavior: "smooth" }); }}, icon("mic"), L(["Re-record","ອັດໃໝ່","重录"])) : null,
        canEdit ? h("button",{class:"btn sm ghost vs-del",type:"button","aria-label":L(["Delete","ລຶບ","删除"]),onclick:async()=>{
          if (!await confirmDialog(L(["Delete recording","ລຶບສຽງບັນທຶກ","删除录音"]), r.text, L(["Delete","ລຶບ","删除"]), t("cancel"), true)) return;
          try { await S.api.db.del(`audio/${r.id}`); await S.api.db.set("settings/bundle", { dirty: true }, true); markUnpublished(); audit("delete", "audio/" + r.id, r.text);
            model.rows = model.rows.filter(x => x.id !== r.id); (isComputerVoice(r) ? model.computer : model.recorded).delete(r.key); ranked = rank(model); drawStats(); draw(); } catch(err){ toast(errText(err), "err"); } }}, icon("trash")) : null));
      if (!list.length) rows = [h("p",{class:"muted"}, L(["Nothing recorded yet. Pick a word and press the microphone.","ຍັງບໍ່ມີການບັນທຶກ.","还没有录音。选一个词，按麦克风开始。"]))];
      rows.push(more(list.length));
    }
    listBox.replaceChildren(...rows.filter(Boolean));
  }

  drawStats();
  root.append(...[head, stats, pubBar,
    !canEdit ? h("div",{class:"banner"}, icon("eye"), t("read_only_banner")) : null,
    h("div",{class:"vs-grid"},
      canEdit ? h("div",{class:"vs-left"}, recorder, cv) : null,
      h("section",{class:"card vs-lists"}, tabs, search, listBox)),
    h("details",{class:"card vs-tips"}, h("summary",null, L(["Tips for clean recordings","ເຄັດລັບການບັນທຶກ","录音小贴士"])),
      h("ul",null, ...[L(["A quiet room with soft things around (curtains, a sofa) sounds best.","ຫ້ອງງຽບທີ່ມີຜ້າມ່ານ ຫຼື ໂຊຟາຊ່ວຍໃຫ້ສຽງດີ.","安静、有窗帘或沙发的房间效果最好。"]),
        L(["Keep the phone or microphone about a hand's width from your mouth, the same every time.","ຖືໄມໂຄຣໂຟນຫ່າງປາກປະມານຝາມື, ໃຫ້ເທົ່າກັນທຸກຄັ້ງ.","麦克风离嘴约一掌宽，每次保持相同。"]),
        L(["Say words clearly and naturally, as you would to a learner. Record in a few long sessions so your voice sounds the same.","ອອກສຽງຊັດເຈນ ແລະ ເປັນທຳມະຊາດ. ບັນທຶກເປັນຊ່ວງຍາວສອງສາມຄັ້ງ ເພື່ອໃຫ້ສຽງຄືກັນ.","清楚自然地读出，分几次集中录完，声音更统一。"]),
        L(["Record whole sentences for dialogues; for everything else, words are enough.","ບັນທຶກທັງປະໂຫຍກສຳລັບບົດສົນທະນາ; ນອກນັ້ນບັນທຶກຄຳກໍພໍ.","对话录整句，其他内容录词语就够了。"])].map(x => h("li",null,x))))].filter(Boolean));
  if (canEdit){ const first = ranked.todo[0] || ranked.sentTodo[0]; if (first) select(first); else nextItem(); }
  draw();
  return root;
}
