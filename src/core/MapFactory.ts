import { MapController } from './MapController';
import { MapOptions } from '../types';

export type EngineType = 'openlayers' | 'cesium' | string;

export class MapFactory {
  static create(
    engine: EngineType,
    container: HTMLElement,
    options: MapOptions = {}
  ): MapController {
    switch (engine) {
      case 'openlayers':
        // 动态导入适配器
        const { OpenLayersController } = require('../adapters/openlayers');
        return new OpenLayersController(container, options);
      case 'cesium':
        const { CesiumController } = require('../adapters/cesium');
        return new CesiumController(container, options);
      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }
  }

  static async createAsync(
    engine: EngineType,
    container: HTMLElement,
    options: MapOptions = {}
  ): Promise<MapController> {
    switch (engine) {
      case 'openlayers':
        const { OpenLayersController } = await import('../adapters/openlayers');
        return new OpenLayersController(container, options);
      case 'cesium':
        const { CesiumController } = await import('../adapters/cesium');
        return new CesiumController(container, options);
      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }
  }
}