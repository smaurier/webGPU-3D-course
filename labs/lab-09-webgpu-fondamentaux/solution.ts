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
  varType: string; // 'uniform' | 'storage' | 'texture' | 'sampler'
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
  const results: WGSLStruct[] = [];
  const structRegex = /struct\s+(\w+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = structRegex.exec(source)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: WGSLField[] = [];
    const fieldRegex = /(\w+)\s*:\s*([\w<>]+)/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRegex.exec(body)) !== null) {
      fields.push({ name: fm[1].trim(), type: fm[2].trim() });
    }
    results.push({ name, fields });
  }
  return results;
}

// ─── Parse WGSL bind group declarations ──────────────────────────────────────

function parseWGSLBindGroups(source: string): BindGroupEntry[] {
  const results: BindGroupEntry[] = [];
  const regex = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<(\w+)(?:,\s*\w+)?>)?\s+(\w+)\s*:\s*([\w<>,\s]+)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push({
      group: parseInt(match[1]),
      binding: parseInt(match[2]),
      varType: match[3] || 'handle',
      name: match[4],
      type: match[5].trim(),
    });
  }
  return results;
}

// ─── Validate WGSL entry points ──────────────────────────────────────────────

function parseWGSLEntryPoints(source: string): EntryPoint[] {
  const results: EntryPoint[] = [];
  const regex = /@(vertex|fragment|compute)\s+fn\s+(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push({ stage: match[1] as EntryPoint['stage'], name: match[2] });
  }
  return results;
}

// ─── Compute aligned buffer size ─────────────────────────────────────────────

function alignBufferSize(size: number, alignment: number = 256): number {
  return Math.ceil(size / alignment) * alignment;
}

// ─── Create vertex buffer layout ─────────────────────────────────────────────

function createVertexBufferLayout(attributes: VertexAttribute[]): VertexBufferLayout {
  // Le stride est determine par l'attribut le plus eloigne + sa taille
  let maxEnd = 0;
  for (const attr of attributes) {
    const size = formatByteSize(attr.format);
    const end = attr.offset + size;
    if (end > maxEnd) maxEnd = end;
  }
  return {
    arrayStride: maxEnd,
    attributes: [...attributes],
  };
}

function formatByteSize(format: string): number {
  const sizes: Record<string, number> = {
    'float32': 4,
    'float32x2': 8,
    'float32x3': 12,
    'float32x4': 16,
    'uint32': 4,
    'sint32': 4,
    'uint8x4': 4,
    'unorm8x4': 4,
  };
  return sizes[format] ?? 0;
}

// ─── GLSL to WGSL type mapping ───────────────────────────────────────────────

function glslToWGSL(glslType: string): string | string[] {
  const mapping: Record<string, string | string[]> = {
    'float': 'f32',
    'int': 'i32',
    'uint': 'u32',
    'bool': 'bool',
    'vec2': 'vec2f',
    'vec3': 'vec3f',
    'vec4': 'vec4f',
    'ivec2': 'vec2i',
    'ivec3': 'vec3i',
    'ivec4': 'vec4i',
    'mat2': 'mat2x2f',
    'mat3': 'mat3x3f',
    'mat4': 'mat4x4f',
    'sampler2D': ['texture_2d<f32>', 'sampler'],
  };
  return mapping[glslType] ?? glslType;
}

// ─── Generate triangle list from triangle strip ──────────────────────────────

function triangleStripToList(stripIndices: number[]): number[] {
  const triangles: number[] = [];
  for (let i = 0; i < stripIndices.length - 2; i++) {
    if (i % 2 === 0) {
      triangles.push(stripIndices[i], stripIndices[i + 1], stripIndices[i + 2]);
    } else {
      // Inverser le winding pour les triangles impairs
      triangles.push(stripIndices[i + 1], stripIndices[i], stripIndices[i + 2]);
    }
  }
  return triangles;
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
  assertEqual(layout.arrayStride, 20); // 12 + 8
  assertEqual(layout.attributes.length, 2);
});

runner.test('createVertexBufferLayout — position + normal + uv', () => {
  const layout = createVertexBufferLayout([
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x2' },
  ]);
  assertEqual(layout.arrayStride, 32); // 24 + 8
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
  // Triangle 0: 0,1,2
  // Triangle 1: 2,1,3 (winding inversee)
  // Triangle 2: 2,3,4
  // Triangle 3: 4,3,5
  assertDeepEqual(result, [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
});

runner.test('triangleStripToList — 3 sommets = 1 triangle', () => {
  assertDeepEqual(triangleStripToList([0, 1, 2]), [0, 1, 2]);
});

runner.run();
