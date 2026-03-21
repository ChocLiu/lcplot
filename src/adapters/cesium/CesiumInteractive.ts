/**
 * Cesium 图元交互管理器
 * 负责处理 Cesium 中的图元点击、拖拽、标牌拖拽等交互
 */

import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEventType, Cartesian3, Math as CesiumMath, Ray, Scene } from 'cesium';
import {
  AdvancedPrimitive,
  PrimitiveEventType,
  PrimitiveEventData,
  InteractionConfig
} from '../../types';
import { InteractiveManager, InteractionOptions } from '../../features/advanced-primitives/InteractiveManager';

/**
 * Cesium 交互管理器配置
 */
export interface CesiumInteractiveConfig {
  viewer: Viewer;
  interactiveManager: InteractiveManager;
  getPrimitiveById: (id: string) => AdvancedPrimitive | null;
  onEvent?: (eventType: PrimitiveEventType, data: PrimitiveEventData) => void;
  
  // Cesium 事件配置
  pickTolerance?: number; // 像素拾取容差
  doubleClickInterval?: number; // 双击间隔（毫秒）
  
  // 拖拽配置
  dragSensitivity?: number; // 拖拽灵敏度
  terrainConform?: boolean; // 是否贴合地形
}

/**
 * Cesium 图元交互管理器
 */
export class CesiumInteractive {
  private viewer: Viewer;
  private scene: Scene;
  private interactiveManager: InteractiveManager;
  private getPrimitiveById: (id: string) => AdvancedPrimitive | null;
  
  // 事件处理器
  private eventHandler: ScreenSpaceEventHandler;
  
  // 配置
  private pickTolerance: number;
  private doubleClickInterval: number;
  private dragSensitivity: number;
  private terrainConform: boolean;
  
  // 交互状态
  private isDragging = false;
  private isLabelDragging = false;
  private dragStartPosition: Cartesian3 | null = null;
  private dragStartScreenPosition: { x: number; y: number } | null = null;
  private currentDragPrimitiveId: string | null = null;
  private currentLabelDragPrimitiveId: string | null = null;
  
  // 临时数据
  private lastClickTime = 0;
  private lastClickPrimitiveId: string | null = null;
  
  // 事件监听器
  private eventListeners: Array<{ type: PrimitiveEventType; callback: (data: PrimitiveEventData) => void }> = [];

  constructor(config: CesiumInteractiveConfig) {
    this.viewer = config.viewer;
    this.scene = config.viewer.scene;
    this.interactiveManager = config.interactiveManager;
    this.getPrimitiveById = config.getPrimitiveById;
    
    this.pickTolerance = config.pickTolerance || 5;
    this.doubleClickInterval = config.doubleClickInterval || 300;
    this.dragSensitivity = config.dragSensitivity || 1.0;
    this.terrainConform = config.terrainConform ?? true;
    
    // 创建事件处理器
    this.eventHandler = new ScreenSpaceEventHandler(this.viewer.canvas);
    
    // 初始化事件监听
    this.initializeEventHandlers();
    
    // 监听交互管理器的事件
    this.setupInteractiveManagerListeners();
  }

  /**
   * 初始化事件处理器
   */
  private initializeEventHandlers(): void {
    // 左键点击
    this.eventHandler.setInputAction((movement: any) => {
      this.handleLeftClick(movement.position);
    }, ScreenSpaceEventType.LEFT_CLICK);

    // 左键按下（开始拖拽）
    this.eventHandler.setInputAction((movement: any) => {
      this.handleLeftDown(movement.position);
    }, ScreenSpaceEventType.LEFT_DOWN);

    // 左键释放（结束拖拽）
    this.eventHandler.setInputAction(() => {
      this.handleLeftUp();
    }, ScreenSpaceEventType.LEFT_UP);

    // 鼠标移动（拖拽更新）
    this.eventHandler.setInputAction((movement: any) => {
      this.handleMouseMove(movement.endPosition);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    // 右键点击
    this.eventHandler.setInputAction((movement: any) => {
      this.handleRightClick(movement.position);
    }, ScreenSpaceEventType.RIGHT_CLICK);

    // 鼠标滚轮（可选）
    this.eventHandler.setInputAction((movement: any) => {
      this.handleMouseWheel(movement);
    }, ScreenSpaceEventType.WHEEL);
  }

  /**
   * 设置交互管理器监听器
   */
  private setupInteractiveManagerListeners(): void {
    // 监听交互管理器的事件，转发到Cesium
    this.interactiveManager.on(PrimitiveEventType.DRAG_START, (data) => {
      this.onPrimitiveDragStart(data);
    });
    
    this.interactiveManager.on(PrimitiveEventType.DRAG_END, (data) => {
      this.onPrimitiveDragEnd(data);
    });
    
    this.interactiveManager.on(PrimitiveEventType.LABEL_DRAG_START, (data) => {
      this.onLabelDragStart(data);
    });
    
    this.interactiveManager.on(PrimitiveEventType.LABEL_DRAG_END, (data) => {
      this.onLabelDragEnd(data);
    });
  }

  /**
   * 处理左键点击
   */
  private handleLeftClick(screenPosition: { x: number; y: number }): void {
    const pickedObject = this.pickPrimitive(screenPosition);
    
    if (pickedObject) {
      const { primitiveId, position, isLabel } = pickedObject;
      const primitive = this.getPrimitiveById(primitiveId);
      
      if (!primitive) return;
      
      // 检查是否是双击
      const now = Date.now();
      const isDoubleClick = (
        this.lastClickPrimitiveId === primitiveId &&
        (now - this.lastClickTime) < this.doubleClickInterval
      );
      
      // 更新点击记录
      this.lastClickTime = now;
      this.lastClickPrimitiveId = primitiveId;
      
      if (isLabel) {
        // 标签点击
        this.interactiveManager.handleClick(primitiveId, position, new MouseEvent('click'));
      } else {
        // 图元点击
        this.interactiveManager.handleClick(primitiveId, position, new MouseEvent('click'));
        
        if (isDoubleClick) {
          // 双击：聚焦到图元
          this.focusOnPrimitive(primitive);
        }
      }
    } else {
      // 点击空白处，取消选择
      this.lastClickPrimitiveId = null;
    }
  }

  /**
   * 处理左键按下（开始拖拽）
   */
  private handleLeftDown(screenPosition: { x: number; y: number }): void {
    const pickedObject = this.pickPrimitive(screenPosition);
    
    if (pickedObject) {
      const { primitiveId, position, isLabel } = pickedObject;
      const primitive = this.getPrimitiveById(primitiveId);
      
      if (!primitive) return;
      
      // 保存拖拽起始位置
      this.dragStartScreenPosition = screenPosition;
      this.dragStartPosition = Cartesian3.fromDegrees(position[0], position[1], position[2]);
      
      if (isLabel) {
        // 开始标牌拖拽
        if (primitive.interaction.labelDraggable) {
          this.isLabelDragging = true;
          this.currentLabelDragPrimitiveId = primitiveId;
          this.interactiveManager.startLabelDrag(primitiveId, position);
        }
      } else {
        // 开始图元拖拽
        if (primitive.interaction.draggable) {
          this.isDragging = true;
          this.currentDragPrimitiveId = primitiveId;
          this.interactiveManager.startDrag(primitiveId, position);
        }
      }
    }
  }

  /**
   * 处理左键释放（结束拖拽）
   */
  private handleLeftUp(): void {
    if (this.isDragging && this.currentDragPrimitiveId) {
      // 获取当前位置
      const position = this.getCurrentMousePosition();
      if (position) {
        const [lng, lat, height] = this.cartesianToDegrees(position);
        this.interactiveManager.endDrag([lng, lat, height]);
      }
      
      this.isDragging = false;
      this.currentDragPrimitiveId = null;
      this.dragStartPosition = null;
      this.dragStartScreenPosition = null;
    }
    
    if (this.isLabelDragging && this.currentLabelDragPrimitiveId) {
      // 标牌拖拽结束
      const primitive = this.getPrimitiveById(this.currentLabelDragPrimitiveId);
      if (primitive) {
        this.interactiveManager.endLabelDrag(primitive.interaction.labelOffset);
      }
      
      this.isLabelDragging = false;
      this.currentLabelDragPrimitiveId = null;
    }
  }

  /**
   * 处理鼠标移动（拖拽更新）
   */
  private handleMouseMove(screenPosition: { x: number; y: number }): void {
    if (this.isDragging && this.currentDragPrimitiveId) {
      // 图元拖拽更新
      const position = this.getPositionFromScreen(screenPosition);
      if (position) {
        const [lng, lat, height] = this.cartesianToDegrees(position);
        this.interactiveManager.updateDrag([lng, lat, height]);
      }
    }
    
    if (this.isLabelDragging && this.currentLabelDragPrimitiveId) {
      // 标牌拖拽更新
      const primitive = this.getPrimitiveById(this.currentLabelDragPrimitiveId);
      if (!primitive || !this.dragStartScreenPosition) return;
      
      // 计算偏移量
      const dx = (screenPosition.x - this.dragStartScreenPosition.x) * this.dragSensitivity;
      const dy = (screenPosition.y - this.dragStartScreenPosition.y) * this.dragSensitivity;
      
      // 更新标牌偏移
      const [offsetX, offsetY, offsetZ] = primitive.interaction.labelOffset;
      const newOffset: [number, number, number] = [
        offsetX + dx,
        offsetY - dy, // 屏幕Y轴与笛卡尔Y轴方向相反
        offsetZ
      ];
      
      this.interactiveManager.updateLabelDrag(newOffset);
    }
  }

  /**
   * 处理右键点击
   */
  private handleRightClick(screenPosition: { x: number; y: number }): void {
    const pickedObject = this.pickPrimitive(screenPosition);
    
    if (pickedObject) {
      const { primitiveId, position } = pickedObject;
      this.interactiveManager.handleRightClick(primitiveId, position, new MouseEvent('contextmenu'));
    }
  }

  /**
   * 处理鼠标滚轮
   */
  private handleMouseWheel(movement: any): void {
    // 可选：实现滚轮缩放标牌等功能
  }

  /**
   * 拾取图元
   */
  private pickPrimitive(screenPosition: { x: number; y: number }): {
    primitiveId: string;
    position: [number, number, number];
    isLabel: boolean;
  } | null {
    const pickedObject = this.viewer.scene.pick(screenPosition);
    
    if (!pickedObject || !pickedObject.id) {
      return null;
    }
    
    const entity = pickedObject.id;
    const properties = entity.properties;
    
    if (!properties) {
      return null;
    }
    
    // 检查是否是图元或标签
    const primitiveId = properties.primitiveId?.getValue();
    if (!primitiveId) {
      return null;
    }
    
    const isLabel = properties.isLabel?.getValue() || false;
    const isModel = properties.isModel?.getValue() || false;
    
    // 获取位置
    let position: [number, number, number];
    if (entity.position) {
      const cartesian = entity.position.getValue(this.viewer.clock.currentTime);
      position = this.cartesianToDegrees(cartesian);
    } else {
      // 回退到图元的位置
      const primitive = this.getPrimitiveById(primitiveId);
      position = primitive?.position || [0, 0, 0];
    }
    
    return {
      primitiveId,
      position,
      isLabel
    };
  }

  /**
   * 从屏幕坐标获取位置
   */
  private getPositionFromScreen(screenPosition: { x: number; y: number }): Cartesian3 | null {
    const ray = this.viewer.camera.getPickRay(screenPosition);
    if (!ray) return null;
    
    if (this.terrainConform) {
      // 贴合地形
      const intersection = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      return intersection || null;
    } else {
      // 使用平面
      const plane = this.scene.globe.ellipsoid;
      const intersection = plane.intersectRay(ray);
      return intersection || null;
    }
  }

  /**
   * 获取当前鼠标位置（用于拖拽结束）
   */
  private getCurrentMousePosition(): Cartesian3 | null {
    const canvas = this.viewer.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = rect.width / 2;
    const y = rect.height / 2;
    
    return this.getPositionFromScreen({ x, y });
  }

  /**
   * Cartesian3 转换为经纬高
   */
  private cartesianToDegrees(cartesian: Cartesian3): [number, number, number] {
    const cartographic = this.scene.globe.ellipsoid.cartesianToCartographic(cartesian);
    const lng = CesiumMath.toDegrees(cartographic.longitude);
    const lat = CesiumMath.toDegrees(cartographic.latitude);
    const height = cartographic.height;
    
    return [lng, lat, height];
  }

  /**
   * 图元拖拽开始回调
   */
  private onPrimitiveDragStart(data: PrimitiveEventData): void {
    // 可以在这里添加拖拽开始的视觉反馈
    console.log('Primitive drag started:', data);
  }

  /**
   * 图元拖拽结束回调
   */
  private onPrimitiveDragEnd(data: PrimitiveEventData): void {
    // 可以在这里添加拖拽结束的视觉反馈
    console.log('Primitive drag ended:', data);
  }

  /**
   * 标牌拖拽开始回调
   */
  private onLabelDragStart(data: PrimitiveEventData): void {
    // 可以在这里添加标牌拖拽开始的视觉反馈
    console.log('Label drag started:', data);
  }

  /**
   * 标牌拖拽结束回调
   */
  private onLabelDragEnd(data: PrimitiveEventData): void {
    // 可以在这里添加标牌拖拽结束的视觉反馈
    console.log('Label drag ended:', data);
  }

  /**
   * 聚焦到图元
   */
  private focusOnPrimitive(primitive: AdvancedPrimitive): void {
    const [lng, lat, height] = primitive.position;
    const position = Cartesian3.fromDegrees(lng, lat, height);
    
    // 飞向图元
    this.viewer.camera.flyTo({
      destination: position,
      duration: 1.0,
      complete: () => {
        // 聚焦完成后的回调
      }
    });
  }

  /**
   * 更新交互配置
   */
  updateInteractionConfig(primitiveId: string, config: Partial<InteractionConfig>): void {
    this.interactiveManager.updateInteractionConfig(primitiveId, config);
  }

  /**
   * 启用/禁用交互
   */
  setEnabled(enabled: boolean): void {
    if (!enabled) {
      // 取消当前拖拽
      if (this.isDragging) {
        this.handleLeftUp();
      }
      if (this.isLabelDragging) {
        this.handleLeftUp();
      }
    }
  }

  /**
   * 注册事件监听器
   */
  on(eventType: PrimitiveEventType, callback: (data: PrimitiveEventData) => void): void {
    this.eventListeners.push({ type: eventType, callback });
    this.interactiveManager.on(eventType, callback);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: PrimitiveEventType, callback: (data: PrimitiveEventData) => void): void {
    this.eventListeners = this.eventListeners.filter(
      listener => !(listener.type === eventType && listener.callback === callback)
    );
    this.interactiveManager.off(eventType, callback);
  }

  /**
   * 销毁
   */
  destroy(): void {
    // 清理事件处理器
    if (this.eventHandler) {
      this.eventHandler.destroy();
    }
    
    // 清理事件监听器
    this.eventListeners = [];
    
    // 清理状态
    this.isDragging = false;
    this.isLabelDragging = false;
    this.currentDragPrimitiveId = null;
    this.currentLabelDragPrimitiveId = null;
    this.dragStartPosition = null;
    this.dragStartScreenPosition = null;
  }
}