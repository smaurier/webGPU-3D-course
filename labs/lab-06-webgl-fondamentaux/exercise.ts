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
  // TODO: creer un Float32Array entrelace [px,py,pz,r,g,b, px,py,pz,r,g,b, ...]
  // Taille = vertices.length * 6
  return new Float32Array(0);
}

// ─── Index buffer for a quad ──────────────────────────────────────────────────

function createQuadIndices(): Uint16Array {
  // TODO: retourner les 6 indices pour 2 triangles formant un quad
  // Sommets: 0=topLeft, 1=topRight, 2=bottomRight, 3=bottomLeft
  // Triangles: 0-1-2 et 0-2-3
  return new Uint16Array(0);
}

// ─── GLSL uniform parsing ─────────────────────────────────────────────────────

interface UniformInfo {
  type: string;
  name: string;
}

function parseGLSLUniforms(source: string): UniformInfo[] {
  // TODO: utiliser une regex pour extraire les declarations "uniform type name;"
  // Retourner un tableau de { type, name }
  return [];
}

// ─── Validate vertex shader ───────────────────────────────────────────────────

function hasGlPositionOutput(vertexShader: string): boolean {
  // TODO: verifier que le shader contient "gl_Position ="
  return false;
}

// ─── Stride and offsets ───────────────────────────────────────────────────────

interface AttributeLayout {
  name: string;
  components: number;
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
  // TODO: calculer le stride total et l'offset de chaque attribut
  // Chaque composante float = 4 octets
  return { stride: 0, attributes: [] };
}

// ─── Triangle strip indices ───────────────────────────────────────────────────

function generateTriangleStripIndices(vertexCount: number): Uint16Array {
  // TODO: generer les indices pour un triangle strip
  // Triangle pair (i%2==0): i, i+1, i+2
  // Triangle impair (i%2==1): i+1, i, i+2  (pour conserver le winding)
  return new Uint16Array(0);
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
  // TODO: generer un plan subdivise
  // - (widthSegments+1) * (heightSegments+1) sommets
  // - positions: x = (u-0.5)*width, y = 0, z = (v-0.5)*height
  // - uvs: u et v dans [0, 1]
  // - indices: 2 triangles par cellule de la grille
  return {
    positions: new Float32Array(0),
    indices: new Uint16Array(0),
    uvs: new Float32Array(0),
  };
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
  assertEqual(buf.length, 18);
  assertTrue(buf instanceof Float32Array, 'should be Float32Array');
});

runner.test('interleaved vertex buffer — correct layout', () => {
  const verts: VertexPC[] = [
    { position: [1, 2, 3], color: [0.5, 0.6, 0.7] },
  ];
  const buf = createInterleavedVertexBuffer(verts);
  assertApprox(buf[0], 1);
  assertApprox(buf[1], 2);
  assertApprox(buf[2], 3);
  assertApprox(buf[3], 0.5);
  assertApprox(buf[4], 0.6);
  assertApprox(buf[5], 0.7);
});

runner.test('quad index buffer — 6 indices, 2 triangles', () => {
  const idx = createQuadIndices();
  assertEqual(idx.length, 6);
  assertTrue(idx instanceof Uint16Array, 'should be Uint16Array');
});

runner.test('quad index buffer — correct winding', () => {
  const idx = createQuadIndices();
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
  assertEqual(layout.stride, 24);
  assertEqual(layout.attributes[0].offset, 0);
  assertEqual(layout.attributes[1].offset, 12);
});

runner.test('compute buffer layout — position + normal + uv', () => {
  const layout = computeBufferLayout([
    { name: 'position', components: 3 },
    { name: 'normal', components: 3 },
    { name: 'uv', components: 2 },
  ]);
  assertEqual(layout.stride, 32);
  assertEqual(layout.attributes[2].offset, 24);
  assertEqual(layout.attributes[2].components, 2);
});

runner.test('triangle strip indices — 4 vertices = 2 triangles', () => {
  const idx = generateTriangleStripIndices(4);
  assertEqual(idx.length, 6);
  assertDeepEqual(Array.from(idx), [0, 1, 2, 2, 1, 3]);
});

runner.test('triangle strip indices — 3 vertices = 1 triangle', () => {
  const idx = generateTriangleStripIndices(3);
  assertEqual(idx.length, 3);
  assertDeepEqual(Array.from(idx), [0, 1, 2]);
});

runner.test('generate plane — vertex count', () => {
  const plane = generatePlane(2, 2, 2, 2);
  assertEqual(plane.positions.length, 27);
  assertEqual(plane.uvs.length, 18);
});

runner.test('generate plane — index count', () => {
  const plane = generatePlane(2, 2, 2, 2);
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
  assertEqual(plane.positions.length, 12);
  assertEqual(plane.indices.length, 6);
});

runner.run();
