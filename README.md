# lcplot

A unified plotting library for multiple GIS engines (OpenLayers, Cesium, etc.). Write once, run on any supported engine.

## Features

- **Unified API**: Consistent interface across different GIS engines.
- **Extensible Architecture**: Easy to add new engine adapters.
- **Rich Functionality**:
  - Map control (center, zoom, rotation, bounds)
  - Layer management (add, remove, show/hide, opacity, z-index)
  - Geometry drawing (point, line, polygon, circle, rectangle, ellipse)
  - Interactive drawing
  - Measurement tools (distance, area, angle)
  - Common plotting (military symbols, annotations, etc.)
- **TypeScript Support**: Full type definitions.

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

### Drawing Geometry

```javascript
const geometryId = map.drawGeometry({
  type: 'Polygon',
  coordinates: [[[116, 39], [117, 39], [117, 40], [116, 40], [116, 39]]]
}, {
  fill: { color: 'red', opacity: 0.5 },
  stroke: { color: 'black', width: 2 }
});
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

## Architecture

The library follows an adapter pattern:

- **Core**: Abstract `MapController` class defines the unified interface.
- **Adapters**: Engine-specific implementations (OpenLayersController, CesiumController).
- **Factory**: `MapFactory` creates the appropriate controller based on engine type.

### Adding a New Engine

1. Create a new adapter class extending `MapController`.
2. Implement all abstract methods.
3. Register the adapter in `MapFactory` (or use a plugin system).

## Building from Source

```bash
git clone <repository>
cd lcplot
npm install
npm run build
```

## License

MIT