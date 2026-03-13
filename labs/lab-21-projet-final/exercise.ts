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

// ─── Helpers (fournis) ──────────────────────────────────────────────────────

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

// ─── Noise helper (fourni) ──────────────────────────────────────────────────

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

// ─── Scene Graph ────────────────────────────────────────────────────────────

interface SceneNode {
  localTransform: Mat4;
  children: SceneNode[];
}

function computeWorldTransform(node: SceneNode, parentWorld: Mat4): Mat4 {
  // TODO: retourner parentWorld * node.localTransform
  return mat4Identity();
}

function computeWorldTransforms(node: SceneNode, parentWorld: Mat4): Mat4[] {
  // TODO: calculer la transform monde de ce noeud
  // Puis recurser sur les enfants
  // Retourner un tableau de toutes les transforms monde [ce noeud, enfants...]
  return [mat4Identity()];
}

// ─── Terrain Heightmap ──────────────────────────────────────────────────────

function terrainHeight(x: number, z: number, amplitude: number, frequency: number): number {
  // TODO: retourner simpleNoise(x * frequency, z * frequency) * amplitude
  return 0;
}

function terrainNormal(
  x: number, z: number, amplitude: number, frequency: number, epsilon: number,
): Vec3 {
  // TODO: echantillonner 4 voisins avec terrainHeight
  // Construire les tangentes et calculer la normale par produit vectoriel
  // Normaliser le resultat
  return [0, 1, 0];
}

// ─── Frustum Culling ────────────────────────────────────────────────────────

interface FrustumPlane {
  normal: Vec3;
  distance: number;
}

function aabbOutsidePlane(aabb: AABB, plane: FrustumPlane): boolean {
  // TODO: trouver le p-vertex (point le plus dans la direction de la normale)
  // Si sa distance signee < 0, l'AABB est entierement en dehors
  return false;
}

function frustumCullAABB(aabb: AABB, planes: FrustumPlane[]): boolean {
  // TODO: retourner true si l'AABB est visible (pas en dehors d'aucun plan)
  return true;
}

// ─── PBR Lighting ───────────────────────────────────────────────────────────

function distributionGGX(NdotH: number, roughness: number): number {
  // TODO: a = roughness^2, a2 = a^2
  // D = a2 / (PI * (NdotH^2 * (a2 - 1) + 1)^2)
  return 0;
}

function geometrySchlickGGX(NdotV: number, roughness: number): number {
  // TODO: k = (roughness + 1)^2 / 8
  // G1 = NdotV / (NdotV * (1 - k) + k)
  return 0;
}

function geometrySmith(NdotV: number, NdotL: number, roughness: number): number {
  // TODO: G = G1(NdotV) * G1(NdotL)
  return 0;
}

function fresnelSchlick(cosTheta: number, f0: number): number {
  // TODO: F = f0 + (1 - f0) * (1 - cosTheta)^5
  return 0;
}

function pbrSpecular(
  N: Vec3, V: Vec3, L: Vec3, roughness: number, f0: number,
): number {
  // TODO: calculer H, NdotH, NdotV, NdotL, HdotV
  // Combiner D, G, F en DGF / (4 * NdotV * NdotL)
  return 0;
}

// ─── Shadow Map Lookup with PCF ─────────────────────────────────────────────

function shadowPCF(
  u: number, v: number, depth: number,
  depthMap: (u: number, v: number) => number,
  texelSize: number, bias: number,
): number {
  // TODO: boucle 3x3, comparer depth - bias vs depthMap
  // Retourner la moyenne (1 = eclaire)
  return 0;
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
  // TODO: pour chaque particule:
  // - Decrementer lifetime
  // - Si morte (lifetime <= 0): respawner avec les valeurs fournies
  // - Sinon: pos += vel*dt, vel += gravity*dt
  return particles;
}

// ─── Animation Keyframe ─────────────────────────────────────────────────────

interface Keyframe {
  time: number;
  value: number;
}

function sampleKeyframes(keyframes: Keyframe[], t: number): number {
  // TODO: trouver les deux keyframes encadrant t
  // Interpoler lineairement entre elles
  // Si t avant le premier ou apres le dernier, clamper
  return 0;
}

// ─── LOD Selection ──────────────────────────────────────────────────────────

function selectLOD(distance: number, thresholds: number[]): number {
  // TODO: retourner l'index du premier seuil > distance
  // Si au-dela de tous les seuils, retourner thresholds.length
  return 0;
}

// ─── Ray-Terrain Intersection ───────────────────────────────────────────────

function rayTerrainIntersect(
  origin: Vec3, direction: Vec3,
  heightFn: (x: number, z: number) => number,
  maxDist: number, stepSize: number,
): Vec3 | null {
  // TODO: avancer le long du rayon par pas de stepSize
  // A chaque pas, verifier si la hauteur du point est <= heightFn(x, z)
  // Retourner le point d'intersection ou null
  return null;
}

// ─── Camera First-Person ────────────────────────────────────────────────────

function firstPersonVectors(yaw: number, pitch: number): { forward: Vec3; right: Vec3 } {
  // TODO: forward = (cos(pitch)*sin(yaw), sin(pitch), cos(pitch)*cos(yaw))
  // right = normalize(cross(forward, worldUp))
  return { forward: [0, 0, 1], right: [1, 0, 0] };
}

// ─── Orbit Camera ───────────────────────────────────────────────────────────

function orbitCameraPosition(
  target: Vec3, distance: number, azimuth: number, elevation: number,
): Vec3 {
  // TODO: coordonnees spheriques -> cartesiennes
  // x = target.x + dist * cos(elev) * sin(azimuth)
  // y = target.y + dist * sin(elev)
  // z = target.z + dist * cos(elev) * cos(azimuth)
  return [0, 0, 0];
}

// ─── Resource Manager ───────────────────────────────────────────────────────

class ResourceManager {
  private loaded = new Map<string, boolean>();

  load(name: string): void {
    // TODO: marquer la ressource comme chargee
  }

  dispose(name: string): void {
    // TODO: supprimer la ressource
  }

  isLoaded(name: string): boolean {
    // TODO: retourner true si la ressource est chargee
    return false;
  }

  getLoadedCount(): number {
    // TODO: retourner le nombre de ressources chargees
    return 0;
  }

  detectLeaks(expectedDisposed: string[]): string[] {
    // TODO: retourner les noms des ressources qui devraient etre disposees
    // mais qui sont encore chargees
    return [];
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 21 — Projet final');

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

runner.test('frustumCull — AABB dans le frustum', () => {
  const planes: FrustumPlane[] = [
    { normal: [1, 0, 0], distance: 10 },
    { normal: [-1, 0, 0], distance: 10 },
    { normal: [0, 1, 0], distance: 10 },
    { normal: [0, -1, 0], distance: 10 },
    { normal: [0, 0, 1], distance: 10 },
    { normal: [0, 0, -1], distance: 10 },
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

runner.test('PBR — specular non nul pour surface lisse', () => {
  const N: Vec3 = [0, 1, 0];
  const V: Vec3 = [0, 1, 0];
  const L: Vec3 = vec3Normalize([0.5, 1, 0]);
  const spec = pbrSpecular(N, V, L, 0.1, 0.04);
  assertTrue(spec > 0, `Specular devrait etre > 0, got ${spec}`);
});

runner.test('PBR — surface lisse a un pic speculaire plus intense au reflet', () => {
  const N: Vec3 = [0, 1, 0];
  const V: Vec3 = vec3Normalize([0, 1, 0.001]);
  const L: Vec3 = vec3Normalize([0, 1, -0.001]);
  const smooth = pbrSpecular(N, V, L, 0.1, 0.04);
  const rough = pbrSpecular(N, V, L, 0.9, 0.04);
  assertTrue(smooth > rough, `Smooth (${smooth}) devrait > rough (${rough})`);
});

runner.test('shadowPCF — entierement eclaire', () => {
  const result = shadowPCF(0.5, 0.5, 0.3, () => 1.0, 1 / 512, 0.001);
  assertApprox(result, 1.0);
});

runner.test('shadowPCF — entierement dans l\'ombre', () => {
  const result = shadowPCF(0.5, 0.5, 0.9, () => 0.1, 1 / 512, 0.001);
  assertApprox(result, 0.0);
});

runner.test('particleStep — mise a jour position et duree de vie', () => {
  const particles: Particle[] = [
    { position: [0, 10, 0], velocity: [0, 0, 0], lifetime: 2 },
  ];
  const result = particleStep(particles, [0, -10, 0], 0.1, [0, 0, 0], [0, 5, 0], 3);
  assertApprox(result[0].lifetime, 1.9, 0.001);
  assertApprox(result[0].position[1], 10, 0.001);
  assertApprox(result[0].velocity[1], -1, 0.001);
});

runner.test('particleStep — respawn particule morte', () => {
  const particles: Particle[] = [
    { position: [5, 5, 5], velocity: [1, 1, 1], lifetime: 0.05 },
  ];
  const result = particleStep(particles, [0, -10, 0], 0.1, [0, 0, 0], [0, 5, 0], 3);
  assertApprox(result[0].lifetime, 3, 0.001);
  assertArrayApprox(result[0].position, [0, 0, 0]);
});

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

runner.test('selectLOD — distance proche = LOD 0', () => {
  assertEqual(selectLOD(5, [10, 50, 100]), 0);
});

runner.test('selectLOD — distance lointaine = dernier LOD', () => {
  assertEqual(selectLOD(200, [10, 50, 100]), 3);
});

runner.test('rayTerrainIntersect — rayon vers le bas touche le sol', () => {
  const hit = rayTerrainIntersect([5, 10, 5], [0, -1, 0], (_x, _z) => 0, 100, 0.1);
  assertTrue(hit !== null, 'Devrait toucher le terrain');
  assertApprox(hit![1], 0, 0.2);
});

runner.test('rayTerrainIntersect — rayon vers le haut rate', () => {
  const hit = rayTerrainIntersect([5, 10, 5], [0, 1, 0], (_x, _z) => 0, 100, 0.1);
  assertTrue(hit === null, 'Ne devrait pas toucher le terrain');
});

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
