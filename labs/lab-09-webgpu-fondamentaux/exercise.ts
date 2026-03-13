import {
  createTestRunner,
  assertEqual,
  assertDeepEqual,
  assertTrue,
  assertFalse,
} from '../test-utils.ts';

// ─── Types locaux ────────────────────────────────────────────────────────────

interface WGSLField {
  name: string;
  type: string;
}

interface WGSLStruct {
  name: string;
  fields: WGSLField[];
}

interface BindGroupEntry {
  group: number;
  binding: number;
  name: string;
  type: string;
  varType: string;
}

interface EntryPoint {
  name: string;
  stage: 'vertex' | 'fragment' | 'compute';
}

interface VertexAttribute {
  shaderLocation: number;
  offset: number;
  format: string;
}

interface VertexBufferLayout {
  arrayStride: number;
  attributes: VertexAttribute[];
}

// ─── Parse WGSL struct definitions ───────────────────────────────────────────

function parseWGSLStructs(source: string): WGSLStruct[] {
  // TODO: Utiliser une regex pour trouver `struct Name { field: type, ... }`
  // Extraire chaque champ avec son nom et type
  return [];
}

// ─── Parse WGSL bind group declarations ──────────────────────────────────────

function parseWGSLBindGroups(source: string): BindGroupEntry[] {
  // TODO: Parser `@group(G) @binding(B) var<TYPE> name: Type;`
  // Pour les var sans <>, varType = 'handle'
  return [];
}

// ─── Validate WGSL entry points ──────────────────────────────────────────────

function parseWGSLEntryPoints(source: string): EntryPoint[] {
  // TODO: Parser `@vertex|@fragment|@compute fn name(...)`
  return [];
}

// ─── Compute aligned buffer size ─────────────────────────────────────────────

function alignBufferSize(size: number, alignment: number = 256): number {
  // TODO: ceil(size / alignment) * alignment
  return 0;
}

// ─── Create vertex buffer layout ─────────────────────────────────────────────

function createVertexBufferLayout(attributes: VertexAttribute[]): VertexBufferLayout {
  // TODO: Calculer arrayStride = max(offset + formatSize) de tous les attributs
  return { arrayStride: 0, attributes: [] };
}

function formatByteSize(format: string): number {
  // TODO: Retourner la taille en octets du format WebGPU
  // 'float32' = 4, 'float32x2' = 8, 'float32x3' = 12, 'float32x4' = 16
  return 0;
}

// ─── GLSL to WGSL type mapping ───────────────────────────────────────────────

function glslToWGSL(glslType: string): string | string[] {
  // TODO: Retourner le type WGSL equivalent
  // Cas special : sampler2D retourne ['texture_2d<f32>', 'sampler']
  return glslType;
}

// ─── Generate triangle list from triangle strip ──────────────────────────────

function triangleStripToList(stripIndices: number[]): number[] {
  // TODO: Pour chaque triangle i (0..N-3) :
  //   - pair  : [i, i+1, i+2]
  //   - impair: [i+1, i, i+2] (winding inversee)
  return [];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 09 — WebGPU fondamentaux');

// --- Parse WGSL structs ---
runner.test('parseWGSLStructs — struct simple', () => {
  const src = `
    struct Uniforms {
      modelMatrix: mat4x4f,
      viewMatrix: mat4x4f,
      color: vec4f,
    }
  `;
  const structs = parseWGSLStructs(src);
  assertEqual(structs.length, 1);
  assertEqual(structs[0].name, 'Uniforms');
  assertEqual(structs[0].fields.length, 3);
  assertDeepEqual(structs[0].fields[0], { name: 'modelMatrix', type: 'mat4x4f' });
});

runner.test('parseWGSLStructs — plusieurs structs', () => {
  const src = `
    struct VertexInput { position: vec3f, uv: vec2f }
    struct VertexOutput { clip_position: vec4f, uv: vec2f }
  `;
  const structs = parseWGSLStructs(src);
  assertEqual(structs.length, 2);
  assertEqual(structs[0].name, 'VertexInput');
  assertEqual(structs[1].name, 'VertexOutput');
});

// --- Parse WGSL bind groups ---
runner.test('parseWGSLBindGroups — uniforms et textures', () => {
  const src = `
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var texSampler: sampler;
    @group(0) @binding(2) var texColor: texture_2d<f32>;
  `;
  const bindings = parseWGSLBindGroups(src);
  assertEqual(bindings.length, 3);
  assertEqual(bindings[0].group, 0);
  assertEqual(bindings[0].binding, 0);
  assertEqual(bindings[0].varType, 'uniform');
  assertEqual(bindings[0].name, 'uniforms');
  assertEqual(bindings[1].varType, 'handle');
  assertEqual(bindings[1].name, 'texSampler');
});

// --- Validate WGSL entry points ---
runner.test('parseWGSLEntryPoints — vertex et fragment', () => {
  const src = `
    @vertex fn vs_main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4f { }
    @fragment fn fs_main() -> @location(0) vec4f { }
  `;
  const eps = parseWGSLEntryPoints(src);
  assertEqual(eps.length, 2);
  assertDeepEqual(eps[0], { stage: 'vertex', name: 'vs_main' });
  assertDeepEqual(eps[1], { stage: 'fragment', name: 'fs_main' });
});

runner.test('parseWGSLEntryPoints — compute shader', () => {
  const src = `@compute fn main_compute(@builtin(global_invocation_id) gid: vec3u) { }`;
  const eps = parseWGSLEntryPoints(src);
  assertEqual(eps.length, 1);
  assertEqual(eps[0].stage, 'compute');
});

// --- Aligned buffer size ---
runner.test('alignBufferSize — 64 octets aligne a 256', () => {
  assertEqual(alignBufferSize(64), 256);
});

runner.test('alignBufferSize — 256 octets reste 256', () => {
  assertEqual(alignBufferSize(256), 256);
});

runner.test('alignBufferSize — 300 octets aligne a 512', () => {
  assertEqual(alignBufferSize(300), 512);
});

runner.test('alignBufferSize — 0 octets = 0', () => {
  assertEqual(alignBufferSize(0), 0);
});

// --- Vertex buffer layout ---
runner.test('createVertexBufferLayout — position + uv', () => {
  const layout = createVertexBufferLayout([
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x2' },
  ]);
  assertEqual(layout.arrayStride, 20);
  assertEqual(layout.attributes.length, 2);
});

runner.test('createVertexBufferLayout — position + normal + uv', () => {
  const layout = createVertexBufferLayout([
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x2' },
  ]);
  assertEqual(layout.arrayStride, 32);
});

// --- GLSL to WGSL ---
runner.test('glslToWGSL — types scalaires et vecteurs', () => {
  assertEqual(glslToWGSL('float'), 'f32');
  assertEqual(glslToWGSL('vec3'), 'vec3f');
  assertEqual(glslToWGSL('mat4'), 'mat4x4f');
});

runner.test('glslToWGSL — sampler2D donne 2 bindings', () => {
  const result = glslToWGSL('sampler2D');
  assertDeepEqual(result, ['texture_2d<f32>', 'sampler']);
});

// --- Triangle strip to list ---
runner.test('triangleStripToList — 4 sommets = 2 triangles', () => {
  const result = triangleStripToList([0, 1, 2, 3]);
  assertEqual(result.length, 6);
  assertDeepEqual(result, [0, 1, 2, 2, 1, 3]);
});

runner.test('triangleStripToList — 6 sommets = 4 triangles', () => {
  const result = triangleStripToList([0, 1, 2, 3, 4, 5]);
  assertEqual(result.length, 12);
  assertDeepEqual(result, [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
});

runner.test('triangleStripToList — 3 sommets = 1 triangle', () => {
  assertDeepEqual(triangleStripToList([0, 1, 2]), [0, 1, 2]);
});

runner.run();
