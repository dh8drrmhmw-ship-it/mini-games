// 点球大战的画图：夜场球场、观众、球门和网、门将、球。只画，不管规则。
import { FONT, roundRectPath, wrapText } from '../shared/canvas.ts';
import type { Canvas2D, View } from '../shared/host.ts';
import type { Persona } from './keeper.ts';
import type { Look } from './look.ts';
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
  // 割草条纹：一条条和球门线平行；镜头斜着看时条纹也是斜的
  const edge = (z: number): [number, number] => {
    const sin = Math.sin(cam.yaw);
    const cos = Math.cos(cam.yaw);
    const ahead = (cam.z - z) / Math.max(0.2, cos);
    const cxw = cam.x + sin * ahead;
    const a = project(cam, cxw - 0.5, 0, z);
    const b = project(cam, cxw + 0.5, 0, z);
    const k = (b.y - a.y) / (b.x - a.x || 1);
    return [a.y + k * (-20 - a.x), a.y + k * (W + 20 - a.x)];
  };
  const last = cam.z - 1.5;
  for (let z = -6, k = 0; z < last; z += 1.6, k++) {
    const z2 = Math.min(last, z + 1.6);
    const [l1, r1] = edge(z);
    // 最近的一截一直铺到屏幕底
    const [l2, r2] = z2 >= last ? [H + 20, H + 20] : edge(z2);
    ctx.fillStyle = k % 2 ? PAL.grassA : PAL.grassB;
    ctx.beginPath();
    ctx.moveTo(-20, l1);
    ctx.lineTo(W + 20, r1);
    ctx.lineTo(W + 20, Math.max(r2, r1 + 1) + 0.5);
    ctx.lineTo(-20, Math.max(l2, l1 + 1) + 0.5);
    ctx.closePath();
    ctx.fill();
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

// ---------- 人物 ----------

export type Face = 'ready' | 'smug' | 'shock' | 'sad';
export type { Look };

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

/**
 * 门将：高矮胖瘦、球衣、短裤、手套都按门将自己的设定画。
 * 返回头顶在屏幕上的位置（用来放说话的气泡）。
 */
export function drawKeeper(ctx: Canvas2D, cam: Camera, p: Persona, pose: KeeperPose, face: Face): { x: number; y: number } {
  const h = p.height / 1.88;
  const g = p.girth;
  const torsoW = 0.4 * g;
  const legW = 0.16 * (0.75 + 0.25 * g);
  const armW = 0.115 * (0.8 + 0.2 * g);
  const headR = 0.19 * (0.95 + 0.06 * g);
  ctx.save();
  let head: { x: number; y: number; r: number };
  if (pose.kind === 'idle') {
    const x = pose.x;
    const b = pose.bounce;
    const hip: [number, number] = [x + pose.lean * 0.12, (0.8 - b * 0.05) * h];
    const sh: [number, number] = [x + pose.lean * 0.22, (1.38 - b * 0.05) * h];
    const shadow = project(cam, x, 0, KZ);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, shadow.s * 0.45 * g, shadow.s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // 腿：微微下蹲
    const knee = 0.42 * h;
    for (const side of [-1, 1]) {
      seg(ctx, cam, [hip[0] + side * 0.11 * g, hip[1]], [x + side * (0.2 + 0.04 * g), knee], legW, '#20242e');
      seg(ctx, cam, [x + side * (0.2 + 0.04 * g), knee], [x + side * (0.24 + 0.04 * g), 0.06], legW * 0.9, '#20242e');
    }
    // 短裤、身体
    seg(ctx, cam, [hip[0], hip[1] - 0.05], [hip[0], hip[1] + 0.12], torsoW * 1.02, p.shorts);
    seg(ctx, cam, [hip[0], hip[1] + 0.1], sh, torsoW, p.jersey);
    // 手臂张开
    for (const side of [-1, 1]) {
      const hand: [number, number] = [x + side * (0.58 + 0.1 * h) + pose.lean * 0.2, (1.02 + b * 0.06) * h];
      seg(ctx, cam, [sh[0] + side * torsoW * 0.42, sh[1] - 0.04], hand, armW, p.jerseyDark);
      dot(ctx, cam, hand, 0.1, p.gloves);
    }
    head = dot(ctx, cam, [sh[0], sh[1] + headR + 0.08], headR, p.skin);
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
    for (const side of [-1, 1]) seg(ctx, cam, at(0.34, side * 0.07 * g), at(0.02, side * 0.12), legW, '#20242e');
    seg(ctx, cam, at(0.3), at(0.4), torsoW * 1.02, p.shorts);
    seg(ctx, cam, at(0.38), at(0.62), torsoW, p.jersey);
    for (const side of [-1, 1]) {
      const hand = at(1, side * 0.1);
      seg(ctx, cam, at(0.6, side * 0.08), hand, armW, p.jerseyDark);
      dot(ctx, cam, hand, 0.1, p.gloves);
    }
    head = dot(ctx, cam, at(0.72, 0.18 + headR * 0.2), headR, p.skin);
  }
  drawFace(ctx, head.x, head.y, head.r, p, face);
  ctx.restore();
  return { x: head.x, y: head.y - head.r * 1.2 };
}

/** 发型：盖在脸上面的部分。 */
function drawHairTop(ctx: Canvas2D, x: number, y: number, r: number, p: Look): void {
  ctx.fillStyle = p.hair;
  switch (p.hairStyle) {
    case 'bald':
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.35, y - r * 0.55, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'buzz':
      ctx.globalAlpha *= 0.75;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.05, r * 1.01, Math.PI * 1.08, Math.PI * 1.92);
      ctx.quadraticCurveTo(x, y - r * 0.62, x - r * 0.98, y - r * 0.32);
      ctx.fill();
      ctx.globalAlpha /= 0.75;
      return;
    case 'spiky':
      ctx.beginPath();
      ctx.moveTo(x - r * 1.0, y - r * 0.2);
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI * (1.05 + (i / 6) * 0.9);
        const rr = i % 2 ? r * 1.0 : r * 1.38;
        ctx.lineTo(x + Math.cos(a) * rr, y - r * 0.1 + Math.sin(a) * rr);
      }
      ctx.lineTo(x + r * 1.0, y - r * 0.2);
      ctx.quadraticCurveTo(x, y - r * 0.55, x - r * 1.0, y - r * 0.2);
      ctx.fill();
      return;
    case 'curly':
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.0 + (i / 6) * 1.0);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r * 0.85, y - r * 0.1 + Math.sin(a) * r * 0.85, r * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    case 'mohawk':
      ctx.beginPath();
      ctx.moveTo(x - r * 0.18, y - r * 0.85);
      ctx.lineTo(x - r * 0.1, y - r * 1.55);
      ctx.lineTo(x + r * 0.12, y - r * 1.45);
      ctx.lineTo(x + r * 0.2, y - r * 0.85);
      ctx.fill();
      ctx.globalAlpha *= 0.4;
      ctx.beginPath();
      ctx.arc(x, y - r * 0.05, r * 1.0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.fill();
      ctx.globalAlpha /= 0.4;
      return;
    default:
      // short / long / ponytail 的顶部
      ctx.beginPath();
      ctx.arc(x, y - r * 0.12, r * 1.03, Math.PI * 1.05, Math.PI * 1.95);
      ctx.quadraticCurveTo(x, y - r * 0.5, x - r * 1.0, y - r * 0.15);
      ctx.fill();
  }
}

/** 发型：在脸后面的部分（长发、马尾）。 */
function drawHairBack(ctx: Canvas2D, x: number, y: number, r: number, p: Look): void {
  ctx.fillStyle = p.hair;
  if (p.hairStyle === 'long') {
    roundRectPath(ctx, x - r * 1.12, y - r * 0.6, r * 2.24, r * 1.75, r * 0.6);
    ctx.fill();
  } else if (p.hairStyle === 'ponytail') {
    ctx.beginPath();
    ctx.ellipse(x + r * 1.05, y - r * 0.1, r * 0.32, r * 0.55, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadgear(ctx: Canvas2D, x: number, y: number, r: number, p: Look): void {
  if (p.headgear === 'cap') {
    ctx.fillStyle = p.jerseyDark;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.25, r * 1.02, Math.PI, 0);
    ctx.fill();
    roundRectPath(ctx, x - r * 0.2, y - r * 0.38, r * 1.45, r * 0.24, r * 0.12);
    ctx.fill();
  } else if (p.headgear === 'headband') {
    ctx.fillStyle = p.jersey;
    roundRectPath(ctx, x - r * 1.0, y - r * 0.58, r * 2.0, r * 0.26, r * 0.1);
    ctx.fill();
  } else if (p.headgear === 'beanie') {
    ctx.fillStyle = p.jerseyDark;
    ctx.beginPath();
    ctx.arc(x, y - r * 0.3, r * 1.04, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = p.jersey;
    roundRectPath(ctx, x - r * 1.05, y - r * 0.42, r * 2.1, r * 0.3, r * 0.12);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - r * 1.38, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 脸：发型、帽子、眼睛、嘴、胡子眼镜，按表情画。头像和球场上的人物共用。 */
export function drawFace(ctx: Canvas2D, x: number, y: number, r: number, p: Look, face: Face): void {
  ctx.save();
  drawHairBack(ctx, x, y, r, p);
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (p.extra === 'beard') {
    ctx.fillStyle = p.hair;
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.1, r * 0.98, Math.PI * 0.05, Math.PI * 0.95);
    ctx.quadraticCurveTo(x, y + r * 0.45, x + r * 0.97, y + r * 0.25);
    ctx.fill();
    ctx.globalAlpha /= 0.85;
  }
  drawHairTop(ctx, x, y, r, p);
  drawHeadgear(ctx, x, y, r, p);
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
  if (p.extra === 'glasses') {
    ctx.lineWidth = Math.max(1, r * 0.08);
    for (const dx of [-0.38, 0.38]) {
      ctx.beginPath();
      ctx.arc(x + dx * r, eyeY, r * 0.24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x - r * 0.14, eyeY);
    ctx.lineTo(x + r * 0.14, eyeY);
    ctx.stroke();
    ctx.lineWidth = lw;
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
  if (p.extra === 'mustache') {
    ctx.fillStyle = p.hair;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.15, y + r * 0.33, r * 0.2, r * 0.08, 0.2, 0, Math.PI * 2);
    ctx.ellipse(x + r * 0.15, y + r * 0.33, r * 0.2, r * 0.08, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1f2e';
  }
  ctx.beginPath();
  if (face === 'smug') {
    ctx.arc(x + r * 0.08, y + r * 0.32, r * 0.3, Math.PI * 0.05, Math.PI * 0.8);
    ctx.stroke();
  } else if (face === 'shock') {
    ctx.ellipse(x, y + r * 0.47, r * 0.15, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (face === 'sad') {
    ctx.arc(x, y + r * 0.66, r * 0.22, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    ctx.moveTo(x - r * 0.2, y + r * 0.5);
    ctx.lineTo(x + r * 0.2, y + r * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** 头像：圆形底 + 肩膀 + 脸（气泡、卡片、选人列表用）。 */
export function drawAvatar(ctx: Canvas2D, x: number, y: number, r: number, p: Look, face: Face, num = '1'): void {
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
  ctx.fillText(num, x, y + r * 0.78);
  drawFace(ctx, x, y - r * 0.05, r * 0.5, p, face);
  ctx.restore();
}

// ---------- 人墙 ----------

const DEF_SKIN = ['#f1c7a0', '#c98e62', '#8a5a3c', '#e8b48c', '#a8714a'];
const DEF_HAIR = ['#2a1d14', '#121212', '#5a3a22', '#c9a15a', '#1a1a1a'];

export interface WallLook {
  jersey: string;
  jerseyDark: string;
  shorts: string;
}

/**
 * 人墙：几个防守球员并排站，双手护在身前，面朝罚球的人。
 * people：每人脚下的位置；tangent：沿着人墙的方向；jump：0～1，跳起来多高（最高 0.37 米，和人墙能挡的高度一样）。
 */
export function drawWall(ctx: Canvas2D, cam: Camera, people: readonly { x: number; z: number }[], tangent: { x: number; z: number }, jump: number, look: WallLook): void {
  ctx.save();
  // 裁判喷的白线（人墙不能往前站）
  if (people.length > 0) {
    const first = people[0]!;
    const lastP = people[people.length - 1]!;
    const a = project(cam, first.x - tangent.x * 0.5, 0, first.z - tangent.z * 0.5);
    const b = project(cam, lastP.x + tangent.x * 0.5, 0, lastP.z + tangent.z * 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.5, a.s * 0.06);
    ctx.lineCap = 'round';
    ctx.setLineDash([a.s * 0.08, a.s * 0.05]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const order = people.map((p, i) => ({ ...p, i, s: project(cam, p.x, 0, p.z).s })).sort((a, b) => a.s - b.s);
  for (const m of order) {
    const g = project(cam, m.x, 0, m.z);
    const s = g.s;
    const tall = 1 + ((m.i * 37) % 5) * 0.02 - 0.04;
    const lift = jump * 0.37 * s;
    const x = g.x;
    const y0 = g.y - lift;
    // 影子
    ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - jump * 0.5)})`;
    ctx.beginPath();
    ctx.ellipse(x, g.y, s * 0.28 * (1 - jump * 0.3), s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    const up = (k: number): number => y0 - k * s * tall;
    ctx.lineCap = 'round';
    // 腿：大腿露肉，小腿是球袜，脚下是球鞋
    for (const side of [-1, 1]) {
      const spread = side * (0.09 + jump * 0.03) * s;
      ctx.strokeStyle = DEF_SKIN[m.i % DEF_SKIN.length]!;
      ctx.lineWidth = 0.13 * s;
      ctx.beginPath();
      ctx.moveTo(x + side * 0.08 * s, up(0.66));
      ctx.lineTo(x + spread, up(0.4));
      ctx.stroke();
      ctx.strokeStyle = look.jersey;
      ctx.lineWidth = 0.125 * s;
      ctx.beginPath();
      ctx.moveTo(x + spread, up(0.42));
      ctx.lineTo(x + spread, up(0.06));
      ctx.stroke();
      ctx.fillStyle = '#20242e';
      ctx.beginPath();
      ctx.ellipse(x + spread, up(0.03), 0.08 * s, 0.045 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 短裤和球衣
    ctx.fillStyle = look.shorts;
    roundRectPath(ctx, x - 0.2 * s, up(0.97), 0.4 * s, 0.34 * s * tall, 0.06 * s);
    ctx.fill();
    ctx.fillStyle = look.jersey;
    roundRectPath(ctx, x - 0.22 * s, up(1.5), 0.44 * s, 0.6 * s * tall, 0.1 * s);
    ctx.fill();
    ctx.fillStyle = look.jerseyDark;
    ctx.fillRect(x - 0.22 * s, up(1.0), 0.44 * s, 0.05 * s);
    // 双手护在身前
    ctx.strokeStyle = look.jersey;
    ctx.lineWidth = 0.1 * s;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * 0.21 * s, up(1.44));
      ctx.lineTo(x + side * 0.2 * s, up(1.22));
      ctx.stroke();
    }
    ctx.strokeStyle = DEF_SKIN[m.i % DEF_SKIN.length]!;
    ctx.lineWidth = 0.085 * s;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * 0.2 * s, up(1.22));
      ctx.lineTo(x - side * 0.03 * s, up(0.9));
      ctx.stroke();
    }
    // 头
    const hr = 0.12 * s;
    const hy = up(1.64);
    ctx.fillStyle = DEF_SKIN[m.i % DEF_SKIN.length]!;
    ctx.beginPath();
    ctx.arc(x, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = DEF_HAIR[(m.i * 3) % DEF_HAIR.length]!;
    ctx.beginPath();
    ctx.arc(x, hy - hr * 0.1, hr * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    // 眼睛：跳起来时闭眼
    ctx.fillStyle = '#20242e';
    if (jump > 0.3) {
      ctx.fillRect(x - hr * 0.5, hy + hr * 0.05, hr * 0.32, hr * 0.1);
      ctx.fillRect(x + hr * 0.18, hy + hr * 0.05, hr * 0.32, hr * 0.1);
    } else {
      ctx.beginPath();
      ctx.arc(x - hr * 0.35, hy + hr * 0.1, hr * 0.12, 0, Math.PI * 2);
      ctx.arc(x + hr * 0.35, hy + hr * 0.1, hr * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- 球鞋和踢球的腿 ----------

export interface BootLook {
  color: string;
  accent: string;
}

/** 从后面看的一只球鞋（鞋尖朝上），中心在 (x, y)，angle 是转角。 */
function bootTop(ctx: Canvas2D, x: number, y: number, r: number, angle: number, b: BootLook): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  roundRectPath(ctx, -r * 0.55, -r * 1.25, r * 1.1, r * 2.5, [r * 0.55, r * 0.55, r * 0.4, r * 0.4]);
  ctx.fillStyle = '#20242e';
  ctx.fill();
  roundRectPath(ctx, -r * 0.48, -r * 1.2, r * 0.96, r * 2.3, [r * 0.5, r * 0.5, r * 0.35, r * 0.35]);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = b.accent;
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, r * 0.1);
  ctx.lineTo(r * 0.45, -r * 0.4);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 3; i++) ctx.fillRect(-r * 0.18, -r * 0.6 + i * r * 0.32, r * 0.36, r * 0.08);
  ctx.restore();
}

/**
 * 罚球的那条腿：等着射门时脚踩在球旁边；踢的时候 k 从 0 走到 1：往后摆、踢到球、往前送。
 * side：-1 左脚，1 右脚。
 */
export function drawKickLeg(ctx: Canvas2D, ball: { x: number; y: number; r: number }, side: -1 | 1, boot: BootLook, sock: string, k: number, approach = 1): void {
  const r = ball.r;
  // approach：助跑时脚从下面走过来（0 在画面下面，1 到了球边）
  const rest = { x: ball.x + side * r * (1.7 + (1 - approach) * 1.5), y: ball.y + r * (1.7 + (1 - approach) * 7) };
  const back = { x: ball.x + side * r * 1.5, y: ball.y + r * 3.3 };
  const hit = { x: ball.x + side * r * 0.45, y: ball.y + r * 0.9 };
  const follow = { x: ball.x - side * r * 0.9, y: ball.y - r * 2.6 };
  let p = rest;
  let angle = -side * 0.25;
  let alpha = 1;
  if (k > 0) {
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (k < 0.35) p = lerp(rest, back, k / 0.35);
    else if (k < 0.55) p = lerp(back, hit, (k - 0.35) / 0.2);
    else {
      p = lerp(hit, follow, (k - 0.55) / 0.45);
      alpha = 1 - (k - 0.55) / 0.45;
    }
    angle = -side * (0.25 - k * 0.5);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  // 小腿：从下面伸过来，越往下越淡（像镜头只拍到脚）
  const hip = { x: ball.x + side * r * 3.6, y: p.y + r * 8 };
  const ctrl = { x: p.x + side * r * 1.4, y: p.y + r * 3.8 };
  ctx.lineCap = 'round';
  const steps = 14;
  let prev = { x: p.x, y: p.y + r * 0.8 };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * (p.x) + 2 * (1 - t) * t * ctrl.x + t * t * hip.x;
    const y = (1 - t) * (1 - t) * (p.y + r * 0.8) + 2 * (1 - t) * t * ctrl.y + t * t * hip.y;
    ctx.globalAlpha = alpha * Math.max(0, 1 - t * 1.1);
    ctx.strokeStyle = sock;
    ctx.lineWidth = r * (1.1 + t * 0.6);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    prev = { x, y };
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = r * 0.25;
  ctx.beginPath();
  ctx.moveTo(p.x - r * 0.55, p.y + r * 1.4);
  ctx.lineTo(p.x + r * 0.55, p.y + r * 1.4);
  ctx.stroke();
  bootTop(ctx, p.x, p.y, r * 0.95, angle, boot);
  ctx.restore();
}

/** 侧面看的一只球鞋（选球鞋的列表用）。 */
export function drawBootSide(ctx: Canvas2D, x: number, y: number, w: number, b: BootLook): void {
  const h = w * 0.42;
  ctx.save();
  ctx.translate(x - w / 2, y - h / 2);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.35);
  ctx.quadraticCurveTo(w * 0.05, 0, w * 0.3, h * 0.05);
  ctx.lineTo(w * 0.55, h * 0.25);
  ctx.quadraticCurveTo(w * 0.95, h * 0.35, w, h * 0.75);
  ctx.lineTo(w, h * 0.85);
  ctx.lineTo(0, h * 0.85);
  ctx.closePath();
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = b.accent;
  ctx.lineWidth = h * 0.12;
  ctx.beginPath();
  ctx.moveTo(w * 0.25, h * 0.7);
  ctx.lineTo(w * 0.62, h * 0.35);
  ctx.stroke();
  ctx.fillStyle = '#20242e';
  ctx.fillRect(0, h * 0.85, w, h * 0.12);
  for (let i = 0; i < 4; i++) ctx.fillRect(w * (0.1 + i * 0.25), h * 0.95, w * 0.07, h * 0.12);
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
