// Content schemas drive the admin editor: add a field here and it appears in the CMS.
// Labels are [English, Lao].
const fmtT = v => { const n = +v; if (!Number.isFinite(n)) return String(v); return Math.floor(n/60)+":"+String(Math.floor(n%60)).padStart(2,"0"); };
export const SECS = "ABCDEFGHIJKLMNOPQRS".split("");
const lv = { key:"level", type:"select", label:["Stage / Level","ລະດັບ"], options:[1,2,3,4,5,6].map(n=>[n,"Stage "+n]), num:true };
const sentence = (key, label) => ({ key, type:"list", label, itemLabel:["Sentence","ປະໂຫຍກ"], item:[{ key:"", type:"sentence" }], summary: s => s.zh || "" });

export const SCHEMAS = {
  lessons: { title: d => d.title, idHint:"hsk1-greetings", defaults:{ level:1, topic:"", title:{en:"",lo:"",zh:""}, desc:{en:"",lo:"",zh:""}, objectives:{en:[],lo:[],zh:[]}, vocab:[], patterns:[], grammar:[], dialogues:[], quizzes:[], audio:[], images:[], examples:[] },
    fields:[
      { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] },
      { key:"desc", type:"tr", multiline:true, label:["Description","ຄຳອະທິບາຍ"] },
      { row:[ lv, { key:"topic", type:"text", label:["Topic","ຫົວຂໍ້ຍ່ອຍ"], placeholder:"Daily life" } ] },
      { key:"objectives", type:"trlines", label:["Learning objectives (one per line)","ຈຸດປະສົງການຮຽນ (ແຖວລະອັນ)"] },
      { key:"vocab", type:"words", label:["Vocabulary (Lao words)","ຄຳສັບ (ພາສາລາວ)"] },
      { key:"patterns", type:"refs", to:"patterns", num:true, label:["Sentence patterns","ໂຄງສ້າງປະໂຫຍກ"] },
      { key:"grammar", type:"refs", to:"grammar", label:["Grammar","ໄວຍາກອນ"] },
      { key:"dialogues", type:"refs", to:"dialogues", label:["Dialogues","ບົດສົນທະນາ"] },
      sentence("examples", ["Extra example sentences","ປະໂຫຍກຕົວຢ່າງເພີ່ມເຕີມ"]),
      { key:"quizzes", type:"refs", to:"quizzes", label:["Quizzes & exercises","ແບບທົດສອບ"] },
      { key:"audio", type:"refs", to:"audio", label:["Audio","ສຽງ"] },
      { key:"images", type:"tags", label:["Image links","ລິ້ງຮູບພາບ"], placeholder:"https://…" } ] },
  patterns: { title: d => ({ en: d.hz+" — "+((d.tr&&d.tr.en&&d.tr.en.meaning)||"") }), idHint:"p251", defaults:{ n:0, sec:"A", hz:"", py:"", gloss:"", level:1, formula:"", tr:{en:{meaning:"",how:"",note:""},lo:{meaning:""},zh:{}}, mistake:null, examples:[], gen:[] },
    fields:[
      { row:[ { key:"n", type:"number", label:["Number","ເລກ"] }, { key:"sec", type:"select", label:["Section","ພາກ"], options:SECS.map(s=>[s,s]) }, lv ] },
      { row:[ { key:"hz", type:"text", label:["Pattern (Lao)","ໂຄງສ້າງ (ພາສາລາວ)"], cls:"hz" }, { key:"py", type:"text", label:["Romanization","ຄຳອ່ານໂຣມັນ"] }, { key:"gloss", type:"text", label:["Grammar label","ປ້າຍໄວຍາກອນ"] } ] },
      { key:"formula", type:"text", label:["Structure formula","ສູດໂຄງສ້າງ"], help:["Use S, V, O, Adj, N, Time, Place joined with +","ໃຊ້ S, V, O, Adj, N, Time, Place ເຊື່ອມດ້ວຍ +"] },
      { key:"tr", type:"trgroup", label:["Meaning & explanation","ຄວາມໝາຍ ແລະ ຄຳອະທິບາຍ"], fields:[ { key:"meaning", type:"text", label:["Meaning","ຄວາມໝາຍ"] }, { key:"how", type:"textarea", label:["How and why","ໃຊ້ແນວໃດ ແລະ ເປັນຫຍັງ"] }, { key:"note", type:"textarea", label:["Usage note","ໝາຍເຫດ"] } ] },
      { key:"mistake", type:"object", nullable:true, label:["Common mistake","ຂໍ້ຜິດພາດທີ່ພົບເລື້ອຍ"], fields:[ { row:[ { key:"wrong", type:"text", label:["Wrong","ຜິດ"], cls:"hz" }, { key:"right", type:"text", label:["Right","ຖືກ"], cls:"hz" } ] }, { key:"tr", type:"tr", label:["Why","ເປັນຫຍັງ"] } ] },
      sentence("examples", ["Examples","ຕົວຢ່າງ"]),
      { key:"gen", type:"list", label:["Sentence generator templates","ແມ່ແບບສ້າງປະໂຫຍກ"], itemLabel:["Template","ແມ່ແບບ"], summary: g => g.zh||"",
        help:["Lao words separated by spaces. {P} = a person, {VO} = an activity, {PL} = a place… or define your own lists in Slots, e.g. {\"X\":[\"ກາເຟ|coffee\",\"ຊາ|tea\"]}. English: {P} {V@} agrees the verb; [[like]] conjugates.","ຄຳພາສາລາວແຍກດ້ວຍຍະຫວ່າງ. {P} = ຄົນ, {VO} = ກິດຈະກຳ, {PL} = ສະຖານທີ່… ຫຼື ກຳນົດລາຍການເອງໃນ Slots."],
        item:[ { key:"zh", type:"text", label:["Lao template","ແມ່ແບບພາສາລາວ"], cls:"hz" }, { key:"en", type:"text", label:["English template","ແມ່ແບບພາສາອັງກິດ"] }, { key:"slots", type:"text", label:["Slots (JSON, optional)","Slots (JSON, ບໍ່ບັງຄັບ)"], cls:"mono" } ] } ] },
  grammar: { title: d => d.title, idHint:"g-ba", defaults:{ level:1, title:{en:"",lo:"",zh:""}, structure:"", tr:{en:{explain:"",usage:[]},lo:{explain:"",usage:[]},zh:{explain:"",usage:[]}}, examples:[], mistakes:[], patterns:[] },
    fields:[
      { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] }, { row:[ lv, { key:"structure", type:"text", label:["Structure","ໂຄງສ້າງ"], cls:"hz" } ] },
      { key:"tr", type:"trgroup", label:["Explanation","ຄຳອະທິບາຍ"], fields:[ { key:"explain", type:"textarea", label:["Explanation","ຄຳອະທິບາຍ"] }, { key:"usage", type:"lines", label:["How to use it (one per line)","ວິທີໃຊ້ (ແຖວລະອັນ)"] } ] },
      sentence("examples", ["Examples","ຕົວຢ່າງ"]),
      { key:"mistakes", type:"list", label:["Common mistakes","ຂໍ້ຜິດພາດ"], itemLabel:["Mistake","ຂໍ້ຜິດພາດ"], summary: m => m.wrong||"", item:[ { row:[ { key:"wrong", type:"text", label:["Wrong","ຜິດ"], cls:"hz" }, { key:"right", type:"text", label:["Right","ຖືກ"], cls:"hz" } ] }, { key:"tr", type:"tr", label:["Why","ເປັນຫຍັງ"] } ] },
      { key:"patterns", type:"refs", to:"patterns", num:true, label:["Related patterns","ໂຄງສ້າງທີ່ກ່ຽວຂ້ອງ"] } ] },
  vocabulary: { title: d => ({ en: d.hz+"  "+(d.py||"")+" — "+((d.tr&&d.tr.en&&d.tr.en.meaning)||"") }), idFrom:"hz", idHint:"ກິນ", defaults:{ hz:"", py:"", pos:"v", level:1, tr:{en:{meaning:""},lo:{meaning:""},zh:{meaning:""}}, examples:[], tags:[] },
    fields:[
      { row:[ { key:"hz", type:"text", label:["Word (Lao)","ຄຳສັບ (ພາສາລາວ)"], cls:"hz" }, { key:"py", type:"pinyin", from:"hz", label:["Romanization","ຄຳອ່ານໂຣມັນ"] }, { key:"pos", type:"select", label:["Part of speech","ປະເພດຄຳ"], options:["n","v","adj","adv","prep","conj","part","pron","num","m","t","prop","loc","mod","int","idiom","ph"].map(x=>[x,x]) }, lv ] },
      { key:"tr", type:"trgroup", label:["Meaning","ຄວາມໝາຍ"], fields:[ { key:"meaning", type:"text", label:["Meaning","ຄວາມໝາຍ"] }, { key:"usage", type:"textarea", label:["Usage (optional)","ການໃຊ້ (ບໍ່ບັງຄັບ)"] } ] },
      sentence("examples", ["Example sentences","ປະໂຫຍກຕົວຢ່າງ"]),
      { key:"tags", type:"tags", label:["Tags","ແທັກ"], placeholder:"food, travel" } ] },
  dialogues: { title: d => d.title, idHint:"d-shopping", defaults:{ level:1, title:{en:"",lo:"",zh:""}, lines:[] },
    fields:[
      { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] }, lv,
      { key:"lines", type:"list", label:["Lines","ແຖວສົນທະນາ"], itemLabel:["Line","ແຖວ"], summary: l => (l.speaker?l.speaker+": ":"")+(l.zh||""), item:[ { key:"speaker", type:"text", label:["Speaker","ຜູ້ເວົ້າ"], placeholder:"A" }, { key:"", type:"sentence" } ] } ] },
  quizzes: { title: d => d.title, idHint:"q-food", defaults:{ level:1, kind:"quiz", lesson:"", title:{en:"",lo:"",zh:""}, questions:[] },
    fields:[
      { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] },
      { row:[ lv, { key:"kind", type:"select", label:["Kind","ປະເພດ"], options:[["quiz","Quiz"],["exercise","Exercise"]] }, { key:"lesson", type:"ref", to:"lessons", label:["Lesson","ບົດຮຽນ"] } ] },
      { key:"questions", type:"questions", label:["Questions","ຄຳຖາມ"] } ] },
  audio: { title: d => ({ en: (d.text||"")+" · "+(d.type||"") }), idHint:"a-nihao", defaults:{ text:"", lang:"zh", type:"word", speaker:"", speed:"normal", url:"", relatedType:"", relatedId:"" },
    fields:[
      { key:"text", type:"text", label:["Text spoken (exactly as written in lessons)","ຂໍ້ຄວາມທີ່ເວົ້າ"], cls:"hz" },
      { row:[ { key:"lang", type:"select", label:["Language","ພາສາ"], options:[["zh","中文"],["en","English"],["lo","ລາວ"]] }, { key:"type", type:"select", label:["Type","ປະເພດ"], options:["word","sentence","dialogue","lesson"].map(x=>[x,x]) }, { key:"speaker", type:"text", label:["Speaker","ຜູ້ເວົ້າ"] }, { key:"speed", type:"select", label:["Speed","ຄວາມໄວ"], options:[["normal","normal"],["slow","slow"]] } ] },
      { key:"url", type:"audio", label:["Audio file","ໄຟລ໌ສຽງ"] },
      { row:[ { key:"relatedType", type:"select", label:["Related to","ກ່ຽວຂ້ອງກັບ"], options:[["",""],["lessons","lesson"],["vocabulary","word"],["dialogues","dialogue"],["patterns","pattern"]] }, { key:"relatedId", type:"text", label:["Related ID","ID ທີ່ກ່ຽວຂ້ອງ"] } ] } ] },
  paths: { title: d => d.title, idHint:"business", defaults:{ kind:"topic", level:0, title:{en:"",lo:"",zh:""}, desc:{en:"",lo:"",zh:""}, steps:[] },
    fields:[
      { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] }, { key:"desc", type:"tr", multiline:true, label:["Description","ຄຳອະທິບາຍ"] },
      { row:[ { key:"kind", type:"select", label:["Kind","ປະເພດ"], options:[["level","Stage level"],["topic","Topic (travel, business…)"],["skill","Skill (grammar, listening…)"]] }, { key:"level", type:"select", label:["Level","ລະດັບ"], options:[[0,"—"],...[1,2,3,4,5,6].map(n=>[n,"Stage "+n])], num:true } ] },
      { key:"steps", type:"list", label:["Steps","ຂັ້ນຕອນ"], itemLabel:["Step","ຂັ້ນ"], summary: s => s.type+": "+s.id, item:[ { row:[ { key:"type", type:"select", label:["Type","ປະເພດ"], options:[["lesson","Lesson"],["pattern","Pattern"],["grammar","Grammar"],["quiz","Quiz"],["dialogue","Dialogue"],["page","App page (pinyin, chars, speak)"]] }, { key:"id", type:"stepref", label:["Item","ລາຍການ"] } ] } ] } ] },
  releases: { title: d => d.title, idHint:"2026-11", defaults:{ date:new Date().toISOString().slice(0,10), title:{en:"",lo:"",zh:""}, notes:{en:"",lo:"",zh:""}, items:[] },
    fields:[
      { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] }, { key:"date", type:"date", label:["Release date","ວັນທີອັບເດດ"] },
      { key:"notes", type:"tr", multiline:true, label:["Release notes","ລາຍລະອຽດ"] },
      { key:"items", type:"list", label:["Highlighted items","ລາຍການເດັ່ນ"], itemLabel:["Item","ລາຍການ"], summary: s => s.type+": "+s.id, item:[ { row:[ { key:"type", type:"select", label:["Type","ປະເພດ"], options:[["lesson","Lesson"],["pattern","Pattern"],["grammar","Grammar"],["quiz","Quiz"],["dialogue","Dialogue"]] }, { key:"id", type:"stepref", label:["Item","ລາຍການ"] } ] } ] } ] },
  lexicon: { title: d => ({ en: d.cat || d.id }), idHint:"FRUIT", defaults:{ cat:"", data:[] }, noAccess:true,
    fields:[ { key:"cat", type:"text", label:["Slot name (use in templates as {NAME})","ຊື່ Slot"], cls:"mono" },
      { key:"data", type:"json", label:["Items (JSON)","ລາຍການ (JSON)"], help:["Array of objects like {\"z\":\"ກາເຟ\",\"e\":\"coffee\"}. People need e (subject), o (object), s (1 = he/she).","ອາເຣຂອງອອບເຈັກ ເຊັ່ນ {\"z\":\"ກາເຟ\",\"e\":\"coffee\"}."] } ] },
  videos: { title: d => d.title, idHint:"v01-greetings", defaults:{ level:1, category:"beginner", title:{en:"",lo:"",zh:""}, desc:{en:"",lo:"",zh:""}, embedUrl:"", difficulty:"Stage 1 · Beginner", recap:{ summary:{en:"",lo:"",zh:""}, points:[] }, vocab:[], transcript:[] },
    fields:[
      { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] },
      { key:"desc", type:"tr", multiline:true, label:["Description","ຄຳອະທິບາຍ"] },
      { row:[ lv, { key:"category", type:"select", label:["Category","ໝວດໝູ່"], options:[["beginner","Beginner"],["conversation","Conversation"],["pronunciation","Pronunciation"],["culture","Culture"]] }, { key:"difficulty", type:"text", label:["Difficulty badge","ລະດັບ"], placeholder:"Stage 1 · Beginner" } ] },
      { key:"embedUrl", type:"text", label:["Video link (any YouTube link, or an .mp4 file)","ລິ້ງວິດີໂອ (YouTube ຫຼື .mp4)"], placeholder:"https://www.youtube.com/watch?v=..." },
      { key:"recap", type:"object", label:["Recap (shown under the video)","ສະຫຼຸບ (ສະແດງໃຕ້ວິດີໂອ)"], fields:[
        { key:"summary", type:"tr", multiline:true, label:["Summary of the clip","ສະຫຼຸບເນື້ອຫາຂອງຄລິບ"] },
        { key:"points", type:"list", label:["Key phrases (each gets a play button)","ປະໂຫຍກສຳຄັນ (ມີປຸ່ມຫຼິ້ນສຽງ)"], itemLabel:["Phrase","ປະໂຫຍກ"], summary: p => p.lo || p.en || "",
          help:["Without a recording, the learner's device reads the Lao text aloud.","ຖ້າບໍ່ມີສຽງບັນທຶກ, ອຸປະກອນຈະອ່ານຂໍ້ຄວາມລາວອອກສຽງ."],
          item:[ { row:[ { key:"lo", type:"text", label:["Lao","ພາສາລາວ"], cls:"hz" }, { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] } ] },
                 { row:[ { key:"en", type:"text", label:["English","ອັງກິດ"] }, { key:"at", type:"time", label:["Jump to time (optional)","ເວລາໃນວິດີໂອ"], placeholder:"m:ss" } ] },
                 { key:"audio", type:"audio", label:["Recorded audio (optional)","ສຽງບັນທຶກ (ບໍ່ບັງຄັບ)"] } ] } ] },
      { key:"vocab", type:"list", label:["Key vocabulary featured","ຄຳສັບສຳຄັນ"], itemLabel:["Word","ຄຳສັບ"], summary: v => (v.lo||"")+" ("+(v.en||"")+")",
        item:[ { row:[ { key:"lo", type:"text", label:["Lao word","ຄຳສັບລາວ"], cls:"hz" }, { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] }, { key:"en", type:"text", label:["English","ອັງກິດ"] } ] } ] },
      { key:"transcript", type:"list", label:["Transcript lines (synced to the video)","ບົດຖອດຄວາມ (ເລື່ອນຕາມວິດີໂອ)"], itemLabel:["Line","ແຖວ"], summary: l => (l.start!=null && l.start!=="" ? "["+fmtT(l.start)+"] " : "")+(l.text||l.lo||""),
        help:["Tip: import a whole transcript at once in Video Manager → Transcript.","ແນະນຳ: ນຳເຂົ້າບົດຖອດຄວາມທັງໝົດໃນ Video Manager → Transcript."],
        item:[ { row:[ { key:"start", type:"time", label:["Start","ເລີ່ມ"], placeholder:"m:ss" }, { key:"sp", type:"text", label:["Speaker (optional)","ຜູ້ເວົ້າ"] } ] },
               { key:"text", type:"text", label:["Text as spoken","ຂໍ້ຄວາມທີ່ເວົ້າ"], cls:"hz" },
               { row:[ { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] }, { key:"en", type:"text", label:["English","ອັງກິດ"] } ] } ] } ] },
  tones: { title: d => ({ en: "Tone "+(d.num||"")+": "+((d.name&&d.name.en)||"") }), idHint:"tone-1", defaults:{ num:1, name:{en:"",lo:"",zh:""}, contour:"33", color:"#0284c7", desc:{en:"",lo:"",zh:""}, pathD:"M 10 32 Q 50 30 90 28", examples:[] },
    fields:[
      { row:[ { key:"num", type:"number", label:["Tone number (1-6)","ໝາຍເລກສຽງ (1-6)"] }, { key:"contour", type:"text", label:["Pitch contour (e.g. 33, 11, 31, 55, 35, 13)","ລະດັບສຽງ"] }, { key:"color", type:"text", label:["Color code (HEX), only for tones outside 1-6","ລະຫັດສີ (ສະເພາະສຽງນອກ 1-6)"], placeholder:"#0284c7", help:"Tones 1-6 use the app's tone colours so they stay readable in Day and Night." } ] },
      { key:"name", type:"tr", label:["Tone name","ຊື່ສຽງວັນນະຍຸດ"] },
      { key:"desc", type:"tr", multiline:true, label:["Description & acoustic rules","ຄຳອະທິບາຍ ແລະ ຫຼັກການຜັນສຽງ"] },
      { key:"pathD", type:"text", label:["SVG pitch curve path","ເສັ້ນໂຄ້ງ SVG"], placeholder:"M 10 32 Q 50 30 90 28" },
      { key:"examples", type:"list", label:["Tone minimal pair examples","ຕົວຢ່າງຄຳສັບ"], itemLabel:["Example","ຕົວຢ່າງ"], summary: e => (e.lao||"")+" ("+(e.rom||"")+")",
        item:[ { row:[ { key:"lao", type:"text", label:["Lao word","ຄຳລາວ"], cls:"hz" }, { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] } ] },
               { row:[ { key:"mean", type:"text", label:["Meaning","ຄວາມໝາຍ"] }, { key:"note", type:"text", label:["Tone rule note","ໝາຍເຫດ"] } ] } ] } ] },
  culture: { title: d => d.title, idHint:"cul-alms", defaults:{ category:"traditions", title:{en:"",lo:"",zh:""}, desc:{en:"",lo:"",zh:""}, content:{en:"",lo:"",zh:""}, keyTips:[], vocab:[] },
    fields:[
      { key:"title", type:"tr", label:["Story / Culture Title","ຫົວຂໍ້ວັດທະນະທຳ"] },
      { key:"category", type:"select", label:["Category","ໝວດໝູ່"], options:[["traditions","Traditions & Rituals"],["etiquette","Social Etiquette"],["food","Cuisine & Dining"],["festivals","Festivals & Holidays"],["places","Geography & Life"]] },
      { key:"desc", type:"tr", multiline:true, label:["Short summary","ບົດສະຫຼຸບຫຍໍ້"] },
      { key:"content", type:"tr", multiline:true, label:["Full story / Guide","ເນື້ອໃນເຕັມ"] },
      { key:"keyTips", type:"list", label:["Key etiquette tips & cultural dos/don'ts","ຂໍ້ຄວນປະຕິບັດ"], itemLabel:["Tip","ຂໍ້ແນະນຳ"], summary: t => t.tip||"", item:[ { key:"tip", type:"text", label:["Tip rule","ຄຳແນະນຳ"] } ] },
      { key:"vocab", type:"list", label:["Associated Lao cultural words","ຄຳສັບວັດທະນະທຳທີ່ກ່ຽວຂ້ອງ"], itemLabel:["Word","ຄຳສັບ"], summary: v => (v.lao||"")+" ("+(v.en||"")+")",
        item:[ { row:[ { key:"lao", type:"text", label:["Lao word","ຄຳລາວ"], cls:"hz" }, { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] }, { key:"en", type:"text", label:["English","ອັງກິດ"] } ] } ] } ] },
  characters: { title: d => ({ en: (d.char||d.id)+" ("+(d.name||"")+" — "+(d.meaning||"")+")" }), idHint:"char-ກ", defaults:{ char:"", name:"", meaning:"", ipa:"", class:"middle", strokeCount:1, medial:"", final:"" },
    fields:[
      { row:[ { key:"char", type:"text", label:["Lao letter / symbol","ຕົວອັກສອນ"], cls:"hz" }, { key:"name", type:"text", label:["Traditional name (e.g. Kai, Khai)","ຊື່ຕົວອັກສອນ"] }, { key:"meaning", type:"text", label:["Meaning of name (e.g. Chicken)","ຄວາມໝາຍ"] } ] },
      { row:[ { key:"class", type:"select", label:["Consonant tone class / type","ໝວດອັກສອນ"], options:[["middle","Middle consonant (ອັກສອນກາງ)"],["high","High consonant (ອັກສອນສູງ)"],["low","Low consonant (ອັກສອນຕ່ຳ)"],["vowel","Vowel (ສະຫຼະ)"],["tone_mark","Tone mark (ວັນນະຍຸດ)"]] }, { key:"ipa", type:"text", label:["IPA pronunciation","ສຽງ IPA"] }, { key:"strokeCount", type:"number", label:["Stroke count","ຈຳນວນເສັ້ນຂີດ"] } ] },
      { row:[ { key:"medial", type:"text", label:["Initial sound","ສຽງຕົ້ນ"] }, { key:"final", type:"text", label:["Final ending sound","ສຽງທ້າຍ"] } ] } ] },
  dictionary: { title: d => ({ en: (d.hz||d.id)+" ["+(d.p||"")+"] — "+(d.en||"") }), idFrom:"hz", idHint:"ກິນ", defaults:{ hz:"", p:"", pos:"v", level:1, en:"", lo:"", zh:"", examples:[] },
    fields:[
      { row:[ { key:"hz", type:"text", label:["Word (Lao)","ຄຳສັບ (ພາສາລາວ)"], cls:"hz" }, { key:"p", type:"text", label:["Romanization (Phonetics)","ຄຳອ່ານໂຣມັນ"] }, { key:"pos", type:"select", label:["Part of speech","ປະເພດຄຳ"], options:["n","v","adj","adv","prep","conj","part","pron","num","m","t","prop","loc","mod","int","idiom","ph"].map(x=>[x,x]) }, lv ] },
      { key:"en", type:"text", label:["English definition","ຄວາມໝາຍພາສາອັງກິດ"] },
      { key:"lo", type:"text", label:["Lao definition","ຄວາມໝາຍພາສາລາວ"] },
      { key:"zh", type:"text", label:["Chinese definition (中文)","中文释义"] },
      sentence("examples", ["Example sentences","ປະໂຫຍກຕົວຢ່າງ"]) ] }
};
// ---------- the public welcome page (docs/WELCOME.md). Shown to visitors once published with access "Public". ----------
const trl = (key, label, itemLabel) => ({ key, type:"list", label, itemLabel, item:[{ key:"", type:"tr", label:itemLabel }], summary: x => (x && (x.en || x.lo)) || "" });
const PLACE_SCENES = [["luangprabang","Luang Prabang (monks, Phou Si)"],["vangvieng","Vang Vieng (karst, balloon)"],["phonsavan","Plain of Jars"],["vientiane","Vientiane (That Luang)"],
  ["champasak","Champasak (Wat Phou)"],["siphandon","Si Phan Don (islands, falls)"],["temple","Temple"],["mountain","Mountains"],["river","River"],["waterfall","Waterfall"],["market","Market"],["cave","Cave"]];
SCHEMAS.places = { title: d => d.title, idHint:"luangprabang", web:true, defaults:{ access:"public", scene:"temple", lat:"", lon:"", title:{en:"",lo:"",zh:""}, laoName:"", badge:{en:"",lo:"",zh:""}, text:{en:"",lo:"",zh:""}, facts:[], words:[], unesco:"", imageUrl:"", imageAlt:{en:"",lo:"",zh:""} },
  fields:[
    { key:"title", type:"tr", label:["Place name","ຊື່ສະຖານທີ່"] },
    { row:[ { key:"laoName", type:"text", cls:"lo", label:["Name in Lao script","ຊື່ເປັນອັກສອນລາວ"] }, { key:"scene", type:"select", label:["Scene art","ຮູບປະກອບ"], options:PLACE_SCENES } ] },
    { row:[ { key:"lat", type:"number", step:"0.001", label:["Latitude (13.9 to 22.5 N)","ເສັ້ນຂະໜານ"] }, { key:"lon", type:"number", step:"0.001", label:["Longitude (100.1 to 107.7 E)","ເສັ້ນແວງ"] }, { key:"unesco", type:"number", label:["UNESCO year (optional)","ປີ UNESCO"] } ],
      help:["The pin is placed on the map from these numbers. Find them on any map app (right-click → coordinates).","ໝຸດຈະວາງໃສ່ແຜນທີ່ຕາມຕົວເລກນີ້."] },
    { key:"badge", type:"tr", label:["Badge on the picture","ປ້າຍເທິງຮູບ"] },
    { key:"text", type:"tr", multiline:true, label:["Description","ຄຳອະທິບາຍ"] },
    trl("facts", ["Short facts (chips)","ຂໍ້ເທັດຈິງສັ້ນໆ"], ["Fact","ຂໍ້ເທັດຈິງ"]),
    { key:"words", type:"list", label:["Lao words for this place","ຄຳສັບລາວຂອງສະຖານທີ່ນີ້"], itemLabel:["Word","ຄຳສັບ"], summary: w => (w.lo||"")+" · "+(w.en||""),
      item:[ { row:[ { key:"lo", type:"text", cls:"lo", label:["Lao","ລາວ"] }, { key:"rom", type:"text", label:["Romanization","ຄຳອ່ານ"] }, { key:"en", type:"text", label:["English","ອັງກິດ"] } ] },
             { key:"audio", type:"audio", label:["Recording (optional; otherwise the device reads it)","ສຽງບັນທຶກ"] } ] },
    { key:"imageUrl", type:"image", alt:"imageAlt", label:["Photo instead of the drawn scene (optional)","ຮູບແທນຮູບແຕ້ມ"] } ] };
SCHEMAS.festivals = { title: d => d.title, idHint:"pi-mai", web:true, defaults:{ access:"public", month:1, lunar:false, art:"generic", dateText:{en:"",lo:"",zh:""}, title:{en:"",lo:"",zh:""}, laoName:"", text:{en:"",lo:"",zh:""} },
  fields:[
    { key:"title", type:"tr", label:["Festival name","ຊື່ບຸນ"] },
    { row:[ { key:"laoName", type:"text", cls:"lo", label:["Name in Lao script","ຊື່ເປັນອັກສອນລາວ"] },
            { key:"month", type:"select", num:true, label:["Month (for the calendar order)","ເດືອນ"], options:[1,2,3,4,5,6,7,8,9,10,11,12].map(n => [n, new Date(2026, n-1, 1).toLocaleString("en", { month:"long" })]) },
            { key:"art", type:"select", label:["Picture","ຮູບ"], options:[["water","Water bowl"],["rocket","Bamboo rocket"],["candle","Candle"],["fireboat","Fire boat"],["stupa","Stupa"],["flag","Flag"],["generic","Lanterns"]] } ] },
    { key:"dateText", type:"tr", label:["Date as shown (e.g. 13–16 April)","ວັນທີທີ່ສະແດງ"] },
    { key:"lunar", type:"bool", label:["Follows the lunar calendar (shows \"the date moves each year\")","ຕາມຈັນທະຄະຕິ"] },
    { key:"text", type:"tr", multiline:true, label:["Description","ຄຳອະທິບາຍ"] } ] };
SCHEMAS.offers = { title: d => d.title, idHint:"new-year-offer", web:true, defaults:{ access:"public", kind:"banner", placement:"promotions", active:true, planId:"", startsAt:"", endsAt:"",
    title:{en:"",lo:"",zh:""}, text:{en:"",lo:"",zh:""}, badge:{en:"",lo:"",zh:""}, discountText:{en:"",lo:"",zh:""}, ctaLabel:{en:"",lo:"",zh:""} },
  fields:[
    { key:"title", type:"tr", label:["Headline","ຫົວຂໍ້"] },
    { key:"text", type:"tr", multiline:true, label:["Text","ຂໍ້ຄວາມ"] },
    { row:[ { key:"kind", type:"select", label:["Kind","ປະເພດ"], options:[["banner","Banner"],["countdown","Countdown to the end date"]] },
            { key:"placement", type:"select", label:["Where","ບ່ອນສະແດງ"], options:[["promotions","Promotions section"],["hero","Strip above the top of the page"]] },
            { key:"planId", type:"ref", to:"plans", label:["Plan it promotes (optional)","ແພັກທີ່ໂປຣໂມດ"] } ] },
    { row:[ { key:"startsAt", type:"datetime", label:["Starts","ເລີ່ມ"] }, { key:"endsAt", type:"datetime", label:["Ends (hidden automatically after)","ສິ້ນສຸດ"] } ] },
    { row:[ { key:"badge", type:"tr", label:["Badge","ປ້າຍ"] }, { key:"discountText", type:"tr", label:["Discount text (e.g. 30% off)","ຂໍ້ຄວາມສ່ວນຫຼຸດ"] } ] },
    { key:"ctaLabel", type:"tr", label:["Button text","ຂໍ້ຄວາມປຸ່ມ"] },
    { key:"active", type:"bool", label:["Active (shown inside its dates once published)","ເປີດໃຊ້"] } ],
  help:["The page shows an offer only between its start and end, and only if it is Published, Public and Active. Discounts are not applied automatically at checkout: say so in the text if a code or manual step is needed.",
        "ສະແດງສະເພາະລະຫວ່າງວັນເລີ່ມ ແລະ ວັນສິ້ນສຸດ. ສ່ວນຫຼຸດບໍ່ຖືກໃຊ້ອັດຕະໂນມັດຕອນຈ່າຍເງິນ."] };
SCHEMAS.resources = { title: d => d.title, idHint:"starter-guide", web:true, defaults:{ access:"public", kind:"pdf", glyph:"", cover:1, requiresAccount:true, url:"", title:{en:"",lo:"",zh:""}, text:{en:"",lo:"",zh:""} },
  fields:[
    { key:"title", type:"tr", label:["Title","ຫົວຂໍ້"] },
    { key:"text", type:"tr", multiline:true, label:["Short description","ຄຳອະທິບາຍສັ້ນ"] },
    { row:[ { key:"kind", type:"select", label:["Kind","ປະເພດ"], options:[["pdf","PDF"],["audio","Audio"],["chart","Chart"],["cheatsheet","Cheat sheet"],["video","Video"]] },
            { key:"glyph", type:"text", cls:"lo", label:["Cover letters (Lao)","ຕົວອັກສອນໜ້າປົກ"] },
            { key:"cover", type:"select", num:true, label:["Cover colour","ສີໜ້າປົກ"], options:[[1,"Blue"],[2,"Amber"],[3,"Teal"],[4,"Violet"]] } ] },
    { key:"url", type:"file", label:["File (upload) or link","ໄຟລ໌ ຫຼື ລິ້ງ"], accept:"application/pdf,audio/*,image/*,video/mp4" },
    { key:"requiresAccount", type:"bool", label:["Ask visitors to create a free account first","ໃຫ້ສ້າງບັນຊີກ່ອນ"],
      help:["This is a sign-up step, not protection: the file link is public once published. Only put files here that may be shared freely.","ນີ້ແມ່ນຂັ້ນຕອນສະໝັກ ບໍ່ແມ່ນການປ້ອງກັນ: ລິ້ງໄຟລ໌ເປັນສາທາລະນະ."] } ] };
// releases and culture can be featured as news on the welcome page
SCHEMAS.releases.fields.push({ key:"featured", type:"bool", label:["Feature on the welcome page (News)","ສະແດງໃນໜ້າຕ້ອນຮັບ (ຂ່າວ)"] });
SCHEMAS.culture.fields.push({ key:"featured", type:"bool", label:["Feature on the welcome page (News)","ສະແດງໃນໜ້າຕ້ອນຮັບ (ຂ່າວ)"] });

export const STEP_TYPE_TO_COL = { lesson:"lessons", pattern:"patterns", grammar:"grammar", quiz:"quizzes", dialogue:"dialogues" };
export const APP_PAGES = [["pinyin","Pinyin & tones"],["chars","Characters"],["speak","Pronunciation"],["gen","Sentence generator"],["dict","Dictionary"]];
