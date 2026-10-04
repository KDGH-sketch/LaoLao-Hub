// "Publish to learners" panel: a progress ring driven by the real build steps (read content → build plan bundles → upload),
// then a success summary (items per plan, time taken) or an error with Retry. Styles: .pub-* in css/admin.css.
import { h, icon, errText } from "../shared/ui.js";
import { buildBundles, CONTENT_TYPES } from "../shared/content.js";
import { S, L, t, planName } from "./state.js";

// Types that always ship whole (reference data), so they are not counted as "published items"
const REFERENCE = new Set(["lexicon", "tones", "dictionary"]);
const R = 54, C = 2 * Math.PI * R;                      // progress ring geometry (viewBox 120)
const MIN_MS = 1100;                                    // keep a very fast publish on screen long enough to read

const svg = (tag, attrs) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

function tierLabel(T){
  if (+T === 0) return L(["Public", "ສາທາລະນະ"]);
  // planName() reads translated names; plain-string names (starter plans) use the standard labels, so "standard" shows as "Basic"
  const names = (S.plans || []).filter(p => +(p.tier || 1) === +T)
    .map(p => typeof p.name === "string" ? (t("acc_" + p.id) !== "acc_" + p.id ? t("acc_" + p.id) : p.name) : planName(p.id));
  return names.length ? names.join(" · ") : L(["Tier ", "ລະດັບ "]) + T;
}

export function publishPanel({ onDone } = {}){
  return new Promise(resolve => {
    let state = "run", shown = 0, target = 0, raf = 0, started = 0;

    // ---- ring ----
    const ring = svg("svg", { viewBox: "0 0 120 120", class: "pub-ring", "aria-hidden": "true" });
    const defs = svg("defs", {});
    const grad = svg("linearGradient", { id: "pubGrad", x1: "0", y1: "0", x2: "1", y2: "1" });
    grad.append(svg("stop", { offset: "0%", class: "pub-g1" }), svg("stop", { offset: "100%", class: "pub-g2" }));
    defs.append(grad);
    const track = svg("circle", { cx: 60, cy: 60, r: R, class: "pub-track" });
    const bar = svg("circle", { cx: 60, cy: 60, r: R, class: "pub-bar", "stroke-dasharray": C, "stroke-dashoffset": C, transform: "rotate(-90 60 60)" });
    ring.append(defs, track, bar);
    const check = svg("svg", { viewBox: "0 0 24 24", class: "pub-check", "aria-hidden": "true" });
    check.append(svg("path", { d: "M5 12.5l4.5 4.5L19 7.5", pathLength: "1" }));
    const core = h("div", { class: "pub-core" }, icon("upload", "pub-up"), check, icon("x", "pub-err"));
    const burst = h("div", { class: "pub-burst", "aria-hidden": "true" },
      Array.from({ length: 14 }, (_, i) => h("i", { style: `--a:${i * (360 / 14)}deg;--d:${70 + (i % 3) * 16}px;--c:var(--pub-c${i % 4})` })));
    const pct = h("div", { class: "pub-pct", "aria-hidden": "true" }, "0%");
    const orb = h("div", { class: "pub-orb" }, h("div", { class: "pub-halo" }), ring, core, burst);

    // ---- text and steps ----
    const title = h("h2", { id: "pubTitle" }, t("adm_publish"));
    const sub = h("p", { class: "pub-sub", "aria-live": "polite" }, t("publishing"));
    const STEPS = [
      ["read", "layers", L(["Collect content", "ລວບລວມເນື້ອຫາ"])],
      ["build", "structure", L(["Build a bundle for each plan", "ສ້າງຊຸດສຳລັບແຕ່ລະແພັກເກດ"])],
      ["write", "send", L(["Send to learners", "ສົ່ງໃຫ້ຜູ້ຮຽນ"])],
    ];
    const stepEls = Object.fromEntries(STEPS.map(([k, ic, label]) => [k, h("li", { class: "pub-step" },
      h("span", { class: "pub-dot" }, icon(ic, "pub-sic"), icon("check", "pub-sok")), h("span", null, label))]));
    const steps = h("ol", { class: "pub-steps" }, Object.values(stepEls));
    const summary = h("div", { class: "pub-sum" });
    const actions = h("div", { class: "pub-act" });
    const closeBtn = h("button", { class: "ib pub-x", "aria-label": t("close"), onclick: () => close() }, icon("x"));

    const box = h("div", { class: "pub is-run", role: "dialog", "aria-modal": "true", "aria-labelledby": "pubTitle" },
      h("div", { class: "pub-glow", "aria-hidden": "true" }, h("div", { class: "pub-aurora" })), closeBtn, orb, pct, title, sub, steps, summary, actions);
    const scrim = h("div", { class: "pub-scrim", onclick: () => { if (state !== "run") close(); } });
    const onKey = e => { if (e.key === "Escape" && state !== "run") close(); };

    function close(){
      cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey);
      box.classList.add("is-out"); scrim.classList.add("is-out");
      setTimeout(() => { box.remove(); scrim.remove(); }, 220);
      resolve(state === "ok");
    }
    // number + ring follow the real progress smoothly instead of jumping
    function tick(){
      shown += (target - shown) * 0.12; if (Math.abs(target - shown) < 0.002) shown = target;
      bar.setAttribute("stroke-dashoffset", String(C * (1 - shown)));
      pct.textContent = Math.round(shown * 100) + "%";
      if (shown !== target || state === "run") raf = requestAnimationFrame(tick);
    }
    // state classes only (keeps the is-in / is-out animation classes)
    const setState = s => { state = s; box.classList.remove("is-run", "is-ok", "is-err"); box.classList.add("is-" + s); };
    const setStep = key => {
      let passed = true;
      for (const [k] of STEPS){ const el = stepEls[k]; if (k === key) passed = false;
        el.classList.toggle("done", passed); el.classList.toggle("on", k === key); }
    };

    async function run(){
      setState("run"); summary.replaceChildren(); actions.replaceChildren();
      title.textContent = t("adm_publish"); sub.textContent = t("publishing"); shown = target = 0; started = performance.now();
      setStep("read"); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
      try {
        const meta = await buildBundles(S.api, S.me.uid, (step, done = 0, total = 1) => {
          if (step === "write"){
            setStep("write"); target = 0.55 + 0.4 * (done / Math.max(1, total));
            sub.textContent = L(["Uploading", "ກຳລັງອັບໂຫຼດ"]) + ` ${Math.min(done + 1, total)}/${total}`;
          } else if (CONTENT_TYPES.includes(step)){
            target = 0.45 * ((done + 1) / total);
            sub.textContent = L(["Reading", "ກຳລັງອ່ານ"]) + " " + t("type_" + step).toLowerCase() + "…";
            if (done + 1 === total){ setStep("build"); target = 0.5; }
          }
        });
        const wait = MIN_MS - (performance.now() - started); if (wait > 0) await new Promise(r => setTimeout(r, wait));
        if (onDone) await onDone();
        target = 1; await new Promise(r => setTimeout(r, 380));
        success(meta);
      } catch(e){ fail(e); }
    }

    function success(meta){
      setState("ok"); setStep(null);
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      title.textContent = L(["You're live!", "ເຜີຍແຜ່ແລ້ວ!"]);
      sub.textContent = t("published_ok");
      const tiers = Object.keys(meta.counts || {}).map(Number).sort((a, b) => a - b);
      summary.replaceChildren(
        // items each plan can now open (an empty "Public" tier is not worth a card)
        h("div", { class: "pub-tiers" }, tiers
          .map(T => [T, Object.entries(meta.counts[T]).reduce((s, [k, v]) => s + (REFERENCE.has(k) ? 0 : v), 0)])
          .filter(([T, n]) => n > 0 || T > 0)
          .map(([T, n], i) => h("div", { class: "pub-tier", style: `--i:${i}`, title: tierLabel(T) }, h("b", null, String(n)), h("span", null, tierLabel(T))))),
        h("p", { class: "pub-meta" }, icon("clock"), `${secs}s`, h("span", { class: "pub-sep" }), icon("history"), "v" + String(meta.version).slice(-6)));
      actions.replaceChildren(h("button", { class: "btn primary pub-done", onclick: () => close() }, icon("check"), L(["Done", "ສຳເລັດ"])));
      actions.querySelector("button").focus();
    }
    function fail(e){
      console.error(e); setState("err");
      title.textContent = L(["Publishing failed", "ເຜີຍແຜ່ບໍ່ສຳເລັດ"]);
      sub.textContent = errText(e);
      actions.replaceChildren(
        h("button", { class: "btn", onclick: () => close() }, t("close")),
        h("button", { class: "btn primary", onclick: run }, icon("repeat"), L(["Try again", "ລອງໃໝ່"])));
    }

    document.addEventListener("keydown", onKey);
    document.body.append(scrim, box);
    requestAnimationFrame(() => { scrim.classList.add("is-in"); box.classList.add("is-in"); });
    run();
  });
}
