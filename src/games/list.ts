// 所有小游戏的名单。首页按这个顺序显示。
// 状态：候选（还只是点子）→ 原型（能玩的测试链接）→ 打磨中 → 已上线（微信里能搜到）。

export type GameStatus = '候选' | '原型' | '打磨中' | '已上线';

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
    id: 'milk-tea',
    name: '奶茶调配',
    pitch: '倒水的玩法，但要按顾客的菜单，把配料一层一层倒成一杯分层奶茶。',
    status: '候选',
  },
  {
    id: 'penalty',
    name: '点球大战：会记仇的门将',
    pitch: '手指一划射门。门将会记住你的习惯，你老踢左下角，他就提前扑左下角。',
    status: '候选',
  },
  {
    id: 'daily-klotski',
    name: '每日华容道',
    pitch: '经典华容道，每天全国同一个棋盘，比谁步数少，战绩卡片发到群里比。',
    status: '候选',
  },
];
