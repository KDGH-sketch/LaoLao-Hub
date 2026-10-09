// The pronunciation course: 14 built-in units in three areas, each mapped to the CEFR Companion Volume (Council of
// Europe, 2020) "Phonological control" scales (sound articulation, prosodic features, overall phonological control),
// with tips for English and Chinese speakers (their typical accent problems differ). Admin → Pronunciation units can
// replace a built-in unit (same id), hide it, or add new ones. Plus the learner's pronunciation profile and the
// accent check. Pure data and functions (tests: scripts/test_pron.mjs).
const L3 = (en, lo, zh) => ({ en, lo, zh });
export const AREAS = [
  { key:"sounds",    icon:"sound",  t:L3("Sounds of Lao","ສຽງຂອງພາສາລາວ","老挝语的发音"),   scale:L3("CEFR · Sound articulation","CEFR · ການອອກສຽງ","CEFR · 发音清晰度") },
  { key:"tones",     icon:"pinyin", t:L3("Tones","ວັນນະຍຸດ","声调"),                         scale:L3("CEFR · Prosodic features (tone)","CEFR · ລັກສະນະສຽງ (ວັນນະຍຸດ)","CEFR · 韵律特征（声调）") },
  { key:"connected", icon:"users",  t:L3("Speaking smoothly","ເວົ້າໃຫ້ລື່ນ","流利表达"),       scale:L3("CEFR · Overall phonological control","CEFR · ການຄວບຄຸມສຽງໂດຍລວມ","CEFR · 整体语音控制") }
];
export const CEFR = ["A1","A2","B1","B2"];
// what the learner can do after a unit: CEFR descriptors in plain words, by area and level
const CAN = {
  sounds: { A1:L3("I can say the sounds of words I have learnt clearly enough to be understood with some effort.","ຂ້ອຍອອກສຽງຄຳທີ່ຮຽນແລ້ວໄດ້ຊັດພໍໃຫ້ຄົນເຂົ້າໃຈ.","我能把学过的词的音发得足够清楚，别人稍加努力就能听懂。"),
            A2:L3("My pronunciation is clear enough to be understood, even if my accent shows.","ການອອກສຽງຂອງຂ້ອຍຊັດພໍໃຫ້ເຂົ້າໃຈ ເຖິງວ່າຍັງມີສຳນຽງ.","即使有口音，我的发音也足够清楚，别人能听懂。") },
  tones:  { A1:L3("I can copy the tones of words and phrases I have learnt.","ຂ້ອຍເອົາແບບວັນນະຍຸດຂອງຄຳທີ່ຮຽນແລ້ວໄດ້.","我能模仿学过的词和短语的声调。"),
            A2:L3("I can say everyday words with tones good enough to be understood.","ຂ້ອຍເວົ້າຄຳປະຈຳວັນດ້ວຍວັນນະຍຸດທີ່ຄົນເຂົ້າໃຈໄດ້.","我能用别人听得懂的声调说日常词语。"),
            B1:L3("I can keep the right tone on each syllable of longer words.","ຂ້ອຍຮັກສາວັນນະຍຸດທີ່ຖືກຕ້ອງໃນທຸກພະຍາງຂອງຄຳຍາວໄດ້.","我能在较长的词里让每个音节保持正确的声调。") },
  connected: { B1:L3("I can speak in phrases with natural rhythm and sentence endings.","ຂ້ອຍເວົ້າເປັນປະໂຫຍກດ້ວຍຈັງຫວະ ແລະ ຄຳລົງທ້າຍທີ່ເປັນທຳມະຊາດ.","我能用自然的节奏和句尾语气词说短句。"),
               B2:L3("I can follow and repeat real conversations with clear tones and good flow.","ຂ້ອຍເວົ້າຕາມບົດສົນທະນາຕົວຈິງດ້ວຍວັນນະຍຸດຊັດ ແລະ ລື່ນໄຫຼ.","我能用清楚的声调和流畅的语速跟读真实对话。") }
};
export const canDo = u => (CAN[u.area] || {})[u.cefr] || (CAN[u.area] || {})[Object.keys(CAN[u.area] || {})[0]] || L3("","","");

// items: [Lao, romanization, English, Chinese]; pairs: words that differ in one sound or tone (hear one, pick it)
export const UNITS = [
  { id:"pr-length", area:"sounds", cefr:"A1", order:1, focus:"length", glyph:"ອະ ອາ", t:L3("Short and long vowels","ສະຫຼະສັ້ນ ແລະ ຍາວ","长元音和短元音"),
    explain:L3("In Lao, vowel length changes the meaning: ຂັດ (to scrub) and ຂາດ (torn) differ only in how long the vowel lasts. Hold a long vowel about twice as long as a short one, and keep short vowels really short, especially before a final stop.",
      "ໃນພາສາລາວ ຄວາມສັ້ນ-ຍາວຂອງສະຫຼະປ່ຽນຄວາມໝາຍ: ຂັດ ແລະ ຂາດ ຕ່າງກັນແຕ່ຄວາມຍາວຂອງສະຫຼະ.",
      "老挝语的元音长短会改变词义：ຂັດ（擦）和 ຂາດ（破）只差在元音的长短。长元音大约是短元音的两倍长；短元音要很短，尤其是在塞音韵尾前。"),
    tips:{ en:"English doesn't use length alone to tell words apart. Exaggerate at first: count \"one\" for a short vowel and \"one-two\" for a long one.", zh:"汉语不靠元音长短区分词义。刚开始可以夸张一些：短元音数“一”，长元音数“一、二”。" },
    items:[["ຂາດ","khàat","torn, missing","破，缺"],["ຂັດ","khát","to scrub, polish","擦"],["ມີດ","mîit","knife","刀"],["ມິດ","mít","silent, quiet","安静"],["ຕາດ","tàat","waterfall","瀑布"],["ຕັດ","tát","to cut","剪，切"],["ໂຕ","tōo","body; classifier for animals","身体；动物量词"],["ໂຕະ","tó","table","桌子"]],
    pairs:[["ຂັດ","ຂາດ"],["ມິດ","ມີດ"],["ຕັດ","ຕາດ"],["ໂຕະ","ໂຕ"]] },
  { id:"pr-vowels", area:"sounds", cefr:"A1", order:2, focus:"vowels", glyph:"ື ແ", t:L3("Vowels English doesn't have","ສະຫຼະທີ່ພາສາອັງກິດບໍ່ມີ","英语没有的元音"),
    explain:L3("ື / ຶ (ɯ) is \"oo\" said with spread lips, as in a smile. ເ-ີ (ə) is the relaxed vowel of \"sir\" without the r. ແ (ɛ) is the open \"a\" of \"cat\". The double vowels ເ-ຍ (ia), ເ-ືອ (ɯa) and ົວ (ua) glide from the first vowel to a soft \"a\".",
      "ສະຫຼະ ື, ເ-ີ, ແ ແລະ ສະຫຼະປະສົມ ເ-ຍ, ເ-ືອ, ົວ.",
      "ື/ຶ（ɯ）像嘴唇展开、微笑着发“乌”。ເ-ີ（ə）类似拼音的 e。ແ（ɛ）是张口的“诶”。复元音 ເ-ຍ（ia）、ເ-ືອ（ɯa）和 ົວ（ua）从前一个元音滑向轻轻的 a。"),
    tips:{ en:"Don't round your lips for ື: smile and say \"oo\". Keep ແ open like the \"a\" in \"cat\", not the \"e\" in \"bed\".", zh:"拼音 e 就是 ເ-ີ，可以直接借用；ື 不要像“乌”那样圆唇，嘴角向两边拉开。" },
    items:[["ມື","mɯ́ɯ","hand","手"],["ຊື່","sɯ̂ɯ","name","名字"],["ເງິນ","ngə́n","money","钱"],["ເດີນ","dəən","to walk","走"],["ແມ່","mɛ̀ɛ","mother","母亲"],["ແມວ","mɛ́ɛo","cat","猫"],["ເຮືອ","hɯ́a","boat","船"],["ເມຍ","mía","wife","妻子"],["ງົວ","ngúa","cow","牛"],["ຄື","khɯ́ɯ","like, as","像"]],
    pairs:[["ຄື","ຄູ"],["ມື","ມີ"],["ແປດ","ເປັດ"]] },
  { id:"pr-aspiration", area:"sounds", cefr:"A1", order:3, focus:"aspiration", glyph:"ປ ພ ບ", t:L3("A puff of air or not","ມີລົມ ຫຼື ບໍ່ມີລົມ","送气还是不送气"),
    explain:L3("Lao has three kinds of p and t: ປ ຕ ກ without a puff of air (like the p in \"spin\"), ພ ທ ຄ with a puff of air (like \"pin\"), and ບ ດ with the voice on (like \"bin\", \"din\"). Hold a sheet of paper in front of your mouth: it should move only for ພ ທ ຄ.",
      "ປ ຕ ກ ບໍ່ມີລົມ, ພ ທ ຄ ມີລົມ, ບ ດ ສຽງກ້ອງ.",
      "老挝语有三组：ປ ຕ ກ 不送气（像拼音 b d g），ພ ທ ຄ 送气（像拼音 p t k），ບ ດ 是浊音（声带振动，像英语的 b、d）。把一张纸放在嘴前：只有 ພ ທ ຄ 会吹动纸。"),
    tips:{ en:"At the start of a word, English always adds a puff of air to p, t and k. For ປ ຕ ກ, say them as in \"spin\", \"stop\", \"skin\".", zh:"拼音 b/d/g 正好就是 ປ/ຕ/ກ，p/t/k 就是 ພ/ທ/ຄ。难点是 ບ 和 ດ：声带要振动，可以先轻轻哼“嗯”再发。" },
    items:[["ປາ","pāa","fish","鱼"],["ພາ","pháa","to lead, take along","带"],["ຕາ","tāa","eye","眼睛"],["ທາ","tháa","to paint, apply","涂"],["ກາ","kāa","crow","乌鸦"],["ຄາ","kháa","stuck","卡住"],["ດີ","dīi","good","好"],["ຕີ","tīi","to hit","打"],["ບ່າ","bàa","shoulder","肩膀"],["ປ່າ","pàa","forest","森林"]],
    pairs:[["ປາ","ພາ"],["ຕາ","ທາ"],["ກາ","ຄາ"],["ດີ","ຕີ"],["ບ່າ","ປ່າ"]] },
  { id:"pr-initials", area:"sounds", cefr:"A1", order:4, focus:"initials", glyph:"ງ ຍ", t:L3("ng- and ny- at the start","ງ ແລະ ຍ ຢູ່ຕົ້ນຄຳ","词首的 ng 和 ny"),
    explain:L3("ງ (ng) is the sound at the end of \"sing\", but Lao also uses it at the start of words: ງົວ (cow), ງາມ (beautiful). ຍ (ny) is like the \"ny\" in \"canyon\".",
      "ງ ແລະ ຍ ຢູ່ຕົ້ນຄຳ.", "ງ（ng）就是“唱”末尾的 ng，但老挝语也放在词首：ງົວ（牛）、ງາມ（美）。ຍ（ny）像西班牙语的 ñ。"),
    tips:{ en:"Say \"sing-ah\" slowly, then drop the \"si-\": \"ng-ah\". Don't turn ງ into n or g.", zh:"先慢慢说“昂—啊”，再去掉“昂”，只保留 ng 的位置。不要发成 n 或 g。" },
    items:[["ງົວ","ngúa","cow","牛"],["ງາມ","ngáam","beautiful","美"],["ເງິນ","ngə́n","money","钱"],["ງ່າຍ","ngàai","easy","容易"],["ຍາວ","nyáao","long","长"],["ຍຸງ","nyúng","mosquito","蚊子"],["ຍິນດີ","nyín-dīi","glad","高兴"],["ງາ","ngáa","sesame","芝麻"],["ນາ","náa","rice field","稻田"]],
    pairs:[["ງາ","ນາ"],["ງາມ","ນາມ"]] },
  { id:"pr-stops", area:"sounds", cefr:"A2", order:5, focus:"stops", glyph:"-ກ -ດ -ບ", t:L3("Final -k, -t, -p: stop, don't release","ຕົວສະກົດ ກ ດ ບ","韵尾 -k、-t、-p：不爆破"),
    explain:L3("Lao syllables can end in ກ (-k), ດ (-t) or ບ (-p), but the sound is never released: close your mouth or tongue and stop, with no puff of air after it. The syllable is cut short.",
      "ຕົວສະກົດ ກ ດ ບ ບໍ່ປ່ອຍລົມອອກ.", "老挝语的音节可以以 ກ(-k)、ດ(-t)、ບ(-p) 结尾，但不爆破：发音部位闭合后马上停住，不送出气流，音节短促。类似粤语、闽南语的入声。"),
    tips:{ en:"Don't say \"nok-uh\". Stop the air at the end of ນົກ, like saying \"book\" and freezing before the k comes out.", zh:"普通话没有入声，容易丢掉韵尾或加上元音。说 ນົກ 时舌根抵住软腭就停住，不要说成“no-ke”。" },
    items:[["ປາກ","pàak","mouth","嘴"],["ນົກ","nók","bird","鸟"],["ເຜັດ","phēt","spicy","辣"],["ມົດ","mót","ant","蚂蚁"],["ແຊບ","sɛ̂ɛp","delicious","好吃"],["ກົບ","kōp","frog","青蛙"],["ຮັກ","hák","love","爱"],["ສິບ","síp","ten","十"],["ກັບ","kāp","with","和"],["ກັດ","kāt","to bite","咬"]],
    pairs:[["ກັບ","ກັດ","ກັກ"],["ສິບ","ສິດ"]] },
  { id:"pr-finals", area:"sounds", cefr:"A2", order:6, focus:"finals", glyph:"-ງ -ນ -ມ", t:L3("Final -ng, -n, -m, -y, -w","ຕົວສະກົດ ງ ນ ມ ຍ ວ","韵尾 -ng、-n、-m、-y、-w"),
    explain:L3("Live endings keep the voice going: ງ (-ng), ນ (-n), ມ (-m), ຍ (-y), ວ (-w). Make the ending clearly: lips closed for ມ, the tip of the tongue up for ນ, the back of the tongue up for ງ.",
      "ຕົວສະກົດ ງ ນ ມ ຍ ວ ໃຫ້ຊັດ.", "响音韵尾让声音延续：ງ(-ng)、ນ(-n)、ມ(-m)、ຍ(-i)、ວ(-u)。ມ 要闭上嘴唇，ນ 舌尖抵上齿龈，ງ 舌根抬起。"),
    tips:{ en:"Finish every word: English speakers often swallow a final ງ or ນ. Hold the ending for a moment.", zh:"普通话没有 -m 韵尾，容易发成 -n：ສາມ（三）结尾一定要闭嘴。" },
    items:[["ກິນ","kīn","to eat","吃"],["ງາມ","ngáam","beautiful","美"],["ຂາຍ","khǎai","to sell","卖"],["ດາວ","dāao","star","星星"],["ຍັງ","nyáng","still, yet","还"],["ຝົນ","fǒn","rain","雨"],["ດື່ມ","dɯ̀ɯm","to drink","喝"],["ສາມ","sǎam","three","三"],["ການ","kāan","work, affair","事务"],["ກາງ","kāang","middle","中间"]],
    pairs:[["ການ","ກາງ"],["ຂາຍ","ຂາວ"],["ສາມ","ສານ"]] },
  { id:"pr-six", area:"tones", cefr:"A1", order:1, focus:"tones", glyph:"ກ່ ກ້", t:L3("Meet the six tones","ຮູ້ຈັກ 6 ວັນນະຍຸດ","认识六个声调"),
    explain:L3("Lao is a tone language: the same syllable on a different pitch is a different word. Vientiane Lao has six tones. Listen to ກາ, ກ່າ, ກ້າ, ມ້າ, ຂາ and ນົກ, then copy the melody of each.",
      "ພາສາລາວວຽງຈັນມີ 6 ວັນນະຍຸດ.", "老挝语是声调语言：同一个音节，音高不同就是不同的词。万象老挝语有六个声调。听 ກາ、ກ່າ、ກ້າ、ມ້າ、ຂາ、ນົກ，模仿每个词的旋律。"),
    tips:{ en:"Use your voice like a melody, not like English stress. Hum the pitch first (mm-mm), then say the word on that melody.", zh:"你已经习惯声调了！但老挝语的调型和普通话不同：不要套用普通话四声，先听、先哼调型，再说词。" },
    items:[["ກາ","kāa","crow","乌鸦"],["ກ່າ","kàa","seedling","秧苗"],["ກ້າ","kâa","brave","勇敢"],["ມ້າ","mâa","horse","马"],["ຂາ","khǎa","leg","腿"],["ນົກ","nók","bird","鸟"]],
    pairs:[["ກາ","ກ່າ","ກ້າ"],["ມາ","ມ້າ"],["ຂາ","ຄາ"]] },
  { id:"pr-class", area:"tones", cefr:"A1", order:2, focus:"tones", glyph:"ຂ ສ ຫ", t:L3("No tone mark: the first letter decides","ບໍ່ມີໄມ້ວັນນະຍຸດ: ພະຍັນຊະນະຕົ້ນກຳນົດ","无声调符号：首辅音决定"),
    explain:L3("When a word has no tone mark, the class of its first letter sets the tone. High-class letters (ຂ ສ ຖ ຜ ຝ ຫ, and ໜ ໝ ຫຼ) give a rising tone; middle and low letters give a level tone on live syllables.",
      "ອັກສອນສູງ (ຂ ສ ຖ ຜ ຝ ຫ) ໃຫ້ສຽງຂຶ້ນ.", "没有声调符号时，由首辅音的类别决定声调。高辅音（ຂ ສ ຖ ຜ ຝ ຫ 以及 ໜ ໝ ຫຼ）在活音节上是升调；中、低辅音是平调。"),
    tips:{ en:"Learn the six high-class letters by heart: ຂ ສ ຖ ຜ ຝ ຫ. Every unmarked live syllable that starts with them rises.", zh:"记住六个高辅音：ຂ ສ ຖ ຜ ຝ ຫ。它们开头的无标活音节都读升调。" },
    items:[["ກາ","kāa","crow","乌鸦"],["ດີ","dīi","good","好"],["ປາ","pāa","fish","鱼"],["ຂາ","khǎa","leg","腿"],["ສີ","sǐi","colour","颜色"],["ໝາ","mǎa","dog","狗"],["ມາ","máa","to come","来"],["ນາ","náa","rice field","稻田"],["ລາວ","láo","Lao; he, she","老挝；他/她"],["ຫົວ","hǔa","head","头"]],
    pairs:[["ໝາ","ມາ"],["ຂາ","ຄາ"],["ສອງ","ຊອງ"]] },
  { id:"pr-marks", area:"tones", cefr:"A2", order:3, focus:"tones", glyph:"◌່ ◌້", t:L3("Tone marks ◌່ and ◌້","ໄມ້ເອກ ແລະ ໄມ້ໂທ","声调符号 ◌່ 和 ◌້"),
    explain:L3("ໄມ້ເອກ (◌່) makes a low tone. ໄມ້ໂທ (◌້) makes a falling tone: on middle and high letters a low-mid fall (ເຂົ້າ, ຂ້ອຍ), on low letters a high fall (ມ້າ, ນ້ຳ).",
      "ໄມ້ເອກ ໃຫ້ສຽງຕ່ຳ, ໄມ້ໂທ ໃຫ້ສຽງລົງ.", "ໄມ້ເອກ（◌່）是低调。ໄມ້ໂທ（◌້）是降调：中、高辅音读中低降（ເຂົ້າ、ຂ້ອຍ），低辅音读高降（ມ້າ、ນ້ຳ）。"),
    tips:{ en:"◌້ on a low letter (ມ້າ, ນ້ຳ) starts high and drops quickly, like a firm \"No!\".", zh:"低辅音加 ◌້（ມ້າ、ນ້ຳ）有点像普通话第四声，但起点更高、收得更短。" },
    items:[["ແມ່","mɛ̀ɛ","mother","母亲"],["ບໍ່","bɔ̀ɔ","not","不"],["ໄກ່","kài","chicken","鸡"],["ຂ້ອຍ","khɔ̂ɔi","I, me","我"],["ເຂົ້າ","khâo","rice","米饭"],["ເຈົ້າ","jâo","you","你"],["ນ້ຳ","nâm","water","水"],["ມ້າ","mâa","horse","马"],["ປ່າ","pàa","forest","森林"],["ປ້າ","pâa","aunt","姑妈"]],
    pairs:[["ປາ","ປ່າ","ປ້າ"],["ເສືອ","ເສື້ອ"],["ໝາ","ມ້າ"]] },
  { id:"pr-checked", area:"tones", cefr:"A2", order:4, focus:"tones", glyph:"ນົກ", t:L3("Short and stopped syllables","ພະຍາງຕາຍ","短促的“死音节”"),
    explain:L3("A syllable that ends in a stop (-k, -t, -p) or a short vowel is \"dead\". Low letters with a short vowel give a high, short tone (ນົກ, ຮັກ); low letters with a long vowel give a high fall (ລູກ, ມີດ); middle and high letters give a low tone (ເຜັດ, ປາກ).",
      "ພະຍາງຕາຍ ລົງທ້າຍດ້ວຍ ກ ດ ບ ຫຼື ສະຫຼະສັ້ນ.", "以塞音（-k、-t、-p）或短元音结尾的是“死音节”。低辅音+短元音读高短调（ນົກ、ຮັກ）；低辅音+长元音读高降调（ລູກ、ມີດ）；中、高辅音读低调（ເຜັດ、ປາກ）。"),
    tips:{ en:"Keep these syllables short and clipped; don't let the pitch wander after the stop.", zh:"这些音节要短促，塞音之后不要拖音。" },
    items:[["ນົກ","nók","bird","鸟"],["ຮັກ","hák","love","爱"],["ມົດ","mót","ant","蚂蚁"],["ລູກ","lûuk","child","孩子"],["ມີດ","mîit","knife","刀"],["ເຜັດ","phēt","spicy","辣"],["ປາກ","pàak","mouth","嘴"],["ໝາກ","màak","fruit","果"],["ຕັດ","tát","to cut","剪"],["ສິບ","síp","ten","十"]],
    pairs:[["ມິດ","ມີດ"],["ຮັກ","ຫັກ"]] },
  { id:"pr-words", area:"tones", cefr:"B1", order:5, focus:"words", glyph:"ສະບາຍດີ", t:L3("Tones in longer words","ວັນນະຍຸດໃນຄຳຍາວ","多音节词的声调"),
    explain:L3("In words of two or more syllables, every syllable keeps its own tone. Say each syllable's tone clearly, then join them smoothly; the last syllable is usually a little stronger.",
      "ທຸກພະຍາງຮັກສາວັນນະຍຸດຂອງມັນ.", "多音节词中每个音节都保持自己的声调。先把每个音节的声调说准，再连起来；最后一个音节通常稍重。"),
    tips:{ en:"Don't put English word stress on the first syllable; give each syllable its own melody.", zh:"不要把后一个音节读成轻声，每个音节都要有完整的声调。" },
    items:[["ສະບາຍດີ","sá-bāai-dīi","hello","你好"],["ຂອບໃຈ","khɔ̀ɔp-jāi","thank you","谢谢"],["ຕະຫຼາດ","tá-làat","market","市场"],["ໂຮງຮຽນ","hóong-hían","school","学校"],["ພາສາ","pháa-sǎa","language","语言"],["ຄອບຄົວ","khɔ̂ɔp-khúa","family","家庭"],["ມື້ນີ້","mɯ̂ɯ-nîi","today","今天"],["ກິນເຂົ້າ","kīn-khâo","to eat a meal","吃饭"],["ລາຄາ","láa-khāa","price","价格"],["ສີແດງ","sǐi-dɛ̄ɛng","red","红色"]],
    pairs:[["ໃກ້","ໄກ"],["ເສືອ","ເສື້ອ"]] },
  { id:"pr-particles", area:"connected", cefr:"B1", order:1, focus:"particles", glyph:"ບໍ ເດີ", t:L3("Questions and friendly endings","ຄຳຖາມ ແລະ ຄຳລົງທ້າຍ","问句与句尾语气词"),
    explain:L3("Sentence-final words carry the feeling. ບໍ turns a sentence into a yes/no question; ເດີ makes it warm and friendly; ແດ່ softens a request. Lao doesn't raise the whole sentence for a question: each word keeps its tone and the ending does the work.",
      "ບໍ ເປັນຄຳຖາມ, ເດີ ເປັນມິດ, ແດ່ ສຸພາບ.", "句末小品词表达语气：ບໍ 把句子变成是非问句；ເດີ 让语气亲切；ແດ່ 使请求委婉。老挝语问句不靠整句上扬，每个词保持自己的声调。"),
    tips:{ en:"Don't raise the pitch of the whole sentence to ask a question as in English; keep each word's tone and let ບໍ do the work.", zh:"和汉语一样，问句靠句末词（ບໍ≈吗），不要整句上扬。" },
    items:[["ເຈົ້າສະບາຍດີບໍ","","How are you?","你好吗？"],["ໄປກ່ອນເດີ","","I'm off now, okay?","我先走了哦。"],["ຂໍນ້ຳແດ່","","Some water, please.","请给我水。"],["ກິນເຂົ້າແລ້ວບໍ","","Have you eaten?","吃饭了吗？"],["ຂອບໃຈຫຼາຍໆ","","Thank you very much.","非常感谢。"],["ແຊບຫຼາຍ","","Very tasty!","很好吃！"]],
    pairs:[] },
  { id:"pr-shadow", area:"connected", cefr:"B1", order:2, focus:"shadow", glyph:"ຟັງ ເວົ້າ", t:L3("Shadowing everyday sentences","ເວົ້າຕາມປະໂຫຍກປະຈຳວັນ","跟读日常句子"),
    explain:L3("Shadowing: listen to a sentence, then say it right after the speaker with the same melody and speed. It trains tones, rhythm and fluency together. Start slowly, then try at normal speed.",
      "ຟັງ ແລ້ວເວົ້າຕາມທັນທີດ້ວຍທຳນອງດຽວກັນ.", "跟读（影子跟读）：听一句，紧接着用同样的旋律和速度说出来。能同时练声调、节奏和流利度。先慢速，再常速。"),
    tips:{ en:"Don't wait to understand every word: copy the sound first, the meaning second.", zh:"先模仿声音，再理解意思。" },
    items:[["ຂ້ອຍຮຽນພາສາລາວ","","I study Lao.","我学老挝语。"],["ຕະຫຼາດຢູ່ໃສ","","Where is the market?","市场在哪里？"],["ອັນນີ້ລາຄາເທົ່າໃດ","","How much is this?","这个多少钱？"],["ຂ້ອຍຢາກກິນເຝີ","","I want to eat pho.","我想吃米粉汤。"],["ມື້ນີ້ຮ້ອນຫຼາຍ","","It's very hot today.","今天很热。"],["ຫ້ອງນ້ຳຢູ່ໃສ","","Where is the toilet?","厕所在哪里？"]],
    pairs:[] },
  { id:"pr-dialogue", area:"connected", cefr:"B2", order:3, focus:"shadow", glyph:"ສົນທະນາ", t:L3("Shadowing a real conversation","ເວົ້າຕາມບົດສົນທະນາ","跟读真实对话"),
    explain:L3("Take the part of each speaker in a real conversation: listen to the line, then say it with the same tones, rhythm and feeling. The lines come from the dialogues your teacher has published.",
      "ເວົ້າຕາມແຕ່ລະແຖວຂອງບົດສົນທະນາ.", "扮演真实对话中的每个角色：听一句，再用同样的声调、节奏和感情说出来。句子来自老师发布的对话。"),
    tips:{ en:"Act it out: real conversations have feeling. Imitate the speaker's energy as well as the words.", zh:"像演戏一样说出来：模仿说话人的情绪和语气，而不仅仅是词语。" },
    items:[["ສະບາຍດີ, ເຈົ້າສະບາຍດີບໍ","","Hello! How are you?","你好！你好吗？"],["ຂ້ອຍສະບາຍດີ, ຂອບໃຈ","","I'm fine, thank you.","我很好，谢谢。"],["ເຈົ້າຊື່ຫຍັງ","","What's your name?","你叫什么名字？"],["ຂ້ອຍຊື່ແກ້ວ","","My name is Keo.","我叫Keo。"]],
    pairs:[], fromDialogues:true }
];

// ---------- the course: built-in units + the teacher's (Admin → Pronunciation units) ----------
const toItem = x => Array.isArray(x) ? x : [x.lao || x.zh || "", x.py || x.rom || "", x.en || "", x.zhMean || x.cn || ""];
export function normaliseUnit(u){
  return Object.assign({ area:"sounds", cefr:"A1", order:99, focus:"words", glyph:"", tips:{}, items:[], pairs:[] }, u, {
    t: u.t || u.title || L3(u.id, u.id, u.id), explain: u.explain || L3("","",""),
    items: (u.items || []).map(toItem).filter(x => x[0]),
    pairs: (u.pairs || []).map(p => Array.isArray(p) ? p : String(p.words || p).split(/[|,;\s]+/)).map(p => p.filter(Boolean)).filter(p => p.length >= 2) });
}
export function buildCourse(admin = [], { dialogues = [] } = {}){
  const byId = new Map(UNITS.map(u => [u.id, normaliseUnit(u)]));
  for (const a of admin || []){ if (!a || !a.id) continue; if (a.hide){ byId.delete(a.id); continue; } byId.set(a.id, normaliseUnit(Object.assign({}, byId.get(a.id) || {}, a))); }
  const lines = (dialogues || []).flatMap(d => (d.lines || []).filter(l => l && l.zh).map(l => [l.zh, l.py || "", (l.tr && l.tr.en) || "", (l.tr && l.tr.zh) || ""])).slice(0, 10);
  const units = [...byId.values()].map(u => u.fromDialogues && lines.length >= 3 ? Object.assign({}, u, { items: lines }) : u);
  const areaIdx = k => Math.max(0, AREAS.findIndex(a => a.key === k));
  return units.sort((a, b) => areaIdx(a.area) - areaIdx(b.area) || CEFR.indexOf(a.cefr) - CEFR.indexOf(b.cefr) || (a.order || 0) - (b.order || 0));
}
// meaning of a Lao word for the listening step: from the unit's items, then from any unit
// words that only appear in the listening pairs
const PAIR_WORDS = { "ຄູ":["khúu","teacher","老师"], "ມີ":["míi","to have","有"], "ແປດ":["pɛ̀ɛt","eight","八"], "ເປັດ":["pēt","duck","鸭子"], "ນາມ":["náam","name (formal), noun","名称"],
  "ກັກ":["kāk","to hold back","扣留"], "ສິດ":["sít","a right","权利"], "ຂາວ":["khǎao","white","白"], "ສານ":["sǎan","court of law","法院"], "ມາ":["máa","to come","来"], "ຄາ":["kháa","stuck","卡住"],
  "ຊອງ":["sɔ́ɔng","envelope","信封"], "ສອງ":["sɔ̌ɔng","two","二"], "ເສືອ":["sɯ̌a","tiger","老虎"], "ເສື້ອ":["sɯ̂a","shirt","衬衫"], "ຫັກ":["hák","to break","折断"], "ໃກ້":["kâi","near","近"],
  "ໄກ":["kǎi","far","远"], "ປາ":["pāa","fish","鱼"], "ປ່າ":["pàa","forest","森林"], "ປ້າ":["pâa","aunt","姑妈"], "ໝາ":["mǎa","dog","狗"], "ມ້າ":["mâa","horse","马"], "ກ່າ":["kàa","seedling","秧苗"] };
export function meaningOf(course, w){ for (const u of course) for (const it of u.items) if (it[0] === w) return { py: it[1], en: it[2], zh: it[3] };
  const p = PAIR_WORDS[w]; return p ? { py: p[0], en: p[1], zh: p[2] } : null; }

// ---------- the learner's pronunciation profile: js/shared/pron-profile.js ----------
export { pronInit, pronRecord, unitStars, nextUnit, weakSpots } from "./pron-profile.js";

// The accent check: 8 listening items over the main areas, and 4 words to say (one per common tone pattern)
export function accentCheck(course, rand = Math.random){
  const pick = a => a[Math.floor(rand() * a.length)];
  const listen = [];
  for (const id of ["pr-length","pr-aspiration","pr-stops","pr-finals","pr-vowels","pr-six","pr-marks","pr-class"]){ const u = course.find(x => x.id === id); if (u && u.pairs.length) listen.push({ unit:u.id, focus:u.focus, pair:pick(u.pairs) }); }
  const speak = ["ຂາ","ມ້າ","ນົກ","ເຂົ້າ"].map(w => ({ unit:"pr-six", focus:"tones", word:w }));
  return { listen, speak };
}
