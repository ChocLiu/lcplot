// 核心类导出
export { MapController } from './core/MapController';
export { MapFactory } from './core/MapFactory';
export type { EngineType } from './core/MapFactory';

// 适配器导出
export { OpenLayersController } from './adapters/openlayers';
export { CesiumController } from './adapters/cesium';

// 类型导出
export type {
  // 基础类型
  MapOptions,
  LayerOptions,
  Geometry,
  DrawOptions,
  StyleOptions,
  MeasurementResult,
  PlottingOptions
} from './types';

// 高级图元类型导出
export {
  MilitaryDomain,
  IdentityCode,
  StatusCode,
  CommandRelation,
  PrimitiveEventType
} from './types';

export type {
  SIDC,
  PrimitiveBaseProperties,
  InteractionConfig,
  VisualizationConfig,
  AdvancedPrimitive,
  PrimitiveCreateOptions,
  PrimitiveUpdateOptions,
  PrimitiveQueryOptions,
  PrimitiveDataPackage,
  SymbolResourceConfig,
  PrimitiveEventData
} from './types';

// 通视分析类型导出
export {
  ObstacleType,
  CalculationMode,
  ObstacleSourceType,
  RefractionModel,
  LineOfSightEventType
} from './types';

export type {
  ObstacleSource,
  LineOfSightOptions,
  BlockingPoint,
  ProfilePoint,
  LineOfSightResult,
  CalculationProgress,
  PerformanceConfig,
  EarthCorrectionConfig,
  LineOfSightManagerConfig
} from './types';