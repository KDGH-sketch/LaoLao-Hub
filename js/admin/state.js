// Shared admin state and Role-Based Access Control (RBAC)
import { t, lang } from "../shared/i18n.js";
import { h } from "../shared/ui.js";
import { OWNER_EMAIL } from "../config.js";

export const S = {
  api: null,
  me: null,
  view: "dashboard",
  params: {},
  plans: [],
  settings: {},
  bundle: {},
  simulatedRole: null, // Role simulation for live Super Admin testing
  simulatedPermissions: null,
  render: () => {}
};

export const L = pair => Array.isArray(pair) ? (lang() === "lo" && pair[1] ? pair[1] : pair[0]) : pair;

// Credential & Sensitive System Menus (Strictly Super Admin / Owner only)
export const CREDENTIAL_MENUS = ["admins", "settings", "plans"];

// Active effective role (considering Super Admin simulation mode)
export const getActiveRole = () => {
  if (S.simulatedRole) return S.simulatedRole;
  return S.me ? S.me.role : null;
};

// Check if current user is the owner
export const isOwner = () => {
  if (!S.me) return false;
  if (S.simulatedRole) return S.simulatedRole === "owner";
  return S.me.role === "owner" || (S.me.email && S.me.email.toLowerCase() === String(OWNER_EMAIL).toLowerCase());
};

// Check if current user has Super Admin or Owner privileges
export const isSuper = () => {
  const role = getActiveRole();
  if (S.simulatedRole) {
    return ["super", "owner"].includes(S.simulatedRole);
  }
  return isOwner() || (S.me && ["super", "owner"].includes(S.me.role));
};

// Credential & System management authorization
export const canManageAdmins = () => isSuper();
export const canManageSettings = () => isSuper();

// Check if current user can VIEW a specific menu in the sidebar / navigate to it
export function canViewMenu(menuId) {
  if (!S.me) return false;

  // Credential menus are strictly reserved for Super Admins / Owners
  if (CREDENTIAL_MENUS.includes(menuId)) {
    return isSuper();
  }

  // Super Admin can view all menus
  if (isSuper()) return true;

  const role = getActiveRole();
  const perms = S.simulatedPermissions || S.me.permissions;
  const allowed = S.me.allowedMenus;

  // Custom role: check explicit permissions matrix or allowedMenus array
  if (role === "custom") {
    if (perms && perms[menuId] !== undefined) {
      return !!perms[menuId].view;
    }
    if (Array.isArray(allowed)) {
      return allowed.includes(menuId);
    }
    return false;
  }

  // Content Editors and Content Reviewers can view all curriculum and studio menus
  if (["content", "editor", "reviewer"].includes(role)) {
    return menuId !== "learners"; // Learners view reserved for support/super
  }

  // Support Admin can view dashboard, learners, and activity log
  if (role === "support") {
    return ["dashboard", "learners", "activity"].includes(menuId);
  }

  return true;
}

// Check if current user can EDIT/CREATE/DELETE in a specific menu
export function canEditMenu(menuId) {
  if (!S.me) return false;

  // Credential menus are strictly reserved for Super Admins / Owners
  if (CREDENTIAL_MENUS.includes(menuId)) {
    return isSuper();
  }

  // Super Admin has full write access to all non-credential menus
  if (isSuper()) return true;

  const role = getActiveRole();
  const perms = S.simulatedPermissions || S.me.permissions;

  // Reviewer role is strictly READ-ONLY! Can see, but CANNOT edit or delete!
  if (role === "reviewer") {
    return false;
  }

  // Custom role: check explicit edit permission
  if (role === "custom") {
    if (perms && perms[menuId] !== undefined) {
      return !!perms[menuId].edit;
    }
    return false;
  }

  // Content Editor has full write access to curriculum & studio content
  if (["content", "editor"].includes(role)) {
    return menuId !== "learners";
  }

  // Support Admin can edit learners/access
  if (role === "support") {
    return menuId === "learners";
  }

  return false;
}

// Backward compatibility helpers
export const canContent = () => canEditMenu("lessons");
export const canSupport = () => isSuper() || getActiveRole() === "support";

export function go(view, params = {}) {
  S.view = view;
  S.params = params;
  S.render();
  window.scrollTo(0, 0);
}

export async function refreshPlans() {
  S.plans = (await S.api.db.list("plans")).sort((a, b) => (a.order || 0) - (b.order || 0));
  return S.plans;
}

export const planName = id => {
  const p = S.plans.find(x => x.id === id);
  return p ? ((p.name && (p.name[lang()] || p.name.en)) || p.id) : (id || "—");
};

export { t };
export const fld = (label, ctrl, help) => h("div", { class: "field" }, h("span", { class: "lbl" }, label), ctrl, help ? h("span", { class: "help" }, help) : null);
