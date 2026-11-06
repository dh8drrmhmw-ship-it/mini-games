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
| `npm run build` | 构建测试页到 `dist/` |

代码结构：

- `src/games/list.ts`：所有游戏的名单和进度，首页按它显示。
- `src/games/<编号>/`：每款游戏的玩法代码。不能直接用浏览器接口，要能放进微信里跑（决策记录 D-004）。
- `src/platform/`：平台层（浏览器版、微信版）：画面、触摸、存档、声音、广告。第一款游戏开始做时建。
- `src/home/`：测试页首页。
- `tests/`：自动测试。
