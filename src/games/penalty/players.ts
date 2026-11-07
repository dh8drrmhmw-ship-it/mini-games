/**
 * 罚球的球员：力量、精准、弧线三项，1～5 星，有强有弱。
 * - 力量：划得最快时，球能有多快（门将越来不及扑）。
 * - 精准：同样的力量，偏得少。
 * - 弧线：画圈时球最多能拐多大的弯。
 * 前三个一开始就能用；后两个累计进球够了才解锁，没解锁可以看广告试用一局。
 */

export interface Shooter {
  id: string;
  name: string;
  /** 一句话特点 */
  motto: string;
  power: number;
  accuracy: number;
  curve: number;
  /** 累计进几个球解锁（0 = 一开始就有） */
  unlockAt: number;
  jersey: string;
  jerseyDark: string;
  skin: string;
  hair: string;
}

export const SHOOTERS: readonly Shooter[] = [
  {
    id: 'quick',
    name: '小快灵',
    motto: '什么都会一点',
    power: 3,
    accuracy: 4,
    curve: 3,
    unlockAt: 0,
    jersey: '#e8463c',
    jerseyDark: '#b3302a',
    skin: '#f3c9a2',
    hair: '#2a1d14',
  },
  {
    id: 'cannon',
    name: '大炮',
    motto: '一脚下去，门将连人带球进网',
    power: 5,
    accuracy: 2,
    curve: 2,
    unlockAt: 0,
    jersey: '#2f6fd1',
    jerseyDark: '#1f4f9e',
    skin: '#d9a77c',
    hair: '#141414',
  },
  {
    id: 'banana',
    name: '香蕉脚',
    motto: '画个圈，球就拐弯',
    power: 2,
    accuracy: 3,
    curve: 5,
    unlockAt: 0,
    jersey: '#f2c230',
    jerseyDark: '#c69712',
    skin: '#f0c19b',
    hair: '#7a4a24',
  },
  {
    id: 'cold',
    name: '冷面杀手',
    motto: '从来不踢飞',
    power: 3,
    accuracy: 5,
    curve: 2,
    unlockAt: 30,
    jersey: '#3a3f4b',
    jerseyDark: '#22262e',
    skin: '#c98d63',
    hair: '#0d0d0d',
  },
  {
    id: 'ace',
    name: '全能王',
    motto: '力量、准头、弧线样样都行',
    power: 4,
    accuracy: 4,
    curve: 4,
    unlockAt: 80,
    jersey: '#8e44c9',
    jerseyDark: '#6a2f9c',
    skin: '#e8b78f',
    hair: '#b8b8b8',
  },
];

export function isUnlocked(s: Shooter, totalGoals: number): boolean {
  return totalGoals >= s.unlockAt;
}
