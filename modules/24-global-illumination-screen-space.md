# Module 24 — Global illumination et techniques screen-space

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 180 min       | [Lab 24](../labs/lab-24-global-illumination/) | [Quiz 24](../quizzes/quiz-24-global-illumination.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Expliquer la différence entre eclairage direct et illumination globale (indirect lighting)
- Comprendre les light probes et reflection probes (baked vs runtime)
- Decomposer l'irradiance en harmoniques spheriques (bandes 0, 1 et 2)
- Convoluer une cubemap pour obtenir une irradiance map
- Interpoler trilineairement entre probes dans une grille 3D
- Decrire le pipeline VXGI (voxelisation + cone tracing)
- Implementer des Screen-Space Reflections (SSR) par ray marching dans le depth buffer
- Combiner SSR avec un fallback environment map
- Comprendre les principes du SSGI (Screen-Space Global Illumination)
- Implementer le TAA (Temporal Anti-Aliasing) avec jitter, reprojection et neighborhood clamping
- Distinguer SSAO, HBAO+ et GTAO et choisir la technique adaptee
- Intégrer ces techniques dans un pipeline WebGPU compute + Three.js post-processing

---

<details>
<summary>Rappel du cours précédent — Ray tracing et path tracing (Module 23)</summary>

Au module 23, nous avons explore la simulation physique de la lumiere :

- **Rasterization vs ray tracing** : projection des triangles vs lancer de rayons depuis la camera
- **Intersections** : rayon-sphere (quadratique), rayon-triangle (Moller-Trumbore), rayon-AABB (slab method)
- **BVH** : Bounding Volume Hierarchy, construction top-down avec Surface Area Heuristic, traversee stack-based
- **Whitted ray tracing** : reflexion, refraction (loi de Snell), ombres dures recursives
- **Path tracing** : intégration de Monte Carlo sur l'hemisphere, echantillonnage cosine-weighted
- **Importance sampling** : echantillonner selon le BRDF (GGX) pour converger plus vite
- **Russian roulette** : terminer les chemins probabilistiquement sans biais
- **Denoising** : accumulation temporelle, filtre bilateral (poids spatial + couleur + normale + profondeur)
- **AI denoiser** : réseaux de neurones (OIDN) sur color + normal + albedo, 1-4 SPP suffisent
- **Approche hybride** : rasterization pour le G-buffer + ray tracing cible (ombres, reflexions, AO)

Nous allons maintenant explorer les techniques d'illumination globale en temps réel et les effets screen-space qui ne necessitent pas de ray tracing hardware.

</details>

---

## L'illumination globale : pourquoi c'est si important

:::tip Analogie
Imagine une piece avec une seule fenêtre. L'eclairage direct, c'est le rayon de soleil qui entre par la fenêtre et eclaire le sol. Mais toute la piece est visible, pas seulement la tache de lumiere au sol. Pourquoi ? Parce que la lumiere rebondit sur le sol, puis sur les murs, puis sur le plafond... C'est l'illumination globale. Sans elle, une scene 3D ressemble à un decor de theatre avec un seul projecteur — les zones non eclairees directement sont complètement noires.
:::

### Eclairage direct vs indirect

```
Eclairage direct uniquement          Avec illumination globale
━━━━━━━━━━━━━━━━━━━━━━━━━━          ━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────┐              ┌────────────────────┐
│        ☀           │              │        ☀           │
│       /|           │              │       /|           │
│      / |           │              │   ↗  / | ↖         │
│     /  |           │              │  /  /  |  \        │
│    ▓▓▓▓▓▓          │              │ ↗ ▓▓▓▓▓▓  ↖       │
│   ░░░░░░░░         │              │ ▒▒▒▒▒▒▒▒▒▒        │
│  ░░░░░░░░░░        │              │ ▒▒▒▓▓▓▓▒▒▒▒       │
│ ████████████       │              │ ▒▒▓▓▓▓▓▓▒▒▒       │
└────────────────────┘              └────────────────────┘
Ombres dures, noir complet          Lumiere qui rebondit partout
Pas de "color bleeding"             Murs colores teintent les objets
```

### Les composantes de la GI

```
Illumination globale = Direct + Indirect

Direct :
  L_direct = BRDF × L_i × cos(theta)
  → Ce que l'on calcule avec les lumieres standard

Indirect (1 rebond) :
  L_indirect = ∫ BRDF × L_reflected × cos(theta) dω
  → La lumiere qui arrive apres avoir rebondi sur d'autres surfaces

Color bleeding :
  Un mur rouge eclaire → les objets proches prennent une teinte rouge
  → Effet naturel de l'illumination indirecte

Caustics :
  Lumiere focalisee apres refraction (ex: fond de piscine)
  → Tres couteux a calculer en temps reel
```

### Approches de GI en temps réel

| Technique | Precision | Performance | Dynamique | Cas d'usage |
|-----------|:---------:|:-----------:|:---------:|-------------|
| **Light probes (baked)** | Moyenne | Très rapide | Non | Scenes statiques |
| **Reflection probes** | Bonne (reflexions) | Rapide | Partiel | Interieurs, objets brillants |
| **Spherical Harmonics** | Basse frequence | Très rapide | Oui | Irradiance diffuse |
| **VXGI** | Bonne | Couteuse | Oui | Scenes moyennes |
| **SSGI** | Limitee (screen-space) | Moyenne | Oui | Post-processing |
| **Path tracing** | Exacte | Très couteuse | Oui | Offline / hybride |

---

## Light probes et reflection probes

### Light probes : capturer l'eclairage ambiant

Un light probe est un point dans l'espace où l'on capture l'irradiance arrivant de toutes les directions. En pratique, on rend une cubemap depuis ce point, puis on la convolue pour obtenir l'eclairage diffus.

```
Light probe placement :

    ┌─────────────────────────────┐
    │  Piece                      │
    │                             │
    │   ⊕────────⊕────────⊕     │  ← Probes sur une grille
    │   |        |        |      │
    │   |   ⊕────⊕────⊕   |     │
    │   |   |    |    |   |      │
    │   ⊕───⊕────⊕────⊕───⊕     │
    │                             │
    └─────────────────────────────┘

    Chaque ⊕ stocke l'irradiance de toutes les directions
    Pour un fragment, on interpole entre les probes les plus proches
```

### Baked vs runtime probes

```typescript
// Baked probes : pre-calcules offline
interface BakedLightProbe {
  position: [number, number, number];
  // 9 coefficients SH (bande 0 + 1 + 2) par canal RGB = 27 floats
  shCoefficients: Float32Array; // 27 valeurs

  // Alternative : cubemap basse resolution (ex: 16x16 par face)
  irradianceCubemap?: GPUTexture;
}

// Runtime probes : recalcules chaque frame (ou chaque N frames)
interface RuntimeReflectionProbe {
  position: [number, number, number];
  cubemap: GPUTexture;          // 128x128 ou 256x256 par face
  updateFrequency: number;       // Frames entre chaque mise a jour
  influenceRadius: number;       // Rayon d'influence (metres)
  boxProjection: boolean;        // Correction pour les pieces rectangulaires
  priority: number;              // Pour limiter les mises a jour simultanees
}
```

### Reflection probe : box projection

La box projection corrige les reflexions pour qu'elles correspondent à la geometrie de la piece plutot qu'à une sphere infinie.

```wgsl
// Sans box projection : reflexion vers l'infini
// Avec box projection : intersection du rayon reflechi avec la boite de la piece

fn box_project_reflection(
  position: vec3f,           // Position du fragment
  reflection_dir: vec3f,     // Direction de reflexion
  probe_pos: vec3f,          // Position de la probe
  box_min: vec3f,            // Coin min de la piece
  box_max: vec3f             // Coin max de la piece
) -> vec3f {
  // Calculer l'intersection du rayon avec la boite
  let first_plane = (box_max - position) / reflection_dir;
  let second_plane = (box_min - position) / reflection_dir;

  let furthest = max(first_plane, second_plane);
  let distance = min(min(furthest.x, furthest.y), furthest.z);

  // Point d'intersection sur la boite
  let intersection = position + reflection_dir * distance;

  // Retourner la direction depuis le centre de la probe
  return normalize(intersection - probe_pos);
}
```

---

## Spherical Harmonics (SH) : representer l'irradiance de manière compacte

### L'idee

Les Spherical Harmonics sont des fonctions de base sur la sphere, comme les sinusoides sont des fonctions de base pour les signaux 1D (Fourier). On peut representer n'importe quelle fonction sur la sphere par une somme ponderee de SH.

```
Bandes SH :

Bande 0 (1 coeff) :  Constante — couleur moyenne
    ┌───┐
    │ ● │   Y_0^0 = 0.282 (constante)
    └───┘

Bande 1 (3 coeffs) : Gradient directionnel (x, y, z)
    ┌───┐ ┌───┐ ┌───┐
    │ ◐ │ │ ◑ │ │ ◒ │   Y_1^{-1}, Y_1^0, Y_1^1
    └───┘ └───┘ └───┘

Bande 2 (5 coeffs) : Details quadratiques
    ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐
    │ ◍ │ │ ◎ │ │ ◉ │ │ ◈ │ │ ◇ │
    └───┘ └───┘ └───┘ └───┘ └───┘

Total bande 0+1+2 = 9 coefficients par canal couleur
  → 27 floats pour representer l'irradiance diffuse complete
  → Suffisant car le cosinus (Lambertien) est basse frequence
```

### Projection et reconstruction SH

```typescript
// Les 9 fonctions de base SH pour les bandes 0, 1, 2
function shBasis(direction: [number, number, number]): number[] {
  const [x, y, z] = direction;
  return [
    // Bande 0
    0.282095,                          // Y_0^0 : constante

    // Bande 1
    0.488603 * y,                      // Y_1^{-1}
    0.488603 * z,                      // Y_1^0
    0.488603 * x,                      // Y_1^1

    // Bande 2
    1.092548 * x * y,                  // Y_2^{-2}
    1.092548 * y * z,                  // Y_2^{-1}
    0.315392 * (3 * z * z - 1),        // Y_2^0
    1.092548 * x * z,                  // Y_2^1
    0.546274 * (x * x - y * y),        // Y_2^2
  ];
}

// Projection : cubemap → coefficients SH
function projectCubemapToSH(cubemapData: Float32Array[], faceSize: number): Float32Array {
  const shCoeffs = new Float32Array(9 * 3); // 9 coeffs × RGB
  let weightSum = 0;

  for (let face = 0; face < 6; face++) {
    for (let y = 0; y < faceSize; y++) {
      for (let x = 0; x < faceSize; x++) {
        const dir = cubemapTexelDirection(face, x, y, faceSize);
        const solidAngle = cubemapTexelSolidAngle(x, y, faceSize);
        const idx = (y * faceSize + x) * 3;
        const rgb = [cubemapData[face][idx], cubemapData[face][idx+1], cubemapData[face][idx+2]];
        const basis = shBasis([dir[0], dir[1], dir[2]]);

        for (let i = 0; i < 9; i++) {
          for (let c = 0; c < 3; c++) { shCoeffs[i * 3 + c] += rgb[c] * basis[i] * solidAngle; }
        }
        weightSum += solidAngle;
      }
    }
  }
  for (let i = 0; i < shCoeffs.length; i++) { shCoeffs[i] *= 4 * Math.PI / weightSum; }
  return shCoeffs;
}
```

### Reconstruction de l'irradiance dans le shader

```wgsl
struct SHCoeffs {
  // 9 coefficients SH, chacun vec3f (RGB)
  c0: vec3f,      // Bande 0
  c1: vec3f,      // Bande 1 : Y
  c2: vec3f,      // Bande 1 : Z
  c3: vec3f,      // Bande 1 : X
  c4: vec3f,      // Bande 2
  c5: vec3f,
  c6: vec3f,
  c7: vec3f,
  c8: vec3f,
}

fn evaluate_sh_irradiance(normal: vec3f, sh: SHCoeffs) -> vec3f {
  let n = normal;

  // Convolution cosinus deja integree dans les constantes
  let c1 = 0.429043;
  let c2 = 0.511664;
  let c3 = 0.743125;
  let c4 = 0.886227;
  let c5 = 0.247708;

  var irradiance = vec3f(0.0);

  // Bande 0
  irradiance += c4 * sh.c0;

  // Bande 1
  irradiance += 2.0 * c2 * (sh.c1 * n.y + sh.c2 * n.z + sh.c3 * n.x);

  // Bande 2
  irradiance += c1 * sh.c4 * (n.x * n.y);
  irradiance += c1 * sh.c5 * (n.y * n.z);
  irradiance += c3 * sh.c6 * (n.z * n.z) - c5 * sh.c6;
  irradiance += c1 * sh.c7 * (n.x * n.z);
  irradiance += c1 * sh.c8 * (n.x * n.x - n.y * n.y);

  return max(irradiance, vec3f(0.0));
}

// Utilisation dans le fragment shader
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let normal = normalize(in.world_normal);
  let albedo = textureSample(albedo_tex, samp, in.uv).rgb;

  // Eclairage direct (lumiere ponctuelle)
  let direct = calculate_direct_lighting(in.world_pos, normal, albedo);

  // Eclairage indirect via SH
  let indirect = evaluate_sh_irradiance(normal, probe_sh) * albedo;

  let color = direct + indirect;
  return vec4f(color, 1.0);
}
```

---

## Cubemap convolution pour l'irradiance

La convolution d'une cubemap d'environnement produit une irradiance map : pour chaque direction normale, la couleur represente l'eclairage diffus recu.

```wgsl
// Compute shader : convoluer une cubemap d'environnement
// Chaque texel de la sortie integre la lumiere arrivant de tout l'hemisphere

@group(0) @binding(0) var env_cubemap: texture_cube<f32>;
@group(0) @binding(1) var env_sampler: sampler;
@group(0) @binding(2) var irradiance_out: texture_storage_2d_array<rgba16float, write>;

const PI = 3.14159265359;
const SAMPLE_DELTA = 0.025; // Pas d'echantillonnage

@compute @workgroup_size(8, 8)
fn convolve(@builtin(global_invocation_id) gid: vec3u) {
  let face = gid.z;
  let face_size = textureDimensions(irradiance_out).x;
  let uv = (vec2f(gid.xy) + 0.5) / f32(face_size);

  // Direction de la normale pour ce texel
  let normal = normalize(cubemap_direction(face, uv));

  // Construire un repere tangent autour de la normale
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(normal.y) > 0.999) {
    up = vec3f(0.0, 0.0, 1.0);
  }
  let right = normalize(cross(up, normal));
  up = cross(normal, right);

  var irradiance = vec3f(0.0);
  var sample_count = 0.0;

  // Integrer sur l'hemisphere au-dessus de la normale
  for (var phi = 0.0; phi < 2.0 * PI; phi += SAMPLE_DELTA) {
    for (var theta = 0.0; theta < 0.5 * PI; theta += SAMPLE_DELTA) {
      // Direction en coordonnees spheriques
      let tangent_sample = vec3f(
        sin(theta) * cos(phi),
        sin(theta) * sin(phi),
        cos(theta)
      );

      // Transformer dans le repere monde
      let sample_dir = tangent_sample.x * right
                     + tangent_sample.y * up
                     + tangent_sample.z * normal;

      // Echantillonner l'environnement
      let env_color = textureSampleLevel(env_cubemap, env_sampler, sample_dir, 0.0).rgb;

      // Ponderer par cos(theta) * sin(theta)
      // cos(theta) = facteur Lambertien
      // sin(theta) = compensation de l'aire solide
      irradiance += env_color * cos(theta) * sin(theta);
      sample_count += 1.0;
    }
  }

  irradiance = PI * irradiance / sample_count;

  textureStore(irradiance_out, gid.xy, i32(face), vec4f(irradiance, 1.0));
}
```

---

## Probe grid : interpolation trilineaire

```
Grille de probes 3D :

     ⊕─────⊕─────⊕
    /|     /|     /|       Chaque ⊕ contient 9 SH coefficients (RGB)
   ⊕─────⊕─────⊕ |
  /| |  /| |  /| |       Pour un fragment P :
 ⊕─────⊕─────⊕ | |       1. Trouver la cellule contenant P
 | ⊕──|──⊕──|──⊕ |       2. Interpoler trilineairement entre
 |/|   |/|   |/| |          les 8 probes aux coins de la cellule
 ⊕─────⊕─────⊕ | |       3. Utiliser le resultat pour l'irradiance
 | ⊕──|──⊕──|──⊕ |
 |/    |/    |/   /
 ⊕─────⊕─────⊕  /
```

```typescript
interface ProbeGrid {
  origin: [number, number, number];
  spacing: [number, number, number];
  resolution: [number, number, number];
  shData: Float32Array;  // resolution.x * y * z * 27 floats
}

function sampleProbeGrid(grid: ProbeGrid, worldPos: [number, number, number]): Float32Array {
  // Position relative dans la grille
  const local = worldPos.map((w, i) => (w - grid.origin[i]) / grid.spacing[i]);
  const base = local.map(v => Math.floor(v));
  const frac = local.map((v, i) => v - base[i]);

  // Interpolation trilineaire entre les 8 probes voisines
  const result = new Float32Array(27);
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const ix = Math.min(base[0] + dx, grid.resolution[0] - 1);
        const iy = Math.min(base[1] + dy, grid.resolution[1] - 1);
        const iz = Math.min(base[2] + dz, grid.resolution[2] - 1);
        const probeIdx = (iz * grid.resolution[1] * grid.resolution[0] + iy * grid.resolution[0] + ix) * 27;
        const w = (dx ? frac[0] : 1-frac[0]) * (dy ? frac[1] : 1-frac[1]) * (dz ? frac[2] : 1-frac[2]);
        for (let c = 0; c < 27; c++) { result[c] += grid.shData[probeIdx + c] * w; }
      }
    }
  }
  return result;
}
```

---

## VXGI : Voxel-based Global Illumination

### Concept

VXGI discretise la scene en voxels (pixels 3D), stocke la radiance dans chaque voxel, puis fait du cone tracing pour collecter l'eclairage indirect.

```
Pipeline VXGI :

1. Voxelisation (chaque frame ou quand la scene change)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Scene 3D  →  Grille de voxels 3D (ex: 256³)

   ┌──┬──┬──┬──┐     Chaque voxel stocke :
   │░░│  │▓▓│  │     - Couleur (albedo eclaire)
   ├──┼──┼──┼──┤     - Opacite
   │  │▒▒│  │░░│     - Normale (optionnel)
   ├──┼──┼──┼──┤
   │▓▓│  │░░│  │
   └──┴──┴──┴──┘

2. Mipmap 3D (une seule fois apres voxelisation)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   256³ → 128³ → 64³ → 32³ → ...
   Chaque niveau = version "floue" de la scene

3. Cone tracing (chaque fragment)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Depuis le fragment, lancer des cones dans l'hemisphere
   Echantillonner la texture 3D a des LOD croissants
   → Plus le cone est loin, plus on echantillonne un LOD grossier

        ╱ cone diffus (large)
   P ──◁
        ╲ cone speculaire (etroit)
```

### Cone tracing en WGSL (concept simplifie)

```wgsl
@group(0) @binding(0) var voxel_texture: texture_3d<f32>;
@group(0) @binding(1) var voxel_sampler: sampler;

struct VoxelGridInfo {
  world_min: vec3f,
  voxel_size: f32,
  grid_resolution: vec3f,
  max_lod: f32,
}

@group(0) @binding(2) var<uniform> grid: VoxelGridInfo;

fn trace_cone(
  origin: vec3f,
  direction: vec3f,
  cone_half_angle: f32,  // tan(angle/2) du cone
  max_distance: f32
) -> vec4f {
  var color = vec3f(0.0);
  var alpha = 0.0;
  var t = grid.voxel_size * 2.0; // Offset initial pour eviter le self-hit

  while (t < max_distance && alpha < 0.95) {
    // Diametre du cone a cette distance
    let diameter = 2.0 * cone_half_angle * t;

    // LOD = log2(diametre / voxel_size)
    let lod = log2(diameter / grid.voxel_size);

    // Position dans l'espace voxel [0, 1]
    let world_pos = origin + direction * t;
    let uvw = (world_pos - grid.world_min) / (grid.voxel_size * grid.grid_resolution);

    // Echantillonner la texture 3D au LOD calcule
    let sample = textureSampleLevel(voxel_texture, voxel_sampler, uvw, lod);

    // Front-to-back compositing
    let a = (1.0 - alpha) * sample.a;
    color += sample.rgb * a;
    alpha += a;

    // Avancer — pas proportionnel au diametre du cone
    t += diameter * 0.5;
  }

  return vec4f(color, alpha);
}

// Eclairage indirect diffus : 6 cones larges sur l'hemisphere
fn indirect_diffuse(position: vec3f, normal: vec3f) -> vec3f {
  let tan_half = 0.577; // tan(30°) ≈ cone de 60°
  var tangent = normalize(cross(vec3f(0.0, 1.0, 0.0), normal));
  if (length(tangent) < 0.001) { tangent = normalize(cross(vec3f(1.0, 0.0, 0.0), normal)); }
  let bitangent = cross(normal, tangent);

  let dirs = array(normal, normalize(normal+tangent), normalize(normal-tangent),
    normalize(normal+bitangent), normalize(normal-bitangent), normalize(normal+tangent+bitangent));
  let weights = array(1.0, 0.7, 0.7, 0.7, 0.7, 0.5);

  var indirect = vec3f(0.0); var tw = 0.0;
  for (var i = 0u; i < 6u; i++) {
    indirect += trace_cone(position, dirs[i], tan_half, 10.0).rgb * weights[i];
    tw += weights[i];
  }
  return indirect / tw;
}
```

---

## Screen-Space Reflections (SSR)

### Principe

SSR trace des rayons de reflexion dans le depth buffer de l'ecran. C'est une technique purement screen-space : elle ne peut refleter que ce qui est visible a l'ecran.

```
SSR : ray marching dans le depth buffer

   Camera                    Ecran (depth buffer)
     ●                      ┌──────────────────┐
      \   rayon primaire    │                  │
       \                    │    ▓▓▓▓          │ Surface reflechissante
        \                   │   ↗              │
         ● point P          │  / rayon reflechi│
        / \                 │ /                │
       /   \                │●─ hit !          │ Reflexion trouvee
      /     \               │                  │
     /       \              └──────────────────┘

  Algorithme :
  1. Pour chaque pixel reflechissant du G-buffer
  2. Calculer la direction de reflexion
  3. Projeter le rayon dans l'espace ecran
  4. Marcher pas a pas dans le depth buffer
  5. Si depth(rayon) > depth(buffer) → intersection !
  6. Lire la couleur du buffer de couleur a ce pixel
```

### Implementation ray marching lineaire

```wgsl
struct SSRParams {
  projection: mat4x4f,
  inv_projection: mat4x4f,
  screen_size: vec2f,
  max_steps: u32,
  max_distance: f32,
  thickness: f32,
  stride: f32,
}

@group(0) @binding(0) var depth_texture: texture_2d<f32>;
@group(0) @binding(1) var normal_texture: texture_2d<f32>;
@group(0) @binding(2) var color_texture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: SSRParams;
@group(0) @binding(4) var output: texture_storage_2d<rgba16float, write>;

fn view_pos_from_depth(uv: vec2f, depth: f32) -> vec3f {
  let ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
  var view_pos = params.inv_projection * ndc;
  view_pos /= view_pos.w;
  return view_pos.xyz;
}

fn project_to_screen(view_pos: vec3f) -> vec3f {
  var clip = params.projection * vec4f(view_pos, 1.0);
  clip /= clip.w;
  return vec3f(
    (clip.x * 0.5 + 0.5) * params.screen_size.x,
    (clip.y * -0.5 + 0.5) * params.screen_size.y,
    clip.z
  );
}

@compute @workgroup_size(8, 8)
fn ssr_raymarch(@builtin(global_invocation_id) gid: vec3u) {
  let pixel = vec2i(gid.xy);
  let uv = (vec2f(gid.xy) + 0.5) / params.screen_size;

  // Lire le G-buffer
  let depth = textureLoad(depth_texture, pixel, 0).r;
  if (depth >= 1.0) {
    textureStore(output, gid.xy, vec4f(0.0));
    return;
  }

  let normal_ws = textureLoad(normal_texture, pixel, 0).xyz * 2.0 - 1.0;
  let roughness = textureLoad(normal_texture, pixel, 0).w;

  // Pas de SSR pour les surfaces tres rugueuses
  if (roughness > 0.5) {
    textureStore(output, gid.xy, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Position en view-space
  let view_pos = view_pos_from_depth(uv, depth);
  let view_dir = normalize(view_pos);

  // Direction de reflexion en view-space
  let reflect_dir = reflect(view_dir, normal_ws);

  // Point de depart et de fin du rayon en view-space
  let ray_start = view_pos;
  let ray_end = view_pos + reflect_dir * params.max_distance;

  // Projeter en screen-space
  let start_screen = project_to_screen(ray_start);
  let end_screen = project_to_screen(ray_end);

  // Ray march lineaire en screen-space
  let delta = end_screen - start_screen;
  let step_count = min(
    f32(params.max_steps),
    max(abs(delta.x), abs(delta.y))
  );

  let step = delta / step_count;
  var ray = start_screen + step * 2.0; // Offset initial

  var hit = false;
  var hit_uv = vec2f(0.0);

  for (var i = 0u; i < u32(step_count); i++) {
    let sample_pixel = vec2i(ray.xy);

    // Hors ecran ?
    if (sample_pixel.x < 0 || sample_pixel.y < 0
     || sample_pixel.x >= i32(params.screen_size.x)
     || sample_pixel.y >= i32(params.screen_size.y)) {
      break;
    }

    let sample_depth = textureLoad(depth_texture, sample_pixel, 0).r;
    let ray_depth = ray.z;

    // Test d'intersection : le rayon est passe derriere la surface
    if (ray_depth > sample_depth
     && ray_depth - sample_depth < params.thickness) {
      hit = true;
      hit_uv = vec2f(sample_pixel) / params.screen_size;
      break;
    }

    ray += step * params.stride;
  }

  if (hit) {
    let reflected_color = textureLoad(
      color_texture,
      vec2i(hit_uv * params.screen_size),
      0
    ).rgb;

    // Attenuation par la distance et les bords de l'ecran
    let edge_fade = 1.0 - smoothstep(0.8, 1.0, max(
      abs(hit_uv.x * 2.0 - 1.0),
      abs(hit_uv.y * 2.0 - 1.0)
    ));

    textureStore(output, gid.xy, vec4f(reflected_color * edge_fade, 1.0));
  } else {
    textureStore(output, gid.xy, vec4f(0.0, 0.0, 0.0, 0.0));
  }
}
```

### Hi-Z tracing (acceleration)

Le Hi-Z tracing utilise une pyramide de depth buffer (mipmap du Z-buffer) pour sauter rapidement les zones vides.

```
Hi-Z Pyramid : mipmap du depth buffer ou chaque texel = max des 4 enfants

  Principe :
  1. Commencer a un LOD eleve (gros pas)
  2. Si le rayon est AU-DESSUS du max depth → on peut sauter
  3. Si EN-DESSOUS → descendre au LOD inferieur
  4. Au LOD 0 → test d'intersection exact
  → O(log n) au lieu de O(n) pas lineaires
```

### SSR avec fallback environment map

```wgsl
fn ssr_with_fallback(
  ssr_color: vec4f,       // Resultat du SSR (a = 0 si pas de hit)
  reflect_dir: vec3f,     // Direction de reflexion world-space
  roughness: f32
) -> vec3f {
  // Lire l'environment map au LOD proportionnel a la rugosite
  let env_lod = roughness * 6.0; // 6 LOD dans la prefiltered env map
  let env_color = textureSampleLevel(
    env_cubemap, env_sampler, reflect_dir, env_lod
  ).rgb;

  // Mixer SSR et environment map selon la confiance du SSR
  let ssr_confidence = ssr_color.a;
  return mix(env_color, ssr_color.rgb, ssr_confidence);
}
```

---

## Screen-Space Global Illumination (SSGI)

Le SSGI generalise le SSR en tracant des rayons dans toutes les directions (pas seulement la reflexion) pour capturer l'eclairage indirect diffus depuis le screen-space.

```
SSGI : generaliser le SSR a toutes les directions

  Algorithme :
  1. Pour chaque pixel, generer N directions dans l'hemisphere (cosine-weighted)
  2. Ray march chaque direction dans le depth buffer
  3. Si hit → lire la couleur du frame precedent (eclairage direct)
  4. Ponderer par cos(theta) / pdf → irradiance indirecte

  Limitations : ne voit que l'information a l'ecran,
  bruit important → necessite accumulation temporelle
```

---

## Temporal Anti-Aliasing (TAA)

### Le problème de l'aliasing temporel

```
Sans TAA :                      Avec TAA :
━━━━━━━━                       ━━━━━━━━
Frame N : pixel (100,50) = 0.0   Frame N : jitter +0.3 px
Frame N+1 : pixel (100,50) = 1.0 Frame N+1 : jitter -0.2 px
→ Scintillement (flickering)      Frame N+2 : jitter +0.1 px
                                   → Moyenne : valeur stable

Le TAA repartit l'echantillonnage sur plusieurs frames
en deplacant legerement (jitter) la camera a chaque frame,
puis en melangeant avec l'historique.
```

### Pipeline TAA complet

```typescript
// Jitter patterns : Halton sequence (quasi-aleatoire, bonne couverture)
function haltonSequence(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

function generateJitterOffsets(count: number): [number, number][] {
  const offsets: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    offsets.push([
      haltonSequence(i + 1, 2) - 0.5, // Jitter X [-0.5, 0.5] pixel
      haltonSequence(i + 1, 3) - 0.5, // Jitter Y [-0.5, 0.5] pixel
    ]);
  }
  return offsets;
}

// Appliquer le jitter a la matrice de projection
function applyJitter(
  projectionMatrix: Float32Array,
  jitterX: number,
  jitterY: number,
  width: number,
  height: number
): Float32Array {
  const jittered = new Float32Array(projectionMatrix);
  // Modifier les elements de translation de la projection
  jittered[8] += jitterX * 2.0 / width;   // Column 2, row 0
  jittered[9] += jitterY * 2.0 / height;  // Column 2, row 1
  return jittered;
}
```

### TAA resolve en compute shader

```wgsl
struct TAAParams {
  screen_size: vec2f,
  blend_factor: f32,         // Typiquement 0.05 (95% historique, 5% frame courante)
  velocity_scale: f32,
}

@group(0) @binding(0) var current_color: texture_2d<f32>;   // Frame courante (jittered)
@group(0) @binding(1) var history_color: texture_2d<f32>;   // Resultat TAA precedent
@group(0) @binding(2) var velocity_texture: texture_2d<f32>; // Motion vectors
@group(0) @binding(3) var depth_texture: texture_2d<f32>;
@group(0) @binding(4) var<uniform> params: TAAParams;
@group(0) @binding(5) var output: texture_storage_2d<rgba16float, write>;

// Neighborhood clamping : eviter le ghosting
fn clamp_to_neighborhood(
  pixel: vec2i,
  history_sample: vec3f
) -> vec3f {
  var color_min = vec3f(999.0);
  var color_max = vec3f(-999.0);

  // Echantillonner un voisinage 3x3 (ou "plus" cross)
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      let neighbor = textureLoad(current_color, pixel + vec2i(dx, dy), 0).rgb;

      // Travailler en YCoCg pour un meilleur clamping
      let ycocg = rgb_to_ycocg(neighbor);
      color_min = min(color_min, ycocg);
      color_max = max(color_max, ycocg);
    }
  }

  // Clamper l'historique dans la boite AABB du voisinage
  let history_ycocg = rgb_to_ycocg(history_sample);
  let clamped = clamp(history_ycocg, color_min, color_max);
  return ycocg_to_rgb(clamped);
}

fn rgb_to_ycocg(rgb: vec3f) -> vec3f {
  let y  = 0.25 * rgb.r + 0.5 * rgb.g + 0.25 * rgb.b;
  let co = 0.5 * rgb.r - 0.5 * rgb.b;
  let cg = -0.25 * rgb.r + 0.5 * rgb.g - 0.25 * rgb.b;
  return vec3f(y, co, cg);
}

fn ycocg_to_rgb(ycocg: vec3f) -> vec3f {
  let y = ycocg.x; let co = ycocg.y; let cg = ycocg.z;
  return vec3f(y + co - cg, y + cg, y - co - cg);
}

@compute @workgroup_size(8, 8)
fn taa_resolve(@builtin(global_invocation_id) gid: vec3u) {
  let pixel = vec2i(gid.xy);
  let uv = (vec2f(gid.xy) + 0.5) / params.screen_size;

  // Couleur courante (jittered)
  let current = textureLoad(current_color, pixel, 0).rgb;

  // Lire le motion vector pour la reprojection
  let velocity = textureLoad(velocity_texture, pixel, 0).xy;

  // UV du pixel dans la frame precedente
  let history_uv = uv - velocity;

  // Hors ecran ? Pas d'historique disponible
  if (history_uv.x < 0.0 || history_uv.x > 1.0
   || history_uv.y < 0.0 || history_uv.y > 1.0) {
    textureStore(output, gid.xy, vec4f(current, 1.0));
    return;
  }

  // Echantillonner l'historique (avec interpolation bilineaire)
  let history_pixel = vec2i(history_uv * params.screen_size);
  let history = textureLoad(history_color, history_pixel, 0).rgb;

  // Clamper l'historique pour eviter le ghosting
  let clamped_history = clamp_to_neighborhood(pixel, history);

  // Blend adaptatif : plus de melange si le pixel bouge vite
  let velocity_length = length(velocity * params.screen_size);
  let adaptive_blend = clamp(
    params.blend_factor + velocity_length * 0.1,
    params.blend_factor,
    1.0  // 100% frame courante si mouvement trop rapide
  );

  let result = mix(clamped_history, current, adaptive_blend);
  textureStore(output, gid.xy, vec4f(result, 1.0));
}
```

### Velocity buffer (motion vectors)

```wgsl
// Dans le vertex shader, calculer le motion vector
struct VertexOutput {
  @builtin(position) clip_pos: vec4f,
  @location(0) current_pos_ndc: vec4f,
  @location(1) prev_pos_ndc: vec4f,
}

@vertex
fn vs_velocity(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  // Position courante
  let current_clip = camera.projection * camera.view * model.transform * vec4f(in.position, 1.0);
  out.clip_pos = current_clip;
  out.current_pos_ndc = current_clip;

  // Position frame precedente
  out.prev_pos_ndc = camera.prev_projection * camera.prev_view
                   * model.prev_transform * vec4f(in.position, 1.0);

  return out;
}

@fragment
fn fs_velocity(in: VertexOutput) -> @location(0) vec2f {
  let current_uv = (in.current_pos_ndc.xy / in.current_pos_ndc.w) * 0.5 + 0.5;
  let prev_uv = (in.prev_pos_ndc.xy / in.prev_pos_ndc.w) * 0.5 + 0.5;

  // Velocity = difference d'UV entre frames
  return current_uv - prev_uv;
}
```

---

## Ambient Occlusion avance : HBAO+ et GTAO

### Rappel SSAO

```
SSAO (Module 16) :
  Pour chaque pixel, echantillonner N points aleatoires
  dans une sphere autour du fragment.
  Compter combien sont "sous" la surface (occlus).

  Limitations :
  - Echantillonnage aleatoire → bruit + banding
  - Sphere = approximation grossiere
  - Pas de direction privilegiee
```

### HBAO+ (Horizon-Based Ambient Occlusion)

```
HBAO+ : trouver l'angle d'horizon dans chaque direction

Pour chaque direction (ex: 8 directions) :
  Marcher le long de la direction dans le depth buffer
  Trouver l'angle maximum au-dessus de l'horizon

      Angle horizon
         ↗ θ_max
        /
  ─────●────── tangent plane (horizon = 0°)
       |
       | surface

  L'occlusion pour cette direction :
    AO = sin(θ_horizon) - sin(θ_tangent)

  AO total = moyenne sur toutes les directions

Avantages vs SSAO :
  - Physiquement motive (integrale d'horizon)
  - Moins de bruit (marche deterministe)
  - Meilleure gestion des surfaces tangentes
```

```wgsl
@compute @workgroup_size(8, 8)
fn hbao(@builtin(global_invocation_id) gid: vec3u) {
  let uv = (vec2f(gid.xy) + 0.5) / params.screen_size;
  let view_pos = reconstruct_view_pos(uv);
  let normal = compute_normal_from_depth(uv); // Via derivees finies

  // Bruit de rotation (texture 4x4 de noise)
  let rotation_angle = textureLoad(noise_tex, vec2i(gid.xy) % 4, 0).x * 2.0 * PI;

  var ao = 0.0;
  for (var d = 0u; d < params.num_directions; d++) { // 8 typiquement
    let angle = f32(d) * 2.0 * PI / f32(params.num_directions) + rotation_angle;
    let direction = vec2f(cos(angle), sin(angle));

    let tangent_angle = compute_tangent_angle(direction, normal);
    var max_horizon = tangent_angle + params.angle_bias;

    // Marcher dans cette direction (4-8 pas)
    for (var s = 1u; s <= params.num_steps; s++) {
      let sample_uv = uv + direction * f32(s) * params.radius / (f32(params.num_steps) * -view_pos.z);
      if (out_of_bounds(sample_uv)) { break; }

      let sample_pos = reconstruct_view_pos(sample_uv);
      let diff = sample_pos - view_pos;
      if (length(diff) < params.radius) {
        max_horizon = max(max_horizon, atan2(diff.z, length(diff.xy)));
      }
    }
    ao += sin(max_horizon) - sin(tangent_angle + params.angle_bias);
  }

  ao = clamp(1.0 - ao / f32(params.num_directions) * params.intensity, 0.0, 1.0);
  textureStore(output, gid.xy, vec4f(ao, 0.0, 0.0, 1.0));
}
```

### GTAO (Ground Truth Ambient Occlusion)

GTAO est une evolution de HBAO qui intégré exactement la visibilite sur l'hemisphere, sans approximation par directions discretes.

```
GTAO vs HBAO :

HBAO :
  - 8 directions discretes
  - Angle d'horizon par direction
  - Approximation par somme

GTAO :
  - Integration en espace de slice (tranche 2D)
  - Pour chaque slice, integrer analytiquement
    la visibilite entre l'horizon et le plan tangent
  - cos-weighted → resultat physiquement correct
  - Multi-bounce approximation incluse

  Formule GTAO pour une slice :
  AO_slice = 1/π × (θ₂ - θ₁ - sin(2θ₂)/2 + sin(2θ₁)/2)

  ou θ₁ et θ₂ sont les angles d'horizon gauche et droit

Performance :
  SSAO    : ~0.5ms (1080p, GPU mid)
  HBAO+   : ~0.8ms
  GTAO    : ~0.6ms (plus efficace que HBAO+ !)
  RT AO   : ~3-5ms
```

---

## Three.js post-processing : intégrer les effets screen-space

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';

// --- Setup ---
const renderer = new THREE.WebGLRenderer({ antialias: false }); // Pas de MSAA avec TAA
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 100
);

// --- Scene avec materiaux PBR ---
const room = new THREE.Mesh(
  new THREE.BoxGeometry(10, 5, 10),
  new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    side: THREE.BackSide,
  })
);
scene.add(room);

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 64, 64),
  new THREE.MeshStandardMaterial({
    color: 0xff4444,
    roughness: 0.2,
    metalness: 0.8,
  })
);
sphere.position.set(0, 1, 0);
scene.add(sphere);

// Sol miroir
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.1,
    metalness: 0.0,
  })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 4, 2);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// --- SSAO ---
const ssaoComposer = new EffectComposer(renderer);
ssaoComposer.addPass(new RenderPass(scene, camera));
const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssaoPass.kernelRadius = 0.5;
ssaoComposer.addPass(ssaoPass);

// --- GTAO (meilleure qualite) ---
const gtaoComposer = new EffectComposer(renderer);
gtaoComposer.addPass(new RenderPass(scene, camera));
gtaoComposer.addPass(new GTAOPass(scene, camera, window.innerWidth, window.innerHeight));

// --- SSR (reflexions screen-space) ---
const ssrComposer = new EffectComposer(renderer);
ssrComposer.addPass(new RenderPass(scene, camera));
ssrComposer.addPass(new SSRPass({
  renderer, scene, camera,
  width: window.innerWidth, height: window.innerHeight,
  selects: [floor], // Objets reflechissants
}));

// --- TAA ---
const taaComposer = new EffectComposer(renderer);
const taaPass = new TAARenderPass(scene, camera);
taaPass.sampleLevel = 2; // 4 SPP
taaComposer.addPass(taaPass);

// Render loop
const composer = gtaoComposer; // Choisir la technique
renderer.setAnimationLoop(() => composer.render());
```

### Probe-based GI dans Three.js

```typescript
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';

// Rendre une cubemap d'environnement depuis un point de la scene
const cubeTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeTarget);
cubeCamera.position.set(0, 1.5, 0);
cubeCamera.update(renderer, scene);

// Generer les SH et ajouter la probe — Three.js l'utilise automatiquement
// pour l'eclairage indirect sur MeshStandardMaterial/MeshPhysicalMaterial
const lightProbe = LightProbeGenerator.fromCubeRenderTarget(renderer, cubeTarget);
lightProbe.position.copy(cubeCamera.position);
lightProbe.intensity = 1.0;
scene.add(lightProbe);
```

---

## Pratique

### Exercice GI.1 — SSAO custom en post-processing Three.js

Créer un ShaderPass custom qui implemente un SSAO basique :
1. Générer un G-buffer (depth + normals) via `MeshNormalMaterial`
2. Écrire un fragment shader qui echantillonne 16 points dans une sphere
3. Comparer la profondeur de chaque sample avec le depth buffer
4. Appliquer un blur bilateral pour lisser le résultat
5. Multiplier la couleur de la scene par le facteur AO

```typescript
// TODO: Setup du G-buffer (depth + normals)
// TODO: Generer les 16 vecteurs d'echantillonnage (hemisphere oriente vers la normale)
// TODO: Ecrire le shader SSAO
// TODO: Appliquer un blur 4x4
// TODO: Combiner avec la scene
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// --- 1. Scene ---
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50);
camera.position.set(0, 3, 5); camera.lookAt(0, 0, 0);

for (let i = 0; i < 10; i++) {
  const mesh = new THREE.Mesh(
    Math.random() > 0.5 ? new THREE.BoxGeometry(1,1,1) : new THREE.SphereGeometry(0.5, 32, 32),
    new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5), roughness: 0.8 })
  );
  mesh.position.set((Math.random()-0.5)*6, Math.random()*2, (Math.random()-0.5)*6);
  scene.add(mesh);
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10,10), new THREE.MeshStandardMaterial({ color: 0x888888 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
scene.add(new THREE.DirectionalLight(0xffffff, 1.5));
scene.add(new THREE.AmbientLight(0x404040));

// --- 2. G-buffer (depth + normals) ---
const depthTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.FloatType,
  }
);
depthTarget.depthTexture = new THREE.DepthTexture(
  window.innerWidth,
  window.innerHeight
);
depthTarget.depthTexture.type = THREE.FloatType;

const normalTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  { type: THREE.HalfFloatType }
);

const normalMaterial = new THREE.MeshNormalMaterial();

// --- 3. SSAO Shader custom ---
const ssaoShader = {
  uniforms: {
    tDiffuse: { value: null },         // Couleur de la scene
    tDepth: { value: null },           // Depth buffer
    tNormal: { value: null },          // Normal buffer
    uScreenSize: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uProjectionMatrix: { value: camera.projectionMatrix },
    uInverseProjectionMatrix: { value: camera.projectionMatrixInverse },
    uKernelRadius: { value: 0.5 },
    uBias: { value: 0.025 },
    uKernel: { value: generateKernel(16) },
    uNoise: { value: generateNoiseTexture() },
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 uScreenSize;
    uniform mat4 uProjectionMatrix;
    uniform mat4 uInverseProjectionMatrix;
    uniform float uKernelRadius;
    uniform float uBias;
    uniform vec3 uKernel[16];
    uniform sampler2D uNoise;

    varying vec2 vUv;

    vec3 getViewPos(vec2 uv) {
      float depth = texture2D(tDepth, uv).r;
      vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 viewPos = uInverseProjectionMatrix * clipPos;
      return viewPos.xyz / viewPos.w;
    }

    void main() {
      vec3 viewPos = getViewPos(vUv);
      vec3 normal = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;

      // Bruit de rotation
      vec2 noiseUV = vUv * uScreenSize / 4.0;
      vec3 randomVec = texture2D(uNoise, noiseUV).xyz * 2.0 - 1.0;

      // Repere tangent
      vec3 tangent = normalize(randomVec - normal * dot(randomVec, normal));
      vec3 bitangent = cross(normal, tangent);
      mat3 TBN = mat3(tangent, bitangent, normal);

      float occlusion = 0.0;

      for (int i = 0; i < 16; i++) {
        // Echantillon dans l'hemisphere
        vec3 samplePos = viewPos + TBN * uKernel[i] * uKernelRadius;

        // Projeter en screen-space
        vec4 offset = uProjectionMatrix * vec4(samplePos, 1.0);
        offset.xy /= offset.w;
        offset.xy = offset.xy * 0.5 + 0.5;

        // Profondeur du depth buffer a cet endroit
        float sampleDepth = getViewPos(offset.xy).z;

        // Test d'occlusion avec range check
        float rangeCheck = smoothstep(0.0, 1.0,
          uKernelRadius / abs(viewPos.z - sampleDepth));
        occlusion += (sampleDepth >= samplePos.z + uBias ? 1.0 : 0.0) * rangeCheck;
      }

      occlusion = 1.0 - (occlusion / 16.0);

      vec3 sceneColor = texture2D(tDiffuse, vUv).rgb;
      gl_FragColor = vec4(sceneColor * occlusion, 1.0);
    }
  `,
};

function generateKernel(size: number): THREE.Vector3[] {
  return Array.from({ length: size }, (_, i) => {
    const v = new THREE.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random()).normalize();
    const scale = 0.1 + (i / size) ** 2 * 0.9; // Plus de samples pres du centre
    return v.multiplyScalar(scale);
  });
}

function generateNoiseTexture(): THREE.DataTexture {
  const data = new Float32Array(4 * 4 * 3);
  for (let i = 0; i < 16; i++) { data[i*3] = Math.random(); data[i*3+1] = Math.random(); }
  const tex = new THREE.DataTexture(data, 4, 4, THREE.RGBFormat, THREE.FloatType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  return tex;
}

// --- 4. Composer ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const ssaoPass = new ShaderPass(ssaoShader);
composer.addPass(ssaoPass);

// --- 5. Render loop ---
function animate(): void {
  requestAnimationFrame(animate);

  // Rendre le depth buffer
  renderer.setRenderTarget(depthTarget);
  renderer.render(scene, camera);

  // Rendre les normales
  scene.overrideMaterial = normalMaterial;
  renderer.setRenderTarget(normalTarget);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  renderer.setRenderTarget(null);

  // Mettre a jour les uniforms
  ssaoPass.uniforms.tDepth.value = depthTarget.depthTexture;
  ssaoPass.uniforms.tNormal.value = normalTarget.texture;
  ssaoPass.uniforms.uInverseProjectionMatrix.value.copy(
    camera.projectionMatrixInverse
  );

  composer.render();
}
animate();
```

</details>

---

## Résumé

| Concept | Description | Cout GPU (1080p) |
|---------|-------------|:----------------:|
| **Light probes (SH)** | 9 coefficients SH par probe, interpolation trilineaire entre probes | ~0.1ms |
| **Reflection probes** | Cubemap par probe, box projection pour les interieurs | ~0.3ms |
| **Spherical Harmonics** | Fonctions de base sur la sphere, bandes 0/1/2 = 9 coeffs RGB | Évaluation : negligeable |
| **Cubemap convolution** | Intégrer l'hemisphere pour obtenir l'irradiance diffuse | ~2ms (offline/compute) |
| **VXGI** | Voxeliser la scene, cone tracing dans la texture 3D avec mipmaps | ~3-5ms |
| **SSR** | Ray march dans le depth buffer, hit = lire la couleur | ~1-2ms |
| **Hi-Z tracing** | Pyramide de depth pour sauter les zones vides (O(log n)) | ~0.8ms |
| **SSGI** | SSR generalise a toutes les directions pour l'indirect diffus | ~2-4ms |
| **TAA** | Jitter projection, reprojection temporelle, neighborhood clamping | ~0.3ms |
| **Velocity buffer** | Motion vectors = différence de position NDC entre frames | ~0.2ms |
| **SSAO** | Echantillons aleatoires dans une sphere, comparer les profondeurs | ~0.5ms |
| **HBAO+** | Angle d'horizon par direction, marche dans le depth buffer | ~0.8ms |
| **GTAO** | Intégration analytique par slice, cos-weighted, multi-bounce | ~0.6ms |
| **RT AO** | Rayons d'occlusion lances depuis le fragment (hardware RT) | ~3-5ms |

| Technique AO | Qualite | Performance | Artefacts typiques |
|--------------|:-------:|:-----------:|-------------------|
| **SSAO** | Bonne | Rapide | Banding, halo autour des objets |
| **HBAO+** | Très bonne | Moyenne | Bruit directionnel |
| **GTAO** | Excellente | Bonne | Legers artefacts aux discontinuites |
| **RT AO** | Parfaite | Lente | Bruit (resolu par denoising) |

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [23 - Ray tracing](./23-ray-tracing.md) | [25 - Rendu volumetrique](./25-rendu-volumetrique.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 24 global illumination](../screencasts/screencast-24-global-illumination.md)
2. **Lab** : [lab-24-global-illumination](../labs/lab-24-global-illumination/README)
3. **Quiz** : [quiz 24 global illumination](../quizzes/quiz-24-global-illumination.html)
:::
