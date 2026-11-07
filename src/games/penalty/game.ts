/**
 * 点球大战：会记仇的门将。一局有 3 次机会，被扑出或踢偏就少一次，看你能进多少个。
 * 规则和门将的脑子在 keeper.ts，球门和射门换算在 world.ts，画图在 draw.ts。
 */
import { inRect, roundRectPath, wrapText, type Rect } from '../shared/canvas.ts';
import type { Canvas2D, Game, Host, View } from '../shared/host.ts';
import { mix32, Rng } from '../shared/rng.ts';
import * as D from './draw.ts';
import {
  chooseGuess,
  chooseTell,
  diveProgress,
  bodyLine,
  favorite,
  isGoal,
  KEEPER_AT,
  PERSONAS,
  personaFor,
  reactionLine,
  resolveShot,
  tauntLine,
  type Outcome,
  type Persona,
  type Resolution,
} from './keeper.ts';
import {
  ballAt,
  BALL_R,
  GOAL_H,
  makeCamera,
  project,
  shotFromSwipe,
  SPOT_Z,
  ZONE_NAMES,
  ZONES,
  zoneCol,
  type Camera,
  type Shot,
  type Zone,
} from './world.ts';

const KEY = {
  best: 'penalty.best',
  history: 'penalty.history',
  runs: 'penalty.runs',
  tutorial: 'penalty.tutorial',
};
const LIVES = 3;
const HISTORY_MAX = 80;
const RESULT_TIME = 1.6;

export const RANKS = [
  { at: 0, name: '替补' },
  { at: 5, name: '主力' },
  { at: 10, name: '点球手' },
  { at: 16, name: '球星' },
  { at: 24, name: '传奇' },
  { at: 40, name: '球王' },
] as const;

export function rankFor(goals: number): string {
  let name: string = RANKS[0].name;
  for (const r of RANKS) if (goals >= r.at) name = r.name;
  return name;
}

type Phase = 'intro' | 'aim' | 'flight' | 'result' | 'over';

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

class Penalty implements Game {
  private readonly host: Host;
  private view: View = { width: 390, height: 844, safeTop: 0, safeBottom: 0 };
  private cam: Camera = makeCamera(390, 120, 520);
  private time = 0;
  private rng: Rng;

  // 存档
  private best = 0;
  private runs = 0;
  private history: Zone[] = [];
  private tutorialSeen = false;

  // 这一局
  private phase: Phase = 'intro';
  private phaseT = 0;
  private goals = 0;
  private lives = LIVES;
  private streak = 0;
  private revived = false;
  private keeperIdx = 0;
  private fooled = 0;
  private read = 0;
  private newBest = false;
  private firstIntro = true;

  // 这一脚
  private guess: Zone = 0;
  private lean: -1 | 0 | 1 = 0;
  private shot: Shot | null = null;
  private res: Resolution | null = null;
  private flightT = 0;
  private afterT = 0;
  private timeScale = 1;
  private shotsThisRun = 0;

  // 手指
  private dragging = false;
  private dragStart = 0;
  private dragPoints: { x: number; y: number }[] = [];

  // 表现
  private banner: { text: string; sub: string; color: string; t: number } | null = null;
  private bubble: { text: string; t: number; face: D.Face } | null = null;
  private toast: { text: string; t: number } | null = null;
  private shake = 0;
  private excite = 0;
  private postHit = 0;
  private ripple: D.Ripple | null = null;
  private particles: Particle[] = [];
  private trail: { x: number; y: number }[] = [];
  private keeperHead = { x: 0, y: 0 };
  private overlayButtons: Btn[] = [];
  private soundBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(host: Host) {
    this.host = host;
    this.best = Number(host.save.get(KEY.best) ?? '0') || 0;
    this.runs = Number(host.save.get(KEY.runs) ?? '0') || 0;
    this.history = (host.save.get(KEY.history) ?? '')
      .split('')
      .map(Number)
      .filter((z) => Number.isInteger(z) && z >= 0 && z <= 5) as Zone[];
    this.tutorialSeen = host.save.get(KEY.tutorial) === '1';
    this.rng = new Rng(mix32(this.runs * 7919 + 17));
    this.startRun();
  }

  // ---------- 一局 ----------

  private get persona(): Persona {
    return PERSONAS[this.keeperIdx]!;
  }

  private startRun(): void {
    this.goals = 0;
    this.lives = LIVES;
    this.streak = 0;
    this.revived = false;
    this.keeperIdx = 0;
    this.fooled = 0;
    this.read = 0;
    this.newBest = false;
    this.shotsThisRun = 0;
    this.firstIntro = true;
    this.rng = new Rng(mix32(this.runs * 7919 + 17));
    this.prepareShot();
    this.setPhase('intro');
  }

  private prepareShot(): void {
    this.shot = null;
    this.res = null;
    this.flightT = 0;
    this.afterT = 0;
    this.timeScale = 1;
    this.trail = [];
    this.guess = chooseGuess(this.persona, this.history, this.rng);
    this.lean = chooseTell(this.persona, this.guess, this.rng);
    const taunt = tauntLine(this.persona, this.guess, this.history, this.rng);
    this.bubble = taunt ? { text: taunt, t: -0.6, face: 'smug' } : null;
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  // ---------- 布局 ----------

  resize(view: View): void {
    this.view = view;
    const top = view.safeTop + 150;
    const ballMax = view.height - view.safeBottom - Math.max(150, view.height * 0.24);
    this.cam = makeCamera(view.width, top, ballMax);
  }

  private ballScreen(): { x: number; y: number; s: number } {
    return project(this.cam, 0, BALL_R, SPOT_Z);
  }

  // ---------- 操作 ----------

  pointerDown(x: number, y: number): void {
    if (inRect(this.soundBtn, x, y, 8)) {
      this.host.sound.setEnabled(!this.host.sound.enabled);
      this.host.sound.play('click');
      return;
    }
    if (this.phase === 'intro') {
      if (this.phaseT < 0.35) return;
      this.host.sound.play('whistle');
      if (!this.tutorialSeen) {
        this.tutorialSeen = true;
        this.host.save.set(KEY.tutorial, '1');
      }
      this.firstIntro = false;
      this.setPhase('aim');
      return;
    }
    if (this.phase === 'over') {
      if (this.phaseT < 0.6) return;
      for (const b of this.overlayButtons) {
        if (inRect(b, x, y, 6)) {
          this.host.sound.play('click');
          b.onTap();
          return;
        }
      }
      return;
    }
    if (this.phase !== 'aim') return;
    this.dragging = true;
    this.dragStart = this.time;
    this.dragPoints = [{ x, y }];
  }

  pointerMove(x: number, y: number): void {
    if (!this.dragging) return;
    this.dragPoints.push({ x, y });
    if (this.dragPoints.length > 64) this.dragPoints.splice(1, 1);
  }

  pointerUp(x: number, y: number): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.dragPoints.push({ x, y });
    if (this.phase !== 'aim') return;
    const shot = shotFromSwipe(this.cam, this.ballScreen(), { points: this.dragPoints, duration: this.time - this.dragStart }, this.rng);
    if (shot === 'short') return this.say('往球门的方向划长一点');
    if (shot === 'down') return this.say('往球门的方向划');
    this.kick(shot);
  }

  private kick(shot: Shot): void {
    this.shot = shot;
    this.res = resolveShot(this.persona, this.guess, this.lean, shot);
    this.flightT = 0;
    this.afterT = 0;
    this.timeScale = 1;
    this.bubble = null;
    this.shotsThisRun++;
    this.history.push(shot.zone);
    if (this.history.length > HISTORY_MAX) this.history.splice(0, this.history.length - HISTORY_MAX);
    this.host.save.set(KEY.history, this.history.join(''));
    this.host.sound.play('kick');
    this.host.vibrate('light');
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
    if (this.toast && (this.toast.t += dt) > 1.8) this.toast = null;
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

    if (this.phase === 'flight') this.updateFlight(dt);
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
    if (this.flightT >= shot.time) this.arrive(res.outcome);
  }

  private arrive(outcome: Outcome): void {
    const shot = this.shot!;
    const p = this.persona;
    this.timeScale = 1;
    this.setPhase('result');
    const diveCol = zoneCol(this.guess);
    const wrongWay = diveCol !== 1 && Math.sign(shot.tx) !== (diveCol === 0 ? -1 : 1);
    let sub = '';
    if (isGoal(outcome)) {
      this.goals++;
      this.streak++;
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
      if (this.streak === 3) sub = '帽子戏法！';
      else if (this.streak >= 5 && this.streak % 5 === 0) sub = `${this.streak} 连进！`;
      const before = rankFor(this.goals - 1);
      const after = rankFor(this.goals);
      if (after !== before) {
        sub = `升级：${after}`;
        this.host.sound.play('milestone');
        this.confetti();
      }
      if (this.goals > this.best) {
        if (!this.newBest && this.best > 0) {
          sub = sub || '新纪录！';
          this.confetti();
        }
        this.newBest = true;
        this.best = this.goals;
        this.host.save.set(KEY.best, String(this.best));
      }
      this.banner = { text: outcome === 'post-in' ? '中柱弹进！' : '进了！', sub, color: D.PAL.goal, t: 0 };
      this.bubble = { text: reactionLine(p, outcome, shot, this.history, this.rng), t: 0.25, face: 'sad' };
    } else {
      this.lives--;
      this.streak = 0;
      this.excite = 0.25;
      if (outcome === 'save') {
        this.host.sound.play('save');
        this.host.vibrate('light');
        if (this.guess === shot.zone) {
          this.read++;
          sub = `门将猜中了：${ZONE_NAMES[shot.zone]}`;
        }
      } else if (outcome === 'post-out') {
        this.host.sound.play('post');
        this.host.vibrate('heavy');
        this.postHit = 1;
        this.shake = 6;
      }
      this.host.sound.play('groan');
      const text = outcome === 'save' ? '扑出！' : outcome === 'post-out' ? '中柱！' : outcome === 'over' ? '高出！' : '偏出！';
      this.banner = { text, sub, color: D.PAL.bad, t: 0 };
      this.bubble = { text: reactionLine(p, outcome, shot, this.history, this.rng), t: 0.25, face: 'smug' };
    }
  }

  private updateResult(dt: number): void {
    this.afterT += dt;
    if (this.phaseT < RESULT_TIME) return;
    if (this.lives <= 0) {
      this.endRun();
      return;
    }
    const next = personaFor(this.goals);
    if (next !== this.keeperIdx) {
      this.keeperIdx = next;
      this.prepareShot();
      this.bubble = null;
      this.setPhase('intro');
      return;
    }
    this.prepareShot();
    this.setPhase('aim');
  }

  private endRun(): void {
    this.runs++;
    this.host.save.set(KEY.runs, String(this.runs));
    this.setPhase('over');
  }

  private revive(): void {
    void this.host.showRewardedAd('revive').then((ok) => {
      if (!ok) return this.say('广告没看完，没有奖励');
      this.revived = true;
      this.lives = 1;
      this.runs--; // 这一局还没结束
      this.host.save.set(KEY.runs, String(this.runs));
      this.prepareShot();
      this.host.sound.play('whistle');
      this.setPhase('aim');
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
    if (ball.z >= 0.35) this.drawBallAt(ctx, ball);
    ctx.restore();

    this.drawParticles(ctx);
    this.drawSwipe(ctx);
    this.drawHud(ctx);
    if (this.banner && this.banner.t < 1.5) {
      const gy = project(this.cam, 0, GOAL_H / 2, 0).y;
      D.drawBanner(ctx, W / 2, gy + 30, this.banner.text, this.banner.sub, this.banner.color, this.banner.t);
    }
    if (this.bubble && this.bubble.t > 0 && this.phase !== 'intro' && this.phase !== 'over') {
      const a = Math.min(1, this.bubble.t / 0.15, (2.4 - this.bubble.t) / 0.3);
      D.drawBubble(ctx, this.view, this.keeperHead.x, this.keeperHead.y - 4, this.bubble.text, this.persona, this.bubble.face, Math.max(0, a));
    }
    this.drawToast(ctx);
    if (this.phase === 'intro') this.drawIntro(ctx);
    if (this.phase === 'over') this.drawOver(ctx);
  }

  /** 球现在在哪（包括进网、被扑出去、飞出去以后）。 */
  private ballState(): { x: number; y: number; z: number; alpha: number; spin: number } {
    const shot = this.shot;
    if (!shot || this.phase === 'aim' || this.phase === 'intro') return { x: 0, y: BALL_R, z: SPOT_Z, alpha: 1, spin: 0 };
    const spin = this.flightT * (8 + shot.power * 14);
    if (this.phase === 'flight') return { ...ballAt(shot, this.flightT), alpha: 1, spin };
    const t = this.afterT;
    const o = this.res!.outcome;
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
    if (moving && this.res && t > p.reaction) {
      const q = diveProgress(p, t);
      const line = bodyLine(this.res.dive, q);
      // 扑完以后倒在地上
      const fall = this.phase === 'result' ? Math.min(1, Math.max(0, (this.afterT - 0.15) / 0.45)) : 0;
      const groundY = (y: number): number => y + (Math.max(0.15, y * 0.35) - y) * fall * (this.res!.dive.handY > 0.9 || zoneCol(this.guess) !== 1 ? 1 : 0);
      pose = { kind: 'line', fx: line.fx, fy: groundY(line.fy), hx: line.hx, hy: groundY(line.hy) };
      if (this.phase === 'result') face = isGoal(this.res.outcome) ? 'sad' : 'smug';
      else face = 'shock';
    } else {
      // 等你射门：左右晃；会「露馅」的门将往要扑的那边多晃一下
      const sway = Math.sin(this.time * 2.6) * 0.12;
      const tellWave = Math.max(0, Math.sin(this.time * 1.7));
      const lean = this.lean * Math.pow(tellWave, 3) * 1.0;
      pose = { kind: 'idle', x: sway + this.lean * 0.15 * tellWave, lean, bounce: Math.abs(Math.sin(this.time * 5.2)) };
      if (this.bubble && this.bubble.t > 0) face = 'smug';
    }
    this.keeperHead = D.drawKeeper(ctx, this.cam, p, pose, face);
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
    if (!this.dragging || this.dragPoints.length < 2) {
      if (this.phase === 'aim' && this.shotsThisRun < 2 && this.phaseT > 0.6) this.drawHint(ctx);
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
    // 瞄准圈：把这一划平移到球上，看看会踢到哪
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const ball = this.ballScreen();
    const goalLine = project(this.cam, 0, 0, 0).y;
    const dy = b.y - a.y;
    if (dy < -10) {
      const lift = -dy / (ball.y - goalLine);
      const tx = lift >= 1 ? ball.x + (b.x - a.x) : ball.x + (b.x - a.x) / lift;
      const ty = lift >= 1 ? ball.y + dy : goalLine - 6;
      const speed = Math.hypot(b.x - a.x, dy) / (ball.y - goalLine) / Math.max(0.03, this.time - this.dragStart);
      const power = Math.min(1, Math.max(0, (speed - 2.2) / 4.8));
      ctx.strokeStyle = power > 0.7 ? 'rgba(255,107,91,0.9)' : power > 0.35 ? 'rgba(255,207,63,0.9)' : 'rgba(140,230,150,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 9 + power * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHint(ctx: Canvas2D): void {
    const ball = this.ballScreen();
    const k = (this.time * 0.9) % 1;
    const y0 = ball.y + 60;
    const y = y0 - k * 140;
    ctx.save();
    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ball.x + k * 30, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = D.PAL.hud;
    ctx.font = `700 15px ${D.FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('往想踢的位置划一下', this.view.width / 2, ball.y + 104);
    ctx.restore();
  }

  private drawHud(ctx: Canvas2D): void {
    const { width: W, safeTop } = this.view;
    const top = safeTop + 10;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // 左上：进球数、机会
    ctx.fillStyle = D.PAL.hudMuted;
    ctx.font = `700 13px ${D.FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`进球 · ${rankFor(this.goals)}`, 16, top + 14);
    ctx.fillStyle = D.PAL.hud;
    ctx.font = `900 40px ${D.FONT}`;
    ctx.fillText(String(this.goals), 16, top + 54);
    const numW = ctx.measureText(String(this.goals)).width;
    for (let i = 0; i < LIVES; i++) {
      const cx = 16 + numW + 18 + i * 22;
      const cy = top + 40;
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
    // 右上：最高纪录、声音开关
    this.soundBtn = { x: W - 50, y: top, w: 36, h: 36 };
    this.drawSoundIcon(ctx, this.soundBtn, this.host.sound.enabled);
    ctx.textAlign = 'right';
    ctx.fillStyle = D.PAL.hudMuted;
    ctx.font = `700 13px ${D.FONT}`;
    ctx.fillText('最高', W - 62, top + 14);
    ctx.fillStyle = D.PAL.accent;
    ctx.font = `900 24px ${D.FONT}`;
    ctx.fillText(String(this.best), W - 62, top + 40);
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
    ctx.restore();
    this.drawNotebook(ctx, top);
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

  private drawIntro(ctx: Canvas2D): void {
    const p = this.persona;
    const tutorial = this.firstIntro && this.goals === 0 && !this.tutorialSeen;
    ctx.save();
    const c = this.card(ctx, tutorial ? 430 : 330);
    const cx = c.x + c.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `700 14px ${D.FONT}`;
    ctx.fillText(this.goals === 0 ? '对面的门将' : `进了 ${this.goals} 个，换门将了！`, cx, c.y + 30);
    D.drawAvatar(ctx, cx, c.y + 96, 46, p, this.goals === 0 ? 'ready' : 'smug');
    ctx.fillStyle = D.PAL.cardInk;
    ctx.font = `900 28px ${D.FONT}`;
    ctx.fillText(p.name, cx, c.y + 170);
    ctx.font = `500 15px ${D.FONT}`;
    ctx.fillStyle = D.PAL.cardMuted;
    const traitLines = wrapText(ctx, p.trait, c.w - 48);
    traitLines.forEach((l, i) => ctx.fillText(l, cx, c.y + 204 + i * 21));
    let y = c.y + 204 + traitLines.length * 21 + 14;
    ctx.fillStyle = D.PAL.cardInk;
    ctx.font = `800 17px ${D.FONT}`;
    ctx.fillText(`「${p.intro}」`, cx, y);
    y += 34;
    if (tutorial) {
      ctx.font = `500 14px ${D.FONT}`;
      ctx.fillStyle = D.PAL.cardInk;
      const lines = [
        '往想踢的位置划一下就射门。',
        '划得越快球越快，但也越容易偏。',
        '3 次机会：被扑出或踢偏就少一次。',
        '门将会记住你往哪儿踢。',
      ];
      lines.forEach((l, i) => ctx.fillText(l, cx, y + i * 22));
      y += lines.length * 22 + 8;
    }
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `700 14px ${D.FONT}`;
    const blink = 0.55 + 0.45 * Math.sin(this.time * 4);
    ctx.globalAlpha *= blink;
    ctx.fillText('点一下开始', cx, c.y + c.h - 28);
    ctx.restore();
  }

  private drawOver(ctx: Canvas2D): void {
    ctx.save();
    const c = this.card(ctx, 430);
    const cx = c.x + c.w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = D.PAL.cardMuted;
    ctx.font = `700 15px ${D.FONT}`;
    ctx.fillText('这一局', cx, c.y + 32);
    ctx.fillStyle = D.PAL.cardInk;
    ctx.font = `900 54px ${D.FONT}`;
    ctx.fillText(`进了 ${this.goals} 个`, cx, c.y + 80);
    ctx.font = `800 18px ${D.FONT}`;
    ctx.fillStyle = this.newBest ? '#c9961a' : D.PAL.cardMuted;
    ctx.fillText(this.newBest ? `新纪录！你是「${rankFor(this.goals)}」` : `你是「${rankFor(this.goals)}」 · 最高 ${this.best}`, cx, c.y + 124);

    const fav = favorite(this.history.slice(-30));
    const rows: [string, string][] = [
      ['骗过门将', `${this.fooled} 次`],
      ['被门将猜中', `${this.read} 次`],
      ['你最爱踢', fav ? `${ZONE_NAMES[fav.zone]}（${Math.round(fav.share * 100)}%）` : '—'],
      ['下一个门将', this.nextKeeperText()],
    ];
    ctx.font = `600 15px ${D.FONT}`;
    rows.forEach(([k, v], i) => {
      const y = c.y + 168 + i * 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = D.PAL.cardMuted;
      ctx.fillText(k, c.x + 28, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = D.PAL.cardInk;
      ctx.fillText(v, c.x + c.w - 28, y);
    });
    this.overlayButtons = [];
    const bw = c.w - 56;
    if (!this.revived) {
      this.overlayButtons.push({ x: c.x + 28, y: c.y + c.h - 128, w: bw, h: 48, label: '再给一次机会', ad: true, onTap: () => this.revive() });
    }
    this.overlayButtons.push({ x: c.x + 28, y: c.y + c.h - 68, w: bw, h: 50, label: '再来一局', primary: true, onTap: () => this.startRun() });
    for (const b of this.overlayButtons) D.drawPill(ctx, b);
    ctx.restore();
  }

  private nextKeeperText(): string {
    for (let i = 0; i < KEEPER_AT.length; i++) {
      if (this.goals < KEEPER_AT[i]!) return `进 ${KEEPER_AT[i]} 个见「${PERSONAS[i]!.name}」`;
    }
    return '你已经见过所有门将';
  }
}

export function createPenalty(host: Host): Game {
  return new Penalty(host);
}

