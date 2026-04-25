# LCPLOT 扩展设计文档
## 量算工具增强：通视分析 & 高级图元系统

**版本**: 1.0  
**日期**: 2026-03-21  
**状态**: 设计阶段

---

## 一、总体架构

### 1.1 设计原则
1. **向后兼容**：不破坏现有 API，通过扩展接口实现新功能
2. **可配置性**：动态障碍物、计算精度、分类标准均可配置
3. **性能优先**：大数据量下的通视分析需支持渐进式计算
4. **多标准支持**：内置美军标，预留自定义标准接口

### 1.2 模块划分
```
lcplot/
├── src/
│   ├── core/                    # 核心抽象
│   │   ├── MapController.ts     # 扩展抽象方法
│   │   └── PrimitiveController.ts # 图元控制器（新增）
│   ├── features/                # 功能模块（新增）
│   │   ├── line-of-sight/       # 通视分析
│   │   │   ├── LineOfSightCalculator.ts
│   │   │   ├── ObstacleDetector.ts
│   │   │   └── ProfileVisualizer.ts
│   │   └── advanced-primitives/ # 高级图元
│   │       ├── PrimitiveCatalog.ts
│   │       ├── SymbolLibrary.ts
│   │       └── InteractiveManager.ts
│   ├── adapters/                # 引擎适配器
│   │   ├── cesium/
│   │   │   ├── CesiumLineOfSight.ts
│   │   │   ├── CesiumPrimitiveRenderer.ts
│   │   │   └── CesiumInteractive.ts
│   │   └── openlayers/
│   │       └── ...（类似结构）
│   └── types/                   # 类型定义
│       ├── line-of-sight.ts     # 通视相关类型
│       ├── primitive.ts         # 图元相关类型
│       └── index.ts             # 统一导出
```

---

## 二、图元分类体系

### 2.1 美军标 MIL-STD-2525D 实现

#### 2.1.1 领域划分
```typescript
export enum MilitaryDomain {
  LAND = 'land',          // 陆地
  SEA = 'sea',            // 海上
  AIR = 'air',            // 空中
  SPACE = 'space',        // 太空
  SUBSURFACE = 'subsurface', // 水下
  SOF = 'sof',            // 特种作战
  CYBER = 'cyber',        // 网络空间
  SIGNAL = 'signal',      // 信号
  ACTIVITY = 'activity'   // 活动
}
```

#### 2.1.2 编码系统
采用 15位SIDC（Symbol Identification Coding）标准：
- 位置 1-2: 版本标识符
- 位置 3: 标准标识（W=作战标号，I=情报标号）
- 位置 4-10: 符号代码
- 位置 11: 修饰符
- 位置 12-15: 属性扩展

#### 2.1.3 图标资源管理
```typescript
// 图标加载策略
export interface SymbolResourceConfig {
  baseUrl: string;          // 图标库基础URL
  format: 'svg' | 'png';    // 图标格式
  size: [number, number];   // 标准尺寸
  fallbackColors: {         // 阵营颜色映射
    friend: string;         // 友方 - 蓝色
    hostile: string;        // 敌方 - 红色
    neutral: string;        // 中立 - 绿色
    unknown: string;        // 未知 - 黄色
  };
}

// 按需加载机制
class SymbolLibrary {
  private cache = new Map<string, HTMLImageElement>();
  
  async loadSymbol(sidc: string): Promise<HTMLImageElement> {
    const url = this.resolveSymbolUrl(sidc);
    if (!this.cache.has(url)) {
      const img = await this.loadImage(url);
      this.cache.set(url, img);
    }
    return this.cache.get(url)!;
  }
}
```

### 2.2 图元数据结构
```typescript
export interface AdvancedPrimitive {
  id: string;                    // 唯一标识
  sidc: string;                  // SIDC编码
  position: [number, number, number]; // 经纬高
  orientation?: [number, number, number]; // 姿态（偏航、俯仰、滚转）
  scale?: number;                // 缩放比例
  
  // 属性系统
  properties: {
    identity: 'friend' | 'hostile' | 'neutral' | 'unknown';
    status: 'present' | 'planned' | 'destroyed';
    strength?: string;           // 兵力规模
    equipment?: string[];        // 装备列表
    [key: string]: any;          // 扩展属性
  };
  
  // 交互配置
  interaction: {
    selectable: boolean;
    draggable: boolean;
    labelDraggable: boolean;
    showLabel: boolean;
    labelOffset: [number, number, number]; // 标牌偏移
  };
  
  // 可视化配置
  visualization: {
    use3DModel: boolean;         // 是否使用3D模型
    modelUrl?: string;           // glTF模型路径
    billboardSize?: [number, number]; // 2D图标尺寸
    highlightColor?: string;     // 选中高亮颜色
  };
}
```

---

## 三、动态障碍物系统

### 3.1 障碍物类型抽象
```typescript
export enum ObstacleType {
  TERRAIN = 'terrain',           // 地形（基础）
  BUILDING = 'building',         // 建筑物
  VEGETATION = 'vegetation',     // 植被
  VEHICLE = 'vehicle',           // 车辆/移动目标
  STRUCTURE = 'structure',       // 构筑物（桥梁、塔等）
  CUSTOM = 'custom'              // 自定义
}

export interface ObstacleSource {
  id: string;
  name: string;
  type: ObstacleType;
  
  // 数据源配置
  sourceType: 'geojson' | 'gltf' | '3dtiles' | 'entity' | 'stream';
  sourceConfig: any;             // 类型特定配置
  
  // 计算配置
  calculationMode: 'boundingBox' | 'convexHull' | 'exactMesh';
  simplification: {
    enabled: boolean;
    tolerance: number;           // 简化容差（米）
    maxVertices?: number;        // 最大顶点数
  };
  
  // 动态属性
  dynamic?: {
    updateInterval?: number;     // 更新间隔（ms）
    velocityField?: string;      // 速度字段名
    rotationField?: string;      // 旋转字段名
  };
}
```

### 3.2 障碍物检测接口
```typescript
export interface ObstacleDetectionOptions {
  sources: string[];             // 障碍物源ID列表
  includeTerrain: boolean;       // 是否包含地形
  calculationMode: 'fast' | 'balanced' | 'accurate';
  
  // 性能控制
  maxObstacles?: number;         // 最大障碍物数（用于截断）
  samplingDistance?: number;     // 视线采样间隔（米）
  
  // 过滤条件
  filters?: {
    minHeight?: number;          // 最小高度过滤
    maxHeight?: number;          // 最大高度过滤
    categories?: string[];       // 类别过滤
  };
}

export interface ObstacleHit {
  position: [number, number, number];
  obstacleId: string;
  obstacleType: ObstacleType;
  distanceFromStart: number;     // 距离起点的距离
  boundingBox?: [number, number, number][]; // 碰撞包围盒
}
```

### 3.3 多源障碍物统一查询
```typescript
class UnifiedObstacleQuery {
  private sources = new Map<string, ObstacleSource>();
  
  async queryAlongLine(
    start: Cartesian3,
    end: Cartesian3,
    options: ObstacleDetectionOptions
  ): Promise<ObstacleHit[]> {
    const hits: ObstacleHit[] = [];
    
    // 1. 地形障碍（如启用）
    if (options.includeTerrain) {
      const terrainHits = await this.queryTerrain(start, end);
      hits.push(...terrainHits);
    }
    
    // 2. 动态障碍物源并行查询
    const sourcePromises = options.sources.map(sourceId =>
      this.querySource(sourceId, start, end, options)
    );
    
    const sourceResults = await Promise.all(sourcePromises);
    sourceResults.forEach(result => hits.push(...result));
    
    // 3. 按距离排序，返回首个遮挡点或全部
    return hits.sort((a, b) => a.distanceFromStart - b.distanceFromStart);
  }
  
  private async querySource(
    sourceId: string,
    start: Cartesian3,
    end: Cartesian3,
    options: ObstacleDetectionOptions
  ): Promise<ObstacleHit[]> {
    const source = this.sources.get(sourceId);
    if (!source) return [];
    
    switch (source.calculationMode) {
      case 'boundingBox':
        return this.queryBoundingBox(source, start, end);
      case 'convexHull':
        return this.queryConvexHull(source, start, end);
      case 'exactMesh':
        return this.queryExactMesh(source, start, end);
      default:
        return [];
    }
  }
}
```

---

## 四、通视分析算法

### 4.1 核心算法流程
```typescript
export interface LineOfSightCalculator {
  calculate(options: LineOfSightOptions): Promise<LineOfSightResult>;
  
  // 分步计算（用于进度反馈）
  calculateStepwise(
    options: LineOfSightOptions,
    progressCallback?: (progress: number) => void
  ): AsyncGenerator<LineOfSightResult>;
}

// 算法步骤
const algorithmSteps = {
  1: '采样视线路径',
  2: '查询地形高程',
  3: '检测静态障碍',
  4: '检测动态障碍',
  5: '大气折射校正',
  6: '结果分析'
};
```

### 4.2 地球曲率与大气折射
```typescript
class EarthCurvatureCorrector {
  // 地球半径（WGS84）
  private static readonly EARTH_RADIUS = 6378137; // 米
  
  // 标准大气折射系数（k=0.13）
  static applyRefraction(
    height: number,
    distance: number,
    k: number = 0.13
  ): number {
    // 等效地球半径法
    const R_e = this.EARTH_RADIUS / (1 - k);
    return height - (distance * distance) / (2 * R_e);
  }
  
  // 分段折射校正（考虑温度、压力梯度）
  static applyAdvancedRefraction(
    profile: ElevationProfile,
    meteorologicalConditions: MeteoData
  ): ElevationProfile {
    // 实现高级折射模型
    return correctedProfile;
  }
}
```

### 4.3 性能优化策略
```typescript
interface PerformanceOptimization {
  // 视距限制
  maxDistance: number;           // 最大计算距离（默认100km）
  
  // 采样策略
  adaptiveSampling: boolean;     // 自适应采样
  minSamplingInterval: number;   // 最小采样间隔（米）
  maxSamplingInterval: number;   // 最大采样间隔（米）
  
  // 缓存机制
  cacheTerrain: boolean;         // 缓存地形采样结果
  cacheSize: number;             // 缓存条目数
  
  // 并行计算
  useWorker: boolean;            // 使用Web Worker
  workerCount: number;           // Worker数量
}
```

---

## 五、交互系统设计

### 5.1 标牌拖拽独立机制
```typescript
class LabelDragManager {
  private draggingLabel: string | null = null;
  private originalEntityPosition: Cartesian3 | null = null;
  
  // 标牌拖拽不与实体位置联动
  startLabelDrag(labelId: string, entityId: string) {
    this.draggingLabel = labelId;
    const entity = this.getEntity(entityId);
    this.originalEntityPosition = entity.position.clone();
    
    // 只更新标牌偏移量
    this.updateLabelOffset(entityId, dragOffset);
  }
  
  // 实体拖拽独立控制
  startEntityDrag(entityId: string) {
    if (!this.interactiveState.entityDraggable) return;
    
    // 更新实体位置
    this.updateEntityPosition(entityId, newPosition);
    
    // 标牌保持相对偏移
    const labelOffset = this.getLabelOffset(entityId);
    this.updateLabelPosition(entityId, newPosition.add(labelOffset));
  }
}
```

### 5.2 弹出式属性面板设计
```typescript
interface PropertyPanelConfig {
  position: 'cursor' | 'fixed' | 'sidebar'; // 弹出位置
  width: number;                            // 面板宽度
  height: number;                           // 面板高度
  fields: PropertyField[];                  // 显示的字段
  
  // 交互行为
  autoClose: boolean;                       // 点击外部自动关闭
  draggable: boolean;                       // 面板可拖拽
  resizable: boolean;                       // 面板可调整大小
}

// 属性字段定义
interface PropertyField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'boolean' | 'array';
  editable: boolean;                        // 是否可编辑
  options?: { value: any; label: string }[]; // 选择项（select类型）
  
  // 格式化
  formatter?: (value: any) => string;
  validator?: (value: any) => boolean;
}
```

### 5.3 事件系统
```typescript
// 事件类型定义
export enum PrimitiveEventType {
  CLICK = 'primitive:click',
  DOUBLE_CLICK = 'primitive:dblclick',
  DRAG_START = 'primitive:dragstart',
  DRAG_END = 'primitive:dragend',
  LABEL_DRAG_START = 'primitive:label-dragstart',
  LABEL_DRAG_END = 'primitive:label-dragend',
  PROPERTY_CHANGE = 'primitive:property-change'
}

// 事件总线
class PrimitiveEventBus {
  private listeners = new Map<PrimitiveEventType, Function[]>();
  
  emit(event: PrimitiveEventType, data: any) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }
  
  // 上层应用监听示例
  // eventBus.on(PrimitiveEventType.CLICK, (data) => {
  //   showPropertyPanel(data.primitiveId);
  // });
}
```

---

## 六、API接口设计

### 6.1 MapController扩展
```typescript
abstract class MapController {
  // 通视分析
  abstract measureLineOfSight(options: LineOfSightOptions): Promise<LineOfSightResult>;
  
  // 高级图元
  abstract createAdvancedPrimitive(options: PrimitiveCreateOptions): string;
  abstract updateAdvancedPrimitive(id: string, updates: Partial<AdvancedPrimitive>): void;
  abstract removeAdvancedPrimitive(id: string): void;
  abstract getAdvancedPrimitive(id: string): AdvancedPrimitive | null;
  
  // 批量操作
  abstract importPrimitives(data: PrimitiveImportData): string[];
  abstract exportPrimitives(ids?: string[]): PrimitiveExportData;
  
  // 交互控制
  abstract setInteractionState(state: InteractionState): void;
  abstract getInteractionState(): InteractionState;
  
  // 障碍物管理
  abstract registerObstacleSource(source: ObstacleSource): void;
  abstract unregisterObstacleSource(sourceId: string): void;
  abstract getObstacleSources(): ObstacleSource[];
}
```

### 6.2 Cesium适配器实现要点
```typescript
class CesiumController extends MapController {
  private primitiveManager = new CesiumPrimitiveManager(this.viewer);
  private losCalculator = new CesiumLineOfSight(this.viewer);
  
  async measureLineOfSight(options: LineOfSightOptions): Promise<LineOfSightResult> {
    return this.losCalculator.calculate(options);
  }
  
  createAdvancedPrimitive(options: PrimitiveCreateOptions): string {
    const primitive = this.primitiveManager.createPrimitive(options);
    
    // 设置交互事件
    this.setupPrimitiveInteractivity(primitive.id);
    
    return primitive.id;
  }
  
  private setupPrimitiveInteractivity(primitiveId: string) {
    const entity = this.primitiveManager.getEntity(primitiveId);
    
    // 点击事件 -> 弹出属性面板
    entity.leftClick.addEventListener(() => {
      this.eventBus.emit(PrimitiveEventType.CLICK, { primitiveId });
    });
    
    // 拖拽事件（条件控制）
    if (this.interactionState.entityDraggable) {
      this.setupDragging(entity);
    }
    
    // 标牌拖拽（独立控制）
    if (this.interactionState.labelDraggable) {
      this.setupLabelDragging(entity);
    }
  }
}
```

---

## 七、集成路径与实施计划

### 7.1 阶段一：图元分类体系（3天）
1. **Day 1**: 定义类型系统，集成美军标SIDC编码
2. **Day 2**: 实现图标库加载与管理
3. **Day 3**: 创建基础图元渲染（Cesium Billboard）

### 7.2 阶段二：交互系统（2天）
1. **Day 4**: 实现独立标牌拖拽与属性面板事件
2. **Day 5**: 完善交互状态管理，测试各种交互场景

### 7.3 阶段三：通视分析（4天）
1. **Day 6-7**: 实现基础通视算法（地形+静态障碍）
2. **Day 8**: 集成动态障碍物检测
3. **Day 9**: 优化性能，添加地球曲率/折射校正

### 7.4 阶段四：UI集成（2天）
1. **Day 10**: 在cesium-3d-app中创建侧边栏组件
2. **Day 11**: 连接lcplot API，测试完整流程

### 7.5 测试与优化（2天）
1. **Day 12**: 性能测试（大规模图元、长距离通视）
2. **Day 13**: Bug修复与文档完善

---

## 八、技术风险与缓解措施

### 8.1 性能风险
- **风险**: 大规模动态障碍物检测导致卡顿
- **缓解**: 实现LOD（Level of Detail）检测，远距离使用包围盒，近距离使用精确网格

### 8.2 内存风险
- **风险**: 美军标图标库体积较大（1000+图标）
- **缓解**: 按需加载，实现图标缓存与LRU淘汰

### 8.3 精度风险
- **风险**: 地球曲率与大气折射模型不准确
- **缓解**: 提供多种校正模型可选，默认使用标准等效地球半径法

### 8.4 兼容性风险
- **风险**: Cesium版本升级导致API变化
- **缓解**: 封装核心算法，减少直接依赖Cesium内部API

---

## 九、验收标准

### 9.1 功能验收
- [ ] 美军标2525D完整图标库正确显示
- [ ] 通视分析支持动态障碍物检测
- [ ] 标牌拖拽独立于实体拖拽
- [ ] 弹出式属性面板正常工作

### 9.2 性能验收
- [ ] 1000个图元加载时间 < 3秒
- [ ] 50km通视分析计算时间 < 1秒
- [ ] 内存占用增长 < 200MB（1000图元）

### 9.3 兼容性验收
- [ ] 与现有量算工具（距离、面积）共存
- [ ] 支持Cesium 1.116+版本
- [ ] TypeScript类型定义完整

---

## 附录

### A. MIL-STD-2525D 关键编码示例
```
陆地单位（地面战斗）: SFGPUCA---A---
海上单位（水面舰艇）: SFSPUC---A---
空中单位（固定翼飞机）: SFAFUC---A---
太空单位（卫星）: SFSXUC---A---
```

### B. 动态障碍物源配置示例
```json
{
  "id": "building-layer",
  "name": "建筑物图层",
  "type": "building",
  "sourceType": "3dtiles",
  "sourceConfig": {
    "url": "https://example.com/buildings/tileset.json"
  },
  "calculationMode": "boundingBox",
  "simplification": {
    "enabled": true,
    "tolerance": 5.0
  }
}
```

### C. 通视分析参数示例
```typescript
const losOptions = {
  start: [116.3974, 39.9093, 50],   // 天安门观测点
  end: [116.4674, 39.9193, 1000],   // 无人机目标
  includeDynamicObstacles: true,
  obstacleSources: ['buildings', 'moving-vehicles'],
  earthCurvature: true,
  refractionCoefficient: 0.13,
  calculationMode: 'balanced'
};
```

---

**下一步**：请确认设计方向，我将开始阶段一的实现（图元分类体系）。