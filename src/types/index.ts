// 基础类型
export interface MapOptions {
  center?: [number, number];
  zoom?: number;
  projection?: string;
  // 其他通用选项
}

export interface LayerOptions {
  id: string;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
  // 其他通用图层选项
}

export interface Geometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'Circle' | 'Rectangle' | 'Ellipse';
  coordinates: any;
  properties?: Record<string, any>;
}

export interface DrawOptions {
  type: Geometry['type'];
  style?: StyleOptions;
  interactive?: boolean;
}

export interface StyleOptions {
  fill?: {
    color: string;
    opacity?: number;
  };
  stroke?: {
    color: string;
    width: number;
    opacity?: number;
  };
  text?: {
    content: string;
    font?: string;
    color?: string;
    offset?: [number, number];
  };
  image?: {
    src: string;
    scale?: number;
    rotation?: number;
  };
}

export interface MeasurementResult {
  length?: number;
  area?: number;
  unit: string;
}

export interface PlottingOptions {
  type: string;
  // 标绘特定选项
}

// 高级图元类型导出
export {
  MilitaryDomain,
  IdentityCode,
  StatusCode,
  CommandRelation,
  type SIDC,
  type PrimitiveBaseProperties,
  type InteractionConfig,
  type VisualizationConfig,
  type AdvancedPrimitive,
  type PrimitiveCreateOptions,
  type PrimitiveUpdateOptions,
  type PrimitiveQueryOptions,
  type PrimitiveDataPackage,
  type SymbolResourceConfig,
  PrimitiveEventType,
  type PrimitiveEventData,
  type MovementConfig,
  type TrailConfig,
  type Waypoint,
  type RouteConfig,
  type RouteVisualizationConfig
} from './primitive';

// 通视分析类型导出
export {
  ObstacleType,
  CalculationMode,
  ObstacleSourceType,
  type ObstacleSource,
  type LineOfSightOptions,
  type BlockingPoint,
  type ProfilePoint,
  type LineOfSightResult,
  type CalculationProgress,
  type PerformanceConfig,
  type EarthCorrectionConfig,
  RefractionModel,
  LineOfSightEventType,
  type LineOfSightManagerConfig
} from './line-of-sight';