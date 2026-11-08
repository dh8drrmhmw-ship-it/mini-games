// 人物长相（门将和罚球的球员共用）：只是数据，画法在 draw.ts。

export type HairStyle = 'short' | 'spiky' | 'long' | 'bald' | 'curly' | 'buzz' | 'ponytail' | 'mohawk';
export type Headgear = 'none' | 'cap' | 'headband' | 'beanie';
export type Extra = 'none' | 'beard' | 'glasses' | 'mustache';

export interface Look {
  jersey: string;
  jerseyDark: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  headgear: Headgear;
  extra: Extra;
}
