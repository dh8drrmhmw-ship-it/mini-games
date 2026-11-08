/**
 * 点球大战的平衡测试：几种「玩家」对每个门将罚很多次，看进球率。
 * 运行：node scripts/penalty-balance.ts
 */
import { Rng } from '../src/games/shared/rng.ts';
import { chooseGuess, chooseTell, freqModel, GOALS_TO_CLEAR, isGoal, LIVES, PERSONAS, resolveShot, type Persona } from '../src/games/penalty/keeper.ts';
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

/** 闯一关：进够 GOALS_TO_CLEAR 个就过，失误 LIVES 次就输。 */
export function simulateStage(p: Persona, strategy: Strategy, rng: Rng, history: Zone[]): boolean {
  let goals = 0;
  let lives = LIVES;
  while (lives > 0 && goals < GOALS_TO_CLEAR) {
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
  const strategies: Strategy[] = ['random', 'human', 'repeat', 'anti'];
  console.log('门将'.padEnd(8), strategies.map((s) => s.padStart(18)).join(''));
  for (const p of PERSONAS) {
    const row = strategies.map((s) => {
      const r = successRate(p, s, 4000, 7);
      return `${(r.goal * 100).toFixed(0)}%进 ${(r.save * 100).toFixed(0)}%扑 ${(r.miss * 100).toFixed(0)}%偏`.padStart(18);
    });
    console.log(p.name.padEnd(8), row.join(''));
  }
  console.log('\n每关一次过的概率：');
  for (const p of PERSONAS) {
    const row = strategies.map((st) => `${(passRate(p, st, 1500, 11) * 100).toFixed(0)}%`.padStart(8)).join('');
    console.log(p.name.padEnd(8), row);
  }
}
