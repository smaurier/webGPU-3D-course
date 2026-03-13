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
  visibility: number;
  type: 'uniform-buffer' | 'storage-buffer' | 'sampler' | 'texture';
}

interface ShaderBinding {
  group: number;
  binding: number;
  resourceType: 'uniform' | 'storage' | 'sampler' | 'texture';
  stages: number;
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
  // TODO: Filtrer les bindings par groupe, convertir resourceType en type de layout
  return [];
}

// ─── Uniform buffer packing (std140) ─────────────────────────────────────────

function packStd140(fields: BufferField[]): { packed: PackedField[]; totalSize: number } {
  // TODO: Appliquer les regles std140 :
  //   - float: align 4, size 4
  //   - vec2: align 8, size 8
  //   - vec3: align 16, size 16 (padde!)
  //   - vec4: align 16, size 16
  //   - mat4: align 16, size 64
  //   - Taille totale alignee a 16
  return { packed: [], totalSize: 0 };
}

// ─── Storage buffer packing (std430) ─────────────────────────────────────────

function packStd430(fields: BufferField[]): { packed: PackedField[]; totalSize: number } {
  // TODO: Comme std140 mais vec3 n'est PAS padde (size 12, align 16)
  return { packed: [], totalSize: 0 };
}

function alignTo(offset: number, alignment: number): number {
  // TODO: Retourner le prochain multiple de alignment >= offset
  return 0;
}

// ─── Compute vertex buffer stride ────────────────────────────────────────────

function computeVertexStride(formats: string[]): number {
  // TODO: Sommer les tailles de chaque format
  return 0;
}

function vertexFormatSize(format: string): number {
  // TODO: 'float32' = 4, 'float32x2' = 8, 'float32x3' = 12, 'float32x4' = 16
  return 0;
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
  // TODO: Construire le descripteur complet
  return {
    primitive: { topology: '', cullMode: '', frontFace: '' },
    depthStencil: null,
    multisample: { count: 1, mask: 0, alphaToCoverageEnabled: false },
  };
}

// ─── Depth stencil state ─────────────────────────────────────────────────────

function createDepthStencilState(
  format: string = 'depth24plus',
  depthCompare: string = 'less',
  depthWrite: boolean = true,
): DepthStencilState {
  // TODO: Retourner l'objet DepthStencilState
  return { format: '', depthWriteEnabled: false, depthCompare: '' };
}

// ─── Blend state ─────────────────────────────────────────────────────────────

function createAlphaBlendState(): BlendState {
  // TODO: Retourner le blend state standard :
  //   color: src-alpha / one-minus-src-alpha / add
  //   alpha: one / one-minus-src-alpha / add
  return {
    color: { srcFactor: '', dstFactor: '', operation: '' },
    alpha: { srcFactor: '', dstFactor: '', operation: '' },
  };
}

function applyBlend(src: Vec4, dst: Vec4): Vec4 {
  // TODO: Appliquer le blending : result = src * srcAlpha + dst * (1 - srcAlpha)
  return [0, 0, 0, 0];
}

// ─── Multisample state ───────────────────────────────────────────────────────

function createMultisampleState(count: number = 4): MultisampleState {
  // TODO: Retourner { count, mask: 0xFFFFFFFF, alphaToCoverageEnabled: false }
  return { count: 1, mask: 0, alphaToCoverageEnabled: false };
}

// ─── Generate mipmap dimensions chain ────────────────────────────────────────

function generateMipmapChain(width: number, height: number): Vec2[] {
  // TODO: Generer la sequence : [w,h], [w/2,h/2], ... jusqu'a [1,1]
  return [];
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
  assertEqual(packed[0].offset, 0);
  assertEqual(packed[1].offset, 16);
  assertEqual(packed[2].offset, 32);
  assertEqual(totalSize, 48);
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
  assertEqual(packed[0].size, 12);
  assertEqual(packed[1].offset, 12);
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
  const src: Vec4 = [1, 0, 0, 0.5];
  const dst: Vec4 = [0, 0, 1, 1];
  const result = applyBlend(src, dst);
  assertApprox(result[0], 0.5);
  assertApprox(result[1], 0);
  assertApprox(result[2], 0.5);
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
  assertEqual(chain.length, 10);
  assertDeepEqual(chain[0], [512, 512]);
  assertDeepEqual(chain[chain.length - 1], [1, 1]);
});

runner.test('generateMipmapChain — 256x128 (non carre)', () => {
  const chain = generateMipmapChain(256, 128);
  assertDeepEqual(chain[0], [256, 128]);
  assertDeepEqual(chain[1], [128, 64]);
  assertDeepEqual(chain[chain.length - 1], [1, 1]);
});

runner.test('generateMipmapChain — 1x1', () => {
  const chain = generateMipmapChain(1, 1);
  assertEqual(chain.length, 1);
  assertDeepEqual(chain[0], [1, 1]);
});

runner.run();
