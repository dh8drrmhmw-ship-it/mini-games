/**
 * 罚球的球员和球鞋。
 *
 * 球员：力量、精准、弧线三项（1～5 星），惯用脚和逆足（另一只脚有多好用，1～5），还有一个绝招。
 * 球鞋：在球员的能力上加减。
 * 前三个球员和训练鞋一开始就有，其他的每过一关解锁一样；没解锁的可以看广告试用一关。
 */
import type { Look } from './look.ts';
import type { Kicker } from './world.ts';

export type Foot = 'L' | 'R';

export type Skill = 'quick' | 'cannon' | 'banana' | 'twofoot' | 'chip' | 'lucky' | 'cold' | 'ace';

export interface Shooter extends Look {
  id: string;
  name: string;
  motto: string;
  /** 惯用脚；both = 两只脚一样好 */
  foot: Foot | 'both';
  /** 逆足：另一只脚有多好用（1～5） */
  weakFoot: number;
  power: number;
  accuracy: number;
  curve: number;
  skill: Skill;
  skillName: string;
  skillText: string;
  /** 过了第几关解锁（0 = 一开始就有） */
  unlockStage: number;
}

const L = (jersey: string, jerseyDark: string, skin: string, hair: string, hairStyle: Look['hairStyle'], headgear: Look['headgear'] = 'none', extra: Look['extra'] = 'none'): Look => ({
  jersey,
  jerseyDark,
  skin,
  hair,
  hairStyle,
  headgear,
  extra,
});

export const SHOOTERS: readonly Shooter[] = [
  {
    id: 'quick',
    name: '小快灵',
    motto: '什么都会一点',
    ...L('#e8463c', '#b3302a', '#f3c9a2', '#2a1d14', 'spiky'),
    foot: 'R',
    weakFoot: 3,
    power: 3,
    accuracy: 4,
    curve: 3,
    skill: 'quick',
    skillName: '起脚快',
    skillText: '门将反应慢半拍',
    unlockStage: 0,
  },
  {
    id: 'cannon',
    name: '大炮',
    motto: '一脚下去，门将连人带球进网',
    ...L('#2f6fd1', '#1f4f9e', '#d9a77c', '#141414', 'buzz', 'none', 'beard'),
    foot: 'R',
    weakFoot: 2,
    power: 5,
    accuracy: 2,
    curve: 2,
    skill: 'cannon',
    skillName: '重炮',
    skillText: '大力抽射时球再快一截',
    unlockStage: 0,
  },
  {
    id: 'banana',
    name: '香蕉脚',
    motto: '画个圈，球就拐弯',
    ...L('#f2c230', '#c69712', '#f0c19b', '#7a4a24', 'long', 'headband'),
    foot: 'L',
    weakFoot: 2,
    power: 2,
    accuracy: 3,
    curve: 5,
    skill: 'banana',
    skillName: '香蕉球',
    skillText: '弧线球让门将更难调整',
    unlockStage: 0,
  },
  {
    id: 'twofoot',
    name: '双枪',
    motto: '左脚右脚，一样好使',
    ...L('#16a3a0', '#0f7a78', '#e8b78f', '#3a2a1a', 'curly'),
    foot: 'both',
    weakFoot: 5,
    power: 3,
    accuracy: 3,
    curve: 3,
    skill: 'twofoot',
    skillName: '左右开弓',
    skillText: '换脚不打折，两边都能拐弯',
    unlockStage: 2,
  },
  {
    id: 'chip',
    name: '勺子王',
    motto: '门将一倒，我就挑',
    ...L('#f08a54', '#c4622f', '#f3c9a2', '#c9a36b', 'mohawk', 'none', 'mustache'),
    foot: 'R',
    weakFoot: 3,
    power: 2,
    accuracy: 4,
    curve: 3,
    skill: 'chip',
    skillName: '勺子',
    skillText: '往中间轻轻一挑：门将先倒就进',
    unlockStage: 3,
  },
  {
    id: 'lucky',
    name: '幸运星',
    motto: '门柱是我的朋友',
    ...L('#7bc96f', '#559c49', '#c98d63', '#0d0d0d', 'ponytail', 'none', 'none'),
    foot: 'L',
    weakFoot: 3,
    power: 3,
    accuracy: 3,
    curve: 3,
    skill: 'lucky',
    skillName: '好运',
    skillText: '打中门柱总能弹进去',
    unlockStage: 5,
  },
  {
    id: 'cold',
    name: '冷面杀手',
    motto: '从来不踢飞',
    ...L('#3a3f4b', '#22262e', '#c98d63', '#0d0d0d', 'short', 'none', 'glasses'),
    foot: 'R',
    weakFoot: 4,
    power: 3,
    accuracy: 5,
    curve: 2,
    skill: 'cold',
    skillName: '冷静',
    skillText: '只剩最后一次机会时更准',
    unlockStage: 7,
  },
  {
    id: 'ace',
    name: '全能王',
    motto: '力量、准头、弧线样样都行',
    ...L('#8e44c9', '#6a2f9c', '#e8b78f', '#b8b8b8', 'short', 'headband'),
    foot: 'R',
    weakFoot: 4,
    power: 4,
    accuracy: 4,
    curve: 4,
    skill: 'ace',
    skillName: '外脚背',
    skillText: '反方向的弧线也不打折',
    unlockStage: 10,
  },
];

export interface Boots {
  id: string;
  name: string;
  text: string;
  color: string;
  accent: string;
  power: number;
  accuracy: number;
  curve: number;
  unlockStage: number;
}

export const BOOTS: readonly Boots[] = [
  { id: 'trainer', name: '训练鞋', text: '普普通通', color: '#f2f2ee', accent: '#9aa0ad', power: 0, accuracy: 0, curve: 0, unlockStage: 0 },
  { id: 'rocket', name: '火箭', text: '力量 +1', color: '#e8463c', accent: '#ffd84a', power: 1, accuracy: 0, curve: 0, unlockStage: 1 },
  { id: 'suede', name: '绒面', text: '精准 +1', color: '#3b6fd6', accent: '#ffffff', power: 0, accuracy: 1, curve: 0, unlockStage: 4 },
  { id: 'blade', name: '弯刀', text: '弧线 +1', color: '#2fae63', accent: '#0d3b22', power: 0, accuracy: 0, curve: 1, unlockStage: 6 },
  { id: 'flash', name: '闪电', text: '力量+1 弧线+1 精准-1', color: '#ffd23f', accent: '#1b1f2e', power: 1, accuracy: -1, curve: 1, unlockStage: 8 },
  { id: 'golden', name: '金靴', text: '力量 精准 弧线 都+1', color: '#d9a92b', accent: '#fff3c4', power: 1, accuracy: 1, curve: 1, unlockStage: 9 },
];

/** 过了几关（cleared）以后，这个球员 / 球鞋能不能用。 */
export function isUnlocked(x: { unlockStage: number }, cleared: number): boolean {
  return cleared >= x.unlockStage;
}

/** 这一关过了以后解锁什么（给过关画面用）。 */
export function unlocksAt(stage: number): string[] {
  return [
    ...SHOOTERS.filter((s) => s.unlockStage === stage).map((s) => `球员「${s.name}」`),
    ...BOOTS.filter((b) => b.unlockStage === stage).map((b) => `球鞋「${b.name}」`),
  ];
}

export function preferredFoot(s: Shooter): Foot {
  return s.foot === 'both' ? 'R' : s.foot;
}

/** 用哪只脚：是不是惯用脚。 */
export function isWeakFoot(s: Shooter, foot: Foot): boolean {
  return s.foot !== 'both' && s.foot !== foot && s.skill !== 'twofoot';
}

/**
 * 这一脚实际的能力：球员 + 球鞋，用逆足时打折（逆足越好打折越少），冷面杀手最后一次机会更准。
 * 弧线方向：右脚内脚背的弧线是「先往右、再拐回左」，左脚反过来；反方向（外脚背）只能弯一点。
 */
export function kickerFor(s: Shooter, b: Boots, foot: Foot, lastLife: boolean): Kicker {
  const weak = isWeakFoot(s, foot) ? (5 - s.weakFoot) * 0.5 : 0;
  const clamp = (v: number): number => Math.max(1, Math.min(6, v));
  return {
    power: clamp(s.power + b.power - weak),
    accuracy: clamp(s.accuracy + b.accuracy - weak + (s.skill === 'cold' && lastLife ? 2 : 0)),
    curve: clamp(s.curve + b.curve - weak),
    curveSide: s.skill === 'twofoot' || s.skill === 'ace' ? 0 : foot === 'R' ? 1 : -1,
  };
}
