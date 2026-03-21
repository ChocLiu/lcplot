/**
 * 图元交互管理器
 * 负责处理图元的点击、拖拽、标牌拖拽等交互行为
 */

import {
  AdvancedPrimitive,
  PrimitiveEventType,
  PrimitiveEventData,
  InteractionConfig
} from '../../types';

export interface InteractiveState {
  // 全局交互开关
  enabled: boolean;
  
  // 交互模式
  mode: 'select' | 'drag' | 'label-drag' | 'none';
  
  // 当前交互的图元
  activePrimitiveId: string | null;
  draggingPrimitiveId: string | null;
  draggingLabelPrimitiveId: string | null;
  
  // 交互状态
  isDragging: boolean;
  isLabelDragging: boolean;
  dragStartPosition: [number, number, number] | null;
  labelDragStartOffset: [number, number, number] | null;
  
  // 临时数据
  tempData: Map<string, any>;
}

export interface InteractionOptions {
  // 事件监听
  onEvent?: (eventType: PrimitiveEventType, data: PrimitiveEventData) => void;
  
  // 拖拽约束
  dragConstraints?: {
    terrainConform?: boolean;
    minHeight?: number;
    maxHeight?: number;
    bounds?: [[number, number], [number, number]]; // 经纬度边界
  };
  
  // 性能优化
  throttleInterval?: number; // 事件节流间隔（毫秒）
  debounceInterval?: number; // 事件防抖间隔（毫秒）
  
  // 可视化反馈
  highlightColor?: string;
  dragPreview?: boolean;
}

/**
 * 图元交互管理器
 */
export class InteractiveManager {
  private state: InteractiveState = {
    enabled: true,
    mode: 'select',
    activePrimitiveId: null,
    draggingPrimitiveId: null,
    draggingLabelPrimitiveId: null,
    isDragging: false,
    isLabelDragging: false,
    dragStartPosition: null,
    labelDragStartOffset: null,
    tempData: new Map()
  };

  private options: InteractionOptions;
  private eventListeners = new Map<PrimitiveEventType, Set<(data: PrimitiveEventData) => void>>();
  private primitives = new Map<string, AdvancedPrimitive>();
  
  // 节流/防抖控制
  private lastEventTime = new Map<string, number>();
  private pendingEvents = new Map<string, NodeJS.Timeout>();

  constructor(options: InteractionOptions = {}) {
    this.options = {
      throttleInterval: 16, // ~60fps
      debounceInterval: 100,
      highlightColor: '#FFFF00',
      dragPreview: true,
      ...options
    };

    this.initializeEventListeners();
  }

  /**
   * 注册图元
   */
  registerPrimitive(primitive: AdvancedPrimitive): void {
    this.primitives.set(primitive.id, primitive);
  }

  /**
   * 注销图元
   */
  unregisterPrimitive(primitiveId: string): void {
    this.primitives.delete(primitiveId);
    
    // 清理相关状态
    if (this.state.activePrimitiveId === primitiveId) {
      this.state.activePrimitiveId = null;
    }
    if (this.state.draggingPrimitiveId === primitiveId) {
      this.cancelDrag();
    }
    if (this.state.draggingLabelPrimitiveId === primitiveId) {
      this.cancelLabelDrag();
    }
  }

  /**
   * 更新图元
   */
  updatePrimitive(primitive: AdvancedPrimitive): void {
    this.primitives.set(primitive.id, primitive);
  }

  /**
   * 获取图元
   */
  getPrimitive(primitiveId: string): AdvancedPrimitive | null {
    return this.primitives.get(primitiveId) || null;
  }

  /**
   * 处理点击事件
   */
  handleClick(primitiveId: string, position: [number, number, number], event: MouseEvent): void {
    if (!this.state.enabled) return;
    
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive || !primitive.interaction.selectable) return;
    
    // 检查是否双击
    const now = Date.now();
    const lastClickTime = this.state.tempData.get(`lastClick_${primitiveId}`) || 0;
    const isDoubleClick = (now - lastClickTime) < 300; // 300ms内为双击
    
    // 更新最后点击时间
    this.state.tempData.set(`lastClick_${primitiveId}`, now);
    
    if (isDoubleClick) {
      // 双击事件
      this.emitEvent(PrimitiveEventType.DOUBLE_CLICK, {
        primitiveId,
        position,
        timestamp: now,
        source: 'click'
      });
      
      // 清除单击的待处理事件
      const clickKey = `click_${primitiveId}`;
      if (this.pendingEvents.has(clickKey)) {
        clearTimeout(this.pendingEvents.get(clickKey)!);
        this.pendingEvents.delete(clickKey);
      }
    } else {
      // 单击事件（防抖处理）
      const clickKey = `click_${primitiveId}`;
      if (this.pendingEvents.has(clickKey)) {
        clearTimeout(this.pendingEvents.get(clickKey)!);
      }
      
      this.pendingEvents.set(clickKey, setTimeout(() => {
        this.emitEvent(PrimitiveEventType.CLICK, {
          primitiveId,
          position,
          timestamp: Date.now(),
          source: 'click'
        });
        
        // 选择图元
        this.selectPrimitive(primitiveId);
        
        this.pendingEvents.delete(clickKey);
      }, this.options.debounceInterval));
    }
  }

  /**
   * 处理右键点击
   */
  handleRightClick(primitiveId: string, position: [number, number, number], event: MouseEvent): void {
    if (!this.state.enabled) return;
    
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive) return;
    
    this.emitEvent(PrimitiveEventType.RIGHT_CLICK, {
      primitiveId,
      position,
      timestamp: Date.now(),
      source: 'right-click'
    });
  }

  /**
   * 开始拖拽图元
   */
  startDrag(primitiveId: string, startPosition: [number, number, number]): void {
    if (!this.state.enabled) return;
    
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive || !primitive.interaction.draggable) return;
    
    // 检查是否在标牌拖拽模式下
    if (this.state.mode === 'label-drag') {
      this.startLabelDrag(primitiveId, startPosition);
      return;
    }
    
    this.state.mode = 'drag';
    this.state.draggingPrimitiveId = primitiveId;
    this.state.isDragging = true;
    this.state.dragStartPosition = startPosition;
    
    this.emitEvent(PrimitiveEventType.DRAG_START, {
      primitiveId,
      position: startPosition,
      timestamp: Date.now(),
      source: 'drag'
    });
  }

  /**
   * 更新拖拽位置
   */
  updateDrag(position: [number, number, number]): void {
    if (!this.state.isDragging || !this.state.draggingPrimitiveId) return;
    
    const primitiveId = this.state.draggingPrimitiveId;
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive) return;
    
    // 应用拖拽约束
    const constrainedPosition = this.applyDragConstraints(position, primitive);
    
    // 节流处理
    const now = Date.now();
    const lastDragTime = this.lastEventTime.get(`drag_${primitiveId}`) || 0;
    if (now - lastDragTime < (this.options.throttleInterval || 16)) {
      return;
    }
    
    this.lastEventTime.set(`drag_${primitiveId}`, now);
    
    this.emitEvent(PrimitiveEventType.DRAGGING, {
      primitiveId,
      position: constrainedPosition,
      oldValue: primitive.position,
      newValue: constrainedPosition,
      timestamp: now,
      source: 'drag'
    });
  }

  /**
   * 结束拖拽
   */
  endDrag(position: [number, number, number]): void {
    if (!this.state.isDragging || !this.state.draggingPrimitiveId) return;
    
    const primitiveId = this.state.draggingPrimitiveId;
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive) return;
    
    // 应用拖拽约束
    const constrainedPosition = this.applyDragConstraints(position, primitive);
    
    this.emitEvent(PrimitiveEventType.DRAG_END, {
      primitiveId,
      position: constrainedPosition,
      oldValue: primitive.position,
      newValue: constrainedPosition,
      timestamp: Date.now(),
      source: 'drag'
    });
    
    // 重置状态
    this.resetDragState();
  }

  /**
   * 取消拖拽
   */
  cancelDrag(): void {
    if (!this.state.isDragging) return;
    
    this.resetDragState();
  }

  /**
   * 开始标牌拖拽
   */
  startLabelDrag(primitiveId: string, startPosition: [number, number, number]): void {
    if (!this.state.enabled) return;
    
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive || !primitive.interaction.labelDraggable) return;
    
    this.state.mode = 'label-drag';
    this.state.draggingLabelPrimitiveId = primitiveId;
    this.state.isLabelDragging = true;
    this.state.labelDragStartOffset = primitive.interaction.labelOffset;
    
    this.emitEvent(PrimitiveEventType.LABEL_DRAG_START, {
      primitiveId,
      position: startPosition,
      timestamp: Date.now(),
      source: 'label-drag'
    });
  }

  /**
   * 更新标牌拖拽位置
   */
  updateLabelDrag(offset: [number, number, number]): void {
    if (!this.state.isLabelDragging || !this.state.draggingLabelPrimitiveId) return;
    
    const primitiveId = this.state.draggingLabelPrimitiveId;
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive) return;
    
    // 节流处理
    const now = Date.now();
    const lastDragTime = this.lastEventTime.get(`label_drag_${primitiveId}`) || 0;
    if (now - lastDragTime < (this.options.throttleInterval || 16)) {
      return;
    }
    
    this.lastEventTime.set(`label_drag_${primitiveId}`, now);
    
    this.emitEvent(PrimitiveEventType.LABEL_DRAGGING, {
      primitiveId,
      position: primitive.position,
      oldValue: primitive.interaction.labelOffset,
      newValue: offset,
      timestamp: now,
      source: 'label-drag'
    });
  }

  /**
   * 结束标牌拖拽
   */
  endLabelDrag(offset: [number, number, number]): void {
    if (!this.state.isLabelDragging || !this.state.draggingLabelPrimitiveId) return;
    
    const primitiveId = this.state.draggingLabelPrimitiveId;
    
    this.emitEvent(PrimitiveEventType.LABEL_DRAG_END, {
      primitiveId,
      position: offset,
      timestamp: Date.now(),
      source: 'label-drag'
    });
    
    // 重置状态
    this.resetLabelDragState();
  }

  /**
   * 取消标牌拖拽
   */
  cancelLabelDrag(): void {
    if (!this.state.isLabelDragging) return;
    
    this.resetLabelDragState();
  }

  /**
   * 选择图元
   */
  selectPrimitive(primitiveId: string): void {
    if (!this.state.enabled) return;
    
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive || !primitive.interaction.selectable) return;
    
    // 取消之前的选中
    if (this.state.activePrimitiveId && this.state.activePrimitiveId !== primitiveId) {
      this.deselectPrimitive(this.state.activePrimitiveId);
    }
    
    this.state.activePrimitiveId = primitiveId;
    
    this.emitEvent(PrimitiveEventType.SELECTED, {
      primitiveId,
      timestamp: Date.now(),
      source: 'selection'
    });
  }

  /**
   * 取消选择图元
   */
  deselectPrimitive(primitiveId: string): void {
    if (this.state.activePrimitiveId === primitiveId) {
      this.state.activePrimitiveId = null;
      
      this.emitEvent(PrimitiveEventType.DESELECTED, {
        primitiveId,
        timestamp: Date.now(),
        source: 'selection'
      });
    }
  }

  /**
   * 设置交互模式
   */
  setMode(mode: InteractiveState['mode']): void {
    this.state.mode = mode;
    
    // 如果切换到非拖拽模式，取消当前拖拽
    if (mode !== 'drag' && this.state.isDragging) {
      this.cancelDrag();
    }
    if (mode !== 'label-drag' && this.state.isLabelDragging) {
      this.cancelLabelDrag();
    }
  }

  /**
   * 启用/禁用交互
   */
  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
    
    if (!enabled) {
      // 禁用时取消所有交互
      this.cancelDrag();
      this.cancelLabelDrag();
      this.deselectPrimitive(this.state.activePrimitiveId || '');
    }
  }

  /**
   * 更新交互配置
   */
  updateInteractionConfig(primitiveId: string, config: Partial<InteractionConfig>): void {
    const primitive = this.getPrimitive(primitiveId);
    if (!primitive) return;
    
    const oldConfig = { ...primitive.interaction };
    primitive.interaction = { ...primitive.interaction, ...config };
    
    this.emitEvent(PrimitiveEventType.PROPERTY_CHANGED, {
      primitiveId,
      oldValue: oldConfig,
      newValue: primitive.interaction,
      timestamp: Date.now(),
      source: 'interaction-update'
    });
  }

  /**
   * 注册事件监听器
   */
  on(eventType: PrimitiveEventType, listener: (data: PrimitiveEventData) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: PrimitiveEventType, listener: (data: PrimitiveEventData) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 获取当前状态
   */
  getState(): InteractiveState {
    return { ...this.state };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 清理所有待处理事件
    this.pendingEvents.forEach(timeout => clearTimeout(timeout));
    this.pendingEvents.clear();
    
    // 清理状态
    this.state.tempData.clear();
    this.eventListeners.clear();
    this.primitives.clear();
    
    // 重置状态
    this.state = {
      enabled: true,
      mode: 'select',
      activePrimitiveId: null,
      draggingPrimitiveId: null,
      draggingLabelPrimitiveId: null,
      isDragging: false,
      isLabelDragging: false,
      dragStartPosition: null,
      labelDragStartOffset: null,
      tempData: new Map()
    };
  }

  /**
   * 私有方法
   */

  private initializeEventListeners(): void {
    // 窗口失去焦点时取消拖拽
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => {
        this.cancelDrag();
        this.cancelLabelDrag();
      });
    }
  }

  private emitEvent(eventType: PrimitiveEventType, data: PrimitiveEventData): void {
    // 调用全局回调
    if (this.options.onEvent) {
      this.options.onEvent(eventType, data);
    }
    
    // 调用注册的监听器
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }
  }

  private applyDragConstraints(
    position: [number, number, number],
    primitive: AdvancedPrimitive
  ): [number, number, number] {
    if (!this.options.dragConstraints) return position;
    
    const [lng, lat, height] = position;
    const constraints = this.options.dragConstraints;
    
    let constrainedHeight = height;
    
    // 高度约束
    if (constraints.minHeight !== undefined) {
      constrainedHeight = Math.max(constrainedHeight, constraints.minHeight);
    }
    if (constraints.maxHeight !== undefined) {
      constrainedHeight = Math.min(constrainedHeight, constraints.maxHeight);
    }
    
    // 边界约束
    if (constraints.bounds) {
      const [[minLng, minLat], [maxLng, maxLat]] = constraints.bounds;
      const constrainedLng = Math.max(minLng, Math.min(lng, maxLng));
      const constrainedLat = Math.max(minLat, Math.min(lat, maxLat));
      
      return [constrainedLng, constrainedLat, constrainedHeight];
    }
    
    return [lng, lat, constrainedHeight];
  }

  private resetDragState(): void {
    this.state.mode = 'select';
    this.state.draggingPrimitiveId = null;
    this.state.isDragging = false;
    this.state.dragStartPosition = null;
  }

  private resetLabelDragState(): void {
    this.state.mode = 'select';
    this.state.draggingLabelPrimitiveId = null;
    this.state.isLabelDragging = false;
    this.state.labelDragStartOffset = null;
  }
}