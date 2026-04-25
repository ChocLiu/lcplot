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
  private primitives: Cesium.PrimitiveCollection | null = null;
  private appearance: Cesium.Appearance | null = null;
  private geometry: Cesium.Geometry | null = null;
  private instanceAttributes: InstanceAttributes | null = null;
  private vertexBuffer: Buffer | null = null;
  private indexBuffer: Buffer | null = null;
  private instanceBuffer: Buffer | null = null;
  
  // 场景上下文缓存
  private cesiumContext: any = null;
  
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
   * 删除图元（同时从 GPU 场景中移除对应的 Primitive）
   */
  removePrimitive(id: string): void {
    const instance = this.instances.get(id);
    if (!instance) {
      console.warn(`Cesium.Primitive ${id} not found, skipping removal`);
      return;
    }
    
    // 从 PrimitiveCollection 中移除对应的 GPU Primitive
    if (this.primitives && instance.geometryInstance) {
      const prim = this.findPrimitiveByInstance(instance.geometryInstance);
      if (prim) {
        this.primitives.remove(prim);
        try { (prim as any).destroy(); } catch (e) { /* ignore */ }
      }
    }
    
    // 移除实例
    this.instances.delete(id);
    const index = this.instanceIds.indexOf(id);
    if (index > -1) {
      this.instanceIds.splice(index, 1);
    }
    
    // 从脏实例集中移除
    this.dirtyInstances.delete(id);
    
    // 更新统计
    this.stats.instanceCount = this.instances.size;
    
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
   * 获取单个图元数据
   */
  getPrimitive(id: string): AdvancedPrimitive | null {
    const instance = this.instances.get(id);
    return instance ? instance.primitive : null;
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
    // 清理 PrimitiveCollection（自动清理所有子 Primitive）
    if (this.primitives && !(this.primitives as any).isDestroyed()) {
      this.viewer.scene.primitives.remove(this.primitives);
      (this.primitives as any).destroy();
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
   * 创建基础几何（单位四边形，用于实例化渲染）
   */
  private createBaseGeometry(): void {
    const cesium = this.getCesiumCtx();
    
    const positions = new Float32Array([
      -0.5, -0.5, 0,
       0.5, -0.5, 0,
       0.5,  0.5, 0,
      -0.5,  0.5, 0
    ]);
    
    const texCoords = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1
    ]);
    
    const indices = new Uint16Array([
      0, 1, 2, 0, 2, 3
    ]);
    
    this.cesiumContext = (this.viewer.scene as any).context;
    
    // 创建几何属性
    const attributes = new cesium.GeometryAttributes({
      position: new cesium.GeometryAttribute({
        componentDatatype: cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        normalize: false,
        values: positions
      }),
      st: new cesium.GeometryAttribute({
        componentDatatype: cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 2,
        normalize: false,
        values: texCoords
      })
    });
    
    this.geometry = new cesium.Geometry({
      attributes: attributes,
      indices: indices,
      primitiveType: cesium.PrimitiveType.TRIANGLES,
      boundingSphere: cesium.BoundingSphere.fromVertices(Array.from(positions))
    });
    
    console.log('Base geometry created');
  }
  
  /**
   * 创建外观（着色器）—— BillboardCollection 风格纹理采样
   * 使用 PerInstanceColorAppearance 支持每实例颜色
   */
  private createAppearance(): void {
    const cesium = this.getCesiumCtx();
    
    // 使用 PerInstanceColorAppearance 以支持每实例颜色
    this.appearance = new cesium.PerInstanceColorAppearance({
      translucent: true,
      closed: false,
      flat: true,
      faceForward: true,
      vertexShaderSource: undefined,
      fragmentShaderSource: undefined
    });
    
    console.log('PerInstanceColorAppearance created');
  }
  
  /**
   * 创建 Cesium PrimitiveCollection（支持动态增删图元）
   */
  private createCesiumPrimitive(): void {
    const cesium = this.getCesiumCtx();
    
    // PrimitiveCollection 允许动态添加/移除 Primitive
    this.primitives = new cesium.PrimitiveCollection();
    
    // 添加到场景
    this.viewer.scene.primitives.add(this.primitives);
    
    console.log('Cesium PrimitiveCollection created and added to scene');
  }
  
  /**
   * 获取 Cesium 静态引用
   */
  private getCesiumCtx(): any {
    return Cesium;
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
   * 基于相机视锥体与实例位置包围球的相交测试
   */
  private performFrustumCulling(): void {
    const camera = this.viewer.camera;
    const frustum = camera.frustum;
    if (!frustum) {
      this.stats.visibleCount = this.instances.size;
      this.stats.culledCount = 0;
      return;
    }
    
    const cesium = this.getCesiumCtx();
    const scratchSphere = new cesium.BoundingSphere();
    let visible = 0;
    
    for (const instance of this.instances.values()) {
      if (!instance.visible) continue;
      
      // 位置世界坐标转相机空间进行剔除
      const [lng, lat, alt = 0] = instance.primitive.position;
      const pos = cesium.Cartesian3.fromDegrees(lng, lat, alt);
      
      scratchSphere.center = pos;
      scratchSphere.radius = this.getBoundingRadius(instance);
      
      // 相交测试
      const intersection = frustum.computeCullingVolume(
        camera.positionWC,
        camera.directionWC,
        camera.upWC
      ).computeVisibility(scratchSphere);
      
      const isVisible = intersection !== cesium.Intersect.OUTSIDE;
      instance.visible = isVisible;
      visible += isVisible ? 1 : 0;
    }
    
    this.stats.visibleCount = visible;
    this.stats.culledCount = this.instances.size - visible;
  }
  
  /**
   * 估算实例的包围球半径
   */
  private getBoundingRadius(instance: any): number {
    const scale = instance.primitive.visualization.scale || 1.0;
    // 以10米为基准，按scale缩放
    return 10.0 * scale + 50.0; // 至少50米防止太小导致闪烁
  }
  
  /**
   * 更新 LOD 级别（基于相机距离）
   */
  private updateLodLevels(): void {
    const camera = this.viewer.camera;
    if (!camera) return;
    
    const cesium = this.getCesiumCtx();
    const scratchCart = new cesium.Cartographic();
    const maxLod = this.config.lodLevels - 1;
    
    // LOD 距离阈值
    const distances = [5000, 20000, 50000]; // 5km, 20km, 50km
    
    for (const instance of this.instances.values()) {
      if (!instance.visible) continue;
      
      const [lng, lat, alt = 0] = instance.primitive.position;
      const pos = cesium.Cartesian3.fromDegrees(lng, lat, alt);
      
      // 计算到相机的距离
      const distance = cesium.Cartesian3.distance(pos, camera.positionWC);
      
      // 根据距离分配 LOD
      let lod = 0;
      for (let i = 0; i < distances.length; i++) {
        if (distance > distances[i]) {
          lod = i + 1;
        }
      }
      instance.lodLevel = Math.min(lod, maxLod);
      
      // 超远距离隐藏
      if (distance > 200000) {
        instance.visible = false;
      }
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
   * 为脏实例创建/更新 GeometryInstance 并添加到 PrimitiveCollection
   */
  private updateGpuBuffers(instanceData: any[]): void {
    if (!this.primitives || instanceData.length === 0) return;
    
    const cesium = this.getCesiumCtx();
    
    for (const data of instanceData) {
      const instance = this.instances.get(data.id);
      if (!instance) continue;
      
      const [lng, lat, alt = 0] = instance.primitive.position;
      const pos = cesium.Cartesian3.fromDegrees(lng, lat, alt);
      
      // 创建模型矩阵（位置 + 朝向 + 缩放）
      const scale = data.scale;
      const rotation = data.rotation || 0;
      
      // 简化的模型矩阵：LOH
      const hpr = new cesium.HeadingPitchRoll(rotation, 0, 0);
      const modelMatrix = cesium.Transforms.headingPitchRollToFixedFrame(
        pos, hpr, cesium.Ellipsoid.WGS84, cesium.Transforms.localFrameToFixedFrameGenerator('north', 'east')
      );
      
      // 应用缩放
      const scaleMatrix = cesium.Matrix4.fromScale(
        new cesium.Cartesian3(scale, scale, scale)
      );
      cesium.Matrix4.multiply(modelMatrix, scaleMatrix, modelMatrix);
      
      // 创建带颜色的几何实例
      const color = new cesium.Color(
        data.color[0] / 255,
        data.color[1] / 255,
        data.color[2] / 255,
        1.0
      );
      
      const geometryInstance = new cesium.GeometryInstance({
        geometry: this.geometry,
        modelMatrix: modelMatrix,
        attributes: {
          color: cesium.ColorGeometryInstanceAttribute.fromColor(color)
        }
      });
      
      // 如果已有旧 Primitive，先移除
      if (instance.geometryInstance) {
        // 查找并移除对应的 Primitive
        const oldPrim = this.findPrimitiveByInstance(instance.geometryInstance);
        if (oldPrim) {
          this.primitives.remove(oldPrim);
          (oldPrim as any).destroy();
        }
      }
      
      // 创建新的 Primitive 并添加到集合
      const newPrim = new cesium.Primitive({
        geometryInstances: [geometryInstance],
        appearance: this.appearance,
        asynchronous: false,
        show: instance.visible
      });
      
      this.primitives.add(newPrim);
      instance.geometryInstance = geometryInstance;
      
      // 更新统计
      this.stats.drawCalls += 1;
    }
    
    this.stats.bufferUpdateCount++;
  }
  
  /**
   * 查找指定 GeometryInstance 所属的 Primitive
   */
  private findPrimitiveByInstance(instance: any): any {
    if (!this.primitives) return null;
    for (let i = 0; i < this.primitives.length; i++) {
      const prim = this.primitives.get(i);
      if (!prim) continue;
      const instances = (prim as any).geometryInstances;
      if (instances && Array.isArray(instances)) {
        for (const gi of instances) {
          if (gi === instance) return prim;
        }
      }
    }
    return null;
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
    this.stats.drawCalls = this.primitives ? this.primitives.length : 0;
    
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
    // 使用 Canvas 2D 叠加显示调试信息
    if (!this.config.showDebugOverlay) return;
    
    const debugInfo = {
      instances: this.instances.size,
      visible: this.stats.visibleCount,
      culled: this.stats.culledCount,
      drawCalls: this.stats.drawCalls,
      frameTime: this.stats.frameTime.toFixed(1),
      memory: (this.stats.memoryUsage / 1024 / 1024).toFixed(1)
    };
    
    // 通过 console 输出调试信息会污染日志
    // 更好的做法：用 overlay DOM
    const overlayId = '__hp_debug_overlay';
    let overlay = document.getElementById(overlayId);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = overlayId;
      overlay.style.cssText = 'position:fixed;top:80px;right:10px;background:rgba(0,0,0,0.7);color:#0f0;padding:8px;font:12px monospace;z-index:9999;border-radius:4px;pointer-events:none;';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = [
      `Instances: ${debugInfo.instances}`,
      `Visible: ${debugInfo.visible}`,
      `Culled: ${debugInfo.culled}`,
      `Draw Calls: ${debugInfo.drawCalls}`,
      `Frame: ${debugInfo.frameTime}ms`,
      `Memory: ${debugInfo.memory}MB`
    ].join('<br>');
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