import { describe, expect, it } from 'vitest';
import { freeKickShot, passRate, successRate } from '../scripts/penalty-balance.ts';
import { checkWall, FREE_KICKS, makeWall, WALL_DIST, wallPeople, type FreeKickSpot } from '../src/games/penalty/freekick.ts';
import { rankFor } from '../src/games/penalty/game.ts';
import { chooseGuess, isGoal, LIVES, patternCallout, PERSONAS, predict, resolveFreeKick, resolveShot, starsFor } from '../src/games/penalty/keeper.ts';
import { BOOTS, kickerFor, SHOOTERS, unlocksAt } from '../src/games/penalty/players.ts';
import {
  aimCamera,
  ballAt,
  buildFreeKick,
  buildShot,
  GOAL_H,
  HALF_W,
  makeCamera,
  project,
  readFreeKickSwipe,
  shotFromSwipe,
  unprojectGoalPlane,
  zoneOf,
  type FreeKickIntent,
  type Kicker,
  type Shot,
  type Zone,
} from '../src/games/penalty/world.ts';
import { Rng } from '../src/games/shared/rng.ts';

const cam = makeCamera(390, 150, 640);
const ball = project(cam, 0, 0.11, 11);

const normal: Kicker = { power: 3, accuracy: 3, curve: 3, curveSide: 0 };
const trainer = BOOTS[0]!;
const as = (i: number, foot: 'L' | 'R' = SHOOTERS[i]!.foot === 'L' ? 'L' : 'R'): Kicker => kickerFor(SHOOTERS[i]!, trainer, foot, false);
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
  return { aimX: tx, aimY: ty, zone: zoneOf(tx, ty), tx, ty, power: 0.5, time, bend: 0, weak: false, ox: 0, oz: 11, arc: 0.2 };
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
    const banana = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), as(2));
    if (typeof banana === 'string') throw new Error(banana);
    expect(banana.aimX).toBeGreaterThan(2);
    expect(banana.bend).toBeLessThan(-0.5);
    // 飞到四分之一时比直线偏左（点球离得近，弧线不夸张）
    expect(ballAt(banana, banana.time * 0.25).x).toBeLessThan(banana.tx * 0.25 - 0.3);
    // 弧线能力差、又是反方向（右脚踢往左鼓的弧线）的球员，同样画法弯得少
    const stiff = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), as(1));
    if (typeof stiff === 'string') throw new Error(stiff);
    expect(Math.abs(stiff.bend)).toBeLessThan(Math.abs(banana.bend));
  });

  it('力量看这一划最快的时候：画弧线时最后慢下来也不影响；整个都慢慢划就是轻推', () => {
    const flick = swipeTo(2, 1, 0.08);
    const pts = line(2, 1, 0.08);
    pts.push({ ...pts[pts.length - 1]!, t: 0.5 }); // 甩完停了一下才松手
    const paused = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), normal);
    const slow = swipeTo(2, 1, 1.2);
    if (typeof flick === 'string' || typeof paused === 'string' || typeof slow === 'string') throw new Error('不该失败');
    expect(flick.power).toBeGreaterThan(0.8);
    expect(paused.power).toBeGreaterThan(0.8);
    expect(slow.power).toBe(0);
  });

  it('惯用脚：右脚顺的弧线是往右鼓，反方向弯不大；用逆足力量和准头打折', () => {
    const right = as(0, 'R');
    const left = as(0, 'L');
    expect(left.power).toBeLessThan(right.power);
    expect(left.accuracy).toBeLessThan(right.accuracy);
    expect(right.curveSide).toBe(1);
    // 双枪换脚不打折
    expect(as(3, 'L')).toEqual(as(3, 'R'));
    // 同一个往右鼓的弧线：右脚弯得大，左脚弯得小
    const mid = project(cam, 2.5, 0.8, 0);
    const end = project(cam, -2.6, 1.2, 0);
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push({ x: ball.x + (mid.x - ball.x) * (i / 10), y: ball.y + (mid.y - ball.y) * (i / 10), t: i * 0.02 });
    for (let i = 1; i <= 10; i++) pts.push({ x: mid.x + (end.x - mid.x) * (i / 10), y: mid.y + (end.y - mid.y) * (i / 10), t: 0.2 + i * 0.02 });
    const withRight = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), { ...right, accuracy: 3 });
    const withLeft = shotFromSwipe(cam, ball, { points: pts }, new Rng(1), { ...right, curveSide: -1 });
    if (typeof withRight === 'string' || typeof withLeft === 'string') throw new Error('不该失败');
    expect(withRight.bend).toBeGreaterThan(0.3);
    expect(withLeft.bend).toBeLessThan(withRight.bend * 0.5);
  });

  it('球鞋加在球员的能力上', () => {
    const golden = BOOTS.find((b) => b.id === 'golden')!;
    const k = kickerFor(SHOOTERS[0]!, golden, 'R', false);
    expect(k.power).toBe(SHOOTERS[0]!.power + 1);
    expect(k.accuracy).toBe(SHOOTERS[0]!.accuracy + 1);
  });

  it('勺子王往中间轻轻一挑是勺子：门将先倒就进，站着不动就被抱住', () => {
    const chipper = { ...as(4), chip: true };
    const s = swipeTo(0.2, 1.6, 1.2, chipper);
    if (typeof s === 'string') throw new Error(s);
    expect(s.chip).toBe(true);
    expect(resolveShot(PERSONAS[9]!, 0, 0, s).outcome).toBe('goal');
    expect(resolveShot(PERSONAS[9]!, 4, 0, s).outcome).toBe('save');
    // 别的球员这样踢只是普通的慢球
    const plain = swipeTo(0.2, 1.6, 1.2, as(0));
    if (typeof plain === 'string') throw new Error(plain);
    expect(plain.chip).toBeFalsy();
  });

  it('力量大的球员球更快，精准高的球员偏得更少', () => {
    const fastCannon = swipeTo(2, 1, 0.06, as(1));
    const fastBanana = swipeTo(2, 1, 0.06, as(2));
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
    expect(spread(as(6))).toBeLessThan(spread(as(1)) * 0.7);
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
    // 幸运星：打中门柱总能弹进
    expect(resolveShot(rookie, 0, 0, shot(3.72, 1.2), { lucky: true }).outcome).toBe('post-in');
  });

  it('站着等球的门将：中路、不够偏的球扑得到，又快又贴边的死角扑不到', () => {
    const iron = PERSONAS.find((p) => p.id === 'iron')!;
    expect(resolveShot(iron, 0, 0, shot(1.6, 1.0, 0.5), { waiting: true }).outcome).toBe('save');
    expect(resolveShot(iron, 0, 0, shot(3.3, 2.1, 0.45), { waiting: true }).outcome).toBe('goal');
    // 弧线球一开始的方向骗了他
    const curl = { ...shot(1.6, 1.0, 0.55), bend: -1.2 }; // 一开始往中间飞，最后拐到右边
    expect(resolveShot(iron, 0, 0, curl, { waiting: true }).outcome).toBe('goal');
  });

  it('风会把球吹偏，越慢的球吹得越多', () => {
    const fast = swipeTo(0, 1, 0.06, normal);
    const fastWind = shotFromSwipe(cam, ball, { points: line(0, 1, 0.06) }, new Rng(1), normal, 4);
    const slowWind = shotFromSwipe(cam, ball, { points: line(0, 1, 1.2) }, new Rng(1), normal, 4);
    const slow = swipeTo(0, 1, 1.2, normal);
    if (typeof fast === 'string' || typeof fastWind === 'string' || typeof slowWind === 'string' || typeof slow === 'string') throw new Error('不该失败');
    expect(fastWind.tx - fast.tx).toBeGreaterThan(0.5);
    expect(slowWind.tx - slow.tx).toBeGreaterThan(fastWind.tx - fast.tx);
    // 飞到一半时还没怎么偏，后半段才偏过去
    expect(ballAt(slowWind, slowWind.time * 0.3).x).toBeLessThan(slowWind.tx * 0.3 + 0.1);
  });

  it('门将有高有矮：高个子够得到上角，矮个子够不着', () => {
    const pole = PERSONAS.find((p) => p.id === 'pole')!;
    const spring = PERSONAS.find((p) => p.id === 'spring')!;
    const high = shot(2.9, 2.25, 0.7);
    expect(resolveShot(pole, 5, 0, high).closest).toBeLessThan(resolveShot(spring, 5, 0, high).closest);
  });
});

describe('点球：门将记仇', () => {
  it('老踢同一个地方，会看频率的门将就猜那里', () => {
    const history: Zone[] = [0, 0, 0, 0, 0, 0, 0, 0];
    const p = predict(PERSONAS.find((x) => x.id === 'cat')!, history);
    expect(p.indexOf(Math.max(...p))).toBe(0);
  });

  it('左右轮流踢，会看顺序的门将能猜到下一脚', () => {
    const history: Zone[] = [0, 2, 0, 2, 0, 2, 0, 2, 0, 2];
    const p = predict(PERSONAS.find((x) => x.id === 'grudge')!, history); // 上一脚是右下，下一脚应该是左下
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

  it('闯关：十个门将；剩的机会越多星越多；每过一关解锁东西', () => {
    expect(PERSONAS.length).toBe(10);
    expect(new Set(PERSONAS.map((p) => p.height)).size).toBeGreaterThan(5);
    expect(LIVES).toBe(4);
    expect(starsFor(4)).toBe(3);
    expect(starsFor(3)).toBe(2);
    expect(starsFor(1)).toBe(1);
    expect(unlocksAt(1).join()).toContain('火箭');
    expect(unlocksAt(2).join()).toContain('双枪');
    expect(rankFor(0)).toBe('替补');
    expect(rankFor(10)).toBe('球王');
  });
});

describe('点球：平衡（模拟玩家）', () => {
  it('门将大体上一个比一个难，乱踢的玩家前几关也打得进', () => {
    const rates = PERSONAS.map((p) => successRate(p, 'random', 3000, 7).goal);
    expect(rates[0]).toBeGreaterThan(0.75);
    expect(rates[9]).toBeGreaterThan(0.2);
    expect(rates[9]).toBeLessThan(0.5);
    expect(rates[9]).toBeLessThan(rates[0]! - 0.3);
  });

  it('高手：第一关几乎都能过，最后一关很难（一成以下）', () => {
    expect(passRate(PERSONAS[0]!, 'skilled', 800, 11)).toBeGreaterThan(0.78);
    const last = passRate(PERSONAS[9]!, 'skilled', 800, 11);
    expect(last).toBeGreaterThan(0.03);
    expect(last).toBeLessThan(0.2);
  });

  it('任意球比点球难进：高手两到五成，普通玩家更低', () => {
    for (const p of PERSONAS.slice(2)) {
      const rate = (st: 'skilled' | 'human'): number => {
        const rng = new Rng(5);
        let g = 0;
        for (let i = 0; i < 600; i++) if (isGoal(freeKickShot(p, FREE_KICKS.c20!, st, rng).outcome)) g++;
        return g / 600;
      };
      const pro = rate('skilled');
      expect(pro).toBeGreaterThan(0.18);
      expect(pro).toBeLessThan(0.6);
      expect(rate('human')).toBeLessThan(pro);
    }
  });

  it('老踢同一个地方，从第三关起基本过不去', () => {
    for (const p of PERSONAS.slice(2)) expect(passRate(p, 'repeat', 300, 9)).toBeLessThan(0.15);
  });
});

describe('任意球（像实况）：左手转方向，右手划的快慢定高低、弯定弧线', () => {
  const spot = FREE_KICKS.c20!;
  const wall = makeWall(spot);
  const near = -1; // c20 的人墙挡左边
  const exact: Kicker = { power: 3, accuracy: 5, curve: 3, curveSide: 0 };
  /** 不加偏差踢一脚，方便看规则本身。 */
  const fk = (it: Partial<FreeKickIntent>, kicker = exact, at: FreeKickSpot = spot): Shot =>
    buildFreeKick({ aimX: near * (HALF_W - 0.6), power: 0.5, curve: 0, ...it }, kicker, null, 0, at);

  it('人墙站在 9.15 米外，挡住近角那一边；门将站另一边', () => {
    expect(Math.hypot(wall.x - spot.x, wall.z - spot.z)).toBeCloseTo(WALL_DIST, 5);
    // 从球到球门中间连一条线：人墙在靠近角的那一边
    const lineX = (sp: { x: number; z: number }, z: number): number => (sp.x * z) / sp.z;
    expect(wall.x).toBeLessThan(lineX(spot, wall.z));
    expect(wall.keeperX).toBeGreaterThan(0);
    expect(wallPeople(wall)).toHaveLength(spot.wall);
    const r24 = FREE_KICKS.r24!;
    const right = makeWall(r24);
    expect(right.x).toBeGreaterThan(lineX(r24, right.z));
    expect(right.keeperX).toBeLessThan(0);
  });

  it('往近角踢：力量小打在人墙上，力量合适越过人墙从横梁下面进，力量太大飞过横梁', () => {
    const soft = fk({ power: 0.25 });
    expect(checkWall(soft, wall).blocked).toBe(true);
    expect(resolveFreeKick(PERSONAS[2]!, soft, wall, checkWall(soft, wall)).outcome).toBe('wall');
    const good = fk({ power: 0.6 });
    expect(checkWall(good, wall).blocked).toBe(false);
    expect(checkWall(good, wall).over).toBe(true);
    expect(good.ty).toBeLessThan(GOAL_H - 0.2);
    expect(fk({ power: 0.9 }).ty).toBeGreaterThan(GOAL_H + 0.3);
  });

  it('力量越大球越快；越远要的力量越大', () => {
    expect(fk({ power: 0.8 }).time).toBeLessThan(fk({ power: 0.4 }).time);
    const far = FREE_KICKS.l30!;
    const farWall = makeWall(far);
    const ok = (sp: FreeKickSpot, w: typeof wall, power: number): boolean => {
      const s = fk({ aimX: (far.x > 1 ? 1 : -1) * (HALF_W - 0.6), power }, exact, sp);
      return !checkWall(s, w).blocked && s.ty < GOAL_H - 0.15 && s.ty > 0.4;
    };
    // 30 米用 20 米刚好的力量，球会落在球门前、滚过去；要大一些才行
    expect(ok(far, farWall, 0.78)).toBe(true);
    expect(ok(far, farWall, 0.6)).toBe(false);
    expect(fk({ power: 0.78 }).ty).toBeGreaterThan(GOAL_H);
  });

  it('球从人墙上面飞过，门将被挡住视线，反应更慢', () => {
    const p = PERSONAS[5]!;
    const over = fk({ power: 0.6 });
    const open = fk({ power: 0.6, aimX: -near * (HALF_W - 0.6) });
    expect(checkWall(open, wall).over).toBe(false);
    expect(resolveFreeKick(p, over, wall, checkWall(over, wall)).late).toBeGreaterThan(resolveFreeKick(p, open, wall, checkWall(open, wall)).late + 0.15);
  });

  it('球一开始沿着黄箭头（瞄准方向）飞，弧线让它慢慢拐开；弧线能力越高拐得越多', () => {
    const s = fk({ aimX: 4, curve: 1 });
    const early = ballAt(s, s.time * 0.02);
    const dir = (early.x - s.ox) / (s.oz - early.z);
    expect(dir).toBeCloseTo((4 - s.ox) / s.oz, 2);
    expect(s.bend).toBeGreaterThan(0);
    expect(s.tx).toBeLessThan(4 - 2);
    const curler = fk({ aimX: 4, curve: 1 }, { ...exact, curve: 5 });
    expect(curler.bend).toBeGreaterThan(s.bend * 1.4);
  });

  it('同样想拐的弯，任意球比点球拐得多（点球离得近，弧线不夸张）', () => {
    const free = fk({ aimX: 4, curve: 1 });
    const pen = buildShot({ aimX: 2, aimY: 1, weak: false, power: 0.6, bend: 9 }, exact, new Rng(1));
    expect(free.bend).toBeGreaterThan(pen.bend * 1.8);
    expect(pen.bend).toBeLessThan(0.8);
  });

  it('门将：慢球、往中间的球都扑得到；快的死角弧线球才进得去', () => {
    const p = PERSONAS[9]!;
    const res = (s: Shot): string => resolveFreeKick(p, s, wall, checkWall(s, wall)).outcome;
    // 往中间的、带弧线的球（以前门将会被弧线骗到一边去）
    expect(res(fk({ aimX: 1.5, power: 0.6, curve: 0.6 }))).toBe('save');
    // 慢慢滚过去的球
    expect(res(fk({ aimX: 3, power: 0.3, curve: 0 }))).not.toBe('goal');
    // 又快又贴近角、越过人墙的球
    expect(res(fk({ aimX: near * (HALF_W - 0.35), power: 0.64, curve: 0 }))).toBe('goal');
  });

  it('右手这一划：越快力量越大；划直了没有弧线，往右鼓是往右的弧线；往下划不算', () => {
    const swipe = (dur: number, bulge: number): Pt[] => {
      const pts: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const k = i / 12;
        pts.push({ x: 250 + bulge * 4 * k * (1 - k), y: 640 - 300 * k, t: dur * k });
      }
      return pts;
    };
    const fast = readFreeKickSwipe(swipe(0.12, 0), 350);
    const slow = readFreeKickSwipe(swipe(0.6, 0), 350);
    if (typeof fast === 'string' || typeof slow === 'string') throw new Error('不该失败');
    expect(fast.power).toBeGreaterThan(slow.power + 0.3);
    expect(fast.curve).toBe(0);
    const curved = readFreeKickSwipe(swipe(0.3, 50), 350);
    if (typeof curved === 'string') throw new Error(curved);
    expect(curved.curve).toBeGreaterThan(0.5);
    const left = readFreeKickSwipe(swipe(0.3, -50), 350);
    if (typeof left === 'string') throw new Error(left);
    expect(left.curve).toBeLessThan(-0.5);
    expect(readFreeKickSwipe([{ x: 250, y: 400, t: 0 }, { x: 250, y: 600, t: 0.2 }], 350)).toBe('down');
  });

  it('左手转镜头：球还在屏幕同一个地方，瞄准点在屏幕正中；斜着的镜头也能换算回球门上的位置', () => {
    for (const id of Object.keys(FREE_KICKS)) {
      const sp = FREE_KICKS[id]!;
      const base = makeCamera(390, 160, 640, sp);
      const c = aimCamera(base, sp, 3.5);
      expect(project(c, sp.x, 0.11, sp.z).x).toBeCloseTo(195, 3);
      expect(project(c, sp.x, 0.11, sp.z).y).toBeCloseTo(project(base, sp.x, 0.11, sp.z).y, 3);
      expect(project(c, 3.5, 0, 0).x).toBeCloseTo(195, 3);
      const p = project(c, 2.1, 1.4, 0);
      const back = unprojectGoalPlane(c, p.x, p.y);
      expect(back.x).toBeCloseTo(2.1, 4);
      expect(back.y).toBeCloseTo(1.4, 4);
    }
  });
});
