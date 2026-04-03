/**
 * 高性能渲染器模块导出
 */

// 值导出（类、函数等）
export { TextureAtlasManager } from './TextureAtlasManager';
export { HighPerformancePrimitiveRenderer } from './HighPerformancePrimitiveRenderer';
export { MilitarySymbolShader } from './MilitarySymbolShader';
export { InstanceAttributeManager } from './InstanceAttributeManager';
export { SpatialIndexManager } from './SpatialIndexManager';

// 类型导出（接口、类型别名等）
export type { UVCoordinates, TextureAtlasConfig, TextureAtlasStats } from './TextureAtlasManager';
export type { HighPerformanceRendererConfig, PerformanceStats } from './HighPerformancePrimitiveRenderer';
export type { ShaderConfig, ShaderUniforms, ShaderAttributes } from './MilitarySymbolShader';
export type { InstanceAttribute, InstanceData, InstanceUpdate, BufferStats, InstanceAttributeManagerConfig } from './InstanceAttributeManager';
export type { SpatialIndexType, SpatialIndexConfig, SpatialNode, QueryResult, LodLevel, VisibleInstanceSet } from './SpatialIndexManager';

/**
 * 高性能渲染器工厂
 */
// 工厂类内部使用的导入
import type { HighPerformanceRendererConfig } from './HighPerformancePrimitiveRenderer';
import { HighPerformancePrimitiveRenderer } from './HighPerformancePrimitiveRenderer';
import { TextureAtlasManager } from './TextureAtlasManager';

export class HighPerformanceRendererFactory {
  /**
   * 创建完整的渲染器
   */
  static async createRenderer(
    viewer: any,
    config?: Partial<HighPerformanceRendererConfig>
  ): Promise<HighPerformancePrimitiveRenderer> {
    // 创建纹理图集管理器
    const textureAtlasManager = new TextureAtlasManager({
      atlasSize: config?.textureAtlasSize || 2048,
      symbolSize: config?.symbolSize || 64
    });
    
    await textureAtlasManager.initialize();
    
    // 创建高性能渲染器
    const renderer = new HighPerformancePrimitiveRenderer(
      viewer,
      textureAtlasManager,
      config
    );
    
    return renderer;
  }
  
  /**
   * 检查 WebGL 2.0 支持
   */
  static isWebGL2Supported(): boolean {
    if (typeof window === 'undefined') return false;
    
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  }
  
  /**
   * 检查实例化渲染支持
   */
  static isInstancingSupported(): boolean {
    if (typeof window === 'undefined') return false;
    
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    
    // 检查 WebGL 2.0 或 ANGLE_instanced_arrays 扩展
    const isWebGL2 = gl instanceof WebGL2RenderingContext;
    if (isWebGL2) return true;
    
    // WebGL 1.0 检查扩展
    const ext = gl.getExtension('ANGLE_instanced_arrays');
    return ext !== null;
  }
  
  /**
   * 获取性能基准
   */
  static getPerformanceBenchmark(): {
    maxInstances: number;
    recommendedBatchSize: number;
    textureSize: number;
  } {
    const isHighEnd = this.isHighEndGPU();
    
    return {
      maxInstances: isHighEnd ? 100000 : 50000,
      recommendedBatchSize: isHighEnd ? 1024 : 512,
      textureSize: isHighEnd ? 4096 : 2048
    };
  }
  
  /**
   * 检测是否为高端 GPU
   */
  private static isHighEndGPU(): boolean {
    if (typeof window === 'undefined') return false;
    
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      
      // 检查高端 GPU 关键词
      const highEndGPUs = [
        'nvidia', 'geforce', 'rtx', 'gtx',
        'radeon', 'rx', 'amd',
        'intel iris', 'intel hd graphics 6', 'intel hd graphics 7'
      ];
      
      const rendererLower = renderer.toLowerCase();
      return highEndGPUs.some(gpu => rendererLower.includes(gpu));
    }
    
    // 无法检测时假定为中端
    return false;
  }
}