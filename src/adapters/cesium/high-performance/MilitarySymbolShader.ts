/**
 * 军事符号着色器
 * 实现 MIL-STD-2525D 符号的 GPU 渲染逻辑
 */

/**
 * 着色器配置
 */
export interface ShaderConfig {
  precision: 'highp' | 'mediump' | 'lowp';
  enableAdvancedEffects: boolean;
  enableAntialiasing: boolean;
  enableShadows: boolean;
  debugMode: boolean;
}

/**
 * 着色器统一变量
 */
export interface ShaderUniforms {
  // 变换矩阵
  modelViewProjection: WebGLUniformLocation | null;
  
  // 纹理
  symbolAtlas: WebGLUniformLocation | null;
  textureSize: WebGLUniformLocation | null;
  
  // 时间（用于动画）
  time: WebGLUniformLocation | null;
  
  // 渲染效果
  highlightColor: WebGLUniformLocation | null;
  borderColor: WebGLUniformLocation | null;
  borderWidth: WebGLUniformLocation | null;
  
  // 调试
  debugMode: WebGLUniformLocation | null;
}

/**
 * 着色器属性
 */
export interface ShaderAttributes {
  // 基本几何属性
  position: number;
  texCoord: number;
  
  // 实例属性
  instancePosition: number;
  instanceColor: number;
  instanceUv: number;
  instanceScale: number;
  instanceRotation: number;
  instanceId: number;
}

/**
 * 军事符号着色器
 */
export class MilitarySymbolShader {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private config: ShaderConfig;
  
  // 着色器源码
  private vertexShaderSource: string;
  private fragmentShaderSource: string;
  
  // 统一变量和属性位置
  private uniforms: ShaderUniforms;
  private attributes: ShaderAttributes;
  
  constructor(gl: WebGLRenderingContext, config?: Partial<ShaderConfig>) {
    this.gl = gl;
    this.config = {
      precision: 'mediump',
      enableAdvancedEffects: true,
      enableAntialiasing: true,
      enableShadows: false,
      debugMode: false,
      ...config
    };
    
    // 初始化统一变量和属性
    this.uniforms = this.createUniforms();
    this.attributes = this.createAttributes();
    
    // 生成着色器源码
    this.vertexShaderSource = this.generateVertexShader();
    this.fragmentShaderSource = this.generateFragmentShader();
    
    // 编译着色器
    this.compile();
  }
  
  /**
   * 编译着色器程序
   */
  compile(): void {
    try {
      // 创建着色器程序
      this.program = this.gl.createProgram();
      if (!this.program) {
        throw new Error('Failed to create WebGL program');
      }
      
      // 编译顶点着色器
      const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, this.vertexShaderSource);
      if (!vertexShader) {
        throw new Error('Failed to compile vertex shader');
      }
      
      // 编译片元着色器
      const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, this.fragmentShaderSource);
      if (!fragmentShader) {
        throw new Error('Failed to compile fragment shader');
      }
      
      // 附加着色器
      this.gl.attachShader(this.program, vertexShader);
      this.gl.attachShader(this.program, fragmentShader);
      
      // 链接程序
      this.gl.linkProgram(this.program);
      
      // 检查链接状态
      if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
        const error = this.gl.getProgramInfoLog(this.program);
        throw new Error(`Failed to link shader program: ${error}`);
      }
      
      // 获取统一变量位置
      this.getUniformLocations();
      
      // 获取属性位置
      this.getAttributeLocations();
      
      console.log('MilitarySymbolShader compiled successfully');
    } catch (error) {
      console.error('Failed to compile MilitarySymbolShader:', error);
      throw error;
    }
  }
  
  /**
   * 使用着色器程序
   */
  use(): void {
    if (!this.program) {
      throw new Error('Shader program not compiled');
    }
    this.gl.useProgram(this.program);
  }
  
  /**
   * 设置统一变量
   */
  setUniforms(uniformValues: Partial<Record<keyof ShaderUniforms, any>>): void {
    if (!this.program) return;
    
    this.use();
    
    for (const [key, value] of Object.entries(uniformValues)) {
      const uniform = this.uniforms[key as keyof ShaderUniforms];
      if (uniform !== null && uniform !== undefined) {
        this.setUniform(uniform, value);
      }
    }
  }
  
  /**
   * 启用属性
   */
  enableAttributes(): void {
    if (!this.program) return;
    
    // 启用标准属性
    if (this.attributes.position >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.position);
    }
    if (this.attributes.texCoord >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.texCoord);
    }
    
    // 启用实例属性
    if (this.attributes.instancePosition >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.instancePosition);
      (this.gl as any).vertexAttribDivisor(this.attributes.instancePosition, 1);
    }
    if (this.attributes.instanceColor >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.instanceColor);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceColor, 1);
    }
    if (this.attributes.instanceUv >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.instanceUv);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceUv, 1);
    }
    if (this.attributes.instanceScale >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.instanceScale);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceScale, 1);
    }
    if (this.attributes.instanceRotation >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.instanceRotation);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceRotation, 1);
    }
    if (this.attributes.instanceId >= 0) {
      this.gl.enableVertexAttribArray(this.attributes.instanceId);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceId, 1);
    }
  }
  
  /**
   * 禁用属性
   */
  disableAttributes(): void {
    // 禁用标准属性
    if (this.attributes.position >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.position);
    }
    if (this.attributes.texCoord >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.texCoord);
    }
    
    // 禁用实例属性
    if (this.attributes.instancePosition >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.instancePosition);
      (this.gl as any).vertexAttribDivisor(this.attributes.instancePosition, 0);
    }
    if (this.attributes.instanceColor >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.instanceColor);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceColor, 0);
    }
    if (this.attributes.instanceUv >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.instanceUv);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceUv, 0);
    }
    if (this.attributes.instanceScale >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.instanceScale);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceScale, 0);
    }
    if (this.attributes.instanceRotation >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.instanceRotation);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceRotation, 0);
    }
    if (this.attributes.instanceId >= 0) {
      this.gl.disableVertexAttribArray(this.attributes.instanceId);
      (this.gl as any).vertexAttribDivisor(this.attributes.instanceId, 0);
    }
  }
  
  /**
   * 销毁资源
   */
  destroy(): void {
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
  }
  
  // ============ 私有方法 ============
  
  /**
   * 创建统一变量结构
   */
  private createUniforms(): ShaderUniforms {
    return {
      modelViewProjection: null,
      symbolAtlas: null,
      textureSize: null,
      time: null,
      highlightColor: null,
      borderColor: null,
      borderWidth: null,
      debugMode: null
    };
  }
  
  /**
   * 创建属性结构
   */
  private createAttributes(): ShaderAttributes {
    return {
      position: -1,
      texCoord: -1,
      instancePosition: -1,
      instanceColor: -1,
      instanceUv: -1,
      instanceScale: -1,
      instanceRotation: -1,
      instanceId: -1
    };
  }
  
  /**
   * 生成顶点着色器源码
   */
  private generateVertexShader(): string {
    const precision = this.config.precision;
    
    return `
#version 100
precision ${precision} float;

// 标准属性
attribute vec3 aPosition;
attribute vec2 aTexCoord;

// 实例属性（每实例）
attribute vec3 aInstancePosition;    // 世界坐标
attribute vec4 aInstanceColor;       // RGBA 颜色
attribute vec4 aInstanceUv;          // uv1, uv2 (u1, v1, u2, v2)
attribute float aInstanceScale;      // 缩放
attribute float aInstanceRotation;   // 旋转角度（弧度）
attribute float aInstanceId;         // 实例 ID

// 统一变量
uniform mat4 uModelViewProjection;
uniform vec2 uTextureSize;
uniform float uTime;

// 传递给片元着色器的变量
varying vec2 vTexCoord;
varying vec4 vColor;
varying float vInstanceId;
varying vec2 vUvCoord;

// 旋转函数
vec2 rotate(vec2 v, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  mat2 m = mat2(c, -s, s, c);
  return m * v;
}

void main() {
  // 应用实例变换
  vec2 rotatedPosition = rotate(aPosition.xy, aInstanceRotation);
  vec2 scaledPosition = rotatedPosition * aInstanceScale;
  
  // 计算世界位置
  vec4 worldPosition = vec4(
    aInstancePosition.x + scaledPosition.x,
    aInstancePosition.y + scaledPosition.y,
    aInstancePosition.z + aPosition.z,
    1.0
  );
  
  // 计算裁剪空间位置
  gl_Position = uModelViewProjection * worldPosition;
  
  // 传递变量到片元着色器
  vTexCoord = aTexCoord;
  vColor = aInstanceColor;
  vInstanceId = aInstanceId;
  
  // 计算实际 UV 坐标（从纹理图集）
  vec2 uv1 = aInstanceUv.xy;  // 左上角
  vec2 uv2 = aInstanceUv.zw;  // 右下角
  vUvCoord = mix(uv1, uv2, aTexCoord);
  
  // 调试模式：显示实例边界
  #ifdef DEBUG_MODE
    gl_Position += vec4(0.0, 0.0, 0.001 * aInstanceId, 0.0);
  #endif
}
`;
  }
  
  /**
   * 生成片元着色器源码
   */
  private generateFragmentShader(): string {
    const precision = this.config.precision;
    const enableAdvancedEffects = this.config.enableAdvancedEffects;
    const enableAntialiasing = this.config.enableAntialiasing;
    const debugMode = this.config.debugMode;
    
    return `
#version 100
precision ${precision} float;

// 输入变量
varying vec2 vTexCoord;
varying vec4 vColor;
varying float vInstanceId;
varying vec2 vUvCoord;

// 统一变量
uniform sampler2D uSymbolAtlas;
uniform vec2 uTextureSize;
uniform float uTime;
uniform vec4 uHighlightColor;
uniform vec4 uBorderColor;
uniform float uBorderWidth;
uniform bool uDebugMode;

// 颜色混合函数
vec4 blendColor(vec4 baseColor, vec4 overlayColor) {
  return mix(baseColor, overlayColor, overlayColor.a);
}

// 边框检测函数
float getBorderAlpha(vec2 uv, float width) {
  vec2 d = fwidth(uv);
  vec2 border = smoothstep(vec2(0.0), d * width, uv) *
                smoothstep(vec2(1.0), vec2(1.0) - d * width, uv);
  return border.x * border.y;
}

// 阵营颜色叠加
vec4 applyIdentityColor(vec4 texel, vec4 identityColor) {
  if (texel.a < 0.01) {
    return vec4(0.0);
  }
  
  // 保留纹理的 alpha，叠加阵营颜色
  vec3 blendedColor = mix(texel.rgb, identityColor.rgb, 0.7);
  return vec4(blendedColor, texel.a * identityColor.a);
}

void main() {
  // 纹理采样
  vec4 texel = texture2D(uSymbolAtlas, vUvCoord);
  
  // 透明像素丢弃（优化性能）
  if (texel.a < 0.01) {
    discard;
  }
  
  // 应用阵营颜色
  vec4 coloredTexel = applyIdentityColor(texel, vColor);
  
  // 高级特效
  vec4 finalColor = coloredTexel;
  
  ${enableAdvancedEffects ? `
  // 边框效果
  float borderAlpha = getBorderAlpha(vTexCoord, uBorderWidth);
  if (borderAlpha < 0.5) {
    finalColor = blendColor(finalColor, uBorderColor);
  }
  
  // 高亮效果（例如选中状态）
  if (uHighlightColor.a > 0.01) {
    float highlight = sin(uTime * 3.0) * 0.3 + 0.7;
    finalColor.rgb = mix(finalColor.rgb, uHighlightColor.rgb, uHighlightColor.a * highlight);
  }
  
  // 发光效果（重要目标）
  float glow = 0.0;
  if (mod(vInstanceId, 10.0) < 0.5) { // 每10个实例有一个发光
    glow = sin(uTime * 2.0) * 0.2 + 0.1;
    finalColor.rgb += vec3(glow);
  }
  ` : ''}
  
  ${enableAntialiasing ? `
  // 抗锯齿边缘
  float edgeAlpha = smoothstep(0.0, 0.1, texel.a);
  finalColor.a *= edgeAlpha;
  ` : ''}
  
  ${debugMode ? `
  // 调试模式：显示不同信息
  if (uDebugMode) {
    // 按实例ID着色
    float hue = mod(vInstanceId * 0.1, 1.0);
    finalColor = vec4(hue, 0.5, 0.5, 1.0);
    
    // 显示UV坐标
    // finalColor.rg = vUvCoord;
    // finalColor.ba = vec2(1.0);
  }
  ` : ''}
  
  // 最终输出
  gl_FragColor = finalColor;
  
  // Alpha 预乘（避免混合问题）
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
  }
  
  /**
   * 编译单个着色器
   */
  private compileShader(type: number, source: string): WebGLShader | null {
    const shader = this.gl.createShader(type);
    if (!shader) {
      console.error('Failed to create shader');
      return null;
    }
    
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    // 检查编译状态
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      console.error(`Shader compilation error:\n${source}\n${error}`);
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  /**
   * 获取统一变量位置
   */
  private getUniformLocations(): void {
    if (!this.program) return;
    
    this.uniforms.modelViewProjection = this.gl.getUniformLocation(this.program, 'uModelViewProjection');
    this.uniforms.symbolAtlas = this.gl.getUniformLocation(this.program, 'uSymbolAtlas');
    this.uniforms.textureSize = this.gl.getUniformLocation(this.program, 'uTextureSize');
    this.uniforms.time = this.gl.getUniformLocation(this.program, 'uTime');
    this.uniforms.highlightColor = this.gl.getUniformLocation(this.program, 'uHighlightColor');
    this.uniforms.borderColor = this.gl.getUniformLocation(this.program, 'uBorderColor');
    this.uniforms.borderWidth = this.gl.getUniformLocation(this.program, 'uBorderWidth');
    this.uniforms.debugMode = this.gl.getUniformLocation(this.program, 'uDebugMode');
  }
  
  /**
   * 获取属性位置
   */
  private getAttributeLocations(): void {
    if (!this.program) return;
    
    this.attributes.position = this.gl.getAttribLocation(this.program, 'aPosition');
    this.attributes.texCoord = this.gl.getAttribLocation(this.program, 'aTexCoord');
    this.attributes.instancePosition = this.gl.getAttribLocation(this.program, 'aInstancePosition');
    this.attributes.instanceColor = this.gl.getAttribLocation(this.program, 'aInstanceColor');
    this.attributes.instanceUv = this.gl.getAttribLocation(this.program, 'aInstanceUv');
    this.attributes.instanceScale = this.gl.getAttribLocation(this.program, 'aInstanceScale');
    this.attributes.instanceRotation = this.gl.getAttribLocation(this.program, 'aInstanceRotation');
    this.attributes.instanceId = this.gl.getAttribLocation(this.program, 'aInstanceId');
  }
  
  /**
   * 设置统一变量值
   */
  private setUniform(location: WebGLUniformLocation, value: any): void {
    if (value === null || value === undefined) return;
    
    if (typeof value === 'number') {
      this.gl.uniform1f(location, value);
    } else if (value.length === 2) {
      this.gl.uniform2f(location, value[0], value[1]);
    } else if (value.length === 3) {
      this.gl.uniform3f(location, value[0], value[1], value[2]);
    } else if (value.length === 4) {
      this.gl.uniform4f(location, value[0], value[1], value[2], value[3]);
    } else if (value instanceof Float32Array && value.length === 16) {
      this.gl.uniformMatrix4fv(location, false, value);
    } else if (typeof value === 'boolean') {
      this.gl.uniform1i(location, value ? 1 : 0);
    } else {
      console.warn('Unsupported uniform value type:', typeof value, value);
    }
  }
  
  /**
   * 获取程序对象
   */
  getProgram(): WebGLProgram | null {
    return this.program;
  }
  
  /**
   * 获取统一变量
   */
  getUniforms(): ShaderUniforms {
    return { ...this.uniforms };
  }
  
  /**
   * 获取属性
   */
  getAttributes(): ShaderAttributes {
    return { ...this.attributes };
  }
  
  /**
   * 检查是否已编译
   */
  isCompiled(): boolean {
    return this.program !== null;
  }
}