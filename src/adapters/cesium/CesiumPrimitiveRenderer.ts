/**
 * Cesium 高级图元渲染器
 * 负责在 Cesium 中渲染 MIL-STD-2525D 标准图元
 */

import { Viewer, Cartesian3, Color, BillboardCollection, Billboard, Entity, EntityCollection, HeightReference, Matrix4, Transforms, HeadingPitchRoll, Math as CesiumMath, ShadowMode } from 'cesium';
import {
  AdvancedPrimitive,
  PrimitiveCreateOptions,
  PrimitiveUpdateOptions,
  VisualizationConfig,
  IdentityCode,
  CommandRelation,
  StatusCode,
  SIDC,
  MilitaryDomain
} from '../../types';
import { SymbolLibrary } from '../../features/advanced-primitives/SymbolLibrary';
import { PrimitiveCatalog } from '../../features/advanced-primitives/PrimitiveCatalog';

/**
 * 图元渲染状态
 */
interface PrimitiveRenderState {
  entity: Entity | null;
  billboard: Billboard | null;
  labelEntity: Entity | null;
  modelEntity: Entity | null;
  lastUpdateTime: number;
  lastDistance?: number; // 用于LOD更新检查
}

/**
 * Cesium 图元渲染器配置
 */
export interface CesiumPrimitiveRendererConfig {
  viewer: Viewer;
  symbolLibrary: SymbolLibrary;
  primitiveCatalog: PrimitiveCatalog;
  
  // 渲染性能配置
  maxPrimitives?: number;
  lodDistances?: {
    billboardToModel: number;  // 切换为3D模型的距离
    hide: number;              // 完全隐藏的距离
  };
  
  // 默认样式
  defaultStyles?: {
    labelFont?: string;
    labelColor?: Color;
    labelBackgroundColor?: Color;
    highlightColor?: Color;
  };
}

/**
 * Cesium 高级图元渲染器
 */
export class CesiumPrimitiveRenderer {
  private viewer: Viewer;
  private symbolLibrary: SymbolLibrary;
  private primitiveCatalog: PrimitiveCatalog;
  
  // 图元存储
  private primitives = new Map<string, AdvancedPrimitive>();
  private renderStates = new Map<string, PrimitiveRenderState>();
  private primitiveCollection: EntityCollection;
  
  // 性能配置
  private maxPrimitives: number;
  private lodDistances: {
    billboardToModel: number;
    hide: number;
  };
  
  // 样式配置
  private defaultStyles: {
    labelFont: string;
    labelColor: Color;
    labelBackgroundColor: Color;
    highlightColor: Color;
  };
  
  // 阵营颜色映射
  private identityColors: Map<IdentityCode, Color> = new Map();
  
  // 性能优化
  private lastUpdateTime = 0;
  private updateInterval = 100; // 毫秒
  private needsUpdate = false;

  constructor(config: CesiumPrimitiveRendererConfig) {
    this.viewer = config.viewer;
    this.symbolLibrary = config.symbolLibrary;
    this.primitiveCatalog = config.primitiveCatalog;
    
    this.maxPrimitives = config.maxPrimitives || 10000;
    this.lodDistances = config.lodDistances || {
      billboardToModel: 5000,  // 5公里内显示3D模型
      hide: 100000             // 100公里外隐藏
    };
    
    this.defaultStyles = {
      labelFont: config.defaultStyles?.labelFont || '14px sans-serif',
      labelColor: config.defaultStyles?.labelColor || Color.WHITE,
      labelBackgroundColor: config.defaultStyles?.labelBackgroundColor || Color.BLACK.withAlpha(0.7),
      highlightColor: config.defaultStyles?.highlightColor || Color.YELLOW
    };
    
    // 初始化阵营颜色
    this.initializeIdentityColors();
    
    // 创建图元集合
    this.primitiveCollection = new EntityCollection();
    
    // 绑定渲染循环
    this.bindToRenderLoop();
  }

  /**
   * 创建图元
   */
  async createPrimitive(options: PrimitiveCreateOptions): Promise<string> {
    const primitive = this.createPrimitiveFromOptions(options);
    const primitiveId = primitive.id;
    
    // 检查数量限制
    if (this.primitives.size >= this.maxPrimitives) {
      console.warn(`Max primitives reached (${this.maxPrimitives}), removing oldest`);
      this.removeOldestPrimitive();
    }
    
    // 存储图元
    this.primitives.set(primitiveId, primitive);
    
    // 初始化渲染状态
    this.renderStates.set(primitiveId, {
      entity: null,
      billboard: null,
      labelEntity: null,
      modelEntity: null,
      lastUpdateTime: Date.now(),
      lastDistance: 0
    });
    
    // 渲染图元
    await this.renderPrimitive(primitiveId);
    
    // 标记需要更新
    this.needsUpdate = true;
    
    return primitiveId;
  }

  /**
   * 更新图元
   */
  async updatePrimitive(id: string, updates: PrimitiveUpdateOptions): Promise<void> {
    const primitive = this.primitives.get(id);
    if (!primitive) {
      throw new Error(`Primitive ${id} not found`);
    }
    
    // 合并更新
    const updatedPrimitive = this.mergePrimitiveUpdates(primitive, updates);
    this.primitives.set(id, updatedPrimitive);
    
    // 更新渲染
    await this.renderPrimitive(id);
    
    // 标记需要更新
    this.needsUpdate = true;
  }

  /**
   * 删除图元
   */
  removePrimitive(id: string): void {
    const renderState = this.renderStates.get(id);
    if (renderState) {
      // 清理所有实体
      if (renderState.entity) {
        this.viewer.entities.remove(renderState.entity);
      }
      if (renderState.labelEntity) {
        this.viewer.entities.remove(renderState.labelEntity);
      }
      if (renderState.modelEntity) {
        this.viewer.entities.remove(renderState.modelEntity);
      }
    }
    
    // 清理存储
    this.primitives.delete(id);
    this.renderStates.delete(id);
  }

  /**
   * 获取图元
   */
  getPrimitive(id: string): AdvancedPrimitive | null {
    return this.primitives.get(id) || null;
  }

  /**
   * 获取所有图元ID
   */
  getAllPrimitiveIds(): string[] {
    return Array.from(this.primitives.keys());
  }

  /**
   * 根据查询条件筛选图元
   */
  queryPrimitives(options: {
    domain?: MilitaryDomain;
    identity?: IdentityCode;
    bounds?: [[number, number], [number, number]];
  }): string[] {
    const result: string[] = [];
    
    for (const [id, primitive] of this.primitives) {
      let match = true;
      
      // 领域过滤
      if (options.domain) {
        // 根据SIDC推测领域
        const domain = this.guessDomainFromSidc(primitive.sidc);
        if (domain !== options.domain) {
          match = false;
        }
      }
      
      // 阵营过滤
      if (options.identity && primitive.properties.identity !== options.identity) {
        match = false;
      }
      
      // 空间范围过滤
      if (options.bounds) {
        const [lng, lat] = [primitive.position[0], primitive.position[1]];
        const [[minLng, minLat], [maxLng, maxLat]] = options.bounds;
        
        if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
          match = false;
        }
      }
      
      if (match) {
        result.push(id);
      }
    }
    
    return result;
  }

  /**
   * 设置图元可见性
   */
  setPrimitiveVisibility(id: string, visible: boolean): void {
    const primitive = this.primitives.get(id);
    const renderState = this.renderStates.get(id);
    
    if (!primitive || !renderState) return;
    
    if (renderState.entity) {
      renderState.entity.show = visible;
    }
    if (renderState.labelEntity) {
      renderState.labelEntity.show = visible && primitive.interaction.showLabel;
    }
    if (renderState.modelEntity) {
      renderState.modelEntity.show = visible;
    }
  }

  /**
   * 高亮图元
   */
  highlightPrimitive(id: string, highlight: boolean): void {
    const renderState = this.renderStates.get(id);
    if (!renderState || !renderState.entity) return;
    
    // 暂时简单实现：修改图标颜色
    // 实际应该保存原始颜色，高亮时改变
    console.log(`Highlight primitive ${id}: ${highlight}`);
  }

  /**
   * 清理所有图元
   */
  clearAll(): void {
    const ids = Array.from(this.primitives.keys());
    ids.forEach(id => this.removePrimitive(id));
  }

  /**
   * 销毁渲染器
   */
  destroy(): void {
    this.clearAll();
    // 清理其他资源
  }

  /**
   * 私有方法
   */

  /**
   * 从选项创建图元对象
   */
  private createPrimitiveFromOptions(options: PrimitiveCreateOptions): AdvancedPrimitive {
    const id = `primitive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 获取默认属性
    const defaultProperties = this.primitiveCatalog.getDefaultProperties(options.sidc);
    
    return {
      id,
      sidc: options.sidc,
      position: options.position,
      orientation: [0, 0, 0],
      properties: {
        identity: options.properties?.identity || IdentityCode.UNKNOWN,
        commandRelation: options.properties?.commandRelation || CommandRelation.SELF,
        status: options.properties?.status || StatusCode.PRESENT,
        name: options.properties?.name || '',
        strength: options.properties?.strength,
        equipment: options.properties?.equipment || [],
        ...defaultProperties,
        ...options.properties
      },
      interaction: {
        selectable: options.interaction?.selectable ?? true,
        draggable: options.interaction?.draggable ?? false,
        labelDraggable: options.interaction?.labelDraggable ?? true,
        editable: options.interaction?.editable ?? true,
        showLabel: options.interaction?.showLabel ?? true,
        showInfoCard: options.interaction?.showInfoCard ?? true,
        highlightOnHover: options.interaction?.highlightOnHover ?? true,
        labelOffset: options.interaction?.labelOffset || [0, 50, 0],
        labelMaxWidth: options.interaction?.labelMaxWidth,
        labelFont: options.interaction?.labelFont,
        labelColor: options.interaction?.labelColor
      },
      visualization: {
        use3DModel: options.visualization?.use3DModel ?? false,
        modelUrl: options.visualization?.modelUrl,
        billboardUrl: options.visualization?.billboardUrl,
        scale: options.visualization?.scale ?? 1.0,
        billboardSize: options.visualization?.billboardSize || [64, 64],
        modelScale: options.visualization?.modelScale || [1, 1, 1],
        color: options.visualization?.color,
        highlightColor: options.visualization?.highlightColor || this.defaultStyles.highlightColor.toCssColorString(),
        labelBackgroundColor: options.visualization?.labelBackgroundColor || this.defaultStyles.labelBackgroundColor.toCssColorString(),
        showShadow: options.visualization?.showShadow ?? true,
        depthTest: options.visualization?.depthTest ?? true,
        blending: options.visualization?.blending || 'opaque',
        lodDistances: options.visualization?.lodDistances || {
          billboard: this.lodDistances.billboardToModel,
          hide: this.lodDistances.hide
        }
      },
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ...options.metadata
      }
    };
  }

  /**
   * 合并图元更新
   */
  private mergePrimitiveUpdates(
    primitive: AdvancedPrimitive,
    updates: PrimitiveUpdateOptions
  ): AdvancedPrimitive {
    const merged = { ...primitive };
    
    if (updates.position) {
      merged.position = updates.position;
    }
    
    if (updates.orientation) {
      merged.orientation = updates.orientation;
    }
    
    if (updates.properties) {
      merged.properties = { ...merged.properties, ...updates.properties };
    }
    
    if (updates.interaction) {
      merged.interaction = { ...merged.interaction, ...updates.interaction };
    }
    
    if (updates.visualization) {
      merged.visualization = { ...merged.visualization, ...updates.visualization };
    }
    
    if (merged.metadata) {
      merged.metadata.updated = new Date().toISOString();
    } else {
      merged.metadata = {
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
    }
    
    return merged;
  }

  /**
   * 渲染图元
   */
  private async renderPrimitive(id: string): Promise<void> {
    const primitive = this.primitives.get(id);
    const renderState = this.renderStates.get(id);
    
    if (!primitive || !renderState) return;
    
    // 清理旧实体
    if (renderState.entity) {
      this.viewer.entities.remove(renderState.entity);
    }
    if (renderState.labelEntity) {
      this.viewer.entities.remove(renderState.labelEntity);
    }
    if (renderState.modelEntity) {
      this.viewer.entities.remove(renderState.modelEntity);
    }
    
    // 计算距离以确定LOD
    const cameraPosition = this.viewer.camera.positionWC;
    const primitivePosition = Cartesian3.fromDegrees(
      primitive.position[0],
      primitive.position[1],
      primitive.position[2]
    );
    const distance = Cartesian3.distance(cameraPosition, primitivePosition);
    
    // 根据LOD决定渲染方式
    const hideDistance = primitive.visualization.lodDistances?.hide ?? 100000;
    if (distance > hideDistance) {
      // 超出隐藏距离，不渲染
      return;
    }
    
    // 创建主实体
    renderState.entity = await this.createPrimitiveEntity(primitive, distance);
    if (renderState.entity) {
      this.viewer.entities.add(renderState.entity);
    }
    
    // 创建标签实体（如果需要）
    if (primitive.interaction.showLabel && primitive.properties.name) {
      renderState.labelEntity = this.createLabelEntity(primitive);
      if (renderState.labelEntity) {
        this.viewer.entities.add(renderState.labelEntity);
      }
    }
    
    // 创建3D模型实体（如果需要且距离合适）
    if (primitive.visualization.use3DModel && 
        primitive.visualization.modelUrl &&
        distance < (primitive.visualization.lodDistances?.billboard || 5000)) {
      renderState.modelEntity = await this.createModelEntity(primitive);
      if (renderState.modelEntity) {
        this.viewer.entities.add(renderState.modelEntity);
        
        // 隐藏2D图标
        if (renderState.entity) {
          renderState.entity.show = false;
        }
      }
    }
    
    renderState.lastUpdateTime = Date.now();
  }

  /**
   * 创建图元实体（2D图标）
   */
  private async createPrimitiveEntity(
    primitive: AdvancedPrimitive,
    distance: number
  ): Promise<Entity | null> {
    try {
      // 加载图标
      let imageUrl: string;
      
      if (primitive.visualization.billboardUrl) {
        // 使用自定义图标
        imageUrl = primitive.visualization.billboardUrl;
      } else {
        // 使用SIDC对应图标
        const image = await this.symbolLibrary.loadSymbol(primitive.sidc);
        imageUrl = image.src;
      }
      
      // 根据距离调整尺寸
      const baseSize = primitive.visualization.billboardSize || [64, 64];
      const scale = this.calculateLodScale(distance, primitive);
      
      // 获取颜色
      const colorValue = primitive.visualization.color || 
                        this.identityColors.get(primitive.properties.identity) || 
                        Color.WHITE;
      // 确保color是Color对象
      const color = typeof colorValue === 'string' 
        ? Color.fromCssColorString(colorValue)
        : colorValue;
      
      const entity = new Entity({
        id: primitive.id,
        position: Cartesian3.fromDegrees(
          primitive.position[0],
          primitive.position[1],
          primitive.position[2]
        ),
        billboard: {
          image: imageUrl,
          color: color,
          scale: scale,
          width: baseSize[0],
          height: baseSize[1],
          heightReference: HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: 1, // BOTTOM
          disableDepthTestDistance: primitive.visualization.depthTest ? undefined : Number.POSITIVE_INFINITY
        },
        properties: {
          primitiveId: primitive.id,
          sidc: primitive.sidc,
          ...primitive.properties
        }
      });
      
      return entity;
    } catch (error) {
      console.error(`Failed to create primitive entity for ${primitive.id}:`, error);
      return null;
    }
  }

  /**
   * 创建标签实体
   */
  private createLabelEntity(primitive: AdvancedPrimitive): Entity | null {
    if (!primitive.properties.name) return null;
    
    const [lng, lat, height] = primitive.position;
    const [offsetX, offsetY, offsetZ] = primitive.interaction.labelOffset;
    
    // 计算标签位置
    const labelPosition = Cartesian3.fromDegrees(
      lng,
      lat,
      height + offsetZ
    );
    
    const entity = new Entity({
      id: `${primitive.id}_label`,
      position: labelPosition,
      label: {
        text: primitive.properties.name,
        font: primitive.interaction.labelFont || this.defaultStyles.labelFont,
        fillColor: primitive.interaction.labelColor 
          ? Color.fromCssColorString(primitive.interaction.labelColor)
          : this.defaultStyles.labelColor,
        backgroundColor: Color.fromCssColorString(
          primitive.visualization.labelBackgroundColor || 
          this.defaultStyles.labelBackgroundColor.toCssColorString()
        ),
        pixelOffset: new Cartesian3(offsetX, offsetY),
        showBackground: true,
        scale: 1.0,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      properties: {
        primitiveId: primitive.id,
        isLabel: true
      }
    });
    
    return entity;
  }

  /**
   * 创建3D模型实体
   */
  private async createModelEntity(primitive: AdvancedPrimitive): Promise<Entity | null> {
    if (!primitive.visualization.modelUrl) return null;
    
    try {
      const [lng, lat, height] = primitive.position;
      const [yaw, pitch, roll] = primitive.orientation || [0, 0, 0];
      const [scaleX, scaleY, scaleZ] = primitive.visualization.modelScale || [1, 1, 1];
      
      const entity = new Entity({
        id: `${primitive.id}_model`,
        position: Cartesian3.fromDegrees(lng, lat, height),
        orientation: Transforms.headingPitchRollQuaternion(
          Cartesian3.fromDegrees(lng, lat, height),
          new HeadingPitchRoll(
            CesiumMath.toRadians(yaw),
            CesiumMath.toRadians(pitch),
            CesiumMath.toRadians(roll)
          )
        ),
        model: {
          uri: primitive.visualization.modelUrl,
          scale: primitive.visualization.scale || 1.0,
          minimumPixelSize: 64,
          maximumScale: 1000,
          show: true,
          shadows: primitive.visualization.showShadow ? ShadowMode.ENABLED : ShadowMode.DISABLED
        },
        properties: {
          primitiveId: primitive.id,
          isModel: true
        }
      });
      
      return entity;
    } catch (error) {
      console.error(`Failed to create model entity for ${primitive.id}:`, error);
      return null;
    }
  }

  /**
   * 计算LOD缩放比例
   */
  private calculateLodScale(distance: number, primitive: AdvancedPrimitive): number {
    const maxDistance = primitive.visualization.lodDistances?.hide || 100000;
    const minScale = 0.3;
    const maxScale = 2.0;
    
    // 距离越远，缩放越小（但不能小于minScale）
    const t = Math.max(0, Math.min(1, distance / maxDistance));
    const scale = minScale + (maxScale - minScale) * (1 - t);
    
    return scale * (primitive.visualization.scale || 1.0);
  }

  /**
   * 初始化阵营颜色
   */
  private initializeIdentityColors(): void {
    // 标准MIL-STD-2525D颜色
    this.identityColors.set(IdentityCode.FRIEND, Color.fromBytes(0, 170, 255));     // #00AAFF
    this.identityColors.set(IdentityCode.HOSTILE, Color.fromBytes(255, 68, 68));    // #FF4444
    this.identityColors.set(IdentityCode.NEUTRAL, Color.fromBytes(0, 204, 102));    // #00CC66
    this.identityColors.set(IdentityCode.UNKNOWN, Color.fromBytes(255, 255, 0));    // #FFFF00
    this.identityColors.set(IdentityCode.PENDING, Color.fromBytes(0, 255, 255));    // #00FFFF
    this.identityColors.set(IdentityCode.ASSUMED_FRIEND, Color.fromBytes(136, 204, 255)); // #88CCFF
    this.identityColors.set(IdentityCode.SUSPECT, Color.fromBytes(204, 0, 255));    // #CC00FF
    this.identityColors.set(IdentityCode.EXERCISE_PENDING, Color.fromBytes(255, 153, 0)); // #FF9900
    this.identityColors.set(IdentityCode.EXERCISE_UNKNOWN, Color.fromBytes(153, 102, 51)); // #996633
    this.identityColors.set(IdentityCode.JOKER, Color.fromBytes(255, 102, 204));    // #FF66CC
    this.identityColors.set(IdentityCode.FAKER, Color.fromBytes(136, 136, 136));    // #888888
  }

  /**
   * 根据SIDC推测领域
   */
  private guessDomainFromSidc(sidc: SIDC): MilitaryDomain {
    if (sidc.length < 10) return MilitaryDomain.LAND;
    
    const domainChar = sidc[3]; // 第4位是领域标识
    
    switch (domainChar) {
      case 'G': return MilitaryDomain.LAND;
      case 'S': return MilitaryDomain.SEA;
      case 'F': return MilitaryDomain.AIR;
      case 'R': return MilitaryDomain.AIR;
      case 'X': return MilitaryDomain.SPACE;
      case 'W': return MilitaryDomain.SUBSURFACE;
      case 'I': return MilitaryDomain.SIGNAL;
      case 'C': return MilitaryDomain.CYBER;
      case 'A': return MilitaryDomain.ACTIVITY;
      default: return MilitaryDomain.LAND;
    }
  }

  /**
   * 绑定到渲染循环
   */
  private bindToRenderLoop(): void {
    this.viewer.scene.preRender.addEventListener(() => {
      this.updateRenderLoop();
    });
  }

  /**
   * 更新渲染循环
   */
  private updateRenderLoop(): void {
    const now = Date.now();
    
    // 限制更新频率
    if (now - this.lastUpdateTime < this.updateInterval && !this.needsUpdate) {
      return;
    }
    
    this.lastUpdateTime = now;
    this.needsUpdate = false;
    
    // 更新所有图元的LOD
    this.updateAllPrimitivesLod();
  }

  /**
   * 更新所有图元的LOD
   */
  private updateAllPrimitivesLod(): void {
    const cameraPosition = this.viewer.camera.positionWC;
    
    for (const [id, primitive] of this.primitives) {
      const renderState = this.renderStates.get(id);
      if (!primitive || !renderState) continue;
      
      // 计算距离
      const primitivePosition = Cartesian3.fromDegrees(
        primitive.position[0],
        primitive.position[1],
        primitive.position[2]
      );
      const distance = Cartesian3.distance(cameraPosition, primitivePosition);
      
      // 检查是否需要更新LOD
      const shouldUpdate = this.shouldUpdateLod(id, distance);
      if (shouldUpdate) {
        this.renderPrimitive(id);
      }
    }
  }

  /**
   * 检查是否需要更新LOD
   */
  private shouldUpdateLod(id: string, currentDistance: number): boolean {
    const primitive = this.primitives.get(id);
    const renderState = this.renderStates.get(id);
    
    if (!primitive || !renderState) return false;
    
    const lodDistances = primitive.visualization.lodDistances;
    if (!lodDistances) return false;
    
    // 检查是否跨越了LOD阈值
    const lastDistance = renderState.lastDistance || 0;
    const threshold = lodDistances.billboard * 0.1; // 10%的阈值避免抖动
    
    if (Math.abs(currentDistance - lastDistance) > threshold) {
      // 更新记录的距离
      renderState.lastDistance = currentDistance;
      return true;
    }
    
    return false;
  }

  /**
   * 移除最旧的图元
   */
  private removeOldestPrimitive(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    
    for (const [id, renderState] of this.renderStates) {
      if (renderState.lastUpdateTime < oldestTime) {
        oldestTime = renderState.lastUpdateTime;
        oldestId = id;
      }
    }
    
    if (oldestId) {
      this.removePrimitive(oldestId);
    }
  }
}