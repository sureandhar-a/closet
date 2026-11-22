// Resize to 600px max, trim transparent edges, detect main colour. Returns {dataUrl, hex, transparent}.
export async function prepareImage(file, max = 600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = -1, y1 = -1, r = 0, gr = 0, b = 0, n = 0, clear = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 16) { clear++; continue; }
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    r += data[i]; gr += data[i + 1]; b += data[i + 2]; n++;
  }
  const transparent = clear > width * height * 0.05;
  let out = c;
  if (transparent && n) { // trim to the visible bounds
    out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    // Studio card: centre on a 3:4 canvas with an even margin, so every item has the same visual size.
    const W = 600, H = 800, k2 = Math.min((W * 0.88) / out.width, (H * 0.88) / out.height);
    const card = document.createElement('canvas');
    card.width = W; card.height = H;
    card.getContext('2d').drawImage(out, (W - out.width * k2) / 2, (H - out.height * k2) / 2, out.width * k2, out.height * k2);
    out = card;
  }
  const h = (v) => Math.round(v / (n || 1)).toString(16).padStart(2, '0');
  return { dataUrl: out.toDataURL('image/png'), hex: n ? `#${h(r)}${h(gr)}${h(b)}` : '#808080', transparent };
}
