// 核心类导出
export { MapController } from './core/MapController';
export { MapFactory } from './core/MapFactory';
export type { EngineType } from './core/MapFactory';

// 适配器导出
export { OpenLayersController } from './adapters/openlayers';
export { CesiumController } from './adapters/cesium';
export { MovementTrailRouteManager } from './adapters/cesium/MovementTrailRouteManager';

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
  PrimitiveEventData,
  MovementConfig,
  TrailConfig,
  Waypoint,
  RouteConfig,
  RouteVisualizationConfig
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

// 工具类导出
export { SIDCValidator } from './utils/sidc-validator';
export {
  MilSIDC, GroundSymbols, AirSymbols, SeaSymbols,
  SymbolType, resolveSidc, identityFromSidc,
  SymbolTypeNames, symbolTypeDomain, SymbolTypeGroups
} from './utils/mil-symbols';