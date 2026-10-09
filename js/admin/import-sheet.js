// Admin → Excel / CSV Importer. 1 choose the content type and download an .xlsx template, 2 upload the filled file
// (.xlsx, or CSV / TSV in UTF-8; comma, semicolon or tab), 3 review every row (new / update / error, with the reason),
// 4 import: new items are added, existing ones get only the filled-in cells, and each changed item keeps a version.
// File reading: js/shared/sheet-io.js. Rules: js/admin/import-map.js. Tests: scripts/test_import.mjs, scripts/e2e_import.mjs.
import { h, icon, toast, errText } from "../shared/ui.js";
import { writeXlsx, readSheetFile, toCsv } from "../shared/sheet-io.js";
import { TYPES, TYPE_ORDER, templateSheets, guessType, validateRows, buildItems, exportSheets, message } from "./import-map.js";
import { CLASS_OF } from "../shared/lao-script.js";
import { S, L, go, canEditMenu, markUnpublished, audit } from "./state.js";
import { engine, autoPinyin } from "./cms.js";

// replaceChildren() prints a missing (null) part as the text "null"
const put = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null));
const save = (bytes, name, mime) => {
  const a = h("a", { href: URL.createObjectURL(new Blob([bytes], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const FILE_ERR = {
  xls_old: ["This is an old Excel 97–2003 file (.xls). In Excel choose File → Save As → Excel Workbook (.xlsx), then upload that.", "ນີ້ແມ່ນໄຟລ໌ Excel ແບບເກົ່າ (.xls). ໃນ Excel ເລືອກ File → Save As → Excel Workbook (.xlsx) ແລ້ວອັບໂຫຼດໄຟລ໌ນັ້ນ."],
  not_zip: ["This file isn't a working .xlsx file. Open it in Excel and save it again as Excel Workbook (.xlsx).", "ໄຟລ໌ນີ້ບໍ່ແມ່ນ .xlsx ທີ່ໃຊ້ໄດ້. ເປີດໃນ Excel ແລ້ວບັນທຶກເປັນ Excel Workbook (.xlsx) ອີກຄັ້ງ."],
  bad_zip: ["This file is damaged. Open it in Excel and save it again as Excel Workbook (.xlsx).", "ໄຟລ໌ນີ້ເສຍ. ເປີດໃນ Excel ແລ້ວບັນທຶກເປັນ .xlsx ອີກຄັ້ງ."],
  not_xlsx: ["This zip file isn't an Excel workbook.", "ໄຟລ໌ zip ນີ້ບໍ່ແມ່ນ Excel."],
  empty: ["The file has no rows.", "ໄຟລ໌ບໍ່ມີຂໍ້ມູນ."]
};
const WARN = {
  not_utf8: ["This CSV wasn't saved as UTF-8, so Lao letters may be lost. In Excel use File → Save As → “CSV UTF-8”, or upload the .xlsx file instead.", "CSV ນີ້ບໍ່ໄດ້ບັນທຶກເປັນ UTF-8 ຕົວອັກສອນລາວອາດຫາຍ. ໃນ Excel ໃຊ້ Save As → “CSV UTF-8” ຫຼື ອັບໂຫຼດໄຟລ໌ .xlsx ແທນ."],
  one_column: ["Everything is in one column. The file may use a separator we couldn't detect: upload the .xlsx file instead.", "ຂໍ້ມູນຢູ່ຖັນດຽວ. ກະລຸນາອັບໂຫຼດໄຟລ໌ .xlsx ແທນ."]
};

export function viewImport({ type: startType } = {}){
  let type = TYPES[startType] ? startType : "vocabulary", file = null, read = null, check = null, existing = [], existingType = null, busy = false;
  const root = h("div", { class: "stack-l imp" });
  const step2 = h("div"), step3 = h("div"), result = h("div");
  const fileIn = h("input", { type: "file", accept: ".xlsx,.csv,.tsv,.txt,.xls", hidden: true, onchange: e => { const f = e.target.files[0]; e.target.value = ""; if (f) load(f); } });

  const typeSeg = () => h("div", { class: "seg imp-types", role: "radiogroup", "aria-label": L(["Content type", "ປະເພດເນື້ອຫາ", "内容类型"]) },
    TYPE_ORDER.map(k => { const T = TYPES[k]; return h("button", { type: "button", role: "radio", "aria-pressed": String(type === k), "aria-checked": String(type === k),
      onclick: () => { type = k; draw(); if (read) review(); } }, L([T.label, T.lo]), T.grouped ? h("small", null, " · " + L(["rows → items", "ແຖວ → ລາຍການ", "多行 → 一项"])) : null); }));
  // everything of this type as a workbook: edit it in Excel, then import it again (rows update the same items)
  async function exportAll(){
    const docs = await S.api.db.list(type).catch(() => []);
    if (!docs.length){ toast(L(["Nothing to export yet.", "ຍັງບໍ່ມີຂໍ້ມູນ.", "暂无可导出的内容。"]), "warn"); return; }
    save(writeXlsx(exportSheets(type, docs)), `LaoLao_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    toast(L(["Exported ", "ສົ່ງອອກ ", "已导出 "]) + docs.length, "ok");
  }
  function template(kind){
    if (kind === "csv"){ const rows = templateSheets(type)[0].rows; save(new TextEncoder().encode(toCsv(rows)), `LaoLao_${type}_template.csv`, "text/csv;charset=utf-8"); }
    else save(writeXlsx(templateSheets(type)), `LaoLao_${type}_template.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    toast(L(["Template downloaded", "ດາວໂຫຼດແມ່ແບບແລ້ວ", "模板已下载"]), "ok");
  }
  const drop = h("div", { class: "imp-drop", tabindex: "0", role: "button", "aria-label": L(["Choose a file", "ເລືອກໄຟລ໌", "选择文件"]),
    onclick: () => fileIn.click(), onkeydown: e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); fileIn.click(); } } },
    icon("upload"), h("b", null, L(["Drop your Excel or CSV file here, or click to choose", "ລາກໄຟລ໌ Excel ຫຼື CSV ມາວາງບ່ອນນີ້ ຫຼື ກົດເພື່ອເລືອກ", "把 Excel 或 CSV 文件拖到这里，或点击选择"])),
    h("small", { class: "muted" }, ".xlsx · .csv (UTF-8) · .tsv"));
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) load(f); });

  function draw(){
    put(root, 
      h("div", { class: "pagehead" }, h("h1", null, L(["Excel & CSV import", "ນຳເຂົ້າເນື້ອຫາຜ່ານ Excel / CSV", "Excel / CSV 导入"])),
        h("p", null, L(["Add or update many items at once from a spreadsheet: vocabulary, dictionary, grammar, sentence patterns, lessons, dialogues, quizzes, videos, culture and Lao letters. Every row is checked before anything is saved; export what you have, edit it in Excel and import it back.",
          "ເພີ່ມ ຫຼື ແກ້ໄຂຫຼາຍລາຍການພ້ອມກັນຈາກ Excel: ຄຳສັບ, ວັດຈະນານຸກົມ, ໄວຍາກອນ, ໂຄງສ້າງປະໂຫຍກ, ບົດຮຽນ, ບົດສົນທະນາ, ແບບທົດສອບ, ວິດີໂອ, ວັດທະນະທຳ ແລະ ຕົວອັກສອນ. ທຸກແຖວຈະຖືກກວດກ່ອນບັນທຶກ; ສົ່ງອອກ, ແກ້ໃນ Excel ແລ້ວນຳເຂົ້າຄືນໄດ້.",
          "用表格一次添加或更新大量内容：词汇、词典、语法、句型、课程、对话、测验、视频、文化和老挝字母。保存前逐行检查；可导出现有内容，在 Excel 中编辑后再导入。"]))),
      h("section", { class: "card stack imp-step" },
        h("h2", null, h("span", { class: "imp-n" }, "1"), L(["Choose what to import and get the template", "ເລືອກປະເພດ ແລະ ດາວໂຫຼດແມ່ແບບ", "选择类型并下载模板"])),
        typeSeg(),
        h("div", { class: "row" },
          h("button", { class: "btn primary", onclick: () => template("xlsx") }, icon("download"), L(["Excel template (.xlsx)", "ແມ່ແບບ Excel (.xlsx)", "Excel 模板 (.xlsx)"])),
          h("button", { class: "btn ghost sm", onclick: () => template("csv") }, icon("download"), L(["CSV (UTF-8)", "CSV (UTF-8)", "CSV (UTF-8)"])),
          h("button", { class: "btn sm", onclick: exportAll }, icon("download"), L(["Export current " + TYPES[type].label.toLowerCase() + " (.xlsx)", "ສົ່ງອອກ" + TYPES[type].lo + "ທີ່ມີ (.xlsx)", "导出现有" + TYPES[type].label + " (.xlsx)"]))),
        TYPES[type].grouped ? h("p", { class: "small" }, icon("info"), " ", L(["One row per " + (type === "quizzes" ? "question" : "line") + ": rows with the same ID make one " + (type === "quizzes" ? "quiz" : "dialogue") + "; a row with an empty ID continues the one above.",
          "ແຖວລະ" + (type === "quizzes" ? "ຄຳຖາມ" : "ປະໂຫຍກ") + ": ແຖວທີ່ມີ ID ດຽວກັນເປັນລາຍການດຽວ; ແຖວທີ່ ID ວ່າງ ຕໍ່ຈາກລາຍການຂ້າງເທິງ.", "每行一个" + (type === "quizzes" ? "题目" : "句子") + "：相同 ID 的行组成一项；ID 为空的行接续上一项。"])) : null,
        h("p", { class: "small muted" }, L(["Fill the “Data” sheet, one row per item; the “Guide” sheet explains every column. Columns can be in any order. A blank cell keeps the current value of an existing item.",
          "ຕື່ມຂໍ້ມູນໃນແຜ່ນ “Data” ແຖວລະລາຍການ; ແຜ່ນ “Guide” ອະທິບາຍທຸກຖັນ. ຖັນລຽງແບບໃດກໍໄດ້. ຊ່ອງທີ່ວ່າງຈະບໍ່ລົບຄ່າເດີມ.", "在 “Data” 表中每行填写一项；“Guide” 表说明每一列。列的顺序不限。空单元格不会覆盖已有内容。"]))),
      h("section", { class: "card stack imp-step" },
        h("h2", null, h("span", { class: "imp-n" }, "2"), L(["Upload the filled file", "ອັບໂຫຼດໄຟລ໌", "上传文件"])), drop, fileIn, step2),
      step3, result);
  }

  async function load(f){
    file = f; read = null; check = null; result.replaceChildren(); step3.replaceChildren();
    put(step2, h("p", { class: "muted small" }, L(["Reading ", "ກຳລັງອ່ານ ", "正在读取 "]) + f.name + "…"));
    try {
      read = await readSheetFile({ name: f.name, buffer: await f.arrayBuffer() });
      if (!read.rows.length) throw new Error("empty");
      // the file's own headers say which content it is
      const g = guessType(read.rows[0] || []);
      if (g && g !== type && validateRows(read.rows, type).headers.missing.length){ type = g; draw(); }
      review();
    } catch(e){
      const m = FILE_ERR[e.message];
      put(step2, h("div", { class: "banner bad", role: "alert" }, icon("fail"), h("span", null, m ? L(m) : L(["Could not read the file: ", "ອ່ານໄຟລ໌ບໍ່ໄດ້: ", "无法读取文件："]) + errText(e))));
    }
  }

  async function review(){
    if (!read) return;
    if (existingType !== type){ existing = await S.api.db.list(type).catch(() => []); existingType = type; }
    // lessons link to patterns, grammar, dialogues and quizzes: links to items that don't exist are flagged
    let refs = null;
    if (type === "lessons"){
      const [pt, gr, dl, qz] = await Promise.all(["patterns", "grammar", "dialogues", "quizzes"].map(t => S.api.db.list(t).catch(() => [])));
      refs = { patterns: new Set(pt.map(x => String(x.n))), grammar: new Set(gr.map(x => String(x.id))), dialogues: new Set(dl.map(x => String(x.id))), quizzes: new Set(qz.map(x => String(x.id))) };
    }
    check = validateRows(read.rows, type, { existing, refs });
    const H = check.headers, sum = check.summary;
    const info = read.format === "xlsx" ? L(["Excel workbook · sheet ", "Excel · ແຜ່ນ ", "Excel 工作簿 · 工作表 "]) + "“" + read.sheet + "”"
      : "CSV · " + L(["separated by ", "ແຍກດ້ວຍ ", "分隔符 "]) + ({ ",": "comma (,)", ";": "semicolon (;)", "\t": "tab" }[read.delimiter] || read.delimiter) + " · " + (read.encoding || "");
    put(step2, 
      h("div", { class: "imp-file" }, icon("check"), h("b", null, file.name), h("span", { class: "muted small" }, info + " · " + (read.rows.length - 1) + L([" rows", " ແຖວ", " 行"]))),
      ...read.warnings.map(w => h("div", { class: "banner", role: "status" }, icon("info"), h("span", null, L(WARN[w])))),
      H.missing.length ? h("div", { class: "banner bad", role: "alert" }, icon("fail"), h("span", null,
        L(["Missing column: ", "ບໍ່ມີຖັນ: ", "缺少列："]) + H.missing.join(", ") + ". " + L(["The first row must hold the column names from the template.", "ແຖວທຳອິດຕ້ອງເປັນຊື່ຖັນຕາມແມ່ແບບ.", "第一行必须是模板中的列名。"]))) : null,
      H.unknown.length ? h("p", { class: "small muted" }, L(["Ignored columns: ", "ຖັນທີ່ບໍ່ໃຊ້: ", "忽略的列："]) + H.unknown.join(", ")) : null,
      h("div", { class: "imp-map small" }, TYPES[type].columns.map(c => h("span", { class: "chip " + (c.key in H.map ? "lv" : c.required ? "bad" : "") }, (c.key in H.map ? "✓ " : c.required ? "✗ " : "– ") + c.header))));
    if (H.missing.length){ step3.replaceChildren(); return; }
    // the whole file lost its Lao letters (Excel "CSV" instead of "CSV UTF-8"): say so once, at the top
    if (check.rows.some(r => r.errors.some(e => e.code === "lao_lost"))) step2.append(h("div", { class: "banner bad", role: "alert" }, icon("fail"), h("span", null,
      L(["Lao letters in this file were replaced by ??? when it was saved, so those rows can't be imported. Open the original in Excel, choose File → Save As → Excel Workbook (.xlsx) or “CSV UTF-8”, and upload it again.",
        "ຕົວອັກສອນລາວໃນໄຟລ໌ນີ້ກາຍເປັນ ??? ຕອນບັນທຶກ, ຈຶ່ງນຳເຂົ້າແຖວເຫຼົ່ານັ້ນບໍ່ໄດ້. ເປີດໄຟລ໌ຕົ້ນສະບັບໃນ Excel ເລືອກ Save As → Excel Workbook (.xlsx) ຫຼື “CSV UTF-8” ແລ້ວອັບໂຫຼດອີກຄັ້ງ.",
        "此文件保存时老挝文字变成了 ???，这些行无法导入。请在 Excel 中打开原文件，选择“另存为 → Excel 工作簿 (.xlsx)”或“CSV UTF-8”后重新上传。"]))));

    let onlyBad = false;
    const status = h("select", { class: "input", style: "width:auto" }, h("option", { value: "published" }, L(["Published", "ເຜີຍແຜ່", "已发布"])), h("option", { value: "draft" }, L(["Draft (check before learners see it)", "ສະບັບຮ່າງ", "草稿"])));
    const doUpdate = h("input", { type: "checkbox", checked: true, onchange: () => go2() });
    const canEdit = canEditMenu(type);
    const tableBox = h("div", { class: "tbl-wrap imp-table" });
    const main = TYPES[type].columns.slice(0, 4);
    function table(){
      const rows = check.rows.filter(r => !onlyBad || r.errors.length || r.warnings.length);
      const chip = r => r.action === "error" ? h("span", { class: "chip bad" }, L(["Error", "ຜິດພາດ", "错误"])) : r.action === "update" ? h("span", { class: "chip acc" }, L(["Update", "ແກ້ໄຂ", "更新"])) : h("span", { class: "chip lv" }, L(["New", "ໃໝ່", "新增"]));
      put(tableBox, h("table", { class: "tbl" },
        h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, L(["Status", "ສະຖານະ", "状态"])), main.map(c => h("th", null, c.header)), h("th", null, L(["Problems", "ບັນຫາ", "问题"])))),
        h("tbody", null, rows.slice(0, 300).map(r => h("tr", { class: r.action === "error" ? "bad" : "" },
          h("td", { class: "tabnum muted" }, String(r.line)), h("td", null, chip(r)),
          main.map(c => h("td", { class: /[຀-໿]/.test(r.fields[c.key]) ? "lo" : "" }, r.fields[c.key])),
          h("td", { class: "imp-probs" }, [...r.errors.map(e => h("div", { class: "bad" }, "✗ " + e.col + ": " + message(e))), ...r.warnings.map(w => h("div", { class: "warn" }, "! " + w.col + ": " + message(w)))]))))),
        rows.length > 300 ? h("p", { class: "small muted" }, L(["Showing the first 300 rows.", "ສະແດງ 300 ແຖວທຳອິດ.", "仅显示前 300 行。"])) : null);
    }
    const importBtn = h("button", { class: "btn primary", onclick: () => commit(status.value, doUpdate.checked) });
    function go2(){
      const n = sum.new + (doUpdate.checked ? sum.update : 0);
      put(importBtn, icon("upload"), L(["Import ", "ນຳເຂົ້າ ", "导入 "]) + n + L([" items", " ລາຍການ", " 项"]));
      importBtn.disabled = !n || !canEdit || busy;
    }
    put(step3, h("section", { class: "card stack imp-step" },
      h("h2", null, h("span", { class: "imp-n" }, "3"), L(["Check the rows", "ກວດແຖວ", "检查数据"])),
      h("div", { class: "imp-sum" },
        h("div", null, h("b", { class: "tabnum" }, String(sum.rows)), h("span", null, L(["rows", "ແຖວ", "行"]) + (sum.grouped ? " → " + sum.items + " " + L([type === "quizzes" ? "quizzes" : "dialogues", type === "quizzes" ? "ແບບທົດສອບ" : "ບົດສົນທະນາ", "项"]) : ""))),
        h("div", { class: "ok" }, h("b", { class: "tabnum" }, String(sum.new)), h("span", null, L(["new", "ໃໝ່", "新增"]))),
        h("div", { class: "acc" }, h("b", { class: "tabnum" }, String(sum.update)), h("span", null, L(["update existing", "ແກ້ໄຂທີ່ມີແລ້ວ", "更新已有"]))),
        h("div", { class: "bad" }, h("b", { class: "tabnum" }, String(sum.error)), h("span", null, L(["with errors (skipped)", "ມີຂໍ້ຜິດພາດ (ຂ້າມ)", "有错误（跳过）"]))),
        h("div", { class: "warn" }, h("b", { class: "tabnum" }, String(sum.warnings)), h("span", null, L(["warnings", "ຄຳເຕືອນ", "警告"])))),
      h("label", { class: "row small" }, h("input", { type: "checkbox", onchange: e => { onlyBad = e.target.checked; table(); } }), L(["Only rows with problems", "ສະເພາະແຖວທີ່ມີບັນຫາ", "只看有问题的行"])),
      tableBox,
      h("div", { class: "row imp-opts" },
        h("label", { class: "row small" }, L(["New items: ", "ລາຍການໃໝ່: ", "新增项："]), status),
        sum.update ? h("label", { class: "row small" }, doUpdate, L(["Update the " + sum.update + " existing items", "ແກ້ໄຂ " + sum.update + " ລາຍການທີ່ມີແລ້ວ", "更新 " + sum.update + " 个已有项"])) : null),
      canEdit ? null : h("div", { class: "banner" }, icon("lock"), h("span", null, L(["Your role can't edit this content type.", "ບົດບາດຂອງທ່ານແກ້ໄຂເນື້ອຫານີ້ບໍ່ໄດ້.", "您的角色无法编辑此类内容。"]))),
      h("div", { class: "row", style: "justify-content:flex-end" }, sum.error ? h("button", { class: "btn ghost sm", onclick: errorReport }, icon("download"), L(["Download the rows with errors", "ດາວໂຫຼດແຖວທີ່ຜິດພາດ", "下载有错误的行"])) : null, importBtn)));
    table(); go2();
  }

  // the rows with errors, plus a "Problem" column, to fix in Excel and upload again
  function errorReport(){
    const head = read.rows[0], bad = check.rows.filter(r => r.errors.length);
    const rows = [[...head, "Problem"], ...bad.map(r => [...read.rows[r.line - 1].map(x => x ?? ""), r.errors.map(e => e.col + ": " + message(e)).join(" | ")])];
    save(writeXlsx([{ name: "Data", header: true, rows, widths: head.map(() => 18).concat(60) }]), `LaoLao_${type}_errors.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  async function commit(status, withUpdates){
    if (busy) return; busy = true;
    const bar = h("i"), label = h("span", { class: "small muted tabnum" });
    put(result, h("section", { class: "card stack imp-step" }, h("h2", null, h("span", { class: "imp-n" }, "4"), L(["Importing…", "ກຳລັງນຳເຂົ້າ…", "正在导入…"])), h("div", { class: "imp-bar" }, bar), label));
    step3.querySelectorAll("button, input, select").forEach(b => b.disabled = true);
    let eng = null; try { eng = await engine(); } catch(e){}
    const romanize = eng ? t => autoPinyin(eng, t) : null;
    const nextN = Math.max(0, ...existing.map(p => +p.n || 0)) + 1;
    const now = new Date(), who = S.me ? S.me.uid : "", ops = [];
    // rows → items (a dialogue or quiz is several rows); each changed item keeps its previous version
    const todo = buildItems(check, type, { romanize, nextN, status, who, now, withUpdates, classOf: c => CLASS_OF[c] || "" });
    for (const it of todo){
      if (it.existing){ const snap = Object.assign({}, it.existing); delete snap.id; delete snap.key;
        ops.push({ op: "set", path: `${type}/${it.id}/versions/v${String(it.existing.version || 1).padStart(4, "0")}`, data: { data: JSON.stringify(snap), version: it.existing.version || 1, savedAt: now, savedBy: who } }); }
      ops.push({ op: "set", path: `${type}/${it.id}`, data: it.data, item: it });
    }
    let done = 0, failed = [];
    const STEP = 50;
    for (let i = 0; i < ops.length; i += STEP){
      const chunk = ops.slice(i, i + STEP);
      try { await S.api.db.batch(chunk.map(({ item, ...o }) => o)); done += chunk.filter(o => o.item).length; }
      catch(e){ failed.push({ rows: chunk.filter(o => o.item).flatMap(o => o.item.lines), error: errText(e) }); }
      bar.style.width = Math.round(100 * Math.min(ops.length, i + STEP) / ops.length) + "%";
      label.textContent = done + " / " + todo.length;
    }
    if (done){
      await S.api.db.set("settings/bundle", { dirty: true, changedAt: now }, true).catch(() => {});
      markUnpublished(); audit("import", type, done + " items from " + file.name);
    }
    busy = false;
    const nNew = todo.filter(r => !r.existing).length, nUp = todo.length - nNew;
    put(result, h("section", { class: "card stack imp-step" },
      h("h2", null, h("span", { class: "imp-n" }, "4"), failed.length ? L(["Imported with problems", "ນຳເຂົ້າແລ້ວ ແຕ່ມີບັນຫາ", "导入完成但有问题"]) : L(["Import complete", "ນຳເຂົ້າສຳເລັດ", "导入完成"])),
      h("div", { class: "banner " + (failed.length ? "bad" : "ok"), role: "status" }, icon(failed.length ? "fail" : "check"),
        h("span", null, L(["Saved ", "ບັນທຶກ ", "已保存 "]) + done + " / " + todo.length + " (" + nNew + L([" new, ", " ໃໝ່, ", " 新增，"]) + nUp + L([" updated", " ແກ້ໄຂ", " 更新"]) + ")" +
          (check.summary.error ? " · " + check.summary.error + L([" rows with errors were skipped", " ແຖວທີ່ຜິດພາດຖືກຂ້າມ", " 行有错误已跳过"]) : ""))),
      ...failed.map(f => h("div", { class: "banner bad" }, h("span", null, L(["Not saved, rows ", "ບໍ່ໄດ້ບັນທຶກ ແຖວ ", "未保存，行 "]) + f.rows.join(", ") + ": " + f.error))),
      h("p", { class: "small muted" }, L(["Learners see the changes after you press Publish now.", "ຜູ້ຮຽນຈະເຫັນຫຼັງຈາກກົດ ເຜີຍແຜ່ດຽວນີ້.", "点击“立即发布”后学员才能看到。"])),
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => go("contentList", { type }) }, icon("list"), L(["Open the list", "ເປີດລາຍການ", "打开列表"])),
        h("button", { class: "btn ghost", onclick: () => { file = read = check = null; existingType = null; draw(); } }, icon("upload"), L(["Import another file", "ນຳເຂົ້າໄຟລ໌ອື່ນ", "导入另一个文件"])))));
    if (done) toast(L(["Imported ", "ນຳເຂົ້າ ", "已导入 "]) + done, "ok");
  }

  draw();
  return root;
}
