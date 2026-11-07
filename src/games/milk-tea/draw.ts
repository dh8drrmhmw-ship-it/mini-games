// 奶茶调配的画图工具：瓶子、杯子、配料、顾客、按钮。只画，不管规则。
import type { Canvas2D } from '../shared/host.ts';
import { INGREDIENTS, type Ingredient } from './ingredients.ts';
import type { Ing } from './rules.ts';
import { FONT, roundRectPath, type Rect } from '../shared/canvas.ts';

export { FONT, inRect, roundRectPath, wrapText, type Rect } from '../shared/canvas.ts';


export const COLORS = {
  bgTop: '#fff5e8',
  bgBottom: '#f4dcc0',
  ink: '#3b2a1e',
  muted: '#8a7262',
  accent: '#e0663f',
  accentDark: '#b9482a',
  awningA: '#e8694a',
  awningB: '#fff3e2',
  counter: '#c98d5a',
  counterEdge: '#a96f42',
  glass: 'rgba(255,255,255,0.3)',
  glassEdge: '#c7ae97',
  card: '#fffaf3',
  shadow: 'rgba(80,45,20,0.18)',
  disabled: '#cbbcae',
};




/** 在一个矩形区域里画一种配料（主色 + 花纹）。调用前应该已经裁剪好容器形状。 */
export function fillIngredient(ctx: Canvas2D, ing: Ingredient, x: number, y: number, w: number, h: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = ing.color;
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = ing.accent;
  ctx.strokeStyle = ing.accent;
  const s = Math.max(6, Math.min(w, 40) / 4);
  switch (ing.pattern) {
    case 'pearls': {
      const r = s * 0.32;
      for (let row = 0, yy = y + s * 0.6; yy < y + h + r; row++, yy += s * 0.8) {
        for (let xx = x + (row % 2 ? s * 0.5 : s * 0.05); xx < x + w + r; xx += s) {
          ctx.beginPath();
          ctx.arc(xx, yy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let row = 0, yy = y + s * 0.6; yy < y + h + s; row++, yy += s * 0.8) {
        for (let xx = x + (row % 2 ? s * 0.5 : s * 0.05); xx < x + w + s; xx += s) {
          ctx.beginPath();
          ctx.arc(xx - s * 0.1, yy - s * 0.1, s * 0.09, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'cubes': {
      const c = s * 0.42;
      ctx.globalAlpha *= 0.8;
      for (let row = 0, yy = y + s * 0.3; yy < y + h; row++, yy += s * 0.85) {
        for (let xx = x + (row % 2 ? s * 0.55 : s * 0.1); xx < x + w; xx += s * 1.05) {
          roundRectPath(ctx, xx, yy, c, c, c * 0.25);
          ctx.fill();
        }
      }
      break;
    }
    case 'seeds': {
      for (let row = 0, yy = y + s * 0.4; yy < y + h; row++, yy += s * 0.7) {
        for (let xx = x + (row % 2 ? s * 0.6 : s * 0.15); xx < x + w; xx += s * 0.9) {
          ctx.beginPath();
          ctx.ellipse(xx, yy, s * 0.06, s * 0.11, 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'swirl': {
      ctx.lineWidth = Math.max(1.5, s * 0.12);
      ctx.globalAlpha *= 0.7;
      for (let yy = y + s * 0.5; yy < y + h + s; yy += s * 0.9) {
        ctx.beginPath();
        ctx.moveTo(x - 2, yy);
        for (let xx = x; xx <= x + w + s; xx += s) {
          ctx.quadraticCurveTo(xx + s * 0.25, yy - s * 0.3, xx + s * 0.5, yy);
          ctx.quadraticCurveTo(xx + s * 0.75, yy + s * 0.3, xx + s, yy);
        }
        ctx.stroke();
      }
      break;
    }
    case 'plain':
      break;
  }
  ctx.restore();
}

/** 一段相同配料的上沿高光，让液体看起来有体积。 */
function surfaceLine(ctx: Canvas2D, x: number, y: number, w: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, w, 2);
  ctx.restore();
}

export interface BottleLook {
  rect: Rect;
  units: readonly Ing[];
  /** 最上面有几份先不画（正在飞过去的路上）。 */
  hiddenTop: number;
  capacity: number;
  selected: boolean;
  /** 抖动：0～1 */
  shake: number;
}

export function bottleShape(ctx: Canvas2D, r: Rect): void {
  roundRectPath(ctx, r.x, r.y, r.w, r.h, [r.w * 0.16, r.w * 0.16, r.w * 0.42, r.w * 0.42]);
}

export function drawBottle(ctx: Canvas2D, b: BottleLook): void {
  const { rect } = b;
  ctx.save();
  if (b.shake > 0) ctx.translate(Math.sin(b.shake * 30) * 4 * b.shake, 0);
  // 影子
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h + (b.selected ? 18 : 4), rect.w * 0.45, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 玻璃
  bottleShape(ctx, rect);
  ctx.fillStyle = COLORS.glass;
  ctx.fill();
  // 配料
  ctx.save();
  const inset = 4;
  const inner = { x: rect.x + inset, y: rect.y + inset, w: rect.w - inset * 2, h: rect.h - inset * 2 };
  bottleShape(ctx, inner);
  ctx.clip();
  const lip = rect.h * 0.1;
  const unitH = (inner.h - lip) / b.capacity;
  const shown = b.units.length - b.hiddenTop;
  let i = 0;
  while (i < shown) {
    let j = i;
    while (j + 1 < shown && b.units[j + 1] === b.units[i]) j++;
    const ing = INGREDIENTS[b.units[i]!]!;
    const top = inner.y + inner.h - (j + 1) * unitH;
    const bottom = inner.y + inner.h - i * unitH;
    fillIngredient(ctx, ing, inner.x, top, inner.w, bottom - top + (i === 0 ? 0 : 0.5));
    surfaceLine(ctx, inner.x, top, inner.w);
    i = j + 1;
  }
  ctx.restore();
  // 玻璃边和高光
  bottleShape(ctx, rect);
  ctx.lineWidth = b.selected ? 3.5 : 2;
  ctx.strokeStyle = b.selected ? COLORS.accent : COLORS.glassEdge;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  roundRectPath(ctx, rect.x + rect.w * 0.14, rect.y + rect.h * 0.12, Math.max(3, rect.w * 0.08), rect.h * 0.62, 3);
  ctx.fill();
  ctx.restore();
}

/** 杯子是上宽下窄的梯形。 */
export function cupShape(ctx: Canvas2D, r: Rect): void {
  const taper = r.w * 0.12;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y);
  ctx.lineTo(r.x + r.w, r.y);
  ctx.lineTo(r.x + r.w - taper, r.y + r.h - 6);
  ctx.quadraticCurveTo(r.x + r.w - taper, r.y + r.h, r.x + r.w - taper - 6, r.y + r.h);
  ctx.lineTo(r.x + taper + 6, r.y + r.h);
  ctx.quadraticCurveTo(r.x + taper, r.y + r.h, r.x + taper, r.y + r.h - 6);
  ctx.closePath();
}

export interface CupLook {
  rect: Rect;
  recipe: readonly Ing[];
  filled: number;
  /** 0～1：下一层的提示闪烁 */
  pulse: number;
  /** 是否显示还没装的层的名字 */
  labels: boolean;
  shake: number;
}

export function drawCup(ctx: Canvas2D, c: CupLook): void {
  const { rect, recipe } = c;
  ctx.save();
  if (c.shake > 0) ctx.translate(Math.sin(c.shake * 30) * 4 * c.shake, 0);
  // 吸管
  ctx.fillStyle = '#e8694a';
  ctx.save();
  ctx.translate(rect.x + rect.w * 0.62, rect.y - rect.h * 0.18);
  ctx.rotate(0.18);
  roundRectPath(ctx, 0, 0, rect.w * 0.09, rect.h * 0.4, 3);
  ctx.fill();
  ctx.restore();
  // 杯身
  cupShape(ctx, rect);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  ctx.save();
  cupShape(ctx, rect);
  ctx.clip();
  const lidH = rect.h * 0.1;
  const layerH = (rect.h - lidH - 3) / recipe.length;
  const bottom = rect.y + rect.h - 3;
  ctx.font = `600 ${Math.max(11, Math.min(14, layerH * 0.42))}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 按「连续相同的配料」分段画：装好的画实心，没装的画虚线框和名字（几份就写 ×几）
  let i = 0;
  let first = true;
  while (i < recipe.length) {
    const ing = INGREDIENTS[recipe[i]!]!;
    const filledPart = i < c.filled;
    let j = i;
    while (j + 1 < recipe.length && recipe[j + 1] === recipe[i] && j + 1 < c.filled === filledPart) j++;
    const count = j - i + 1;
    const yTop = bottom - (j + 1) * layerH;
    const h = count * layerH;
    if (filledPart) {
      fillIngredient(ctx, ing, rect.x, yTop, rect.w, h + 0.5);
      surfaceLine(ctx, rect.x, yTop, rect.w);
    } else {
      const isNext = first;
      first = false;
      fillIngredient(ctx, ing, rect.x, yTop, rect.w, h, isNext ? 0.35 + 0.25 * c.pulse : 0.22);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = isNext ? 2.5 : 1;
      ctx.strokeStyle = isNext ? COLORS.accent : 'rgba(120,90,70,0.45)';
      ctx.strokeRect(rect.x + 3, yTop + 2, rect.w - 6, h - 4);
      ctx.restore();
      if (c.labels && h >= 18) {
        ctx.fillStyle = isNext ? COLORS.ink : 'rgba(59,42,30,0.6)';
        ctx.fillText(count > 1 ? `${ing.name} ×${count}` : ing.name, rect.x + rect.w / 2, yTop + h / 2);
      }
    }
    i = j + 1;
  }
  ctx.restore();
  // 杯盖
  ctx.fillStyle = '#fff';
  roundRectPath(ctx, rect.x - 4, rect.y - lidH * 0.4, rect.w + 8, lidH, lidH / 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.glassEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  cupShape(ctx, rect);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.glassEdge;
  ctx.stroke();
  ctx.restore();
}

/** 一杯小小的示意（排队的下一位要什么）。 */
export function drawMiniCup(ctx: Canvas2D, recipe: readonly Ing[], x: number, y: number, w: number, h: number): void {
  const r = { x, y, w, h };
  ctx.save();
  cupShape(ctx, r);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  ctx.save();
  cupShape(ctx, r);
  ctx.clip();
  const layerH = (h - 2) / recipe.length;
  for (let i = 0; i < recipe.length; i++) {
    ctx.fillStyle = INGREDIENTS[recipe[i]!]!.color;
    ctx.fillRect(x, y + h - 2 - (i + 1) * layerH, w, layerH + 0.5);
  }
  ctx.restore();
  cupShape(ctx, r);
  ctx.strokeStyle = COLORS.glassEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

const SKINS = ['#f6d3b3', '#e9b98f', '#c98d63'];
const HAIRS = ['#3b2a1e', '#6b3f22', '#1f1a17', '#a45a2a', '#4a4f6b'];

export type Mood = 'waiting' | 'happy';

/** 顾客：样子由一个数决定，同一位顾客每次画出来都一样。 */
export function drawCustomer(ctx: Canvas2D, cx: number, cy: number, r: number, look: number, mood: Mood): void {
  const skin = SKINS[look % SKINS.length]!;
  const hair = HAIRS[(look >> 2) % HAIRS.length]!;
  const extra = (look >> 5) % 4; // 0 无，1 眼镜，2 蝴蝶结，3 帽子
  ctx.save();
  // 肩膀
  ctx.fillStyle = ['#7aa6d8', '#e7a54b', '#8fbf7a', '#d77fa0'][(look >> 3) % 4]!;
  roundRectPath(ctx, cx - r * 1.15, cy + r * 0.75, r * 2.3, r * 1.2, [r * 0.8, r * 0.8, 0, 0]);
  ctx.fill();
  // 脸
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 头发
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.1, r * 1.02, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.55, cx - r * 1.0, cy - r * 0.05);
  ctx.fill();
  // 眼睛
  ctx.fillStyle = COLORS.ink;
  if (mood === 'happy') {
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.lineCap = 'round';
    for (const dx of [-0.38, 0.38]) {
      ctx.beginPath();
      ctx.arc(cx + dx * r, cy + r * 0.05, r * 0.14, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  } else {
    for (const dx of [-0.38, 0.38]) {
      ctx.beginPath();
      ctx.arc(cx + dx * r, cy + r * 0.02, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 脸红
  ctx.fillStyle = 'rgba(232,105,74,0.28)';
  for (const dx of [-0.6, 0.6]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * r, cy + r * 0.3, r * 0.17, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 嘴
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (mood === 'happy') ctx.arc(cx, cy + r * 0.3, r * 0.26, Math.PI * 0.1, Math.PI * 0.9);
  else ctx.arc(cx, cy + r * 0.38, r * 0.14, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  // 装饰
  if (extra === 1) {
    ctx.lineWidth = Math.max(1.5, r * 0.06);
    for (const dx of [-0.38, 0.38]) {
      ctx.beginPath();
      ctx.arc(cx + dx * r, cy + r * 0.03, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (extra === 2) {
    ctx.fillStyle = '#e8694a';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.55, cy - r * 0.8, r * 0.22, r * 0.13, 0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.85, cy - r * 0.6, r * 0.22, r * 0.13, 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (extra === 3) {
    ctx.fillStyle = '#5b7fb5';
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.35, r * 0.9, Math.PI, 0);
    ctx.fill();
    roundRectPath(ctx, cx - r * 0.2, cy - r * 0.45, r * 1.25, r * 0.22, r * 0.11);
    ctx.fill();
  }
  ctx.restore();
}

export interface ButtonLook {
  rect: Rect;
  label: string;
  /** 带一个小三角：表示要看广告 */
  ad?: boolean;
  badge?: string;
  primary?: boolean;
  enabled: boolean;
}

export function drawButton(ctx: Canvas2D, b: ButtonLook): void {
  const { rect } = b;
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y + 3, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = b.primary ? COLORS.accentDark : 'rgba(120,80,50,0.25)';
  ctx.fill();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  ctx.fillStyle = !b.enabled ? COLORS.disabled : b.primary ? COLORS.accent : COLORS.card;
  ctx.fill();
  ctx.font = `700 ${Math.round(rect.h * 0.36)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = b.primary || !b.enabled ? '#fff' : COLORS.ink;
  const text = b.label;
  const tw = ctx.measureText(text).width;
  const iconW = b.ad ? rect.h * 0.34 : 0;
  const startX = rect.x + rect.w / 2 - (tw + (iconW ? iconW + 6 : 0)) / 2;
  if (b.ad) {
    const s = iconW;
    const ix = startX;
    const iy = rect.y + rect.h / 2;
    ctx.beginPath();
    ctx.moveTo(ix, iy - s / 2);
    ctx.lineTo(ix + s * 0.9, iy);
    ctx.lineTo(ix, iy + s / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillText(text, startX + (iconW ? iconW + 6 : 0) + tw / 2, rect.y + rect.h / 2 + 1);
  if (b.badge) {
    const r = rect.h * 0.3;
    const bx = rect.x + rect.w - r * 0.6;
    const by = rect.y + r * 0.4;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(r * 1.1)}px ${FONT}`;
    ctx.fillText(b.badge, bx, by + 1);
  }
  ctx.restore();
}

