// 配料：每种有名字、颜色和花纹。花纹让颜色相近的配料也分得清（也照顾色弱的玩家）。

export type Pattern = 'plain' | 'pearls' | 'cubes' | 'seeds' | 'swirl';

export interface Ingredient {
  name: string;
  /** 主色 */
  color: string;
  /** 花纹的颜色 */
  accent: string;
  pattern: Pattern;
}

export const INGREDIENTS: readonly Ingredient[] = [
  { name: '珍珠', color: '#5a3523', accent: '#2a160c', pattern: 'pearls' },
  { name: '牛奶', color: '#ffffff', accent: '#efe4d2', pattern: 'plain' },
  { name: '红茶', color: '#b9532a', accent: '#93401f', pattern: 'plain' },
  { name: '抹茶', color: '#7cae46', accent: '#5f8d31', pattern: 'swirl' },
  { name: '芒果', color: '#f7b52b', accent: '#e39a12', pattern: 'cubes' },
  { name: '草莓', color: '#ee6b85', accent: '#fff0d6', pattern: 'seeds' },
  { name: '芋泥', color: '#a27bcb', accent: '#8562ad', pattern: 'swirl' },
  { name: '椰果', color: '#d3ebb5', accent: '#8dbb5c', pattern: 'cubes' },
];
