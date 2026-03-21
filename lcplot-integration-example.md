# LCPLOT 高级功能集成示例
## 在 Cesium 3D 应用中集成通视分析与高级图元

本文档展示如何在现有 `cesium-3d-app` 中集成 LCPLOT 扩展的高级功能。

## 一、安装与配置

### 1.1 安装 LCPLOT（本地开发版本）
```bash
# 在 cesium-3d-app 目录中
cd /root/.openclaw/workspace/cesium-3d-app
npm install ../lcplot
```

### 1.2 更新 TypeScript 配置（如果需要）
确保 `tsconfig.json` 包含：
```json
{
  "compilerOptions": {
    "paths": {
      "lcplot": ["../lcplot/dist/types"]
    }
  }
}
```

## 二、高级图元系统集成

### 2.1 创建图元管理器组件
```tsx
// src/components/AdvancedPrimitiveManager.tsx
import React, { useEffect, useRef } from 'react';
import { CesiumController, MilitaryDomain, IdentityCode, PrimitiveEventType } from 'lcplot';

interface AdvancedPrimitiveManagerProps {
  viewerContainer: HTMLDivElement | null;
}

const AdvancedPrimitiveManager: React.FC<AdvancedPrimitiveManagerProps> = ({ viewerContainer }) => {
  const controllerRef = useRef<CesiumController | null>(null);
  const primitivesRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!viewerContainer) return;

    // 获取或创建控制器
    const controller = new CesiumController(viewerContainer, {});
    controllerRef.current = controller;

    // 设置图标资源库配置
    controller.setSymbolResourceConfig({
      baseUrl: 'https://your-cdn.com/mil-std-2525d-icons',
      format: 'svg',
      size: [64, 64],
      identityColors: {
        [IdentityCode.FRIEND]: '#00AAFF',
        [IdentityCode.HOSTILE]: '#FF4444',
        [IdentityCode.NEUTRAL]: '#00CC66',
        [IdentityCode.UNKNOWN]: '#FFFF00'
      },
      cacheEnabled: true,
      cacheMaxSize: 500
    });

    // 监听图元事件
    controller.onPrimitiveEvent(PrimitiveEventType.CLICK, (data) => {
      console.log('Primitive clicked:', data);
      showPropertyPanel(data.primitiveId);
    });

    controller.onPrimitiveEvent(PrimitiveEventType.DRAG_END, (data) => {
      console.log('Primitive dragged to:', data.newValue);
      updatePrimitivePosition(data.primitiveId, data.newValue);
    });

    // 创建示例图元
    createExamplePrimitives(controller);

    return () => {
      // 清理资源
      if (controllerRef.current) {
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
    };
  }, [viewerContainer]);

  const createExamplePrimitives = (controller: CesiumController) => {
    // 示例1：陆地作战单位（坦克）
    const tankId = controller.createAdvancedPrimitive({
      sidc: 'SFGPUCA---A---',
      position: [116.4, 39.9, 0],
      properties: {
        identity: IdentityCode.FRIEND,
        status: 'present',
        name: '第1坦克营',
        strength: 'BN',
        equipment: ['T-90', 'IFV']
      },
      interaction: {
        selectable: true,
        draggable: true,
        labelDraggable: true,
        showLabel: true,
        labelOffset: [0, 50, 0]
      },
      visualization: {
        use3DModel: true,
        modelUrl: '/models/tank.gltf',
        scale: 1.0,
        highlightColor: '#FFFF00'
      }
    });

    // 示例2：空中单位（无人机）
    const uavId = controller.createAdvancedPrimitive({
      sidc: 'SFAFUU---H---',
      position: [116.41, 39.91, 1000],
      properties: {
        identity: IdentityCode.HOSTILE,
        status: 'present',
        name: '侦察无人机',
        equipment: ['EO/IR', 'SAR'],
        maxAltitude: 5000
      },
      interaction: {
        selectable: true,
        draggable: true,
        labelDraggable: false,
        showLabel: true
      }
    });

    primitivesRef.current.set('tank', tankId);
    primitivesRef.current.set('uav', uavId);
  };

  const showPropertyPanel = (primitiveId: string) => {
    const primitive = controllerRef.current?.getAdvancedPrimitive(primitiveId);
    if (!primitive) return;

    // 实现属性面板弹出逻辑
    console.log('Showing properties for:', primitive);
  };

  const updatePrimitivePosition = (primitiveId: string, position: [number, number, number]) => {
    controllerRef.current?.updateAdvancedPrimitive(primitiveId, { position });
  };

  return null; // 这是一个逻辑组件，不渲染UI
};

export default AdvancedPrimitiveManager;
```

### 2.2 集成到主应用
```tsx
// src/App.tsx
import React, { useRef } from 'react';
import CesiumViewer from './components/CesiumViewer';
import MeasureSidebar from './components/MeasureSidebar';
import AdvancedPrimitiveManager from './components/AdvancedPrimitiveManager';
import LineOfSightPanel from './components/LineOfSightPanel';

const App: React.FC = () => {
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 侧边栏 */}
      <div style={{ width: '300px', background: '#2d3748', color: 'white' }}>
        <MeasureSidebar />
        <LineOfSightPanel viewerContainer={viewerContainerRef.current} />
      </div>
      
      {/* 地图容器 */}
      <div ref={viewerContainerRef} style={{ flex: 1, position: 'relative' }}>
        <CesiumViewer />
      </div>

      {/* 图元管理器（逻辑组件） */}
      <AdvancedPrimitiveManager viewerContainer={viewerContainerRef.current} />
    </div>
  );
};

export default App;
```

## 三、通视分析集成

### 3.1 创建通视分析面板
```tsx
// src/components/LineOfSightPanel.tsx
import React, { useState } from 'react';
import { CesiumController, LineOfSightOptions } from 'lcplot';

interface LineOfSightPanelProps {
  viewerContainer: HTMLDivElement | null;
}

const LineOfSightPanel: React.FC<LineOfSightPanelProps> = ({ viewerContainer }) => {
  const [startPoint, setStartPoint] = useState<[number, number, number]>([116.4, 39.9, 50]);
  const [endPoint, setEndPoint] = useState<[number, number, number]>([116.41, 39.91, 1000]);
  const [result, setResult] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);

  const runLineOfSight = async () => {
    if (!viewerContainer) return;

    const controller = new CesiumController(viewerContainer, {});
    setCalculating(true);

    try {
      const options: LineOfSightOptions = {
        start: startPoint,
        end: endPoint,
        includeTerrain: true,
        earthCurvature: true,
        refractionCoefficient: 0.13,
        calculationMode: 'balanced',
        outputBlockingPoints: true,
        outputProfile: true
      };

      const result = await controller.measureLineOfSight(options);
      setResult(result);

      // 可视化结果
      const vizIds = controller.visualizeLineOfSight(result, {
        showLine: true,
        showBlockingPoints: true,
        colors: {
          visibleLine: '#00FF00',
          blockedLine: '#FF0000',
          blockingPoint: '#FF9900'
        }
      });

      // 保存可视化ID以便后续清理
      localStorage.setItem('losVizIds', JSON.stringify(vizIds));
    } catch (error) {
      console.error('Line of sight calculation failed:', error);
    } finally {
      setCalculating(false);
    }
  };

  const clearVisualization = () => {
    const vizIds = JSON.parse(localStorage.getItem('losVizIds') || '[]');
    if (vizIds.length > 0) {
      const controller = new CesiumController(viewerContainer!, {});
      controller.removeLineOfSightVisualization(vizIds);
      localStorage.removeItem('losVizIds');
    }
    setResult(null);
  };

  return (
    <div style={{ padding: '20px', borderTop: '1px solid #4a5568' }}>
      <h3 style={{ marginTop: 0 }}>通视分析</h3>
      
      <div style={{ marginBottom: '15px' }}>
        <label>观测点（经度,纬度,高度）</label>
        <input
          type="text"
          value={startPoint.join(', ')}
          onChange={(e) => setStartPoint(e.target.value.split(',').map(Number) as any)}
          style={{ width: '100%', padding: '5px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>目标点（经度,纬度,高度）</label>
        <input
          type="text"
          value={endPoint.join(', ')}
          onChange={(e) => setEndPoint(e.target.value.split(',').map(Number) as any)}
          style={{ width: '100%', padding: '5px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          <input type="checkbox" defaultChecked /> 包含地形障碍
        </label>
        <label style={{ marginLeft: '15px' }}>
          <input type="checkbox" defaultChecked /> 地球曲率校正
        </label>
      </div>

      <button
        onClick={runLineOfSight}
        disabled={calculating}
        style={{
          width: '100%',
          padding: '10px',
          background: '#4299e1',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: calculating ? 'not-allowed' : 'pointer'
        }}
      >
        {calculating ? '计算中...' : '执行通视分析'}
      </button>

      {result && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#4a5568', borderRadius: '4px' }}>
          <h4 style={{ marginTop: 0 }}>分析结果</h4>
          <p>通视状态: <strong style={{ color: result.visible ? '#00FF00' : '#FF4444' }}>
            {result.visible ? '可见' : '不可见'}
          </strong></p>
          <p>通视比例: {(result.visibleRatio * 100).toFixed(1)}%</p>
          
          {result.blockingPoints.length > 0 && (
            <div>
              <p>遮挡点数量: {result.blockingPoints.length}</p>
              <details>
                <summary>查看遮挡点详情</summary>
                <ul style={{ fontSize: '12px', maxHeight: '150px', overflowY: 'auto' }}>
                  {result.blockingPoints.map((point: any, index: number) => (
                    <li key={index}>
                      距离 {point.distanceFromStart.toFixed(0)}m: 
                      [{point.position[0].toFixed(6)}, {point.position[1].toFixed(6)}, {point.position[2].toFixed(0)}m]
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          
          <button
            onClick={clearVisualization}
            style={{
              marginTop: '10px',
              padding: '5px 10px',
              background: '#718096',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            清除可视化
          </button>
        </div>
      )}
    </div>
  );
};

export default LineOfSightPanel;
```

## 四、动态障碍物配置

### 4.1 注册障碍物数据源
```typescript
// src/utils/obstacleManager.ts
import { CesiumController, ObstacleSource, ObstacleType, ObstacleSourceType } from 'lcplot';

export function setupObstacleSources(controller: CesiumController) {
  // 建筑物图层（3D Tiles）
  controller.registerObstacleSource({
    id: 'buildings',
    name: '建筑物图层',
    type: ObstacleType.BUILDING,
    sourceType: ObstacleSourceType.TILES3D,
    sourceConfig: {
      url: 'https://your-tileserver.com/buildings/tileset.json'
    },
    calculationMode: 'boundingBox',
    simplification: {
      enabled: true,
      tolerance: 5.0
    },
    filters: {
      minHeight: 3.0 // 忽略低于3米的建筑
    }
  });

  // 动态目标图层（GeoJSON实时数据）
  controller.registerObstacleSource({
    id: 'moving-targets',
    name: '动态目标',
    type: ObstacleType.VEHICLE,
    sourceType: ObstacleSourceType.STREAM,
    sourceConfig: {
      endpoint: 'wss://your-server.com/targets',
      updateInterval: 1000 // 1秒更新
    },
    calculationMode: 'convexHull',
    dynamic: {
      updateInterval: 1000,
      velocityField: 'speed',
      rotationField: 'heading'
    }
  });

  // 植被图层（自定义数据）
  controller.registerObstacleSource({
    id: 'vegetation',
    name: '植被覆盖',
    type: ObstacleType.VEGETATION,
    sourceType: ObstacleSourceType.GEOJSON,
    sourceConfig: {
      url: '/data/vegetation.geojson',
      heightField: 'tree_height'
    },
    calculationMode: 'adaptive',
    simplification: {
      enabled: true,
      tolerance: 2.0,
      maxVertices: 100
    }
  });
}
```

## 五、属性面板实现

### 5.1 弹出式属性面板组件
```tsx
// src/components/PrimitivePropertyPanel.tsx
import React, { useEffect, useState } from 'react';
import { AdvancedPrimitive, IdentityCode, StatusCode } from 'lcplot';

interface PrimitivePropertyPanelProps {
  primitive: AdvancedPrimitive | null;
  position: { x: number; y: number };
  onClose: () => void;
  onUpdate: (id: string, updates: any) => void;
}

const PrimitivePropertyPanel: React.FC<PrimitivePropertyPanelProps> = ({
  primitive,
  position,
  onClose,
  onUpdate
}) => {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (primitive) {
      setFormData({
        name: primitive.properties.name || '',
        identity: primitive.properties.identity,
        status: primitive.properties.status,
        strength: primitive.properties.strength || '',
        equipment: (primitive.properties.equipment || []).join(', ')
      });
    }
  }, [primitive]);

  if (!primitive) return null;

  const handleSave = () => {
    onUpdate(primitive.id, {
      properties: {
        ...primitive.properties,
        name: formData.name,
        identity: formData.identity,
        status: formData.status,
        strength: formData.strength,
        equipment: formData.equipment.split(',').map((item: string) => item.trim()).filter(Boolean)
      }
    });
    setEditing(false);
  };

  const identityColors: Record<IdentityCode, string> = {
    [IdentityCode.FRIEND]: '#00AAFF',
    [IdentityCode.HOSTILE]: '#FF4444',
    [IdentityCode.NEUTRAL]: '#00CC66',
    [IdentityCode.UNKNOWN]: '#FFFF00',
    [IdentityCode.PENDING]: '#00FFFF',
    [IdentityCode.ASSUMED_FRIEND]: '#88CCFF',
    [IdentityCode.SUSPECT]: '#CC00FF',
    [IdentityCode.EXERCISE_PENDING]: '#FF9900',
    [IdentityCode.EXERCISE_UNKNOWN]: '#996633',
    [IdentityCode.JOKER]: '#FF66CC',
    [IdentityCode.FAKER]: '#888888'
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '350px',
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000
      }}
    >
      {/* 标题栏 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: '#2d3748',
        color: 'white',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px'
      }}>
        <h4 style={{ margin: 0 }}>图元属性</h4>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer'
          }}
        >
          ×
        </button>
      </div>

      {/* 内容区 */}
      <div style={{ padding: '16px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 8px',
            background: identityColors[primitive.properties.identity],
            color: 'white',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            {primitive.properties.identity.toUpperCase()}
          </div>
          <div style={{
            display: 'inline-block',
            marginLeft: '8px',
            padding: '4px 8px',
            background: '#718096',
            color: 'white',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            SIDC: {primitive.sidc}
          </div>
        </div>

        {editing ? (
          // 编辑模式
          <>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>阵营</label>
              <select
                value={formData.identity}
                onChange={(e) => setFormData({ ...formData, identity: e.target.value })}
                style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
              >
                {Object.values(IdentityCode).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>装备</label>
              <input
                type="text"
                value={formData.equipment}
                onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
                placeholder="用逗号分隔"
                style={{ width: '100%', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSave}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#4299e1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                保存
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: '#a0aec0',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
            </div>
          </>
        ) : (
          // 查看模式
          <>
            <div style={{ marginBottom: '12px' }}>
              <strong>名称:</strong> {primitive.properties.name || '未命名'}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>状态:</strong> {primitive.properties.status}
            </div>
            <div style={{ marginBottom: '12px' }}>
              <strong>规模:</strong> {primitive.properties.strength || '未指定'}
            </div>
            {primitive.properties.equipment && primitive.properties.equipment.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <strong>装备:</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                  {primitive.properties.equipment.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => setEditing(true)}
              style={{
                width: '100%',
                padding: '8px',
                background: '#48bb78',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              编辑属性
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PrimitivePropertyPanel;
```

## 六、部署配置

### 6.1 美军标图标资源
在 `public/mil-icons/` 目录下放置 MIL-STD-2525D SVG 图标库，结构如下：
```
public/
  mil-icons/
    SFGPUCA---A---.svg
    SFGPUCI---A---.svg
    SFAFUC---A---.svg
    SFSPUC---A---.svg
    ... 其他图标
```

### 6.2 环境变量配置
```env
# .env.local
VITE_MIL_ICONS_BASE_URL=/mil-icons
VITE_CESIUM_TOKEN=your_cesium_ion_token
```

## 七、性能优化建议

### 7.1 图元渲染优化
- 使用 `LOD`（Level of Detail）根据距离切换2D/3D显示
- 实现图元实例化（Instance）渲染
- 启用视锥剔除（Frustum Culling）

### 7.2 通视分析优化
- 对于长距离分析，使用自适应采样
- 缓存地形查询结果
- 使用 Web Worker 进行并行计算

### 7.3 内存管理
- 实现图标资源的 LRU 缓存
- 定期清理未使用的图元
- 使用对象池复用几何对象

## 八、故障排除

### 8.1 常见问题
1. **图标加载失败**：检查图标资源路径，确保图标文件存在
2. **通视计算缓慢**：调整 `samplingDistance` 或启用简化模式
3. **内存泄漏**：确保在组件卸载时调用 `destroy()` 方法

### 8.2 调试工具
```typescript
// 在控制台调试
const controller = new CesiumController(container, {});
console.log('Controller instance:', controller);
console.log('Registered primitives:', controller.exportPrimitives());
```

---

**下一步**：根据实际需求调整上述示例，逐步实现完整功能。