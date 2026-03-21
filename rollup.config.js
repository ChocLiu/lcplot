import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

export default defineConfig([
  // CommonJS output
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/lcplot.cjs.js',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external: ['cesium', 'ol', 'cesium/Build/Cesium/Widgets/widgets.css'],
  },
  // ES module output
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/lcplot.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external: ['cesium', 'ol', 'cesium/Build/Cesium/Widgets/widgets.css'],
  },
  // UMD output for browser
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/lcplot.umd.js',
      format: 'umd',
      name: 'lcplot',
      sourcemap: true,
      globals: {
        'cesium': 'Cesium',
        'ol': 'ol'
      },
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
    external: ['cesium', 'ol', 'cesium/Build/Cesium/Widgets/widgets.css'],
  },
]);