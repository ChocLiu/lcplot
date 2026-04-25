/**
 * 高性能渲染器模块导出
 */

// 基础模块
export { TextureAtlasManager } from './TextureAtlasManager';
export { HighPerformancePrimitiveRenderer } from './HighPerformancePrimitiveRenderer';
export { MilitarySymbolShader } from './MilitarySymbolShader';
export { InstanceAttributeManager } from './InstanceAttributeManager';
export { SpatialIndexManager } from './SpatialIndexManager';

// BillboardCollection 渲染器（路线 C - 简单图标高性能方案）
export { BillboardCollectionRenderer } from './BillboardCollectionRenderer';

// 混合渲染器（路线 C - 统一入口）
export { HybridRenderer } from './HybridRenderer';

// 类型导出
export type { UVCoordinates, TextureAtlasConfig, TextureAtlasStats } from './TextureAtlasManager';
export type { HighPerformanceRendererConfig, PerformanceStats } from './HighPerformancePrimitiveRenderer';
export type { ShaderConfig, ShaderUniforms, ShaderAttributes } from './MilitarySymbolShader';
export type { InstanceAttribute, InstanceData, InstanceUpdate, BufferStats, InstanceAttributeManagerConfig } from './InstanceAttributeManager';
export type { SpatialIndexType, SpatialIndexConfig, SpatialNode, QueryResult, LodLevel, VisibleInstanceSet } from './SpatialIndexManager';
export type { BillboardCollectionConfig } from './BillboardCollectionRenderer';
export type { HybridRendererConfig, HybridStats } from './HybridRenderer';

/**
 * 高性能渲染器工厂（支持混合模式）
 */
import type { HighPerformanceRendererConfig } from './HighPerformancePrimitiveRenderer';
import { HighPerformancePrimitiveRenderer } from './HighPerformancePrimitiveRenderer';
import { TextureAtlasManager } from './TextureAtlasManager';
import { HybridRenderer, HybridRendererConfig } from './HybridRenderer';
import { BillboardCollectionRenderer } from './BillboardCollectionRenderer';

export class HighPerformanceRendererFactory {
  /**
   * 创建纯 Primitive API 渲染器
   */
  static async createPrimitiveRenderer(
    viewer: any,
    config?: Partial<HighPerformanceRendererConfig>
  ): Promise<HighPerformancePrimitiveRenderer> {
    const textureAtlasManager = new TextureAtlasManager({
      atlasSize: config?.textureAtlasSize || 2048,
      symbolSize: config?.symbolSize || 64
    });
    await textureAtlasManager.initialize();
    const renderer = new HighPerformancePrimitiveRenderer(viewer, textureAtlasManager, config);
    return renderer;
  }

  /**
   * 创建 BillboardCollection 渲染器（简单图标高性能方案）
   */
  static createBillboardRenderer(viewer: any, config?: any): BillboardCollectionRenderer {
    return new BillboardCollectionRenderer(viewer, config);
  }

  /**
   * 创建混合渲染器（推荐！）
   * 自动根据符号类型选择最优渲染策略
   */
  static async createHybridRenderer(
    viewer: any,
    config?: Partial<HybridRendererConfig>
  ): Promise<HybridRenderer> {
    const taConfig = {
      atlasSize: config?.textureAtlas?.atlasSize || 2048,
      symbolSize: config?.textureAtlas?.symbolSize || 64
    };
    const textureAtlasManager = new TextureAtlasManager(taConfig);
    await textureAtlasManager.initialize();
    return new HybridRenderer(viewer, textureAtlasManager, config);
  }
}
