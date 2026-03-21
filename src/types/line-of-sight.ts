/**
 * 通视分析类型定义
 */

/**
 * 障碍物类型
 */
export enum ObstacleType {
  TERRAIN = 'terrain',           // 地形（基础）
  BUILDING = 'building',         // 建筑物
  VEGETATION = 'vegetation',     // 植被
  VEHICLE = 'vehicle',           // 车辆/移动目标
  STRUCTURE = 'structure',       // 构筑物（桥梁、塔等）
  CUSTOM = 'custom'              // 自定义障碍物
}

/**
 * 障碍物计算精度模式
 */
export enum CalculationMode {
  BOUNDING_BOX = 'boundingBox',  // 包围盒检测（最快）
  CONVEX_HULL = 'convexHull',    // 凸包检测（平衡）
  EXACT_MESH = 'exactMesh',      // 精确网格检测（最慢）
  ADAPTIVE = 'adaptive'          // 自适应（根据距离选择）
}

/**
 * 障碍物数据源类型
 */
export enum ObstacleSourceType {
  GEOJSON = 'geojson',           // GeoJSON矢量数据
  GLTF = 'gltf',                 // glTF 3D模型
  TILES3D = '3dtiles',           // 3D Tiles（Cesium）
  ENTITY = 'entity',             // 地图实体（动态）
  STREAM = 'stream',             // 实时数据流
  TERRAIN = 'terrain'            // 地形数据（内置）
}

/**
 * 障碍物源配置
 */
export interface ObstacleSource {
  // 基本信息
  id: string;                     // 唯一标识符
  name: string;                   // 显示名称
  type: ObstacleType;             // 障碍物类型
  enabled: boolean;               // 是否启用
  
  // 数据源配置
  sourceType: ObstacleSourceType; // 数据源类型
  sourceConfig: any;              // 类型特定配置
  
  // 计算配置
  calculationMode: CalculationMode; // 计算精度模式
  simplification?: {              // 简化配置
    enabled: boolean;             // 启用简化
    tolerance: number;            // 简化容差（米）
    maxVertices?: number;         // 最大顶点数
  };
  
  // 动态属性（针对动态障碍物）
  dynamic?: {
    updateInterval?: number;      // 更新间隔（毫秒）
    velocityField?: string;       // 速度字段名
    rotationField?: string;       // 旋转字段名
    timeWindow?: number;          // 时间窗口（毫秒，预测用）
  };
  
  // 过滤条件
  filters?: {
    minHeight?: number;           // 最小高度（米）
    maxHeight?: number;           // 最大高度（米）
    categories?: string[];        // 类别过滤
    properties?: Record<string, any>; // 属性过滤
  };
  
  // 性能优化
  optimization?: {
    lodEnabled?: boolean;         // 启用LOD
    lodDistances?: number[];      // LOD距离阈值
    cullingEnabled?: boolean;     // 启用视锥剔除
    maxDistance?: number;         // 最大检测距离（米）
  };
}

/**
 * 通视分析选项
 */
export interface LineOfSightOptions {
  // 观测点与目标点
  start: [number, number, number]; // [经度, 纬度, 高度]（米）
  end: [number, number, number];   // [经度, 纬度, 高度]（米）
  
  // 障碍物配置
  includeTerrain: boolean;         // 是否包含地形障碍
  obstacleSources?: string[];      // 启用的障碍物源ID列表
  
  // 地球物理校正
  earthCurvature: boolean;         // 地球曲率校正
  refractionCoefficient?: number;  // 大气折射系数（默认0.13）
  
  // 计算配置
  calculationMode: 'fast' | 'balanced' | 'accurate';
  samplingDistance?: number;       // 采样间隔（米）
  
  // 输出配置
  outputBlockingPoints: boolean;   // 输出遮挡点坐标
  outputProfile: boolean;          // 输出高程剖面
  outputStatistics: boolean;       // 输出统计信息
  
  // 性能控制
  maxObstacles?: number;           // 最大障碍物数
  timeout?: number;                // 超时时间（毫秒）
  
  // 扩展参数
  observerHeight?: number;         // 观测者眼高（米，相对起点高度）
  targetHeight?: number;           // 目标高度（米，相对终点高度）
  wavelength?: number;             // 波长（米，用于无线电通视）
}

/**
 * 遮挡点信息
 */
export interface BlockingPoint {
  position: [number, number, number]; // 遮挡点坐标
  distanceFromStart: number;      // 距离起点的距离（米）
  obstacleId?: string;            // 障碍物ID（如有）
  obstacleType?: ObstacleType;    // 障碍物类型
  heightAboveTerrain: number;     // 离地高度（米）
  penetrationDepth?: number;      // 穿透深度（米，视线进入障碍物的深度）
  
  // 几何信息
  boundingBox?: [number, number, number][]; // 碰撞包围盒
  surfaceNormal?: [number, number, number]; // 表面法向量
}

/**
 * 高程剖面点
 */
export interface ProfilePoint {
  distance: number;               // 距离起点的距离（米）
  height: number;                 // 地面高程（米）
  lineHeight: number;             // 视线高程（考虑曲率/折射）
  terrainType?: string;           // 地形类型
  visible: boolean;               // 是否可见
}

/**
 * 通视分析结果
 */
export interface LineOfSightResult {
  // 基本结果
  visible: boolean;               // 是否通视
  visibleRatio: number;           // 通视比例 (0-1)
  
  // 遮挡信息
  blockingPoints: BlockingPoint[]; // 遮挡点数组（按距离排序）
  firstBlockingPoint?: BlockingPoint; // 首个遮挡点（如有）
  
  // 剖面信息
  profile?: ProfilePoint[];       // 高程剖面
  
  // 统计信息
  statistics?: {
    totalDistance: number;        // 总距离（米）
    terrainClearance: number;     // 地形净空（最小离地高度，米）
    maxBlockingHeight: number;    // 最大遮挡高度（米）
    visibilityDuration?: number;  // 可见持续时间（毫秒，动态障碍物）
  };
  
  // 计算元数据
  metadata: {
    calculationTime: number;      // 计算耗时（毫秒）
    samplesCount: number;         // 采样点数
    obstaclesChecked: number;     // 检查的障碍物数
    warnings?: string[];          // 警告信息
    errors?: string[];            // 错误信息
  };
  
  // 可视化辅助数据
  visualization?: {
    lineColor: string;            // 建议的线段颜色
    profileColor: string;         // 建议的剖面颜色
    blockingPointColor: string;   // 建议的遮挡点颜色
  };
}

/**
 * 渐进式计算进度
 */
export interface CalculationProgress {
  stage: string;                  // 当前阶段
  progress: number;               // 进度 (0-1)
  message?: string;               // 进度消息
  intermediateResult?: Partial<LineOfSightResult>; // 中间结果
}

/**
 * 通视分析性能配置
 */
export interface PerformanceConfig {
  // 距离限制
  maxDistance: number;            // 最大计算距离（米，默认100km）
  
  // 采样策略
  adaptiveSampling: boolean;      // 自适应采样
  minSamplingInterval: number;    // 最小采样间隔（米）
  maxSamplingInterval: number;    // 最大采样间隔（米）
  
  // 缓存机制
  cacheTerrain: boolean;          // 缓存地形采样结果
  cacheSize: number;              // 缓存条目数
  cacheTTL: number;               // 缓存存活时间（毫秒）
  
  // 并行计算
  useWorker: boolean;             // 使用Web Worker
  workerCount: number;            // Worker数量
  workerChunkSize: number;        // 任务分块大小
  
  // 内存控制
  maxMemoryUsage?: number;        // 最大内存使用（MB）
  garbageCollectionInterval?: number; // 垃圾回收间隔（毫秒）
}

/**
 * 地球曲率与大气折射校正器配置
 */
export interface EarthCorrectionConfig {
  // 地球模型
  earthRadius: number;            // 地球半径（米，默认6378137）
  flattening: number;             // 扁率（默认1/298.257223563）
  
  // 大气模型
  refractionModels: RefractionModel[]; // 可用折射模型
  defaultRefractionModel: RefractionModel; // 默认折射模型
  
  // 气象参数（可选）
  meteorological?: {
    temperature: number;          // 温度（°C）
    pressure: number;            // 压力（hPa）
    humidity: number;            // 湿度（%）
    temperatureGradient?: number; // 温度梯度（°C/米）
  };
}

/**
 * 大气折射模型
 */
export enum RefractionModel {
  NONE = 'none',                  // 无折射校正
  STANDARD = 'standard',          // 标准等效地球半径法（k=0.13）
  IMPROVED = 'improved',          // 改进等效地球半径法（k=4/3）
  ADAPTIVE = 'adaptive',          // 自适应折射模型
  ADVANCED = 'advanced'           // 高级折射模型（考虑温压湿）
}

/**
 * 通视分析事件类型
 */
export enum LineOfSightEventType {
  CALCULATION_STARTED = 'los:calculation-started',
  CALCULATION_PROGRESS = 'los:calculation-progress',
  CALCULATION_COMPLETED = 'los:calculation-completed',
  CALCULATION_CANCELLED = 'los:calculation-cancelled',
  CALCULATION_ERROR = 'los:calculation-error',
  
  OBSTACLE_SOURCE_ADDED = 'los:obstacle-source-added',
  OBSTACLE_SOURCE_REMOVED = 'los:obstacle-source-removed',
  OBSTACLE_SOURCE_UPDATED = 'los:obstacle-source-updated',
  
  VISUALIZATION_UPDATED = 'los:visualization-updated'
}

/**
 * 通视分析管理器配置
 */
export interface LineOfSightManagerConfig {
  // 性能配置
  performance: PerformanceConfig;
  
  // 地球物理校正
  earthCorrection: EarthCorrectionConfig;
  
  // 默认选项
  defaultOptions: Partial<LineOfSightOptions>;
  
  // 可视化默认值
  visualizationDefaults: {
    visibleLineColor: string;     // 通视线段颜色
    blockedLineColor: string;     // 遮挡线段颜色
    profileLineColor: string;     // 剖面线颜色
    blockingPointColor: string;   // 遮挡点颜色
    blockingPointSize: number;    // 遮挡点大小
  };
  
  // 日志与调试
  logging: {
    enabled: boolean;             // 启用日志
    level: 'error' | 'warn' | 'info' | 'debug'; // 日志级别
    maxEntries: number;           // 最大日志条目数
  };
}