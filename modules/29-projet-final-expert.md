# Module 29 — Projet final expert

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 300 min       | [Lab 29](../labs/lab-29-projet-final-expert/) | — |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Architecturer une application 3D open-world modulaire integrant tous les systèmes du cours (modules 00-28)
- Implementer une machine a états pour gérer plusieurs modes applicatifs (exploration, construction, inspection)
- Combiner rasterisation et ray tracing hybride dans un même pipeline de rendu
- Intégrer terrain procedural, eau, atmosphere, brouillard volumetrique et nuages dans une scene coherente
- Gérer un pipeline d'assets complet : glTF, virtual textures, compression KTX2/Draco
- Connecter physique, audio 3D, animation procedurale et post-processing dans une boucle temps réel
- Maintenir 60 FPS stables via LOD, instancing, frustum culling et budget VRAM
- (Bonus) Ajouter un mode VR via WebXR avec rendu stereo et interaction controllers

---

<details>
<summary>Rappel du cours précédent — Virtual textures et streaming (Module 28)</summary>

Au module 28, nous avons resolu le problème des scenes massives :

- **Virtual texturing** : page table + page cache + feedback buffer pour charger à la demandé
- **Formats GPU-native** : BC7, ASTC, ETC2 — decompression hardware sans cout CPU
- **Basis Universal / KTX2** : format universel transcodable vers tout format GPU
- **Atlas dynamique** : gestion du padding, LRU eviction, resident ratio monitoring
- **Draco** : compression geometrique pour reduire la taille des meshes
- **Metriques** : page faults, VRAM usage, resident ratio pour diagnostiquer les goulots

Ce projet final expert combine TOUT ce que nous avons appris — des fondamentaux WebGPU (module 00) jusqu'au streaming avance (module 28) — dans une seule application open-world interactive.

</details>

---

## Vue d'ensemble du projet

:::tip Analogie
Le module 21 etait comme construire une maison : fondations, murs, toit, electricite. Ce projet final expert, c'est construire une ville entière. Tu as besoin d'urbanisme (architecture modulaire), de réseaux (systèmes interconnectes), de services publics (audio, physique, streaming), et d'un maire qui coordonne tout (la boucle principale). Chaque batiment fonctionne seul, mais la ville ne vit que quand tout est connecte.
:::

```
Projet final expert — Carte des systemes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────┐
│                    Application Shell                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Explore  │  │  Build   │  │ Inspect  │  State FSM   │
│  │  Mode    │←→│  Mode    │←→│  Mode    │              │
│  └──────────┘  └──────────┘  └──────────┘              │
├─────────────────────────────────────────────────────────┤
│                    Scene Manager                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐ │
│  │ Terrain │ │  Water  │ │   Sky   │ │  Volumetrics │ │
│  │ (mod19) │ │ (mod19) │ │ (mod25) │ │   (mod25)    │ │
│  └─────────┘ └─────────┘ └─────────┘ └──────────────┘ │
├─────────────────────────────────────────────────────────┤
│                   Render Pipeline                        │
│  ┌──────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ │
│  │ Hybrid   │ │ Shadows │ │  SSR +  │ │ Post-proc   │ │
│  │ Raster+RT│ │  CSM    │ │  TAA    │ │ Bloom/TM/CG │ │
│  │ (mod23)  │ │ (mod18) │ │ (mod24) │ │ (mod16)     │ │
│  └──────────┘ └─────────┘ └─────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    Asset Pipeline                        │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────────┐ │
│  │  glTF +  │ │ Virtual  │ │   PBR   │ │ Skeletal   │ │
│  │  Draco   │ │ Textures │ │Materials│ │ Animation  │ │
│  │ (mod15)  │ │ (mod28)  │ │(mod5,14)│ │  (mod15)   │ │
│  └──────────┘ └──────────┘ └─────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────┤
│                   Interaction Layer                      │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────────┐ │
│  │ Physics  │ │ Raycast  │ │   IK    │ │  Audio 3D  │ │
│  │ Rapier   │ │ Picking  │ │ Look-at │ │ Positional │ │
│  │ (mod20)  │ │ (mod16)  │ │ (mod26) │ │  (mod27)   │ │
│  └──────────┘ └──────────┘ └─────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    Performance                           │
│  LOD (mod17) │ Instancing │ Frustum cull │ KTX2/Draco  │
│  Stats overlay │ VRAM budget │ Frame budget tracking     │
├─────────────────────────────────────────────────────────┤
│              WebXR (bonus, mod26)                        │
│  Stereo rendering │ VR controller interaction            │
└─────────────────────────────────────────────────────────┘
```

### Différence avec le module 21

| Aspect | Module 21 (intermédiaire) | Module 29 (expert) |
|--------|--------------------------|-------------------|
| **Scope** | Modules 00-20 | Modules 00-28 (tout le cours) |
| **Rendu** | Rasterisation classique | Hybride raster + ray tracing |
| **Eclairage** | Shadow maps simples | CSM + SSR + SSAO/GTAO |
| **Environnement** | Terrain + skybox | Terrain + eau + atmosphere + volumetriques |
| **Assets** | glTF basique | glTF + virtual textures + KTX2/Draco |
| **Audio** | Aucun | Audio 3D positionnel + reverb |
| **VR** | Non | WebXR optionnel |
| **Animation** | Skeletal basique | Skeletal + IK procedurale |
| **Performance** | LOD + instancing | + VRAM budget + frame budget + compression |

---

## 1 — Architecture modulaire

### Machine a états applicative

L'application supporte trois modes. Chaque mode controle quels systèmes sont actifs et comment l'input est interprete.

```
Machine a etats — Modes applicatifs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

         ┌──────────────────┐
    ┌───→│   EXPLORE Mode   │←──┐
    │    │ Camera libre     │   │
    │    │ Physique active  │   │
    │    │ Audio spatialisé │   │
    │    └───────┬──────────┘   │
    │            │ [B]          │ [Esc]
    │            ▼              │
    │    ┌──────────────────┐   │
    │    │   BUILD Mode     │───┘
    │    │ Placement objets │
    │    │ Grid snapping    │
    │    │ Preview fantome  │
    │    └──────────────────┘
    │            │ [I]
    │ [Esc]     ▼
    │    ┌──────────────────┐
    └────│  INSPECT Mode    │
         │ Selection objet  │
         │ Panneau proprietes│
         │ Debug wireframe  │
         └──────────────────┘
```

```typescript
// src/core/StateMachine.ts

type AppMode = 'explore' | 'build' | 'inspect';

interface ModeConfig {
  enter(): void;
  exit(): void;
  update(dt: number): void;
  handleInput(event: InputEvent): void;
}

class AppStateMachine {
  private currentMode: AppMode = 'explore';
  private modes: Map<AppMode, ModeConfig> = new Map();

  register(name: AppMode, config: ModeConfig): void {
    this.modes.set(name, config);
  }

  transition(to: AppMode): void {
    const current = this.modes.get(this.currentMode);
    const next = this.modes.get(to);
    if (!current || !next || to === this.currentMode) return;

    current.exit();
    this.currentMode = to;
    next.enter();

    console.log(`[FSM] ${this.currentMode} → ${to}`);
  }

  update(dt: number): void {
    this.modes.get(this.currentMode)?.update(dt);
  }

  handleInput(event: InputEvent): void {
    this.modes.get(this.currentMode)?.handleInput(event);
  }

  get mode(): AppMode {
    return this.currentMode;
  }
}
```

### Scene Manager

Le scene manager centralise tous les sous-systèmes et orchestre leur mise a jour.

```typescript
// src/core/SceneManager.ts

interface SubSystem {
  name: string;
  init(): Promise<void>;
  update(dt: number): void;
  destroy(): void;
}

class SceneManager {
  private systems: SubSystem[] = [];
  private device: GPUDevice;
  private canvas: HTMLCanvasElement;

  constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
    this.device = device;
    this.canvas = canvas;
  }

  register(system: SubSystem): void {
    this.systems.push(system);
  }

  async initAll(): Promise<void> {
    for (const system of this.systems) {
      console.log(`[SceneManager] Initializing ${system.name}...`);
      await system.init();
    }
  }

  update(dt: number): void {
    for (const system of this.systems) {
      system.update(dt);
    }
  }

  destroyAll(): void {
    for (const system of this.systems.reverse()) {
      system.destroy();
    }
  }
}
```

### Asset Pipeline

```typescript
// src/assets/AssetPipeline.ts

interface AssetManifest {
  models: { id: string; url: string; format: 'gltf' | 'glb'; draco: boolean }[];
  textures: { id: string; url: string; format: 'ktx2' | 'png'; virtual: boolean }[];
  audio: { id: string; url: string; format: 'ogg' | 'mp3'; spatial: boolean }[];
}

class AssetPipeline {
  private loadedModels: Map<string, GPUBuffer[]> = new Map();
  private loadedTextures: Map<string, GPUTexture> = new Map();
  private loadedAudio: Map<string, AudioBuffer> = new Map();
  private manifest: AssetManifest;
  private vramBudget: number; // bytes
  private vramUsed: number = 0;

  constructor(manifest: AssetManifest, vramBudgetMB: number = 512) {
    this.manifest = manifest;
    this.vramBudget = vramBudgetMB * 1024 * 1024;
  }

  async loadEssentials(): Promise<void> {
    // Phase 1 : charger les assets critiques (terrain, personnage, UI)
    // Phase 2 : charger les assets secondaires en streaming
    // Phase 3 : virtual textures a la demande via feedback buffer
  }

  getVRAMUsage(): { used: number; budget: number; ratio: number } {
    return {
      used: this.vramUsed,
      budget: this.vramBudget,
      ratio: this.vramUsed / this.vramBudget,
    };
  }

  evictLRU(): void {
    // Liberer les textures/modeles les moins recemment utilises
    // quand vramUsed > vramBudget * 0.9
  }
}
```

### Structure des fichiers

```
project/
├── src/
│   ├── main.ts                      # Point d'entree, bootstrap
│   ├── App.ts                       # Boucle principale, coordination
│   ├── core/
│   │   ├── SceneManager.ts          # Registre et orchestration des systemes
│   │   ├── StateMachine.ts          # FSM modes applicatifs
│   │   ├── InputManager.ts          # Abstraction clavier/souris/gamepad/VR
│   │   ├── Camera.ts                # Orbit + FPS + transition smooth
│   │   └── Clock.ts                 # Fixed timestep + interpolation
│   ├── scene/
│   │   ├── TerrainSystem.ts         # Heightmap procedural, LOD quadtree
│   │   ├── WaterSystem.ts           # Plan eau, Gerstner waves, Fresnel
│   │   ├── SkySystem.ts             # Atmospheric scattering
│   │   ├── VolumetricSystem.ts      # Fog, god rays, nuages Perlin-Worley
│   │   └── SceneGraph.ts            # Hierarchie parent-enfant, transforms
│   ├── render/
│   │   ├── RenderPipeline.ts        # Pipeline principal, orchestration passes
│   │   ├── RasterPass.ts            # GBuffer + forward opaques
│   │   ├── RayTracePass.ts          # Reflections ray tracees sur surfaces select
│   │   ├── ShadowPass.ts            # Cascaded shadow maps
│   │   ├── SSRPass.ts               # Screen-space reflections + env map fallback
│   │   ├── SSAOPass.ts              # SSAO / GTAO
│   │   ├── TAAPass.ts               # Temporal anti-aliasing
│   │   ├── BloomPass.ts             # Extraction + blur + composite
│   │   ├── ToneMappingPass.ts       # ACES / Reinhard + color grading LUT
│   │   └── CompositePass.ts         # Assemblage final vers swapchain
│   ├── assets/
│   │   ├── AssetPipeline.ts         # Manifest, chargement, VRAM budget
│   │   ├── GLTFLoader.ts            # glTF + Draco decompression
│   │   ├── VirtualTextureManager.ts # Page table, cache, feedback
│   │   ├── KTX2Decoder.ts           # Transcodage Basis → BC7/ASTC
│   │   └── PBRMaterial.ts           # Albedo, normal, AO, metallic, roughness
│   ├── interaction/
│   │   ├── PhysicsSystem.ts         # Rapier world, rigid bodies, colliders
│   │   ├── CharacterController.ts   # KinematicCharacterController Rapier
│   │   ├── RaycastPicker.ts         # GPU picking + Rapier ray
│   │   └── IKSystem.ts              # Inverse kinematics, NPC look-at
│   ├── audio/
│   │   ├── AudioSystem.ts           # AudioContext, listener sync camera
│   │   ├── SpatialSource.ts         # PannerNode, distance attenuation
│   │   ├── AmbientLayer.ts          # Boucles ambiance, crossfade
│   │   └── FootstepManager.ts       # Surface detection, reverb adaptatif
│   ├── animation/
│   │   ├── SkeletalAnimator.ts      # Clip playback, blending, transitions
│   │   └── ProceduralAnimator.ts    # IK look-at, wind sway, breathing
│   ├── performance/
│   │   ├── LODManager.ts            # Distance-based LOD switching
│   │   ├── InstanceManager.ts       # GPU instancing, instance buffers
│   │   ├── FrustumCuller.ts         # AABB vs frustum planes
│   │   ├── StatsOverlay.ts          # FPS, draw calls, VRAM, triangles
│   │   └── FrameBudget.ts           # Per-system timing, budget alerts
│   ├── vr/
│   │   ├── WebXRSession.ts          # Session request, reference space
│   │   ├── StereoRenderer.ts        # Dual viewport, projection per eye
│   │   └── VRControllerInput.ts     # Grip, trigger, thumbstick mapping
│   └── shaders/
│       ├── terrain.wgsl
│       ├── water.wgsl
│       ├── sky-atmosphere.wgsl
│       ├── volumetric-fog.wgsl
│       ├── cloud-perlin-worley.wgsl
│       ├── pbr-deferred.wgsl
│       ├── shadow-csm.wgsl
│       ├── ssr.wgsl
│       ├── ssao-gtao.wgsl
│       ├── taa.wgsl
│       ├── bloom.wgsl
│       ├── tonemap-colorgrade.wgsl
│       ├── raytrace-reflection.wgsl
│       └── composite.wgsl
├── assets/
│   ├── manifest.json
│   ├── models/
│   ├── textures/
│   └── audio/
└── index.html
```

---

## 2 — Terrain procedural et environnement naturel

### Heightmap par bruit fractal

```
Generation du terrain (Module 19 recap)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Bruit fractal = somme d'octaves de Simplex noise :

  height(x, z) = Σ (amplitude_i × noise(x × frequency_i, z × frequency_i))
                 i=0..N

  Octave 0 : basses frequences → montagnes           amplitude=1.0, freq=0.001
  Octave 1 : moyennes frequences → collines          amplitude=0.5, freq=0.002
  Octave 2 : hautes frequences → rochers             amplitude=0.25, freq=0.004
  Octave 3 : details fins → petites bosses           amplitude=0.125, freq=0.008

  ┌────────────────────────────────────────┐
  │▓▓▓▓▓▓▓░░░░░░░▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░│  Vue du dessus (heightmap)
  │▓▓▓▓▓░░░░░░░░░░▓▓▓▓▓▓▓▓░░░░░░░░░░░░░│  ▓ = altitude elevee
  │▓▓▓░░░░≈≈≈≈≈░░░░▓▓▓▓▓░░░░░░░░░░░░░░░│  ░ = plaine
  │░░░░░≈≈≈≈≈≈≈≈≈░░░░░░░░░░░≈≈≈≈░░░░░░░│  ≈ = eau (sous seuil)
  │░░░░≈≈≈≈≈≈≈≈≈≈≈░░░░░░░░≈≈≈≈≈≈≈░░░░░░│
  │░░░░░≈≈≈≈≈≈≈≈≈░░░░░░░░░≈≈≈≈≈≈░░░░░░░│
  └────────────────────────────────────────┘
```

```wgsl
// shaders/terrain.wgsl — Compute shader pour la generation du heightmap

struct TerrainParams {
  worldSize: f32,
  gridResolution: u32,
  octaves: u32,
  lacunarity: f32,    // augmentation de frequence par octave (typiquement 2.0)
  persistence: f32,   // diminution d'amplitude par octave (typiquement 0.5)
  baseFrequency: f32,
  heightScale: f32,
  waterLevel: f32,
}

@group(0) @binding(0) var<uniform> params: TerrainParams;
@group(0) @binding(1) var<storage, read_write> heightmap: array<f32>;

// Simplex noise 2D (implementation complete omise pour brievete)
fn simplex2D(x: f32, y: f32) -> f32 { /* ... */ }

@compute @workgroup_size(16, 16)
fn generateHeightmap(@builtin(global_invocation_id) id: vec3u) {
  let res = params.gridResolution;
  if (id.x >= res || id.y >= res) { return; }

  let uv = vec2f(f32(id.x), f32(id.y)) / f32(res);
  let worldPos = uv * params.worldSize;

  var height = 0.0;
  var amplitude = 1.0;
  var frequency = params.baseFrequency;

  for (var i = 0u; i < params.octaves; i++) {
    height += amplitude * simplex2D(worldPos.x * frequency, worldPos.y * frequency);
    amplitude *= params.persistence;
    frequency *= params.lacunarity;
  }

  heightmap[id.y * res + id.x] = height * params.heightScale;
}
```

### Plan d'eau avec vagues de Gerstner

```
Vagues de Gerstner (Module 19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contrairement aux vagues sinusoidales simples (deplacement vertical uniquement),
les vagues de Gerstner deplacent aussi horizontalement → cretes pointues realistes.

  Position deplacee :
    x' = x - Σ (Q_i × A_i × D_i.x × cos(dot(D_i, pos) × w_i + t × phi_i))
    z' = z - Σ (Q_i × A_i × D_i.y × cos(dot(D_i, pos) × w_i + t × phi_i))
    y' = Σ (A_i × sin(dot(D_i, pos) × w_i + t × phi_i))

  Ou :
    A_i = amplitude de la vague i
    D_i = direction (vecteur 2D normalise)
    w_i = frequence angulaire = 2π / wavelength
    phi_i = vitesse de phase = speed × w_i
    Q_i = steepness (0 = sinusoidal, 1 = crete maximale)

Vue profil :
  Sinusoidal :    ∼∼∼∼∼∼∼∼∼∼∼∼
  Gerstner Q=0.5 : ∧~~∧~~∧~~∧~~
  Gerstner Q=1.0 : ʌ___ʌ___ʌ___   (cretes aiguisees)
```

### Effet Fresnel pour l'eau

```
Fresnel = controle du melange reflection / refraction selon l'angle de vue

  Angle rasant (regard quasi horizontal) → forte reflection
  Angle perpendiculaire (regard vers le bas) → on voit le fond (refraction)

  Schlick approximation :
    F = F0 + (1 - F0) × (1 - dot(N, V))^5
    F0 pour eau ≈ 0.02

  ┌──────────────────────────┐
  │ Regard rasant            │  F ≈ 0.95 → presque 100% reflection
  │    ───→  ═══════════     │
  │                          │
  │ Regard plongeant         │  F ≈ 0.02 → on voit le fond
  │         ↓                │
  │    ═══════════           │
  └──────────────────────────┘
```

---

## 3 — Atmosphere et volumetriques

### Atmospheric scattering (Module 25)

```
Diffusion atmospherique
━━━━━━━━━━━━━━━━━━━━━━

Rayleigh scattering : petites molecules (N₂, O₂)
  → Diffuse plus les courtes longueurs d'onde (bleu)
  → Ciel bleu le jour, rouge au coucher de soleil

Mie scattering : grosses particules (aerosols, poussiere)
  → Forward scattering (halo autour du soleil)
  → Brume blanchatre a l'horizon

  Soleil midi :          Soleil couchant :
  ☀ (haut)               ☀───────────→ long trajet
  │ court trajet          beaucoup de bleu diffuse
  │ peu de bleu diffuse   → il reste le rouge/orange
  ↓ → ciel bleu
```

```wgsl
// shaders/sky-atmosphere.wgsl — Fragment simplifie

struct AtmosphereParams {
  sunDirection: vec3f,
  sunIntensity: f32,
  rayleighCoeff: vec3f,     // (5.5e-6, 13.0e-6, 22.4e-6) pour la Terre
  mieCoeff: f32,            // ~21e-6
  rayleighScaleHeight: f32, // ~8500 m
  mieScaleHeight: f32,      // ~1200 m
  planetRadius: f32,        // 6371000 m
  atmosphereRadius: f32,    // 6471000 m
}

fn rayleighPhase(cosTheta: f32) -> f32 {
  return 3.0 / (16.0 * 3.14159) * (1.0 + cosTheta * cosTheta);
}

fn miePhase(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let num = 3.0 * (1.0 - g2) * (1.0 + cosTheta * cosTheta);
  let den = 8.0 * 3.14159 * (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
  return num / den;
}

// Ray marching a travers l'atmosphere
fn computeScattering(rayDir: vec3f, params: AtmosphereParams) -> vec3f {
  // 1. Intersection rayon / sphere atmospherique
  // 2. March le long du rayon en N echantillons
  // 3. A chaque point, calcul optical depth vers le soleil
  // 4. Accumulation Rayleigh + Mie
  // 5. Retourne la couleur du ciel pour cette direction
  return vec3f(0.0); // placeholder
}
```

### Brouillard volumetrique et god rays

```
Brouillard volumetrique (Module 25)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Contrairement au fog lineaire/exponentiel classique (post-process 2D),
le fog volumetrique ray-marche a travers un volume 3D.

  Camera ──ray──→ ■■■■■░░░░░████████  Objet
                  ^fog dense^  ^clair^

Avantages :
  - Le fog interagit avec les lumieres (god rays)
  - Densite variable dans l'espace (vallee brumeuse, sommet degage)
  - Les ombres coupent le fog (shadow-aware)

God rays (volumetric light scattering) :
  ☀ Lumiere directionnelle
  │╲
  │ ╲ rayons visibles la ou le fog est eclaire
  │  ╲ et pas dans l'ombre
  ████ obstacle (arbre, batiment)
  │    zone d'ombre = pas de god ray
```

### Nuages Perlin-Worley

```
Nuages volumetriques (Module 25)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Methode Guerrilla Games (Horizon Zero Dawn) :

  1. Bruit de base : Perlin-Worley 3D
     → Perlin = formes douces, Worley = cellulaire (trous)
     → Combine : perlinWorley = remap(perlin, worleyLow, 1.0, 0.0, 1.0)

  2. Weather map (texture 2D) :
     R = couverture nuageuse (0-1)
     G = type de nuage (stratus=0, cumulus=0.5, cumulonimbus=1)
     B = precipitation

  3. Shape modeling :
     densite = sampleNoise3D(pos) × weatherCoverage × heightGradient

  4. Detail erosion : bruit haute frequence soustrait aux bords
     densite -= detailNoise × (1 - densite) × erosionWeight

  5. Light marching : a chaque sample, march vers le soleil
     pour calculer l'attenuation lumineuse dans le nuage

  Vue en coupe d'un cumulus :
  ┌─────────────────────────┐
  │         .::::::.        │  Haut : effiloche par detail noise
  │      .::████████::.     │
  │    .::████████████::.   │  Milieu : dense, eclaire par le soleil
  │   ::████████████████::  │
  │  .:████████████████:.   │  Bas : plat (stratus) ou bombe (cumulus)
  └─────────────────────────┘
```

---

## 4 — Pipeline de rendu hybride

### Vue d'ensemble des passes

```
Pipeline de rendu — Ordre des passes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pass 0 : Shadow CSM          → 4 cascades shadow maps
Pass 1 : GBuffer              → position, normal, albedo, metallic/roughness
Pass 2 : SSAO/GTAO            → ambient occlusion texture
Pass 3 : Lighting             → deferred PBR + shadows + AO
Pass 4 : Sky + Clouds         → atmospheric scattering + volumetric clouds
Pass 5 : Terrain + Water      → forward (water needs blending)
Pass 6 : Ray trace reflections → compute sur surfaces selectionnees
Pass 7 : SSR                  → screen-space reflections + env map fallback
Pass 8 : Volumetric fog       → ray march + god rays
Pass 9 : TAA                  → temporal anti-aliasing (jittered projection)
Pass 10: Bloom                → threshold + gaussian blur + composite
Pass 11: Tone mapping         → ACES filmic + color grading LUT
Pass 12: Composite            → assemblage final → swapchain

  GBuffer textures :
  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ Albedo  │ │ Normal  │ │ Metal/  │ │ Depth   │
  │ RGB     │ │ RGB     │ │ Rough   │ │ float32 │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘
       ↓            ↓           ↓           ↓
  ┌──────────────────────────────────────────────┐
  │          Deferred Lighting Pass               │
  │  Pour chaque pixel :                          │
  │    PBR(albedo, N, V, L, metallic, roughness)  │
  │    + shadow factor from CSM                   │
  │    + AO factor from SSAO                      │
  └──────────────────────────────────────────────┘
```

### Cascaded Shadow Maps (Module 18)

```
CSM — 4 cascades
━━━━━━━━━━━━━━━━

Le frustum camera est divise en 4 tranches de profondeur.
Chaque tranche a sa propre shadow map → haute resolution pres, basse loin.

  Camera
    ╲ Cascade 0 ╲ Cascade 1  ╲ Cascade 2    ╲ Cascade 3
     ╲ [0-10m]   ╲ [10-30m]   ╲ [30-100m]    ╲ [100-500m]
      ╲ 2048²     ╲ 2048²      ╲ 2048²        ╲ 2048²
       ╲───────────╲────────────╲──────────────╲──────────

  Resolution effective :
    Cascade 0 : 10m / 2048 = ~5mm/texel   (detail ombres tres fin)
    Cascade 3 : 500m / 2048 = ~25cm/texel  (ombres grossieres mais suffisantes)

  Blend entre cascades pour eviter les artefacts de transition.
```

### Hybrid raster + ray tracing (Module 23)

```
Rendu hybride
━━━━━━━━━━━━━

Strategie : rasteriser le rendu primaire (rapide), ray tracer uniquement
les reflections sur les surfaces hautement reflectives (miroirs, metal poli, eau).

  ┌──────────────────────────┐
  │     Rasterisation        │  99% des pixels
  │  GBuffer → Deferred      │  Standard, rapide
  │  lighting                │
  └────────────┬─────────────┘
               │ surfaces reflectives ?
               ▼
  ┌──────────────────────────┐
  │    Ray Trace Pass        │  1-5% des pixels
  │  Pour chaque pixel marque│
  │  "reflective" :          │
  │  - Lance rayon reflechi  │
  │  - Traverse acceleration │
  │    structure (BVH)       │
  │  - Shade le hit point    │
  └──────────────────────────┘

  Fallback : si ray trace trop lent → SSR + environment map
```

```typescript
// src/render/RayTracePass.ts — Architecture

class RayTracePass {
  private bvhBuffer: GPUBuffer;           // Bounding Volume Hierarchy
  private reflectionMask: GPUTexture;     // Quels pixels ray tracer
  private resultTexture: GPUTexture;      // Couleur des reflections
  private computePipeline: GPUComputePipeline;

  constructor(device: GPUDevice, width: number, height: number) {
    // La reflection mask est generee pendant le GBuffer pass :
    // metallic > 0.8 && roughness < 0.2 → marque comme reflective
    this.reflectionMask = device.createTexture({
      size: [width, height],
      format: 'r8unorm',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.resultTexture = device.createTexture({
      size: [width, height],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  buildBVH(meshes: Mesh[]): void {
    // Construction du BVH sur CPU puis upload vers GPU
    // Chaque noeud : AABB min/max + child index ou triangle range
  }

  dispatch(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.computePipeline);
    // Dispatch par tiles 8x8 sur la reflection mask
    pass.dispatchWorkgroups(
      Math.ceil(this.width / 8),
      Math.ceil(this.height / 8)
    );
    pass.end();
  }
}
```

### Screen-Space Reflections + fallback (Module 24)

```
SSR — Ray marching en screen space
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pour chaque pixel :
  1. Calculer la direction de reflexion : R = reflect(-V, N)
  2. Marcher le long de R dans l'espace ecran (hierarchical tracing)
  3. Si un hit est trouve → utiliser la couleur du pixel touche
  4. Sinon → fallback vers environment map prefiltree

  Avantages : reflections de la geometrie visible a l'ecran
  Limites : ne peut pas refleter ce qui est hors ecran → env map fallback

  Screen space :
  ┌──────────────────────────┐
  │        Ciel              │
  │    ┌────────────┐        │
  │    │   Objet    │        │
  │    └────────────┘        │
  │ ═══════════════════════  │ Surface reflechissante
  │    ┌────────────┐        │
  │    │ Reflection │ SSR    │ (image inversee de l'objet)
  │    │  (hit!)    │        │
  │    └────────────┘        │
  │    ...pas de hit...      │ → env map fallback
  └──────────────────────────┘
```

### TAA — Temporal Anti-Aliasing (Module 24)

```
TAA
━━━

Principe : jitter la projection chaque frame, puis combiner
le resultat avec les frames precedentes.

  Frame N-1 (reproj) ──┐
                        ├──→ Blend → Frame N finale
  Frame N (jittered) ───┘

  Blend factor : ~0.9 historique + 0.1 frame courante
  Motion vectors : necessaires pour reprojeter l'historique
  Rejection : si le voisinage actuel est trop different de l'historique → clamp
```

### SSAO / GTAO (Module 24)

```
Screen-Space Ambient Occlusion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SSAO classique :
  Pour chaque pixel, echantillonner des points dans une hemisphere
  orientee selon la normale. Comparer leur profondeur avec le depth buffer.
  Plus de points occlus → plus sombre.

GTAO (Ground Truth AO) : amelioration
  - Integre sur des slices 2D dans l'espace ecran (plus rapide)
  - Multi-bounce approximation (les zones occultees recoivent quand meme
    un peu de lumiere indirecte)
  - Meilleur rapport qualite/performance

  Sans AO :              Avec AO :
  ┌─────────────┐        ┌─────────────┐
  │ ████        │        │ ▓███        │  ▓ = assombri dans les coins
  │ ████ ████   │        │ ▓███ ▓███   │
  │      ████   │        │   ▓▓ ▓███   │
  │             │        │             │
  └─────────────┘        └─────────────┘
```

### Post-processing : Bloom + Tone Mapping + Color Grading (Module 16)

```
Chaine de post-processing
━━━━━━━━━━━━━━━━━━━━━━━━

1. Bloom :
   HDR input → threshold (pixels > 1.0) → downsample blur chain → upsample → add

   Downsample (mip chain) :
   [1920×1080] → [960×540] → [480×270] → [240×135] → [120×68]
   Upsample + blend retour :
   [120×68] → [240×135] → [480×270] → [960×540] → [1920×1080]

2. Tone mapping :
   HDR (0..∞) → LDR (0..1)
   ACES Filmic : bon contraste, highlights doux, bons pour le jeu

   toneMapACES(x) = (x * (2.51*x + 0.03)) / (x * (2.43*x + 0.59) + 0.14)

3. Color grading :
   LUT 3D (32×32×32) appliquee apres tone mapping
   Permet des ambiances : coucher de soleil dore, nuit bleue, horreur desature
```

---

## 5 — Assets et materiaux PBR

### Pipeline glTF + Draco (Modules 15, 28)

```typescript
// src/assets/GLTFLoader.ts — Chargement avec decompression

class GLTFLoader {
  private device: GPUDevice;
  private dracoDecoder: DracoDecoder | null = null;

  async init(): Promise<void> {
    // Charger le WASM decoder Draco
    this.dracoDecoder = await DracoDecoder.create();
  }

  async load(url: string): Promise<GLTFScene> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // Parser le header glTF/GLB
    const gltf = parseGLTF(buffer);

    // Decompresser les meshes Draco si l'extension est presente
    for (const mesh of gltf.meshes) {
      if (mesh.extensions?.KHR_draco_mesh_compression) {
        mesh.geometry = await this.dracoDecoder!.decode(
          mesh.extensions.KHR_draco_mesh_compression
        );
      }
    }

    // Creer les GPU buffers
    const gpuMeshes = gltf.meshes.map(m => this.createGPUMesh(m));

    // Charger les textures (KTX2 si disponible)
    const textures = await Promise.all(
      gltf.textures.map(t => this.loadTexture(t))
    );

    // Construire le scene graph
    return this.buildSceneGraph(gltf, gpuMeshes, textures);
  }

  private async loadTexture(tex: GLTFTexture): Promise<GPUTexture> {
    if (tex.extensions?.KHR_texture_basisu) {
      // KTX2 → transcode vers BC7 (desktop) ou ASTC (mobile)
      return this.transcodeKTX2(tex.source);
    }
    // Fallback PNG/JPEG
    return this.loadImageTexture(tex.source);
  }
}
```

### Virtual textures pour le terrain (Module 28)

```
Virtual Texture Integration
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Le terrain utilise des virtual textures pour les layers PBR
(albedo, normal, roughness) sur de grandes surfaces.

  ┌─────────────────────────────────────────┐
  │ Feedback Pass (low-res render)          │
  │ Chaque pixel du terrain ecrit :         │
  │   (pageX, pageY, mipLevel)              │
  │ dans un petit buffer (256×256)          │
  └────────────────┬────────────────────────┘
                   │ readback CPU
                   ▼
  ┌─────────────────────────────────────────┐
  │ Page Request Analysis                    │
  │ Determine quelles pages sont necessaires │
  │ Compare avec le cache → identifie miss   │
  └────────────────┬────────────────────────┘
                   │ async fetch
                   ▼
  ┌─────────────────────────────────────────┐
  │ Page Cache (physical texture atlas)      │
  │ Upload les nouvelles pages en VRAM       │
  │ LRU eviction si cache plein              │
  │ Update la page table (indirection tex)   │
  └─────────────────────────────────────────┘
```

### Materiaux PBR (Modules 05, 14)

```
Metallic-Roughness workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━

4 textures par materiau :
  Albedo (base color) : couleur diffuse / F0 pour metaux
  Normal map : perturbation de la normale de surface
  Metallic : 0 = dielectrique, 1 = metal
  Roughness : 0 = miroir, 1 = mat

  Cook-Torrance BRDF :
    f(l,v) = kd × (albedo/π) + ks × D(h) × G(l,v) × F(v,h) / (4 × dot(n,l) × dot(n,v))

  Ou :
    D = GGX normal distribution function
    G = Smith geometry shadowing/masking
    F = Fresnel-Schlick

  ┌─────────────┬──────────────┬──────────────┬──────────────┐
  │   Albedo    │    Normal    │   Metallic   │  Roughness   │
  │  ████████   │   →→↗↗↑↑    │   ░░░░░░░░   │  ▒▒▒▒▒▒▒▒   │
  │  ████████   │   →→↗↗↑↑    │   ░░░░░░░░   │  ▒▒▒▒▒▒▒▒   │
  └─────────────┴──────────────┴──────────────┴──────────────┘
         ↓              ↓              ↓              ↓
  ┌──────────────────────────────────────────────────────────┐
  │                PBR Shader (pbr-deferred.wgsl)            │
  │  → GBuffer output : albedo, world normal, metal/rough   │
  └──────────────────────────────────────────────────────────┘
```

---

## 6 — Physique et interactions

### Intégration Rapier.js (Module 20)

```typescript
// src/interaction/PhysicsSystem.ts

import RAPIER from '@dimforge/rapier3d-compat';

class PhysicsSystem implements SubSystem {
  name = 'physics';
  private world!: RAPIER.World;
  private bodies: Map<string, RAPIER.RigidBody> = new Map();
  private accumulator: number = 0;
  private fixedDt: number = 1 / 60;

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  addStaticCollider(vertices: Float32Array, indices: Uint32Array): void {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    this.world.createCollider(colliderDesc, body);
  }

  addDynamicBody(id: string, shape: 'box' | 'sphere' | 'capsule',
                 size: number[], position: [number, number, number]): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(...position);
    const body = this.world.createRigidBody(bodyDesc);

    let colliderDesc: RAPIER.ColliderDesc;
    switch (shape) {
      case 'box':     colliderDesc = RAPIER.ColliderDesc.cuboid(size[0], size[1], size[2]); break;
      case 'sphere':  colliderDesc = RAPIER.ColliderDesc.ball(size[0]); break;
      case 'capsule': colliderDesc = RAPIER.ColliderDesc.capsule(size[0], size[1]); break;
    }
    this.world.createCollider(colliderDesc, body);
    this.bodies.set(id, body);
    return body;
  }

  update(dt: number): void {
    this.accumulator += dt;
    while (this.accumulator >= this.fixedDt) {
      this.world.step();
      this.accumulator -= this.fixedDt;
    }
  }

  destroy(): void {
    this.world.free();
  }
}
```

### Character Controller (Module 20)

```typescript
// src/interaction/CharacterController.ts

class CharacterController {
  private controller: RAPIER.KinematicCharacterController;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private speed: number = 5.0;
  private jumpForce: number = 8.0;
  private isGrounded: boolean = false;
  private velocity: vec3 = [0, 0, 0];

  constructor(world: RAPIER.World, position: [number, number, number]) {
    this.controller = world.createCharacterController(0.01); // offset
    this.controller.enableAutostep(0.5, 0.2, true);  // max height, min width, dynamic
    this.controller.enableSnapToGround(0.5);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4); // 45 degres max

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(...position);
    this.body = world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(0.4, 0.3); // half-height, radius
    this.collider = world.createCollider(colliderDesc, this.body);
  }

  update(input: { forward: number; right: number; jump: boolean },
         cameraYaw: number, dt: number): void {
    // Calculer la direction de mouvement relative a la camera
    const moveDir = vec3.fromValues(
      input.right * Math.cos(cameraYaw) + input.forward * Math.sin(cameraYaw),
      0,
      -input.right * Math.sin(cameraYaw) + input.forward * Math.cos(cameraYaw)
    );

    if (vec3.length(moveDir) > 0) {
      vec3.normalize(moveDir, moveDir);
      vec3.scale(moveDir, moveDir, this.speed * dt);
    }

    // Gravite
    if (!this.isGrounded) {
      this.velocity[1] -= 9.81 * dt;
    } else if (input.jump) {
      this.velocity[1] = this.jumpForce;
    }

    const displacement = {
      x: moveDir[0] + this.velocity[0] * dt,
      y: this.velocity[1] * dt,
      z: moveDir[2] + this.velocity[2] * dt,
    };

    this.controller.computeColliderMovement(this.collider, displacement);
    const corrected = this.controller.computedMovement();
    const pos = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    });

    this.isGrounded = this.controller.computedGrounded();
    if (this.isGrounded) { this.velocity[1] = 0; }
  }
}
```

### Raycaster Picking (Module 16)

```typescript
// src/interaction/RaycastPicker.ts

class RaycastPicker {
  private world: RAPIER.World;
  private camera: Camera;

  constructor(world: RAPIER.World, camera: Camera) {
    this.world = world;
    this.camera = camera;
  }

  pick(screenX: number, screenY: number, maxDistance: number = 100): PickResult | null {
    // Convertir coordonnees ecran → rayon monde
    const ray = this.camera.screenToWorldRay(screenX, screenY);

    const hit = this.world.castRay(
      new RAPIER.Ray(
        { x: ray.origin[0], y: ray.origin[1], z: ray.origin[2] },
        { x: ray.direction[0], y: ray.direction[1], z: ray.direction[2] }
      ),
      maxDistance,
      true // solid
    );

    if (hit) {
      const hitPoint = vec3.scaleAndAdd(
        vec3.create(), ray.origin, ray.direction, hit.timeOfImpact
      );
      return {
        collider: hit.collider,
        point: hitPoint,
        normal: hit.normal,
        distance: hit.timeOfImpact,
      };
    }
    return null;
  }
}
```

---

## 7 — Animation et IK

### Skeletal Animation (Module 15)

```typescript
// src/animation/SkeletalAnimator.ts

class SkeletalAnimator {
  private clips: Map<string, AnimationClip> = new Map();
  private activeClip: string | null = null;
  private blendClip: string | null = null;
  private blendFactor: number = 0;
  private blendDuration: number = 0.3; // secondes
  private currentTime: number = 0;
  private boneMatrices: Float32Array; // 4x4 par bone, uploade en uniform

  constructor(skeleton: Skeleton) {
    this.boneMatrices = new Float32Array(skeleton.bones.length * 16);
  }

  play(clipName: string, crossfade: boolean = true): void {
    if (this.activeClip === clipName) return;
    if (crossfade && this.activeClip) {
      this.blendClip = this.activeClip;
      this.blendFactor = 1.0;
    }
    this.activeClip = clipName;
    this.currentTime = 0;
  }

  update(dt: number): void {
    if (!this.activeClip) return;
    this.currentTime += dt;

    const clip = this.clips.get(this.activeClip)!;
    const activePose = clip.sample(this.currentTime);

    if (this.blendClip && this.blendFactor > 0) {
      const blendPose = this.clips.get(this.blendClip)!.sample(this.currentTime);
      this.blendFactor -= dt / this.blendDuration;
      const finalPose = Pose.lerp(blendPose, activePose, 1 - this.blendFactor);
      this.computeBoneMatrices(finalPose);
    } else {
      this.blendClip = null;
      this.computeBoneMatrices(activePose);
    }
  }

  private computeBoneMatrices(pose: Pose): void {
    // Parcours hierarchique : parent → enfants
    // boneMatrix[i] = parentWorldMatrix × localTransform(pose, i) × inverseBindMatrix[i]
  }
}
```

### Inverse Kinematics — NPC Look-at (Module 26)

```
IK Look-at pour les NPC
━━━━━━━━━━━━━━━━━━━━━━

Quand le joueur s'approche, les NPC tournent la tete pour le regarder.

  Sans IK :                    Avec IK look-at :
  ┌────┐                       ┌────┐
  │ O  │ ← regarde devant     │  O │→ ← regarde le joueur
  │/│╲ │                       │/│╲ │
  │ │  │                       │ │  │
  └────┘                       └────┘

FABRIK (Forward And Backward Reaching IK) simplifie pour la chaine tete-cou :

  1. Target = position du joueur (projetee sur un cone limite)
  2. Forward pass : deplacer l'end effector (tete) vers la target
  3. Backward pass : reconnecter la chaine depuis la racine (spine)
  4. Contraintes : rotation max du cou ±60°, spine ±20°
```

```typescript
// src/interaction/IKSystem.ts

class IKSystem {
  private chains: IKChain[] = [];

  addLookAtChain(skeleton: Skeleton, headBone: string,
                 neckBone: string, spineBone: string): void {
    this.chains.push({
      bones: [spineBone, neckBone, headBone],
      maxAngles: [
        Math.PI / 9,   // spine: ±20 degres
        Math.PI / 3,   // neck: ±60 degres
        Math.PI / 4,   // head: ±45 degres
      ],
      target: null,
      weight: 0, // 0 = animation originale, 1 = full IK
    });
  }

  setTarget(chainIndex: number, target: vec3 | null): void {
    const chain = this.chains[chainIndex];
    if (target) {
      // Smooth blend vers IK quand une cible est definie
      chain.target = target;
      chain.weight = Math.min(chain.weight + 0.05, 1.0);
    } else {
      chain.weight = Math.max(chain.weight - 0.05, 0.0);
      if (chain.weight === 0) chain.target = null;
    }
  }

  solve(skeleton: Skeleton): void {
    for (const chain of this.chains) {
      if (!chain.target || chain.weight === 0) continue;

      // FABRIK solve
      const positions = chain.bones.map(b => skeleton.getBoneWorldPosition(b));
      const solved = this.fabrikSolve(positions, chain.target, chain.maxAngles);

      // Blend avec la pose originale
      for (let i = 0; i < chain.bones.length; i++) {
        const original = skeleton.getBoneWorldPosition(chain.bones[i]);
        const blended = vec3.lerp(vec3.create(), original, solved[i], chain.weight);
        skeleton.setBoneWorldPosition(chain.bones[i], blended);
      }
    }
  }

  private fabrikSolve(positions: vec3[], target: vec3,
                      maxAngles: number[], iterations: number = 10): vec3[] {
    // Implementation FABRIK avec contraintes angulaires
    // (voir module 26 pour le detail complet)
    return positions; // placeholder
  }
}
```

---

## 8 — Audio 3D spatial

### Système audio positionnel (Module 27)

```
Audio 3D dans la scene
━━━━━━━━━━━━━━━━━━━━━━

  Listener (synchronise avec la camera)
  ┌─────┐
  │  👂 │ ← AudioListener position = camera position
  └──┬──┘   AudioListener orientation = camera forward/up
     │
     │  distance, direction
     │
  ┌──▼──────────────────────────────────────────┐
  │                Scene 3D                      │
  │                                              │
  │  🔊 Riviere (loop, pan gauche si a gauche)  │
  │                                              │
  │            🔊 Oiseaux (aleatoire, lointain) │
  │                                              │
  │     🔊 Feu de camp (crackle, proche)        │
  │                                              │
  │  🔊 NPC qui parle (directionnel)            │
  └──────────────────────────────────────────────┘

  Chaque source utilise un PannerNode :
    - distanceModel: 'inverse' (attenue avec la distance)
    - refDistance: 1 (distance a laquelle volume = 1)
    - maxDistance: 100 (au-dela, silence)
    - rolloffFactor: 1 (vitesse d'attenuation)
    - coneInnerAngle / coneOuterAngle : pour les sources directionnelles
```

```typescript
// src/audio/AudioSystem.ts

class AudioSystem implements SubSystem {
  name = 'audio';
  private ctx!: AudioContext;
  private listener!: AudioListener;
  private sources: Map<string, SpatialSource> = new Map();
  private masterGain!: GainNode;

  async init(): Promise<void> {
    this.ctx = new AudioContext();
    this.listener = this.ctx.listener;
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
  }

  createSpatialSource(id: string, config: SpatialConfig): SpatialSource {
    const source = new SpatialSource(this.ctx, this.masterGain, config);
    this.sources.set(id, source);
    return source;
  }

  syncWithCamera(camera: Camera): void {
    const pos = camera.position;
    const fwd = camera.forward;
    const up = camera.up;

    this.listener.positionX.value = pos[0];
    this.listener.positionY.value = pos[1];
    this.listener.positionZ.value = pos[2];
    this.listener.forwardX.value = fwd[0];
    this.listener.forwardY.value = fwd[1];
    this.listener.forwardZ.value = fwd[2];
    this.listener.upX.value = up[0];
    this.listener.upY.value = up[1];
    this.listener.upZ.value = up[2];
  }

  update(dt: number): void {
    for (const source of this.sources.values()) {
      source.update(dt);
    }
  }

  destroy(): void {
    this.ctx.close();
  }
}
```

### Footsteps adaptatifs

```typescript
// src/audio/FootstepManager.ts

type SurfaceType = 'grass' | 'stone' | 'wood' | 'water' | 'sand' | 'metal';

class FootstepManager {
  private audioSystem: AudioSystem;
  private samples: Map<SurfaceType, AudioBuffer[]> = new Map();
  private reverbNodes: Map<SurfaceType, ConvolverNode> = new Map();
  private stepTimer: number = 0;
  private stepInterval: number = 0.5; // secondes entre chaque pas

  constructor(audioSystem: AudioSystem) {
    this.audioSystem = audioSystem;
  }

  async loadSamples(): Promise<void> {
    const surfaces: SurfaceType[] = ['grass', 'stone', 'wood', 'water', 'sand', 'metal'];
    for (const surface of surfaces) {
      // Charger 4-6 variantes par surface pour eviter la repetition
      const buffers = await Promise.all(
        [1, 2, 3, 4].map(i => this.loadAudio(`/audio/footsteps/${surface}_${i}.ogg`))
      );
      this.samples.set(surface, buffers);
    }
  }

  update(isMoving: boolean, speed: number, surface: SurfaceType, dt: number): void {
    if (!isMoving) { this.stepTimer = 0; return; }

    this.stepInterval = 0.6 / speed; // plus rapide = pas plus frequents
    this.stepTimer += dt;

    if (this.stepTimer >= this.stepInterval) {
      this.stepTimer -= this.stepInterval;
      this.playStep(surface);
    }
  }

  private playStep(surface: SurfaceType): void {
    const variants = this.samples.get(surface);
    if (!variants || variants.length === 0) return;

    // Choisir une variante aleatoire
    const buffer = variants[Math.floor(Math.random() * variants.length)];

    // Pitch aleatoire ±10% pour plus de naturel
    const playbackRate = 0.9 + Math.random() * 0.2;

    // Jouer avec la reverb adaptee a la surface
    // Stone/metal = plus de reverb, grass/sand = sec
    this.audioSystem.playOneShot(buffer, playbackRate, this.getReverbMix(surface));
  }

  private getReverbMix(surface: SurfaceType): number {
    const reverbMap: Record<SurfaceType, number> = {
      grass: 0.1, sand: 0.05, wood: 0.3,
      stone: 0.6, metal: 0.7, water: 0.2,
    };
    return reverbMap[surface];
  }

  private async loadAudio(url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return this.audioSystem.ctx.decodeAudioData(arrayBuffer);
  }
}
```

### Detection de surface

```
Surface detection pour les footsteps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Methode : raycast vers le bas depuis les pieds du personnage.
Le collider touche porte un tag de surface.

  Personnage
    │
    │ raycast down
    ▼
  ══════════  terrain avec material tag

  Chaque triangle/collider du terrain est tague :
  - Par altitude : eau < 0.1, sable 0.1-0.15, herbe 0.15-0.5, roche > 0.5
  - Par material ID dans le mesh
  - Par splat map (texture RGBA ou chaque canal = un type de surface)
```

---

## 9 — WebXR (bonus optionnel)

### Rendu stereo (Module 26)

```
WebXR Stereo Rendering
━━━━━━━━━━━━━━━━━━━━━━

  ┌──────────────────────────────────────────┐
  │  Oeil gauche         Oeil droit          │
  │ ┌──────────────┐  ┌──────────────┐       │
  │ │              │  │              │       │
  │ │   Viewport   │  │   Viewport   │       │
  │ │   gauche     │  │   droit      │       │
  │ │              │  │              │       │
  │ └──────────────┘  └──────────────┘       │
  │                                          │
  │  Meme scene, 2 matrices de projection    │
  │  IPD (inter-pupillary distance) ~63mm    │
  └──────────────────────────────────────────┘
```

```typescript
// src/vr/WebXRSession.ts

class WebXRSession {
  private session: XRSession | null = null;
  private refSpace: XRReferenceSpace | null = null;
  private glLayer: XRWebGLLayer | null = null;

  async isSupported(): Promise<boolean> {
    return navigator.xr?.isSessionSupported('immersive-vr') ?? false;
  }

  async start(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): Promise<void> {
    this.session = await navigator.xr!.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking'],
    });

    this.glLayer = new XRWebGLLayer(this.session, gl);
    this.session.updateRenderState({ baseLayer: this.glLayer });
    this.refSpace = await this.session.requestReferenceSpace('local-floor');

    this.session.requestAnimationFrame(this.onFrame.bind(this));
  }

  private onFrame(time: number, frame: XRFrame): void {
    const pose = frame.getViewerPose(this.refSpace!);
    if (!pose) return;

    for (const view of pose.views) {
      // view.projectionMatrix : matrice de projection pour cet oeil
      // view.transform : position/orientation de cet oeil
      // Render la scene avec ces matrices dans le viewport correspondant
      const viewport = this.glLayer!.getViewport(view)!;
      // gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
      // renderScene(view.projectionMatrix, view.transform.inverse.matrix);
    }

    this.session!.requestAnimationFrame(this.onFrame.bind(this));
  }

  async end(): Promise<void> {
    await this.session?.end();
    this.session = null;
  }
}
```

### Interaction VR controllers

```typescript
// src/vr/VRControllerInput.ts

interface VRInputState {
  grip: boolean;
  trigger: number;       // 0-1 analogique
  thumbstick: [number, number]; // x, y
  position: vec3;
  orientation: quat;
}

class VRControllerInput {
  private session: XRSession;

  getInputState(frame: XRFrame, hand: 'left' | 'right'): VRInputState | null {
    const source = this.getInputSource(hand);
    if (!source?.gamepad) return null;

    const pose = frame.getPose(source.gripSpace!, this.refSpace);
    if (!pose) return null;

    return {
      grip: source.gamepad.buttons[1]?.pressed ?? false,
      trigger: source.gamepad.buttons[0]?.value ?? 0,
      thumbstick: [
        source.gamepad.axes[2] ?? 0,
        source.gamepad.axes[3] ?? 0,
      ],
      position: vec3.fromValues(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z,
      ),
      orientation: quat.fromValues(
        pose.transform.orientation.x,
        pose.transform.orientation.y,
        pose.transform.orientation.z,
        pose.transform.orientation.w,
      ),
    };
  }

  private getInputSource(hand: 'left' | 'right'): XRInputSource | undefined {
    for (const source of this.session.inputSources) {
      if (source.handedness === hand) return source;
    }
    return undefined;
  }
}
```

---

## 10 — Performance et optimisation

### LOD Manager (Module 17)

```
Level of Detail — Switching automatique
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Distance camera → objet :
  [0-10m]  → LOD 0 (full detail, 50K triangles)
  [10-30m] → LOD 1 (medium, 10K triangles)
  [30-80m] → LOD 2 (low, 2K triangles)
  [80m+]   → LOD 3 (billboard quad ou hidden)

  Hysteresis : eviter le flickering aux frontieres
    LOD 0 → LOD 1 a 10m, mais LOD 1 → LOD 0 a 8m (marge de 2m)
```

### GPU Instancing (Module 17)

```
Instancing — Dessiner 10 000 arbres en 1 draw call
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Sans instancing : 10 000 draw calls × 1 arbre = lent
  Avec instancing : 1 draw call × 10 000 instances = rapide

  Instance buffer (per-instance data) :
  ┌──────────────────────────────────────────┐
  │ Instance 0 : mat4 model, vec4 color      │
  │ Instance 1 : mat4 model, vec4 color      │
  │ Instance 2 : mat4 model, vec4 color      │
  │ ...                                       │
  │ Instance 9999 : mat4 model, vec4 color   │
  └──────────────────────────────────────────┘

  Vertex shader :
    @builtin(instance_index) instanceIdx : u32
    → lire la matrice model depuis l'instance buffer
```

### Frustum Culling (Module 17)

```
Frustum Culling — Ne pas dessiner ce qu'on ne voit pas
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────────────────────┐
  │         Frustum camera          │
  │     ╱                   ╲       │
  │   ╱   ■ visible          ╲     │
  │  ╱     ■ visible          ╲    │
  │ ╱                          ╲   │
  │╱                            ╲  │
  └─────────────────────────────────┘
                          ■ hors frustum → pas dessine

  Test AABB vs 6 plans du frustum :
    Pour chaque plan (left, right, top, bottom, near, far) :
      Si l'AABB est entierement du cote negatif → OUTSIDE → cull
      Si intersection → INTERSECT → dessiner (test plus fin optionnel)
      Sinon → INSIDE → dessiner
```

### Stats Overlay et Frame Budget

```typescript
// src/performance/StatsOverlay.ts

class StatsOverlay {
  private canvas2D: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frameTimings: Map<string, number> = new Map();

  constructor() {
    this.canvas2D = document.createElement('canvas');
    this.canvas2D.width = 300;
    this.canvas2D.height = 200;
    this.canvas2D.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9999;pointer-events:none;';
    document.body.appendChild(this.canvas2D);
    this.ctx = this.canvas2D.getContext('2d')!;
  }

  update(stats: FrameStats): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 300, 200);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 300, 200);
    ctx.font = '12px monospace';
    ctx.fillStyle = stats.fps >= 55 ? '#0f0' : stats.fps >= 30 ? '#ff0' : '#f00';

    const lines = [
      `FPS: ${stats.fps.toFixed(0)} (${stats.frameTime.toFixed(1)}ms)`,
      `Draw calls: ${stats.drawCalls}`,
      `Triangles: ${(stats.triangles / 1000).toFixed(0)}K`,
      `Instances: ${stats.instances}`,
      `VRAM: ${(stats.vramUsed / 1024 / 1024).toFixed(0)} / ${(stats.vramBudget / 1024 / 1024).toFixed(0)} MB`,
      `VT pages: ${stats.vtResident}/${stats.vtTotal} (${(stats.vtResident/stats.vtTotal*100).toFixed(0)}%)`,
      `Physics: ${stats.physicsTime.toFixed(1)}ms`,
      `Render: ${stats.renderTime.toFixed(1)}ms`,
      `Culled: ${stats.culledObjects}/${stats.totalObjects}`,
    ];

    lines.forEach((line, i) => {
      ctx.fillText(line, 10, 20 + i * 18);
    });
  }
}

interface FrameStats {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  instances: number;
  vramUsed: number;
  vramBudget: number;
  vtResident: number;
  vtTotal: number;
  physicsTime: number;
  renderTime: number;
  culledObjects: number;
  totalObjects: number;
}
```

```typescript
// src/performance/FrameBudget.ts

class FrameBudget {
  private budgetMs: number = 16.67; // 60 FPS
  private systemTimings: Map<string, number[]> = new Map(); // historique
  private warningThreshold: number = 0.9; // 90% du budget

  startMeasure(system: string): () => void {
    const start = performance.now();
    return () => {
      const elapsed = performance.now() - start;
      if (!this.systemTimings.has(system)) {
        this.systemTimings.set(system, []);
      }
      const history = this.systemTimings.get(system)!;
      history.push(elapsed);
      if (history.length > 60) history.shift(); // garder 60 frames
    };
  }

  getReport(): BudgetReport {
    const systems: { name: string; avgMs: number; pctBudget: number }[] = [];
    let totalAvg = 0;

    for (const [name, history] of this.systemTimings) {
      const avg = history.reduce((a, b) => a + b, 0) / history.length;
      totalAvg += avg;
      systems.push({
        name,
        avgMs: avg,
        pctBudget: (avg / this.budgetMs) * 100,
      });
    }

    return {
      systems: systems.sort((a, b) => b.avgMs - a.avgMs),
      totalMs: totalAvg,
      budgetMs: this.budgetMs,
      overBudget: totalAvg > this.budgetMs,
      headroom: this.budgetMs - totalAvg,
    };
  }
}

interface BudgetReport {
  systems: { name: string; avgMs: number; pctBudget: number }[];
  totalMs: number;
  budgetMs: number;
  overBudget: boolean;
  headroom: number;
}
```

---

## 11 — Boucle principale : tout assembler

### Point d'entree

```typescript
// src/main.ts

import { App } from './App';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // Verifier le support WebGPU
  if (!navigator.gpu) {
    document.body.innerHTML = '<h1>WebGPU non supporte dans ce navigateur</h1>';
    return;
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    document.body.innerHTML = '<h1>Pas d\'adaptateur GPU disponible</h1>';
    return;
  }

  const device = await adapter.requestDevice({
    requiredFeatures: ['texture-compression-bc'], // BC7 pour KTX2
    requiredLimits: {
      maxStorageBufferBindingSize: 256 * 1024 * 1024, // 256 MB pour BVH
      maxBufferSize: 256 * 1024 * 1024,
    },
  });

  const app = new App(device, canvas);
  await app.init();
  app.run();
}

main().catch(console.error);
```

### Classe App — orchestration

```typescript
// src/App.ts

class App {
  private device: GPUDevice;
  private canvas: HTMLCanvasElement;
  private sceneManager: SceneManager;
  private stateMachine: AppStateMachine;
  private assetPipeline: AssetPipeline;
  private renderPipeline: RenderPipeline;
  private physicsSystem: PhysicsSystem;
  private audioSystem: AudioSystem;
  private characterController: CharacterController;
  private ikSystem: IKSystem;
  private statsOverlay: StatsOverlay;
  private frameBudget: FrameBudget;
  private clock: Clock;

  constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
    this.device = device;
    this.canvas = canvas;
    this.sceneManager = new SceneManager(device, canvas);
    this.stateMachine = new AppStateMachine();
    this.clock = new Clock();
    this.frameBudget = new FrameBudget();
    this.statsOverlay = new StatsOverlay();
  }

  async init(): Promise<void> {
    // 1. Charger le manifest d'assets
    const manifest = await fetch('/assets/manifest.json').then(r => r.json());
    this.assetPipeline = new AssetPipeline(manifest, 512);

    // 2. Initialiser les sous-systemes
    this.physicsSystem = new PhysicsSystem();
    this.audioSystem = new AudioSystem();
    this.renderPipeline = new RenderPipeline(this.device, this.canvas);

    // 3. Enregistrer dans le scene manager
    this.sceneManager.register(this.physicsSystem);
    this.sceneManager.register(this.audioSystem);
    this.sceneManager.register(new TerrainSystem(this.device));
    this.sceneManager.register(new WaterSystem(this.device));
    this.sceneManager.register(new SkySystem(this.device));
    this.sceneManager.register(new VolumetricSystem(this.device));

    await this.sceneManager.initAll();

    // 4. Charger les assets essentiels
    await this.assetPipeline.loadEssentials();

    // 5. Setup le character controller
    this.characterController = new CharacterController(
      this.physicsSystem.world, [0, 10, 0]
    );

    // 6. Setup IK pour les NPC
    this.ikSystem = new IKSystem();

    // 7. Setup les modes applicatifs
    this.setupModes();

    // 8. Setup audio ambiant
    await this.setupAudio();

    console.log('[App] Initialization complete');
  }

  private setupModes(): void {
    this.stateMachine.register('explore', {
      enter: () => { /* activer camera FPS, physique, audio */ },
      exit: () => { /* desactiver controles FPS */ },
      update: (dt) => {
        this.characterController.update(this.getInput(), this.camera.yaw, dt);
        this.ikSystem.solve(this.npcSkeleton);
      },
      handleInput: (event) => {
        if (event.key === 'b') this.stateMachine.transition('build');
        if (event.key === 'i') this.stateMachine.transition('inspect');
      },
    });

    this.stateMachine.register('build', {
      enter: () => { /* activer UI construction, grille */ },
      exit: () => { /* desactiver UI construction */ },
      update: (dt) => { /* preview placement, snapping */ },
      handleInput: (event) => {
        if (event.key === 'Escape') this.stateMachine.transition('explore');
      },
    });

    this.stateMachine.register('inspect', {
      enter: () => { /* activer selection, panneau proprietes */ },
      exit: () => { /* desactiver panneau */ },
      update: (dt) => { /* highlight objet survole */ },
      handleInput: (event) => {
        if (event.key === 'Escape') this.stateMachine.transition('explore');
      },
    });
  }

  private async setupAudio(): Promise<void> {
    // Ambiance globale
    this.audioSystem.createSpatialSource('wind', {
      url: '/audio/ambient/wind_loop.ogg',
      loop: true, volume: 0.3,
      position: [0, 5, 0],
      refDistance: 50, maxDistance: 500,
    });

    // Sources positionnelles
    this.audioSystem.createSpatialSource('waterfall', {
      url: '/audio/ambient/waterfall_loop.ogg',
      loop: true, volume: 0.8,
      position: [50, 2, -30],
      refDistance: 5, maxDistance: 60,
    });

    // Footstep manager
    this.footstepManager = new FootstepManager(this.audioSystem);
    await this.footstepManager.loadSamples();
  }

  run(): void {
    const loop = () => {
      const dt = this.clock.getDelta();

      // Mesurer chaque systeme
      const endPhysics = this.frameBudget.startMeasure('physics');
      this.physicsSystem.update(dt);
      endPhysics();

      const endScene = this.frameBudget.startMeasure('scene');
      this.sceneManager.update(dt);
      endScene();

      const endState = this.frameBudget.startMeasure('state');
      this.stateMachine.update(dt);
      endState();

      // Audio sync
      this.audioSystem.syncWithCamera(this.camera);

      // Surface detection pour footsteps
      const surface = this.detectSurface();
      this.footstepManager.update(
        this.characterController.isMoving,
        this.characterController.speed,
        surface, dt
      );

      // VRAM budget check
      const vram = this.assetPipeline.getVRAMUsage();
      if (vram.ratio > 0.9) {
        this.assetPipeline.evictLRU();
      }

      // Rendu
      const endRender = this.frameBudget.startMeasure('render');
      this.renderPipeline.render(this.sceneManager, this.camera);
      endRender();

      // Stats overlay
      this.statsOverlay.update({
        fps: 1 / dt,
        frameTime: dt * 1000,
        drawCalls: this.renderPipeline.drawCallCount,
        triangles: this.renderPipeline.triangleCount,
        instances: this.renderPipeline.instanceCount,
        vramUsed: vram.used,
        vramBudget: vram.budget,
        vtResident: this.virtualTextureManager.residentPages,
        vtTotal: this.virtualTextureManager.totalPages,
        physicsTime: this.frameBudget.getSystemAvg('physics'),
        renderTime: this.frameBudget.getSystemAvg('render'),
        culledObjects: this.frustumCuller.culledCount,
        totalObjects: this.frustumCuller.totalCount,
      });

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}
```

---

## 12 — Checklist d'intégration

La table suivante relie chaque fonctionnalite a son module source. Utilisez-la pour suivre votre progression.

| # | Fonctionnalite | Module(s) source | Système | Statut |
|---|----------------|-----------------|---------|--------|
| 1 | Initialisation WebGPU, device, swapchain | 00, 01 | `main.ts` | ☐ |
| 2 | Scene graph hiérarchique | 03, 04 | `SceneGraph.ts` | ☐ |
| 3 | Camera orbit + FPS + transitions | 07 | `Camera.ts` | ☐ |
| 4 | Materiaux PBR (albedo, normal, metal, rough) | 05, 14 | `PBRMaterial.ts` | ☐ |
| 5 | Terrain procedural (heightmap compute shader) | 19 | `TerrainSystem.ts` | ☐ |
| 6 | Plan d'eau Gerstner + Fresnel | 19 | `WaterSystem.ts` | ☐ |
| 7 | Atmospheric scattering sky | 25 | `SkySystem.ts` | ☐ |
| 8 | Brouillard volumetrique + god rays | 25 | `VolumetricSystem.ts` | ☐ |
| 9 | Nuages Perlin-Worley | 25 | `VolumetricSystem.ts` | ☐ |
| 10 | Cascaded Shadow Maps (4 cascades) | 18 | `ShadowPass.ts` | ☐ |
| 11 | Deferred rendering (GBuffer) | 14 | `RasterPass.ts` | ☐ |
| 12 | SSAO / GTAO | 24 | `SSAOPass.ts` | ☐ |
| 13 | Screen-space reflections + env map fallback | 24 | `SSRPass.ts` | ☐ |
| 14 | Ray tracing hybride (reflections surfaces select) | 23 | `RayTracePass.ts` | ☐ |
| 15 | TAA (temporal anti-aliasing) | 24 | `TAAPass.ts` | ☐ |
| 16 | Bloom + tone mapping ACES + color grading LUT | 16 | `BloomPass.ts`, `ToneMappingPass.ts` | ☐ |
| 17 | glTF loader + Draco decompression | 15, 28 | `GLTFLoader.ts` | ☐ |
| 18 | Skeletal animation + blending | 15 | `SkeletalAnimator.ts` | ☐ |
| 19 | Virtual texture streaming (terrain) | 28 | `VirtualTextureManager.ts` | ☐ |
| 20 | KTX2 transcodage (BC7/ASTC) | 28 | `KTX2Decoder.ts` | ☐ |
| 21 | Physique Rapier.js (world, bodies, colliders) | 20 | `PhysicsSystem.ts` | ☐ |
| 22 | Character controller (marche, saut, pentes) | 20 | `CharacterController.ts` | ☐ |
| 23 | Raycaster picking | 16 | `RaycastPicker.ts` | ☐ |
| 24 | IK NPC look-at (FABRIK) | 26 | `IKSystem.ts` | ☐ |
| 25 | Audio 3D positionnel | 27 | `AudioSystem.ts` | ☐ |
| 26 | Ambiance + attenuation distance | 27 | `SpatialSource.ts` | ☐ |
| 27 | Footsteps adaptatifs (surface, reverb) | 27 | `FootstepManager.ts` | ☐ |
| 28 | LOD automatique + hysteresis | 17 | `LODManager.ts` | ☐ |
| 29 | GPU instancing (vegetation, rochers) | 17 | `InstanceManager.ts` | ☐ |
| 30 | Frustum culling | 17 | `FrustumCuller.ts` | ☐ |
| 31 | Stats overlay | — | `StatsOverlay.ts` | ☐ |
| 32 | VRAM budget monitoring + LRU eviction | 28 | `AssetPipeline.ts` | ☐ |
| 33 | Frame budget tracking (60 FPS target) | — | `FrameBudget.ts` | ☐ |
| 34 | Machine a états (explore/build/inspect) | — | `StateMachine.ts` | ☐ |
| 35 | (Bonus) WebXR stereo rendering | 26 | `WebXRSession.ts` | ☐ |
| 36 | (Bonus) VR controller interaction | 26 | `VRControllerInput.ts` | ☐ |

---

## Pratique

### Plan de construction en 15 étapes

:::tip Stratégie
Ne construisez pas tout d'un coup. Chaque étape produit un résultat visible et testable. Validez chaque étape avant de passer à la suivante. Le stats overlay (étape 2) vous accompagne tout au long pour vérifier que vous restez dans le budget de performance.
:::

**Étape 1 — Scaffold et boucle principale**
Créer `main.ts`, `App.ts`, `SceneManager.ts`, `StateMachine.ts`, `Clock.ts`. Vérifier que `requestAnimationFrame` tourne et que le delta time est correct. Afficher un triangle de test pour valider le pipeline WebGPU.

**Étape 2 — Stats overlay et frame budget**
Implementer `StatsOverlay.ts` et `FrameBudget.ts`. Afficher FPS, frame time, draw calls. Ce sera votre tableau de bord pour toute la suite.

**Étape 3 — Terrain procedural**
Implementer `TerrainSystem.ts` avec le compute shader de heightmap. Commencer avec un plan 256x256, puis monter a 1024x1024. Vérifier la performance avec le stats overlay.

**Étape 4 — Camera et character controller**
Implementer la camera FPS + orbit. Intégrer Rapier.js, créer le `CharacterController` et le collider terrain. Se deplacer sur le terrain.

**Étape 5 — PBR et eclairage de base**
Implementer le GBuffer pass et le deferred lighting. Appliquer des materiaux PBR au terrain (splat map : herbe, roche, sable). Ajouter une lumiere directionnelle (soleil).

**Étape 6 — Shadows (CSM)**
Implementer les 4 cascades de shadow maps. Vérifier les transitions entre cascades. Le terrain doit projeter et recevoir des ombres.

**Étape 7 — Eau et environnement**
Ajouter le plan d'eau avec Gerstner waves et Fresnel. Implementer l'atmospheric scattering pour le ciel. La scene doit avoir un horizon credible.

**Étape 8 — Volumetriques**
Ajouter le brouillard volumetrique (ray march), les god rays, et la couche de nuages Perlin-Worley. Attention au budget frame — ces passes sont couteuses.

**Étape 9 — Assets et modèles**
Intégrer le `GLTFLoader` avec Draco. Charger des modèles (arbres, rochers, batiments, NPC). Mettre en place le `InstanceManager` pour la vegetation.

**Étape 10 — Animation et IK**
Implementer le `SkeletalAnimator` pour les NPC. Ajouter l'IK look-at. Les NPC doivent jouer une animation idle et tourner la tete quand le joueur approche.

**Étape 11 — Post-processing complet**
Chainer SSAO/GTAO → SSR → TAA → Bloom → Tone mapping → Color grading. Chaque pass est independante — activez-les une par une pour mesurer leur impact.

**Étape 12 — Ray tracing hybride**
Implementer le `RayTracePass` sur les surfaces metalliques. Construire le BVH. Comparer le résultat avec le SSR seul. Prevoir un fallback si le GPU est trop lent.

**Étape 13 — Audio spatial**
Intégrer l'`AudioSystem`, placer des sources dans la scene. Implementer le `FootstepManager` avec detection de surface. Vérifier la spatialisation avec un casque.

**Étape 14 — Virtual textures et optimisation**
Intégrer le `VirtualTextureManager` pour le terrain. Activer le LOD, le frustum culling, la compression KTX2. Objectif : 60 FPS stables avec le VRAM budget respecte.

**Étape 15 — Modes applicatifs et polish**
Brancher la machine a états (explore/build/inspect). Ajouter les transitions entre modes. Tester le parcours complet. (Bonus) Ajouter le mode WebXR.

---

### Solution — Architecture d'intégration

:::warning
Le code complet de chaque système represente des milliers de lignes. La solution ci-dessous se concentre sur le code d'intégration : comment les systèmes se connectent dans la boucle principale. Referez-vous aux modules individuels pour l'implementation detaillee de chaque système.
:::

```typescript
// Solution — src/App.ts (version complete d'integration)

import { SceneManager, SubSystem } from './core/SceneManager';
import { AppStateMachine } from './core/StateMachine';
import { Clock } from './core/Clock';
import { Camera } from './core/Camera';
import { InputManager } from './core/InputManager';
import { AssetPipeline } from './assets/AssetPipeline';
import { GLTFLoader } from './assets/GLTFLoader';
import { VirtualTextureManager } from './assets/VirtualTextureManager';
import { TerrainSystem } from './scene/TerrainSystem';
import { WaterSystem } from './scene/WaterSystem';
import { SkySystem } from './scene/SkySystem';
import { VolumetricSystem } from './scene/VolumetricSystem';
import { RenderPipeline } from './render/RenderPipeline';
import { PhysicsSystem } from './interaction/PhysicsSystem';
import { CharacterController } from './interaction/CharacterController';
import { RaycastPicker } from './interaction/RaycastPicker';
import { IKSystem } from './interaction/IKSystem';
import { AudioSystem } from './audio/AudioSystem';
import { FootstepManager } from './audio/FootstepManager';
import { SkeletalAnimator } from './animation/SkeletalAnimator';
import { LODManager } from './performance/LODManager';
import { InstanceManager } from './performance/InstanceManager';
import { FrustumCuller } from './performance/FrustumCuller';
import { StatsOverlay } from './performance/StatsOverlay';
import { FrameBudget } from './performance/FrameBudget';

export class App {
  // --- Core ---
  private device: GPUDevice;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext;
  private clock = new Clock();
  private input: InputManager;
  private camera: Camera;
  private sceneManager: SceneManager;
  private stateMachine = new AppStateMachine();

  // --- Systems ---
  private terrain: TerrainSystem;
  private water: WaterSystem;
  private sky: SkySystem;
  private volumetrics: VolumetricSystem;
  private renderPipeline: RenderPipeline;
  private physics: PhysicsSystem;
  private character: CharacterController;
  private picker: RaycastPicker;
  private ik: IKSystem;
  private audio: AudioSystem;
  private footsteps: FootstepManager;
  private animator: SkeletalAnimator;
  private assetPipeline: AssetPipeline;
  private vtManager: VirtualTextureManager;

  // --- Performance ---
  private lod: LODManager;
  private instancing: InstanceManager;
  private frustumCuller: FrustumCuller;
  private stats = new StatsOverlay();
  private budget = new FrameBudget();

  private running = false;

  constructor(device: GPUDevice, canvas: HTMLCanvasElement) {
    this.device = device;
    this.canvas = canvas;
    this.context = canvas.getContext('webgpu')!;
    this.context.configure({
      device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });
  }

  // ─── Initialisation (sequentielle, chaque systeme peut dependre du precedent) ───

  async init(): Promise<void> {
    console.log('[App] Starting initialization...');
    const t0 = performance.now();

    // Input + Camera
    this.input = new InputManager(this.canvas);
    this.camera = new Camera(this.canvas.width / this.canvas.height);
    this.camera.setPosition(0, 20, 0);

    // Scene Manager
    this.sceneManager = new SceneManager(this.device, this.canvas);

    // Physics (doit etre pret avant le character controller)
    this.physics = new PhysicsSystem();
    await this.physics.init();
    this.sceneManager.register(this.physics);

    // Terrain (genere le heightmap, fournit le collider a la physique)
    this.terrain = new TerrainSystem(this.device);
    await this.terrain.init();
    this.physics.addStaticCollider(
      this.terrain.getColliderVertices(),
      this.terrain.getColliderIndices()
    );
    this.sceneManager.register(this.terrain);

    // Water
    this.water = new WaterSystem(this.device);
    await this.water.init();
    this.sceneManager.register(this.water);

    // Sky
    this.sky = new SkySystem(this.device);
    await this.sky.init();
    this.sceneManager.register(this.sky);

    // Volumetrics (fog, god rays, clouds)
    this.volumetrics = new VolumetricSystem(this.device);
    await this.volumetrics.init();
    this.sceneManager.register(this.volumetrics);

    // Asset pipeline
    const manifest = await fetch('/assets/manifest.json').then(r => r.json());
    this.assetPipeline = new AssetPipeline(manifest, 512);

    // glTF loader + Virtual Textures
    const gltfLoader = new GLTFLoader(this.device);
    await gltfLoader.init();
    this.vtManager = new VirtualTextureManager(this.device, 4096, 128);

    // Charger assets essentiels (terrain textures, personnage, NPC)
    await this.assetPipeline.loadEssentials();

    // Character controller
    this.character = new CharacterController(this.physics.world, [0, 20, 0]);

    // Raycaster
    this.picker = new RaycastPicker(this.physics.world, this.camera);

    // IK
    this.ik = new IKSystem();

    // Audio
    this.audio = new AudioSystem();
    await this.audio.init();
    this.sceneManager.register(this.audio);
    this.footsteps = new FootstepManager(this.audio);
    await this.footsteps.loadSamples();

    // Setup sources audio positionnelles
    this.audio.createSpatialSource('wind', {
      url: '/audio/ambient/wind_loop.ogg',
      loop: true, volume: 0.3,
      position: [0, 10, 0], refDistance: 50, maxDistance: 500,
    });
    this.audio.createSpatialSource('waterfall', {
      url: '/audio/ambient/waterfall_loop.ogg',
      loop: true, volume: 0.8,
      position: [50, 2, -30], refDistance: 5, maxDistance: 60,
    });
    this.audio.createSpatialSource('campfire', {
      url: '/audio/ambient/fire_crackle_loop.ogg',
      loop: true, volume: 0.6,
      position: [-15, 1, 20], refDistance: 3, maxDistance: 30,
    });

    // Animation
    // (skeleton charge via glTF, clips extraits)
    // this.animator = new SkeletalAnimator(npcSkeleton);

    // Performance systems
    this.lod = new LODManager();
    this.instancing = new InstanceManager(this.device);
    this.frustumCuller = new FrustumCuller();

    // Render pipeline (toutes les passes)
    this.renderPipeline = new RenderPipeline(this.device, this.canvas);
    await this.renderPipeline.init();

    // Modes applicatifs
    this.registerModes();

    const elapsed = performance.now() - t0;
    console.log(`[App] Initialization complete in ${elapsed.toFixed(0)}ms`);
  }

  // ─── Modes applicatifs ───

  private registerModes(): void {
    this.stateMachine.register('explore', {
      enter: () => {
        this.camera.setMode('fps');
        this.input.setCursorLock(true);
      },
      exit: () => {
        this.input.setCursorLock(false);
      },
      update: (dt) => {
        // Mouvement du personnage
        const moveInput = {
          forward: this.input.getAxis('forward'),
          right: this.input.getAxis('right'),
          jump: this.input.isPressed('jump'),
        };
        this.character.update(moveInput, this.camera.yaw, dt);

        // Synchroniser camera avec personnage
        const charPos = this.character.getPosition();
        this.camera.setTarget(charPos[0], charPos[1] + 1.6, charPos[2]);

        // IK : les NPC regardent le joueur s'il est proche
        // this.ik.setTarget(0, charPos distance < 10 ? charPos : null);
        // this.ik.solve(npcSkeleton);

        // Footsteps
        const surface = this.detectSurface();
        this.footsteps.update(
          this.character.isMoving,
          this.character.speed,
          surface, dt
        );
      },
      handleInput: (event) => {
        if (event.key === 'b') this.stateMachine.transition('build');
        if (event.key === 'i') this.stateMachine.transition('inspect');
      },
    });

    this.stateMachine.register('build', {
      enter: () => {
        this.camera.setMode('orbit');
        // Afficher la grille de construction et le panneau d'objets
      },
      exit: () => {
        // Masquer la grille
      },
      update: (dt) => {
        // Preview de l'objet a placer (ghost transparent)
        // Snap to grid
        // Clic → placer l'objet (creer rigid body + collider + mesh)
      },
      handleInput: (event) => {
        if (event.key === 'Escape') this.stateMachine.transition('explore');
        if (event.key === 'i') this.stateMachine.transition('inspect');
      },
    });

    this.stateMachine.register('inspect', {
      enter: () => {
        this.camera.setMode('orbit');
        // Afficher le panneau de proprietes
      },
      exit: () => {
        // Masquer le panneau
      },
      update: (dt) => {
        // Highlight l'objet sous le curseur
        // Clic → selectionner, afficher proprietes (position, material, physics)
        // Debug : wireframe overlay sur l'objet selectionne
      },
      handleInput: (event) => {
        if (event.key === 'Escape') this.stateMachine.transition('explore');
        if (event.key === 'b') this.stateMachine.transition('build');
      },
    });
  }

  // ─── Boucle principale ───

  run(): void {
    this.running = true;
    const loop = () => {
      if (!this.running) return;

      const dt = this.clock.getDelta();

      // ── Physics ──
      const endPhysics = this.budget.startMeasure('physics');
      this.physics.update(dt);
      endPhysics();

      // ── State machine (controles, logique mode) ──
      const endState = this.budget.startMeasure('state');
      this.stateMachine.update(dt);
      endState();

      // ── Scene systems (terrain, eau, ciel, volumetriques) ──
      const endScene = this.budget.startMeasure('scene');
      this.sceneManager.update(dt);
      endScene();

      // ── Animation ──
      const endAnim = this.budget.startMeasure('animation');
      // this.animator.update(dt);
      // this.ik.solve(npcSkeleton);
      endAnim();

      // ── Audio sync ──
      this.audio.syncWithCamera(this.camera);

      // ── Performance : culling + LOD ──
      const endPerf = this.budget.startMeasure('culling');
      this.frustumCuller.cull(this.camera.frustumPlanes, this.sceneManager.objects);
      this.lod.update(this.camera.position, this.sceneManager.objects);
      endPerf();

      // ── VRAM budget ──
      const vram = this.assetPipeline.getVRAMUsage();
      if (vram.ratio > 0.9) {
        this.assetPipeline.evictLRU();
      }

      // ── Virtual texture feedback ──
      this.vtManager.processFeedback();

      // ── Render ──
      const endRender = this.budget.startMeasure('render');
      const commandEncoder = this.device.createCommandEncoder();

      // Pass 0 : Shadow CSM
      this.renderPipeline.shadowPass.encode(commandEncoder, this.sceneManager, this.camera);

      // Pass 1 : GBuffer
      this.renderPipeline.gBufferPass.encode(commandEncoder, this.sceneManager, this.camera);

      // Pass 2 : SSAO
      this.renderPipeline.ssaoPass.encode(commandEncoder);

      // Pass 3 : Deferred lighting
      this.renderPipeline.lightingPass.encode(commandEncoder);

      // Pass 4 : Sky + clouds
      this.renderPipeline.skyPass.encode(commandEncoder, this.camera);

      // Pass 5 : Forward (water, transparent)
      this.renderPipeline.forwardPass.encode(commandEncoder, this.water, this.camera);

      // Pass 6 : Ray trace reflections (si GPU assez puissant)
      if (this.renderPipeline.rayTraceEnabled) {
        this.renderPipeline.rayTracePass.encode(commandEncoder);
      }

      // Pass 7 : SSR + env map fallback
      this.renderPipeline.ssrPass.encode(commandEncoder);

      // Pass 8 : Volumetric fog
      this.renderPipeline.volumetricPass.encode(commandEncoder, this.camera);

      // Pass 9 : TAA
      this.renderPipeline.taaPass.encode(commandEncoder);

      // Pass 10 : Bloom
      this.renderPipeline.bloomPass.encode(commandEncoder);

      // Pass 11 : Tone mapping + color grading
      this.renderPipeline.toneMappingPass.encode(commandEncoder);

      // Pass 12 : Composite → swapchain
      const swapChainTexture = this.context.getCurrentTexture();
      this.renderPipeline.compositePass.encode(commandEncoder, swapChainTexture);

      this.device.queue.submit([commandEncoder.finish()]);
      endRender();

      // ── Stats ──
      this.stats.update({
        fps: 1 / dt,
        frameTime: dt * 1000,
        drawCalls: this.renderPipeline.stats.drawCalls,
        triangles: this.renderPipeline.stats.triangles,
        instances: this.instancing.activeCount,
        vramUsed: vram.used,
        vramBudget: vram.budget,
        vtResident: this.vtManager.residentPages,
        vtTotal: this.vtManager.totalPages,
        physicsTime: this.budget.getSystemAvg('physics'),
        renderTime: this.budget.getSystemAvg('render'),
        culledObjects: this.frustumCuller.culledCount,
        totalObjects: this.frustumCuller.totalCount,
      });

      // ── Budget alert ──
      const report = this.budget.getReport();
      if (report.overBudget) {
        console.warn(
          `[FrameBudget] Over budget! ${report.totalMs.toFixed(1)}ms / ${report.budgetMs.toFixed(1)}ms. ` +
          `Top: ${report.systems[0]?.name} (${report.systems[0]?.avgMs.toFixed(1)}ms)`
        );
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  // ─── Helpers ───

  private detectSurface(): SurfaceType {
    // Raycast vers le bas depuis les pieds du personnage
    const charPos = this.character.getPosition();
    const hit = this.picker.pick(charPos[0], charPos[1], -1, 5); // direction down

    if (!hit) return 'grass'; // default

    // Determiner la surface par altitude du terrain
    const altitude = this.terrain.getNormalizedHeight(hit.point[0], hit.point[2]);
    if (altitude < 0.1) return 'water';
    if (altitude < 0.15) return 'sand';
    if (altitude < 0.5) return 'grass';
    if (altitude < 0.8) return 'stone';
    return 'stone'; // sommets rocheux
  }

  stop(): void {
    this.running = false;
    this.sceneManager.destroyAll();
    this.input.destroy();
  }
}
```

---

## Récapitulatif

:::tip Ce qu'il faut retenir
Ce projet final expert intégré l'ensemble des 29 modules du cours dans une application open-world interactive. Les points clés :

1. **Architecture modulaire** : chaque système est un module ES independant, registre dans le `SceneManager`, orchestre par la boucle principale
2. **Machine a états** : separe clairement les modes applicatifs (explore, build, inspect) pour éviter le code spaghetti
3. **Pipeline de rendu hybride** : 13 passes ordonnees, de la shadow map au composite final, avec ray tracing optionnel sur les surfaces reflechissantes
4. **Asset pipeline intelligent** : virtual textures, KTX2, Draco, LRU eviction — le tout pilote par un budget VRAM
5. **Frame budget** : chaque système est chronometre, le stats overlay donne une vision temps réel, objectif 60 FPS
6. **Intégration complete** : physique ↔ audio ↔ animation ↔ rendu — chaque système communique via des interfaces propres

La difficulte n'est pas dans chaque système individuellement (vous les avez déjà implementes dans les modules précédents), mais dans leur intégration coherente. C'est la compétence principale que ce projet développé.
:::

```
Resume des systemes et leur cout GPU approximatif (budget 16.67ms) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Systeme              Budget cible  Notes
──────────────────   ────────────  ──────────────────────────
Shadow CSM           1.5ms         4 cascades, objets proches seulement
GBuffer              1.0ms         Frustum culled, LOD, instanced
SSAO/GTAO            0.8ms         Demi-resolution possible
Deferred Lighting    0.5ms         Full screen quad, rapide
Sky + Clouds         1.5ms         Ray march limite (64 samples)
Water (forward)      0.5ms         Un seul plan, 4 vagues Gerstner
Ray Trace Reflect    1.5ms         Seulement pixels reflectifs (1-5%)
SSR                  0.8ms         Hi-Z march, fallback env map
Volumetric Fog       1.0ms         Demi-resolution, temporal reprojection
TAA                  0.3ms         Full screen, 2 textures
Bloom                0.5ms         Mip chain down + up
Tone Map + Grade     0.2ms         Full screen, LUT lookup
Composite            0.1ms         Trivial copy
──────────────────   ────────────
Physics (CPU/WASM)   2.0ms         Fixed timestep 60Hz
Audio (CPU)          0.2ms         Web Audio API, pas de GPU
Animation (CPU)      0.3ms         Skinning peut etre GPU
Culling (CPU)        0.2ms         AABB vs 6 plans
──────────────────   ────────────
TOTAL                ~12.9ms       Headroom ~3.7ms pour imprevus
```

---

## Exercice final

:::note Consigne
Construisez le projet en suivant les 15 étapes decrites dans la section Pratique. Chaque étape doit etre validee avant de passer à la suivante :

1. Le stats overlay confirme que le FPS reste au-dessus de 55
2. Le frame budget ne dépasse pas 16.67ms
3. Le VRAM usage reste sous 90% du budget

Livrable : un depot Git avec un commit par étape, un README avec une capture d'ecran de la scene finale et le rapport du stats overlay.

Criteres d'évaluation :
- Architecture propre (separation des systèmes, interfaces claires) — 20%
- Qualite visuelle (terrain, eau, ciel, eclairage, post-processing) — 25%
- Interactivite (physique, picking, modes, audio) — 20%
- Performance (60 FPS, budget respecte, optimisations) — 20%
- Intégration (tous les systèmes fonctionnent ensemble) — 15%
- (Bonus +10%) WebXR avec interaction controllers
:::

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 29 projet final expert](../screencasts/screencast-29-projet-final-expert.md)
2. **Lab** : [lab-29-projet-final-expert](../labs/lab-29-projet-final-expert/README)
3. **Quiz** : [quiz 29 projet final expert](../quizzes/quiz-29-projet-final-expert.html)
:::

---

<!-- navigation-inter-cours -->

::: info Cours suivant
Bravo, tu as termine le cours **WebGPU & 3D** ! 
Le prochain cours du curriculum est **IA pour Devs JS**.

[Commencer IA pour Devs JS →](../../15-ia/modules/00-prerequis-et-paysage-ia.md)
:::
