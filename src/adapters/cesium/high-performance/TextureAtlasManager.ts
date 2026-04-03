/**
 * 纹理图集管理器
 * 负责 MIL-STD-2525D 符号纹理的生成、打包与 GPU 上传
 */

import { SIDC } from '../../../types';
import {
  Texture,
  PixelFormat,
  Sampler,
  TextureMinificationFilter,
  TextureMagnificationFilter,
  TextureWrap
} from 'cesium';

/**
 * UV 坐标（纹理坐标）
 */
export interface UVCoordinates {
  u1: number;  // 左上角 U
  v1: number;  // 左上角 V
  u2: number;  // 右下角 U
  v2: number;  // 右下角 V
  width: number;  // 纹理宽度（标准化）
  height: number; // 纹理高度（标准化）
}

/**
 * 纹理图集统计信息
 */
export interface TextureAtlasStats {
  totalSymbols: number;
  atlasWidth: number;
  atlasHeight: number;
  memoryUsage: number;  // 字节
  compressionRatio: number;
  cacheHitRate: number;
}

/**
 * 纹理图集配置
 */
export interface TextureAtlasConfig {
  // 纹理尺寸
  atlasSize: number;  // 纹理图集边长（默认 2048）
  maxAtlases: number; // 最大图集数量（默认 4）
  
  // 符号尺寸
  symbolSize: number; // 单个符号尺寸（默认 64）
  padding: number;    // 符号间距（默认 2）
  
  // 性能配置
  enableCompression: boolean;  // 启用纹理压缩
  enableMipmaps: boolean;      // 启用 Mipmap
  cacheSize: number;           // 缓存大小（默认 1000）
  
  // 调试配置
  debugBorder: boolean;        // 调试边框
  debugOverlay: boolean;       // 调试覆盖层
}

/**
 * 符号纹理信息
 */
export interface SymbolTextureInfo {
  sidc: SIDC;
  uv: UVCoordinates;
  textureIndex: number;  // 所属纹理图集索引
  lastUsed: number;      // 最后使用时间戳
  hitCount: number;      // 命中次数
}

/**
 * 纹理图集管理器
 */
export class TextureAtlasManager {
  // 配置
  private config: TextureAtlasConfig;
  
  // 纹理资源
  private atlases: HTMLCanvasElement[] = [];
  private contexts: CanvasRenderingContext2D[] = [];
  private textures: Texture[] = [];
  private currentX = 0;
  private currentY = 0;
  private currentRowHeight = 0;
  
  // 符号映射
  private symbolMap = new Map<SIDC, SymbolTextureInfo>();
  private uvCache = new Map<string, UVCoordinates>();  // 缓存 UV 坐标
  
  // 统计信息
  private stats: TextureAtlasStats = {
    totalSymbols: 0,
    atlasWidth: 0,
    atlasHeight: 0,
    memoryUsage: 0,
    compressionRatio: 1.0,
    cacheHitRate: 0
  };
  
  // 性能监控
  private hitCount = 0;
  private missCount = 0;
  private lastCleanupTime = 0;
  
  constructor(config?: Partial<TextureAtlasConfig>) {
    this.config = {
      atlasSize: 2048,
      maxAtlases: 4,
      symbolSize: 64,
      padding: 2,
      enableCompression: true,
      enableMipmaps: true,
      cacheSize: 1000,
      debugBorder: false,
      debugOverlay: false,
      ...config
    };
    
    // 初始化统计
    this.stats.atlasWidth = this.config.atlasSize;
    this.stats.atlasHeight = this.config.atlasSize;
  }
  
  /**
   * 初始化纹理图集
   */
  async initialize(): Promise<void> {
    try {
      // 创建第一个纹理图集
      await this.createAtlas();
      console.log('TextureAtlasManager initialized with atlas size:', this.config.atlasSize);
    } catch (error) {
      console.error('Failed to initialize TextureAtlasManager:', error);
      throw error;
    }
  }
  
  /**
   * 获取符号的 UV 坐标
   */
  async getSymbolUV(sidc: SIDC): Promise<UVCoordinates> {
    // 检查缓存
    const cacheKey = `${sidc}:${this.config.symbolSize}`;
    if (this.uvCache.has(cacheKey)) {
      this.hitCount++;
      return this.uvCache.get(cacheKey)!;
    }
    
    this.missCount++;
    
    // 检查是否已存在于图集中
    if (this.symbolMap.has(sidc)) {
      const info = this.symbolMap.get(sidc)!;
      info.lastUsed = Date.now();
      info.hitCount++;
      this.uvCache.set(cacheKey, info.uv);
      return info.uv;
    }
    
    // 生成新符号并添加到图集
    try {
      const uv = await this.addSymbolToAtlas(sidc);
      
      // 缓存 UV 坐标
      this.uvCache.set(cacheKey, uv);
      
      // 更新统计
      this.stats.totalSymbols++;
      this.updateCacheHitRate();
      
      return uv;
    } catch (error) {
      console.error(`Failed to get UV for symbol ${sidc}:`, error);
      
      // 返回默认 UV（空白区域）
      return {
        u1: 0, v1: 0,
        u2: 0.01, v2: 0.01,
        width: 0.01, height: 0.01
      };
    }
  }
  
  /**
   * 批量获取 UV 坐标
   */
  async getSymbolUVs(sidcs: SIDC[]): Promise<Map<SIDC, UVCoordinates>> {
    const result = new Map<SIDC, UVCoordinates>();
    const promises = sidcs.map(async (sidc) => {
      const uv = await this.getSymbolUV(sidc);
      result.set(sidc, uv);
    });
    
    await Promise.all(promises);
    return result;
  }
  
  /**
   * 预加载一组符号
   */
  async preloadSymbols(sidcs: SIDC[]): Promise<void> {
    console.log(`Preloading ${sidcs.length} symbols...`);
    
    const batchSize = 50; // 避免同时加载太多
    for (let i = 0; i < sidcs.length; i += batchSize) {
      const batch = sidcs.slice(i, i + batchSize);
      await this.getSymbolUVs(batch);
      
      // 防止阻塞主线程
      if (i % 200 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    console.log(`Preloaded ${sidcs.length} symbols`);
  }
  
  /**
   * 获取纹理图集
   */
  getAtlasTexture(index: number = 0): Texture | null {
    if (index < 0 || index >= this.textures.length) {
      return null;
    }
    return this.textures[index];
  }
  
  /**
   * 获取所有纹理图集
   */
  getAllAtlasTextures(): Texture[] {
    return [...this.textures];
  }
  
  /**
   * 获取统计信息
   */
  getStats(): TextureAtlasStats {
    // 计算内存使用
    this.stats.memoryUsage = this.calculateMemoryUsage();
    
    // 计算缓存命中率
    this.updateCacheHitRate();
    
    return { ...this.stats };
  }
  
  /**
   * 清理缓存
   */
  clearCache(): void {
    this.symbolMap.clear();
    this.uvCache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.stats.totalSymbols = 0;
    this.stats.cacheHitRate = 0;
    
    console.log('TextureAtlasManager cache cleared');
  }
  
  /**
   * 清理不常用的符号
   */
  cleanupUnusedSymbols(maxAgeMs: number = 300000): number { // 5分钟
    const now = Date.now();
    let removedCount = 0;
    
    for (const [sidc, info] of this.symbolMap) {
      if (now - info.lastUsed > maxAgeMs && info.hitCount < 3) {
        this.symbolMap.delete(sidc);
        removedCount++;
      }
    }
    
    // 清理 UV 缓存
    this.uvCache.clear();
    
    this.lastCleanupTime = now;
    console.log(`Cleaned up ${removedCount} unused symbols`);
    
    return removedCount;
  }
  
  /**
   * 销毁资源
   */
  destroy(): void {
    // 销毁 Cesium 纹理
    for (const texture of this.textures) {
      if (texture && !texture.isDestroyed()) {
        texture.destroy();
      }
    }
    
    // 清理 Canvas
    this.atlases = [];
    this.contexts = [];
    this.textures = [];
    this.symbolMap.clear();
    this.uvCache.clear();
    
    console.log('TextureAtlasManager destroyed');
  }
  
  // ============ 私有方法 ============
  
  /**
   * 创建新的纹理图集
   */
  private async createAtlas(): Promise<void> {
    if (this.atlases.length >= this.config.maxAtlases) {
      throw new Error(`Maximum number of atlases (${this.config.maxAtlases}) reached`);
    }
    
    const index = this.atlases.length;
    
    // 创建 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = this.config.atlasSize;
    canvas.height = this.config.atlasSize;
    
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Failed to create canvas context');
    }
    
    // 初始化背景（透明）
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // 添加调试边框
    if (this.config.debugBorder) {
      context.strokeStyle = '#ff0000';
      context.lineWidth = 2;
      context.strokeRect(0, 0, canvas.width, canvas.height);
    }
    
    // 存储资源
    this.atlases.push(canvas);
    this.contexts.push(context);
    
    // 重置布局位置
    this.currentX = this.config.padding;
    this.currentY = this.config.padding;
    this.currentRowHeight = 0;
    
    console.log(`Created texture atlas ${index} (${canvas.width}x${canvas.height})`);
  }
  
  /**
   * 将符号添加到纹理图集
   */
  private async addSymbolToAtlas(sidc: SIDC): Promise<UVCoordinates> {
    const symbolSize = this.config.symbolSize;
    const padding = this.config.padding;
    
    // 检查当前图集是否有足够空间
    if (this.currentX + symbolSize + padding > this.config.atlasSize) {
      // 换行
      this.currentX = padding;
      this.currentY += this.currentRowHeight + padding;
      this.currentRowHeight = 0;
    }
    
    // 检查是否需要新行
    if (this.currentY + symbolSize + padding > this.config.atlasSize) {
      // 创建新图集
      await this.createAtlas();
      return this.addSymbolToAtlas(sidc); // 递归调用
    }
    
    const atlasIndex = this.atlases.length - 1;
    const context = this.contexts[atlasIndex];
    
    // 生成符号图像
    const image = await this.generateSymbolImage(sidc);
    
    // 绘制到图集
    context.drawImage(
      image,
      this.currentX,
      this.currentY,
      symbolSize,
      symbolSize
    );
    
    // 添加调试边框
    if (this.config.debugBorder) {
      context.strokeStyle = '#00ff00';
      context.lineWidth = 1;
      context.strokeRect(
        this.currentX - 0.5,
        this.currentY - 0.5,
        symbolSize + 1,
        symbolSize + 1
      );
    }
    
    // 计算 UV 坐标（标准化）
    const atlasSize = this.config.atlasSize;
    const uv: UVCoordinates = {
      u1: this.currentX / atlasSize,
      v1: this.currentY / atlasSize,
      u2: (this.currentX + symbolSize) / atlasSize,
      v2: (this.currentY + symbolSize) / atlasSize,
      width: symbolSize / atlasSize,
      height: symbolSize / atlasSize
    };
    
    // 存储符号信息
    this.symbolMap.set(sidc, {
      sidc,
      uv,
      textureIndex: atlasIndex,
      lastUsed: Date.now(),
      hitCount: 1
    });
    
    // 更新布局位置
    this.currentX += symbolSize + padding;
    this.currentRowHeight = Math.max(this.currentRowHeight, symbolSize);
    
    // 标记图集为脏，需要更新 GPU 纹理
    this.markAtlasDirty(atlasIndex);
    
    return uv;
  }
  
  /**
   * 生成符号图像
   */
  private async generateSymbolImage(sidc: SIDC): Promise<HTMLImageElement> {
    // 方法1：使用 milsymbol（如果可用）
    try {
      const ms = (window as any).ms;
      if (ms && typeof ms.Symbol === 'function') {
        const symbol = new ms.Symbol(sidc, { size: this.config.symbolSize });
        const svgString = symbol.asSVG();
        
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = 'data:image/svg+xml;base64,' + btoa(svgString);
        });
      }
    } catch (error) {
      console.warn('Failed to generate symbol with milsymbol, falling back to canvas:', error);
    }
    
    // 方法2：使用 Canvas 绘制基本符号
    return this.generateFallbackSymbol(sidc);
  }
  
  /**
   * 生成备用符号（当 milsymbol 不可用时）
   */
  private generateFallbackSymbol(sidc: SIDC): HTMLImageElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.config.symbolSize;
    canvas.height = this.config.symbolSize;
    
    const context = canvas.getContext('2d')!;
    
    // 根据 SIDC 确定颜色
    let color = '#ffffff';
    if (sidc.length > 10) {
      const identityChar = sidc[10];
      switch (identityChar) {
        case 'F': color = '#00aaff'; break; // 友方 - 蓝色
        case 'H': color = '#ff4444'; break; // 敌方 - 红色
        case 'N': color = '#00cc66'; break; // 中立 - 绿色
        case 'U': color = '#ffff00'; break; // 未知 - 黄色
        default: color = '#ffffff';
      }
    }
    
    // 绘制基本形状
    const centerX = this.config.symbolSize / 2;
    const centerY = this.config.symbolSize / 2;
    const radius = this.config.symbolSize * 0.3;
    
    context.fillStyle = color;
    context.strokeStyle = '#000000';
    context.lineWidth = 2;
    
    // 根据符号类型绘制不同形状
    if (sidc.includes('I')) {
      // 情报符号 - 菱形
      context.beginPath();
      context.moveTo(centerX, centerY - radius);
      context.lineTo(centerX + radius, centerY);
      context.lineTo(centerX, centerY + radius);
      context.lineTo(centerX - radius, centerY);
      context.closePath();
    } else if (sidc.includes('U')) {
      // 单位符号 - 矩形
      const size = radius * 1.5;
      context.fillRect(centerX - size/2, centerY - size/2, size, size);
      context.strokeRect(centerX - size/2, centerY - size/2, size, size);
      return this.canvasToImage(canvas);
    } else {
      // 默认圆形
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    }
    
    context.fill();
    context.stroke();
    
    return this.canvasToImage(canvas);
  }
  
  /**
   * Canvas 转换为 Image
   */
  private canvasToImage(canvas: HTMLCanvasElement): HTMLImageElement {
    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    return img;
  }
  
  /**
   * 标记图集为脏（需要更新 GPU 纹理）
   */
  private markAtlasDirty(atlasIndex: number): void {
    // 如果已经有 Cesium 纹理，需要销毁并重新创建
    if (atlasIndex < this.textures.length && this.textures[atlasIndex]) {
      const oldTexture = this.textures[atlasIndex];
      if (!oldTexture.isDestroyed()) {
        oldTexture.destroy();
      }
    }
    
    // 延迟创建 Cesium 纹理，减少频繁 GPU 上传
    this.scheduleTextureUpdate(atlasIndex);
  }
  
  /**
   * 调度纹理更新
   */
  private scheduleTextureUpdate(atlasIndex: number): void {
    // 简单实现：立即创建纹理
    // 实际应该使用 requestAnimationFrame 批量处理
    this.updateAtlasTexture(atlasIndex);
  }
  
  /**
   * 更新图集的 GPU 纹理
   */
  private updateAtlasTexture(atlasIndex: number): void {
    if (atlasIndex >= this.atlases.length) {
      return;
    }
    
    const canvas = this.atlases[atlasIndex];
    
    // 创建 Cesium 纹理
    const texture = new Texture({
      context: (window as any).cesiumViewer?.scene?.context,
      source: canvas,
      pixelFormat: PixelFormat.RGBA,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
        wrapS: TextureWrap.CLAMP_TO_EDGE,
        wrapT: TextureWrap.CLAMP_TO_EDGE
      })
    });
    
    // 存储纹理
    if (atlasIndex < this.textures.length) {
      this.textures[atlasIndex] = texture;
    } else {
      this.textures.push(texture);
    }
    
    console.log(`Updated GPU texture for atlas ${atlasIndex}`);
  }
  
  /**
   * 计算内存使用
   */
  private calculateMemoryUsage(): number {
    let memory = 0;
    
    // Canvas 内存
    for (const canvas of this.atlases) {
      memory += canvas.width * canvas.height * 4; // RGBA
    }
    
    // Cesium 纹理内存（近似）
    memory += this.textures.length * this.config.atlasSize * this.config.atlasSize * 4;
    
    // 数据结构内存（近似）
    memory += this.symbolMap.size * 100; // 每个符号约100字节
    memory += this.uvCache.size * 50;    // 每个缓存项约50字节
    
    return memory;
  }
  
  /**
   * 更新缓存命中率
   */
  private updateCacheHitRate(): void {
    const total = this.hitCount + this.missCount;
    if (total > 0) {
      this.stats.cacheHitRate = this.hitCount / total;
    }
  }
  
  /**
   * 获取当前活动图集索引
   */
  private getActiveAtlasIndex(): number {
    return this.atlases.length - 1;
  }
}