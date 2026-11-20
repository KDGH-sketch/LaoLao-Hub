// Images chosen in the browser (admin photos, learners' payment slips): resized before they are uploaded or stored.
// A photo from a phone is often 4000 px and 3–8 MB. Shrink it to at most 1600 px on the long side and save it as WebP
// (JPEG where WebP cannot be written), turned the right way up. Small photos and GIF-like files are left alone.
export const kb = n => n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1e3) + " KB";
export async function shrinkPhoto(file, max = 1600){
  if (!/^image\/(jpeg|png|webp)$/.test(file.type || "")) return file;
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch(e){ return file; }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= 900e3){ bmp.close && bmp.close(); return file; }
  const w = Math.round(bmp.width * scale), hh = Math.round(bmp.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = hh;
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, w, hh); bmp.close && bmp.close();
  const blob = await new Promise(r => c.toBlob(b => r(b), "image/webp", .84));
  const out = blob && blob.type === "image/webp" ? blob : await new Promise(r => c.toBlob(r, "image/jpeg", .86));
  if (!out || out.size >= file.size) return file;
  return new File([out], file.name.replace(/\.\w+$/, "") + (out.type === "image/webp" ? ".webp" : ".jpg"), { type: out.type });
}
