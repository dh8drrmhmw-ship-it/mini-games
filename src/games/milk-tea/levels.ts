/**
 * 关卡生成：第 N 关由固定种子生成，所以每个人玩到的第 N 关都一样。
 * 每关都先让电脑解一遍（保证有解），再用「随手乱倒」的玩家试玩，挑难度合适的。
 */
import { mix32, Rng } from '../shared/rng.ts';
import { INGREDIENTS } from './ingredients.ts';
import { BOTTLE_CAP, initialState, type Ing, type Level } from './rules.ts';
import { minShuffles, solve, trapRate } from './solver.ts';

export interface LevelParams {
  /** 这一关用几种配料。 */
  kinds: number;
  /** 一共几位顾客。 */
  orders: number;
  /** 同时站在柜台前几位。 */
  slots: number;
  /** 开局有几个空瓶。 */
  empties: number;
  /** 每杯几份（最少、最多）。 */
  cupMin: number;
  cupMax: number;
  /** 0～1：越大，先要用的配料越容易被压在瓶底，越要动脑子把上面的挪开。 */
  bury: number;
  /** 希望「最少要在瓶子之间倒几次」落在这个范围里。 */
  shuffles: readonly [number, number];
}

const p = (
  kinds: number, orders: number, slots: number, cupMin: number, cupMax: number,
  bury: number, shuffles: readonly [number, number],
): LevelParams => ({ kinds, orders, slots, empties: 1, cupMin, cupMax, bury, shuffles });

export function paramsFor(n: number): LevelParams {
  // 前几关是教学：第 1 关只要倒进杯子，第 2 关开始要在瓶子之间倒
  if (n <= 1) return p(2, 1, 1, 4, 4, 0, [0, 0]);
  if (n === 2) return p(2, 2, 1, 4, 4, 0.6, [1, 2]);
  if (n === 3) return p(3, 2, 1, 4, 4, 0.7, [2, 3]);
  // 柜台前只站一位顾客时最难（只能按顺序做）；两位时可以挑着做，轻松一些。
  // 每 5 关有一关两位顾客，让人喘口气。
  const breather = n % 5 === 0;
  if (n <= 6) return p(3, 3, 1, 4, 4, 0.7, [2, 4]);
  if (n <= 12) return breather ? p(4, 4, 2, 3, 5, 0.8, [2, 3]) : p(4, 4, 1, 3, 5, 0.8, [3, 5]);
  if (n <= 25) return breather ? p(4, 5, 2, 3, 5, 0.85, [2, 4]) : p(5, 5, 1, 3, 5, 0.85, [4, 7]);
  if (n <= 45) return breather ? p(5, 5, 2, 3, 5, 0.9, [3, 5]) : p(5, 6, 1, 3, 5, 0.9, [5, 8]);
  return breather ? p(5, 6, 2, 3, 5, 0.9, [3, 6]) : p(6, 6, 1, 3, 5, 0.95, [6, 10]);
}

/** 一杯奶茶：至少两种配料；有时连着两份同样的（比如两份珍珠），更像真的奶茶。 */
function makeRecipe(rng: Rng, kinds: readonly Ing[], length: number): Ing[] {
  for (;;) {
    const recipe: Ing[] = [];
    for (let i = 0; i < length; i++) {
      const prev = recipe[i - 1];
      recipe.push(prev !== undefined && rng.chance(1, 4) ? prev : rng.pick(kinds));
    }
    if (new Set(recipe).size >= 2) return recipe;
  }
}

export function buildCandidate(n: number, prm: LevelParams, rng: Rng): Level {
  const all = INGREDIENTS.map((_, i) => i);
  const kinds = rng.shuffle(all).slice(0, prm.kinds);
  const lengths: number[] = [];
  for (let i = 0; i < prm.orders; i++) lengths.push(prm.cupMin + rng.int(prm.cupMax - prm.cupMin + 1));
  // 配料总数凑成瓶子容量的整数倍：开局每个瓶子都是满的。先试着加，加不了就减。
  let total = lengths.reduce((a, b) => a + b, 0);
  const up = (BOTTLE_CAP - (total % BOTTLE_CAP)) % BOTTLE_CAP;
  const room = lengths.reduce((a, len) => a + (prm.cupMax - len), 0);
  for (let need = up <= room ? up : total % BOTTLE_CAP, i = 0; need > 0; i = (i + 1) % lengths.length) {
    const len = lengths[i]!;
    if (up <= room ? len < prm.cupMax : len > prm.cupMin) {
      lengths[i] = up <= room ? len + 1 : len - 1;
      total += up <= room ? 1 : -1;
      need--;
    }
  }
  const orders = lengths.map((len) => makeRecipe(rng, kinds, len));

  // 发配料：越早要用的越往瓶底放（加一点随机），这样要先把上面的挪开才拿得到。
  const noise = 1 + Math.round((1 - prm.bury) * 60);
  const units: { ing: Ing; key: number; id: number }[] = [];
  orders.forEach((recipe, o) =>
    recipe.forEach((ing, layer) => units.push({ ing, key: o * 6 + layer + rng.int(noise), id: units.length })),
  );
  units.sort((a, b) => a.key - b.key || a.id - b.id);
  const count = total / BOTTLE_CAP;
  const bottles: Ing[][] = Array.from({ length: count }, () => []);
  units.forEach((u, k) => bottles[k % count]!.push(u.ing));
  rng.shuffle(bottles);
  for (let i = 0; i < prm.empties; i++) bottles.push([]);
  return { number: n, orders, bottles, slots: prm.slots };
}

export interface GeneratedLevel {
  level: Level;
  /** 最少要在瓶子之间倒几次。 */
  shuffles: number;
  /** 「随手乱倒」会困死的比例。 */
  trap: number;
  /** 试了几个种子才挑到。 */
  attempts: number;
}

const MAX_ATTEMPTS = 120;
/** 每个候选最多让电脑看多少个局面。太复杂的关卡玩家也会觉得乱，直接丢掉。 */
const SEARCH_BUDGET = 12_000;

/** 生成第 n 关。同一个 n 在任何设备上结果都一样。比较慢（零点几秒到几秒），所以提前生成好存起来。 */
export function generateLevel(n: number): GeneratedLevel {
  const prm = paramsFor(n);
  let best: GeneratedLevel | null = null;
  let bestGap = Infinity;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new Rng(mix32(Math.imul(n, 0x2f6b3) ^ mix32(attempt + 0x5eed)));
    const level = buildCandidate(n, prm, rng);
    const start = initialState(level);
    if (solve(level, start, SEARCH_BUDGET).status !== 'solved') continue; // 无解或太复杂
    const shuffles = minShuffles(level, start, SEARCH_BUDGET);
    if (shuffles === null) continue;
    const [lo, hi] = prm.shuffles;
    const gap = shuffles < lo ? lo - shuffles : shuffles > hi ? shuffles - hi : 0;
    if (gap >= bestGap) continue;
    best = { level, shuffles, trap: trapRate(level, start, rng), attempts: attempt + 1 };
    bestGap = gap;
    if (gap === 0) break;
  }
  if (!best) throw new Error(`第 ${n} 关：试了 ${MAX_ATTEMPTS} 个种子都没有生成出有解的关卡`);
  return best;
}
