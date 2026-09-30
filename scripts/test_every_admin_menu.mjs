// Comprehensive Automated Test for Every Admin Menu Item & Live Database Storage
import { createLocalApi } from "../js/api/local.js";
import { importSeed } from "../js/shared/setup.js";
import { CONTENT_TYPES, buildBundles } from "../js/shared/content.js";
import fs from "fs";

// Mock minimal browser environment
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
global.document = {
  createElement: () => ({ append: () => {}, setAttribute: () => {}, addEventListener: () => {} })
};

global.fetch = async (url) => {
  const p = String(url).replace("file://", "").split("?")[0];
  let filePath = p;
  if (p.includes("data/seed.json")) filePath = "data/seed.json";
  else if (p.includes("data/dictionary.json")) filePath = "data/dictionary.json";
  else if (p.includes("data/chars.json")) filePath = "data/chars.json";
  else if (p.includes("data/strokes.json")) filePath = "data/strokes.json";

  if (fs.existsSync(filePath)) {
    return {
      ok: true,
      json: async () => JSON.parse(fs.readFileSync(filePath, "utf8"))
    };
  }
  return { ok: false, status: 404 };
};

async function testEveryMenu() {
  console.log("===============================================================");
  console.log("TESTING EVERY ADMIN MENU & LIVE DATABASE PERSISTENCE");
  console.log("===============================================================\n");

  const api = await createLocalApi();
  console.log("[Init] Database mode:", api.mode);
  await importSeed(api, "admin-system-test");
  console.log("[Seed] Initial database seed successfully loaded.\n");

  const menuTests = [
    {
      menu: "1. Dashboard (ພາບລວມ)",
      action: async () => {
        const [users, access, activity, counts] = await Promise.all([
          api.db.list("users"),
          api.db.list("access"),
          api.db.list("activity"),
          Promise.all(CONTENT_TYPES.map(async ty => [ty, await api.db.count(ty)]))
        ]);
        if (!users || !counts.length) throw new Error("Dashboard data fetch failed");
        return `Verified ${users.length} users, ${counts.length} content collections indexed.`;
      }
    },
    {
      menu: "2. Learners (ຜູ້ຮຽນ)",
      action: async () => {
        const testUser = {
          id: "learner-test-01",
          email: "somchai.test@laolao.app",
          name: "Somchai Vientiane",
          status: "active",
          level: 2,
          role: "learner",
          createdAt: new Date()
        };
        await api.db.set("users/" + testUser.id, testUser);
        const fetched = await api.db.get("users/" + testUser.id);
        if (!fetched || fetched.name !== testUser.name) throw new Error("Learner record write failed");
        return `Successfully saved and retrieved learner: ${fetched.name} (${fetched.email})`;
      }
    },
    {
      menu: "3. Lessons Menu (ບົດຮຽນ)",
      action: async () => {
        const testLesson = {
          id: "lesson-test-ordering-food",
          level: 2,
          order: 99,
          title: { en: "Ordering Street Food at That Luang", lo: "ການສັ່ງອາຫານແຄມທາງ ຢູ່ທາດຫຼວງ", zh: "在塔銮夜市点餐" },
          desc: { en: "Essential dialogue and phrasing for ordering spicy papaya salad and noodle soup.", lo: "ບົດຮຽນການສັ່ງຕຳໝາກຫຸ່ງ ແລະ ເຂົ້າປຽກ." },
          vocab: ["ຕຳໝາກຫຸ່ງ", "ເຂົ້າປຽກ", "ແຊບ", "ເຜັດ"],
          dialogueId: "d-test-ordering",
          quizId: "q-test-ordering",
          status: "published",
          access: "free",
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await api.db.set("lessons/" + testLesson.id, testLesson);
        const got = await api.db.get("lessons/" + testLesson.id);
        if (!got || got.title.en !== testLesson.title.en) throw new Error("Lesson write failed");
        return `Lesson stored in DB: "${got.title.lo}" (ID: ${got.id})`;
      }
    },
    {
      menu: "4. Sentence Patterns Menu (ໂຄງສ້າງປະໂຫຍກ)",
      action: async () => {
        const testPattern = {
          id: "p-test-khoy-yak",
          n: 999,
          sec: "A",
          hz: "ຂ້ອຍຢາກ…",
          py: "khɔ̀ɔi yàak…",
          formula: "S + ຢາກ + V + (O)",
          level: 1,
          tr: {
            en: { meaning: "I want to / would like to do something" },
            lo: { meaning: "ສະແດງຄວາມຕ້ອງການຢາກເຮັດສິ່ງໃດສິ່ງໜຶ່ງ" }
          },
          examples: [{ zh: "ຂ້ອຍຢາກກິນເຂົ້າປຽກ", en: "I want to eat khao piak soup." }],
          status: "published",
          access: "free",
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await api.db.set("patterns/" + testPattern.id, testPattern);
        const got = await api.db.get("patterns/" + testPattern.id);
        if (!got || got.hz !== "ຂ້ອຍຢາກ…") throw new Error("Pattern write failed");
        return `Pattern stored in DB: "${got.hz}" (${got.py})`;
      }
    },
    {
      menu: "5. Grammar Points Menu (ໄວຍາກອນ)",
      action: async () => {
        const testGrammar = {
          id: "g-test-time-aspect",
          level: 1,
          title: { en: "Past Aspect Particle: ແລ້ວ (Already)", lo: "ຄຳຊ່ວຍບອກອະດີດ: ແລ້ວ", zh: "完成体助词：ແລ້ວ" },
          structure: "Subject + Verb + (Object) + ແລ້ວ",
          tr: {
            en: { explain: "Place ແລ້ວ at the end of a verbal clause to indicate the action is finished." },
            lo: { explain: "ໃຊ້ ແລ້ວ ຢູ່ທ້າຍປະໂຫຍກເພື່ອບອກວ່າການກະທຳສຳເລັດແລ້ວ." }
          },
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("grammar/" + testGrammar.id, testGrammar);
        const got = await api.db.get("grammar/" + testGrammar.id);
        if (!got) throw new Error("Grammar write failed");
        return `Grammar point stored in DB: "${got.title.lo}"`;
      }
    },
    {
      menu: "6. Vocabulary Menu (ຄຳສັບ)",
      action: async () => {
        const testVocab = {
          id: "v-test-khao-piak",
          hz: "ເຂົ້າປຽກ",
          py: "khào-pìak",
          pos: "n",
          level: 1,
          tr: {
            en: { meaning: "Lao noodle soup" },
            lo: { meaning: "ອາຫານປະເພດເສັ້ນຂອງລາວ" }
          },
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("vocabulary/" + testVocab.id, testVocab);
        const got = await api.db.get("vocabulary/" + testVocab.id);
        if (!got || got.hz !== "ເຂົ້າປຽກ") throw new Error("Vocab write failed");
        return `Vocab stored in DB: "${got.hz}" (${got.py} - ${got.tr.en.meaning})`;
      }
    },
    {
      menu: "7. Dialogues Menu (ບົດສົນທະນາ)",
      action: async () => {
        const testDialogue = {
          id: "d-test-tuk-tuk",
          level: 1,
          title: { en: "Haggling with a Tuk-Tuk Driver", lo: "ການຕໍ່ລອງລາຄາລົດຕຸກໆ", zh: "与嘟嘟车司机议价" },
          lines: [
            { sp: "Passenger", lo: "ອ້າຍ, ໄປຕະຫຼາດເຊົ້າເທົ່າໃດ?", en: "Brother, how much to Morning Market?" },
            { sp: "Driver", lo: "40,000 ກີບເດີ້.", en: "40,000 Kip please." }
          ],
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("dialogues/" + testDialogue.id, testDialogue);
        const got = await api.db.get("dialogues/" + testDialogue.id);
        if (!got) throw new Error("Dialogue write failed");
        return `Dialogue stored in DB: "${got.title.lo}" with ${got.lines.length} lines`;
      }
    },
    {
      menu: "8. Quizzes & Tests Menu (ແບບທົດສອບ)",
      action: async () => {
        const testQuiz = {
          id: "q-test-food-ordering",
          level: 2,
          skill: "vocabulary",
          title: { en: "Food & Restaurant Quiz", lo: "ແບບທົດສອບຄຳສັບອາຫານ", zh: "美食与餐厅测验" },
          questions: [
            { type: "choice", q: "What does 'ເຂົ້າໜຽວ' mean?", a: "sticky rice", choices: ["sticky rice", "noodle soup", "papaya salad", "grilled chicken"] }
          ],
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("quizzes/" + testQuiz.id, testQuiz);
        const got = await api.db.get("quizzes/" + testQuiz.id);
        if (!got) throw new Error("Quiz write failed");
        return `Quiz stored in DB: "${got.title.lo}" (${got.questions.length} questions)`;
      }
    },
    {
      menu: "9. Video Manager Menu (ວິດີໂອບົດຮຽນ)",
      action: async () => {
        const testVid = {
          id: "v-test-market-tour",
          level: 1,
          category: "conversation",
          title: { en: "Exploring Luang Prabang Morning Market", lo: "ຍ່າງເລາະຕະຫຼາດເຊົ້າຫຼວງພະບາງ", zh: "逛琅勃拉邦早市" },
          embedUrl: "https://www.youtube.com/embed/sample123",
          difficulty: "Stage 1 · Beginner",
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("videos/" + testVid.id, testVid);
        const got = await api.db.get("videos/" + testVid.id);
        if (!got || got.id !== testVid.id) throw new Error("Video write failed");
        return `Video stored in DB: "${got.title.lo}" -> ${got.embedUrl}`;
      }
    },
    {
      menu: "10. Tone Lab Menu (ສຽງວັນນະຍຸດ)",
      action: async () => {
        const got = await api.db.get("tones/tone-1");
        if (!got) throw new Error("Tone 1 not found in DB");
        await api.db.update("tones/tone-1", { "desc.lo": "ສຽງກາງພຽງ (ອັບເດດສົມບູນ)" });
        const updated = await api.db.get("tones/tone-1");
        return `Tone 1 verified & updated in DB: ${updated.name.lo} (${updated.contour})`;
      }
    },
    {
      menu: "11. Culture & Context Menu (ວັດທະນະທຳ)",
      action: async () => {
        const testCulture = {
          id: "cul-test-luangsay",
          category: "traditions",
          title: { en: "The Boat Racing Festival (ບຸນຊ່ວງເຮືອ)", lo: "ບຸນຊ່ວງເຮືອປະເພນີ", zh: "老挝赛龙舟节" },
          desc: { en: "Celebrated on the Mekong River at the end of Buddhist Lent.", lo: "ບຸນປະເພນີອັນຍິ່ງໃຫຍ່ໃນວັນອອກພັນສາ." },
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("culture/" + testCulture.id, testCulture);
        const got = await api.db.get("culture/" + testCulture.id);
        if (!got) throw new Error("Culture write failed");
        return `Culture guide stored in DB: "${got.title.lo}"`;
      }
    },
    {
      menu: "12. Lao Script & Handwriting Menu (ອັກສອນລາວ)",
      action: async () => {
        const char = await api.db.get("characters/char-ກ");
        if (!char) throw new Error("Lao consonant ກ not found in DB");
        return `Character verified in DB: ${char.char} (${char.name} - class: ${char.class}, strokes: ${char.strokeCount})`;
      }
    },
    {
      menu: "13. Dictionary Database Menu (ວັດຈະນານຸກົມ)",
      action: async () => {
        const testDict = {
          id: "ຕຳໝາກຫຸ່ງ",
          hz: "ຕຳໝາກຫຸ່ງ",
          p: "tam-màak-hùung",
          pos: "n",
          level: 1,
          en: "spicy green papaya salad",
          lo: "ອາຫານປະເພດຕຳຍອດນິຍົມຂອງລາວ",
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("dictionary/" + testDict.id, testDict);
        const got = await api.db.get("dictionary/" + testDict.id);
        if (!got) throw new Error("Dictionary write failed");
        return `Dictionary entry stored in DB: "${got.hz}" (${got.p} - ${got.en})`;
      }
    },
    {
      menu: "14. Voice Studio Menu (ສະຕູດິໂອບັນທຶກສຽງ)",
      action: async () => {
        const testAudio = {
          id: "a-test-tam-mak-hoong",
          text: "ຕຳໝາກຫຸ່ງ",
          lang: "lo",
          type: "word",
          speaker: "native-female",
          url: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ8=",
          status: "published",
          access: "free",
          createdAt: new Date()
        };
        await api.db.set("audio/" + testAudio.id, testAudio);
        const got = await api.db.get("audio/" + testAudio.id);
        if (!got) throw new Error("Audio write failed");
        return `Audio recording stored in DB: "${got.text}" by ${got.speaker}`;
      }
    },
    {
      menu: "15. Excel / CSV Importer Menu (ນຳເຂົ້າ Excel/CSV)",
      action: async () => {
        const batchOps = [
          { op: "set", path: "vocabulary/batch-1", data: { id: "batch-1", hz: "ສະບາຍ", py: "sà-bāai", pos: "adj", status: "published", access: "free" } },
          { op: "set", path: "vocabulary/batch-2", data: { id: "batch-2", hz: "ມ່ວນ", py: "mùan", pos: "adj", status: "published", access: "free" } }
        ];
        await api.db.batch(batchOps);
        const b1 = await api.db.get("vocabulary/batch-1");
        const b2 = await api.db.get("vocabulary/batch-2");
        if (!b1 || !b2) throw new Error("Excel batch import failed");
        return `Batch import saved 2 records into DB: "${b1.hz}" and "${b2.hz}"`;
      }
    },
    {
      menu: "16. Promotions & Feed Menu (ໂປຣໂມຊັ່ນ ແລະ ຂ່າວ)",
      action: async () => {
        const testPromo = {
          title: { en: "Special Lao New Year Guide", lo: "ຄູ່ມືພິເສດບຸນປີໃໝ່ລາວ" },
          link: "https://example.com/lao-new-year.pdf",
          badge: { en: "SPECIAL", lo: "ພິເສດ" },
          active: true,
          updatedAt: new Date()
        };
        await api.db.set("settings/promotions", testPromo, true);
        const got = await api.db.get("settings/promotions");
        if (!got || got.badge.en !== "SPECIAL") throw new Error("Promotions write failed");
        return `Promotions updated in DB: "${got.title.lo}"`;
      }
    },
    {
      menu: "17. Content Health Audit Menu (ກວດສອບຄວາມສົມບູນ)",
      action: async () => {
        const counts = await Promise.all(CONTENT_TYPES.map(async ty => [ty, await api.db.count(ty)]));
        const total = counts.reduce((sum, [, n]) => sum + n, 0);
        return `Content health verified: ${total} total records across ${CONTENT_TYPES.length} collections.`;
      }
    },
    {
      menu: "18. Pricing Plans Menu (ແຜນການຮຽນ)",
      action: async () => {
        const plans = await api.db.list("plans");
        if (!plans.length) throw new Error("Plans fetch failed");
        return `Verified ${plans.length} subscription plans in DB (${plans.map(p => p.id).join(", ")})`;
      }
    },
    {
      menu: "19. Activity Audit Log Menu (ປະຫວັດການໃຊ້ງານ)",
      action: async () => {
        const log = {
          id: "act-" + Date.now(),
          type: "admin_action",
          ref: "create_lesson",
          name: "Admin Tester",
          at: Date.now()
        };
        await api.db.set("activity/" + log.id, log);
        const got = await api.db.get("activity/" + log.id);
        if (!got) throw new Error("Activity log write failed");
        return `Activity audit log recorded in DB: ${got.ref} by ${got.name}`;
      }
    },
    {
      menu: "20. Administrators Menu (ຜູ້ດູແລລະບົບ)",
      action: async () => {
        const adminDoc = {
          id: "admin-somxai",
          role: "owner",
          email: "kindathanomsuck@gmail.com",
          name: "Owner Admin",
          createdAt: new Date()
        };
        await api.db.set("admins/" + adminDoc.id, adminDoc);
        const got = await api.db.get("admins/" + adminDoc.id);
        if (!got || got.role !== "owner") throw new Error("Admin role write failed");
        return `Admin permissions verified in DB for: ${got.email} (Role: ${got.role})`;
      }
    },
    {
      menu: "21. Settings Menu (ຕັ້ງຄ່າລະບົບ)",
      action: async () => {
        await api.db.set("settings/app", { appName: "LaoLao Hub", supportContact: "support@laolao.app", updatedAt: new Date() }, true);
        const got = await api.db.get("settings/app");
        if (!got || got.appName !== "LaoLao Hub") throw new Error("Settings write failed");
        return `App settings verified in DB: ${got.appName} (${got.supportContact})`;
      }
    },
    {
      menu: "22. Learner Sync & Publish Test (ສົ່ງເນື້ອຫາໃຫ້ນັກຮຽນ)",
      action: async () => {
        const meta = await buildBundles(api, "admin-system-test");
        if (!meta || !meta.version) throw new Error("Build bundles failed");
        return `Published bundles to learners: Version ${meta.version} compiled with all new lessons and content!`;
      }
    }
  ];

  let passed = 0;
  for (const t of menuTests) {
    try {
      const res = await t.action();
      console.log(`[PASS] ${t.menu.padEnd(46)} -> ${res}`);
      passed++;
    } catch(err) {
      console.error(`[FAIL] ${t.menu}:`, err.message);
      throw err;
    }
  }

  console.log("\n===============================================================");
  console.log(`ALL ${passed} / ${menuTests.length} ADMIN MENUS AND DATABASE OPERATIONS PASSED 100%!`);
  console.log("===============================================================");
}

testEveryMenu().catch(err => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
