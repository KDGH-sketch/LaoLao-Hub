// Learner Views: Video Learning Feed & Lao Script Handwriting Studio
import { h, $$, icon, toast, tr, stripTone } from "../shared/ui.js";
import { t, lang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";
import { A, T, expLang } from "./core.js";

export const MEDIA_VIEWS = {};
const go = (...a) => A.go(...a);
const pageHead = (title, sub, extra) => h("div",{class:"pagehead"}, h("div",{class:"spread"}, h("h1",null,title), extra||null), sub ? h("p",{class:expLang()==="lo"&&lang()==="lo"?"lo":""},sub) : null);

// =========================================================================
// 1. VIDEO LEARNING FEED (ວິດີໂອບົດຮຽນ)
// =========================================================================
const CURATED_VIDEOS = [
  {
    id: "v01-greetings",
    title: { en:"Essential Lao Daily Greetings & Politeness", lo:"ການທັກທາຍ ແລະ ມາລະຍາດພາສາລາວໃນຊີວິດປະຈຳວັນ", zh:"老挝语日常问候与礼仪" },
    category: "beginner",
    difficulty: "Stage 1 · Survival",
    embedUrl: "https://www.youtube.com/embed/fW_7e93H2_Y",
    desc: { en:"Learn natural greetings, respectful hand nop gestures, and friendly everyday responses with native speakers.", lo:"ຮຽນຮູ້ການທັກທາຍແບບສຸພາບ, ການນົບ ແລະ ການຕອບຮັບທີ່ເປັນທຳມະຊາດ." },
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
    title: { en:"Shopping & Ordering Food at Talat Sao Market", lo:"ການໄປຊື້ເຄື່ອງ ແລະ ສັ່ງອາຫານຢູ່ຕະຫຼາດເຊົ້າ", zh:"万象早市购物与点餐" },
    category: "conversation",
    difficulty: "Stage 2 · Everyday",
    embedUrl: "https://www.youtube.com/embed/5a4x3w8k9fA",
    desc: { en:"Real conversations for ordering fresh fruit, sticky rice, and asking prices politely.", lo:"ການສົນທະນາຕົວຈິງໃນການຊື້ໝາກໄມ້, ເຂົ້າໜຽວ ແລະ ຖາມລາຄາ." },
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
    title: { en:"How Native Lao Speakers Shape the 6 Tones", lo:"ວິທີການຜັນສຽງວັນນະຍຸດ 6 ສຽງ ໂດຍຄົນລາວແທ້", zh:"老挝语6个声调的发音秘诀" },
    category: "pronunciation",
    difficulty: "Stage 0 · Foundation",
    embedUrl: "https://www.youtube.com/embed/3v7X8k0w4mE",
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
    title: { en:"The Sacred Baci Ceremony & White String Blessings", lo:"ພິທີບາສີສູ່ຂວັນ ແລະ ການຜູກແຂນເອົາພອນ", zh:"老挝传统栓线祈福仪式 (Baci)" },
    category: "culture",
    difficulty: "Stage 3 · Conversational",
    embedUrl: "https://www.youtube.com/embed/9bX8m4k01vP",
    desc: { en:"Cultural documentary exploring the call of 32 khwan spirits, marigold towers, and sacred wishes.", lo:"ສາລະຄະດີວັດທະນະທຳການເອີ້ນຂວັນ 32 ຂວັນ ແລະ ຄຳອວຍພອນອັນສັກສິດ." },
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

MEDIA_VIEWS.videos = () => {
  const root = h("div",{class:"stack-l"});
  root.append(pageHead(
    lang()==="lo" ? "ວິດີໂອບົດຮຽນພາສາ ແລະ ວັດທະນະທຳລາວ" : "Lao Video Learning Feed",
    lang()==="lo" ? "ຮຽນຮູ້ຜ່ານວິດີໂອຕົວຈິງ: ການອອກສຽງ, ການສົນທະນາ, ວັດທະນະທຳ ແລະ ຄຳສັບສຳຄັນພ້ອມຄຳແປ" : "Immerse yourself in authentic spoken Lao: video lessons with synchronized transcripts, vocabulary notes, and culture insights."
  ));

  let filter = "all";
  const videoGrid = h("div",{class:"stack",style:"gap:24px"});

  function drawVideos(){
    videoGrid.innerHTML = "";
    const items = filter==="all" ? CURATED_VIDEOS : CURATED_VIDEOS.filter(v => v.category === filter);
    if (!items.length){
      videoGrid.append(h("div",{class:"empty"}, "No videos found in this category."));
      return;
    }
    items.forEach(v => {
      // Transcript cards
      const tLines = h("div",{class:"stack",style:"gap:8px;margin-top:12px;max-height:220px;overflow-y:auto;padding-right:6px"},
        v.transcript.map(l => h("button",{class:"tone-ex-btn",style:"text-align:left;display:flex;flex-direction:column;gap:3px",onclick:()=>speak(l.lo)},
          h("div",{class:"spread",style:"width:100%"},
            h("span",{class:"speaker",style:"color:var(--accent)"}, l.sp),
            icon("speaker")
          ),
          h("div",{class:"lo",style:"font-size:1.15rem;font-weight:700;color:var(--ink)"}, l.lo),
          h("div",{class:"mono",style:"font-size:.82rem;color:var(--ink-2)"}, l.rom),
          h("div",{class:"small muted"}, l.en)
        ))
      );

      // Vocab chips
      const vChips = h("div",{class:"row",style:"gap:8px;flex-wrap:wrap;margin-top:10px"},
        v.vocab.map(w => h("button",{class:"btn sm ghost",onclick:()=>speak(w.lo)},
          h("b",{class:"lo",style:"font-size:1rem;color:var(--accent)"}, w.lo),
          h("span",{class:"small muted"}, " (" + w.en + ")")
        ))
      );

      videoGrid.append(h("div",{class:"video-card"},
        h("div",{class:"video-embed-wrap"},
          h("iframe",{
            src: v.embedUrl,
            title: tr(v.title, lang()),
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            allowFullscreen: true
          })
        ),
        h("div",{class:"video-info"},
          h("div",{class:"spread"},
            h("b",{style:"font-size:1.2rem"}, tr(v.title, lang())),
            h("span",{class:"chip lv"}, v.difficulty)
          ),
          h("p",{class:"small muted",style:"margin:6px 0 10px 0"}, tr(v.desc, lang())),
          h("b",{style:"font-size:.85rem;color:var(--ink-2);text-transform:uppercase;letter-spacing:.04em"}, "Interactive Video Transcript (Tap to Listen):"),
          tLines,
          h("b",{style:"font-size:.85rem;color:var(--ink-2);text-transform:uppercase;letter-spacing:.04em;margin-top:12px"}, "Key Lesson Vocabulary:"),
          vChips
        )
      ));
    });
  }

  const catSeg = h("div",{class:"seg",style:"overflow-x:auto;margin-bottom:16px"},
    [["all","All Videos"],["beginner","Beginner & Greetings"],["conversation","Conversations"],["pronunciation","Pronunciation"],["culture","Culture & Traditions"]]
      .map(([cat, label]) => h("button",{"aria-pressed":String(filter===cat),onclick:e=>{
        filter = cat;
        $$("button",catSeg).forEach(b => b.setAttribute("aria-pressed","false"));
        e.currentTarget.setAttribute("aria-pressed","true");
        drawVideos();
      }}, label))
  );

  drawVideos();

  root.append(
    catSeg,
    videoGrid
  );

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
