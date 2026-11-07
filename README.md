# mini-games

微信小游戏工坊：一个人加 Claude，一款一款地做免费小游戏。

- 测试页：https://dh8drrmhmw-ship-it.github.io/mini-games/
- 进度：`docs/进度.md`；决定：`docs/决策记录.md`；点子：`docs/点子.md`；上线要做的事：`docs/上线流程.md`
- 开发规则：`CLAUDE.md`

## 开发

需要 Node 22 或更新版本。

| 命令 | 作用 |
|---|---|
| `npm ci` | 安装依赖 |
| `npm run check` | 类型检查 + 代码检查 + 自动测试（提交前必须通过） |
| `npm run dev` | 本地打开测试页 |
| `npm run build` | 构建测试页到 `dist/`（每款游戏另有单文件版 `standalone.html` 和 `artifact.html`） |
| `npm run levels` | 重新生成奶茶调配的 100 关（改了生成规则后运行，约 15 秒） |

代码结构：

- `src/games/list.ts`：所有游戏的名单和进度，首页按它显示。
- `src/games/shared/`：各款游戏共用：游戏和平台之间的约定（`host.ts`）、固定种子随机数（`rng.ts`）、画图小工具（`canvas.ts`）。
- `src/games/<编号>/`：每款游戏的玩法代码。不能直接用浏览器接口，要能放进微信里跑（决策记录 D-004）。
  - `milk-tea/`：奶茶调配。`rules.ts` 规则、`solver.ts` 电脑解关、`levels.ts` 关卡生成、`levels.json` 生成好的关卡、`draw.ts` 画图、`game.ts` 画面和操作。
  - `penalty/`：点球大战。`world.ts` 球门、镜头和「划一下 → 射门」、`keeper.ts` 门将（小本本、猜你下一脚、扑救、台词）、`draw.ts` 画图、`game.ts` 画面和操作。
- `src/platform/`：平台层。`web.ts` 浏览器版（全屏画布、触摸和划动、存档、震动、测试版广告）；`web-sound.ts` 合成音效；`entries/` 每款游戏的网页入口。微信版以后加。
- `<编号>/index.html`：每款游戏的测试页。
- `src/home/`：测试页首页。
- `scripts/`：提前生成关卡、构建后做单文件版、点球大战的平衡模拟（`penalty-balance.ts`）。
- `tests/`：自动测试。
