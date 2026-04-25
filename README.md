# LCPLOT - 高级GIS标绘与量算库

一个统一的GIS标绘库，支持多种GIS引擎（OpenLayers、Cesium等）。一次编写，在任何支持的引擎上运行。

## ✨ 新增高级功能（v0.2.0）

### 🎖️ MIL-STD-2525D 美军标图元系统
- **45+ 军标类型**：地面(22)、空中(8)、海上(10)、特战(3)，每类4阵营(friend/hostile/neutral/unknown)
- **✍️ 简化 API**：`ctrl.addSymbol({ type: SymbolType.TANK, identity: 'hostile' })` — 不用记 SIDC
- **自动敌我推断**：`resolveSidc(type, identity)` 自动映射 15 位编码，`identityFromSidc()` 反向提取
- **阵营系统**：友方、敌方、中立、未知等12种标准阵营
- **SIDC编码**：15位美军标编码验证与解析
- **图标库**：SVG图标按需加载，LRU缓存优化
- **milsymbol 集成**：可选集成 [milsymbol](https://github.com/spatialillusions/milsymbol) 库

### 🔌 兼容已有 Cesium 地球
- **`initWithViewer(existingViewer)`**：使用已创建的 Cesium.Viewer，不重复创建
- **`destroy()` 不销毁外部 viewer**：ownsViewer 标记自动判断

### 🖼️ 高级图元渲染（Cesium）
- **双模式渲染**：2D图标(Billboard) + 3D模型(glTF)
- **LOD自动切换**：距离控制渲染优化（<5km 3D，5-100km 2D，>100km隐藏）
- **独立标牌拖拽**：标牌位置与实体位置分离，支持单独拖拽
- **阵营颜色系统**：标准2525D颜色映射，支持自定义

### 📐 通视分析系统（开发中）
- **多源障碍物**：地形、建筑、植被、动态目标
- **地球物理校正**：地球曲率、大气折射系数
- **渐进式计算**：支持进度回调，Web Worker并行优化

## 📖 用户手册

完整 API 文档请查看 [USAGE.md](./USAGE.md)，涵盖：
- 快速开始与安装
- CesiumController 全部 API
- 创建/更新/删除/查询图元
- MIL-STD-2525D 军标选择（50+ 预定义符号）
- 三种场景模式（3D/2D/2.5D）
- 3D 模型过渡配置
- 混合渲染引擎详解
- 事件系统
- React 集成示例

---

## 📋 基础功能

- **统一API**：跨GIS引擎的一致接口
- **可扩展架构**：轻松添加新引擎适配器
- **丰富功能**：
  - 地图控制（中心、缩放、旋转、边界）
  - 图层管理（添加、移除、显隐、透明度、Z索引）
  - 几何绘制（点、线、面、圆、矩形、椭圆）
  - 交互绘制
  - 量算工具（距离、面积、角度）
  - 共性标绘
- **TypeScript支持**：完整类型定义

## Supported Engines

- OpenLayers 6/7
- Cesium 1.100+
- *More engines can be added via adapters.*

## Installation

```bash
npm install lcplot
```

You also need to install the engine(s) you plan to use:

```bash
npm install openlayers
# or
npm install cesium
```

## Usage

### Basic Setup

```javascript
import { MapFactory } from 'lcplot';

const container = document.getElementById('map');
const map = MapFactory.create('openlayers', container, {
  center: [116.397, 39.908],
  zoom: 10
});

map.init();
```

### Switching Engines

```javascript
// Switch to Cesium with zero code change
const cesiumMap = MapFactory.create('cesium', container, {
  center: [116.397, 39.908],
  zoom: 10
});
cesiumMap.init();
```

### 高级图元使用（新 API — 推荐）

```typescript
import { CesiumController, SymbolType } from 'lcplot';

// 创建控制器
const controller = new CesiumController(container);

// 方式一：LCPLOT 自动创建 Cesium Viewer
controller.init();

// 方式二：使用已有的 Cesium Viewer
// const viewer = new Cesium.Viewer(container, {...});
// controller.initWithViewer(viewer);

// 创建坦克（只需指定类型 + 敌我，无需记忆 SIDC）
const tankId = await controller.addSymbol({
  type: SymbolType.GROUND_TANK,   // 军标类型
  identity: 'friend',              // 敌我属性（默认 friend）
  position: [116.4, 39.9, 0],
  name: '第1坦克营'
});

// 创建敌方无人机
const uavId = await controller.addSymbol({
  type: SymbolType.AIR_UAV,
  identity: 'hostile',
  position: [116.4, 39.9, 500],
  name: '敌方侦察无人机'
});
```

### 高级图元使用（旧 API — 传 SIDC）

### 使用 milsymbol 生成图标（可选）

```html
<!-- 在页面中引入 milsymbol 库 -->
<script src="https://cdn.jsdelivr.net/npm/milsymbol@3.0.4/dist/milsymbol.min.js"></script>
```

```typescript
// LCPLOT 会自动检测全局 milsymbol 库
// 当本地图标文件缺失时，会调用 milsymbol.Symbol() 生成 SVG 图标
// 生成的图标会缓存以避免重复生成

// 你可以完全不提供图标库，仅依赖 milsymbol 生成
const controller = new CesiumController(container, {}, {
  symbolLibraryConfig: {
    baseUrl: '', // 空路径，强制使用 milsymbol 生成
    format: 'svg',
    size: [64, 64]
  }
});

// 或者提供部分图标库，缺失的图标由 milsymbol 补充
const controller2 = new CesiumController(container, {}, {
  symbolLibraryConfig: {
    baseUrl: '/custom-icons', // 自定义图标库
    format: 'svg',
    size: [64, 64]
  }
});
// 如果 /custom-icons/SFGPUCA---A---.svg 不存在，则自动生成
```

### 通视分析（开发中）

```typescript
const result = await controller.measureLineOfSight({
  start: [116.4, 39.9, 50],   // 雷达站高度50m
  end: [116.41, 39.91, 1000], // 无人机高度1000m
  includeTerrain: true,
  earthCurvature: true,
  obstacleSources: ['buildings', 'moving-targets']
});

console.log(`通视状态: ${result.visible ? '可见' : '不可见'}`);
console.log(`遮挡点: ${result.blockingPoints.length}个`);
```

### Measurement

```javascript
const distance = map.measureDistance([[116, 39], [117, 40]]);
console.log(`Distance: ${distance.length} ${distance.unit}`);
```

### Layer Management

```javascript
const layerId = map.addLayer({
  id: 'my-layer',
  visible: true,
  opacity: 0.8
});
map.hideLayer(layerId);
```

## 🏗️ 架构设计

### 核心架构
```
lcplot/
├── core/MapController.ts          # 抽象接口定义
├── adapters/cesium/              # Cesium适配器（完整实现）
│   ├── CesiumPrimitiveRenderer.ts # 图元渲染引擎
│   ├── CesiumInteractive.ts       # 交互管理器
│   └── index.ts                   # Cesium控制器
├── adapters/openlayers/          # OpenLayers适配器（基础）
├── features/advanced-primitives/ # 高级图元系统
│   ├── SymbolLibrary.ts           # 图标库管理器
│   ├── PrimitiveCatalog.ts        # 分类目录
│   └── InteractiveManager.ts      # 交互逻辑核心
└── types/                         # 类型定义
    ├── primitive.ts               # 图元类型
    └── line-of-sight.ts           # 通视分析类型
```

### 设计模式
- **适配器模式**：统一API，多引擎支持
- **策略模式**：LOD渲染策略、交互策略
- **观察者模式**：事件系统，解耦UI与逻辑
- **工厂模式**：`MapFactory`创建引擎适配器

### 扩展新引擎
1. 创建适配器类继承 `MapController`
2. 实现所有抽象方法
3. 在 `MapFactory` 中注册适配器

## 📊 当前状态

### ✅ 已完成
- **基础框架**：统一API，Cesium/OpenLayers适配器
- **高级图元系统**：MIL-STD-2525D标准，完整渲染与交互
- **类型系统**：完整TypeScript定义
- **构建系统**：Rollup打包，ESM/CJS双格式

### 🔄 开发中
- **通视分析算法**：地形采样、障碍物检测、地球物理校正
- **OpenLayers完整适配**：高级图元功能移植

### 📋 待完成
- **性能优化**：Web Worker并行计算、实例化渲染
- **UI组件库**：React/Vue组件，属性面板，侧边栏
- **文档完善**：API文档、使用教程、示例应用

## 🚀 快速开始

### 安装
```bash
# 安装lcplot
npm install lcplot

# 安装Cesium（如需使用Cesium适配器）
npm install cesium
```

### 构建
```bash
git clone https://github.com/ChocLiu/lcplot.git
cd lcplot
npm install
npm run build
```

### 详细文档
- [设计文档](./lcplot-extension-design.md)：完整架构设计
- [集成示例](./lcplot-integration-example.md)：React组件示例
- [进度报告](./PROGRESS_REPORT.md)：开发进度与问题

## 👥 贡献
欢迎提交Issue和Pull Request！开发计划见 [PROGRESS_REPORT.md](./PROGRESS_REPORT.md)。

## 📄 License
MIT License

---
**仓库**：https://github.com/ChocLiu/lcplot  
**最后更新**：2026-04-25  
**版本**：v0.3.0-alpha（SymbolType + 混合渲染）