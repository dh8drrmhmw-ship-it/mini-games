/**
 * 奶茶调配的规则（只管「能不能倒、倒完是什么样」，不管画面）。
 *
 * - 瓶子：最多装 BOTTLE_CAP 份配料，从下往上叠。只能倒出最上面那一段相同的配料。
 * - 瓶子倒瓶子：目标瓶是空的，或者最上面是同一种配料，并且还有空位。能倒多少倒多少。
 * - 瓶子倒杯子：杯子是顾客点的单，要从下往上按顺序装。只有正好是下一层要的配料才能倒，
 *   最多倒到这一层（连续相同的几份）装满为止。杯子里的东西倒不出来。
 * - 杯子装满，这位顾客满意离开，排队的下一位顾客站到同一个位置。
 * - 所有顾客都满意，过关。
 */

export const BOTTLE_CAP = 4;

/** 配料编号（INGREDIENTS 的下标）。 */
export type Ing = number;

export interface Level {
  /** 第几关（从 1 开始）。 */
  number: number;
  /** 顾客点的单，按排队顺序。每一单是从下往上的配料。 */
  orders: Ing[][];
  /** 开局时每个瓶子里的配料（从下往上）。 */
  bottles: Ing[][];
  /** 同时站在柜台前的顾客数。 */
  slots: number;
}

export interface Slot {
  /** 这位顾客点的是 level.orders 里的第几单。 */
  order: number;
  /** 已经装好了几份。 */
  filled: number;
}

export interface State {
  bottles: Ing[][];
  /** 柜台前每个位置的顾客；null 表示这个位置没人了（后面也没人排队）。 */
  slots: (Slot | null)[];
  /** 排队的下一位是第几单。 */
  next: number;
}

export type Target = { kind: 'bottle'; index: number } | { kind: 'slot'; index: number };

export interface Move {
  from: number;
  to: Target;
}

export interface PourResult {
  state: State;
  ing: Ing;
  amount: number;
  /** 这一倒让哪个位置的顾客满意了（没有就是 -1）。 */
  served: number;
  /** 满意离开的是第几单。 */
  servedOrder: number;
}

export function initialState(level: Level): State {
  const slots: (Slot | null)[] = [];
  let next = 0;
  for (let i = 0; i < level.slots; i++) {
    if (next < level.orders.length) slots.push({ order: next++, filled: 0 });
    else slots.push(null);
  }
  return { bottles: level.bottles.map((b) => b.slice()), slots, next };
}

export function cloneState(s: State): State {
  return {
    bottles: s.bottles.map((b) => b.slice()),
    slots: s.slots.map((x) => (x ? { order: x.order, filled: x.filled } : null)),
    next: s.next,
  };
}

/** 瓶子最上面那一段相同配料：哪一种、几份。空瓶返回 null。 */
export function topRun(bottle: readonly Ing[]): { ing: Ing; count: number } | null {
  const n = bottle.length;
  if (n === 0) return null;
  const ing = bottle[n - 1]!;
  let count = 1;
  while (count < n && bottle[n - 1 - count] === ing) count++;
  return { ing, count };
}

/** 这一单下一层要什么、要几份（连续相同的算一层）。装满了返回 null。 */
export function nextNeed(recipe: readonly Ing[], filled: number): { ing: Ing; count: number } | null {
  if (filled >= recipe.length) return null;
  const ing = recipe[filled]!;
  let count = 1;
  while (filled + count < recipe.length && recipe[filled + count] === ing) count++;
  return { ing, count };
}

/** 这一步能倒几份（0 表示不能倒）。 */
export function pourAmount(level: Level, s: State, move: Move): number {
  const src = s.bottles[move.from];
  if (!src) return 0;
  const run = topRun(src);
  if (!run) return 0;
  if (move.to.kind === 'bottle') {
    if (move.to.index === move.from) return 0;
    const dst = s.bottles[move.to.index];
    if (!dst || dst.length >= BOTTLE_CAP) return 0;
    if (dst.length > 0 && dst[dst.length - 1] !== run.ing) return 0;
    return Math.min(run.count, BOTTLE_CAP - dst.length);
  }
  const slot = s.slots[move.to.index];
  if (!slot) return 0;
  const need = nextNeed(level.orders[slot.order]!, slot.filled);
  if (!need || need.ing !== run.ing) return 0;
  return Math.min(run.count, need.count);
}

/** 倒一次。不能倒时返回 null。不改动传进来的 state。 */
export function pour(level: Level, s: State, move: Move): PourResult | null {
  const amount = pourAmount(level, s, move);
  if (amount === 0) return null;
  const state = cloneState(s);
  const src = state.bottles[move.from]!;
  const ing = src[src.length - 1]!;
  src.length -= amount;
  let served = -1;
  let servedOrder = -1;
  if (move.to.kind === 'bottle') {
    const dst = state.bottles[move.to.index]!;
    for (let i = 0; i < amount; i++) dst.push(ing);
  } else {
    const slot = state.slots[move.to.index]!;
    slot.filled += amount;
    if (slot.filled >= level.orders[slot.order]!.length) {
      served = move.to.index;
      servedOrder = slot.order;
      state.slots[move.to.index] = state.next < level.orders.length ? { order: state.next++, filled: 0 } : null;
    }
  }
  return { state, ing, amount, served, servedOrder };
}

export function isWon(level: Level, s: State): boolean {
  return s.next >= level.orders.length && s.slots.every((x) => x === null);
}

/**
 * 当前所有能走的步。先列倒进杯子的（总是朝目标前进），再列瓶子之间的。
 * 去掉明显没用的步：把一整瓶同样的配料倒进空瓶（等于什么都没做）。
 */
export function legalMoves(level: Level, s: State): Move[] {
  const toSlots: Move[] = [];
  const toBottles: Move[] = [];
  for (let from = 0; from < s.bottles.length; from++) {
    const src = s.bottles[from]!;
    const run = topRun(src);
    if (!run) continue;
    for (let i = 0; i < s.slots.length; i++) {
      const move: Move = { from, to: { kind: 'slot', index: i } };
      if (pourAmount(level, s, move) > 0) toSlots.push(move);
    }
    const uniform = run.count === src.length;
    let triedEmpty = false;
    for (let i = 0; i < s.bottles.length; i++) {
      if (i === from) continue;
      const dst = s.bottles[i]!;
      if (dst.length === 0) {
        if (uniform || triedEmpty) continue; // 空瓶都一样，试一个就够
        triedEmpty = true;
      }
      const move: Move = { from, to: { kind: 'bottle', index: i } };
      if (pourAmount(level, s, move) > 0) toBottles.push(move);
    }
  }
  return toSlots.concat(toBottles);
}

/** 局面的「指纹」：瓶子和顾客位置的排列顺序不影响能不能过关，所以排序后再拼。 */
export function stateKey(s: State): string {
  const bottles = s.bottles.map((b) => String.fromCharCode(...b.map((x) => 97 + x)));
  bottles.sort();
  const slots = s.slots.map((x) => (x ? `${x.order}.${x.filled}` : '-'));
  slots.sort();
  return `${bottles.join('|')}#${slots.join(',')}#${s.next}`;
}
