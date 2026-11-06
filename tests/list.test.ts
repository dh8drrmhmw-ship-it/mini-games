import { describe, expect, it } from 'vitest';
import { games } from '../src/games/list.ts';

describe('游戏名单', () => {
  it('编号不重复，并且能直接当网址用', () => {
    const ids = games.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('每款都有名字和一句话玩法', () => {
    for (const g of games) {
      expect(g.name.trim()).not.toBe('');
      expect(g.pitch.trim()).not.toBe('');
    }
  });

  it('做出原型以后必须有测试页路径，候选不能有', () => {
    for (const g of games) {
      if (g.status === '候选') expect(g.path).toBeUndefined();
      else expect(g.path).toMatch(/^[a-z0-9-]+\/$/);
    }
  });
});
