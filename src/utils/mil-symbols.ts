/**
 * MIL-STD-2525D 标准军事符号 SIDC 对照表
 *
 * SIDC 格式：15 位编码
 *   位置 0-1: 符号集 (SF=友方地面, SH=敌方地面, 等)
 *   位置 2:   未使用 (通常为 F 或 G)
 *   位置 3:   领域 (G=地面, A=空中, S=海上, W=水下, X=太空)
 *   位置 4-9: 功能编码 (具体军事单位类型)
 *   位置 10:  阵营 (A=友方, H=敌方, N=中立, U=未知, 等)
 *   位置 11-14: 符号修饰符
 *
 * 使用方法：
 *   controller.createAdvancedPrimitive({
 *     sidc: MilSIDC.Ground.FRIENDLY_TANK,  // 直接取常量
 *     position: [116.4, 39.9, 0],
 *     properties: { identity: 'friend', name: '第1坦克营' }
 *   });
 */

/** 阵营编码（SIDC 第 11 位） */
export const SIDC_IDENTITY: Record<string, string> = {
  FRIEND:           'A',  // 友方 (Friend)
  HOSTILE:          'H',  // 敌方 (Hostile)
  NEUTRAL:          'N',  // 中立 (Neutral)
  UNKNOWN:          'U',  // 未知 (Unknown)
  ASSUMED_FRIEND:   'A',  // 推定友方
  SUSPECT:          'S',  // 嫌疑
  PENDING:          'P',  // 待定
  EXERCISE_FRIEND:  'A',  // 演习友方
  EXERCISE_HOSTILE: 'H',  // 演习敌方
  JOKER:            'J',  // 模拟
  FAKER:            'F'   // 伪装
};

/** 领域编码（SIDC 第 4 位） */
export const SIDC_DOMAIN: Record<string, string> = {
  GROUND:      'G',
  AIR:         'A',
  SEA:         'S',
  SUBSURFACE:  'W',
  SPACE:       'X',
  SOF:         'F',
  CYBER:       'C'
};

/**
 * 地面单位 SIDC 对照表
 * 基础前缀: S{G/H/N/U}FG
 */
export const GroundSymbols = {
  /** 敌方 */
  HOSTILE_TANK:        'SHFGUCI---H---',
  HOSTILE_ARMOR:       'SHFGUCI---H---',
  HOSTILE_INFANTRY:    'SHFGUIA---H---',
  HOSTILE_MECHANIZED:  'SHFGUMI---H---',
  HOSTILE_ARTILLERY:   'SHFGUFA---H---',
  HOSTILE_AIR_DEFENSE: 'SHFGUAD---H---',
  HOSTILE_RECON:       'SHFGURC---H---',
  HOSTILE_ENGINEER:    'SHFGUEN---H---',
  HOSTILE_HEADQUARTERS:'SHFGUHQ---H---',
  HOSTILE_AMBULANCE:   'SHFGUMB---H---',
  HOSTILE_SUPPLY:      'SHFGUSP---H---',
  HOSTILE_MAINTENANCE: 'SHFGUMN---H---',
  HOSTILE_MORTAR:      'SHFGUMA---H---',
  HOSTILE_MISSILE:     'SHFGUMS---H---',
  HOSTILE_BRIDGE:      'SHFGUBG---H---',
  HOSTILE_DECON:       'SHFGUDC---H---',
  HOSTILE_RADAR:       'SHFGURD---H---',
  HOSTILE_SIGNAL:      'SHFGUSG---H---',
  HOSTILE_TRANSPORT:   'SHFGUTR---H---',
  HOSTILE_WEATHER:     'SHFGUWE---H---',

  /** 友方 */
  FRIENDLY_TANK:        'SFGPUCA---A---',
  FRIENDLY_ARMOR:       'SFGPUCA---A---',
  FRIENDLY_INFANTRY:    'SFGPUIA---A---',
  FRIENDLY_MECHANIZED:  'SFGPUMI---A---',
  FRIENDLY_ARTILLERY:   'SFGPUFA---A---',
  FRIENDLY_AIR_DEFENSE: 'SFGPUAD---A---',
  FRIENDLY_RECON:       'SFGPURC---A---',
  FRIENDLY_ENGINEER:    'SFGPUEN---A---',
  FRIENDLY_HEADQUARTERS:'SFGPUHQ---A---',
  FRIENDLY_AMBULANCE:   'SFGPUMB---A---',
  FRIENDLY_SUPPLY:      'SFGPUSP---A---',
  FRIENDLY_MAINTENANCE: 'SFGPUMN---A---',
  FRIENDLY_MORTAR:      'SFGPUMA---A---',
  FRIENDLY_MISSILE:     'SFGPUMS---A---',
  FRIENDLY_BRIDGE:      'SFGPUBG---A---',
  FRIENDLY_DECON:       'SFGPUDC---A---',
  FRIENDLY_RADAR:       'SFGPURD---A---',
  FRIENDLY_SIGNAL:      'SFGPUSG---A---',
  FRIENDLY_TRANSPORT:   'SFGPUTR---A---',
  FRIENDLY_WEATHER:     'SFGPUWE---A---',

  /** 中立 */
  NEUTRAL_TANK:        'SNFGUCI---N---',
  NEUTRAL_INFANTRY:    'SNFGUIA---N---',
  NEUTRAL_ARTILLERY:   'SNFGUFA---N---',
  NEUTRAL_RECON:       'SNFGURC---N---',

  /** 未知 */
  UNKNOWN_TANK:        'SUFGUCI---U---',
  UNKNOWN_INFANTRY:    'SUFGUIA---U---',
  UNKNOWN_ARTILLERY:   'SUFGUFA---U---',
  UNKNOWN_RECON:       'SUFGURC---U---',
};

/**
 * 空中单位 SIDC 对照表
 */
export const AirSymbols = {
  HOSTILE_FIXED_WING:    'SHFAPMF---H---',
  HOSTILE_HELICOPTER:    'SHFAHMF---H---',
  HOSTILE_UAV:           'SHFAPUAV---H---',
  HOSTILE_MISSILE:       'SHFAMSL---H---',
  HOSTILE_AWACS:         'SHFAAWACS-H---',
  HOSTILE_TANKER:        'SHFATKR---H---',
  HOSTILE_TRANSPORT:     'SHFATRP---H---',

  FRIENDLY_FIXED_WING:   'SFFAPMF---A---',
  FRIENDLY_HELICOPTER:   'SFFAHMF---A---',
  FRIENDLY_UAV:          'SFFAPUAV--A---',
  FRIENDLY_AWACS:        'SFFAAWACS-A---',

  NEUTRAL_FIXED_WING:    'SNFAPMF---N---',
  UNKNOWN_FIXED_WING:    'SUFAPMF---U---',
};

/**
 * 海上单位 SIDC 对照表
 */
export const SeaSymbols = {
  HOSTILE_SURFACE:      'SHFSNCI---H---',
  HOSTILE_SUBMARINE:    'SHFSWCI---H---',
  HOSTILE_CARRIER:      'SHFSNCV---H---',
  HOSTILE_DESTROYER:    'SHFSNDD---H---',
  HOSTILE_FRIGATE:      'SHFSNFF---H---',
  HOSTILE_LANDING:      'SHFSNLC---H---',
  HOSTILE_PATROL:       'SHFSNPC---H---',
  HOSTILE_MINE:         'SHFSNMW---H---',

  FRIENDLY_SURFACE:     'SFFSNCI---A---',
  FRIENDLY_CARRIER:     'SFFSNCV---A---',
  FRIENDLY_DESTROYER:   'SFFSDND---A---',
  FRIENDLY_SUBMARINE:   'SFFSWCI---A---',
};

/**
 * 通用 MIL-STD-2525D 符号常量
 * 按使用频度排序
 */
export const MilSIDC = {
  /** 地面单位 */
  Ground: GroundSymbols,
  /** 空中单位 */
  Air: AirSymbols,
  /** 海上单位 */
  Sea: SeaSymbols,

  /** 常用符号快捷访问（不区分阵营版） */
  TANK:        GroundSymbols.FRIENDLY_TANK,
  INFANTRY:    GroundSymbols.FRIENDLY_INFANTRY,
  ARTILLERY:   GroundSymbols.FRIENDLY_ARTILLERY,
  UAV:         AirSymbols.FRIENDLY_UAV,
  HELICOPTER:  AirSymbols.FRIENDLY_HELICOPTER,
  FIXED_WING:  AirSymbols.FRIENDLY_FIXED_WING,
  SHIP:        SeaSymbols.FRIENDLY_SURFACE,
  SUBMARINE:   SeaSymbols.FRIENDLY_SUBMARINE,
  CARRIER:     SeaSymbols.FRIENDLY_CARRIER,
  HEADQUARTERS:GroundSymbols.FRIENDLY_HEADQUARTERS,
  RADAR:       GroundSymbols.FRIENDLY_RADAR,

  /**
   * 根据阵营和类型快速生成 SIDC
   * @param baseSidc 基础 SIDC（友方版本）
   * @param identity 目标阵营 ('friend'|'hostile'|'neutral'|'unknown')
   */
  withIdentity(baseSidc: string, identity: string): string {
    const sidc = baseSidc.toUpperCase();
    if (sidc.length < 11) return sidc;

    const map: Record<string, string> = {
      friend: 'A',
      hostile: 'H',
      neutral: 'N',
      unknown: 'U'
    };
    const code = map[identity.toLowerCase()];
    if (!code) return sidc;

    return sidc.substring(0, 10) + code + sidc.substring(11);
  }
};
