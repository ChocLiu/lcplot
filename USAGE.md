# LCPLOT — 高级 GIS 标绘库

> 高性能军事标绘库，支持 MIL-STD-2525D 美军标图元、通视分析、混合渲染引擎（BillboardCollection + Primitive API）。
>
> 版本: 0.2.0-alpha · 引擎: Cesium · 渲染模式: Hybrid (路线C)

---

## 📑 目录

- [快速开始](#快速开始)
- [CesiumController — 核心控制器](#cesiumcontroller--核心控制器)
- [创建与管理图元](#创建与管理图元)
- [MIL-STD-2525D 军标选择](#mil-std-2525d-军标选择)
- [场景模式支持](#场景模式支持)
- [3D 模型过渡](#3d-模型过渡)
- [混合渲染引擎](#混合渲染引擎)
- [事件系统](#事件系统)
- [查询与统计](#查询与统计)
- [渲染器切换](#渲染器切换)
- [导出类型速查](#导出类型速查)
- [完整示例](#完整示例)

---

## 快速开始

### 安装

```bash
npm install lcplot
# peer 依赖
npm install cesium
```

### 基本使用

#### 🆕 推荐方式：`addSymbol()` — 指定类型 + 敌我，不用记 SIDC

```typescript
import { CesiumController, SymbolType, IdentityCode } from 'lcplot';

// 1. 创建控制器
const controller = new CesiumController(containerElement, {
  center: [116.4, 39.9],
  zoom: 10
});

// 2. 初始化（或使用已有 Viewer）
controller.init();
// 或：controller.initWithViewer(yourViewer);

// 3. 创建军标 — 只需指定类型+敌我，默认友方
const tankId = await controller.addSymbol({
  type: SymbolType.GROUND_TANK,      // 军标类型
  identity: 'hostile',                // 敌我（默认 'friend'）
  position: [116.4, 39.9, 0],
  name: '敌方装甲连',
  scale: 1.0
});

// 创建无人机（不传 identity = 默认友方）
const uavId = await controller.addSymbol({
  type: SymbolType.AIR_UAV,
  position: [116.4, 39.9, 500],
  name: '侦察无人机'
});
```

#### 传统方式：`createAdvancedPrimitive()` — 直接传 SIDC

```typescript
import { CesiumController, MilSIDC } from 'lcplot';

const controller = new CesiumController(containerElement, {
  center: [116.4, 39.9],
  zoom: 10
});

controller.init();

const tankId = await controller.createAdvancedPrimitive({
  sidc: MilSIDC.Ground.FRIENDLY_TANK,
  position: [116.4, 39.9, 0],
  properties: { name: '第1坦克营' },   // identity 自动从 SIDC 推断
  visualization: { scale: 1.0 }
});
```

---

## CesiumController — 核心控制器

### 构造函数

```typescript
new CesiumController(
  container: HTMLElement,       // DOM 容器
  options?: MapOptions,         // 地图选项
  config?: CesiumControllerConfig  // 高级配置
)
```

### 配置项 (CesiumControllerConfig)

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `rendererMode` | `'entity' \| 'billboard' \| 'hybrid'` | `'hybrid'` | 渲染器模式 |
| `maxPrimitives` | `number` | `100000` | 最大图元数量 |
| `symbolLibraryConfig` | `Partial<SymbolResourceConfig>` | — | 图标库配置 |
| `interactionOptions` | `Partial<InteractionOptions>` | — | 交互行为配置 |
| `lodDistances` | `{ billboardToModel, hide }` | — | LOD 距离阈值 |
| `cesiumToken` | `string` | — | Cesium Ion 令牌 |
| `terrainProvider` | `any` | — | 地形提供者 |
| `imageryProvider` | `any` | — | 影像提供者 |

### 地图视图控制

```typescript
// 设置中心点（角度制经纬度）
controller.setCenter([116.4, 39.9]);

// 获取当前中心点
const [lng, lat] = controller.getCenter();

// 缩放到级别
controller.setZoom(12);
const zoom = controller.getZoom();

// 设置旋转角度
controller.setRotation(45);        // 度
const rotation = controller.getRotation();

// 适配到空间范围
controller.fitBounds([
  [116.3, 39.8],    // [西南经度, 西南纬度]
  [116.5, 40.0]     // [东北经度, 东北纬度]
]);
```

### 生命周期

```typescript
// 方式一：由 LCPLOT 创建 Cesium Viewer（简单模式）
controller.init();
// 销毁时自动清理 LCPLOT 引擎 + Cesium Viewer
controller.destroy();

// 方式二：接入已有的 Cesium Viewer（推荐！）
const viewer = new Cesium.Viewer(container, {...});
const ctrl = new CesiumController(container, {}, { rendererMode: 'hybrid' });
ctrl.initWithViewer(viewer);   // 使用已有 viewer，不再创建新的
// 销毁时只清理 LCPLOT 引擎，不会销毁你的 viewer
ctrl.destroy();
viewer.destroy();  // viewer 由你自行销毁

// 获取原始 Cesium Viewer 实例
const viewer = controller.getViewer();
```

### SIDC 与敌我属性的关系

**MIL-STD-2525D 中，敌我属性已编码在 SIDC 内：**
```
SFGPUCA---A---   → 友方坦克（位置 1 = F = Friend）
SHGPUCA---H---   → 敌方坦克（位置 1 = H = Hostile）
SNGPUCA---N---   → 中立坦克（位置 1 = N = Neutral）
```

因此 `createAdvancedPrimitive` 种：

```typescript
// ✅ 推荐：不传 identity，自动从 SIDC 推断
ctrl.createAdvancedPrimitive({
  sidc: MilSIDC.Ground.FRIENDLY_TANK,
  position: [116.4, 39.9, 0],
  properties: { name: '第1坦克营' }   // identity 自动设为 'friend'
});

// ✅ 覆盖场景（演习、伪装）：显式设置 identity 覆盖 SIDC
ctrl.createAdvancedPrimitive({
  sidc: MilSIDC.Ground.FRIENDLY_TANK,
  position: [116.4, 39.9, 0],
  properties: {
    identity: 'hostile',    // 覆盖：友方符号显示为敌方颜色
    name: '演习目标'
  }
});
```

---

## 创建与管理图元

### 创建图元

```typescript
const id: string = await controller.createAdvancedPrimitive({
  // ===== 必需 =====
  sidc: 'SFGPUCA---A---',                // MIL-STD-2525D 15位编码
  position: [116.4, 39.9, 0],             // [经度°, 纬度°, 高度米]

  // ===== 属性（可选）=====
  properties: {
    identity: 'friend',                    // 阵营（IdentityCode 枚举）
    commandRelation: 'self',               // 指挥关系
    status: 'present',                     // 状态
    name: '第1坦克营',                     // 显示名称
    strength: 'BN',                        // 兵力规模（BN=营, CO=连, PL=排）
  },

  // ===== 交互（可选）=====
  interaction: {
    selectable: true,                      // 可选择
    draggable: false,                      // 可拖拽
    showLabel: true,                       // 显示名称标签
    labelOffset: [0, 50, 0],              // 标签偏移 [东, 北, 上]
  },

  // ===== 可视化（可选）=====
  visualization: {
    scale: 1.0,                           // 缩放
    use3DModel: false,                     // 近距离切换3D模型
    modelUrl: '/models/tank.glb',          // 3D模型URL
    billboardUrl: '/icons/tank.svg',       // 自定义图标URL
    billboardSize: [64, 64],              // 图标像素尺寸
  }
});
```

### 更新图元

```typescript
await controller.updateAdvancedPrimitive(id, {
  position: [116.5, 40.0, 100],          // 移动位置
  properties: {
    name: '第2坦克营',
    status: 'damaged'
  },
  visualization: {
    scale: 1.5
  }
});
```

### 删除图元

```typescript
// 单个删除
controller.removeAdvancedPrimitive(id);

// 批量删除
for (const id of ids) {
  controller.removeAdvancedPrimitive(id);
}
```

### 获取图元

```typescript
const primitive = controller.getAdvancedPrimitive(id);
if (primitive) {
  console.log(primitive.sidc, primitive.position, primitive.properties);
}
```

### 批量创建

```typescript
// 需要通过 renderer 直接调用
const renderer = controller.getBillboardRenderer();
if (renderer) {
  const ids = await Promise.all(
    positions.map(pos =>
      controller.createAdvancedPrimitive({
        sidc: 'SFGPUCA---A---',
        position: pos,
        properties: { identity: 'friend', name: '单位' }
      })
    )
  );
}
```

---

## MIL-STD-2525D 军标选择

### 🆕 简化 API：`SymbolType` + `resolveSidc()`

```typescript
import { SymbolType, resolveSidc, SymbolTypeNames } from 'lcplot';

// 指定类型 + 敌我属性 → 自动映射 15 位 SIDC
resolveSidc(SymbolType.GROUND_TANK, 'friend')    // → SF__GUCI---A---  友方坦克
resolveSidc(SymbolType.GROUND_TANK, 'hostile')   // → SH__GUCI---H---  敌方坦克
resolveSidc(SymbolType.GROUND_TANK, 'neutral')   // → SN__GUCI---N---  中立坦克
resolveSidc(SymbolType.GROUND_TANK, 'unknown')   // → SU__GUCI---U---  未知坦克

// 不传 identity 默认 'friend'
resolveSidc(SymbolType.AIR_UAV)                  // → SF__APUAV--A---

// 中文名称
SymbolTypeNames[SymbolType.GROUND_TANK]           // → '坦克'
SymbolTypeNames[SymbolType.AIR_UAV]              // → '无人机'
```

所有 45+ 类型按领域分三组：

| 领域 | 类型数量 | SymbolType 前缀 |
|------|----------|----------------|
| 🗺️ 地面 Ground | 22 | `GROUND_*` |
| ✈️ 空中 Air | 8 | `AIR_*` |
| ⚓ 海上 Sea | 10 | `SEA_*` |
| 🎯 特种作战 SOF | 3 | `SOF_*` |
| **合计** | **43** | |

#### 地面类型完整列表

```typescript
SymbolType.GROUND_TANK                  // 坦克
SymbolType.GROUND_INFANTRY              // 步兵
SymbolType.GROUND_MECHANIZED            // 机械化步兵
SymbolType.GROUND_ARTILLERY             // 火炮
SymbolType.GROUND_AIR_DEFENSE           // 防空
SymbolType.GROUND_RECON                 // 侦察
SymbolType.GROUND_ENGINEER              // 工兵
SymbolType.GROUND_HEADQUARTERS          // 指挥部
SymbolType.GROUND_MEDICAL               // 医疗
SymbolType.GROUND_SUPPLY                // 补给
SymbolType.GROUND_MAINTENANCE           // 维修
SymbolType.GROUND_MORTAR                // 迫击炮
SymbolType.GROUND_MISSILE               // 导弹
SymbolType.GROUND_BRIDGE                // 桥梁
SymbolType.GROUND_RADAR                 // 雷达
SymbolType.GROUND_SIGNAL                // 通信
SymbolType.GROUND_TRANSPORT             // 运输
SymbolType.GROUND_MILITARY_POLICE       // 宪兵
SymbolType.GROUND_CBRN                  // 防化
SymbolType.GROUND_MILITARY_INTELLIGENCE // 军事情报
```

#### 空中类型完整列表

```typescript
SymbolType.AIR_FIXED_WING              // 固定翼飞机
SymbolType.AIR_HELICOPTER              // 直升机
SymbolType.AIR_UAV                     // 无人机
SymbolType.AIR_MISSILE                 // 空射导弹
SymbolType.AIR_AWACS                   // 预警机
SymbolType.AIR_TANKER                  // 加油机
SymbolType.AIR_TRANSPORT               // 运输机
SymbolType.AIR_ATTACK_HELICOPTER        // 武装直升机
```

#### 海上类型完整列表

```typescript
SymbolType.SEA_SURFACE_COMBATANT       // 水面战斗舰艇
SymbolType.SEA_CARRIER                 // 航母
SymbolType.SEA_DESTROYER               // 驱逐舰
SymbolType.SEA_FRIGATE                 // 护卫舰
SymbolType.SEA_SUBMARINE               // 潜艇
SymbolType.SEA_LANDING                 // 登陆舰
SymbolType.SEA_PATROL                  // 巡逻艇
SymbolType.SEA_MINE_WARFARE            // 扫雷舰
SymbolType.SEA_AMPHIBIOUS              // 两栖舰
SymbolType.SEA_MERCHANT                // 商船
```

#### 特种作战类型完整列表

```typescript
SymbolType.SOF_TEAM                    // 特种作战小队
SymbolType.SOF_AVIATION                // 特种作战航空
SymbolType.SOF_NAVAL                   // 特种作战海上
```

### 使用常量表（旧 API）
MilSIDC.Ground.FRIENDLY_RECON          // SFGPURC---A---  侦察
MilSIDC.Ground.FRIENDLY_HEADQUARTERS   // SFGPUHQ---A---  指挥部
MilSIDC.Ground.FRIENDLY_RADAR          // SFGPURD---A---  雷达
MilSIDC.Ground.FRIENDLY_ENGINEER       // SFGPUEN---A---  工兵
MilSIDC.Ground.FRIENDLY_SUPPLY         // SFGPUSP---A---  补给
MilSIDC.Ground.FRIENDLY_TRANSPORT      // SFGPUTR---A---  运输
MilSIDC.Ground.FRIENDLY_MORTAR         // SFGPUMA---A---  迫击炮
MilSIDC.Ground.FRIENDLY_MISSILE        // SFGPUMS---A---  导弹
MilSIDC.Ground.FRIENDLY_MEDICAL        // SFGPUMB---A---  医疗

// 敌方（红色）
MilSIDC.Ground.HOSTILE_TANK            // SHFGUCI---H---
MilSIDC.Ground.HOSTILE_INFANTRY        // SHFGUIA---H---
MilSIDC.Ground.HOSTILE_ARTILLERY       // SHFGUFA---H---

// 中立（绿色）
MilSIDC.Ground.NEUTRAL_TANK            // SNFGUCI---N---

// 未知（黄色）
MilSIDC.Ground.UNKNOWN_TANK            // SUFGUCI---U---

// ===== 空中单位 =====
MilSIDC.Air.FRIENDLY_FIXED_WING        // SFFAPMF---A---  固定翼
MilSIDC.Air.FRIENDLY_HELICOPTER        // SFFAHMF---A---  直升机
MilSIDC.Air.FRIENDLY_UAV               // SFFAPUAV--A---  无人机
MilSIDC.Air.FRIENDLY_AWACS             // SFFAAWACS-A---  预警机
MilSIDC.Air.HOSTILE_UAV                // SHFAPUAV--H---
MilSIDC.Air.HOSTILE_MISSILE            // SHFAMSL---H---

// ===== 海上单位 =====
MilSIDC.Sea.FRIENDLY_SURFACE           // SFFSNCI---A---  水面舰艇
MilSIDC.Sea.FRIENDLY_CARRIER           // SFFSNCV---A---  航母
MilSIDC.Sea.FRIENDLY_DESTROYER         // SFFSDND---A---  驱逐舰
MilSIDC.Sea.FRIENDLY_SUBMARINE         // SFFSWCI---A---  潜艇
MilSIDC.Sea.HOSTILE_SURFACE            // SHFSNCI---H---
MilSIDC.Sea.HOSTILE_SUBMARINE          // SHFSWCI---H---

// ===== 通用快捷方式（友方版本）=====
MilSIDC.TANK          // 同 FRIENDLY_TANK
MilSIDC.INFANTRY
MilSIDC.UAV
MilSIDC.HELICOPTER
MilSIDC.SHIP
MilSIDC.SUBMARINE
MilSIDC.HEADQUARTERS
```

### 动态切换阵营

```typescript
import { resolveSidc, SymbolType, MilSIDC } from 'lcplot';

// 🔥 新方式：resolveSidc(type, identity) — 直接指定类型 + 敌我
resolveSidc(SymbolType.GROUND_TANK, 'hostile')    // → SHFGUCI---H---
resolveSidc(SymbolType.AIR_UAV, 'neutral')        // → SNFAPUAV--N---

// 旧方式：MilSIDC.withIdentity(sidc, identity)
const hostileSIDC = MilSIDC.withIdentity(MilSIDC.TANK, 'hostile');
// → 'SHFGUCI---H---'

// 阵营映射
MilSIDC.withIdentity(sidc, 'friend')     // → 友方
MilSIDC.withIdentity(sidc, 'hostile')    // → 敌方
MilSIDC.withIdentity(sidc, 'neutral')    // → 中立
MilSIDC.withIdentity(sidc, 'unknown')    // → 未知
```

### SIDC 格式说明

MIL-STD-2525D 编码为 15 位字符串：

```
位置: 0  1  2  3  4  5  6  7  8  9  10 11 12 13 14
例:   S  F  G  P  U  C  A  -  -  -  A  -  -  -
      ↑  ↑     ↑     ↑           ↑
      符号集  领域  功能编码     阵营
```

- **符号集**: SF=友方地面, SH=敌方地面, SN=中立, SU=未知
- **领域**: G=地面, A=空中, S=海上, W=水下, X=太空
- **功能编码**: UCI=坦克, UIA=步兵, UFA=火炮, 等
- **阵营**: A=友方, H=敌方, N=中立, U=未知

---

## 场景模式支持

Cesium 支持三种场景模式，所有图元自动适配：

### 模式

| 模式 | Cesium 枚举值 | 说明 |
|------|--------------|------|
| **3D** | `SceneMode.SCENE3D` | 标准三维地球（默认） |
| **2D** | `SceneMode.SCENE2D` | 平面投影地图 |
| **2.5D** | `SceneMode.COLUMBUS_VIEW` | 带高度信息的 2D 视图 |

### 适配规则

| 视觉元素 | 3D | 2D | 2.5D |
|---------|----|----|------|
| Billboard图标 | 面向相机，高度有效 | 始终可见 | 带高度偏移 |
| 3D模型 | 完整三维 | 不显示 | 不显示 |
| 标签 | 高度上方显示 | 贴图显示 | 保留高度 |

### 切换示例

```typescript
// 通过 Cesium Viewer 切换
viewer.scene.mode = Cesium.SceneMode.SCENE3D;        // 3D
viewer.scene.mode = Cesium.SceneMode.SCENE2D;        // 2D
viewer.scene.mode = Cesium.SceneMode.COLUMBUS_VIEW;  // 2.5D

// 或使用 Cesium 内置场景模式选择器（默认已启用）
// 右上角按钮可直接切换
```

### 坐标系统

所有位置参数统一为 **角度制经纬度 + 米高度**：

```typescript
position: [lng: number, lat: number, height: number]
// lng:     经度（度，东经为正）    例: 116.4
// lat:     纬度（度，北纬为正）    例: 39.9
// height:  高度（米，WGS84椭球）  例: 0
```

---

## 3D 模型过渡

近距离自动从 2D 图标平滑切换到 3D 模型。

### 配置

```typescript
const controller = new CesiumController(container, {}, {
  rendererMode: 'hybrid'
  // 距离阈值可在 BillboardCollection 配置中设置
});
```

或直接设置 BillboardCollection 配置：

```typescript
// BillboardCollectionRenderer 默认配置
{
  enableModelTransition: true,       // 启用 2D↔3D 过渡
  modelSwitchDistance: 5000          // 5km 内切换到 3D 模型
}
```

### 使用

```typescript
// 方式一：使用占位 3D 盒子（默认）
controller.createAdvancedPrimitive({
  sidc: MilSIDC.TANK,
  position: [116.4, 39.9, 0],
  visualization: {
    use3DModel: true       // 接近 5km 自动显示 3D 盒子
  }
});

// 方式二：使用自己的 glTF 模型
controller.createAdvancedPrimitive({
  sidc: MilSIDC.TANK,
  position: [116.4, 39.9, 0],
  visualization: {
    use3DModel: true,
    modelUrl: '/public/models/abrams.glb'   // 自备 glTF
  }
});
```

---

## 混合渲染引擎

LCPLOT 采用"路线 C"混合渲染策略，自动为图元选择最优渲染路径。

### 架构

```
CesiumController (rendererMode: 'hybrid')
    │
    ├── 简单图标（标准 MIL-STD-2525D）──── BillboardCollection
    │     └── 实例化渲染，支持 >50,000 图元
    │
    └── 3D 模型 / 自定义着色器 ──── Cesium.PrimitiveCollection
          └── 每个图元独立 Primitive，支持自定义 shader
```

### 渲染器模式对比

| 模式 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **hybrid** (推荐) | 自动路由，性能最优 | — | 所有场景 |
| **billboard** | 极高性能，简单可靠 | 不支持 3D 模型/着色器 | 仅需 2D 图标 |
| **entity** | 功能完整（交互/动画） | 性能瓶颈（>1000 图元） | 旧项目兼容 |

### 切换模式

```typescript
const controller = new CesiumController(container, {}, {
  rendererMode: 'hybrid'        // 'entity' | 'billboard' | 'hybrid'
});
```

### 获取当前渲染器

```typescript
// 获取当前模式
const mode = controller.getRendererMode();  // 'hybrid'

// 获取渲染器实例（用于直接调用）
const billboardRenderer = controller.getBillboardRenderer();
const hybridRenderer = controller.getHybridRenderer();
const entityRenderer = controller.getPrimitiveRenderer();
```

### 统计信息

```typescript
const billboardStats = billboardRenderer.getStats();
// {
//   activeBillboards: 55,
//   activeLabels: 55,
//   activeModels: 0,
//   totalCreated: 55,
//   totalDestroyed: 0,
//   lastFrameTime: 0
// }
```

---

## 事件系统

### 注册事件监听

```typescript
// 监听图元事件
controller.on(PrimitiveEventType.CLICK, (data) => {
  console.log('图元被点击:', data.primitiveId);
});

controller.on(PrimitiveEventType.DRAG_END, (data) => {
  console.log('拖拽结束，新位置:', data.position);
});
```

### 事件类型

| 事件常量 | 说明 | 数据 |
|---------|------|------|
| `PrimitiveEventType.CLICK` | 点击 | `{ primitiveId, position }` |
| `PrimitiveEventType.DOUBLE_CLICK` | 双击 | `{ primitiveId, position }` |
| `PrimitiveEventType.RIGHT_CLICK` | 右键 | `{ primitiveId, position }` |
| `PrimitiveEventType.SELECTED` | 选中 | `{ primitiveId, sidc }` |
| `PrimitiveEventType.DESELECTED` | 取消选中 | `{ primitiveId }` |
| `PrimitiveEventType.DRAG_START` | 拖拽开始 | `{ primitiveId, position }` |
| `PrimitiveEventType.DRAGGING` | 拖拽中 | `{ primitiveId, position }` |
| `PrimitiveEventType.DRAG_END` | 拖拽结束 | `{ primitiveId, position }` |
| `PrimitiveEventType.LABEL_DRAG_START` | 标牌拖拽开始 | `{ primitiveId }` |
| `PrimitiveEventType.LABEL_DRAGGING` | 标牌拖拽中 | `{ primitiveId }` |
| `PrimitiveEventType.LABEL_DRAG_END` | 标牌拖拽结束 | `{ primitiveId }` |
| `PrimitiveEventType.CREATED` | 图元创建 | `{ primitiveId, sidc }` |
| `PrimitiveEventType.REMOVED` | 图元删除 | `{ primitiveId }` |
| `PrimitiveEventType.UPDATED` | 图元更新 | `{ primitiveId, sidc }` |

---

## 查询与统计

### 查询图元

```typescript
// 全部
const allIds = controller.queryAdvancedPrimitives({});

// 按阵营过滤
const friendIds = controller.queryAdvancedPrimitives({
  identity: 'friend'
});

// 按领域过滤
const airIds = controller.queryAdvancedPrimitives({
  domain: MilitaryDomain.AIR
});

// 按空间范围
const boundsIds = controller.queryAdvancedPrimitives({
  bounds: [[116.3, 39.8], [116.5, 40.0]]
});

// 多条件
const results = controller.queryAdvancedPrimitives({
  identity: ['friend', 'neutral'],
  domain: MilitaryDomain.LAND,
  bounds: [[116.3, 39.8], [116.5, 40.0]]
});
```

### 查询选项 (PrimitiveQueryOptions)

| 属性 | 类型 | 说明 |
|------|------|------|
| `bounds` | `[[lng, lat], [lng, lat]]` | 空间范围 [西南, 东北] |
| `center` | `[lng, lat, height]` | 中心点（配合 radius） |
| `radius` | `number` | 查询半径（米） |
| `domain` | `MilitaryDomain` | 领域过滤 |
| `identity` | `IdentityCode \| IdentityCode[]` | 阵营过滤 |
| `status` | `StatusCode \| StatusCode[]` | 状态过滤 |
| `sidcPattern` | `string` | SIDC 通配符 |
| `limit` | `number` | 分页上限 |
| `offset` | `number` | 分页偏移 |

---

## 导出类型速查

### 军标类型 (SymbolType)

```typescript
import { SymbolType } from 'lcplot';

// 地面 (22种)
SymbolType.GROUND_TANK                  // 坦克
SymbolType.GROUND_INFANTRY              // 步兵
SymbolType.GROUND_MECHANIZED            // 机械化
SymbolType.GROUND_ARTILLERY             // 火炮
SymbolType.GROUND_AIR_DEFENSE           // 防空
SymbolType.GROUND_RECON                 // 侦察
SymbolType.GROUND_ENGINEER              // 工兵
SymbolType.GROUND_HEADQUARTERS          // 指挥部
SymbolType.GROUND_MEDICAL               // 医疗
SymbolType.GROUND_SUPPLY                // 补给
SymbolType.GROUND_MAINTENANCE           // 维修
SymbolType.GROUND_MORTAR                // 迫击炮
SymbolType.GROUND_MISSILE               // 导弹
SymbolType.GROUND_BRIDGE                // 桥梁
SymbolType.GROUND_RADAR                 // 雷达
SymbolType.GROUND_SIGNAL                // 通信
SymbolType.GROUND_TRANSPORT             // 运输
SymbolType.GROUND_MILITARY_POLICE       // 宪兵
SymbolType.GROUND_CBRN                  // 防化
SymbolType.GROUND_MILITARY_INTELLIGENCE // 军事情报

// 空中 (8种)
SymbolType.AIR_FIXED_WING              // 固定翼飞机
SymbolType.AIR_HELICOPTER              // 直升机
SymbolType.AIR_UAV                     // 无人机
SymbolType.AIR_MISSILE                 // 空射导弹
SymbolType.AIR_AWACS                   // 预警机
SymbolType.AIR_TANKER                  // 加油机
SymbolType.AIR_TRANSPORT               // 运输机
SymbolType.AIR_ATTACK_HELICOPTER       // 武装直升机

// 海上 (10种)
SymbolType.SEA_SURFACE_COMBATANT       // 水面战斗舰艇
SymbolType.SEA_CARRIER                 // 航母
SymbolType.SEA_DESTROYER               // 驱逐舰
SymbolType.SEA_FRIGATE                 // 护卫舰
SymbolType.SEA_SUBMARINE               // 潜艇
SymbolType.SEA_LANDING                 // 登陆舰
SymbolType.SEA_PATROL                  // 巡逻艇
SymbolType.SEA_MINE_WARFARE            // 扫雷舰
SymbolType.SEA_AMPHIBIOUS              // 两栖舰
SymbolType.SEA_MERCHANT                // 商船

// 特种作战 (3种)
SymbolType.SOF_TEAM                    // 特种作战小队
SymbolType.SOF_AVIATION                // 特种作战航空
SymbolType.SOF_NAVAL                   // 特种作战海上
```

### 核心函数

```typescript
import { resolveSidc, identityFromSidc, SymbolType } from 'lcplot';

// 类型 + 敌我 → 15 位 SIDC
resolveSidc(SymbolType.GROUND_TANK, 'hostile')   // → 'SHFGUCI---H---'

// SIDC → 敌我属性
identityFromSidc('SFGPUCA---A---')               // → 'friend'
identityFromSidc('SHFGUCI---H---')               // → 'hostile'
```

### 阵营 (IdentityCode)

```typescript
IdentityCode.FRIEND           // 'friend'   友方（蓝）
IdentityCode.HOSTILE          // 'hostile'  敌方（红）
IdentityCode.NEUTRAL          // 'neutral' 中立（绿）
IdentityCode.UNKNOWN          // 'unknown' 未知（黄）
IdentityCode.PENDING          // 'pending' 待定（青）
IdentityCode.ASSUMED_FRIEND   // 'assumed_friend' 推定友方
IdentityCode.SUSPECT          // 'suspect' 嫌疑
```

### 领域 (MilitaryDomain)

```typescript
MilitaryDomain.LAND          // 陆地
MilitaryDomain.AIR           // 空中
MilitaryDomain.SEA           // 海上
MilitaryDomain.SPACE         // 太空
MilitaryDomain.SUBSURFACE    // 水下
MilitaryDomain.SOF           // 特种作战
MilitaryDomain.CYBER         // 网络
MilitaryDomain.SIGNAL        // 信号
MilitaryDomain.ACTIVITY      // 活动
```

### 状态 (StatusCode)

```typescript
StatusCode.PRESENT          // 存在
StatusCode.PLANNED          // 计划中
StatusCode.DAMAGED          // 受损
StatusCode.DESTROYED        // 被毁
```

---

## 完整示例

### 🆕 简化 API 示例：`addSymbol()` + `SymbolType`

```typescript
import { CesiumController, SymbolType } from 'lcplot';

const ctrl = new CesiumController(document.getElementById('map'));
ctrl.init();

// —— 只需指定类型 + 敌我（默认 friend）——

// 友方坦克
ctrl.addSymbol({
  type: SymbolType.GROUND_TANK,
  position: [116.38, 39.91, 0],
  name: '第1坦克营'
});

// 敌方坦克
ctrl.addSymbol({
  type: SymbolType.GROUND_TANK,
  identity: 'hostile',
  position: [116.42, 39.88, 0],
  name: '敌方装甲连'
});

// 中立直升机
ctrl.addSymbol({
  type: SymbolType.AIR_HELICOPTER,
  identity: 'neutral',
  position: [116.4, 39.9, 300],
  name: '民用直升机'
});

// 航母
ctrl.addSymbol({
  type: SymbolType.SEA_CARRIER,
  position: [118.0, 38.5, 0],
  name: '辽宁舰'
});

// 敌军潜艇
ctrl.addSymbol({
  type: SymbolType.SEA_SUBMARINE,
  identity: 'hostile',
  position: [118.2, 38.3, -50],
  name: '不明潜艇'
});
```

### 基本示例：创建多阵营图元

```typescript
import { CesiumController, MilSIDC } from 'lcplot';

const ctrl = new CesiumController(
  document.getElementById('map'),
  {},
  { rendererMode: 'hybrid' }
);
ctrl.init();

// 创建友方坦克
ctrl.createAdvancedPrimitive({
  sidc: MilSIDC.Ground.FRIENDLY_TANK,
  position: [116.38, 39.91, 0],
  properties: { identity: 'friend', name: '第1坦克营' }
});

// 创建敌方单位
ctrl.createAdvancedPrimitive({
  sidc: MilSIDC.withIdentity(MilSIDC.TANK, 'hostile'),
  position: [116.42, 39.88, 0],
  properties: { identity: 'hostile', name: '敌方装甲连' }
});

// 创建无人机
ctrl.createAdvancedPrimitive({
  sidc: MilSIDC.Air.FRIENDLY_UAV,
  position: [116.4, 39.9, 500],
  properties: { identity: 'friend', name: '侦察无人机' }
});

// 创建舰船
ctrl.createAdvancedPrimitive({
  sidc: MilSIDC.Sea.FRIENDLY_SURFACE,
  position: [118.0, 38.5, 0],
  properties: { identity: 'friend', name: '驱逐舰' }
});
```

### React 集成示例

```tsx
import { useEffect, useRef, useState } from 'react';
import { CesiumController, SymbolType } from 'lcplot';

function MapComponent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [controller, setController] = useState<CesiumController | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 方式一（推荐）：LCPLOT 自动创建 Viewer
    const ctrl = new CesiumController(containerRef.current);
    ctrl.init();
    
    // 方式二：接入已有 Viewer
    // const viewer = new Cesium.Viewer(containerRef.current, {...});
    // const ctrl = new CesiumController(containerRef.current);
    // ctrl.initWithViewer(viewer);

    setController(ctrl);
    return () => ctrl.destroy();
  }, []);

  const addTank = async () => {
    if (!controller) return;
    await controller.addSymbol({
      type: SymbolType.GROUND_TANK,       // 坦克
      identity: 'friend',                  // 友方（默认）
      position: [116.4, 39.9, 0],
      name: '第1坦克营'
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <button onClick={addTank} style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10
      }}>
        添加坦克
      </button>
    </div>
  );
}
```

### SIDC 验证工具

```typescript
import { SIDCValidator, resolveSidc, identityFromSidc, SymbolType } from 'lcplot';

// 验证 SIDC 格式
SIDCValidator.validate('SFGPUCA---A---');   // true
SIDCValidator.validate('invalid');            // false

// 补全到 15 位
SIDCValidator.normalize('SFGPUCA');           // 'SFGPUCA--------'

// 解析领域
SIDCValidator.parseDomain('SFGPUCA---A---');  // MilitaryDomain.LAND

// 检查是否为有效美军标
SIDCValidator.isMilStd2525D('SFGPUCA---A---'); // true

// 用 SymbolType 生成 SIDC 并验证
const sidc = resolveSidc(SymbolType.AIR_UAV, 'hostile');
SIDCValidator.validate(sidc);                  // true

// 从任意 SIDC 提取敌我
identityFromSidc('SHFGUCI---H---');            // 'hostile'
identityFromSidc('SFGPUCA---A---');            // 'friend'
```

### 图标符号库

```typescript
import { SymbolLibrary } from 'lcplot';

const lib = new SymbolLibrary({
  baseUrl: '/mil-icons',
  format: 'svg',
  size: [64, 64],
  cacheEnabled: true
});

// 加载符号
const img = await lib.loadSymbol('SFGPUCA---A---');

// 批量预加载
await lib.preloadSymbols([
  'SFGPUCA---A---',
  'SHFGUCI---H---'
]);
```
