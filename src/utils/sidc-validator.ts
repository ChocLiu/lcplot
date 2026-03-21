/**
 * SIDC（Symbol Identification Coding）验证工具
 * 基于 MIL-STD-2525D 标准
 */

import { MilitaryDomain } from '../types';

/**
 * 验证SIDC编码格式
 * MIL-STD-2525D SIDC应为15位字符
 * 格式: SSSSSSSSSSSSSSS (15位)
 * 
 * 示例有效SIDC:
 * - SFGPUCA---A--- (友方坦克)
 * - SFAPMF----A--- (敌方固定翼飞机)
 * - SNGUCI----A--- (中立海上单位)
 */
export class SIDCValidator {
  /**
   * 验证SIDC长度和基本格式
   */
  static validate(sidc: string): boolean {
    if (!sidc || typeof sidc !== 'string') {
      return false;
    }
    
    // 清理空格和特殊字符
    const cleanSidc = sidc.trim().toUpperCase().replace(/\s+/g, '');
    
    // 标准SIDC应为15位
    if (cleanSidc.length !== 15) {
      console.warn(`SIDC长度应为15位，实际为${cleanSidc.length}位: ${cleanSidc}`);
      return false;
    }
    
    // 基本字符验证（字母、数字、破折号）
    if (!/^[A-Z0-9\-]{15}$/.test(cleanSidc)) {
      console.warn(`SIDC包含无效字符: ${cleanSidc}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * 规范化SIDC（补全到15位）
   * 如果SIDC太短，用破折号补全
   * 如果SIDC太长，截断到15位
   */
  static normalize(sidc: string): string {
    if (!sidc || typeof sidc !== 'string') {
      return '---------------'; // 15个破折号
    }
    
    let cleanSidc = sidc.trim().toUpperCase().replace(/\s+/g, '');
    
    if (cleanSidc.length > 15) {
      cleanSidc = cleanSidc.substring(0, 15);
    } else if (cleanSidc.length < 15) {
      cleanSidc = cleanSidc.padEnd(15, '-');
    }
    
    return cleanSidc;
  }
  
  /**
   * 从SIDC解析军事领域
   * 根据MIL-STD-2525D，第4位（索引3）表示领域
   */
  static parseDomain(sidc: string): MilitaryDomain {
    const normalized = this.normalize(sidc);
    
    if (normalized.length < 4) {
      return MilitaryDomain.LAND;
    }
    
    const domainChar = normalized[3];
    
    switch (domainChar) {
      case 'G': return MilitaryDomain.LAND;       // 地面
      case 'F': 
      case 'R': return MilitaryDomain.AIR;        // 空中
      case 'S': return MilitaryDomain.SEA;        // 海上
      case 'W': return MilitaryDomain.SUBSURFACE; // 水下
      case 'X': return MilitaryDomain.SPACE;      // 太空
      case 'I': return MilitaryDomain.SIGNAL;     // 信号
      case 'C': return MilitaryDomain.CYBER;      // 网络
      case 'A': return MilitaryDomain.ACTIVITY;   // 活动
      case 'L': return MilitaryDomain.LAND;       // 陆地（备用）
      case 'N': return MilitaryDomain.SEA;        // 海上（备用）
      case 'U': return MilitaryDomain.SUBSURFACE; // 水下（备用）
      case 'P': return MilitaryDomain.AIR;        // 空中（备用）
      default: return MilitaryDomain.LAND;
    }
  }
  
  /**
   * 从SIDC解析阵营标识
   * 第11位（索引10）表示阵营
   */
  static parseIdentity(sidc: string): string {
    const normalized = this.normalize(sidc);
    
    if (normalized.length < 11) {
      return 'U'; // 未知
    }
    
    const identityChar = normalized[10];
    return identityChar;
  }
  
  /**
   * 生成示例SIDC
   * 用于测试和演示
   */
  static generateExample(domain: MilitaryDomain = MilitaryDomain.LAND, identity: string = 'F'): string {
    // 基础模板：符号集编码 + 领域 + 标准标识码
    let base = 'S';
    
    // 添加领域标识
    switch (domain) {
      case MilitaryDomain.LAND: base += 'FG'; break;
      case MilitaryDomain.AIR: base += 'FA'; break;
      case MilitaryDomain.SEA: base += 'SN'; break;
      case MilitaryDomain.SUBSURFACE: base += 'SW'; break;
      case MilitaryDomain.SPACE: base += 'SX'; break;
      case MilitaryDomain.CYBER: base += 'SC'; break;
      case MilitaryDomain.SIGNAL: base += 'SI'; break;
      case MilitaryDomain.ACTIVITY: base += 'SA'; break;
      default: base += 'FG'; break;
    }
    
    // 添加功能编码和阵营
    base += 'UCI----' + identity + '---';
    
    // 确保长度正确
    return this.normalize(base);
  }
  
  /**
   * 检查是否为有效的美军标SIDC
   * 而不仅仅是格式正确的字符串
   */
  static isMilStd2525D(sidc: string): boolean {
    const normalized = this.normalize(sidc);
    
    // 检查符号集编码（前两位）
    const symbolSet = normalized.substring(0, 2);
    const validSymbolSets = ['SF', 'SN', 'SW', 'SX', 'SI', 'SC', 'SA', 'SO'];
    
    if (!validSymbolSets.includes(symbolSet)) {
      return false;
    }
    
    return this.validate(normalized);
  }
}