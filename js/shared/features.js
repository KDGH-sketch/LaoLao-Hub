// Feature registry: every function of the learner app that a plan can switch on/off or limit.
// Plans store which keys they include (plans/{id}.entitlements) and their usage limits (plans/{id}.limits).
// To add a feature: add an entry here, then guard the code with ac.can("key") / await ac.use("key"). See docs/ACCESS.md.
//
//   key        stored in plans and access rows; never rename a key that is in use
//   group      admin matrix grouping
//   routes     learner views this feature opens (the router shows a locked screen instead)
//   limitable  may carry a usage limit (counted by ll_use in the database)
//   ref        counts distinct items (opening the same lesson twice in a period counts once)

export const FEATURE_GROUPS = [
  ["learn",    { en:"Learn",    lo:"ຮຽນ",       zh:"学习" }],
  ["practice", { en:"Practice", lo:"ຝຶກ",       zh:"练习" }],
  ["tools",    { en:"Tools",    lo:"ເຄື່ອງມື",   zh:"工具" }],
  ["labs",     { en:"Labs",     lo:"ຫ້ອງທົດລອງ", zh:"实验室" }],
  ["myspace",  { en:"My space", lo:"ຂອງຂ້ອຍ",    zh:"我的" }]
];

export const FEATURES = [
  { key:"lessons.open",        group:"learn",    routes:["lessons","lesson"], limitable:true, ref:true,
    label:{ en:"Lessons", lo:"ບົດຮຽນ", zh:"课程" }, desc:{ en:"Open lessons of your plan", lo:"ເປີດບົດຮຽນໃນແພັກເກດຂອງທ່ານ", zh:"打开套餐内的课程" } },
  { key:"paths",               group:"learn",    routes:["paths","path"],
    label:{ en:"Learning paths", lo:"ເສັ້ນທາງການຮຽນ", zh:"学习路径" }, desc:{ en:"Guided step-by-step paths", lo:"ເສັ້ນທາງຮຽນເທື່ອລະຂັ້ນ", zh:"分步学习路径" } },
  { key:"patterns.browse",     group:"learn",    routes:["patterns","pattern"],
    label:{ en:"Sentence patterns", lo:"ໂຄງສ້າງປະໂຫຍກ", zh:"句型" }, desc:{ en:"Pattern library with examples", lo:"ຄັງໂຄງສ້າງປະໂຫຍກ ແລະ ຕົວຢ່າງ", zh:"句型库与例句" } },
  { key:"patterns.generator",  group:"tools",    routes:["gen"],
    label:{ en:"Sentence generator", lo:"ເຄື່ອງສ້າງປະໂຫຍກ", zh:"造句器" }, desc:{ en:"Generate new practice sentences", lo:"ສ້າງປະໂຫຍກໃໝ່ເພື່ອຝຶກ", zh:"生成新的练习句子" } },
  { key:"grammar",             group:"learn",    routes:["grammar","grammarItem"],
    label:{ en:"Grammar guides", lo:"ໄວຍາກອນ", zh:"语法" }, desc:{ en:"Grammar explanations", lo:"ຄຳອະທິບາຍໄວຍາກອນ", zh:"语法讲解" } },
  { key:"vocab",               group:"learn",    routes:["vocab","cards"],
    label:{ en:"Vocabulary & flashcards", lo:"ຄຳສັບ ແລະ ບັດຄຳ", zh:"词汇与卡片" }, desc:{ en:"Word lists and flashcards", lo:"ລາຍການຄຳສັບ ແລະ ບັດຄຳ", zh:"词表与闪卡" } },
  { key:"dialogues",           group:"learn",    routes:["dialogue"],
    label:{ en:"Dialogues", lo:"ບົດສົນທະນາ", zh:"对话" }, desc:{ en:"Conversation dialogues", lo:"ບົດສົນທະນາ", zh:"情景对话" } },
  { key:"videos.watch",        group:"learn",    routes:["videos","video"], limitable:true, ref:true,
    label:{ en:"Video lessons", lo:"ວິດີໂອ", zh:"视频课" }, desc:{ en:"Video lessons with transcripts", lo:"ວິດີໂອພ້ອມບົດຖອດຄວາມ", zh:"带字幕的视频课" } },
  { key:"audio.play",          group:"learn",    routes:[], limitable:true,
    label:{ en:"Native audio", lo:"ສຽງເຈົ້າຂອງພາສາ", zh:"真人音频" }, desc:{ en:"Recorded native-speaker audio", lo:"ສຽງບັນທຶກຂອງເຈົ້າຂອງພາສາ", zh:"母语者录音" } },
  { key:"alphabet",            group:"learn",    routes:["pinyin"],
    label:{ en:"Lao alphabet & tones", lo:"ອັກສອນ ແລະ ວັນນະຍຸດ", zh:"字母与声调" }, desc:{ en:"Consonants, vowels and tone rules", lo:"ພະຍັນຊະນະ, ສະຫຼະ ແລະ ກົດວັນນະຍຸດ", zh:"辅音、元音与声调规则" } },
  { key:"dictionary.search",   group:"tools",    routes:["dict"], limitable:true, ref:true,
    label:{ en:"Dictionary search", lo:"ຄົ້ນຫາວັດຈະນານຸກົມ", zh:"词典搜索" }, desc:{ en:"Search Lao, romanization or English", lo:"ຄົ້ນຫາພາສາລາວ, ຄຳອ່ານ ຫຼື ອັງກິດ", zh:"按老挝文、拼读或英文搜索" } },
  { key:"handwriting.practice",group:"practice", routes:["handwriting","chars","script_lab"], limitable:true,
    label:{ en:"Handwriting studio", lo:"ຝຶກຂຽນ", zh:"书写练习" }, desc:{ en:"Practise writing Lao letters", lo:"ຝຶກຂຽນຕົວອັກສອນລາວ", zh:"练习书写老挝字母" } },
  { key:"practice.basic",      group:"practice", routes:["practice"], types:["order","blank","listen","meaning"],
    label:{ en:"Basic practice", lo:"ແບບຝຶກພື້ນຖານ", zh:"基础练习" }, desc:{ en:"Word order, fill in, listen, meaning", lo:"ຈັດລຽງ, ຕື່ມຄຳ, ຟັງ, ແປ", zh:"排序、填空、听力、释义" } },
  { key:"practice.advanced",   group:"practice", routes:[], types:["reverse","pattern","words","tones","write","speak","mix"],
    label:{ en:"Advanced practice", lo:"ແບບຝຶກຂັ້ນສູງ", zh:"进阶练习" }, desc:{ en:"Translation, patterns, words, tones, mixed drills", lo:"ແປປະໂຫຍກ, ໂຄງສ້າງ, ຄຳສັບ, ວັນນະຍຸດ, ແບບປະສົມ", zh:"翻译、句型、词汇、声调、综合练习" } },
  { key:"quizzes.attempt",     group:"practice", routes:["quiz"], limitable:true,
    label:{ en:"Quizzes & drills", lo:"ແບບທົດສອບ", zh:"测验" }, desc:{ en:"Each quiz or practice round", lo:"ແຕ່ລະຮອບແບບທົດສອບ ຫຼື ແບບຝຶກ", zh:"每一轮测验或练习" } },
  { key:"review.srs",          group:"practice", routes:["review"],
    label:{ en:"Spaced review", lo:"ທົບທວນ", zh:"间隔复习" }, desc:{ en:"Flashcard review of what you learned", lo:"ທົບທວນສິ່ງທີ່ຮຽນແລ້ວ", zh:"复习已学内容" } },
  { key:"speaking.practice",   group:"practice", routes:["speak"],
    label:{ en:"Speaking practice", lo:"ຝຶກເວົ້າ", zh:"口语练习" }, desc:{ en:"Speech recognition practice", lo:"ຝຶກເວົ້າດ້ວຍການຮັບຮູ້ສຽງ", zh:"语音识别练习" } },
  { key:"pronunciation.lab",   group:"labs",     routes:["pronounce_lab"],
    label:{ en:"Pronunciation lab", lo:"ຫ້ອງຝຶກອອກສຽງ", zh:"发音实验室" }, desc:{ en:"Minimal pairs and sound drills", lo:"ຝຶກແຍກສຽງທີ່ຄ້າຍກັນ", zh:"最小对立音练习" } },
  { key:"tones.lab",           group:"labs",     routes:["tone_lab"],
    label:{ en:"Tone lab", lo:"ຫ້ອງຝຶກວັນນະຍຸດ", zh:"声调实验室" }, desc:{ en:"Hear and identify the six tones", lo:"ຟັງ ແລະ ແຍກ 6 ວັນນະຍຸດ", zh:"听辨六个声调" } },
  { key:"labs.culture",        group:"labs",     routes:["culture_lab"],
    label:{ en:"Culture lab", lo:"ວັດທະນະທຳ", zh:"文化" }, desc:{ en:"Lao customs and etiquette", lo:"ຮີດຄອງ ແລະ ມາລະຍາດລາວ", zh:"老挝习俗与礼仪" } },
  { key:"labs.particles",      group:"labs",     routes:["particle_lab"],
    label:{ en:"Particles lab", lo:"ຄຳລົງທ້າຍ", zh:"语气词" }, desc:{ en:"Sentence-final particles", lo:"ຄຳລົງທ້າຍປະໂຫຍກ", zh:"句末语气词" } },
  { key:"labs.kinship",        group:"labs",     routes:["kinship_lab"],
    label:{ en:"Kinship terms", lo:"ຄຳເອີ້ນຍາດພີ່ນ້ອງ", zh:"亲属称谓" }, desc:{ en:"Family and address terms", lo:"ຄຳເອີ້ນໃນຄອບຄົວ", zh:"家庭与称呼" } },
  { key:"labs.classifiers",    group:"labs",     routes:["classifiers_lab"],
    label:{ en:"Classifiers lab", lo:"ລັກສະນະນາມ", zh:"量词" }, desc:{ en:"Counting words and classifiers", lo:"ຄຳນັບ ແລະ ລັກສະນະນາມ", zh:"量词用法" } },
  { key:"progress.detailed",   group:"myspace",  routes:["progress"],
    label:{ en:"Detailed progress", lo:"ຄວາມຄືບໜ້າລະອຽດ", zh:"详细进度" }, desc:{ en:"Skill charts and history", lo:"ກຣາຟທັກສະ ແລະ ປະຫວັດ", zh:"技能图表与记录" } },
  { key:"saved",               group:"myspace",  routes:["saved"],
    label:{ en:"Saved items", lo:"ລາຍການທີ່ບັນທຶກ", zh:"收藏" }, desc:{ en:"Bookmarks", lo:"ບຸກມາກ", zh:"书签" } },
  { key:"notes",               group:"myspace",  routes:["notes"],
    label:{ en:"Notes", lo:"ບັນທຶກ", zh:"笔记" }, desc:{ en:"Personal study notes", lo:"ບັນທຶກການຮຽນສ່ວນຕົວ", zh:"个人学习笔记" } },
  { key:"offline.downloads",   group:"myspace",  routes:["downloads"], limitable:true,
    label:{ en:"Offline downloads", lo:"ດາວໂຫຼດອອບລາຍ", zh:"离线下载" }, desc:{ en:"Save content for offline study", lo:"ບັນທຶກເນື້ອຫາໄວ້ຮຽນອອບລາຍ", zh:"保存内容以便离线学习" } }
];

export const FEATURE_KEYS = FEATURES.map(f => f.key);
export const featureByKey = Object.fromEntries(FEATURES.map(f => [f.key, f]));

// view name → feature key (used by the router guard)
export const ROUTE_FEATURE = Object.fromEntries(FEATURES.flatMap(f => (f.routes||[]).map(r => [r, f.key])));
// practice type → feature key
export const PRACTICE_FEATURE = Object.fromEntries(FEATURES.flatMap(f => (f.types||[]).map(t => [t, f.key])));

export const PERIODS = ["day","week","month","period","lifetime"];

// Recommended starting point. Applied only when a Super Admin clicks "Apply recommended defaults" (Admin → Access matrix).
// A plan without an `entitlements` field keeps the old behaviour: every feature, no limits.
const ALL = Object.fromEntries(FEATURE_KEYS.map(k => [k, true]));
const pick = keys => Object.fromEntries(keys.map(k => [k, true]));
const FREE_KEYS = ["lessons.open","paths","patterns.browse","grammar","vocab","dialogues","videos.watch","audio.play","alphabet",
  "dictionary.search","handwriting.practice","practice.basic","quizzes.attempt","review.srs","labs.culture","saved","notes"];
export const RECOMMENDED = {
  free: { entitlements: pick(FREE_KEYS), limits: {
    "lessons.open":{ n:3, per:"day" }, "dictionary.search":{ n:20, per:"day" }, "quizzes.attempt":{ n:5, per:"day" },
    "handwriting.practice":{ n:5, per:"day" }, "audio.play":{ n:30, per:"day" }, "videos.watch":{ n:3, per:"day" } } },
  standard: { entitlements: ALL, limits: {
    "lessons.open":{ n:20, per:"day" }, "dictionary.search":{ n:100, per:"day" }, "quizzes.attempt":{ n:30, per:"day" },
    "offline.downloads":{ n:5, per:"month" } } },
  premium: { entitlements: ALL, limits: {} },
  vvip: { entitlements: ALL, limits: {} }
};
