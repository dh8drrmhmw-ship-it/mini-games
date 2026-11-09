import { describe, expect, it } from 'vitest';
import { freeKickShot, passRate, successRate } from '../scripts/penalty-balance.ts';
import { checkWall, FREE_KICKS, makeWall, WALL_DIST, wallPeople } from '../src/games/penalty/freekick.ts';
import { rankFor } from '../src/games/penalty/game.ts';
import { chooseGuess, isGoal, LIVES, patternCallout, PERSONAS, predict, resolveFreeKick, resolveShot, starsFor } from '../src/games/penalty/keeper.ts';
import { BOOTS, kickerFor, SHOOTERS, unlocksAt } from '../src/games/penalty/players.ts';
import { ballAt, buildShot, GOAL_H, makeCamera, project, shotFromSwipe, unprojectGoalPlane, zoneOf, type Intent, type Kicker, type Shot, type Spot, type Zone } from '../src/games/penalty/world.ts';
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
  return { aimX: tx, aimY: ty, zone: zoneOf(tx, ty), tx, ty, power: 0.5, time, bend: 0, weak: false, ox: 0, oz: 11, arc: 0.2, dip: 0 };
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

  it('高手：第一关几乎都能过，最后一关大约一成', () => {
    expect(passRate(PERSONAS[0]!, 'skilled', 800, 11)).toBeGreaterThan(0.78);
    const last = passRate(PERSONAS[9]!, 'skilled', 800, 11);
    expect(last).toBeGreaterThan(0.06);
    expect(last).toBeLessThan(0.3);
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

describe('任意球：人墙、弧线、下坠', () => {
  const spot = FREE_KICKS.c20!;
  const wall = makeWall(spot);
  const exact: Kicker = { power: 3, accuracy: 5, curve: 4, curveSide: 0 };
  /** 按想法踢一脚，再把脚下的偏差去掉，方便看规则本身。 */
  const kick = (it: Partial<Intent>, at: Spot = spot): Shot => {
    const s = buildShot({ aimX: 0, aimY: 1, weak: false, power: 0.6, bend: 0, dip: 0, ...it }, exact, new Rng(1), 0, at);
    return { ...s, tx: s.aimX, ty: s.aimY };
  };

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

  it('又低又平地踢近角：打在人墙上，算一次失误', () => {
    const s = kick({ aimX: -2.6, aimY: 0.8, power: 0.85 });
    const check = checkWall(s, wall);
    expect(check.blocked).toBe(true);
    expect(resolveFreeKick(PERSONAS[2]!, s, wall, check).outcome).toBe('wall');
  });

  it('往近角吊、最后往下勾（下坠）：从人墙上面过去，再掉进球门', () => {
    const s = kick({ aimX: -2.6, aimY: 1.9, power: 0.55, dip: 0.9 });
    const check = checkWall(s, wall);
    expect(check.blocked).toBe(false);
    expect(check.over).toBe(true);
    expect(ballAt(s, s.time).y).toBeLessThan(GOAL_H);
    // 下坠越狠，飞过人墙时越高
    const flat = kick({ aimX: -2.6, aimY: 1.9, power: 0.55, dip: 0 });
    const hAt = (x: Shot): number => ballAt(x, checkWall(x, wall).u * x.time).y;
    expect(hAt(s)).toBeGreaterThan(hAt(flat) + 0.8);
  });

  it('球从人墙上面飞过，门将被挡住视线，反应更慢', () => {
    const p = PERSONAS[5]!;
    const over = kick({ aimX: -2.6, aimY: 1.9, power: 0.55, dip: 0.9 });
    const open = kick({ aimX: 2.6, aimY: 1.9, power: 0.55, dip: 0.9 });
    expect(resolveFreeKick(p, over, wall, checkWall(over, wall)).late).toBeGreaterThan(resolveFreeKick(p, open, wall, checkWall(open, wall)).late + 0.15);
  });

  it('同样想拐的弯，任意球比点球拐得多（点球离得近，弧线不夸张）', () => {
    const fk = kick({ aimX: 2, bend: 3 });
    const pen = kick({ aimX: 2, bend: 3 }, { x: 0, z: 11 });
    expect(Math.abs(fk.bend)).toBeGreaterThan(Math.abs(pen.bend) * 2.5);
    expect(Math.abs(pen.bend)).toBeLessThan(0.8);
  });

  it('镜头斜对着球门时，屏幕上的点也能换算回球门上的位置', () => {
    for (const id of Object.keys(FREE_KICKS)) {
      const c = makeCamera(390, 160, 640, FREE_KICKS[id]!);
      const sp = project(c, 2.1, 1.4, 0);
      const back = unprojectGoalPlane(c, sp.x, sp.y);
      expect(back.x).toBeCloseTo(2.1, 4);
      expect(back.y).toBeCloseTo(1.4, 4);
      // 球在屏幕正中下方
      expect(project(c, FREE_KICKS[id]!.x, 0.11, FREE_KICKS[id]!.z).x).toBeCloseTo(195, 3);
    }
  });

  it('任意球划过头再往下勾一下：下坠球；点球没有下坠', () => {
    const c = makeCamera(390, 160, 640, spot);
    const b = project(c, spot.x, 0.11, spot.z);
    const target = project(c, -2.4, 1.6, 0);
    const toGoal = b.y - project(c, 0, 0, 0).y;
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push({ x: b.x + (target.x - b.x) * (i / 10), y: b.y + (target.y - 0.3 * toGoal - b.y) * (i / 10), t: i * 0.02 });
    pts.push({ x: target.x, y: target.y, t: 0.3 });
    const s = shotFromSwipe(c, b, { points: pts }, new Rng(1), exact, 0, spot);
    if (typeof s === 'string') throw new Error(s);
    expect(s.dip).toBeGreaterThan(0.8);
    expect(s.aimX).toBeCloseTo(-2.4, 0);
    const pen = shotFromSwipe(cam, ball, { points: line(-2.4, 1.6, 0.25) }, new Rng(1), exact);
    if (typeof pen === 'string') throw new Error(pen);
    expect(pen.dip).toBe(0);
  });
});
