// End-to-End Database CRUD, Content Relationship, and Learner Traceability Test
import { createLocalApi } from "../js/api/local.js";
import { importSeed } from "../js/shared/setup.js";
import { CONTENT_TYPES, buildBundles, loadBundle } from "../js/shared/content.js";
import { loadDict, dict, searchDict, mergeVocabulary } from "../js/shared/dict.js";
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

async function runAudit() {
  console.log("=================================================");
  console.log("STARTING ROOT-LEVEL DATABASE & CRUD TRACEABILITY AUDIT");
  console.log("=================================================\n");

  const api = await createLocalApi();
  console.log("1. Local Database API initialized:", api.mode);

  // 1. Seed Import
  console.log("\n2. Executing importSeed...");
  await importSeed(api, "admin-test-uid");
  console.log("-> Seed import completed.");

  // 2. Collection Count Verification
  console.log("\n3. Verifying Collection Counts in Database:");
  for (const ty of CONTENT_TYPES) {
    const list = await api.db.list(ty);
    console.log(`   - ${ty.padEnd(14)}: ${list.length} records`);
    if (list.length === 0) {
      throw new Error(`CRITICAL: Collection ${ty} has 0 records after seed import!`);
    }
  }

  // 3. Test CREATE
  console.log("\n4. Testing CREATE operation in database...");
  const testVideo = {
    id: "v-test-luangprabang",
    level: 2,
    category: "culture",
    title: { en: "Night Market at Luang Prabang", lo: "ຕະຫຼາດກາງຄືນຫຼວງພະບາງ", zh: "琅勃拉邦夜市" },
    desc: { en: "Shopping for handwoven textiles and trying coconut pancakes.", lo: "ການຊື້ຜ້າໄໝ ແລະ ຊິມເຂົ້າໜົມຄົກ." },
    embedUrl: "https://www.youtube.com/embed/test12345",
    difficulty: "Stage 2 · Culture",
    status: "published",
    access: "free",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await api.db.set("videos/" + testVideo.id, testVideo);
  const created = await api.db.get("videos/" + testVideo.id);
  if (!created || created.id !== testVideo.id) {
    throw new Error("CREATE verification failed: Record not found in database!");
  }
  console.log("-> CREATE passed: Successfully stored and retrieved video:", created.id);

  // 4. Test READ
  console.log("\n5. Testing READ operation...");
  const allVideos = await api.db.list("videos");
  const found = allVideos.find(v => v.id === testVideo.id);
  if (!found) throw new Error("READ verification failed: Record missing from list query!");
  console.log("-> READ passed: Found in videos list query (total:", allVideos.length, ")");

  // 5. Test UPDATE
  console.log("\n6. Testing UPDATE operation...");
  await api.db.update("videos/" + testVideo.id, {
    "title.en": "Updated Night Market Title",
    difficulty: "Stage 2 · Updated"
  });
  const updated = await api.db.get("videos/" + testVideo.id);
  if (updated.title.en !== "Updated Night Market Title") {
    throw new Error("UPDATE verification failed: Title was not updated!");
  }
  console.log("-> UPDATE passed: Title updated to:", updated.title.en);

  // 6. Test DUPLICATE
  console.log("\n7. Testing DUPLICATE with unique new ID...");
  const dupId = testVideo.id + "-copy-" + Date.now().toString(36);
  const dupDoc = Object.assign({}, updated, { id: dupId, status: "draft" });
  await api.db.set("videos/" + dupId, dupDoc);
  const fetchedDup = await api.db.get("videos/" + dupId);
  if (!fetchedDup || fetchedDup.id !== dupId || fetchedDup.id === testVideo.id) {
    throw new Error("DUPLICATE verification failed: Duplicate ID invalid or collided!");
  }
  console.log("-> DUPLICATE passed: Created unique duplicate:", fetchedDup.id);

  // 7. Test BULK OPERATIONS (Batch Publish & Batch Delete)
  console.log("\n8. Testing BULK ACTIONS (batch update & delete)...");
  await api.db.batch([
    { op: "set", path: "videos/" + testVideo.id, data: { status: "published" }, merge: true },
    { op: "set", path: "videos/" + dupId, data: { status: "published" }, merge: true }
  ]);
  const p1 = await api.db.get("videos/" + testVideo.id);
  const p2 = await api.db.get("videos/" + dupId);
  if (p1.status !== "published" || p2.status !== "published") {
    throw new Error("BULK PUBLISH failed!");
  }
  console.log("-> Bulk Publish passed: Both items published.");

  await api.db.batch([
    { op: "del", path: "videos/" + testVideo.id },
    { op: "del", path: "videos/" + dupId }
  ]);
  const d1 = await api.db.get("videos/" + testVideo.id);
  const d2 = await api.db.get("videos/" + dupId);
  if (d1 !== null || d2 !== null) {
    throw new Error("BULK DELETE failed: Items still exist in database!");
  }
  console.log("-> Bulk Delete passed: Items deleted cleanly.");

  // 8. Test Bundle Compilation
  console.log("\n9. Testing Learner Bundle Compilation (buildBundles)...");
  const meta = await buildBundles(api, "admin-test-uid");
  console.log("-> Bundle built successfully. Version:", meta.version);
  for (const ty of CONTENT_TYPES) {
    console.log(`   - Bundle Tier 1 ${ty.padEnd(14)}: ${meta.counts[1][ty] || 0} items`);
  }

  // 9. Test Dictionary and Learner Traceability
  console.log("\n10. Testing Learner Dictionary Index Merge & Traceability...");
  await loadDict();
  const customWord = {
    id: "ກາເຟແຊບ",
    hz: "ກາເຟແຊບ",
    py: "kaa-feh-sɛ̂ɛp",
    pos: "ph",
    level: 1,
    tr: {
      en: { meaning: "delicious coffee" },
      lo: { meaning: "ກາເຟລົດຊາດດີ" }
    }
  };
  mergeVocabulary([customWord]);
  const results = searchDict("ກາເຟແຊບ");
  if (!results.includes("ກາເຟແຊບ")) {
    throw new Error("Learner dictionary trace failed: Custom word not found in searchDict!");
  }
  const meaningResult = dict()["ກາເຟແຊບ"];
  console.log("-> Traceability passed: Learner search found word:", meaningResult);

  console.log("\n=================================================");
  console.log("ALL DATABASE, CRUD, AND TRACEABILITY TESTS PASSED 100%!");
  console.log("=================================================");
}

runAudit().catch(err => {
  console.error("\nFATAL TEST FAILURE:", err);
  process.exit(1);
});
