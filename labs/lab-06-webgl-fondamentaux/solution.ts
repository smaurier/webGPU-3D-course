import {
  createTestRunner,
  assertEqual,
  assertApprox,
  assertDeepEqual,
  assertTrue,
  type Vec3,
  type Vec2,
} from '../test-utils.ts';

// ─── Interleaved vertex buffer ────────────────────────────────────────────────

interface VertexPC {
  position: Vec3;
  color: Vec3;
}

function createInterleavedVertexBuffer(vertices: VertexPC[]): Float32Array {
  const data = new Float32Array(vertices.length * 6);
  for (let i = 0; i < vertices.length; i++) {
    const offset = i * 6;
    data[offset + 0] = vertices[i].position[0];
    data[offset + 1] = vertices[i].position[1];
    data[offset + 2] = vertices[i].position[2];
    data[offset + 3] = vertices[i].color[0];
    data[offset + 4] = vertices[i].color[1];
    data[offset + 5] = vertices[i].color[2];
  }
  return data;
}

// ─── Index buffer for a quad ──────────────────────────────────────────────────

function createQuadIndices(): Uint16Array {
  // Two triangles: 0-1-2 and 0-2-3
  return new Uint16Array([0, 1, 2, 0, 2, 3]);
}

// ─── GLSL uniform parsing ─────────────────────────────────────────────────────

interface UniformInfo {
  type: string;
  name: string;
}

function parseGLSLUniforms(source: string): UniformInfo[] {
  const uniforms: UniformInfo[] = [];
  const regex = /uniform\s+(\w+)\s+(\w+)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    uniforms.push({ type: match[1], name: match[2] });
  }
  return uniforms;
}

// ─── Validate vertex shader ───────────────────────────────────────────────────

function hasGlPositionOutput(vertexShader: string): boolean {
  return /gl_Position\s*=/.test(vertexShader);
}

// ─── Stride and offsets ───────────────────────────────────────────────────────

interface AttributeLayout {
  name: string;
  components: number; // number of float components
}

interface AttributeInfo {
  name: string;
  components: number;
  offset: number; // in bytes
}

interface BufferLayout {
  stride: number; // in bytes
  attributes: AttributeInfo[];
}

function computeBufferLayout(attributes: AttributeLayout[]): BufferLayout {
  const FLOAT_SIZE = 4;
  let offset = 0;
  const infos: AttributeInfo[] = [];

  for (const attr of attributes) {
    infos.push({
      name: attr.name,
      components: attr.components,
      offset,
    });
    offset += attr.components * FLOAT_SIZE;
  }

  return {
    stride: offset,
    attributes: infos,
  };
}

// ─── Triangle strip indices ───────────────────────────────────────────────────

function generateTriangleStripIndices(vertexCount: number): Uint16Array {
  if (vertexCount < 3) return new Uint16Array(0);
  const triangleCount = vertexCount - 2;
  const indices = new Uint16Array(triangleCount * 3);

  for (let i = 0; i < triangleCount; i++) {
    if (i % 2 === 0) {
      indices[i * 3 + 0] = i;
      indices[i * 3 + 1] = i + 1;
      indices[i * 3 + 2] = i + 2;
    } else {
      indices[i * 3 + 0] = i + 1;
      indices[i * 3 + 1] = i;
      indices[i * 3 + 2] = i + 2;
    }
  }

  return indices;
}

// ─── Plane geometry generation ────────────────────────────────────────────────

interface PlaneGeometry {
  positions: Float32Array;
  indices: Uint16Array;
  uvs: Float32Array;
}

function generatePlane(
  width: number,
  height: number,
  widthSegments: number,
  heightSegments: number,
): PlaneGeometry {
  const cols = widthSegments + 1;
  const rows = heightSegments + 1;
  const vertexCount = cols * rows;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const u = col / widthSegments;
      const v = row / heightSegments;

      positions[i * 3 + 0] = (u - 0.5) * width;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (v - 0.5) * height;

      uvs[i * 2 + 0] = u;
      uvs[i * 2 + 1] = v;
    }
  }

  const indexCount = widthSegments * heightSegments * 6;
  const indices = new Uint16Array(indexCount);
  let idx = 0;

  for (let row = 0; row < heightSegments; row++) {
    for (let col = 0; col < widthSegments; col++) {
      const topLeft = row * cols + col;
      const topRight = topLeft + 1;
      const bottomLeft = (row + 1) * cols + col;
      const bottomRight = bottomLeft + 1;

      // Triangle 1
      indices[idx++] = topLeft;
      indices[idx++] = bottomLeft;
      indices[idx++] = topRight;

      // Triangle 2
      indices[idx++] = topRight;
      indices[idx++] = bottomLeft;
      indices[idx++] = bottomRight;
    }
  }

  return { positions, indices, uvs };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 06 — WebGL fondamentaux');

runner.test('interleaved vertex buffer — correct size', () => {
  const verts: VertexPC[] = [
    { position: [0, 0, 0], color: [1, 0, 0] },
    { position: [1, 0, 0], color: [0, 1, 0] },
    { position: [0, 1, 0], color: [0, 0, 1] },
  ];
  const buf = createInterleavedVertexBuffer(verts);
  assertEqual(buf.length, 18); // 3 vertices * 6 floats
  assertTrue(buf instanceof Float32Array, 'should be Float32Array');
});

runner.test('interleaved vertex buffer — correct layout', () => {
  const verts: VertexPC[] = [
    { position: [1, 2, 3], color: [0.5, 0.6, 0.7] },
  ];
  const buf = createInterleavedVertexBuffer(verts);
  assertApprox(buf[0], 1);   // px
  assertApprox(buf[1], 2);   // py
  assertApprox(buf[2], 3);   // pz
  assertApprox(buf[3], 0.5); // r
  assertApprox(buf[4], 0.6); // g
  assertApprox(buf[5], 0.7); // b
});

runner.test('quad index buffer — 6 indices, 2 triangles', () => {
  const idx = createQuadIndices();
  assertEqual(idx.length, 6);
  assertTrue(idx instanceof Uint16Array, 'should be Uint16Array');
});

runner.test('quad index buffer — correct winding', () => {
  const idx = createQuadIndices();
  // First triangle: 0-1-2, second: 0-2-3
  assertDeepEqual(Array.from(idx), [0, 1, 2, 0, 2, 3]);
});

runner.test('parse GLSL uniforms — extracts type and name', () => {
  const shader = `
    uniform mat4 uModelViewProjection;
    uniform vec3 uLightPosition;
    uniform float uTime;
    void main() {}
  `;
  const uniforms = parseGLSLUniforms(shader);
  assertEqual(uniforms.length, 3);
  assertEqual(uniforms[0].type, 'mat4');
  assertEqual(uniforms[0].name, 'uModelViewProjection');
  assertEqual(uniforms[1].type, 'vec3');
  assertEqual(uniforms[1].name, 'uLightPosition');
  assertEqual(uniforms[2].type, 'float');
  assertEqual(uniforms[2].name, 'uTime');
});

runner.test('parse GLSL uniforms — empty shader returns empty', () => {
  const uniforms = parseGLSLUniforms('void main() { gl_Position = vec4(0); }');
  assertEqual(uniforms.length, 0);
});

runner.test('validate vertex shader — has gl_Position', () => {
  const shader = 'void main() { gl_Position = uMVP * aPosition; }';
  assertTrue(hasGlPositionOutput(shader));
});

runner.test('validate vertex shader — missing gl_Position', () => {
  const shader = 'void main() { vColor = aColor; }';
  assertTrue(!hasGlPositionOutput(shader));
});

runner.test('compute buffer layout — position + color', () => {
  const layout = computeBufferLayout([
    { name: 'position', components: 3 },
    { name: 'color', components: 3 },
  ]);
  assertEqual(layout.stride, 24); // 6 floats * 4 bytes
  assertEqual(layout.attributes[0].offset, 0);
  assertEqual(layout.attributes[1].offset, 12); // 3 floats * 4 bytes
});

runner.test('compute buffer layout — position + normal + uv', () => {
  const layout = computeBufferLayout([
    { name: 'position', components: 3 },
    { name: 'normal', components: 3 },
    { name: 'uv', components: 2 },
  ]);
  assertEqual(layout.stride, 32); // 8 floats * 4 bytes
  assertEqual(layout.attributes[2].offset, 24); // 6 floats * 4 bytes
  assertEqual(layout.attributes[2].components, 2);
});

runner.test('triangle strip indices — 4 vertices = 2 triangles', () => {
  const idx = generateTriangleStripIndices(4);
  assertEqual(idx.length, 6); // 2 triangles * 3 indices
  // First triangle: 0,1,2  Second (flipped): 1,0,2 -> actually 2,1,3
  // With our winding fix: even=0,1,2 odd=2,1,3
  assertDeepEqual(Array.from(idx), [0, 1, 2, 2, 1, 3]);
});

runner.test('triangle strip indices — 3 vertices = 1 triangle', () => {
  const idx = generateTriangleStripIndices(3);
  assertEqual(idx.length, 3);
  assertDeepEqual(Array.from(idx), [0, 1, 2]);
});

runner.test('generate plane — vertex count', () => {
  const plane = generatePlane(2, 2, 2, 2);
  // 3x3 grid = 9 vertices
  assertEqual(plane.positions.length, 27); // 9 * 3
  assertEqual(plane.uvs.length, 18);       // 9 * 2
});

runner.test('generate plane — index count', () => {
  const plane = generatePlane(2, 2, 2, 2);
  // 2x2 segments = 4 quads = 8 triangles = 24 indices
  assertEqual(plane.indices.length, 24);
});

runner.test('generate plane — UVs in [0,1] range', () => {
  const plane = generatePlane(4, 4, 3, 3);
  for (let i = 0; i < plane.uvs.length; i++) {
    assertTrue(plane.uvs[i] >= 0 && plane.uvs[i] <= 1, `UV[${i}] = ${plane.uvs[i]} out of range`);
  }
});

runner.test('generate plane — 1x1 segment produces 2 triangles', () => {
  const plane = generatePlane(1, 1, 1, 1);
  assertEqual(plane.positions.length, 12); // 4 vertices * 3
  assertEqual(plane.indices.length, 6);    // 2 triangles * 3
});

runner.run();
