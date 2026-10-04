// Stroke-order demonstration. Default: drawn live from the stroke data (always matches what is checked, and the
// app knows exactly when it ends). Optional: an uploaded GIF/WebP shown instead; its length comes from the file.
import { h } from "../ui.js";
import { demoDuration } from "./model.js";

export const ANIM_TYPES = ["image/gif", "image/webp"];
export const ANIM_MAX_BYTES = 2 * 1024 * 1024;

// Plays the demonstration on a pad (pad.js). Resolves true when it finished, false when it was interrupted.
export async function playDemo(pad, template, { speed = 1 } = {}){
  const a = template.animation || {};
  if (a.kind === "gif" && a.url){
    const ms = Math.max(800, Math.min(30000, +a.durationMs || demoDuration(template, speed)));
    const img = h("img", { class: "hwp-gif", alt: "", src: a.url + (a.url.includes("?") ? "&" : "?") + "play=" + Date.now() });   // a fresh URL restarts the GIF
    pad.el.append(img);
    pad.enable(false);
    await new Promise(r => setTimeout(r, ms));
    img.remove();
    return true;
  }
  return pad.animate(template, { speed });
}

// Total display time of an animated GIF (sum of its frame delays). Browsers show delays under 20 ms as 100 ms.
export function gifDurationMs(buf){
  const b = new Uint8Array(buf);
  if (b.length < 13 || String.fromCharCode(...b.slice(0, 3)) !== "GIF") return null;
  let i = 13, total = 0, frames = 0;
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));              // global colour table
  while (i < b.length){
    const block = b[i++];
    if (block === 0x3B) break;                                        // trailer
    if (block === 0x21){                                              // extension
      const label = b[i++];
      if (label === 0xF9 && b[i] === 4){ const d = b[i + 2] | (b[i + 3] << 8); total += d < 2 ? 10 : d; frames++; }
      while (i < b.length && b[i] !== 0) i += b[i] + 1;              // skip sub-blocks
      i++;
    } else if (block === 0x2C){                                       // image
      const packed = b[i + 8]; i += 9;
      if (packed & 0x80) i += 3 * (1 << ((packed & 7) + 1));         // local colour table
      i++;                                                            // LZW minimum code size
      while (i < b.length && b[i] !== 0) i += b[i] + 1;
      i++;
    } else break;
  }
  return frames ? total * 10 : null;
}

// Checks an animation file before upload: type, size, and its duration when it is a GIF
export async function checkAnimationFile(file){
  if (!file) return { ok: false, error: "no_file" };
  if (!ANIM_TYPES.includes(file.type)) return { ok: false, error: "type" };
  if (file.size > ANIM_MAX_BYTES) return { ok: false, error: "size" };
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isGif = String.fromCharCode(...head.slice(0, 3)) === "GIF", isWebp = String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  if ((file.type === "image/gif" && !isGif) || (file.type === "image/webp" && !isWebp)) return { ok: false, error: "content" };   // extension/type does not match the bytes
  const durationMs = isGif ? gifDurationMs(await file.arrayBuffer()) : null;
  return { ok: true, durationMs, bytes: file.size };
}
