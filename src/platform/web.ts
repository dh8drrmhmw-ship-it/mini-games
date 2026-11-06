/**
 * 平台层（浏览器版）：把一款游戏放进网页里跑。
 * 负责全屏画布、清晰度、触摸、每帧刷新、存档和「广告」。
 * 测试版没有真广告：弹一个说明框，点「看完了」就算看完。微信版以后用微信的激励视频广告。
 */
import type { Game, Host, View } from '../games/shared/host.ts';

function safeArea(): { top: number; bottom: number } {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const top = parseFloat(cs.paddingTop) || 0;
  const bottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
  return { top, bottom };
}

const save = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 无痕模式等情况下存不了，不影响玩
    }
  },
};

function fakeRewardedAd(placement: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'ad-mask';
    wrap.innerHTML = `
      <div class="ad-card" role="dialog" aria-modal="true">
        <p class="ad-tag">广告位 · 测试版</p>
        <p class="ad-title">这里会播放一段广告</p>
        <p class="ad-text">正式版在微信里会播放 15 秒左右的视频广告，看完才给奖励。测试版点「看完了」就算看完。</p>
        <div class="ad-actions">
          <button type="button" class="ad-skip">不看了</button>
          <button type="button" class="ad-ok" disabled>看完了（3）</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const ok = wrap.querySelector<HTMLButtonElement>('.ad-ok')!;
    const skip = wrap.querySelector<HTMLButtonElement>('.ad-skip')!;
    let left = 3;
    const timer = window.setInterval(() => {
      left--;
      if (left <= 0) {
        window.clearInterval(timer);
        ok.disabled = false;
        ok.textContent = '看完了，领取';
      } else {
        ok.textContent = `看完了（${left}）`;
      }
    }, 1000);
    const done = (result: boolean): void => {
      window.clearInterval(timer);
      wrap.remove();
      resolve(result);
    };
    ok.addEventListener('click', () => done(true));
    skip.addEventListener('click', () => done(false));
    wrap.dataset['placement'] = placement;
  });
}

export function runInBrowser(create: (host: Host) => Game): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'game';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持画布');

  const params = new URLSearchParams(location.search);
  const levelParam = Number(params.get('level'));
  const host: Host = {
    save,
    showRewardedAd: fakeRewardedAd,
    startLevel: Number.isInteger(levelParam) && levelParam > 0 ? levelParam : undefined,
  };
  const game = create(host);
  // 给云端自动测试用：能读到游戏的状态
  (window as unknown as { __game?: Game }).__game = game;

  let dpr = 1;
  const resize = (): void => {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const sa = safeArea();
    const view: View = { width: w, height: h, safeTop: sa.top, safeBottom: sa.bottom };
    game.resize(view);
  };
  resize();
  window.addEventListener('resize', resize);

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    game.pointerDown(e.clientX - r.left, e.clientY - r.top);
  });
  // iOS：防止双击放大、长按选字
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    game.update(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.render(ctx);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
