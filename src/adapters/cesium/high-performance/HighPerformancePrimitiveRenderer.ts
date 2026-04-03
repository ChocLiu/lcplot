/**
 * 高性能 Cesium.Primitive 渲染器
 * 基于 Cesium Cesium.Primitive API 实现 MIL-STD-2525D 符号的高性能渲染
 */

// Cesium 相关 - 使用命名空间导入以兼容UMD构建
import * as Cesium from 'cesium';
import {
  AdvancedPrimitive,
  PrimitiveCreateOptions,
  PrimitiveUpdateOptions,
  PrimitiveQueryOptions,
  MilitaryDomain,
  IdentityCode,
  CommandRelation,
  StatusCode,
  SIDC
} from '../../../types';
import { TextureAtlasManager, UVCoordinates } from './TextureAtlasManager';

/**
 * 高性能渲染器配置
 */
export interface HighPerformanceRendererConfig {
  // 性能配置
  maxInstances: number;           // 最大实例数（默认 100,000）
  batchSize: number;              // 批处理大小（默认 1024）
  lodLevels: number;              // LOD 级别数（默认 4）
  
  // 渲染配置
  textureAtlasSize: number;       // 纹理图集尺寸（默认 2048）
  symbolSize: number;             // 符号尺寸（默认 64）
  enableInstancing: boolean;      // 启用实例化渲染
  enableFrustumCulling: boolean;  // 启用视锥剔除
  
  // 着色器配置
  shaderPrecision: 'highp' | 'mediump' | 'lowp';
  enableAdvancedEffects: boolean; // 启用高级特效（边框、发光等）
  
  // 调试配置
  showDebugOverlay: boolean;      // 显示调试覆盖层
  logPerformanceStats: boolean;   // 记录性能统计
  showInstanceBounds: boolean;    // 显示实例边界框
}

/**
 * 实例数据
 */
export interface PrimitiveInstance {
  id: string;
  primitive: AdvancedPrimitive;
  geometryInstance: Cesium.GeometryInstance | null;
  bufferIndex: number;            // 在 GPU 缓冲区中的索引
  visible: boolean;
  lodLevel: number;
  lastUpdateTime: number;
}

/**
 * 性能统计
 */
export interface PerformanceStats {
  frameTime: number;              // 帧时间（ms）
  drawCalls: number;              // 绘制调用次数
  instanceCount: number;          // 实例数量
  visibleCount: number;           // 可见实例数量
  culledCount: number;            // 剔除实例数量
  memoryUsage: number;            // 内存使用（字节）
  bufferUpdateCount: number;      // 缓冲区更新次数
  textureBindings: number;        // 纹理绑定次数
}

/**
 * 几何实例属性
 */
export interface InstanceAttributes {
  position: Float32Array;         // 位置 [x, y, z]
  color: Uint8Array;              // 颜色 [r, g, b, a]
  uv: Float32Array;               // UV 坐标 [u1, v1, u2, v2]
  scale: Float32Array;            // 缩放 [scale]
  rotation: Float32Array;         // 旋转 [angle]
  instanceId: Float32Array;       // 实例 ID
}

/**
 * 高性能 Cesium.Primitive 渲染器
 */
export class HighPerformancePrimitiveRenderer {
  // 依赖注入
  private viewer: Cesium.Viewer;
  private textureAtlasManager: TextureAtlasManager;
  
  // 配置
  private config: HighPerformanceRendererConfig;
  
  // 实例管理
  private instances = new Map<string, PrimitiveInstance>();
  private instanceIds: string[] = [];  // 保持插入顺序
  private nextBufferIndex = 0;
  
  // GPU 资源
  private primitive: Cesium.Primitive | null = null;
  private geometry: Cesium.Geometry | null = null;
  private appearance: Cesium.Appearance | null = null;
  private instanceAttributes: InstanceAttributes | null = null;
  private vertexBuffer: Buffer | null = null;
  private indexBuffer: Buffer | null = null;
  private instanceBuffer: Buffer | null = null;
  
  // 性能优化
  private dirtyInstances = new Set<string>();  // 需要更新的实例
  private dirtyBuffer = false;                 // 缓冲区需要更新
  private lastFrameTime = 0;
  private frameCount = 0;
  private stats: PerformanceStats;
  
  // 空间索引（用于视锥剔除）
  private spatialIndex: any = null;
  
  // 事件监听器
  private eventListeners = new Map<string, Function[]>();
  
  constructor(
    viewer: Cesium.Viewer,
    textureAtlasManager: TextureAtlasManager,
    config?: Partial<HighPerformanceRendererConfig>
  ) {
    this.viewer = viewer;
    this.textureAtlasManager = textureAtlasManager;
    
    this.config = {
      maxInstances: 100000,
      batchSize: 1024,
      lodLevels: 4,
      textureAtlasSize: 2048,
      symbolSize: 64,
      enableInstancing: true,
      enableFrustumCulling: true,
      shaderPrecision: 'mediump',
      enableAdvancedEffects: true,
      showDebugOverlay: false,
      logPerformanceStats: false,
      showInstanceBounds: false,
      ...config
    };
    
    this.stats = {
      frameTime: 0,
      drawCalls: 0,
      instanceCount: 0,
      visibleCount: 0,
      culledCount: 0,
      memoryUsage: 0,
      bufferUpdateCount: 0,
      textureBindings: 0
    };
    
    // 初始化
    this.initialize();
  }
  
  /**
   * 初始化渲染器
   */
  private initialize(): void {
    try {
      // 创建基础几何
      this.createBaseGeometry();
      
      // 创建外观（着色器）
      this.createAppearance();
      
      // 创建 Cesium Cesium.Primitive
      this.createCesiumPrimitive();
      
      // 绑定渲染循环
      this.bindToRenderLoop();
      
      console.log('HighPerformancePrimitiveRenderer initialized');
    } catch (error) {
      console.error('Failed to initialize HighPerformancePrimitiveRenderer:', error);
      throw error;
    }
  }
  
  /**
   * 创建图元
   */
  async createPrimitive(options: PrimitiveCreateOptions): Promise<string> {
    const instanceId = this.generateInstanceId();
    
    // 检查实例数量限制
    if (this.instances.size >= this.config.maxInstances) {
      throw new Error(`Maximum instances (${this.config.maxInstances}) reached`);
    }
    
    try {
      // 创建高级图元对象
      const primitive = this.createAdvancedPrimitiveFromOptions(options, instanceId);
      
      // 获取符号 UV 坐标
      const uv = await this.textureAtlasManager.getSymbolUV(primitive.sidc);
      
      // 创建实例数据
      const instance: PrimitiveInstance = {
        id: instanceId,
        primitive,
        geometryInstance: null,
        bufferIndex: this.nextBufferIndex++,
        visible: true,
        lodLevel: 0,
        lastUpdateTime: Date.now()
      };
      
      // 存储实例
      this.instances.set(instanceId, instance);
      this.instanceIds.push(instanceId);
      
      // 标记为需要更新
      this.dirtyInstances.add(instanceId);
      this.dirtyBuffer = true;
      
      // 更新统计
      this.stats.instanceCount = this.instances.size;
      
      // 调度缓冲区更新
      this.scheduleBufferUpdate();
      
      console.log(`Created primitive ${instanceId} at position`, primitive.position);
      
      return instanceId;
    } catch (error) {
      console.error(`Failed to create primitive:`, error);
      throw error;
    }
  }
  
  /**
   * 批量创建图元
   */
  async createPrimitivesBatch(options: PrimitiveCreateOptions[]): Promise<string[]> {
    const instanceIds: string[] = [];
    
    for (const option of options) {
      try {
        const instanceId = await this.createPrimitive(option);
        instanceIds.push(instanceId);
      } catch (error) {
        console.error('Failed to create primitive in batch:', error);
        // 继续创建其他图元
      }
    }
    
    // 批量更新缓冲区
    this.scheduleBufferUpdate();
    
    return instanceIds;
  }
  
  /**
   * 更新图元
   */
  async updatePrimitive(id: string, updates: PrimitiveUpdateOptions): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Cesium.Primitive ${id} not found`);
    }
    
    try {
      // 合并更新
      const updatedPrimitive = this.mergePrimitiveUpdates(instance.primitive, updates);
      instance.primitive = updatedPrimitive;
      instance.lastUpdateTime = Date.now();
      
      // 标记为需要更新
      this.dirtyInstances.add(id);
      this.dirtyBuffer = true;
      
      // 如果位置变化，可能需要更新空间索引
      if (updates.position) {
        // TODO: 更新空间索引
      }
      
      // 调度缓冲区更新
      this.scheduleBufferUpdate();
      
      console.log(`Updated primitive ${id}`);
    } catch (error) {
      console.error(`Failed to update primitive ${id}:`, error);
      throw error;
    }
  }
  
  /**
   * 批量更新图元
   */
  async updatePrimitivesBatch(updates: Map<string, PrimitiveUpdateOptions>): Promise<void> {
    for (const [id, update] of updates) {
      try {
        await this.updatePrimitive(id, update);
      } catch (error) {
        console.error(`Failed to update primitive ${id} in batch:`, error);
        // 继续更新其他图元
      }
    }
    
    // 批量更新缓冲区
    this.scheduleBufferUpdate();
  }
  
  /**
   * 删除图元
   */
  removePrimitive(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) {
      console.warn(`Cesium.Primitive ${id} not found, skipping removal`);
      return;
    }
    
    // 标记缓冲区位置为空
    // TODO: 实际需要回收缓冲区空间
    
    // 移除实例
    this.instances.delete(id);
    const index = this.instanceIds.indexOf(id);
    if (index > -1) {
      this.instanceIds.splice(index, 1);
    }
    
    // 从脏实例集中移除
    this.dirtyInstances.delete(id);
    
    // 标记缓冲区需要重新组织
    this.dirtyBuffer = true;
    
    // 更新统计
    this.stats.instanceCount = this.instances.size;
    
    // 调度缓冲区更新
    this.scheduleBufferUpdate();
    
    console.log(`Removed primitive ${id}`);
  }
  
  /**
   * 批量删除图元
   */
  removePrimitivesBatch(ids: string[]): void {
    for (const id of ids) {
      this.removePrimitive(id);
    }
    
    // 批量更新缓冲区
    this.scheduleBufferUpdate();
  }
  
  /**
   * 查询图元
   */
  queryPrimitives(options: PrimitiveQueryOptions): string[] {
    // TODO: 实现空间索引查询
    const results: string[] = [];
    
    for (const instance of this.instances.values()) {
      let match = true;
      
      // 领域过滤
      if (options.domain) {
        const domain = this.guessDomainFromSidc(instance.primitive.sidc);
        if (domain !== options.domain) {
          match = false;
        }
      }
      
      // 阵营过滤
      if (options.identity) {
        const identity = instance.primitive.properties.identity;
        if (Array.isArray(options.identity)) {
          if (!options.identity.includes(identity)) {
            match = false;
          }
        } else if (identity !== options.identity) {
          match = false;
        }
      }
      
      // 空间范围过滤
      if (options.bounds) {
        const [lng, lat] = [instance.primitive.position[0], instance.primitive.position[1]];
        const [[minLng, minLat], [maxLng, maxLat]] = options.bounds;
        
        if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
          match = false;
        }
      }
      
      if (match) {
        results.push(instance.id);
      }
    }
    
    return results;
  }
  
  /**
   * 设置图元可见性
   */
  setPrimitiveVisibility(id: string, visible: boolean): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    
    instance.visible = visible;
    this.dirtyInstances.add(id);
    this.dirtyBuffer = true;
    
    this.scheduleBufferUpdate();
  }
  
  /**
   * 获取性能统计
   */
  getPerformanceStats(): PerformanceStats {
    // 更新实时统计
    this.updateRealTimeStats();
    
    return { ...this.stats };
  }
  
  /**
   * 清理所有图元
   */
  clearAll(): void {
    const ids = Array.from(this.instances.keys());
    this.removePrimitivesBatch(ids);
    
    // 重置缓冲区
    this.nextBufferIndex = 0;
    
    console.log('Cleared all primitives');
  }
  
  /**
   * 销毁渲染器
   */
  destroy(): void {
    // 清理 GPU 资源
    if (this.primitive && !(this.primitive as any).isDestroyed()) {
      (this.primitive as any).destroy();
    }
    
    if (this.vertexBuffer && !(this.vertexBuffer as any).isDestroyed()) {
      (this.vertexBuffer as any).destroy();
    }
    
    if (this.indexBuffer && !(this.indexBuffer as any).isDestroyed()) {
      (this.indexBuffer as any).destroy();
    }
    
    if (this.instanceBuffer && !(this.instanceBuffer as any).isDestroyed()) {
      (this.instanceBuffer as any).destroy();
    }
    
    // 清理数据结构
    this.instances.clear();
    this.instanceIds = [];
    this.dirtyInstances.clear();
    
    // 清理事件监听器
    this.eventListeners.clear();
    
    console.log('HighPerformancePrimitiveRenderer destroyed');
  }
  
  // ============ 私有方法 ============
  
  /**
   * 生成实例 ID
   */
  private generateInstanceId(): string {
    return `hp_instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 从选项创建高级图元
   */
  private createAdvancedPrimitiveFromOptions(options: PrimitiveCreateOptions, id: string): AdvancedPrimitive {
    // 这里简化为使用现有逻辑，实际应该复用现有实现
    // TODO: 复用现有的 createPrimitiveFromOptions 逻辑
    
    return {
      id,
      sidc: options.sidc,
      position: options.position,
      orientation: [0, 0, 0],
      properties: {
        identity: options.properties?.identity || IdentityCode.UNKNOWN,
        commandRelation: options.properties?.commandRelation || CommandRelation.SELF,
        status: options.properties?.status || StatusCode.PRESENT,
        name: options.properties?.name || '',
        ...options.properties
      },
      interaction: {
        selectable: options.interaction?.selectable ?? true,
        draggable: options.interaction?.draggable ?? false,
        labelDraggable: options.interaction?.labelDraggable ?? true,
        editable: options.interaction?.editable ?? true,
        showLabel: options.interaction?.showLabel ?? true,
        showInfoCard: options.interaction?.showInfoCard ?? true,
        highlightOnHover: options.interaction?.highlightOnHover ?? true,
        labelOffset: options.interaction?.labelOffset || [0, 50, 0],
        ...options.interaction
      },
      visualization: {
        use3DModel: options.visualization?.use3DModel ?? false,
        modelUrl: options.visualization?.modelUrl,
        billboardUrl: options.visualization?.billboardUrl,
        scale: options.visualization?.scale ?? 1.0,
        billboardSize: options.visualization?.billboardSize || [64, 64],
        color: options.visualization?.color,
        ...options.visualization
      },
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ...options.metadata
      }
    };
  }
  
  /**
   * 合并图元更新
   */
  private mergePrimitiveUpdates(
    primitive: AdvancedPrimitive,
    updates: PrimitiveUpdateOptions
  ): AdvancedPrimitive {
    const merged = { ...primitive };
    
    if (updates.position) {
      merged.position = updates.position;
    }
    
    if (updates.orientation) {
      merged.orientation = updates.orientation;
    }
    
    if (updates.properties) {
      merged.properties = { ...merged.properties, ...updates.properties };
    }
    
    if (updates.interaction) {
      merged.interaction = { ...merged.interaction, ...updates.interaction };
    }
    
    if (updates.visualization) {
      merged.visualization = { ...merged.visualization, ...updates.visualization };
    }
    
    if (merged.metadata) {
      merged.metadata.updated = new Date().toISOString();
    } else {
      merged.metadata = {
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
    }
    
    return merged;
  }
  
  /**
   * 创建基础几何（四边形）
   */
  private createBaseGeometry(): void {
    // 创建四边形几何（用于实例化渲染）
    // 顶点位置（单位四边形）
    const positions = new Float32Array([
      -0.5, -0.5, 0,  // 左下
       0.5, -0.5, 0,  // 右下
       0.5,  0.5, 0,  // 右上
      -0.5,  0.5, 0   // 左上
    ]);
    
    // 纹理坐标
    const texCoords = new Float32Array([
      0, 0,  // 左下
      1, 0,  // 右下
      1, 1,  // 右上
      0, 1   // 左上
    ]);
    
    // 索引
    const indices = new Uint16Array([
      0, 1, 2,
      0, 2, 3
    ]);
    
    // 创建顶点缓冲区
    this.vertexBuffer = new (Cesium as any).Buffer({
      context: (this.viewer.scene as any).context,
      typedArray: positions,
      usage: (Cesium as any).BufferUsage.STATIC_DRAW
    });
    
    // 创建纹理坐标缓冲区
    const texCoordBuffer = new (Cesium as any).Buffer({
      context: (this.viewer.scene as any).context,
      typedArray: texCoords,
      usage: (Cesium as any).BufferUsage.STATIC_DRAW
    });
    
    // 创建索引缓冲区
    this.indexBuffer = new (Cesium as any).Buffer({
      context: (this.viewer.scene as any).context,
      typedArray: indices,
      usage: (Cesium as any).BufferUsage.STATIC_DRAW,
      indexDatatype: (Cesium as any).IndexDatatype.UNSIGNED_SHORT
    });
    
    // 创建几何属性
    const attributes = new (Cesium as any).GeometryAttributes({
      position: new (Cesium as any).GeometryAttribute({
        componentDatatype: (Cesium as any).ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        normalize: false,
        values: positions
      }),
      st: new (Cesium as any).GeometryAttribute({
        componentDatatype: (Cesium as any).ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        normalize: false,
        values: texCoords
      })
    });
    
    this.geometry = new Cesium.Geometry({
      attributes: attributes,
      indices: indices,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(Array.from(positions))
    });
    
    console.log('Base geometry created');
  }
  
  /**
   * 创建外观（着色器）
   */
  private createAppearance(): void {
    // 创建自定义着色器
    // TODO: 实现完整的军事符号着色器
    const vertexShaderSource = `
      attribute vec3 position;
      attribute vec2 texCoord;
      
      varying vec2 v_texCoord;
      
      void main() {
        v_texCoord = texCoord;
        gl_Position = czm_projection * czm_modelView * vec4(position, 1.0);
      }
    `;
    
    const fragmentShaderSource = `
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      
      void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
      }
    `;
    
    this.appearance = new Cesium.Appearance({
      material: undefined,
      translucent: false,
      vertexShaderSource: vertexShaderSource,
      fragmentShaderSource: fragmentShaderSource
    });
    
    console.log('Cesium.Appearance created');
  }
  
  /**
   * 创建 Cesium Cesium.Primitive 对象
   */
  private createCesiumPrimitive(): void {
    this.primitive = new Cesium.Primitive({
      geometryInstances: [],  // 开始时为空
      appearance: this.appearance!,
      asynchronous: false,
      show: true
    });
    
    // 添加到场景
    this.viewer.scene.primitives.add(this.primitive);
    
    console.log('Cesium Cesium.Primitive created and added to scene');
  }
  
  /**
   * 绑定到渲染循环
   */
  private bindToRenderLoop(): void {
    this.viewer.scene.preRender.addEventListener(() => {
      this.updateRenderLoop();
    });
  }
  
  /**
   * 更新渲染循环
   */
  private updateRenderLoop(): void {
    const now = Date.now();
    
    // 更新帧时间统计
    if (this.lastFrameTime > 0) {
      this.stats.frameTime = now - this.lastFrameTime;
    }
    this.lastFrameTime = now;
    this.frameCount++;
    
    // 执行视锥剔除
    if (this.config.enableFrustumCulling) {
      this.performFrustumCulling();
    }
    
    // 更新 LOD
    this.updateLodLevels();
    
    // 更新脏缓冲区
    if (this.dirtyBuffer) {
      this.updateInstanceBuffers();
      this.dirtyBuffer = false;
    }
    
    // 记录性能统计
    if (this.config.logPerformanceStats && this.frameCount % 60 === 0) {
      this.logPerformanceStats();
    }
    
    // 显示调试信息
    if (this.config.showDebugOverlay) {
      this.renderDebugOverlay();
    }
  }
  
  /**
   * 执行视锥剔除
   */
  private performFrustumCulling(): void {
    // TODO: 实现视锥剔除
    // 基于空间索引快速剔除不可见实例
    this.stats.visibleCount = this.instances.size;
    this.stats.culledCount = 0;
  }
  
  /**
   * 更新 LOD 级别
   */
  private updateLodLevels(): void {
    // TODO: 基于距离计算 LOD 级别
    for (const instance of this.instances.values()) {
      // 简化为固定 LOD
      instance.lodLevel = 0;
    }
  }
  
  /**
   * 更新实例缓冲区
   */
  private updateInstanceBuffers(): void {
    if (this.dirtyInstances.size === 0) {
      return;
    }
    
    try {
      // 收集需要更新的实例属性
      const instanceData = this.collectInstanceData();
      
      // 更新 GPU 缓冲区
      this.updateGpuBuffers(instanceData);
      
      // 更新统计
      this.stats.bufferUpdateCount++;
      
      // 清理脏实例集
      this.dirtyInstances.clear();
      
      console.log(`Updated instance buffers for ${instanceData.length} instances`);
    } catch (error) {
      console.error('Failed to update instance buffers:', error);
    }
  }
  
  /**
   * 收集实例数据
   */
  private collectInstanceData(): any[] {
    const data: any[] = [];
    
    for (const instanceId of this.dirtyInstances) {
      const instance = this.instances.get(instanceId);
      if (!instance) continue;
      
      data.push({
        id: instance.id,
        position: instance.primitive.position,
        color: this.getColorForIdentity(instance.primitive.properties.identity),
        scale: instance.primitive.visualization.scale || 1.0,
        rotation: instance.primitive.orientation?.[0] || 0,
        visible: instance.visible ? 1 : 0
      });
    }
    
    return data;
  }
  
  /**
   * 更新 GPU 缓冲区
   */
  private updateGpuBuffers(instanceData: any[]): void {
    // TODO: 实现 GPU 缓冲区更新
    // 需要更新实例属性缓冲区
    console.log(`Would update GPU buffers for ${instanceData.length} instances`);
  }
  
  /**
   * 调度缓冲区更新
   */
  private scheduleBufferUpdate(): void {
    // 使用 requestAnimationFrame 延迟更新，避免每帧都更新
    if (!this.dirtyBuffer) {
      this.dirtyBuffer = true;
    }
  }
  
  /**
   * 根据阵营获取颜色
   */
  private getColorForIdentity(identity: IdentityCode): [number, number, number, number] {
    // 标准 MIL-STD-2525D 颜色
    switch (identity) {
      case IdentityCode.FRIEND: return [0, 170, 255, 255];     // #00AAFF
      case IdentityCode.HOSTILE: return [255, 68, 68, 255];    // #FF4444
      case IdentityCode.NEUTRAL: return [0, 204, 102, 255];    // #00CC66
      case IdentityCode.UNKNOWN: return [255, 255, 0, 255];    // #FFFF00
      case IdentityCode.PENDING: return [0, 255, 255, 255];    // #00FFFF
      default: return [255, 255, 255, 255];                    // #FFFFFF
    }
  }
  
  /**
   * 根据 SIDC 推测领域
   */
  private guessDomainFromSidc(sidc: SIDC): MilitaryDomain {
    if (sidc.length < 10) return MilitaryDomain.LAND;
    
    const domainChar = sidc[3];
    switch (domainChar) {
      case 'G': return MilitaryDomain.LAND;
      case 'S': return MilitaryDomain.SEA;
      case 'F': return MilitaryDomain.AIR;
      case 'R': return MilitaryDomain.AIR;
      case 'X': return MilitaryDomain.SPACE;
      case 'W': return MilitaryDomain.SUBSURFACE;
      default: return MilitaryDomain.LAND;
    }
  }
  
  /**
   * 更新实时统计
   */
  private updateRealTimeStats(): void {
    // 更新绘制调用统计（简化）
    this.stats.drawCalls = this.primitive ? 1 : 0;
    
    // 更新内存使用
    this.stats.memoryUsage = this.calculateMemoryUsage();
  }
  
  /**
   * 计算内存使用
   */
  private calculateMemoryUsage(): number {
    let memory = 0;
    
    // 实例数据结构
    memory += this.instances.size * 200; // 每个实例约200字节
    
    // GPU 缓冲区（近似）
    memory += this.vertexBuffer ? this.config.maxInstances * 12 * 4 : 0; // 位置
    memory += this.config.maxInstances * 8 * 4;  // 颜色 (RGBA)
    memory += this.config.maxInstances * 8 * 4;  // UV
    memory += this.config.maxInstances * 4;      // 缩放
    memory += this.config.maxInstances * 4;      // 旋转
    
    return memory;
  }
  
  /**
   * 记录性能统计
   */
  private logPerformanceStats(): void {
    console.group('HighPerformancePrimitiveRenderer Stats');
    console.log('Frame Time:', this.stats.frameTime.toFixed(2), 'ms');
    console.log('Draw Calls:', this.stats.drawCalls);
    console.log('Instance Count:', this.stats.instanceCount);
    console.log('Visible Count:', this.stats.visibleCount);
    console.log('Memory Usage:', (this.stats.memoryUsage / 1024 / 1024).toFixed(2), 'MB');
    console.log('Buffer Updates:', this.stats.bufferUpdateCount);
    console.groupEnd();
  }
  
  /**
   * 渲染调试覆盖层
   */
  private renderDebugOverlay(): void {
    // TODO: 实现调试覆盖层渲染
    // 显示实例边界框、LOD 级别等信息
  }
  
  /**
   * 添加事件监听器
   */
  on(eventType: string, callback: Function): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
  }
  
  /**
   * 移除事件监听器
   */
  off(eventType: string, callback: Function): void {
    const listeners = this.eventListeners.get(eventType);
    if (!listeners) return;
    
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }
  
  /**
   * 触发事件
   */
  private emit(eventType: string, data?: any): void {
    const listeners = this.eventListeners.get(eventType);
    if (!listeners) return;
    
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${eventType}:`, error);
      }
    }
  }
}