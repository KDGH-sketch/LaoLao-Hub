import fs from "fs";
import { chromium, DEVICES, AXE, newPage, scrollThrough } from "./lib.mjs";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const results = []; const ok = (name, pass, info = "") => { results.push({ name, pass, info }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${info ? "  -> " + info : ""}`); };
const dev = n => DEVICES.find(d => d.n === n);

/* ===== desktop ===== */
{
  const { ctx, page, errors } = await newPage(browser, dev("laptop-1280"), { scheme: "light" });
  const cv = (v) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
  await page.click("[data-theme-set=dark]"); await page.waitForTimeout(900);
  ok("theme: Night sets data-theme=dark", await page.evaluate(() => document.documentElement.dataset.theme) === "dark");
  ok("theme: Night moves moon up and shows stars", (await cv("--moon-y")) === "0px" && (await cv("--star-o")) === "1");
  ok("theme: Night aria-pressed", await page.getAttribute("[data-theme-set=dark]", "aria-pressed") === "true");
  await page.click("[data-theme-set=light]"); await page.waitForTimeout(900);
  ok("theme: Day shows sun", (await cv("--sun-o")) === "1" && (await cv("--moon-y")) === "150px");
  await page.click("[data-theme-set=dark]"); await page.waitForTimeout(500); await page.reload(); await page.evaluate(() => document.fonts.ready);
  ok("theme: choice persists after reload", await page.evaluate(() => document.documentElement.dataset.theme) === "dark");
  await page.click("[data-theme-set=auto]"); await page.waitForTimeout(500);
  ok("theme: Auto removes data-theme", await page.evaluate(() => !document.documentElement.hasAttribute("data-theme")));
  ok("theme: Auto follows system (light scheme -> sun)", (await cv("--sun-o")) === "1");
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(300);
  ok("theme: Auto follows system (dark scheme -> moon)", (await cv("--sun-o")) === "0" && (await cv("--star-o")) === "1");
  await page.emulateMedia({ colorScheme: "light" });

  // language
  await page.click("[data-lang=lo]"); const h1lo = await page.textContent(".hero h1");
  ok("lang: Lao headline", /ຮຽນພາສາລາວ/.test(h1lo), h1lo.slice(0, 40));
  await page.click("[data-lang=zh]"); ok("lang: Chinese headline", /老挝语/.test(await page.textContent(".hero h1")));
  await page.click("[data-lang=en]"); ok("lang: English headline", /Learn Lao/.test(await page.textContent(".hero h1")));

  // auth
  await page.click("#tabUp");
  ok("auth: Create account shows name field + perks", await page.isVisible("#fName") && await page.isVisible("#perks"));
  ok("auth: Sign-in-only demo box hidden on register", !(await page.isVisible("#demo")));
  await page.click("#tabIn"); await page.click("#forgot"); ok("auth: reset hides password", !(await page.isVisible("#fPw")) && /Reset/.test(await page.textContent("#authTitle")));
  await page.click("#forgot"); ok("auth: back to sign in", await page.isVisible("#fPw") && await page.isVisible("#demo"));
  await page.fill("#em", "not-an-email"); await page.fill("#pw", "123"); await page.click("#submit");
  ok("auth: invalid email message", /valid email/.test(await page.textContent("#msg")));
  ok("auth: :user-invalid styling hook fires", await page.$eval("#em", e => e.matches(":user-invalid")));
  await page.fill("#em", "a@b.co"); await page.click("#submit");
  ok("auth: short password message", /at least 6/.test(await page.textContent("#msg")));
  await page.fill("#pw", "secret1"); await page.click("#submit");
  ok("auth: valid submit shows API hook note", /signIn\(\)/.test(await page.textContent("#msg")));
  await page.click("#eye"); ok("auth: show password toggles type", await page.getAttribute("#pw", "type") === "text");
  await page.click("[data-demo='Premium Learner']"); ok("auth: demo account fills form", (await page.inputValue("#em")).startsWith("premium@"));

  // funnel
  await page.evaluate(() => scrollTo({ top: 99999, behavior: "instant" })); await page.waitForTimeout(300);
  await page.locator("[data-res='the consonant chart']").scrollIntoViewIfNeeded(); await page.click("[data-res='the consonant chart']"); await page.waitForTimeout(1100);
  const inView = await page.$eval("#auth", e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  ok("funnel: resource button scrolls to register card with message", inView && await page.isVisible("#fName") && /consonant chart/.test(await page.textContent("#msg")));
  await page.locator("[data-plan=Premium]").scrollIntoViewIfNeeded(); await page.click("[data-plan=Premium]"); await page.waitForTimeout(500);
  ok("funnel: plan button sets plan chip", /Premium plan/.test(await page.textContent("#planChip")));

  // hero widgets
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.click("#hear"); await page.waitForTimeout(700);
  ok("hero: Nop greeting animates arms", await page.$eval(".nop-arm.l", e => getComputedStyle(e).transform !== "none"));
  await page.click("#chips button:nth-child(3)"); ok("hero: consonant chip updates note", /Ngua/.test(await page.textContent("#chipNote")));

  // journey
  await page.locator("#culture").scrollIntoViewIfNeeded();
  const ids = ["luangprabang", "vangvieng", "phonsavan", "vientiane", "champasak", "siphandon"];
  let allScenes = true, names = [];
  for (const id of ids) {
    await page.click(`#jt-${id}`); await page.waitForTimeout(250);
    const on = await page.$$eval(".scn-svg.on", els => els.map(e => e.id));
    const pinOn = await page.$eval(`.pin[data-id=${id}]`, e => e.dataset.on);
    const vis = await page.$eval(`#sc-${id}`, e => { const r = e.getBoundingClientRect(); return r.width > 200 && r.height > 120; });
    if (!(on.length === 1 && on[0] === `sc-${id}` && pinOn === "true" && vis)) allScenes = false;
    names.push(await page.textContent("#jname"));
  }
  ok("journey: each of 6 places shows exactly one scene + active pin", allScenes, names.join(" / "));
  await page.click("#jt-luangprabang"); await page.focus("#jt-luangprabang"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
  ok("journey: ArrowRight moves tab selection + focus", await page.evaluate(() => document.activeElement.id) === "jt-vangvieng");
  await page.keyboard.press("End"); ok("journey: End key selects last place", await page.evaluate(() => document.activeElement.id) === "jt-siphandon");
  await page.click(".pin[data-id=champasak]", { force: true }); ok("journey: map pin click selects place", /Champasak/.test(await page.textContent("#jname")));
  ok("journey: panel has word + listen button", (await page.$$("#jwords .word button")).length >= 2);
  ok("journey: tab roles valid (6 tabs, 1 selected)", await page.evaluate(() => { const t = [...document.querySelectorAll("#jtabs [role=tab]")]; return t.length === 6 && t.filter(x => x.getAttribute("aria-selected") === "true").length === 1; }));

  // fire boats follow the real Mekong
  await page.waitForTimeout(500);
  const dist = await page.evaluate(() => {
    const svg = document.querySelector(".map-svg"), sr = svg.getBoundingClientRect(), river = svg.querySelector(".river"), L = river.getTotalLength();
    const pts = []; for (let i = 0; i <= 600; i++) { const p = river.getPointAtLength(L * i / 600); pts.push([p.x, p.y]); }
    return [...svg.querySelectorAll(".fb")].map(b => { const r = b.getBoundingClientRect(); const x = (r.left + r.width / 2 - sr.left) / sr.width * 740, y = (r.top + r.height / 2 - sr.top) / sr.height * 880; return Math.min(...pts.map(p => Math.hypot(p[0] - x, p[1] - y))); });
  });
  ok("journey: Lai Heua Fai boats sit on the Mekong path", dist.every(x => x < 14), dist.map(x => x.toFixed(1)).join(", ") + " units");

  // festival highlight
  const now = await page.$$eval(".fcard[data-now=true]", els => els.map(e => e.querySelector(".chip.now").textContent + ": " + e.querySelector("h4").textContent));
  ok("festival: exactly one highlighted", now.length === 1, now.join(""));

  // skip link + keyboard
  { const fresh = await newPage(browser, dev("laptop-1280"), { scheme: "light" }); await fresh.page.keyboard.press("Tab");
    ok("keyboard: first Tab stop is the skip link", await fresh.page.evaluate(() => document.activeElement.className === "skip")); await fresh.ctx.close(); }
  let moved = new Set(); for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); moved.add(await page.evaluate(() => document.activeElement.outerHTML.slice(0, 60))); }
  ok("keyboard: Tab walks through many distinct controls (no trap)", moved.size > 25, moved.size + " distinct");
  ok("keyboard: focused control shows a visible outline", await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; }));
  ok("console: no errors on desktop run", errors.filter(e => !/fonts\./.test(e)).length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}

/* ===== mobile ===== */
{
  const { ctx, page, errors } = await newPage(browser, dev("iphone-13-390"), { scheme: "light" });
  ok("mobile: nav shows menu button, hides link row", await page.isVisible(".menu-btn") && !(await page.isVisible(".links")));
  await page.tap(".menu-btn"); await page.waitForTimeout(400);
  ok("mobile: menu opens as popover", await page.$eval("#sheet", e => e.matches(":popover-open")));
  ok("mobile: language switch lives in the menu at 390px", await page.isVisible("#sheet .sheet-lang") && !(await page.isVisible(".nav-lang")));
  await page.tap("#sheet .sheet-lang [data-lang=lo]"); ok("mobile: language switch from menu works", /ຮຽນພາສາລາວ/.test(await page.textContent(".hero h1")));
  await page.tap("#sheet a[href='#news']"); await page.waitForTimeout(900);
  ok("mobile: menu link closes sheet and scrolls to News", !(await page.$eval("#sheet", e => e.matches(":popover-open"))) && await page.$eval("#news", e => Math.abs(e.getBoundingClientRect().top) < 140));
  await page.tap("[data-theme-set=dark]"); await page.waitForTimeout(800);
  ok("mobile: theme switch works by touch", await page.evaluate(() => document.documentElement.dataset.theme) === "dark");
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  const j = await page.$eval("#jtabs", e => ({ w: e.getBoundingClientRect().width, sw: e.scrollWidth }));
  ok("mobile: place tabs wrap (no horizontal scroll)", j.sw <= j.w + 1);
  const fest = await page.$eval("#fest", e => ({ sw: e.scrollWidth, cw: e.clientWidth, snap: getComputedStyle(e).scrollSnapType }));
  ok("mobile: festival strip scrolls sideways with snap", fest.sw > fest.cw && /x mandatory/.test(fest.snap), `${fest.sw}>${fest.cw}`);
  ok("console: no errors on mobile run", errors.filter(e => !/fonts\./.test(e)).length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}

/* ===== reduced motion ===== */
{
  const { ctx, page } = await newPage(browser, dev("laptop-1280"), { scheme: "light", reduce: true });
  await scrollThrough(page);
  const n = await page.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.effect?.getTiming().iterations === Infinity).length);
  ok("reduced-motion: no infinite animations running", n === 0, n + " running");
  ok("reduced-motion: river fully drawn", await page.$eval(".river", e => parseFloat(getComputedStyle(e).strokeDashoffset) === 0));
  ok("reduced-motion: content fully opaque", await page.evaluate(() => [...document.querySelectorAll(".rv")].every(e => +getComputedStyle(e).opacity === 1)));
  await ctx.close();
}
{
  const { ctx, page } = await newPage(browser, dev("laptop-1280"), { scheme: "dark" });
  const run = await page.evaluate(() => { const a = document.getAnimations(); return { total: a.length, infinite: a.filter(x => x.effect?.getTiming().iterations === Infinity).length }; });
  console.log("INFO animations at rest (night):", JSON.stringify(run));
  await page.evaluate(() => scrollTo({ top: 2600, behavior: "instant" })); await page.waitForTimeout(600);
  ok("perf: hero animations pause when scrolled off-screen", await page.$eval("#hero", e => e.hasAttribute("data-off")));
  await ctx.close();
}

/* ===== text zoom (WCAG 1.4.4) and reflow (1.4.10) ===== */
{
  const { ctx, page } = await newPage(browser, dev("laptop-1280"), { scheme: "light" });
  await page.addStyleTag({ content: "html{font-size:200%!important}" }); await page.waitForTimeout(500); await scrollThrough(page);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok("zoom: 200% text size causes no horizontal scroll at 1280", r.sw <= r.cw, `${r.sw}/${r.cw}`);
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const p2 = await c2.newPage();
  const { wireFonts, PAGE } = await import("./lib.mjs"); await wireFonts(c2); await p2.goto(PAGE); await p2.evaluate(() => document.fonts.ready);
  await p2.addStyleTag({ content: "html{font-size:150%!important}" }); await p2.waitForTimeout(500);
  const r2 = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok("zoom: 150% text at 320px width reflows without sideways scroll", r2.sw <= r2.cw, `${r2.sw}/${r2.cw}`);
  await c2.close();
}

/* ===== axe-core ===== */
const axeRows = [];
for (const [dn, scheme, reduce] of [["laptop-1280", "light", true], ["laptop-1280", "dark", true], ["iphone-13-390", "light", true], ["iphone-13-390", "dark", true], ["laptop-1280", "light", false]]) {
  const { ctx, page } = await newPage(browser, dev(dn), { scheme, reduce });
  await scrollThrough(page); await page.waitForTimeout(500);
  await page.evaluate(AXE);
  const res = await page.evaluate(async () => await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] }));
  for (const v of res.violations) axeRows.push({ dn, scheme, reduce, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map(n => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || n.none[0]?.message || "").slice(0, 150)), count: v.nodes.length });
  console.log(`axe ${dn} ${scheme}${reduce ? " reduced" : ""}: ${res.violations.length} rule violations`);
  await ctx.close();
}
fs.writeFileSync("axe-report.json", JSON.stringify(axeRows, null, 1));
ok("axe: zero violations across 5 runs", axeRows.length === 0, axeRows.map(r => r.id).filter((v, i, a) => a.indexOf(v) === i).join(","));
await browser.close();
const fails = results.filter(r => !r.pass); console.log(`\n${results.length - fails.length}/${results.length} passed`); fails.forEach(f => console.log("  FAILED:", f.name, f.info));
