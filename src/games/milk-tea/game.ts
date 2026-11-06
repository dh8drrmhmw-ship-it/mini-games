/**
 * 奶茶调配：游戏画面和操作。规则在 rules.ts，关卡在 levels.json（提前生成好），画图在 draw.ts。
 */
import type { Canvas2D, Game, Host, View } from '../shared/host.ts';
import * as D from './draw.ts';
import { INGREDIENTS } from './ingredients.ts';
import levelData from './levels.json';
import {
  BOTTLE_CAP,
  cloneState,
  initialState,
  isWon,
  nextNeed,
  pour,
  pourAmount,
  type Level,
  type Move,
  type State,
  type Target,
} from './rules.ts';
import { solve } from './solver.ts';

interface LevelJson {
  number: number;
  orders: number[][];
  bottles: number[][];
  slots: number;
}

export const LEVELS: readonly Level[] = (levelData as LevelJson[]).map((l) => ({
  number: l.number,
  orders: l.orders,
  bottles: l.bottles,
  slots: l.slots,
}));

const SAVE_KEY = 'milk-tea.level';
const FREE_UNDOS = 5;
const UNDO_REFILL = 5;
const MAX_EXTRA_BOTTLES = 1;
/** 配料飞过去的时间（秒） */
const FLY = 0.3;
/** 顾客拿到奶茶开心的时间 */
const HAPPY = 0.75;
const LEAVE = 0.35;
const ARRIVE = 0.35;
const TOAST = 1.8;

const HINTS: Record<number, string> = {
  1: '点一下瓶子，再点一下上面的杯子，配料就倒进去了。杯子要从下往上，按顾客要的顺序装。',
  2: '瓶子之间也能倒：只能倒进空瓶，或者倒在同样的配料上面。',
  3: '先要用的配料常常压在瓶底，先把上面的挪到别的瓶子里。',
  4: '右边是排队的下一位顾客，可以提前准备。',
  10: '这一关柜台前有两位顾客，先做哪一杯都行。',
};

type Phase = 'play' | 'won' | 'dead' | 'done';

interface Flight {
  ing: number;
  count: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  target: Target;
}

interface Leaving {
  order: number;
  /** 从 -FLY 开始计时：配料到了以后（t ≥ 0）顾客开心，HAPPY 秒后离开 */
  t: number;
}

interface SlotLayout {
  cx: number;
  headY: number;
  r: number;
  cup: D.Rect;
  hit: D.Rect;
}

interface Btn extends D.ButtonLook {
  onTap: () => void;
}

class MilkTea implements Game {
  private view: View = { width: 375, height: 667, safeTop: 0, safeBottom: 0 };
  private levelNo = 1;
  private level: Level = LEVELS[0]!;
  private state: State = initialState(LEVELS[0]!);
  private history: State[] = [];
  private undos = FREE_UNDOS;
  private extraBottles = 0;
  private selected: number | null = null;
  private flights: Flight[] = [];
  private leaving: (Leaving | null)[] = [];
  private arriving: number[] = [];
  private phase: Phase = 'play';
  private phaseT = 0;
  private toast: { text: string; t: number } | null = null;
  private time = 0;
  private shakes = new Map<string, number>();
  private needDeadCheck = false;
  private adBusy = false;

  // 布局
  private slotsLayout: SlotLayout[] = [];
  private bottleRects: D.Rect[] = [];
  private counterBottom = 0;
  private queueArea: D.Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hintRect: D.Rect | null = null;
  private hintLines: string[] = [];
  private buttons: Btn[] = [];
  private overlayButtons: Btn[] = [];
  private measure: Canvas2D | null = null;

  private readonly host: Host;

  constructor(host: Host) {
    this.host = host;
    const saved = Number(host.save.get(SAVE_KEY) ?? '1');
    const start = host.startLevel ?? (Number.isFinite(saved) ? saved : 1);
    this.loadLevel(Math.min(Math.max(1, Math.trunc(start)), LEVELS.length));
  }

  // ---------- 关卡 ----------

  private loadLevel(n: number): void {
    this.levelNo = n;
    this.level = LEVELS[n - 1]!;
    this.undos = FREE_UNDOS;
    this.extraBottles = 0;
    this.restart();
  }

  private restart(): void {
    this.state = initialState(this.level);
    for (let i = 0; i < this.extraBottles; i++) this.state.bottles.push([]);
    this.history = [];
    this.selected = null;
    this.flights = [];
    this.leaving = this.state.slots.map(() => null);
    this.arriving = this.state.slots.map(() => 0);
    this.phase = 'play';
    this.needDeadCheck = false;
    this.layout();
  }

  // ---------- 布局 ----------

  resize(view: View): void {
    this.view = view;
    this.layout();
  }

  private layout(): void {
    const { width: W, height: H, safeTop, safeBottom } = this.view;
    const top = safeTop + 6;
    const awningBottom = top + 44 + 16;
    const counterH = Math.max(200, Math.min(290, H * 0.34));
    const counterTop = awningBottom + 4;
    this.counterBottom = counterTop + counterH;

    // 顾客和杯子
    const S = this.level.slots;
    const queueW = S === 1 ? W * 0.3 : W * 0.22;
    const regionW = W - queueW - 12;
    const r = Math.max(20, Math.min(30, counterH * 0.11));
    const headY = counterTop + r + 8;
    const cupTop = headY + r + 16;
    const cupBottom = this.counterBottom - 18;
    const ch = cupBottom - cupTop;
    const cw = Math.min(ch * 0.7, (regionW / S) * 0.7, 112);
    this.slotsLayout = [];
    for (let i = 0; i < S; i++) {
      const cx = 12 + (regionW * (i + 0.5)) / S;
      const cup = { x: cx - cw / 2, y: cupTop, w: cw, h: ch };
      this.slotsLayout.push({ cx, headY, r, cup, hit: { x: cx - cw / 2 - 10, y: headY - r, w: cw + 20, h: cupBottom - headY + r } });
    }
    this.queueArea = { x: W - queueW - 4, y: counterTop + 6, w: queueW, h: counterH - 30 };

    // 底部按钮
    const btnH = 50;
    const btnY = H - safeBottom - btnH - 14;
    const btnW = Math.min(170, (W - 48) / 2);
    this.buttons = [
      {
        rect: { x: W / 2 - btnW - 8, y: btnY, w: btnW, h: btnH },
        label: this.undos > 0 ? '撤回' : '撤回 +5',
        ad: this.undos === 0,
        badge: this.undos > 0 ? String(this.undos) : undefined,
        enabled: true,
        onTap: () => this.undo(),
      },
      {
        rect: { x: W / 2 + 8, y: btnY, w: btnW, h: btnH },
        label: '加空瓶',
        ad: true,
        enabled: this.extraBottles < MAX_EXTRA_BOTTLES,
        onTap: () => this.addBottle(),
      },
      {
        rect: { x: W - 84, y: top + 5, w: 72, h: 34 },
        label: '重来',
        enabled: true,
        onTap: () => this.restart(),
      },
    ];

    // 提示
    const hint = HINTS[this.levelNo];
    let bottlesTop = this.counterBottom + 16;
    this.hintRect = null;
    this.hintLines = [];
    if (hint && this.measure) {
      this.measure.font = `500 15px ${D.FONT}`;
      this.hintLines = D.wrapText(this.measure, hint, W - 64);
      const h = this.hintLines.length * 22 + 20;
      this.hintRect = { x: 16, y: bottlesTop, w: W - 32, h };
      bottlesTop += h + 14;
    }

    // 瓶子
    const B = this.state.bottles.length;
    const perRow = B <= 4 ? B : Math.ceil(B / 2);
    const rows = Math.ceil(B / perRow);
    const areaH = btnY - 16 - bottlesTop;
    const bw0 = Math.min(64, (W - 24) / perRow - 16);
    const rowH = areaH / rows;
    const bh = Math.max(80, Math.min(rowH - 34, bw0 * 2.7));
    const bw = Math.min(bw0, bh / 2.1);
    this.bottleRects = [];
    for (let row = 0; row < rows; row++) {
      const n = Math.min(perRow, B - row * perRow);
      const gap = Math.min(26, (W - 24 - n * bw) / Math.max(1, n));
      const total = n * bw + (n - 1) * gap;
      const y = bottlesTop + row * rowH + (rowH - bh) / 2 + 8;
      for (let k = 0; k < n; k++) this.bottleRects.push({ x: (W - total) / 2 + k * (bw + gap), y, w: bw, h: bh });
    }
  }

  // ---------- 操作 ----------

  pointerDown(x: number, y: number): void {
    if (this.adBusy) return;
    if (this.phase !== 'play') {
      for (const b of this.overlayButtons) if (b.enabled && D.inRect(b.rect, x, y, 4)) return b.onTap();
      return;
    }
    for (const b of this.buttons) {
      if (D.inRect(b.rect, x, y, 4)) {
        if (b.enabled) b.onTap();
        else if (b.label === '加空瓶') this.say('每关最多加一个空瓶');
        return;
      }
    }
    if (this.flights.length > 0) return;
    const bottle = this.bottleAt(x, y);
    if (bottle !== null) return this.tapBottle(bottle);
    for (let i = 0; i < this.slotsLayout.length; i++) {
      if (D.inRect(this.slotsLayout[i]!.hit, x, y)) return this.tapSlot(i);
    }
    this.selected = null;
  }

  private bottleAt(x: number, y: number): number | null {
    for (let i = 0; i < this.bottleRects.length; i++) {
      const r = this.bottleRects[i]!;
      const lift = this.selected === i ? 16 : 0;
      if (D.inRect({ x: r.x, y: r.y - lift, w: r.w, h: r.h + lift }, x, y, 10)) return i;
    }
    return null;
  }

  private tapBottle(i: number): void {
    const units = this.state.bottles[i]!;
    if (this.selected === null) {
      if (units.length === 0) return this.say('这是空瓶');
      this.selected = i;
      return;
    }
    if (this.selected === i) {
      this.selected = null;
      return;
    }
    const move: Move = { from: this.selected, to: { kind: 'bottle', index: i } };
    if (pourAmount(this.level, this.state, move) > 0) return this.doPour(move);
    this.shake(`b${i}`);
    this.say(units.length >= BOTTLE_CAP ? '那个瓶子满了' : '只能倒进空瓶，或者倒在同样的配料上面');
    this.selected = units.length > 0 ? i : null;
  }

  private tapSlot(i: number): void {
    if (this.selected === null) return this.say('先点一个瓶子，再点杯子');
    if (this.leaving[i]) return this.say('下一位顾客马上就来');
    const slot = this.state.slots[i];
    if (!slot) return this.say('这里没有顾客了');
    const move: Move = { from: this.selected, to: { kind: 'slot', index: i } };
    if (pourAmount(this.level, this.state, move) > 0) return this.doPour(move);
    const need = nextNeed(this.level.orders[slot.order]!, slot.filled);
    this.shake(`s${i}`);
    if (need) this.say(`这位顾客现在要「${INGREDIENTS[need.ing]!.name}」`);
  }

  private doPour(move: Move): void {
    const before = this.state;
    const r = pour(this.level, before, move);
    if (!r) return;
    const fromRect = this.bottleRects[move.from]!;
    const from = { x: fromRect.x + fromRect.w / 2, y: fromRect.y - 24 };
    let to: { x: number; y: number };
    if (move.to.kind === 'bottle') {
      const tr = this.bottleRects[move.to.index]!;
      to = { x: tr.x + tr.w / 2, y: tr.y - 6 };
    } else {
      const sl = this.slotsLayout[move.to.index]!;
      to = { x: sl.cx, y: sl.cup.y - 6 };
    }
    this.history.push(cloneState(before));
    this.state = r.state;
    this.flights.push({ ing: r.ing, count: r.amount, from, to, t: 0, target: move.to });
    if (r.served >= 0) {
      this.leaving[r.served] = { order: r.servedOrder, t: -FLY };
    }
    this.selected = null;
    this.needDeadCheck = true;
  }

  private undo(): void {
    if (this.undos === 0) {
      void this.watchAd('undo', () => {
        this.undos += UNDO_REFILL;
        this.say(`撤回次数 +${UNDO_REFILL}`);
      });
      return;
    }
    const prev = this.history.pop();
    if (!prev) return this.say('已经退回到开头了');
    this.undos--;
    this.state = prev;
    this.flights = [];
    this.leaving = this.state.slots.map(() => null);
    this.arriving = this.state.slots.map(() => ARRIVE);
    this.selected = null;
    this.phase = 'play';
    this.needDeadCheck = true;
    this.layout();
  }

  private addBottle(): void {
    void this.watchAd('add-bottle', () => {
      this.extraBottles++;
      this.state.bottles.push([]);
      for (const h of this.history) h.bottles.push([]);
      this.phase = 'play';
      this.needDeadCheck = true;
      this.layout();
      this.say('多了一个空瓶');
    });
  }

  private async watchAd(placement: string, reward: () => void): Promise<void> {
    this.adBusy = true;
    try {
      const ok = await this.host.showRewardedAd(placement);
      if (ok) reward();
      else this.say('广告没看完，没有奖励');
    } finally {
      this.adBusy = false;
      this.layout();
    }
  }

  private say(text: string): void {
    this.toast = { text, t: 0 };
  }

  private shake(key: string): void {
    this.shakes.set(key, 1);
  }

  private nextLevel(): void {
    if (this.levelNo >= LEVELS.length) {
      this.phase = 'done';
      return;
    }
    this.loadLevel(this.levelNo + 1);
  }

  // ---------- 每一帧 ----------

  update(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    if (this.toast && (this.toast.t += dt) > TOAST) this.toast = null;
    for (const [k, v] of this.shakes) {
      const nv = v - dt * 3;
      if (nv <= 0) this.shakes.delete(k);
      else this.shakes.set(k, nv);
    }
    for (const f of this.flights) f.t += dt;
    this.flights = this.flights.filter((f) => f.t < FLY);
    for (let i = 0; i < this.leaving.length; i++) {
      const l = this.leaving[i];
      if (l) {
        l.t += dt;
        if (l.t >= HAPPY + LEAVE) {
          this.leaving[i] = null;
          this.arriving[i] = 0;
        }
      } else if (this.arriving[i]! < ARRIVE) {
        this.arriving[i]! += dt;
      }
    }
    const animating = this.flights.length > 0 || this.leaving.some((l) => l !== null);
    if (this.phase === 'play' && !animating) {
      if (isWon(this.level, this.state)) {
        this.phase = 'won';
        this.phaseT = 0;
        this.host.save.set(SAVE_KEY, String(Math.min(LEVELS.length, this.levelNo + 1)));
      } else if (this.needDeadCheck) {
        this.needDeadCheck = false;
        if (solve(this.level, this.state, 8000).status === 'dead') {
          this.phase = 'dead';
          this.phaseT = 0;
        }
      }
    }
  }

  render(ctx: Canvas2D): void {
    if (!this.measure) {
      this.measure = ctx;
      this.layout();
    }
    const { width: W, height: H } = this.view;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, D.COLORS.bgTop);
    bg.addColorStop(1, D.COLORS.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    this.drawTopBar(ctx);
    this.drawCounter(ctx);
    this.drawHint(ctx);
    this.drawBottles(ctx);
    this.drawFlights(ctx);
    this.layoutButtonsState();
    for (const b of this.buttons) D.drawButton(ctx, b);
    this.drawToast(ctx);
    this.drawOverlay(ctx);
  }

  private layoutButtonsState(): void {
    const undo = this.buttons[0];
    if (undo) {
      undo.label = this.undos > 0 ? '撤回' : '撤回 +5';
      undo.ad = this.undos === 0;
      undo.badge = this.undos > 0 ? String(this.undos) : undefined;
    }
    const add = this.buttons[1];
    if (add) add.enabled = this.extraBottles < MAX_EXTRA_BOTTLES;
  }

  private drawTopBar(ctx: Canvas2D): void {
    const { width: W, safeTop } = this.view;
    const top = safeTop + 6;
    ctx.fillStyle = D.COLORS.ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 21px ${D.FONT}`;
    ctx.fillText(`第 ${this.levelNo} 关`, 16, top + 18);
    ctx.font = `500 13px ${D.FONT}`;
    ctx.fillStyle = D.COLORS.muted;
    ctx.fillText('奶茶调配', 16, top + 38);
    // 遮阳篷
    const y = top + 48;
    const stripe = 28;
    for (let x = 0, k = 0; x < W; x += stripe, k++) {
      ctx.fillStyle = k % 2 ? D.COLORS.awningB : D.COLORS.awningA;
      ctx.fillRect(x, y, stripe, 12);
      ctx.beginPath();
      ctx.arc(x + stripe / 2, y + 12, stripe / 2, 0, Math.PI);
      ctx.fill();
    }
  }

  private drawCounter(ctx: Canvas2D): void {
    const { width: W } = this.view;
    const pulse = (Math.sin(this.time * 5) + 1) / 2;
    for (let i = 0; i < this.slotsLayout.length; i++) {
      const sl = this.slotsLayout[i]!;
      const leaving = this.leaving[i];
      const slot = this.state.slots[i];
      let order: number;
      let filled: number;
      let mood: D.Mood = 'waiting';
      let dx = 0;
      let scale = 1;
      if (leaving) {
        order = leaving.order;
        filled = this.level.orders[order]!.length - this.hidden({ kind: 'slot', index: i });
        if (leaving.t >= 0) mood = 'happy';
        if (leaving.t > HAPPY) dx = ((leaving.t - HAPPY) / LEAVE) * W;
      } else if (slot) {
        order = slot.order;
        filled = slot.filled - this.hidden({ kind: 'slot', index: i });
        const a = this.arriving[i]!;
        if (a < ARRIVE) scale = 0.6 + 0.4 * easeOutBack(a / ARRIVE);
      } else {
        ctx.fillStyle = D.COLORS.muted;
        ctx.font = `500 14px ${D.FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('（没人了）', sl.cx, sl.cup.y + sl.cup.h / 2);
        continue;
      }
      ctx.save();
      ctx.translate(sl.cx + dx, sl.cup.y + sl.cup.h);
      ctx.scale(scale, scale);
      ctx.translate(-sl.cx, -(sl.cup.y + sl.cup.h));
      const look = (Math.imul(this.levelNo * 31 + order, 2654435761) >>> 0) % 997;
      D.drawCustomer(ctx, sl.cx, sl.headY, sl.r, look, mood);
      D.drawCup(ctx, {
        rect: sl.cup,
        recipe: this.level.orders[order]!,
        filled,
        pulse,
        labels: true,
        shake: this.shakes.get(`s${i}`) ?? 0,
      });
      if (mood === 'happy') this.bubble(ctx, sl.cx + sl.r * 1.3, sl.headY - sl.r * 0.6, '好喝！');
      ctx.restore();
    }
    // 柜台
    ctx.fillStyle = D.COLORS.counter;
    ctx.fillRect(0, this.counterBottom - 22, W, 22);
    ctx.fillStyle = D.COLORS.counterEdge;
    ctx.fillRect(0, this.counterBottom - 22, W, 4);
    // 排队
    this.drawQueue(ctx);
  }

  private drawQueue(ctx: Canvas2D): void {
    const q = this.queueArea;
    const waiting = this.level.orders.length - this.state.next;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = q.x + q.w / 2;
    if (waiting <= 0) {
      ctx.fillStyle = D.COLORS.muted;
      ctx.font = `600 13px ${D.FONT}`;
      ctx.fillText('最后一位了', cx, q.y + 20);
      ctx.restore();
      return;
    }
    ctx.fillStyle = D.COLORS.muted;
    ctx.font = `600 13px ${D.FONT}`;
    ctx.fillText('下一位要', cx, q.y + 14);
    const mw = Math.min(40, q.w * 0.45);
    const mh = mw * 1.3;
    D.drawMiniCup(ctx, this.level.orders[this.state.next]!, cx - mw / 2, q.y + 30, mw, mh);
    ctx.fillStyle = D.COLORS.ink;
    ctx.font = `700 14px ${D.FONT}`;
    ctx.fillText(`还有 ${waiting} 位排队`, cx, q.y + 30 + mh + 18);
    ctx.restore();
  }

  private bubble(ctx: Canvas2D, x: number, y: number, text: string): void {
    ctx.save();
    ctx.font = `800 15px ${D.FONT}`;
    const w = ctx.measureText(text).width + 18;
    D.roundRectPath(ctx, x, y - 14, w, 28, 14);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = D.COLORS.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = D.COLORS.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + 1);
    ctx.restore();
  }

  private drawHint(ctx: Canvas2D): void {
    const r = this.hintRect;
    if (!r) return;
    ctx.save();
    D.roundRectPath(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = 'rgba(255,250,243,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(224,102,63,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = D.COLORS.ink;
    ctx.font = `500 15px ${D.FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    this.hintLines.forEach((line, i) => ctx.fillText(line, r.x + 16, r.y + 21 + i * 22));
    ctx.restore();
  }

  private hidden(target: Target): number {
    let n = 0;
    for (const f of this.flights) if (f.target.kind === target.kind && f.target.index === target.index) n += f.count;
    return n;
  }

  private drawBottles(ctx: Canvas2D): void {
    for (let i = 0; i < this.bottleRects.length; i++) {
      const r = this.bottleRects[i]!;
      const lift = this.selected === i ? 16 : 0;
      D.drawBottle(ctx, {
        rect: { x: r.x, y: r.y - lift, w: r.w, h: r.h },
        units: this.state.bottles[i]!,
        hiddenTop: this.hidden({ kind: 'bottle', index: i }),
        capacity: BOTTLE_CAP,
        selected: this.selected === i,
        shake: this.shakes.get(`b${i}`) ?? 0,
      });
    }
  }

  private drawFlights(ctx: Canvas2D): void {
    for (const f of this.flights) {
      const k = Math.min(1, f.t / FLY);
      const e = k * k * (3 - 2 * k);
      const cx = (f.from.x + f.to.x) / 2;
      const cy = Math.min(f.from.y, f.to.y) - 70;
      const x = (1 - e) * (1 - e) * f.from.x + 2 * (1 - e) * e * cx + e * e * f.to.x;
      const y = (1 - e) * (1 - e) * f.from.y + 2 * (1 - e) * e * cy + e * e * f.to.y;
      const ing = INGREDIENTS[f.ing]!;
      const rad = 9 + f.count * 3;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.clip();
      D.fillIngredient(ctx, ing, x - rad, y - rad, rad * 2, rad * 2);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawToast(ctx: Canvas2D): void {
    if (!this.toast) return;
    const { width: W } = this.view;
    const btn = this.buttons[0]!.rect;
    const a = Math.min(1, (TOAST - this.toast.t) / 0.3, this.toast.t / 0.12);
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `600 15px ${D.FONT}`;
    const w = Math.min(W - 32, ctx.measureText(this.toast.text).width + 32);
    const y = btn.y - 52;
    D.roundRectPath(ctx, (W - w) / 2, y, w, 38, 19);
    ctx.fillStyle = 'rgba(59,42,30,0.88)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.toast.text, W / 2, y + 20);
    ctx.restore();
  }

  private drawOverlay(ctx: Canvas2D): void {
    this.overlayButtons = [];
    if (this.phase === 'play') return;
    const { width: W, height: H } = this.view;
    const fade = Math.min(1, this.phaseT / 0.25);
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(45,25,12,0.5)';
    ctx.fillRect(0, 0, W, H);
    if (this.phase === 'won') this.drawConfetti(ctx);
    const cw = Math.min(330, W - 40);
    const ch = this.phase === 'dead' ? 270 : 230;
    const x = (W - cw) / 2;
    const y = (H - ch) / 2 - 20 + (1 - easeOutBack(fade)) * 30;
    D.roundRectPath(ctx, x, y, cw, ch, 22);
    ctx.fillStyle = D.COLORS.card;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let title: string;
    let sub: string;
    if (this.phase === 'won') {
      title = `第 ${this.levelNo} 关完成！`;
      sub = `${this.level.orders.length} 位顾客都喝到了想要的奶茶`;
      this.overlayButtons.push({
        rect: { x: x + 30, y: y + ch - 76, w: cw - 60, h: 52 },
        label: '下一关',
        primary: true,
        enabled: true,
        onTap: () => this.nextLevel(),
      });
    } else if (this.phase === 'dead') {
      title = '这局走不通了';
      sub = '撤回几步，或者加一个空瓶再试试';
      const bw = (cw - 60 - 12) / 2;
      this.overlayButtons.push(
        {
          rect: { x: x + 30, y: y + ch - 136, w: bw, h: 48 },
          label: this.undos > 0 ? '撤回' : '撤回 +5',
          ad: this.undos === 0,
          enabled: true,
          onTap: () => this.undo(),
        },
        {
          rect: { x: x + 30 + bw + 12, y: y + ch - 136, w: bw, h: 48 },
          label: '加空瓶',
          ad: true,
          enabled: this.extraBottles < MAX_EXTRA_BOTTLES,
          onTap: () => this.addBottle(),
        },
        {
          rect: { x: x + 30, y: y + ch - 76, w: cw - 60, h: 52 },
          label: '重来',
          primary: true,
          enabled: true,
          onTap: () => this.restart(),
        },
      );
    } else {
      title = `${LEVELS.length} 关全部完成！`;
      sub = '更多关卡正在做';
      this.overlayButtons.push({
        rect: { x: x + 30, y: y + ch - 76, w: cw - 60, h: 52 },
        label: '从第 1 关再玩一遍',
        primary: true,
        enabled: true,
        onTap: () => this.loadLevel(1),
      });
    }
    ctx.fillStyle = D.COLORS.ink;
    ctx.font = `800 24px ${D.FONT}`;
    ctx.fillText(title, W / 2, y + 48);
    ctx.fillStyle = D.COLORS.muted;
    ctx.font = `500 15px ${D.FONT}`;
    const lines = D.wrapText(ctx, sub, cw - 48);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 86 + i * 22));
    for (const b of this.overlayButtons) D.drawButton(ctx, b);
    ctx.restore();
  }

  private drawConfetti(ctx: Canvas2D): void {
    const { width: W, height: H } = this.view;
    const colors = INGREDIENTS.map((i) => i.color);
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97) % 100) / 100;
      const speed = 120 + ((i * 53) % 90);
      const y = ((this.phaseT * speed + ((i * 131) % H)) % (H + 40)) - 20;
      const x = sx * W + Math.sin(this.phaseT * 2 + i) * 14;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.phaseT * 3 + i);
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }
  }
}

function easeOutBack(t: number): number {
  const k = Math.min(1, Math.max(0, t)) - 1;
  return 1 + 2.2 * k * k * k + 1.2 * k * k;
}

export function createMilkTea(host: Host): Game {
  return new MilkTea(host);
}
