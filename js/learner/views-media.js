// Learner Views: Video Learning Feed & Lao Script Handwriting Studio
import { h, $$, icon, toast, tr, stripTone, videoSource } from "../shared/ui.js";
import { transcriptOf, recapOf, mountPlayer, activeIndex, formatTime, parseTime } from "../shared/video.js";
import { t, lang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";
import { A, T, expLang, logEvent, touchDay } from "./core.js";

export const MEDIA_VIEWS = {};
const go = (...a) => A.go(...a);
const pageHead = (title, sub, extra) => h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,title), extra||null), sub ? h("p",{class:expLang()==="lo"&&lang()==="lo"?"lo":""},sub) : null);

// =========================================================================
// 1. VIDEO LEARNING FEED (ວິດີໂອບົດຮຽນ)
// =========================================================================
const CURATED_VIDEOS = [
  {
    id: "v01-greetings",
    title: { en:"Learn to Read and Speak Lao: Greetings", lo:"ຮຽນອ່ານ ແລະ ເວົ້າພາສາລາວ: ຄຳທັກທາຍ", zh:"学读说老挝语：问候语" },
    category: "beginner",
    difficulty: "Stage 1 · Survival",
    embedUrl: "https://www.youtube.com/embed/j7TToA_jaMg",
    desc: { en:"A short lesson on everyday Lao greetings (vaolao channel). Practise the phrases below after watching.", lo:"ບົດຮຽນສັ້ນໆກ່ຽວກັບຄຳທັກທາຍພາສາລາວໃນຊີວິດປະຈຳວັນ. ຝຶກປະໂຫຍກຂ້າງລຸ່ມນີ້ຫຼັງຈາກເບິ່ງ." },
    transcript: [
      { sp:"Somxai", lo:"ສະບາຍດີຕອນເຊົ້າເອື້ອຍ! ມື້ນີ້ສະບາຍດີບໍ່?", rom:"sà-bāi-dīi tɔɔn-sào ɯ̂aai! mɯ̂ɯ-nîi sà-bāi-dīi bɔ̀ɔ?", en:"Good morning older sister! How are you doing today?" },
      { sp:"Noy", lo:"ສະບາຍດີ! ເອື້ອຍສະບາຍດີ, ຂອບໃຈຫຼາຍໆເດີ້.", rom:"sà-bāi-dīi! ɯ̂aai sà-bāi-dīi, khɔ̌ɔp-jái lǎai-lǎai dêe.", en:"Hello! I am doing well, thank you so much!" },
      { sp:"Somxai", lo:"ກິນເຂົ້າເຊົ້າແລ້ວບໍ?", rom:"kin khào sào lɛ̂ɛo bɔ̀ɔ?", en:"Have you eaten breakfast yet?" },
      { sp:"Noy", lo:"ກິນແລ້ວລະ, ເຈົ້າເດ?", rom:"kin lɛ̂ɛo la, jâo de?", en:"I've eaten already, and you?" }
    ],
    vocab: [
      { lo:"ສະບາຍດີ", rom:"sà-bāi-dīi", en:"hello / good health" },
      { lo:"ຕອນເຊົ້າ", rom:"tɔɔn-sào", en:"morning time" },
      { lo:"ກິນເຂົ້າເຊົ້າ", rom:"kin khào sào", en:"eat breakfast" },
      { lo:"ຂອບໃຈ", rom:"khɔ̌ɔp-jái", en:"thank you" }
    ]
  },
  {
    id: "v02-vientiane-market",
    title: { en:"Vientiane Night Market: Street Food at Sihom", lo:"ຕະຫຼາດກາງຄືນວຽງຈັນ: ອາຫານຢູ່ສີຫອມ", zh:"万象夜市：西洪街头美食" },
    category: "conversation",
    difficulty: "Stage 2 · Everyday",
    embedUrl: "https://www.youtube.com/embed/L3sLXhhtwK0",
    desc: { en:"A walk through the Sihom night market in Vientiane (Lao Ocean channel). Use the phrases below to order food and ask prices.", lo:"ຍ່າງຊົມຕະຫຼາດກາງຄືນສີຫອມ ນະຄອນຫຼວງວຽງຈັນ. ໃຊ້ປະໂຫຍກຂ້າງລຸ່ມນີ້ເພື່ອສັ່ງອາຫານ ແລະ ຖາມລາຄາ." },
    transcript: [
      { sp:"Customer", lo:"ເອື້ອຍ, ໝາກກ້ວຍໜ່ວຍນີ້ຂາຍແນວໃດ?", rom:"ɯ̂aai, màak-kùay nùay nîi khǎai nɛ́ɛo-dǎi?", en:"Older sister, how do you sell these bananas?" },
      { sp:"Vendor", lo:"ຫວີລະ 15,000 ກີບເດີ້. ຫວານຫຼາຍ!", rom:"wǐi la sìp-hâa phan kìip dêe. wǎan lǎai!", en:"15,000 Kip per bunch. They are very sweet!" },
      { sp:"Customer", lo:"ຂໍ 2 ຫວີແດ່ເດີ້, ຫຼຸດໄດ້ບໍ່?", rom:"khɔ̌ɔ sɔ̌ɔng wǐi dɛ̀ɛ dêe, lùt dài bɔ̀ɔ?", en:"I would like 2 bunches please, can you give a small discount?" },
      { sp:"Vendor", lo:"ໄດ້ເລີຍ! ຄົນກັນເອງ, ເອົາ 28,000 ກີບພໍ.", rom:"dài lə́əi! khon kan-ēeng, ao sâao-pɛ̀ɛt phan kìip phɔɔ.", en:"Certainly! As friendly neighbors, 28,000 Kip is fine." }
    ],
    vocab: [
      { lo:"ຂາຍແນວໃດ", rom:"khǎai nɛ́ɛo-dǎi", en:"how is it sold / what is the price" },
      { lo:"ຫຼຸດໄດ້ບໍ່", rom:"lùt dài bɔ̀ɔ", en:"can you give a discount?" },
      { lo:"ຫວີ", rom:"wǐi", en:"bunch of bananas (classifier)" },
      { lo:"ຄົນກັນເອງ", rom:"khon kan-ēeng", en:"friendly acquaintance / among friends" }
    ]
  },
  {
    id: "v03-tone-mastery",
    title: { en:"Learn to Read and Speak Lao: Tones", lo:"ຮຽນອ່ານ ແລະ ເວົ້າພາສາລາວ: ວັນນະຍຸດ", zh:"学读说老挝语：声调" },
    category: "pronunciation",
    difficulty: "Stage 0 · Foundation",
    embedUrl: "https://www.youtube.com/embed/DSuQu7yWirU",
    desc: { en:"Mouth shapes, pitch curves, and muscle memory for mid, falling, rising, and checked tones.", lo:"ການວາງຮູບປາກ, ເສັ້ນສຽງ ແລະ ການຝຶກກ້າມຊີ້ນສຽງ." },
    transcript: [
      { sp:"Teacher", lo:"ຟັງສຽງປຽບທຽບ: ປາ, ປ່າ, ປ້າ.", rom:"fāng sǐang pìap-thìap: paa, pàa, pâa.", en:"Listen to the contrast: Fish (mid), Forest (low), Aunt (falling)." },
      { sp:"Teacher", lo:"ປາ ແມ່ນສຽງກາງພຽງ, ບໍ່ມີວັນນະຍຸດ.", rom:"paa mâaen sǐang kāang phíang, bɔ̀ɔ mii wán-na-nyút.", en:"Paa is mid-level pitch, with no tone mark." }
    ],
    vocab: [
      { lo:"ປາ", rom:"paa", en:"fish (mid tone)" },
      { lo:"ປ່າ", rom:"pàa", en:"forest (low tone)" },
      { lo:"ປ້າ", rom:"pâa", en:"aunt (falling tone)" }
    ]
  },
  {
    id: "v04-baci-ceremony",
    title: { en:"The Baci (Sou Khuan) Ceremony", lo:"ພິທີບາສີສູ່ຂວັນ", zh:"老挝传统拴线祈福仪式 (Baci)" },
    category: "culture",
    difficulty: "Stage 3 · Conversational",
    embedUrl: "https://www.youtube.com/embed/ZABBTXMXfAI",
    desc: { en:"UNESCO ICHCAP documentary on the Baci-Soukhouane ceremony, where white strings are tied on the wrist as a blessing.", lo:"ສາລະຄະດີຂອງ UNESCO ICHCAP ກ່ຽວກັບພິທີບາສີສູ່ຂວັນ ແລະ ການຜູກແຂນເອົາພອນ." },
    transcript: [
      { sp:"Elder", lo:"ມານີ້ເດີ້ລູກຫຼານ, ມາຜູກແຂນເອົາພອນໄຊ.", rom:"maa nîi dêe lûuk-lǎan, maa phùuk-khɛ̌ɛn ao phɔɔn-sái.", en:"Come here children, let us tie the white threads and receive blessings." },
      { sp:"Guest", lo:"ສາທຸ! ຂໍໃຫ້ມີສຸຂະພາບແຂງແຮງ, ໂຊກດີຕະຫຼອດໄປ.", rom:"sǎa-thú! khɔ̌ɔ hài mii sú-kha-phâap khɛ̌ɛng-hɛ́ɛng, sôok-dīi dtā-lɔ̀ɔt pái.", en:"Satu! May we be blessed with great health and continuous good fortune." }
    ],
    vocab: [
      { lo:"ບາສີສູ່ຂວັນ", rom:"baa-sǐi sùu-khwǎn", en:"Baci spirit-calling ceremony" },
      { lo:"ຜູກແຂນ", rom:"phùuk-khɛ̌ɛn", en:"to tie cotton thread on wrist" },
      { lo:"ພອນໄຊ", rom:"phɔɔn-sái", en:"sacred blessings" },
      { lo:"ສາທຸ", rom:"sǎa-thú", en:"amen / solemn affirmation" }
    ]
  }
];

const LL = (en, lo) => lang()==="lo" ? lo : en;
const CATS = [["all","All videos","ວິດີໂອທັງໝົດ"],["beginner","Beginner","ເລີ່ມຕົ້ນ"],["conversation","Conversation","ການສົນທະນາ"],["pronunciation","Pronunciation","ການອອກສຽງ"],["culture","Culture","ວັດທະນະທຳ"]];
const catLabel = c => { const x = CATS.find(k => k[0]===c); return x ? LL(x[1], x[2]) : (c || ""); };
const hasLao = s => /[຀-໿]/.test(String(s||""));
const videoList = () => {
  const fromB = (A.B && Array.isArray(A.B.videos) && A.B.videos.length) ? A.B.videos : CURATED_VIDEOS;
  return fromB.slice().sort((a,b) => ((a.level||1)-(b.level||1)) || ((a.order||0)-(b.order||0)));
};
const findVideo = id => videoList().find(v => String(v.id) === String(id));
const waitConnected = el => new Promise(res => { const t0 = Date.now(); const tick = () => (el.isConnected || Date.now()-t0 > 4000) ? res() : requestAnimationFrame(tick); tick(); });
const pref = (k, d) => { try { const v = localStorage.getItem("laolao.video."+k); return v==null ? d : v==="1"; } catch(e){ return d; } };
const setPref_ = (k, v) => { try { localStorage.setItem("laolao.video."+k, v?"1":"0"); } catch(e){} };

// ---------- video library ----------
MEDIA_VIEWS.videos = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    LL("Lao Video Lessons", "ວິດີໂອບົດຮຽນພາສາລາວ"),
    LL("Watch real Lao videos with a transcript that follows along, then review the recap and practise the key phrases.",
       "ເບິ່ງວິດີໂອພາສາລາວ ພ້ອມບົດຖອດຄວາມທີ່ເລື່ອນຕາມ, ແລ້ວທົບທວນສະຫຼຸບ ແລະ ຝຶກປະໂຫຍກສຳຄັນ.")));
  let cat = "all", q = "";
  const grid = h("div",{class:"vlib"});
  const draw = () => {
    const f = q.trim().toLowerCase();
    const items = videoList().filter(v => (cat==="all" || v.category===cat) &&
      (!f || [tr(v.title, lang()), v.title && v.title.en, v.title && v.title.lo, tr(v.desc, lang())].some(s => String(s||"").toLowerCase().includes(f))));
    grid.replaceChildren(...(items.length ? items.map(videoCard) : [h("div",{class:"empty"}, LL("No videos match.", "ບໍ່ພົບວິດີໂອ."))]));
  };
  const seg = h("div",{class:"seg",role:"tablist"}, CATS.map(([k]) => h("button",{"aria-pressed":String(k===cat),onclick:e=>{ cat=k; $$("button",seg).forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); draw(); }}, catLabel(k))));
  const search = h("input",{class:"input",type:"search",placeholder:LL("Search videos…","ຄົ້ນຫາວິດີໂອ…"),"aria-label":LL("Search videos","ຄົ້ນຫາວິດີໂອ"),oninput:e=>{ q=e.target.value; draw(); }});
  root.append(h("div",{class:"vlib-tools"}, seg, search), grid);
  draw();
  return root;
};

function videoCard(v){
  const s = videoSource(v.embedUrl), tx = transcriptOf(v), rc = recapOf(v);
  return h("button",{class:"vcard2",onclick:()=>go("video",{ id:v.id })},
    h("div",{class:"vthumb"},
      s.thumb ? h("img",{src:s.thumb,alt:"",loading:"lazy"}) : h("div",{class:"vthumb-ph"}, icon("video")),
      h("span",{class:"vplay"}, icon("play")),
      v.level ? h("span",{class:"vlevel"}, "Stage "+v.level) : null),
    h("div",{class:"vbody"},
      h("b",{class:"vtitle"+(lang()==="lo"&&v.title&&v.title.lo?" lo":"")}, tr(v.title, lang())),
      v.desc ? h("p",{class:"vdesc"}, tr(v.desc, lang())) : null,
      h("div",{class:"vmeta"},
        v.category ? h("span",{class:"chip"}, catLabel(v.category)) : null,
        tx.timed ? h("span",{class:"chip acc"}, icon("note"), LL("Transcript","ບົດຖອດຄວາມ")) : null,
        !rc.empty ? h("span",{class:"chip lv"}, icon("review"), LL("Recap","ສະຫຼຸບ")) : null)));
}

// ---------- one video: player · synced transcript · recap ----------
MEDIA_VIEWS.video = ({ id }) => {
  const v = findVideo(id);
  if (!v) return h("div",{class:"stack"}, h("button",{class:"btn ghost sm",style:"align-self:flex-start",onclick:()=>go("videos")}, icon("left"), LL("All videos","ວິດີໂອທັງໝົດ")), h("div",{class:"empty"}, LL("This video is not available.","ບໍ່ພົບວິດີໂອນີ້.")));
  const src = videoSource(v.embedUrl), tx = transcriptOf(v), rc = recapOf(v), lines = tx.lines;
  const hasEn = lines.some(l => l.en), hasRom = lines.some(l => l.rom);
  let ctl = null, cur = -1, follow = pref("follow", true), userScrolled = false, logged = false;

  // --- header ---
  const head = h("div",{class:"vd-head"},
    h("button",{class:"btn ghost sm vd-back",onclick:()=>go("videos")}, icon("left"), LL("All videos","ວິດີໂອທັງໝົດ")),
    h("h1",{class:lang()==="lo"&&v.title&&v.title.lo?"lo":""}, tr(v.title, lang())),
    h("div",{class:"vmeta"},
      v.category ? h("span",{class:"chip"}, catLabel(v.category)) : null,
      v.difficulty ? h("span",{class:"chip lv"}, v.difficulty) : null,
      src.watch ? h("a",{class:"small",href:src.watch,target:"_blank",rel:"noopener"}, LL("Open on YouTube ↗","ເປີດໃນ YouTube ↗")) : null));

  // --- 1. player + live caption ---
  const host = h("div",{class:"vd-host"});
  const capText = h("div",{class:"vd-cap-text"}), capSub = h("div",{class:"vd-cap-sub"});
  const caption = tx.timed ? h("div",{class:"vd-caption","aria-live":"polite"}, capText, capSub) : null;
  const stage = h("section",{class:"vd-stage","aria-label":LL("Video player","ເຄື່ອງຫຼິ້ນວິດີໂອ")}, h("div",{class:"video-embed-wrap"}, host), caption);
  const setCaption = l => { if (!caption) return;
    capText.textContent = l ? l.text : LL("Press play — the transcript follows the video.","ກົດຫຼິ້ນ — ບົດຖອດຄວາມຈະເລື່ອນຕາມວິດີໂອ.");
    capText.className = "vd-cap-text"+(l && hasLao(l.text) ? " lo" : "") + (l ? "" : " muted");
    capSub.textContent = l ? [l.rom, l.en].filter(Boolean).join("  ·  ") : ""; };
  setCaption(null);

  // --- 2. transcript ---
  const linesBox = h("div",{class:"vd-lines",tabindex:"0","aria-label":LL("Transcript","ບົດຖອດຄວາມ")});
  const resume = h("button",{class:"btn sm primary vd-resume",hidden:true,onclick:()=>{ userScrolled=false; resume.hidden=true; scrollToActive(true); }}, LL("↓ Back to current line","↓ ກັບໄປແຖວປັດຈຸບັນ"));
  const lineEls = lines.map((l, i) => {
    const say = hasLao(l.text) ? h("button",{class:"ib vd-say-sm",title:LL("Listen","ຟັງ"),"aria-label":LL("Listen","ຟັງ"),onclick:e=>{ e.stopPropagation(); speak(l.text); }}, icon("speaker")) : null;
    const el = h("div",{class:"vd-line",role:"button",tabindex:"0","data-i":String(i),
        onclick:()=>seekTo(l.start), onkeydown:e=>{ if (e.key==="Enter"||e.key===" "){ e.preventDefault(); seekTo(l.start); } }},
      h("span",{class:"vd-ts"}, formatTime(l.start)),
      h("div",{class:"vd-tx"},
        h("div",{class:"vd-text"+(hasLao(l.text)?" lo":"")}, l.sp ? h("b",{class:"vd-sp"}, l.sp+": ") : null, l.text),
        l.rom ? h("div",{class:"vd-rom"}, l.rom) : null,
        l.en ? h("div",{class:"vd-en"}, l.en) : null),
      say);
    return el;
  });
  linesBox.append(...lineEls);
  ["wheel","touchmove","keydown"].forEach(ev => linesBox.addEventListener(ev, e => {
    if (ev==="keydown" && !/^(Arrow|Page|Home|End)/.test(e.key)) return;
    if (follow && cur >= 0){ userScrolled = true; resume.hidden = false; } }, { passive:true }));
  const toggle = (label, key, on, apply) => { const cb = h("input",{type:"checkbox",class:"switch",checked:on,"aria-label":label,onchange:e=>{ setPref_(key, e.target.checked); apply(e.target.checked); }}); apply(on); return h("label",{class:"vd-toggle"}, cb, h("span",null,label)); };
  const transcriptPanel = h("section",{class:"vd-panel vd-transcript","data-panel":"transcript"},
    h("div",{class:"vd-panel-head"},
      h("h2",null, icon("note"), LL("Transcript","ບົດຖອດຄວາມ"), lines.length ? h("span",{class:"chip"}, String(lines.length)) : null),
      lines.length ? h("div",{class:"vd-toggles"},
        toggle(LL("Follow video","ເລື່ອນຕາມວິດີໂອ"), "follow", follow, on => { follow = on; userScrolled = false; resume.hidden = true; if (on) scrollToActive(true); }),
        hasRom ? toggle(LL("Romanization","ຄຳອ່ານ"), "rom", pref("rom", true), on => linesBox.classList.toggle("no-rom", !on)) : null,
        hasEn ? toggle(LL("Translation","ຄຳແປ"), "en", pref("en", true), on => { linesBox.classList.toggle("no-en", !on); stage.classList.toggle("no-en", !on); }) : null) : null),
    lines.length ? h("div",{class:"vd-lines-wrap"}, linesBox, resume)
      : h("div",{class:"empty vd-empty"}, LL("No transcript for this video yet.","ວິດີໂອນີ້ຍັງບໍ່ມີບົດຖອດຄວາມ.")));

  // --- 3. recap ---
  const playPoint = p => { if (p.audio){ const a = new Audio(p.audio); a.play().catch(() => speak(p.lo)); } else speak(p.lo || p.en); };
  const recapPanel = h("section",{class:"vd-panel vd-recap","data-panel":"recap"},
    h("div",{class:"vd-panel-head"}, h("h2",null, icon("review"), LL("Recap","ສະຫຼຸບ"))),
    rc.empty ? h("div",{class:"empty vd-empty"}, LL("No recap for this video yet.","ວິດີໂອນີ້ຍັງບໍ່ມີບົດສະຫຼຸບ.")) : null,
    rc.summary ? h("p",{class:"vd-summary"+(expLang()==="lo"&&rc.summary.lo?" lo":"")}, tr(rc.summary, expLang())) : null,
    rc.points.length ? h("h3",{class:"vd-sub"}, LL("Key phrases","ປະໂຫຍກສຳຄັນ")) : null,
    rc.points.length ? h("ol",{class:"vd-points"}, rc.points.map(p => h("li",{class:"vd-point"},
      h("button",{class:"vd-say",title:LL("Play","ຫຼິ້ນສຽງ"),"aria-label":LL("Play","ຫຼິ້ນສຽງ")+" "+(p.lo||p.en||""),onclick:()=>playPoint(p)}, icon("speaker")),
      h("div",{class:"vd-point-tx"},
        p.lo ? h("div",{class:"vd-point-lo lo"}, p.lo) : null,
        p.rom ? h("div",{class:"vd-rom"}, p.rom) : null,
        p.en ? h("div",{class:"vd-en"}, p.en) : null),
      parseTime(p.at) != null ? h("button",{class:"btn sm ghost vd-jump",title:LL("Watch this part","ເບິ່ງຕອນນີ້"),onclick:()=>seekTo(parseTime(p.at))}, icon("play"), formatTime(parseTime(p.at))) : null))) : null,
    rc.vocab.length ? h("h3",{class:"vd-sub"}, LL("Key vocabulary","ຄຳສັບສຳຄັນ")) : null,
    rc.vocab.length ? h("div",{class:"vd-vocab"}, rc.vocab.map(w => h("button",{class:"btn sm ghost",onclick:()=>speak(w.lo)}, icon("speaker"), h("b",{class:"lo"}, w.lo), w.rom ? h("span",{class:"vd-rom"}, w.rom) : null, w.en ? h("span",{class:"small muted"}, w.en) : null))) : null);

  // --- tabs (phones show one panel at a time) ---
  const tabs = h("div",{class:"seg vd-tabs",role:"tablist"}, [["transcript", LL("Transcript","ບົດຖອດຄວາມ")], ["recap", LL("Recap","ສະຫຼຸບ")]].map(([k, label]) =>
    h("button",{role:"tab","aria-pressed":String(k==="transcript"),onclick:e=>{ root.dataset.tab = k; $$("button",tabs).forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); if (k==="transcript") scrollToActive(true); }}, label)));

  // --- sync ---
  function scrollToActive(force){
    const el = lineEls[cur]; if (!el || !follow || (userScrolled && !force)) return;
    if (!linesBox.offsetParent) return;                          // hidden tab
    const top = el.offsetTop - linesBox.clientHeight * 0.3;
    linesBox.scrollTo({ top: Math.max(0, top), behavior: force ? "auto" : "smooth" });
  }
  function onTime(t){
    const i = activeIndex(lines, t);
    if (i === cur) return;
    if (lineEls[cur]) lineEls[cur].classList.remove("on");
    cur = i;
    lineEls.forEach((el, k) => el.classList.toggle("past", k < i));
    if (lineEls[i]){ lineEls[i].classList.add("on"); lineEls[i].setAttribute("aria-current","true"); }
    setCaption(lines[i] || null);
    scrollToActive(false);
  }
  function seekTo(t){
    if (t == null) return;
    userScrolled = false; resume.hidden = true;
    if (ctl && ctl.sync){ ctl.seek(t, true); onTime(t); }
    else if (src.watch) window.open(src.watch + "&t=" + Math.floor(t) + "s", "_blank", "noopener");
  }

  // wide screens: transcript beside the player (same height); narrower: below it; recap underneath
  const root = h("div",{class:"vd","data-tab":"transcript"}, head,
    h("div",{class:"vd-watch"}, stage, h("div",{class:"vd-side"}, transcriptPanel)),
    tabs, recapPanel);
  waitConnected(host).then(async () => {
    ctl = await mountPlayer(host, v.embedUrl, { onTime, onState: st => {
      if (st !== "playing") return;
      if (!logged){ logged = true; logEvent("video", { ref:v.id }); touchDay(); }
      // phones: bring the player to the top so the transcript has room below it
      if (matchMedia("(max-width:700px)").matches){ const top = stage.getBoundingClientRect().top; if (top > 4) window.scrollTo({ top: window.scrollY + top, behavior: "smooth" }); }
    } });
    root.__player = ctl;
    if (!ctl.sync && lines.length) transcriptPanel.querySelector(".vd-panel-head").append(h("p",{class:"small muted vd-nosync"}, LL("Live sync is unavailable here — tap a line to open YouTube at that moment.","ບໍ່ສາມາດເລື່ອນຕາມໄດ້ — ແຕະແຖວເພື່ອເປີດ YouTube ທີ່ເວລານັ້ນ.")));
  });
  return root;
};

// =========================================================================
// 2. LAO SCRIPT HANDWRITING STUDIO (ຫ້ອງຝຶກຂຽນຕົວອັກສອນລາວ)
// =========================================================================
const LAO_LETTERS_DATA = [
  { char:"ກ", name:"kɔ̀ɔ kái", meaning:"chicken", sound:"[k]", strokes:1, desc:"Single continuous loop starting from bottom-left, curving up like a chicken beak, and down to the baseline." },
  { char:"ຂ", name:"khɔ̌ɔ khǎi", meaning:"egg", sound:"[kh]", strokes:1, desc:"Starts with a rounded circular head at top-left, curves down, and sweeps right." },
  { char:"ຄ", name:"khɔ́ɔ khwáai", meaning:"water buffalo", sound:"[kh]", strokes:1, desc:"Circular loop head, curving upwards into an arched canopy and dropping down." },
  { char:"ງ", name:"ngɔ́ɔ ngúu", meaning:"snake", sound:"[ŋ]", strokes:1, desc:"Rounded top loop with a smooth tail extending downwards like a snake." },
  { char:"ຈ", name:"jɔ̀ɔ jɔ́ɔk", meaning:"cup", sound:"[tɕ]", strokes:1, desc:"Inward loop with an arched hook." },
  { char:"ສ", name:"sɔ̌ɔ sɯ̌a", meaning:"tiger", sound:"[s]", strokes:1, desc:"High consonant with loop head and an upward whisker." },
  { char:"ຊ", name:"sɔ́ɔ xâang", meaning:"elephant", sound:"[s]", strokes:1, desc:"Low consonant elephant with distinctive notched tail." },
  { char:"ດ", name:"dɔ̀ɔ dék", meaning:"child", sound:"[d]", strokes:1, desc:"Inward loop facing right, ascending into an arched dome." },
  { char:"ຕ", name:"tɔ̀ɔ taa", meaning:"eye", sound:"[t]", strokes:1, desc:"Resembles ດ with an indented notch at the top." },
  { char:"ນ", name:"nɔ́ɔ nók", meaning:"bird", sound:"[n]", strokes:1, desc:"Double-looped balance consonant." },
  { char:"ບ", name:"bɔ̀ɔ bɛ́ɛ", meaning:"goat", sound:"[b]", strokes:1, desc:"Square-bottomed live syllable consonant." },
  { char:"ປ", name:"pɔ̀ɔ paa", meaning:"fish", sound:"[p]", strokes:1, desc:"Like ບ with an extended tall tail swimming upwards." },
  { char:"ມ", name:"mɔ́ɔ máa", meaning:"horse", sound:"[m]", strokes:1, desc:"Smooth forward looped consonant." },
  { char:"ລ", name:"lɔ́ɔ líng", meaning:"monkey", sound:"[l]", strokes:1, desc:"Graceful double wave starting from circle." },
  { char:"ວ", name:"wɔ́ɔ wīi", meaning:"hand fan", sound:"[w]", strokes:1, desc:"Compact circular consonant curving smoothly upwards." },
  { char:"ຫ", name:"hɔ̌ɔ hǎan", meaning:"goose", sound:"[h]", strokes:1, desc:"High consonant with knot loop at the top." },
  { char:"ອ", name:"ɔ̀ɔ oo", meaning:"bowl / vessel", sound:"[ʔ]", strokes:1, desc:"Universal initial glottal carrier." },
  { char:"ຮ", name:"hɔ́ɔ hɯ́an", meaning:"house", sound:"[h]", strokes:1, desc:"Low consonant with curling chimney roof." }
];

MEDIA_VIEWS.handwriting = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ຫ້ອງຝຶກຂຽນຕົວອັກສອນລາວ (Lao Handwriting Studio)" : "Lao Script Handwriting Studio",
    lang()==="lo" ? "ຝຶກຂຽນຕົວອັກສອນລາວຕາມເສັ້ນແນະນຳ, ທິດທາງການຕັ້ງຫົວ ແລະ ການປະເມີນລາຍມືແບບໂຕ້ຕອບ" : "Practice writing authentic Lao consonants on a digital canvas with outline guidelines, directional guides, and real-time stroke assessment."
  ));

  let curChar = LAO_LETTERS_DATA[0];
  let isDrawing = false;
  let strokePoints = [];
  let userStrokes = [];

  const canvas = document.createElement("canvas");
  canvas.className = "hw-canvas";
  canvas.width = 260;
  canvas.height = 260;
  const ctx = canvas.getContext("2d");

  const bgChar = h("div",{class:"hw-canvas-bg"}, curChar.char);
  const statusMsg = h("div",{class:"small",style:"font-weight:700;color:var(--accent);min-height:22px;text-align:center"}, "Draw inside the guideline box following the model outline.");

  function getPos(e){
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: cx * (canvas.width / r.width), y: cy * (canvas.height / r.height) };
  }

  function startDraw(e){
    e.preventDefault();
    isDrawing = true;
    const p = getPos(e);
    strokePoints = [p];
    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function drawMove(e){
    if (!isDrawing) return;
    e.preventDefault();
    const p = getPos(e);
    strokePoints.push(p);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function endDraw(e){
    if (!isDrawing) return;
    isDrawing = false;
    if (strokePoints.length > 3){
      userStrokes.push(strokePoints);
    }
  }

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", drawMove);
  window.addEventListener("mouseup", endDraw);

  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", drawMove, { passive: false });
  canvas.addEventListener("touchend", endDraw, { passive: false });

  function clearCanvas(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokePoints = [];
    userStrokes = [];
    statusMsg.textContent = "Canvas cleared. Trace the letter smoothly.";
    statusMsg.style.color = "var(--ink-2)";
  }

  function evaluateDrawing(){
    if (!userStrokes.length){
      statusMsg.textContent = "Please write on the canvas first!";
      statusMsg.style.color = "var(--warn)";
      return;
    }
    // Assess pixel coverage & bounds
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let drawnPixels = 0;
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;

    for (let y = 0; y < canvas.height; y++){
      for (let x = 0; x < canvas.width; x++){
        const alpha = imgData.data[(y * canvas.width + x) * 4 + 3];
        if (alpha > 40){
          drawnPixels++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;

    if (drawnPixels < 250){
      statusMsg.textContent = "Stroke too short or faint. Please trace the full letter.";
      statusMsg.style.color = "var(--bad)";
      toast("Stroke too short", "warn");
    } else if (spanX < 40 || spanY < 40){
      statusMsg.textContent = "Writing is too small! Fill the guideline space.";
      statusMsg.style.color = "var(--bad)";
      toast("Writing too small", "warn");
    } else {
      statusMsg.textContent = `🎉 ຖືກຕ້ອງດີຫຼາຍ! Great stroke work on letter ${curChar.char} (${curChar.name})!`;
      statusMsg.style.color = "var(--jade)";
      toast(`Excellent writing: ${curChar.char}`, "ok");
      speak(curChar.char);
    }
  }

  function selectLetter(item){
    curChar = item;
    bgChar.textContent = item.char;
    clearCanvas();
    speak(item.char);
    charInfo.innerHTML = "";
    charInfo.append(
      h("div",{class:"spread",style:"align-items:center"},
        h("div",null,
          h("h2",{class:"lo",style:"font-size:2.8rem;color:var(--accent);margin:0"}, item.char),
          h("div",{style:"font-size:1.15rem;font-weight:700"}, item.name + " (" + item.meaning + ")"),
          h("div",{class:"mono",style:"color:var(--ink-2);font-size:.9rem"}, "Phonetic: " + item.sound + " · Expected Strokes: " + item.strokes)
        ),
        h("button",{class:"btn primary sm",onclick:()=>speak(item.char)}, icon("play"), "Audio")
      ),
      h("p",{class:"small muted",style:"margin-top:8px"}, item.desc)
    );
  }

  const charInfo = h("div",{class:"card",style:"flex:1;background:var(--surface-2);border-color:var(--accent);padding:20px"});

  const letterChips = h("div",{class:"consonant-chips",style:"justify-content:center;margin-bottom:16px"});
  LAO_LETTERS_DATA.forEach(c => {
    const b = h("button",{class:"consonant-chip",onclick:e=>{
      $$("button",letterChips).forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      selectLetter(c);
    }},
      h("span",{class:"c-char"}, c.char),
      h("span",{class:"c-name"}, c.name.split(" ")[0])
    );
    if (c === curChar) b.classList.add("active");
    letterChips.append(b);
  });

  const canvasWrap = h("div",{class:"hw-canvas-wrap"},
    h("div",{class:"hw-grid-lines"}),
    bgChar,
    canvas
  );

  const hwPanel = h("div",{class:"card",style:"display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px"},
    canvasWrap,
    statusMsg,
    h("div",{class:"hw-controls"},
      h("button",{class:"btn ghost",onclick:clearCanvas}, icon("trash"), "Clear Canvas"),
      h("button",{class:"btn ghost",onclick:()=>speak(curChar.char)}, icon("speaker"), "Listen"),
      h("button",{class:"btn primary",onclick:evaluateDrawing}, icon("check"), "Check Writing")
    )
  );

  selectLetter(curChar);

  root.append(
    letterChips,
    h("div",{class:"grid2",style:"align-items:start"},
      hwPanel,
      charInfo
    )
  );

  return root;
};
