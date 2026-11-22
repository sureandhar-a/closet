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
  // Main colour = most common coarse tone (shadows and folds no longer drag it darker); plain photos use the centre half only.
  const cnt = new Map(), sum = new Map();
  const [ya, yb, xa, xb] = transparent ? [0, height, 0, width] : [height >> 2, (height * 3) >> 2, width >> 2, (width * 3) >> 2];
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 16) continue;
    const k = ((data[i] >> 5) << 6) | ((data[i + 1] >> 5) << 3) | (data[i + 2] >> 5);
    cnt.set(k, (cnt.get(k) || 0) + 1);
    const a = sum.get(k) || [0, 0, 0]; a[0] += data[i]; a[1] += data[i + 1]; a[2] += data[i + 2]; sum.set(k, a);
  }
  if (cnt.size) { const k = [...cnt].sort((p, q) => q[1] - p[1])[0][0]; n = cnt.get(k); [r, gr, b] = sum.get(k); }
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
  const ratio = transparent && x1 >= x0 ? (y1 - y0 + 1) / (x1 - x0 + 1) : null; // cut-out shape, for top vs bottom
  return { dataUrl: out.toDataURL('image/png'), hex: n ? `#${h(r)}${h(gr)}${h(b)}` : '#808080', transparent, ratio };
}

// Colour name from hue/lightness, so shade and slight tints don't flip the name. Pre-fills the field; you can edit it.
export function colorName(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn, l = (mx + mn) / 2;
  if (c < 0.09 || l < 0.1) {
    if (l < 0.15) return 'black';
    if (l < 0.38) return 'charcoal grey';
    if (l < 0.62) return 'grey';
    if (l < 0.86) return 'light grey';
    return c > 0.02 && r > b ? 'off-white' : 'white';
  }
  const h = (mx === r ? ((g - b) / c + 6) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4) * 60;
  const pale = l > 0.72, dark = l < 0.33, dull = c < 0.25;
  if (h < 15 || h >= 335) return dark ? 'maroon' : pale ? 'pink' : 'red';
  if (h < 40) return dark ? 'brown' : pale ? (c < 0.4 ? 'beige' : 'peach') : c < 0.4 ? 'tan' : 'orange';
  if (h < 65) return pale ? 'cream' : dark || dull ? (dark ? 'olive' : 'khaki') : c > 0.5 && l > 0.5 ? 'yellow' : 'mustard';
  if (h < 160) return h < 90 && (dark || dull) ? 'olive' : pale ? 'mint' : 'green';
  if (h < 195) return pale ? 'mint' : 'teal';
  if (h < 250) return dark ? 'navy blue' : pale ? 'light blue' : l > 0.58 ? 'sky blue' : 'blue';
  if (h < 290) return pale ? 'lavender' : 'purple';
  return dark ? 'maroon' : pale ? 'pink' : 'purple';
}
