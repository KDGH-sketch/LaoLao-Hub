// Tests videoSource() (js/shared/ui.js), which turns pasted video links into playable URLs.
// With --online it also asks YouTube's oEmbed API whether every video ID in the project exists and allows embedding.
// Run: node scripts/test_video_links.mjs [--online]
import { videoSource } from "../js/shared/ui.js";
import fs from "fs";

let failed = 0;
const ok = (cond, name) => { console.log((cond ? "  PASS " : "  FAIL ") + name); if (!cond) failed++; };
const EMBED = "https://www.youtube.com/embed/j7TToA_jaMg?rel=0";

console.log("YouTube link formats → embed URL");
for (const url of [
  "https://www.youtube.com/watch?v=j7TToA_jaMg",
  "https://youtube.com/watch?v=j7TToA_jaMg&list=PL123&index=2",
  "https://m.youtube.com/watch?v=j7TToA_jaMg&pp=abc",
  "https://youtu.be/j7TToA_jaMg",
  "https://youtu.be/j7TToA_jaMg?si=XYZ",
  "https://www.youtube.com/shorts/j7TToA_jaMg",
  "https://www.youtube.com/live/j7TToA_jaMg",
  "https://www.youtube.com/embed/j7TToA_jaMg",
  "https://www.youtube-nocookie.com/embed/j7TToA_jaMg",
  "  https://www.youtube.com/watch?v=j7TToA_jaMg  ",
  "j7TToA_jaMg"
]) ok(videoSource(url).src === EMBED, url.trim());
ok(videoSource("https://youtu.be/j7TToA_jaMg?t=90").src === "https://www.youtube.com/embed/j7TToA_jaMg?rel=0&start=90", "start time is kept");
ok(videoSource(videoSource("https://youtu.be/j7TToA_jaMg").src).src === EMBED, "already-converted links stay the same");
ok(videoSource("https://youtu.be/j7TToA_jaMg").watch === "https://www.youtube.com/watch?v=j7TToA_jaMg", "watch link for 'Open on YouTube'");

console.log("other links");
ok(videoSource("https://example.com/media/lesson1.mp4").kind === "file", ".mp4 plays in a <video> element");
ok(videoSource("https://player.vimeo.com/video/123").kind === "iframe", "other embed pages use an iframe");
for (const bad of ["", "   ", "not a link", "javascript:alert(1)", "https://www.youtube.com/watch?v=tooShort", "https://www.youtube.com/channel/UC123"])
  ok(videoSource(bad).kind === "invalid", `invalid: ${JSON.stringify(bad)}`);

if (process.argv.includes("--online")){
  console.log("\nevery YouTube ID in the project exists and can be embedded");
  const files = ["data/seed.json", "js/learner/views-media.js", "supabase-seed-missing-tables.sql", "supabase-fix-video-links.sql"];
  const ids = new Set(files.flatMap(f => [...fs.readFileSync(f, "utf8").matchAll(/youtube\.com\/embed\/([\w-]{11})/g)].map(m => m[1])));
  for (const id of ids){
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    const title = r.ok ? (await r.json()).title : "";
    ok(r.status === 200, `${id} (HTTP ${r.status}) ${title}`);
  }
}

console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
