/**
 * 门将：记住你往哪里踢（「小本本」，跨局保存），猜你下一脚，扑救，还会说话。
 *
 * 猜的办法（越往后的门将用得越多）：
 * - 看频率：你最近最常踢哪里；
 * - 看顺序：你上一脚踢了哪里之后，通常接着踢哪里（再往后的门将连上两脚一起看）。
 * 门将不会偷看你这一脚的方向：他在你射门前就猜好了，球踢出去以后只能稍微调整。
 */
import type { Rng } from '../shared/rng.ts';
import { BALL_R, GOAL_H, HALF_W, POST_R, ZONE_NAMES, ZONES, zoneCol, zoneReach, type Shot, type Zone } from './world.ts';

export interface Persona {
  id: string;
  name: string;
  /** 一句话特点（换门将时显示） */
  trait: string;
  /** 上场时说的话 */
  intro: string;
  jersey: string;
  jerseyDark: string;
  skin: string;
  hair: string;
  /** 猜的随机程度：越大越像瞎猜 */
  temp: number;
  /** 三种猜法的权重：频率、看上一脚、看上两脚（其余是瞎猜） */
  wFreq: number;
  wM1: number;
  wM2: number;
  /** 反应：球踢出后多久开始扑（秒） */
  reaction: number;
  /** 扑到位要多久（秒） */
  dive: number;
  /** 扑的过程中最多能往球的方向修正多少米（球越慢修正越多） */
  adjust: number;
  /** 身体和手套能挡住的半径（米） */
  reach: number;
  /** 射门前「往要扑的那边晃」的概率；假动作（往反方向晃）的概率 */
  tell: number;
  fakeTell: number;
  lines: {
    save: readonly string[];
    goal: readonly string[];
    miss: readonly string[];
  };
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'rookie',
    name: '小胖',
    trait: '新手门将，一紧张就往要扑的那边晃',
    intro: '我、我准备好了！',
    jersey: '#f2b63c',
    jerseyDark: '#c98d1c',
    skin: '#f3c9a2',
    hair: '#3b2a1e',
    temp: 3,
    wFreq: 0.3,
    wM1: 0,
    wM2: 0,
    reaction: 0.16,
    dive: 0.55,
    adjust: 0.25,
    reach: 0.34,
    tell: 0.65,
    fakeTell: 0,
    lines: {
      save: ['我、我扑到了？！', '妈妈我扑到了！', '运气，是运气！'],
      goal: ['呜……', '太快了看不清', '下次我一定行'],
      miss: ['好险好险', '它自己飞出去了！'],
    },
  },
  {
    id: 'cat',
    name: '老猫',
    trait: '反应特别快，你常踢哪边他就多看哪边',
    intro: '慢慢踢，我看得见。',
    jersey: '#4f9bd9',
    jerseyDark: '#2f74b0',
    skin: '#e8b78f',
    hair: '#6b6b6b',
    temp: 0.9,
    wFreq: 0.75,
    wM1: 0,
    wM2: 0,
    reaction: 0.08,
    dive: 0.44,
    adjust: 0.5,
    reach: 0.37,
    tell: 0.3,
    fakeTell: 0.05,
    lines: {
      save: ['太慢了。', '这球我闭着眼都能扑', '喵～'],
      goal: ['下一个我一定扑到', '有点东西', '哼'],
      miss: ['省得我扑了', '准星呢？'],
    },
  },
  {
    id: 'grudge',
    name: '记仇哥',
    trait: '会记仇：你踢完一边，下一脚踢哪，他心里有数',
    intro: '你上次踢哪儿，我都记着呢。',
    jersey: '#d9534f',
    jerseyDark: '#a93a36',
    skin: '#f0c19b',
    hair: '#1f1a17',
    temp: 0.55,
    wFreq: 0.45,
    wM1: 0.45,
    wM2: 0,
    reaction: 0.08,
    dive: 0.43,
    adjust: 0.5,
    reach: 0.42,
    tell: 0.15,
    fakeTell: 0.15,
    lines: {
      save: ['我就知道你会踢{zone}！', '记住了吧？我可记住你了', '又是这招？'],
      goal: ['我记住了，你给我等着', '这笔账我记下了', '好，很好'],
      miss: ['心虚了吧？', '踢不进就别硬踢'],
    },
  },
  {
    id: 'mind',
    name: '读心大师',
    trait: '会看你连着两脚的套路，还会做假动作骗你',
    intro: '你的心思，我全看透了。',
    jersey: '#8e6bd1',
    jerseyDark: '#6a4aa8',
    skin: '#dca97f',
    hair: '#4a4f6b',
    temp: 0.35,
    wFreq: 0.3,
    wM1: 0.35,
    wM2: 0.3,
    reaction: 0.07,
    dive: 0.41,
    adjust: 0.55,
    reach: 0.43,
    tell: 0.1,
    fakeTell: 0.3,
    lines: {
      save: ['你想踢{zone}，我早就看到了', '套路，都是套路', '下一脚我也知道'],
      goal: ['有点意思……', '这一脚，我没算到', '你变了'],
      miss: ['你骗得了我，骗不了门框', '紧张了？'],
    },
  },
  {
    id: 'wall',
    name: '门神',
    trait: '传说中的门将：又快又会猜',
    intro: '这里，不让进。',
    jersey: '#2e2e33',
    jerseyDark: '#121216',
    skin: '#c98d63',
    hair: '#121216',
    temp: 0.3,
    wFreq: 0.35,
    wM1: 0.35,
    wM2: 0.25,
    reaction: 0.05,
    dive: 0.38,
    adjust: 0.7,
    reach: 0.46,
    tell: 0.05,
    fakeTell: 0.25,
    lines: {
      save: ['这里不让进。', '还有吗？', '{zone}？太明显了'],
      goal: ['……运气好而已', '你是第一个', '再来'],
      miss: ['门框也是我的人', '就这？'],
    },
  },
];

/** 进了几个球以后换哪个门将。 */
export const KEEPER_AT = [0, 5, 10, 16, 24] as const;

export function personaFor(goals: number): number {
  let k = 0;
  for (let i = 0; i < KEEPER_AT.length; i++) if (goals >= KEEPER_AT[i]!) k = i;
  return k;
}

// ---------- 小本本：猜你下一脚 ----------

/** 人一般更爱踢下角，不爱踢正中间（不看你之前，门将也这么认为）。 */
const PRIOR = [1.25, 0.55, 1.25, 0.95, 0.35, 0.95];
const DECAY = 0.88;

function normalize(v: number[]): number[] {
  const s = v.reduce((a, b) => a + b, 0);
  return s > 0 ? v.map((x) => x / s) : v.map(() => 1 / v.length);
}

/** 只看频率：你最近踢哪里多（越近的越算数）。 */
export function freqModel(history: readonly Zone[]): number[] {
  const c = PRIOR.map((p) => p * 0.6);
  let w = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    c[history[i]!]! += w;
    w *= DECAY;
  }
  return normalize(c);
}

/** 看顺序：之前每次「踢完 prev 之后」接着踢了哪里。order = 1 看上一脚，2 看上两脚。 */
export function sequenceModel(history: readonly Zone[], order: 1 | 2): number[] {
  const n = history.length;
  const c = PRIOR.map((p) => p * 0.3);
  if (n < order) return normalize(c);
  const key = history.slice(n - order);
  let w = 1;
  for (let i = n - 1; i >= order; i--) {
    let match = true;
    for (let k = 0; k < order; k++) if (history[i - order + k] !== key[k]) match = false;
    if (match) c[history[i]!]! += w;
    w *= 0.94;
  }
  return normalize(c);
}

/** 门将心里觉得你下一脚踢各个区域的可能性。 */
export function predict(p: Persona, history: readonly Zone[]): number[] {
  const f = freqModel(history);
  const m1 = sequenceModel(history, 1);
  const m2 = sequenceModel(history, 2);
  const rest = Math.max(0, 1 - p.wFreq - p.wM1 - p.wM2);
  return ZONES.map((z) => p.wFreq * f[z]! + p.wM1 * m1[z]! + p.wM2 * m2[z]! + rest / 6);
}

/** 门将这一脚猜哪里。temp 越小越相信自己的判断。 */
export function chooseGuess(p: Persona, history: readonly Zone[], rng: Rng): Zone {
  const probs = predict(p, history);
  const weights = probs.map((x) => Math.exp(Math.log(Math.max(1e-6, x)) / p.temp));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = (rng.nextU32() / 4294967296) * total;
  for (const z of ZONES) {
    r -= weights[z]!;
    if (r <= 0) return z;
  }
  return 5;
}

/** 射门前晃一下：-1 往左，1 往右，0 不晃。可能是真的，也可能是假动作。 */
export function chooseTell(p: Persona, guess: Zone, rng: Rng): -1 | 0 | 1 {
  const col = zoneCol(guess);
  if (col === 1) return 0;
  const side = col === 0 ? -1 : 1;
  const r = rng.nextU32() / 4294967296;
  if (r < p.tell) return side;
  if (r < p.tell + p.fakeTell) return side === -1 ? 1 : -1;
  return 0;
}

// ---------- 扑救 ----------

export type Outcome = 'goal' | 'save' | 'post-in' | 'post-out' | 'wide' | 'over';

export interface Dive {
  /** 起跳时站的位置（晃过以后会偏一点） */
  startX: number;
  /** 手最后到的位置 */
  handX: number;
  handY: number;
  /** 扑到一半时球就到了：0～1 */
  progressAtBall: number;
}

export interface Resolution {
  outcome: Outcome;
  dive: Dive;
  /** 门将的手离球最近有多远（米），用来做「差一点」的慢镜头 */
  closest: number;
}

/** 扑到位的进度（先快后慢）。 */
export function diveProgress(p: Persona, t: number): number {
  const u = Math.min(1, Math.max(0, (t - p.reaction) / p.dive));
  return 1 - (1 - u) * (1 - u);
}

/** 门将身体（从脚到手的一条线）在进度 q 时的两端。 */
export function bodyLine(d: Dive, q: number): { fx: number; fy: number; hx: number; hy: number } {
  const hx = d.startX + (d.handX - d.startX) * q;
  const hy = 1.45 + (d.handY - 1.45) * q;
  const fx = d.startX + (d.handX - d.startX) * 0.28 * q;
  const fy = 0.12 + Math.max(0, d.handY * 0.3) * q;
  return { fx, fy, hx, hy };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/**
 * 这一脚的结果。门将先按猜的方向扑；如果球和他扑的是同一边（或者他守中间），
 * 能往球的方向修正一点：球越慢，修正越多。扑错方向就只能看着。
 */
export function resolveShot(p: Persona, guess: Zone, lean: number, shot: Shot): Resolution {
  const startX = lean * 0.25;
  const target = zoneReach(guess);
  let handX = target.x;
  let handY = target.y;
  const col = zoneCol(guess);
  const sameSide = col === 1 || Math.sign(shot.tx) === Math.sign(target.x);
  // 球越慢，门将越来得及调整；弧线球一开始的方向会骗人，调整得少
  const curveTrick = Math.max(0.35, 1 - Math.abs(shot.bend) * 0.4);
  const adjust = (p.adjust * Math.min(1.6, shot.time / 0.6) + (col === 1 ? 0.35 : 0)) * curveTrick;
  if (sameSide) {
    const ddx = shot.tx - handX;
    const ddy = shot.ty - handY;
    const dist = Math.hypot(ddx, ddy);
    const k = dist > 0 ? Math.min(1, adjust / dist) : 0;
    handX += ddx * k;
    handY += ddy * k;
  }
  handY = Math.min(2.35, Math.max(0.25, handY));
  const progress = diveProgress(p, shot.time);
  const dive: Dive = { startX, handX, handY, progressAtBall: progress };
  const body = bodyLine(dive, progress);
  const closest = distToSegment(shot.tx, shot.ty, body.fx, body.fy, body.hx, body.hy);

  const inFrame = Math.abs(shot.tx) < HALF_W + BALL_R && shot.ty < GOAL_H + BALL_R;
  if (inFrame && closest <= p.reach + BALL_R) return { outcome: 'save', dive, closest };

  const nearPost = Math.abs(Math.abs(shot.tx) - HALF_W) < BALL_R + POST_R && shot.ty < GOAL_H + BALL_R;
  const nearBar = Math.abs(shot.ty - GOAL_H) < BALL_R + POST_R && Math.abs(shot.tx) < HALF_W + BALL_R;
  if (nearPost || nearBar) {
    const inside = Math.abs(shot.tx) < HALF_W && shot.ty < GOAL_H;
    return { outcome: inside ? 'post-in' : 'post-out', dive, closest };
  }
  if (shot.ty >= GOAL_H) return { outcome: 'over', dive, closest };
  if (Math.abs(shot.tx) >= HALF_W) return { outcome: 'wide', dive, closest };
  return { outcome: 'goal', dive, closest };
}

export function isGoal(o: Outcome): boolean {
  return o === 'goal' || o === 'post-in';
}

// ---------- 门将说的话 ----------

function pickLine(lines: readonly string[], rng: Rng, zone: Zone): string {
  return lines[rng.int(lines.length)]!.replace('{zone}', ZONE_NAMES[zone]);
}

/** 你最近的套路，被门将看出来了没有。 */
export function patternCallout(history: readonly Zone[]): string | null {
  const n = history.length;
  if (n >= 3 && history[n - 1] === history[n - 2] && history[n - 2] === history[n - 3]) {
    let k = 3;
    while (k < n && history[n - 1 - k] === history[n - 1]) k++;
    return `又是${ZONE_NAMES[history[n - 1]!]}？都第 ${k} 次了`;
  }
  if (n >= 4) {
    const sides = history.slice(n - 4).map((z) => zoneCol(z));
    if (sides.every((c) => c !== 1) && sides[0] !== sides[1] && sides[1] !== sides[2] && sides[2] !== sides[3]) {
      return '左、右、左、右……被我看穿了';
    }
  }
  return null;
}

/** 你最爱踢哪里（小本本里最多的），以及占几成。 */
export function favorite(history: readonly Zone[]): { zone: Zone; share: number } | null {
  if (history.length === 0) return null;
  const c = [0, 0, 0, 0, 0, 0];
  for (const z of history) c[z]!++;
  let best: Zone = 0;
  for (const z of ZONES) if (c[z]! > c[best]!) best = z;
  return { zone: best, share: c[best]! / history.length };
}

/** 射门后门将说什么。 */
export function reactionLine(p: Persona, outcome: Outcome, shot: Shot, history: readonly Zone[], rng: Rng): string {
  if (outcome === 'save') {
    const callout = p.wM1 > 0 ? patternCallout(history) : null;
    if (callout && rng.chance(1, 2)) return callout;
    return pickLine(p.lines.save, rng, shot.zone);
  }
  if (outcome === 'post-out') return '谢谢门柱！';
  if (outcome === 'wide' || outcome === 'over') return pickLine(p.lines.miss, rng, shot.zone);
  return pickLine(p.lines.goal, rng, shot.zone);
}

/** 射门前的挑衅（有一半是真话，一半是骗你的）。 */
export function tauntLine(p: Persona, guess: Zone, history: readonly Zone[], rng: Rng): string | null {
  if (p.wM1 === 0 && p.wFreq < 0.5) return null;
  if (history.length < 3 || !rng.chance(2, 5)) return null;
  const truthful = rng.chance(1, 2);
  const zone = truthful ? guess : (((guess + 1 + rng.int(5)) % 6) as Zone);
  const options = [`这次是不是想踢${ZONE_NAMES[zone]}？`, `我猜……${ZONE_NAMES[zone]}`, `${ZONE_NAMES[zone]}，对吧？`];
  return options[rng.int(options.length)]!;
}
