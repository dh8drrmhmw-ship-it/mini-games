/**
 * 提前生成奶茶调配的关卡，存进 src/games/milk-tea/levels.json。
 * 生成一关要零点几秒，放在手机上现算太慢，所以提前算好。改了生成规则后运行：npm run levels
 */
import { writeFileSync } from 'node:fs';
import { generateLevel } from '../src/games/milk-tea/levels.ts';

export const LEVEL_COUNT = 100;

const out: unknown[] = [];
const t0 = performance.now();
for (let n = 1; n <= LEVEL_COUNT; n++) {
  const g = generateLevel(n);
  out.push({ ...g.level, shuffles: g.shuffles });
}
const json = `[\n${out.map((x) => JSON.stringify(x)).join(',\n')}\n]\n`;
writeFileSync('src/games/milk-tea/levels.json', json);
console.log(`生成了 ${LEVEL_COUNT} 关，用时 ${((performance.now() - t0) / 1000).toFixed(1)} 秒，${(json.length / 1024).toFixed(1)} KB`);
