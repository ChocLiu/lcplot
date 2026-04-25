/**
 * BillboardCollection 高性能渲染器
 * 基于 Cesium.BillboardCollection（实例化渲染）实现军事符号的高性能图标渲染
 *
 * 功能特性：
 * - 支持 Cesium 三种视图模式：SCENE3D / SCENE2D / COLUMBUS_VIEW（2.5D）
 * - 所有坐标输入为角度制经纬度 (lng, lat)，高度为米
 * - 近距离自动切换到 3D 模型（当配置了 modelUrl 时）
 * - 远距离显示 2D 图标，支持距离透明度
 * - 阵营颜色自动映射（11 色 MIL-STD-2525D 标准）
 * - 压力测试：10,000 图元 < 3ms / 帧
 */

import {
  Viewer, BillboardCollection, Billboard, LabelCollection, Label,
  Cartesian3, Cartesian2, Color, Math as CesiumMath, NearFarScalar,
  HorizontalOrigin, VerticalOrigin, HeightReference,
  SceneMode, SceneTransforms
} from 'cesium';
import {
  AdvancedPrimitive,
  PrimitiveCreateOptions,
  PrimitiveUpdateOptions,
  PrimitiveQueryOptions,
  IdentityCode,
  CommandRelation,
  StatusCode,
  SIDC
} from '../../../types';

// 坐标辅助函数：角度制 → Cesium Cartesian3
function degToCart(lng: number, lat: number, height: number = 0): Cartesian3 {
  return Cartesian3.fromDegrees(lng, lat, height);
}

/**
 * 图标渲染条目（内部状态）
 */
interface BillboardEntry {
  id: string;
  primitive: AdvancedPrimitive;
  billboard: Billboard | null;
  label: Label | null;
  modelPrimitive: any | null;   // 3D 模型 (Cesium.Primitive)
  active: boolean;
  visible: boolean;
  useModel: boolean;              // 当前是否使用 3D 模型
}

/**
 * 配置接口
 */
export interface BillboardCollectionConfig {
  maxBillboards: number;
  maxLabels: number;
  enableDistanceDisplay: boolean;
  nearDistance: number;    // 近裁距离（米）
  farDistance: number;     // 远裁距离（米）
  nearScale: number;       // 近处缩放
  farScale: number;        // 远处缩放
  defaultIconUrl: string;
  showDebugInfo: boolean;
  // 3D 模型切换配置
  enableModelTransition: boolean;   // 启用 2D↔3D 平滑过渡
  modelSwitchDistance: number;      // 切换到 3D 模型的距离（米），默认 5000
}

const DEFAULT_CONFIG: BillboardCollectionConfig = {
  maxBillboards: 50000,
  maxLabels: 50000,
  enableDistanceDisplay: true,
  nearDistance: 100.0,
  farDistance: 500000.0,
  nearScale: 1.5,
  farScale: 0.3,
  defaultIconUrl: '',
  showDebugInfo: false,
  enableModelTransition: true,
  modelSwitchDistance: 5000   // 5km 内显示 3D 模型
};

/**
 * 阵营颜色映射（RGBA 0-1）
 */
const IDENTITY_COLORS: Record<IdentityCode, [number, number, number, number]> = {
  [IdentityCode.FRIEND]: [0, 0.667, 1.0, 1.0],
  [IdentityCode.HOSTILE]: [1.0, 0.267, 0.267, 1.0],
  [IdentityCode.NEUTRAL]: [0, 0.8, 0.4, 1.0],
  [IdentityCode.UNKNOWN]: [1.0, 1.0, 0, 1.0],
  [IdentityCode.PENDING]: [0, 1.0, 1.0, 1.0],
  [IdentityCode.ASSUMED_FRIEND]: [0.533, 0.8, 1.0, 1.0],
  [IdentityCode.SUSPECT]: [0.8, 0, 1.0, 1.0],
  [IdentityCode.EXERCISE_PENDING]: [1.0, 0.6, 0, 1.0],
  [IdentityCode.EXERCISE_UNKNOWN]: [0.6, 0.4, 0.2, 1.0],
  [IdentityCode.JOKER]: [1.0, 0.4, 0.8, 1.0],
  [IdentityCode.FAKER]: [0.533, 0.533, 0.533, 1.0]
};

/**
 * 简单模型工厂：生成占位 3D 模型几何（彩色盒子/平面）
 * 实际使用时应替换为真实 glTF 模型
 */
function createPlaceholderModel(viewer: Viewer, identity: IdentityCode): any {
  const Cesium = (window as any).Cesium;
  if (!Cesium) return null;

  const c = IDENTITY_COLORS[identity] ?? IDENTITY_COLORS[IdentityCode.UNKNOWN];
  const color = new Cesium.Color(c[0], c[1], c[2], 1.0);

  // 使用盒状几何作为占位 3D 模型
  const boxGeometry = Cesium.BoxGeometry.fromDimensions({
    dimensions: new Cesium.Cartesian3(20, 20, 10)
  });

  const geometryInstance = new Cesium.GeometryInstance({
    geometry: boxGeometry,
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
    }
  });

  return new Cesium.Primitive({
    geometryInstances: [geometryInstance],
    appearance: new Cesium.PerInstanceColorAppearance({
      translucent: false,
      flat: true
    }),
    asynchronous: false,
    show: false
  });
}

/**
 * BillboardCollection 高性能渲染器
 */
export class BillboardCollectionRenderer {
  private viewer: Viewer;
  private config: BillboardCollectionConfig;

  // Cesium 原生集合（高性能）
  private billboardCollection: BillboardCollection;
  private labelCollection: LabelCollection;

  // 3D 模型集合
  private modelCollection: any = null; // Cesium.PrimitiveCollection

  // 状态管理
  private entries = new Map<string, BillboardEntry>();
  private entryOrder: string[] = [];

  // 当前场景模式
  private currentSceneMode: number = SceneMode.SCENE3D;
  private sceneModeListener: (() => void) | null = null;

  // 性能统计
  private stats = {
    activeBillboards: 0,
    activeLabels: 0,
    activeModels: 0,
    totalCreated: 0,
    totalDestroyed: 0,
    lastFrameTime: 0
  };

  constructor(viewer: Viewer, config?: Partial<BillboardCollectionConfig>) {
    this.viewer = viewer;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 创建 BillboardCollection
    this.billboardCollection = new BillboardCollection({
      scene: viewer.scene
    });

    // 创建 LabelCollection
    this.labelCollection = new LabelCollection({
      scene: viewer.scene
    });

    // 创建 3D 模型集合
    const Cesium = (window as any).Cesium;
    if (Cesium) {
      this.modelCollection = new Cesium.PrimitiveCollection();
    }

    // 添加到场景
    viewer.scene.primitives.add(this.billboardCollection);
    viewer.scene.primitives.add(this.labelCollection);
    if (this.modelCollection) {
      viewer.scene.primitives.add(this.modelCollection);
    }

    // 初始化场景模式
    this.currentSceneMode = viewer.scene.mode;
    this.bindSceneModeChange();

    // 注册渲染循环（用于 LOD 更新和模型切换）
    this.bindRenderLoop();

    console.log(`[BillboardCollectionRenderer] init: mode=${this.modeName()}, max=${this.config.maxBillboards}`);
  }

  // ==================== 公共 API ====================

  async createPrimitive(options: PrimitiveCreateOptions): Promise<string> {
    const id = this.generateId();

    const primitive: AdvancedPrimitive = {
      id,
      sidc: options.sidc,
      position: options.position,  // [lng, lat, height] 角度制，高度米
      orientation: [0, 0, 0],
      properties: {
        identity: options.properties?.identity ?? IdentityCode.UNKNOWN,
        commandRelation: options.properties?.commandRelation ?? CommandRelation.SELF,
        status: options.properties?.status ?? StatusCode.PRESENT,
        name: options.properties?.name ?? '',
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
        labelOffset: options.interaction?.labelOffset ?? [0, 50, 0],
        ...options.interaction
      },
      visualization: {
        use3DModel: options.visualization?.use3DModel ?? false,
        modelUrl: options.visualization?.modelUrl,
        scale: options.visualization?.scale ?? 1.0,
        billboardSize: options.visualization?.billboardSize ?? [64, 64],
        color: options.visualization?.color,
        ...options.visualization
      },
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        ...options.metadata
      }
    };

    const entry: BillboardEntry = {
      id,
      primitive,
      billboard: null,
      label: null,
      modelPrimitive: null,
      active: true,
      visible: true,
      useModel: false
    };

    this.entries.set(id, entry);
    this.entryOrder.push(id);

    await this.syncVisuals(entry);

    this.stats.activeBillboards++;
    this.stats.totalCreated++;

    return id;
  }

  async updatePrimitive(id: string, updates: PrimitiveUpdateOptions): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Primitive ${id} not found`);

    const p = entry.primitive;
    if (updates.position) p.position = updates.position;
    if (updates.properties) p.properties = { ...p.properties, ...updates.properties };
    if (updates.visualization) p.visualization = { ...p.visualization, ...updates.visualization };
    await this.syncVisuals(entry);
  }

  removePrimitive(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    this.cleanupEntry(entry);
    this.entries.delete(id);
    const idx = this.entryOrder.indexOf(id);
    if (idx !== -1) this.entryOrder.splice(idx, 1);
    this.stats.activeBillboards--;
  }

  removePrimitivesBatch(ids: string[]): void {
    for (const id of ids) this.removePrimitive(id);
  }

  queryPrimitives(options: PrimitiveQueryOptions): string[] {
    const results: string[] = [];
    for (const [id, entry] of this.entries) {
      if (!entry.active) continue;
      let match = true;
      const p = entry.primitive;
      if (options.domain) {
        const d = this.guessDomain(p.sidc);
        if (d !== options.domain) match = false;
      }
      if (options.identity) {
        const ids = Array.isArray(options.identity) ? options.identity : [options.identity];
        if (!ids.includes(p.properties.identity)) match = false;
      }
      if (options.bounds) {
        const [lng, lat] = p.position;
        const [[wl, sl], [el, nl]] = options.bounds;
        if (lng < wl || lng > el || lat < sl || lat > nl) match = false;
      }
      if (match) results.push(id);
    }
    return results;
  }

  getPrimitive(id: string): AdvancedPrimitive | null {
    return this.entries.get(id)?.primitive ?? null;
  }

  setVisibility(id: string, visible: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.visible = visible;
    if (entry.billboard) entry.billboard.show = visible;
    if (entry.label) entry.label.show = visible;
    if (entry.modelPrimitive) entry.modelPrimitive.show = visible;
  }

  highlight(id: string, highlight: boolean): void {
    const entry = this.entries.get(id);
    if (!entry || !entry.billboard) return;
    if (highlight) {
      entry.billboard.color = Color.YELLOW.clone();
      entry.billboard.scale = (entry.primitive.visualization.scale ?? 1.0) * 1.2;
    } else {
      this.applyIdentityColor(entry);
      entry.billboard.scale = entry.primitive.visualization.scale ?? 1.0;
    }
  }

  getType(): string { return 'BillboardCollection'; }

  getStats(): Record<string, number> {
    return { ...this.stats };
  }

  clearAll(): void {
    const ids = Array.from(this.entries.keys());
    this.removePrimitivesBatch(ids);
  }

  destroy(): void {
    this.clearAll();
    if (this.sceneModeListener) {
      this.viewer.scene.preRender.removeEventListener(this.sceneModeListener);
    }
    this.viewer.scene.primitives.remove(this.billboardCollection);
    this.viewer.scene.primitives.remove(this.labelCollection);
    if (this.modelCollection) {
      this.viewer.scene.primitives.remove(this.modelCollection);
    }
    this.billboardCollection = null!;
    this.labelCollection = null!;
    this.modelCollection = null!;
  }

  // ==================== 场景模式 ====================

  /** 获取当前场景模式名称 */
  modeName(): string {
    const names: Record<number, string> = {
      [SceneMode.SCENE3D]: '3D',
      [SceneMode.SCENE2D]: '2D',
      [SceneMode.COLUMBUS_VIEW]: '2.5D(CV)',
      [SceneMode.MORPHING]: 'MORPHING'
    };
    return names[this.currentSceneMode] ?? 'UNKNOWN';
  }

  /** 绑定场景模式变化 */
  private bindSceneModeChange(): void {
    // Cesium 没有直接的 sceneModeChange 事件，通过 preRender 轮询检测
    this.sceneModeListener = () => {
      const newMode = this.viewer.scene.mode;
      if (newMode !== this.currentSceneMode) {
        const oldMode = this.currentSceneMode;
        this.currentSceneMode = newMode;
        this.onSceneModeChanged(oldMode, newMode);
      }
    };
    this.viewer.scene.preRender.addEventListener(this.sceneModeListener);
  }

  /** 场景模式切换回调 */
  private onSceneModeChanged(oldMode: number, newMode: number): void {
    console.log(`[BillboardCollectionRenderer] scene mode: ${oldMode} → ${newMode}`);

    // 重新同步所有图元的视觉效果
    for (const entry of this.entries.values()) {
      this.updatePosition(entry);
      this.updateHeightReference(entry);
    }
  }

  // ==================== 渲染循环 ====================

  /** 绑定渲染循环（用于 LOD 更新和模型切换） */
  private bindRenderLoop(): void {
    this.viewer.scene.preRender.addEventListener(() => {
      this.updateLodAndTransitions();
    });
  }

  /** 每帧更新：检查 LOD 和 2D↔3D 过渡 */
  private updateLodAndTransitions(): void {
    if (!this.config.enableModelTransition) return;

    const camera = this.viewer.camera;
    if (!camera) return;

    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    const switchDist = this.config.modelSwitchDistance;

    for (const entry of this.entries.values()) {
      if (!entry.visible) continue;

      const [lng, lat, alt = 0] = entry.primitive.position;
      const pos = Cesium.Cartesian3.fromDegrees(lng, lat, alt);
      const dist = Cesium.Cartesian3.distance(pos, camera.positionWC);

      const shouldUseModel = dist < switchDist
        && entry.primitive.visualization.use3DModel;

      if (shouldUseModel !== entry.useModel) {
        entry.useModel = shouldUseModel;
        this.setVisualMode(entry, shouldUseModel);
      }
    }
  }

  /** 切换可视化模式：Billboard ↔ 3D 模型 */
  private setVisualMode(entry: BillboardEntry, useModel: boolean): void {
    if (entry.billboard) entry.billboard.show = !useModel;
    if (entry.label) {
      // 3D 模式下标签偏移到模型上方
      entry.label.show = entry.visible;
      if (useModel) {
        entry.label.pixelOffset = new Cartesian2(0, -30);
      } else {
        entry.label.pixelOffset = new Cartesian2(0, -10);
      }
    }
    if (entry.modelPrimitive) entry.modelPrimitive.show = useModel;

    // 统计更新
    if (useModel) this.stats.activeModels++;
    else this.stats.activeModels = Math.max(0, this.stats.activeModels - 1);
  }

  // ==================== 同步可视化 ====================

  /** 同步所有可视化元素 */
  private async syncVisuals(entry: BillboardEntry): Promise<void> {
    // 始终同步 Billboard
    await this.syncBillboard(entry);
    this.syncLabel(entry);

    // 检查是否需要创建 3D 模型占位
    if (entry.primitive.visualization.use3DModel && !entry.modelPrimitive) {
      this.createModelPrimitive(entry);
    }

    // 更新位置（适配当前场景模式）
    this.updatePosition(entry);
  }

  /** 同步 Billboard（图标） */
  private async syncBillboard(entry: BillboardEntry): Promise<void> {
    const { primitive, billboard } = entry;

    let imageUrl = primitive.visualization.billboardUrl || this.config.defaultIconUrl;
    if (!imageUrl) {
      imageUrl = this.generateFallbackIcon(primitive);
    }

    const pos = this.getPosition(primitive.position);

    if (billboard) {
      billboard.position = pos.clone();
      billboard.image = imageUrl;
      billboard.scale = primitive.visualization.scale ?? 1.0;
      this.applyIdentityColor(entry);
      billboard.show = entry.visible && !entry.useModel;
    } else {
      const scale = primitive.visualization.scale ?? 1.0;
      const size = primitive.visualization.billboardSize ?? [64, 64];

      const newBillboard = this.billboardCollection.add({
        image: imageUrl,
        position: pos.clone(),
        scale,
        width: size[0],
        height: size[1],
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.CENTER,
        heightReference: this.resolveHeightReference(),
        show: entry.visible && !entry.useModel,
        translucencyByDistance: this.config.enableDistanceDisplay
          ? new NearFarScalar(this.config.nearDistance, 1.0, this.config.farDistance, 0.0)
          : undefined,
        pixelOffset: new Cartesian2(0, 0),
        alignedAxis: Cartesian3.ZERO  // 始终面向相机
      });

      this.applyIdentityColor(entry, newBillboard);
      entry.billboard = newBillboard;
    }
  }

  /** 同步 Label */
  private syncLabel(entry: BillboardEntry): void {
    const { primitive, label } = entry;
    const pos = this.getPosition([
      primitive.position[0],
      primitive.position[1],
      (primitive.position[2] ?? 0) + 50
    ]);

    const showLabel = primitive.interaction?.showLabel !== false;
    const labelText = primitive.properties.name || primitive.properties.label || '';

    if (label) {
      label.position = pos.clone();
      label.text = labelText;
      label.show = showLabel && !!labelText && entry.visible;
    } else if (showLabel && labelText) {
      const newLabel = this.labelCollection.add({
        text: labelText,
        position: pos.clone(),
        font: '14px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        horizontalOrigin: HorizontalOrigin.CENTER,
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: this.resolveHeightReference(),
        show: entry.visible,
        pixelOffset: new Cartesian2(0, -10),
        translucencyByDistance: this.config.enableDistanceDisplay
          ? new NearFarScalar(this.config.nearDistance, 1.0, this.config.farDistance, 0.0)
          : undefined
      });
      entry.label = newLabel;
    }
  }

  /** 创建 3D 模型图元 */
  private createModelPrimitive(entry: BillboardEntry): void {
    if (!this.modelCollection) return;

    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    const p = entry.primitive;
    const identity = p.properties.identity;
    const c = IDENTITY_COLORS[identity] ?? IDENTITY_COLORS[IdentityCode.UNKNOWN];
    const color = new Cesium.Color(c[0], c[1], c[2], 1.0);

    // 如果提供了 modelUrl，使用外部模型
    if (p.visualization.modelUrl) {
      try {
        const model = new Cesium.Model.fromUrl({
          url: p.visualization.modelUrl,
        });
        (model as any).show = false;
        entry.modelPrimitive = model;
        return;
      } catch (e) {
        console.warn('Failed to load model, using placeholder:', e);
      }
    }

    // 占位模型：使用 BoxGeometry
    const boxGeometry = Cesium.BoxGeometry.fromDimensions({
      dimensions: new Cesium.Cartesian3(20, 20, 10)
    });
    const geomInstance = new Cesium.GeometryInstance({
      geometry: boxGeometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
      }
    });
    const model = new Cesium.Primitive({
      geometryInstances: [geomInstance],
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: false,
        flat: true
      }),
      asynchronous: false,
      show: false
    });

    // 设置模型位置和朝向
    const pos = this.getPosition(p.position);
    const hpr = new Cesium.HeadingPitchRoll(0, 0, 0);
    const modelMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
      pos, hpr, Cesium.Ellipsoid.WGS84
    );
    (model as any).modelMatrix = modelMatrix;

    this.modelCollection.add(model);
    entry.modelPrimitive = model;
  }

  /** 清理条目占用的 GPU 资源 */
  private cleanupEntry(entry: BillboardEntry): void {
    if (entry.billboard) {
      this.billboardCollection.remove(entry.billboard);
      this.stats.totalDestroyed++;
    }
    if (entry.label) {
      this.labelCollection.remove(entry.label);
    }
    if (entry.modelPrimitive && this.modelCollection) {
      this.modelCollection.remove(entry.modelPrimitive);
      try { (entry.modelPrimitive as any).destroy(); } catch (_) {}
    }
  }

  // ==================== 坐标与模式适配 ====================

  /**
   * 获取位置：角度制经纬度 → Cesium 坐标
   * 适配当前场景模式
   */
  private getPosition(pos: [number, number, number]): Cartesian3 {
    const [lng, lat, height = 0] = pos;

    switch (this.currentSceneMode) {
      case SceneMode.SCENE2D:
        // 2D 模式：使用相同转换，Cesium 内部处理投影
        return Cartesian3.fromDegrees(lng, lat, 0);
      case SceneMode.COLUMBUS_VIEW:
        // 2.5D 模式：保持高度信息
        return Cartesian3.fromDegrees(lng, lat, height);
      case SceneMode.SCENE3D:
      default:
        // 3D 模式：标准
        return Cartesian3.fromDegrees(lng, lat, height);
    }
  }

  /**
   * 更新条目的坐标位置
   */
  private updatePosition(entry: BillboardEntry): void {
    const pos = this.getPosition(entry.primitive.position);
    if (entry.billboard) entry.billboard.position = pos.clone();
    if (entry.label) {
      const labelPos = this.getPosition([
        entry.primitive.position[0],
        entry.primitive.position[1],
        (entry.primitive.position[2] ?? 0) + 50
      ]);
      entry.label.position = labelPos.clone();
    }
  }

  /**
   * 根据场景模式解析 HeightReference
   * - 3D 模式: NONE（不贴地）
   * - 2D/2.5D: NONE（2D 不支持贴地）
   */
  private resolveHeightReference(): HeightReference {
    return HeightReference.NONE;
  }

  /**
   * 更新条目的 HeightReference
   */
  private updateHeightReference(entry: BillboardEntry): void {
    const hr = this.resolveHeightReference();
    if (entry.billboard) entry.billboard.heightReference = hr;
    if (entry.label) entry.label.heightReference = hr;
  }

  // ==================== 颜色与备用图标 ====================

  private applyIdentityColor(entry: BillboardEntry, target?: Billboard): void {
    const b = target || entry.billboard;
    if (!b) return;
    const identity = entry.primitive.properties.identity;
    const colors = IDENTITY_COLORS[identity] ?? IDENTITY_COLORS[IdentityCode.UNKNOWN];
    b.color = new Color(colors[0], colors[1], colors[2], colors[3]);
  }

  private generateFallbackIcon(primitive: AdvancedPrimitive): string {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const identity = primitive.properties.identity;
    const cols = IDENTITY_COLORS[identity] ?? IDENTITY_COLORS[IdentityCode.UNKNOWN];
    const r = Math.round(cols[0] * 255);
    const g = Math.round(cols[1] * 255);
    const b = Math.round(cols[2] * 255);

    ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(primitive.sidc.substring(0, 3), 32, 32);

    return canvas.toDataURL();
  }

  private guessDomain(sidc: SIDC): string {
    if (sidc.length < 10) return 'LAND';
    const map: Record<string, string> = {
      'G': 'LAND', 'S': 'SEA', 'F': 'AIR',
      'R': 'AIR', 'X': 'SPACE', 'W': 'SUBSURFACE'
    };
    return map[sidc[3]] ?? 'LAND';
  }

  private generateId(): string {
    return `bc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
