// Learner Views: Video Learning Feed
import { h, $$, icon, toast, tr, stripTone, videoSource } from "../shared/ui.js";
import { transcriptOf, recapOf, mountPlayer, activeIndex, formatTime, parseTime } from "../shared/video.js";
import { t, lang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";
import { A, T, expLang, logEvent, touchDay } from "./core.js";
import { withUse } from "./upgrade.js";

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

// ---------- what to watch next ----------
// Videos finished on this device (to suggest something new first)
const WATCHED = "laolao.video.watched";
const watchedSet = () => { try { return new Set(JSON.parse(localStorage.getItem(WATCHED) || "[]")); } catch(e){ return new Set(); } };
const markWatched = id => { try { const w = watchedSet(); w.delete(String(id)); w.add(String(id)); localStorage.setItem(WATCHED, JSON.stringify([...w].slice(-300))); } catch(e){} };
// The next video of the course first (the ones after this one, same category), then the same category, then the rest;
// videos not watched yet before watched ones, and a stage close to this one before a far one.
export function relatedVideos(v, list = videoList(), seen = watchedSet()){
  const i = list.findIndex(x => String(x.id) === String(v.id));
  const order = i >= 0 ? list.slice(i + 1).concat(list.slice(0, i)) : list.filter(x => String(x.id) !== String(v.id));
  const score = x => (x.category === v.category ? 0 : 2) + (seen.has(String(x.id)) ? 4 : 0) + (Math.abs((x.level || 1) - (v.level || 1)) > 1 ? 1 : 0);
  return order.map((x, k) => [x, score(x), k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a[0]);
}

// ---------- one video: player · synced transcript · recap ----------
// Videos per period: watching the same video again in the same period is not counted twice (ref)
MEDIA_VIEWS.video = ({ id, autoplay }) => findVideo(id) ? withUse("videos.watch", { ref:String(id) }, () => videoView({ id, autoplay })) : videoView({ id });
function videoView({ id, autoplay }){
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

  // --- 4. more videos: what to watch next (on phones its own tab) ---
  const related = relatedVideos(v), seen = watchedSet();
  const morePanel = related.length ? h("section",{class:"vd-panel vd-more","data-panel":"more"},
    h("div",{class:"vd-panel-head"}, h("h2",null, icon("video"), LL("Watch next","ເບິ່ງຕໍ່"))),
    h("div",{class:"vd-more-grid"}, related.slice(0, 6).map((x, k) => {
      const c = videoCard(x);
      if (k === 0) c.querySelector(".vthumb").append(h("span",{class:"vd-upnext-tag"}, LL("Up next","ຕໍ່ໄປ")));
      if (seen.has(String(x.id))) c.querySelector(".vthumb").append(h("span",{class:"vd-seen-tag"}, icon("check"), LL("Watched","ເບິ່ງແລ້ວ")));
      return c; }))) : null;

  // --- tabs (phones show one panel at a time) ---
  const tabs = h("div",{class:"seg vd-tabs",role:"tablist"}, [["transcript", LL("Transcript","ບົດຖອດຄວາມ")], ["recap", LL("Recap","ສະຫຼຸບ")], ...(morePanel ? [["more", LL("Next","ຕໍ່ໄປ")]] : [])].map(([k, label]) =>
    h("button",{role:"tab","aria-pressed":String(k==="transcript"),onclick:e=>{ root.dataset.tab = k; $$("button",tabs).forEach(b=>b.setAttribute("aria-pressed","false")); e.currentTarget.setAttribute("aria-pressed","true"); if (k==="transcript") scrollToActive(true); }}, label)));

  // --- sync ---
  function scrollToActive(force){
    const el = lineEls[cur]; if (!el || !follow || (userScrolled && !force)) return;
    if (!linesBox.offsetParent) return;                          // hidden tab
    const top = el.offsetTop - linesBox.clientHeight * 0.3;
    linesBox.scrollTo({ top: Math.max(0, top), behavior: force ? "auto" : "smooth" });
  }
  // After a jump the player keeps reporting its old time for up to a second; those readings are ignored, so the caption
  // doesn't flick back and a second quick swipe counts from the line just chosen.
  let seekGuard = null;
  function onTime(t){
    if (seekGuard && Date.now() < seekGuard.until){ if (Math.abs(t - seekGuard.t) > 1.5) return; } else seekGuard = null;
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
    if (ctl && ctl.sync){ seekGuard = null; onTime(t); seekGuard = { t, until: Date.now() + 1500 }; ctl.seek(t, true); }
    else if (src.watch) window.open(src.watch + "&t=" + Math.floor(t) + "s", "_blank", "noopener");
  }

  // wide screens: transcript beside the player (same height); narrower: below it; recap underneath
  const root = h("div",{class:"vd","data-tab":"transcript"}, head,
    h("div",{class:"vd-watch"}, stage, h("div",{class:"vd-side"}, transcriptPanel)),
    tabs, recapPanel, morePanel);
  root.__upNext = () => showUpNext();                    // used by the browser tests (a real end needs the whole video)

  // --- 5. the end of the video: up next (8 s countdown), replay, or pick another ---
  const wrap = stage.querySelector(".video-embed-wrap");
  let upNext = null, countdown = null;
  const closeUpNext = () => { clearInterval(countdown); countdown = null; if (upNext){ upNext.remove(); upNext = null; } };
  const openVideo = x => { closeUpNext(); go("video", { id: x.id, autoplay: 1 }); };
  function showUpNext(){
    closeUpNext();
    const nx = related[0], SECS = 8;
    let left = SECS;
    const ring = h("span",{class:"vd-next-ring",style:"--p:0"}, h("b",{class:"tabnum"}, String(left)));
    const cancel = h("button",{class:"btn sm vd-next-cancel",onclick:()=>{ clearInterval(countdown); countdown = null; ring.remove(); cancel.remove(); }}, LL("Cancel","ຍົກເລີກ"));
    upNext = h("div",{class:"vd-next",role:"dialog","aria-label":LL("Up next","ຕໍ່ໄປ")},
      nx ? h("div",{class:"vd-next-card"},
        h("span",{class:"eyebrow"}, LL("Up next","ຕໍ່ໄປ")),
        h("button",{class:"vd-next-item",onclick:()=>openVideo(nx)},
          videoSource(nx.embedUrl).thumb ? h("img",{src:videoSource(nx.embedUrl).thumb,alt:"",loading:"lazy"}) : h("span",{class:"vthumb-ph"}, icon("video")),
          h("span",{class:"vd-next-t"}, h("b",null, tr(nx.title, lang())), nx.level ? h("small",null,"Stage "+nx.level) : null), ring),
        h("div",{class:"row vd-next-btns"},
          h("button",{class:"btn primary sm",onclick:()=>openVideo(nx)}, icon("play"), LL("Play now","ຫຼິ້ນດຽວນີ້")), cancel,
          h("button",{class:"btn sm ghost vd-next-replay",onclick:()=>{ closeUpNext(); if (ctl) ctl.seek(0, true); }}, icon("repeat"), LL("Replay","ເບິ່ງຄືນ"))))
      : h("div",{class:"vd-next-card"}, h("b",null, LL("You've reached the end","ເບິ່ງຈົບແລ້ວ")),
          h("div",{class:"row vd-next-btns"}, h("button",{class:"btn sm primary",onclick:()=>{ closeUpNext(); if (ctl) ctl.seek(0, true); }}, icon("repeat"), LL("Replay","ເບິ່ງຄືນ")),
            h("button",{class:"btn sm",onclick:()=>go("videos")}, LL("All videos","ວິດີໂອທັງໝົດ")))));
    wrap.append(upNext);
    if (nx){ countdown = setInterval(() => {
      if (!upNext || !upNext.isConnected){ clearInterval(countdown); return; }
      left--; ring.style.setProperty("--p", String(Math.round(100 * (SECS - left) / SECS))); ring.firstChild.textContent = String(Math.max(0, left));
      if (left <= 0) openVideo(nx);
    }, 1000); }
  }

  // --- 6. finger gestures on the caption bar: swipe ← → for the next / previous line, double-tap to hear it again ---
  if (caption && lines.length){
    let x0 = null, y0 = 0, tLast = 0;
    const jump = d => { const i = Math.min(lines.length - 1, Math.max(0, (cur < 0 ? (d > 0 ? -1 : 1) : cur) + d)); seekTo(lines[i].start);   // cur is the line just chosen
      caption.classList.remove("swipe-l", "swipe-r"); void caption.offsetWidth; caption.classList.add(d > 0 ? "swipe-l" : "swipe-r"); };
    caption.addEventListener("pointerdown", e => { x0 = e.clientX; y0 = e.clientY; });
    caption.addEventListener("pointerup", e => {
      if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5){ jump(dx < 0 ? 1 : -1); tLast = 0; return; }
      const now = Date.now(); if (now - tLast < 320){ tLast = 0; if (cur >= 0) seekTo(lines[cur].start); else jump(1); } else tLast = now;
    });
    caption.addEventListener("pointercancel", () => { x0 = null; });
    let hinted = false; try { hinted = localStorage.getItem("laolao.video.gesturehint") === "1"; } catch(e){}
    if (!hinted && matchMedia("(pointer:coarse)").matches){
      caption.append(h("div",{class:"vd-gesture-hint"}, LL("Swipe ← → for the next line · double-tap to hear it again","ປັດ ← → ເພື່ອໄປແຖວຕໍ່ໄປ · ແຕະສອງເທື່ອເພື່ອຟັງອີກ")));
      try { localStorage.setItem("laolao.video.gesturehint", "1"); } catch(e){}
    }
    caption.title = LL("Swipe for the next line · double-tap to repeat","ປັດເພື່ອໄປແຖວຕໍ່ໄປ · ແຕະສອງເທື່ອເພື່ອຟັງອີກ");
  }

  waitConnected(host).then(async () => {
    ctl = await mountPlayer(host, v.embedUrl, { onTime, onState: st => {
      if (st === "ended"){ markWatched(v.id); logEvent("video_done", { ref:v.id }); showUpNext(); return; }
      if (st !== "playing") return;
      closeUpNext();
      if (!logged){ logged = true; logEvent("video", { ref:v.id }); touchDay(); }
      // phones: bring the player to the top so the transcript has room below it
      if (matchMedia("(max-width:700px)").matches){ const top = stage.getBoundingClientRect().top; if (top > 4) window.scrollTo({ top: window.scrollY + top, behavior: "smooth" }); }
    } });
    root.__player = ctl;
    if (autoplay && ctl.sync) ctl.play();               // arrived from "Up next": keep watching (the browser may still ask for a tap)
    if (!ctl.sync && lines.length) transcriptPanel.querySelector(".vd-panel-head").append(h("p",{class:"small muted vd-nosync"}, LL("Live sync is unavailable here — tap a line to open YouTube at that moment.","ບໍ່ສາມາດເລື່ອນຕາມໄດ້ — ແຕະແຖວເພື່ອເປີດ YouTube ທີ່ເວລານັ້ນ.")));
  });
  return root;
}

// The handwriting studio moved to js/learner/views-handwriting.js (stroke templates, checking and scoring).
