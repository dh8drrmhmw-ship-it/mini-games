/**
 * 任意球：罚球的位置和人墙。
 *
 * 人墙站在离球 9.15 米的地方，挡住靠近球的那一侧球门（近角）；门将站在另一边。
 * 想进球：要么从人墙上面吊过去、靠下坠掉进近角，要么画弧线绕过人墙打远角。
 */
import { ballAt, BALL_R, HALF_W, type Shot, type Spot } from './world.ts';

export interface FreeKickSpot extends Spot {
  id: string;
  /** 显示用的名字，比如「正面 20 米」 */
  name: string;
  /** 人墙几个人 */
  wall: number;
}

export const FREE_KICKS: Record<string, FreeKickSpot> = {
  c20: { id: 'c20', name: '正面 20 米', x: 0.5, z: 20, wall: 4 },
  l22: { id: 'l22', name: '左侧 22 米', x: -6, z: 21, wall: 4 },
  r24: { id: 'r24', name: '右侧 24 米', x: 7, z: 23, wall: 4 },
  c27: { id: 'c27', name: '正面 27 米', x: 1.5, z: 27, wall: 5 },
  r18: { id: 'r18', name: '右边小角度', x: 11, z: 17, wall: 3 },
  l30: { id: 'l30', name: '左侧 30 米', x: -4, z: 30, wall: 5 },
};

/** 人墙离球多远（规则是 9.15 米） */
export const WALL_DIST = 9.15;
/** 每个人占多宽、多高（跳起来时头顶的高度） */
export const WALL_MAN = 0.55;
export const WALL_TOP = 2.15;

export interface Wall {
  /** 人墙中间的位置 */
  x: number;
  z: number;
  /** 沿着人墙的方向（单位向量） */
  tx: number;
  tz: number;
  /** 从球指向人墙的方向（单位向量） */
  nx: number;
  nz: number;
  count: number;
  /** 门将起步站的位置（在人墙挡不住的那一边） */
  keeperX: number;
}

/** 摆人墙：挡住近角那一边。正中间的任意球挡左边。 */
export function makeWall(spot: FreeKickSpot): Wall {
  const near = spot.x > 1 ? 1 : -1;
  const aimX = near * (HALF_W - 1.2);
  const dx = aimX - spot.x;
  const dz = 0 - spot.z;
  const len = Math.hypot(dx, dz);
  const nx = dx / len;
  const nz = dz / len;
  return {
    x: spot.x + nx * WALL_DIST,
    z: spot.z + nz * WALL_DIST,
    tx: -nz,
    tz: nx,
    nx,
    nz,
    count: spot.wall,
    keeperX: -near * 0.9,
  };
}

/** 每个人站在哪（从人墙的一头排到另一头）。 */
export function wallPeople(w: Wall): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < w.count; i++) {
    const k = (i - (w.count - 1) / 2) * WALL_MAN;
    out.push({ x: w.x + w.tx * k, z: w.z + w.tz * k });
  }
  return out;
}

export interface WallCheck {
  /** 打在人墙上了 */
  blocked: boolean;
  /** 球从人墙正上方飞过：门将被挡住视线，反应慢 */
  over: boolean;
  /** 球飞到人墙那里时是第几成（0～1），没飞到人墙就是 -1 */
  u: number;
}

/** 球会不会打在人墙上。 */
export function checkWall(shot: Shot, w: Wall): WallCheck {
  const half = (w.count * WALL_MAN) / 2;
  let prev = -1;
  for (let i = 0; i <= 160; i++) {
    const t = (shot.time * i) / 160;
    const p = ballAt(shot, t);
    const side = (p.x - w.x) * w.nx + (p.z - w.z) * w.nz;
    if (prev < 0 && side >= 0) {
      const lateral = (p.x - w.x) * w.tx + (p.z - w.z) * w.tz;
      const inSpan = Math.abs(lateral) <= half + BALL_R * 0.6;
      const blocked = inSpan && p.y <= WALL_TOP + BALL_R;
      return { blocked, over: inSpan && !blocked, u: i / 160 };
    }
    prev = side;
  }
  return { blocked: false, over: false, u: -1 };
}
