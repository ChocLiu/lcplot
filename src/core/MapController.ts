import {
  MapOptions,
  LayerOptions,
  Geometry,
  DrawOptions,
  StyleOptions,
  MeasurementResult,
  PlottingOptions,
  // 高级图元类型
  AdvancedPrimitive,
  PrimitiveCreateOptions,
  PrimitiveUpdateOptions,
  PrimitiveQueryOptions,
  PrimitiveDataPackage,
  SymbolResourceConfig,
  PrimitiveEventType,
  PrimitiveEventData,
  // 通视分析类型
  ObstacleSource,
  LineOfSightOptions,
  LineOfSightResult,
  CalculationProgress,
  LineOfSightEventType,
  LineOfSightManagerConfig
} from '../types';

export abstract class MapController {
  protected container: HTMLElement;
  protected options: MapOptions;

  constructor(container: HTMLElement, options: MapOptions = {}) {
    this.container = container;
    this.options = options;
  }

  // ========== 基础功能（现有） ==========
  
  // 初始化地图
  abstract init(): void;

  // 销毁地图
  abstract destroy(): void;

  // 地图视图控制
  abstract setCenter(center: [number, number]): void;
  abstract getCenter(): [number, number];
  abstract setZoom(zoom: number): void;
  abstract getZoom(): number;
  abstract setRotation(rotation: number): void;
  abstract getRotation(): number;
  abstract fitBounds(bounds: [[number, number], [number, number]]): void;

  // 图层管理
  abstract addLayer(options: LayerOptions): string;
  abstract removeLayer(layerId: string): void;
  abstract showLayer(layerId: string): void;
  abstract hideLayer(layerId: string): void;
  abstract setLayerOpacity(layerId: string, opacity: number): void;
  abstract setLayerZIndex(layerId: string, zIndex: number): void;

  // 基础图元绘制
  abstract drawGeometry(geometry: Geometry, style?: StyleOptions): string;
  abstract removeGeometry(geometryId: string): void;
  abstract updateGeometry(geometryId: string, geometry: Partial<Geometry>, style?: Partial<StyleOptions>): void;

  // 交互绘制
  abstract startDraw(options: DrawOptions): Promise<Geometry>;
  abstract stopDraw(): void;

  // 量算工具
  abstract measureDistance(points: [number, number][]): MeasurementResult;
  abstract measureArea(points: [number, number][]): MeasurementResult;
  abstract measureAngle(points: [number, number, number]): number; // 三点测角

  // 共性标绘
  abstract plot(type: string, options: PlottingOptions): string;
  abstract removePlot(plotId: string): void;

  // 工具方法
  protected abstract getNativeMap(): any;

  // ========== 高级图元系统（新增） ==========
  
  /**
   * 创建高级图元
   * @param options 图元创建选项
   * @returns 图元ID
   */
  abstract createAdvancedPrimitive(options: PrimitiveCreateOptions): Promise<string>;
  
  /**
   * 更新高级图元
   * @param id 图元ID
   * @param updates 更新内容
   */
  abstract updateAdvancedPrimitive(id: string, updates: PrimitiveUpdateOptions): Promise<void>;
  
  /**
   * 删除高级图元
   * @param id 图元ID
   */
  abstract removeAdvancedPrimitive(id: string): void;
  
  /**
   * 获取高级图元
   * @param id 图元ID
   * @returns 图元对象或null
   */
  abstract getAdvancedPrimitive(id: string): AdvancedPrimitive | null;
  
  /**
   * 查询高级图元
   * @param options 查询选项
   * @returns 匹配的图元ID数组
   */
  abstract queryAdvancedPrimitives(options: PrimitiveQueryOptions): string[];
  
  /**
   * 批量导入图元数据
   * @param data 图元数据包
   * @returns 导入的图元ID数组
   */
  abstract importPrimitives(data: PrimitiveDataPackage): Promise<string[]>;
  
  /**
   * 批量导出图元数据
   * @param ids 要导出的图元ID数组（为空则导出全部）
   * @returns 图元数据包
   */
  abstract exportPrimitives(ids?: string[]): PrimitiveDataPackage;
  
  /**
   * 设置图元交互状态
   * @param primitiveId 图元ID
   * @param enabled 是否启用交互
   * @param options 交互选项
   */
  abstract setPrimitiveInteraction(
    primitiveId: string,
    enabled: boolean,
    options?: { draggable?: boolean; labelDraggable?: boolean }
  ): void;
  
  /**
   * 设置图标资源库配置
   * @param config 资源库配置
   */
  abstract setSymbolResourceConfig(config: SymbolResourceConfig): void;
  
  /**
   * 注册图元事件监听器
   * @param eventType 事件类型
   * @param listener 监听函数
   */
  abstract onPrimitiveEvent(
    eventType: PrimitiveEventType,
    listener: (data: PrimitiveEventData) => void
  ): void;
  
  /**
   * 移除图元事件监听器
   * @param eventType 事件类型
   * @param listener 监听函数
   */
  abstract offPrimitiveEvent(
    eventType: PrimitiveEventType,
    listener: (data: PrimitiveEventData) => void
  ): void;

  // ========== 通视分析系统（新增） ==========
  
  /**
   * 执行通视分析
   * @param options 通视分析选项
   * @returns 通视分析结果
   */
  abstract measureLineOfSight(options: LineOfSightOptions): Promise<LineOfSightResult>;
  
  /**
   * 渐进式通视分析（支持进度回调）
   * @param options 通视分析选项
   * @param progressCallback 进度回调函数
   * @returns 通视分析结果
   */
  abstract measureLineOfSightStepwise(
    options: LineOfSightOptions,
    progressCallback?: (progress: CalculationProgress) => void
  ): Promise<LineOfSightResult>;
  
  /**
   * 注册障碍物数据源
   * @param source 障碍物源配置
   */
  abstract registerObstacleSource(source: ObstacleSource): void;
  
  /**
   * 移除障碍物数据源
   * @param sourceId 障碍物源ID
   */
  abstract unregisterObstacleSource(sourceId: string): void;
  
  /**
   * 获取所有注册的障碍物源
   * @returns 障碍物源数组
   */
  abstract getObstacleSources(): ObstacleSource[];
  
  /**
   * 配置通视分析管理器
   * @param config 管理器配置
   */
  abstract configureLineOfSight(config: Partial<LineOfSightManagerConfig>): void;
  
  /**
   * 注册通视分析事件监听器
   * @param eventType 事件类型
   * @param listener 监听函数
   */
  abstract onLineOfSightEvent(
    eventType: LineOfSightEventType,
    listener: (data: any) => void
  ): void;
  
  /**
   * 移除通视分析事件监听器
   * @param eventType 事件类型
   * @param listener 监听函数
   */
  abstract offLineOfSightEvent(
    eventType: LineOfSightEventType,
    listener: (data: any) => void
  ): void;
  
  /**
   * 可视化通视分析结果
   * @param result 通视分析结果
   * @param options 可视化选项
   * @returns 可视化元素ID数组
   */
  abstract visualizeLineOfSight(
    result: LineOfSightResult,
    options?: {
      showLine?: boolean;
      showProfile?: boolean;
      showBlockingPoints?: boolean;
      colors?: {
        visibleLine?: string;
        blockedLine?: string;
        blockingPoint?: string;
        profileLine?: string;
      };
    }
  ): string[];
  
  /**
   * 移除通视分析可视化
   * @param visualizationIds 可视化元素ID数组
   */
  abstract removeLineOfSightVisualization(visualizationIds: string[]): void;
}