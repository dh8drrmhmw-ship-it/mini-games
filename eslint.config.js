// 代码检查规则。最重要的是「游戏玩法」一段：玩法代码要同时能在浏览器和微信里跑（决策记录 D-004），
// 所以不能直接碰浏览器的接口，画面、触摸、存档、广告一律通过平台层。
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// 每款游戏的玩法代码。平台层（浏览器版、微信版）放在 src/platform/，不受这条限制。
const GAME_FILES = ['src/games/**/*.ts'];

const browserOnly = [
  'window', 'document', 'navigator', 'location', 'history', 'self', 'globalThis',
  'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'alert', 'confirm', 'prompt', 'Image', 'Audio', 'HTMLCanvasElement', 'process', 'require',
].map((name) => ({ name, message: `玩法代码要能在微信里跑，不能直接用 ${name}，请通过平台层（D-004）。` }));

export default defineConfig([
  globalIgnores(['dist/', 'dist-wx/', 'node_modules/', 'coverage/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: GAME_FILES,
    rules: {
      'no-restricted-globals': ['error', ...browserOnly],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: '^(?!\\.{1,2}/)', message: '玩法代码不引用外部包（包要小，微信首包有大小限制）。' },
            { regex: '(^|/)(home|platform)(/|$)', message: '玩法代码不能引用页面或平台层，反过来由平台层调用玩法。' },
          ],
        },
      ],
    },
  },
]);
