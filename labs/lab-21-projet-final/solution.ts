import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertFalse,
  assertEqual,
  assertArrayApprox,
  type Vec3,
  type Mat4,
  type AABB,
} from '../test-utils.ts';

// ─── Helpers ────────────────────────────────────────────────────────────────

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out: number[] = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as unknown as Mat4;
}

function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Translation(tx: number, ty: number, tz: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

function mat4MulPoint(m: Mat4, p: Vec3): Vec3 {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [
    (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
    (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
    (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
  ];
}

// ─── Scene Graph ────────────────────────────────────────────────────────────

interface SceneNode {
  localTransform: Mat4;
  children: SceneNode[];
}

function computeWorldTransform(node: SceneNode, parentWorld: Mat4): Mat4 {
  return mat4Multiply(parentWorld, node.localTransform);
}

function computeWorldTransforms(node: SceneNode, parentWorld: Mat4): Mat4[] {
  const world = computeWorldTransform(node, parentWorld);
  let result = [world];
  for (const child of node.children) {
    result = result.concat(computeWorldTransforms(child, world));
  }
  return result;
}

// ─── Terrain Heightmap ──────────────────────────────────────────────────────

function hash2D(ix: number, iy: number): number {
  let h = ix * 127.1 + iy * 311.7;
  h = Math.sin(h) * 43758.5453;
  return h - Math.floor(h);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerpN(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function simpleNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fade(fx);
  const v = fade(fz);
  const n00 = hash2D(ix, iz);
  const n10 = hash2D(ix + 1, iz);
  const n01 = hash2D(ix, iz + 1);
  const n11 = hash2D(ix + 1, iz + 1);
  return lerpN(lerpN(n00, n10, u), lerpN(n01, n11, u), v);
}

function terrainHeight(x: number, z: number, amplitude: number, frequency: number): number {
  return simpleNoise(x * frequency, z * frequency) * amplitude;
}

function terrainNormal(
  x: number, z: number, amplitude: number, frequency: number, epsilon: number,
): Vec3 {
  const hL = terrainHeight(x - epsilon, z, amplitude, frequency);
  const hR = terrainHeight(x + epsilon, z, amplitude, frequency);
  const hD = terrainHeight(x, z - epsilon, amplitude, frequency);
  const hU = terrainHeight(x, z + epsilon, amplitude, frequency);

  const tangentX: Vec3 = [2 * epsilon, hR - hL, 0];
  const tangentZ: Vec3 = [0, hU - hD, 2 * epsilon];
  const normal = vec3Cross(tangentZ, tangentX);
  return vec3Normalize(normal);
}

// ─── Frustum Culling ────────────────────────────────────────────────────────

interface FrustumPlane {
  normal: Vec3;
  distance: number;
}

function aabbOutsidePlane(aabb: AABB, plane: FrustumPlane): boolean {
  // Trouver le vertex le plus dans la direction de la normale (p-vertex)
  const px = plane.normal[0] >= 0 ? aabb.max[0] : aabb.min[0];
  const py = plane.normal[1] >= 0 ? aabb.max[1] : aabb.min[1];
  const pz = plane.normal[2] >= 0 ? aabb.max[2] : aabb.min[2];
  const dist = plane.normal[0] * px + plane.normal[1] * py + plane.normal[2] * pz + plane.distance;
  return dist < 0;
}

function frustumCullAABB(aabb: AABB, planes: FrustumPlane[]): boolean {
  // Retourne true si l'AABB est VISIBLE (pas entierement en dehors de tous les plans)
  for (const plane of planes) {
    if (aabbOutsidePlane(aabb, plane)) return false;
  }
  return true;
}

// ─── PBR Lighting ───────────────────────────────────────────────────────────

function distributionGGX(NdotH: number, roughness: number): number {
  const a = roughness * roughness;
  const a2 = a * a;
  const denom = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / (Math.PI * denom * denom);
}

function geometrySchlickGGX(NdotV: number, roughness: number): number {
  const r = roughness + 1;
  const k = (r * r) / 8;
  return NdotV / (NdotV * (1 - k) + k);
}

function geometrySmith(NdotV: number, NdotL: number, roughness: number): number {
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

function fresnelSchlick(cosTheta: number, f0: number): number {
  return f0 + (1 - f0) * Math.pow(1 - cosTheta, 5);
}

function pbrSpecular(
  N: Vec3, V: Vec3, L: Vec3, roughness: number, f0: number,
): number {
  const H = vec3Normalize(vec3Add(V, L));
  const NdotH = Math.max(vec3Dot(N, H), 0);
  const NdotV = Math.max(vec3Dot(N, V), 0.001);
  const NdotL = Math.max(vec3Dot(N, L), 0);
  const HdotV = Math.max(vec3Dot(H, V), 0);

  const D = distributionGGX(NdotH, roughness);
  const G = geometrySmith(NdotV, NdotL, roughness);
  const F = fresnelSchlick(HdotV, f0);

  return (D * G * F) / (4 * NdotV * NdotL + 0.001);
}

// ─── Shadow Map Lookup with PCF ─────────────────────────────────────────────

function shadowPCF(
  u: number, v: number, depth: number,
  depthMap: (u: number, v: number) => number,
  texelSize: number, bias: number,
): number {
  let shadow = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const d = depthMap(u + dx * texelSize, v + dy * texelSize);
      shadow += (depth - bias > d) ? 0 : 1;
    }
  }
  return shadow / 9;
}

// ─── Particle System ────────────────────────────────────────────────────────

interface Particle {
  position: Vec3;
  velocity: Vec3;
  lifetime: number;
}

function particleStep(
  particles: Particle[], gravity: Vec3, dt: number,
  respawnPosition: Vec3, respawnVelocity: Vec3, respawnLifetime: number,
): Particle[] {
  return particles.map(p => {
    const newLifetime = p.lifetime - dt;
    if (newLifetime <= 0) {
      return {
        position: [...respawnPosition] as Vec3,
        velocity: [...respawnVelocity] as Vec3,
        lifetime: respawnLifetime,
      };
    }
    return {
      position: vec3Add(p.position, vec3Scale(p.velocity, dt)),
      velocity: vec3Add(p.velocity, vec3Scale(gravity, dt)),
      lifetime: newLifetime,
    };
  });
}

// ─── Animation Keyframe ─────────────────────────────────────────────────────

interface Keyframe {
  time: number;
  value: number;
}

function sampleKeyframes(keyframes: Keyframe[], t: number): number {
  if (keyframes.length === 0) return 0;
  if (t <= keyframes[0].time) return keyframes[0].value;
  if (t >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1].value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (t >= keyframes[i].time && t <= keyframes[i + 1].time) {
      const frac = (t - keyframes[i].time) / (keyframes[i + 1].time - keyframes[i].time);
      return keyframes[i].value + frac * (keyframes[i + 1].value - keyframes[i].value);
    }
  }
  return keyframes[keyframes.length - 1].value;
}

// ─── LOD Selection ──────────────────────────────────────────────────────────

function selectLOD(distance: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (distance < thresholds[i]) return i;
  }
  return thresholds.length;
}

// ─── Ray-Terrain Intersection ───────────────────────────────────────────────

function rayTerrainIntersect(
  origin: Vec3, direction: Vec3,
  heightFn: (x: number, z: number) => number,
  maxDist: number, stepSize: number,
): Vec3 | null {
  let t = 0;
  while (t < maxDist) {
    const p: Vec3 = [
      origin[0] + direction[0] * t,
      origin[1] + direction[1] * t,
      origin[2] + direction[2] * t,
    ];
    const h = heightFn(p[0], p[2]);
    if (p[1] <= h) return p;
    t += stepSize;
  }
  return null;
}

// ─── Camera First-Person ────────────────────────────────────────────────────

function firstPersonVectors(yaw: number, pitch: number): { forward: Vec3; right: Vec3 } {
  const forward: Vec3 = [
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw),
  ];
  const worldUp: Vec3 = [0, 1, 0];
  const right = vec3Normalize(vec3Cross(forward, worldUp));
  return { forward: vec3Normalize(forward), right };
}

// ─── Orbit Camera ───────────────────────────────────────────────────────────

function orbitCameraPosition(
  target: Vec3, distance: number, azimuth: number, elevation: number,
): Vec3 {
  const x = target[0] + distance * Math.cos(elevation) * Math.sin(azimuth);
  const y = target[1] + distance * Math.sin(elevation);
  const z = target[2] + distance * Math.cos(elevation) * Math.cos(azimuth);
  return [x, y, z];
}

// ─── Resource Manager ───────────────────────────────────────────────────────

class ResourceManager {
  private loaded = new Map<string, boolean>();

  load(name: string): void {
    this.loaded.set(name, true);
  }

  dispose(name: string): void {
    this.loaded.delete(name);
  }

  isLoaded(name: string): boolean {
    return this.loaded.has(name);
  }

  getLoadedCount(): number {
    return this.loaded.size;
  }

  detectLeaks(expectedDisposed: string[]): string[] {
    return expectedDisposed.filter(name => this.loaded.has(name));
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 21 — Projet final');

// Scene Graph
runner.test('sceneGraph — propagation parent * local', () => {
  const parent: SceneNode = {
    localTransform: mat4Translation(10, 0, 0),
    children: [],
  };
  const child: SceneNode = {
    localTransform: mat4Translation(0, 5, 0),
    children: [],
  };
  parent.children.push(child);
  const transforms = computeWorldTransforms(parent, mat4Identity());
  const childWorld = transforms[1];
  const p = mat4MulPoint(childWorld, [0, 0, 0]);
  assertApprox(p[0], 10, 0.001);
  assertApprox(p[1], 5, 0.001);
});

runner.test('sceneGraph — 3 niveaux', () => {
  const grandchild: SceneNode = { localTransform: mat4Translation(0, 0, 3), children: [] };
  const child: SceneNode = { localTransform: mat4Translation(0, 2, 0), children: [grandchild] };
  const root: SceneNode = { localTransform: mat4Translation(1, 0, 0), children: [child] };
  const transforms = computeWorldTransforms(root, mat4Identity());
  assertEqual(transforms.length, 3);
  const p = mat4MulPoint(transforms[2], [0, 0, 0]);
  assertApprox(p[0], 1, 0.001);
  assertApprox(p[1], 2, 0.001);
  assertApprox(p[2], 3, 0.001);
});

// Terrain
runner.test('terrainHeight — hauteur reproductible', () => {
  const h1 = terrainHeight(5, 3, 10, 0.1);
  const h2 = terrainHeight(5, 3, 10, 0.1);
  assertApprox(h1, h2);
});

runner.test('terrainNormal — terrain plat (amplitude 0) -> normale Y', () => {
  const n = terrainNormal(5, 5, 0, 1, 0.01);
  assertApprox(Math.abs(n[1]), 1, 0.01);
});

runner.test('terrainNormal — est normalisee', () => {
  const n = terrainNormal(3, 7, 10, 0.5, 0.01);
  assertApprox(vec3Length(n), 1, 0.001);
});

// Frustum Culling
runner.test('frustumCull — AABB dans le frustum', () => {
  const planes: FrustumPlane[] = [
    { normal: [1, 0, 0], distance: 10 },   // x >= -10
    { normal: [-1, 0, 0], distance: 10 },  // x <= 10
    { normal: [0, 1, 0], distance: 10 },   // y >= -10
    { normal: [0, -1, 0], distance: 10 },  // y <= 10
    { normal: [0, 0, 1], distance: 10 },   // z >= -10
    { normal: [0, 0, -1], distance: 10 },  // z <= 10
  ];
  const aabb: AABB = { min: [-1, -1, -1], max: [1, 1, 1] };
  assertTrue(frustumCullAABB(aabb, planes));
});

runner.test('frustumCull — AABB en dehors du frustum', () => {
  const planes: FrustumPlane[] = [
    { normal: [1, 0, 0], distance: 10 },
    { normal: [-1, 0, 0], distance: 10 },
    { normal: [0, 1, 0], distance: 10 },
    { normal: [0, -1, 0], distance: 10 },
    { normal: [0, 0, 1], distance: 10 },
    { normal: [0, 0, -1], distance: 10 },
  ];
  const aabb: AABB = { min: [20, 20, 20], max: [30, 30, 30] };
  assertFalse(frustumCullAABB(aabb, planes));
});

// PBR
runner.test('PBR — specular non nul pour surface lisse', () => {
  const N: Vec3 = [0, 1, 0];
  const V: Vec3 = [0, 1, 0];
  const L: Vec3 = vec3Normalize([0.5, 1, 0]);
  const spec = pbrSpecular(N, V, L, 0.1, 0.04);
  assertTrue(spec > 0, `Specular devrait etre > 0, got ${spec}`);
});

runner.test('PBR — surface lisse a un pic speculaire plus intense au reflet', () => {
  // V et L symetriques par rapport a N -> H = N -> pic speculaire maximal
  const N: Vec3 = [0, 1, 0];
  const V: Vec3 = vec3Normalize([0, 1, 0.001]);
  const L: Vec3 = vec3Normalize([0, 1, -0.001]);
  const smooth = pbrSpecular(N, V, L, 0.1, 0.04);
  const rough = pbrSpecular(N, V, L, 0.9, 0.04);
  assertTrue(smooth > rough, `Smooth (${smooth}) devrait > rough (${rough})`);
});

// Shadow PCF
runner.test('shadowPCF — entierement eclaire', () => {
  const result = shadowPCF(0.5, 0.5, 0.3, () => 1.0, 1 / 512, 0.001);
  assertApprox(result, 1.0);
});

runner.test('shadowPCF — entierement dans l\'ombre', () => {
  const result = shadowPCF(0.5, 0.5, 0.9, () => 0.1, 1 / 512, 0.001);
  assertApprox(result, 0.0);
});

// Particles
runner.test('particleStep — mise a jour position et duree de vie', () => {
  const particles: Particle[] = [
    { position: [0, 10, 0], velocity: [0, 0, 0], lifetime: 2 },
  ];
  const result = particleStep(particles, [0, -10, 0], 0.1, [0, 0, 0], [0, 5, 0], 3);
  assertApprox(result[0].lifetime, 1.9, 0.001);
  assertApprox(result[0].position[1], 10, 0.001); // pos += vel*dt = 0
  assertApprox(result[0].velocity[1], -1, 0.001); // vel += gravity*dt
});

runner.test('particleStep — respawn particule morte', () => {
  const particles: Particle[] = [
    { position: [5, 5, 5], velocity: [1, 1, 1], lifetime: 0.05 },
  ];
  const result = particleStep(particles, [0, -10, 0], 0.1, [0, 0, 0], [0, 5, 0], 3);
  assertApprox(result[0].lifetime, 3, 0.001);
  assertArrayApprox(result[0].position, [0, 0, 0]);
});

// Animation Keyframes
runner.test('sampleKeyframes — interpolation lineaire', () => {
  const kf: Keyframe[] = [{ time: 0, value: 0 }, { time: 1, value: 10 }];
  assertApprox(sampleKeyframes(kf, 0.5), 5);
});

runner.test('sampleKeyframes — avant le premier keyframe', () => {
  const kf: Keyframe[] = [{ time: 1, value: 5 }, { time: 2, value: 10 }];
  assertApprox(sampleKeyframes(kf, 0), 5);
});

runner.test('sampleKeyframes — apres le dernier keyframe', () => {
  const kf: Keyframe[] = [{ time: 0, value: 0 }, { time: 1, value: 10 }];
  assertApprox(sampleKeyframes(kf, 5), 10);
});

// LOD
runner.test('selectLOD — distance proche = LOD 0', () => {
  assertEqual(selectLOD(5, [10, 50, 100]), 0);
});

runner.test('selectLOD — distance lointaine = dernier LOD', () => {
  assertEqual(selectLOD(200, [10, 50, 100]), 3);
});

// Ray-Terrain
runner.test('rayTerrainIntersect — rayon vers le bas touche le sol', () => {
  const hit = rayTerrainIntersect([5, 10, 5], [0, -1, 0], (_x, _z) => 0, 100, 0.1);
  assertTrue(hit !== null, 'Devrait toucher le terrain');
  assertApprox(hit![1], 0, 0.2);
});

runner.test('rayTerrainIntersect — rayon vers le haut rate', () => {
  const hit = rayTerrainIntersect([5, 10, 5], [0, 1, 0], (_x, _z) => 0, 100, 0.1);
  assertTrue(hit === null, 'Ne devrait pas toucher le terrain');
});

// First-person camera
runner.test('firstPerson — yaw=0 pitch=0 regarde vers +Z', () => {
  const { forward } = firstPersonVectors(0, 0);
  assertApprox(forward[2], 1, 0.01);
  assertApprox(forward[0], 0, 0.01);
});

runner.test('firstPerson — yaw=PI/2 regarde vers +X', () => {
  const { forward } = firstPersonVectors(Math.PI / 2, 0);
  assertApprox(forward[0], 1, 0.01);
  assertApprox(forward[2], 0, 0.01);
});

// Orbit camera
runner.test('orbitCamera — azimuth=0, elevation=0 -> sur l\'axe Z', () => {
  const pos = orbitCameraPosition([0, 0, 0], 10, 0, 0);
  assertApprox(pos[0], 0, 0.01);
  assertApprox(pos[1], 0, 0.01);
  assertApprox(pos[2], 10, 0.01);
});

runner.test('orbitCamera — elevation=PI/2 -> au-dessus', () => {
  const pos = orbitCameraPosition([0, 0, 0], 10, 0, Math.PI / 2);
  assertApprox(pos[1], 10, 0.01);
  assertApprox(pos[0], 0, 0.1);
  assertApprox(pos[2], 0, 0.1);
});

// Resource Manager
runner.test('resourceManager — detecte les fuites', () => {
  const rm = new ResourceManager();
  rm.load('texture-a');
  rm.load('texture-b');
  rm.load('mesh-c');
  rm.dispose('texture-a');
  assertEqual(rm.getLoadedCount(), 2);
  const leaks = rm.detectLeaks(['texture-a', 'texture-b', 'mesh-c']);
  assertEqual(leaks.length, 2);
  assertTrue(leaks.includes('texture-b'));
  assertTrue(leaks.includes('mesh-c'));
});

runner.test('resourceManager — aucune fuite si tout est dispose', () => {
  const rm = new ResourceManager();
  rm.load('tex');
  rm.dispose('tex');
  const leaks = rm.detectLeaks(['tex']);
  assertEqual(leaks.length, 0);
});

runner.run();
