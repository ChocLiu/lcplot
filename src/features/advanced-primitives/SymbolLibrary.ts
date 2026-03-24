/**
 * 美军标符号库管理器
 * 负责 MIL-STD-2525D 图标资源的加载、缓存和管理
 */

import { SIDC, SymbolResourceConfig, IdentityCode } from '../../types';

export class SymbolLibrary {
  private config: SymbolResourceConfig;
  private cache = new Map<string, HTMLImageElement>();
  private loadingPromises = new Map<string, Promise<HTMLImageElement>>();
  private errorCache = new Set<string>(); // 记录加载失败的图标
  private svgDataUrlCache = new Map<string, string>(); // 缓存生成的 SVG Data URL

  constructor(config: SymbolResourceConfig) {
    this.config = config;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SymbolResourceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 根据SIDC解析图标URL
   */
  resolveSymbolUrl(sidc: SIDC): string {
    // MIL-STD-2525D 图标命名规则：
    // 格式: {SIDC}.{format}
    // 示例: SFGPUCA---A---.svg
    
    const { baseUrl, format } = this.config;
    
    // 清理SIDC中的空格和无效字符
    const cleanSidc = sidc.trim().toUpperCase().replace(/\s+/g, '');
    
    // 构建完整URL
    return `${baseUrl.replace(/\/$/, '')}/${cleanSidc}.${format}`;
  }

  /**
   * 加载单个图标
   */
  async loadSymbol(sidc: SIDC): Promise<HTMLImageElement> {
    const url = this.resolveSymbolUrl(sidc);
    
    // 检查缓存
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }
    
    // 检查是否正在加载
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)!;
    }
    
    // 检查是否已记录为加载失败
    if (this.errorCache.has(url)) {
      throw new Error(`Symbol ${sidc} previously failed to load`);
    }
    
    // 创建加载Promise
    const loadPromise = this.loadImage(url);
    this.loadingPromises.set(url, loadPromise);
    
    try {
      const image = await loadPromise;
      
      // 加载成功，存入缓存
      this.cache.set(url, image);
      this.loadingPromises.delete(url);
      
      return image;
    } catch (error) {
      // 加载失败，记录错误
      this.errorCache.add(url);
      this.loadingPromises.delete(url);
      
      // 尝试加载备用图标
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load symbol ${sidc}: ${errorMessage}`);
      return this.loadFallbackSymbol(sidc);
    }
  }

  /**
   * 预加载一组图标
   */
  async preloadSymbols(sidcs: SIDC[]): Promise<void> {
    const promises = sidcs.map(sidc => this.loadSymbol(sidc).catch(() => null));
    await Promise.all(promises);
  }

  /**
   * 批量加载图标
   */
  async loadSymbols(sidcs: SIDC[]): Promise<Map<SIDC, HTMLImageElement>> {
    const results = new Map<SIDC, HTMLImageElement>();
    const promises = sidcs.map(async (sidc) => {
      try {
        const image = await this.loadSymbol(sidc);
        results.set(sidc, image);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to load symbol ${sidc}: ${errorMessage}`);
      }
    });
    
    await Promise.all(promises);
    return results;
  }

  /**
   * 根据阵营获取颜色
   */
  getIdentityColor(identity: IdentityCode): string {
    return this.config.identityColors[identity] || '#FFFFFF';
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
    this.errorCache.clear();
    this.svgDataUrlCache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    cached: number;
    loading: number;
    errors: number;
    svgCached: number;
  } {
    return {
      cached: this.cache.size,
      loading: this.loadingPromises.size,
      errors: this.errorCache.size,
      svgCached: this.svgDataUrlCache.size
    };
  }

  /**
   * 加载图片辅助方法
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        // 调整尺寸到配置的标准尺寸
        if (this.config.size[0] > 0 && this.config.size[1] > 0) {
          // 如果需要调整尺寸，可以在这里实现
          // 注意：直接调整Image尺寸会影响质量，通常使用CSS控制显示尺寸
        }
        resolve(img);
      };
      
      img.onerror = () => {
        reject(new Error(`Failed to load image from ${url}`));
      };
      
      // 设置超时
      setTimeout(() => {
        if (!img.complete) {
          img.src = ''; // 中断加载
          reject(new Error(`Image load timeout: ${url}`));
        }
      }, 10000); // 10秒超时
      
      img.src = url;
    });
  }

  /**
   * 加载备用图标（当指定图标不存在时）
   */
  private async loadFallbackSymbol(sidc: SIDC): Promise<HTMLImageElement> {
    // 备用策略：
    // 1. 尝试使用 milsymbol 生成 SVG 图标（如果可用）
    // 2. 尝试加载通用图标
    // 3. 创建简易的Canvas图标
    // 4. 使用纯色方块
    
    // 首先尝试使用 milsymbol 生成 SVG
    const svgImage = await this.tryGenerateSvgSymbol(sidc);
    if (svgImage) {
      return svgImage;
    }
    
    const fallbackSidc = this.getFallbackSidc(sidc);
    if (fallbackSidc !== sidc) {
      try {
        return await this.loadSymbol(fallbackSidc);
      } catch (error) {
        // 继续尝试其他备用方案
      }
    }
    
    // 创建Canvas图标
    return this.createCanvasSymbol(sidc);
  }

  /**
   * 尝试使用 milsymbol 生成 SVG 图标
   */
  private async tryGenerateSvgSymbol(sidc: SIDC): Promise<HTMLImageElement | null> {
    // 检查是否在浏览器环境中且 milsymbol 可用
    if (typeof window === 'undefined') {
      return null; // 非浏览器环境
    }
    const ms = (window as any).ms;
    if (!ms || typeof ms.Symbol !== 'function') {
      return null; // milsymbol 未加载
    }
    try {
      // 生成缓存键：包含 SIDC 和配置尺寸
      const cacheKey = `${sidc}:${this.config.size[0]}`;
      
      // 检查 SVG Data URL 缓存
      if (this.svgDataUrlCache.has(cacheKey)) {
        const cachedDataUrl = this.svgDataUrlCache.get(cacheKey)!;
        return this.loadImage(cachedDataUrl);
      }
      
      // 生成 SVG
      const symbol = new ms.Symbol(sidc, { size: this.config.size[0] });
      const svgString = symbol.asSVG();
      const dataUrl = 'data:image/svg+xml;base64,' + btoa(svgString);
      
      // 缓存 Data URL
      this.svgDataUrlCache.set(cacheKey, dataUrl);
      
      // 限制缓存大小（最多 100 个条目）
      if (this.svgDataUrlCache.size > 100) {
        // 删除第一个（最旧的）条目
        const firstKey = this.svgDataUrlCache.keys().next().value;
        if (firstKey) {
          this.svgDataUrlCache.delete(firstKey);
        }
      }
      
      return this.loadImage(dataUrl);
    } catch (error) {
      console.warn(`Failed to generate SVG symbol for ${sidc}:`, error);
      return null;
    }
  }

  /**
   * 获取备用SIDC
   */
  private getFallbackSidc(sidc: SIDC): SIDC {
    // 通用备用规则：
    // 1. 如果是具体单位类型，降级为通用类型
    // 2. 如果无法降级，使用领域通用图标
    
    const standard = sidc[2]; // 第3位：标准标识
    const symbolCode = sidc.substring(3, 10); // 第4-10位：符号代码
    
    // 示例：地面单位 -> 通用地面图标
    if (symbolCode.startsWith('G')) {
      // 地面单位
      return sidc.substring(0, 3) + 'G*-----' + sidc.substring(10);
    }
    // 空中单位
    else if (symbolCode.startsWith('F')) {
      return sidc.substring(0, 3) + 'F*-----' + sidc.substring(10);
    }
    // 海上单位
    else if (symbolCode.startsWith('S')) {
      return sidc.substring(0, 3) + 'S*-----' + sidc.substring(10);
    }
    
    // 无法确定，返回原始SIDC
    return sidc;
  }

  /**
   * 创建Canvas绘制的简易图标
   */
  private createCanvasSymbol(sidc: SIDC): HTMLImageElement {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    const [width, height] = this.config.size;
    canvas.width = width;
    canvas.height = height;
    
    // 解析SIDC基本信息
    const identity = this.extractIdentityFromSidc(sidc);
    const color = this.getIdentityColor(identity);
    
    // 绘制基础形状
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    
    // 根据符号类型绘制不同形状
    const symbolCode = sidc.substring(3, 10);
    if (symbolCode.includes('I')) {
      // 情报符号
      this.drawDiamond(ctx, width, height);
    } else if (symbolCode.includes('U')) {
      // 单位符号
      this.drawRectangle(ctx, width, height);
    } else {
      // 默认圆形
      this.drawCircle(ctx, width, height);
    }
    
    // 转换为Image对象
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    return img;
  }

  /**
   * 从SIDC中提取阵营信息
   */
  private extractIdentityFromSidc(sidc: SIDC): IdentityCode {
    // SIDC第11位：修饰符，包含阵营信息
    // 简化实现，实际需要完整解析SIDC
    const modifier = sidc[10] || '-';
    
    switch (modifier) {
      case 'F': return IdentityCode.FRIEND;
      case 'H': return IdentityCode.HOSTILE;
      case 'N': return IdentityCode.NEUTRAL;
      case 'U': return IdentityCode.UNKNOWN;
      case 'P': return IdentityCode.PENDING;
      case 'A': return IdentityCode.ASSUMED_FRIEND;
      case 'S': return IdentityCode.SUSPECT;
      case 'G': return IdentityCode.EXERCISE_PENDING;
      case 'W': return IdentityCode.EXERCISE_UNKNOWN;
      case 'J': return IdentityCode.JOKER;
      case 'K': return IdentityCode.FAKER;
      default: return IdentityCode.UNKNOWN;
    }
  }

  /**
   * 绘制菱形（情报符号）
   */
  private drawDiamond(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const size = Math.min(width, height) * 0.4;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - size);
    ctx.lineTo(centerX + size, centerY);
    ctx.lineTo(centerX, centerY + size);
    ctx.lineTo(centerX - size, centerY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  /**
   * 绘制矩形（单位符号）
   */
  private drawRectangle(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const size = Math.min(width, height) * 0.6;
    const x = (width - size) / 2;
    const y = (height - size) / 2;
    
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x, y, size, size);
  }

  /**
   * 绘制圆形
   */
  private drawCircle(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}