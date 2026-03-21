/**
 * 图元分类目录
 * 基于 MIL-STD-2525D 标准的分类体系
 */

import { MilitaryDomain, SIDC, AdvancedPrimitive } from '../../types';

/**
 * 图元类别定义
 */
export interface PrimitiveCategory {
  domain: MilitaryDomain;
  code: string;                    // 类别代码
  name: string;                    // 中文名称
  description?: string;            // 描述
  sidcPattern: string;             // SIDC匹配模式（支持通配符）
  icon?: string;                   // 类别图标
  subCategories?: PrimitiveSubCategory[]; // 子类别
}

/**
 * 图元子类别
 */
export interface PrimitiveSubCategory {
  code: string;                    // 子类别代码
  name: string;                    // 中文名称
  description?: string;            // 描述
  sidcPattern: string;             // SIDC匹配模式
  exampleSidcs: SIDC[];            // 示例SIDC
  properties: {
    default?: Record<string, any>; // 默认属性
    required?: string[];           // 必需属性
    schema?: Record<string, any>;  // 属性模式定义
  };
}

/**
 * MIL-STD-2525D 标准图元目录
 */
export class PrimitiveCatalog {
  private categories: PrimitiveCategory[] = [];
  private sidcToCategory = new Map<SIDC, PrimitiveCategory>();
  private domainCategories = new Map<MilitaryDomain, PrimitiveCategory[]>();

  constructor() {
    this.initializeStandardCategories();
    this.buildIndexes();
  }

  /**
   * 初始化标准分类
   */
  private initializeStandardCategories(): void {
    // ========== 陆地领域 ==========
    this.categories.push({
      domain: MilitaryDomain.LAND,
      code: 'LAND_UNIT',
      name: '陆地单位',
      description: '地面作战单位',
      sidcPattern: 'SFGPU*-----*---',
      subCategories: [
        {
          code: 'INFANTRY',
          name: '步兵',
          sidcPattern: 'SFGPUCI---A---',
          exampleSidcs: ['SFGPUCI---A---', 'SFGPUCI---H---'],
          properties: {
            default: { mobility: 'foot', echelon: 'team' },
            required: ['strength'],
            schema: {
              strength: { type: 'string', enum: ['TEAM', 'SQD', 'PLT', 'COY', 'BN'] },
              equipment: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        {
          code: 'ARMOR',
          name: '装甲单位',
          sidcPattern: 'SFGPUCA---A---',
          exampleSidcs: ['SFGPUCA---A---', 'SFGPUCA---H---'],
          properties: {
            default: { mobility: 'tracked', armorType: 'main_battle_tank' },
            required: ['armorType'],
            schema: {
              armorType: { type: 'string', enum: ['MBT', 'IFV', 'APC', 'RECCE'] },
              gunCaliber: { type: 'number' }
            }
          }
        },
        {
          code: 'ARTILLERY',
          name: '炮兵',
          sidcPattern: 'SFGPUCF---A---',
          exampleSidcs: ['SFGPUCF---A---', 'SFGPUCF---H---'],
          properties: {
            default: { unitType: 'artillery', range: 'medium' },
            schema: {
              caliber: { type: 'number' },
              range: { type: 'string', enum: ['short', 'medium', 'long', 'very_long'] }
            }
          }
        }
      ]
    });

    this.categories.push({
      domain: MilitaryDomain.LAND,
      code: 'LAND_EQUIPMENT',
      name: '陆地装备',
      description: '地面装备与设施',
      sidcPattern: 'SFGPE*-----*---',
      subCategories: [
        {
          code: 'RADAR',
          name: '雷达站',
          sidcPattern: 'SFGPESR---A---',
          exampleSidcs: ['SFGPESR---A---', 'SFGPESR---H---'],
          properties: {
            default: { equipmentType: 'radar', detectionRange: 100000 },
            required: ['detectionRange'],
            schema: {
              frequencyBand: { type: 'string' },
              detectionRange: { type: 'number' },
              accuracy: { type: 'number' }
            }
          }
        }
      ]
    });

    // ========== 海上领域 ==========
    this.categories.push({
      domain: MilitaryDomain.SEA,
      code: 'SEA_SURFACE',
      name: '水面舰艇',
      description: '水面作战舰艇',
      sidcPattern: 'SFSPU*-----*---',
      subCategories: [
        {
          code: 'COMBATANT',
          name: '作战舰艇',
          sidcPattern: 'SFSPUC---A---',
          exampleSidcs: ['SFSPUC---A---', 'SFSPUC---H---'],
          properties: {
            default: { vesselType: 'combatant', displacement: 5000 },
            schema: {
              vesselType: { type: 'string', enum: ['DESTROYER', 'FRIGATE', 'CORVETTE', 'PATROL'] },
              displacement: { type: 'number' },
              speed: { type: 'number' },
              weapons: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        {
          code: 'AUXILIARY',
          name: '辅助舰船',
          sidcPattern: 'SFSPUA---A---',
          exampleSidcs: ['SFSPUA---A---', 'SFSPUA---H---'],
          properties: {
            default: { vesselType: 'auxiliary', function: 'support' },
            schema: {
              function: { type: 'string', enum: ['SUPPLY', 'REPAIR', 'MEDICAL', 'COMMAND'] }
            }
          }
        }
      ]
    });

    this.categories.push({
      domain: MilitaryDomain.SEA,
      code: 'SEA_SUBSURFACE',
      name: '水下舰艇',
      description: '潜艇与水下设备',
      sidcPattern: 'SFSPW*-----*---',
      subCategories: [
        {
          code: 'SUBMARINE',
          name: '潜艇',
          sidcPattern: 'SFSPWC---A---',
          exampleSidcs: ['SFSPWC---A---', 'SFSPWC---H---'],
          properties: {
            default: { submarineType: 'attack', maxDepth: 300 },
            required: ['maxDepth'],
            schema: {
              submarineType: { type: 'string', enum: ['ATTACK', 'BALLISTIC', 'CRUISE_MISSILE'] },
              maxDepth: { type: 'number' },
              endurance: { type: 'number' }
            }
          }
        }
      ]
    });

    // ========== 空中领域 ==========
    this.categories.push({
      domain: MilitaryDomain.AIR,
      code: 'AIR_FIXED_WING',
      name: '固定翼飞机',
      description: '固定翼航空器',
      sidcPattern: 'SFAFU*-----*---',
      subCategories: [
        {
          code: 'FIGHTER',
          name: '战斗机',
          sidcPattern: 'SFAFUC---A---',
          exampleSidcs: ['SFAFUC---A---', 'SFAFUC---H---'],
          properties: {
            default: { aircraftType: 'fighter', maxSpeed: 2000 },
            schema: {
              aircraftType: { type: 'string', enum: ['FIGHTER', 'BOMBER', 'AWACS', 'TANKER'] },
              maxSpeed: { type: 'number' },
              serviceCeiling: { type: 'number' },
              weapons: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        {
          code: 'UAV',
          name: '无人机',
          sidcPattern: 'SFAFUU---A---',
          exampleSidcs: ['SFAFUU---A---', 'SFAFUU---H---'],
          properties: {
            default: { uavType: 'reconnaissance', autonomy: 24 },
            schema: {
              uavType: { type: 'string', enum: ['RECON', 'STRIKE', 'MALE', 'HALE'] },
              autonomy: { type: 'number' },
              payload: { type: 'string' }
            }
          }
        }
      ]
    });

    this.categories.push({
      domain: MilitaryDomain.AIR,
      code: 'AIR_ROTARY_WING',
      name: '旋翼飞机',
      description: '直升机等旋翼航空器',
      sidcPattern: 'SFARU*-----*---',
      subCategories: [
        {
          code: 'HELICOPTER',
          name: '直升机',
          sidcPattern: 'SFARUC---A---',
          exampleSidcs: ['SFARUC---A---', 'SFARUC---H---'],
          properties: {
            default: { helicopterType: 'utility', maxSpeed: 300 },
            schema: {
              helicopterType: { type: 'string', enum: ['ATTACK', 'UTILITY', 'TRANSPORT', 'MEDEVAC'] },
              maxSpeed: { type: 'number' },
              range: { type: 'number' }
            }
          }
        }
      ]
    });

    // ========== 太空领域 ==========
    this.categories.push({
      domain: MilitaryDomain.SPACE,
      code: 'SPACE_SATELLITE',
      name: '卫星',
      description: '人造卫星',
      sidcPattern: 'SFSXU*-----*---',
      subCategories: [
        {
          code: 'RECON_SAT',
          name: '侦察卫星',
          sidcPattern: 'SFSXUI---A---',
          exampleSidcs: ['SFSXUI---A---', 'SFSXUI---H---'],
          properties: {
            default: { satelliteType: 'reconnaissance', orbitType: 'LEO' },
            required: ['orbitType'],
            schema: {
              orbitType: { type: 'string', enum: ['LEO', 'MEO', 'GEO', 'HEO'] },
              resolution: { type: 'number' },
              revisitTime: { type: 'number' }
            }
          }
        },
        {
          code: 'COMM_SAT',
          name: '通信卫星',
          sidcPattern: 'SFSXUC---A---',
          exampleSidcs: ['SFSXUC---A---', 'SFSXUC---H---'],
          properties: {
            default: { satelliteType: 'communication', bandwidth: 1000 },
            schema: {
              bandwidth: { type: 'number' },
              coverage: { type: 'string' },
              transponders: { type: 'number' }
            }
          }
        }
      ]
    });

    // ========== 低空领域 ==========
    this.categories.push({
      domain: MilitaryDomain.LAND, // 注：低空领域在2525D中无独立编码，暂归类到LAND
      code: 'LOW_ALTITUDE',
      name: '低空目标',
      description: '低空飞行器与平台',
      sidcPattern: 'SFAFU*-----*---', // 使用空中单位编码
      subCategories: [
        {
          code: 'SMALL_UAV',
          name: '小型无人机',
          sidcPattern: 'SFAFUU---A---',
          exampleSidcs: ['SFAFUU---A---', 'SFAFUU---H---'],
          properties: {
            default: { uavClass: 'small', maxAltitude: 1000 },
            schema: {
              uavClass: { type: 'string', enum: ['MICRO', 'MINI', 'SMALL', 'TACTICAL'] },
              maxAltitude: { type: 'number' },
              endurance: { type: 'number' }
            }
          }
        },
        {
          code: 'AIRSHIP',
          name: '飞艇',
          sidcPattern: 'SFAFUB---A---',
          exampleSidcs: ['SFAFUB---A---', 'SFAFUB---H---'],
          properties: {
            default: { airshipType: 'blimp', endurance: 72 },
            schema: {
              airshipType: { type: 'string', enum: ['BLIMP', 'RIGID'] },
              endurance: { type: 'number' },
              payloadCapacity: { type: 'number' }
            }
          }
        }
      ]
    });

    // ========== 水下领域 ==========
    this.categories.push({
      domain: MilitaryDomain.SUBSURFACE,
      code: 'UNDERWATER',
      name: '水下设备',
      description: '水下传感器与设备',
      sidcPattern: 'SFSPW*-----*---',
      subCategories: [
        {
          code: 'SONAR',
          name: '声呐阵列',
          sidcPattern: 'SFGPESR---A---', // 使用雷达站编码
          exampleSidcs: ['SFGPESR---A---'],
          properties: {
            default: { sensorType: 'sonar', detectionRange: 50000 },
            schema: {
              sensorType: { type: 'string', enum: ['ACTIVE', 'PASSIVE', 'TOWED'] },
              detectionRange: { type: 'number' },
              frequency: { type: 'number' }
            }
          }
        }
      ]
    });
  }

  /**
   * 构建索引
   */
  private buildIndexes(): void {
    // 构建领域分类索引
    this.categories.forEach(category => {
      if (!this.domainCategories.has(category.domain)) {
        this.domainCategories.set(category.domain, []);
      }
      this.domainCategories.get(category.domain)!.push(category);
      
      // 构建SIDC模式匹配索引（简化）
      // 注意：实际需要实现模式匹配逻辑
      if (category.subCategories) {
        category.subCategories.forEach(subCategory => {
          subCategory.exampleSidcs.forEach(sidc => {
            this.sidcToCategory.set(sidc, category);
          });
        });
      }
    });
  }

  /**
   * 根据SIDC查找分类
   */
  findCategoryBySidc(sidc: SIDC): PrimitiveCategory | null {
    // 1. 精确匹配
    if (this.sidcToCategory.has(sidc)) {
      return this.sidcToCategory.get(sidc)!;
    }
    
    // 2. 模式匹配
    for (const category of this.categories) {
      if (this.matchSidcPattern(sidc, category.sidcPattern)) {
        return category;
      }
      
      // 检查子类别
      if (category.subCategories) {
        for (const subCategory of category.subCategories) {
          if (this.matchSidcPattern(sidc, subCategory.sidcPattern)) {
            return category;
          }
        }
      }
    }
    
    // 3. 根据领域推测
    const domain = this.guessDomainFromSidc(sidc);
    const domainCats = this.domainCategories.get(domain);
    return domainCats && domainCats.length > 0 ? domainCats[0] : null;
  }

  /**
   * 获取领域下的所有分类
   */
  getCategoriesByDomain(domain: MilitaryDomain): PrimitiveCategory[] {
    return this.domainCategories.get(domain) || [];
  }

  /**
   * 获取所有分类
   */
  getAllCategories(): PrimitiveCategory[] {
    return [...this.categories];
  }

  /**
   * 获取分类的默认属性
   */
  getDefaultProperties(sidc: SIDC): Record<string, any> {
    const category = this.findCategoryBySidc(sidc);
    if (!category || !category.subCategories) return {};
    
    // 查找匹配的子类别
    for (const subCategory of category.subCategories) {
      if (this.matchSidcPattern(sidc, subCategory.sidcPattern)) {
        return subCategory.properties.default || {};
      }
    }
    
    return {};
  }

  /**
   * 添加自定义分类
   */
  addCustomCategory(category: PrimitiveCategory): void {
    this.categories.push(category);
    this.buildIndexes(); // 重建索引
  }

  /**
   * SIDC模式匹配
   */
  private matchSidcPattern(sidc: SIDC, pattern: string): boolean {
    if (sidc.length !== pattern.length) {
      return false;
    }
    
    for (let i = 0; i < sidc.length; i++) {
      const patternChar = pattern[i];
      const sidcChar = sidc[i];
      
      if (patternChar === '*') continue; // 通配符
      if (patternChar === sidcChar) continue; // 字符匹配
      if (patternChar === '-' && sidcChar === '-') continue; // 破折号匹配
      
      return false;
    }
    
    return true;
  }

  /**
   * 根据SIDC推测领域
   */
  private guessDomainFromSidc(sidc: SIDC): MilitaryDomain {
    const symbolCode = sidc.substring(3, 10);
    
    // MIL-STD-2525D 编码规则：
    // 位置4: 领域标识
    const domainChar = symbolCode[0];
    
    switch (domainChar) {
      case 'G': return MilitaryDomain.LAND;      // 地面
      case 'S': return MilitaryDomain.SEA;       // 海上
      case 'F': return MilitaryDomain.AIR;       // 固定翼
      case 'R': return MilitaryDomain.AIR;       // 旋翼
      case 'X': return MilitaryDomain.SPACE;     // 太空
      case 'W': return MilitaryDomain.SUBSURFACE; // 水下
      case 'I': return MilitaryDomain.SIGNAL;    // 信号
      case 'C': return MilitaryDomain.CYBER;     // 网络
      case 'A': return MilitaryDomain.ACTIVITY;  // 活动
      default: return MilitaryDomain.LAND;
    }
  }

  /**
   * 验证SIDC格式
   */
  validateSidc(sidc: SIDC): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // 基本格式检查
    if (typeof sidc !== 'string') {
      errors.push('SIDC must be a string');
      return { valid: false, errors };
    }
    
    if (sidc.length !== 15) {
      errors.push(`SIDC must be 15 characters, got ${sidc.length}`);
    }
    
    // 版本标识检查（位置1-2）
    const version = sidc.substring(0, 2);
    if (!['SF', 'SO', 'SI', 'SH'].includes(version)) {
      errors.push(`Invalid version identifier: ${version}`);
    }
    
    // 标准标识检查（位置3）
    const standard = sidc[2];
    if (!['W', 'I', 'H', 'S'].includes(standard)) {
      errors.push(`Invalid standard identifier: ${standard}`);
    }
    
    // 符号代码检查（位置4-10）
    const symbolCode = sidc.substring(3, 10);
    if (!/^[A-Z*\-]{7}$/.test(symbolCode)) {
      errors.push(`Invalid symbol code: ${symbolCode}`);
    }
    
    // 修饰符检查（位置11）
    const modifier = sidc[10];
    if (!/^[A-Z\-]$/.test(modifier)) {
      errors.push(`Invalid modifier: ${modifier}`);
    }
    
    // 属性扩展检查（位置12-15）
    const attributes = sidc.substring(11);
    if (!/^[A-Z0-9*\-]{4}$/.test(attributes)) {
      errors.push(`Invalid attributes: ${attributes}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 生成示例SIDC
   */
  generateExampleSidc(categoryCode: string, subCategoryCode?: string): SIDC | null {
    for (const category of this.categories) {
      if (category.code === categoryCode) {
        if (!category.subCategories || !subCategoryCode) {
          // 返回类别的第一个示例SIDC
          if (category.subCategories && category.subCategories.length > 0) {
            const example = category.subCategories[0].exampleSidcs[0];
            return example || null;
          }
          return null;
        }
        
        // 查找子类别
        const subCategory = category.subCategories.find(
          sub => sub.code === subCategoryCode
        );
        if (subCategory && subCategory.exampleSidcs.length > 0) {
          return subCategory.exampleSidcs[0];
        }
      }
    }
    
    return null;
  }
}