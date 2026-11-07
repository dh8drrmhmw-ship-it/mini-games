// 所有小游戏的名单。首页按这个顺序显示。
// 状态：候选（还只是点子）→ 原型（能玩的测试链接）→ 打磨中 → 已上线（微信里能搜到）；搁置：试玩后先放下了。

export type GameStatus = '候选' | '原型' | '打磨中' | '已上线' | '搁置';

export interface GameEntry {
  /** 文件夹名和网址用，只能是小写字母、数字和连字符。 */
  id: string;
  /** 暂定名，上线前再定。 */
  name: string;
  /** 一句话玩法。 */
  pitch: string;
  status: GameStatus;
  /** 有原型以后填：测试页相对首页的路径。 */
  path?: string;
}

export const games: readonly GameEntry[] = [
  {
    id: 'penalty',
    name: '点球大战：会记仇的门将',
    pitch: '手指一划射门。门将会记住你的习惯，你老踢左下角，他就提前扑左下角。',
    status: '原型',
    path: 'penalty/',
  },
  {
    id: 'milk-tea',
    name: '奶茶调配',
    pitch: '倒水的玩法，按顾客的菜单把配料一层一层倒成分层奶茶。试玩觉得无聊，先放下。',
    status: '搁置',
    path: 'milk-tea/',
  },
  {
    id: 'daily-klotski',
    name: '每日华容道',
    pitch: '经典华容道，每天全国同一个棋盘，比谁步数少，战绩卡片发到群里比。',
    status: '候选',
  },
];
