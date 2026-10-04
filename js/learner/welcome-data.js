// Defaults for the welcome page: shown at once (and offline) and whenever the backend has nothing yet.
// Editors change all of this in the Admin Backend (Website & Welcome); the same rows are in data/seed.json,
// which scripts/test_welcome_data.mjs keeps in step with this file.
// Lao and Chinese texts and the landmark and festival facts need review by a native speaker (see docs/WELCOME.md).

// Map of Laos (viewBox 740 × 880): pins are projected from latitude / longitude, so a new place gets a pin by itself.
export const MAP = { w:740, h:880, lon0:100.08, lat0:22.5, kx:94.2, ky:99.94, x0:9.2, y0:10.5,
  bounds:{ latMin:13.9, latMax:22.5, lonMin:100.1, lonMax:107.7 } };
export function project(lat, lon){
  const x = MAP.kx * (lon - MAP.lon0) + MAP.x0, y = MAP.ky * (MAP.lat0 - lat) + MAP.y0;
  return { x: +(100 * x / MAP.w).toFixed(2), y: +(100 * y / MAP.h).toFixed(2) };
}
export const inLaos = (lat, lon) => Number.isFinite(+lat) && Number.isFinite(+lon) && +lat >= MAP.bounds.latMin && +lat <= MAP.bounds.latMax && +lon >= MAP.bounds.lonMin && +lon <= MAP.bounds.lonMax;

// Page sections in order; editors switch them on / off and reorder them
export const SECTION_IDS = ["greetings","alphabet","stats","journey","festivals","services","resources","promotions","news","about","closing"];
export const NAV_SECTIONS = ["journey","services","resources","promotions","news","about"];

const T = (en, lo, zh) => ({ en, lo, zh });

export const WELCOME = {
  seo: { title: T("LaoLao · Learn Lao, one real sentence at a time", "LaoLao · ຮຽນພາສາລາວ ເທື່ອລະປະໂຫຍກ", "LaoLao · 一句一句学老挝语"),
         description: T("Learn Lao with sentence patterns, native audio, a handwriting studio and spaced review. Start free.",
           "ຮຽນພາສາລາວດ້ວຍໂຄງສ້າງປະໂຫຍກ, ສຽງເຈົ້າຂອງພາສາ, ຫ້ອງຝຶກຂຽນ ແລະ ການທົບທວນ. ເລີ່ມຟຣີ.",
           "用句型、真人发音、书写练习和间隔复习学习老挝语。免费开始。") },
  nav: { home: T("Home","ໜ້າຫຼັກ","首页"), journey: T("Journey","ການເດີນທາງ","旅程"), services: T("Services","ບໍລິການ","服务"),
         resources: T("Free resources","ຟຣີ","免费资源"), promotions: T("Promotions","ໂປຣໂມຊັນ","优惠"), news: T("News","ຂ່າວ","新闻"), about: T("About","ກ່ຽວກັບ","关于") },
  hero: {
    badge: T("Lao for real conversations · 27 consonants, 6 tones", "ຮຽນລາວເພື່ອສົນທະນາຈິງ · 27 ພະຍັນຊະນະ, 6 ວັນນະຍຸດ", "学真正能用的老挝语 · 27个辅音，6个声调"),
    loWord: "ສະບາຍດີ",
    h1a: T("Learn Lao, one", "ຮຽນພາສາລາວ ເທື່ອລະ", "一句一句，"),
    h1b: T("real sentence", "ປະໂຫຍກຈິງ", "真实的句子"),
    h1c: T("at a time.", "ທຸກວັນ.", "学会老挝语。"),
    lead: T("Sentence patterns with native audio, a handwriting studio and spaced review. Start free, no card needed. Works offline.",
      "ໂຄງສ້າງປະໂຫຍກພ້ອມສຽງເຈົ້າຂອງພາສາ, ຫ້ອງຝຶກຂຽນ ແລະ ການທົບທວນ. ເລີ່ມຟຣີ ບໍ່ຕ້ອງໃຊ້ບັດ. ໃຊ້ອອບລາຍໄດ້.",
      "带真人发音的句型、书写练习与间隔复习。免费开始，无需绑卡，可离线使用。"),
    ctaStart: T("Start free", "ເລີ່ມຟຣີ", "免费开始"),
    ctaTour: T("Take the journey through Laos", "ເດີນທາງທົ່ວລາວ", "走进老挝"),
    hear: T("Tap to hear the greeting", "ແຕະເພື່ອຟັງສຽງທັກທາຍ", "点击收听问候语"),
    greeting: { lo: "ສະບາຍດີ", rom: "Sabaidee" }
  },
  sections: SECTION_IDS.map(id => ({ id, on: true })),
  // per-section heading, Lao subtitle and intro (empty = not shown)
  heads: {
    alphabet: { eyebrow: T("Hear the alphabet","ຟັງສຽງຕົວອັກສອນ","听字母发音") },
    journey: { eyebrow: T("Journey through Laos","ເດີນທາງທົ່ວລາວ","走遍老挝"), title: T("Follow the Mekong, learn the words on the way","ຕາມແມ່ນ້ຳຂອງ ຮຽນຄຳສັບລາວຕະຫຼອດທາງ","沿湄公河而行，边走边学"),
      loSub: "ຕາມແມ່ນ້ຳຂອງ ຮຽນຄຳສັບລາວຕະຫຼອດທາງ",
      intro: T("Six real places, from Luang Prabang to the Four Thousand Islands. Pick a place, watch it come alive, and learn the Lao words that belong to it.",
        "ຫົກສະຖານທີ່ຈິງ ແຕ່ຫຼວງພະບາງ ຮອດສີ່ພັນດອນ. ເລືອກສະຖານທີ່ ແລ້ວຮຽນຄຳສັບລາວທີ່ກ່ຽວຂ້ອງ.",
        "从琅勃拉邦到四千美岛的六个真实地点。选一个地方，看它活起来，学会与它相关的老挝语词汇。"),
      mapCaption: T("The Mekong, ແມ່ນ້ຳຂອງ, flowing south","ແມ່ນ້ຳຂອງ ໄຫຼລົງທິດໃຕ້","湄公河（ແມ່ນ້ຳຂອງ）向南流淌") },
    festivals: { eyebrow: T("Festival calendar","ປະຕິທິນບຸນ","节日日历"), title: T("The Lao year, month by month","ປີລາວ ເດືອນຕໍ່ເດືອນ","老挝的一年，按月看"),
      intro: T("Lunar festival dates move each year. The current one is highlighted.","ວັນບຸນຕາມຈັນທະຄະຕິປ່ຽນທຸກປີ. ບຸນປັດຈຸບັນຖືກເນັ້ນໄວ້.","农历节日的日期每年不同，当前的节日已高亮显示。") },
    services: { eyebrow: T("Services","ບໍລິການ","服务"), title: T("Everything you need to read, write and speak","ທຸກຢ່າງທີ່ຕ້ອງການເພື່ອອ່ານ, ຂຽນ ແລະ ເວົ້າ","读、写、说所需的一切"),
      loSub: "ທຸກຢ່າງທີ່ຕ້ອງການເພື່ອຮຽນພາສາລາວ",
      intro: T("Each tool runs on the same sentence patterns, so what you hear in a lesson turns up in practice, review and the dictionary.",
        "ທຸກເຄື່ອງມືໃຊ້ໂຄງສ້າງປະໂຫຍກດຽວກັນ ສິ່ງທີ່ໄດ້ຍິນໃນບົດຮຽນຈະພົບອີກໃນການຝຶກ, ການທົບທວນ ແລະ ວັດຈະນານຸກົມ.",
        "每个工具都基于同一套句型，课上听到的内容会出现在练习、复习和词典中。") },
    resources: { eyebrow: T("Free resources","ຊັບພະຍາກອນຟຣີ","免费资源"), title: T("Take something home today","ເອົາບາງຢ່າງກັບບ້ານມື້ນີ້","今天就带点东西回家"),
      intro: T("Free with a free account. Your download appears in your library after sign-up.","ຟຣີກັບບັນຊີຟຣີ. ໄຟລ໌ຈະຢູ່ໃນຫ້ອງສະໝຸດຂອງທ່ານຫຼັງສະໝັກ.","注册免费账户即可获得，下载内容会出现在你的资料库中。") },
    promotions: { eyebrow: T("Promotions and plans","ໂປຣໂມຊັນ ແລະ ແພັກເກດ","优惠与套餐"), title: T("Start free, upgrade when you want more","ເລີ່ມຟຣີ ອັບເກຣດເມື່ອຕ້ອງການຫຼາຍກວ່າ","免费开始，需要时再升级") },
    news: { eyebrow: T("News","ຂ່າວ","新闻"), title: T("Updates and stories from Laos","ຂ່າວສານ ແລະ ເລື່ອງລາວຈາກລາວ","来自老挝的更新与故事") }
  },
  greetings: [["ສະບາຍດີ","sabaidee","hello"],["ຂອບໃຈ","khop jai","thank you"],["ບໍ່ເປັນຫຍັງ","bo pen nyang","no problem"],["ແຊບ","saep","delicious"],
    ["ຍິນດີຕ້ອນຮັບ","yindi ton hap","welcome"],["ລາກ່ອນ","la kon","goodbye"],["ຂໍໂທດ","kho thot","sorry"],["ຮັກ","hak","love"]].map(([lo, rom, en]) => ({ lo, rom, en })),
  alphabet: [["ກ","Kai","Chicken","k"],["ຂ","Khai","Egg","kh"],["ງ","Ngua","Ox","ng"],["ຈ","Chork","Glass","ch"],["ດ","Dek","Child","d"],["ນ","Nok","Bird","n"],["ລ","Ling","Monkey","l"],["ສ","Seua","Tiger","s"]]
    .map(([lo, name, meaning, ipa]) => ({ lo, name, meaning, ipa })),
  stats: [
    { value:"27", label:T("consonants by class, with mnemonic names","ພະຍັນຊະນະຕາມໝວດ ພ້ອມຊື່ຊ່ວຍຈຳ","按类别排列的辅音，附助记名称") },
    { value:"6", label:T("Vientiane tones with audio","ວັນນະຍຸດແບບວຽງຈັນ ພ້ອມສຽງ","带音频的万象声调") },
    { value:"120+", label:T("dictionary words, search by romanization","ຄຳສັບໃນວັດຈະນານຸກົມ ຄົ້ນດ້ວຍຄຳອ່ານໂຣມັນ","词典词条，可按罗马字搜索") },
    { value:"3", label:T("interface languages: English, ລາວ, 中文","ພາສາໜ້າຈໍ: English, ລາວ, 中文","界面语言：English、ລາວ、中文") } ],
  services: [
    { size:"big", icon:"book", title:T("Sentence patterns and generator","ໂຄງສ້າງປະໂຫຍກ ແລະ ເຄື່ອງສ້າງປະໂຫຍກ","句型与句子生成器"),
      text:T("Learn a pattern once, then swap words in and out. Every sentence has Lao script, romanization, audio and a translation.",
        "ຮຽນໂຄງສ້າງເທື່ອດຽວ ແລ້ວປ່ຽນຄຳເຂົ້າອອກ. ທຸກປະໂຫຍກມີອັກສອນລາວ, ຄຳອ່ານ, ສຽງ ແລະ ຄຳແປ.",
        "学会一个句型，再自由替换词语。每个句子都有老挝文、罗马字、音频和翻译。"), demo:true },
    { size:"mid", icon:"wave", title:T("Alphabet, vowels and tones","ຕົວອັກສອນ, ສະຫຼະ ແລະ ວັນນະຍຸດ","字母、元音与声调"),
      text:T("All 27 consonants by Middle, High and Low class, short and long vowels, and six tones you can hear.","ພະຍັນຊະນະທັງ 27 ຕົວຕາມອັກສອນກາງ, ສູງ ແລະ ຕ່ຳ, ສະຫຼະສັ້ນ-ຍາວ ແລະ ວັນນະຍຸດ 6 ສຽງທີ່ຟັງໄດ້.","按中、高、低类排列的全部27个辅音，长短元音，以及可收听的六个声调。") },
    { size:"sm", icon:"pen", title:T("Handwriting studio","ຫ້ອງຝຶກຂຽນ","书写练习"), text:T("Trace each stroke and get scored.","ຂຽນຕາມແຕ່ລະເສັ້ນ ແລະ ໄດ້ຄະແນນ.","逐笔描写并获得评分。"), lock:T("Basic","ແພັກ Basic","基础版") },
    { size:"sm", icon:"search", title:T("Dictionary","ວັດຈະນານຸກົມ","词典"), text:T("Search in Lao, romanization or English.","ຄົ້ນຫາດ້ວຍພາສາລາວ, ຄຳອ່ານ ຫຼື ອັງກິດ.","可用老挝文、罗马字或英文搜索。") },
    { size:"sm", icon:"repeat", title:T("Spaced review","ການທົບທວນເປັນໄລຍະ","间隔复习"), text:T("Flashcards come back just before you forget.","ບັດຄຳກັບມາກ່ອນທີ່ທ່ານຈະລືມ.","在你快要忘记时，卡片会再次出现。") },
    { size:"mid", icon:"lamp", title:T("Culture and pronunciation labs","ຫ້ອງທົດລອງວັດທະນະທຳ ແລະ ການອອກສຽງ","文化与发音实验室"),
      text:T("Tone drills, minimal pairs, kinship terms, classifiers and etiquette such as the Baci ceremony.","ຝຶກວັນນະຍຸດ, ຄູ່ຄຳ, ຄຳເອີ້ນຍາດ, ລັກສະນະນາມ ແລະ ມາລະຍາດ ເຊັ່ນ ພິທີບາສີ.","声调练习、最小对立词、亲属称谓、量词以及拴线礼等礼仪。") } ],
  // the interactive pattern in the services card: ຂ້ອຍຢາກ + verb + object
  patternDemo: [["ເຂົ້າໜຽວ","khao niao","sticky rice","ກິນ","kin","eat"],["ນ້ຳ","nam","water","ດື່ມ","deum","drink"],["ໝາກໄມ້","mak mai","fruit","ກິນ","kin","eat"],["ກາເຟ","kafe","coffee","ດື່ມ","deum","drink"]]
    .map(([lo, rom, en, vlo, vrom, ven]) => ({ lo, rom, en, vlo, vrom, ven })),
  about: {
    eyebrow: T("About LaoLao","ກ່ຽວກັບ LaoLao","关于 LaoLao"),
    title: T("Built for people learning Lao, with Lao speakers","ສ້າງເພື່ອຜູ້ຮຽນພາສາລາວ ຮ່ວມກັບຄົນລາວ","为学习老挝语的人打造，与老挝语母语者一起"),
    text: T("LaoLao teaches from real sentence patterns instead of word lists. Content is written and checked by native speakers and published in tiers, so free learners and subscribers always see what their plan includes.",
      "LaoLao ສອນຈາກໂຄງສ້າງປະໂຫຍກຈິງ ແທນລາຍການຄຳສັບ. ເນື້ອຫາຂຽນ ແລະ ກວດໂດຍເຈົ້າຂອງພາສາ ແລະ ເຜີຍແຜ່ຕາມລະດັບ ເພື່ອໃຫ້ຜູ້ຮຽນເຫັນສິ່ງທີ່ແພັກເກດຂອງຕົນມີ.",
      "LaoLao 用真实句型而不是单词表来教学。内容由母语者编写和审核，并按等级发布，免费用户和订阅用户都能看到自己套餐包含的内容。"),
    points: [T("Native audio on patterns, words and dialogues","ສຽງເຈົ້າຂອງພາສາໃນໂຄງສ້າງ, ຄຳສັບ ແລະ ບົດສົນທະນາ","句型、词汇和对话均有真人发音"),
      T("Works offline as an installable app","ໃຊ້ອອບລາຍໄດ້ ຕິດຕັ້ງເປັນແອັບໄດ້","可安装为应用并离线使用"),
      T("Interface in English, Lao and Chinese","ໜ້າຈໍເປັນພາສາອັງກິດ, ລາວ ແລະ ຈີນ","界面支持英语、老挝语和中文")],
    tagline: "ຮຽນພາສາລາວດ້ວຍຄວາມສຸກ"
  },
  closing: { title: T("Say your first sentence in Lao today.","ເວົ້າປະໂຫຍກລາວທຳອິດຂອງທ່ານມື້ນີ້.","今天就说出你的第一句老挝语。"),
             cta: T("Create a free account","ສ້າງບັນຊີຟຣີ","创建免费账户") },
  footer: { copyright: T("© 2026 LaoLao · ລາວລາວ","© 2026 LaoLao · ລາວລາວ","© 2026 LaoLao · ລາວລາວ"),
    links: [{ label:T("About","ກ່ຽວກັບ","关于"), target:"about" }, { label:T("News","ຂ່າວ","新闻"), target:"news" }, { label:T("Plans","ແພັກເກດ","套餐"), target:"promotions" }] }
};

// Content rows (same shape as the admin editors save)
const row = (id, order, data) => Object.assign({ id, status:"published", access:"public", order }, data);
export const PLACES = [
  row("luangprabang", 1, { scene:"luangprabang", lat:19.888, lon:102.140, unesco:1995, title:T("Luang Prabang","ຫຼວງພະບາງ","琅勃拉邦"), laoName:"ຫຼວງພະບາງ",
    badge:T("UNESCO World Heritage since 1995","ມໍລະດົກໂລກ UNESCO ແຕ່ປີ 1995","1995年起列入联合国教科文组织世界遗产"),
    text:T("Where the Nam Khan meets the Mekong, monks in saffron walk the streets at dawn for Tak Bat, the morning alms round. Phou Si hill rises over town, crowned by the golden stupa of Wat Chom Si.",
      "ບ່ອນທີ່ນ້ຳຄານບັນຈົບແມ່ນ້ຳຂອງ ພະສົງຍ່າງຕາມຖະໜົນຍາມເຊົ້າເພື່ອຮັບບາດ. ພູສີຕັ້ງເດັ່ນເໜືອເມືອງ ມີທາດຄຳຂອງວັດຈອມສີ.",
      "在南康河与湄公河交汇处，身着橘色僧袍的僧侣清晨走上街头接受布施。普西山矗立城中，山顶是金色的宗西寺佛塔。"),
    facts:[T("Tak Bat every dawn","ຕັກບາດທຸກເຊົ້າ","每天清晨布施"),T("Phou Si hill","ພູສີ","普西山"),T("Wat Xieng Thong","ວັດຊຽງທອງ","香通寺")],
    words:[{ lo:"ໃສ່ບາດ", rom:"sai bat", en:"to give alms", audio:"" },{ lo:"ພູສີ", rom:"phou si", en:"Phou Si hill", audio:"" }] }),
  row("vangvieng", 2, { scene:"vangvieng", lat:18.926, lon:102.451, title:T("Vang Vieng","ວັງວຽງ","万荣"), laoName:"ວັງວຽງ", badge:T("Nam Song valley","ຮ່ອມພູນ້ຳຊອງ","南松河谷"),
    text:T("Limestone karst towers rise straight out of the rice fields along the Nam Song river. At sunrise, hot-air balloons drift between the peaks.",
      "ພູຫີນປູນຕັ້ງຂຶ້ນຈາກທົ່ງນາລຽບນ້ຳຊອງ. ຍາມຕາເວັນຂຶ້ນ ບານລູນລອຍຜ່ານລະຫວ່າງຍອດພູ.",
      "石灰岩喀斯特峰林从南松河沿岸的稻田中拔地而起。日出时，热气球在山峰间飘荡。"),
    facts:[T("Karst peaks","ພູຫີນປູນ","喀斯特山峰"),T("Nam Song river","ນ້ຳຊອງ","南松河"),T("Sunrise balloons","ບານລູນຍາມເຊົ້າ","日出热气球")],
    words:[{ lo:"ພູ", rom:"phou", en:"mountain", audio:"" },{ lo:"ນ້ຳ", rom:"nam", en:"water, river", audio:"" }] }),
  row("phonsavan", 3, { scene:"phonsavan", lat:19.455, lon:103.205, unesco:2019, title:T("Plain of Jars","ທົ່ງໄຫຫີນ","石缸平原"), laoName:"ທົ່ງໄຫຫີນ",
    badge:T("UNESCO World Heritage since 2019","ມໍລະດົກໂລກ UNESCO ແຕ່ປີ 2019","2019年起列入联合国教科文组织世界遗产"),
    text:T("Thousands of Iron Age stone jars lie scattered across the hills of Xieng Khouang province, near Phonsavan. Archaeologists link them to burial rites, and no one knows the whole story.",
      "ໄຫຫີນຍຸກເຫຼັກຫຼາຍພັນໜ່ວຍກະຈາຍຢູ່ຕາມເນີນພູຂອງແຂວງຊຽງຂວາງ ໃກ້ໂພນສະຫວັນ. ນັກໂບຮານຄະດີເຊື່ອມໂຍງກັບພິທີຝັງສົບ.",
      "数千个铁器时代的石缸散布在川圹省丰沙湾附近的山丘上。考古学家认为它们与丧葬仪式有关，但完整的故事仍是谜。"),
    facts:[T("Xieng Khouang province","ແຂວງຊຽງຂວາງ","川圹省"),T("Iron Age jars","ໄຫຍຸກເຫຼັກ","铁器时代石缸"),T("Near Phonsavan","ໃກ້ໂພນສະຫວັນ","丰沙湾附近")],
    words:[{ lo:"ໄຫ", rom:"hai", en:"jar", audio:"" },{ lo:"ຫີນ", rom:"hin", en:"stone", audio:"" }] }),
  row("vientiane", 4, { scene:"vientiane", lat:17.969, lon:102.605, title:T("Vientiane","ວຽງຈັນ","万象"), laoName:"ວຽງຈັນ", badge:T("Capital of Laos","ນະຄອນຫຼວງຂອງລາວ","老挝首都"),
    text:T("Pha That Luang, the great golden stupa, is the national symbol. Each November at the full moon, Boun That Luang fills its grounds with candles, music and a fair that runs for up to a week.",
      "ພະທາດຫຼວງ ທາດຄຳອັນຍິ່ງໃຫຍ່ ເປັນສັນຍາລັກຂອງຊາດ. ທຸກເດືອນພະຈິກ ວັນເພັງ ບຸນທາດຫຼວງເຕັມໄປດ້ວຍທຽນ, ດົນຕີ ແລະ ງານບຸນເຖິງໜຶ່ງອາທິດ.",
      "塔銮大金塔是国家的象征。每年十一月月圆时，塔銮节以烛光、音乐和长达一周的集市充满寺院。"),
    facts:[T("Pha That Luang","ພະທາດຫຼວງ","塔銮"),T("Boun That Luang, November","ບຸນທາດຫຼວງ, ເດືອນພະຈິກ","塔銮节，十一月"),T("On the Mekong","ຢູ່ແຄມແມ່ນ້ຳຂອງ","湄公河畔")],
    words:[{ lo:"ທາດຫຼວງ", rom:"that luang", en:"great stupa", audio:"" },{ lo:"ທຽນ", rom:"thian", en:"candle", audio:"" }] }),
  row("champasak", 5, { scene:"champasak", lat:14.848, lon:105.853, unesco:2001, title:T("Champasak and Wat Phou","ຈຳປາສັກ · ວັດພູ","占巴塞与瓦普寺"), laoName:"ຈຳປາສັກ · ວັດພູ",
    badge:T("UNESCO World Heritage since 2001","ມໍລະດົກໂລກ UNESCO ແຕ່ປີ 2001","2001年起列入联合国教科文组织世界遗产"),
    text:T("A Khmer-era temple complex climbs the slope of Phou Kao, a mountain whose peak is shaped like a lingam. Frangipani trees, the dok champa, drop white flowers along the way.",
      "ສິ່ງກໍ່ສ້າງວັດສະໄໝຂະແມປີນຂຶ້ນເນີນພູເກົ້າ ທີ່ຍອດມີຮູບຄືລຶງຄະ. ຕົ້ນດອກຈຳປາຫຼົ່ນດອກສີຂາວຕາມທາງ.",
      "一座高棉时期的寺庙群沿着普告山坡而上，山顶形似林伽。鸡蛋花（占芭花）沿途洒落白色花朵。"),
    facts:[T("Khmer-era temple","ວັດສະໄໝຂະແມ","高棉时期寺庙"),T("Phou Kao peak","ຍອດພູເກົ້າ","普告山峰"),T("Dok champa trees","ຕົ້ນດອກຈຳປາ","占芭花树")],
    words:[{ lo:"ວັດພູ", rom:"wat phou", en:"mountain temple", audio:"" },{ lo:"ດອກຈຳປາ", rom:"dok champa", en:"frangipani flower", audio:"" }] }),
  row("siphandon", 6, { scene:"siphandon", lat:14.100, lon:105.972, title:T("Si Phan Don","ສີ່ພັນດອນ","四千美岛"), laoName:"ສີ່ພັນດອນ", badge:T("Four Thousand Islands","ສີ່ພັນດອນ","四千美岛"),
    text:T("Near the Cambodian border the Mekong widens to as much as 14 km and breaks into thousands of islands. Long-tail boats cross between Don Khone and Don Det, near the Li Phi and Khone Phapheng falls.",
      "ໃກ້ຊາຍແດນກຳປູເຈຍ ແມ່ນ້ຳຂອງກວ້າງເຖິງ 14 ກມ ແລະ ແຍກເປັນດອນຫຼາຍພັນດອນ. ເຮືອຫາງຍາວແລ່ນລະຫວ່າງດອນຄອນ ແລະ ດອນເດດ ໃກ້ນ້ຳຕົກຫຼີຜີ ແລະ ຄອນພະເພັງ.",
      "在靠近柬埔寨边境处，湄公河宽达14公里，分出数千个岛屿。长尾船往返于孔岛和德岛之间，附近是李皮瀑布和孔帕平瀑布。"),
    facts:[T("Don Khone and Don Det","ດອນຄອນ ແລະ ດອນເດດ","孔岛与德岛"),T("Li Phi falls","ນ້ຳຕົກຫຼີຜີ","李皮瀑布"),T("Khone Phapheng falls","ນ້ຳຕົກຄອນພະເພັງ","孔帕平瀑布")],
    words:[{ lo:"ດອນ", rom:"don", en:"river island", audio:"" },{ lo:"ເຮືອ", rom:"heua", en:"boat", audio:"" }] })
];
export const FESTIVALS = [
  row("pi-mai", 1, { month:4, lunar:false, art:"water", dateText:T("13–16 April","13–16 ເມສາ","4月13日至16日"), title:T("Boun Pi Mai Lao","ບຸນປີໃໝ່ລາວ","老挝新年"), laoName:"ບຸນປີໃໝ່ລາວ",
    text:T("Lao New Year. Neighbors splash water to wash away the old year, and Nang Sangkhan parades through Luang Prabang.","ປີໃໝ່ລາວ. ເພື່ອນບ້ານຫົດນ້ຳເພື່ອລ້າງປີເກົ່າ ແລະ ນາງສັງຂານແຫ່ຜ່ານຫຼວງພະບາງ.","老挝新年。邻里互相泼水送走旧年，桑坎女神巡游琅勃拉邦。") }),
  row("bang-fai", 2, { month:5, lunar:true, art:"rocket", dateText:T("May","ພຶດສະພາ","5月"), title:T("Boun Bang Fai","ບຸນບັ້ງໄຟ","火箭节"), laoName:"ບຸນບັ້ງໄຟ",
    text:T("The rocket festival. Villages launch bamboo rockets to call the rains before rice planting.","ບຸນບັ້ງໄຟ. ບ້ານຈູດບັ້ງໄຟເພື່ອຂໍຝົນກ່ອນລົງນາ.","火箭节。村民在插秧前发射竹制火箭以祈求降雨。") }),
  row("khao-phansa", 3, { month:7, lunar:true, art:"candle", dateText:T("July, full moon","ກໍລະກົດ, ວັນເພັງ","7月，月圆时"), title:T("Boun Khao Phansa","ບຸນເຂົ້າພັນສາ","入夏节"), laoName:"ບຸນເຂົ້າພັນສາ",
    text:T("The start of Buddhist Lent. Families bring candles and offerings to the temple.","ເລີ່ມເຂົ້າພັນສາ. ຄອບຄົວນຳທຽນ ແລະ ເຄື່ອງຖວາຍໄປວັດ.","佛教守夏期开始。家家户户带着蜡烛和供品前往寺庙。") }),
  row("ok-phansa", 4, { month:10, lunar:true, art:"fireboat", dateText:T("October","ຕຸລາ","10月"), title:T("Boun Ok Phansa and Suang Heua","ບຸນອອກພັນສາ ແລະ ບຸນສ່ວງເຮືອ","出夏节与龙舟赛"), laoName:"ບຸນອອກພັນສາ · ບຸນສ່ວງເຮືອ",
    text:T("End of Lent. Lit boats float on the Mekong the night before, and crews race long boats the next day.","ອອກພັນສາ. ເຮືອໄຟລອຍໃນແມ່ນ້ຳຂອງຄືນກ່ອນ ແລະ ມື້ຕໍ່ມາມີການແຂ່ງເຮືອ.","守夏期结束。前一晚湄公河上漂着火船，第二天举行长舟竞赛。") }),
  row("that-luang", 5, { month:11, lunar:true, art:"stupa", dateText:T("November, full moon","ພະຈິກ, ວັນເພັງ","11月，月圆时"), title:T("Boun That Luang","ບຸນທາດຫຼວງ","塔銮节"), laoName:"ບຸນທາດຫຼວງ",
    text:T("Candlelit processions and a fair at Pha That Luang in Vientiane, for up to a week.","ຂະບວນແຫ່ທຽນ ແລະ ງານບຸນທີ່ພະທາດຫຼວງ ວຽງຈັນ ເຖິງໜຶ່ງອາທິດ.","万象塔銮的烛光游行和集市，持续长达一周。") }),
  row("national-day", 6, { month:12, lunar:false, art:"flag", dateText:T("2 December","2 ທັນວາ","12月2日"), title:T("Lao National Day","ວັນຊາດ","老挝国庆节"), laoName:"ວັນຊາດ",
    text:T("Marks the founding of the Lao People's Democratic Republic in 1975.","ລະນຶກການສະຖາປະນາ ສປປ ລາວ ໃນປີ 1975.","纪念1975年老挝人民民主共和国成立。") })
];
export const RESOURCES = [
  row("starter-guide", 1, { kind:"pdf", glyph:"ກ", cover:1, requiresAccount:true, url:"", title:T("30-day Lao starter guide","ຄູ່ມືເລີ່ມຕົ້ນ 30 ວັນ","30天老挝语入门指南"),
    text:T("Script, tones and survival conversation in one reference.","ອັກສອນ, ວັນນະຍຸດ ແລະ ບົດສົນທະນາພື້ນຖານໃນເຫຼັ້ມດຽວ.","文字、声调和生存会话，一本全搞定。") }),
  row("consonant-chart", 2, { kind:"chart", glyph:"ຂ ຄ", cover:2, requiresAccount:true, url:"", title:T("Consonant chart","ຕາຕະລາງພະຍັນຊະນະ","辅音表"),
    text:T("27 letters with class, sound and mnemonic.","27 ຕົວອັກສອນ ພ້ອມໝວດ, ສຽງ ແລະ ຄຳຊ່ວຍຈຳ.","27个字母，附类别、发音和助记词。") }),
  row("tone-sheet", 3, { kind:"cheatsheet", glyph:"໊ ໋", cover:3, requiresAccount:true, url:"", title:T("Six tones, one page","ຫົກວັນນະຍຸດ ໃນໜ້າດຽວ","六个声调，一页纸"),
    text:T("Marks, pitch shapes and example words.","ເຄື່ອງໝາຍ, ລະດັບສຽງ ແລະ ຄຳຕົວຢ່າງ.","声调符号、音高曲线和例词。") }),
  row("greetings-audio", 4, { kind:"audio", glyph:"ສ", cover:4, requiresAccount:true, url:"", title:T("Greetings audio pack","ຊຸດສຽງຄຳທັກທາຍ","问候语音频包"),
    text:T("20 everyday phrases by a native speaker.","20 ປະໂຫຍກປະຈຳວັນ ໂດຍເຈົ້າຂອງພາສາ.","20个日常短语，由母语者朗读。") })
];
// Example offer: only switched on in demo mode (the starter content ships it inactive). Real offers come from the admin.
export const SAMPLE_OFFER = row("sample-premium", 1, { kind:"countdown", placement:"promotions", active:false, planId:"premium",
  badge:T("Example offer","ໂປຣໂມຊັນຕົວຢ່າງ","示例优惠"), title:T("Save 30% on Premium for your first 3 months","ປະຢັດ 30% ສຳລັບ Premium 3 ເດືອນທຳອິດ","Premium前3个月立省30%"),
  text:T("An example offer for the demo. Edit or replace it in Admin → Promotions & Feed.","ໂປຣໂມຊັນຕົວຢ່າງສຳລັບການທົດລອງ. ແກ້ໄຂໄດ້ທີ່ Admin → Promotions & Feed.","演示用的示例优惠，可在管理后台 → 优惠与动态中修改。"),
  discountText:T("30% off","ຫຼຸດ 30%","七折"), ctaLabel:T("Create a free account","ສ້າງບັນຊີຟຣີ","创建免费账户"), startsAt:"2026-10-01", endsAt:"2026-12-31T23:59:00" });
// Featured news when the backend has nothing (the same stories are in the starter content)
export const NEWS = [
  { id:"r100", type:"releases", kind:"release", date:"2026-09-28", glyph:"ສະບາຍດີ", title:T("Welcome to LaoLao","ຍິນດີຕ້ອນຮັບສູ່ LaoLao","欢迎来到 LaoLao"), loTitle:"ຍິນດີຕ້ອນຮັບສູ່ ລາວລາວ!",
    text:T("Lao script, phonetics, sentence patterns, native audio, a stroke handwriting studio, a dictionary and quizzes, all in one place.","ອັກສອນລາວ, ການອອກສຽງ, ໂຄງສ້າງປະໂຫຍກ, ສຽງເຈົ້າຂອງພາສາ, ຫ້ອງຝຶກຂຽນ, ວັດຈະນານຸກົມ ແລະ ແບບທົດສອບ ໃນບ່ອນດຽວ.","老挝文字、语音、句型、真人发音、笔画书写练习、词典和测验，一站式提供。") },
  { id:"cul-alms", type:"culture", kind:"culture", glyph:"ບ", title:T("Tak Bat: morning almsgiving in Luang Prabang","ພິທີໃສ່ບາດເຂົ້າໜຽວຍາມເຊົ້າ","布施：琅勃拉邦的清晨布施"), loTitle:"ພິທີໃສ່ບາດເຂົ້າໜຽວຍາມເຊົ້າ" },
  { id:"cul-baci", type:"culture", kind:"culture", glyph:"ສ", title:T("The Baci ceremony and the calling of the soul","ພິທີບາສີສູ່ຂວັນ","拴线礼与招魂仪式"), loTitle:"ພິທີບາສີສູ່ຂວັນ" },
  { id:"cul-khao-niao", type:"culture", kind:"culture", glyph:"ຕ", title:T("Sticky rice etiquette at the table","ມາລະຍາດການກິນເຂົ້າໜຽວ","餐桌上的糯米饭礼仪"), loTitle:"ມາລະຍາດການກິນເຂົ້າໜຽວ" }
];
// Options the editors can pick (the scene and festival art is drawn in welcome-scenes.js)
export const SCENES = ["luangprabang","vangvieng","phonsavan","vientiane","champasak","siphandon","temple","mountain","river","waterfall","market","cave"];
export const FEST_ART = ["water","rocket","candle","fireboat","stupa","flag","generic"];
export const RESOURCE_KINDS = ["pdf","audio","chart","cheatsheet","video"];
