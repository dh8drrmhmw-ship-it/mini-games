/**
 * 点球大战的平衡测试：几种「玩家」对每个门将罚很多次，看进球率和过关率。
 * 运行：node scripts/penalty-balance.ts
 *
 * 玩家：
 * - random：随便踢，力量随便；
 * - human：有习惯（爱踢下角、左右换着踢）；
 * - repeat：老踢同一个地方；
 * - anti：专挑自己踢得最少的地方；
 * - skilled：高手，专踢死角、大力、会看门将晃、会顶着风瞄。
 */
import { Rng } from '../src/games/shared/rng.ts';
import { checkWall, FREE_KICKS, makeWall, type FreeKickSpot } from '../src/games/penalty/freekick.ts';
import { chooseGuess, chooseTell, chooseWait, freqModel, GOALS_TO_CLEAR, isGoal, LIVES, PERSONAS, resolveFreeKick, resolveShot, type Persona } from '../src/games/penalty/keeper.ts';
import { buildShot, gauss, HALF_W, SHOT_TIME_SLOW, shotSpread, SPOT_Z, zoneCol, zoneOf, zoneRow, ZONES, type Shot, type Zone } from '../src/games/penalty/world.ts';

export type Strategy = 'random' | 'human' | 'repeat' | 'anti' | 'skilled';

function pickZone(strategy: Strategy, history: Zone[], rng: Rng): Zone {
  switch (strategy) {
    case 'random':
      return rng.int(6) as Zone;
    case 'repeat':
      return 0;
    case 'skilled': {
      if (rng.chance(1, 8)) return (1 + 3 * rng.int(2)) as Zone;
      const corners: Zone[] = [0, 2, 3, 5];
      const f = freqModel(history);
      // 尽量不重复自己：从踢得少的两个死角里挑
      const sorted = corners.slice().sort((a, b) => f[a]! - f[b]! || a - b);
      return sorted[rng.int(2)]!;
    }
    case 'anti': {
      const f = freqModel(history);
      let best: Zone = 0;
      for (const z of ZONES) if (f[z]! < f[best]!) best = z;
      return rng.chance(1, 4) ? (rng.int(6) as Zone) : best;
    }
    case 'human': {
      const last = history[history.length - 1];
      if (last !== undefined && zoneCol(last) !== 1 && rng.chance(3, 5)) {
        const other = zoneCol(last) === 0 ? 2 : 0;
        return (other + 3 * (rng.chance(1, 3) ? 1 : 0)) as Zone;
      }
      const w = [25, 8, 22, 15, 5, 15];
      let r = rng.int(90);
      for (const z of ZONES) {
        r -= w[z]!;
        if (r < 0) return z;
      }
      return 0;
    }
  }
}

const u = (rng: Rng): number => rng.int(10000) / 10000;

/** 模拟一脚射门（规则和 world.ts 的 shotFromSwipe 一样：死角更难踢准，风会吹偏）。 */
export function makeShot(zone: Zone, rng: Rng, skilled = false, wind = 0): Shot {
  const col = zoneCol(zone);
  const row = zoneRow(zone);
  const side = col === 0 ? -1 : col === 2 ? 1 : 0;
  let ax: number;
  let ay: number;
  let power: number;
  let noise: number;
  if (skilled) {
    ax = side === 0 ? (u(rng) - 0.5) * 1.2 : side * (2.6 + u(rng) * 0.75);
    ay = row === 0 ? 0.15 + u(rng) * 0.3 : 1.85 + u(rng) * 0.45;
    power = 0.55 + u(rng) * 0.45;
    noise = 0.12;
  } else {
    ax = side === 0 ? (u(rng) - 0.5) * 1.8 : side * (1.6 + u(rng) * 1.7);
    ay = row === 0 ? 0.15 + u(rng) * 0.65 : 1.4 + u(rng) * 0.9;
    power = 0.15 + u(rng) * 0.75;
    noise = 0.22;
  }
  const time = SHOT_TIME_SLOW - (SHOT_TIME_SLOW - 0.45) * power;
  const drift = wind * time * 0.42;
  // 高手顶着风瞄（大约抵掉七成），普通玩家抵掉三成
  ax -= drift * (skilled ? 0.7 : 0.3);
  const aimX = ax + gauss(rng) * noise;
  const aimY = Math.max(0.12, ay + gauss(rng) * noise * 0.8);
  const sd = shotSpread(aimX, aimY, power, 3.25);
  return {
    aimX,
    aimY,
    zone: zoneOf(aimX, aimY),
    tx: aimX + gauss(rng) * sd + drift,
    ty: Math.max(0.11, aimY + gauss(rng) * sd * 0.8),
    power,
    time,
    bend: 0,
    weak: false,
    drift,
    ox: 0,
    oz: SPOT_Z,
    arc: 0.12 + (1 - power) * 0.35,
    dip: 0,
  };
}

/**
 * 一脚任意球。高手：一半从人墙上面吊近角（下坠），一半画弧线绕人墙打远角，大力；
 * 普通玩家：瞄得没那么贴边，弧线和下坠用得少。
 */
export function freeKickShot(p: Persona, spot: FreeKickSpot, strategy: Strategy, rng: Rng): ReturnType<typeof resolveShot> {
  const wall = makeWall(spot);
  const near = spot.x > 1 ? 1 : -1;
  const skilled = strategy === 'skilled';
  const overWall = rng.chance(1, 2);
  const edge = skilled ? 0.35 + u(rng) * 0.5 : 0.6 + u(rng) * 1.2;
  const side = overWall ? near : -near;
  const aimX = side * (HALF_W - edge) + gauss(rng) * (skilled ? 0.12 : 0.25);
  const aimY = (overWall ? 1.7 : 1.2) + u(rng) * (skilled ? 0.6 : 0.8);
  const power = overWall ? 0.35 + u(rng) * 0.35 : 0.55 + u(rng) * 0.4;
  // 打门将那一边：弧线往外鼓（先往门柱外面飞，再拐进来），门将判断不准
  const bend = overWall ? 0 : side * (skilled ? 1.0 + u(rng) * 0.7 : 0.3 + u(rng) * 0.6);
  const dip = overWall ? (skilled ? 0.6 + u(rng) * 0.4 : u(rng) * 0.6) : u(rng) * 0.3;
  const wind = p.wind * (u(rng) * 2 - 1);
  const kicker = { power: 3, accuracy: skilled ? 3.5 : 3, curve: skilled ? 4 : 3, curveSide: 0 as const };
  const shot = buildShot({ aimX: aimX - (skilled ? 0.7 : 0.3) * wind * 0.4, aimY, weak: false, power, bend, dip }, kicker, rng, wind, spot);
  return resolveFreeKick(p, shot, wall, checkWall(shot, wall), { read: skilled ? 0.09 : 0.15 });
}

function oneShot(p: Persona, strategy: Strategy, history: Zone[], rng: Rng, spotId = 'pen'): ReturnType<typeof resolveShot> {
  if (spotId !== 'pen') return freeKickShot(p, FREE_KICKS[spotId]!, strategy, rng);
  const waiting = chooseWait(p, rng);
  const guess = chooseGuess(p, history, rng);
  const lean = waiting ? 0 : chooseTell(p, guess, rng);
  const intended = pickZone(strategy, history, rng);
  // 看见门将晃了：一部分玩家会往反方向踢
  const exploit = strategy === 'skilled' ? rng.chance(4, 5) : rng.chance(1, 2);
  const zone = lean !== 0 && strategy !== 'repeat' && exploit ? (((lean < 0 ? 2 : 0) + 3 * zoneRow(intended)) as Zone) : intended;
  const wind = p.wind * (u(rng) * 2 - 1);
  const shot = makeShot(zone, rng, strategy === 'skilled', wind);
  history.push(shot.zone);
  if (history.length > 60) history.shift();
  // 门将从你划手指的动作就开始看方向：高手划得快（约 0.15 秒），普通玩家慢一些
  const read = strategy === 'skilled' ? 0.09 : 0.15;
  return resolveShot(p, guess, lean, shot, { waiting, read });
}

export function successRate(p: Persona, strategy: Strategy, shots: number, seed: number): { goal: number; save: number; miss: number } {
  const rng = new Rng(seed);
  const history: Zone[] = [];
  let goal = 0;
  let save = 0;
  let miss = 0;
  for (let i = 0; i < shots; i++) {
    const r = oneShot(p, strategy, history, rng);
    if (isGoal(r.outcome)) goal++;
    else if (r.outcome === 'save') save++;
    else miss++;
  }
  return { goal: goal / shots, save: save / shots, miss: miss / shots };
}

/** 闯一关：进够 GOALS_TO_CLEAR 个就过，失误 LIVES 次就输。 */
export function simulateStage(p: Persona, strategy: Strategy, rng: Rng, history: Zone[]): boolean {
  let goals = 0;
  let lives = LIVES;
  let n = 0;
  while (lives > 0 && goals < GOALS_TO_CLEAR) {
    const spot = p.shots[n++ % p.shots.length]!;
    if (isGoal(oneShot(p, strategy, history, rng, spot).outcome)) goals++;
    else lives--;
  }
  return goals >= GOALS_TO_CLEAR;
}

/** 每一关第一次就过的概率。 */
export function passRate(p: Persona, strategy: Strategy, tries: number, seed: number): number {
  const rng = new Rng(seed);
  const history: Zone[] = [];
  let pass = 0;
  for (let i = 0; i < tries; i++) if (simulateStage(p, strategy, rng, history)) pass++;
  return pass / tries;
}

if (import.meta.main) {
  const strategies: Strategy[] = ['random', 'human', 'repeat', 'anti', 'skilled'];
  console.log('门将'.padEnd(8), strategies.map((s) => s.padStart(18)).join(''));
  for (const p of PERSONAS) {
    const row = strategies.map((s) => {
      const r = successRate(p, s, 4000, 7);
      return `${(r.goal * 100).toFixed(0)}%进 ${(r.save * 100).toFixed(0)}%扑 ${(r.miss * 100).toFixed(0)}%偏`.padStart(18);
    });
    console.log(p.name.padEnd(8), row.join(''));
  }
  console.log('\n任意球进球率（高手 / 普通），每个门将：');
  for (const p of PERSONAS) {
    const row = Object.keys(FREE_KICKS).map((id) => {
      const rate = (st: Strategy): number => {
        const rng = new Rng(3);
        let g = 0;
        for (let i = 0; i < 1500; i++) if (isGoal(freeKickShot(p, FREE_KICKS[id]!, st, rng).outcome)) g++;
        return g / 1500;
      };
      return `${id} ${(rate('skilled') * 100).toFixed(0)}/${(rate('human') * 100).toFixed(0)}`.padStart(12);
    });
    console.log(p.name.padEnd(8), row.join(''));
  }
  console.log('\n每关一次过的概率：', strategies.join(' / '));
  for (const p of PERSONAS) {
    const row = strategies.map((st) => `${(passRate(p, st, 1500, 11) * 100).toFixed(0)}%`.padStart(8)).join('');
    console.log(p.name.padEnd(8), row);
  }
}
