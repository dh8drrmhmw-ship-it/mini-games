/**
 * 构建后处理：把每款游戏的测试页做成「一个文件」版本，JS 和 CSS 直接嵌进页面。
 * - dist/<编号>/standalone.html：完整网页，一个文件就能打开。
 * - dist/<编号>/artifact.html：GitHub Pages 用不了时，临时发布成 claude.ai 测试链接用（不带 html/head/body 外壳）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { games } from '../src/games/list.ts';

for (const g of games) {
  if (!g.path) continue;
  const page = join('dist', g.path, 'index.html');
  const html = readFileSync(page, 'utf8');
  const scriptRe = /<script type="module" crossorigin src="([^"]+)"><\/script>/;
  const styleRe = /<link rel="stylesheet" crossorigin href="([^"]+)">/;
  const scriptMatch = html.match(scriptRe);
  const styleMatch = html.match(styleRe);
  if (!scriptMatch || !styleMatch) throw new Error(`standalone: ${page} 里找不到脚本或样式的引用`);
  const js = readFileSync(join(dirname(page), scriptMatch[1]!), 'utf8').replace(/<\/script/gi, '<\\/script');
  const css = readFileSync(join(dirname(page), styleMatch[1]!), 'utf8');
  const inlineScript = `<script type="module">\n${js}\n</script>`;
  const inlineStyle = `<style>\n${css}\n</style>`;
  const standalone = html
    .replace(scriptMatch[0], () => '')
    .replace(styleMatch[0], () => inlineStyle)
    .replace('</body>', () => `${inlineScript}\n</body>`);
  writeFileSync(join(dirname(page), 'standalone.html'), standalone);
  const title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '';
  const artifact = [
    title,
    '<meta name="theme-color" content="#fff5e8">',
    inlineStyle,
    inlineScript,
    '',
  ].join('\n');
  writeFileSync(join(dirname(page), 'artifact.html'), artifact);
  console.log(`standalone: ${g.id} ${(standalone.length / 1024).toFixed(0)} KB`);
}
