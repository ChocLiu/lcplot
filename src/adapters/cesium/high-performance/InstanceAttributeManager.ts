/**
 * 实例属性管理器
 * 负责管理几何实例的 GPU 缓冲区数据
 */

import {
  Cartesian3,
  Buffer,
  ComponentDatatype,
  BufferUsage,
  Context
} from 'cesium';

/**
 * 实例属性类型
 */
export interface InstanceAttribute {
  name: string;
  componentDatatype: number;  // ComponentDatatype
  componentsPerAttribute: number;
  normalize: boolean;
  usage: number;  // BufferUsage
}

/**
 * 实例数据
 */
export interface InstanceData {
  position: Float32Array;      // [x, y, z] 世界坐标
  color: Uint8Array;           // [r, g, b, a] 颜色
  uv: Float32Array;            // [u1, v1, u2, v2] 纹理坐标
  scale: Float32Array;         // [scale] 缩放
  rotation: Float32Array;      // [angle] 旋转角度（弧度）
  instanceId: Float32Array;    // [id] 实例ID（用于拾取）
  visible: Uint8Array;         // [visible] 可见性（0或1）
  lodLevel: Uint8Array;        // [lod] LOD级别
}

/**
 * 实例更新操作
 */
export interface InstanceUpdate {
  instanceId: string;
  bufferIndex: number;
  attributes: Partial<{
    position: [number, number, number];
    color: [number, number, number, number];
    uv: [number, number, number, number];
    scale: number;
    rotation: number;
    visible: number;
    lodLevel: number;
  }>;
}

/**
 * 缓冲区统计信息
 */
export interface BufferStats {
  totalInstances: number;
  bufferSize: number;          // 字节数
  attributeCount: number;
  updateCount: number;
  fragmentation: number;       // 碎片化程度 (0-1)
}

/**
 * 实例属性管理器配置
 */
export interface InstanceAttributeManagerConfig {
  maxInstances: number;        // 最大实例数
  initialCapacity?: number;    // 初始容量
  growFactor?: number;         // 扩容因子
  enableCompression?: boolean; // 启用属性压缩
  enableDoubleBuffer?: boolean; // 启用双缓冲
  updateThreshold?: number;    // 更新阈值（百分比）
}

/**
 * 实例属性管理器
 */
export class InstanceAttributeManager {
  // 配置
  private config: InstanceAttributeManagerConfig;
  
  // 缓冲区管理
  private maxInstances: number;
  private instanceCount = 0;
  private bufferCapacity = 0;
  
  // GPU 缓冲区
  private positionBuffer: Buffer | null = null;
  private colorBuffer: Buffer | null = null;
  private uvBuffer: Buffer | null = null;
  private scaleBuffer: Buffer | null = null;
  private rotationBuffer: Buffer | null = null;
  private instanceIdBuffer: Buffer | null = null;
  private visibleBuffer: Buffer | null = null;
  private lodBuffer: Buffer | null = null;
  
  // CPU 数据（用于增量更新）
  private cpuPositionData: Float32Array | null = null;
  private cpuColorData: Uint8Array | null = null;
  private cpuUvData: Float32Array | null = null;
  private cpuScaleData: Float32Array | null = null;
  private cpuRotationData: Float32Array | null = null;
  private cpuInstanceIdData: Float32Array | null = null;
  private cpuVisibleData: Uint8Array | null = null;
  private cpuLodData: Uint8Array | null = null;
  
  // 双缓冲（如果启用）
  private doubleBuffers: {
    position: [Buffer | null, Buffer | null];
    color: [Buffer | null, Buffer | null];
    uv: [Buffer | null, Buffer | null];
    scale: [Buffer | null, Buffer | null];
    rotation: [Buffer | null, Buffer | null];
    instanceId: [Buffer | null, Buffer | null];
    visible: [Buffer | null, Buffer | null];
    lod: [Buffer | null, Buffer | null];
  };
  
  private currentBufferIndex = 0;
  private nextBufferIndex = 1;
  
  // 更新管理
  private dirtyInstances = new Set<number>();  // 脏实例索引
  private dirtyRanges: Array<{ start: number; end: number }> = [];  // 脏数据范围
  private updateCount = 0;
  
  // 碎片管理
  private freeSlots: number[] = [];  // 空闲槽位
  private slotMap = new Map<string, number>();  // 实例ID -> 缓冲区索引
  
  // 性能统计
  private stats: BufferStats = {
    totalInstances: 0,
    bufferSize: 0,
    attributeCount: 8,
    updateCount: 0,
    fragmentation: 0
  };
  
  // WebGL 上下文
  private context: Context | null = null;
  
  constructor(config: InstanceAttributeManagerConfig) {
    this.config = {
      maxInstances: 100000,
      initialCapacity: 1024,
      growFactor: 2.0,
      enableCompression: false,
      enableDoubleBuffer: false,
      updateThreshold: 0.1,  // 10%
      ...config
    };
    
    this.maxInstances = this.config.maxInstances;
    this.bufferCapacity = Math.min(this.config.initialCapacity!, this.maxInstances);
    
    // 初始化双缓冲结构
    this.doubleBuffers = {
      position: [null, null],
      color: [null, null],
      uv: [null, null],
      scale: [null, null],
      rotation: [null, null],
      instanceId: [null, null],
      visible: [null, null],
      lod: [null, null]
    };
    
    console.log(`InstanceAttributeManager initialized with capacity ${this.bufferCapacity}`);
  }
  
  /**
   * 初始化 GPU 缓冲区
   */
  initialize(context: Context): void {
    this.context = context;
    
    // 创建 CPU 数据数组
    this.createCpuDataArrays();
    
    // 创建 GPU 缓冲区
    this.createGpuBuffers();
    
    console.log('InstanceAttributeManager GPU buffers initialized');
  }
  
  /**
   * 添加实例
   */
  addInstance(
    instanceId: string,
    attributes: {
      position: [number, number, number];
      color: [number, number, number, number];
      uv: [number, number, number, number];
      scale: number;
      rotation: number;
    }
  ): number {
    // 检查容量
    if (this.instanceCount >= this.maxInstances) {
      throw new Error(`Maximum instances (${this.maxInstances}) reached`);
    }
    
    // 获取缓冲区索引（优先使用空闲槽位）
    let bufferIndex: number;
    if (this.freeSlots.length > 0) {
      bufferIndex = this.freeSlots.pop()!;
    } else {
      bufferIndex = this.instanceCount;
      this.instanceCount++;
      
      // 检查是否需要扩容
      if (this.instanceCount > this.bufferCapacity) {
        this.expandCapacity();
      }
    }
    
    // 存储映射关系
    this.slotMap.set(instanceId, bufferIndex);
    
    // 设置实例数据
    this.setInstanceData(bufferIndex, {
      ...attributes,
      instanceId: bufferIndex,
      visible: 1,
      lodLevel: 0
    });
    
    // 标记为脏
    this.dirtyInstances.add(bufferIndex);
    this.updateDirtyRanges(bufferIndex, bufferIndex);
    
    // 更新统计
    this.stats.totalInstances = this.instanceCount - this.freeSlots.length;
    this.calculateFragmentation();
    
    console.log(`Added instance ${instanceId} at buffer index ${bufferIndex}`);
    
    return bufferIndex;
  }
  
  /**
   * 更新实例属性
   */
  updateInstance(instanceId: string, attributes: Partial<InstanceUpdate['attributes']>): void {
    const bufferIndex = this.slotMap.get(instanceId);
    if (bufferIndex === undefined) {
      console.warn(`Instance ${instanceId} not found`);
      return;
    }
    
    // 更新 CPU 数据
    this.setInstanceData(bufferIndex, attributes);
    
    // 标记为脏
    this.dirtyInstances.add(bufferIndex);
    this.updateDirtyRanges(bufferIndex, bufferIndex);
    
    this.stats.updateCount++;
  }
  
  /**
   * 批量更新实例
   */
  updateInstancesBatch(updates: InstanceUpdate[]): void {
    let minIndex = Infinity;
    let maxIndex = -Infinity;
    
    for (const update of updates) {
      const { bufferIndex, attributes } = update;
      
      // 更新 CPU 数据
      this.setInstanceData(bufferIndex, attributes);
      
      // 标记为脏
      this.dirtyInstances.add(bufferIndex);
      
      // 更新范围
      minIndex = Math.min(minIndex, bufferIndex);
      maxIndex = Math.max(maxIndex, bufferIndex);
    }
    
    if (minIndex <= maxIndex) {
      this.updateDirtyRanges(minIndex, maxIndex);
    }
    
    this.stats.updateCount += updates.length;
  }
  
  /**
   * 移除实例
   */
  removeInstance(instanceId: string): void {
    const bufferIndex = this.slotMap.get(instanceId);
    if (bufferIndex === undefined) {
      console.warn(`Instance ${instanceId} not found for removal`);
      return;
    }
    
    // 移除映射
    this.slotMap.delete(instanceId);
    
    // 将槽位标记为空闲
    this.freeSlots.push(bufferIndex);
    
    // 将实例数据重置为默认值（可选）
    this.resetInstanceData(bufferIndex);
    
    // 标记为脏（如果需要回收空间）
    this.dirtyInstances.add(bufferIndex);
    this.updateDirtyRanges(bufferIndex, bufferIndex);
    
    // 更新统计
    this.stats.totalInstances = this.instanceCount - this.freeSlots.length;
    this.calculateFragmentation();
    
    console.log(`Removed instance ${instanceId} from buffer index ${bufferIndex}`);
  }
  
  /**
   * 获取实例缓冲区索引
   */
  getInstanceBufferIndex(instanceId: string): number | undefined {
    return this.slotMap.get(instanceId);
  }
  
  /**
   * 获取所有实例ID
   */
  getAllInstanceIds(): string[] {
    return Array.from(this.slotMap.keys());
  }
  
  /**
   * 获取缓冲区属性定义
   */
  getAttributeDefinitions(): InstanceAttribute[] {
    return [
      {
        name: 'instancePosition',
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        normalize: false,
        usage: BufferUsage.STATIC_DRAW
      },
      {
        name: 'instanceColor',
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 4,
        normalize: true,
        usage: BufferUsage.STATIC_DRAW
      },
      {
        name: 'instanceUv',
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 4,
        normalize: false,
        usage: BufferUsage.STATIC_DRAW
      },
      {
        name: 'instanceScale',
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 1,
        normalize: false,
        usage: BufferUsage.STATIC_DRAW
      },
      {
        name: 'instanceRotation',
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 1,
        normalize: false,
        usage: BufferUsage.STATIC_DRAW
      },
      {
        name: 'instanceId',
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 1,
        normalize: false,
        usage: BufferUsage.STATIC_DRAW
      },
      {
        name: 'instanceVisible',
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 1,
        normalize: false,
        usage: BufferUsage.STATIC_DRAW
      },
      {
        name: 'instanceLod',
        componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
        componentsPerAttribute: 1,
        normalize: false,
        usage: BufferUsage.STATIC_DRAW
      }
    ];
  }
  
  /**
   * 获取 GPU 缓冲区
   */
  getGpuBuffers(): {
    position: Buffer | null;
    color: Buffer | null;
    uv: Buffer | null;
    scale: Buffer | null;
    rotation: Buffer | null;
    instanceId: Buffer | null;
    visible: Buffer | null;
    lod: Buffer | null;
  } {
    if (this.config.enableDoubleBuffer) {
      const buffers = this.doubleBuffers;
      return {
        position: buffers.position[this.currentBufferIndex],
        color: buffers.color[this.currentBufferIndex],
        uv: buffers.uv[this.currentBufferIndex],
        scale: buffers.scale[this.currentBufferIndex],
        rotation: buffers.rotation[this.currentBufferIndex],
        instanceId: buffers.instanceId[this.currentBufferIndex],
        visible: buffers.visible[this.currentBufferIndex],
        lod: buffers.lod[this.currentBufferIndex]
      };
    } else {
      return {
        position: this.positionBuffer,
        color: this.colorBuffer,
        uv: this.uvBuffer,
        scale: this.scaleBuffer,
        rotation: this.rotationBuffer,
        instanceId: this.instanceIdBuffer,
        visible: this.visibleBuffer,
        lod: this.lodBuffer
      };
    }
  }
  
  /**
   * 更新 GPU 缓冲区（将脏数据上传到 GPU）
   */
  updateGpuBuffers(): boolean {
    if (!this.context || this.dirtyRanges.length === 0) {
      return false;
    }
    
    try {
      // 合并相邻的脏范围
      this.mergeDirtyRanges();
      
      // 为每个脏范围更新 GPU 缓冲区
      for (const range of this.dirtyRanges) {
        this.updateGpuBufferRange(range.start, range.end);
      }
      
      // 如果使用双缓冲，切换缓冲区
      if (this.config.enableDoubleBuffer && this.dirtyRanges.length > 0) {
        this.swapBuffers();
      }
      
      // 清理脏数据
      this.dirtyInstances.clear();
      this.dirtyRanges = [];
      
      console.log(`Updated GPU buffers for ${this.dirtyRanges.length} ranges`);
      return true;
    } catch (error) {
      console.error('Failed to update GPU buffers:', error);
      return false;
    }
  }
  
  /**
   * 获取统计信息
   */
  getStats(): BufferStats {
    this.stats.bufferSize = this.calculateBufferSize();
    return { ...this.stats };
  }
  
  /**
   * 压缩缓冲区（减少碎片）
   */
  compactBuffers(): number {
    if (this.freeSlots.length === 0) {
      return 0;
    }
    
    // 排序空闲槽位
    this.freeSlots.sort((a, b) => a - b);
    
    let movedCount = 0;
    let lastUsedIndex = this.instanceCount - 1;
    
    // 从后向前移动数据
    while (this.freeSlots.length > 0 && lastUsedIndex >= 0) {
      // 跳过正在使用的槽位
      while (lastUsedIndex >= 0 && this.freeSlots.includes(lastUsedIndex)) {
        lastUsedIndex--;
      }
      
      if (lastUsedIndex < 0) break;
      
      // 获取最小的空闲槽位
      const freeSlot = this.freeSlots[0];
      if (freeSlot >= lastUsedIndex) break;
      
      // 将数据从 lastUsedIndex 移动到 freeSlot
      this.moveInstanceData(lastUsedIndex, freeSlot);
      
      // 更新映射关系（需要找到对应的实例ID）
      this.updateInstanceMapping(lastUsedIndex, freeSlot);
      
      // 更新空闲槽位
      this.freeSlots.shift();
      this.freeSlots.push(lastUsedIndex);
      
      movedCount++;
      lastUsedIndex--;
    }
    
    // 重新排序空闲槽位
    this.freeSlots.sort((a, b) => a - b);
    
    // 缩减容量（如果有很多空闲槽位）
    this.shrinkCapacityIfNeeded();
    
    // 标记所有移动的数据为脏
    this.dirtyRanges.push({ start: 0, end: this.instanceCount - 1 });
    
    this.calculateFragmentation();
    console.log(`Compacted buffers, moved ${movedCount} instances`);
    
    return movedCount;
  }
  
  /**
   * 销毁资源
   */
  destroy(): void {
    // 销毁所有 GPU 缓冲区
    const buffers = [
      this.positionBuffer,
      this.colorBuffer,
      this.uvBuffer,
      this.scaleBuffer,
      this.rotationBuffer,
      this.instanceIdBuffer,
      this.visibleBuffer,
      this.lodBuffer,
      ...this.doubleBuffers.position,
      ...this.doubleBuffers.color,
      ...this.doubleBuffers.uv,
      ...this.doubleBuffers.scale,
      ...this.doubleBuffers.rotation,
      ...this.doubleBuffers.instanceId,
      ...this.doubleBuffers.visible,
      ...this.doubleBuffers.lod
    ];
    
    for (const buffer of buffers) {
      if (buffer && !buffer.isDestroyed()) {
        buffer.destroy();
      }
    }
    
    // 清理 CPU 数据
    this.cpuPositionData = null;
    this.cpuColorData = null;
    this.cpuUvData = null;
    this.cpuScaleData = null;
    this.cpuRotationData = null;
    this.cpuInstanceIdData = null;
    this.cpuVisibleData = null;
    this.cpuLodData = null;
    
    // 清理数据结构
    this.slotMap.clear();
    this.freeSlots = [];
    this.dirtyInstances.clear();
    this.dirtyRanges = [];
    
    console.log('InstanceAttributeManager destroyed');
  }
  
  // ============ 私有方法 ============
  
  /**
   * 创建 CPU 数据数组
   */
  private createCpuDataArrays(): void {
    const floatSize = this.bufferCapacity * 4;  // 每个float 4字节
    const byteSize = this.bufferCapacity;
    
    // 位置 (x, y, z) * float
    this.cpuPositionData = new Float32Array(this.bufferCapacity * 3);
    
    // 颜色 (r, g, b, a) * byte
    this.cpuColorData = new Uint8Array(this.bufferCapacity * 4);
    
    // UV 坐标 (u1, v1, u2, v2) * float
    this.cpuUvData = new Float32Array(this.bufferCapacity * 4);
    
    // 缩放 (scale) * float
    this.cpuScaleData = new Float32Array(this.bufferCapacity);
    
    // 旋转 (rotation) * float
    this.cpuRotationData = new Float32Array(this.bufferCapacity);
    
    // 实例ID (id) * float
    this.cpuInstanceIdData = new Float32Array(this.bufferCapacity);
    
    // 可见性 (visible) * byte
    this.cpuVisibleData = new Uint8Array(this.bufferCapacity);
    
    // LOD 级别 (lod) * byte
    this.cpuLodData = new Uint8Array(this.bufferCapacity);
    
    // 初始化默认值
    for (let i = 0; i < this.bufferCapacity; i++) {
      this.cpuInstanceIdData[i] = i;
      this.cpuVisibleData[i] = 0;  // 默认不可见
      this.cpuLodData[i] = 0;
    }
  }
  
  /**
   * 创建 GPU 缓冲区
   */
  private createGpuBuffers(): void {
    if (!this.context) {
      throw new Error('WebGL context not initialized');
    }
    
    const createBuffer = (typedArray: ArrayBufferView, usage: number) => {
      return new Buffer({
        context: this.context!,
        typedArray: typedArray,
        usage: usage
      });
    };
    
    // 创建主缓冲区
    this.positionBuffer = createBuffer(
      this.cpuPositionData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.colorBuffer = createBuffer(
      this.cpuColorData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.uvBuffer = createBuffer(
      this.cpuUvData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.scaleBuffer = createBuffer(
      this.cpuScaleData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.rotationBuffer = createBuffer(
      this.cpuRotationData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.instanceIdBuffer = createBuffer(
      this.cpuInstanceIdData!,
      BufferUsage.STATIC_DRAW
    );
    
    this.visibleBuffer = createBuffer(
      this.cpuVisibleData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.lodBuffer = createBuffer(
      this.cpuLodData!,
      BufferUsage.STREAM_DRAW
    );
    
    // 如果启用双缓冲，创建第二组缓冲区
    if (this.config.enableDoubleBuffer) {
      this.createDoubleBuffers();
    }
  }
  
  /**
   * 创建双缓冲区
   */
  private createDoubleBuffers(): void {
    if (!this.context) return;
    
    const createBuffer = (typedArray: ArrayBufferView, usage: number) => {
      return new Buffer({
        context: this.context!,
        typedArray: typedArray,
        usage: usage
      });
    };
    
    // 创建第二组缓冲区（相同数据）
    this.doubleBuffers.position[1] = createBuffer(
      this.cpuPositionData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.doubleBuffers.color[1] = createBuffer(
      this.cpuColorData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.doubleBuffers.uv[1] = createBuffer(
      this.cpuUvData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.doubleBuffers.scale[1] = createBuffer(
      this.cpuScaleData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.doubleBuffers.rotation[1] = createBuffer(
      this.cpuRotationData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.doubleBuffers.instanceId[1] = createBuffer(
      this.cpuInstanceIdData!,
      BufferUsage.STATIC_DRAW
    );
    
    this.doubleBuffers.visible[1] = createBuffer(
      this.cpuVisibleData!,
      BufferUsage.STREAM_DRAW
    );
    
    this.doubleBuffers.lod[1] = createBuffer(
      this.cpuLodData!,
      BufferUsage.STREAM_DRAW
    );
  }
  
  /**
   * 设置实例数据
   */
  private setInstanceData(
    bufferIndex: number,
    attributes: Partial<{
      position: [number, number, number];
      color: [number, number, number, number];
      uv: [number, number, number, number];
      scale: number;
      rotation: number;
      instanceId: number;
      visible: number;
      lodLevel: number;
    }>
  ): void {
    // 位置
    if (attributes.position && this.cpuPositionData) {
      const idx = bufferIndex * 3;
      this.cpuPositionData[idx] = attributes.position[0];
      this.cpuPositionData[idx + 1] = attributes.position[1];
      this.cpuPositionData[idx + 2] = attributes.position[2];
    }
    
    // 颜色
    if (attributes.color && this.cpuColorData) {
      const idx = bufferIndex * 4;
      this.cpuColorData[idx] = Math.floor(attributes.color[0] * 255);
      this.cpuColorData[idx + 1] = Math.floor(attributes.color[1] * 255);
      this.cpuColorData[idx + 2] = Math.floor(attributes.color[2] * 255);
      this.cpuColorData[idx + 3] = Math.floor(attributes.color[3] * 255);
    }
    
    // UV 坐标
    if (attributes.uv && this.cpuUvData) {
      const idx = bufferIndex * 4;
      this.cpuUvData[idx] = attributes.uv[0];
      this.cpuUvData[idx + 1] = attributes.uv[1];
      this.cpuUvData[idx + 2] = attributes.uv[2];
      this.cpuUvData[idx + 3] = attributes.uv[3];
    }
    
    // 缩放
    if (attributes.scale !== undefined && this.cpuScaleData) {
      this.cpuScaleData[bufferIndex] = attributes.scale;
    }
    
    // 旋转
    if (attributes.rotation !== undefined && this.cpuRotationData) {
      this.cpuRotationData[bufferIndex] = attributes.rotation;
    }
    
    // 实例ID
    if (attributes.instanceId !== undefined && this.cpuInstanceIdData) {
      this.cpuInstanceIdData[bufferIndex] = attributes.instanceId;
    }
    
    // 可见性
    if (attributes.visible !== undefined && this.cpuVisibleData) {
      this.cpuVisibleData[bufferIndex] = attributes.visible;
    }
    
    // LOD 级别
    if (attributes.lodLevel !== undefined && this.cpuLodData) {
      this.cpuLodData[bufferIndex] = attributes.lodLevel;
    }
  }
  
  /**
   * 重置实例数据
   */
  private resetInstanceData(bufferIndex: number): void {
    if (!this.cpuPositionData || !this.cpuColorData || !this.cpuUvData) return;
    
    // 重置为默认值
    const idx3 = bufferIndex * 3;
    const idx4 = bufferIndex * 4;
    
    // 位置归零
    this.cpuPositionData[idx3] = 0;
    this.cpuPositionData[idx3 + 1] = 0;
    this.cpuPositionData[idx3 + 2] = 0;
    
    // 颜色透明
    this.cpuColorData[idx4] = 0;
    this.cpuColorData[idx4 + 1] = 0;
    this.cpuColorData[idx4 + 2] = 0;
    this.cpuColorData[idx4 + 3] = 0;
    
    // UV 归零
    this.cpuUvData[idx4] = 0;
    this.cpuUvData[idx4 + 1] = 0;
    this.cpuUvData[idx4 + 2] = 0;
    this.cpuUvData[idx4 + 3] = 0;
    
    // 其他属性
    if (this.cpuScaleData) this.cpuScaleData[bufferIndex] = 1.0;
    if (this.cpuRotationData) this.cpuRotationData[bufferIndex] = 0;
    if (this.cpuVisibleData) this.cpuVisibleData[bufferIndex] = 0;
    if (this.cpuLodData) this.cpuLodData[bufferIndex] = 0;
  }
  
  /**
   * 移动实例数据
   */
  private moveInstanceData(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    
    // 复制位置数据
    const fromIdx3 = fromIndex * 3;
    const toIdx3 = toIndex * 3;
    this.cpuPositionData![toIdx3] = this.cpuPositionData![fromIdx3];
    this.cpuPositionData![toIdx3 + 1] = this.cpuPositionData![fromIdx3 + 1];
    this.cpuPositionData![toIdx3 + 2] = this.cpuPositionData![fromIdx3 + 2];
    
    // 复制颜色数据
    const fromIdx4 = fromIndex * 4;
    const toIdx4 = toIndex * 4;
    this.cpuColorData![toIdx4] = this.cpuColorData![fromIdx4];
    this.cpuColorData![toIdx4 + 1] = this.cpuColorData![fromIdx4 + 1];
    this.cpuColorData![toIdx4 + 2] = this.cpuColorData![fromIdx4 + 2];
    this.cpuColorData![toIdx4 + 3] = this.cpuColorData![fromIdx4 + 3];
    
    // 复制 UV 数据
    this.cpuUvData![toIdx4] = this.cpuUvData![fromIdx4];
    this.cpuUvData![toIdx4 + 1] = this.cpuUvData![fromIdx4 + 1];
    this.cpuUvData![toIdx4 + 2] = this.cpuUvData![fromIdx4 + 2];
    this.cpuUvData![toIdx4 + 3] = this.cpuUvData![fromIdx4 + 3];
    
    // 复制其他属性
    if (this.cpuScaleData) this.cpuScaleData[toIndex] = this.cpuScaleData[fromIndex];
    if (this.cpuRotationData) this.cpuRotationData[toIndex] = this.cpuRotationData[fromIndex];
    if (this.cpuVisibleData) this.cpuVisibleData[toIndex] = this.cpuVisibleData[fromIndex];
    if (this.cpuLodData) this.cpuLodData[toIndex] = this.cpuLodData[fromIndex];
    
    // 重置源数据
    this.resetInstanceData(fromIndex);
  }
  
  /**
   * 更新实例映射关系
   */
  private updateInstanceMapping(oldIndex: number, newIndex: number): void {
    // 查找对应的实例ID
    for (const [instanceId, index] of this.slotMap) {
      if (index === oldIndex) {
        this.slotMap.set(instanceId, newIndex);
        break;
      }
    }
  }
  
  /**
   * 扩展缓冲区容量
   */
  private expandCapacity(): void {
    const newCapacity = Math.min(
      Math.ceil(this.bufferCapacity * this.config.growFactor!),
      this.maxInstances
    );
    
    if (newCapacity <= this.bufferCapacity) {
      return;
    }
    
    console.log(`Expanding buffer capacity from ${this.bufferCapacity} to ${newCapacity}`);
    
    // 重新分配 CPU 数据
    this.reallocateCpuData(newCapacity);
    
    // 重新创建 GPU 缓冲区
    this.recreateGpuBuffers();
    
    this.bufferCapacity = newCapacity;
  }
  
  /**
   * 重新分配 CPU 数据
   */
  private reallocateCpuData(newCapacity: number): void {
    const reallocate = <T extends ArrayBufferView>(
      oldArray: T | null,
      constructor: new (length: number) => T
    ): T => {
      if (!oldArray) {
        return new constructor(newCapacity * this.getComponentsPerAttribute(constructor));
      }
      
      const newArray = new constructor(newCapacity * this.getComponentsPerAttribute(constructor));
      const copyLength = Math.min(oldArray.length, newArray.length);
      
      if (oldArray instanceof Float32Array || oldArray instanceof Uint8Array) {
        newArray.set(oldArray.subarray(0, copyLength));
      }
      
      return newArray;
    };
    
    this.cpuPositionData = reallocate(this.cpuPositionData, Float32Array);
    this.cpuColorData = reallocate(this.cpuColorData, Uint8Array);
    this.cpuUvData = reallocate(this.cpuUvData, Float32Array);
    this.cpuScaleData = reallocate(this.cpuScaleData, Float32Array);
    this.cpuRotationData = reallocate(this.cpuRotationData, Float32Array);
    this.cpuInstanceIdData = reallocate(this.cpuInstanceIdData, Float32Array);
    this.cpuVisibleData = reallocate(this.cpuVisibleData, Uint8Array);
    this.cpuLodData = reallocate(this.cpuLodData, Uint8Array);
  }
  
  /**
   * 获取每个属性的组件数
   */
  private getComponentsPerAttribute(constructor: Function): number {
    if (constructor === Float32Array) {
      // 位置：3，UV：4，缩放：1，旋转：1，实例ID：1
      return 1; // 默认值，具体在调用时确定
    } else if (constructor === Uint8Array) {
      // 颜色：4，可见性：1，LOD：1
      return 1; // 默认值
    }
    return 1;
  }
  
  /**
   * 重新创建 GPU 缓冲区
   */
  private recreateGpuBuffers(): void {
    // 销毁旧缓冲区
    this.destroyGpuBuffers();
    
    // 创建新缓冲区
    this.createGpuBuffers();
    
    // 标记所有数据为脏
    this.dirtyRanges.push({ start: 0, end: this.bufferCapacity - 1 });
  }
  
  /**
   * 销毁 GPU 缓冲区
   */
  private destroyGpuBuffers(): void {
    const buffers = [
      this.positionBuffer,
      this.colorBuffer,
      this.uvBuffer,
      this.scaleBuffer,
      this.rotationBuffer,
      this.instanceIdBuffer,
      this.visibleBuffer,
      this.lodBuffer,
      ...this.doubleBuffers.position,
      ...this.doubleBuffers.color,
      ...this.doubleBuffers.uv,
      ...this.doubleBuffers.scale,
      ...this.doubleBuffers.rotation,
      ...this.doubleBuffers.instanceId,
      ...this.doubleBuffers.visible,
      ...this.doubleBuffers.lod
    ];
    
    for (const buffer of buffers) {
      if (buffer && !buffer.isDestroyed()) {
        buffer.destroy();
      }
    }
    
    // 重置引用
    this.positionBuffer = null;
    this.colorBuffer = null;
    this.uvBuffer = null;
    this.scaleBuffer = null;
    this.rotationBuffer = null;
    this.instanceIdBuffer = null;
    this.visibleBuffer = null;
    this.lodBuffer = null;
    
    this.doubleBuffers.position = [null, null];
    this.doubleBuffers.color = [null, null];
    this.doubleBuffers.uv = [null, null];
    this.doubleBuffers.scale = [null, null];
    this.doubleBuffers.rotation = [null, null];
    this.doubleBuffers.instanceId = [null, null];
    this.doubleBuffers.visible = [null, null];
    this.doubleBuffers.lod = [null, null];
  }
  
  /**
   * 更新脏数据范围
   */
  private updateDirtyRanges(start: number, end: number): void {
    // 简单实现：添加新范围
    this.dirtyRanges.push({ start, end });
    
    // 如果脏范围太多，合并它们
    if (this.dirtyRanges.length > 10) {
      this.mergeDirtyRanges();
    }
  }
  
  /**
   * 合并相邻的脏范围
   */
  private mergeDirtyRanges(): void {
    if (this.dirtyRanges.length <= 1) return;
    
    // 按起始位置排序
    this.dirtyRanges.sort((a, b) => a.start - b.start);
    
    const merged: Array<{ start: number; end: number }> = [];
    let current = this.dirtyRanges[0];
    
    for (let i = 1; i < this.dirtyRanges.length; i++) {
      const next = this.dirtyRanges[i];
      
      // 如果范围重叠或相邻，合并它们
      if (next.start <= current.end + 1) {
        current.end = Math.max(current.end, next.end);
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current);
    this.dirtyRanges = merged;
  }
  
  /**
   * 更新 GPU 缓冲区范围
   */
  private updateGpuBufferRange(start: number, end: number): void {
    if (!this.context || start > end) return;
    
    const count = end - start + 1;
    
    // 计算字节偏移量和大小
    const positionOffset = start * 3 * 4;  // 3个float，每个4字节
    const positionSize = count * 3 * 4;
    
    const colorOffset = start * 4;  // 4个byte
    const colorSize = count * 4;
    
    const uvOffset = start * 4 * 4;  // 4个float，每个4字节
    const uvSize = count * 4 * 4;
    
    const scaleOffset = start * 4;  // 1个float，4字节
    const scaleSize = count * 4;
    
    const rotationOffset = start * 4;
    const rotationSize = count * 4;
    
    const visibleOffset = start;  // 1个byte
    const visibleSize = count;
    
    const lodOffset = start;
    const lodSize = count;
    
    // 更新主缓冲区
    if (this.positionBuffer && this.cpuPositionData) {
      this.positionBuffer.copyFromArrayView(
        this.cpuPositionData.subarray(start * 3, (end + 1) * 3),
        positionOffset
      );
    }
    
    if (this.colorBuffer && this.cpuColorData) {
      this.colorBuffer.copyFromArrayView(
        this.cpuColorData.subarray(start * 4, (end + 1) * 4),
        colorOffset
      );
    }
    
    if (this.uvBuffer && this.cpuUvData) {
      this.uvBuffer.copyFromArrayView(
        this.cpuUvData.subarray(start * 4, (end + 1) * 4),
        uvOffset
      );
    }
    
    if (this.scaleBuffer && this.cpuScaleData) {
      this.scaleBuffer.copyFromArrayView(
        this.cpuScaleData.subarray(start, end + 1),
        scaleOffset
      );
    }
    
    if (this.rotationBuffer && this.cpuRotationData) {
      this.rotationBuffer.copyFromArrayView(
        this.cpuRotationData.subarray(start, end + 1),
        rotationOffset
      );
    }
    
    if (this.visibleBuffer && this.cpuVisibleData) {
      this.visibleBuffer.copyFromArrayView(
        this.cpuVisibleData.subarray(start, end + 1),
        visibleOffset
      );
    }
    
    if (this.lodBuffer && this.cpuLodData) {
      this.lodBuffer.copyFromArrayView(
        this.cpuLodData.subarray(start, end + 1),
        lodOffset
      );
    }
    
    // 如果使用双缓冲，也更新第二组缓冲区
    if (this.config.enableDoubleBuffer) {
      const buffers = this.doubleBuffers;
      const targetIndex = this.nextBufferIndex;
      
      if (buffers.position[targetIndex] && this.cpuPositionData) {
        buffers.position[targetIndex]!.copyFromArrayView(
          this.cpuPositionData.subarray(start * 3, (end + 1) * 3),
          positionOffset
        );
      }
      
      if (buffers.color[targetIndex] && this.cpuColorData) {
        buffers.color[targetIndex]!.copyFromArrayView(
          this.cpuColorData.subarray(start * 4, (end + 1) * 4),
          colorOffset
        );
      }
      
      if (buffers.uv[targetIndex] && this.cpuUvData) {
        buffers.uv[targetIndex]!.copyFromArrayView(
          this.cpuUvData.subarray(start * 4, (end + 1) * 4),
          uvOffset
        );
      }
      
      if (buffers.scale[targetIndex] && this.cpuScaleData) {
        buffers.scale[targetIndex]!.copyFromArrayView(
          this.cpuScaleData.subarray(start, end + 1),
          scaleOffset
        );
      }
      
      if (buffers.rotation[targetIndex] && this.cpuRotationData) {
        buffers.rotation[targetIndex]!.copyFromArrayView(
          this.cpuRotationData.subarray(start, end + 1),
          rotationOffset
        );
      }
      
      if (buffers.visible[targetIndex] && this.cpuVisibleData) {
        buffers.visible[targetIndex]!.copyFromArrayView(
          this.cpuVisibleData.subarray(start, end + 1),
          visibleOffset
        );
      }
      
      if (buffers.lod[targetIndex] && this.cpuLodData) {
        buffers.lod[targetIndex]!.copyFromArrayView(
          this.cpuLodData.subarray(start, end + 1),
          lodOffset
        );
      }
    }
  }
  
  /**
   * 切换双缓冲区
   */
  private swapBuffers(): void {
    const temp = this.currentBufferIndex;
    this.currentBufferIndex = this.nextBufferIndex;
    this.nextBufferIndex = temp;
  }
  
  /**
   * 缩减容量（如果有很多空闲空间）
   */
  private shrinkCapacityIfNeeded(): void {
    const usedRatio = (this.instanceCount - this.freeSlots.length) / this.bufferCapacity;
    const shrinkThreshold = 0.5;  // 使用率低于50%时考虑缩减
    
    if (usedRatio < shrinkThreshold && this.bufferCapacity > this.config.initialCapacity!) {
      const newCapacity = Math.max(
        this.config.initialCapacity!,
        Math.ceil((this.instanceCount - this.freeSlots.length) * 1.5)
      );
      
      if (newCapacity < this.bufferCapacity) {
        console.log(`Shrinking buffer capacity from ${this.bufferCapacity} to ${newCapacity}`);
        this.bufferCapacity = newCapacity;
        this.reallocateCpuData(newCapacity);
        this.recreateGpuBuffers();
      }
    }
  }
  
  /**
   * 计算缓冲区大小
   */
  private calculateBufferSize(): number {
    let size = 0;
    
    // 位置：3个float * 4字节
    size += this.bufferCapacity * 3 * 4;
    
    // 颜色：4个byte
    size += this.bufferCapacity * 4;
    
    // UV：4个float * 4字节
    size += this.bufferCapacity * 4 * 4;
    
    // 缩放：1个float * 4字节
    size += this.bufferCapacity * 4;
    
    // 旋转：1个float * 4字节
    size += this.bufferCapacity * 4;
    
    // 实例ID：1个float * 4字节
    size += this.bufferCapacity * 4;
    
    // 可见性：1个byte
    size += this.bufferCapacity;
    
    // LOD：1个byte
    size += this.bufferCapacity;
    
    // 如果使用双缓冲，乘以2
    if (this.config.enableDoubleBuffer) {
      size *= 2;
    }
    
    return size;
  }
  
  /**
   * 计算碎片化程度
   */
  private calculateFragmentation(): void {
    if (this.freeSlots.length === 0) {
      this.stats.fragmentation = 0;
      return;
    }
    
    // 排序空闲槽位
    this.freeSlots.sort((a, b) => a - b);
    
    // 计算最大连续空闲块
    let maxContiguousFree = 0;
    let currentContiguous = 0;
    let prevSlot = -2;
    
    for (const slot of this.freeSlots) {
      if (slot === prevSlot + 1) {
        currentContiguous++;
      } else {
        maxContiguousFree = Math.max(maxContiguousFree, currentContiguous);
        currentContiguous = 1;
      }
      prevSlot = slot;
    }
    
    maxContiguousFree = Math.max(maxContiguousFree, currentContiguous);
    
    // 碎片化程度 = 1 - (最大连续空闲块 / 总空闲块)
    if (this.freeSlots.length > 0) {
      this.stats.fragmentation = 1 - (maxContiguousFree / this.freeSlots.length);
    } else {
      this.stats.fragmentation = 0;
    }
  }
}