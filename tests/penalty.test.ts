import { describe, expect, it } from 'vitest';
import { runStats, successRate } from '../scripts/penalty-balance.ts';
import { rankFor } from '../src/games/penalty/game.ts';
import { chooseGuess, patternCallout, PERSONAS, personaFor, predict, resolveShot } from '../src/games/penalty/keeper.ts';
import { SHOOTERS } from '../src/games/penalty/players.ts';
import { ballAt, makeCamera, project, shotFromSwipe, zoneOf, type Kicker, type Shot, type Zone } from '../src/games/penalty/world.ts';
import { Rng } from '../src/games/shared/rng.ts';

const cam = makeCamera(390, 150, 640);
const ball = project(cam, 0, 0.11, 11);

const normal: Kicker = { power: 3, accuracy: 3, curve: 3 };
type Pt = { x: number; y: number; t: number };

/** 从球出发匀速划到球门平面上 (x, y) 那一点，用时 duration 秒。 */
function line(x: number, y: number, duration: number): Pt[] {
  const t = project(cam, x, y, 0);
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    pts.push({ x: ball.x + (t.x - ball.x) * k, y: ball.y + (t.y - ball.y) * k, t: duration * k });
  }
  return pts;
}

function swipeTo(x: number, y: number, duration = 0.25, kicker = normal, seed = 1) {
  return shotFromSwipe(cam, ball, { points: line(x, y, duration) }, new Rng(seed), kicker);
}

function shot(tx: number, ty: number, time = 0.6): Shot {
  return { aimX: tx, aimY: ty, zone: zoneOf(tx, ty), tx, ty, power: 0.5, time, bend: 0, weak: false };
}

describe('点球：手指划一下 → 射门', () => {
  it('划到球门里哪一点，就踢向哪一点（慢慢划，几乎不偏）', () => {
    const s = swipeTo(-2.5, 1.6, 0.5);
    if (typeof s === 'string') throw new Error(s);
    expect(s.aimX).toBeCloseTo(-2.5, 1);
    expect(s.aimY).toBeCloseTo(1.6, 1);
    expect(s.zone).toBe(3);
    expect(Math.abs(s.tx - s.aimX)).toBeLessThan(0.4);
  });

  it('划得快球就快，划得慢球就慢', () => {
    const fast = swipeTo(2, 1, 0.08);
    const slow = swipeTo(2, 1, 0.9);
    if (typeof fast === 'string' || typeof slow === 'string') throw new Error('不该失败');
    expect(fast.time).toBeLessThan(slow.time);
    expect(fast.power).toBeGreaterThan(slow.power);
  });

  it('没划到球门线的高度是贴地球；太短、往下划都不算射门', () => {
    const t = project(cam, 2, 0, 0);
    const low = shotFromSwipe(cam, ball, { points: [{ x: ball.x, y: ball.y, t: 0 }, { x: ball.x + (t.x - ball.x) * 0.7, y: ball.y + (t.y - ball.y) * 0.7, t: 0.3 }] }, new Rng(1), normal);
    if (typeof low === 'string') throw new Error(low);
    expect(low.aimY).toBeLessThan(0.5);
    expect(low.aimX).toBeGreaterThan(1.5);
    expect(shotFromSwipe(cam, ball, { points: [{ x: 100, y: 500, t: 0 }, { x: 102, y: 495, t: 0.2 }] }, new Rng(1), normal)).toBe('short');
    expect(shotFromSwipe(cam, ball, { points: [{ x: 100, y: 500, t: 0 }, { x: 100, y: 700, t: 0.2 }] }, new Rng(1), normal)).toBe('down');
  });

  it('先往左划再拐到右边：弧线球，一开始往左飞，最后落在右边', () => {
    // 先往左上划到一半高度，再拐回右上角
    const mid = project(cam, -2.5, 0.8, 0);
    const end = project(cam, 2.6, 1.2, 0);
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push({ x: ball.x + (mid.x - ball.x) * (i / 10), y: ball.y + (mid.y - ball.y) * (i / 10), t: i * 0.02 });
    for (let i = 1; i <= 10; i++) pts.push({ x: mid.x + (end.x - mid.x) * (i / 10), y: mid.y + (end.y - mid.y) * (i / 10), t: 0.2 + i * 0.02 });
    const banana = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), SHOOTERS[2]!);
    if (typeof banana === 'string') throw new Error(banana);
    expect(banana.aimX).toBeGreaterThan(2);
    expect(banana.bend).toBeLessThan(-0.5);
    // 飞到四分之一时还在左边
    expect(ballAt(banana, banana.time * 0.25).x).toBeLessThan(0);
    // 弧线能力差的球员，同样画法弯得少
    const stiff = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), SHOOTERS[1]!);
    if (typeof stiff === 'string') throw new Error(stiff);
    expect(Math.abs(stiff.bend)).toBeLessThan(Math.abs(banana.bend));
  });

  it('力量看松手那一下：最后甩得快就是大力，划到最后停住就是轻推', () => {
    const flick = swipeTo(2, 1, 0.08);
    const pts = line(2, 1, 0.2);
    pts.push({ ...pts[pts.length - 1]!, t: 0.6 }); // 停了 0.4 秒才松手
    const paused = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), normal);
    if (typeof flick === 'string' || typeof paused === 'string') throw new Error('不该失败');
    expect(flick.power).toBeGreaterThan(0.8);
    expect(paused.power).toBe(0);
  });

  it('力量大的球员球更快，精准高的球员偏得更少', () => {
    const fastCannon = swipeTo(2, 1, 0.06, SHOOTERS[1]!);
    const fastBanana = swipeTo(2, 1, 0.06, SHOOTERS[2]!);
    if (typeof fastCannon === 'string' || typeof fastBanana === 'string') throw new Error('不该失败');
    expect(fastCannon.time).toBeLessThan(fastBanana.time);
    const spread = (k: Kicker): number => {
      let sum = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const s = swipeTo(2, 1, 0.08, k, seed);
        if (typeof s === 'string') throw new Error(s);
        sum += Math.abs(s.tx - s.aimX);
      }
      return sum / 300;
    };
    expect(spread(SHOOTERS[3]!)).toBeLessThan(spread(SHOOTERS[1]!) * 0.7);
  });
});

describe('点球：门将扑救', () => {
  const rookie = PERSONAS[0]!;
  const wall = PERSONAS[4]!;

  it('猜对方向的下角球能扑出，猜错方向就进', () => {
    expect(resolveShot(rookie, 0, 0, shot(-2.8, 0.4)).outcome).toBe('save');
    expect(resolveShot(rookie, 2, 0, shot(-2.8, 0.4)).outcome).toBe('goal');
  });

  it('门将扑向一边时，往中间轻轻一推能进', () => {
    expect(resolveShot(wall, 2, 0, shot(0.2, 1.0)).outcome).toBe('goal');
    expect(resolveShot(wall, 1, 0, shot(0.2, 1.0)).outcome).toBe('save');
  });

  it('又快又准的死角，新手门将猜对了也扑不到', () => {
    expect(resolveShot(rookie, 5, 0, shot(3.3, 2.15, 0.42)).outcome).toBe('goal');
  });

  it('高出、偏出、打中门柱', () => {
    expect(resolveShot(rookie, 0, 0, shot(1, 2.9)).outcome).toBe('over');
    expect(resolveShot(rookie, 0, 0, shot(4.3, 1)).outcome).toBe('wide');
    expect(resolveShot(rookie, 0, 0, shot(3.6, 1.2)).outcome).toBe('post-in');
    expect(resolveShot(rookie, 0, 0, shot(3.72, 1.2)).outcome).toBe('post-out');
  });
});

describe('点球：门将记仇', () => {
  it('老踢同一个地方，会看频率的门将就猜那里', () => {
    const history: Zone[] = [0, 0, 0, 0, 0, 0, 0, 0];
    const p = predict(PERSONAS[1]!, history);
    expect(p.indexOf(Math.max(...p))).toBe(0);
  });

  it('左右轮流踢，会看顺序的门将能猜到下一脚', () => {
    const history: Zone[] = [0, 2, 0, 2, 0, 2, 0, 2, 0, 2];
    const p = predict(PERSONAS[2]!, history); // 上一脚是右下，下一脚应该是左下
    expect(p.indexOf(Math.max(...p))).toBe(0);
  });

  it('同一个种子，门将猜的一样', () => {
    const h: Zone[] = [0, 3, 2, 2, 5];
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(chooseGuess(PERSONAS[3]!, h, a)).toBe(chooseGuess(PERSONAS[3]!, h, b));
  });

  it('看出套路会说出来', () => {
    expect(patternCallout([1, 3, 3, 3])).toContain('第 3 次');
    expect(patternCallout([0, 2, 0, 2])).toContain('看穿');
    expect(patternCallout([0, 1, 2])).toBeNull();
  });

  it('按进球数换门将，按进球数给称号', () => {
    expect(personaFor(0)).toBe(0);
    expect(personaFor(5)).toBe(1);
    expect(personaFor(30)).toBe(4);
    expect(rankFor(0)).toBe('替补');
    expect(rankFor(10)).toBe('点球手');
  });
});

describe('点球：平衡（模拟玩家）', () => {
  it('门将一个比一个难，乱踢的玩家也打得进', () => {
    const rates = PERSONAS.map((p) => successRate(p, 'random', 3000, 7).goal);
    expect(rates[0]).toBeGreaterThan(0.78);
    expect(rates[4]).toBeGreaterThan(0.55);
    expect(rates[4]).toBeLessThan(0.75);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]! + 0.02);
  });

  it('老踢同一个地方，从第三个门将起几乎都被扑出', () => {
    for (const p of PERSONAS.slice(2)) expect(successRate(p, 'repeat', 1500, 9).goal).toBeLessThan(0.15);
  });

  it('一整局平均能进 6～16 个', () => {
    const r = runStats('human', 600, 11);
    expect(r.mean).toBeGreaterThan(6);
    expect(r.mean).toBeLessThan(16);
  });
});
