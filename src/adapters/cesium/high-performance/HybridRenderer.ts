/**
 * 混合高性能渲染器
 * 
 * 路线 C 核心：根据符号类型自动选择最优渲染策略
 * 
 * - 简单图标（MIL-STD-2525D 标准符号、Billboard）：BillboardCollectionRenderer
 *   利用 Cesium.BillboardCollection 的实例化渲染，支持数万图元
 * 
 * - 高级自定义符号（需要 Shader 效果、发光、边框等）：HighPerformancePrimitiveRenderer
 *   使用 Cesium.Primitive + Custom Shader 实现
 * 
 * 自动路由规则：
 *   - 有 billboardUrl / 标准 SIDC 符号 → BillboardCollection
 *   - 有 use3DModel / modelUrl / 自定义可视化效果 → HighPerformancePrimitiveRenderer
 *   - 默认 → BillboardCollection（性能优先）
 */

import { Viewer } from 'cesium';
import {
  AdvancedPrimitive,
  PrimitiveCreateOptions,
  PrimitiveUpdateOptions,
  PrimitiveQueryOptions
} from '../../../types';
import { BillboardCollectionRenderer, BillboardCollectionConfig } from './BillboardCollectionRenderer';
import { HighPerformancePrimitiveRenderer, HighPerformanceRendererConfig } from './HighPerformancePrimitiveRenderer';
import { TextureAtlasManager, TextureAtlasConfig } from './TextureAtlasManager';

/**
 * 混合渲染器配置
 */
export interface HybridRendererConfig {
  // BillboardCollection 渲染器配置
  billboard: Partial<BillboardCollectionConfig>;

  // 高性能 Primitive 渲染器配置
  primitive: Partial<HighPerformanceRendererConfig>;

  // 纹理图集配置
  textureAtlas: Partial<TextureAtlasConfig>;

  // 自动路由阈值
  routing: {
    maxBillboardPrimitives: number;    // 超过此数量强制使用 BillboardCollection
    forceAdvancedShaders: boolean;     // 始终使用 Primitive 渲染器（忽略自动路由）
  };
}

/**
 * 性能统计数据
 */
export interface HybridStats {
  totalPrimitives: number;
  billboardCount: number;
  primitiveCount: number;
  billboardStats: Record<string, number>;
  primitiveStats: Record<string, number>;
}

/**
 * 混合渲染器
 *
 * 统一管理 BillboardCollectionRenderer 和 HighPerformancePrimitiveRenderer，
 * 对外提供一致的 create / update / remove / query API。
 */
export class HybridRenderer {
  private viewer: Viewer;
  private config: HybridRendererConfig;

  // 子渲染器
  private billboardRenderer: BillboardCollectionRenderer;
  private primitiveRenderer: HighPerformancePrimitiveRenderer;
  private textureAtlasManager: TextureAtlasManager;

  // 路由表：id -> 使用哪个渲染器
  private routeMap = new Map<string, 'billboard' | 'primitive'>();
  private initialized = false;

  constructor(
    viewer: Viewer,
    textureAtlasManager: TextureAtlasManager,
    config?: Partial<HybridRendererConfig>
  ) {
    this.viewer = viewer;
    this.textureAtlasManager = textureAtlasManager;

    const defaultRouting = {
      maxBillboardPrimitives: 100000,
      forceAdvancedShaders: false
    };
    this.config = {
      billboard: {},
      primitive: {},
      textureAtlas: {},
      routing: {
        ...defaultRouting,
        ...config?.routing
      },
      ...config
    };

    // 初始化子渲染器
    this.billboardRenderer = new BillboardCollectionRenderer(
      viewer,
      this.config.billboard
    );

    this.primitiveRenderer = new HighPerformancePrimitiveRenderer(
      viewer,
      textureAtlasManager,
      this.config.primitive
    );

    this.initialized = true;
    console.log('[HybridRenderer] initialized: BillboardCollection + HighPerformancePrimitive');
  }

  // ==================== 公共 API ====================

  /**
   * 创建图元（自动路由到最佳渲染器）
   */
  async createPrimitive(options: PrimitiveCreateOptions): Promise<string> {
    const useAdvanced = this.shouldUseAdvancedRenderer(options);

    if (useAdvanced) {
      const id = await this.primitiveRenderer.createPrimitive(options);
      this.routeMap.set(id, 'primitive');
      return id;
    } else {
      const id = await this.billboardRenderer.createPrimitive(options);
      this.routeMap.set(id, 'billboard');
      return id;
    }
  }

  /**
   * 批量创建图元
   */
  async createPrimitivesBatch(options: PrimitiveCreateOptions[]): Promise<string[]> {
    const ids: string[] = [];
    const billboardBatch: PrimitiveCreateOptions[] = [];
    const primitiveBatch: PrimitiveCreateOptions[] = [];
    const billboardIds: string[] = [];

    // 预分类
    for (const opt of options) {
      if (this.shouldUseAdvancedRenderer(opt)) {
        primitiveBatch.push(opt);
      } else {
        billboardBatch.push(opt);
      }
    }

    // 同时创建
    const [pIds, bIds] = await Promise.all([
      primitiveBatch.length > 0
        ? this.primitiveRenderer.createPrimitivesBatch(primitiveBatch)
        : Promise.resolve([] as string[]),
      billboardBatch.length > 0
        ? Promise.all(billboardBatch.map(o => this.billboardRenderer.createPrimitive(o)))
        : Promise.resolve([] as string[])
    ]);

    // 记录路由
    for (const id of pIds) this.routeMap.set(id, 'primitive');
    for (const id of bIds) this.routeMap.set(id, 'billboard');

    return [...pIds, ...bIds];
  }

  /**
   * 更新图元（自动路由到对应的渲染器）
   */
  async updatePrimitive(id: string, updates: PrimitiveUpdateOptions): Promise<void> {
    const target = this.routeMap.get(id);
    if (target === 'primitive') {
      await this.primitiveRenderer.updatePrimitive(id, updates);
    } else if (target === 'billboard') {
      await this.billboardRenderer.updatePrimitive(id, updates);
    } else {
      throw new Error(`Primitive ${id} not found in any renderer`);
    }
  }

  /**
   * 删除图元
   */
  removePrimitive(id: string): void {
    const target = this.routeMap.get(id);
    if (target === 'primitive') {
      this.primitiveRenderer.removePrimitive(id);
    } else if (target === 'billboard') {
      this.billboardRenderer.removePrimitive(id);
    }
    this.routeMap.delete(id);
  }

  /**
   * 批量删除
   */
  removePrimitivesBatch(ids: string[]): void {
    for (const id of ids) this.removePrimitive(id);
  }

  /**
   * 查询图元
   */
  queryPrimitives(options: PrimitiveQueryOptions): string[] {
    const billboardResult = this.billboardRenderer.queryPrimitives(options);
    const primitiveResult = this.primitiveRenderer.queryPrimitives(options);
    return [...billboardResult, ...primitiveResult];
  }

  /**
   * 获取图元
   */
  getPrimitive(id: string): AdvancedPrimitive | null {
    const target = this.routeMap.get(id);
    if (target === 'primitive') return this.primitiveRenderer.getPrimitive(id);
    if (target === 'billboard') return this.billboardRenderer.getPrimitive(id);
    return null;
  }

  /**
   * 获取图元所在的渲染器类型
   */
  getRenderType(id: string): 'billboard' | 'primitive' | null {
    return this.routeMap.get(id) ?? null;
  }

  /**
   * 清空所有图元
   */
  clearAll(): void {
    this.billboardRenderer.clearAll();
    this.primitiveRenderer.clearAll();
    this.routeMap.clear();
  }

  /**
   * 获取混合统计
   */
  getStats(): HybridStats {
    const primStats = this.primitiveRenderer.getPerformanceStats();
    return {
      totalPrimitives: this.routeMap.size,
      billboardCount: this.billboardRenderer.getStats().activeBillboards,
      primitiveCount: primStats.instanceCount,
      billboardStats: this.billboardRenderer.getStats(),
      primitiveStats: primStats as any
    };
  }

  /**
   * 推断图元应该使用哪种渲染器
   */
  shouldUseAdvancedRenderer(options: PrimitiveCreateOptions): boolean {
    if (this.config.routing.forceAdvancedShaders) return true;

    const viz = options.visualization;
    if (!viz) return false;

    // 以下情况使用高级渲染器：
    // 1. 需要 3D 模型
    if (viz.use3DModel || viz.modelUrl) return true;

    // 2. 需要特殊着色器效果（自定义 color 覆盖阵营配色时，可能需要色相偏移等）
    //    BillboardCollection 不支持选中的着色器，但可以处理简单颜色
    return false;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.clearAll();
    this.billboardRenderer.destroy();
    this.primitiveRenderer.destroy();
    this.initialized = false;
  }
}
