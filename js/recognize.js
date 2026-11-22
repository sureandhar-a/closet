// On-phone first guess of what a photo is (MobileNet v2, Google's free ImageNet model).
// ~15 MB downloads once on the first Add, then the browser keeps it. The laptop corrects tags at /closet-sync.
// ponytail: ImageNet has no "dress shirt" or "trousers" class, so those fall back to top/shirt; the laptop fixes them.
const TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
const MN = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js';
// Subresource integrity: the browser refuses the file if the CDN ever serves something else.
const SRI = { [TF]: 'sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre', [MN]: 'sha384-oBAqwJ0tv9zzKlbIZyBhhXlEvU/PMrSMqDyOHlEZVC8xWHx4yPySuS7vRikRcYFq' };

const GARMENT = { garment: true };
// ImageNet label (lower case, first name) -> tags. Order matters only for readability.
const MAP = [
  [/running shoe|sneaker/, { category: 'shoes', type: 'sneakers', formality: 'casual' }],
  [/loafer|oxford|brogue/, { category: 'shoes', type: 'formal shoes', formality: 'formal' }],
  [/sandal|clog|flip-flop/, { category: 'shoes', type: 'sandals', formality: 'casual' }],
  [/boot/, { category: 'shoes', type: 'boots', formality: 'smart-casual' }],
  [/shoe/, { category: 'shoes', type: 'shoes', formality: 'smart-casual' }],
  [/watch|clock|stopwatch|compass/, { category: 'accessory', type: 'watch', formality: 'smart-casual' }],
  [/sunglass/, { category: 'accessory', type: 'sunglasses', formality: 'casual' }],
  [/wallet|purse|backpack|mailbag/, { category: 'accessory', type: 'bag', formality: 'smart-casual' }],
  [/buckle/, { category: 'belt', type: 'leather belt', formality: 'formal' }],
  // Clothes: tested on this closet, MobileNet calls shirts and jeans alike "suit", "sweatshirt", "poncho"...
  // so it only says "a garment"; the cut-out's shape decides top vs bottom.
  [/jean|denim|suit|tie|coat|sweatshirt|cardigan|jersey|t-shirt|poncho|wool|stole|cloak|vestment|kimono|abaya|velvet|miniskirt|pajama|apron|jacket|sweater|shirt/, GARMENT],
];

const script = (src) => new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = src; s.integrity = SRI[src]; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => fail(new Error('model download failed'));
  document.head.append(s);
});
let model;
const getModel = () => (model ??= script(TF).then(() => script(MN)).then(() => window.mobilenet.load({ version: 2, alpha: 1.0 }))
  .catch((e) => { model = null; throw e; }));

// Returns {category, type, formality, label} or null (no confident match). Never throws.
// ratio = height / width of the cut-out garment (null for a plain photo).
export async function guessTags(dataUrl, ratio = null) {
  try {
    const m = await getModel();
    const img = new Image(); img.src = dataUrl; await img.decode();
    return pick(await m.classify(img, 5), ratio);
  } catch (e) { console.warn('guessTags:', e); return null; }
}

// Sum top-5 probabilities per tag set; take the best if it is reasonably sure.
export function pick(preds, ratio = null) {
  const score = new Map();
  for (const { className, probability } of preds) {
    const name = className.split(',')[0].trim().toLowerCase();
    const hit = MAP.find(([re]) => re.test(name));
    if (hit) score.set(hit[1], (score.get(hit[1]) || 0) + probability);
  }
  const [best, p] = [...score].sort((a, b) => b[1] - a[1])[0] || [];
  if (!best || p < 0.15) return null;
  if (!best.garment) return { ...best, label: best.type };
  // Trousers/jeans laid flat are tall and narrow; shirts are about as wide as tall.
  return ratio && ratio > 1.5 ? { category: 'bottom', type: 'trousers', formality: 'smart-casual', label: 'trousers' }
    : { category: 'top', type: 'shirt', formality: 'smart-casual', label: 'shirt' };
}
