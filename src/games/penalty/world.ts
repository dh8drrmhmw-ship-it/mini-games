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
  /** 镜头的位置（米） */
  x: number;
  y: number;
  z: number;
  /** 朝向：0 是正对球门；镜头在球门右边时往左转 */
  yaw: number;
  /** 焦距（像素） */
  f: number;
  /** 屏幕上的中线和地平线 */
  cx: number;
  horizon: number;
}

/** 罚球的位置：点球点，或者任意球的位置（x 左右、z 离球门线多远）。 */
export interface Spot {
  x: number;
  z: number;
}

export const PENALTY_SPOT: Spot = { x: 0, z: SPOT_Z };

export function isPenalty(spot: Spot): boolean {
  return spot.x === 0 && spot.z === SPOT_Z;
}

export const CAM_BACK = 4.0;
/** 镜头比人高一些，像站在罚球的人身后、稍微往下看：球和球门在屏幕上拉得更开，好瞄准。 */
export const CAM_Y = 2.3;

/**
 * 按屏幕大小摆镜头：镜头在球的正后方、对着球门中间；球门尽量宽，
 * 又要在上面留出记分的地方、在球下面留出划手指的地方。
 * top：横梁最高能到的屏幕位置；ballMaxY：球最低能到的屏幕位置。
 * 任意球离得远，镜头退得更远一些；人墙会挡住一部分球门，要从人墙上面或旁边绕过去。
 */
export function makeCamera(width: number, top: number, ballMaxY: number, spot: Spot = PENALTY_SPOT): Camera {
  const pen = isPenalty(spot);
  // 任意球：镜头在球后 5 米、2.4 米高，人墙正好挡住球门靠近角那边的下半截
  const back = pen ? CAM_BACK : FK_CAM_BACK;
  const camY = pen ? CAM_Y : 2.4;
  const dist = Math.hypot(spot.x, spot.z);
  const x = spot.x + (spot.x / dist) * back;
  const z = spot.z + (spot.z / dist) * back;
  const camDist = Math.hypot(x, z);
  const yaw = Math.atan2(-x, z);
  const fByWidth = (width * 0.86 * camDist) / GOAL_W;
  // 从横梁到球，屏幕上的高度 = f × (镜头高 / 球的距离 + (门高 - 镜头高) / 球门的距离)
  const span = camY / back + (GOAL_H - camY) / camDist;
  const f = Math.min(fByWidth, (ballMaxY - top) / span);
  const horizon = ballMaxY - (camY * f) / back;
  return { x, y: camY, z, yaw, f, cx: width / 2, horizon };
}

/** 任意球镜头离球多远（米）。 */
export const FK_CAM_BACK = 5;

/**
 * 任意球：左手拖动转镜头。镜头始终在球的正后方，对着「瞄准方向」——从球出发、
 * 指向球门线上 aimX 那一点；远近和高低不变，只是转了个方向。
 */
export function aimCamera(base: Camera, spot: Spot, aimX: number): Camera {
  const yaw = Math.atan2(aimX - spot.x, spot.z);
  return { ...base, x: spot.x - FK_CAM_BACK * Math.sin(yaw), z: spot.z + FK_CAM_BACK * Math.cos(yaw), yaw };
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** 这个深度上 1 米是多少像素 */
  s: number;
}

export function project(cam: Camera, x: number, y: number, z: number): ScreenPoint {
  const rx = x - cam.x;
  const rz = z - cam.z;
  const sin = Math.sin(cam.yaw);
  const cos = Math.cos(cam.yaw);
  // 往前（朝球门）是 (sin, -cos)，往右是 (cos, sin)
  const d = Math.max(0.3, rx * sin - rz * cos);
  const lateral = rx * cos + rz * sin;
  const s = cam.f / d;
  return { x: cam.cx + lateral * s, y: cam.horizon + (cam.y - y) * s, s };
}

/** 屏幕上一点，对应球门线所在平面（z = 0）上的哪个位置。 */
export function unprojectGoalPlane(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  const sin = Math.sin(cam.yaw);
  const cos = Math.cos(cam.yaw);
  const a = (sx - cam.cx) / cam.f;
  const b = -(sy - cam.horizon) / cam.f;
  // 视线方向 = 往前 + a × 往右 + b × 往上；走到 z = 0 为止
  const dz = -cos + a * sin;
  const d = Math.abs(dz) > 1e-6 ? -cam.z / dz : 0;
  return { x: cam.x + d * (sin + a * cos), y: cam.y + b * d };
}

// ---------- 射门 ----------

export interface Swipe {
  /** 手指划过的点（屏幕坐标，t 是秒），第一个是按下的地方，最后一个是松开的地方 */
  points: readonly { x: number; y: number; t: number }[];
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
  /** 0～1：松手那一下划得越快，球越快 */
  power: number;
  /** 球飞到门线要几秒 */
  time: number;
  /** 弧线：中途往旁边弯多少米（正数往右鼓） */
  bend: number;
  /** 划得太短，球软绵绵地滚过去 */
  weak: boolean;
  /** 勺子：往中间轻轻挑起来的高吊球 */
  chip?: boolean;
  /** 被风吹偏了多少米（已经算在 tx 里；飞行路线后半段才偏过去） */
  drift?: number;
  /** 从哪里踢的（点球点或任意球的位置） */
  ox: number;
  oz: number;
  /** 球飞到一半时比直线高出多少米 */
  arc: number;
  /** 任意球力量太小：球飞到这一成（0～1）就落地，后面贴着地滚 */
  land?: number;
  /** 任意球的上旋：后半段额外往下掉（米），飞过人墙以后掉得更快 */
  sink?: number;
}

/** 罚球球员的三项能力（1～5），见 players.ts。 */
export interface Kicker {
  power: number;
  accuracy: number;
  curve: number;
  /** 顺脚的弧线方向：1 = 往右鼓（右脚内脚背），-1 = 往左鼓（左脚），0 = 两边都顺 */
  curveSide: 1 | -1 | 0;
  /** 会不会踢勺子 */
  chip?: boolean;
}

export const SHOT_TIME_FAST = 0.42;
export const SHOT_TIME_SLOW = 0.85;

export type SwipeProblem = 'short' | 'down';

/**
 * 这一划最快的时候有多快（每秒划过几个「球到门线」的距离）。
 * 看整个过程里最快的一小段（0.08 秒），所以画弧线时最后手指慢下来也没关系。
 */
export function swipeSpeed(points: Swipe['points'], toGoal: number): number {
  let best = 0;
  let j = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    while (j < i - 1 && p.t - points[j]!.t > 0.08) j++;
    const q = points[j]!;
    const dt = Math.max(1 / 60, p.t - q.t);
    best = Math.max(best, Math.hypot(p.x - q.x, p.y - q.y) / dt);
  }
  return best / toGoal;
}

/**
 * 点球：手指划的一下 → 射门：
 * - 落点：手指从球出发划到球门里哪一点，球就飞向哪一点；没划到球门线的高度是贴地球。
 * - 弧线：球一开始沿着你最开始划的方向飞，最后拐到落点。先往左划再拐到右边，就是往右拐的弧线球。
 * - 力量：看这一划最快的时候有多快。越快球越快，但越容易偏。
 * - 弧线有顺逆：右脚顺的是「先往右再拐回左」，反方向只能弯一点、还更容易偏。
 */
export function shotFromSwipe(cam: Camera, ball: ScreenPoint, swipe: Swipe, rng: Rng, kicker: Kicker, wind = 0): Shot | SwipeProblem {
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

  // 落点：把这一划平移到球上
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

  // 力量
  const speed = swipeSpeed(pts, toGoal);
  const power = weak ? 0 : clamp01((speed - 2) / (7.5 - 2));

  // 弧线：最开始划的方向（离起点一小段距离的那一点）延长到球门线
  // 球的横向位置 x(u) = 起点 + (落点 - 起点) × u + 弧线 × 4u(1-u)，所以一开始的方向指向「落点 + 4 × 弧线」
  let bend = 0;
  if (!weak) {
    const launch = pts.find((p) => Math.hypot(p.x - a.x, p.y - a.y) >= toGoal * 0.35) ?? b;
    const ly = launch.y - a.y;
    if (ly < -4) {
      const x0 = unprojectGoalPlane(cam, ball.x + (launch.x - a.x) * (toGoal / -ly), goalLine).x;
      bend = (x0 - aimX) / 4;
    }
  }
  return buildShot({ aimX, aimY, weak, power, bend }, kicker, rng, wind);
}

/** 玩家想怎么踢点球（从手指划的一下读出来的）。 */
export interface Intent {
  aimX: number;
  aimY: number;
  weak: boolean;
  /** 0～1 */
  power: number;
  /** 想要的弧线（米，还没按球员能力限制） */
  bend: number;
}

/** 弧线最多能拐多少（米）：看球员的弧线能力，反脚只有四成。任意球的弧线见 buildFreeKick。 */
function bendLimit(kicker: Kicker, bend: number): { limit: number; against: boolean } {
  const against = kicker.curveSide !== 0 && Math.sign(bend) === -kicker.curveSide;
  return { limit: (0.35 + 0.3 * (kicker.curve - 1)) * (against ? 0.4 : 1), against };
}

/**
 * 点球：按球员能力和风，把「想怎么踢」变成真正踢出去的球（加上脚下的偏差）。
 * 平衡测试的模拟玩家也用这个，保证和真游戏的规则一样。
 */
export function buildShot(it: Intent, kicker: Kicker, rng: Rng, wind = 0): Shot {
  const { aimX, aimY, weak, power } = it;
  const fastest = 0.52 - 0.035 * (kicker.power - 1);
  const time = weak ? 1.15 : SHOT_TIME_SLOW - (SHOT_TIME_SLOW - fastest) * power;

  // 点球离得近，弧线拐不了多大（只有能力上限的一半）
  const { limit, against } = bendLimit(kicker, it.bend);
  const bend = weak ? 0 : clamp(it.bend, -limit * 0.5, limit * 0.5);
  const arc = 0.12 + (1 - power) * 0.35;

  // 脚下的偏差：越用力越不准，弧线越大越不准，球员越准偏得越少
  const sd = shotSpread(aimX, aimY, power, kicker.accuracy) + Math.abs(bend) * (against ? 0.25 : 0.06);
  // 风：球飞得越久，被吹得越偏
  const drift = weak ? 0 : wind * time * 0.42;
  const tx = aimX + gauss(rng) * sd + drift;
  const ty = Math.max(BALL_R, aimY + gauss(rng) * sd * 0.8);

  const o = { ox: 0, oz: SPOT_Z };
  // 勺子：会踢勺子的球员，往中间偏上轻轻一挑
  if (kicker.chip && !weak && power < 0.25 && Math.abs(aimX) < 1.4 && aimY >= 0.6) {
    return { aimX, aimY, zone: zoneOf(aimX, aimY), tx: aimX + gauss(rng) * 0.08, ty: Math.min(2.2, aimY), power, time: 1.0, bend: 0, weak, chip: true, ...o, arc: 1.3 };
  }
  return { aimX, aimY, zone: zoneOf(aimX, aimY), tx, ty, power, time, bend, weak, drift, ...o, arc: weak ? 0 : arc };
}

// ---------- 任意球 ----------

/** 任意球的手感：左手转镜头定方向，右手划一下定力量和弧线。 */
export interface FreeKickIntent {
  /** 瞄准方向：从球出发指向球门线上的这一点（米）。球一开始就沿着这个方向飞 */
  aimX: number;
  /** 0～1：右手划得越快越大。力量越大球越快、也飞得越高；太小打人墙，太大飞过横梁 */
  power: number;
  /** -1～1：右手划出来的弯有多大（正数是往右鼓）。乘上球员的弧线能力才是真的弧线 */
  curve: number;
}

/** 任意球的「重力」：真球有空气阻力和上旋，往下掉得比只有重力时快。 */
export const FK_GRAVITY = 17.2;
/** 上旋让球在后半段额外往下掉多少米（越往后掉得越快）。 */
export const FK_SINK = 1.0;

/**
 * 右手这一划：最快的时候有多快 → 力量；划出来的弯有多大 → 弧线。
 * 弯的大小 = 离起点到终点那条直线最远的一点有多远，除以这条直线的长度；两成就算划满。
 * ref：多少像素算「一个单位」（用球到球门线在屏幕上的距离）。
 */
export function readFreeKickSwipe(points: Swipe['points'], ref: number): { power: number; curve: number } | SwipeProblem {
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (dy > -ref * 0.1) return dy > 0 ? 'down' : 'short';
  if (len < ref * 0.18) return 'short';
  // 往右鼓为正：点到起点、终点连线的距离，在连线右边为正
  const nx = -dy / len;
  const ny = dx / len;
  let bulge = 0;
  for (const p of points) {
    const d = (p.x - a.x) * nx + (p.y - a.y) * ny;
    if (Math.abs(d) > Math.abs(bulge)) bulge = d;
  }
  const curve = clamp(bulge / len / 0.2, -1, 1);
  const power = clamp01((swipeSpeed(points, ref) - 1.4) / (8.5 - 1.4));
  return { power, curve: Math.abs(curve) < 0.08 ? 0 : curve };
}

/**
 * 任意球：按球员能力、距离、风，把「想怎么踢」变成真正踢出去的球。
 * - 球一开始沿着瞄准方向飞，弧线让它慢慢拐开，到球门时偏开大约 4 倍「弧线」那么多。
 * - 力量越大，球越快，起脚也越高；带上旋往下掉。离得越远，要的力量越大。
 * - 力量和方向都有偏差：越用力、越远、弧线越大越不准，球员越准偏得越少。
 */
export function buildFreeKick(it: FreeKickIntent, kicker: Kicker, rng: Rng | null, wind: number, spot: Spot): Shot {
  // rng 为 null：不加偏差（划手指时画预览用）
  const noise = (): number => (rng ? gauss(rng) : 0);
  const acc = 1.45 - 0.2 * (kicker.accuracy - 1);
  // 力量也会有一点偏差（手上的感觉和脚下不完全一样）
  const power = clamp01(it.power + noise() * (0.02 + 0.03 * it.power) * acc);
  // 弧线：上限看球员的弧线能力，反脚只有四成；任意球能拐得比点球大
  const { limit, against } = bendLimit(kicker, it.curve);
  const bend = it.curve * limit;
  // 方向偏差（米，在球门线上）
  const dist = Math.hypot(spot.x, spot.z);
  const sd = ((0.06 + 0.34 * power * power) * acc + Math.abs(bend) * (against ? 0.2 : 0.05)) * (1 + (dist - SPOT_Z) / 22);
  const aimX = it.aimX + noise() * sd;

  // 飞行：水平速度和起脚的竖直速度都看力量
  // 力量大主要是更快，也高一些：稍微大一点只会刚好高出横梁，不会飞上看台
  const speed = 16 + 11.4 * power + 1.3 * (kicker.power - 1) * power;
  const time = dist / speed;
  const vy = 4 + 10 * power;
  // 高度：y(u) = 起脚高度 + vy·T·u − ½gT²·u² − 上旋·u³（u 是飞了几成）
  const drop = (FK_GRAVITY * time * time) / 2;
  let ty = BALL_R + vy * time - drop - FK_SINK;
  let arc = drop / 4;
  let sink: number | undefined = FK_SINK;
  // 飞不到球门就落地：落地以后贴着地滚（落地前按一条抛物线画，最高点一样高）
  let land: number | undefined;
  if (ty < BALL_R) {
    const b = vy * time;
    land = (-drop + Math.sqrt(drop * drop + 4 * FK_SINK * b)) / (2 * FK_SINK);
    let top = 0;
    for (let i = 1; i < 40; i++) {
      const u = (land * i) / 40;
      top = Math.max(top, b * u - drop * u * u - FK_SINK * u * u * u);
    }
    arc = top;
    ty = BALL_R;
    sink = undefined;
  }
  const drift = wind * time * 0.42;
  // 一开始沿瞄准方向飞：x'(0) = (tx - ox) + 4 × 弧线 = aimX - ox
  const tx = aimX - 4 * bend + drift;
  return { aimX: it.aimX, aimY: ty, zone: zoneOf(tx, ty), tx, ty, power, time, bend, weak: false, drift, ox: spot.x, oz: spot.z, arc, land, sink };
}

/**
 * 脚下的偏差（米，一个标准差）：越用力越不准，球员越准偏得越少；
 * 越往死角（离中间越远、越高）越难踢准。
 */
export function shotSpread(aimX: number, aimY: number, power: number, accuracy: number): number {
  const corner = 1 + 0.5 * Math.min(1, Math.abs(aimX) / HALF_W) ** 2 + 0.4 * Math.min(1, aimY / GOAL_H) ** 2;
  return (0.06 + 0.34 * power * power) * (1.45 - 0.2 * (accuracy - 1)) * corner;
}

/** 球速（公里每小时），踢出去以后显示。 */
export function ballSpeedKmh(shot: Shot): number {
  const dist = Math.hypot(shot.oz, shot.tx - shot.ox, shot.ty) + Math.abs(shot.bend) * 0.3;
  return Math.round((dist / shot.time) * 3.6);
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
  // 高度：直线 + 抛物线；提前落地的球，抛物线在落地那一刻就结束
  const v = shot.land ? Math.min(1, u / shot.land) : u;
  return {
    x: shot.ox + (shot.tx - shot.ox) * u + shot.bend * bump + (shot.drift ?? 0) * (u * u - u),
    y: Math.max(BALL_R, BALL_R + (shot.ty - BALL_R) * u + shot.arc * 4 * v * (1 - v) + (shot.sink ?? 0) * u * (1 - u) * (1 + u)),
    z: shot.oz * (1 - u),
  };
}
