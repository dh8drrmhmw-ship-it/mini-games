import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/games/milk-tea/game.ts';
import { generateLevel } from '../src/games/milk-tea/levels.ts';
import { BOTTLE_CAP, initialState, isWon, legalMoves, pour, type Level } from '../src/games/milk-tea/rules.ts';
import { solve } from '../src/games/milk-tea/solver.ts';
import { Rng } from '../src/games/shared/rng.ts';

const toy: Level = {
  number: 0,
  // 顾客 1：下面红茶、上面两份牛奶；顾客 2：珍珠、红茶
  orders: [
    [2, 1, 1],
    [0, 2],
  ],
  bottles: [[1, 1, 2], [2, 0], []],
  slots: 1,
};

describe('奶茶调配的规则', () => {
  it('只有正好是下一层要的配料才能倒进杯子', () => {
    const s = initialState(toy);
    // 第 1 个瓶子最上面是红茶，顾客要的第一层就是红茶
    expect(pour(toy, s, { from: 0, to: { kind: 'slot', index: 0 } })?.amount).toBe(1);
    // 第 2 个瓶子最上面是珍珠，顾客现在不要
    expect(pour(toy, s, { from: 1, to: { kind: 'slot', index: 0 } })).toBeNull();
  });

  it('瓶子之间：只能倒进空瓶或者倒在同样的配料上，能倒多少倒多少', () => {
    const s = initialState(toy);
    expect(pour(toy, s, { from: 0, to: { kind: 'bottle', index: 1 } })).toBeNull(); // 红茶倒不到珍珠上
    const r = pour(toy, s, { from: 1, to: { kind: 'bottle', index: 2 } })!;
    expect(r.state.bottles[2]).toEqual([0]);
    expect(r.state.bottles[1]).toEqual([2]);
    expect(s.bottles[1]).toEqual([2, 0]); // 原来的局面不变
  });

  it('杯子装满后下一位顾客站到同一个位置，全部做完就过关', () => {
    let s = initialState(toy);
    const steps = [
      { from: 0, to: { kind: 'slot' as const, index: 0 } }, // 红茶
      { from: 0, to: { kind: 'slot' as const, index: 0 } }, // 两份牛奶一次倒进去
    ];
    for (const m of steps) s = pour(toy, s, m)!.state;
    expect(s.slots[0]).toEqual({ order: 1, filled: 0 });
    s = pour(toy, s, { from: 1, to: { kind: 'slot', index: 0 } })!.state; // 珍珠
    s = pour(toy, s, { from: 1, to: { kind: 'slot', index: 0 } })!.state; // 红茶
    expect(isWon(toy, s)).toBe(true);
    expect(legalMoves(toy, s)).toEqual([]);
  });

  it('电脑能解出这关，也能认出走不通的局面', () => {
    expect(solve(toy, initialState(toy)).status).toBe('solved');
    const stuck: Level = { number: 0, orders: [[0, 1]], bottles: [[0, 1, 2]], slots: 1 };
    expect(solve(stuck, initialState(stuck)).status).toBe('dead');
  });
});

describe('奶茶调配的关卡', () => {
  it('一共 100 关，编号连续', () => {
    expect(LEVELS.length).toBe(100);
    LEVELS.forEach((l, i) => expect(l.number).toBe(i + 1));
  });

  it('每关的配料正好够做所有顾客的奶茶，开局每个瓶子不超过容量', () => {
    for (const l of LEVELS) {
      const need = l.orders.flat().sort((a, b) => a - b);
      const have = l.bottles.flat().sort((a, b) => a - b);
      expect(have, `第 ${l.number} 关`).toEqual(need);
      for (const b of l.bottles) expect(b.length).toBeLessThanOrEqual(BOTTLE_CAP);
      expect(l.bottles.some((b) => b.length === 0), `第 ${l.number} 关要有空瓶`).toBe(true);
    }
  });

  it('每关都有解', () => {
    for (const l of LEVELS) expect(solve(l, initialState(l), 200_000).status, `第 ${l.number} 关`).toBe('solved');
  });

  it('存好的关卡和生成规则一致（改了生成规则要重新运行 npm run levels）', () => {
    for (let n = 1; n <= 8; n++) {
      const { level } = generateLevel(n);
      expect(LEVELS[n - 1], `第 ${n} 关`).toEqual(level);
    }
  });
});

describe('固定种子随机数', () => {
  it('同一个种子永远是同一串数', () => {
    const a = new Rng(20261106);
    const b = new Rng(20261106);
    const xs = [a.nextU32(), a.nextU32(), a.nextU32()];
    expect([b.nextU32(), b.nextU32(), b.nextU32()]).toEqual(xs);
    expect(xs).toMatchInlineSnapshot(`
      [
        616024662,
        3782685301,
        135191756,
      ]
    `);
  });
});
