/**
 * Cesium 控制器实现
 * 集成高级图元渲染与交互
 */

import { MapController } from '../../core/MapController';
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
  LineOfSightManagerConfig,
  // 常量
  IdentityCode
} from '../../types';

// Cesium 相关 - 使用命名空间导入以兼容UMD构建
import * as Cesium from 'cesium';
// import 'cesium/Build/Cesium/Widgets/widgets.css'; // 注释掉CSS导入，由HTML通过link标签加载

// 获取 Cesium 对象（兼容浏览器全局变量）
const getCesium = (): any => {
  // 如果模块导入的 Cesium 可用，使用模块导入
  if (typeof Cesium !== 'undefined' && Cesium.Viewer) {
    return Cesium;
  }
  // 否则尝试全局 Cesium 对象
  if (typeof window !== 'undefined' && (window as any).Cesium) {
    return (window as any).Cesium;
  }
  // 最后尝试 globalThis
  if (typeof globalThis !== 'undefined' && (globalThis as any).Cesium) {
    return (globalThis as any).Cesium;
  }
  throw new Error('Cesium library not found. Make sure Cesium is loaded before using CesiumController.');
};

// 内部模块 - 渲染器
import { CesiumPrimitiveRenderer, CesiumPrimitiveRendererConfig } from './CesiumPrimitiveRenderer';
import { BillboardCollectionRenderer } from './high-performance/BillboardCollectionRenderer';
import { HybridRenderer } from './high-performance/HybridRenderer';
import { HighPerformancePrimitiveRenderer } from './high-performance/HighPerformancePrimitiveRenderer';

// 内部模块 - 交互与核心
import { CesiumInteractive, CesiumInteractiveConfig } from './CesiumInteractive';
import { SymbolLibrary } from '../../features/advanced-primitives/SymbolLibrary';
import { PrimitiveCatalog } from '../../features/advanced-primitives/PrimitiveCatalog';
import { InteractiveManager, InteractionOptions } from '../../features/advanced-primitives/InteractiveManager';

/**
 * 渲染器模式
 * - 'entity': 原有 Entity API 渲染器（兼容）
 * - 'billboard': BillboardCollection 高性能渲染
 * - 'hybrid': 混合模式（推荐）- 简单图标用 BillboardCollection，复杂符号用 Primitive
 */
export type RendererMode = 'entity' | 'billboard' | 'hybrid';

/**
 * Cesium 控制器配置
 */
export interface CesiumControllerConfig {
  // 基础配置
  cesiumToken?: string;
  terrainProvider?: any;
  imageryProvider?: any;
  
  // 渲染器模式（默认 'hybrid' = 路线 C）
  rendererMode?: RendererMode;
  
  // 高级图元配置
  symbolLibraryConfig?: Partial<SymbolResourceConfig>;
  interactionOptions?: InteractionOptions;
  
  // 性能配置
  maxPrimitives?: number;
  lodDistances?: {
    billboardToModel: number;
    hide: number;
  };
}

/** 从 SIDC 提取敌我阵营标识（统一使用 mil-symbols 中的版本）*/
import { identityFromSidc, resolveSidc, SymbolType } from '../../utils/mil-symbols';

/**
 * Cesium 控制器实现
 */
export class CesiumController extends MapController {
  private viewer: Cesium.Viewer | null = null;
  private config: CesiumControllerConfig;
  
  // 高级图元系统 - 渲染器（支持多后端）
  private symbolLibrary: SymbolLibrary | null = null;
  private primitiveCatalog: PrimitiveCatalog | null = null;
  private interactiveManager: InteractiveManager | null = null;
  private primitiveRenderer: CesiumPrimitiveRenderer | null = null;
  private billboardRenderer: BillboardCollectionRenderer | null = null;
  private hybridRenderer: HybridRenderer | null = null;
  private cesiumInteractive: CesiumInteractive | null = null;
  
  // 当前渲染器模式
  private rendererMode: RendererMode;
  
  // viewer 所有权标记：true = LCPLOT 创建的，destroy 时一并销毁
  private ownsViewer = false;
  
  // 事件监听器
  private primitiveEventListeners = new Map<PrimitiveEventType, Set<(data: PrimitiveEventData) => void>>();
  private lineOfSightEventListeners = new Map<LineOfSightEventType, Set<(data: any) => void>>();
  
  // 状态
  private isInitialized = false;

  constructor(container: HTMLElement, options: MapOptions = {}, config: CesiumControllerConfig = {}) {
    super(container, options);
    this.config = config;
    this.rendererMode = config.rendererMode ?? 'hybrid'; // 默认路线 C
  }

  // ========== 基础地图功能 ==========

  /**
   * 获取 Cesium 对象（延迟加载）
   */
  private getCesium(): any {
    return getCesium();
  }

  init(): void {
    if (this.isInitialized) return;
    
    try {
      // 获取 Cesium 对象（兼容各种环境）
      const Cesium = this.getCesium();
      
      // 确保禁用 Cesium Ion（多重防护）
      if (Cesium.Ion) {
        Cesium.Ion.defaultAccessToken = '';
      }
      
      // 确保有有效的影像提供者（避免使用 Ion 世界影像）
      let imageryProvider = this.config.imageryProvider;
      if (!imageryProvider) {
        // 默认使用 OpenStreetMap，避免 Ion 依赖
        imageryProvider = new Cesium.OpenStreetMapImageryProvider({
          url: 'https://a.tile.openstreetmap.org/',
          maximumLevel: 19
        });
      }
      
      // 初始化 Cesium Viewer
      this.viewer = new Cesium.Viewer(this.container, {
        baseLayerPicker: false,
        geocoder: false,
        homeButton: true,
        sceneModePicker: true,
        selectionIndicator: true,
        timeline: true,
        navigationHelpButton: false,
        animation: false,
        fullscreenButton: true,
        infoBox: false,
        scene3DOnly: true,
        imageryProvider: imageryProvider,
        terrainProvider: this.config.terrainProvider
      });
      
      // 额外防护：确保不使用 Ion 相关资源
      // 注意：通过设置空令牌和提供自定义 imageryProvider，应该已足够
      
      // 设置全局变量以便调试
      (window as any).cesiumViewer = this.viewer;
      
      // 初始化高级图元系统
      this.initializeAdvancedPrimitiveSystem();
      
      this.isInitialized = true;
      this.ownsViewer = true;
      console.log('CesiumController initialized successfully');
    } catch (error) {
      console.error('Failed to initialize CesiumController:', error);
      throw error;
    }
  }

  /**
   * ========== 初始化（接入已创建的 Cesium Viewer）==========
   *
   * 使用外部已有的 Cesium.Viewer 初始化 LCPLOT 渲染引擎。
   * 适用于用户已经创建好 Cesium 地球，只需接入标绘功能的场景。
   *
   * 用法：
   *   const viewer = new Cesium.Viewer(container, {...});
   *   const ctrl = new CesiumController(container, {}, { rendererMode: 'hybrid' });
   *   ctrl.initWithViewer(viewer);  // 传入已有 viewer，不再创建新的
   *
   * 注意：传入的 viewer 不会在 ctrl.destroy() 时被销毁，调用方自行管理 viewer 生命周期。
   */
  initWithViewer(viewer: Cesium.Viewer): void {
    if (this.isInitialized) return;
    if (!viewer) throw new Error('Existing Cesium Viewer is required');

    try {
      this.viewer = viewer;

      // 设置全局变量以便调试
      (window as any).cesiumViewer = viewer;

      // 初始化高级图元系统
      this.initializeAdvancedPrimitiveSystem();

      this.isInitialized = true;
      this.ownsViewer = false;
      console.log('CesiumController initialized with existing viewer (destroy() will NOT destroy it)');
    } catch (error) {
      console.error('Failed to initialize CesiumController with existing viewer:', error);
      throw error;
    }
  }

  destroy(): void {
    // 清理高级图元系统 - 根据渲染器模式
    if (this.hybridRenderer) {
      this.hybridRenderer.destroy();
      this.hybridRenderer = null;
    }
    if (this.billboardRenderer) {
      this.billboardRenderer.destroy();
      this.billboardRenderer = null;
    }
    if (this.primitiveRenderer) {
      this.primitiveRenderer.destroy();
      this.primitiveRenderer = null;
    }
    
    if (this.cesiumInteractive) {
      this.cesiumInteractive.destroy();
      this.cesiumInteractive = null;
    }
    
    if (this.interactiveManager) {
      this.interactiveManager.dispose();
      this.interactiveManager = null;
    }
    
    // 销毁 Cesium Viewer（仅当由 LCPLOT 创建时）
    if (this.ownsViewer && this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    
    // 清理全局变量
    (window as any).cesiumViewer = null;
    
    // 清理监听器
    this.primitiveEventListeners.clear();
    this.lineOfSightEventListeners.clear();
    
    this.isInitialized = false;
    console.log('CesiumController destroyed');
  }

  // ========== 地图视图控制 ==========

  setCenter(center: [number, number]): void {
    if (!this.viewer) return;
    
    const Cesium = this.getCesium();
    const [longitude, latitude] = center;
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, 10000)
    });
  }

  getCenter(): [number, number] {
    if (!this.viewer) return [0, 0];
    
    const Cesium = this.getCesium();
    const position = this.viewer.camera.positionCartographic;
    const longitude = Cesium.Math.toDegrees(position.longitude);
    const latitude = Cesium.Math.toDegrees(position.latitude);
    
    return [longitude, latitude];
  }

  setZoom(zoom: number): void {
    if (!this.viewer) return;
    
    const Cesium = this.getCesium();
    // Cesium 使用高度而不是缩放级别
    // 这里简化处理：将zoom映射到高度
    const height = Math.pow(2, 20 - zoom) * 100; // 近似映射
    const center = this.getCenter();
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(center[0], center[1], height)
    });
  }

  getZoom(): number {
    if (!this.viewer) return 0;
    
    const height = this.viewer.camera.positionCartographic.height;
    // 反向映射高度到zoom
    const zoom = 20 - Math.log2(height / 100);
    return Math.max(0, Math.min(20, zoom));
  }

  setRotation(rotation: number): void {
    if (!this.viewer) return;
    
    const Cesium = this.getCesium();
    const heading = Cesium.Math.toRadians(rotation);
    this.viewer.camera.setView({
      orientation: {
        heading: heading,
        pitch: this.viewer.camera.pitch,
        roll: this.viewer.camera.roll
      }
    });
  }

  getRotation(): number {
    if (!this.viewer) return 0;
    
    const Cesium = this.getCesium();
    return Cesium.Math.toDegrees(this.viewer.camera.heading);
  }

  fitBounds(bounds: [[number, number], [number, number]]): void {
    if (!this.viewer) return;
    
    const Cesium = this.getCesium();
    const [[west, south], [east, north]] = bounds;
    // 调整相机高度以适应范围
    const rectangle = new Cesium.Rectangle(
      Cesium.Math.toRadians(west),
      Cesium.Math.toRadians(south),
      Cesium.Math.toRadians(east),
      Cesium.Math.toRadians(north)
    );
    
    this.viewer.camera.flyTo({
      destination: rectangle
    });
  }

  // ========== 图层管理 ==========

  addLayer(options: LayerOptions): string {
    console.warn('addLayer not fully implemented yet');
    return `layer_${Date.now()}`;
  }

  removeLayer(layerId: string): void {
    console.warn('removeLayer not fully implemented yet');
  }

  showLayer(layerId: string): void {
    console.warn('showLayer not fully implemented yet');
  }

  hideLayer(layerId: string): void {
    console.warn('hideLayer not fully implemented yet');
  }

  setLayerOpacity(layerId: string, opacity: number): void {
    console.warn('setLayerOpacity not fully implemented yet');
  }

  setLayerZIndex(layerId: string, zIndex: number): void {
    console.warn('setLayerZIndex not fully implemented yet');
  }

  // ========== 基础图元绘制 ==========

  drawGeometry(geometry: Geometry, style?: StyleOptions): string {
    console.warn('drawGeometry not fully implemented yet');
    return `geometry_${Date.now()}`;
  }

  removeGeometry(geometryId: string): void {
    console.warn('removeGeometry not fully implemented yet');
  }

  updateGeometry(geometryId: string, geometry: Partial<Geometry>, style?: Partial<StyleOptions>): void {
    console.warn('updateGeometry not fully implemented yet');
  }

  async startDraw(options: DrawOptions): Promise<Geometry> {
    console.warn('startDraw not fully implemented yet');
    return { type: 'Point', coordinates: [] };
  }

  stopDraw(): void {
    console.warn('stopDraw not fully implemented yet');
  }

  // ========== 量算工具 ==========

  measureDistance(points: [number, number][]): MeasurementResult {
    console.warn('measureDistance not fully implemented yet');
    return { unit: 'meters' };
  }

  measureArea(points: [number, number][]): MeasurementResult {
    console.warn('measureArea not fully implemented yet');
    return { unit: 'square meters' };
  }

  measureAngle(points: [number, number, number]): number {
    console.warn('measureAngle not fully implemented yet');
    return 0;
  }

  // ========== 共性标绘 ==========

  plot(type: string, options: PlottingOptions): string {
    console.warn('plot not fully implemented yet');
    return `plot_${Date.now()}`;
  }

  removePlot(plotId: string): void {
    console.warn('removePlot not fully implemented yet');
  }

  // ========== 高级图元系统 ==========

  async createAdvancedPrimitive(options: PrimitiveCreateOptions): Promise<string> {
    this.ensurePrimitiveSystemInitialized();

    // ===== 自动从 SIDC 提取敌我属性 =====
    // MIL-STD-2525D 中，敌我编码在 SIDC 中已包含（位置 10：A=友/H=敌/N=中）
    // 若用户未显式设置 identity，则从 SIDC 自动推断
    // 若用户显式设置，则以用户设置为准（覆盖场景：演习、伪装等）
    const finalOptions = { ...options };
    if (!finalOptions.properties) {
      finalOptions.properties = {};
    }
    if (finalOptions.properties.identity === undefined) {
      finalOptions.properties.identity = identityFromSidc(options.sidc) as any;
    }

    try {
      return await this.getActiveRenderer().createPrimitive(finalOptions);
    } catch (error) {
      console.error('Failed to create advanced primitive:', error);
      throw error;
    }
  }

  /**
   * 创建军标（简化 API）
   *
   * 用户无需关心 SIDC 编码，只需指定军标类型和敌我属性。
   * 默认敌我属性为 'friend'（友方），自动映射正确的 SIDC 和颜色。
   *
   * @param options.type      军标类型（SymbolType 枚举）
   * @param options.identity  敌我属性（'friend'|'hostile'|'neutral'|'unknown'，默认 'friend'）
   * @param options.position  位置 [经度°, 纬度°, 高度米]
   * @param options.name      显示名称（可选）
   * @param options.scale     缩放比例（可选，默认 1.0）
   * @param options.use3DModel 是否启用 3D 模型过渡（可选）
   * @param options.modelUrl  3D 模型 URL（可选）
   *
   * 示例：
   *   await ctrl.addSymbol({
   *     type: SymbolType.GROUND_TANK,       // 坦克
   *     identity: 'hostile',                 // 敌方（默认 friend）
   *     position: [116.4, 39.9, 0],
   *     name: '敌方装甲连'
   *   });
   */
  async addSymbol(options: {
    type: string;
    identity?: string;
    position: [number, number, number];
    name?: string;
    scale?: number;
    use3DModel?: boolean;
    modelUrl?: string;
  }): Promise<string> {
    const identity = options.identity || 'friend';
    const type = options.type as any;

    // 解析 SIDC：类型 + 敌我 → 15 位编码
    let sidc: string;
    try {
      sidc = resolveSidc(type, identity);
    } catch (e) {
      sidc = type;
    }

    return this.createAdvancedPrimitive({
      sidc,
      position: options.position,
      properties: {
        identity: identity as any,
        name: options.name || ''
      },
      visualization: {
        scale: options.scale ?? 1.0,
        use3DModel: options.use3DModel ?? false,
        modelUrl: options.modelUrl
      }
    });
  }

  async updateAdvancedPrimitive(id: string, updates: PrimitiveUpdateOptions): Promise<void> {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      await this.getActiveRenderer().updatePrimitive(id, updates);
    } catch (error) {
      console.error(`Failed to update advanced primitive ${id}:`, error);
      throw error;
    }
  }
  
  removeAdvancedPrimitive(id: string): void {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      this.getActiveRenderer().removePrimitive(id);
    } catch (error) {
      console.error(`Failed to remove advanced primitive ${id}:`, error);
      throw error;
    }
  }
  
  getAdvancedPrimitive(id: string): AdvancedPrimitive | null {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      return this.getActiveRenderer().getPrimitive(id);
    } catch (error) {
      console.error(`Failed to get advanced primitive ${id}:`, error);
      return null;
    }
  }
  
  queryAdvancedPrimitives(options: PrimitiveQueryOptions): string[] {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      // 转换查询选项
      const queryOptions: any = {};
      
      if (options.domain) queryOptions.domain = options.domain;
      if (options.identity) queryOptions.identity = options.identity;
      if (options.bounds) queryOptions.bounds = options.bounds;
      
      return (this.getActiveRenderer() as any).queryPrimitives(queryOptions);
    } catch (error) {
      console.error('Failed to query advanced primitives:', error);
      return [];
    }
  }
  
  async importPrimitives(data: PrimitiveDataPackage): Promise<string[]> {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      const ids: string[] = [];
      
      for (const primitive of data.primitives) {
        const id = await this.primitiveRenderer!.createPrimitive({
          sidc: primitive.sidc,
          position: primitive.position,
          properties: primitive.properties,
          interaction: primitive.interaction,
          visualization: primitive.visualization,
          metadata: primitive.metadata
        });
        ids.push(id);
      }
      
      return ids;
    } catch (error) {
      console.error('Failed to import primitives:', error);
      return [];
    }
  }
  
  exportPrimitives(ids?: string[]): PrimitiveDataPackage {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      const primitives: AdvancedPrimitive[] = [];
      
      if (ids && ids.length > 0) {
        for (const id of ids) {
          const primitive = this.primitiveRenderer!.getPrimitive(id);
          if (primitive) {
            primitives.push(primitive);
          }
        }
      } else {
        const allIds = this.primitiveRenderer!.getAllPrimitiveIds();
        for (const id of allIds) {
          const primitive = this.primitiveRenderer!.getPrimitive(id);
          if (primitive) {
            primitives.push(primitive);
          }
        }
      }
      
      return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        primitives
      };
    } catch (error) {
      console.error('Failed to export primitives:', error);
      return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        primitives: []
      };
    }
  }
  
  setPrimitiveInteraction(
    primitiveId: string,
    enabled: boolean,
    options?: { draggable?: boolean; labelDraggable?: boolean }
  ): void {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      this.interactiveManager!.updateInteractionConfig(primitiveId, {
        selectable: enabled,
        draggable: options?.draggable ?? false,
        labelDraggable: options?.labelDraggable ?? false
      });
    } catch (error) {
      console.error(`Failed to set primitive interaction for ${primitiveId}:`, error);
    }
  }
  
  setSymbolResourceConfig(config: SymbolResourceConfig): void {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      this.symbolLibrary!.updateConfig(config);
    } catch (error) {
      console.error('Failed to set symbol resource config:', error);
    }
  }

  getSymbolLibrary(): SymbolLibrary | null {
    this.ensurePrimitiveSystemInitialized();
    return this.symbolLibrary;
  }
  
  onPrimitiveEvent(
    eventType: PrimitiveEventType,
    listener: (data: PrimitiveEventData) => void
  ): void {
    this.ensurePrimitiveSystemInitialized();
    
    if (!this.primitiveEventListeners.has(eventType)) {
      this.primitiveEventListeners.set(eventType, new Set());
    }
    this.primitiveEventListeners.get(eventType)!.add(listener);
    
    // 转发到交互管理器
    this.interactiveManager!.on(eventType, listener);
  }
  
  offPrimitiveEvent(
    eventType: PrimitiveEventType,
    listener: (data: PrimitiveEventData) => void
  ): void {
    this.ensurePrimitiveSystemInitialized();
    
    const listeners = this.primitiveEventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
    
    // 从交互管理器移除
    this.interactiveManager!.off(eventType, listener);
  }

  // ========== 通视分析系统 ==========
  
  async measureLineOfSight(options: LineOfSightOptions): Promise<LineOfSightResult> {
    console.warn('measureLineOfSight not implemented yet');
    return {
      visible: false,
      visibleRatio: 0,
      blockingPoints: [],
      metadata: {
        calculationTime: 0,
        samplesCount: 0,
        obstaclesChecked: 0
      }
    };
  }
  
  async measureLineOfSightStepwise(
    options: LineOfSightOptions,
    progressCallback?: (progress: CalculationProgress) => void
  ): Promise<LineOfSightResult> {
    console.warn('measureLineOfSightStepwise not implemented yet');
    return this.measureLineOfSight(options);
  }
  
  registerObstacleSource(source: ObstacleSource): void {
    console.warn('registerObstacleSource not implemented yet');
  }
  
  unregisterObstacleSource(sourceId: string): void {
    console.warn('unregisterObstacleSource not implemented yet');
  }
  
  getObstacleSources(): ObstacleSource[] {
    console.warn('getObstacleSources not implemented yet');
    return [];
  }
  
  configureLineOfSight(config: Partial<LineOfSightManagerConfig>): void {
    console.warn('configureLineOfSight not implemented yet');
  }
  
  onLineOfSightEvent(
    eventType: LineOfSightEventType,
    listener: (data: any) => void
  ): void {
    if (!this.lineOfSightEventListeners.has(eventType)) {
      this.lineOfSightEventListeners.set(eventType, new Set());
    }
    this.lineOfSightEventListeners.get(eventType)!.add(listener);
  }
  
  offLineOfSightEvent(
    eventType: LineOfSightEventType,
    listener: (data: any) => void
  ): void {
    const listeners = this.lineOfSightEventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }
  
  visualizeLineOfSight(
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
  ): string[] {
    console.warn('visualizeLineOfSight not implemented yet');
    return [];
  }
  
  removeLineOfSightVisualization(visualizationIds: string[]): void {
    console.warn('removeLineOfSightVisualization not implemented yet');
  }

  // ========== 工具方法 ==========

  protected getNativeMap(): any {
    return this.viewer;
  }

  /**
   * 获取当前 Cesium Viewer 实例
   */
  getViewer(): Cesium.Viewer | null {
    return this.viewer;
  }

  /**
   * 获取当前使用的渲染器模式
   */
  getRendererMode(): RendererMode {
    return this.rendererMode;
  }
  
  /**
   * 获取图元渲染器（Entity API 版本）
   */
  getPrimitiveRenderer(): CesiumPrimitiveRenderer | null {
    return this.primitiveRenderer;
  }
  
  /**
   * 获取 Billboard 渲染器
   */
  getBillboardRenderer(): BillboardCollectionRenderer | null {
    return this.billboardRenderer;
  }
  
  /**
   * 获取混合渲染器
   */
  getHybridRenderer(): HybridRenderer | null {
    return this.hybridRenderer;
  }
  
  /**
   * 获取当前活动的渲染器（统一接口）
   */
  private getActiveRenderer(): any {
    switch (this.rendererMode) {
      case 'hybrid':
        if (this.hybridRenderer) return this.hybridRenderer;
        break;
      case 'billboard':
        if (this.billboardRenderer) return this.billboardRenderer;
        break;
      case 'entity':
      default:
        if (this.primitiveRenderer) return this.primitiveRenderer;
        break;
    }
    throw new Error('No active renderer - call init() first');
  }

  /**
   * 获取交互管理器
   */
  getInteractiveManager(): InteractiveManager | null {
    return this.interactiveManager;
  }

  // ========== 私有方法 ==========

  /**
   * 初始化高级图元系统（支持多渲染器模式）
   */
  private initializeAdvancedPrimitiveSystem(): void {
    if (!this.viewer) {
      throw new Error('Cesium Viewer not initialized');
    }
    
    // 初始化符号库（所有模式共享）
    this.symbolLibrary = new SymbolLibrary({
      baseUrl: this.config.symbolLibraryConfig?.baseUrl || '/mil-icons',
      format: this.config.symbolLibraryConfig?.format || 'svg',
      size: this.config.symbolLibraryConfig?.size || [64, 64],
      identityColors: this.config.symbolLibraryConfig?.identityColors || {
        [IdentityCode.FRIEND]: '#00AAFF',
        [IdentityCode.HOSTILE]: '#FF4444',
        [IdentityCode.NEUTRAL]: '#00CC66',
        [IdentityCode.UNKNOWN]: '#FFFF00',
        [IdentityCode.PENDING]: '#00FFFF',
        [IdentityCode.ASSUMED_FRIEND]: '#88CCFF',
        [IdentityCode.SUSPECT]: '#CC00FF',
        [IdentityCode.EXERCISE_PENDING]: '#FF9900',
        [IdentityCode.EXERCISE_UNKNOWN]: '#996633',
        [IdentityCode.JOKER]: '#FF66CC',
        [IdentityCode.FAKER]: '#888888'
      },
      cacheEnabled: true,
      cacheMaxSize: 500
    });
    
    // 初始化分类目录
    this.primitiveCatalog = new PrimitiveCatalog();
    
    // 初始化交互管理器
    this.interactiveManager = new InteractiveManager({
      onEvent: (eventType, data) => {
        // 转发事件到注册的监听器
        const listeners = this.primitiveEventListeners.get(eventType);
        if (listeners) {
          listeners.forEach(listener => {
            try {
              listener(data);
            } catch (error) {
              console.error(`Error in primitive event listener for ${eventType}:`, error);
            }
          });
        }
      },
      ...this.config.interactionOptions
    });
    
    // 根据渲染器模式初始化
    console.log(`Initializing advanced primitive system (mode: ${this.rendererMode})`);
    
    switch (this.rendererMode) {
      case 'hybrid':
        this.initHybridRenderer();
        break;
      case 'billboard':
        this.initBillboardRenderer();
        break;
      case 'entity':
      default:
        this.initEntityRenderer();
        break;
    }
    
    console.log(`Advanced primitive system initialized (mode: ${this.rendererMode})`);
  }
  
  /**
   * 初始化 Entity API 渲染器（原有方案）
   */
  private initEntityRenderer(): void {
    const rendererConfig: CesiumPrimitiveRendererConfig = {
      viewer: this.viewer!,
      symbolLibrary: this.symbolLibrary!,
      primitiveCatalog: this.primitiveCatalog!,
      maxPrimitives: this.config.maxPrimitives || 10000,
      lodDistances: this.config.lodDistances || {
        billboardToModel: 5000,
        hide: 100000
      },
      defaultStyles: {
        labelFont: '14px sans-serif',
        labelColor: 'white',
        labelBackgroundColor: 'rgba(0,0,0,0.7)',
        highlightColor: 'yellow'
      }
    };
    this.primitiveRenderer = new CesiumPrimitiveRenderer(rendererConfig);
    this.setupInteractive(this.primitiveRenderer);
  }
  
  /**
   * 初始化 BillboardCollection 渲染器
   */
  private initBillboardRenderer(): void {
    this.billboardRenderer = new BillboardCollectionRenderer(this.viewer!, {
      maxBillboards: this.config.maxPrimitives || 50000,
      maxLabels: this.config.maxPrimitives || 50000,
      enableDistanceDisplay: true
    });
    this.setupInteractive({
      getPrimitive: (id: string) => this.billboardRenderer!.getPrimitive(id)
    });
  }
  
  /**
   * 初始化混合渲染器（路线 C）
   * BillboardCollectionCollection 作为主力渲染器，支持数万图元
   */
  private initHybridRenderer(): void {
    this.billboardRenderer = new BillboardCollectionRenderer(this.viewer!, {
      maxBillboards: this.config.maxPrimitives || 100000,
      maxLabels: this.config.maxPrimitives || 100000,
      enableDistanceDisplay: true
    });
    
    this.setupInteractive({
      getPrimitive: (id: string) => this.billboardRenderer!.getPrimitive(id)
    });
    
    console.log('HybridRenderer mode active - BillboardCollection is primary renderer');
  }
  
  /**
   * 设置交互管理器
   */
  private setupInteractive(renderer: any): void {
    const interactiveConfig: CesiumInteractiveConfig = {
      viewer: this.viewer!,
      interactiveManager: this.interactiveManager!,
      getPrimitiveById: (id) => renderer.getPrimitive ? renderer.getPrimitive(id) : null,
      onEvent: (eventType, data) => {
        const listeners = this.primitiveEventListeners.get(eventType);
        if (listeners) {
          listeners.forEach(listener => listener(data));
        }
      },
      pickTolerance: 5,
      doubleClickInterval: 300,
      dragSensitivity: 1.0,
      terrainConform: true
    };
    this.cesiumInteractive = new CesiumInteractive(interactiveConfig);
  }

  /**
   * 确保图元系统已初始化
   */
  private ensurePrimitiveSystemInitialized(): void {
    if (!this.isInitialized) {
      this.init();
    }
    
    if (!this.primitiveRenderer || !this.interactiveManager) {
      throw new Error('Advanced primitive system not initialized');
    }
  }
}