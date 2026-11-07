/**
 * 点球大战的平衡测试：几种「玩家」对每个门将罚很多次，看进球率。
 * 运行：node scripts/penalty-balance.ts
 */
import { Rng } from '../src/games/shared/rng.ts';
import { chooseGuess, chooseTell, freqModel, isGoal, PERSONAS, personaFor, resolveShot, type Persona } from '../src/games/penalty/keeper.ts';
import { gauss, SHOT_TIME_FAST, SHOT_TIME_SLOW, zoneCol, zoneOf, zoneRow, ZONES, type Shot, type Zone } from '../src/games/penalty/world.ts';

export type Strategy = 'random' | 'human' | 'repeat' | 'anti';

function pickZone(strategy: Strategy, history: Zone[], rng: Rng): Zone {
  switch (strategy) {
    case 'random':
      return rng.int(6) as Zone;
    case 'repeat':
      return 0;
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

export function makeShot(zone: Zone, rng: Rng, skill = 1): Shot {
  const col = zoneCol(zone);
  const row = zoneRow(zone);
  const side = col === 0 ? -1 : col === 2 ? 1 : 0;
  const ax = side === 0 ? (rng.int(1000) / 1000 - 0.5) * 1.8 : side * (1.6 + (rng.int(1000) / 1000) * 1.7);
  const ay = row === 0 ? 0.15 + (rng.int(1000) / 1000) * 0.65 : 1.4 + (rng.int(1000) / 1000) * 0.9;
  const aimX = ax + gauss(rng) * 0.22 / skill;
  const aimY = Math.max(0.12, ay + gauss(rng) * 0.18 / skill);
  const power = 0.15 + (rng.int(1000) / 1000) * 0.75;
  const sd = 0.06 + 0.32 * power * power;
  return {
    aimX,
    aimY,
    zone: zoneOf(aimX, aimY),
    tx: aimX + gauss(rng) * sd,
    ty: Math.max(0.11, aimY + gauss(rng) * sd * 0.8),
    power,
    time: SHOT_TIME_SLOW - (SHOT_TIME_SLOW - SHOT_TIME_FAST) * power,
    bend: 0,
    weak: false,
  };
}

export function successRate(p: Persona, strategy: Strategy, shots: number, seed: number): { goal: number; save: number; miss: number } {
  const rng = new Rng(seed);
  const history: Zone[] = [];
  let goal = 0;
  let save = 0;
  let miss = 0;
  for (let i = 0; i < shots; i++) {
    const guess = chooseGuess(p, history, rng);
    const lean = chooseTell(p, guess, rng);
    const intended = pickZone(strategy, history, rng);
    // 看见门将晃了：一部分玩家会往反方向踢
    const zone = lean !== 0 && strategy !== 'repeat' && rng.chance(1, 2) ? ((lean < 0 ? 2 : 0) + 3 * zoneRow(intended)) as Zone : intended;
    const shot = makeShot(zone, rng);
    const r = resolveShot(p, guess, lean, shot);
    if (isGoal(r.outcome)) goal++;
    else if (r.outcome === 'save') save++;
    else miss++;
    history.push(shot.zone);
    if (history.length > 60) history.shift();
  }
  return { goal: goal / shots, save: save / shots, miss: miss / shots };
}

/** 一整局：3 次机会，按进球数换门将，返回进了几个。 */
export function simulateRun(strategy: Strategy, rng: Rng, history: Zone[]): number {
  let goals = 0;
  let lives = 3;
  while (lives > 0 && goals < 200) {
    const p = PERSONAS[personaFor(goals)]!;
    const guess = chooseGuess(p, history, rng);
    const lean = chooseTell(p, guess, rng);
    const intended = pickZone(strategy, history, rng);
    const zone = lean !== 0 && strategy !== 'repeat' && rng.chance(1, 2) ? ((lean < 0 ? 2 : 0) + 3 * zoneRow(intended)) as Zone : intended;
    const shot = makeShot(zone, rng);
    const r = resolveShot(p, guess, lean, shot);
    if (isGoal(r.outcome)) goals++;
    else lives--;
    history.push(shot.zone);
    if (history.length > 60) history.shift();
  }
  return goals;
}

export function runStats(strategy: Strategy, runs: number, seed: number): { mean: number; median: number; p90: number } {
  const rng = new Rng(seed);
  const history: Zone[] = [];
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) xs.push(simulateRun(strategy, rng, history));
  xs.sort((a, b) => a - b);
  return { mean: xs.reduce((a, b) => a + b, 0) / runs, median: xs[Math.floor(runs / 2)]!, p90: xs[Math.floor(runs * 0.9)]! };
}

if (import.meta.main) {
  const strategies: Strategy[] = ['random', 'human', 'repeat', 'anti'];
  console.log('门将'.padEnd(8), strategies.map((s) => s.padStart(18)).join(''));
  for (const p of PERSONAS) {
    const row = strategies.map((s) => {
      const r = successRate(p, s, 4000, 7);
      return `${(r.goal * 100).toFixed(0)}%进 ${(r.save * 100).toFixed(0)}%扑 ${(r.miss * 100).toFixed(0)}%偏`.padStart(18);
    });
    console.log(p.name.padEnd(8), row.join(''));
  }
  console.log('\n一整局（3 次机会）进球数：');
  for (const s of strategies) {
    const r = runStats(s, 1500, 11);
    console.log(s.padEnd(8), `平均 ${r.mean.toFixed(1)}  中位 ${r.median}  前一成 ${r.p90}`);
  }
}
