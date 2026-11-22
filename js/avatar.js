// Free "paper-doll" avatar: a drawn mannequin with garment photos layered on it.
// Only garment-only photos can be layered; items whose photo shows a person fall back to the collage.
import { esc, imgSrc } from './ui.js';

export const SKINS = ['#F3D5BD', '#E0AC84', '#C68A5E', '#8D5A3B', '#5C3A24'];
export const HAIRS = ['#1B1B1F', '#4A2E1C', '#8A6A3F', '#B8B8BC'];
export const DEFAULT_AVATAR = { skin: SKINS[1], hair: HAIRS[0] };

// Returns an <svg> string, or null when a top/bottom can't be layered.
export function avatarSvg(set, cfg = DEFAULT_AVATAR) {
  const by = (c) => set.find((i) => i.category === c);
  const top = by('top') || by('ethnic'), bottom = by('bottom'), shoes = by('shoes'), layer = by('layer'), acc = by('accessory');
  if (!top || !bottom || [top, bottom, shoes, layer, acc].some((i) => i?.photo === 'model')) return null;
  const { skin, hair } = { ...DEFAULT_AVATAR, ...cfg };
  const img = (i, x, y, w, h) => i ? `<image href="${imgSrc(i)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` : '';
  return `<svg viewBox="0 0 300 600" role="img" aria-label="Avatar wearing ${esc(top.color)} ${esc(top.type)} and ${esc(bottom.color)} ${esc(bottom.type)}">
    <g fill="${skin}"><rect x="48" y="125" width="28" height="170" rx="14"/><rect x="224" y="125" width="28" height="170" rx="14"/>
      <rect x="134" y="92" width="32" height="40"/><circle cx="150" cy="62" r="38"/>
      <rect x="100" y="300" width="42" height="260" rx="14"/><rect x="158" y="300" width="42" height="260" rx="14"/></g>
    <path d="M111 58a39 39 0 0 1 78 0c-14-16-62-16-78 0z" fill="${hair}"/>
    ${img(bottom, 70, 285, 160, 300)}${img(shoes, 80, 545, 140, 50)}${img(top, 55, 112, 190, 220)}${img(layer, 50, 108, 200, 230)}${img(acc, 215, 270, 56, 56)}
  </svg>`;
}
