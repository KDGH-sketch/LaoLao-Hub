// Lao Language Labs: Tone Lab, Pronunciation Lab, Script Lab, Particle Lab, Kinship & Address, Classifiers, Culture Lab
import { h, $$, icon, toast, pyHTML, tr, stripTone, fmtDate, rnd, shuffle } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { dict, searchDict, meaning } from "../shared/dict.js";
import { speak } from "../shared/speech.js";
import { sentenceEl, openWord } from "../shared/widgets.js";
import { A, T, expLang, recordAnswer } from "./core.js";

export const LAB_VIEWS = {};
const go = (...a) => A.go(...a);
const pageHead = (title, sub, extra) => h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,title), extra||null), sub ? h("p",{class:expLang()==="lo"&&lang()==="lo"?"lo":""},sub) : null);

// =========================================================================
// 1. LAO TONE LAB (ຫ້ອງທົດລອງສຽງວັນນະຍຸດ)
// =========================================================================
const LAO_TONES_DATA = [
  {
    num: 1,
    name: { en:"Tone 1: Mid-Level", lo:"ສຽງສາມັນ (ສຽງກາງ)", zh:"第一声：中平调" },
    contour: "33 / 35",
    desc: { en:"Neutral mid-level pitch, relaxed and smooth. Very common in unmarked mid-consonant syllables.", lo:"ສຽງກາງພຽງ ບໍ່ຂຶ້ນບໍ່ລົງ ຟັງສະບາຍ ພົບເລື້ອຍໃນອັກສອນກາງບໍ່ມີວັນນະຍຸດ." },
    pathD: "M 10 32 Q 50 30 90 28",
    color: "#0284c7",
    examples: [
      { lao:"ກາ", rom:"kāa", mean:"crow / kettle", note:"Mid cons + long vowel" },
      { lao:"ດີ", rom:"dīi", mean:"good / well", note:"Mid cons + long vowel" },
      { lao:"ປາ", rom:"paa", mean:"fish", note:"Mid cons + long vowel" },
      { lao:"ໄປ", rom:"pai", mean:"to go", note:"Mid cons + mai may" }
    ]
  },
  {
    num: 2,
    name: { en:"Tone 2: Low-Falling", lo:"ສຽງເອກ (ສຽງຕ່ຳ)", zh:"第二声：低降调" },
    contour: "11 / 21",
    desc: { en:"Starts low and drops down in pitch. Produced with marked ໄມ້ເອກ (່) or dead syllables with short vowels.", lo:"ສຽງເລີ່ມຕົ້ນຕ່ຳ ແລ້ວຫຼຸດລົງອີກ. ມັກເກີດກັບໄມ້ເອກ ່ ຫຼື ຄຳຕາຍ." },
    pathD: "M 10 40 Q 50 48 90 55",
    color: "#059669",
    examples: [
      { lao:"ກ່າ", rom:"kàa", mean:"sprout / shoot", note:"Mid cons + ໄມ້ເອກ" },
      { lao:"ໄຂ່", rom:"khǎi", mean:"egg", note:"High cons + ໄມ້ເອກ" },
      { lao:"ແມ່", rom:"mɛ̂ɛ", mean:"mother", note:"Low cons + ໄມ້ເອກ" },
      { lao:"ເຜັດ", rom:"phét", mean:"spicy", note:"High cons + dead stop" }
    ]
  },
  {
    num: 3,
    name: { en:"Tone 3: Low-Mid Falling", lo:"ສຽງໂທກາງ / ຕົກ", zh:"第三声：降调" },
    contour: "31 / 32",
    desc: { en:"Starts at mid pitch and falls firmly. Associated with ໄມ້ໂທ (້) on middle or high consonants.", lo:"ເລີ່ມຕົ້ນລະດັບກາງ ແລ້ວຕົກລົງຢ່າງໜັກແໜ້ນ. ມັກເກີດກັບໄມ້ໂທ ້ ໃນອັກສອນກາງ ແລະ ສູງ." },
    pathD: "M 10 25 Q 50 40 90 52",
    color: "#d97706",
    examples: [
      { lao:"ກ້າ", rom:"kâa", mean:"brave / bold", note:"Mid cons + ໄມ້ໂທ" },
      { lao:"ເຂົ້າ", rom:"khào", mean:"rice / enter", note:"High cons + ໄມ້ໂທ" },
      { lao:"ບ້ານ", rom:"bâan", mean:"village / home", note:"Mid cons + ໄມ້ໂທ" },
      { lao:"ເຫັນ", rom:"hěn", mean:"to see", note:"High cons + dead syllable" }
    ]
  },
  {
    num: 4,
    name: { en:"Tone 4: High-Falling (Glottal)", lo:"ສຽງໂທສູງ (ສຽງສູງຕົກ)", zh:"第四声：高降调（喉塞）" },
    contour: "53 / 42",
    desc: { en:"Starts high, falls slightly, often with a crisp glottal finish. Very common with low consonants + ໄມ້ໂທ.", lo:"ເລີ່ມຕົ້ນລະດັບສູງ ແລ້ວຕົກລົງພ້ອມສຽງກັກໃນລຳຄໍ. ເກີດກັບອັກສອນຕ່ຳ + ໄມ້ໂທ ້." },
    pathD: "M 10 12 Q 50 18 90 38",
    color: "#dc2626",
    examples: [
      { lao:"ມ້າ", rom:"mâa", mean:"horse", note:"Low cons + ໄມ້ໂທ" },
      { lao:"ນ້ຳ", rom:"nâm", mean:"water", note:"Low cons + ໄມ້ໂທ" },
      { lao:"ຊື້", rom:"sɯ̂ɯ", mean:"to buy", note:"Low cons + ໄມ້ໂທ" },
      { lao:"ເວົ້າ", rom:"wâo", mean:"to speak", note:"Low cons + ໄມ້ໂທ" }
    ]
  },
  {
    num: 5,
    name: { en:"Tone 5: High-Rising", lo:"ສຽງຈັດຕະວາ (ສຽງຂຶ້ນ)", zh:"第五声：高升调" },
    contour: "35 / 45",
    desc: { en:"Starts in the mid-high range and swoops upward like asking an inquisitive question. Inherent in unmarked high consonants.", lo:"ເລີ່ມຕົ້ນກາງ-ສູງ ແລ້ວຂຶ້ນສູງ ຄືສຽງຖາມ. ເປັນສຽງພື້ນຖານຂອງອັກສອນສູງຄຳເປັນ." },
    pathD: "M 10 42 Q 50 35 90 12",
    color: "#7c3aed",
    examples: [
      { lao:"ຂາ", rom:"khǎa", mean:"leg", note:"High cons + long vowel" },
      { lao:"ຫຼາຍ", rom:"lǎai", mean:"many / much", note:"Compound high + live" },
      { lao:"ຫົວ", rom:"hǔa", mean:"head", note:"High cons + live" },
      { lao:"ໝາ", rom:"mǎa", mean:"dog", note:"Compound high + live" }
    ]
  },
  {
    num: 6,
    name: { en:"Tone 6: High-Level / Checked", lo:"ສຽງສູງ / ຕັດ (ຄຳຕາຍ)", zh:"第六声：高平/促调" },
    contour: "44 / 55",
    desc: { en:"Short, high, brisk stop. Found in dead syllables ending in -k, -t, -p with short vowels in low consonants.", lo:"ສຽງສູງ ຕັດສັ້ນ ມັກເກີດໃນອັກສອນຕ່ຳ ຄຳຕາຍ (ສະກົດດ້ວຍ ກ, ດ, ບ) ສະຫຼະສັ້ນ." },
    pathD: "M 10 16 L 90 16",
    color: "#ea580c",
    examples: [
      { lao:"ມັກ", rom:"mák", mean:"to like / love", note:"Low cons + short + stop" },
      { lao:"ພັກ", rom:"phák", mean:"rest / party", note:"Low cons + short + stop" },
      { lao:"ນົກ", rom:"nók", mean:"bird", note:"Low cons + short + stop" },
      { lao:"ຄົບ", rom:"khóp", mean:"complete / associate", note:"Low cons + short + stop" }
    ]
  }
];

const MINIMAL_PAIRS = [
  {
    title: "The Classic 'PAA' Contrast",
    items: [
      { lao:"ປາ", rom:"paa", mean:"Fish", tone:"Tone 1 (Mid)", mark:"None" },
      { lao:"ປ່າ", rom:"pàa", mean:"Forest / Jungle", tone:"Tone 2 (Low)", mark:"ໄມ້ເອກ (່)" },
      { lao:"ປ້າ", rom:"pâa", mean:"Aunt (older sister of parent)", tone:"Tone 3 (Falling)", mark:"ໄມ້ໂທ (້)" }
    ]
  },
  {
    title: "The 'MAA' Contrast (Dog vs Come vs Horse)",
    items: [
      { lao:"ມາ", rom:"maa", mean:"To come", tone:"Tone 1/Low (Mid)", mark:"Unmarked low cons" },
      { lao:"ມ້າ", rom:"mâa", mean:"Horse", tone:"Tone 4 (High-falling)", mark:"Low cons + ໄມ້ໂທ (້)" },
      { lao:"ໝາ", rom:"mǎa", mean:"Dog", tone:"Tone 5 (Rising)", mark:"Compound high (ໝ) + live" }
    ]
  },
  {
    title: "The 'KHAI' Contrast (Egg vs Fever vs Open)",
    items: [
      { lao:"ໄຂ", rom:"khai", mean:"Fever / to turn on / unlock", tone:"Tone 5 (Rising)", mark:"High cons + live" },
      { lao:"ໄຂ່", rom:"khǎi", mean:"Egg", tone:"Tone 2 (Low-falling)", mark:"High cons + ໄມ້ເອກ (່)" },
      { lao:"ໄຂ້", rom:"khâi", mean:"Ill / sick with high fever", tone:"Tone 3 (Falling)", mark:"High cons + ໄມ້ໂທ (້)" }
    ]
  },
  {
    title: "The 'KHAO' Contrast (Rice vs White vs Horn)",
    items: [
      { lao:"ເຂົ້າ", rom:"khào", mean:"Rice / to enter / food", tone:"Tone 3 (Falling)", mark:"High cons + ໄມ້ໂທ (້)" },
      { lao:"ຂາວ", rom:"khǎao", mean:"White (color)", tone:"Tone 5 (Rising)", mark:"High cons + live" },
      { lao:"ເຂົາ", rom:"khao", mean:"Horns (animal) / they", tone:"Tone 5 (Rising)", mark:"High cons + live" }
    ]
  },
  {
    title: "The 'SUUE' Contrast (Buy vs Name vs Straight)",
    items: [
      { lao:"ຊື້", rom:"sɯ̂ɯ", mean:"To buy", tone:"Tone 4 (High-falling)", mark:"Low cons + ໄມ້ໂທ (້)" },
      { lao:"ຊື່", rom:"sɯ̄ɯ", mean:"Name", tone:"Tone 2 (Low-falling)", mark:"Low cons + ໄມ້ເອກ (່)" },
      { lao:"ຊື່ໆ", rom:"sɯ̄ɯ-sɯ̄ɯ", mean:"Simply / straight / honestly", tone:"Tone 2 (Low-falling)", mark:"Duplication" }
    ]
  }
];

LAB_VIEWS.tone_lab = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ຫ້ອງທົດລອງສຽງວັນນະຍຸດລາວ" : "Lao Tone Lab",
    lang()==="lo" ? "ເຂົ້າໃຈລະບົບ 6 ສຽງວັນນະຍຸດ, ເສັ້ນສະແດງລະດັບສຽງ (Pitch Contours), ຄູ່ຄຳສັບປຽບທຽບ (Minimal Pairs) ແລະ ຈັກຄິດໄລ່ກົດເກນສຽງ" : "Master the 6 Vientiane Lao tones with pitch contours, minimal pair discrimination, and the interactive tone rule calculator."
  ));

  // 1. Tone Contours Grid
  const toneGrid = h("div",{class:"grid3"});
  LAO_TONES_DATA.forEach(tData => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox","0 0 100 60");
    svg.setAttribute("class","pitch-svg");
    svg.style.width = "100%";
    svg.style.height = "70px";
    svg.style.background = "var(--surface-2)";
    svg.style.borderRadius = "8px";
    svg.innerHTML = `
      <line x1="5" y1="15" x2="95" y2="15" stroke="#cbd5e1" stroke-dasharray="2,2" stroke-width="1"/>
      <line x1="5" y1="35" x2="95" y2="35" stroke="#cbd5e1" stroke-dasharray="2,2" stroke-width="1"/>
      <line x1="5" y1="50" x2="95" y2="50" stroke="#cbd5e1" stroke-dasharray="2,2" stroke-width="1"/>
      <path d="${tData.pathD}" fill="none" stroke="${tData.color}" stroke-width="4" stroke-linecap="round"/>
    `;

    const exList = h("div",{class:"stack",style:"gap:4px;margin-top:10px"},
      tData.examples.map(ex => h("button",{class:"tone-ex-btn",onclick:()=>speak(ex.lao)},
        h("span",{class:"lo",style:"font-size:1.3rem;font-weight:700;color:var(--ink)"}, ex.lao),
        h("span",{class:"mono",style:"font-size:.85rem;color:var(--accent)"}, ex.rom),
        h("span",{class:"muted small",style:"flex:1;text-align:right"}, ex.mean),
        icon("play")
      ))
    );

    toneGrid.append(h("div",{class:"card",style:"display:flex;flex-direction:column;gap:8px"},
      h("div",{class:"spread"},
        h("b",{style:`color:${tData.color};font-size:1.05rem`}, tr(tData.name, lang())),
        h("span",{class:"chip lv"}, "Pitch: "+tData.contour)
      ),
      svg,
      h("p",{class:"small muted",style:"min-height:42px"}, tr(tData.desc, lang())),
      exList
    ));
  });

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ລະບົບ 6 ສຽງວັນນະຍຸດ (6 Vientiane Tones)" : "The 6 Vientiane Tone Contours"),
    toneGrid
  ));

  // 2. Minimal Pairs Section
  const pairsSect = h("div",{class:"stack",style:"gap:14px"});
  MINIMAL_PAIRS.forEach(pair => {
    const pairCards = h("div",{class:"grid3"},
      pair.items.map(it => h("button",{class:"card",style:"text-align:left;display:flex;flex-direction:column;gap:6px",onclick:()=>speak(it.lao)},
        h("div",{class:"spread"},
          h("span",{class:"lo",style:"font-size:2rem;font-weight:700;color:var(--accent)"}, it.lao),
          icon("speaker")
        ),
        h("b",{style:"font-size:1.05rem"}, it.rom),
        h("div",{class:"small",style:"font-weight:600;color:var(--ink)"}, it.mean),
        h("div",{class:"muted small"}, it.tone + " · " + it.mark)
      ))
    );
    pairsSect.append(h("div",{class:"pair-group",style:"background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px"},
      h("h3",{style:"margin-bottom:10px;font-size:1rem;color:var(--ink-2)"}, "🎯 " + pair.title),
      pairCards
    ));
  });

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ຄູ່ຄຳສັບປຽບທຽບສຽງ (Minimal Pairs Studio)" : "Minimal Pairs Studio (Listen & Contrast)"),
    h("p",{class:"muted small",style:"margin-bottom:12px"}, "In tonal languages, changing only the pitch completely transforms the meaning. Click each card to hear the difference immediately:"),
    pairsSect
  ));

  // 3. Interactive Tone Rule Calculator
  let calcClass = "mid";
  let calcVowel = "long";
  let calcSyl = "live";
  let calcMark = "none";

  const calcResult = h("div",{class:"card",style:"background:var(--surface-2);border-color:var(--accent);padding:20px;text-align:center"});
  
  function updateCalc(){
    // Tone resolution algorithm based on Central Lao grammar:
    let toneNum = 1;
    let ruleName = "";
    let sampleWord = "";

    if (calcMark === "none"){
      if (calcSyl === "live"){
        if (calcClass === "high"){ toneNum = 5; ruleName = "High Consonant + Live Syllable = Tone 5 (Rising)"; sampleWord = "ຂາ (khǎa - leg)"; }
        else if (calcClass === "mid"){ toneNum = 1; ruleName = "Mid Consonant + Live Syllable = Tone 1 (Mid-level)"; sampleWord = "ກາ (kāa - crow)"; }
        else { toneNum = 1; ruleName = "Low Consonant + Live Syllable = Tone 1 (Mid-level/flat)"; sampleWord = "ມາ (maa - come)"; }
      } else { // Dead Syllable
        if (calcVowel === "short"){
          if (calcClass === "low"){ toneNum = 6; ruleName = "Low Consonant + Short Vowel + Dead Stop = Tone 6 (High Checked)"; sampleWord = "ນົກ (nók - bird)"; }
          else { toneNum = 2; ruleName = "Mid/High Consonant + Short Vowel + Dead Stop = Tone 2 (Low Falling)"; sampleWord = "ເຜັດ (phét - spicy)"; }
        } else { // Long Vowel
          if (calcClass === "low"){ toneNum = 4; ruleName = "Low Consonant + Long Vowel + Dead Stop = Tone 4 (High Falling)"; sampleWord = "ໝາກ (màak - fruit)"; }
          else { toneNum = 2; ruleName = "Mid/High Consonant + Long Vowel + Dead Stop = Tone 2 (Low Falling)"; sampleWord = "ປາກ (pàak - mouth)"; }
        }
      }
    } else if (calcMark === "ek"){ // ໄມ້ເອກ (່)
      if (calcClass === "low"){ toneNum = 2; ruleName = "Low Consonant + ໄມ້ເອກ = Tone 2 (Low Falling)"; sampleWord = "ແມ່ (mɛ̂ɛ - mother)"; }
      else { toneNum = 2; ruleName = "Mid/High Consonant + ໄມ້ເອກ = Tone 2 (Low Falling)"; sampleWord = "ກ່າ (kàa - sprout)"; }
    } else if (calcMark === "tho"){ // ໄມ້ໂທ (້)
      if (calcClass === "low"){ toneNum = 4; ruleName = "Low Consonant + ໄມ້ໂທ = Tone 4 (High Falling Glottal)"; sampleWord = "ມ້າ (mâa - horse), ນ້ຳ (water)"; }
      else { toneNum = 3; ruleName = "Mid/High Consonant + ໄມ້ໂທ = Tone 3 (Low-Mid Falling)"; sampleWord = "ກ້າ (kâa - brave), ເຂົ້າ (rice)"; }
    } else if (calcMark === "ti"){ // ໄມ້ຕີ (໊)
      toneNum = 5; ruleName = "Any Consonant + ໄມ້ຕີ = Tone 5 (High Rising)"; sampleWord = "ໂຕະ໊ (table/onomatopoeia)";
    } else if (calcMark === "chat"){ // ໄມ້ຈັດຕະວາ (໋)
      toneNum = 5; ruleName = "Any Consonant + ໄມ້ຈັດຕະວາ = Tone 5 (High Rising)"; sampleWord = "ກ໋ອງ (can/box)";
    }

    const tObj = LAO_TONES_DATA.find(x => x.num === toneNum) || LAO_TONES_DATA[0];
    calcResult.innerHTML = "";
    calcResult.append(
      h("div",{class:"spread",style:"align-items:center;justify-content:center;gap:12px"},
        h("span",{class:"chip lv",style:`background:${tObj.color};color:#fff;font-size:1.1rem;padding:6px 16px`}, "Result: Tone " + toneNum),
        h("b",{style:"font-size:1.3rem;color:var(--ink)"}, tr(tObj.name, lang()))
      ),
      h("p",{style:"font-size:1.1rem;margin:12px 0 6px 0;font-weight:600;color:var(--accent)"}, ruleName),
      h("div",{class:"row",style:"justify-content:center;gap:8px;margin-top:8px"},
        h("span",{class:"muted"}, "Example: "),
        h("button",{class:"btn sm primary",onclick:()=>speak(sampleWord.split(" ")[0])}, icon("play"), sampleWord)
      )
    );
  }

  const makeSeg = (items, curVal, onChange) => {
    const wrap = h("div",{class:"seg",style:"flex-wrap:wrap"});
    items.forEach(([val, label]) => {
      const b = h("button",{"aria-pressed":String(val===curVal),onclick:()=>{
        $$("button",wrap).forEach(x=>x.setAttribute("aria-pressed","false"));
        b.setAttribute("aria-pressed","true");
        onChange(val);
        updateCalc();
      }}, label);
      wrap.append(b);
    });
    return wrap;
  };

  const calcControl = h("div",{class:"card stack",style:"gap:14px"},
    h("div",null,
      h("label",{style:"font-weight:700;display:block;margin-bottom:6px"}, "1. Consonant Class (ໝວດອັກສອນ):"),
      makeSeg([["high","High (ສູງ: ຂ,ສ,ຖ,ຜ,ຝ,ຫ)"],["mid","Mid (ກາງ: ກ,ຈ,ດ,ຕ,ບ,ປ,ຢ,ອ)"],["low","Low (ຕ່ຳ: ຄ,ງ,ຊ,ທ,ນ,ພ,ມ...)"]], calcClass, v => calcClass = v)
    ),
    h("div",null,
      h("label",{style:"font-weight:700;display:block;margin-bottom:6px"}, "2. Syllable Type (ຄຳເປັນ / ຄຳຕາຍ):"),
      makeSeg([["live","Live (ຄຳເປັນ: Long vowel or -m, -n, -ng, -y, -w)"],["dead","Dead (ຄຳຕາຍ: Stops -p, -t, -k)"]], calcSyl, v => calcSyl = v)
    ),
    h("div",null,
      h("label",{style:"font-weight:700;display:block;margin-bottom:6px"}, "3. Vowel Length (ຄວາມສັ້ນ-ຍາວຂອງສະຫຼະ):"),
      makeSeg([["short","Short Vowel (ສະຫຼະສັ້ນ)"],["long","Long Vowel (ສະຫຼະຍາວ)"]], calcVowel, v => calcVowel = v)
    ),
    h("div",null,
      h("label",{style:"font-weight:700;display:block;margin-bottom:6px"}, "4. Tone Mark (ວັນນະຍຸດ):"),
      makeSeg([["none","None (ບໍ່ມີ)"],["ek","່ ໄມ້ເອກ (Mai Ek)"],["tho","້ ໄມ້ໂທ (Mai Tho)"],["ti","໊ ໄມ້ຕີ"],["chat","໋ ໄມ້ຈັດຕະວາ"]], calcMark, v => calcMark = v)
    ),
    calcResult
  );

  updateCalc();

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ຈັກຄິດໄລ່ກົດເກນສຽງ (Lao Tone Rule Calculator)" : "Lao Tone Rule Calculator"),
    h("p",{class:"muted small",style:"margin-bottom:12px"}, "Select the combination below to instantly see how consonant class, vowel length, syllable type, and tone mark resolve into the spoken tone:"),
    calcControl
  ));

  return root;
};

// =========================================================================
// 2. PRONUNCIATION LAB & FINAL CONSONANTS (ຫ້ອງທົດລອງການອອກສຽງ)
// =========================================================================
LAB_VIEWS.pronounce_lab = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ຫ້ອງທົດລອງການອອກສຽງ ແລະ ຕົວສະກົດ" : "Pronunciation & Syllable Lab",
    lang()==="lo" ? "ຮຽນຮູ້ລະບົບຕົວສະກົດທັງ 8 ແມ່, ຄູ່ສະຫຼະສັ້ນ-ຍາວ ແລະ ໂຄງສ້າງການປະກອບພະຍາງພາສາລາວ" : "Master the 8 Lao final consonants, short vs long vowel duration, and interactive syllable decoding."
  ));

  // 8 Finals (ແມ່ຕົວສະກົດ)
  const FINALS = [
    { name:"ແມ່ກົງ (-ງ)", sound:"[ŋ] like 'si-ng'", type:"Live (ຄຳເປັນ)", ex:"ກອງ (drum), ດັງ (loud/nose), ຍັງ (still)" },
    { name:"ແມ່ກົນ (-ນ)", sound:"[n] like 'su-n'", type:"Live (ຄຳເປັນ)", ex:"ກິນ (to eat), ບ້ານ (village), ຝົນ (rain)" },
    { name:"ແມ່ກົມ (-ມ)", sound:"[m] like 'roo-m'", type:"Live (ຄຳເປັນ)", ex:"ງາມ (beautiful), ຕົ້ມ (to boil), ດື່ມ (to drink)" },
    { name:"ແມ່ເກີຍ (-ຍ)", sound:"[j] like 'bo-y'", type:"Live (ຄຳເປັນ)", ex:"ຂາຍ (to sell), ຮຽນຫຼາຍ (study a lot), ນາຍ (boss)" },
    { name:"ແມ່ເກິວ (-ວ)", sound:"[w] like 'no-w'", type:"Live (ຄຳເປັນ)", ex:"ແກ້ວ (glass), ແຊບຫຼາຍ (delicious), ດາວ (star)" },
    { name:"ແມ່ກົກ (-ກ)", sound:"[k̚] unreleased stop", type:"Dead (ຄຳຕາຍ)", ex:"ປາກ (mouth), ໝາກ (fruit), ນົກ (bird)" },
    { name:"ແມ່ກົດ (-ດ)", sound:"[t̚] unreleased stop", type:"Dead (ຄຳຕາຍ)", ex:"ເຜັດ (spicy), ຂວດ (bottle), ມົດ (ant)" },
    { name:"ແມ່ກົບ (-ບ)", sound:"[p̚] unreleased stop", type:"Dead (ຄຳຕາຍ)", ex:"ແຊບ (delicious), ກົບ (frog), ຫຼິ້ນກິລາ (sports)" }
  ];

  const finalGrid = h("div",{class:"grid2"});
  FINALS.forEach(f => {
    finalGrid.append(h("div",{class:"card",style:"display:flex;flex-direction:column;gap:6px"},
      h("div",{class:"spread"},
        h("b",{class:"lo",style:"font-size:1.2rem;color:var(--accent)"}, f.name),
        h("span",{class:"chip lv"}, f.type)
      ),
      h("div",{class:"mono",style:"font-size:.9rem;font-weight:600"}, "Acoustic: " + f.sound),
      h("div",{class:"muted small"}, "Examples: " + f.ex),
      h("button",{class:"btn sm ghost",style:"margin-top:4px;align-self:flex-start",onclick:()=>speak(f.ex.split(",")[0].split(" ")[0])}, icon("play"), "Audio")
    ));
  });

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ແມ່ຕົວສະກົດ 8 ແມ່ (The 8 Lao Final Consonants)" : "The 8 Lao Final Consonants (ແມ່ຕົວສະກົດ)"),
    h("p",{class:"muted small",style:"margin-bottom:12px"}, "Lao stops (-ກ, -ດ, -ບ) are completely unreleased (no puff of air at the end). Sonorants (-ງ, -ນ, -ມ, -ຍ, -ວ) keep the syllable live and musical."),
    finalGrid
  ));

  // Vowel length pairs
  const VOWEL_PAIRS = [
    { short:"ອະ (a)", long:"ອາ (aa)", meanShort:"Short quick /a/", meanLong:"Drawn out /aa/", exShort:"ຈະ (ja - will)", exLong:"ຈາ (jaa - to speak)" },
    { short:"ອິ (i)", long:"ອີ (ii)", meanShort:"Short high /i/", meanLong:"Long tense /ii/", exShort:"ສິ (si - will/short)", exLong:"ສີ (sǐi - color)" },
    { short:"ອຶ (ue)", long:"ອື (uee)", meanShort:"Short closed /ɯ/", meanLong:"Long closed /ɯː/", exShort:"ນຶກ (nuek - to think)", exLong:"ມື (mɯɯ - hand)" },
    { short:"ອຸ (u)", long:"ອູ (uu)", meanShort:"Short rounded /u/", meanLong:"Long rounded /uː/", exShort:"ດຸ (du - diligent)", exLong:"ດູ (duu - to look)" },
    { short:"ເອະ (e)", long:"ເອ (ee)", meanShort:"Short /e/", meanLong:"Long /ee/", exShort:"ເຕະ (te - to kick)", exLong:"ເທ (thee - to pour)" },
    { short:"ແອະ (ae)", long:"ແອ (aae)", meanShort:"Short open /ɛ/", meanLong:"Long open /ɛː/", exShort:"ແກະ (kae - sheep)", exLong:"ແກ່ (kàae - old)" },
    { short:"ໂອະ (o)", long:"ໂອ (oo)", meanShort:"Short /o/", meanLong:"Long /oː/", exShort:"ໂຕະ (to - table)", exLong:"ໂຕ (too - body/classifier)" }
  ];

  const vowelPairGrid = h("div",{class:"grid2"});
  VOWEL_PAIRS.forEach(vp => {
    vowelPairGrid.append(h("div",{class:"card",style:"display:grid;grid-template-columns:1fr 1fr;gap:12px"},
      h("button",{class:"card",style:"background:var(--surface-2);text-align:left",onclick:()=>speak(vp.exShort.split(" ")[0])},
        h("div",{class:"lo",style:"font-size:1.6rem;font-weight:700;color:var(--accent)"}, vp.short),
        h("div",{class:"small muted"}, vp.meanShort),
        h("div",{class:"lo",style:"font-size:1.1rem;margin-top:6px;font-weight:600"}, vp.exShort),
        icon("play")
      ),
      h("button",{class:"card",style:"background:var(--surface-2);text-align:left",onclick:()=>speak(vp.exLong.split(" ")[0])},
        h("div",{class:"lo",style:"font-size:1.6rem;font-weight:700;color:var(--accent)"}, vp.long),
        h("div",{class:"small muted"}, vp.meanLong),
        h("div",{class:"lo",style:"font-size:1.1rem;margin-top:6px;font-weight:600"}, vp.exLong),
        icon("play")
      )
    ));
  });

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ຄູ່ສະຫຼະສັ້ນ - ຍາວ (Short vs Long Vowel Pairs)" : "Short vs Long Vowel Duration"),
    h("p",{class:"muted small",style:"margin-bottom:12px"}, "Vowel length is phonemic in Lao. Distinguishing short and long vowels is essential for both pronunciation clarity and correct tone derivation:"),
    vowelPairGrid
  ));

  // Syllable Decoder Tool
  const decodeInput = h("input",{class:"input",style:"max-width:320px",placeholder:"Type or pick a Lao word (e.g. ຮຽນ, ບ້ານ, ໝາກ)",value:"ຮຽນ"});
  const decodeOutput = h("div",{class:"card stack",style:"gap:10px;margin-top:14px;background:var(--surface-2)"});

  function runDecode(){
    const text = decodeInput.value.trim();
    if (!text){ decodeOutput.innerHTML = "<p class='muted'>Type a word to decode its syllable parts.</p>"; return; }
    speak(text);
    decodeOutput.innerHTML = "";
    decodeOutput.append(
      h("div",{class:"spread",style:"align-items:center"},
        h("span",{class:"lo",style:"font-size:2.4rem;font-weight:700;color:var(--accent)"}, text),
        h("button",{class:"btn primary sm",onclick:()=>speak(text)}, icon("play"), "Play Audio")
      ),
      h("div",{class:"banner info"},
        h("b",null,"Lao Syllable Anatomy: "),
        `Analyzed word "${text}". In Lao syllable decoding: [Initial Consonant] + [Vowel Combination] + [Final Consonant] + [Tone Mark] determine the live/dead syllable classification and exact pitch contour.`
      ),
      h("div",{class:"row",style:"gap:8px;flex-wrap:wrap"},
        h("span",{class:"chip lv"}, "Initial Consonant"),
        h("span",{class:"chip lv"}, "Vowel Matrix"),
        h("span",{class:"chip lv"}, "Final Stop/Sonorant"),
        h("span",{class:"chip lv"}, "Derived Pitch Contour")
      )
    );
  }

  const decodeWrap = h("div",{class:"card stack",style:"gap:12px"},
    h("div",{class:"row",style:"gap:10px"},
      decodeInput,
      h("button",{class:"btn primary",onclick:runDecode}, icon("spark"), "Decode Syllable")
    ),
    h("div",{class:"row",style:"gap:6px;flex-wrap:wrap"},
      ["ສະບາຍດີ","ກິນເຂົ້າ","ຮຽນ","ບ້ານ","ໝາກ","ນ້ຳ","ຂອບໃຈ","ແຊບ"].map(w =>
        h("button",{class:"btn sm ghost",onclick:()=>{ decodeInput.value=w; runDecode(); }}, w)
      )
    ),
    decodeOutput
  );

  runDecode();

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ເຄື່ອງມືຖອດລະຫັດພະຍາງລາວ (Lao Syllable Decoder)" : "Interactive Lao Syllable Decoder"),
    decodeWrap
  ));

  return root;
};

// =========================================================================
// 3. LAO PARTICLE LAB (ຫ້ອງທົດລອງຄຳລົງທ້າຍ / ຄຳຊ່ວຍ)
// =========================================================================
const LAO_PARTICLES = [
  {
    lao: "ເດີ້",
    rom: "dêe / de",
    type: "Friendly Invitation / Softener",
    meaning: "Warm friendly reminder or polite invitation; signals goodwill ('Okay?', 'Please do', 'Take care!')",
    tone: "Tone 4 (High falling)",
    examples: [
      { lao:"ໄປກ່ອນເດີ້", rom:"pai kɔ̀ɔn dêe", en:"I'm taking off now, okay! (Warm friendly goodbye)" },
      { lao:"ກິນຫຼາຍໆເດີ້", rom:"kin lǎai-lǎai dêe", en:"Please eat plenty! (Hospitable dinner invitation)" },
      { lao:"ໂຊກດີເດີ້", rom:"sôok dii dêe", en:"Good luck to you!" }
    ]
  },
  {
    lao: "ເນາະ / ນໍ",
    rom: "nɔ / nɔ̌ɔ",
    type: "Consensus / Tag Question",
    meaning: "Seeking agreement or sharing sentiment ('Right?', 'Isn't it?', 'Don't you agree?')",
    tone: "Tone 2 (Short) / Tone 5 (Long)",
    examples: [
      { lao:"ມື້ນີ້ຮ້ອນເນາະ", rom:"mɯ̂ɯ-nîi hɔ̂ɔn nɔ", en:"It's hot today, isn't it? (Casual icebreaker)" },
      { lao:"ອາຫານແຊບນໍ", rom:"aa-hǎan sàaep nɔ̌ɔ", en:"The food is so delicious, right?" },
      { lao:"ແມ່ນແລ້ວເນາະ", rom:"mɛ̂ɛn lɛ̂ɛw nɔ", en:"That's right, indeed!" }
    ]
  },
  {
    lao: "ຫວາ",
    rom: "wǎa",
    type: "Casual Question Marker",
    meaning: "Informal, conversational curiosity ('Really?', 'Is that so?', 'Are you?')",
    tone: "Tone 5 (High rising)",
    examples: [
      { lao:"ເຈົ້າໄປຫວາ?", rom:"jâo pai wǎa?", en:"Are you going? (Friendly check)" },
      { lao:"ແທ້ຫວາ?", rom:"thɛ̂ɛ wǎa?", en:"Really?! Is that true?" },
      { lao:"ອີ່ມແລ້ວຫວາ?", rom:"ìim lɛ̂ɛw wǎa?", en:"Are you full already?" }
    ]
  },
  {
    lao: "ຕິ / ຕີ",
    rom: "ti / tii",
    type: "Surprise / Gentle Disbelief",
    meaning: "Expressing mild surprise, seeking double-confirmation ('Did you really?', 'Is that so?!')",
    tone: "Tone 2 (Short)",
    examples: [
      { lao:"ຊິໄປດຽວນີ້ຕິ?", rom:"si pai dīaw-nîi ti?", en:"You're leaving right now?! (Surprised)" },
      { lao:"ບໍ່ກິນຕິ?", rom:"bɔ̀ɔ kin ti?", en:"You're not eating?! (Surprised offer)" }
    ]
  },
  {
    lao: "ດອກ",
    rom: "dɔ̀ɔk",
    type: "Reassuring Negation",
    meaning: "Always with negative ບໍ່ (bɔ̀ɔ); reassures that it's no trouble or softens denial ('Not at all, don't worry!')",
    tone: "Tone 2 (Low falling stop)",
    examples: [
      { lao:"ບໍ່ເປັນຫຍັງດອກ", rom:"bɔ̀ɔ pen nyang dɔ̀ɔk", en:"Don't worry about it at all! It's genuinely fine." },
      { lao:"ບໍ່ຍາກປານໃດດອກ", rom:"bɔ̀ɔ yâak paan-dǎi dɔ̀ɔk", en:"It's not that difficult at all, don't worry." },
      { lao:"ຂ້ອຍບໍ່ຟ້າວດອກ", rom:"khoy bɔ̀ɔ fâao dɔ̀ɔk", en:"I'm not in any rush at all." }
    ]
  },
  {
    lao: "ລະ / ແລ້ວ",
    rom: "la / lɛ̂ɛw",
    type: "Conversational Aspect / Transition",
    meaning: "Signals completion, 'and so...', 'already', or smooth spoken progression.",
    tone: "Tone 6 (Short high)",
    examples: [
      { lao:"ໄປລະເດີ້", rom:"pai la dêe", en:"I'm off then! (Common departing phrase)" },
      { lao:"ກິນແລ້ວລະ", rom:"kin lɛ̂ɛw la", en:"I've eaten already." }
    ]
  },
  {
    lao: "ແມ",
    rom: "mɛ́ɛ",
    type: "Encouraging / Urging Marker",
    meaning: "Gentle urging or prompt ('Come on!', 'Go ahead!', 'Try it!')",
    tone: "Tone 4 (High falling)",
    examples: [
      { lao:"ກິນແມ!", rom:"kin mɛ́ɛ!", en:"Eat, go ahead! (Friendly urge)" },
      { lao:"ເວົ້າແມ!", rom:"wâo mɛ́ɛ!", en:"Come on, speak up!" }
    ]
  },
  {
    lao: "ໃດ໋",
    rom: "dǎi",
    type: "Emphatic Notice",
    meaning: "Draws sharp attention or gives a friendly warning ('Mind you!', 'I'm telling you!')",
    tone: "Tone 5 (High rising)",
    examples: [
      { lao:"ເຜັດໃດ໋!", rom:"phét dǎi!", en:"It's really spicy, watch out!" },
      { lao:"ແຊບຫຼາຍໃດ໋", rom:"sàaep lǎai dǎi", en:"It's super delicious, mind you!" }
    ]
  },
  {
    lao: "ແດ່",
    rom: "dɛ̀ɛ",
    type: "Polite Request Softener",
    meaning: "Softens imperative requests to mean 'please', 'a little bit', or 'kindly'",
    tone: "Tone 2 (Low falling)",
    examples: [
      { lao:"ຊ່ວຍແດ່", rom:"sùay dɛ̀ɛ", en:"Please help me out a bit." },
      { lao:"ຂໍນ້ຳແດ່", rom:"khɔ̌ɔ nâm dɛ̀ɛ", en:"May I have some water, please?" }
    ]
  }
];

LAB_VIEWS.particle_lab = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ຫ້ອງທົດລອງຄຳລົງທ້າຍ (Lao Particle Lab)" : "Lao Conversational Particle Lab",
    lang()==="lo" ? "ຫົວໃຈສຳຄັນຂອງການເວົ້າພາສາລາວໃຫ້ເປັນທຳມະຊາດ: ຄຳລົງທ້າຍປ່ຽນອາລົມ, ຄວາມສຸພາບ ແລະ ຄວາມໝາຍແຝງ" : "The secret to sounding like a native Lao speaker: how sentence-final particles shape emotion, nuance, and politeness."
  ));

  // Interactive Sentence Comparator
  const BASE_PHRASES = [
    { base:"ໄປນຳກັນ", rom:"pai nam kan", mean:"Go together" },
    { base:"ກິນເຂົ້າ", rom:"kin khao", mean:"Eat food" },
    { base:"ບໍ່ເປັນຫຍັງ", rom:"bɔ̀ɔ pen nyang", mean:"It's okay / no problem" },
    { base:"ແຊບ", rom:"sàaep", mean:"Delicious" }
  ];

  let selectedBase = BASE_PHRASES[0];
  let selectedParticle = LAO_PARTICLES[0];

  const comparePreview = h("div",{class:"card",style:"background:var(--surface-2);border-color:var(--accent);padding:24px;text-align:center"});

  function updateCompare(){
    const combined = selectedBase.base + selectedParticle.lao;
    comparePreview.innerHTML = "";
    comparePreview.append(
      h("div",{class:"spread",style:"justify-content:center;align-items:center;gap:14px"},
        h("span",{class:"lo",style:"font-size:2.8rem;font-weight:700;color:var(--accent)"}, combined),
        h("button",{class:"btn primary sm",onclick:()=>speak(combined)}, icon("play"), "Play Audio")
      ),
      h("div",{class:"mono",style:"font-size:1.1rem;margin:8px 0;color:var(--ink-2)"}, selectedBase.rom + " " + selectedParticle.rom),
      h("div",{class:"chip lv",style:"margin:6px auto;display:inline-block"}, selectedParticle.type),
      h("p",{style:"font-size:1.15rem;margin:10px 0 4px 0;font-weight:600;color:var(--ink)"},
        `Nuance: "${selectedBase.mean}" transformed with [${selectedParticle.lao}] into a ${selectedParticle.type.toLowerCase()}.`
      ),
      h("p",{class:"small muted"}, selectedParticle.meaning)
    );
  }

  const baseSeg = h("div",{class:"seg",style:"flex-wrap:wrap;margin-bottom:12px"});
  BASE_PHRASES.forEach(bp => {
    const b = h("button",{"aria-pressed":String(bp===selectedBase),onclick:()=>{
      $$("button",baseSeg).forEach(x=>x.setAttribute("aria-pressed","false"));
      b.setAttribute("aria-pressed","true");
      selectedBase = bp;
      updateCompare();
    }}, bp.base + " (" + bp.mean + ")");
    baseSeg.append(b);
  });

  const partGrid = h("div",{class:"row",style:"gap:8px;flex-wrap:wrap;margin-bottom:14px"});
  LAO_PARTICLES.forEach(lp => {
    const b = h("button",{class:"btn sm"+(lp===selectedParticle?" primary":""),onclick:()=>{
      $$("button",partGrid).forEach(x=>x.className="btn sm");
      b.className = "btn sm primary";
      selectedParticle = lp;
      updateCompare();
    }}, lp.lao + " (" + lp.rom + ")");
    partGrid.append(b);
  });

  updateCompare();

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ປຽບທຽບຄວາມໝາຍເມື່ອປ່ຽນຄຳລົງທ້າຍ (Particle Nuance Comparator)" : "Interactive Particle Nuance Comparator"),
    h("p",{class:"muted small",style:"margin-bottom:10px"}, "Select a base sentence, then tap different particles to feel how the emotional tone and social atmosphere shift:"),
    h("b",{style:"font-size:.9rem;color:var(--ink-2)"}, "1. Pick Base Sentence:"),
    baseSeg,
    h("b",{style:"font-size:.9rem;color:var(--ink-2)"}, "2. Attach Conversational Particle:"),
    partGrid,
    comparePreview
  ));

  // Particles catalogue
  const catGrid = h("div",{class:"grid2"});
  LAO_PARTICLES.forEach(lp => {
    const exBox = h("div",{class:"stack",style:"gap:6px;margin-top:8px"},
      lp.examples.map(ex => h("button",{class:"tone-ex-btn",onclick:()=>speak(ex.lao)},
        h("span",{class:"lo",style:"font-size:1.15rem;font-weight:700;color:var(--ink)"}, ex.lao),
        h("span",{class:"small muted",style:"flex:1;text-align:right"}, ex.en),
        icon("play")
      ))
    );

    catGrid.append(h("div",{class:"card stack",style:"gap:6px"},
      h("div",{class:"spread"},
        h("span",{class:"lo",style:"font-size:1.8rem;font-weight:700;color:var(--accent)"}, lp.lao),
        h("span",{class:"chip lv"}, lp.tone)
      ),
      h("b",{style:"font-size:1rem"}, lp.rom + " · " + lp.type),
      h("p",{class:"small muted"}, lp.meaning),
      exBox
    ));
  });

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ສາງຄຳລົງທ້າຍຫຼັກໃນພາສາລາວ (Essential Lao Particles)" : "Complete Guide to Lao Particles"),
    catGrid
  ));

  return root;
};

// =========================================================================
// 4. KINSHIP & ADDRESS SYSTEM (ຄຳແທນນາມ ແລະ ຄຳຮຽກຕາມສາຍພົວພັນ)
// =========================================================================
const KINSHIP_TERMS = [
  { term:"ອ້າຍ", rom:"aai", role:"Elder Brother", use:"Used for slightly older males, respected male colleagues, or friendly male service staff." },
  { term:"ເອື້ອຍ", rom:"euay", role:"Elder Sister", use:"Used for slightly older females, older female friends, or female market vendors." },
  { term:"ນ້ອງ", rom:"nawng", role:"Younger Sibling", use:"Used to address anyone younger than you, junior colleagues, or as humble 1st person 'I'." },
  { term:"ລຸງ", rom:"lung", role:"Elder Uncle", use:"Used for men older than your parents (approx 55+ years old)." },
  { term:"ປ້າ", rom:"paa", role:"Elder Aunt", use:"Used for women older than your parents (approx 55+ years old)." },
  { term:"ອາວ / ອາ", rom:"aaw / aa", role:"Paternal Uncle/Aunt", use:"Younger brother or sister of father." },
  { term:"ນ້າ", rom:"naa", role:"Maternal Aunt/Uncle", use:"Younger brother or sister of mother." },
  { term:"ພໍ່ຕູ້", rom:"phaw tuu", role:"Grandfather / Elder", use:"Respectful honorific for elderly gentlemen." },
  { term:"ແມ່ຕູ້", rom:"mae tuu", role:"Grandmother / Elder", use:"Respectful honorific for elderly ladies." },
  { term:"ທ່ານ", rom:"thān", role:"Sir / Madam / Excellency", use:"Formal dignity for high officials, dignitaries, or formal announcements." }
];

LAB_VIEWS.kinship_lab = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ລະບົບຄຳແທນນາມ ແລະ ການຮຽກຕາມສາຍພົວພັນ" : "Pronouns & Kinship Address System",
    lang()==="lo" ? "ໃນພາສາລາວ ການເລືອກຄຳແທນນາມບໍ່ແມ່ນພຽງແຕ່ເລືອກຄຳສັບ ແຕ່ແມ່ນການສະແດງຄວາມເຄົາລົບ, ຄວາມສະໜິດສະໜົມ ແລະ ສະຖານະພາບທາງສັງຄົມ" : "Address terms in Lao reflect age, respect, intimacy, and social warmth rather than mechanical pronouns."
  ));

  // Pronoun Matrix (1st, 2nd, 3rd across registers)
  const PRONOUN_MATRIX = [
    { register:"Polite / Everyday (ສຸພາບທົ່ວໄປ)", first:"ຂ້ອຍ (khoy)", second:"ເຈົ້າ (jâo)", third:"ລາວ (lao)", note:"The universal default for learners, shops, restaurants, and daily life." },
    { register:"Kinship / Warm (ແບບພີ່ນ້ອງ)", first:"ນ້ອງ / ອ້າຍ / ເອື້ອຍ", second:"ອ້າຍ / ເອື້ອຍ / ນ້ອງ", third:"ເພິ່ນ (phən - polite)", note:"Natural Lao conversational style based on relative age." },
    { register:"Formal / Official (ທາງການ)", first:"ຂ້ານ້ອຍ / ຜູ້ຂ້າ", second:"ທ່ານ (thān)", third:"ທ່ານ / ເພິ່ນ", note:"Workplace meetings, government offices, temple monks, elders." },
    { register:"Close Peers / Casual (ໝູ່ສະໜິດ)", first:"ເຮົາ (hao)", second:"ໂຕ (to)", third:"ລາວ / ມັນ", note:"Between close school friends, peers of exact same age." }
  ];

  const matrixTable = h("div",{class:"tbl-wrap",style:"margin-bottom:20px"});
  const tbody = h("tbody");
  PRONOUN_MATRIX.forEach(row => {
    tbody.append(h("tr",null,
      h("td",{style:"font-weight:700;color:var(--accent)"}, row.register),
      h("td",{class:"lo",style:"font-size:1.15rem"}, row.first),
      h("td",{class:"lo",style:"font-size:1.15rem"}, row.second),
      h("td",{class:"lo",style:"font-size:1.15rem"}, row.third),
      h("td",{class:"small muted"}, row.note)
    ));
  });

  matrixTable.append(h("table",{class:"tbl"},
    h("thead",null,
      h("tr",null,
        h("th",null,"Social Register"),
        h("th",null,"1st Person (I)"),
        h("th",null,"2nd Person (You)"),
        h("th",null,"3rd Person (He/She/They)"),
        h("th",null,"Social Context")
      )
    ),
    tbody
  ));

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ຕາຕະລາງຄຳແທນນາມຕາມລະດັບສັງຄົມ (Pronoun Register Matrix)" : "Pronoun Register Matrix"),
    matrixTable
  ));

  // Kinship Cards
  const kinGrid = h("div",{class:"grid2"});
  KINSHIP_TERMS.forEach(kt => {
    kinGrid.append(h("div",{class:"card",style:"display:flex;flex-direction:column;gap:6px"},
      h("div",{class:"spread"},
        h("span",{class:"lo",style:"font-size:1.8rem;font-weight:700;color:var(--accent)"}, kt.term),
        h("button",{class:"btn sm ghost",onclick:()=>speak(kt.term)}, icon("play"), "Play")
      ),
      h("b",{style:"font-size:1.05rem"}, kt.rom + " (" + kt.role + ")"),
      h("p",{class:"small muted"}, kt.use)
    ));
  });

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ຄຳຮຽກຕາມສາຍພົວພັນຍາດຕິພີ່ນ້ອງ (Kinship Terms of Address)" : "Kinship Terms Used as Everyday Pronouns"),
    h("p",{class:"muted small",style:"margin-bottom:12px"}, "In Laos, calling someone 'You' (ເຈົ້າ) all the time can feel distant. Addressing someone as ອ້າຍ (elder brother), ເອື້ອຍ (elder sister), or ນ້ອງ (younger sibling) shows immediate cultural respect:"),
    kinGrid
  ));

  return root;
};

// =========================================================================
// 5. CLASSIFIERS LAB (ລະບົບລັກສະນະນາມ)
// =========================================================================
const LAO_CLASSIFIERS = [
  { cls:"ຄົນ", rom:"khon", forWhat:"People / Humans", exNoun:"ຄົນລາວ 3 ຄົນ (3 Lao people)", pattern:"[Noun] + [Num] + ຄົນ" },
  { cls:"ໂຕ", rom:"to", forWhat:"Animals, Shirts, Trousers, Chairs, Tables", exNoun:"ໝາ 2 ໂຕ (2 dogs), ເສື້ອ 1 ໂຕ (1 shirt)", pattern:"[Noun] + [Num] + ໂຕ" },
  { cls:"ຫົວ", rom:"hǔa", forWhat:"Books, Root vegetables (garlic, onion)", exNoun:"ປຶ້ມ 2 ຫົວ (2 books)", pattern:"[Noun] + [Num] + ຫົວ" },
  { cls:"ຄັນ", rom:"khan", forWhat:"Vehicles (cars, motorbikes, bicycles), Umbrellas, Spoons", exNoun:"ລົດ 1 ຄັນ (1 car), ຄັນຮົ່ມ 1 ຄັນ (1 umbrella)", pattern:"[Noun] + [Num] + ຄັນ" },
  { cls:"ຫຼັງ", rom:"lǎng", forWhat:"Houses, Buildings", exNoun:"ເຮືອນ 1 ຫຼັງ (1 house)", pattern:"[Noun] + [Num] + ຫຼັງ" },
  { cls:"ໜ່ວຍ", rom:"nùay", forWhat:"Fruits, Spherical objects, Mountains, Eggs", exNoun:"ໝາກກ້ວຍ 3 ໜ່ວຍ (3 bananas), ໄຂ່ 4 ໜ່ວຍ (4 eggs)", pattern:"[Noun] + [Num] + ໜ່ວຍ" },
  { cls:"ໃບ", rom:"bai", forWhat:"Leaves, Documents, Tickets, Plates, Hats", exNoun:"ປີ້ຍົນ 1 ໃບ (1 flight ticket), ຈານ 2 ໃບ (2 plates)", pattern:"[Noun] + [Num] + ໃບ" },
  { cls:"ອັນ", rom:"an", forWhat:"Small miscellaneous general items", exNoun:"ອັນນີ້ 2 ອັນ (2 of this item)", pattern:"[Noun] + [Num] + ອັນ" },
  { cls:"ແກ້ວ", rom:"kɛ̂ɛw", forWhat:"Bottles of beverages", exNoun:"ເບຍ 2 ແກ້ວ (2 bottles of beer), ນ້ຳ 1 ແກ້ວ", pattern:"[Noun] + [Num] + ແກ້ວ" },
  { cls:"ຈອກ", rom:"jɔ́ɔk", forWhat:"Cups, Glasses of drinks", exNoun:"ກາເຟ 1 ຈອກ (1 cup of coffee)", pattern:"[Noun] + [Num] + ຈອກ" },
  { cls:"ຖ້ວຍ", rom:"thùay", forWhat:"Bowls of food", exNoun:"ເຝີ 1 ຖ້ວຍ (1 bowl of pho noodle soup)", pattern:"[Noun] + [Num] + ຖ້ວຍ" },
  { cls:"ຊຸດ", rom:"xut", forWhat:"Sets of clothes, sets of items", exNoun:"ເຄື່ອງ 1 ຊຸດ (1 set of clothes)", pattern:"[Noun] + [Num] + ຊຸດ" }
];

LAB_VIEWS.classifiers_lab = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ລະບົບລັກສະນະນາມພາສາລາວ (Lao Classifiers)" : "Lao Classifier Course & Lab",
    lang()==="lo" ? "ຮຽນຮູ້ກົດເກນ: ຄຳນາມ + ຕົວເລກ + ລັກສະນະນາມ (ປຶ້ມ 2 ຫົວ) ແລະ ຄຳນາມ + ລັກສະນະນາມ + ນີ້/ນັ້ນ (ປຶ້ມ ຫົວ ນີ້)" : "Master count structures: [Noun] + [Number] + [Classifier] and demonstratives: [Noun] + [Classifier] + [This/That]."
  ));

  // Word order rules card
  root.append(h("div",{class:"card",style:"background:var(--surface-2);border-color:var(--accent);padding:20px"},
    h("h3",{style:"margin-bottom:10px;color:var(--accent)"}, "📐 Fundamental Word Order of Lao Classifiers"),
    h("div",{class:"grid2",style:"gap:14px"},
      h("div",{class:"card"},
        h("b",null,"1. Counting Quantity:"),
        h("div",{class:"lo",style:"font-size:1.3rem;font-weight:700;margin:6px 0"}, "ຄຳນາມ + ຕົວເລກ + ລັກສະນະນາມ"),
        h("div",{class:"muted small"}, "Example: ປຶ້ມ (books) + ສອງ (2) + ຫົວ (vol) = 'Two books'")
      ),
      h("div",{class:"card"},
        h("b",null,"2. Specific Demonstrative (This/That):"),
        h("div",{class:"lo",style:"font-size:1.3rem;font-weight:700;margin:6px 0"}, "ຄຳນາມ + ລັກສະນະນາມ + ນີ້ / ນັ້ນ"),
        h("div",{class:"muted small"}, "Example: ປຶ້ມ (book) + ຫົວ (vol) + ນີ້ (this) = 'This book'")
      )
    )
  ));

  // Interactive Classifier Selector
  let countNum = 2;
  let activeCls = LAO_CLASSIFIERS[0];
  const countDisplay = h("div",{class:"card",style:"padding:24px;text-align:center;background:var(--surface-2)"});

  function updateCount(){
    countDisplay.innerHTML = "";
    const phrase = activeCls.exNoun.replace(/[0-9]/, countNum);
    countDisplay.append(
      h("div",{class:"spread",style:"justify-content:center;align-items:center;gap:14px"},
        h("span",{class:"lo",style:"font-size:2.4rem;font-weight:700;color:var(--accent)"}, phrase),
        h("button",{class:"btn primary sm",onclick:()=>speak(phrase)}, icon("play"), "Play Audio")
      ),
      h("div",{style:"margin-top:10px;font-size:1.1rem;font-weight:600"}, "Classifier: " + activeCls.cls + " (" + activeCls.rom + ")"),
      h("p",{class:"small muted"}, "Category: " + activeCls.forWhat)
    );
  }

  const numRow = h("div",{class:"row",style:"justify-content:center;gap:10px;margin-bottom:12px"},
    [1, 2, 3, 5, 10].map(n => h("button",{class:"btn sm"+(n===countNum?" primary":""),onclick:e=>{
      $$("button",numRow).forEach(x=>x.className="btn sm");
      e.currentTarget.className="btn sm primary";
      countNum = n;
      updateCount();
    }}, n + " items"))
  );

  updateCount();

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ທົດລອງສ້າງປະໂຫຍກນັບຈຳນວນ (Interactive Counting Builder)" : "Interactive Counting Builder"),
    numRow,
    countDisplay
  ));

  // Classifiers Cards
  const clsGrid = h("div",{class:"grid2"});
  LAO_CLASSIFIERS.forEach(c => {
    clsGrid.append(h("button",{class:"card",style:"text-align:left;display:flex;flex-direction:column;gap:6px",onclick:()=>{ activeCls=c; updateCount(); speak(c.exNoun); }},
      h("div",{class:"spread"},
        h("span",{class:"lo",style:"font-size:2rem;font-weight:700;color:var(--accent)"}, c.cls),
        h("span",{class:"chip lv"}, c.rom)
      ),
      h("b",{style:"font-size:1rem"}, c.forWhat),
      h("div",{class:"lo",style:"font-size:1.1rem;color:var(--ink)"}, c.exNoun),
      h("div",{class:"small muted"}, "Pattern: " + c.pattern)
    ));
  });

  root.append(h("section",{class:"sect"},
    h("h2",null, lang()==="lo" ? "ລັກສະນະນາມທີ່ໃຊ້ເລື້ອຍທີ່ສຸດ (High-Frequency Classifiers)" : "High-Frequency Lao Classifiers"),
    clsGrid
  ));

  return root;
};

// =========================================================================
// 6. LAO CULTURE LAB & CONTEXT CARDS (ຫ້ອງທົດລອງວັດທະນະທຳລາວ)
// =========================================================================
const CULTURE_MODULES = [
  {
    title: { en:"The Sabaidee & The Nop (ສະບາຍດີ & ການນົບ)", lo:"ສະບາຍດີ ແລະ ການນົບ" },
    tag: "Etiquette & Greetings",
    body: {
      en: "The 'Nop' (wai) is the quintessential Lao gesture of respect and greeting. Palms are pressed together in prayer-like fashion accompanied by a slight bow. Hand height communicates social status: chest-level for peers and friends; chin/nose level for parents, teachers, and elders; eyebrow/forehead level for Buddhist monks.",
      lo: "ການນົບແມ່ນມາລະຍາດອັນດີງາມຂອງຊາດລາວ ສະແດງເຖິງຄວາມເຄົາລົບ ແລະ ຄວາມອ່ອນນ້ອມ. ລະດັບການນົບ: ລະດັບເອິກສຳລັບໝູ່ເພື່ອນ, ລະດັບປາຍດັງ/ຄາງສຳລັບພໍ່ແມ່ຄູອາຈານ, ແລະ ລະດັບຫວ່າງຄິ້ວສຳລັບພຣະສົງ."
    },
    cards: [
      { type:"NATIVE NOTE", text:"Lao people rarely shake hands in traditional settings; a gentle smile and graceful nop creates immediate warmth and mutual respect." },
      { type:"COMMON MISTAKE", text:"Do not nop to children or service staff significantly younger than you; a warm smile and nod is the natural native response." }
    ]
  },
  {
    title: { en:"The Soukhwan / Baci Ceremony (ພິທີບາສີສູ່ຂວັນ)", lo:"ພິທີບາສີສູ່ຂວັນ" },
    tag: "Tradition & Ritual",
    body: {
      en: "The Baci (or Soukhwan) is an ancient animist-Buddhist ceremony deeply rooted in Lao identity. It is performed for weddings, welcoming travelers, healing, new babies, and Lao New Year (Pi Mai). A central marigold flower tower (pha kwan) is blessed, and elders tie white cotton threads (ຝ້າຍຜູກແຂນ) around participants' wrists to bind the 32 protective spirits (kwan) to the body and impart blessings.",
      lo: "ພິທີບາສີສູ່ຂວັນເປັນປະເພນີອັນເກົ່າແກ່ທີ່ຜູກພັນກັບຊີວິດຄົນລາວ ຈັດຂຶ້ນເພື່ອເປັນສິຣິມຸງຄຸນ ເອີ້ນຂວັນທັງ 32 ຂວັນໃຫ້ກັບມາຢູ່ກັບເນື້ອຢູ່ກັບຄີງ."
    },
    cards: [
      { type:"CULTURE NOTE", text:"Keep white cotton strings on your wrists for at least three full days after a Baci before untying (never cutting) them." }
    ]
  },
  {
    title: { en:"Sticky Rice & Dining Etiquette (ເຂົ້າໜຽວ & ວັດທະນະທຳການກິນ)", lo:"ເຂົ້າໜຽວ ແລະ ວັດທະນະທຳການກິນ" },
    tag: "Food & Social Life",
    body: {
      en: "Lao people proudly refer to themselves as 'Luk Khao Niaow' (children of sticky rice). Sticky rice is served in woven bamboo baskets (ຕິບເຂົ້າ, tip khao). You eat with your right hand: roll a small portion of rice into a neat ball, then dip it into spicy dipping sauces (ແຈ່ວ, jaew), meats, or soup. Dining is always shared communally from dishes placed in the center.",
      lo: "ຄົນລາວເປັນລູກເຂົ້າໜຽວ ກິນເຂົ້າໜຽວຮ່ວມກັບແຈ່ວ, ລາບ, ແກງໜໍ່ໄມ້. ການກິນເຂົ້າເປັນການເຕົ້າໂຮມຄວາມສາມັກຄີໃນຄອບຄົວ."
    },
    cards: [
      { type:"NATIVE NOTE", text:"Always use your right hand when rolling sticky rice; the left hand is traditionally kept clean for touching shared utensils." }
    ]
  },
  {
    title: { en:"The 'Bo Pen Nyang' Mindset (ບໍ່ເປັນຫຍັງ)", lo:"ປັດຊະຍາ 'ບໍ່ເປັນຫຍັງ'" },
    tag: "Philosophy of Life",
    body: {
      en: "'Bo pen nyang' literally means 'it is nothing' or 'no problem', but culturally it represents emotional equanimity, forgiveness, and preserving social harmony. Confrontation and public displays of anger are avoided. If plans change or accidents happen, taking it in stride with 'bo pen nyang' is the Lao way of maintaining peace.",
      lo: "'ບໍ່ເປັນຫຍັງ' ບໍ່ພຽງແຕ່ເປັນຄຳເວົ້າ ແຕ່ເປັນປັດຊະຍາຊີວິດທີ່ສະແດງເຖິງການໃຫ້ອະໄພ, ຄວາມໃຈເຢັນ, ບໍ່ຢາກໃຫ້ຜູ້ອື່ນລຳບາກໃຈ."
    },
    cards: [
      { type:"LANGUAGE NOTE", text:"'ບໍ່ເປັນຫຍັງ' functions as 'You're welcome', 'No problem', 'Never mind', and 'Don't worry about it' all in one!" }
    ]
  },
  {
    title: { en:"Regional Dialects: Vientiane vs Luang Prabang vs Pakse", lo:"ຄວາມແຕກຕ່າງລະຫວ່າງສຳນຽງພາກເໜືອ, ກາງ ແລະ ໃຕ້" },
    tag: "Linguistics & Dialects",
    body: {
      en: "Lao has notable regional variations. Vientiane / Central Lao is the standard national baseline taught in this platform (6 tones). Luang Prabang (Northern Lao) has 5 tones with a distinct lilting cadence, turning some /ch/ sounds into /s/ and using Northern vocabulary. Southern Lao (Champasak/Pakse) has a brisk, energetic cadence and specific local terminology.",
      lo: "ພາສາລາວມີຄວາມຫຼາກຫຼາຍຕາມພາກ: ສຳນຽງວຽງຈັນ (ມາດຕະຖານ 6 ສຽງ), ສຳນຽງຫຼວງພະບາງ (5 ສຽງ ຫວານມ່ວນ), ແລະ ສຳນຽງພາກໃຕ້ (ວ່ອງໄວ ໜັກແໜ້ນ)."
    },
    cards: [
      { type:"NATIVE NOTE", text:"While dialect accents differ, speakers from all regions easily understand standard Vientiane Lao." }
    ]
  }
];

LAB_VIEWS.culture_lab = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ຫ້ອງທົດລອງວັດທະນະທຳ ແລະ ບໍລິບົດພາສາລາວ" : "Lao Culture Lab & Context Cards",
    lang()==="lo" ? "ພາສາ ແລະ ວັດທະນະທຳແຍກອອກຈາກກັນບໍ່ໄດ້: ເຂົ້າໃຈວ່າ 'ເປັນຫຍັງຄົນລາວຈຶ່ງເວົ້າແນວນີ້' ໃນແຕ່ລະສະຖານະການ" : "Language cannot be separated from culture. Understand why Lao people communicate the way they do in real-world contexts."
  ));

  const cultGrid = h("div",{class:"stack",style:"gap:20px"});
  CULTURE_MODULES.forEach(mod => {
    const cardEl = h("div",{class:"card stack",style:"gap:12px;padding:22px"},
      h("div",{class:"spread"},
        h("h2",{style:"font-size:1.35rem;color:var(--accent)"}, tr(mod.title, lang())),
        h("span",{class:"chip lv"}, mod.tag)
      ),
      h("p",{style:"font-size:1.02rem;line-height:1.6"}, tr(mod.body, lang())),
      h("div",{class:"grid2",style:"gap:10px;margin-top:6px"},
        mod.cards.map(c => h("div",{class:"banner "+(c.type.includes("MISTAKE")?"warn":"info"),style:"font-size:.88rem"},
          h("b",null,c.type + ": "), c.text
        ))
      )
    );
    cultGrid.append(cardEl);
  });

  root.append(cultGrid);
  return root;
};
