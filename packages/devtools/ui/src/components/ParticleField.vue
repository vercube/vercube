<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    resolution?: number;
    planeScale?: number;
    camera?: [number, number, number];
    focus?: number;
    aperture?: number;
    pointSize?: number;
    opacity?: number;
    spread?: number;
  }>(),
  {
    resolution: 380,
    planeScale: 10,
    camera: () => [1.263, 2.665, -1.818],
    focus: 3.8,
    aperture: 1.79,
    pointSize: 10,
    opacity: 0.19,
    spread: 15,
  },
);

const canvas = ref<HTMLCanvasElement | null>(null);

let gl: WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let frame = 0;
let start = 0;
let visible = true;
let observer: IntersectionObserver | null = null;
const uniforms: Record<string, WebGLUniformLocation | null> = {};

const NOISE = /* glsl */ `
float periodicNoise(vec3 p, float time) {
  float noise = 0.0;
  noise += sin(p.x * 2.0 + time) * cos(p.z * 1.5 + time);
  noise += sin(p.x * 3.2 + time * 2.0) * cos(p.z * 2.1 + time) * 0.6;
  noise += sin(p.x * 1.7 + time) * cos(p.z * 2.8 + time * 3.0) * 0.4;
  noise += sin(p.x * p.z * 0.5 + time * 2.0) * 0.3;
  return noise * 0.3;
}`;

const VERTEX = /* glsl */ `#version 300 es
precision highp float;

in vec2 aGrid;

uniform mat4 uProjection;
uniform mat4 uView;
uniform float uTime;
uniform float uFocus;
uniform float uBlur;
uniform float uPointSize;
uniform float uScale;
uniform float uPixelRatio;

out float vDistance;
out float vPosY;
out vec3 vWorld;
out vec3 vInitial;

${NOISE}

void main() {
  vec3 origin = vec3((aGrid.x - 0.5) * 2.0 * uScale, 0.0, (aGrid.y - 0.5) * 2.0 * uScale);

  float t = uTime * (6.28318530718 / 24.0);
  vec3 field = origin * 0.6;

  vec3 drift = vec3(
    periodicNoise(field, t),
    periodicNoise(field + vec3(50.0, 0.0, 0.0), t + 2.094),
    periodicNoise(field + vec3(0.0, 50.0, 0.0), t + 4.188)
  ) * 0.52;

  vec3 position = origin + drift;
  vec4 viewPosition = uView * vec4(position, 1.0);

  gl_Position = uProjection * viewPosition;

  vDistance = abs(uFocus + viewPosition.z);
  vPosY = position.y;
  vWorld = position;
  vInitial = origin;

  gl_PointSize = clamp(vDistance * uBlur * uPointSize, 1.0, 48.0) * uPixelRatio;
}`;

const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in float vDistance;
in float vPosY;
in vec3 vWorld;
in vec3 vInitial;

uniform float uTime;
uniform float uOpacity;
uniform float uReveal;
uniform float uRevealProgress;
uniform vec3 uNear;
uniform vec3 uFar;
uniform float uScale;

out vec4 fragColor;

${NOISE}

float sparkle(vec3 seed, float time) {
  float hash = fract(sin(seed.x * 127.1 + seed.y * 311.7 + seed.z * 74.7) * 43758.5453);

  float value = 0.0;
  value += sin(time + hash * 6.28318) * 0.5;
  value += sin(time * 1.7 + hash * 12.56636) * 0.3;
  value += sin(time * 0.8 + hash * 18.84954) * 0.2;

  float other = fract(sin(seed.x * 113.5 + seed.y * 271.9 + seed.z * 97.3) * 37849.3241);
  float mask = sin(other * 6.28318) * 0.7 + sin(other * 12.56636) * 0.3;

  if (mask < 0.3) {
    value *= 0.05;
  }

  float normalized = (value + 1.0) * 0.5;
  float weight = normalized * normalized;
  return 0.7 + mix(normalized, pow(normalized, 4.0), weight) * 1.3;
}

void main() {
  vec2 point = 2.0 * gl_PointCoord - 1.0;

  if (length(point) > 1.0) {
    discard;
  }

  float radius = length(vWorld.xz);
  float threshold = uReveal + periodicNoise(vInitial * 4.0, 0.0) * 0.3;
  float reveal = 1.0 - smoothstep(threshold - 0.2, threshold + 0.1, radius);

  float brightness = sparkle(vInitial, uTime);
  float alpha =
    (1.04 - clamp(vDistance, 0.0, 1.0)) *
    clamp(smoothstep(-0.5, 0.25, vPosY), 0.0, 1.0) *
    uOpacity * reveal * uRevealProgress * brightness;

  vec3 tint = mix(uNear, uFar, clamp(radius / (uScale * 0.9), 0.0, 1.0));

  fragColor = vec4(tint, clamp(alpha, 0.0, 1.0));
}`;

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const range = 1 / (near - far);

  // prettier-ignore
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}

function lookAtOrigin(eye: readonly [number, number, number]): Float32Array {
  const [ex, ey, ez] = eye;
  const length = Math.hypot(ex, ey, ez) || 1;
  const zx = ex / length;
  const zy = ey / length;
  const zz = ez / length;

  let xx = zz;
  let xy = 0;
  let xz = -zx;
  const xLength = Math.hypot(xx, xy, xz) || 1;
  xx /= xLength;
  xy /= xLength;
  xz /= xLength;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  // prettier-ignore
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ]);
}

function compile(context: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = context.createShader(type);

  if (!shader) {
    return null;
  }

  context.shaderSource(shader, source);
  context.compileShader(shader);

  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    context.deleteShader(shader);
    return null;
  }

  return shader;
}

function resize(): boolean {
  const element = canvas.value;

  if (!element || !gl) {
    return false;
  }

  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.round(element.clientWidth * ratio);
  const height = Math.round(element.clientHeight * ratio);

  if (width === 0 || height === 0) {
    return false;
  }

  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }

  gl.viewport(0, 0, width, height);
  gl.uniformMatrix4fv(uniforms.uProjection, false, perspective(50, width / height, 0.01, 300));
  gl.uniform1f(uniforms.uPixelRatio, ratio);

  return true;
}

const REVEAL_SECONDS = 3.5;

/** Frames spent waiting for the canvas to get a layout size before giving up. */
const MAX_RESIZE_RETRIES = 120;

let retries = 0;

function draw(now: number): void {
  if (!gl || !resize()) {
    // The canvas has no layout size yet. Retry for a while, then stop, so a
    // hidden or reduced-motion field never spins at the display refresh rate.
    if (gl && retries < MAX_RESIZE_RETRIES) {
      retries++;
      frame = requestAnimationFrame(draw);
    }

    return;
  }

  retries = 0;

  if (start === 0) {
    start = now;
  }

  const time = (now - start) / 1000;
  const progress = Math.min(time / REVEAL_SECONDS, 1);
  const eased = 1 - (1 - progress) ** 3;

  gl.uniform1f(uniforms.uTime, time);
  gl.uniform1f(uniforms.uReveal, eased * props.spread);
  gl.uniform1f(uniforms.uRevealProgress, eased);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.POINTS, 0, props.resolution * props.resolution);

  if (visible) {
    frame = requestAnimationFrame(draw);
  }
}

function init(): boolean {
  const element = canvas.value;

  if (!element) {
    return false;
  }

  gl = element.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false, depth: false });

  if (!gl) {
    return false;
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  program = gl.createProgram();

  if (!vertex || !fragment || !program) {
    gl = null;
    return false;
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl = null;
    return false;
  }

  gl.useProgram(program);

  const count = props.resolution * props.resolution;
  const grid = new Float32Array(count * 2);

  for (let index = 0; index < count; index++) {
    grid[index * 2] = (index % props.resolution) / (props.resolution - 1);
    grid[index * 2 + 1] = Math.floor(index / props.resolution) / (props.resolution - 1);
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, grid, gl.STATIC_DRAW);

  const location = gl.getAttribLocation(program, 'aGrid');
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

  for (const name of [
    'uProjection',
    'uView',
    'uTime',
    'uFocus',
    'uBlur',
    'uPointSize',
    'uScale',
    'uPixelRatio',
    'uOpacity',
    'uReveal',
    'uRevealProgress',
    'uNear',
    'uFar',
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  gl.uniformMatrix4fv(uniforms.uView, false, lookAtOrigin(props.camera));
  gl.uniform1f(uniforms.uFocus, props.focus);
  gl.uniform1f(uniforms.uBlur, props.aperture);
  gl.uniform1f(uniforms.uPointSize, props.pointSize);
  gl.uniform1f(uniforms.uScale, props.planeScale);
  gl.uniform1f(uniforms.uOpacity, props.opacity);
  gl.uniform3f(uniforms.uNear, 1, 0.93, 1);
  gl.uniform3f(uniforms.uFar, 0.72, 0.82, 1);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return true;
}

onMounted(() => {
  if (!init()) {
    return;
  }

  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    visible = false;
    start = -REVEAL_SECONDS * 1000;
    draw(0);
    return;
  }

  observer = new IntersectionObserver((entries) => {
    const shown = entries[0]?.isIntersecting ?? false;

    if (shown === visible) {
      return;
    }

    visible = shown;

    if (shown) {
      retries = 0;
      frame = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(frame);
    }
  });

  if (canvas.value) {
    observer.observe(canvas.value);
  }

  frame = requestAnimationFrame(draw);
});

onBeforeUnmount(() => {
  visible = false;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  gl = null;
  program = null;
});
</script>

<template>
  <canvas ref="canvas" class="particles" aria-hidden="true" />
</template>

<style scoped>
.particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
