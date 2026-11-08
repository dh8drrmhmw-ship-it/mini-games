/**
 * 浏览器版音效：用 Web Audio 现场合成，不用任何素材文件（没有版权问题，包也小）。
 * iPhone 要在手指碰到屏幕以后才允许出声，所以第一次触摸时才建 AudioContext。
 */
import type { Sound, SoundName } from '../games/shared/host.ts';

type Ctx = AudioContext;

let noiseBuffer: AudioBuffer | null = null;

function noise(ctx: Ctx): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    data[i] = ((seed >>> 8) & 0xffff) / 32768 - 1;
  }
  noiseBuffer = buf;
  return buf;
}

function env(g: GainNode, t0: number, attack: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function noiseBurst(ctx: Ctx, out: AudioNode, t0: number, opts: { type: BiquadFilterType; freq: number; q?: number; attack: number; peak: number; decay: number; freqEnd?: number }): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = opts.type;
  f.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.attack + opts.decay);
  f.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  env(g, t0, opts.attack, opts.peak, opts.decay);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + opts.attack + opts.decay + 0.05);
}

function tone(ctx: Ctx, out: AudioNode, t0: number, opts: { type: OscillatorType; freq: number; freqEnd?: number; attack: number; peak: number; decay: number }): void {
  const o = ctx.createOscillator();
  o.type = opts.type;
  o.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.attack + opts.decay);
  const g = ctx.createGain();
  env(g, t0, opts.attack, opts.peak, opts.decay);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + opts.attack + opts.decay + 0.05);
}

const RECIPES: Record<SoundName, (ctx: Ctx, out: AudioNode, t: number, k: number) => void> = {
  // 裁判哨：两声短哨，带一点颤音
  whistle(ctx, out, t) {
    for (const [start, dur] of [
      [0, 0.12],
      [0.18, 0.32],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 2650;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const depth = ctx.createGain();
      depth.gain.value = 90;
      lfo.connect(depth).connect(o.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2700;
      f.Q.value = 4;
      const g = ctx.createGain();
      env(g, t + start, 0.01, 0.16, dur);
      o.connect(f).connect(g).connect(out);
      o.start(t + start);
      lfo.start(t + start);
      o.stop(t + start + dur + 0.05);
      lfo.stop(t + start + dur + 0.05);
    }
  },
  // 踢球：低沉的「嘭」加一点皮面的脆响
  // k 越大（踢得越用力）越响、越低沉
  kick(ctx, out, t, k) {
    tone(ctx, out, t, { type: 'sine', freq: 190 - 60 * k, freqEnd: 45, attack: 0.004, peak: 0.45 + 0.55 * k, decay: 0.12 + 0.1 * k });
    noiseBurst(ctx, out, t, { type: 'highpass', freq: 2200, attack: 0.002, peak: 0.2 + 0.3 * k, decay: 0.03 + 0.03 * k });
  },
  // 进网：网子「唰」一下
  net(ctx, out, t) {
    noiseBurst(ctx, out, t, { type: 'bandpass', freq: 1800, freqEnd: 700, q: 0.8, attack: 0.01, peak: 0.55, decay: 0.45 });
    tone(ctx, out, t, { type: 'sine', freq: 90, freqEnd: 50, attack: 0.005, peak: 0.4, decay: 0.15 });
  },
  // 门柱：金属「当」
  post(ctx, out, t) {
    for (const [freq, peak] of [
      [523, 0.35],
      [1318, 0.22],
      [2093, 0.15],
      [3135, 0.08],
    ] as const) {
      tone(ctx, out, t, { type: 'sine', freq, attack: 0.002, peak, decay: 0.9 });
    }
    noiseBurst(ctx, out, t, { type: 'highpass', freq: 3000, attack: 0.002, peak: 0.3, decay: 0.03 });
  },
  // 扑救：手套拍到球
  save(ctx, out, t) {
    noiseBurst(ctx, out, t, { type: 'lowpass', freq: 1200, attack: 0.003, peak: 0.8, decay: 0.09 });
    tone(ctx, out, t, { type: 'sine', freq: 130, freqEnd: 70, attack: 0.003, peak: 0.5, decay: 0.12 });
  },
  // 观众欢呼：一阵越来越大、再慢慢落下的人声
  cheer(ctx, out, t) {
    noiseBurst(ctx, out, t, { type: 'bandpass', freq: 900, q: 0.6, attack: 0.35, peak: 0.5, decay: 1.6 });
    noiseBurst(ctx, out, t + 0.05, { type: 'bandpass', freq: 2200, q: 1.2, attack: 0.3, peak: 0.22, decay: 1.3 });
    for (let i = 0; i < 6; i++) {
      tone(ctx, out, t + 0.1 + i * 0.07, { type: 'triangle', freq: 500 + ((i * 137) % 400), freqEnd: 700 + ((i * 89) % 300), attack: 0.08, peak: 0.03, decay: 0.6 });
    }
  },
  // 观众叹气：「哦——」往下走
  groan(ctx, out, t) {
    noiseBurst(ctx, out, t, { type: 'bandpass', freq: 650, freqEnd: 280, q: 1.4, attack: 0.15, peak: 0.4, decay: 1.0 });
  },
  // 助跑的脚步：轻轻的「噗」
  step(ctx, out, t, k) {
    noiseBurst(ctx, out, t, { type: 'lowpass', freq: 500, attack: 0.004, peak: 0.12 + 0.12 * k, decay: 0.07 });
  },
  click(ctx, out, t) {
    tone(ctx, out, t, { type: 'triangle', freq: 880, freqEnd: 660, attack: 0.002, peak: 0.25, decay: 0.06 });
  },
  // 升级：叮叮叮叮
  milestone(ctx, out, t) {
    [523, 659, 784, 1046].forEach((freq, i) => {
      tone(ctx, out, t + i * 0.09, { type: 'triangle', freq, attack: 0.005, peak: 0.3, decay: 0.35 });
    });
  },
};

export function createWebSound(initiallyOn: boolean, persist: (on: boolean) => void): Sound & { unlock(): void } {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let enabled = initiallyOn;
  const ensure = (): Ctx | null => {
    if (ctx) return ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  };
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on: boolean) {
      enabled = on;
      persist(on);
      try {
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = on ? 'playback' : 'auto';
      } catch {
        // 忽略
      }
    },
    unlock() {
      // 苹果手机：静音键开着时也出声（游戏里有自己的声音开关）。不支持这个接口的浏览器就算了。
      try {
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session && enabled) session.type = 'playback';
      } catch {
        // 忽略
      }
      const c = ensure();
      if (c && c.state === 'suspended') void c.resume();
    },
    play(name: SoundName, strength = 0.5) {
      if (!enabled) return;
      const c = ensure();
      if (!c || !master) return;
      if (c.state === 'suspended') void c.resume();
      try {
        RECIPES[name](c, master, c.currentTime + 0.01, Math.min(1, Math.max(0, strength)));
      } catch {
        // 个别浏览器不支持某个节点，没声音就算了
      }
    },
  };
}
