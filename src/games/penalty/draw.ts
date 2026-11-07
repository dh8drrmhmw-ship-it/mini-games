// 点球大战的画图：夜场球场、观众、球门和网、门将、球。只画，不管规则。
import { FONT, roundRectPath, wrapText } from '../shared/canvas.ts';
import type { Canvas2D, View } from '../shared/host.ts';
import type { Persona } from './keeper.ts';
import { BALL_R, GOAL_H, HALF_W, POST_R, project, type Camera } from './world.ts';

export const PAL = {
  skyTop: '#070d22',
  skyBottom: '#17244a',
  stand: '#121b38',
  standEdge: '#1f2b52',
  grassA: '#2e8b45',
  grassB: '#287c3d',
  grassFar: '#1f5f33',
  line: 'rgba(255,255,255,0.82)',
  post: '#f7f7f2',
  postShade: '#c8c8c0',
  net: 'rgba(235,240,255,0.38)',
  hud: '#ffffff',
  hudMuted: 'rgba(255,255,255,0.68)',
  accent: '#ffcf3f',
  goal: '#ffd84a',
  bad: '#ff6b5b',
  card: '#fffaf0',
  cardInk: '#1b1f2e',
  cardMuted: '#6b6f80',
  glove: '#fff3c4',
};

export { FONT };

// ---------- 背景 ----------

const CROWD = ['#e85d5d', '#f2b63c', '#4f9bd9', '#ffffff', '#8fd18c', '#c58be0', '#f08a54', '#2d3a66'];

/** 夜空、灯光、看台和观众。excite：0～1，观众跳得多高。 */
export function drawStadium(ctx: Canvas2D, cam: Camera, view: View, time: number, excite: number): void {
  const { width: W } = view;
  const standBottom = project(cam, 0, 0, -6).y;
  const sky = ctx.createLinearGradient(0, 0, 0, standBottom);
  sky.addColorStop(0, PAL.skyTop);
  sky.addColorStop(1, PAL.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, standBottom + 2);
  // 看台：从屏幕顶一直排到球门后面，越往下（越近）的观众越大
  ctx.fillStyle = PAL.stand;
  ctx.fillRect(0, 0, W, standBottom);
  let y = standBottom - 4;
  for (let r = 0; y > -10; r++) {
    const size = Math.max(1.6, 4.4 - r * 0.18);
    const gap = size * 2.3;
    ctx.fillStyle = PAL.standEdge;
    ctx.fillRect(0, y + size * 1.3, W, 1);
    for (let i = 0, x = (r % 2) * gap * 0.5; x < W + gap; i++, x += gap) {
      const h = (Math.imul(r * 131 + i, 2654435761) >>> 0) % 1000;
      if (h % 7 === 0) continue; // 空座位
      ctx.fillStyle = CROWD[h % CROWD.length]!;
      const jump = excite * Math.max(0, Math.sin(time * 14 + h)) * size * 1.6;
      ctx.fillRect(x, y - jump, size, size * 1.2);
    }
    y -= size * 3.4;
  }
  // 顶上压暗，记分的字看得清
  const band = ctx.createLinearGradient(0, 0, 0, view.safeTop + 150);
  band.addColorStop(0, 'rgba(7,13,34,0.92)');
  band.addColorStop(0.6, 'rgba(7,13,34,0.6)');
  band.addColorStop(1, 'rgba(7,13,34,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, view.safeTop + 150);
  // 灯光
  for (const lx of [W * 0.08, W * 0.92]) {
    const g = ctx.createRadialGradient(lx, view.safeTop + 8, 2, lx, view.safeTop + 8, W * 0.5);
    g.addColorStop(0, 'rgba(255,250,220,0.5)');
    g.addColorStop(0.12, 'rgba(255,250,220,0.1)');
    g.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, standBottom);
  }
}

/** 草地：远处暗、近处亮，有割草的条纹；画上禁区线和点球点。 */
export function drawPitch(ctx: Canvas2D, cam: Camera, view: View): void {
  const { width: W, height: H } = view;
  const far = project(cam, 0, 0, -6).y;
  ctx.fillStyle = PAL.grassFar;
  ctx.fillRect(0, far, W, H - far);
  for (let z = -6, k = 0; z < cam.z - 0.5; z += 1.6, k++) {
    const y1 = project(cam, 0, 0, z).y;
    const y2 = project(cam, 0, 0, Math.min(cam.z - 0.5, z + 1.6)).y;
    ctx.fillStyle = k % 2 ? PAL.grassA : PAL.grassB;
    ctx.fillRect(0, y1, W, Math.max(1, y2 - y1) + 0.5);
  }
  // 远处压暗一点，像夜里的灯光照不到
  const shade = ctx.createLinearGradient(0, far, 0, project(cam, 0, 0, 6).y);
  shade.addColorStop(0, 'rgba(5,10,30,0.45)');
  shade.addColorStop(1, 'rgba(5,10,30,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, far, W, project(cam, 0, 0, 6).y - far);

  ctx.strokeStyle = PAL.line;
  ctx.lineCap = 'round';
  const line = (pts: [number, number][]): void => {
    ctx.beginPath();
    pts.forEach(([x, z], i) => {
      const p = project(cam, x, 0, z);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.lineWidth = Math.max(1, project(cam, 0, 0, 3).s * 0.07);
    ctx.stroke();
  };
  line([
    [-30, 0],
    [30, 0],
  ]);
  line([
    [-9.16, 0],
    [-9.16, 5.5],
    [9.16, 5.5],
    [9.16, 0],
  ]);
  line([
    [-20.16, 0],
    [-20.16, 16.5],
    [20.16, 16.5],
    [20.16, 0],
  ]);
  const spot = project(cam, 0, 0, 11);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(spot.x, spot.y + spot.s * 0.02, spot.s * 0.07, spot.s * 0.03, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- 球门 ----------

export interface Ripple {
  x: number;
  y: number;
  /** 进球后过了几秒 */
  t: number;
}

const NET_BACK = -1.7;
const NET_TOP_BACK = 1.85;

/** 网往后鼓出去多少（进球时那一下）。 */
function bulge(r: Ripple | null, x: number, y: number): number {
  if (!r || r.t > 1.4) return 0;
  const d2 = (x - r.x) * (x - r.x) + (y - r.y) * (y - r.y);
  const amp = 0.9 * Math.exp(-r.t * 3.2) * Math.cos(r.t * 13);
  return amp * Math.exp(-d2 / 0.9);
}

/** 网（在门将和球后面画）。 */
export function drawNet(ctx: Canvas2D, cam: Camera, ripple: Ripple | null): void {
  const s0 = project(cam, 0, 0, 0).s;
  ctx.save();
  ctx.strokeStyle = PAL.net;
  ctx.lineWidth = Math.max(0.7, s0 * 0.018);
  // 后面那张网：竖线和横线
  const back = (x: number, y: number): { x: number; y: number } => {
    const z = NET_BACK - bulge(ripple, x, y);
    const yy = Math.min(y, NET_TOP_BACK);
    return project(cam, x, yy, z);
  };
  const step = 0.3;
  for (let x = -HALF_W; x <= HALF_W + 0.01; x += step) {
    ctx.beginPath();
    for (let y = 0; y <= NET_TOP_BACK + 0.01; y += step) {
      const p = back(x, y);
      if (y === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    // 接到横梁上
    const top = project(cam, x, GOAL_H, 0);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
  }
  for (let y = 0; y <= NET_TOP_BACK + 0.01; y += step) {
    ctx.beginPath();
    for (let x = -HALF_W; x <= HALF_W + 0.01; x += step) {
      const p = back(x, y);
      if (x === -HALF_W) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  // 顶网和侧网：从门框连到后面
  for (let x = -HALF_W; x <= HALF_W + 0.01; x += step * 2) {
    const a = project(cam, x, GOAL_H, 0);
    const b = back(x, NET_TOP_BACK);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const side of [-1, 1]) {
    for (let y = 0; y <= GOAL_H; y += step) {
      const a = project(cam, side * HALF_W, y, 0);
      const b = back(side * HALF_W, Math.min(y, NET_TOP_BACK));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 门柱和横梁。hit：被球打中后的闪光（0～1）。 */
export function drawFrame(ctx: Canvas2D, cam: Camera, hit: number): void {
  const bl = project(cam, -HALF_W, 0, 0);
  const tl = project(cam, -HALF_W, GOAL_H, 0);
  const tr = project(cam, HALF_W, GOAL_H, 0);
  const br = project(cam, HALF_W, 0, 0);
  const w = Math.max(3, POST_R * 2 * bl.s);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.postShade;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(bl.x + w * 0.25, bl.y);
  ctx.lineTo(tl.x + w * 0.25, tl.y + w * 0.25);
  ctx.lineTo(tr.x + w * 0.25, tr.y + w * 0.25);
  ctx.lineTo(br.x + w * 0.25, br.y);
  ctx.stroke();
  ctx.strokeStyle = PAL.post;
  ctx.lineWidth = w * 0.8;
  ctx.beginPath();
  ctx.moveTo(bl.x, bl.y);
  ctx.lineTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.stroke();
  if (hit > 0) {
    ctx.strokeStyle = `rgba(255,240,150,${hit})`;
    ctx.lineWidth = w * 2.2;
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- 球 ----------

export function drawBallShadow(ctx: Canvas2D, cam: Camera, x: number, y: number, z: number, alpha = 1): void {
  const p = project(cam, x, 0, z);
  const k = Math.max(0.15, 1 - y / 3);
  ctx.save();
  ctx.globalAlpha = alpha * 0.35 * k;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, BALL_R * p.s * 1.2, BALL_R * p.s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 球：白底黑块，块会跟着转。 */
export function drawBall(ctx: Canvas2D, cam: Camera, x: number, y: number, z: number, spin: number, alpha = 1): { x: number; y: number; r: number } {
  const p = project(cam, x, y, z);
  const r = Math.max(2.5, BALL_R * p.s);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fbfbf7';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#2a2f3a';
  for (let i = 0; i < 5; i++) {
    const a = spin + (i * Math.PI * 2) / 5;
    const px = p.x + Math.cos(a) * r * 0.78;
    const py = p.y + Math.sin(a) * r * 0.62;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(p.x + Math.sin(spin) * r * 0.15, p.y + Math.cos(spin) * r * 0.1, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  const shade = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r * 1.1);
  shade.addColorStop(0, 'rgba(255,255,255,0.35)');
  shade.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.restore();
  return { x: p.x, y: p.y, r };
}

// ---------- 门将 ----------

export type Face = 'ready' | 'smug' | 'shock' | 'sad';

export type KeeperPose =
  | { kind: 'idle'; x: number; lean: number; bounce: number }
  | { kind: 'line'; fx: number; fy: number; hx: number; hy: number };

const KZ = 0.35;

function seg(ctx: Canvas2D, cam: Camera, a: [number, number], b: [number, number], width: number, color: string): void {
  const p = project(cam, a[0], a[1], KZ);
  const q = project(cam, b[0], b[1], KZ);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, width * p.s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
}

function dot(ctx: Canvas2D, cam: Camera, c: [number, number], r: number, color: string): { x: number; y: number; r: number } {
  const p = project(cam, c[0], c[1], KZ);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(1.5, r * p.s), 0, Math.PI * 2);
  ctx.fill();
  return { x: p.x, y: p.y, r: Math.max(1.5, r * p.s) };
}

/** 门将。返回头在屏幕上的位置（用来放说话的气泡）。 */
export function drawKeeper(ctx: Canvas2D, cam: Camera, p: Persona, pose: KeeperPose, face: Face): { x: number; y: number } {
  ctx.save();
  let head: { x: number; y: number; r: number };
  if (pose.kind === 'idle') {
    const x = pose.x;
    const b = pose.bounce;
    const hip: [number, number] = [x + pose.lean * 0.12, 0.78 - b * 0.04];
    const sh: [number, number] = [x + pose.lean * 0.22, 1.38 - b * 0.04];
    // 影子
    const g = project(cam, x, 0, KZ);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, g.s * 0.5, g.s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 腿：微微下蹲
    for (const side of [-1, 1]) {
      seg(ctx, cam, [hip[0] + side * 0.12, hip[1]], [x + side * 0.22, 0.42], 0.17, '#1b1f2e');
      seg(ctx, cam, [x + side * 0.22, 0.42], [x + side * 0.26, 0.06], 0.15, '#1b1f2e');
    }
    seg(ctx, cam, hip, sh, 0.42, p.jersey);
    // 手臂张开
    for (const side of [-1, 1]) {
      const hand: [number, number] = [x + side * 0.62 + pose.lean * 0.2, 1.05 + b * 0.05];
      seg(ctx, cam, [sh[0] + side * 0.18, sh[1] - 0.04], hand, 0.12, p.jersey);
      dot(ctx, cam, hand, 0.1, PAL.glove);
    }
    head = dot(ctx, cam, [sh[0], sh[1] + 0.27], 0.2, p.skin);
  } else {
    const { fx, fy, hx, hy } = pose;
    const ux = hx - fx;
    const uy = hy - fy;
    const len = Math.max(0.01, Math.hypot(ux, uy));
    // 垂直于身体、朝上的方向（头偏在这一边）
    let nx = -uy / len;
    let ny = ux / len;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const at = (k: number, off = 0): [number, number] => [fx + ux * k + nx * off, fy + uy * k + ny * off];
    for (const side of [-1, 1]) seg(ctx, cam, at(0.34, side * 0.07), at(0.02, side * 0.12), 0.16, '#1b1f2e');
    seg(ctx, cam, at(0.34), at(0.62), 0.42, p.jersey);
    for (const side of [-1, 1]) {
      const hand = at(1, side * 0.1);
      seg(ctx, cam, at(0.6, side * 0.08), hand, 0.12, p.jersey);
      dot(ctx, cam, hand, 0.1, PAL.glove);
    }
    head = dot(ctx, cam, at(0.72, 0.2), 0.2, p.skin);
  }
  drawFace(ctx, head.x, head.y, head.r, p, face);
  ctx.restore();
  return { x: head.x, y: head.y - head.r };
}

/** 脸：发型、眼睛、嘴，按表情画。头像和球场上的门将共用。 */
export function drawFace(ctx: Canvas2D, x: number, y: number, r: number, p: Persona, face: Face): void {
  ctx.save();
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // 头发
  ctx.fillStyle = p.hair;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.12, r * 1.03, Math.PI * 1.05, Math.PI * 1.95);
  ctx.quadraticCurveTo(x, y - r * 0.5, x - r * 1.0, y - r * 0.15);
  ctx.fill();
  const lw = Math.max(1, r * 0.13);
  ctx.strokeStyle = '#1b1f2e';
  ctx.fillStyle = '#1b1f2e';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  const eyeY = y + r * 0.05;
  for (const dx of [-0.38, 0.38]) {
    const ex = x + dx * r;
    ctx.beginPath();
    if (face === 'smug') {
      ctx.moveTo(ex - r * 0.16, eyeY);
      ctx.lineTo(ex + r * 0.16, eyeY);
      ctx.stroke();
    } else if (face === 'shock') {
      ctx.arc(ex, eyeY, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else if (face === 'sad') {
      ctx.arc(ex, eyeY + r * 0.05, r * 0.12, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      ctx.arc(ex, eyeY, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 眉毛
  if (face === 'ready' || face === 'smug') {
    for (const dx of [-0.38, 0.38]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * r - r * 0.17, eyeY - r * 0.3 + (dx < 0 ? -r * 0.05 : r * 0.04));
      ctx.lineTo(x + dx * r + r * 0.17, eyeY - r * 0.3 + (dx < 0 ? r * 0.04 : -r * 0.05));
      ctx.stroke();
    }
  }
  ctx.beginPath();
  if (face === 'smug') {
    ctx.arc(x + r * 0.08, y + r * 0.32, r * 0.3, Math.PI * 0.05, Math.PI * 0.8);
    ctx.stroke();
  } else if (face === 'shock') {
    ctx.ellipse(x, y + r * 0.45, r * 0.15, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === 'sad') {
    ctx.arc(x, y + r * 0.62, r * 0.22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    ctx.moveTo(x - r * 0.2, y + r * 0.45);
    ctx.lineTo(x + r * 0.2, y + r * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

/** 头像：圆形底 + 肩膀 + 脸（气泡和换门将的卡片用）。 */
export function drawAvatar(ctx: Canvas2D, x: number, y: number, r: number, p: Persona, face: Face): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#dfe6f5';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = p.jersey;
  roundRectPath(ctx, x - r * 0.9, y + r * 0.45, r * 1.8, r * 1.2, r * 0.5);
  ctx.fill();
  ctx.fillStyle = p.jerseyDark;
  ctx.font = `800 ${Math.round(r * 0.42)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1', x, y + r * 0.78);
  drawFace(ctx, x, y - r * 0.08, r * 0.55, p, face);
  ctx.restore();
}

/** 门将说话的气泡：左边是头像，右边是话。指向 (tx, ty)。 */
export function drawBubble(ctx: Canvas2D, view: View, tx: number, ty: number, text: string, p: Persona, face: Face, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 15px ${FONT}`;
  const maxText = Math.min(220, view.width - 110);
  const lines = wrapText(ctx, text, maxText);
  const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const av = 18;
  const w = tw + av * 2 + 30;
  const h = Math.max(48, lines.length * 20 + 22);
  let x = tx - w / 2;
  x = Math.min(view.width - w - 12, Math.max(12, x));
  const y = ty - h - 14;
  roundRectPath(ctx, x, y, w, h, 16);
  ctx.fillStyle = PAL.card;
  ctx.fill();
  // 小尾巴
  ctx.beginPath();
  const tailX = Math.min(x + w - 20, Math.max(x + 20, tx));
  ctx.moveTo(tailX - 7, y + h - 1);
  ctx.lineTo(tailX, y + h + 9);
  ctx.lineTo(tailX + 7, y + h - 1);
  ctx.fill();
  drawAvatar(ctx, x + 10 + av, y + h / 2, av, p, face);
  ctx.fillStyle = PAL.cardInk;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, x + av * 2 + 20, y + h / 2 + (i - (lines.length - 1) / 2) * 20));
  ctx.restore();
}

/** 大字：进了！扑出！t：出现了几秒（开头会弹一下）。 */
export function drawBanner(ctx: Canvas2D, x: number, y: number, text: string, sub: string, color: string, t: number): void {
  const k = Math.min(1, t / 0.18);
  const pop = 1 + 0.35 * (1 - k) * (1 - k) + (k < 1 ? 0 : 0);
  const fade = t > 1.15 ? Math.max(0, 1 - (t - 1.15) / 0.3) : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 46px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(10,14,35,0.85)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  if (sub) {
    ctx.font = `800 18px ${FONT}`;
    ctx.lineWidth = 6;
    ctx.strokeText(sub, 0, 40);
    ctx.fillStyle = '#fff';
    ctx.fillText(sub, 0, 40);
  }
  ctx.restore();
}

export interface PillButton {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  primary?: boolean;
  ad?: boolean;
}

export function drawPill(ctx: Canvas2D, b: PillButton): void {
  ctx.save();
  roundRectPath(ctx, b.x, b.y + 3, b.w, b.h, b.h / 2);
  ctx.fillStyle = b.primary ? '#c9961a' : 'rgba(0,0,0,0.18)';
  ctx.fill();
  roundRectPath(ctx, b.x, b.y, b.w, b.h, b.h / 2);
  ctx.fillStyle = b.primary ? PAL.accent : '#eef1f8';
  ctx.fill();
  ctx.fillStyle = PAL.cardInk;
  ctx.font = `800 ${Math.round(b.h * 0.36)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(b.label).width;
  const icon = b.ad ? b.h * 0.3 : 0;
  const start = b.x + b.w / 2 - (tw + (icon ? icon + 6 : 0)) / 2;
  if (b.ad) {
    const cy = b.y + b.h / 2;
    ctx.beginPath();
    ctx.moveTo(start, cy - icon / 2);
    ctx.lineTo(start + icon * 0.9, cy);
    ctx.lineTo(start, cy + icon / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillText(b.label, start + (icon ? icon + 6 : 0) + tw / 2, b.y + b.h / 2 + 1);
  ctx.restore();
}
