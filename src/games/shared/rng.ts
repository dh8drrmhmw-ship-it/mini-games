/**
 * 固定种子随机数：同一个种子永远产生同一串数，所以每个人玩到的第 N 关都一样。
 *
 * 算法：xoshiro128**（Blackman 和 Vigna，2018，公有领域），用 splitmix32 把种子展开成内部状态。
 * 全是 32 位整数运算，任何手机上结果都一样。和 football-sim 仓库 src/core/rng.ts 是同一个算法。
 */

const TWO_POW_32 = 4294967296;

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** 把一个 32 位整数打散成另一个（用来从「关卡号 + 第几次尝试」算种子）。 */
export function mix32(seed: number): number {
  let z = (seed + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    let s = seed | 0;
    const next = (): number => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) | 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    if ((this.a | this.b | this.c | this.d) === 0) this.d = 1;
  }

  /** 32 位无符号整数。 */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.b, 5), 7), 9) >>> 0;
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = rotl(this.d, 11);
    return result;
  }

  /** 0 ≤ k < n 的整数，没有偏差。 */
  int(n: number): number {
    if (!(n >= 1 && n <= TWO_POW_32) || n !== Math.trunc(n)) {
      throw new RangeError(`Rng.int: n 必须是 1 到 2^32 之间的整数，收到 ${n}`);
    }
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % n;
  }

  /** 以 num/den 的概率返回 true（用整数，避免小数）。 */
  chance(num: number, den: number): boolean {
    return this.int(den) < num;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: 数组是空的');
    return items[this.int(items.length)]!;
  }

  /** 原地洗牌（Fisher–Yates）。 */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }
}
