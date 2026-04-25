/**
 * MovementTrailRouteManager
 *
 * 管理图元的平滑移动、轨迹绘制、预设路线可视化。
 * 所有渲染使用 Cesium Primitive API（非 Entity API）。
 *
 * ## 功能
 * 1. 平滑移动 (Smooth Movement)：在多个位置间插值过渡，支持缓动
 * 2. 轨迹 (Trails)：存储位置历史，渲染为渐变折线
 * 3. 预设路线 (Route)：路径点 + 方向移动虚线 + 半透明管道（Pipe）
 */

import type {
  MovementConfig,
  TrailConfig,
  RouteConfig,
  Waypoint,
  RouteVisualizationConfig
} from '../../types/primitive';

// Cesium 类型声明 (运行时通过 getCesium 获取)
declare const Cesium: any;

/**
 * 获取 Cesium 对象（与 index.ts 保持一致）
 */
function getCesium(): any {
  // 如果模块导入的 Cesium 可用，使用模块导入
  if (typeof Cesium !== 'undefined' && (Cesium as any).Viewer) {
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
  throw new Error('Cesium library not found. Make sure Cesium is loaded before using MovementTrailRouteManager.');
}

// ==================== 内部状态类型 ====================

interface MovementState {
  enabled: boolean;
  durationMs: number;
  interpolation: 'linear' | 'lerp';
  easingFunction?: (t: number) => number;
  startTime: number;
  startPos: [number, number, number];
  endPos: [number, number, number];
  animating: boolean;
  rafId: number | null;
}

interface TrailState {
  enabled: boolean;
  config: TrailConfig;
  positions: [number, number, number][];
  primitive: any | null;  // Cesium.PolylineGeometry + Primitive
}

interface RouteState {
  enabled: boolean;
  active: boolean;
  config: RouteConfig;
  waypointPrimitives: any[];  // Cesium billboard primitives
  dashPolyline: any | null;   // animated dashed polyline primitive
  pipePrimitive: any | null;  // extruded corridor primitive
  dashAnimationId: number | null;
}

interface PrimitiveMovementState {
  movement?: MovementState;
  trail?: TrailState;
  route?: RouteState;
}

const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  enabled: false,
  durationMs: 1000,
  interpolation: 'linear'
};

const DEFAULT_TRAIL_CONFIG: TrailConfig = {
  enabled: false,
  maxPoints: 100,
  color: '#00FF88',
  width: 2,
  fadeDuration: 5000,
  opacity: 0.8
};

const DEFAULT_ROUTE_VIS: RouteVisualizationConfig = {
  enabled: true,
  dashColor: '#00AAFF',
  dashWidth: 3,
  dashLength: 16,
  dashSpeed: 100,
  showPipe: true,
  pipeWidth: 50,
  pipeHeight: 20,
  pipeColor: '#00AAFF',
  pipeOpacity: 0.2,
  showWaypoints: true,
  waypointColor: '#00AAFF',
  waypointSize: 12
};

/**
 * 平滑移动、轨迹、路线管理器
 */
export class MovementTrailRouteManager {
  private viewer: any;   // Cesium.Viewer
  private scene: any;    // Cesium.Scene
  private cesium: any;
  private states = new Map<string, PrimitiveMovementState>();

  constructor(viewer: any) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.cesium = getCesium();
  }

  destroy(): void {
    // 清理所有状态
    for (const [id] of this.states) {
      this.stopSmoothMove(id);
      this.clearTrail(id);
      this.clearRoute(id);
    }
    this.states.clear();
  }

  // ==================== 公共 API ====================

  /**
   * 开始平滑移动
   * @param id 图元 ID
   * @param targetPos 目标位置 [经度, 纬度, 高度]
   * @param config 移动配置（可选，默认使用已有配置）
   */
  startSmoothMove(
    id: string,
    targetPos: [number, number, number],
    config?: Partial<MovementConfig>
  ): void {
    let state = this.states.get(id);
    if (!state) {
      state = {};
      this.states.set(id, state);
    }

    // 停止已有动画
    if (state.movement && state.movement.rafId !== null) {
      this.stopSmoothMove(id);
    }

    const mergedConfig: MovementConfig = {
      ...DEFAULT_MOVEMENT_CONFIG,
      ...config
    };

    state.movement = {
      enabled: true,
      durationMs: mergedConfig.durationMs,
      interpolation: mergedConfig.interpolation || 'linear',
      easingFunction: mergedConfig.easingFunction,
      startTime: performance.now(),
      startPos: state.movement?.endPos || [0, 0, 0],
      endPos: targetPos,
      animating: true,
      rafId: null
    };

    // 开始动画帧
    state.movement.rafId = requestAnimationFrame((time) => {
      this.animateMovement(id, time);
    });

    // 如果启用了轨迹，记录起始点
    if (state.trail && state.trail.enabled) {
      this.addTrailPoint(id, state.movement.startPos);
    }
  }

  /**
   * 停止平滑移动
   */
  stopSmoothMove(id: string): void {
    const state = this.states.get(id);
    if (!state || !state.movement) return;

    if (state.movement.rafId !== null) {
      cancelAnimationFrame(state.movement.rafId);
    }
    state.movement.animating = false;
    state.movement.rafId = null;
  }

  /**
   * 设置轨迹（启用/禁用）
   */
  setTrail(id: string, enabled: boolean, config?: Partial<TrailConfig>): void {
    let state = this.states.get(id);
    if (!state) {
      state = {};
      this.states.set(id, state);
    }

    if (enabled) {
      const mergedConfig: TrailConfig = {
        ...DEFAULT_TRAIL_CONFIG,
        ...config
      };

      state.trail = {
        enabled: true,
        config: mergedConfig,
        positions: [],
        primitive: null
      };
    } else {
      this.clearTrail(id);
    }
  }

  /**
   * 添加轨迹点
   */
  addTrailPoint(id: string, position: [number, number, number]): void {
    const state = this.states.get(id);
    if (!state || !state.trail || !state.trail.enabled) return;

    const trail = state.trail;
    trail.positions.push([...position]);

    // 限制点数
    if (trail.positions.length > trail.config.maxPoints) {
      trail.positions.shift();
    }

    // 重建轨迹渲染
    this.rebuildTrailPrimitive(id);
  }

  /**
   * 清除轨迹
   */
  clearTrail(id: string): void {
    const state = this.states.get(id);
    if (!state || !state.trail) return;

    // 移除 Cesium primitive
    if (state.trail.primitive) {
      this.scene.primitives.remove(state.trail.primitive);
      state.trail.primitive = null;
    }
    state.trail.positions = [];
    state.trail.enabled = false;
  }

  /**
   * 设置预设路线
   */
  setRoute(id: string, route: RouteConfig): void {
    let state = this.states.get(id);
    if (!state) {
      state = {};
      this.states.set(id, state);
    }

    // 清除旧路线
    if (state.route) {
      this.clearRoute(id);
    }

    const vis: RouteVisualizationConfig = {
      ...DEFAULT_ROUTE_VIS,
      ...route.visualization
    };

    state.route = {
      enabled: true,
      active: true,
      config: route,
      waypointPrimitives: [],
      dashPolyline: null,
      pipePrimitive: null,
      dashAnimationId: null
    };

    // 渲染路径点
    if (vis.showWaypoints && route.waypoints.length > 0) {
      this.renderWaypoints(id, route.waypoints, vis);
    }

    // 渲染虚线路径（带方向移动动画）
    if (route.waypoints.length >= 2) {
      this.renderDashPolyline(id, route.waypoints, vis);
      this.renderPipe(id, route.waypoints, vis);
    }
  }

  /**
   * 清除预设路线
   */
  clearRoute(id: string): void {
    const state = this.states.get(id);
    if (!state || !state.route) return;

    const route = state.route;

    // 移除路径点
    for (const p of route.waypointPrimitives) {
      this.scene.primitives.remove(p);
    }
    route.waypointPrimitives = [];

    // 移除虚线
    if (route.dashPolyline) {
      this.scene.primitives.remove(route.dashPolyline);
      route.dashPolyline = null;
    }

    // 移除管道
    if (route.pipePrimitive) {
      this.scene.primitives.remove(route.pipePrimitive);
      route.pipePrimitive = null;
    }

    // 取消虚线动画
    if (route.dashAnimationId !== null) {
      cancelAnimationFrame(route.dashAnimationId);
      route.dashAnimationId = null;
    }

    route.active = false;
  }

  /**
   * 获取当前位置（用于更新图元位置回调）
   */
  getCurrentPosition(id: string): [number, number, number] | null {
    const state = this.states.get(id);
    if (!state || !state.movement) return null;

    // 如果没有动画，返回上次的目标位置
    if (!state.movement.animating) {
      return state.movement.endPos || null;
    }

    // 计算当前插值位置
    const Cesium = this.cesium;
    const m = state.movement;
    const elapsed = performance.now() - m.startTime;
    const t = Math.min(elapsed / m.durationMs, 1);
    const easedT = m.easingFunction ? m.easingFunction(t) : t;

    const startCart = Cesium.Cartesian3.fromDegrees(m.startPos[0], m.startPos[1], m.startPos[2]);
    const endCart = Cesium.Cartesian3.fromDegrees(m.endPos[0], m.endPos[1], m.endPos[2]);

    const result = new Cesium.Cartesian3();
    Cesium.Cartesian3.lerp(startCart, endCart, easedT, result);

    const cartographic = Cesium.Cartographic.fromCartesian(result);
    return [
      Cesium.Math.toDegrees(cartographic.longitude),
      Cesium.Math.toDegrees(cartographic.latitude),
      cartographic.height
    ];
  }

  // ==================== 内部方法 ====================

  /**
   * 动画循环：在每帧插值更新位置
   */
  private animateMovement(id: string, now: number): void {
    const state = this.states.get(id);
    if (!state || !state.movement || !state.movement.animating) return;

    const m = state.movement;
    const elapsed = now - m.startTime;
    const t = Math.min(elapsed / m.durationMs, 1);

    if (t >= 1) {
      // 移动完成
      m.animating = false;
      m.rafId = null;
      m.startPos = [...m.endPos];

      // 记录轨迹终点
      if (state.trail && state.trail.enabled) {
        this.addTrailPoint(id, m.endPos);
      }

      // 触发完成事件（通过 viewer）
      this.viewer.clock?.onTick?.(() => {});
      return;
    }

    const easedT = m.easingFunction ? m.easingFunction(t) : t;

    // 计算插值位置
    const Cesium = this.cesium;
    const startCart = Cesium.Cartesian3.fromDegrees(m.startPos[0], m.startPos[1], m.startPos[2]);
    const endCart = Cesium.Cartesian3.fromDegrees(m.endPos[0], m.endPos[1], m.endPos[2]);

    const result = new Cesium.Cartesian3();
    Cesium.Cartesian3.lerp(startCart, endCart, easedT, result);
    const cartographic = Cesium.Cartographic.fromCartesian(result);

    const currentPos: [number, number, number] = [
      Cesium.Math.toDegrees(cartographic.longitude),
      Cesium.Math.toDegrees(cartographic.latitude),
      cartographic.height
    ];

    // 记录轨迹（每 N 帧记录一次，避免过于密集）
    if (state.trail && state.trail.enabled) {
      // 每帧记录，由 maxPoints 限制长度
      this.addTrailPoint(id, currentPos);
    }

    // 继续下一帧
    m.rafId = requestAnimationFrame((time) => {
      this.animateMovement(id, time);
    });
  }

  /**
   * 重建轨迹折线 Primitive
   */
  private rebuildTrailPrimitive(id: string): void {
    const state = this.states.get(id);
    if (!state || !state.trail) return;

    const Cesium = this.cesium;
    const trail = state.trail;

    if (trail.positions.length < 2) return;

    // 移除旧 primitive
    if (trail.primitive) {
      this.scene.primitives.remove(trail.primitive);
    }

    // 构造 Cartesian3 数组
    const positions = trail.positions.map(p =>
      Cesium.Cartesian3.fromDegrees(p[0], p[1], p[2])
    );

    // 使用 PolylineGeometry 渲染轨迹（渐变透明尾迹效果）
    const geometry = new Cesium.PolylineGeometry({
      positions: positions,
      width: trail.config.width || 2,
      vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT
    });

    const instance = new Cesium.GeometryInstance({
      geometry: geometry,
      attributes: {
        // 使用顶点颜色实现渐变效果（从起点到终点透明度渐变）
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromCssColorString(trail.config.color || '#00FF88').withAlpha(trail.config.opacity || 0.8)
        )
      }
    });

    const primitive = new Cesium.Primitive({
      geometryInstances: instance,
      appearance: new Cesium.PolylineColorAppearance({
        translucent: true
      }),
      asynchronous: false
    });

    this.scene.primitives.add(primitive);
    trail.primitive = primitive;
  }

  /**
   * 渲染路径点（圆形 billboard）
   */
  private renderWaypoints(
    id: string,
    waypoints: Waypoint[],
    vis: RouteVisualizationConfig
  ): void {
    const Cesium = this.cesium;
    const state = this.states.get(id);
    if (!state || !state.route) return;

    // 清空旧路径点
    for (const p of state.route.waypointPrimitives) {
      this.scene.primitives.remove(p);
    }
    state.route.waypointPrimitives = [];

    const size = vis.waypointSize || 12;
    const color = Cesium.Color.fromCssColorString(vis.waypointColor || '#00AAFF');

    for (const wp of waypoints) {
      const pos = Cesium.Cartesian3.fromDegrees(wp.position[0], wp.position[1], wp.position[2]);

      // 使用 BillboardCollection 绘制路径点
      const bdCollection = new Cesium.BillboardCollection();
      const bd = bdCollection.add({
        position: pos,
        image: this.createCircleCanvas(size, color),
        scale: 1.0,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      });

      // 如果有标签，添加文本
      if (wp.label) {
        const labelCollection = new Cesium.LabelCollection();
        labelCollection.add({
          position: pos,
          text: wp.label,
          font: '12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -size / 2 - 4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        });
        this.scene.primitives.add(labelCollection);
        state.route.waypointPrimitives.push(labelCollection);
      }

      this.scene.primitives.add(bdCollection);
      state.route.waypointPrimitives.push(bdCollection);
    }
  }

  /**
   * 渲染方向移动虚线
   * 使用 PolylineGeometry + 实时更新 dashPattern 实现动画效果
   */
  private renderDashPolyline(
    id: string,
    waypoints: Waypoint[],
    vis: RouteVisualizationConfig
  ): void {
    const Cesium = this.cesium;
    const state = this.states.get(id);
    if (!state || !state.route) return;

    const positions = waypoints.map(wp =>
      Cesium.Cartesian3.fromDegrees(wp.position[0], wp.position[1], wp.position[2])
    );

    const dashColor = Cesium.Color.fromCssColorString(vis.dashColor || '#00AAFF');
    // 构建基础 PolylineGeometry（虚线由 dashPattern + dashLength 控制）
    const geometry = new Cesium.PolylineGeometry({
      positions: positions,
      width: vis.dashWidth || 3,
      vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
      // 256-bit dash pattern: 每 dashLength 像素切换 on/off
      // 默认 16 像素亮、8 像素暗
      granularity: Cesium.Math.toRadians(0.001)
    });

    const instance = new Cesium.GeometryInstance({
      geometry: geometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(dashColor)
      }
    });

    const primitive = new Cesium.Primitive({
      geometryInstances: instance,
      appearance: new Cesium.PolylineColorAppearance({
        translucent: true
      }),
      asynchronous: false
    });

    this.scene.primitives.add(primitive);
    state.route.dashPolyline = primitive;

    // 启动虚线偏移动画：通过移除并重建 primitive 来模拟 dashPattern 移动
    // 每帧更新 dashOffset（通过 PolylineDash 材质或重建）
    let dashOffset = 0;
    const animateDash = () => {
      if (!state.route || !state.route.active) return;

      dashOffset += vis.dashSpeed || 100;
      if (dashOffset > 256) dashOffset -= 256;

      // 重建 dashed polyline
      this.rebuildDashPolyline(id, waypoints, vis, dashOffset);

      state.route.dashAnimationId = requestAnimationFrame(animateDash);
    };

    state.route.dashAnimationId = requestAnimationFrame(animateDash);
  }

  /**
   * 重建虚线折线（更新 dashOffset 模拟方向移动）
   */
  private rebuildDashPolyline(
    id: string,
    waypoints: Waypoint[],
    vis: RouteVisualizationConfig,
    dashOffset: number
  ): void {
    const Cesium = this.cesium;
    const state = this.states.get(id);
    if (!state || !state.route) return;

    const positions = waypoints.map(wp =>
      Cesium.Cartesian3.fromDegrees(wp.position[0], wp.position[1], wp.position[2])
    );

    const dashColor = Cesium.Color.fromCssColorString(vis.dashColor || '#00AAFF');

    // 构建 with dashPattern
    const geometry = new Cesium.PolylineGeometry({
      positions: positions,
      width: vis.dashWidth || 3,
      vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
      granularity: Cesium.Math.toRadians(0.001)
    });

    const instance = new Cesium.GeometryInstance({
      geometry: geometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(dashColor)
      }
    });

    const newPrimitive = new Cesium.Primitive({
      geometryInstances: instance,
      appearance: new Cesium.PolylineColorAppearance({
        translucent: true
      }),
      asynchronous: false
    });

    // 替换旧虚线
    if (state.route.dashPolyline) {
      this.scene.primitives.remove(state.route.dashPolyline);
    }
    this.scene.primitives.add(newPrimitive);
    state.route.dashPolyline = newPrimitive;
  }

  /**
   * 渲染半透明管道（Pipe / 走廊
   * 使用 CorridorGeometry（走廊几何体）模拟管道，宽度/高度以米为单位
   */
  private renderPipe(
    id: string,
    waypoints: Waypoint[],
    vis: RouteVisualizationConfig
  ): void {
    const Cesium = this.cesium;
    const state = this.states.get(id);
    if (!state || !state.route) return;

    if (!vis.showPipe) return;

    const positions = waypoints.map(wp =>
      Cesium.Cartesian3.fromDegrees(wp.position[0], wp.position[1], wp.position[2])
    );

    const pipeWidth = vis.pipeWidth || 50;
    const pipeHeight = vis.pipeHeight || 20;
    const pipeColor = Cesium.Color.fromCssColorString(vis.pipeColor || '#00AAFF').withAlpha(vis.pipeOpacity ?? 0.2);

    // 使用 CorridorGeometry 表示管道底面（走廊宽度 = pipeWidth）
    // 然后通过高度 + 挤出实现管道效果
    const geometry = new Cesium.CorridorGeometry({
      positions: positions,
      width: pipeWidth,
      height: pipeHeight,
      extrudedHeight: pipeHeight / 2,
      vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      cornerType: Cesium.CornerType.ROUNDED
    });

    const instance = new Cesium.GeometryInstance({
      geometry: geometry,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(pipeColor)
      }
    });

    const primitive = new Cesium.Primitive({
      geometryInstances: instance,
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: true,
        flat: false,
        closed: false
      }),
      asynchronous: false,
      releaseGeometryInstances: false
    });

    this.scene.primitives.add(primitive);
    state.route.pipePrimitive = primitive;
  }

  /**
   * 创建圆形 Canvas 用于路径点 billboard
   */
  private createCircleCanvas(size: number, color: any): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 1;

    // 外圈
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color.toCssColorString();
    ctx.lineWidth = 2;
    ctx.stroke();

    // 填充
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.fillStyle = color.toCssColorString();
    ctx.globalAlpha = 0.3;
    ctx.fill();

    return canvas;
  }
}
