/**
 * MIL-STD-2525D 标准军事符号
 *
 * 完整军标系统，包含：
 *   - SymbolType 枚举：所有支持的军标类型（按领域分组）
 *   - resolveSidc(type, identity)：根据军标类型和敌我属性生成正确的 15 位 SIDC
 *   - MilSIDC 预定义常量
 *
 * 使用方式：
 *   // 新 API — 指定类型 + 敌我，自动映射 SIDC
 *   import { resolveSidc, SymbolType } from 'lcplot';
 *   const sidc = resolveSidc(SymbolType.TANK, 'hostile');
 *   // → 'SHFGUCI---H---'
 *
 *   // 传统方式 — 直接取常量
 *   import { MilSIDC } from 'lcplot';
 *   const sidc = MilSIDC.Ground.HOSTILE_TANK;
 */

// ==================== 敌我属性编码对照 ====================

/** 阵营 → SIDC 位置 10 编码 */
const IDENTITY_TO_CHAR: Record<string, string> = {
  friend: 'A',
  hostile: 'H',
  neutral: 'N',
  unknown: 'U',
  pending: 'P',
  suspect: 'S',
  joker: 'J',
  faker: 'F'
};

/** SIDC 位置 10 编码 → 阵营 */
const CHAR_TO_IDENTITY: Record<string, string> = {
  'A': 'friend',
  'H': 'hostile',
  'N': 'neutral',
  'U': 'unknown',
  'P': 'pending',
  'S': 'suspect',
  'J': 'joker',
  'F': 'faker'
};

/** 阵营 → SIDC 前缀（位置 0-1）*/
const IDENTITY_TO_PREFIX: Record<string, string> = {
  friend: 'SF',
  hostile: 'SH',
  neutral: 'SN',
  unknown: 'SU',
  pending: 'SU',
  suspect: 'SU',
  joker: 'SJ',
  faker: 'SF'
};

// ==================== SymbolType 枚举 ====================

/**
 * 所有支持的军标类型
 * 命名规则：{领域}_{子类型}，例如 GROUND_TANK、AIR_UAV
 */
export enum SymbolType {
  // ========= 地面单位 =========
  GROUND_TANK = 'GROUND_TANK',
  GROUND_ARMOR = 'GROUND_ARMOR',
  GROUND_INFANTRY = 'GROUND_INFANTRY',
  GROUND_MECHANIZED = 'GROUND_MECHANIZED',
  GROUND_ARTILLERY = 'GROUND_ARTILLERY',
  GROUND_AIR_DEFENSE = 'GROUND_AIR_DEFENSE',
  GROUND_RECON = 'GROUND_RECON',
  GROUND_ENGINEER = 'GROUND_ENGINEER',
  GROUND_HEADQUARTERS = 'GROUND_HEADQUARTERS',
  GROUND_MEDICAL = 'GROUND_MEDICAL',
  GROUND_SUPPLY = 'GROUND_SUPPLY',
  GROUND_MAINTENANCE = 'GROUND_MAINTENANCE',
  GROUND_MORTAR = 'GROUND_MORTAR',
  GROUND_MISSILE = 'GROUND_MISSILE',
  GROUND_BRIDGE = 'GROUND_BRIDGE',
  GROUND_RADAR = 'GROUND_RADAR',
  GROUND_SIGNAL = 'GROUND_SIGNAL',
  GROUND_TRANSPORT = 'GROUND_TRANSPORT',
  GROUND_MILITARY_POLICE = 'GROUND_MILITARY_POLICE',
  GROUND_CBRN = 'GROUND_CBRN',
  GROUND_MILITARY_INTELLIGENCE = 'GROUND_MILITARY_INTELLIGENCE',

  // ========= 空中单位 =========
  AIR_FIXED_WING = 'AIR_FIXED_WING',
  AIR_HELICOPTER = 'AIR_HELICOPTER',
  AIR_UAV = 'AIR_UAV',
  AIR_MISSILE = 'AIR_MISSILE',
  AIR_AWACS = 'AIR_AWACS',
  AIR_TANKER = 'AIR_TANKER',
  AIR_TRANSPORT = 'AIR_TRANSPORT',
  AIR_ATTACK_HELICOPTER = 'AIR_ATTACK_HELICOPTER',

  // ========= 海上单位 =========
  SEA_SURFACE_COMBATANT = 'SEA_SURFACE_COMBATANT',
  SEA_CARRIER = 'SEA_CARRIER',
  SEA_DESTROYER = 'SEA_DESTROYER',
  SEA_FRIGATE = 'SEA_FRIGATE',
  SEA_SUBMARINE = 'SEA_SUBMARINE',
  SEA_LANDING = 'SEA_LANDING',
  SEA_PATROL = 'SEA_PATROL',
  SEA_MINE_WARFARE = 'SEA_MINE_WARFARE',
  SEA_AMPHIBIOUS = 'SEA_AMPHIBIOUS',
  SEA_MERCHANT = 'SEA_MERCHANT',

  // ========= 特种作战 =========
  SOF_TEAM = 'SOF_TEAM',
  SOF_AVIATION = 'SOF_AVIATION',
  SOF_NAVAL = 'SOF_NAVAL',
}

// ==================== 类型 → 基础 SIDC 映射（友方版） ====================

/**
 * 每种军标类型的友方 SIDC（位置 10 = A）
 * SIDC 格式：SSFPPPPPP-X---（15 位）
 *   SS  = 符号集前缀（由 identity 自动替换）
 *   F   = 领域编码
 *   PPPPPP = 功能编码
 *   10 位 = 阵营编码（由 identity 自动替换）
 */
const TYPE_BASE_SIDC: Record<SymbolType, string> = {
  // === 地面 ===
  [SymbolType.GROUND_TANK]:            '__GUCI---A---',
  [SymbolType.GROUND_ARMOR]:           '__GUCI---A---',
  [SymbolType.GROUND_INFANTRY]:        '__GUIA---A---',
  [SymbolType.GROUND_MECHANIZED]:      '__GUMI---A---',
  [SymbolType.GROUND_ARTILLERY]:       '__GUFA---A---',
  [SymbolType.GROUND_AIR_DEFENSE]:     '__GUAD---A---',
  [SymbolType.GROUND_RECON]:           '__GURC---A---',
  [SymbolType.GROUND_ENGINEER]:        '__GUEN---A---',
  [SymbolType.GROUND_HEADQUARTERS]:    '__GUHQ---A---',
  [SymbolType.GROUND_MEDICAL]:         '__GUMB---A---',
  [SymbolType.GROUND_SUPPLY]:          '__GUSP---A---',
  [SymbolType.GROUND_MAINTENANCE]:     '__GUMN---A---',
  [SymbolType.GROUND_MORTAR]:          '__GUMA---A---',
  [SymbolType.GROUND_MISSILE]:         '__GUMS---A---',
  [SymbolType.GROUND_BRIDGE]:          '__GUBG---A---',
  [SymbolType.GROUND_RADAR]:           '__GURD---A---',
  [SymbolType.GROUND_SIGNAL]:          '__GUSG---A---',
  [SymbolType.GROUND_TRANSPORT]:       '__GUTR---A---',
  [SymbolType.GROUND_MILITARY_POLICE]: '__GUMP---A---',
  [SymbolType.GROUND_CBRN]:            '__GUCM---A---',
  [SymbolType.GROUND_MILITARY_INTELLIGENCE]: '__GUML---A---',

  // === 空中 ===
  [SymbolType.AIR_FIXED_WING]:         '__APMF---A---',
  [SymbolType.AIR_HELICOPTER]:         '__AHMF---A---',
  [SymbolType.AIR_UAV]:                '__APUAV--A---',
  [SymbolType.AIR_MISSILE]:            '__AMSL---A---',
  [SymbolType.AIR_AWACS]:              '__AAWACS-A---',
  [SymbolType.AIR_TANKER]:             '__ATKR---A---',
  [SymbolType.AIR_TRANSPORT]:          '__ATRP---A---',
  [SymbolType.AIR_ATTACK_HELICOPTER]:  '__AAH---A---',

  // === 海上 ===
  [SymbolType.SEA_SURFACE_COMBATANT]:  '__SNCI---A---',
  [SymbolType.SEA_CARRIER]:            '__SNCV---A---',
  [SymbolType.SEA_DESTROYER]:          '__SNDD---A---',
  [SymbolType.SEA_FRIGATE]:            '__SNFF---A---',
  [SymbolType.SEA_SUBMARINE]:          '__SWCI---A---',
  [SymbolType.SEA_LANDING]:            '__SNLC---A---',
  [SymbolType.SEA_PATROL]:             '__SNPC---A---',
  [SymbolType.SEA_MINE_WARFARE]:       '__SNMW---A---',
  [SymbolType.SEA_AMPHIBIOUS]:         '__SNAW---A---',
  [SymbolType.SEA_MERCHANT]:           '__SNMR---A---',

  // === 特种作战 ===
  [SymbolType.SOF_TEAM]:               '__GFSO---A---',
  [SymbolType.SOF_AVIATION]:           '__AFSO---A---',
  [SymbolType.SOF_NAVAL]:              '__SFSO---A---',
};

// ==================== 便捷别名（类型 → 中文名） ====================

/** 军标类型中文名称对照 */
export const SymbolTypeNames: Partial<Record<SymbolType, string>> = {
  [SymbolType.GROUND_TANK]: '坦克',
  [SymbolType.GROUND_ARMOR]: '装甲车',
  [SymbolType.GROUND_INFANTRY]: '步兵',
  [SymbolType.GROUND_MECHANIZED]: '机械化步兵',
  [SymbolType.GROUND_ARTILLERY]: '火炮',
  [SymbolType.GROUND_AIR_DEFENSE]: '防空',
  [SymbolType.GROUND_RECON]: '侦察',
  [SymbolType.GROUND_ENGINEER]: '工兵',
  [SymbolType.GROUND_HEADQUARTERS]: '指挥部',
  [SymbolType.GROUND_MEDICAL]: '医疗',
  [SymbolType.GROUND_SUPPLY]: '补给',
  [SymbolType.GROUND_MAINTENANCE]: '维修',
  [SymbolType.GROUND_MORTAR]: '迫击炮',
  [SymbolType.GROUND_MISSILE]: '导弹',
  [SymbolType.GROUND_BRIDGE]: '桥梁',
  [SymbolType.GROUND_RADAR]: '雷达',
  [SymbolType.GROUND_SIGNAL]: '通信',
  [SymbolType.GROUND_TRANSPORT]: '运输',
  [SymbolType.GROUND_MILITARY_POLICE]: '宪兵',
  [SymbolType.GROUND_CBRN]: '防化',
  [SymbolType.GROUND_MILITARY_INTELLIGENCE]: '军事情报',

  [SymbolType.AIR_FIXED_WING]: '固定翼飞机',
  [SymbolType.AIR_HELICOPTER]: '直升机',
  [SymbolType.AIR_UAV]: '无人机',
  [SymbolType.AIR_MISSILE]: '空射导弹',
  [SymbolType.AIR_AWACS]: '预警机',
  [SymbolType.AIR_TANKER]: '加油机',
  [SymbolType.AIR_TRANSPORT]: '运输机',
  [SymbolType.AIR_ATTACK_HELICOPTER]: '武装直升机',

  [SymbolType.SEA_SURFACE_COMBATANT]: '水面战斗舰艇',
  [SymbolType.SEA_CARRIER]: '航母',
  [SymbolType.SEA_DESTROYER]: '驱逐舰',
  [SymbolType.SEA_FRIGATE]: '护卫舰',
  [SymbolType.SEA_SUBMARINE]: '潜艇',
  [SymbolType.SEA_LANDING]: '登陆舰',
  [SymbolType.SEA_PATROL]: '巡逻艇',
  [SymbolType.SEA_MINE_WARFARE]: '扫雷舰',
  [SymbolType.SEA_AMPHIBIOUS]: '两栖舰',
  [SymbolType.SEA_MERCHANT]: '商船',

  [SymbolType.SOF_TEAM]: '特种作战小队',
  [SymbolType.SOF_AVIATION]: '特种作战航空',
  [SymbolType.SOF_NAVAL]: '特种作战海上',
};

// ==================== 领域分组 ====================

/** 按领域分组的军标类型 */
export const SymbolTypeGroups: Record<string, SymbolType[]> = {
  ground: [
    SymbolType.GROUND_TANK,
    SymbolType.GROUND_INFANTRY,
    SymbolType.GROUND_MECHANIZED,
    SymbolType.GROUND_ARTILLERY,
    SymbolType.GROUND_AIR_DEFENSE,
    SymbolType.GROUND_RECON,
    SymbolType.GROUND_ENGINEER,
    SymbolType.GROUND_HEADQUARTERS,
    SymbolType.GROUND_MEDICAL,
    SymbolType.GROUND_SUPPLY,
    SymbolType.GROUND_MORTAR,
    SymbolType.GROUND_MISSILE,
    SymbolType.GROUND_RADAR,
    SymbolType.GROUND_SIGNAL,
    SymbolType.GROUND_TRANSPORT,
    SymbolType.GROUND_MILITARY_POLICE,
    SymbolType.GROUND_CBRN,
  ],
  air: [
    SymbolType.AIR_FIXED_WING,
    SymbolType.AIR_HELICOPTER,
    SymbolType.AIR_UAV,
    SymbolType.AIR_MISSILE,
    SymbolType.AIR_AWACS,
    SymbolType.AIR_TANKER,
    SymbolType.AIR_TRANSPORT,
    SymbolType.AIR_ATTACK_HELICOPTER,
  ],
  sea: [
    SymbolType.SEA_SURFACE_COMBATANT,
    SymbolType.SEA_CARRIER,
    SymbolType.SEA_DESTROYER,
    SymbolType.SEA_FRIGATE,
    SymbolType.SEA_SUBMARINE,
    SymbolType.SEA_LANDING,
    SymbolType.SEA_PATROL,
    SymbolType.SEA_MINE_WARFARE,
    SymbolType.SEA_AMPHIBIOUS,
    SymbolType.SEA_MERCHANT,
  ],
  sof: [
    SymbolType.SOF_TEAM,
    SymbolType.SOF_AVIATION,
    SymbolType.SOF_NAVAL,
  ]
};

// ==================== 核心解析函数 ====================

/**
 * 根据军标类型和敌我属性，生成完整的 15 位 SIDC
 *
 * @param type  军标类型（如 SymbolType.GROUND_TANK）
 * @param identity  敌我属性（'friend' | 'hostile' | 'neutral' | 'unknown'，默认 'friend'）
 * @returns 15 位 MIL-STD-2525D SIDC 编码
 *
 * 示例：
 *   resolveSidc(SymbolType.GROUND_TANK, 'hostile')
 *   // → 'SHFGUCI---H---'（敌方坦克）
 *
 *   resolveSidc(SymbolType.AIR_UAV)
 *   // → 'SFFAPUAV--A---'（友方无人机，默认 friend）
 */
export function resolveSidc(type: SymbolType, identity: string = 'friend'): string {
  const base = TYPE_BASE_SIDC[type];
  if (!base) {
    console.warn(`Unknown SymbolType: ${type}, falling back to tank`);
    return resolveSidc(SymbolType.GROUND_TANK, identity);
  }

  const prefix = IDENTITY_TO_PREFIX[identity] || 'SF';
  const char = IDENTITY_TO_CHAR[identity] || 'A';

  // 替换 SIDC：
  //   位置 0-1: 符号集前缀
  //   位置 10:  阵营编码
  const result = prefix + base.substring(2, 10) + char + base.substring(11);

  // 验证长度
  if (result.length !== 15) {
    console.warn(`Generated SIDC length is ${result.length}, expected 15: ${result}`);
  }

  return result;
}

/**
 * 从 SIDC 中提取敌我属性
 */
export function identityFromSidc(sidc: string): string {
  if (!sidc || sidc.length < 11) return 'unknown';

  // 优先使用位置 10（标准阵营位）
  const c = sidc.toUpperCase()[10];
  if (CHAR_TO_IDENTITY[c]) return CHAR_TO_IDENTITY[c];

  // 兜底：符号集前缀
  const prefix = sidc.substring(0, 2).toUpperCase();
  const prefixMap: Record<string, string> = {
    'SF': 'friend', 'SH': 'hostile', 'SN': 'neutral',
    'SU': 'unknown', 'SO': 'friend', 'SW': 'unknown', 'SJ': 'joker'
  };
  return prefixMap[prefix] || 'unknown';
}

/**
 * 获取军标类型的领域
 */
export function symbolTypeDomain(type: SymbolType): string {
  const key = type.toString().split('_')[0].toLowerCase();
  return key;
}

// ==================== 预定义常量（向后兼容） ====================

/**
 * 地面单位 SIDC（完整 4 阵营）
 */
export const GroundSymbols = {
  TANK:         { friend: resolveSidc(SymbolType.GROUND_TANK, 'friend'),         hostile: resolveSidc(SymbolType.GROUND_TANK, 'hostile'),         neutral: resolveSidc(SymbolType.GROUND_TANK, 'neutral'),         unknown: resolveSidc(SymbolType.GROUND_TANK, 'unknown') },
  INFANTRY:     { friend: resolveSidc(SymbolType.GROUND_INFANTRY, 'friend'),     hostile: resolveSidc(SymbolType.GROUND_INFANTRY, 'hostile'),     neutral: resolveSidc(SymbolType.GROUND_INFANTRY, 'neutral'),     unknown: resolveSidc(SymbolType.GROUND_INFANTRY, 'unknown') },
  MECHANIZED:   { friend: resolveSidc(SymbolType.GROUND_MECHANIZED, 'friend'),   hostile: resolveSidc(SymbolType.GROUND_MECHANIZED, 'hostile'),   neutral: resolveSidc(SymbolType.GROUND_MECHANIZED, 'neutral'),   unknown: resolveSidc(SymbolType.GROUND_MECHANIZED, 'unknown') },
  ARTILLERY:    { friend: resolveSidc(SymbolType.GROUND_ARTILLERY, 'friend'),    hostile: resolveSidc(SymbolType.GROUND_ARTILLERY, 'hostile'),    neutral: resolveSidc(SymbolType.GROUND_ARTILLERY, 'neutral'),    unknown: resolveSidc(SymbolType.GROUND_ARTILLERY, 'unknown') },
  AIR_DEFENSE:  { friend: resolveSidc(SymbolType.GROUND_AIR_DEFENSE, 'friend'),  hostile: resolveSidc(SymbolType.GROUND_AIR_DEFENSE, 'hostile'),  neutral: resolveSidc(SymbolType.GROUND_AIR_DEFENSE, 'neutral'),  unknown: resolveSidc(SymbolType.GROUND_AIR_DEFENSE, 'unknown') },
  RECON:        { friend: resolveSidc(SymbolType.GROUND_RECON, 'friend'),        hostile: resolveSidc(SymbolType.GROUND_RECON, 'hostile'),        neutral: resolveSidc(SymbolType.GROUND_RECON, 'neutral'),        unknown: resolveSidc(SymbolType.GROUND_RECON, 'unknown') },
  ENGINEER:     { friend: resolveSidc(SymbolType.GROUND_ENGINEER, 'friend'),     hostile: resolveSidc(SymbolType.GROUND_ENGINEER, 'hostile'),     neutral: resolveSidc(SymbolType.GROUND_ENGINEER, 'neutral'),     unknown: resolveSidc(SymbolType.GROUND_ENGINEER, 'unknown') },
  HEADQUARTERS: { friend: resolveSidc(SymbolType.GROUND_HEADQUARTERS, 'friend'), hostile: resolveSidc(SymbolType.GROUND_HEADQUARTERS, 'hostile'), neutral: resolveSidc(SymbolType.GROUND_HEADQUARTERS, 'neutral'), unknown: resolveSidc(SymbolType.GROUND_HEADQUARTERS, 'unknown') },
  MEDICAL:      { friend: resolveSidc(SymbolType.GROUND_MEDICAL, 'friend'),      hostile: resolveSidc(SymbolType.GROUND_MEDICAL, 'hostile'),      neutral: resolveSidc(SymbolType.GROUND_MEDICAL, 'neutral'),      unknown: resolveSidc(SymbolType.GROUND_MEDICAL, 'unknown') },
  SUPPLY:       { friend: resolveSidc(SymbolType.GROUND_SUPPLY, 'friend'),       hostile: resolveSidc(SymbolType.GROUND_SUPPLY, 'hostile'),       neutral: resolveSidc(SymbolType.GROUND_SUPPLY, 'neutral'),       unknown: resolveSidc(SymbolType.GROUND_SUPPLY, 'unknown') },
  MORTAR:       { friend: resolveSidc(SymbolType.GROUND_MORTAR, 'friend'),       hostile: resolveSidc(SymbolType.GROUND_MORTAR, 'hostile'),       neutral: resolveSidc(SymbolType.GROUND_MORTAR, 'neutral'),       unknown: resolveSidc(SymbolType.GROUND_MORTAR, 'unknown') },
  MISSILE:      { friend: resolveSidc(SymbolType.GROUND_MISSILE, 'friend'),      hostile: resolveSidc(SymbolType.GROUND_MISSILE, 'hostile'),      neutral: resolveSidc(SymbolType.GROUND_MISSILE, 'neutral'),      unknown: resolveSidc(SymbolType.GROUND_MISSILE, 'unknown') },
  RADAR:        { friend: resolveSidc(SymbolType.GROUND_RADAR, 'friend'),        hostile: resolveSidc(SymbolType.GROUND_RADAR, 'hostile'),        neutral: resolveSidc(SymbolType.GROUND_RADAR, 'neutral'),        unknown: resolveSidc(SymbolType.GROUND_RADAR, 'unknown') },
  SIGNAL:       { friend: resolveSidc(SymbolType.GROUND_SIGNAL, 'friend'),       hostile: resolveSidc(SymbolType.GROUND_SIGNAL, 'hostile'),       neutral: resolveSidc(SymbolType.GROUND_SIGNAL, 'neutral'),       unknown: resolveSidc(SymbolType.GROUND_SIGNAL, 'unknown') },
  TRANSPORT:    { friend: resolveSidc(SymbolType.GROUND_TRANSPORT, 'friend'),    hostile: resolveSidc(SymbolType.GROUND_TRANSPORT, 'hostile'),    neutral: resolveSidc(SymbolType.GROUND_TRANSPORT, 'neutral'),    unknown: resolveSidc(SymbolType.GROUND_TRANSPORT, 'unknown') },
};

export const AirSymbols = {
  FIXED_WING:   { friend: resolveSidc(SymbolType.AIR_FIXED_WING, 'friend'),   hostile: resolveSidc(SymbolType.AIR_FIXED_WING, 'hostile'),   neutral: resolveSidc(SymbolType.AIR_FIXED_WING, 'neutral'),   unknown: resolveSidc(SymbolType.AIR_FIXED_WING, 'unknown') },
  HELICOPTER:   { friend: resolveSidc(SymbolType.AIR_HELICOPTER, 'friend'),   hostile: resolveSidc(SymbolType.AIR_HELICOPTER, 'hostile'),   neutral: resolveSidc(SymbolType.AIR_HELICOPTER, 'neutral'),   unknown: resolveSidc(SymbolType.AIR_HELICOPTER, 'unknown') },
  UAV:          { friend: resolveSidc(SymbolType.AIR_UAV, 'friend'),           hostile: resolveSidc(SymbolType.AIR_UAV, 'hostile'),           neutral: resolveSidc(SymbolType.AIR_UAV, 'neutral'),           unknown: resolveSidc(SymbolType.AIR_UAV, 'unknown') },
  MISSILE:      { friend: resolveSidc(SymbolType.AIR_MISSILE, 'friend'),       hostile: resolveSidc(SymbolType.AIR_MISSILE, 'hostile'),       neutral: resolveSidc(SymbolType.AIR_MISSILE, 'neutral'),       unknown: resolveSidc(SymbolType.AIR_MISSILE, 'unknown') },
  AWACS:        { friend: resolveSidc(SymbolType.AIR_AWACS, 'friend'),         hostile: resolveSidc(SymbolType.AIR_AWACS, 'hostile'),         neutral: resolveSidc(SymbolType.AIR_AWACS, 'neutral'),         unknown: resolveSidc(SymbolType.AIR_AWACS, 'unknown') },
  TANKER:       { friend: resolveSidc(SymbolType.AIR_TANKER, 'friend'),       hostile: resolveSidc(SymbolType.AIR_TANKER, 'hostile'),       neutral: resolveSidc(SymbolType.AIR_TANKER, 'neutral'),       unknown: resolveSidc(SymbolType.AIR_TANKER, 'unknown') },
  TRANSPORT:    { friend: resolveSidc(SymbolType.AIR_TRANSPORT, 'friend'),    hostile: resolveSidc(SymbolType.AIR_TRANSPORT, 'hostile'),    neutral: resolveSidc(SymbolType.AIR_TRANSPORT, 'neutral'),    unknown: resolveSidc(SymbolType.AIR_TRANSPORT, 'unknown') },
};

export const SeaSymbols = {
  SURFACE:      { friend: resolveSidc(SymbolType.SEA_SURFACE_COMBATANT, 'friend'), hostile: resolveSidc(SymbolType.SEA_SURFACE_COMBATANT, 'hostile'), neutral: resolveSidc(SymbolType.SEA_SURFACE_COMBATANT, 'neutral'), unknown: resolveSidc(SymbolType.SEA_SURFACE_COMBATANT, 'unknown') },
  CARRIER:      { friend: resolveSidc(SymbolType.SEA_CARRIER, 'friend'),         hostile: resolveSidc(SymbolType.SEA_CARRIER, 'hostile'),         neutral: resolveSidc(SymbolType.SEA_CARRIER, 'neutral'),         unknown: resolveSidc(SymbolType.SEA_CARRIER, 'unknown') },
  DESTROYER:    { friend: resolveSidc(SymbolType.SEA_DESTROYER, 'friend'),       hostile: resolveSidc(SymbolType.SEA_DESTROYER, 'hostile'),       neutral: resolveSidc(SymbolType.SEA_DESTROYER, 'neutral'),       unknown: resolveSidc(SymbolType.SEA_DESTROYER, 'unknown') },
  FRIGATE:      { friend: resolveSidc(SymbolType.SEA_FRIGATE, 'friend'),         hostile: resolveSidc(SymbolType.SEA_FRIGATE, 'hostile'),         neutral: resolveSidc(SymbolType.SEA_FRIGATE, 'neutral'),         unknown: resolveSidc(SymbolType.SEA_FRIGATE, 'unknown') },
  SUBMARINE:    { friend: resolveSidc(SymbolType.SEA_SUBMARINE, 'friend'),       hostile: resolveSidc(SymbolType.SEA_SUBMARINE, 'hostile'),       neutral: resolveSidc(SymbolType.SEA_SUBMARINE, 'neutral'),       unknown: resolveSidc(SymbolType.SEA_SUBMARINE, 'unknown') },
  LANDING:      { friend: resolveSidc(SymbolType.SEA_LANDING, 'friend'),         hostile: resolveSidc(SymbolType.SEA_LANDING, 'hostile'),         neutral: resolveSidc(SymbolType.SEA_LANDING, 'neutral'),         unknown: resolveSidc(SymbolType.SEA_LANDING, 'unknown') },
  PATROL:       { friend: resolveSidc(SymbolType.SEA_PATROL, 'friend'),          hostile: resolveSidc(SymbolType.SEA_PATROL, 'hostile'),          neutral: resolveSidc(SymbolType.SEA_PATROL, 'neutral'),          unknown: resolveSidc(SymbolType.SEA_PATROL, 'unknown') },
};

/**
 * 向后兼容的 MilSIDC 对象
 * 保留了旧版常量名称以便已有代码不受影响
 */
export const MilSIDC = {
  Ground: {
    FRIENDLY_TANK:        resolveSidc(SymbolType.GROUND_TANK, 'friend'),
    HOSTILE_TANK:         resolveSidc(SymbolType.GROUND_TANK, 'hostile'),
    NEUTRAL_TANK:         resolveSidc(SymbolType.GROUND_TANK, 'neutral'),
    UNKNOWN_TANK:         resolveSidc(SymbolType.GROUND_TANK, 'unknown'),
    FRIENDLY_INFANTRY:    resolveSidc(SymbolType.GROUND_INFANTRY, 'friend'),
    HOSTILE_INFANTRY:     resolveSidc(SymbolType.GROUND_INFANTRY, 'hostile'),
    FRIENDLY_ARTILLERY:   resolveSidc(SymbolType.GROUND_ARTILLERY, 'friend'),
    HOSTILE_ARTILLERY:    resolveSidc(SymbolType.GROUND_ARTILLERY, 'hostile'),
    FRIENDLY_RECON:       resolveSidc(SymbolType.GROUND_RECON, 'friend'),
    HOSTILE_RECON:        resolveSidc(SymbolType.GROUND_RECON, 'hostile'),
    NEUTRAL_RECON:        resolveSidc(SymbolType.GROUND_RECON, 'neutral'),
    UNKNOWN_RECON:        resolveSidc(SymbolType.GROUND_RECON, 'unknown'),
    FRIENDLY_HEADQUARTERS: resolveSidc(SymbolType.GROUND_HEADQUARTERS, 'friend'),
    HOSTILE_HEADQUARTERS:  resolveSidc(SymbolType.GROUND_HEADQUARTERS, 'hostile'),
    FRIENDLY_ENGINEER:    resolveSidc(SymbolType.GROUND_ENGINEER, 'friend'),
    HOSTILE_ENGINEER:     resolveSidc(SymbolType.GROUND_ENGINEER, 'hostile'),
    FRIENDLY_RADAR:       resolveSidc(SymbolType.GROUND_RADAR, 'friend'),
    HOSTILE_RADAR:        resolveSidc(SymbolType.GROUND_RADAR, 'hostile'),
    FRIENDLY_SUPPLY:      resolveSidc(SymbolType.GROUND_SUPPLY, 'friend'),
    HOSTILE_SUPPLY:       resolveSidc(SymbolType.GROUND_SUPPLY, 'hostile'),
    FRIENDLY_MEDICAL:     resolveSidc(SymbolType.GROUND_MEDICAL, 'friend'),
    HOSTILE_AMBULANCE:    resolveSidc(SymbolType.GROUND_MEDICAL, 'hostile'),
    FRIENDLY_SIGNAL:      resolveSidc(SymbolType.GROUND_SIGNAL, 'friend'),
    HOSTILE_SIGNAL:       resolveSidc(SymbolType.GROUND_SIGNAL, 'hostile'),
    FRIENDLY_TRANSPORT:   resolveSidc(SymbolType.GROUND_TRANSPORT, 'friend'),
    HOSTILE_TRANSPORT:    resolveSidc(SymbolType.GROUND_TRANSPORT, 'hostile'),
  },
  Air: {
    FRIENDLY_FIXED_WING:  resolveSidc(SymbolType.AIR_FIXED_WING, 'friend'),
    HOSTILE_FIXED_WING:   resolveSidc(SymbolType.AIR_FIXED_WING, 'hostile'),
    NEUTRAL_FIXED_WING:   resolveSidc(SymbolType.AIR_FIXED_WING, 'neutral'),
    UNKNOWN_FIXED_WING:   resolveSidc(SymbolType.AIR_FIXED_WING, 'unknown'),
    FRIENDLY_HELICOPTER:  resolveSidc(SymbolType.AIR_HELICOPTER, 'friend'),
    HOSTILE_HELICOPTER:   resolveSidc(SymbolType.AIR_HELICOPTER, 'hostile'),
    FRIENDLY_UAV:         resolveSidc(SymbolType.AIR_UAV, 'friend'),
    HOSTILE_UAV:          resolveSidc(SymbolType.AIR_UAV, 'hostile'),
    FRIENDLY_AWACS:       resolveSidc(SymbolType.AIR_AWACS, 'friend'),
    HOSTILE_AWACS:        resolveSidc(SymbolType.AIR_AWACS, 'hostile'),
    HOSTILE_MISSILE:      resolveSidc(SymbolType.AIR_MISSILE, 'hostile'),
  },
  Sea: {
    FRIENDLY_SURFACE:     resolveSidc(SymbolType.SEA_SURFACE_COMBATANT, 'friend'),
    HOSTILE_SURFACE:      resolveSidc(SymbolType.SEA_SURFACE_COMBATANT, 'hostile'),
    FRIENDLY_CARRIER:     resolveSidc(SymbolType.SEA_CARRIER, 'friend'),
    HOSTILE_CARRIER:      resolveSidc(SymbolType.SEA_CARRIER, 'hostile'),
    FRIENDLY_DESTROYER:   resolveSidc(SymbolType.SEA_DESTROYER, 'friend'),
    HOSTILE_DESTROYER:    resolveSidc(SymbolType.SEA_DESTROYER, 'hostile'),
    FRIENDLY_SUBMARINE:   resolveSidc(SymbolType.SEA_SUBMARINE, 'friend'),
    HOSTILE_SUBMARINE:    resolveSidc(SymbolType.SEA_SUBMARINE, 'hostile'),
  },
  // 通用快捷方式
  TANK:        resolveSidc(SymbolType.GROUND_TANK, 'friend'),
  INFANTRY:    resolveSidc(SymbolType.GROUND_INFANTRY, 'friend'),
  ARTILLERY:   resolveSidc(SymbolType.GROUND_ARTILLERY, 'friend'),
  UAV:         resolveSidc(SymbolType.AIR_UAV, 'friend'),
  HELICOPTER:  resolveSidc(SymbolType.AIR_HELICOPTER, 'friend'),
  FIXED_WING:  resolveSidc(SymbolType.AIR_FIXED_WING, 'friend'),
  SHIP:        resolveSidc(SymbolType.SEA_SURFACE_COMBATANT, 'friend'),
  SUBMARINE:   resolveSidc(SymbolType.SEA_SUBMARINE, 'friend'),
  CARRIER:     resolveSidc(SymbolType.SEA_CARRIER, 'friend'),
  HEADQUARTERS:resolveSidc(SymbolType.GROUND_HEADQUARTERS, 'friend'),
  RADAR:       resolveSidc(SymbolType.GROUND_RADAR, 'friend'),
};
