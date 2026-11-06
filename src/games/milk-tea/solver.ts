/**
 * 电脑自己解关：生成关卡时保证每关有解；玩的时候判断「这局还走得通吗」。
 *
 * 做法：深度优先搜索，记住走过的局面不重复走。限定最多看多少个局面，超过就放弃（结果是「不知道」）。
 */
import { Rng } from '../shared/rng.ts';
import { isWon, legalMoves, pour, stateKey, type Level, type Move, type State } from './rules.ts';

export interface SolveResult {
  /** 'solved' 找到解法；'dead' 搜完了，确定走不通；'unknown' 看的局面太多，放弃了。 */
  status: 'solved' | 'dead' | 'unknown';
  /** 找到的解法（不一定最短）。 */
  moves: Move[];
  /** 一共看了多少个局面。 */
  nodes: number;
}

export function solve(level: Level, start: State, maxNodes = 50_000): SolveResult {
  const seen = new Set<string>();
  const path: Move[] = [];
  let nodes = 0;
  let gaveUp = false;

  const dfs = (s: State): boolean => {
    if (isWon(level, s)) return true;
    const key = stateKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    if (++nodes > maxNodes) {
      gaveUp = true;
      return false;
    }
    for (const move of legalMoves(level, s)) {
      const r = pour(level, s, move);
      if (!r) continue;
      path.push(move);
      if (dfs(r.state)) return true;
      path.pop();
      if (gaveUp) return false;
    }
    return false;
  };

  if (dfs(start)) return { status: 'solved', moves: path.slice(), nodes };
  return { status: gaveUp ? 'unknown' : 'dead', moves: [], nodes };
}

/**
 * 用「随手乱倒」的玩家试玩几次，看有多少次会把自己困死。困死的比例越高，这关越需要动脑子。
 * 乱倒的玩家：能倒进杯子就大概率倒进杯子，否则随便挑一步；不走回头路；没路可走就算困死。
 */
export function trapRate(level: Level, start: State, rng: Rng, tries = 24, maxSteps = 120): number {
  let stuck = 0;
  for (let t = 0; t < tries; t++) {
    let s = start;
    const seen = new Set<string>([stateKey(s)]);
    let won = false;
    for (let step = 0; step < maxSteps; step++) {
      if (isWon(level, s)) {
        won = true;
        break;
      }
      const options: { move: Move; state: State; toSlot: boolean }[] = [];
      for (const move of legalMoves(level, s)) {
        const r = pour(level, s, move);
        if (!r) continue;
        const key = stateKey(r.state);
        if (seen.has(key)) continue;
        options.push({ move, state: r.state, toSlot: move.to.kind === 'slot' });
      }
      if (options.length === 0) break;
      const slotOptions = options.filter((o) => o.toSlot);
      const pool = slotOptions.length > 0 && rng.chance(4, 5) ? slotOptions : options;
      const choice = rng.pick(pool);
      s = choice.state;
      seen.add(stateKey(s));
    }
    if (!won) stuck++;
  }
  return stuck / tries;
}

/**
 * 过这关最少要在瓶子之间倒几次（倒进杯子不算）。瓶子之间倒得越多，越需要动脑子。
 * 做法：0-1 宽度优先搜索。局面太多就放弃，返回 null。
 */
export function minShuffles(level: Level, start: State, maxNodes = 60_000): number | null {
  const best = new Map<string, number>();
  // 双端队列：代价 0 的放前面，代价 1 的放后面
  let front: { s: State; d: number }[] = [{ s: start, d: 0 }];
  let back: { s: State; d: number }[] = [];
  best.set(stateKey(start), 0);
  let nodes = 0;
  while (front.length > 0 || back.length > 0) {
    if (front.length === 0) {
      front = back.reverse();
      back = [];
    }
    const { s, d } = front.pop()!;
    if (best.get(stateKey(s))! < d) continue;
    if (isWon(level, s)) return d;
    if (++nodes > maxNodes) return null;
    for (const move of legalMoves(level, s)) {
      const r = pour(level, s, move);
      if (!r) continue;
      const nd = d + (move.to.kind === 'bottle' ? 1 : 0);
      const key = stateKey(r.state);
      const old = best.get(key);
      if (old !== undefined && old <= nd) continue;
      best.set(key, nd);
      if (nd === d) front.push({ s: r.state, d: nd });
      else back.push({ s: r.state, d: nd });
    }
  }
  return null;
}
