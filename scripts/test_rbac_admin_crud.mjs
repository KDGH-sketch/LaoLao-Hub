// Comprehensive Test Suite for Super Admin CRUD, RBAC, and Menu Visibility / Edit Restrictions
import { createLocalApi } from "../js/api/local.js";
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
  createElement: () => ({ append: () => {}, setAttribute: () => {}, addEventListener: () => {} }),
  getElementById: () => null
};

global.fetch = async (url) => {
  const p = String(url);
  let filePath = "";
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

import { canViewMenu, canEditMenu, isSuper, S, CREDENTIAL_MENUS } from "../js/admin/state.js";

async function runRbacTests() {
  console.log("=================================================================");
  console.log("  ROLE-BASED ACCESS CONTROL (RBAC) & ADMIN CRUD TEST SUITE");
  console.log("=================================================================\n");

  const api = await createLocalApi();
  S.api = api;

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, testName, details = "") {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ [PASS] ${testName}`);
    } else {
      console.error(`  ✗ [FAIL] ${testName} ${details ? "- " + details : ""}`);
    }
  }

  // 1. Initial Seeding
  console.log("--- 1. Testing Database Seeding & Initial Super Admin ---");
  const adminUid = "admin-super-01";
  await api.db.set(`admins/${adminUid}`, {
    id: adminUid,
    email: "super@laolao.app",
    name: "Platform Owner",
    role: "super",
    status: "active",
    createdAt: new Date()
  });

  const seededAdmin = await api.db.get(`admins/${adminUid}`);
  assert(seededAdmin && seededAdmin.role === "super", "Super Admin document created in 'admins' table");

  // 2. Super Admin Capabilities & Full Access
  console.log("\n--- 2. Testing Super Admin Capabilities & Credential Menus ---");
  S.me = { uid: adminUid, email: "super@laolao.app", role: "super" };
  S.simulatedRole = null;

  assert(isSuper(), "isSuper() returns true for role: 'super'");
  assert(canViewMenu("admins"), "Super Admin can view 'admins' credential menu");
  assert(canViewMenu("settings"), "Super Admin can view 'settings' credential menu");
  assert(canViewMenu("plans"), "Super Admin can view 'plans' credential menu");
  assert(canViewMenu("lessons"), "Super Admin can view curriculum ('lessons')");
  assert(canEditMenu("lessons"), "Super Admin can edit curriculum ('lessons')");
  assert(canEditMenu("admins"), "Super Admin can edit credential menus ('admins')");

  // 3. Super Admin CRUD on Admins Collection
  console.log("\n--- 3. Testing Super Admin CRUD on Admins Collection ---");
  // CREATE
  const newEditorUid = "admin-editor-99";
  const editorData = {
    id: newEditorUid,
    email: "editor.team@laolao.app",
    name: "Curriculum Editor",
    role: "editor",
    status: "active",
    permissions: {},
    allowedMenus: ["lessons", "patterns", "grammar", "vocabulary", "dialogues", "quizzes", "videos", "tones", "culture", "characters", "dictionary"],
    addedBy: adminUid,
    createdAt: new Date()
  };
  await api.db.set(`admins/${newEditorUid}`, editorData);
  const createdEditor = await api.db.get(`admins/${newEditorUid}`);
  assert(createdEditor && createdEditor.email === "editor.team@laolao.app", "Create: Successfully added new administrator to database");

  // READ (List)
  const allAdmins = await api.db.list("admins");
  assert(allAdmins.length >= 2, `Read: Listed ${allAdmins.length} administrators from database`);

  // UPDATE (Change Role & Permissions)
  await api.db.update(`admins/${newEditorUid}`, {
    name: "Senior Curriculum Editor",
    role: "reviewer",
    updatedAt: new Date()
  });
  const updatedEditor = await api.db.get(`admins/${newEditorUid}`);
  assert(updatedEditor.name === "Senior Curriculum Editor" && updatedEditor.role === "reviewer", "Update: Successfully modified admin role and name in database");

  // DELETE / REVOKE
  const tempUid = "admin-temp-delete";
  await api.db.set(`admins/${tempUid}`, { id: tempUid, email: "temp@laolao.app", role: "editor" });
  await api.db.del(`admins/${tempUid}`);
  const deletedCheck = await api.db.get(`admins/${tempUid}`);
  assert(deletedCheck === null, "Delete: Successfully revoked and removed administrator document");

  // 4. Content Reviewer Role (Strictly Read-Only & Credential Hidden)
  console.log("\n--- 4. Testing Content Reviewer Role (Can View, Cannot Edit, No Credentials) ---");
  S.me = { uid: "rev-01", email: "reviewer@demo.laolao", role: "reviewer" };
  S.simulatedRole = null;

  assert(!isSuper(), "Reviewer is NOT super admin");
  assert(!canViewMenu("admins"), "Reviewer CANNOT see 'admins' credential menu (Hidden)");
  assert(!canViewMenu("settings"), "Reviewer CANNOT see 'settings' credential menu (Hidden)");
  assert(!canViewMenu("plans"), "Reviewer CANNOT see 'plans' credential menu (Hidden)");
  assert(!canViewMenu("learners"), "Reviewer CANNOT see 'learners' user menu (Hidden)");

  assert(canViewMenu("lessons"), "Reviewer CAN see 'lessons' menu in sidebar");
  assert(canViewMenu("vocabulary"), "Reviewer CAN see 'vocabulary' menu in sidebar");
  assert(canViewMenu("videos"), "Reviewer CAN see 'videos' menu in sidebar");
  assert(canViewMenu("audioStudio"), "Reviewer CAN see 'audioStudio' menu in sidebar");

  assert(!canEditMenu("lessons"), "Reviewer CANNOT edit lessons (Strictly Read-Only)");
  assert(!canEditMenu("vocabulary"), "Reviewer CANNOT edit vocabulary (Strictly Read-Only)");
  assert(!canEditMenu("videos"), "Reviewer CANNOT edit videos (Strictly Read-Only)");
  assert(!canEditMenu("audioStudio"), "Reviewer CANNOT edit or record audio (Strictly Read-Only)");

  // 5. Content Editor Role (Full Edit on Curriculum, No Credentials)
  console.log("\n--- 5. Testing Content Editor Role (Can View & Edit, No Credentials) ---");
  S.me = { uid: "ed-01", email: "editor@demo.laolao", role: "editor" };

  assert(!canViewMenu("admins"), "Editor CANNOT see 'admins' credential menu");
  assert(!canViewMenu("settings"), "Editor CANNOT see 'settings' credential menu");
  assert(!canViewMenu("plans"), "Editor CANNOT see 'plans' credential menu");
  assert(canViewMenu("lessons"), "Editor CAN see 'lessons' menu");
  assert(canEditMenu("lessons"), "Editor CAN edit 'lessons'");
  assert(canViewMenu("vocabulary"), "Editor CAN see 'vocabulary' menu");
  assert(canEditMenu("vocabulary"), "Editor CAN edit 'vocabulary'");
  assert(canEditMenu("videos"), "Editor CAN edit 'videos'");

  // 6. Support Admin Role (Learners & Activity Only)
  console.log("\n--- 6. Testing Support Admin Role (Learners Only) ---");
  S.me = { uid: "sup-01", email: "support@demo.laolao", role: "support" };

  assert(canViewMenu("learners"), "Support Admin CAN see 'learners' menu");
  assert(canEditMenu("learners"), "Support Admin CAN edit 'learners'");
  assert(canViewMenu("activity"), "Support Admin CAN see 'activity' log");
  assert(!canViewMenu("lessons"), "Support Admin CANNOT see curriculum ('lessons')");
  assert(!canEditMenu("lessons"), "Support Admin CANNOT edit curriculum ('lessons')");
  assert(!canViewMenu("admins"), "Support Admin CANNOT see 'admins' credential menu");

  // 7. Custom Role (Granular Menu-by-Menu View and Edit Matrix)
  console.log("\n--- 7. Testing Custom Role with Granular Permissions Matrix ---");
  S.me = {
    uid: "cust-01",
    email: "custom@laolao.app",
    role: "custom",
    permissions: {
      lessons: { view: true, edit: false },      // Can see lessons, cannot edit (read-only)
      vocabulary: { view: true, edit: true },    // Can see vocab, can edit vocab
      grammar: { view: false, edit: false },     // Completely hidden
      videos: { view: true, edit: false },       // Can see videos, cannot edit
      admins: { view: false, edit: false }       // Credential locked
    }
  };

  assert(canViewMenu("lessons"), "Custom: Lessons is viewable (view: true)");
  assert(!canEditMenu("lessons"), "Custom: Lessons is NOT editable (edit: false)");

  assert(canViewMenu("vocabulary"), "Custom: Vocabulary is viewable (view: true)");
  assert(canEditMenu("vocabulary"), "Custom: Vocabulary is editable (edit: true)");

  assert(!canViewMenu("grammar"), "Custom: Grammar is hidden from sidebar (view: false)");
  assert(!canEditMenu("grammar"), "Custom: Grammar cannot be edited");

  assert(!canViewMenu("admins"), "Custom: Credential menu 'admins' is strictly hidden");
  assert(!canEditMenu("admins"), "Custom: Credential menu 'admins' is strictly locked");

  // 8. Super Admin Live Simulation Mode
  console.log("\n--- 8. Testing Live Role Simulation Mode for Super Admin ---");
  S.me = { uid: adminUid, email: "super@laolao.app", role: "super" };
  S.simulatedRole = "reviewer";

  assert(!isSuper(), "Simulation: isSuper() reflects simulated 'reviewer' role");
  assert(!canViewMenu("admins"), "Simulation: Credential menus hidden while simulating reviewer");
  assert(canViewMenu("lessons"), "Simulation: Reviewer can view lessons");
  assert(!canEditMenu("lessons"), "Simulation: Reviewer cannot edit lessons");

  // Restoring Super Admin
  S.simulatedRole = null;
  assert(isSuper(), "Simulation reset: Full super admin privileges immediately restored");
  assert(canViewMenu("admins"), "Simulation reset: Credential menus restored");

  // ---------- Website & Welcome menus (docs/WELCOME.md): super/owner, editor, content and admin edit; reviewer reads; support has no access ----------
  const WEB = ["welcome", "places", "festivals", "promotions", "resources"];
  for (const role of ["super", "editor", "content", "admin"]){
    S.me = { uid: "web-" + role, email: role + "@x", role }; S.simulatedRole = null;
    assert(WEB.every(m => canViewMenu(m) && canEditMenu(m)), `${role}: can view and edit every Website & Welcome menu`);
  }
  S.me = { uid: "web-rev", email: "rev@x", role: "reviewer" }; S.simulatedRole = null;
  assert(WEB.every(m => canViewMenu(m) && !canEditMenu(m)), "reviewer: can view the Website & Welcome menus, read-only");
  S.me = { uid: "web-sup", email: "sup@x", role: "support" }; S.simulatedRole = null;
  assert(WEB.every(m => !canViewMenu(m) && !canEditMenu(m)), "support: no access to the Website & Welcome menus");
  S.me = { uid: "web-cus", email: "cus@x", role: "custom", permissions: { places: { view: true, edit: true }, welcome: { view: true, edit: false } } }; S.simulatedRole = null;
  assert(canEditMenu("places") && canViewMenu("welcome") && !canEditMenu("welcome") && !canViewMenu("festivals") && !canEditMenu("promotions"), "custom role: per-menu view and edit toggles");
  console.log("\n=================================================================");
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log("=================================================================\n");

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runRbacTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
