import {
  createTestRunner,
  assertEqual,
  assertDeepEqual,
  assertTrue,
  assertApprox,
  type Vec2,
  type Vec4,
} from '../test-utils.ts';

// ─── Types locaux ────────────────────────────────────────────────────────────

interface BindGroupLayoutEntry {
  binding: number;
  visibility: number; // bitmask: 1=VERTEX, 2=FRAGMENT, 4=COMPUTE
  type: 'uniform-buffer' | 'storage-buffer' | 'sampler' | 'texture';
}

interface ShaderBinding {
  group: number;
  binding: number;
  resourceType: 'uniform' | 'storage' | 'sampler' | 'texture';
  stages: number; // bitmask
}

interface BufferField {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4';
}

interface PackedField {
  name: string;
  offset: number;
  size: number;
}

interface DepthStencilState {
  format: string;
  depthWriteEnabled: boolean;
  depthCompare: string;
}

interface BlendComponent {
  srcFactor: string;
  dstFactor: string;
  operation: string;
}

interface BlendState {
  color: BlendComponent;
  alpha: BlendComponent;
}

interface MultisampleState {
  count: number;
  mask: number;
  alphaToCoverageEnabled: boolean;
}

// ─── Compute bind group layout entries ───────────────────────────────────────

function computeBindGroupLayoutEntries(bindings: ShaderBinding[], group: number): BindGroupLayoutEntry[] {
  return bindings
    .filter(b => b.group === group)
    .map(b => ({
      binding: b.binding,
      visibility: b.stages,
      type: resourceTypeToLayoutType(b.resourceType),
    }));
}

function resourceTypeToLayoutType(rt: string): BindGroupLayoutEntry['type'] {
  const map: Record<string, BindGroupLayoutEntry['type']> = {
    'uniform': 'uniform-buffer',
    'storage': 'storage-buffer',
    'sampler': 'sampler',
    'texture': 'texture',
  };
  return map[rt] ?? 'uniform-buffer';
}

// ─── Uniform buffer packing (std140) ─────────────────────────────────────────

function packStd140(fields: BufferField[]): { packed: PackedField[]; totalSize: number } {
  const packed: PackedField[] = [];
  let offset = 0;

  for (const field of fields) {
    const { alignment, size } = std140Info(field.type);
    // Aligner l'offset
    offset = alignTo(offset, alignment);
    packed.push({ name: field.name, offset, size: alignment === 16 && field.type === 'vec3' ? 16 : size });
    offset += field.type === 'vec3' ? 16 : size; // vec3 padde a 16 en std140
  }
  // Taille totale alignee a 16
  offset = alignTo(offset, 16);
  return { packed, totalSize: offset };
}

function std140Info(type: string): { alignment: number; size: number } {
  switch (type) {
    case 'float': return { alignment: 4, size: 4 };
    case 'vec2': return { alignment: 8, size: 8 };
    case 'vec3': return { alignment: 16, size: 12 };
    case 'vec4': return { alignment: 16, size: 16 };
    case 'mat4': return { alignment: 16, size: 64 };
    default: return { alignment: 4, size: 4 };
  }
}

// ─── Storage buffer packing (std430) ─────────────────────────────────────────

function packStd430(fields: BufferField[]): { packed: PackedField[]; totalSize: number } {
  const packed: PackedField[] = [];
  let offset = 0;

  for (const field of fields) {
    const { alignment, size } = std430Info(field.type);
    offset = alignTo(offset, alignment);
    packed.push({ name: field.name, offset, size });
    offset += size;
  }
  return { packed, totalSize: offset };
}

function std430Info(type: string): { alignment: number; size: number } {
  switch (type) {
    case 'float': return { alignment: 4, size: 4 };
    case 'vec2': return { alignment: 8, size: 8 };
    case 'vec3': return { alignment: 16, size: 12 };
    case 'vec4': return { alignment: 16, size: 16 };
    case 'mat4': return { alignment: 16, size: 64 };
    default: return { alignment: 4, size: 4 };
  }
}

function alignTo(offset: number, alignment: number): number {
  return Math.ceil(offset / alignment) * alignment;
}

// ─── Compute vertex buffer stride ────────────────────────────────────────────

function computeVertexStride(formats: string[]): number {
  let stride = 0;
  for (const fmt of formats) {
    stride += vertexFormatSize(fmt);
  }
  return stride;
}

function vertexFormatSize(format: string): number {
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

// ─── Build pipeline descriptor ───────────────────────────────────────────────

interface PipelineDescriptor {
  primitive: { topology: string; cullMode: string; frontFace: string };
  depthStencil: DepthStencilState | null;
  multisample: MultisampleState;
}

function buildPipelineDescriptor(
  topology: string,
  cullMode: string,
  depthStencil: DepthStencilState | null,
  sampleCount: number
): PipelineDescriptor {
  return {
    primitive: {
      topology,
      cullMode,
      frontFace: 'ccw',
    },
    depthStencil,
    multisample: {
      count: sampleCount,
      mask: 0xFFFFFFFF,
      alphaToCoverageEnabled: false,
    },
  };
}

// ─── Depth stencil state ─────────────────────────────────────────────────────

function createDepthStencilState(
  format: string = 'depth24plus',
  depthCompare: string = 'less',
  depthWrite: boolean = true,
): DepthStencilState {
  return {
    format,
    depthWriteEnabled: depthWrite,
    depthCompare,
  };
}

// ─── Blend state ─────────────────────────────────────────────────────────────

function createAlphaBlendState(): BlendState {
  return {
    color: {
      srcFactor: 'src-alpha',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
    alpha: {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
  };
}

/**
 * Simuler le blending d'une couleur source sur une destination.
 * src et dst sont [r, g, b, a].
 */
function applyBlend(src: Vec4, dst: Vec4): Vec4 {
  const srcA = src[3];
  const oneMinusSrcA = 1 - srcA;
  return [
    src[0] * srcA + dst[0] * oneMinusSrcA,
    src[1] * srcA + dst[1] * oneMinusSrcA,
    src[2] * srcA + dst[2] * oneMinusSrcA,
    srcA + dst[3] * oneMinusSrcA,
  ];
}

// ─── Multisample state ───────────────────────────────────────────────────────

function createMultisampleState(count: number = 4): MultisampleState {
  return {
    count,
    mask: 0xFFFFFFFF,
    alphaToCoverageEnabled: false,
  };
}

// ─── Generate mipmap dimensions chain ────────────────────────────────────────

function generateMipmapChain(width: number, height: number): Vec2[] {
  const chain: Vec2[] = [];
  let w = width;
  let h = height;
  while (w >= 1 || h >= 1) {
    chain.push([Math.max(1, w), Math.max(1, h)]);
    if (w === 1 && h === 1) break;
    w = Math.floor(w / 2);
    h = Math.floor(h / 2);
  }
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 10 — Render pipeline');

// --- Bind group layout entries ---
runner.test('computeBindGroupLayoutEntries — groupe 0', () => {
  const bindings: ShaderBinding[] = [
    { group: 0, binding: 0, resourceType: 'uniform', stages: 1 | 2 },
    { group: 0, binding: 1, resourceType: 'sampler', stages: 2 },
    { group: 0, binding: 2, resourceType: 'texture', stages: 2 },
    { group: 1, binding: 0, resourceType: 'storage', stages: 4 },
  ];
  const entries = computeBindGroupLayoutEntries(bindings, 0);
  assertEqual(entries.length, 3);
  assertEqual(entries[0].type, 'uniform-buffer');
  assertEqual(entries[1].type, 'sampler');
  assertEqual(entries[2].type, 'texture');
});

// --- std140 packing ---
runner.test('packStd140 — float + vec3 + vec4', () => {
  const fields: BufferField[] = [
    { name: 'time', type: 'float' },
    { name: 'lightDir', type: 'vec3' },
    { name: 'color', type: 'vec4' },
  ];
  const { packed, totalSize } = packStd140(fields);
  assertEqual(packed[0].offset, 0);   // float a offset 0
  assertEqual(packed[1].offset, 16);  // vec3 aligne a 16
  assertEqual(packed[2].offset, 32);  // vec4 apres vec3 padde (16+16=32)
  assertEqual(totalSize, 48);         // 32 + 16, aligne a 16
});

runner.test('packStd140 — mat4 = 64 octets', () => {
  const fields: BufferField[] = [
    { name: 'mvp', type: 'mat4' },
  ];
  const { packed, totalSize } = packStd140(fields);
  assertEqual(packed[0].offset, 0);
  assertEqual(packed[0].size, 64);
  assertEqual(totalSize, 64);
});

// --- std430 packing ---
runner.test('packStd430 — vec3 non padde', () => {
  const fields: BufferField[] = [
    { name: 'position', type: 'vec3' },
    { name: 'radius', type: 'float' },
  ];
  const { packed } = packStd430(fields);
  assertEqual(packed[0].offset, 0);
  assertEqual(packed[0].size, 12); // vec3 = 12 octets (pas padde en std430)
  assertEqual(packed[1].offset, 12); // float aligne a 4, suit directement
});

// --- Vertex buffer stride ---
runner.test('computeVertexStride — position(vec3) + normal(vec3) + uv(vec2)', () => {
  assertEqual(computeVertexStride(['float32x3', 'float32x3', 'float32x2']), 32);
});

runner.test('computeVertexStride — position(vec3) seulement', () => {
  assertEqual(computeVertexStride(['float32x3']), 12);
});

// --- Pipeline descriptor ---
runner.test('buildPipelineDescriptor — triangle-list, back cull, 4x MSAA', () => {
  const desc = buildPipelineDescriptor(
    'triangle-list', 'back',
    createDepthStencilState(), 4
  );
  assertEqual(desc.primitive.topology, 'triangle-list');
  assertEqual(desc.primitive.cullMode, 'back');
  assertEqual(desc.depthStencil!.depthCompare, 'less');
  assertEqual(desc.multisample.count, 4);
});

// --- Depth stencil ---
runner.test('createDepthStencilState — valeurs par defaut', () => {
  const ds = createDepthStencilState();
  assertEqual(ds.format, 'depth24plus');
  assertEqual(ds.depthCompare, 'less');
  assertTrue(ds.depthWriteEnabled);
});

// --- Blend state ---
runner.test('createAlphaBlendState — configuration standard', () => {
  const blend = createAlphaBlendState();
  assertEqual(blend.color.srcFactor, 'src-alpha');
  assertEqual(blend.color.dstFactor, 'one-minus-src-alpha');
  assertEqual(blend.color.operation, 'add');
});

runner.test('applyBlend — semi-transparent rouge sur bleu', () => {
  const src: Vec4 = [1, 0, 0, 0.5]; // Rouge a 50%
  const dst: Vec4 = [0, 0, 1, 1];   // Bleu opaque
  const result = applyBlend(src, dst);
  assertApprox(result[0], 0.5); // 1*0.5 + 0*0.5
  assertApprox(result[1], 0);
  assertApprox(result[2], 0.5); // 0*0.5 + 1*0.5
});

// --- Multisample ---
runner.test('createMultisampleState — 4x MSAA', () => {
  const ms = createMultisampleState(4);
  assertEqual(ms.count, 4);
  assertEqual(ms.mask, 0xFFFFFFFF);
});

// --- Mipmap chain ---
runner.test('generateMipmapChain — 512x512', () => {
  const chain = generateMipmapChain(512, 512);
  assertEqual(chain.length, 10); // 512, 256, 128, 64, 32, 16, 8, 4, 2, 1
  assertDeepEqual(chain[0], [512, 512]);
  assertDeepEqual(chain[chain.length - 1], [1, 1]);
});

runner.test('generateMipmapChain — 256x128 (non carre)', () => {
  const chain = generateMipmapChain(256, 128);
  assertDeepEqual(chain[0], [256, 128]);
  assertDeepEqual(chain[1], [128, 64]);
  // Derniere entree doit etre [1, 1]
  assertDeepEqual(chain[chain.length - 1], [1, 1]);
});

runner.test('generateMipmapChain — 1x1', () => {
  const chain = generateMipmapChain(1, 1);
  assertEqual(chain.length, 1);
  assertDeepEqual(chain[0], [1, 1]);
});

runner.run();
