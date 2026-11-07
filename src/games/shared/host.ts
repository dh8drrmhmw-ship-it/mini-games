/**
 * 游戏和平台之间的约定。玩法代码只认识这些接口，不认识浏览器或微信：
 * 浏览器版（src/platform/web.ts）和以后的微信版各自实现一份，同一款游戏两边都能跑（决策记录 D-004）。
 */

/** 屏幕大小，单位是「逻辑像素」（和网页的 CSS 像素一样，与屏幕清晰度无关）。 */
export interface View {
  width: number;
  height: number;
  /** 顶部被刘海、状态栏挡住的高度。 */
  safeTop: number;
  /** 底部被横条挡住的高度。 */
  safeBottom: number;
}

/** 本地存档（只存小东西，比如玩到第几关）。 */
export interface SaveStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** 音效名字。声音由平台层现场合成，不用素材文件。 */
export type SoundName =
  | 'whistle'
  | 'kick'
  | 'net'
  | 'post'
  | 'save'
  | 'cheer'
  | 'groan'
  | 'click'
  | 'milestone';

export interface Sound {
  /** strength：0～1，比如踢得越用力声音越响（不传就是普通大小） */
  play(name: SoundName, strength?: number): void;
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
}

export interface Host {
  save: SaveStore;
  sound: Sound;
  /** 震一下（不支持的手机什么都不做）。 */
  vibrate(kind: 'light' | 'heavy'): void;
  /** 播放激励视频广告。看完返回 true，中途关掉返回 false。placement：哪个按钮触发的，方便以后看数据。 */
  showRewardedAd(placement: string): Promise<boolean>;
  /** 测试用：直接从第几关开始。 */
  startLevel?: number;
}

/** 画布：浏览器的 CanvasRenderingContext2D 和微信小游戏的画布都满足这些。 */
export type Canvas2D = CanvasRenderingContext2D;

export interface Game {
  resize(view: View): void;
  /** dt：距离上一帧过了几秒。 */
  update(dt: number): void;
  render(ctx: Canvas2D): void;
  /** t：事件发生的时间（秒，只用来算两次事件之间隔了多久） */
  pointerDown(x: number, y: number, t?: number): void;
  /** 手指按住移动、松开（要划手指的游戏才用）。 */
  pointerMove?(x: number, y: number, t?: number): void;
  pointerUp?(x: number, y: number, t?: number): void;
}
