// Automated Stress Test: Simulates real user adding, saving, updating, duplicating, and deleting across EVERY content table
import { createLocalApi } from "../js/api/local.js";
import { importSeed } from "../js/shared/setup.js";
import { CONTENT_TYPES, saveContent } from "../js/shared/content.js";
import fs from "fs";

global.window = {
  addEventListener: () => {},
  scrollTo: () => {},
  location: { hash: "", protocol: "http:" },
  localStorage: {
    data: {},
    getItem(k) { return this.data[k] || null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
  }
};
global.localStorage = global.window.localStorage;
global.location = global.window.location;
global.document = { createElement: () => ({ append: () => {}, setAttribute: () => {} }) };

global.fetch = async (url) => {
  const p = String(url).replace("file://", "").split("?")[0];
  let filePath = p;
  if (p.includes("data/seed.json")) filePath = "data/seed.json";
  else if (p.includes("data/dictionary.json")) filePath = "data/dictionary.json";
  else if (p.includes("data/chars.json")) filePath = "data/chars.json";
  else if (p.includes("data/strokes.json")) filePath = "data/strokes.json";

  if (fs.existsSync(filePath)) {
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(filePath, "utf8")) };
  }
  return { ok: false, status: 404 };
};

async function runLiveCrudStress() {
  console.log("=========================================================================");
  console.log("STARTING LIVE USER SIMULATION: ADD, SAVE, EDIT, DUPLICATE ON EVERY TABLE");
  console.log("=========================================================================\n");

  const api = await createLocalApi();
  await importSeed(api, "user-tester-admin");

  const randomSamples = {
    lessons: {
      id: "lesson-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      level: 1,
      topic: "Ordering Lao Coffee",
      title: { en: "Morning Coffee at Sinouk", lo: "ດື່ມກາເຟຕອນເຊົ້າ", zh: "早晨喝咖啡" },
      desc: { en: "How to order Lao iced coffee with condensed milk.", lo: "ວິທີສັ່ງກາເຟໂບຮານໃສ່ນົມ." },
      vocab: ["ກາເຟ", "ນົມ", "ເຢັນ", "ຈອກ"],
      status: "published",
      access: "free"
    },
    patterns: {
      id: "p-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      n: 888,
      sec: "B",
      hz: "ຂ້ອຍມັກ…",
      py: "khɔ̀ɔi màk…",
      formula: "S + ມັກ + V/N",
      level: 1,
      tr: { en: { meaning: "I like to do something" }, lo: { meaning: "ຂ້ອຍມັກເຮັດສິ່ງໃດໜຶ່ງ" } },
      status: "published",
      access: "free"
    },
    grammar: {
      id: "g-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      level: 1,
      title: { en: "Negative particle: ບໍ່ (bɔ̀ɔ)", lo: "ຄຳປະຕິເສດ: ບໍ່", zh: "否定词：ບໍ່" },
      structure: "S + ບໍ່ + V",
      tr: { en: { explain: "Place ບໍ່ before the verb to make it negative." }, lo: { explain: "ວາງ ບໍ່ ໄວ້ໜ້າຄຳກຳມະ." } },
      status: "published",
      access: "free"
    },
    vocabulary: {
      id: "ໝາກພ້າວ-" + Math.floor(Math.random() * 9000 + 1000),
      hz: "ໝາກພ້າວ",
      py: "màak-phâao",
      pos: "n",
      level: 1,
      tr: { en: { meaning: "coconut" }, lo: { meaning: "ໝາກໄມ້ຊະນິດໜຶ່ງ" } },
      status: "published",
      access: "free"
    },
    dialogues: {
      id: "d-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      level: 1,
      title: { en: "Buying sticky rice", lo: "ການຊື້ເຂົ້າໜຽວ", zh: "买糯米饭" },
      lines: [
        { speaker: "Buyer", zh: "ເອື້ອຍ, ຂໍເຂົ້າໜຽວຕິບໜຶ່ງ.", en: "Sister, please give me one basket of sticky rice." },
        { speaker: "Seller", zh: "10,000 ກີບເດີ້.", en: "10,000 Kip please." }
      ],
      status: "published",
      access: "free"
    },
    quizzes: {
      id: "q-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      level: 1,
      title: { en: "Drink Quiz", lo: "ແບບທົດສອບເຄື່ອງດື່ມ", zh: "饮料测验" },
      questions: [
        { type: "choice", q: "What is coffee in Lao?", a: "ກາເຟ", choices: ["ກາເຟ", "ຊາ", "ນ້ຳ", "ເບຍ"] }
      ],
      status: "published",
      access: "free"
    },
    videos: {
      id: "v-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      level: 1,
      title: { en: "Night Market Street Food", lo: "ອາຫານແຄມທາງຕະຫຼາດກາງຄືນ", zh: "夜市街头美食" },
      embedUrl: "https://www.youtube.com/embed/sample999",
      difficulty: "Stage 1",
      status: "published",
      access: "free"
    },
    tones: {
      id: "tone-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      num: 7,
      name: { en: "Test Tone", lo: "ສຽງທົດສອບ", zh: "测试声调" },
      contour: "44",
      color: "#10b981",
      status: "published",
      access: "free"
    },
    culture: {
      id: "cul-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      category: "etiquette",
      title: { en: "Passing objects with two hands", lo: "ການຍື່ນເຄື່ອງດ້ວຍສອງມື", zh: "双手递物礼仪" },
      desc: { en: "Always use both hands when handing objects to elders or monks.", lo: "ຄວນໃຊ້ສອງມືເມື່ອສົ່ງເຄື່ອງໃຫ້ຜູ້ໃຫຍ່." },
      status: "published",
      access: "free"
    },
    characters: {
      id: "char-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      char: "ຂ",
      name: "Khai",
      meaning: "Egg",
      class: "high",
      strokeCount: 1,
      status: "published",
      access: "free"
    },
    dictionary: {
      id: "dict-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      hz: "ເຂົ້າຈີ່",
      p: "khào-jīi",
      pos: "n",
      en: "Lao baguette sandwich",
      lo: "ເຂົ້າຈີ່ປາເຕ້",
      status: "published",
      access: "free"
    },
    audio: {
      id: "a-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      text: "ສະບາຍດີຕອນແລງ",
      type: "sentence",
      speaker: "native",
      url: "https://example.com/audio/sample.mp3",
      status: "published",
      access: "free"
    },
    lexicon: {
      id: "LEX_RND_" + Math.floor(Math.random() * 9000 + 1000),
      cat: "SNACKS",
      data: [{ z: "ໝາກກ້ວຍຈືນ", e: "fried banana" }],
      status: "published",
      access: "free"
    },
    paths: {
      id: "path-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      kind: "topic",
      title: { en: "Market Explorer", lo: "ນັກສຳຫຼວດຕະຫຼາດ", zh: "市场探索" },
      steps: [{ type: "lesson", id: "hsk1-greetings" }],
      status: "published",
      access: "free"
    },
    releases: {
      id: "rel-rnd-" + Math.floor(Math.random() * 9000 + 1000),
      date: "2026-10-01",
      title: { en: "October Curriculum Update", lo: "ການອັບເດດເດືອນຕຸລາ" },
      notes: { en: "Added street food lessons and new market dialogue audio." },
      status: "published",
      access: "free"
    }
  };

  let tested = 0;
  for (const ty of CONTENT_TYPES) {
    const sample = randomSamples[ty];
    if (!sample) continue;

    console.log(`Testing Collection: [${ty.toUpperCase()}]`);

    // 1. SAVE / CREATE
    await saveContent(api, ty, sample.id, sample, "test-user-uid");
    const retrieved = await api.db.get(`${ty}/${sample.id}`);
    if (!retrieved || retrieved.id !== sample.id) {
      throw new Error(`[FAIL] Table ${ty}: Record failed to save in database!`);
    }

    // 2. UPDATE
    const updatedSample = Object.assign({}, retrieved, {
      updatedNote: "Verified live edit",
      updatedAt: new Date()
    });
    await api.db.set(`${ty}/${sample.id}`, updatedSample, true);
    const verifiedUpdate = await api.db.get(`${ty}/${sample.id}`);
    if (!verifiedUpdate || verifiedUpdate.updatedNote !== "Verified live edit") {
      throw new Error(`[FAIL] Table ${ty}: Update operation failed!`);
    }

    // 3. DUPLICATE (Copy)
    const dupId = sample.id + "-copy-live";
    const dupDoc = Object.assign({}, verifiedUpdate, { id: dupId, status: "draft" });
    await api.db.set(`${ty}/${dupId}`, dupDoc);
    const verifiedDup = await api.db.get(`${ty}/${dupId}`);
    if (!verifiedDup || verifiedDup.id !== dupId) {
      throw new Error(`[FAIL] Table ${ty}: Duplicate operation failed!`);
    }

    // 4. CLEANUP DUPLICATE
    await api.db.del(`${ty}/${dupId}`);
    const afterDel = await api.db.get(`${ty}/${dupId}`);
    if (afterDel !== null) {
      throw new Error(`[FAIL] Table ${ty}: Deletion failed!`);
    }

    console.log(`  -> CREATE: PASS (id: ${sample.id})`);
    console.log(`  -> READ:   PASS (table: ${ty})`);
    console.log(`  -> EDIT:   PASS (field updated)`);
    console.log(`  -> COPY:   PASS (duplicated to ${dupId} then deleted)`);
    console.log(`  -> TABLE:  [${ty}] is 100% FUNCTIONAL\n`);
    tested++;
  }

  console.log("=========================================================================");
  console.log(`ALL ${tested} / ${CONTENT_TYPES.length} TABLES VERIFIED: CREATE, EDIT, COPY & DELETE WORK 100%!`);
  console.log("=========================================================================");
}

runLiveCrudStress().catch(err => {
  console.error("FATAL ERROR IN CRUD STRESS TEST:", err);
  process.exit(1);
});
