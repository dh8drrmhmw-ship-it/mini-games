/**
 * 点球闯关：十关，一关一个门将。每关进 5 个球就过关，有 4 次机会（被扑出、踢偏、打在人墙上都少一次）。
 * 从第 2 关起夹着任意球：有人墙，要画弧线绕过去，或者最后往下勾一下吊过去。
 * 闯到哪一关，下次就从哪一关接着打；过了的关可以回去刷星星。
 * 规则和门将的脑子在 keeper.ts，球员和球鞋在 players.ts，球门和射门换算在 world.ts，画图在 draw.ts。
 */
import { inRect, roundRectPath, wrapText, type Rect } from '../shared/canvas.ts';
import type { Canvas2D, Game, Host, View } from '../shared/host.ts';
import { mix32, Rng } from '../shared/rng.ts';
import * as D from './draw.ts';
import { checkWall, FREE_KICKS, makeWall, wallPeople, type FreeKickSpot, type Wall, type WallCheck } from './freekick.ts';
import {
  bodyLine,
  chooseGuess,
  chooseTell,
  chooseWait,
  diveProgress,
  favorite,
  freeKickTaunt,
  GOALS_TO_CLEAR,
  isGoal,
  LIVES,
  PERSONAS,
  reactionLine,
  resolveFreeKick,
  resolveShot,
  starsFor,
  tauntLine,
  type Outcome,
  type Persona,
  type Resolution,
} from './keeper.ts';
import {
  BOOTS,
  isUnlocked,
  isWeakFoot,
  kickerFor,
  preferredFoot,
  SHOOTERS,
  unlocksAt,
  type Boots,
  type Foot,
  type Shooter,
} from './players.ts';
import {
  ballAt,
  ballSpeedKmh,
  BALL_R,
  GOAL_H,
  makeCamera,
  PENALTY_SPOT,
  project,
  shotFromSwipe,
  ZONE_NAMES,
  ZONES,
  zoneCol,
  type Camera,
  type Shot,
  type Spot,
  type Zone,
} from './world.ts';

const KEY = {
  history: 'penalty.history',
  runs: 'penalty.runs',
  tutorial: 'penalty.tutorial',
  total: 'penalty.total',
  shooter: 'penalty.shooter',
  boots: 'penalty.boots',
  cleared: 'penalty.cleared',
  stars: 'penalty.stars',
  freeKicks: 'penalty.fk',
};
/** 人墙那队的球衣 */
const WALL_KIT: D.WallLook = { jersey: '#eef1f7', jerseyDark: '#c23a3a', shorts: '#26345e' };
const HISTORY_MAX = 80;
const RESULT_TIME = 1.6;
const KICK_TIME = 0.16;
export const STAGES = PERSONAS.length;

/** 称号：按过了几关。 */
export const RANKS = [
  { at: 0, name: '替补' },
  { at: 2, name: '主力' },
  { at: 4, name: '点球手' },
  { at: 6, name: '球星' },
  { at: 8, name: '传奇' },
  { at: 10, name: '球王' },
] as const;

export function rankFor(cleared: number): string {
  let name: string = RANKS[0].name;
  for (const r of RANKS) if (cleared >= r.at) name = r.name;
  return name;
}

type Phase = 'stages' | 'players' | 'boots' | 'intro' | 'aim' | 'kick' | 'flight' | 'result' | 'clear' | 'over';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  spin: number;
}

interface Btn extends D.PillButton {
  onTap: () => void;
}

interface Hit extends Rect {
  onTap: () => void;
}

class Penalty implements Game {
  private readonly host: Host;
  private view: View = { width: 390, height: 844, safeTop: 0, safeBottom: 0 };
  private cam: Camera = makeCamera(390, 120, 520);
  private time = 0;
  private rng: Rng;

  // 存档
  private runs = 0;
  private history: Zone[] = [];
  private tutorialSeen = false;
  private totalGoals = 0;
  /** 过了几关（0～10） */
  private cleared = 0;
  private stars: number[] = [];
  private shooterIdx = 0;
  private bootsIdx = 0;
  /** 一共踢过几个任意球（前几个会画出路线教你） */
  private freeKicks = 0;

  // 这一关
  private phase: Phase = 'stages';
  private phaseT = 0;
  private stage = 0;
  private trialShooter: number | null = null;
  private trialBoots: number | null = null;
  private foot: Foot = 'R';
  private goals = 0;
  private lives = LIVES;
  private streak = 0;
  private revived = false;
  private fooled = 0;
  private read = 0;
  private shotsThisStage = 0;
  private clearInfo: { stars: number; best: boolean; unlocks: string[] } | null = null;

  // 这一脚
  /** 任意球的位置和人墙；点球时是 null */
  private fk: FreeKickSpot | null = null;
  private wall: Wall | null = null;
  private wallCheck: WallCheck | null = null;
  private guess: Zone = 0;
  private lean: -1 | 0 | 1 = 0;
  /** 门将这一脚不猜、站着等球 */
  private waiting = false;
  /** 这一脚的风（米/秒，正数往右吹） */
  private wind = 0;
  private pending: Shot | null = null;
  private shot: Shot | null = null;
  private res: Resolution | null = null;
  private flightT = 0;
  private afterT = 0;
  private timeScale = 1;

  // 手指
  /** 这一脚门将从你划手指的动作里提前看出了多少秒 */
  private readTime = 0;
  private dragging = false;
  private dragPoints: { x: number; y: number; t: number }[] = [];

  // 表现
  private banner: { text: string; sub: string; color: string; t: number } | null = null;
  private bubble: { text: string; t: number; face: D.Face } | null = null;
  private toast: { text: string; t: number } | null = null;
  private speedText: { text: string; t: number } | null = null;
  private shake = 0;
  private excite = 0;
  private postHit = 0;
  private ripple: D.Ripple | null = null;
  private particles: Particle[] = [];
  private trail: { x: number; y: number }[] = [];
  private keeperHead = { x: 0, y: 0 };
  private buttons: Btn[] = [];
  private hits: Hit[] = [];
  private soundBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private footBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(host: Host) {
    this.host = host;
    const num = (k: string): number => Number(host.save.get(k) ?? '0') || 0;
    this.runs = num(KEY.runs);
    this.totalGoals = num(KEY.total);
    this.cleared = Math.min(STAGES, num(KEY.cleared));
    this.history = (host.save.get(KEY.history) ?? '')
      .split('')
      .map(Number)
      .filter((z) => Number.isInteger(z) && z >= 0 && z <= 5) as Zone[];
    this.tutorialSeen = host.save.get(KEY.tutorial) === '1';
    this.freeKicks = num(KEY.freeKicks);
    try {
      const st = JSON.parse(host.save.get(KEY.stars) ?? '[]') as unknown;
      this.stars = Array.isArray(st) ? st.map((x) => Number(x) || 0) : [];
    } catch {
      this.stars = [];
    }
    const sh = SHOOTERS.findIndex((x) => x.id === host.save.get(KEY.shooter));
    this.shooterIdx = sh >= 0 && isUnlocked(SHOOTERS[sh]!, this.cleared) ? sh : 0;
    const bo = BOOTS.findIndex((x) => x.id === host.save.get(KEY.boots));
    this.bootsIdx = bo >= 0 && isUnlocked(BOOTS[bo]!, this.cleared) ? bo : 0;
    this.foot = preferredFoot(this.shooter);
    this.rng = new Rng(mix32(this.runs * 7919 + 17));
    this.stage = Math.min(this.cleared, STAGES - 1);
    this.setPhase('stages');
  }

  // ---------- 状态 ----------

  private get persona(): Persona {
    return PERSONAS[this.stage]!;
  }

  private get shooter(): Shooter {
    return SHOOTERS[this.trialShooter ?? this.shooterIdx]!;
  }

  private get boots(): Boots {
    return BOOTS[this.trialBoots ?? this.bootsIdx]!;
  }

  /** 这一脚从哪踢。 */
  private get spot(): Spot {
    return this.fk ?? PENALTY_SPOT;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  private startStage(i: number): void {
    this.stage = i;
    this.goals = 0;
    this.lives = LIVES;
    this.streak = 0;
    this.revived = false;
    this.fooled = 0;
    this.read = 0;
    this.shotsThisStage = 0;
    this.clearInfo = null;
    this.banner = null;
    this.ripple = null;
    this.runs++;
    this.host.save.set(KEY.runs, String(this.runs));
    this.rng = new Rng(mix32(this.runs * 7919 + 17));
    this.foot = preferredFoot(this.shooter);
    this.prepareShot();
    this.setPhase('intro');
  }

  /** 这一关打完（过了或输了）以后，试用的球员、球鞋就还回去。 */
  private endTrial(): void {
    this.trialShooter = null;
    this.trialBoots = null;
    this.foot = preferredFoot(this.shooter);
  }

  private prepareShot(): void {
    this.shot = null;
    this.pending = null;
    this.res = null;
    this.flightT = 0;
    this.afterT = 0;
    this.timeScale = 1;
    this.trail = [];
    this.wallCheck = null;
    const p = this.persona;
    // 这一关依次罚什么（点球或某个位置的任意球），罚完一轮从头再来
    const id = p.shots[this.shotsThisStage % p.shots.length] ?? 'pen';
    this.fk = id === 'pen' ? null : (FREE_KICKS[id] ?? null);
    this.wall = this.fk ? makeWall(this.fk) : null;
    this.layout();
    this.wind = p.wind > 0 ? Math.round((this.rng.int(2001) / 1000 - 1) * p.wind * 2) / 2 : 0;
    if (this.fk) {
      // 任意球：门将不猜，站在人墙挡不住的那一边等球
      this.waiting = true;
      this.guess = 1;
      this.lean = 0;
      const taunt = freeKickTaunt(p, this.rng);
      this.bubble = taunt ? { text: taunt, t: -0.6, face: 'smug' } : null;
      return;
    }
    this.waiting = chooseWait(p, this.rng);
    this.guess = chooseGuess(p, this.history, this.rng);
    this.lean = this.waiting ? 0 : chooseTell(p, this.guess, this.rng);
    const taunt = this.waiting ? (this.rng.chance(1, 3) ? '我不猜，等你踢。' : null) : tauntLine(p, this.guess, this.history, this.rng);
    this.bubble = taunt ? { text: taunt, t: -0.6, face: 'smug' } : null;
  }

  // ---------- 布局 ----------

  resize(view: View): void {
    this.view = view;
    this.layout();
  }

  /** 按屏幕和这一脚的位置摆镜头（任意球的镜头更远、更高，斜对着球门）。 */
  private layout(): void {
    const view = this.view;
    const top = view.safeTop + (this.fk ? 160 : 150);
    const ballMax = view.height - view.safeBottom - Math.max(160, view.height * 0.25);
    this.cam = makeCamera(view.width, top, ballMax, this.spot);
  }

  private ballScreen(): { x: number; y: number; s: number } {
    return project(this.cam, this.spot.x, BALL_R, this.spot.z);
  }

  /** 球在人墙的哪一边：负数是还没飞到人墙。 */
  private wallSide(b: { x: number; z: number }): number {
    const w = this.wall;
    return w ? (b.x - w.x) * w.nx + (b.z - w.z) * w.nz : -1;
  }

  /** 球飞到人墙那一刻（秒）。 */
  private wallTime(): number {
    const shot = this.shot;
    if (!shot) return 0.45;
    return this.wallCheck && this.wallCheck.u >= 0 ? this.wallCheck.u * shot.time : 0.45;
  }

  // ---------- 操作 ----------

  pointerDown(x: number, y: number, t?: number): void {
    const playing = this.phase === 'aim' || this.phase === 'kick' || this.phase === 'flight' || this.phase === 'result' || this.phase === 'intro';
    if (playing && inRect(this.soundBtn, x, y, 8)) {
      this.host.sound.setEnabled(!this.host.sound.enabled);
      this.host.sound.play('click');
      return;
    }
    for (const b of this.buttons) {
      if (inRect(b, x, y, 4)) {
        if (this.phase === 'clear' || this.phase === 'over') {
          if (this.phaseT < 0.6) return;
        }
        this.host.sound.play('click');
        b.onTap();
        return;
      }
    }
    for (const h of this.hits) {
      if (inRect(h, x, y)) {
        this.host.sound.play('click');
        h.onTap();
        return;
      }
    }
    if (this.phase === 'intro') {
      if (this.phaseT < 0.35) return;
      this.host.sound.play('whistle');
      if (!this.tutorialSeen) {
        this.tutorialSeen = true;
        this.host.save.set(KEY.tutorial, '1');
      }
      this.setPhase('aim');
      return;
    }
    if (this.phase !== 'aim') return;
    if (inRect(this.footBtn, x, y, 6)) {
      this.switchFoot();
      return;
    }
    this.dragging = true;
    this.dragPoints = [{ x, y, t: t ?? this.time }];
  }

  pointerMove(x: number, y: number, t?: number): void {
    if (!this.dragging) return;
    this.dragPoints.push({ x, y, t: t ?? this.time });
    if (this.dragPoints.length > 200) this.dragPoints.splice(1, 1);
  }

  pointerUp(x: number, y: number, t?: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.dragPoints.push({ x, y, t: t ?? this.time });
    if (this.phase !== 'aim') return;
    const shot = shotFromSwipe(this.cam, this.ballScreen(), { points: this.dragPoints }, this.rng, this.kicker(), this.wind, this.spot);
    if (shot === 'short') return this.say('往球门的方向划长一点');
    if (shot === 'down') return this.say('往球门的方向划');
    if (this.shooter.skill === 'cannon' && shot.power >= 0.75) shot.time *= 0.88;
    // 划得越久，等球的门将越早看出你要往哪踢
    const first = this.dragPoints[0]!;
    const last = this.dragPoints[this.dragPoints.length - 1]!;
    this.readTime = Math.min(0.2, Math.max(0, last.t - first.t) * 0.6);
    this.pending = shot;
    this.bubble = null;
    this.setPhase('kick');
  }

  private kicker(): ReturnType<typeof kickerFor> & { chip: boolean } {
    return { ...kickerFor(this.shooter, this.boots, this.foot, this.lives === 1), chip: this.shooter.skill === 'chip' };
  }

  private switchFoot(): void {
    this.foot = this.foot === 'R' ? 'L' : 'R';
    this.host.sound.play('click');
    const weak = isWeakFoot(this.shooter, this.foot);
    this.say(`换${this.foot === 'R' ? '右' : '左'}脚${weak ? `（逆足 ${this.shooter.weakFoot} 星，会弱一些）` : ''}`);
  }

  /** 脚碰到球的那一刻：球飞出去。 */
  private kick(shot: Shot): void {
    const sh = this.shooter;
    this.shot = shot;
    const opts = {
      curveTrick: sh.skill === 'banana' ? 1.7 : 1,
      late: sh.skill === 'quick' ? 0.04 : 0,
      lucky: sh.skill === 'lucky',
      waiting: this.waiting,
      read: this.readTime,
    };
    if (this.wall) {
      this.wallCheck = checkWall(shot, this.wall);
      this.res = resolveFreeKick(this.persona, shot, this.wall, this.wallCheck, opts);
      this.freeKicks++;
      this.host.save.set(KEY.freeKicks, String(this.freeKicks));
    } else {
      this.res = resolveShot(this.persona, this.guess, this.lean, shot, opts);
      // 门将的小本本只记点球
      this.history.push(shot.zone);
      if (this.history.length > HISTORY_MAX) this.history.splice(0, this.history.length - HISTORY_MAX);
      this.host.save.set(KEY.history, this.history.join(''));
    }
    this.flightT = 0;
    this.afterT = 0;
    this.timeScale = 1;
    this.shotsThisStage++;
    this.host.sound.play('kick', shot.power);
    this.host.vibrate(shot.power > 0.7 ? 'heavy' : 'light');
    if (shot.power > 0.75) this.shake = 4;
    const fk = this.fk !== null;
    const tag = shot.chip
      ? ' · 勺子'
      : fk && shot.dip > 0.35
        ? ' · 下坠球'
        : Math.abs(shot.bend) > (fk ? 0.8 : 0.4)
          ? ' · 弧线球'
          : '';
    this.speedText = { text: `球速 ${ballSpeedKmh(shot)} 公里/时${tag}`, t: 0 };
    const b = this.ballScreen();
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: b.x,
        y: b.y + 6,
        vx: (this.rng.int(200) - 100) * 0.9,
        vy: -60 - this.rng.int(120),
        life: 0.5,
        color: i % 2 ? '#3fa356' : '#5cc070',
        size: 2 + this.rng.int(3),
        spin: 0,
      });
    }
    this.setPhase('flight');
  }

  private say(text: string): void {
    this.toast = { text, t: 0 };
  }

  // ---------- 每一帧 ----------

  update(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    if (this.toast && (this.toast.t += dt) > 2) this.toast = null;
    if (this.speedText && (this.speedText.t += dt) > 1.6) this.speedText = null;
    if (this.bubble && (this.bubble.t += dt) > 2.4) this.bubble = null;
    if (this.banner) this.banner.t += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.excite = Math.max(0, this.excite - dt * 0.6);
    this.postHit = Math.max(0, this.postHit - dt * 2.5);
    if (this.ripple) this.ripple.t += dt;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.spin += dt * 8;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    if (this.phase === 'kick' && this.phaseT >= KICK_TIME * 0.55 && this.pending) {
      const shot = this.pending;
      this.pending = null;
      this.kick(shot);
    } else if (this.phase === 'flight') this.updateFlight(dt);
    else if (this.phase === 'result') this.updateResult(dt);
  }

  private updateFlight(dt: number): void {
    const shot = this.shot!;
    const res = this.res!;
    // 差一点就扑到 / 差一点就进：最后一段放慢
    const close = res.closest < 0.75 && res.outcome !== 'wide' && res.outcome !== 'over';
    this.timeScale = close && this.flightT > shot.time * 0.62 ? 0.28 : 1;
    this.flightT += dt * this.timeScale;
    const pos = ballAt(shot, this.flightT);
    const sp = project(this.cam, pos.x, pos.y, pos.z);
    this.trail.push({ x: sp.x, y: sp.y });
    if (this.trail.length > 14) this.trail.shift();
    // 打在人墙上：飞到人墙就停
    const end = res.outcome === 'wall' ? this.wallTime() : shot.time;
    if (this.flightT >= end) this.arrive(res.outcome);
  }

  private arrive(outcome: Outcome): void {
    const shot = this.shot!;
    const p = this.persona;
    const sh = this.shooter;
    this.timeScale = 1;
    this.setPhase('result');
    const fk = this.fk !== null;
    const diveCol = zoneCol(this.guess);
    const wrongWay = !fk && diveCol !== 1 && Math.sign(shot.tx) !== (diveCol === 0 ? -1 : 1);
    // 门将拿点球的习惯说事；任意球不算
    const notes = fk ? [] : this.history;
    let sub = '';
    if (isGoal(outcome)) {
      this.goals++;
      this.streak++;
      this.totalGoals++;
      this.host.save.set(KEY.total, String(this.totalGoals));
      this.excite = 1;
      this.shake = 9;
      this.ripple = { x: shot.tx, y: Math.min(shot.ty, 1.8), t: 0 };
      this.host.sound.play(outcome === 'post-in' ? 'post' : 'net');
      this.host.sound.play('cheer');
      this.host.vibrate('heavy');
      if (outcome === 'post-in') this.postHit = 1;
      if (wrongWay) {
        this.fooled++;
        sub = '骗过门将！';
      }
      if (fk) sub = this.wallCheck?.over && shot.dip > 0.35 ? '越过人墙，下坠！' : Math.abs(shot.bend) > 0.9 ? '绕过人墙！' : '任意球破门！';
      if (shot.chip) sub = '勺子！门将先倒了';
      else if (outcome === 'post-in' && sh.skill === 'lucky') sub = '门柱是朋友！';
      else if (sh.skill === 'cannon' && shot.power >= 0.75) sub = '重炮！';
      else if (sh.skill === 'banana' && Math.abs(shot.bend) > (fk ? 1.3 : 0.6)) sub = '香蕉球！';
      if (this.streak === 3) sub = '帽子戏法！';
      if (this.goals >= GOALS_TO_CLEAR) sub = '过关！';
      this.banner = { text: outcome === 'post-in' ? '中柱弹进！' : '进了！', sub, color: D.PAL.goal, t: 0 };
      this.bubble = { text: reactionLine(p, outcome, shot, notes, this.rng), t: 0.25, face: 'sad' };
    } else {
      this.lives--;
      this.streak = 0;
      this.excite = 0.25;
      if (outcome === 'save') {
        this.host.sound.play('save');
        this.host.vibrate('light');
        if (!fk && this.guess === shot.zone) {
          this.read++;
          sub = `门将猜中了：${ZONE_NAMES[shot.zone]}`;
        }
      } else if (outcome === 'post-out') {
        this.host.sound.play('post');
        this.host.vibrate('heavy');
        this.postHit = 1;
        this.shake = 6;
      } else if (outcome === 'wall') {
        this.host.sound.play('save');
        this.host.vibrate('heavy');
        this.shake = 5;
        // 往人墙挡着的那边踢：是想吊过去；往另一边：是想绕过去
        const near = this.wall ? -Math.sign(this.wall.keeperX) : 0;
        if (Math.sign(shot.aimX) !== near) sub = '绕不过去：画个更大的弯';
        else sub = shot.dip > 0.3 ? '太用力，球没起来：划慢一点' : '吊得不够高：最后往下勾一下';
      }
      this.host.sound.play('groan');
      const text = outcome === 'save' ? '扑出！' : outcome === 'post-out' ? '中柱！' : outcome === 'over' ? '高出！' : outcome === 'wall' ? '人墙！' : '偏出！';
      if (this.lives === 1 && !sub) sub = '只剩最后一次机会';
      this.banner = { text, sub, color: D.PAL.bad, t: 0 };
      this.bubble = { text: reactionLine(p, outcome, shot, notes, this.rng), t: 0.25, face: 'smug' };
    }
  }

  private updateResult(dt: number): void {
    this.afterT += dt;
    if (this.phaseT < RESULT_TIME) return;
    if (this.goals >= GOALS_TO_CLEAR) return this.clearStage();
    if (this.lives <= 0) {
      this.setPhase('over');
      return;
    }
    this.prepareShot();
    this.setPhase('aim');
  }

  private clearStage(): void {
    const stars = starsFor(this.lives);
    const before = this.stars[this.stage] ?? 0;
    const best = stars > before;
    if (best) this.stars[this.stage] = stars;
    while (this.stars.length < STAGES) this.stars.push(0);
    this.host.save.set(KEY.stars, JSON.stringify(this.stars));
    let unlocks: string[] = [];
    if (this.stage + 1 > this.cleared) {
      this.cleared = this.stage + 1;
      this.host.save.set(KEY.cleared, String(this.cleared));
      unlocks = unlocksAt(this.cleared);
    }
    this.clearInfo = { stars, best, unlocks };
    this.host.sound.play('milestone');
    this.confetti();
    this.endTrial();
    this.setPhase('clear');
  }

  private revive(): void {
    void this.host.showRewardedAd('revive').then((ok) => {
      if (!ok) return this.say('广告没看完，没有奖励');
      this.revived = true;
      this.lives = 1;
      this.prepareShot();
      this.host.sound.play('whistle');
      this.setPhase('aim');
    });
  }

  private backToStages(): void {
    this.endTrial();
    this.fk = null;
    this.wall = null;
    this.shot = null;
    this.layout();
    this.stage = Math.min(this.cleared, STAGES - 1);
    this.setPhase('stages');
  }

  private tryShooter(i: number): void {
    void this.host.showRewardedAd('try-shooter').then((ok) => {
      if (!ok) return this.say('广告没看完，没有奖励');
      this.trialShooter = i;
      this.foot = preferredFoot(this.shooter);
      this.say(`下一关试用「${SHOOTERS[i]!.name}」`);
      this.setPhase('stages');
    });
  }

  private tryBoots(i: number): void {
    void this.host.showRewardedAd('try-boots').then((ok) => {
      if (!ok) return this.say('广告没看完，没有奖励');
      this.trialBoots = i;
      this.say(`下一关试穿「${BOOTS[i]!.name}」`);
      this.setPhase('stages');
    });
  }

  private confetti(): void {
    const colors = [D.PAL.accent, '#ff6b5b', '#4f9bd9', '#8fd18c', '#ffffff', '#c58be0'];
    for (let i = 0; i < 70; i++) {
      this.particles.push({
        x: this.view.width / 2 + (this.rng.int(400) - 200),
        y: this.view.height * 0.25,
        vx: (this.rng.int(600) - 300) * 0.9,
        vy: -200 - this.rng.int(350),
        life: 1.6 + this.rng.int(80) / 100,
        color: colors[i % colors.length]!,
        size: 4 + this.rng.int(4),
        spin: this.rng.int(10),
      });
    }
  }

  // ---------- 画 ----------

  render(ctx: Canvas2D): void {
    const { width: W, height: H } = this.view;
    this.buttons = [];
    this.hits = [];
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.sin(this.time * 90) * this.shake * 0.6, Math.cos(this.time * 77) * this.shake * 0.5);
    ctx.fillStyle = D.PAL.skyTop;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    D.drawStadium(ctx, this.cam, this.view, this.time, this.excite);
    D.drawPitch(ctx, this.cam, this.view);
    D.drawNet(ctx, this.cam, this.ripple);
    const ball = this.ballState();
    if (ball.z < 0.35) this.drawBallAt(ctx, ball);
    D.drawFrame(ctx, this.cam, this.postHit);
    this.drawKeeper(ctx);
    // 人墙在门将前面；球飞过人墙以后画在人墙后面
    const pastWall = this.wall !== null && this.wallSide(ball) >= 0 && !(this.phase === 'result' && this.res?.outcome === 'wall');
    if (ball.z >= 0.35 && pastWall) this.drawBallAt(ctx, ball);
    if (this.wall) D.drawWall(ctx, this.cam, wallPeople(this.wall), { x: this.wall.tx, z: this.wall.tz }, this.wallJump(), WALL_KIT);
    if (ball.z >= 0.35 && !pastWall) this.drawBallAt(ctx, ball);
    ctx.restore();

    const menu = this.phase === 'stages' || this.phase === 'players' || this.phase === 'boots';
    this.drawLeg(ctx);
    this.drawParticles(ctx);
    if (!menu) {
      this.drawSwipe(ctx);
      this.drawHud(ctx);
    }
    if (this.banner && this.banner.t < 1.5 && (this.phase === 'result' || this.phase === 'flight')) {
      const gy = project(this.cam, 0, GOAL_H / 2, 0).y;
      D.drawBanner(ctx, W / 2, gy + 30, this.banner.text, this.banner.sub, this.banner.color, this.banner.t);
    }
    if (this.bubble && this.bubble.t > 0 && (this.phase === 'aim' || this.phase === 'kick' || this.phase === 'flight' || this.phase === 'result')) {
      const a = Math.min(1, this.bubble.t / 0.15, (2.4 - this.bubble.t) / 0.3);
      D.drawBubble(ctx, this.view, this.keeperHead.x, this.keeperHead.y - 4, this.bubble.text, this.persona, this.bubble.face, Math.max(0, a));
    }
    this.drawSpeed(ctx);
    if (this.phase === 'intro') this.drawIntro(ctx);
    if (this.phase === 'clear') this.drawClear(ctx);
    if (this.phase === 'over') this.drawOver(ctx);
    if (this.phase === 'stages') this.drawStages(ctx);
    if (this.phase === 'players') this.drawPlayers(ctx);
    if (this.phase === 'boots') this.drawBootsList(ctx);
    this.drawToast(ctx);
  }

  /** 罚球的腿和球鞋：等射门时踩在球边，踢的时候摆过去。 */
  private drawLeg(ctx: Canvas2D): void {
    let k: number;
    if (this.phase === 'aim' || this.phase === 'intro') k = 0;
    else if (this.phase === 'kick') k = Math.min(1, this.phaseT / KICK_TIME) * 0.55;
    else if (this.phase === 'flight' && this.flightT < 0.25) k = 0.55 + (this.flightT / 0.25) * 0.45;
    else return;
    const b = this.ballScreen();
    D.drawKickLeg(ctx, { x: b.x, y: b.y, r: BALL_R * b.s }, this.foot === 'R' ? 1 : -1, this.boots, this.shooter.jersey, k);
  }

  private drawSpeed(ctx: Canvas2D): void {
    if (!this.speedText || (this.phase !== 'flight' && this.phase !== 'result')) return;
    const ball = this.ballScreen();
    const a = Math.min(1, (1.6 - this.speedText.t) / 0.3, this.speedText.t / 0.08);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#fff';
    ctx.font = `800 16px ${D.FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(this.speedText.text, this.view.width / 2, ball.y + 64);
    ctx.restore();
  }

  private menuBackdrop(ctx: Canvas2D, title: string, sub: string): void {
    const { width: W, height: H, safeTop } = this.view;
    ctx.fillStyle = 'rgba(4,8,24,0.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 24px ${D.FONT}`;
    ctx.fillText(title, W / 2, safeTop + 40);
    ctx.font = `600 13px ${D.FONT}`;
    ctx.fillStyle = D.PAL.hudMuted;
    ctx.fillText(sub, W / 2, safeTop + 68);
  }

  private drawStars(ctx: Canvas2D, x: number, y: number, n: number, size: number): void {
    for (let i = 0; i < 3; i++) {
      const cx = x + i * size * 1.15;
      ctx.fillStyle = i < n ? D.PAL.accent : 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? size * 0.22 : size * 0.5;
        const px = cx + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  /** 闯关地图：十关两列排开，打过的有星星，没解锁的上锁；下面是现在用的球员和球鞋。 */
  private drawStages(ctx: Canvas2D): void {
    const { width: W, height: H, safeTop, safeBottom } = this.view;
    ctx.save();
    const totalStars = this.stars.reduce((a, b) => a + b, 0);
    this.menuBackdrop(ctx, '点球闯关', `称号：${rankFor(this.cleared)} · 已过 ${this.cleared} / ${STAGES} 关 · ★ ${totalStars}`);
    const top = safeTop + 92;
    const barH = 116;
    const bottom = H - safeBottom - barH - 8;
    const gap = 10;
    const cw = (W - 32 - gap) / 2;
    const rows = Math.ceil(STAGES / 2);
    const ch = Math.min(96, (bottom - top - gap * (rows - 1)) / rows);
    PERSONAS.forEach((p, i) => {
      const x = 16 + (i % 2) * (cw + gap);
      const y = top + Math.floor(i / 2) * (ch + gap);
      const open = i <= this.cleared;
      const next = i === Math.min(this.cleared, STAGES - 1) && i >= this.cleared;
      roundRectPath(ctx, x, y, cw, ch, 16);
      ctx.fillStyle = open ? D.PAL.card : 'rgba(255,255,255,0.18)';
      ctx.fill();
      if (next) {
        ctx.strokeStyle = D.PAL.accent;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      const av = Math.min(28, ch * 0.3);
      ctx.save();
      if (!open) ctx.globalAlpha = 0.35;
      D.drawAvatar(ctx, x + 12 + av, y + ch / 2, av, p, 'ready');
      ctx.restore();
      const tx = x + 22 + av * 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = open ? D.PAL.cardMuted : D.PAL.hudMuted;
      ctx.font = `700 12px ${D.FONT}`;
      ctx.fillText(`第 ${i + 1} 关`, tx, y + ch * 0.24);
      ctx.fillStyle = open ? D.PAL.cardInk : D.PAL.hudMuted;
      ctx.font = `900 17px ${D.FONT}`;
      ctx.fillText(open ? p.name : '？？？', tx, y + ch * 0.5);
      if (open) {
        if ((this.stars[i] ?? 0) > 0) this.drawStars(ctx, tx + 7, y + ch * 0.77, this.stars[i]!, 14);
        else {
          ctx.fillStyle = '#c9961a';
          ctx.font = `800 12px ${D.FONT}`;
          ctx.fillText('去挑战 ›', tx, y + ch * 0.77);
        }
        this.hits.push({ x, y, w: cw, h: ch, onTap: () => this.startStage(i) });
      } else {
        ctx.fillStyle = D.PAL.hudMuted;
        ctx.font = `600 11px ${D.FONT}`;
        ctx.fillText(`过第 ${i} 关解锁`, tx, y + ch * 0.77);
      }
    });
    // 下面：球员和球鞋
    const by = H - safeBottom - barH;
    const half = (W - 32 - gap) / 2;
    const sh = this.shooter;
    const bo = this.boots;
    const card = (x: number, label: string, name: string, line: string, onTap: () => void, draw: (cx: number, cy: number) => void): void => {
      roundRectPath(ctx, x, by, half, barH - 16, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      draw(x + 34, by + (barH - 16) / 2 - 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = D.PAL.hudMuted;
      ctx.font = `700 11px ${D.FONT}`;
      ctx.fillText(label, x + 66, by + 20);
      ctx.fillStyle = '#fff';
      ctx.font = `900 16px ${D.FONT}`;
      ctx.fillText(name, x + 66, by + 42);
      ctx.fillStyle = D.PAL.hudMuted;
      ctx.font = `600 11px ${D.FONT}`;
      ctx.fillText(line, x + 66, by + 62);
      ctx.fillStyle = D.PAL.accent;
      ctx.font = `800 12px ${D.FONT}`;
      ctx.fillText('换一个 ›', x + 66, by + 84);
      this.hits.push({ x, y: by, w: half, h: barH - 16, onTap });
    };
    card(16, this.trialShooter !== null ? '球员（试用）' : '球员', sh.name, `${footName(sh)} · ${sh.power}/${sh.accuracy}/${sh.curve}`, () => this.setPhase('players'), (cx, cy) =>
      D.drawAvatar(ctx, cx, cy + 8, 24, sh, 'ready', String(10 + SHOOTERS.indexOf(sh))),
    );
    card(16 + half + gap, this.trialBoots !== null ? '球鞋（试穿）' : '球鞋', bo.name, bo.text, () => this.setPhase('boots'), (cx, cy) => D.drawBootSide(ctx, cx, cy + 8, 46, bo));
    ctx.restore();
  }

  /** 选球员：每人一行。没解锁的灰着，可以看广告试用一关。 */
  private drawPlayers(ctx: Canvas2D): void {
    const { width: W, height: H, safeTop, safeBottom } = this.view;
    ctx.save();
    this.menuBackdrop(ctx, '选一个罚球的人', '力量 / 精准 / 弧线，惯用脚和逆足，还有各自的绝招');
    const top = safeTop + 88;
    const bottom = H - safeBottom - 80;
    const n = SHOOTERS.length;
    const rowH = Math.min(84, (bottom - top) / n - 6);
    SHOOTERS.forEach((sh, i) => {
      const x = 12;
      const w = W - 24;
      const y = top + i * (rowH + 6);
      const open = isUnlocked(sh, this.cleared);
      const selected = i === this.shooterIdx;
      roundRectPath(ctx, x, y, w, rowH, 14);
      ctx.fillStyle = selected ? D.PAL.card : open ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.3)';
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = D.PAL.accent;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      const av = Math.min(26, rowH * 0.32);
      ctx.save();
      if (!open) ctx.globalAlpha = 0.5;
      D.drawAvatar(ctx, x + 10 + av, y + rowH / 2, av, sh, selected ? 'smug' : 'ready', String(10 + i));
      ctx.restore();
      const tx = x + 20 + av * 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = D.PAL.cardInk;
      ctx.font = `900 15px ${D.FONT}`;
      ctx.fillText(sh.name, tx, y + rowH * 0.22);
      const nw = ctx.measureText(sh.name).width;
      ctx.fillStyle = D.PAL.cardMuted;
      ctx.font = `600 11px ${D.FONT}`;
      ctx.fillText(`${footName(sh)}${sh.foot === 'both' ? '' : ` · 逆足 ${sh.weakFoot}`}`, tx + nw + 8, y + rowH * 0.22);
      ctx.fillStyle = open ? '#9a6a12' : D.PAL.cardMuted;
      ctx.font = `700 11px ${D.FONT}`;
      ctx.fillText(open ? `绝招「${sh.skillName}」：${sh.skillText}` : `过第 ${sh.unlockStage} 关解锁 · 绝招「${sh.skillName}」`, tx, y + rowH * 0.5);
      const stats: [string, number][] = [
        ['力量', sh.power],
        ['精准', sh.accuracy],
        ['弧线', sh.curve],
      ];
      const sw = Math.min(76, (w - (tx - x) - 8) / 3);
      stats.forEach(([label, v], k) => {
        const sx = tx + k * sw;
        const sy = y + rowH * 0.78;
        ctx.fillStyle = D.PAL.cardMuted;
        ctx.font = `700 10px ${D.FONT}`;
        ctx.fillText(label, sx, sy);
        for (let j = 0; j < 5; j++) {
          ctx.fillStyle = j < v ? '#e0a21a' : 'rgba(0,0,0,0.12)';
          ctx.fillRect(sx + 24 + j * 8, sy - 4, 6, 8);
        }
      });
      if (open) this.hits.push({ x, y, w, h: rowH, onTap: () => this.pickShooter(i) });
      else {
        const b: Btn = { x: x + w - 92, y: y + 6, w: 84, h: 28, label: '试用一关', ad: true, onTap: () => this.tryShooter(i) };
        this.buttons.push(b);
        D.drawPill(ctx, b);
      }
    });
    const done: Btn = { x: 24, y: H - safeBottom - 68, w: W - 48, h: 52, label: '好了', primary: true, onTap: () => this.setPhase('stages') };
    this.buttons.push(done);
    D.drawPill(ctx, done);
    ctx.restore();
  }

  private pickShooter(i: number): void {
    this.shooterIdx = i;
    this.trialShooter = null;
    this.host.save.set(KEY.shooter, SHOOTERS[i]!.id);
    this.foot = preferredFoot(this.shooter);
  }

  /** 选球鞋。 */
  private drawBootsList(ctx: Canvas2D): void {
    const { width: W, height: H, safeTop, safeBottom } = this.view;
    ctx.save();
    this.menuBackdrop(ctx, '选一双球鞋', '球鞋的加成加在球员的能力上');
    const top = safeTop + 88;
    const bottom = H - safeBottom - 80;
    const n = BOOTS.length;
    const rowH = Math.min(84, (bottom - top) / n - 8);
    BOOTS.forEach((bo, i) => {
      const x = 12;
      const w = W - 24;
      const y = top + i * (rowH + 8);
      const open = isUnlocked(bo, this.cleared);
      const selected = i === this.bootsIdx;
      roundRectPath(ctx, x, y, w, rowH, 14);
      ctx.fillStyle = selected ? D.PAL.card : open ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.3)';
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = D.PAL.accent;
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      ctx.save();
      if (!open) ctx.globalAlpha = 0.5;
      D.drawBootSide(ctx, x + 46, y + rowH / 2, 64, bo);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = D.PAL.cardInk;
      ctx.font = `900 16px ${D.FONT}`;
      ctx.fillText(bo.name, x + 92, y + rowH * 0.3);
      ctx.fillStyle = open ? '#9a6a12' : D.PAL.cardMuted;
      ctx.font = `700 12px ${D.FONT}`;
      ctx.fillText(bo.text, x + 92, y + rowH * 0.62);
      if (!open) {
        ctx.fillStyle = D.PAL.cardMuted;
        ctx.font = `600 11px ${D.FONT}`;
        ctx.fillText(`过第 ${bo.unlockStage} 关解锁`, x + 92, y + rowH * 0.85);
      }
      if (open) this.hits.push({ x, y, w, h: rowH, onTap: () => this.pickBoots(i) });
      else {
        const b: Btn = { x: x + w - 92, y: y + (rowH - 28) / 2, w: 84, h: 28, label: '试穿一关', ad: true, onTap: () => this.tryBoots(i) };
        this.buttons.push(b);
        D.drawPill(ctx, b);
      }
    });
    const done: Btn = { x: 24, y: H - safeBottom - 68, w: W - 48, h: 52, label: '好了', primary: true, onTap: () => this.setPhase('stages') };
    this.buttons.push(done);
    D.drawPill(ctx, done);
    ctx.restore();
  }

  private pickBoots(i: number): void {
    this.bootsIdx = i;
    this.trialBoots = null;
    this.host.save.set(KEY.boots, BOOTS[i]!.id);
  }

  /** 球现在在哪（包括进网、被扑出去、飞出去以后）。 */
  private ballState(): { x: number; y: number; z: number; alpha: number; spin: number } {
    const shot = this.shot;
    if (!shot || (this.phase !== 'flight' && this.phase !== 'result')) return { x: this.spot.x, y: BALL_R, z: this.spot.z, alpha: 1, spin: 0 };
    const spin = this.flightT * (8 + shot.power * 14);
    if (this.phase === 'flight') return { ...ballAt(shot, this.flightT), alpha: 1, spin };
    const t = this.afterT;
    const o = this.res!.outcome;
    if (o === 'wall') {
      // 打在人墙上弹回来
      const hit = ballAt(shot, this.wallTime());
      const k = Math.min(1, t / 0.8);
      const side = Math.sign(shot.tx - shot.ox) || 1;
      return { x: hit.x - side * 0.8 * k, y: Math.max(BALL_R, hit.y + 0.7 * Math.sin(k * Math.PI) - (hit.y - BALL_R) * k), z: hit.z + 4.2 * k, alpha: 1, spin: spin - t * 10 };
    }
    const end = ballAt(shot, shot.time);
    if (o === 'goal' || o === 'post-in') {
      const k = Math.min(1, t / 0.14);
      const drop = Math.min(1, Math.max(0, (t - 0.14) / 0.45));
      return { x: end.x * (1 + 0.05 * k), y: end.y + (BALL_R - end.y) * drop * drop, z: -1.45 * k, alpha: 1, spin: spin + t * 6 };
    }
    if (o === 'save') {
      const d = this.res!.dive;
      const caught = this.res!.closest < 0.22 && Math.abs(shot.tx - d.startX) < 1.2;
      if (caught) {
        const body = bodyLine(d, 1);
        return { x: body.hx, y: Math.max(BALL_R, body.hy - Math.min(1, t / 0.5) * (body.hy - 0.3)), z: 0.45, alpha: 1, spin };
      }
      const k = Math.min(1, t / 0.7);
      const side = Math.sign(shot.tx) || 1;
      return { x: end.x + side * 2.6 * k, y: Math.max(BALL_R, end.y + 1.2 * Math.sin(k * Math.PI) - end.y * k), z: 3.2 * k, alpha: 1, spin: spin - t * 10 };
    }
    if (o === 'post-out') {
      const k = Math.min(1, t / 0.6);
      const side = Math.sign(shot.tx) || 1;
      return { x: end.x + side * 1.2 * k, y: Math.max(BALL_R, end.y + 0.8 * Math.sin(k * Math.PI) - (end.y - BALL_R) * k), z: 2.6 * k, alpha: 1, spin: spin - t * 12 };
    }
    // 偏出、高出：继续飞，慢慢消失
    const k = Math.min(1, t / 0.5);
    const rise = o === 'over' ? 0.9 * k : 0;
    return { x: end.x * (1 + 0.25 * k), y: end.y + rise, z: -4 * k, alpha: 1 - k, spin: spin + t * 6 };
  }

  private drawBallAt(ctx: Canvas2D, b: { x: number; y: number; z: number; alpha: number; spin: number }): void {
    if (this.phase === 'flight' && this.trail.length > 1) {
      ctx.save();
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1]!;
        const c = this.trail[i]!;
        ctx.strokeStyle = `rgba(255,255,255,${(i / this.trail.length) * 0.35})`;
        ctx.lineWidth = 2 + (i / this.trail.length) * 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }
      ctx.restore();
    }
    D.drawBallShadow(ctx, this.cam, b.x, b.y, b.z, b.alpha);
    D.drawBall(ctx, this.cam, b.x, b.y, b.z, b.spin, b.alpha);
  }

  private drawKeeper(ctx: Canvas2D): void {
    const p = this.persona;
    let pose: D.KeeperPose;
    let face: D.Face = 'ready';
    const moving = this.phase === 'flight' || this.phase === 'result';
    const t = this.phase === 'flight' ? this.flightT : this.shot ? this.shot.time + this.afterT : 0;
    const startX = this.wall ? this.wall.keeperX : 0;
    if (moving && this.res && this.res.outcome !== 'wall' && t > p.reaction + this.res.late) {
      const q = diveProgress(p, t, this.res.late);
      const d = this.res.dive;
      const line = bodyLine(d, q);
      // 扑完以后倒在地上（扑得远或者扑得高才倒）
      const fall = this.phase === 'result' ? Math.min(1, Math.max(0, (this.afterT - 0.15) / 0.45)) : 0;
      const lies = d.handY > 0.9 || Math.abs(d.handX - d.startX) > 0.8 ? 1 : 0;
      const groundY = (y: number): number => y + (Math.max(0.15, y * 0.35) - y) * fall * lies;
      pose = { kind: 'line', fx: line.fx, fy: groundY(line.fy), hx: line.hx, hy: groundY(line.hy) };
      if (this.phase === 'result') face = isGoal(this.res.outcome) ? 'sad' : 'smug';
      else face = 'shock';
    } else {
      // 等你射门：左右晃；会「露馅」的门将往要扑的那边多晃一下
      const sway = this.waiting && this.phase === 'aim' ? Math.sin(this.time * 1.2) * 0.03 : Math.sin(this.time * 2.6) * 0.12;
      const tellWave = Math.max(0, Math.sin(this.time * 1.7));
      const lean = this.lean * Math.pow(tellWave, 3) * 1.0;
      pose = { kind: 'idle', x: startX + sway + this.lean * 0.15 * tellWave, lean, bounce: Math.abs(Math.sin(this.time * (4 + p.bouncy * 4))) * (0.4 + p.bouncy * 0.9) };
      if (this.bubble && this.bubble.t > 0) face = 'smug';
    }
    this.keeperHead = D.drawKeeper(ctx, this.cam, p, pose, face);
  }

  /** 人墙跳多高（0～1）：踢出去就起跳，球飞到人墙时跳到最高。 */
  private wallJump(): number {
    if (!this.shot || (this.phase !== 'flight' && this.phase !== 'result')) return 0;
    const t = this.flightT + (this.phase === 'result' ? this.afterT : 0);
    return Math.max(0, Math.sin(Math.PI * Math.min(1, t / (2 * this.wallTime()))));
  }

  private drawParticles(ctx: Canvas2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    }
  }

  private drawSwipe(ctx: Canvas2D): void {
    if (this.phase !== 'aim') return;
    if (!this.dragging || this.dragPoints.length < 2) {
      const learning = this.fk ? this.freeKicks < 3 : this.shotsThisStage < 2;
      if (learning && this.phaseT > 0.6) this.drawHint(ctx);
      return;
    }
    const pts = this.dragPoints;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + k * 0.6})`;
      ctx.lineWidth = 3 + k * 7;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y);
      ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.stroke();
    }
    // 预览：要是现在松手，球会怎么飞（虚线）、落在哪（圈）、多大力（球下面的条）
    const preview = shotFromSwipe(this.cam, this.ballScreen(), { points: pts }, new Rng(1), this.kicker(), 0, this.spot);
    if (typeof preview !== 'string') {
      const shot = { ...preview, tx: preview.aimX, ty: preview.aimY };
      const color = shot.power > 0.7 ? '255,107,91' : shot.power > 0.35 ? '255,207,63' : '140,230,150';
      // 第一关是练习：整条路线和落点都画出来；之后什么都不画，全靠自己。前两个任意球也画出来教你
      const full = this.stage < 1 || (this.fk !== null && this.freeKicks < 2);
      for (let i = 1; i <= (full ? 16 : 0); i++) {
        const q = ballAt(shot, (shot.time * i) / 16);
        const sp = project(this.cam, q.x, q.y, q.z);
        ctx.fillStyle = `rgba(${color},${0.25 + (i / 16) * 0.5})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2 + (i / 16) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (full) {
        const end = project(this.cam, shot.tx, shot.ty, 0);
        ctx.strokeStyle = `rgba(${color},0.95)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 8 + shot.power * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      const ball = this.ballScreen();
      const bw = 120;
      const bx = ball.x - bw / 2;
      const by = ball.y + 46;
      roundRectPath(ctx, bx, by, bw, 10, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      roundRectPath(ctx, bx, by, Math.max(10, bw * shot.power), 10, 5);
      ctx.fillStyle = `rgb(${color})`;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 12px ${D.FONT}`;
      ctx.textAlign = 'center';
      const label = shot.chip ? '勺子' : `${shot.power > 0.7 ? '大力' : shot.power > 0.35 ? '中等' : '轻推'}${this.fk && shot.dip > 0.35 ? ' · 下坠' : ''}`;
      ctx.fillText(label, ball.x, by + 26);
    }
    ctx.restore();
  }

  private drawHud(ctx: Canvas2D): void {
    const { width: W, height: H, safeTop, safeBottom } = this.view;
    const top = safeTop + 10;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = D.PAL.hudMuted;
    ctx.font = `700 13px ${D.FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`第 ${this.stage + 1} 关 · 进 ${GOALS_TO_CLEAR} 个过关`, 16, top + 14);
    ctx.fillStyle = D.PAL.hud;
    ctx.font = `900 40px ${D.FONT}`;
    ctx.fillText(String(this.goals), 16, top + 54);
    const gw = ctx.measureText(String(this.goals)).width;
    ctx.font = `800 20px ${D.FONT}`;
    ctx.fillStyle = D.PAL.hudMuted;
    ctx.fillText(`/ ${GOALS_TO_CLEAR}`, 20 + gw, top + 52);
    const numW = gw + 4 + ctx.measureText(`/ ${GOALS_TO_CLEAR}`).width;
    for (let i = 0; i < LIVES; i++) {
      const cx = 16 + numW + 20 + i * 22;
      const cy = top + 44;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      if (i < this.lives) {
        ctx.fillStyle = '#fbfbf7';
        ctx.fill();
        ctx.fillStyle = '#20242e';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    this.soundBtn = { x: W - 50, y: top, w: 36, h: 36 };
    this.drawSoundIcon(ctx, this.soundBtn, this.host.sound.enabled);
    // 门将名牌
    const bar = project(this.cam, 0, GOAL_H, 0);
    const label = `门将 · ${this.persona.name}`;
    ctx.font = `800 13px ${D.FONT}`;
    const lw = ctx.measureText(label).width + 22;
    const ly = bar.y - 34;
    roundRectPath(ctx, W / 2 - lw / 2, ly, lw, 24, 12);
    ctx.fillStyle = this.persona.jersey;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, ly + 12.5);
    if (this.wind !== 0) this.drawWind(ctx, 16, ly + 12);
    if (this.fk) {
      const fkLabel = `任意球 · ${this.fk.name} · 人墙 ${this.fk.wall} 人`;
      ctx.font = `800 12px ${D.FONT}`;
      const fw = ctx.measureText(fkLabel).width + 20;
      roundRectPath(ctx, W / 2 - fw / 2, ly - 28, fw, 22, 11);
      ctx.fillStyle = 'rgba(255,207,63,0.92)';
      ctx.fill();
      ctx.fillStyle = '#1b1f2e';
      ctx.fillText(fkLabel, W / 2, ly - 16.5);
    }
    // 左下：罚球的人、用哪只脚、什么鞋
    const sh = this.shooter;
    const by = H - safeBottom - 32;
    D.drawAvatar(ctx, 34, by, 18, sh, 'ready', String(10 + SHOOTERS.indexOf(sh)));
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = `800 14px ${D.FONT}`;
    ctx.fillText(sh.name, 60, by - 8);
    ctx.fillStyle = D.PAL.hudMuted;
    ctx.font = `600 11px ${D.FONT}`;
    ctx.fillText(`${this.boots.name} · 绝招「${sh.skillName}」`, 60, by + 10);
    // 右下：换脚
    const weak = isWeakFoot(sh, this.foot);
    this.footBtn = { x: W - 128, y: by - 21, w: 114, h: 42 };
    roundRectPath(ctx, this.footBtn.x, this.footBtn.y, this.footBtn.w, this.footBtn.h, 21);
    ctx.fillStyle = weak ? 'rgba(255,107,91,0.25)' : 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `800 14px ${D.FONT}`;
    ctx.fillText(`${this.foot === 'R' ? '右脚' : '左脚'}${weak ? '（逆足）' : ''} ⇄`, this.footBtn.x + this.footBtn.w / 2, by + 1);
    ctx.restore();
    this.drawNotebook(ctx, top);
  }

  /** 风向标：箭头指着风吹的方向，越长风越大。 */
  private drawWind(ctx: Canvas2D, x: number, y: number): void {
    const dir = Math.sign(this.wind);
    const len = 18 + Math.abs(this.wind) * 9;
    ctx.save();
    roundRectPath(ctx, x - 4, y - 16, len + 74, 32, 16);
    ctx.fillStyle = 'rgba(4,8,24,0.55)';
    ctx.fill();
    ctx.fillStyle = '#bfe3ff';
    ctx.font = `800 13px ${D.FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`风 ${Math.abs(this.wind).toFixed(1)}`, x + 6, y + 1);
    const ax = x + 50;
    const ex = dir > 0 ? ax + len : ax;
    const sx = dir > 0 ? ax : ax + len;
    const wob = Math.sin(this.time * 6) * 1.5;
    ctx.strokeStyle = '#bfe3ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, y + wob * 0.3);
    ctx.lineTo(ex, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - dir * 7, y - 6);
    ctx.lineTo(ex, y);
    ctx.lineTo(ex - dir * 7, y + 6);
    ctx.stroke();
    ctx.restore();
  }

  private drawIntro(ctx: Canvas2D): void {
    const p = this.persona;
    const tutorial = !this.tutorialSeen;
    ctx.save();
    const fks = p.shots.filter((id) => id !== 'pen').length;
    const c = this.card(ctx, (tutorial ? 520 : 380) + (p.wait >= 0.3 ? 24 : 0) + (fks > 0 ? 24 : 0) + (fks > 0 && this.freeKicks === 0 ? 22 : 0));
    const cx = c.x + c.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `700 14px ${D.FONT}`;
    ctx.fillText(`第 ${this.stage + 1} 关`, cx, c.y + 30);
    D.drawAvatar(ctx, cx, c.y + 92, 44, p, 'smug');
    ctx.fillStyle = D.PAL.cardInk;
    ctx.font = `900 28px ${D.FONT}`;
    ctx.fillText(p.name, cx, c.y + 162);
    ctx.font = `600 12px ${D.FONT}`;
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.fillText(`身高 ${Math.round(p.height * 100)} 厘米 · ${p.girth > 1.3 ? '壮' : p.girth < 0.9 ? '瘦' : '中等身材'}`, cx, c.y + 186);
    ctx.font = `500 15px ${D.FONT}`;
    const traitLines = wrapText(ctx, p.trait, c.w - 48);
    traitLines.forEach((l, i) => ctx.fillText(l, cx, c.y + 214 + i * 21));
    let y = c.y + 214 + traitLines.length * 21 + 14;
    ctx.fillStyle = D.PAL.cardInk;
    ctx.font = `800 16px ${D.FONT}`;
    for (const l of wrapText(ctx, `「${p.intro}」`, c.w - 40)) {
      ctx.fillText(l, cx, y);
      y += 22;
    }
    y += 6;
    ctx.fillStyle = '#9a6a12';
    ctx.font = `800 14px ${D.FONT}`;
    ctx.fillText(`进 ${GOALS_TO_CLEAR} 个球过关 · ${LIVES} 次机会${p.wind > 0 ? ' · 有风' : ''}`, cx, y);
    y += 26;
    if (p.wait >= 0.3) {
      ctx.fillStyle = D.PAL.cardMuted;
      ctx.font = `600 13px ${D.FONT}`;
      ctx.fillText('他常常不猜、站着等球：要踢得又快又贴边', cx, y);
      y += 24;
    }
    if (fks > 0) {
      ctx.fillStyle = '#9a6a12';
      ctx.font = `700 13px ${D.FONT}`;
      ctx.fillText(fks === p.shots.length ? '这一关全是任意球' : `这一关有任意球（每 ${p.shots.length} 脚里 ${fks} 脚）`, cx, y);
      y += 22;
      if (this.freeKicks === 0) {
        ctx.fillStyle = D.PAL.cardMuted;
        ctx.font = `600 13px ${D.FONT}`;
        ctx.fillText('画弯绕人墙，或者最后往下勾吊过人墙', cx, y);
        y += 22;
      }
      y += 2;
    }
    y += 4;
    if (tutorial) {
      ctx.font = `500 14px ${D.FONT}`;
      ctx.fillStyle = D.PAL.cardInk;
      const lines = [
        '往想踢的位置划一下就射门。第一关会画出落点。',
        '先往一边划再拐过来，就是弧线球。',
        '划得越快，球越快，也越容易偏。',
        '右下角可以换脚；用逆足会弱一些。',
        '门将会记住你往哪儿踢。',
      ];
      lines.forEach((l, i) => ctx.fillText(l, cx, y + i * 22));
    }
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `700 14px ${D.FONT}`;
    ctx.globalAlpha *= 0.55 + 0.45 * Math.sin(this.time * 4);
    ctx.fillText('点一下开始', cx, c.y + c.h - 26);
    ctx.restore();
  }

  private drawClear(ctx: Canvas2D): void {
    const info = this.clearInfo!;
    const last = this.stage >= STAGES - 1;
    ctx.save();
    const c = this.card(ctx, 380 + info.unlocks.length * 24);
    const cx = c.x + c.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `700 15px ${D.FONT}`;
    ctx.fillText(`第 ${this.stage + 1} 关 · ${this.persona.name}`, cx, c.y + 32);
    ctx.fillStyle = D.PAL.cardInk;
    ctx.font = `900 40px ${D.FONT}`;
    ctx.fillText(last ? '全部通关！' : '过关！', cx, c.y + 78);
    this.drawStars(ctx, cx - 46, c.y + 132, info.stars, 40);
    ctx.font = `700 14px ${D.FONT}`;
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.fillText(info.best ? `剩 ${this.lives} 次机会过关，最好成绩！` : `剩 ${this.lives} 次机会过关`, cx, c.y + 172);
    let y = c.y + 204;
    if (info.unlocks.length > 0) {
      ctx.fillStyle = '#9a6a12';
      ctx.font = `800 15px ${D.FONT}`;
      for (const u of info.unlocks) {
        ctx.fillText(`解锁了${u}`, cx, y);
        y += 24;
      }
    }
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `600 13px ${D.FONT}`;
    ctx.fillText(`称号：${rankFor(this.cleared)}`, cx, y + 4);
    const bw = c.w - 56;
    if (!last) {
      this.buttons.push({ x: c.x + 28, y: c.y + c.h - 124, w: bw, h: 52, label: '下一关', primary: true, onTap: () => this.startStage(this.stage + 1) });
      this.buttons.push({ x: c.x + 28, y: c.y + c.h - 62, w: bw, h: 44, label: '回到关卡', onTap: () => this.backToStages() });
    } else {
      this.buttons.push({ x: c.x + 28, y: c.y + c.h - 72, w: bw, h: 52, label: '回到关卡', primary: true, onTap: () => this.backToStages() });
    }
    for (const b of this.buttons) D.drawPill(ctx, b);
    ctx.restore();
  }

  private drawOver(ctx: Canvas2D): void {
    ctx.save();
    const c = this.card(ctx, 500);
    const cx = c.x + c.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `700 15px ${D.FONT}`;
    ctx.fillText(`第 ${this.stage + 1} 关 · ${this.persona.name}`, cx, c.y + 32);
    ctx.fillStyle = D.PAL.cardInk;
    ctx.font = `900 40px ${D.FONT}`;
    ctx.fillText(this.goals >= GOALS_TO_CLEAR - 1 ? '就差一个！' : '没过关', cx, c.y + 78);
    ctx.font = `800 18px ${D.FONT}`;
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.fillText(`进了 ${this.goals} / ${GOALS_TO_CLEAR} 个`, cx, c.y + 120);
    const fav = favorite(this.history.slice(-30));
    const rows: [string, string][] = [
      ['骗过门将', `${this.fooled} 次`],
      ['被门将猜中', `${this.read} 次`],
      ['你最爱踢', fav ? `${ZONE_NAMES[fav.zone]}（${Math.round(fav.share * 100)}%）` : '—'],
    ];
    ctx.font = `600 15px ${D.FONT}`;
    rows.forEach(([k, v], i) => {
      const y = c.y + 162 + i * 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = D.PAL.cardMuted;
      ctx.fillText(k, c.x + 28, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = D.PAL.cardInk;
      ctx.fillText(v, c.x + c.w - 28, y);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `500 13px ${D.FONT}`;
    ctx.fillText('下次还从这一关开始', cx, c.y + 262);
    const bw = c.w - 56;
    if (!this.revived) {
      this.buttons.push({ x: c.x + 28, y: c.y + c.h - 180, w: bw, h: 46, label: '再给一次机会', ad: true, onTap: () => this.revive() });
    }
    this.buttons.push({ x: c.x + 28, y: c.y + c.h - 124, w: bw, h: 52, label: '再来这一关', primary: true, onTap: () => {
      this.endTrial();
      this.startStage(this.stage);
    } });
    this.buttons.push({ x: c.x + 28, y: c.y + c.h - 62, w: bw, h: 44, label: '回到关卡', onTap: () => this.backToStages() });
    for (const b of this.buttons) D.drawPill(ctx, b);
    ctx.restore();
  }

  private drawHint(ctx: Canvas2D): void {
    const ball = this.ballScreen();
    const k = (this.time * 0.9) % 1;
    const y0 = ball.y + 60;
    ctx.save();
    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (this.fk) {
      // 任意球：手指画一个弯，绕开人墙那一边
      const away = this.wall ? Math.sign(this.wall.keeperX) || 1 : 1;
      ctx.arc(ball.x + away * (70 * 4 * k * (1 - k) - k * 20), y0 - k * 200, 12, 0, Math.PI * 2);
    } else ctx.arc(ball.x + k * 30, y0 - k * 140, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = D.PAL.hud;
    ctx.font = `700 15px ${D.FONT}`;
    ctx.textAlign = 'center';
    if (this.fk) {
      ctx.fillText('画个大弯，绕过人墙', this.view.width / 2, ball.y + 98);
      ctx.fillText('或者划过头再往下勾：吊过人墙往下坠', this.view.width / 2, ball.y + 120);
    } else ctx.fillText('往想踢的位置划；画个弯就是弧线球', this.view.width / 2, ball.y + 104);
    ctx.restore();
  }

  /** 右上角的「小本本」：门将记下你往各个位置踢了几次。 */
  private drawNotebook(ctx: Canvas2D, top: number): void {
    const { width: W } = this.view;
    const w = 72;
    const h = 40;
    const x = W - w - 14;
    const y = top + 80;
    const counts = [0, 0, 0, 0, 0, 0];
    for (const z of this.history.slice(-20)) counts[z]!++;
    const max = Math.max(1, ...counts);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRectPath(ctx, x - 4, y - 16, w + 8, h + 22, 8);
    ctx.fill();
    ctx.fillStyle = D.PAL.hudMuted;
    ctx.font = `700 11px ${D.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('门将的小本本', x + w / 2, y - 7);
    const cw = w / 3;
    const ch = h / 2;
    for (const z of ZONES) {
      const col = z % 3;
      const row = z >= 3 ? 0 : 1; // 上面一排画在上面
      const cx = x + col * cw;
      const cy = y + 2 + row * ch;
      const k = counts[z]! / max;
      ctx.fillStyle = `rgba(255,107,91,${0.08 + k * 0.7})`;
      ctx.fillRect(cx + 1, cy + 1, cw - 2, ch - 2);
      if (counts[z]! > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = `800 11px ${D.FONT}`;
        ctx.fillText(String(counts[z]), cx + cw / 2, cy + ch / 2 + 1);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 2 + h);
    ctx.lineTo(x, y + 2);
    ctx.lineTo(x + w, y + 2);
    ctx.lineTo(x + w, y + 2 + h);
    ctx.stroke();
    ctx.restore();
  }

  private drawSoundIcon(ctx: Canvas2D, r: Rect, on: boolean): void {
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    const cx = r.x + r.w / 2 - 4;
    const cy = r.y + r.h / 2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 4);
    ctx.lineTo(cx - 3, cy - 4);
    ctx.lineTo(cx + 3, cy - 9);
    ctx.lineTo(cx + 3, cy + 9);
    ctx.lineTo(cx - 3, cy + 4);
    ctx.lineTo(cx - 7, cy + 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (on) {
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 6, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 10, -0.9, 0.9);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 7, cy - 5);
      ctx.lineTo(cx + 15, cy + 5);
      ctx.moveTo(cx + 15, cy - 5);
      ctx.lineTo(cx + 7, cy + 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawToast(ctx: Canvas2D): void {
    if (!this.toast) return;
    const { width: W } = this.view;
    const ball = this.ballScreen();
    const a = Math.min(1, (1.8 - this.toast.t) / 0.3, this.toast.t / 0.1);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `700 15px ${D.FONT}`;
    const w = ctx.measureText(this.toast.text).width + 32;
    const y = ball.y + 40;
    roundRectPath(ctx, (W - w) / 2, y, w, 38, 19);
    ctx.fillStyle = 'rgba(10,14,35,0.82)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.toast.text, W / 2, y + 20);
    ctx.restore();
  }

  private card(ctx: Canvas2D, h: number): { x: number; y: number; w: number; h: number } {
    const { width: W, height: H } = this.view;
    const a = Math.min(1, this.phaseT / 0.25);
    ctx.fillStyle = `rgba(4,8,24,${0.62 * a})`;
    ctx.fillRect(0, 0, W, H);
    const w = Math.min(340, W - 32);
    const x = (W - w) / 2;
    const y = (H - h) / 2 + (1 - a) * 30;
    ctx.globalAlpha = a;
    roundRectPath(ctx, x, y, w, h, 24);
    ctx.fillStyle = D.PAL.card;
    ctx.fill();
    return { x, y, w, h };
  }
}

function footName(s: Shooter): string {
  return s.foot === 'both' ? '左右脚' : s.foot === 'R' ? '右脚' : '左脚';
}

export function createPenalty(host: Host): Game {
  return new Penalty(host);
}
