/**
 * 空间索引管理器
 * 负责军事符号的空间索引、视锥剔除和 LOD 计算
 */

import { Cartesian3, Rectangle, BoundingSphere, Intersect } from 'cesium';

/**
 * 空间索引类型
 */
export enum SpatialIndexType {
  QUADTREE = 'quadtree',      // 四叉树
  GRID = 'grid',              // 均匀网格
  KDTREE = 'kdtree',          // KD树
  BVH = 'bvh'                 // 包围体层次结构
}

/**
 * 空间索引配置
 */
export interface SpatialIndexConfig {
  type: SpatialIndexType;
  maxDepth?: number;          // 最大深度（四叉树）
  maxItemsPerNode?: number;   // 每个节点最大项目数
  cellSize?: number;          // 网格单元大小（度）
  enableDynamicUpdate?: boolean; // 启用动态更新
  rebuildThreshold?: number;  // 重建阈值（变化百分比）
}

/**
 * 空间节点
 */
export interface SpatialNode {
  id: string;
  bounds: Rectangle;
  depth: number;
  instanceIds: string[];
  children?: SpatialNode[];
  boundingSphere?: BoundingSphere;
}

/**
 * 查询结果
 */
export interface QueryResult {
  instanceIds: string[];
  nodesVisited: number;
  queryTime: number;
  totalInstances: number;
}

/**
 * LOD 级别
 */
export interface LodLevel {
  level: number;
  maxDistance: number;  // 最大距离（米）
  minDistance: number;  // 最小距离（米）
  detail: number;       // 细节级别（0-1）
}

/**
 * 可见实例集合
 */
export interface VisibleInstanceSet {
  instanceIds: string[];
  lodLevels: Map<string, number>;  // 实例ID -> LOD级别
  culledCount: number;
  visibleCount: number;
}

/**
 * 空间索引管理器
 */
export class SpatialIndexManager {
  // 配置
  private config: SpatialIndexConfig;
  
  // 空间索引
  private rootNode: SpatialNode | null = null;
  private indexType: SpatialIndexType;
  private gridCells: Map<string, string[]> | null = null;  // 网格索引
  private kdTree: any = null;  // KD树（简化实现）
  
  // 实例数据缓存
  private instancePositions = new Map<string, [number, number, number]>();
  private instanceBounds = new Map<string, Rectangle>();
  private instanceBoundingSpheres = new Map<string, BoundingSphere>();
  
  // LOD 配置
  private lodLevels: LodLevel[] = [];
  private defaultLodConfig: LodLevel[] = [
    { level: 0, minDistance: 0, maxDistance: 1000, detail: 1.0 },
    { level: 1, minDistance: 1000, maxDistance: 5000, detail: 0.7 },
    { level: 2, minDistance: 5000, maxDistance: 20000, detail: 0.4 },
    { level: 3, minDistance: 20000, maxDistance: 100000, detail: 0.2 },
    { level: 4, minDistance: 100000, maxDistance: Infinity, detail: 0.1 }
  ];
  
  // 性能统计
  private stats = {
    totalInstances: 0,
    indexedInstances: 0,
    queryCount: 0,
    averageQueryTime: 0,
    rebuildCount: 0,
    lastRebuildTime: 0
  };
  
  // 动态更新跟踪
  private dirtyInstances = new Set<string>();
  private movementThreshold = 0.001;  // 移动阈值（度）
  
  constructor(config?: Partial<SpatialIndexConfig>) {
    this.config = {
      type: SpatialIndexType.QUADTREE,
      maxDepth: 8,
      maxItemsPerNode: 32,
      cellSize: 1.0,  // 1度
      enableDynamicUpdate: true,
      rebuildThreshold: 0.3,  // 30%变化时重建
      ...config
    };
    
    this.indexType = this.config.type;
    this.lodLevels = [...this.defaultLodConfig];
    
    console.log(`SpatialIndexManager initialized with ${this.indexType} indexing`);
  }
  
  /**
   * 构建空间索引
   */
  buildIndex(instances: Array<{ id: string; position: [number, number, number] }>): void {
    const startTime = performance.now();
    
    // 清空现有数据
    this.clear();
    
    // 存储实例数据
    for (const instance of instances) {
      this.instancePositions.set(instance.id, instance.position);
      this.updateInstanceBounds(instance.id, instance.position);
    }
    
    this.stats.totalInstances = instances.length;
    
    // 根据索引类型构建索引
    switch (this.indexType) {
      case SpatialIndexType.QUADTREE:
        this.buildQuadtree(instances);
        break;
      case SpatialIndexType.GRID:
        this.buildGridIndex(instances);
        break;
      case SpatialIndexType.KDTREE:
        this.buildKdTree(instances);
        break;
      case SpatialIndexType.BVH:
        this.buildBvh(instances);
        break;
    }
    
    this.stats.indexedInstances = instances.length;
    this.stats.rebuildCount++;
    this.stats.lastRebuildTime = Date.now();
    
    const buildTime = performance.now() - startTime;
    console.log(`Built ${this.indexType} index for ${instances.length} instances in ${buildTime.toFixed(2)}ms`);
  }
  
  /**
   * 添加实例到索引
   */
  addInstance(id: string, position: [number, number, number]): void {
    this.instancePositions.set(id, position);
    this.updateInstanceBounds(id, position);
    this.stats.totalInstances++;
    
    if (this.config.enableDynamicUpdate) {
      // 动态插入（性能较低）
      this.dirtyInstances.add(id);
      
      // 检查是否需要重建
      if (this.dirtyInstances.size / this.stats.totalInstances > this.config.rebuildThreshold!) {
        this.rebuildIndex();
      }
    }
  }
  
  /**
   * 更新实例位置
   */
  updateInstance(id: string, newPosition: [number, number, number]): void {
    const oldPosition = this.instancePositions.get(id);
    if (!oldPosition) {
      console.warn(`Instance ${id} not found in index`);
      return;
    }
    
    // 检查移动距离是否超过阈值
    const distance = this.calculateDistance(
      [oldPosition[0], oldPosition[1]],
      [newPosition[0], newPosition[1]]
    );
    if (distance > this.movementThreshold) {
      this.instancePositions.set(id, newPosition);
      this.updateInstanceBounds(id, newPosition);
      
      if (this.config.enableDynamicUpdate) {
        this.dirtyInstances.add(id);
        
        // 检查是否需要重建
        if (this.dirtyInstances.size / this.stats.totalInstances > this.config.rebuildThreshold!) {
          this.rebuildIndex();
        }
      }
    }
  }
  
  /**
   * 移除实例
   */
  removeInstance(id: string): void {
    this.instancePositions.delete(id);
    this.instanceBounds.delete(id);
    this.instanceBoundingSpheres.delete(id);
    this.dirtyInstances.delete(id);
    this.stats.totalInstances--;
  }
  
  /**
   * 视锥剔除查询
   */
  queryByFrustum(frustum: any, cameraPosition: Cartesian3): QueryResult {
    const startTime = performance.now();
    this.stats.queryCount++;
    
    let instanceIds: string[] = [];
    let nodesVisited = 0;
    
    switch (this.indexType) {
      case SpatialIndexType.QUADTREE:
        const quadtreeResult = this.queryQuadtreeByFrustum(this.rootNode!, frustum);
        instanceIds = quadtreeResult.instanceIds;
        nodesVisited = quadtreeResult.nodesVisited;
        break;
        
      case SpatialIndexType.GRID:
        instanceIds = this.queryGridByFrustum(frustum);
        nodesVisited = this.gridCells?.size || 0;
        break;
        
      default:
        // 回退到线性扫描
        instanceIds = this.linearFrustumCulling(frustum);
        nodesVisited = this.stats.totalInstances;
        break;
    }
    
    // 应用距离剔除（LOD）
    const visibleSet = this.applyDistanceCulling(instanceIds, cameraPosition);
    
    const queryTime = performance.now() - startTime;
    
    // 更新平均查询时间
    this.stats.averageQueryTime = 
      (this.stats.averageQueryTime * (this.stats.queryCount - 1) + queryTime) / this.stats.queryCount;
    
    return {
      instanceIds: visibleSet.instanceIds,
      nodesVisited,
      queryTime,
      totalInstances: this.stats.totalInstances
    };
  }
  
  /**
   * 范围查询
   */
  queryByBounds(bounds: Rectangle): QueryResult {
    const startTime = performance.now();
    this.stats.queryCount++;
    
    let instanceIds: string[] = [];
    let nodesVisited = 0;
    
    switch (this.indexType) {
      case SpatialIndexType.QUADTREE:
        const quadtreeResult = this.queryQuadtreeByBounds(this.rootNode!, bounds);
        instanceIds = quadtreeResult.instanceIds;
        nodesVisited = quadtreeResult.nodesVisited;
        break;
        
      case SpatialIndexType.GRID:
        instanceIds = this.queryGridByBounds(bounds);
        nodesVisited = this.gridCells?.size || 0;
        break;
        
      default:
        instanceIds = this.linearBoundsQuery(bounds);
        nodesVisited = this.stats.totalInstances;
        break;
    }
    
    const queryTime = performance.now() - startTime;
    
    return {
      instanceIds,
      nodesVisited,
      queryTime,
      totalInstances: this.stats.totalInstances
    };
  }
  
  /**
   * 半径查询
   */
  queryByRadius(center: [number, number], radius: number): QueryResult {
    const startTime = performance.now();
    this.stats.queryCount++;
    
    // 创建边界框
    const bounds = Rectangle.fromDegrees(
      center[0] - radius,
      center[1] - radius,
      center[0] + radius,
      center[1] + radius
    );
    
    // 先进行边界框查询
    const boundsResult = this.queryByBounds(bounds);
    
    // 然后在结果中进行精确半径过滤
    const exactResult: string[] = [];
    const centerCartesian = Cartesian3.fromDegrees(center[0], center[1]);
    const radiusSquared = radius * radius;
    
    for (const id of boundsResult.instanceIds) {
      const position = this.instancePositions.get(id);
      if (!position) continue;
      
      const instanceCartesian = Cartesian3.fromDegrees(position[0], position[1]);
      const distanceSquared = Cartesian3.distanceSquared(centerCartesian, instanceCartesian);
      
      if (distanceSquared <= radiusSquared) {
        exactResult.push(id);
      }
    }
    
    const queryTime = performance.now() - startTime;
    
    return {
      instanceIds: exactResult,
      nodesVisited: boundsResult.nodesVisited,
      queryTime,
      totalInstances: this.stats.totalInstances
    };
  }
  
  /**
   * 获取可见实例集合（包含 LOD 信息）
   */
  getVisibleInstances(
    frustum: any,
    cameraPosition: Cartesian3,
    maxDistance: number = 100000
  ): VisibleInstanceSet {
    const queryResult = this.queryByFrustum(frustum, cameraPosition);
    
    // 计算每个实例的 LOD 级别
    const lodLevels = new Map<string, number>();
    const finalInstanceIds: string[] = [];
    
    for (const id of queryResult.instanceIds) {
      const position = this.instancePositions.get(id);
      if (!position) continue;
      
      const instanceCartesian = Cartesian3.fromDegrees(position[0], position[1], position[2] || 0);
      const distance = Cartesian3.distance(cameraPosition, instanceCartesian);
      
      // 距离剔除
      if (distance > maxDistance) {
        continue;
      }
      
      // 计算 LOD 级别
      const lodLevel = this.calculateLodLevel(distance);
      lodLevels.set(id, lodLevel);
      finalInstanceIds.push(id);
    }
    
    return {
      instanceIds: finalInstanceIds,
      lodLevels,
      culledCount: queryResult.totalInstances - finalInstanceIds.length,
      visibleCount: finalInstanceIds.length
    };
  }
  
  /**
   * 设置 LOD 配置
   */
  setLodConfig(levels: LodLevel[]): void {
    this.lodLevels = [...levels].sort((a, b) => a.maxDistance - b.maxDistance);
    console.log(`LOD config updated with ${levels.length} levels`);
  }
  
  /**
   * 获取统计信息
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }
  
  /**
   * 清理索引
   */
  clear(): void {
    this.rootNode = null;
    this.gridCells = null;
    this.kdTree = null;
    this.instancePositions.clear();
    this.instanceBounds.clear();
    this.instanceBoundingSpheres.clear();
    this.dirtyInstances.clear();
    
    this.stats.totalInstances = 0;
    this.stats.indexedInstances = 0;
    
    console.log('Spatial index cleared');
  }
  
  /**
   * 重建索引
   */
  rebuildIndex(): void {
    if (this.instancePositions.size === 0) {
      return;
    }
    
    console.log(`Rebuilding index due to ${this.dirtyInstances.size} dirty instances`);
    
    // 收集所有实例
    const instances = Array.from(this.instancePositions.entries()).map(([id, position]) => ({
      id,
      position
    }));
    
    // 重建索引
    this.buildIndex(instances);
    
    // 清理脏实例集
    this.dirtyInstances.clear();
  }
  
  // ============ 私有方法：四叉树实现 ============
  
  /**
   * 构建四叉树索引
   */
  private buildQuadtree(instances: Array<{ id: string; position: [number, number, number] }>): void {
    if (instances.length === 0) {
      this.rootNode = null;
      return;
    }
    
    // 计算全局边界
    const bounds = this.calculateGlobalBounds(instances);
    
    // 创建根节点
    this.rootNode = {
      id: 'root',
      bounds,
      depth: 0,
      instanceIds: []
    };
    
    // 递归构建四叉树
    this.buildQuadtreeRecursive(this.rootNode, instances, 0);
  }
  
  /**
   * 递归构建四叉树
   */
  private buildQuadtreeRecursive(
    node: SpatialNode,
    instances: Array<{ id: string; position: [number, number, number] }>,
    depth: number
  ): void {
    // 如果实例数量少或达到最大深度，停止分割
    if (instances.length <= this.config.maxItemsPerNode! || depth >= this.config.maxDepth!) {
      node.instanceIds = instances.map(inst => inst.id);
      
      // 计算包围球（用于视锥剔除）
      if (instances.length > 0) {
        const positions = instances.map(inst => 
          Cartesian3.fromDegrees(inst.position[0], inst.position[1], inst.position[2] || 0)
        );
        node.boundingSphere = BoundingSphere.fromPoints(positions);
      }
      
      return;
    }
    
    // 分割节点
    const quarters = this.splitRectangle(node.bounds);
    node.children = [];
    
    // 分配实例到子节点
    for (let i = 0; i < 4; i++) {
      const childBounds = quarters[i];
      const childInstances = instances.filter(inst => 
        this.isPointInBounds([inst.position[0], inst.position[1]], childBounds)
      );
      
      if (childInstances.length > 0) {
        const childNode: SpatialNode = {
          id: `${node.id}_${i}`,
          bounds: childBounds,
          depth: depth + 1,
          instanceIds: []
        };
        
        node.children.push(childNode);
        this.buildQuadtreeRecursive(childNode, childInstances, depth + 1);
      }
    }
    
    // 如果子节点太少，回退到当前节点存储所有实例
    if (node.children.length <= 1) {
      node.children = undefined;
      node.instanceIds = instances.map(inst => inst.id);
      
      // 计算包围球
      const positions = instances.map(inst => 
        Cartesian3.fromDegrees(inst.position[0], inst.position[1], inst.position[2] || 0)
      );
      node.boundingSphere = BoundingSphere.fromPoints(positions);
    }
  }
  
  /**
   * 四叉树视锥查询
   */
  private queryQuadtreeByFrustum(
    node: SpatialNode,
    frustum: any
  ): { instanceIds: string[]; nodesVisited: number } {
    let instanceIds: string[] = [];
    let nodesVisited = 1;
    
    // 检查节点是否在视锥内
    if (node.boundingSphere) {
      const intersection = frustum.computeVisibility(node.boundingSphere);
      
      if (intersection === Intersect.OUTSIDE) {
        // 完全在视锥外
        return { instanceIds: [], nodesVisited };
      } else if (intersection === Intersect.INSIDE) {
        // 完全在视锥内，包含所有子实例
        if (node.children) {
          for (const child of node.children) {
            const result = this.queryQuadtreeByFrustum(child, frustum);
            instanceIds.push(...result.instanceIds);
            nodesVisited += result.nodesVisited;
          }
        } else {
          instanceIds.push(...node.instanceIds);
        }
      } else {
        // 部分在视锥内，需要精确检查
        if (node.children) {
          // 有子节点：递归查询
          for (const child of node.children) {
            const result = this.queryQuadtreeByFrustum(child, frustum);
            instanceIds.push(...result.instanceIds);
            nodesVisited += result.nodesVisited;
          }
        } else {
          // 叶子节点：检查每个实例
          for (const instanceId of node.instanceIds) {
            const bounds = this.instanceBounds.get(instanceId);
            if (bounds && this.isBoundsInFrustum(bounds, frustum)) {
              instanceIds.push(instanceId);
            }
          }
        }
      }
    } else {
      // 没有包围球，回退到检查每个实例
      if (node.children) {
        for (const child of node.children) {
          const result = this.queryQuadtreeByFrustum(child, frustum);
          instanceIds.push(...result.instanceIds);
          nodesVisited += result.nodesVisited;
        }
      } else {
        for (const instanceId of node.instanceIds) {
          const bounds = this.instanceBounds.get(instanceId);
          if (bounds && this.isBoundsInFrustum(bounds, frustum)) {
            instanceIds.push(instanceId);
          }
        }
      }
    }
    
    return { instanceIds, nodesVisited };
  }
  
  /**
   * 四叉树范围查询
   */
  private queryQuadtreeByBounds(
    node: SpatialNode,
    bounds: Rectangle
  ): { instanceIds: string[]; nodesVisited: number } {
    let instanceIds: string[] = [];
    let nodesVisited = 1;
    
    // 检查节点是否与查询范围相交
    if (!this.rectanglesIntersect(node.bounds, bounds)) {
      return { instanceIds: [], nodesVisited };
    }
    
    if (node.children) {
      // 有子节点：递归查询
      for (const child of node.children) {
        const result = this.queryQuadtreeByBounds(child, bounds);
        instanceIds.push(...result.instanceIds);
        nodesVisited += result.nodesVisited;
      }
    } else {
      // 叶子节点：检查每个实例
      for (const instanceId of node.instanceIds) {
        const instanceBounds = this.instanceBounds.get(instanceId);
        if (instanceBounds && this.rectanglesIntersect(instanceBounds, bounds)) {
          instanceIds.push(instanceId);
        }
      }
    }
    
    return { instanceIds, nodesVisited };
  }
  
  // ============ 私有方法：网格索引实现 ============
  
  /**
   * 构建网格索引
   */
  private buildGridIndex(instances: Array<{ id: string; position: [number, number, number] }>): void {
    this.gridCells = new Map();
    const cellSize = this.config.cellSize!;
    
    for (const instance of instances) {
      const [lng, lat] = instance.position;
      const cellKey = this.getGridCellKey(lng, lat, cellSize);
      
      if (!this.gridCells.has(cellKey)) {
        this.gridCells.set(cellKey, []);
      }
      
      this.gridCells.get(cellKey)!.push(instance.id);
    }
    
    console.log(`Grid index built with ${this.gridCells.size} cells`);
  }
  
  /**
   * 获取网格单元键
   */
  private getGridCellKey(lng: number, lat: number, cellSize: number): string {
    const x = Math.floor(lng / cellSize);
    const y = Math.floor(lat / cellSize);
    return `${x},${y}`;
  }
  
  /**
   * 网格视锥查询
   */
  private queryGridByFrustum(frustum: any): string[] {
    if (!this.gridCells) return [];
    
    const instanceIds: string[] = [];
    
    // 获取视锥的近似边界框
    const frustumBounds = this.estimateFrustumBounds(frustum);
    if (!frustumBounds) {
      // 无法估计边界，回退到线性扫描
      return this.linearFrustumCulling(frustum);
    }
    
    // 计算受影响的网格单元
    const affectedCells = this.getAffectedGridCells(frustumBounds);
    
    // 检查受影响单元中的实例
    for (const cellKey of affectedCells) {
      const cellInstances = this.gridCells.get(cellKey);
      if (!cellInstances) continue;
      
      for (const instanceId of cellInstances) {
        const bounds = this.instanceBounds.get(instanceId);
        if (bounds && this.isBoundsInFrustum(bounds, frustum)) {
          instanceIds.push(instanceId);
        }
      }
    }
    
    return instanceIds;
  }
  
  /**
   * 网格范围查询
   */
  private queryGridByBounds(bounds: Rectangle): string[] {
    if (!this.gridCells) return [];
    
    const instanceIds: string[] = [];
    const affectedCells = this.getAffectedGridCells(bounds);
    
    for (const cellKey of affectedCells) {
      const cellInstances = this.gridCells.get(cellKey);
      if (!cellInstances) continue;
      
      for (const instanceId of cellInstances) {
        const instanceBounds = this.instanceBounds.get(instanceId);
        if (instanceBounds && this.rectanglesIntersect(instanceBounds, bounds)) {
          instanceIds.push(instanceId);
        }
      }
    }
    
    return instanceIds;
  }
  
  /**
   * 获取受影响的网格单元
   */
  private getAffectedGridCells(bounds: Rectangle): string[] {
    if (!this.gridCells) return [];
    
    const cellSize = this.config.cellSize!;
    const cells: string[] = [];
    
    const west = bounds.west * (180 / Math.PI);  // 弧度转度
    const south = bounds.south * (180 / Math.PI);
    const east = bounds.east * (180 / Math.PI);
    const north = bounds.north * (180 / Math.PI);
    
    const minX = Math.floor(west / cellSize);
    const maxX = Math.floor(east / cellSize);
    const minY = Math.floor(south / cellSize);
    const maxY = Math.floor(north / cellSize);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.push(`${x},${y}`);
      }
    }
    
    return cells;
  }
  
  // ============ 私有方法：KD树实现（简化） ============
  
  /**
   * 构建KD树（简化实现）
   */
  private buildKdTree(instances: Array<{ id: string; position: [number, number, number] }>): void {
    // 简化实现：使用二维数组存储排序后的实例
    // 实际KD树实现较为复杂，这里仅作占位
    console.log('KD-tree indexing not fully implemented, using simplified version');
    
    // 按经度排序
    const sortedByLng = [...instances].sort((a, b) => a.position[0] - b.position[0]);
    // 按纬度排序
    const sortedByLat = [...instances].sort((a, b) => a.position[1] - b.position[1]);
    
    this.kdTree = {
      sortedByLng: sortedByLng.map(inst => inst.id),
      sortedByLat: sortedByLat.map(inst => inst.id)
    };
  }
  
  // ============ 私有方法：BVH实现（简化） ============
  
  /**
   * 构建BVH（简化实现）
   */
  private buildBvh(instances: Array<{ id: string; position: [number, number, number] }>): void {
    // 简化实现：使用包围球层次结构
    console.log('BVH indexing not fully implemented, using simplified version');
    
    // 为每个实例创建包围球
    for (const instance of instances) {
      const position = Cartesian3.fromDegrees(
        instance.position[0],
        instance.position[1],
        instance.position[2] || 0
      );
      const boundingSphere = new BoundingSphere(position, 100);  // 100米半径
      this.instanceBoundingSpheres.set(instance.id, boundingSphere);
    }
  }
  
  // ============ 私有方法：线性扫描（回退） ============
  
  /**
   * 线性视锥剔除
   */
  private linearFrustumCulling(frustum: any): string[] {
    const instanceIds: string[] = [];
    
    for (const [id, bounds] of this.instanceBounds) {
      if (this.isBoundsInFrustum(bounds, frustum)) {
        instanceIds.push(id);
      }
    }
    
    return instanceIds;
  }
  
  /**
   * 线性范围查询
   */
  private linearBoundsQuery(bounds: Rectangle): string[] {
    const instanceIds: string[] = [];
    
    for (const [id, instanceBounds] of this.instanceBounds) {
      if (this.rectanglesIntersect(instanceBounds, bounds)) {
        instanceIds.push(id);
      }
    }
    
    return instanceIds;
  }
  
  // ============ 私有方法：工具函数 ============
  
  /**
   * 计算全局边界
   */
  private calculateGlobalBounds(
    instances: Array<{ id: string; position: [number, number, number] }>
  ): Rectangle {
    if (instances.length === 0) {
      return Rectangle.fromDegrees(0, 0, 0, 0);
    }
    
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    
    for (const instance of instances) {
      const [lng, lat] = instance.position;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    
    // 添加一些边距
    const margin = 0.1;
    minLng -= margin;
    maxLng += margin;
    minLat -= margin;
    maxLat += margin;
    
    return Rectangle.fromDegrees(minLng, minLat, maxLng, maxLat);
  }
  
  /**
   * 更新实例边界
   */
  private updateInstanceBounds(id: string, position: [number, number, number]): void {
    const [lng, lat, height = 0] = position;
    
    // 创建小矩形（近似点）
    const margin = 0.0001;  // 约10米
    const bounds = Rectangle.fromDegrees(
      lng - margin,
      lat - margin,
      lng + margin,
      lat + margin
    );
    
    this.instanceBounds.set(id, bounds);
  }
  
  /**
   * 分割矩形为四个子矩形
   */
  private splitRectangle(rect: Rectangle): Rectangle[] {
    const centerLng = (rect.west + rect.east) / 2;
    const centerLat = (rect.south + rect.north) / 2;
    
    return [
      Rectangle.fromRadians(rect.west, rect.south, centerLng, centerLat),  // 左下
      Rectangle.fromRadians(centerLng, rect.south, rect.east, centerLat),  // 右下
      Rectangle.fromRadians(rect.west, centerLat, centerLng, rect.north),  // 左上
      Rectangle.fromRadians(centerLng, centerLat, rect.east, rect.north)   // 右上
    ];
  }
  
  /**
   * 检查点是否在矩形内
   */
  private isPointInBounds(point: [number, number], bounds: Rectangle): boolean {
    const [lng, lat] = point;
    const lngRad = lng * (Math.PI / 180);
    const latRad = lat * (Math.PI / 180);
    
    return (
      lngRad >= bounds.west &&
      lngRad <= bounds.east &&
      latRad >= bounds.south &&
      latRad <= bounds.north
    );
  }
  
  /**
   * 检查矩形是否相交
   */
  private rectanglesIntersect(a: Rectangle, b: Rectangle): boolean {
    return !(
      a.east < b.west ||
      a.west > b.east ||
      a.north < b.south ||
      a.south > b.north
    );
  }
  
  /**
   * 检查边界是否在视锥内
   */
  private isBoundsInFrustum(bounds: Rectangle, frustum: any): boolean {
    // 简化实现：检查矩形四个角点
    const corners = [
      Cartesian3.fromRadians(bounds.west, bounds.south),
      Cartesian3.fromRadians(bounds.east, bounds.south),
      Cartesian3.fromRadians(bounds.east, bounds.north),
      Cartesian3.fromRadians(bounds.west, bounds.north)
    ];
    
    // 创建包围球
    const boundingSphere = BoundingSphere.fromPoints(corners);
    
    // 检查包围球与视锥的相交
    const intersection = frustum.computeVisibility(boundingSphere);
    return intersection !== Intersect.OUTSIDE;
  }
  
  /**
   * 估计视锥边界
   */
  private estimateFrustumBounds(frustum: any): Rectangle | null {
    // 简化实现：使用视锥的近似边界
    // 实际应该计算视锥在椭球体上的投影
    try {
      // 尝试获取视锥的角点
      // 这里简化返回null，让调用者回退到线性扫描
      return null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 计算两点间距离（度）
   */
  private calculateDistance(pos1: [number, number], pos2: [number, number]): number {
    const [lng1, lat1] = pos1;
    const [lng2, lat2] = pos2;
    
    // 简化计算（不考虑地球曲率）
    const dLng = lng2 - lng1;
    const dLat = lat2 - lat1;
    
    return Math.sqrt(dLng * dLng + dLat * dLat);
  }
  
  /**
   * 应用距离剔除
   */
  private applyDistanceCulling(instanceIds: string[], cameraPosition: Cartesian3): VisibleInstanceSet {
    const visibleIds: string[] = [];
    const lodLevels = new Map<string, number>();
    
    for (const id of instanceIds) {
      const position = this.instancePositions.get(id);
      if (!position) continue;
      
      const instanceCartesian = Cartesian3.fromDegrees(position[0], position[1], position[2] || 0);
      const distance = Cartesian3.distance(cameraPosition, instanceCartesian);
      
      // 计算 LOD 级别
      const lodLevel = this.calculateLodLevel(distance);
      lodLevels.set(id, lodLevel);
      visibleIds.push(id);
    }
    
    return {
      instanceIds: visibleIds,
      lodLevels,
      culledCount: instanceIds.length - visibleIds.length,
      visibleCount: visibleIds.length
    };
  }
  
  /**
   * 计算 LOD 级别
   */
  private calculateLodLevel(distance: number): number {
    for (const level of this.lodLevels) {
      if (distance >= level.minDistance && distance < level.maxDistance) {
        return level.level;
      }
    }
    
    // 返回最低 LOD 级别
    return this.lodLevels[this.lodLevels.length - 1]?.level || 0;
  }
}