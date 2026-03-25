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

// 内部模块
import { CesiumPrimitiveRenderer, CesiumPrimitiveRendererConfig } from './CesiumPrimitiveRenderer';
import { CesiumInteractive, CesiumInteractiveConfig } from './CesiumInteractive';
import { SymbolLibrary } from '../../features/advanced-primitives/SymbolLibrary';
import { PrimitiveCatalog } from '../../features/advanced-primitives/PrimitiveCatalog';
import { InteractiveManager, InteractionOptions } from '../../features/advanced-primitives/InteractiveManager';

/**
 * Cesium 控制器配置
 */
export interface CesiumControllerConfig {
  // 基础配置
  cesiumToken?: string;
  terrainProvider?: any;
  imageryProvider?: any;
  
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

/**
 * Cesium 控制器实现
 */
export class CesiumController extends MapController {
  private viewer: Cesium.Viewer | null = null;
  private config: CesiumControllerConfig;
  
  // 高级图元系统
  private symbolLibrary: SymbolLibrary | null = null;
  private primitiveCatalog: PrimitiveCatalog | null = null;
  private interactiveManager: InteractiveManager | null = null;
  private primitiveRenderer: CesiumPrimitiveRenderer | null = null;
  private cesiumInteractive: CesiumInteractive | null = null;
  
  // 事件监听器
  private primitiveEventListeners = new Map<PrimitiveEventType, Set<(data: PrimitiveEventData) => void>>();
  private lineOfSightEventListeners = new Map<LineOfSightEventType, Set<(data: any) => void>>();
  
  // 状态
  private isInitialized = false;

  constructor(container: HTMLElement, options: MapOptions = {}, config: CesiumControllerConfig = {}) {
    super(container, options);
    this.config = config;
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
      console.log('CesiumController initialized successfully');
    } catch (error) {
      console.error('Failed to initialize CesiumController:', error);
      throw error;
    }
  }

  destroy(): void {
    // 清理高级图元系统
    if (this.cesiumInteractive) {
      this.cesiumInteractive.destroy();
      this.cesiumInteractive = null;
    }
    
    if (this.primitiveRenderer) {
      this.primitiveRenderer.destroy();
      this.primitiveRenderer = null;
    }
    
    if (this.interactiveManager) {
      this.interactiveManager.dispose();
      this.interactiveManager = null;
    }
    
    // 销毁 Cesium Viewer
    if (this.viewer) {
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
    
    try {
      return await this.primitiveRenderer!.createPrimitive(options);
    } catch (error) {
      console.error('Failed to create advanced primitive:', error);
      throw error;
    }
  }
  
  async updateAdvancedPrimitive(id: string, updates: PrimitiveUpdateOptions): Promise<void> {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      await this.primitiveRenderer!.updatePrimitive(id, updates);
    } catch (error) {
      console.error(`Failed to update advanced primitive ${id}:`, error);
      throw error;
    }
  }
  
  removeAdvancedPrimitive(id: string): void {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      this.primitiveRenderer!.removePrimitive(id);
    } catch (error) {
      console.error(`Failed to remove advanced primitive ${id}:`, error);
      throw error;
    }
  }
  
  getAdvancedPrimitive(id: string): AdvancedPrimitive | null {
    this.ensurePrimitiveSystemInitialized();
    
    try {
      return this.primitiveRenderer!.getPrimitive(id);
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
      
      return this.primitiveRenderer!.queryPrimitives(queryOptions);
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
   * 获取图元渲染器
   */
  getPrimitiveRenderer(): CesiumPrimitiveRenderer | null {
    return this.primitiveRenderer;
  }

  /**
   * 获取交互管理器
   */
  getInteractiveManager(): InteractiveManager | null {
    return this.interactiveManager;
  }

  // ========== 私有方法 ==========

  /**
   * 初始化高级图元系统
   */
  private initializeAdvancedPrimitiveSystem(): void {
    if (!this.viewer) {
      throw new Error('Cesium Viewer not initialized');
    }
    
    // 初始化符号库
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
    
    // 初始化图元渲染器
    const rendererConfig: CesiumPrimitiveRendererConfig = {
      viewer: this.viewer,
      symbolLibrary: this.symbolLibrary,
      primitiveCatalog: this.primitiveCatalog,
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
    
    // 初始化 Cesium 交互管理器
    const interactiveConfig: CesiumInteractiveConfig = {
      viewer: this.viewer,
      interactiveManager: this.interactiveManager,
      getPrimitiveById: (id) => this.primitiveRenderer!.getPrimitive(id),
      onEvent: (eventType, data) => {
        // 转发事件
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
    
    console.log('Advanced primitive system initialized');
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