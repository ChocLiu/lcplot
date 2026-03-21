/**
 * 高级图元类型定义
 * 基于 MIL-STD-2525D 标准
 */

/**
 * 军事领域划分
 */
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

/**
 * 阵营标识
 */
export enum IdentityCode {
  FRIEND = 'friend',      // 友方
  HOSTILE = 'hostile',    // 敌方
  NEUTRAL = 'neutral',    // 中立
  UNKNOWN = 'unknown',    // 未知
  PENDING = 'pending',    // 待定
  ASSUMED_FRIEND = 'assumed_friend',  // 推定友方
  SUSPECT = 'suspect',    // 嫌疑
  EXERCISE_PENDING = 'exercise_pending', // 演习待定
  EXERCISE_UNKNOWN = 'exercise_unknown', // 演习未知
  JOKER = 'joker',        // 玩笑（模拟/训练）
  FAKER = 'faker'         // 伪装
}

/**
 * 状态标识
 */
export enum StatusCode {
  PRESENT = 'present',    // 现役/存在
  PLANNED = 'planned',    // 计划中
  FULLY_CAPABLE = 'fully_capable', // 完全能力
  DAMAGED = 'damaged',    // 受损
  DESTROYED = 'destroyed', // 被毁
  UNKNOWN = 'unknown'     // 未知状态
}

/**
 * 作战指挥关系
 */
export enum CommandRelation {
  SELF = 'self',          // 己方
  FRIEND = 'friend',      // 友方
  NEUTRAL = 'neutral',    // 中立
  HOSTILE = 'hostile',    // 敌方
  EXERCISE = 'exercise',  // 演习
  JOKER = 'joker',        // 模拟
  FAKER = 'faker'         // 伪装
}

/**
 * SIDC（Symbol Identification Coding）15位编码
 * 位置说明：
 * 1-2: 版本标识符
 * 3: 标准标识（W=作战标号，I=情报标号）
 * 4-10: 符号代码
 * 11: 修饰符
 * 12-15: 属性扩展
 */
export type SIDC = string;

/**
 * 图元基本属性
 */
export interface PrimitiveBaseProperties {
  // 身份信息
  identity: IdentityCode;
  commandRelation: CommandRelation;
  status: StatusCode;
  
  // 单位信息
  name?: string;
  designation?: string;           // 单位代号
  strength?: string;              // 兵力规模（如"PLT"排，"COY"连）
  equipment?: string[];           // 装备列表
  
  // 战术信息
  echelon?: string;               // 梯队标识
  taskForce?: string;             // 特遣队标识
  installation?: string;          // 设施类型
  
  // 时间信息
  dateTime?: string;              // 时间戳
  dateTimeGroup?: string;         // DTG格式
  
  // 自定义扩展
  [key: string]: any;
}

/**
 * 交互配置
 */
export interface InteractionConfig {
  // 可交互性
  selectable: boolean;            // 可选择
  draggable: boolean;             // 可拖拽（实体位置）
  labelDraggable: boolean;        // 标牌可拖拽
  editable: boolean;              // 属性可编辑
  
  // 显示控制
  showLabel: boolean;             // 显示标牌
  showInfoCard: boolean;          // 显示信息卡片（悬停）
  highlightOnHover: boolean;      // 悬停高亮
  
  // 标牌配置
  labelOffset: [number, number, number]; // 标牌偏移量（东，北，上）
  labelMaxWidth?: number;         // 标牌最大宽度
  labelFont?: string;             // 标牌字体
  labelColor?: string;            // 标牌颜色
  
  // 拖拽限制
  dragConstraints?: {
    minHeight?: number;           // 最小高度
    maxHeight?: number;           // 最大高度
    terrainConform?: boolean;     // 是否贴合地形
  };
}

/**
 * 可视化配置
 */
export interface VisualizationConfig {
  // 图标/模型选择
  use3DModel: boolean;            // 使用3D模型
  modelUrl?: string;              // glTF模型URL
  billboardUrl?: string;          // 2D图标URL（默认使用SIDC对应图标）
  
  // 尺寸控制
  scale?: number;                 // 缩放比例
  billboardSize?: [number, number]; // 2D图标尺寸 [宽度, 高度]
  modelScale?: [number, number, number]; // 3D模型缩放 [x, y, z]
  
  // 颜色样式
  color?: string;                 // 主颜色（基于identity自动映射）
  highlightColor?: string;        // 选中高亮颜色
  labelBackgroundColor?: string;  // 标牌背景色
  
  // 渲染效果
  showShadow?: boolean;           // 显示阴影（3D模型）
  depthTest?: boolean;            // 深度测试
  blending?: 'opaque' | 'translucent' | 'additive'; // 混合模式
  
  // LOD配置
  lodDistances?: {
    billboard: number;            // 切换为2D图标的距离
    hide: number;                 // 完全隐藏的距离
  };
}

/**
 * 高级图元定义
 */
export interface AdvancedPrimitive {
  // 标识信息
  id: string;                     // 唯一标识符
  sidc: SIDC;                     // SIDC编码
  
  // 空间信息
  position: [number, number, number]; // [经度, 纬度, 高度]（WGS84）
  orientation?: [number, number, number]; // [偏航, 俯仰, 滚转]（度）
  
  // 属性系统
  properties: PrimitiveBaseProperties;
  
  // 交互配置
  interaction: InteractionConfig;
  
  // 可视化配置
  visualization: VisualizationConfig;
  
  // 元数据
  metadata?: {
    created: string;              // 创建时间
    updated: string;              // 更新时间
    createdBy?: string;           // 创建者
    source?: string;              // 数据来源
    confidence?: number;          // 置信度 (0-1)
    classification?: string;      // 分类级别
  };
}

/**
 * 图元创建选项
 */
export interface PrimitiveCreateOptions {
  // 必需参数
  sidc: SIDC;
  position: [number, number, number];
  
  // 可选参数
  properties?: Partial<PrimitiveBaseProperties>;
  interaction?: Partial<InteractionConfig>;
  visualization?: Partial<VisualizationConfig>;
  metadata?: Partial<AdvancedPrimitive['metadata']>;
  
  // 批量创建时的分组标识
  groupId?: string;
}

/**
 * 图元更新选项
 */
export interface PrimitiveUpdateOptions {
  // 可更新的字段
  position?: [number, number, number];
  orientation?: [number, number, number];
  properties?: Partial<PrimitiveBaseProperties>;
  interaction?: Partial<InteractionConfig>;
  visualization?: Partial<VisualizationConfig>;
  
  // 更新模式
  merge?: boolean;                // true=合并更新，false=替换更新
}

/**
 * 图元查询选项
 */
export interface PrimitiveQueryOptions {
  // 空间查询
  bounds?: [[number, number], [number, number]]; // 经纬度边界框
  center?: [number, number, number];            // 中心点
  radius?: number;                             // 半径（米）
  
  // 属性查询
  domain?: MilitaryDomain;                     // 领域过滤
  identity?: IdentityCode | IdentityCode[];    // 阵营过滤
  status?: StatusCode | StatusCode[];          // 状态过滤
  
  // SIDC模式匹配
  sidcPattern?: string;                        // SIDC通配符模式
  
  // 交互状态过滤
  selectable?: boolean;
  draggable?: boolean;
  
  // 分页与排序
  limit?: number;
  offset?: number;
  sortBy?: 'distance' | 'created' | 'updated';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 图元导入/导出数据格式
 */
export interface PrimitiveDataPackage {
  version: string;
  timestamp: string;
  primitives: AdvancedPrimitive[];
  metadata?: {
    coordinateSystem?: string;    // 坐标系
    datum?: string;               // 基准面
    description?: string;         // 数据描述
    tags?: string[];              // 标签
  };
}

/**
 * 图标资源配置
 */
export interface SymbolResourceConfig {
  // 资源路径
  baseUrl: string;                // 图标库基础URL
  format: 'svg' | 'png' | 'jpg'; // 图标格式
  size: [number, number];        // 标准尺寸 [宽, 高]
  
  // 阵营颜色映射（2525D标准）
  identityColors: {
    [IdentityCode.FRIEND]: string;         // 友方 - 蓝色
    [IdentityCode.HOSTILE]: string;        // 敌方 - 红色
    [IdentityCode.NEUTRAL]: string;        // 中立 - 绿色
    [IdentityCode.UNKNOWN]: string;        // 未知 - 黄色
    [IdentityCode.PENDING]: string;        // 待定 - 青色
    [IdentityCode.ASSUMED_FRIEND]: string; // 推定友方 - 浅蓝
    [IdentityCode.SUSPECT]: string;        // 嫌疑 - 紫色
    [IdentityCode.EXERCISE_PENDING]: string; // 演习待定 - 橙色
    [IdentityCode.EXERCISE_UNKNOWN]: string; // 演习未知 - 棕色
    [IdentityCode.JOKER]: string;          // 玩笑 - 粉色
    [IdentityCode.FAKER]: string;          // 伪装 - 灰色
  };
  
  // 缓存配置
  cacheEnabled: boolean;          // 启用缓存
  cacheMaxSize?: number;          // 最大缓存条目数
  cacheTTL?: number;              // 缓存存活时间（毫秒）
}

/**
 * 事件类型
 */
export enum PrimitiveEventType {
  // 创建与销毁
  CREATED = 'primitive:created',
  REMOVED = 'primitive:removed',
  UPDATED = 'primitive:updated',
  
  // 选择与焦点
  SELECTED = 'primitive:selected',
  DESELECTED = 'primitive:deselected',
  FOCUSED = 'primitive:focused',
  
  // 交互事件
  CLICK = 'primitive:click',
  DOUBLE_CLICK = 'primitive:double-click',
  RIGHT_CLICK = 'primitive:right-click',
  
  // 拖拽事件
  DRAG_START = 'primitive:drag-start',
  DRAGGING = 'primitive:dragging',
  DRAG_END = 'primitive:drag-end',
  
  // 标牌事件
  LABEL_DRAG_START = 'primitive:label-drag-start',
  LABEL_DRAGGING = 'primitive:label-dragging',
  LABEL_DRAG_END = 'primitive:label-drag-end',
  
  // 属性事件
  PROPERTY_CHANGED = 'primitive:property-changed',
  VISIBILITY_CHANGED = 'primitive:visibility-changed',
  
  // 批量操作
  BATCH_CREATED = 'primitive:batch-created',
  BATCH_REMOVED = 'primitive:batch-removed',
  BATCH_UPDATED = 'primitive:batch-updated'
}

/**
 * 事件数据
 */
export interface PrimitiveEventData {
  primitiveId: string;
  sidc?: SIDC;
  position?: [number, number, number];
  oldValue?: any;
  newValue?: any;
  source?: string;                // 事件来源
  timestamp: number;              // 时间戳
}