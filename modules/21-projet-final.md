# Module 21 — Projet intermédiaire

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 240 min       | [Lab 21](../labs/lab-21-projet-final/) | — |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Architecturer un projet 3D complet en modules ES avec un scene graph structure
- Combiner terrain procedural, eclairage PBR, ombres, post-processing et physique
- Charger et animer des modèles glTF dans une scene complexe
- Configurer un pipeline de post-processing multi-passes (bloom, SSAO, tone mapping)
- Intégrer Rapier.js pour des interactions physiques en temps réel
- Implementer un système de particules GPU via compute shader
- Gérer une camera duale (orbit + first person) avec transition smooth
- Optimiser pour maintenir 60 FPS stables avec LOD, instancing et frustum culling
- Appliquer une checklist qualite : 0 memory leaks, progressive loading, responsive

---

<details>
<summary>Rappel du cours précédent — Physique et interactions (Module 20)</summary>

Au module 20, nous avons intégré la physique avec Rapier.js :

- **Rapier.js** : moteur physique Rust compile en WASM, initialise avec `await RAPIER.init()`
- **Rigid bodies** : `dynamic()` (forces/gravite), `kinematicPositionBased()` (controle direct), `fixed()` (immobile)
- **Colliders** : `ball()`, `cuboid()`, `capsule()` (primitives rapides), `trimesh()`, `convexHull()` (précis mais couteux)
- **Forces vs impulses** : `addForce()` (continue) vs `applyImpulse()` (ponctuelle)
- **Collision events** : `EventQueue`, `drainCollisionEvents()`, sensors, collision groups
- **Raycasting** : `world.castRay()` pour le picking précis d'objets
- **Joints** : `RevoluteJoint` (charniere), `PrismaticJoint` (piston), `FixedJoint` (soude), `BallJoint` (rotule)
- **Character controller** : `KinematicCharacterController` avec detection sol, pentes, marches
- **Fixed timestep** : `world.step(1/60)` avec accumulation et interpolation pour un rendu smooth

Ce module intermédiaire combine tout ce que nous avons appris dans les modules 00 a 20 pour créer une scene 3D interactive complete. Il s'agit d'un jalon de consolidation : un vrai projet final expert, integrant egalement les modules avances 22 a 28, est propose en fin de cursus (module 29).

</details>

---

## Architecture du projet

:::tip Analogie
Construire une scene 3D complete, c'est comme diriger un film. Tu as besoin d'un decor (terrain), d'un eclairage (lumieres + ombres), d'acteurs (modèles animes), d'effets speciaux (post-processing + particules), d'un cameraman (camera controls), et d'un coordinateur des cascades (physique). Chaque departement a son propre code, mais tous doivent travailler ensemble frame après frame. L'architecture du projet est le script qui coordonne tout ça.
:::

### Structure des fichiers

```
project/
├── src/
│   ├── main.ts                  # Point d'entree, bootstrap
│   ├── App.ts                   # Classe principale, game loop
│   ├── core/
│   │   ├── Engine.ts            # Renderer, scene, camera, clock
│   │   ├── AssetLoader.ts       # Chargement glTF, textures, HDR
│   │   └── InputManager.ts      # Clavier, souris, gamepad
│   ├── world/
│   │   ├── Terrain.ts           # Terrain procedural (noise)
│   │   ├── Water.ts             # Plan d'eau (shader)
│   │   ├── Sky.ts               # Ciel (gradient ou skybox)
│   │   └── Vegetation.ts        # Arbres instancies
│   ├── entities/
│   │   ├── Character.ts         # Modele glTF anime + physique
│   │   └── InteractiveObject.ts # Objets ramassables/lancables
│   ├── systems/
│   │   ├── PhysicsSystem.ts     # Rapier world + sync
│   │   ├── ParticleSystem.ts    # Compute shader particules
│   │   ├── CameraSystem.ts      # Orbit + first person
│   │   └── UISystem.ts          # CSS2DRenderer overlays
│   ├── rendering/
│   │   ├── PostProcessing.ts    # Bloom, SSAO, tone mapping
│   │   └── ShadowSetup.ts      # CSM configuration
│   └── shaders/
│       ├── terrain.vert.glsl
│       ├── terrain.frag.glsl
│       ├── water.vert.glsl
│       ├── water.frag.glsl
│       └── particles.comp.wgsl
├── assets/
│   ├── models/                  # glTF files
│   ├── textures/                # PBR texture sets
│   └── hdri/                    # Environment maps
├── index.html
├── package.json
└── tsconfig.json
```

### Classe principale App.ts

```typescript
import * as THREE from 'three';
import { Engine } from './core/Engine';
import { AssetLoader } from './core/AssetLoader';
import { InputManager } from './core/InputManager';
import { Terrain } from './world/Terrain';
import { Water } from './world/Water';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { ParticleSystem } from './systems/ParticleSystem';
import { CameraSystem } from './systems/CameraSystem';
import { PostProcessing } from './rendering/PostProcessing';
import { UISystem } from './systems/UISystem';

export class App {
  private engine: Engine;
  private assets: AssetLoader;
  private input: InputManager;
  private physics: PhysicsSystem;
  private terrain: Terrain;
  private water: Water;
  private particles: ParticleSystem;
  private camera: CameraSystem;
  private postProcessing: PostProcessing;
  private ui: UISystem;

  private isRunning = false;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    // 1. Engine (renderer, scene, camera)
    this.engine = new Engine(canvas);

    // 2. Assets (attendre que tout soit charge)
    this.assets = new AssetLoader();
    await this.assets.loadAll((progress) => {
      console.log(`Loading: ${(progress * 100).toFixed(0)}%`);
    });

    // 3. Input
    this.input = new InputManager(canvas);

    // 4. Physique (WASM async)
    this.physics = new PhysicsSystem();
    await this.physics.init();

    // 5. Monde
    this.terrain = new Terrain(this.engine.scene, this.physics);
    this.water = new Water(this.engine.scene);

    // 6. Systemes
    this.particles = new ParticleSystem(this.engine.scene);
    this.camera = new CameraSystem(this.engine.camera, this.input, canvas);
    this.postProcessing = new PostProcessing(
      this.engine.renderer,
      this.engine.scene,
      this.engine.camera
    );
    this.ui = new UISystem(this.engine.renderer, this.engine.scene, this.engine.camera);

    // 7. Eclairage et ombres
    this.setupLighting();

    // 8. Entites
    await this.spawnEntities();

    this.isRunning = true;
  }

  private setupLighting(): void {
    const scene = this.engine.scene;

    // Soleil (directional light avec ombres)
    const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // Lumiere ambiante (ciel)
    const ambient = new THREE.HemisphereLight(
      0x87ceeb,  // Ciel bleu
      0x362907,  // Sol brun
      0.4
    );
    scene.add(ambient);

    // Point lights decoratives
    const torchPositions = [
      new THREE.Vector3(-5, 2, 3),
      new THREE.Vector3(8, 2, -4),
      new THREE.Vector3(0, 2, -8),
    ];

    for (const pos of torchPositions) {
      const torch = new THREE.PointLight(0xff6600, 2.0, 15);
      torch.position.copy(pos);
      torch.castShadow = true;
      torch.shadow.mapSize.set(512, 512);
      scene.add(torch);
    }
  }

  private async spawnEntities(): Promise<void> {
    // Charger des modeles glTF (module 15)
    // ... voir section suivante
  }

  update(deltaTime: number): void {
    if (!this.isRunning) return;

    // Ordre de mise a jour important !
    this.input.update();
    this.physics.update(deltaTime);
    this.terrain.update(deltaTime);
    this.water.update(deltaTime, this.engine.camera);
    this.particles.update(deltaTime);
    this.camera.update(deltaTime);
    this.ui.update();

    // Rendu avec post-processing
    this.postProcessing.render();
  }

  dispose(): void {
    this.physics.dispose();
    this.terrain.dispose();
    this.water.dispose();
    this.particles.dispose();
    this.postProcessing.dispose();
    this.ui.dispose();
    this.engine.dispose();
    this.input.dispose();
    this.isRunning = false;
  }
}
```

### Point d'entree main.ts

```typescript
import { App } from './App';

const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const app = new App();

async function start(): Promise<void> {
  try {
    await app.init(canvas);

    const clock = new THREE.Clock();

    function loop(): void {
      const dt = Math.min(clock.getDelta(), 0.1);
      app.update(dt);
      requestAnimationFrame(loop);
    }

    loop();
  } catch (error) {
    console.error('Failed to initialize:', error);
    document.body.innerHTML = `
      <div style="color:white;padding:20px;font-family:monospace;">
        <h2>Erreur d'initialisation</h2>
        <p>${error instanceof Error ? error.message : String(error)}</p>
        <p>Verifiez que votre navigateur supporte WebGL 2 / WebGPU.</p>
      </div>
    `;
  }
}

start();

// Cleanup propre a la fermeture
window.addEventListener('beforeunload', () => app.dispose());
```

---

## Terrain procedural (module 19)

```typescript
import * as THREE from 'three';
import { PhysicsSystem } from '../systems/PhysicsSystem';

// Vertex + fragment shaders inline (ou importes depuis des fichiers .glsl)
const terrainVertexShader = /* glsl */ `
  // ... noise functions (voir module 19) ...

  uniform float uTime;
  uniform float uTerrainScale;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUV;

  float getHeight(vec2 p) {
    return fbm(p * 0.12, 6) * 10.0
         + fbm(p * 0.5, 3) * 1.5;  // Micro-detail
  }

  void main() {
    vec3 pos = position;
    float h = getHeight(pos.xz);
    pos.y = h;

    // Normale par differences finies
    float eps = 0.1;
    float hL = getHeight(pos.xz - vec2(eps, 0.0));
    float hR = getHeight(pos.xz + vec2(eps, 0.0));
    float hD = getHeight(pos.xz - vec2(0.0, eps));
    float hU = getHeight(pos.xz + vec2(0.0, eps));
    vNormal = normalize(vec3(hL - hR, 2.0 * eps, hD - hU));

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vUV = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const terrainFragmentShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUV;

  uniform vec3 uSunDirection;

  void main() {
    vec3 N = normalize(vNormal);
    float h = vWorldPos.y;
    float slope = 1.0 - N.y;

    // Biomes par altitude + pente
    vec3 sand  = vec3(0.76, 0.70, 0.50);
    vec3 grass = vec3(0.25, 0.45, 0.12);
    vec3 rock  = vec3(0.50, 0.45, 0.40);
    vec3 snow  = vec3(0.95, 0.95, 0.98);

    vec3 color = sand;
    color = mix(color, grass, smoothstep(0.5, 2.0, h));
    color = mix(color, rock,  smoothstep(5.0, 7.0, h));
    color = mix(color, snow,  smoothstep(8.0, 9.5, h));
    color = mix(color, rock,  smoothstep(0.3, 0.6, slope));

    // Eclairage
    float diffuse = max(dot(N, uSunDirection), 0.0);
    vec3 ambient = vec3(0.15, 0.17, 0.22);
    gl_FragColor = vec4(color * (ambient + diffuse * 0.85), 1.0);
  }
`;

export class Terrain {
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private heightData: Float32Array;
  private readonly SIZE = 100;
  private readonly SEGMENTS = 256;

  constructor(scene: THREE.Scene, physics: PhysicsSystem) {
    // Geometrie (plan subdivise)
    const geo = new THREE.PlaneGeometry(
      this.SIZE, this.SIZE,
      this.SEGMENTS, this.SEGMENTS
    );
    geo.rotateX(-Math.PI / 2);

    // Materiau
    this.material = new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uTerrainScale: { value: 1.0 },
        uSunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    // Extraire le heightfield pour la physique
    this.heightData = this.generateHeightData();
    physics.addHeightField(
      this.heightData,
      this.SEGMENTS + 1,
      this.SEGMENTS + 1,
      this.SIZE,
      10.0, // hauteur max
      this.SIZE
    );
  }

  private generateHeightData(): Float32Array {
    // Generer les memes hauteurs cote CPU pour la physique
    // (le GPU genere les siennes dans le shader)
    const rows = this.SEGMENTS + 1;
    const cols = this.SEGMENTS + 1;
    const data = new Float32Array(rows * cols);

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const worldX = (x / (cols - 1) - 0.5) * this.SIZE;
        const worldZ = (z / (rows - 1) - 0.5) * this.SIZE;
        // FBM cote CPU (implementation simplifiee)
        data[z * cols + x] = this.cpuFBM(worldX, worldZ);
      }
    }

    return data;
  }

  private cpuFBM(x: number, z: number): number {
    // Implementation CPU du meme FBM que le shader
    let value = 0;
    let amplitude = 0.5;
    let frequency = 0.12;
    for (let i = 0; i < 6; i++) {
      value += amplitude * this.cpuNoise(x * frequency, z * frequency);
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value * 10.0;
  }

  private cpuNoise(x: number, z: number): number {
    // Perlin noise simplifie cote CPU
    // En production, utiliser une lib comme 'simplex-noise'
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;

    const hash = (a: number, b: number) =>
      Math.sin(a * 127.1 + b * 311.7) * 43758.5453 % 1;

    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);

    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);

    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }

  update(deltaTime: number): void {
    this.material.uniforms.uTime.value += deltaTime;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
```

---

## Eclairage et ombres (modules 14, 18)

### Configuration des Cascaded Shadow Maps

```typescript
import * as THREE from 'three';
// CSM est disponible dans three/addons
import { CSM } from 'three/addons/csm/CSM.js';

export class ShadowSetup {
  private csm: CSM;

  constructor(
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer
  ) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Cascaded Shadow Maps — 3 cascades
    this.csm = new CSM({
      maxFar: camera.far,
      cascades: 3,
      mode: 'practical',        // Repartition logarithmique + lineaire
      parent: scene,
      shadowMapSize: 2048,
      lightDirection: new THREE.Vector3(-0.5, -0.8, -0.3).normalize(),
      camera: camera,
      shadowBias: [-0.0001, -0.0001, -0.0001],
      lightNear: 1,
      lightFar: 200,
    });

    // Les materiaux doivent etre "setuppes" pour le CSM
    // Le CSM modifie les shaders des materiaux automatiquement
  }

  // Appeler AVANT le rendu de chaque frame
  update(): void {
    this.csm.update();
  }

  // Enregistrer un materiau pour qu'il recoive les ombres CSM
  setupMaterial(material: THREE.Material): void {
    this.csm.setupMaterial(material);
  }

  dispose(): void {
    this.csm.dispose();
  }
}
```

---

## Modeles glTF animes (module 15)

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class AssetLoader {
  private gltfLoader: GLTFLoader;
  private textureLoader: THREE.TextureLoader;
  private cache: Map<string, THREE.Object3D> = new Map();

  constructor() {
    // Draco pour la decompression des meshes compresses
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/draco/');

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(dracoLoader);

    this.textureLoader = new THREE.TextureLoader();
  }

  async loadGLTF(url: string): Promise<{
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  }> {
    // Verifier le cache
    if (this.cache.has(url)) {
      return {
        scene: this.cache.get(url)!.clone() as THREE.Group,
        animations: [],
      };
    }

    const gltf = await this.gltfLoader.loadAsync(url);

    // Configurer les ombres sur tous les meshes
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // S'assurer que les textures sont en sRGB
        if (child.material instanceof THREE.MeshStandardMaterial) {
          if (child.material.map) {
            child.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      }
    });

    this.cache.set(url, gltf.scene.clone());

    return {
      scene: gltf.scene,
      animations: gltf.animations,
    };
  }

  async loadAll(onProgress: (progress: number) => void): Promise<void> {
    const assets = [
      '/models/character.glb',
      '/models/tree.glb',
      '/models/rock.glb',
    ];

    let loaded = 0;
    for (const url of assets) {
      await this.loadGLTF(url);
      loaded++;
      onProgress(loaded / assets.length);
    }
  }
}

// ─── Entite animee ──────────────────────────────────────
export class AnimatedCharacter {
  mesh: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction> = new Map();
  currentAction: THREE.AnimationAction | null = null;

  constructor(gltfScene: THREE.Group, animations: THREE.AnimationClip[]) {
    this.mesh = gltfScene;
    this.mixer = new THREE.AnimationMixer(this.mesh);

    // Indexer toutes les animations par nom
    for (const clip of animations) {
      const action = this.mixer.clipAction(clip);
      this.actions.set(clip.name, action);
    }
  }

  play(name: string, crossFadeDuration = 0.3): void {
    const newAction = this.actions.get(name);
    if (!newAction || newAction === this.currentAction) return;

    newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();

    if (this.currentAction) {
      this.currentAction.crossFadeTo(newAction, crossFadeDuration, true);
    }

    this.currentAction = newAction;
  }

  update(deltaTime: number): void {
    this.mixer.update(deltaTime);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
```

---

## Post-processing pipeline (module 16)

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

export class PostProcessing {
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private ssaoPass: SSAOPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) {
    // Tone mapping sur le renderer
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Composer
    this.composer = new EffectComposer(renderer);

    // Passe 1 : Rendu de la scene
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Passe 2 : SSAO (Screen Space Ambient Occlusion)
    this.ssaoPass = new SSAOPass(scene, camera, innerWidth, innerHeight);
    this.ssaoPass.kernelRadius = 16;
    this.ssaoPass.minDistance = 0.005;
    this.ssaoPass.maxDistance = 0.1;
    this.composer.addPass(this.ssaoPass);

    // Passe 3 : Bloom (lueurs sur les surfaces brillantes)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.5,   // strength — intensite du bloom
      0.4,   // radius — taille du halo
      0.85   // threshold — seuls les pixels > 0.85 brillent
    );
    this.composer.addPass(this.bloomPass);

    // Passe 4 : Vignette (assombrissement des bords)
    const vignetteShader = {
      uniforms: {
        tDiffuse: { value: null },
        uDarkness: { value: 1.2 },
        uOffset: { value: 0.9 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUV;
        void main() {
          vUV = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uDarkness;
        uniform float uOffset;
        varying vec2 vUV;

        void main() {
          vec4 color = texture2D(tDiffuse, vUV);
          vec2 center = vUV - 0.5;
          float dist = length(center);
          float vignette = smoothstep(uOffset, uOffset - 0.4, dist);
          color.rgb = mix(color.rgb * (1.0 - uDarkness), color.rgb, vignette);
          gl_FragColor = color;
        }
      `,
    };
    this.composer.addPass(new ShaderPass(vignetteShader));

    // Passe 5 : Output (conversion sRGB finale)
    this.composer.addPass(new OutputPass());
  }

  render(): void {
    this.composer.render();
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  // Toggle les effets individuellement
  setBloomEnabled(enabled: boolean): void {
    this.bloomPass.enabled = enabled;
  }

  setSSAOEnabled(enabled: boolean): void {
    this.ssaoPass.enabled = enabled;
  }

  dispose(): void {
    this.composer.dispose();
  }
}
```

---

## Physique Rapier : objets interactifs (module 20)

```typescript
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export class PhysicsSystem {
  world!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;
  private bodyMeshMap: Map<RAPIER.RigidBody, THREE.Object3D> = new Map();
  private accumulator = 0;
  private readonly FIXED_DT = 1 / 60;

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  // Ajouter un body dynamique lie a un mesh
  addDynamic(
    mesh: THREE.Object3D,
    colliderDesc: RAPIER.ColliderDesc,
    position: THREE.Vector3
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z);

    const body = this.world.createRigidBody(bodyDesc);
    this.world.createCollider(colliderDesc, body);

    this.bodyMeshMap.set(body, mesh);
    return body;
  }

  // Ajouter un body fixe (sol, murs)
  addFixed(
    colliderDesc: RAPIER.ColliderDesc,
    position: THREE.Vector3
  ): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z);

    const body = this.world.createRigidBody(bodyDesc);
    this.world.createCollider(colliderDesc, body);
    return body;
  }

  // Ajouter un heightfield pour le terrain
  addHeightField(
    heights: Float32Array,
    rows: number,
    cols: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number
  ): void {
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const heightFieldDesc = RAPIER.ColliderDesc.heightfield(
      rows, cols, heights,
      new RAPIER.Vector3(scaleX, scaleY, scaleZ)
    );
    this.world.createCollider(heightFieldDesc, groundBody);
  }

  // Lancer un objet (clic souris)
  launchObject(
    mesh: THREE.Object3D,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number
  ): RAPIER.RigidBody {
    const body = this.addDynamic(
      mesh,
      RAPIER.ColliderDesc.ball(0.2).setRestitution(0.6).setDensity(3.0),
      origin
    );

    body.setLinvel(
      new RAPIER.Vector3(
        direction.x * speed,
        direction.y * speed,
        direction.z * speed
      ),
      true
    );

    return body;
  }

  update(deltaTime: number): void {
    this.accumulator += Math.min(deltaTime, 0.1);

    while (this.accumulator >= this.FIXED_DT) {
      this.world.step(this.eventQueue);
      this.accumulator -= this.FIXED_DT;
    }

    // Synchroniser Rapier -> Three.js
    this.bodyMeshMap.forEach((mesh, body) => {
      const pos = body.translation();
      const rot = body.rotation();
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    });

    // Traiter les events de collision
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (started) {
        // Reagir aux collisions (sons, effets, degats...)
      }
    });
  }

  // Supprimer un body et son mesh
  remove(body: RAPIER.RigidBody, scene: THREE.Scene): void {
    const mesh = this.bodyMeshMap.get(body);
    if (mesh) {
      scene.remove(mesh);
      this.bodyMeshMap.delete(body);
    }
    this.world.removeRigidBody(body);
  }

  dispose(): void {
    this.world.free();
  }
}
```

---

## Système de particules GPU (module 11)

```typescript
import * as THREE from 'three';

// Systeme de particules de pluie/neige avec Transform Feedback
// (ou Compute Shader si WebGPU)
export class ParticleSystem {
  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private readonly COUNT = 50000;

  constructor(scene: THREE.Scene) {
    // Generer les positions initiales
    const positions = new Float32Array(this.COUNT * 3);
    const velocities = new Float32Array(this.COUNT * 3);
    const lifetimes = new Float32Array(this.COUNT);

    for (let i = 0; i < this.COUNT; i++) {
      // Position aleatoire dans un grand volume
      positions[i * 3]     = (Math.random() - 0.5) * 100; // x
      positions[i * 3 + 1] = Math.random() * 30;            // y
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100; // z

      // Velocite descendante (pluie)
      velocities[i * 3]     = (Math.random() - 0.5) * 0.5;
      velocities[i * 3 + 1] = -(5 + Math.random() * 5);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;

      lifetimes[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geo.setAttribute('aLifetime', new THREE.BufferAttribute(lifetimes, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 aVelocity;
        attribute float aLifetime;
        uniform float uTime;
        uniform vec3 uCameraPos;

        varying float vAlpha;

        void main() {
          // Simuler la position (CPU-driven, repeating)
          float t = fract(aLifetime + uTime * 0.05);
          vec3 pos = position;

          // Reset quand la particule atteint le sol
          pos.y = 30.0 - t * 35.0;
          pos.x += aVelocity.x * t * 10.0;
          pos.z += aVelocity.z * t * 10.0;

          vAlpha = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.8, t);

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPos;

          // Taille des particules (plus petites au loin)
          gl_PointSize = 3.0 * (300.0 / -mvPos.z);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;

        void main() {
          // Forme circulaire
          vec2 center = gl_PointCoord - 0.5;
          if (length(center) > 0.5) discard;

          // Goutte de pluie blanche semi-transparente
          gl_FragColor = vec4(0.7, 0.8, 0.9, vAlpha * 0.4);
        }
      `,
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false; // Les particules couvrent toute la scene
    scene.add(this.points);
  }

  update(deltaTime: number): void {
    this.material.uniforms.uTime.value += deltaTime;
  }

  setType(type: 'rain' | 'snow'): void {
    // Modifier la vitesse et la taille selon le type
    if (type === 'snow') {
      // Neige : plus lente, plus grosse, plus de lateral
      this.material.uniforms.uTime.value = 0; // Reset
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
```

---

## UI overlay : CSS2DRenderer

```typescript
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class UISystem {
  private labelRenderer: CSS2DRenderer;
  private labels: Map<string, CSS2DObject> = new Map();

  constructor(
    renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera
  ) {
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(innerWidth, innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(this.labelRenderer.domElement);
  }

  // Ajouter un label flottant au-dessus d'un objet
  addLabel(id: string, text: string, parent: THREE.Object3D, offset = 2): void {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = `
      color: white;
      font: bold 14px sans-serif;
      background: rgba(0, 0, 0, 0.6);
      padding: 4px 8px;
      border-radius: 4px;
      white-space: nowrap;
    `;

    const label = new CSS2DObject(div);
    label.position.set(0, offset, 0);
    parent.add(label);

    this.labels.set(id, label);
  }

  // Mettre a jour le texte d'un label
  updateLabel(id: string, text: string): void {
    const label = this.labels.get(id);
    if (label) {
      (label.element as HTMLDivElement).textContent = text;
    }
  }

  // Supprimer un label
  removeLabel(id: string): void {
    const label = this.labels.get(id);
    if (label) {
      label.parent?.remove(label);
      label.element.remove();
      this.labels.delete(id);
    }
  }

  update(): void {
    this.labelRenderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.labelRenderer.setSize(width, height);
  }

  dispose(): void {
    this.labels.forEach((_label, id) => this.removeLabel(id));
    this.labelRenderer.domElement.remove();
  }
}
```

---

## Camera system : orbit + first person

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { InputManager } from '../core/InputManager';

type CameraMode = 'orbit' | 'firstPerson';

export class CameraSystem {
  private mode: CameraMode = 'orbit';
  private orbitControls: OrbitControls;
  private fpControls: PointerLockControls;
  private camera: THREE.PerspectiveCamera;
  private input: InputManager;

  // First person movement
  private velocity = new THREE.Vector3();
  private readonly SPEED = 8;
  private readonly DAMPING = 5;

  constructor(
    camera: THREE.PerspectiveCamera,
    input: InputManager,
    canvas: HTMLCanvasElement
  ) {
    this.camera = camera;
    this.input = input;

    // Orbit controls (mode par defaut)
    this.orbitControls = new OrbitControls(camera, canvas);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.1;
    this.orbitControls.maxPolarAngle = Math.PI * 0.45;
    this.orbitControls.minDistance = 5;
    this.orbitControls.maxDistance = 50;

    // First person controls
    this.fpControls = new PointerLockControls(camera, canvas);
    this.fpControls.pointerSpeed = 0.8;

    // Toggle avec Tab
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.toggleMode();
      }
    });
  }

  toggleMode(): void {
    if (this.mode === 'orbit') {
      this.mode = 'firstPerson';
      this.orbitControls.enabled = false;
      this.fpControls.lock();
    } else {
      this.mode = 'orbit';
      this.orbitControls.enabled = true;
      this.fpControls.unlock();
    }
  }

  update(deltaTime: number): void {
    if (this.mode === 'orbit') {
      this.orbitControls.update();
    } else {
      this.updateFirstPerson(deltaTime);
    }
  }

  private updateFirstPerson(dt: number): void {
    if (!this.fpControls.isLocked) return;

    const direction = new THREE.Vector3();

    if (this.input.isKeyDown('KeyW')) direction.z -= 1;
    if (this.input.isKeyDown('KeyS')) direction.z += 1;
    if (this.input.isKeyDown('KeyA')) direction.x -= 1;
    if (this.input.isKeyDown('KeyD')) direction.x += 1;

    direction.normalize();

    // Transformer dans le repere de la camera
    direction.applyQuaternion(this.camera.quaternion);
    direction.y = 0; // Pas de vol vertical
    direction.normalize();

    // Acceleration
    this.velocity.add(direction.multiplyScalar(this.SPEED * dt));

    // Damping
    this.velocity.multiplyScalar(Math.max(0, 1 - this.DAMPING * dt));

    // Appliquer
    this.camera.position.add(this.velocity.clone().multiplyScalar(dt));
  }

  dispose(): void {
    this.orbitControls.dispose();
    this.fpControls.dispose();
  }
}
```

---

## Performance : LOD, instancing, cleanup (module 17)

```typescript
// ─── LOD (Level of Detail) ──────────────────────────────
function createTreeLOD(assetLoader: AssetLoader): THREE.LOD {
  const lod = new THREE.LOD();

  // Niveau 0 : modele detaille (proche)
  const highPoly = assetLoader.getModel('tree-high'); // 5000 triangles
  lod.addLevel(highPoly, 0);

  // Niveau 1 : modele moyen (milieu)
  const midPoly = assetLoader.getModel('tree-mid'); // 1000 triangles
  lod.addLevel(midPoly, 20);

  // Niveau 2 : billboard (loin)
  const billboard = createBillboard('tree-sprite.png');
  lod.addLevel(billboard, 50);

  return lod;
}

// ─── Instancing (arbres, rochers) ───────────────────────
function createInstancedTrees(
  scene: THREE.Scene,
  treeGeo: THREE.BufferGeometry,
  treeMat: THREE.Material,
  positions: THREE.Vector3[],
): THREE.InstancedMesh {
  const count = positions.length;
  const mesh = new THREE.InstancedMesh(treeGeo, treeMat, count);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Rotation aleatoire sur Y
    quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.random() * Math.PI * 2
    );

    // Echelle aleatoire (±20%)
    const s = 0.8 + Math.random() * 0.4;
    scale.set(s, s, s);

    matrix.compose(positions[i], quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return mesh;
}

// ─── Dispose complet ────────────────────────────────────
function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();

      if (Array.isArray(object.material)) {
        object.material.forEach(disposeMaterial);
      } else {
        disposeMaterial(object.material);
      }
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  // Disposer toutes les textures du materiau
  for (const key of Object.keys(material)) {
    const value = (material as Record<string, unknown>)[key];
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

// ─── Responsive ─────────────────────────────────────────
function setupResponsive(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  composer: EffectComposer
): void {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    const { width, height } = entry.contentRect;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    composer.setSize(width, height);
  });

  observer.observe(renderer.domElement.parentElement!);
}
```

---

## Checklist qualite

### 60 FPS stable

```typescript
// Monitorer les performances avec stats.js
import Stats from 'three/addons/libs/stats.module.js';

const stats = new Stats();
stats.showPanel(0); // 0 = FPS, 1 = MS, 2 = MB
document.body.appendChild(stats.dom);

function animate(): void {
  stats.begin();

  app.update(clock.getDelta());

  stats.end();
  requestAnimationFrame(animate);
}
```

### 0 memory leaks

```typescript
// Checklist de cleanup :
// ✓ Dispose toutes les geometries
// ✓ Dispose tous les materiaux
// ✓ Dispose toutes les textures
// ✓ Dispose les render targets
// ✓ Dispose le post-processing composer
// ✓ Supprimer les event listeners
// ✓ Liberer le monde Rapier (world.free())
// ✓ Stopper les animations (cancelAnimationFrame)
// ✓ Supprimer les elements DOM (stats, labels, canvas)

// Verifier avec Chrome DevTools :
// 1. Performance Monitor → JS heap size stable
// 2. Memory tab → Take heap snapshot avant/apres
// 3. renderer.info → geometries et textures stables
function logRendererInfo(renderer: THREE.WebGLRenderer): void {
  console.table({
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  });
}
```

### Progressive loading

```typescript
// Afficher un ecran de chargement pendant le loading
async function loadWithProgress(canvas: HTMLCanvasElement): Promise<void> {
  const overlay = document.getElementById('loading-overlay')!;
  const progressBar = document.getElementById('progress-bar')!;
  const statusText = document.getElementById('status-text')!;

  const steps = [
    { label: 'Initialisation du moteur physique...', weight: 10 },
    { label: 'Chargement des modeles 3D...', weight: 40 },
    { label: 'Chargement des textures...', weight: 30 },
    { label: 'Generation du terrain...', weight: 15 },
    { label: 'Configuration du post-processing...', weight: 5 },
  ];

  let totalProgress = 0;

  for (const step of steps) {
    statusText.textContent = step.label;
    // ... executer l'etape ...
    totalProgress += step.weight;
    progressBar.style.width = `${totalProgress}%`;
    // Laisser respirer le navigateur
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }

  // Fondu de sortie
  overlay.style.transition = 'opacity 0.5s';
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 500);
}
```

---

## Pratique

### Exercice PF.1 — Scene 3D interactive complete

Assemblez une scene combinant tous les modules du cours. Votre scene doit comporter :

1. Terrain procedural avec coloration par altitude (module 19)
2. Plan d'eau anime avec Fresnel (module 19)
3. DirectionalLight avec ombres (modules 14, 18)
4. Au moins un modèle glTF (module 15)
5. Post-processing : bloom + tone mapping (module 16)
6. Physique : au moins 3 objets dynamiques interactifs (module 20)
7. Camera orbit + possibilite de toggle en first person
8. Responsive (ResizeObserver)

```typescript
// TODO: Combiner les systemes decrits dans ce module
// TODO: Gerer le loading progressif
// TODO: Verifier 60 FPS avec stats.js
// TODO: Verifier 0 memory leaks (renderer.info)
```

<details>
<summary>Solution — architecture minimale</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import Stats from 'three/addons/libs/stats.module.js';

// ─── Noise GLSL (pour le terrain) ───────────────────────
const noiseGLSL = /* glsl */ `
  vec2 hash2D(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
  }
  vec2 quintic(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }
  float pnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = dot(hash2D(i), f);
    float b = dot(hash2D(i+vec2(1,0)), f-vec2(1,0));
    float c = dot(hash2D(i+vec2(0,1)), f-vec2(0,1));
    float d = dot(hash2D(i+vec2(1,1)), f-vec2(1,1));
    vec2 u = quintic(f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p) {
    float v=0.0, a=0.5, f=1.0;
    for(int i=0;i<6;i++){v+=a*pnoise(p*f);f*=2.0;a*=0.5;}
    return v;
  }
`;

async function main() {
  // ─── Stats ─────────────────────────────────────────
  const stats = new Stats();
  document.body.appendChild(stats.dom);

  // ─── Renderer ──────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88bbdd);
  scene.fog = new THREE.FogExp2(0x88bbdd, 0.015);

  const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 200);
  camera.position.set(10, 8, 10);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 2, 0);

  // ─── Post-processing ──────────────────────────────
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.3, 0.9
  ));
  composer.addPass(new OutputPass());

  // ─── Eclairage ─────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.5));

  const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // ─── Terrain ───────────────────────────────────────
  const terrainMat = new THREE.ShaderMaterial({
    vertexShader: noiseGLSL + /* glsl */ `
      varying vec3 vWorldPos; varying vec3 vNormal;
      float getH(vec2 p) { return fbm(p*0.15)*8.0; }
      void main() {
        vec3 pos = position;
        pos.y = getH(pos.xz);
        float e=0.1;
        float hL=getH(pos.xz-vec2(e,0)),hR=getH(pos.xz+vec2(e,0));
        float hD=getH(pos.xz-vec2(0,e)),hU=getH(pos.xz+vec2(0,e));
        vNormal = normalize(vec3(hL-hR, 2.0*e, hD-hU));
        vWorldPos = (modelMatrix*vec4(pos,1.0)).xyz;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(pos,1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos; varying vec3 vNormal;
      void main() {
        vec3 N=normalize(vNormal);
        float h=vWorldPos.y, s=1.0-N.y;
        vec3 c=vec3(0.76,0.70,0.50);
        c=mix(c,vec3(0.25,0.45,0.12),smoothstep(0.5,2.0,h));
        c=mix(c,vec3(0.50,0.45,0.40),smoothstep(5.0,7.0,h));
        c=mix(c,vec3(0.50,0.45,0.40),smoothstep(0.3,0.6,s));
        float d=max(dot(N,normalize(vec3(0.5,0.8,0.3))),0.0);
        gl_FragColor=vec4(c*(0.15+0.85*d),1.0);
      }
    `,
  });
  const terrainGeo = new THREE.PlaneGeometry(60, 60, 200, 200);
  terrainGeo.rotateX(-Math.PI / 2);
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ─── Water ─────────────────────────────────────────
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec3 vWorldPos; varying vec3 vN;
      void main(){
        vec3 p=position;
        p.y+=sin(p.x*2.0+uTime*1.5)*0.08+sin(p.z*3.0+uTime*2.0)*0.05;
        float dx=cos(p.x*2.0+uTime*1.5)*2.0*0.08;
        float dz=cos(p.z*3.0+uTime*2.0)*3.0*0.05;
        vN=normalize(vec3(-dx,1.0,-dz));
        vWorldPos=(modelMatrix*vec4(p,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCamPos; varying vec3 vWorldPos; varying vec3 vN;
      void main(){
        vec3 V=normalize(uCamPos-vWorldPos), N=normalize(vN);
        float f=pow(1.0-max(dot(V,N),0.0),4.0);
        vec3 c=mix(vec3(0.0,0.3,0.4),vec3(0.5,0.7,0.95),f);
        vec3 H=normalize(V+normalize(vec3(0.5,1.0,0.3)));
        c+=pow(max(dot(N,H),0.0),256.0);
        gl_FragColor=vec4(c,0.75);
      }
    `,
    uniforms: { uTime:{value:0}, uCamPos:{value:camera.position} },
    transparent: true, side: THREE.DoubleSide,
  });
  const waterGeo = new THREE.PlaneGeometry(60, 60, 100, 100);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 1.0;
  scene.add(water);

  // ─── Rapier physique ───────────────────────────────
  await RAPIER.init();
  const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
  const bodyMap = new Map<RAPIER.RigidBody, THREE.Mesh>();

  // Sol physique
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(30, 0.1, 30).setFriction(0.8), floorBody
  );

  // Cubes dynamiques
  const cubeGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const cubeMats = [0xff4444, 0x44ff44, 0x4444ff].map(
    c => new THREE.MeshStandardMaterial({ color: c })
  );

  for (let i = 0; i < 3; i++) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-2 + i * 2, 6 + i, 0)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4).setRestitution(0.5), body
    );
    const mesh = new THREE.Mesh(cubeGeo, cubeMats[i]);
    mesh.castShadow = true;
    scene.add(mesh);
    bodyMap.set(body, mesh);
  }

  // Clic = lancer une boule
  renderer.domElement.addEventListener('click', (e) => {
    const mouse = new THREE.Vector2(
      (e.clientX / innerWidth) * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    const o = ray.ray.origin, d = ray.ray.direction;

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(o.x, o.y, o.z)
        .setCcdEnabled(true)
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(0.15).setRestitution(0.7).setDensity(5), body
    );
    body.setLinvel(new RAPIER.Vector3(d.x*20, d.y*20, d.z*20), true);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x553300 })
    );
    mesh.castShadow = true;
    scene.add(mesh);
    bodyMap.set(body, mesh);
  });

  // ─── Responsive ────────────────────────────────────
  const ro = new ResizeObserver(() => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });
  ro.observe(document.body);

  // ─── Loop ──────────────────────────────────────────
  const clock = new THREE.Clock();
  let acc = 0;
  const FDT = 1/60;

  function animate() {
    stats.begin();
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);

    // Physique fixed timestep
    acc += dt;
    while (acc >= FDT) { world.step(); acc -= FDT; }

    // Sync
    bodyMap.forEach((mesh, body) => {
      const p = body.translation(), r = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    });

    // Cleanup
    bodyMap.forEach((mesh, body) => {
      if (body.translation().y < -20) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        world.removeRigidBody(body);
        bodyMap.delete(body);
      }
    });

    // Water time
    waterMat.uniforms.uTime.value += dt;
    waterMat.uniforms.uCamPos.value.copy(camera.position);

    controls.update();
    composer.render();
    stats.end();
  }

  animate();
}

main();
```
</details>

---

## Résumé

| Système | Module source | Role dans le projet | Classe |
|---------|:------------:|---------------------|--------|
| **Terrain procedural** | 19 | Decor, heightfield physique | `Terrain.ts` |
| **Water shader** | 19 | Plan d'eau anime, Fresnel | `Water.ts` |
| **Eclairage PBR** | 14 | Hemisphere + Directional + Point lights | `setupLighting()` |
| **Shadow maps / CSM** | 18 | Ombres realistes sur le terrain | `ShadowSetup.ts` |
| **Modeles glTF** | 15 | Personnages, objets, vegetation | `AssetLoader.ts` |
| **Post-processing** | 16 | Bloom, SSAO, vignette, tone mapping | `PostProcessing.ts` |
| **Physique Rapier** | 20 | Rigid bodies, collisions, picking | `PhysicsSystem.ts` |
| **Particules GPU** | 11 | Pluie, neige, effets | `ParticleSystem.ts` |
| **UI overlay** | — | Labels, info panels | `UISystem.ts` |
| **Camera duale** | — | Orbit + first person toggle | `CameraSystem.ts` |
| **Performance** | 17 | LOD, instancing, frustum culling, dispose | Chaque classe |

| Checklist qualite | Comment vérifier |
|-------------------|-----------------|
| **60 FPS stable** | stats.js panel, Chrome Performance tab |
| **0 memory leaks** | `renderer.info.memory`, Chrome Memory heap snapshots |
| **Progressive loading** | Ecran de chargement, loadAsync avec callback |
| **Responsive** | ResizeObserver, pixel ratio adaptatif |
| **Cleanup propre** | `dispose()` sur chaque système, `world.free()` |
| **Error handling** | try/catch sur l'init, message d'erreur si WebGL absent |

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [20 - Physique et interactions](./20-physique-interactions.md) | [22 - Modelisation 3D (annexe)](./22-modelisation-3d.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 21 projet final](../screencasts/screencast-21-projet-final.md)
2. **Lab** : [lab-21-projet-final](../labs/lab-21-projet-final/README)
3. **Quiz** : [quiz 21 projet final](../quizzes/quiz-21-projet-final.html)
:::
