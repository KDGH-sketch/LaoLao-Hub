// Tone & sound lab (routes "tone_lab" and "pronounce_lab", two tabs of one menu entry): a clean reference built on the
// same tone engine as the Pronunciation Studio (js/shared/lao-tone.js), so the lab, the course and the voice coach never
// disagree. Tones: the six tones (from Admin → Tone Lab), a tone finder that explains any word, the rules at a glance,
// and words that differ only in tone. Syllables & sounds: the parts of a syllable for any word, the eight final sounds,
// short and long vowels. Tests: scripts/e2e_nav.mjs (labs) and scripts/test_pron.mjs (the engine).
import { h, icon } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";
import { analyse, toneOf, contourCurve, DEFAULT_CONTOURS } from "../shared/lao-tone.js";
import { TONE_PAIRS } from "../shared/practice-bank.js";
import { A } from "./core.js";

export const SOUND_VIEWS = {};
const go = (...a) => A.go(...a);
const L = (en, lo, zh) => lang() === "lo" ? lo : lang() === "zh" ? zh : en;
const TONE_NAMES = { 1:["Mid level","ສຽງສາມັນ","中平调"], 2:["Low","ສຽງເອກ (ຕ່ຳ)","低调"], 3:["Low-mid falling","ສຽງໂທ (ລົງກາງ)","中低降调"], 4:["High","ສຽງສູງ","高调"], 5:["Rising","ສຽງຈັດຕະວາ (ຂຶ້ນ)","升调"], 6:["High falling","ສຽງສູງລົງ","高降调"] };
// words for the examples when the Tone Lab content has none that the tone rules agree with
const FALLBACK_WORDS = ["ກາ","ດີ","ປາ","ມາ","ໄປ","ກ່າ","ໄກ່","ແມ່","ບໍ່","ກ້າ","ເຂົ້າ","ຂ້ອຍ","ປ້າ","ມ້າ","ນ້ຳ","ລູກ","ມີດ","ຂາ","ໝາ","ສີ","ຫົວ","ສອງ","ນົກ","ຮັກ","ມົດ"];
function tones(){
  const list = (A.B && A.B.tones && A.B.tones.length) ? A.B.tones : Object.values(A.byType.tones || {});
  const toneOfWord = w => { const s = analyse(w); return s.length === 1 ? s[0].tone : 0; };
  return [1,2,3,4,5,6].map(n => { const x = (list || []).find(y => +y.num === n) || {};
    // only examples whose tone the rules agree with, so this page never contradicts the tone finder below it
    let ex = (x.examples || []).filter(e => e && e.lao && toneOfWord(e.lao) === n);
    if (ex.length < 3) ex = ex.concat(FALLBACK_WORDS.filter(w => toneOfWord(w) === n && !ex.some(e => e.lao === w)).map(w => ({ lao:w })));
    return { n, contour: x.contour || DEFAULT_CONTOURS[n], name: (x.name && (x.name[lang()] || x.name.en)) || L(...TONE_NAMES[n]), desc: x.desc ? (x.desc[lang()] || x.desc.en) : "",
      examples: ex.slice(0, 3) }; });
}
// a small pitch line of a contour ("33", "52"…), in its tone colour
function spark(contour, n, w = 120, hgt = 44){
  const c = contourCurve(contour, 24), pts = c.map((v, i) => (6 + (w - 12) * i / 23).toFixed(1) + "," + (hgt - 6 - (v - 1) / 4 * (hgt - 12)).toFixed(1)).join(" ");
  const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox",`0 0 ${w} ${hgt}`); s.setAttribute("class","sl-spark tn" + n); s.setAttribute("aria-hidden","true");
  s.innerHTML = [1,3,5].map(l => `<line x1="4" x2="${w - 4}" y1="${(hgt - 6 - (l - 1) / 4 * (hgt - 12)).toFixed(1)}" y2="${(hgt - 6 - (l - 1) / 4 * (hgt - 12)).toFixed(1)}" class="g"/>`).join("") + `<polyline points="${pts}"/>`;
  return s;
}
const toneChip = n => h("span",{class:"sl-tchip tn" + n,title:t("pn_tone_n", { n })}, String(n));
// the tabs of the lab (a segmented control, like iOS)
function tabs(cur){
  return h("div",{class:"sl-seg",role:"tablist","aria-label":t("nav_soundlab")},
    [["tone_lab", t("nav_tone_lab"), "sound"], ["pronounce_lab", t("nav_pronounce"), "headphones"]].map(([k, l, ic]) =>
      h("button",{role:"tab","aria-selected":String(cur === k),onclick:()=>{ if (cur !== k) go(k, {}, false); }}, icon(ic), h("span",null, l))));
}
const head = (title, sub) => h("div",{class:"sl-head"}, h("h1",null, title), sub ? h("p",null, sub) : null);
const group = (title, ...rows) => h("section",{class:"sl-group"}, title ? h("h2",{class:"sl-gt"}, title) : null, h("div",{class:"sl-list"}, ...rows));

// ---------- Tones ----------
SOUND_VIEWS.tone_lab = () => {
  const T = tones();
  const root = h("div",{class:"sl"}, tabs("tone_lab"),
    head(t("nav_tone_lab"), L("Vientiane Lao has six tones. The same syllable on another pitch is another word.", "ພາສາລາວວຽງຈັນມີ 6 ວັນນະຍຸດ: ພະຍາງດຽວກັນ ແຕ່ລະດັບສຽງຕ່າງກັນ ກໍເປັນຄຳໃໝ່.", "万象老挝语有六个声调：同一个音节，音高不同就是不同的词。")));
  // the six tones
  root.append(h("section",{class:"sl-group"}, h("h2",{class:"sl-gt"}, L("The six tones","6 ວັນນະຍຸດ","六个声调")),
    h("div",{class:"sl-tones"}, T.map(x => h("button",{class:"sl-tone tn" + x.n,"data-tone":x.n,onclick:()=>{ const w = x.examples[0]; if (w) speak(w.lao); }},
      h("div",{class:"sl-tone-h"}, toneChip(x.n), h("b",null, x.name), h("small",{class:"tabnum"}, x.contour)),
      spark(x.contour, x.n),
      x.examples.length ? h("div",{class:"sl-ex"}, x.examples.map(e => h("span",{class:"lo",lang:"lo",onclick:ev=>{ ev.stopPropagation(); speak(e.lao); }}, e.lao))) : null)))));
  // tone finder
  const out = h("div",{class:"sl-list"});
  const inp = h("input",{class:"sl-input lo",lang:"lo",type:"text",value:"ສະບາຍດີ","aria-label":L("A Lao word","ຄຳລາວ","老挝语词"),placeholder:L("Type or paste a Lao word","ພິມຄຳລາວ","输入老挝语词"),oninput:()=>explain()});
  function explain(){
    const w = inp.value.trim(), syl = analyse(w);
    if (!syl.length){ out.replaceChildren(h("div",{class:"sl-row muted"}, L("Type a word in Lao script.","ພິມຄຳເປັນຕົວອັກສອນລາວ.","请输入老挝文字。"))); return; }
    out.replaceChildren(...syl.map(s => h("div",{class:"sl-row sl-syl"},
      h("button",{class:"sl-sylw lo",lang:"lo",onclick:()=>speak(s.text)}, s.text),
      h("div",{class:"sl-why"},
        h("span",null, h("small",null, L("Letter","ພະຍັນຊະນະ","辅音")), h("b",null, L(...{ middle:["middle","ກາງ","中"], high:["high","ສູງ","高"], low:["low","ຕ່ຳ","低"] }[s.cls]))),
        h("span",null, h("small",null, L("Syllable","ພະຍາງ","音节")), h("b",null, s.dead ? L("dead","ຕາຍ","死音节") : L("live","ເປັນ","活音节"))),
        h("span",null, h("small",null, L("Vowel","ສະຫຼະ","元音")), h("b",null, s.long ? L("long","ຍາວ","长") : L("short","ສັ້ນ","短"))),
        h("span",null, h("small",null, L("Mark","ໄມ້","声调符号")), h("b",null, { "":"—", ek:"◌່", tho:"◌້", ti:"◌໊", chat:"◌໋" }[s.mark || ""]))),
      h("div",{class:"sl-res tn" + s.tone}, toneChip(s.tone), h("span",null, T[s.tone - 1].name)))));
  }
  explain();
  root.append(h("section",{class:"sl-group"}, h("h2",{class:"sl-gt"}, L("Tone finder","ຊອກວັນນະຍຸດ","声调查询")),
    h("p",{class:"sl-note"}, L("Any word: each syllable's tone and why.","ຄຳໃດກໍໄດ້: ວັນນະຍຸດຂອງແຕ່ລະພະຍາງ ແລະ ເຫດຜົນ.","任意词语：每个音节的声调及原因。")),
    h("div",{class:"sl-finder"}, inp, h("button",{class:"btn",onclick:()=>speak(inp.value.trim())}, icon("play"), t("play"))),
    h("div",{class:"sl-chips"}, ["ຂອບໃຈ","ເຂົ້າໜຽວ","ຫຼວງພະບາງ","ມ້າ","ນ້ຳ","ໝາກມ່ວງ"].map(w => h("button",{class:"lo",lang:"lo",onclick:()=>{ inp.value = w; explain(); speak(w); }}, w))), out));
  // the rules at a glance (computed by the same engine)
  const cols = [["live", L("Live, no mark","ເປັນ, ບໍ່ມີໄມ້","活音节，无符号"), { mark:"", final:"", marks:"", tail:"າ" }], ["ek", "◌່", { mark:"ek", final:"", marks:"", tail:"າ" }], ["tho", "◌້", { mark:"tho", final:"", marks:"", tail:"າ" }],
    ["ds", L("Dead, short","ຕາຍ, ສັ້ນ","死音节，短"), { mark:"", final:"ກ", marks:"ັ", tail:"" }], ["dl", L("Dead, long","ຕາຍ, ຍາວ","死音节，长"), { mark:"", final:"ກ", marks:"", tail:"າ" }]];
  root.append(h("section",{class:"sl-group"}, h("h2",{class:"sl-gt"}, L("The rules at a glance","ກົດໂດຍຫຍໍ້","规则一览")),
    h("div",{class:"sl-rules",role:"table"},
      h("div",{class:"sl-rr sl-rh",role:"row"}, h("span",{role:"columnheader"}), cols.map(c => h("span",{role:"columnheader"}, c[1]))),
      ...[["middle","ກ ຈ ດ ຕ ບ ປ ຢ ອ"],["high","ຂ ສ ຖ ຜ ຝ ຫ"],["low","ຄ ງ ຊ ຍ ທ ນ ພ ຟ ມ ລ ວ ຮ"]].map(([cls, letters]) => h("div",{class:"sl-rr",role:"row"},
        h("span",{role:"rowheader"}, h("b",null, L(...{ middle:["Middle","ກາງ","中辅音"], high:["High","ສູງ","高辅音"], low:["Low","ຕ່ຳ","低辅音"] }[cls])), h("small",{class:"lo",lang:"lo"}, letters)),
        cols.map(c => h("span",{role:"cell"}, toneChip(toneOf(Object.assign({ cls, lead:"" }, c[2]))))))))));
  // words that differ only in tone
  root.append(group(L("Hear the difference","ຟັງຄວາມແຕກຕ່າງ","听辨差别"),
    ...TONE_PAIRS.slice(0, 8).map(g => h("div",{class:"sl-row sl-pairs"}, g.map(w => { const tn = analyse(w[0]).map(s => s.tone);
      return h("button",{class:"sl-word",onclick:()=>speak(w[0])}, h("b",{class:"lo",lang:"lo"}, w[0]), h("span",{class:"sl-tns"}, tn.map(toneChip)), h("small",null, lang() === "zh" ? w[2] : w[1])); })))));
  root.append(h("div",{class:"sl-cta"}, h("button",{class:"btn primary",onclick:()=>go("speak",{ unit:"pr-six" })}, icon("mic"), L("Practise the tones with your voice","ຝຶກວັນນະຍຸດດ້ວຍສຽງຂອງເຈົ້າ","用你的声音练习声调")),
    h("button",{class:"btn",onclick:()=>go("practice",{ set:"tn:pairs" })}, icon("headphones"), L("Listening quiz","ແບບທົດສອບການຟັງ","听力测验"))));
  return root;
};

// ---------- Syllables & sounds ----------
const FINALS = [["ງ","ng","sing"],["ນ","n","sun"],["ມ","m","room"],["ຍ","y","boy"],["ວ","w","now"],["ກ","k","—"],["ດ","t","—"],["ບ","p","—"]];
const FINAL_WORDS = { "ງ":["ສອງ","ຍັງ","ກອງ"], "ນ":["ກິນ","ຝົນ","ບ້ານ"], "ມ":["ສາມ","ງາມ","ດື່ມ"], "ຍ":["ຂາຍ","ຫຼາຍ","ນາຍ"], "ວ":["ດາວ","ແມວ","ຂາວ"], "ກ":["ປາກ","ນົກ","ໝາກ"], "ດ":["ເຜັດ","ມົດ","ຕັດ"], "ບ":["ແຊບ","ກົບ","ສິບ"] };
const VOWEL_PAIRS = [["ອະ","ອາ","ຕັດ","ຕາດ"],["ອິ","ອີ","ມິດ","ມີດ"],["ອຶ","ອື","ນຶກ","ມື"],["ອຸ","ອູ","ສຸກ","ສູງ"],["ເອະ","ເອ","ເຕະ","ເທ"],["ແອະ","ແອ","ແກະ","ແຂນ"],["ໂອະ","ໂອ","ໂຕະ","ໂຕ"],["ເອາະ","ອໍ","ເກາະ","ບໍ"]];
SOUND_VIEWS.pronounce_lab = () => {
  const root = h("div",{class:"sl"}, tabs("pronounce_lab"),
    head(t("nav_pronounce"), L("How a Lao syllable is built, the eight final sounds, and short and long vowels.", "ໂຄງສ້າງພະຍາງລາວ, ຕົວສະກົດ 8 ແມ່ ແລະ ສະຫຼະສັ້ນ-ຍາວ.", "老挝语音节的结构、八个韵尾以及长短元音。")));
  // anatomy of a syllable, for any word
  const out = h("div",{class:"sl-list"});
  const inp = h("input",{class:"sl-input lo",lang:"lo",type:"text",value:"ເຮືອນ","aria-label":L("A Lao word","ຄຳລາວ","老挝语词"),oninput:()=>build()});
  const part = (label, val, cls = "") => h("div",{class:"sl-part " + cls}, h("b",{class:"lo",lang:"lo"}, val || "—"), h("small",null, label));
  function build(){
    const syl = analyse(inp.value.trim());
    if (!syl.length){ out.replaceChildren(h("div",{class:"sl-row muted"}, L("Type a word in Lao script.","ພິມຄຳເປັນຕົວອັກສອນລາວ.","请输入老挝文字。"))); return; }
    out.replaceChildren(...syl.map(s => { const vowel = (s.lead || "") + (s.marks || "") + (s.tail || "");
      return h("div",{class:"sl-row sl-anat"},
        h("button",{class:"sl-sylw lo",lang:"lo",onclick:()=>speak(s.text)}, s.text),
        h("div",{class:"sl-parts"},
          part(L("first letter","ພະຍັນຊະນະຕົ້ນ","首辅音"), s.init, "p-init"),
          part(L("vowel","ສະຫຼະ","元音") + " · " + (s.long ? L("long","ຍາວ","长") : L("short","ສັ້ນ","短")), vowel ? vowel.replace(/^/, "") : "", "p-vow"),
          part(L("tone mark","ໄມ້ວັນນະຍຸດ","声调符号"), { "":"", ek:"◌່", tho:"◌້", ti:"◌໊", chat:"◌໋" }[s.mark || ""], "p-mark"),
          part(L("final","ຕົວສະກົດ","韵尾") + " · " + (s.dead ? L("stop","ຕາຍ","塞音") : L("live","ເປັນ","响音")), s.final, "p-fin")),
        h("div",{class:"sl-res tn" + s.tone}, toneChip(s.tone))); }));
  }
  build();
  root.append(h("section",{class:"sl-group"}, h("h2",{class:"sl-gt"}, L("Parts of a syllable","ສ່ວນປະກອບຂອງພະຍາງ","音节的组成")),
    h("p",{class:"sl-note"}, L("A vowel can sit before, above, below or after the first letter; the final and the tone mark decide the tone with it.","ສະຫຼະຢູ່ໜ້າ, ເທິງ, ລຸ່ມ ຫຼື ຫຼັງ ພະຍັນຊະນະ; ຕົວສະກົດ ແລະ ໄມ້ວັນນະຍຸດ ກຳນົດວັນນະຍຸດ.","元音可以在首辅音的前、上、下或后；韵尾和声调符号一起决定声调。")),
    h("div",{class:"sl-finder"}, inp, h("button",{class:"btn",onclick:()=>speak(inp.value.trim())}, icon("play"), t("play"))),
    h("div",{class:"sl-chips"}, ["ເຮືອນ","ໝາກມ່ວງ","ເຂົ້າ","ສະບາຍດີ","ຄວາຍ","ແຊບ"].map(w => h("button",{class:"lo",lang:"lo",onclick:()=>{ inp.value = w; build(); speak(w); }}, w))), out));
  // the eight finals
  root.append(group(L("The eight final sounds","ຕົວສະກົດ 8 ແມ່","八个韵尾"),
    ...FINALS.map(([f, sound, like]) => { const dead = "ກດບ".includes(f);
      return h("div",{class:"sl-row sl-final"},
        h("span",{class:"sl-fl lo",lang:"lo"}, "-" + f),
        h("div",{class:"sl-fd"}, h("b",null, "-" + sound + (like !== "—" ? L(" as in “" + like + "”", " ຄື “" + like + "”", "，如 “" + like + "”") : "")),
          h("small",null, dead ? L("stop: close and don't release, the syllable is short","ຕາຍ: ປິດສຽງ ບໍ່ປ່ອຍລົມ","塞音：闭合不爆破，音节短促") : L("live: the voice carries on","ເປັນ: ສຽງຍາວຕໍ່","响音：声音延续"))),
        h("div",{class:"sl-ex"}, FINAL_WORDS[f].map(w => h("button",{class:"lo",lang:"lo",onclick:()=>speak(w)}, w)))); })));
  // short and long vowels
  root.append(group(L("Short and long vowels","ສະຫຼະສັ້ນ ແລະ ຍາວ","短元音和长元音"),
    ...VOWEL_PAIRS.map(([s, l, ws, wl]) => h("div",{class:"sl-row sl-vp"},
      h("button",{class:"sl-v",onclick:()=>speak(ws)}, h("small",null, L("short","ສັ້ນ","短")), h("b",{class:"lo",lang:"lo"}, s), h("span",{class:"lo",lang:"lo"}, ws), icon("play")),
      h("button",{class:"sl-v long",onclick:()=>speak(wl)}, h("small",null, L("long","ຍາວ","长")), h("b",{class:"lo",lang:"lo"}, l), h("span",{class:"lo",lang:"lo"}, wl), icon("play"))))));
  root.append(h("div",{class:"sl-cta"}, h("button",{class:"btn primary",onclick:()=>go("speak",{ unit:"pr-stops" })}, icon("mic"), L("Practise final sounds","ຝຶກຕົວສະກົດ","练习韵尾")),
    h("button",{class:"btn",onclick:()=>go("speak",{ unit:"pr-length" })}, icon("mic"), L("Practise vowel length","ຝຶກສະຫຼະສັ້ນ-ຍາວ","练习元音长短"))));
  return root;
};
