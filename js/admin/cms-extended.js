// Extended Admin Features: Voice Recording Studio, Excel Import Wizard, Video Manager, Promotions & Feed, Content Health
import { h, $$, icon, toast, tr, dialog, confirmDialog, errText, debounce, videoSource } from "../shared/ui.js";
import { parseTranscript, mergeTranslation, transcriptOf, recapOf, formatTime } from "../shared/video.js";
import { t, lang } from "../shared/i18n.js";
import { speak } from "../shared/speech.js";
import { S, go, fld, isSuper, canContent, canEditMenu, markUnpublished } from "./state.js";
import { saveContent } from "../shared/content.js";
import { refreshBundleState } from "./main.js";
import { viewImport } from "./import-sheet.js";

export const EXT_VIEWS = {};

// =========================================================================
// 1. ADMIN VOICE RECORDING STUDIO (ຫ້ອງບັນທຶກສຽງພາກ)
// =========================================================================
// EXT_VIEWS.audioStudio moved to voice-studio.js (viewVoiceStudio)

// Excel / CSV importer: js/admin/import-sheet.js
EXT_VIEWS.excelImport = viewImport;

// =========================================================================
// 3. ADMIN VIDEO MANAGER (ຈັດການວິດີໂອ)
// =========================================================================
EXT_VIEWS.videoManager = async () => {
  const root = h("div",{class:"stack-l"});
  const canEdit = canEditMenu("videos");
  root.append(h("div",{class:"pagehead"},
    h("div",{class:"spread"},
      h("h1",null, lang()==="lo" ? "ຈັດການວິດີໂອບົດຮຽນ (Video Manager)" : "Video Content Manager"),
      h("div",{class:"row",style:"gap:8px"},
        h("button",{class:"btn ghost sm",onclick:()=>go("contentList",{type:"videos"})}, icon("content"), "Open in Universal CMS"),
        h("a",{href:"../",class:"btn ghost sm"}, icon("home"), t("adm_open_learner"))
      )
    ),
    h("p",null, "Paste any YouTube link (watch, youtu.be, shorts or embed) or a direct .mp4 / .webm file link. Changes are saved to the database right away; learners see them after you click Publish now.")
  ));

  if (!canEdit) {
    root.append(h("div",{class:"banner ok",style:"background:var(--surface-2);border-left:4px solid var(--violet);margin-bottom:12px;display:flex;align-items:center;gap:8px"}, icon("eye"), h("span",null,t("read_only_banner"))));
  }

  let videos = [], loadError = null;
  const load = async () => { try { videos = await S.api.db.list("videos"); loadError = null; } catch(e){ videos = []; loadError = e; } };
  await load();

  // Turns what the admin pasted into a stored, playable URL (null when invalid)
  const toStored = url => { const s = videoSource(url); return s.kind === "invalid" ? null : s.src; };
  const preview = (url, big) => {
    const s = videoSource(url);
    if (s.kind === "invalid") return h("div",{class:"small",style:"color:var(--bad)"}, url ? "Not a valid YouTube or video link." : "");
    if (!big && s.kind === "youtube") return h("img",{src:s.thumb,alt:"",loading:"lazy",style:"width:132px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;flex:none"});
    if (!big) return h("span",{class:"pill"}, s.kind === "file" ? "video file" : "embed");
    const player = s.kind === "file" ? h("video",{src:s.src,controls:true,preload:"metadata"})
      : h("iframe",{src:s.src,title:"Preview",referrerpolicy:"strict-origin-when-cross-origin",allow:"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",allowfullscreen:true});
    return h("div",{class:"video-embed-wrap",style:"border-radius:10px"}, player);
  };
  const saved = async msg => {
    await refreshBundleState();
    toast(msg + " Click “Publish now” so learners see it.", "ok");
    S.render();   // redraws the page and the header publish button
  };

  const changeLink = async v => {
    const inp = h("input",{class:"input",value:v.embedUrl||"",placeholder:"https://www.youtube.com/watch?v=…"});
    const box = h("div",null, preview(v.embedUrl, true));
    inp.addEventListener("input", () => box.replaceChildren(preview(inp.value.trim(), true)));
    await dialog({ title:"Change video link · " + ((v.title && (v.title.en || v.title.lo)) || v.id), wide:true,
      body:h("div",{class:"stack"}, fld("Video link (YouTube or .mp4)", inp), box),
      actions:[{label:t("cancel"),value:false},{label:t("save"),primary:true,onClick:async()=>{
        const url = toStored(inp.value);
        if (!url){ toast("Not a valid YouTube or video link", "bad"); return false; }
        try { await saveContent(S.api, "videos", v.id, Object.assign({}, v, { embedUrl:url }), S.me.uid); markUnpublished(); }
        catch(e){ toast(errText(e), "bad"); return false; }
        await saved("Video link updated.");
        return true;
      }}] });
  };

  // Import a timed transcript: pasted from YouTube's "Show transcript" panel, or an .srt / .vtt file
  const transcriptDialog = async v => {
    const src = videoSource(v.embedUrl), current = transcriptOf(v);
    const ta = h("textarea",{class:"input mono",style:"min-height:200px",placeholder:"0:00\nສະບາຍດີ ທຸກຄົນ\n0:04\nມື້ນີ້ພວກເຮົາຈະຮຽນ…"});
    const taTr = h("textarea",{class:"input",style:"min-height:90px",placeholder:"Optional: an English translation with the same timestamps (pasted the same way)"});
    const fileIn = h("input",{type:"file",accept:".srt,.vtt,.txt,text/plain,text/vtt",onchange:async e=>{ const fl = e.target.files[0]; if (fl){ ta.value = await fl.text(); update(); } }});
    const out = h("div",{class:"stack",style:"gap:8px"});
    let parsed = null;
    const update = () => {
      parsed = ta.value.trim() ? parseTranscript(ta.value) : null;
      out.replaceChildren();
      if (!parsed) return;
      let matched = 0;
      if (parsed.timed && taTr.value.trim()){ const p2 = parseTranscript(taTr.value); if (p2.timed) matched = mergeTranslation(parsed.segments, p2.segments, "en"); }
      const segs = parsed.segments, last = segs[segs.length - 1];
      out.append(h("div",{class:"banner "+(parsed.timed && segs.length ? "ok" : "")},
        parsed.timed && segs.length
          ? `✓ ${segs.length} timed lines (${parsed.format === "youtube" ? "YouTube transcript" : parsed.format.toUpperCase()}), 0:00 – ${formatTime(last.end)}${taTr.value.trim() ? " · translation matched on " + matched + " lines" : ""}`
          : "✗ No timestamps found. Copy the transcript from YouTube with its timestamps, or upload an .srt / .vtt file."));
      parsed.warnings.forEach(w => out.append(h("p",{class:"small muted",style:"margin:0"}, w)));
      if (parsed.timed && segs.length) out.append(h("div",{class:"tbl-wrap",style:"max-height:220px;overflow:auto"}, h("table",{class:"tbl"},
        h("tbody",null, segs.slice(0, 50).map(x => h("tr",null, h("td",{class:"mono small",style:"white-space:nowrap"}, formatTime(x.start)), h("td",null, x.text, x.en ? h("div",{class:"small muted"}, x.en) : null)))))));
    };
    ta.addEventListener("input", debounce(update, 200));
    taTr.addEventListener("input", debounce(update, 200));
    const steps = h("ol",{class:"small",style:"margin:0;padding-left:18px;line-height:1.7"},
      h("li",null, "Open the video on YouTube", src.watch ? [" (", h("a",{href:src.watch,target:"_blank",rel:"noopener"}, "open ↗"), ")"] : "", "."),
      h("li",null, "Under the video, click “…more”, then “Show transcript”."),
      h("li",null, "Select all the lines in the transcript panel (drag from the first to the last line) and copy."),
      h("li",null, "Paste here. Timestamps are kept, so each line will follow the video."));
    await dialog({ title:"Transcript · " + ((v.title && (v.title.en || v.title.lo)) || v.id), wide:true,
      body:h("div",{class:"stack"},
        h("p",{class:"small muted",style:"margin:0"}, current.timed ? `This video has ${current.lines.length} transcript lines. Importing replaces them.` : "This video has no synced transcript yet."),
        steps,
        fld("Transcript (YouTube copy, .srt or .vtt)", ta),
        h("label",{class:"btn sm",style:"align-self:flex-start"}, icon("upload"), "Upload .srt / .vtt file", h("span",{hidden:true}, fileIn)),
        fld("English translation (optional)", taTr),
        out),
      actions:[
        { label:t("cancel"), value:false },
        current.timed ? { label:"Remove transcript", onClick:async()=>{
          if (!await confirmDialog("Remove transcript", "Delete all transcript lines of this video?", "Remove", t("cancel"), true)) return false;
          try { await saveContent(S.api, "videos", v.id, Object.assign({}, v, { transcript:[] }), S.me.uid); markUnpublished(); } catch(e){ toast(errText(e), "bad"); return false; }
          await saved("Transcript removed."); return true; } } : null,
        { label:"Save transcript", primary:true, onClick:async()=>{
          update();
          if (!parsed || !parsed.timed || !parsed.segments.length){ toast("Nothing to save: the transcript needs timestamps.", "bad"); return false; }
          const lines = parsed.segments.map(x => Object.assign({ start:x.start, end:x.end, text:x.text }, x.en ? { en:x.en } : {}));
          try { await saveContent(S.api, "videos", v.id, Object.assign({}, v, { transcript:lines }), S.me.uid); markUnpublished(); } catch(e){ toast(errText(e), "bad"); return false; }
          await saved(`Transcript saved (${lines.length} lines).`); return true; } }
      ].filter(Boolean) });
  };

  const titleEn = h("input",{class:"input",placeholder:"Title in English (e.g. Shopping at Talat Sao)"});
  const titleLo = h("input",{class:"input",placeholder:"Title in Lao (e.g. ການໄປຊື້ເຄື່ອງຢູ່ຕະຫຼາດ)"});
  const urlInp = h("input",{class:"input",placeholder:"https://www.youtube.com/watch?v=… or https://youtu.be/…"});
  const urlPreview = h("div");
  urlInp.addEventListener("input", () => urlPreview.replaceChildren(urlInp.value.trim() ? preview(urlInp.value.trim(), true) : ""));
  const catInp = h("select",{class:"input"},
    h("option",{value:"beginner"},"Beginner & Survival"),
    h("option",{value:"conversation"},"Daily Conversations"),
    h("option",{value:"pronunciation"},"Pronunciation & Tones"),
    h("option",{value:"culture"},"Culture & Traditions")
  );
  const diffInp = h("input",{class:"input",placeholder:"Difficulty label (e.g. Stage 1 · Beginner)"});

  const listCard = h("div",{class:"stack",style:"gap:10px"});
  const countEl = h("span");

  const renderVideos = () => {
    listCard.innerHTML = "";
    countEl.textContent = String(videos.length);
    if (loadError){
      listCard.append(h("div",{class:"banner"}, "Could not load videos from the database: " + errText(loadError)));
      return;
    }
    if (!videos.length){
      listCard.append(h("div",{class:"empty",style:"padding:20px;text-align:center"}, "No video resources found in database. Add one below."));
      return;
    }
    videos.forEach(v => {
      const vTitle = (v.title && (v.title.en || v.title.lo)) || v.id;
      const src = videoSource(v.embedUrl);
      listCard.append(h("div",{class:"card row",style:"justify-content:space-between;align-items:center;padding:14px;gap:14px;flex-wrap:wrap"},
        h("div",{class:"row",style:"gap:14px;align-items:center;min-width:0;flex:1"},
          preview(v.embedUrl, false),
          h("div",{style:"min-width:0"},
            h("b",{style:"font-size:1.05rem"}, vTitle),
            h("div",{class:"small muted"}, `${v.category || "video"} · ID: ${v.id} · Level ${v.level || 1} · ${v.status || "published"}`),
            h("div",{class:"row",style:"gap:6px;margin:4px 0"},
              transcriptOf(v).timed ? h("span",{class:"pill ok"}, "Transcript · " + transcriptOf(v).lines.length + " lines") : h("span",{class:"pill"}, "No transcript"),
              recapOf(v).empty ? h("span",{class:"pill"}, "No recap") : h("span",{class:"pill ok"}, "Recap · " + recapOf(v).points.length + " phrases")),
            src.kind !== "invalid"
              ? h("a",{href:src.watch || src.src,target:"_blank",rel:"noopener",class:"small",style:"color:var(--accent);word-break:break-all"}, v.embedUrl)
              : h("div",{class:"small",style:"color:var(--bad)"}, "⚠ Link missing or invalid: " + (v.embedUrl || "(empty)"))
          )
        ),
        h("div",{class:"row",style:"gap:6px"},
          canEdit ? h("button",{class:"btn sm primary",title:"Change video link",onclick:()=>changeLink(v)}, icon("edit"), "Change link") : null,
          canEdit ? h("button",{class:"btn sm",title:"Import or replace the synced transcript",onclick:()=>transcriptDialog(v)}, icon("note"), "Transcript") : null,
          h("button",{class:"btn sm",title:canEdit?"Edit the recap and all other fields":"View",onclick:()=>go("editor",{type:"videos",id:v.id})}, icon(canEdit?"review":"eye"), canEdit ? "Recap & details" : "View"),
          canEdit ? h("button",{class:"btn sm ghost",title:"Duplicate",onclick:async()=>{
            const nid = v.id + "-copy-" + Date.now().toString(36).slice(-4);
            try { await saveContent(S.api, "videos", nid, Object.assign({}, v, { status:"draft" }), S.me.uid); markUnpublished(); }
            catch(e){ toast(errText(e), "bad"); return; }
            await saved("Duplicated as " + nid + " (draft).");
          }}, icon("copy")) : null,
          canEdit ? h("button",{class:"btn sm ghost",style:"color:var(--bad)",title:"Delete",onclick:async()=>{
            if (await confirmDialog("Delete Video", `Delete "${vTitle}"?`, "Delete", t("cancel"), true)){
              try { await S.api.db.del("videos/" + v.id); await S.api.db.set("settings/bundle", { dirty:true }, true); markUnpublished(); }
              catch(e){ toast(errText(e), "bad"); return; }
              await saved("Deleted video " + v.id + ".");
            }
          }}, icon("trash")) : null
        )
      ));
    });
  };

  const formCard = h("div",{class:"card stack",style:"gap:12px;padding:20px"},
    h("h3",null,"Add New Video Resource to Database:"),
    h("div",{class:"grid2"},
      h("div",{class:"field"}, h("label",null,"English Title:"), titleEn),
      h("div",{class:"field"}, h("label",null,"Lao Title:"), titleLo)
    ),
    h("div",{class:"field"}, h("label",null,"Video link (YouTube or .mp4):"), urlInp),
    urlPreview,
    h("div",{class:"grid2"},
      h("div",{class:"field"}, h("label",null,"Category:"), catInp),
      h("div",{class:"field"}, h("label",null,"Difficulty Badge:"), diffInp)
    ),
    h("button",{class:"btn primary",style:"align-self:flex-start",onclick:async()=>{
      const en = titleEn.value.trim();
      const url = toStored(urlInp.value);
      if (!en){ toast("Title is required", "bad"); return; }
      if (!url){ toast("Not a valid YouTube or video link", "bad"); return; }
      const id = "v-" + en.toLowerCase().replace(/[^a-z0-9]/g,"-").slice(0, 24) + "-" + Date.now().toString(36).slice(-4);
      const data = {
        level: 1,
        title: { en, lo: titleLo.value.trim() || en, zh:"" },
        desc: { en: "Lao video lesson", lo: "ວິດີໂອບົດຮຽນພາສາລາວ", zh:"" },
        embedUrl: url,
        category: catInp.value,
        difficulty: diffInp.value.trim() || "Stage 1 · Beginner",
        transcript: [],
        vocab: [],
        status: "published",
        access: "free"
      };
      try { await saveContent(S.api, "videos", id, data, S.me.uid); markUnpublished(); }
      catch(e){ toast(errText(e), "bad"); return; }
      titleEn.value = ""; titleLo.value = ""; urlInp.value = ""; diffInp.value = ""; urlPreview.replaceChildren();
      await saved("Video saved to the database.");
    }}, icon("plus"), "Save Video to Database")
  );

  renderVideos();
  root.append(h("h3",{style:"margin-top:4px"},"Current Video Library (", countEl, "):"), listCard);
  if (canEdit) root.append(formCard);
  return root;
};

// =========================================================================
// 4. ADMIN PROMOTIONS & LOGIN FEED (ໂປຣໂມຊັ່ນ ແລະ ຂ່າວສານໜ້າເຂົ້າສູ່ລະບົບ)
// =========================================================================
EXT_VIEWS.promotions = async () => {
  const root = h("div",{class:"stack-l"});
  root.append(h("div",{class:"pagehead"},
    h("div",{class:"spread"},
      h("h1",null, lang()==="lo" ? "ຈັດການໂປຣໂມຊັ່ນ ແລະ ຂ່າວສານ (Promotions & Feed)" : "Login Promotions & Feed Manager"),
      h("a",{href:"../",class:"btn ghost"}, icon("home"), t("adm_open_learner"))
    ),
    h("p",null, "Database-backed promotional settings. Controls download resource banners and links shown to learners.")
  ));

  const currentPromo = (await S.api.db.get("settings/promotions").catch(()=>null)) || {};
  const currentApp = (await S.api.db.get("settings/app").catch(()=>null)) || {};

  const pdfTitleEn = h("input",{class:"input",value:(currentPromo.title&&currentPromo.title.en)||"Free Lao Beginner PDF Guide"});
  const pdfTitleLo = h("input",{class:"input",value:(currentPromo.title&&currentPromo.title.lo)||"ຄູ່ມືຮຽນພາສາລາວຂັ້ນຕົ້ນ (ຟຣີ)"});
  const pdfLink = h("input",{class:"input",value:currentPromo.link||"https://example.com/lao-beginner-guide.pdf"});
  const pdfBadge = h("input",{class:"input",value:(currentPromo.badge&&currentPromo.badge.en)||"FREE PDF"});

  const fbLink = h("input",{class:"input",value:(currentApp.social&&currentApp.social.fb)||"https://facebook.com/laolaohub"});
  const ytLink = h("input",{class:"input",value:(currentApp.social&&currentApp.social.yt)||"https://youtube.com/@laolaohub"});
  const ttLink = h("input",{class:"input",value:(currentApp.social&&currentApp.social.tt)||"https://tiktok.com/@laolaohub"});

  const promoCard = h("div",{class:"card stack",style:"gap:14px;padding:24px"},
    h("h3",null,"1. Free Download Resource Banner:"),
    h("div",{class:"grid2"},
      h("div",{class:"field"}, h("label",null,"Headline (English):"), pdfTitleEn),
      h("div",{class:"field"}, h("label",null,"Headline (Lao):"), pdfTitleLo)
    ),
    h("div",{class:"grid2"},
      h("div",{class:"field"}, h("label",null,"Download URL:"), pdfLink),
      h("div",{class:"field"}, h("label",null,"Badge Text:"), pdfBadge)
    ),
    h("h3",{style:"margin-top:14px"},"2. Official Social Media Channels:"),
    h("div",{class:"field"}, h("label",null,"Facebook Channel URL:"), fbLink),
    h("div",{class:"field"}, h("label",null,"YouTube Channel URL:"), ytLink),
    h("div",{class:"field"}, h("label",null,"TikTok Channel URL:"), ttLink),
    h("button",{class:"btn primary",style:"align-self:flex-start;margin-top:10px",onclick:async()=>{
      try {
        await S.api.db.set("settings/promotions", {
          title: { en: pdfTitleEn.value.trim(), lo: pdfTitleLo.value.trim(), zh:"" },
          desc: { en: "Downloadable authentic Lao learning guide.", lo: "ຄູ່ມືການຮຽນພາສາລາວສະບັບພິມໄດ້." },
          link: pdfLink.value.trim(),
          badge: { en: pdfBadge.value.trim(), lo: "ຟຣີ PDF" },
          active: true,
          updatedAt: new Date()
        }, true);

        await S.api.db.set("settings/app", {
          social: { fb: fbLink.value.trim(), yt: ytLink.value.trim(), tt: ttLink.value.trim() },
          updatedAt: new Date()
        }, true);

        toast("Promotional settings saved to database!", "ok");
      } catch(err){
        toast("Failed to save: " + err.message, "bad");
      }
    }}, icon("check"), "Save Settings to Database")
  );

  root.append(promoCard);
  return root;
};

// =========================================================================
// 5. CONTENT HEALTH & COMPLETENESS DASHBOARD (REAL DATABASE METRICS)
// =========================================================================
EXT_VIEWS.contentHealth = async () => {
  const root = h("div",{class:"stack-l"});
  root.append(h("div",{class:"pagehead"},
    h("div",{class:"spread"},
      h("h1",null, lang()==="lo" ? "ສຸຂະພາບ ແລະ ຄວາມສົມບູນຂອງເນື້ອຫາ (Content Health)" : "Content Completeness & Health"),
      h("a",{href:"../",class:"btn ghost"}, icon("home"), t("adm_open_learner"))
    ),
    h("p",null, "Real-time database audit calculated from actual records: Vocabulary, Native Audio Coverage, English/Lao/Chinese translations, and Script handwriting.")
  ));

  const [vocabList, lessonList, patternList, audioList, charList, videoList] = await Promise.all([
    S.api.db.list("vocabulary").catch(()=>[]),
    S.api.db.list("lessons").catch(()=>[]),
    S.api.db.list("patterns").catch(()=>[]),
    S.api.db.list("audio").catch(()=>[]),
    S.api.db.list("characters").catch(()=>[]),
    S.api.db.list("videos").catch(()=>[])
  ]);

  const totalVocab = vocabList.length || 1;
  const vocabWithAudio = vocabList.filter(v => audioList.some(a => a.text === v.hz)).length;
  const audioPct = Math.min(100, Math.round(((vocabWithAudio + audioList.length) / Math.max(1, totalVocab)) * 100));

  const totalItems = totalVocab + lessonList.length + patternList.length;
  const withLaoTr = vocabList.filter(v => v.tr && v.tr.lo && v.tr.lo.meaning).length +
                    lessonList.filter(l => l.title && l.title.lo).length +
                    patternList.filter(p => p.tr && p.tr.lo && p.tr.lo.meaning).length;
  const laoPct = Math.round((withLaoTr / Math.max(1, totalItems)) * 100);

  const metrics = [
    { title:"Vocabulary Database", pct: Math.min(100, Math.round((totalVocab / 250) * 100)), desc:`${vocabList.length} authentic Lao vocabulary items stored in database.` },
    { title:"Native Audio Coverage", pct: audioPct, desc:`${audioList.length} audio recordings indexed across words and patterns.` },
    { title:"Lao Translations & Glosses", pct: laoPct, desc:`${withLaoTr} of ${totalItems} curriculum entities localized with Lao descriptions.` },
    { title:"Lao Script & Handwriting", pct: Math.min(100, Math.round((charList.length / 27) * 100)), desc:`${charList.length} primary Lao consonant and vowel glyphs in database.` },
    { title:"Video Curriculum", pct: Math.min(100, Math.round((videoList.length / 5) * 100)), desc:`${videoList.length} active video lessons with synced Lao transcripts.` }
  ];

  const mGrid = h("div",{class:"grid2"});
  metrics.forEach(m => {
    mGrid.append(h("div",{class:"card stack",style:"gap:8px"},
      h("div",{class:"spread"},
        h("b",{style:"font-size:1.1rem"}, m.title),
        h("span",{class:"chip lv"}, m.pct + "%")
      ),
      h("div",{class:"health-meter"},
        h("div",{class:"bar"}, h("i",{style:`width:${m.pct}%;background:${m.pct>85?'var(--jade)':'var(--accent)'}`}))
      ),
      h("p",{class:"small muted"}, m.desc)
    ));
  });

  root.append(mGrid);
  return root;
};
