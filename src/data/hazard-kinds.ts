/** 食安種類：只描述「是什麼」，不含戰鬥數值。一般／精英／Boss 共用。 */
export type HazardKindId =
  | 'aflatoxin'
  | 'sulfur_dioxide_excess'
  | 'salmonella'
  | 's_aureus';

export interface HazardKindDefinition {
  kindId: HazardKindId;
  displayName: string;
  category: 'biological' | 'chemical';
  /** 圖鑑標題（D 階段使用） */
  codexTitle: string;
  /** 科普要點：全部待查證，不得進正式玩家文案 */
  codexPoints: string[];
  verification: 'pending';
  /** 概念圖取色（目視近似） */
  palette: { base: number; accent: number };
}

export const HAZARD_KINDS: Record<HazardKindId, HazardKindDefinition> = {
  aflatoxin: {
    kindId: 'aflatoxin',
    displayName: '黃麴毒素',
    category: 'chemical',
    codexTitle: '黴菌毒素',
    codexPoints: ['黴菌毒素屬天然毒', '保存不當可能產生'],
    verification: 'pending',
    palette: { base: 0xe8a33d, accent: 0xc06a1a },
  },
  sulfur_dioxide_excess: {
    kindId: 'sulfur_dioxide_excess',
    displayName: '二氧化硫超標',
    category: 'chemical',
    codexTitle: '食品添加物超標',
    codexPoints: ['添加物須在准用範圍與限量內'],
    verification: 'pending',
    palette: { base: 0x8b6fc4, accent: 0xc9b8ea },
  },
  salmonella: {
    kindId: 'salmonella',
    displayName: '沙門氏菌',
    category: 'biological',
    codexTitle: '細菌性污染',
    codexPoints: ['常見食品中毒病因', '加熱與避免交叉污染'],
    verification: 'pending',
    palette: { base: 0x5aa845, accent: 0x2f6b26 },
  },
  s_aureus: {
    kindId: 's_aureus',
    displayName: '金黃色葡萄球菌',
    category: 'biological',
    codexTitle: '細菌毒素',
    codexPoints: ['產生耐熱毒素', '加熱不足以去除'],
    verification: 'pending',
    palette: { base: 0xe6b93f, accent: 0xa9721b },
  },
};
