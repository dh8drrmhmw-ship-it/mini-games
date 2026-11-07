/**
 * 点球大战的「世界」：球门、点球点、镜头，以及把手指划的一下换算成射门。单位是米和秒。
 *
 * 坐标：x 向右为正（从罚球的人看），y 向上，z 从球门线（z = 0）指向罚球的人。
 */
import type { Rng } from '../shared/rng.ts';

export const GOAL_W = 7.32;
export const GOAL_H = 2.44;
export const HALF_W = GOAL_W / 2;
export const POST_R = 0.06;
export const BALL_R = 0.11;
export const SPOT_Z = 11;

/** 射门区域：左中右 × 下上，从罚球的人看。编号 = 列 + 3 × 行。 */
export type Zone = 0 | 1 | 2 | 3 | 4 | 5;
export const ZONES: readonly Zone[] = [0, 1, 2, 3, 4, 5];
export const ZONE_NAMES = ['左下', '中下', '右下', '左上', '中上', '右上'] as const;

export function zoneCol(z: Zone): 0 | 1 | 2 {
  return (z % 3) as 0 | 1 | 2;
}

export function zoneRow(z: Zone): 0 | 1 {
  return (z >= 3 ? 1 : 0) as 0 | 1;
}

/** 一个落点属于哪个区域。 */
export function zoneOf(x: number, y: number): Zone {
  const col = x < -1.25 ? 0 : x > 1.25 ? 2 : 1;
  const row = y < 1.15 ? 0 : 1;
  return (col + 3 * row) as Zone;
}

/** 门将扑向一个区域时，手伸到的位置。 */
export function zoneReach(z: Zone): { x: number; y: number } {
  return { x: [-2.55, 0, 2.55][zoneCol(z)]!, y: [0.45, 1.75][zoneRow(z)]! };
}

// ---------- 镜头 ----------

export interface Camera {
  /** 镜头离球门线的距离（米） */
  z: number;
  /** 镜头高度 */
  y: number;
  /** 焦距（像素） */
  f: number;
  /** 屏幕上的中线和地平线 */
  cx: number;
  horizon: number;
}

export const CAM_BACK = 4.0;
/** 镜头比人高一些，像站在罚球的人身后、稍微往下看：球和球门在屏幕上拉得更开，好瞄准。 */
export const CAM_Y = 2.3;

/**
 * 按屏幕大小摆镜头：球门尽量宽，又要在上面留出记分的地方、在球下面留出划手指的地方。
 * top：横梁最高能到的屏幕位置；ballMaxY：球最低能到的屏幕位置。
 */
export function makeCamera(width: number, top: number, ballMaxY: number): Camera {
  const z = SPOT_Z + CAM_BACK;
  const fByWidth = (width * 0.86 * z) / GOAL_W;
  // 从横梁到球，屏幕上的高度 = f × (镜头高 / 球的距离 + (门高 - 镜头高) / 球门的距离)
  const span = CAM_Y / CAM_BACK + (GOAL_H - CAM_Y) / z;
  const f = Math.min(fByWidth, (ballMaxY - top) / span);
  const horizon = ballMaxY - (CAM_Y * f) / CAM_BACK;
  return { z, y: CAM_Y, f, cx: width / 2, horizon };
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** 这个深度上 1 米是多少像素 */
  s: number;
}

export function project(cam: Camera, x: number, y: number, z: number): ScreenPoint {
  const d = Math.max(0.3, cam.z - z);
  const s = cam.f / d;
  return { x: cam.cx + x * s, y: cam.horizon + (cam.y - y) * s, s };
}

/** 屏幕上一点，对应球门线所在平面（z = 0）上的哪个位置。 */
export function unprojectGoalPlane(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  const s = cam.f / cam.z;
  return { x: (sx - cam.cx) / s, y: cam.y - (sy - cam.horizon) / s };
}

// ---------- 射门 ----------

export interface Swipe {
  /** 手指划过的点（屏幕坐标），第一个是按下的地方，最后一个是松开的地方 */
  points: readonly { x: number; y: number }[];
  /** 用时（秒） */
  duration: number;
}

export interface Shot {
  /** 想踢到的位置（球门平面上） */
  aimX: number;
  aimY: number;
  /** 想踢的区域（门将记的是这个） */
  zone: Zone;
  /** 实际落点（加上脚下的偏差以后） */
  tx: number;
  ty: number;
  /** 0～1：划得越快，球越快 */
  power: number;
  /** 球飞到门线要几秒 */
  time: number;
  /** 弧线：中途往旁边弯多少米（香蕉球） */
  bend: number;
  /** 划得太短，球软绵绵地滚过去 */
  weak: boolean;
}

export const SHOT_TIME_FAST = 0.42;
export const SHOT_TIME_SLOW = 0.78;

export type SwipeProblem = 'short' | 'down';

/**
 * 手指划的一下 → 射门。往想踢的位置划：
 * - 方向定左右：划的方向一直延长到球门线，指到哪里就往哪里踢；
 * - 手指松开的地方如果已经到了球门里，就踢向那里（高度也照着来）；没到球门就是贴地球；
 * - 划得越快球越快，但越容易偏。
 */
export function shotFromSwipe(cam: Camera, ball: ScreenPoint, swipe: Swipe, rng: Rng): Shot | SwipeProblem {
  const pts = swipe.points;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const goalLine = project(cam, 0, 0, 0).y;
  const toGoal = ball.y - goalLine;
  if (dy > -toGoal * 0.12 || len < toGoal * 0.15) return dy > 0 ? 'down' : 'short';
  if (Math.abs(dx) > -dy * 2.2) return 'down';

  // 把这一划平移到球上：手指从球出发划到了哪里，就踢向哪里。
  // 还没划到球门线的高度，就沿着划的方向延长到球门线，踢贴地球。
  const lift = -dy / toGoal; // 往上划了「球到门线」距离的几倍
  let aimX: number;
  let aimY: number;
  if (lift >= 1) {
    const p = unprojectGoalPlane(cam, ball.x + dx, ball.y + dy);
    aimX = p.x;
    aimY = Math.max(0.15, p.y);
  } else {
    aimX = unprojectGoalPlane(cam, ball.x + dx / lift, goalLine).x;
    aimY = 0.15 + Math.max(0, lift - 0.45) * 0.35;
  }
  const weak = lift < 0.45;

  // 速度：每秒划过多少个「球到门线」的距离
  const speed = len / toGoal / Math.max(0.03, swipe.duration);
  const power = weak ? 0 : clamp01((speed - 2.2) / (7 - 2.2));
  const time = weak ? 1.15 : SHOT_TIME_SLOW - (SHOT_TIME_SLOW - SHOT_TIME_FAST) * power;

  // 脚下的偏差：越用力越不准
  const sd = 0.06 + 0.32 * power * power;
  const tx = aimX + gauss(rng) * sd;
  const ty = Math.max(BALL_R, aimY + gauss(rng) * sd * 0.8);

  // 弧线：划的路线中间往一边鼓出来多少
  let maxDev = 0;
  for (const p of pts) {
    const dev = ((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.max(1, len);
    if (Math.abs(dev) > Math.abs(maxDev)) maxDev = dev;
  }
  const bend = weak ? 0 : clamp(-(maxDev / Math.max(1, len)) * 6, -1.4, 1.4);

  return { aimX, aimY, zone: zoneOf(aimX, aimY), tx, ty, power, time, bend, weak };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 标准正态分布（Box–Muller）。只用来加一点偏差，不需要逐位相同。 */
export function gauss(rng: Rng): number {
  const u = (rng.nextU32() + 1) / 4294967297;
  const v = rng.nextU32() / 4294967296;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 球在第 t 秒的位置（从踢出去开始算，到门线为止）。 */
export function ballAt(shot: Shot, t: number): { x: number; y: number; z: number } {
  const u = clamp01(t / shot.time);
  const bump = 4 * u * (1 - u);
  const arc = shot.weak ? 0 : 0.12 + (1 - shot.power) * 0.35;
  return {
    x: shot.tx * u + shot.bend * bump,
    y: Math.max(BALL_R, BALL_R + (shot.ty - BALL_R) * u + arc * bump),
    z: SPOT_Z * (1 - u),
  };
}
