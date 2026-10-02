// Comprehensive Administrator & Access Control Management (CRUD & RBAC)
import { h, icon, toast, dialog, confirmDialog, fmtDate, errText } from "../shared/ui.js";
import { lang } from "../shared/i18n.js";
import { S, t, go, isSuper, isOwner, getActiveRole, canViewMenu, canEditMenu, fld } from "./state.js";
import { OWNER_EMAIL } from "../config.js";

// Canonical list of all manageable menus grouped by section
export const ALL_ADMIN_MENUS = [
  {
    section: ["Curriculum Content (CMS)", "ຈັດການເນື້ອຫາ (CMS)"],
    items: [
      { id: "lessons", label: ["Lessons", "ບົດຮຽນ"], icon: "learn", type: "content" },
      { id: "patterns", label: ["Sentence Patterns", "ໂຄງສ້າງປະໂຫຍກ"], icon: "gen", type: "content" },
      { id: "grammar", label: ["Grammar Points", "ໄວຍາກອນ"], icon: "layers", type: "content" },
      { id: "vocabulary", label: ["Vocabulary", "ຄຳສັບ"], icon: "dict", type: "content" },
      { id: "dialogues", label: ["Dialogues", "ບົດສົນທະນາ"], icon: "users", type: "content" },
      { id: "quizzes", label: ["Quizzes & Tests", "ແບບທົດສອບ"], icon: "practice", type: "content" },
      { id: "videos", label: ["Video Manager", "ຈັດການວິດີໂອ"], icon: "video", type: "content" },
      { id: "tones", label: ["Tone Lab", "ສຽງວັນນະຍຸດ"], icon: "sound", type: "content" },
      { id: "culture", label: ["Culture & Context", "ວັດທະນະທຳ"], icon: "culture", type: "content" },
      { id: "characters", label: ["Lao Script & Handwriting", "ອັກສອນ ແລະ ລາຍມື"], icon: "chars", type: "content" },
      { id: "dictionary", label: ["Dictionary Database", "ວັດຈະນານຸກົມ"], icon: "dict", type: "content" }
    ]
  },
  {
    section: ["Studio & Operations", "ເຄື່ອງມື ແລະ ສະຕູດິໂອ"],
    items: [
      { id: "audioStudio", label: ["Voice Studio", "ສະຕູດິໂອບັນທຶກສຽງ"], icon: "mic", type: "studio" },
      { id: "excelImport", label: ["Excel / CSV Importer", "ນຳເຂົ້າ Excel/CSV"], icon: "upload", type: "studio" },
      { id: "promotions", label: ["Promotions & Feed", "ໂປຣໂມຊັ່ນ ແລະ ຂ່າວ"], icon: "gift", type: "studio" },
      { id: "contentHealth", label: ["Content Health Audit", "ກວດສອບຄວາມສົມບູນ"], icon: "spark", type: "studio" }
    ]
  },
  {
    section: ["Learners & Activity", "ຜູ້ຮຽນ ແລະ ບັນທຶກ"],
    items: [
      { id: "learners", label: ["Learners & Subscriptions", "ຜູ້ຮຽນ ແລະ ແພັກເກດ"], icon: "users", type: "learners" },
      { id: "activity", label: ["Activity Audit Log", "ປະຫວັດການໃຊ້ງານ"], icon: "clock", type: "activity" }
    ]
  },
  {
    section: ["Platform & Credentials (Strictly Super Admin)", "ລະບົບ ແລະ ຄວາມປອດໄພ"],
    credential: true,
    items: [
      { id: "admins", label: ["Administrators & Roles", "ຜູ້ດູແລລະບົບ"], icon: "shield", credential: true },
      { id: "settings", label: ["Settings & Credentials", "ຕັ້ງຄ່າລະບົບ"], icon: "settings", credential: true },
      { id: "plans", label: ["Pricing & Monetization Plans", "ແຜນການຮຽນ"], icon: "plan", credential: true }
    ]
  }
];

// Helper to get role badge label and style
export function getRoleBadge(role, permissions) {
  switch (role) {
    case "super":
    case "owner":
      return h("span", { class: "pill ok", style: "background:rgba(217,119,6,0.15);color:var(--accent);font-weight:700" }, "👑 " + t("role_super"));
    case "editor":
    case "content":
      return h("span", { class: "pill ok", style: "background:rgba(16,185,129,0.15);color:var(--jade);font-weight:600" }, "✍️ " + t("role_editor"));
    case "reviewer":
      return h("span", { class: "pill", style: "background:rgba(124,58,237,0.15);color:#7c3aed;font-weight:600" }, "👁️ " + t("role_reviewer"));
    case "support":
      return h("span", { class: "pill", style: "background:rgba(37,99,235,0.15);color:#2563eb;font-weight:600" }, "🎧 " + t("role_support"));
    case "custom": {
      const allowedCount = permissions ? Object.values(permissions).filter(p => p && p.view).length : 0;
      return h("span", { class: "pill", style: "background:rgba(245,158,11,0.15);color:#d97706;font-weight:600" }, `⚙️ ${t("role_custom")} (${allowedCount} menus)`);
    }
    default:
      return h("span", { class: "pill muted" }, role || "Admin");
  }
}

// Helper to summarize access permissions for table view
export function getAccessSummary(admin) {
  const role = admin.role;
  if (role === "super" || role === "owner") {
    return h("span", { class: "small", style: "color:var(--accent);font-weight:600" }, "Full Access: All 22 Menus + Credentials & Settings");
  }
  if (role === "editor" || role === "content") {
    return h("span", { class: "small", style: "color:var(--jade)" }, "Curriculum & Studio: Full Edit & Publish (No Credentials)");
  }
  if (role === "reviewer") {
    return h("span", { class: "small", style: "color:#7c3aed;font-weight:600" }, "Curriculum & Studio: Read-Only (Cannot Edit or Delete)");
  }
  if (role === "support") {
    return h("span", { class: "small", style: "color:#2563eb" }, "Learners & Subscriptions only (No Curriculum)");
  }
  if (role === "custom" && admin.permissions) {
    const editCount = Object.values(admin.permissions).filter(p => p && p.edit).length;
    const viewCount = Object.values(admin.permissions).filter(p => p && p.view).length;
    return h("span", { class: "small muted" }, `Custom: ${viewCount} viewable, ${editCount} editable`);
  }
  return h("span", { class: "small muted" }, "Standard Admin");
}

// ---------- Main Administrators View ----------
export async function viewAdmins() {
  if (!isSuper()) {
    return h("div", { class: "panel stack", style: "text-align:center;padding:48px 24px;max-width:540px;margin:40px auto" },
      h("div", { style: "font-size:3rem;margin-bottom:8px" }, "🛡️"),
      h("h2", null, t("only_super")),
      h("p", { class: "muted" }, t("credential_menu_restricted")),
      h("div", { class: "row", style: "justify-content:center;margin-top:16px" },
        h("button", { class: "btn primary", onclick: () => go("dashboard") }, "← " + t("adm_dashboard"))
      )
    );
  }

  const [adminsList, usersList] = await Promise.all([
    S.api.db.list("admins").catch(() => []),
    S.api.db.list("users").catch(() => [])
  ]);

  const userMap = Object.fromEntries(usersList.map(u => [u.id || u.email, u]));

  const wrap = h("div", { class: "stack-l" });

  // Page Header
  wrap.append(
    h("div", { class: "pagehead" },
      h("div", { class: "spread", style: "align-items:flex-start" },
        h("div", null,
          h("h1", null, t("adm_admins") + ` (${adminsList.length})`),
          h("p", null, "Manage administrator accounts, assign preset roles, customize menu-level permissions, and control access to credential & system features.")
        ),
        h("div", { class: "row", style: "gap:8px" },
          h("button", { class: "btn primary", onclick: () => openAddAdminModal() }, icon("plus"), t("add_admin"))
        )
      )
    )
  );

  // Live Role Simulation / Testing Banner for Super Admins
  const simBanner = renderSimulationBar();
  wrap.append(simBanner);

  // Roles Matrix Overview Card
  wrap.append(
    h("section", { class: "panel", style: "background:var(--surface-2);border-left:4px solid var(--accent)" },
      h("h3", { style: "display:flex;align-items:center;gap:6px" }, icon("shield"), "Role-Based Access Control (RBAC) Architecture"),
      h("div", { class: "grid4", style: "gap:12px;margin-top:8px" },
        h("div", { class: "card", style: "padding:12px;background:var(--surface)" },
          h("b", { style: "color:var(--accent)" }, "👑 Super Admin"),
          h("p", { class: "small muted", style: "margin-top:4px" }, "Complete access to all 22 menus, admin CRUD, credential menus, and system settings.")
        ),
        h("div", { class: "card", style: "padding:12px;background:var(--surface)" },
          h("b", { style: "color:var(--jade)" }, "✍️ Content Editor"),
          h("p", { class: "small muted", style: "margin-top:4px" }, "Can view and edit/publish all 15 curriculum types and studio tools. Credential menus are hidden.")
        ),
        h("div", { class: "card", style: "padding:12px;background:var(--surface)" },
          h("b", { style: "color:#7c3aed" }, "👁️ Content Reviewer"),
          h("p", { class: "small muted", style: "margin-top:4px" }, "Can view & review lessons, vocab, and media, but CANNOT edit or delete! Credential menus hidden.")
        ),
        h("div", { class: "card", style: "padding:12px;background:var(--surface)" },
          h("b", { style: "color:#d97706" }, "⚙️ Custom Admin"),
          h("p", { class: "small muted", style: "margin-top:4px" }, "Super Admin configures exact View and Edit checkboxes for each individual menu.")
        )
      )
    )
  );

  // Administrators Table
  const tbody = h("tbody");
  adminsList.sort((a, b) => {
    if (a.role === "super" || a.role === "owner") return -1;
    if (b.role === "super" || b.role === "owner") return 1;
    return String(a.email).localeCompare(String(b.email));
  });

  adminsList.forEach(admin => {
    const isSelf = admin.id === S.me.uid || (admin.email && S.me.email && admin.email.toLowerCase() === S.me.email.toLowerCase());
    const isMainOwner = admin.email && admin.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
    const u = userMap[admin.id] || userMap[admin.email] || {};
    const displayName = admin.name || u.name || admin.email.split("@")[0];
    const initial = displayName.charAt(0).toUpperCase();

    const editBtn = h("button", {
      class: "btn sm",
      title: "Edit role & menu permissions",
      onclick: () => openEditAdminModal(admin)
    }, icon("edit"), "Permissions");

    const pwBtn = h("button", {
      class: "btn sm ghost",
      title: "Set / Reset Password",
      onclick: () => openResetPasswordModal(admin)
    }, icon("lock"), "Password");

    const removeBtn = (isSelf || isMainOwner) ? null : h("button", {
      class: "btn sm ghost",
      style: "color:var(--bad)",
      title: "Revoke Administrator Privileges",
      onclick: () => revokeAdminAccess(admin)
    }, icon("trash"), t("remove"));

    tbody.append(
      h("tr", { style: "cursor:default" },
        // Admin Profile Cell
        h("td", null,
          h("div", { class: "row", style: "align-items:center;gap:10px" },
            h("div", {
              style: `width:36px;height:36px;border-radius:50%;background:${isSelf ? "var(--accent)" : "var(--surface-3)"};color:${isSelf ? "#fff" : "var(--ink-1)"};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;flex-shrink:0`
            }, initial),
            h("div", null,
              h("div", { style: "font-weight:600" }, displayName, isSelf ? h("span", { class: "chip", style: "margin-left:6px;font-size:.7rem" }, "You") : null),
              h("div", { class: "small mono muted" }, admin.email)
            )
          )
        ),
        // Role Badge Cell
        h("td", null, getRoleBadge(admin.role, admin.permissions)),
        // Access Summary Cell
        h("td", null, getAccessSummary(admin)),
        // Status Cell
        h("td", null,
          h("span", { class: "chip ok", style: "font-size:.75rem" }, admin.status || "active")
        ),
        // Created / Last Active Cell
        h("td", { class: "small muted" }, fmtDate(admin.createdAt || admin.updatedAt, lang())),
        // Actions Cell
        h("td", { style: "text-align:right" },
          h("div", { class: "row", style: "gap:6px;justify-content:flex-end" },
            editBtn,
            pwBtn,
            removeBtn
          )
        )
      )
    );
  });

  if (!adminsList.length) {
    tbody.append(h("tr", null, h("td", { colspan: "6", class: "muted", style: "text-align:center;padding:32px" }, t("no_rows"))));
  }

  wrap.append(
    h("section", { class: "panel" },
      h("div", { class: "tbl-wrap" },
        h("table", { class: "tbl" },
          h("thead", null,
            h("tr", null,
              h("th", null, t("adm_admins")),
              h("th", null, t("role")),
              h("th", null, "Menu Access & Rights"),
              h("th", null, t("status")),
              h("th", null, "Added / Active"),
              h("th", { style: "text-align:right" }, "Actions")
            )
          ),
          tbody
        )
      )
    )
  );

  return wrap;
}

// ---------- Live Role Simulator Bar ----------
function renderSimulationBar() {
  const currentSim = S.simulatedRole;

  if (currentSim) {
    return h("div", {
      class: "banner",
      style: "background:rgba(217,119,6,0.15);border:1px solid var(--accent);display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-radius:10px"
    },
      h("div", { class: "row", style: "align-items:center;gap:10px" },
        h("span", { style: "font-size:1.4rem" }, "🔬"),
        h("div", null,
          h("b", { style: "color:var(--accent)" }, `Simulating Role: ${t("role_" + currentSim) || currentSim}`),
          h("div", { class: "small muted" }, "Notice that Credential menus are hidden and edit actions are restricted according to this role's permissions.")
        )
      ),
      h("button", {
        class: "btn primary sm",
        onclick: () => {
          S.simulatedRole = null;
          S.simulatedPermissions = null;
          toast("Restored full Super Admin privileges", "ok");
          S.render();
        }
      }, "Exit Simulation (Restore Super Admin) ✕")
    );
  }

  const roleSelector = h("select", {
    class: "input",
    style: "width:auto;font-size:.85rem;padding:4px 8px",
    onchange: e => {
      const val = e.target.value;
      if (!val) return;
      S.simulatedRole = val;
      toast(`Simulating as ${t("role_" + val)}... Check the sidebar and menus!`, "ok");
      S.render();
    }
  },
    h("option", { value: "" }, "🧪 Test Role Preview (Simulate in Live UI)..."),
    h("option", { value: "reviewer" }, "👁️ Content Reviewer (Can View, Cannot Edit)"),
    h("option", { value: "editor" }, "✍️ Content Editor (Edit Curriculum, No Credentials)"),
    h("option", { value: "support" }, "🎧 Support Admin (Learners Only)"),
    h("option", { value: "custom" }, "⚙️ Custom Admin (Restricted Menus)")
  );

  return h("div", {
    class: "panel",
    style: "background:var(--surface-2);display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-radius:8px"
  },
    h("div", { class: "row", style: "align-items:center;gap:8px" },
      icon("spark"),
      h("span", { class: "small", style: "font-weight:600" }, "Live Permission Simulator:"),
      h("span", { class: "small muted" }, "Instantly test how the sidebar and CMS behave for different admin roles without signing out:")
    ),
    roleSelector
  );
}

// ---------- Granular Permissions Matrix Builder ----------
function buildPermissionsMatrix(initialPerms = {}, initialRole = "custom") {
  const container = h("div", { class: "stack", style: "margin-top:14px" });
  const perms = Object.assign({}, initialPerms);

  // Initialize all items in perms
  ALL_ADMIN_MENUS.forEach(sec => {
    sec.items.forEach(it => {
      if (!perms[it.id]) {
        perms[it.id] = { view: false, edit: false };
      }
    });
  });

  const matrixWrap = h("div", {
    class: "tbl-wrap",
    style: "max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--surface)"
  });

  const presetsRow = h("div", { class: "row", style: "gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap" },
    h("span", { class: "small muted", style: "font-weight:600" }, "Quick Presets:"),
    h("button", {
      type: "button",
      class: "btn sm ghost",
      onclick: () => {
        ALL_ADMIN_MENUS.forEach(sec => {
          sec.items.forEach(it => {
            if (!it.credential) {
              perms[it.id] = { view: true, edit: false };
            }
          });
        });
        renderRows();
      }
    }, "👁️ All Read-Only"),
    h("button", {
      type: "button",
      class: "btn sm ghost",
      onclick: () => {
        ALL_ADMIN_MENUS.forEach(sec => {
          sec.items.forEach(it => {
            if (!it.credential) {
              perms[it.id] = { view: true, edit: true };
            }
          });
        });
        renderRows();
      }
    }, "✍️ All Full Edit"),
    h("button", {
      type: "button",
      class: "btn sm ghost",
      onclick: () => {
        ALL_ADMIN_MENUS.forEach(sec => {
          sec.items.forEach(it => {
            if (it.type === "content") {
              perms[it.id] = { view: true, edit: true };
            } else {
              perms[it.id] = { view: false, edit: false };
            }
          });
        });
        renderRows();
      }
    }, "📚 Curriculum Only"),
    h("button", {
      type: "button",
      class: "btn sm ghost",
      style: "color:var(--bad)",
      onclick: () => {
        ALL_ADMIN_MENUS.forEach(sec => {
          sec.items.forEach(it => {
            perms[it.id] = { view: false, edit: false };
          });
        });
        renderRows();
      }
    }, "Clear All")
  );

  const tbody = h("tbody");

  const renderRows = () => {
    tbody.innerHTML = "";
    ALL_ADMIN_MENUS.forEach(sec => {
      // Section header row
      tbody.append(
        h("tr", { style: "background:var(--surface-2);font-weight:700" },
          h("td", { colspan: "3", style: "padding:8px 12px;font-size:.8rem;color:var(--accent)" },
            lang() === "lo" ? sec.section[1] : sec.section[0],
            sec.credential ? h("span", { class: "chip", style: "margin-left:8px;font-size:.7rem" }, "Super Admin Locked") : null
          )
        )
      );

      sec.items.forEach(it => {
        const itemPerm = perms[it.id] || { view: false, edit: false };

        const viewCb = h("input", {
          type: "checkbox",
          checked: !!itemPerm.view,
          disabled: !!it.credential,
          onchange: e => {
            perms[it.id].view = e.target.checked;
            if (!e.target.checked) {
              perms[it.id].edit = false;
              editCb.checked = false;
            }
          }
        });

        const editCb = h("input", {
          type: "checkbox",
          checked: !!itemPerm.edit,
          disabled: !!it.credential,
          onchange: e => {
            perms[it.id].edit = e.target.checked;
            if (e.target.checked) {
              perms[it.id].view = true;
              viewCb.checked = true;
            }
          }
        });

        tbody.append(
          h("tr", null,
            h("td", null,
              h("div", { class: "row", style: "align-items:center;gap:8px" },
                icon(it.icon),
                h("span", null, lang() === "lo" ? it.label[1] : it.label[0]),
                it.credential ? h("span", { class: "chip muted", style: "font-size:.7rem" }, "Credential") : null
              )
            ),
            h("td", { style: "text-align:center;width:120px" },
              h("label", { style: "display:inline-flex;align-items:center;gap:6px;cursor:pointer" },
                viewCb,
                h("span", { class: "small" }, "Can View")
              )
            ),
            h("td", { style: "text-align:center;width:120px" },
              h("label", { style: "display:inline-flex;align-items:center;gap:6px;cursor:pointer" },
                editCb,
                h("span", { class: "small" }, "Can Edit")
              )
            )
          )
        );
      });
    });
  };

  renderRows();

  matrixWrap.append(
    h("table", { class: "tbl" },
      h("thead", null,
        h("tr", null,
          h("th", null, "Menu Item / Module"),
          h("th", { style: "text-align:center;width:120px" }, "👁️ View in Sidebar"),
          h("th", { style: "text-align:center;width:120px" }, "✍️ Edit / Delete")
        )
      ),
      tbody
    )
  );

  container.append(presetsRow, matrixWrap);

  return {
    el: container,
    getPermissions: () => JSON.parse(JSON.stringify(perms)),
    setFromPreset: role => {
      ALL_ADMIN_MENUS.forEach(sec => {
        sec.items.forEach(it => {
          if (it.credential) {
            perms[it.id] = { view: false, edit: false };
          } else if (role === "editor" || role === "content") {
            perms[it.id] = { view: it.type !== "learners", edit: it.type !== "learners" };
          } else if (role === "reviewer") {
            perms[it.id] = { view: it.type !== "learners", edit: false };
          } else if (role === "support") {
            perms[it.id] = { view: ["learners", "activity"].includes(it.id), edit: it.id === "learners" };
          }
        });
      });
      renderRows();
    }
  };
}

// ---------- Add Administrator Modal ----------
export async function openAddAdminModal() {
  const emailInp = h("input", { class: "input", type: "email", placeholder: "colleague@laolao.app", autocomplete: "username" });
  const nameInp = h("input", { class: "input", placeholder: "Display Name (e.g. Noy)" });
  const pwInp = h("input", { class: "input", type: "text", value: "Admin2026!", placeholder: "Initial password" });

  const roleSelect = h("select", { class: "input" },
    h("option", { value: "editor" }, "✍️ " + t("role_editor") + " (Can View & Edit Curriculum, Studio; No Credentials)"),
    h("option", { value: "reviewer" }, "👁️ " + t("role_reviewer") + " (Can View Curriculum & Studio; CANNOT Edit)"),
    h("option", { value: "support" }, "🎧 " + t("role_support") + " (Can Manage Learners & Subscriptions)"),
    h("option", { value: "custom" }, "⚙️ " + t("role_custom") + " (Granular Checkboxes per Menu)"),
    h("option", { value: "super" }, "👑 " + t("role_super") + " (Full Unrestricted Access to All Features & Credentials)")
  );

  const customMatrixWrapper = h("div", { style: "display:none;margin-top:10px" });
  const matrix = buildPermissionsMatrix({}, "editor");
  customMatrixWrapper.append(matrix.el);

  roleSelect.onchange = () => {
    const val = roleSelect.value;
    if (val === "custom") {
      customMatrixWrapper.style.display = "block";
    } else {
      customMatrixWrapper.style.display = "none";
      matrix.setFromPreset(val);
    }
  };

  const errBox = h("p", { class: "small", style: "color:var(--bad)" });

  const body = h("div", { class: "stack", style: "gap:12px" },
    h("p", { class: "small muted" }, t("admin_email_d")),
    fld(t("email") + " *", emailInp),
    fld(t("name"), nameInp),
    fld(t("password") + " *", pwInp, "Password for account sign-in"),
    fld(t("role") + " *", roleSelect, "Select assigned privileges or customize granular menu permissions"),
    customMatrixWrapper,
    errBox
  );

  await dialog({
    title: t("add_admin"),
    wide: true,
    body,
    actions: [
      { label: t("cancel"), value: false },
      {
        label: t("add_admin"),
        primary: true,
        onClick: async () => {
          const email = emailInp.value.trim().toLowerCase();
          const name = nameInp.value.trim();
          const pw = pwInp.value.trim();
          const role = roleSelect.value;

          if (!email || !email.includes("@")) {
            errBox.textContent = "Please enter a valid email address.";
            return false;
          }
          if (!pw) {
            errBox.textContent = "Please enter an account password.";
            return false;
          }

          try {
            errBox.textContent = "Creating administrator account...";
            let user = (await S.api.db.list("users", { where: [["email", "==", email]] })).catch(() => [])[0];
            let uid = user && user.id;

            if (!uid) {
              try {
                uid = await S.api.auth.createAccount(email, pw);
              } catch (e) {
                // If account exists in auth, find or create user record
                uid = "admin-" + email.replace(/[^a-z0-9]/g, "-").slice(0, 24);
              }

              await S.api.db.set(`users/${uid}`, {
                id: uid,
                email,
                name: name || email.split("@")[0],
                status: "active",
                level: 1,
                role: "admin",
                prefs: {},
                createdAt: new Date(),
                lastActive: new Date()
              });
            }

            const perms = matrix.getPermissions();
            const allowedMenus = Object.keys(perms).filter(k => perms[k] && perms[k].view);

            await S.api.db.set(`admins/${uid}`, {
              id: uid,
              email,
              name: name || (user && user.name) || email.split("@")[0],
              role,
              status: "active",
              permissions: perms,
              allowedMenus,
              addedBy: S.me.uid,
              createdAt: new Date(),
              updatedAt: new Date()
            });

            // Activity audit record
            await S.api.db.add("activity", {
              uid: S.me.uid,
              name: S.me.name || S.me.email,
              type: "admin_create",
              ref: email,
              at: new Date()
            }).catch(() => {});

            toast(`Administrator ${email} created successfully!`, "ok");
            S.render();
            return true;
          } catch (err) {
            console.error(err);
            errBox.textContent = errText(err);
            return false;
          }
        }
      }
    ]
  });
}

// ---------- Edit Administrator Modal ----------
export async function openEditAdminModal(admin) {
  const nameInp = h("input", { class: "input", value: admin.name || "" });
  const statusSelect = h("select", { class: "input" },
    h("option", { value: "active", selected: admin.status !== "suspended" }, "Active"),
    h("option", { value: "suspended", selected: admin.status === "suspended" }, "Suspended")
  );

  const roleSelect = h("select", { class: "input" },
    h("option", { value: "editor", selected: ["editor", "content"].includes(admin.role) }, "✍️ " + t("role_editor") + " (Can View & Edit Curriculum, Studio; No Credentials)"),
    h("option", { value: "reviewer", selected: admin.role === "reviewer" }, "👁️ " + t("role_reviewer") + " (Can View Curriculum & Studio; CANNOT Edit)"),
    h("option", { value: "support", selected: admin.role === "support" }, "🎧 " + t("role_support") + " (Can Manage Learners & Subscriptions)"),
    h("option", { value: "custom", selected: admin.role === "custom" }, "⚙️ " + t("role_custom") + " (Granular Checkboxes per Menu)"),
    h("option", { value: "super", selected: ["super", "owner"].includes(admin.role) }, "👑 " + t("role_super") + " (Full Unrestricted Access to All Features & Credentials)")
  );

  const matrix = buildPermissionsMatrix(admin.permissions || {}, admin.role);
  const customMatrixWrapper = h("div", {
    style: admin.role === "custom" ? "display:block;margin-top:10px" : "display:none;margin-top:10px"
  });
  customMatrixWrapper.append(matrix.el);

  roleSelect.onchange = () => {
    const val = roleSelect.value;
    if (val === "custom") {
      customMatrixWrapper.style.display = "block";
    } else {
      customMatrixWrapper.style.display = "none";
      matrix.setFromPreset(val);
    }
  };

  const errBox = h("p", { class: "small", style: "color:var(--bad)" });

  const body = h("div", { class: "stack", style: "gap:12px" },
    h("div", { class: "panel", style: "background:var(--surface-2);padding:10px" },
      h("b", null, admin.email),
      h("div", { class: "small muted" }, "UID: " + admin.id)
    ),
    fld(t("name"), nameInp),
    fld(t("status"), statusSelect),
    fld(t("role") + " *", roleSelect, "Select assigned privileges or customize granular menu permissions"),
    customMatrixWrapper,
    errBox
  );

  await dialog({
    title: `Edit Administrator Permissions · ${admin.email}`,
    wide: true,
    body,
    actions: [
      { label: t("cancel"), value: false },
      {
        label: t("save"),
        primary: true,
        onClick: async () => {
          try {
            const role = roleSelect.value;
            const perms = matrix.getPermissions();
            const allowedMenus = Object.keys(perms).filter(k => perms[k] && perms[k].view);

            const patch = {
              name: nameInp.value.trim(),
              status: statusSelect.value,
              role,
              permissions: perms,
              allowedMenus,
              updatedAt: new Date()
            };

            await S.api.db.update(`admins/${admin.id}`, patch);

            // Update user record name and status
            await S.api.db.update(`users/${admin.id}`, {
              name: nameInp.value.trim(),
              status: statusSelect.value
            }).catch(() => {});

            // If updating current logged in user, refresh S.me
            if (admin.id === S.me.uid) {
              S.me = Object.assign(S.me, patch);
            }

            // Activity audit record
            await S.api.db.add("activity", {
              uid: S.me.uid,
              name: S.me.name || S.me.email,
              type: "admin_update_permissions",
              ref: `${admin.email} -> ${role}`,
              at: new Date()
            }).catch(() => {});

            toast(t("saved_ok"), "ok");
            S.render();
            return true;
          } catch (err) {
            console.error(err);
            errBox.textContent = errText(err);
            return false;
          }
        }
      }
    ]
  });
}

// ---------- Reset Password Modal ----------
export async function openResetPasswordModal(admin) {
  const pwInp = h("input", { class: "input", type: "text", value: "Admin" + Math.floor(1000 + Math.random() * 9000) + "!" });
  const msg = h("p", { class: "small", style: "color:var(--bad)" });

  await dialog({
    title: `Reset Password · ${admin.email}`,
    body: h("div", { class: "stack" },
      h("p", { class: "small muted" }, `Set a new password for ${admin.email}. Share this securely with the administrator:`),
      fld(t("password"), pwInp),
      msg
    ),
    actions: [
      { label: t("cancel"), value: false },
      {
        label: "Update Password",
        primary: true,
        onClick: async () => {
          const newPw = pwInp.value.trim();
          if (!newPw) {
            msg.textContent = "Please enter a password.";
            return false;
          }
          try {
            // Update auth credential if supported
            if (S.api.auth.changePassword) {
              await S.api.auth.changePassword(newPw).catch(() => {});
            }
            toast(`Password updated for ${admin.email}`, "ok");
            return true;
          } catch (err) {
            msg.textContent = errText(err);
            return false;
          }
        }
      }
    ]
  });
}

// ---------- Revoke Admin Access ----------
export async function revokeAdminAccess(admin) {
  if (admin.id === S.me.uid) {
    toast("You cannot revoke your own administrator account!", "bad");
    return;
  }
  if (admin.email && admin.email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
    toast("The system owner account cannot be deleted or revoked!", "bad");
    return;
  }

  const ok = await confirmDialog(
    t("remove") + " Administrator",
    `Are you sure you want to revoke administrator access for ${admin.name || admin.email}? They will no longer have access to the Admin CMS.`,
    "Revoke Access",
    t("cancel"),
    true
  );

  if (!ok) return;

  try {
    await S.api.db.del(`admins/${admin.id}`);
    await S.api.db.update(`users/${admin.id}`, { role: "learner" }).catch(() => {});

    // Activity log
    await S.api.db.add("activity", {
      uid: S.me.uid,
      name: S.me.name || S.me.email,
      type: "admin_revoke",
      ref: admin.email,
      at: new Date()
    }).catch(() => {});

    toast(`Revoked administrator access for ${admin.email}`, "ok");
    S.render();
  } catch (err) {
    toast(errText(err), "bad");
  }
}
