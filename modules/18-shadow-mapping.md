# Module 18 — Shadow mapping et techniques d'ombres

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 120 min       | [Lab 18](../labs/lab-18-shadow-mapping/) | [Quiz 18](../quizzes/quiz-18-shadow-mapping.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Expliquer le principe du shadow mapping : rendre la scene du point de vue de la lumiere
- Creer une depth map (shadow map) en rendant la profondeur dans une texture
- Implementer un pipeline a 2 passes : shadow pass + render pass
- Diagnostiquer et corriger le shadow acne et le peter panning avec le bias
- Appliquer le PCF (Percentage Closer Filtering) pour adoucir les ombres
- Implementer des Cascaded Shadow Maps (CSM) pour les grandes scenes
- Comprendre les Variance Shadow Maps (VSM) et le PCSS
- Gerer les ombres des point lights (cubemap shadow map 6 faces) et spot lights
- Coder un shadow mapping complet en WebGPU et en Three.js

---

> **Rappel du module precedent**
> Avant de continuer, verifie que tu peux repondre a ces questions :
> 1. Quelles sont les 3 strategies principales d'optimisation de performance en Three.js ?
> 2. Comment fonctionne le frustum culling et pourquoi reduit-il la charge GPU ?
> 3. Qu'est-ce que l'instanced rendering et quand l'utiliser ?
>
> <details>
> <summary>Verifier mes reponses</summary>
>
> 1. LOD (Level of Detail), instanced rendering, et frustum culling — reduisent respectivement la complexite geometrique, les draw calls, et les objets rendus hors champ
> 2. Le frustum culling elimine les objets en dehors du volume de vue de la camera avant de les envoyer au GPU — il compare la bounding box/sphere de chaque objet avec les 6 plans du frustum
> 3. L'instanced rendering dessine N copies d'un meme mesh en un seul draw call, chaque instance ayant sa propre matrice de transformation — ideal pour les forets, particules, foules
> </details>

---

## Le principe du shadow mapping

:::tip Analogie
Imagine que tu es debout dans une piece avec une seule lampe de bureau. Pour savoir quelles zones sont dans l'ombre, tu pourrais te mettre **a la place de la lampe** et regarder ce que tu vois. Tout ce que tu vois est eclaire. Tout ce qui est cache derriere un objet est dans l'ombre. Le shadow mapping fait exactement ca : il rend la scene depuis le point de vue de la lumiere pour determiner ce qui est visible (eclaire) et ce qui est occulte (ombre).
:::

### L'idee en 2 passes

Le shadow mapping est une technique en **deux passes de rendu** :

```
Passe 1 — Shadow Pass (du point de vue de la lumiere)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Lumiere (camera virtuelle)
      │
      ▼
  ┌───────────────┐
  │               │     On rend la scene depuis la lumiere
  │  Depth Buffer │     et on stocke uniquement la PROFONDEUR
  │  (Shadow Map) │     de chaque fragment dans une texture
  │               │
  └───────────────┘

Passe 2 — Render Pass (du point de vue de la camera)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Camera
      │
      ▼
  Pour chaque fragment :
  1. Transformer sa position dans l'espace de la lumiere
  2. Comparer sa profondeur avec la valeur dans la shadow map
  3. Si fragment.z > shadowMap[x,y] → le fragment est dans l'ombre
     Si fragment.z <= shadowMap[x,y] → le fragment est eclaire
```

### La matrice light-space

Pour projeter un point de la scene dans l'espace de la lumiere, on a besoin d'une **matrice light-space** (aussi appelee light view-projection matrix) :

```typescript
// La lumiere a sa propre "camera"
// Pour une directional light : projection orthographique
// Pour une spot light : projection perspective

import { mat4, vec3 } from 'gl-matrix';

function createLightSpaceMatrix(
  lightPosition: vec3,
  lightTarget: vec3,
  orthoSize: number,
  nearPlane: number,
  farPlane: number
): mat4 {
  // 1. Matrice de vue de la lumiere
  const lightView = mat4.create();
  mat4.lookAt(lightView, lightPosition, lightTarget, [0, 1, 0]);

  // 2. Projection orthographique (directional light)
  const lightProjection = mat4.create();
  mat4.ortho(
    lightProjection,
    -orthoSize, orthoSize,   // left, right
    -orthoSize, orthoSize,   // bottom, top
    nearPlane, farPlane       // near, far
  );

  // 3. Combiner : lightSpaceMatrix = projection * view
  const lightSpaceMatrix = mat4.create();
  mat4.multiply(lightSpaceMatrix, lightProjection, lightView);

  return lightSpaceMatrix;
}
```

---

## La shadow map : une texture de profondeur

### Qu'est-ce qu'une depth map ?

La shadow map est simplement une **texture de profondeur** (depth texture). Chaque pixel stocke la distance entre la lumiere et le premier objet rencontre dans cette direction.

```
Shadow Map (vue depuis la lumiere)
┌─────────────────────────┐
│ 0.3  0.3  0.3  0.8  0.8│   Valeurs de profondeur
│ 0.3  0.3  0.3  0.8  0.8│   (normalisees entre 0 et 1)
│ 0.5  0.5  0.3  0.8  0.8│
│ 0.5  0.5  0.5  0.8  0.8│   0.3 = objet proche de la lumiere
│ 0.8  0.8  0.8  0.8  0.8│   0.8 = sol (plus loin)
└─────────────────────────┘
```

### Creation de la shadow map en WebGPU

```typescript
// Configuration de la texture de profondeur pour la shadow map
const SHADOW_MAP_SIZE = 2048; // Resolution de la shadow map

const shadowMapTexture = device.createTexture({
  label: 'Shadow Map Depth Texture',
  size: {
    width: SHADOW_MAP_SIZE,
    height: SHADOW_MAP_SIZE,
    depthOrArrayLayers: 1,
  },
  format: 'depth32float',
  usage:
    GPUTextureUsage.RENDER_ATTACHMENT | // Pour ecrire dedans lors de la shadow pass
    GPUTextureUsage.TEXTURE_BINDING,    // Pour lire dans le fragment shader
});

const shadowMapView = shadowMapTexture.createView({
  label: 'Shadow Map View',
});

// Sampler de comparaison pour le shadow mapping
const shadowSampler = device.createSampler({
  label: 'Shadow Comparison Sampler',
  compare: 'less',      // Retourne 1.0 si sampleDepth < refDepth, 0.0 sinon
  magFilter: 'linear',  // Permet le PCF hardware
  minFilter: 'linear',
});
```

---

## Implementation WebGPU : shadow pass

### Le vertex shader de la shadow pass

La shadow pass ne rend que la profondeur — pas besoin de fragment shader complexe.

```wgsl
// shadow.vert.wgsl — Vertex shader pour la shadow pass

struct LightUniforms {
  lightSpaceMatrix: mat4x4f,
};

struct ModelUniforms {
  modelMatrix: mat4x4f,
};

@group(0) @binding(0) var<uniform> light: LightUniforms;
@group(1) @binding(0) var<uniform> model: ModelUniforms;

struct VertexInput {
  @location(0) position: vec3f,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4f,
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Transformer la position dans l'espace de la lumiere
  let worldPosition = model.modelMatrix * vec4f(input.position, 1.0);
  output.clipPosition = light.lightSpaceMatrix * worldPosition;

  return output;
}
```

```wgsl
// shadow.frag.wgsl — Fragment shader minimaliste
// On n'ecrit rien : le depth buffer se remplit automatiquement

@fragment
fn main() {
  // Pas de sortie couleur necessaire
  // Le hardware ecrit la profondeur dans le depth attachment
}
```

### Le render pass descriptor pour les ombres

```typescript
function createShadowPassDescriptor(
  shadowMapView: GPUTextureView
): GPURenderPassDescriptor {
  return {
    label: 'Shadow Render Pass',
    // Pas de color attachment ! On ne rend que la profondeur
    colorAttachments: [],
    depthStencilAttachment: {
      view: shadowMapView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };
}

// Pipeline pour la shadow pass
const shadowPipeline = device.createRenderPipeline({
  label: 'Shadow Pipeline',
  layout: shadowPipelineLayout,
  vertex: {
    module: device.createShaderModule({ code: shadowVertWGSL }),
    entryPoint: 'main',
    buffers: [
      {
        arrayStride: 3 * 4, // vec3f = 12 bytes
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
        ],
      },
    ],
  },
  // Pas de fragment stage ! Uniquement le depth
  depthStencil: {
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  primitive: {
    topology: 'triangle-list',
    cullMode: 'front', // Cull front faces pour reduire le shadow acne
  },
});
```

---

## Implementation WebGPU : render pass avec ombres

### Le fragment shader principal

```wgsl
// main.frag.wgsl — Fragment shader avec shadow sampling

struct CameraUniforms {
  viewProjection: mat4x4f,
  cameraPosition: vec3f,
};

struct LightUniforms {
  lightSpaceMatrix: mat4x4f,
  lightDirection: vec3f,
  lightColor: vec3f,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> light: LightUniforms;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSampler: sampler_comparison;

struct FragmentInput {
  @location(0) worldPosition: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) uv: vec2f,
};

// Calculer si un fragment est dans l'ombre
fn calculateShadow(worldPosition: vec3f, normal: vec3f) -> f32 {
  // 1. Projeter dans l'espace de la lumiere
  let lightSpacePos = light.lightSpaceMatrix * vec4f(worldPosition, 1.0);

  // 2. Perspective divide → NDC [-1, 1]
  let ndc = lightSpacePos.xyz / lightSpacePos.w;

  // 3. Convertir en coordonnees de texture [0, 1]
  //    NDC.x: [-1,1] → [0,1]   NDC.y: [-1,1] → [1,0] (y inverse)
  let shadowCoord = vec2f(
    ndc.x * 0.5 + 0.5,
    ndc.y * -0.5 + 0.5
  );

  // 4. Verifier qu'on est dans la shadow map
  if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
      shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
      ndc.z < 0.0 || ndc.z > 1.0) {
    return 1.0; // Hors de la shadow map → pas d'ombre
  }

  // 5. Bias pour eviter le shadow acne
  let bias = max(0.005 * (1.0 - dot(normal, -light.lightDirection)), 0.001);
  let currentDepth = ndc.z - bias;

  // 6. Comparaison avec la shadow map
  //    textureSampleCompare retourne 0.0 (dans l'ombre) ou 1.0 (eclaire)
  let shadow = textureSampleCompare(
    shadowMap,
    shadowSampler,
    shadowCoord,
    currentDepth
  );

  return shadow;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let normal = normalize(input.worldNormal);

  // Eclairage diffus
  let NdotL = max(dot(normal, -light.lightDirection), 0.0);
  let diffuse = light.lightColor * NdotL;

  // Ombre
  let shadow = calculateShadow(input.worldPosition, normal);

  // Couleur de base (albedo)
  let albedo = vec3f(0.8, 0.8, 0.8);

  // Combiner : ambient + diffuse * shadow
  let ambient = vec3f(0.15);
  let finalColor = albedo * (ambient + diffuse * shadow);

  return vec4f(finalColor, 1.0);
}
```

---

## Shadow acne et peter panning

### Le probleme du shadow acne

Le shadow acne est un artefact visuel extremement courant en shadow mapping. Il se manifeste par des motifs de bandes noires (moiree) sur les surfaces eclairees.

```
Shadow acne (vue de dessus d'une surface)
┌─────────────────────────────────────┐
│ ░░██░░██░░██░░██░░██░░██░░██░░██░░ │
│ ░░██░░██░░██░░██░░██░░██░░██░░██░░ │  Motif en bandes
│ ░░██░░██░░██░░██░░██░░██░░██░░██░░ │  = shadow acne
│ ░░██░░██░░██░░██░░██░░██░░██░░██░░ │
└─────────────────────────────────────┘

Cause :
                    Shadow map texels
    Lumiere ─────►  ┌──┬──┬──┬──┬──┐
                    │  │  │  │  │  │
        Surface ────┼──┼──┼──┼──┼──┼──── Surface inclinee
                    │  │  │  │  │  │
                    └──┴──┴──┴──┴──┘

  Chaque texel de la shadow map couvre une zone de la surface.
  A cause de la discretisation, certains fragments pensent
  qu'ils sont DERRIERE la surface → ombre fausse.
```

### Le bias : la solution

```wgsl
// Bias constant
let bias = 0.005;

// Bias adaptatif (meilleur) : plus de bias quand la surface
// est inclinee par rapport a la lumiere
let cosTheta = dot(normal, -lightDirection);
let bias = max(0.005 * (1.0 - cosTheta), 0.001);

// Bias constant + normal bias (encore meilleur)
let constantBias = 0.002;
let normalBias = 0.02;
let biasedPosition = worldPosition + normal * normalBias;
// Puis utiliser biasedPosition pour le calcul de la shadow coord
```

### Le peter panning

Trop de bias cause un autre probleme : le **peter panning**. L'ombre se detache de l'objet, comme si l'objet flottait (comme Peter Pan).

```
Sans bias (shadow acne) :      Trop de bias (peter panning) :
┌──────────┐                   ┌──────────┐
│  Objet   │                   │  Objet   │
└──────────┘                   └──────────┘
███████████████                          ██████████████
  Ombre collee                   Ombre decalee (l'objet "flotte")
```

**Solution equilibree :** combiner un petit constant bias avec un normal bias, et utiliser le front-face culling dans la shadow pass.

```typescript
// Cull front faces pendant la shadow pass
// Cela utilise les back faces pour le depth → reduit le shadow acne
primitive: {
  cullMode: 'front', // Shadow pass : cull front
}

// Cull back faces pendant le render pass (normal)
primitive: {
  cullMode: 'back', // Render pass : cull back (par defaut)
}
```

---

## PCF — Percentage Closer Filtering

### Le probleme des ombres dures

Un seul echantillon de la shadow map produit des **ombres dures** (hard shadows) avec des bords creneles. En realite, les ombres ont des bords doux (penombre).

### L'idee du PCF

Au lieu d'un seul echantillon, on prend **plusieurs echantillons** autour du point et on fait la **moyenne** :

```
  PCF 3x3 : echantillonner 9 points autour du fragment

  ┌───┬───┬───┐
  │ 1 │ 0 │ 0 │     1 = eclaire, 0 = ombre
  ├───┼───┼───┤
  │ 1 │ 1 │ 0 │     Moyenne = 4/9 ≈ 0.44
  ├───┼───┼───┤
  │ 1 │ 0 │ 0 │     → Le fragment est partiellement eclaire
  └───┴───┴───┘
```

### Implementation WGSL

```wgsl
fn calculateShadowPCF(worldPosition: vec3f, normal: vec3f) -> f32 {
  let lightSpacePos = light.lightSpaceMatrix * vec4f(worldPosition, 1.0);
  let ndc = lightSpacePos.xyz / lightSpacePos.w;
  let shadowCoord = vec2f(
    ndc.x * 0.5 + 0.5,
    ndc.y * -0.5 + 0.5
  );

  if (shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
      shadowCoord.y < 0.0 || shadowCoord.y > 1.0) {
    return 1.0;
  }

  let bias = max(0.005 * (1.0 - dot(normal, -light.lightDirection)), 0.001);
  let currentDepth = ndc.z - bias;

  // Taille d'un texel dans la shadow map
  let texelSize = 1.0 / f32(textureDimensions(shadowMap).x);

  // PCF 5x5 : echantillonner une grille de 5x5 autour du point
  var shadow = 0.0;
  let halfKernel = 2; // 5x5 → de -2 a +2

  for (var x = -halfKernel; x <= halfKernel; x++) {
    for (var y = -halfKernel; y <= halfKernel; y++) {
      let offset = vec2f(f32(x), f32(y)) * texelSize;
      shadow += textureSampleCompare(
        shadowMap,
        shadowSampler,
        shadowCoord + offset,
        currentDepth
      );
    }
  }

  // Moyenne des 25 echantillons
  let kernelSize = f32((halfKernel * 2 + 1) * (halfKernel * 2 + 1));
  shadow /= kernelSize;

  return shadow;
}
```

### PCF avec un pattern de Poisson (meilleure qualite)

```wgsl
// Disque de Poisson : points pseudo-aleatoires bien distribues
const POISSON_DISK = array<vec2f, 16>(
  vec2f(-0.94201624, -0.39906216),
  vec2f( 0.94558609, -0.76890725),
  vec2f(-0.09418410, -0.92938870),
  vec2f( 0.34495938,  0.29387760),
  vec2f(-0.91588581,  0.45771432),
  vec2f(-0.81544232, -0.87912464),
  vec2f(-0.38277543,  0.27676845),
  vec2f( 0.97484398,  0.75648379),
  vec2f( 0.44323325, -0.97511554),
  vec2f( 0.53742981, -0.47373420),
  vec2f(-0.26496911, -0.41893023),
  vec2f( 0.79197514,  0.19090188),
  vec2f(-0.24188840,  0.99706507),
  vec2f(-0.81409955,  0.91437590),
  vec2f( 0.19984126,  0.78641367),
  vec2f( 0.14383161, -0.14100790),
);

fn calculateShadowPoisson(worldPosition: vec3f, normal: vec3f) -> f32 {
  // ... meme projection que precedemment ...
  let shadowCoord = /* ... */;
  let currentDepth = /* ... */;

  let texelSize = 1.0 / f32(textureDimensions(shadowMap).x);
  let spreadRadius = 2.5; // Taille du noyau en texels

  var shadow = 0.0;
  for (var i = 0u; i < 16u; i++) {
    let offset = POISSON_DISK[i] * texelSize * spreadRadius;
    shadow += textureSampleCompare(
      shadowMap,
      shadowSampler,
      shadowCoord + offset,
      currentDepth
    );
  }

  return shadow / 16.0;
}
```

---

## Cascaded Shadow Maps (CSM)

### Le probleme de la resolution

Pour les grandes scenes exterieures, une seule shadow map ne suffit pas. La resolution est gaspillee sur les objets lointains qui n'ont pas besoin de detail.

```
Camera frustum (vue de dessus) :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Camera ◄──┐
             │
        ┌────┤
        │    │    Pres de la camera :
        │ C1 │    haute resolution necessaire
        │    │
        ├────┤
        │    │
        │ C2 │    Distance moyenne :
        │    │    resolution moyenne
        │    │
        ├────┤
        │         │
        │   C3    │    Loin :
        │         │    basse resolution acceptable
        │         │
        └─────────┘

  C1, C2, C3 = 3 "cascades", chacune avec sa propre shadow map
```

### Principe des CSM

```typescript
interface CascadeConfig {
  splits: number[];     // Distances de decoupe du frustum
  mapSize: number;      // Resolution de chaque cascade
  blendRegion: number;  // Zone de transition entre cascades
}

// Decoupe typique du frustum en 4 cascades
const cascadeConfig: CascadeConfig = {
  splits: [0.0, 0.05, 0.15, 0.5, 1.0], // Pourcentage du far plane
  mapSize: 2048,
  blendRegion: 0.1,
};

function calculateCascadeSplits(
  nearPlane: number,
  farPlane: number,
  numCascades: number,
  lambda: number = 0.75 // Melange lineaire/logarithmique
): number[] {
  const splits: number[] = [];
  const ratio = farPlane / nearPlane;

  for (let i = 0; i <= numCascades; i++) {
    const p = i / numCascades;

    // Repartition logarithmique (plus de detail pres de la camera)
    const logSplit = nearPlane * Math.pow(ratio, p);

    // Repartition lineaire
    const linearSplit = nearPlane + (farPlane - nearPlane) * p;

    // Melange des deux
    splits.push(lambda * logSplit + (1 - lambda) * linearSplit);
  }

  return splits;
}

// Pour chaque cascade, calculer la matrice light-space
function calculateCascadeMatrix(
  cascade: number,
  splits: number[],
  cameraView: mat4,
  cameraProjection: mat4,
  lightDirection: vec3
): mat4 {
  const near = splits[cascade];
  const far = splits[cascade + 1];

  // 1. Calculer les 8 coins du sous-frustum
  const frustumCorners = getFrustumCornersWorldSpace(
    cameraProjection, cameraView, near, far
  );

  // 2. Centre du frustum
  const center = frustumCorners.reduce((acc, c) =>
    vec3.add(acc, acc, c), vec3.create()
  );
  vec3.scale(center, center, 1 / 8);

  // 3. Matrice de vue de la lumiere centree sur le frustum
  const lightView = mat4.create();
  const eye = vec3.scaleAndAdd(vec3.create(), center, lightDirection, -1);
  mat4.lookAt(lightView, eye, center, [0, 1, 0]);

  // 4. Trouver la bounding box en light space
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const corner of frustumCorners) {
    const lightSpaceCorner = vec3.transformMat4(vec3.create(), corner, lightView);
    minX = Math.min(minX, lightSpaceCorner[0]);
    maxX = Math.max(maxX, lightSpaceCorner[0]);
    minY = Math.min(minY, lightSpaceCorner[1]);
    maxY = Math.max(maxY, lightSpaceCorner[1]);
    minZ = Math.min(minZ, lightSpaceCorner[2]);
    maxZ = Math.max(maxZ, lightSpaceCorner[2]);
  }

  // 5. Projection orthographique ajustee
  const lightProjection = mat4.create();
  mat4.ortho(lightProjection, minX, maxX, minY, maxY, minZ, maxZ);

  const lightSpaceMatrix = mat4.create();
  mat4.multiply(lightSpaceMatrix, lightProjection, lightView);

  return lightSpaceMatrix;
}
```

### Selection de la cascade dans le shader

```wgsl
struct CascadeUniforms {
  matrices: array<mat4x4f, 4>,  // Light-space matrix par cascade
  splits: vec4f,                 // Distances de split (view space z)
  cascadeCount: u32,
};

@group(0) @binding(4) var<uniform> cascades: CascadeUniforms;
@group(0) @binding(5) var shadowMapArray: texture_depth_2d_array;

fn getCascadeIndex(viewSpaceZ: f32) -> u32 {
  for (var i = 0u; i < cascades.cascadeCount; i++) {
    if (viewSpaceZ < cascades.splits[i]) {
      return i;
    }
  }
  return cascades.cascadeCount - 1u;
}

fn calculateShadowCSM(worldPosition: vec3f, viewSpaceZ: f32, normal: vec3f) -> f32 {
  let cascadeIndex = getCascadeIndex(viewSpaceZ);
  let lightSpacePos = cascades.matrices[cascadeIndex] * vec4f(worldPosition, 1.0);
  let ndc = lightSpacePos.xyz / lightSpacePos.w;
  let shadowCoord = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);

  let bias = max(0.003 * (1.0 - dot(normal, -light.lightDirection)), 0.0005);

  return textureSampleCompare(
    shadowMapArray,
    shadowSampler,
    shadowCoord,
    cascadeIndex,        // Couche de l'array texture
    ndc.z - bias
  );
}
```

---

## Variance Shadow Maps (VSM)

### Principe

Les VSM stockent non seulement la profondeur, mais aussi la **profondeur au carre**. Cela permet d'appliquer un **flou gaussien** sur la shadow map (impossible avec le shadow mapping standard).

```wgsl
// VSM fragment shader — stocke depth et depth^2
@fragment
fn vsmShadowPass(@builtin(position) fragCoord: vec4f) -> @location(0) vec2f {
  let depth = fragCoord.z;
  return vec2f(depth, depth * depth);
}

// VSM lookup — utilise l'inegalite de Chebyshev
fn calculateShadowVSM(shadowCoord: vec2f, currentDepth: f32) -> f32 {
  // Lire les moments (mean depth, mean depth^2)
  let moments = textureSample(vsmShadowMap, linearSampler, shadowCoord).xy;

  let mean = moments.x;      // E(x)
  let meanSq = moments.y;    // E(x^2)

  // Si le fragment est plus proche que la moyenne, il est eclaire
  if (currentDepth <= mean) {
    return 1.0;
  }

  // Variance = E(x^2) - E(x)^2
  let variance = max(meanSq - mean * mean, 0.0001);

  // Inegalite de Chebyshev
  let d = currentDepth - mean;
  let pMax = variance / (variance + d * d);

  // Clamper pour eviter le light bleeding
  return smoothstep(0.3, 1.0, pMax);
}
```

### Avantages et inconvenients

| Aspect | Shadow Map classique | VSM |
|--------|---------------------|-----|
| **Filtrage** | Pas de blur possible (compare avant filtre) | Blur gaussien OK (filtre avant compare) |
| **Performance** | Moins de memoire | 2 canaux (RG) + passes de blur |
| **Qualite** | Hard edges sans PCF | Ombres naturellement douces |
| **Artefact** | Shadow acne | Light bleeding (halo lumineux) |
| **Resolution** | Sensible a la taille | Moins sensible grace au blur |

---

## Point light shadows : cubemap

### 6 faces pour un point light

Un point light eclaire dans **toutes les directions**. On a besoin de 6 shadow maps, une pour chaque face d'un cube :

```
        ┌─────┐
        │ +Y  │
        │ Top │
  ┌─────┼─────┼─────┬─────┐
  │ -X  │ +Z  │ +X  │ -Z  │
  │Left │Front│Right│Back │
  └─────┼─────┼─────┴─────┘
        │ -Y  │
        │ Bot │
        └─────┘

  6 render passes avec projection perspective (fov = 90°)
```

```typescript
function createPointLightShadowViews(lightPosition: vec3): mat4[] {
  const views: mat4[] = [];
  const targets: [vec3, vec3][] = [
    [[1, 0, 0],  [0, -1, 0]], // +X
    [[-1, 0, 0], [0, -1, 0]], // -X
    [[0, 1, 0],  [0, 0, 1]],  // +Y
    [[0, -1, 0], [0, 0, -1]], // -Y
    [[0, 0, 1],  [0, -1, 0]], // +Z
    [[0, 0, -1], [0, -1, 0]], // -Z
  ];

  const projection = mat4.create();
  mat4.perspective(projection, Math.PI / 2, 1.0, 0.1, 100.0); // fov=90°, aspect=1

  for (const [dir, up] of targets) {
    const target = vec3.add(vec3.create(), lightPosition, dir as vec3);
    const view = mat4.create();
    mat4.lookAt(view, lightPosition, target, up as vec3);

    const viewProj = mat4.create();
    mat4.multiply(viewProj, projection, view);
    views.push(viewProj);
  }

  return views;
}
```

```wgsl
// Echantillonner un cube shadow map
fn calculatePointShadow(
  worldPosition: vec3f,
  lightPosition: vec3f,
  farPlane: f32
) -> f32 {
  let lightToFrag = worldPosition - lightPosition;
  let currentDepth = length(lightToFrag) / farPlane; // Normaliser

  // textureSampleCompare avec une texture cube
  let shadow = textureSampleCompare(
    pointShadowMap,       // texture_depth_cube
    shadowSampler,
    lightToFrag,          // Direction (selecteur de face automatique)
    currentDepth - 0.005  // Avec bias
  );

  return shadow;
}
```

---

## Spot light shadows

Les spot lights utilisent une **projection perspective** avec un angle de cone :

```typescript
function createSpotLightShadowMatrix(
  position: vec3,
  direction: vec3,
  outerConeAngle: number, // En radians
  nearPlane: number,
  farPlane: number
): mat4 {
  const view = mat4.create();
  const target = vec3.add(vec3.create(), position, direction);
  mat4.lookAt(view, position, target, [0, 1, 0]);

  // Projection perspective avec le cone angle
  const projection = mat4.create();
  mat4.perspective(projection, outerConeAngle * 2, 1.0, nearPlane, farPlane);

  const viewProj = mat4.create();
  mat4.multiply(viewProj, projection, view);
  return viewProj;
}
```

---

## PCSS — Percentage Closer Soft Shadows

### Ombres douces realistes

En realite, les ombres sont plus nettes pres de l'objet qui les projette et plus floues plus loin. Le PCSS simule ca.

```
  Lumiere (etendue)
  ┌─────────┐
  │ ░░░░░░░ │
  └────┬────┘
       │
    ┌──┴──┐       Occluder (objet)
    │█████│
    └──┬──┘
       │
  ─────┼────────────── Surface receptrice
       │
  ████████████████████ Ombre nette (pres de l'occluder)
   ░░░░░░░░░░░░░░░░░  Penombre (loin de l'occluder)
    ░░░░░░░░░░░░░░░
```

### Implementation

```wgsl
fn calculatePCSS(worldPosition: vec3f, normal: vec3f) -> f32 {
  let lightSpacePos = light.lightSpaceMatrix * vec4f(worldPosition, 1.0);
  let ndc = lightSpacePos.xyz / lightSpacePos.w;
  let shadowCoord = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);
  let currentDepth = ndc.z;
  let texelSize = 1.0 / f32(textureDimensions(shadowMap).x);

  // Etape 1 : Blocker search — trouver la profondeur moyenne des occluders
  let lightSize = 0.04; // Taille apparente de la lumiere
  let searchRadius = lightSize * currentDepth / light.nearPlane;

  var blockerSum = 0.0;
  var blockerCount = 0.0;

  for (var i = 0u; i < 16u; i++) {
    let offset = POISSON_DISK[i] * searchRadius;
    let sampleDepth = textureSample(
      shadowMapDepth, nearestSampler, shadowCoord + offset
    );
    if (sampleDepth < currentDepth) {
      blockerSum += sampleDepth;
      blockerCount += 1.0;
    }
  }

  // Pas de bloqueur → entierement eclaire
  if (blockerCount == 0.0) {
    return 1.0;
  }

  let avgBlockerDepth = blockerSum / blockerCount;

  // Etape 2 : Estimer la taille de la penombre
  let penumbraSize = lightSize * (currentDepth - avgBlockerDepth) / avgBlockerDepth;

  // Etape 3 : PCF avec un rayon proportionnel a la penombre
  var shadow = 0.0;
  for (var i = 0u; i < 16u; i++) {
    let offset = POISSON_DISK[i] * penumbraSize * texelSize;
    shadow += textureSampleCompare(
      shadowMap, shadowSampler, shadowCoord + offset, currentDepth - 0.002
    );
  }

  return shadow / 16.0;
}
```

---

## Contact shadows (screen-space)

Les contact shadows ajoutent des petites ombres de contact en post-processing, la ou le shadow mapping manque de resolution.

```wgsl
// Ray march dans le depth buffer pour trouver des occluders proches
fn contactShadow(
  viewPosition: vec3f,
  lightDirView: vec3f,
  depthBuffer: texture_2d<f32>,
  projMatrix: mat4x4f
) -> f32 {
  let stepCount = 16u;
  let maxDistance = 0.5; // Distance max en view space
  let stepSize = maxDistance / f32(stepCount);

  var rayPos = viewPosition;
  let rayDir = normalize(-lightDirView);

  for (var i = 0u; i < stepCount; i++) {
    rayPos += rayDir * stepSize;

    // Projeter le point dans l'ecran
    let clipPos = projMatrix * vec4f(rayPos, 1.0);
    let ndc = clipPos.xyz / clipPos.w;
    let screenUV = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);

    // Verifier les limites
    if (screenUV.x < 0.0 || screenUV.x > 1.0 ||
        screenUV.y < 0.0 || screenUV.y > 1.0) {
      break;
    }

    // Comparer avec le depth buffer
    let sceneDepth = textureSample(depthBuffer, nearestSampler, screenUV).r;
    let rayDepth = -rayPos.z; // View space Z est negatif

    if (rayDepth > sceneDepth && rayDepth - sceneDepth < 0.05) {
      // On a touche quelque chose → ombre de contact
      let fadeOut = 1.0 - f32(i) / f32(stepCount);
      return 1.0 - fadeOut;
    }
  }

  return 1.0; // Pas d'occlusion
}
```

---

## Implementation Three.js

### Shadow mapping avec Three.js

Three.js gere les ombres avec tres peu de code grace a son systeme integre :

```typescript
import * as THREE from 'three';

// 1. Activer les ombres sur le renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // PCF doux

// Types disponibles :
// THREE.BasicShadowMap      — pas de filtrage (rapide mais dur)
// THREE.PCFShadowMap        — PCF standard (defaut)
// THREE.PCFSoftShadowMap    — PCF avec flou (recommande)
// THREE.VSMShadowMap        — Variance Shadow Map

// 2. Configurer la lumiere
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;

// 3. Configurer la shadow camera (frustum de la lumiere)
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -15;
directionalLight.shadow.camera.right = 15;
directionalLight.shadow.camera.top = 15;
directionalLight.shadow.camera.bottom = -15;

// 4. Bias
directionalLight.shadow.bias = -0.002;
directionalLight.shadow.normalBias = 0.02;

// 5. Rayon du PCF (PCFSoftShadowMap)
directionalLight.shadow.radius = 4;

scene.add(directionalLight);

// 6. Les objets doivent declarer qu'ils projettent / recoivent des ombres
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ color: 0x4488ff })
);
cube.castShadow = true;    // Projette des ombres
cube.receiveShadow = true; // Recoit des ombres
scene.add(cube);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x888888 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true; // Le sol recoit des ombres
scene.add(floor);

// 7. Visualiser la shadow camera (debug)
const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
scene.add(shadowHelper);
```

### CSM avec Three.js (addon)

```typescript
import { CSM } from 'three/addons/csm/CSM.js';
import { CSMHelper } from 'three/addons/csm/CSMHelper.js';

// Creer le CSM
const csm = new CSM({
  maxFar: camera.far,
  cascades: 4,
  mode: 'logarithmic', // 'uniform', 'logarithmic', 'custom'
  parent: scene,
  shadowMapSize: 2048,
  lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
  camera: camera,
});

// Appliquer aux materiaux
const material = new THREE.MeshStandardMaterial({ color: 0x8844aa });
csm.setupMaterial(material); // Injecte les uniforms CSM

// Mettre a jour a chaque frame
function animate() {
  requestAnimationFrame(animate);
  csm.update(); // Recalcule les cascades
  renderer.render(scene, camera);
}

// Helper pour debug
const csmHelper = new CSMHelper(csm);
scene.add(csmHelper);
```

### Point light et spot light shadows

```typescript
// Point light avec ombres (cubemap automatique)
const pointLight = new THREE.PointLight(0xff8844, 100, 30);
pointLight.position.set(0, 5, 0);
pointLight.castShadow = true;
pointLight.shadow.mapSize.set(1024, 1024);
pointLight.shadow.camera.near = 0.5;
pointLight.shadow.camera.far = 30;
pointLight.shadow.bias = -0.005;
scene.add(pointLight);

// Spot light avec ombres (frustum perspective)
const spotLight = new THREE.SpotLight(0xffffff, 200, 20, Math.PI / 6);
spotLight.position.set(5, 10, 5);
spotLight.castShadow = true;
spotLight.shadow.mapSize.set(2048, 2048);
spotLight.shadow.camera.near = 0.5;
spotLight.shadow.camera.far = 20;
spotLight.shadow.bias = -0.002;
scene.add(spotLight);

// Spot light helper
const spotHelper = new THREE.SpotLightHelper(spotLight);
scene.add(spotHelper);
```

---

## Exercice pratique

### Exercice SM.1 — Shadow mapping basique en WebGPU

Complete le code suivant pour implementer un shadow mapping basique. Tu dois :
1. Creer la texture de profondeur pour la shadow map
2. Configurer le render pass de la shadow pass
3. Ecrire la comparaison dans le fragment shader

```typescript
// Partie TypeScript — Setup
function setupShadowMap(device: GPUDevice) {
  const SHADOW_SIZE = 2048;

  // TODO: Creer la shadow map texture (format depth32float)
  const shadowTexture = device.createTexture({
    size: { width: ???, height: ???, depthOrArrayLayers: 1 },
    format: ???,
    usage: ???,
  });

  // TODO: Creer le sampler de comparaison
  const sampler = device.createSampler({
    compare: ???,
    magFilter: 'linear',
    minFilter: 'linear',
  });

  return { shadowTexture, sampler };
}
```

```wgsl
// Partie WGSL — Fragment shader
fn shadowLookup(worldPos: vec3f, lightMatrix: mat4x4f) -> f32 {
  // TODO: Projeter worldPos dans l'espace de la lumiere
  let lightClip = ???;

  // TODO: Perspective divide
  let ndc = ???;

  // TODO: Convertir en UV [0, 1]
  let uv = vec2f(???, ???);

  // TODO: Comparer avec la shadow map
  let shadow = textureSampleCompare(???, ???, ???, ???);

  return shadow;
}
```

<details>
<summary>Solution</summary>

```typescript
function setupShadowMap(device: GPUDevice) {
  const SHADOW_SIZE = 2048;

  const shadowTexture = device.createTexture({
    size: { width: SHADOW_SIZE, height: SHADOW_SIZE, depthOrArrayLayers: 1 },
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  const sampler = device.createSampler({
    compare: 'less',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  return { shadowTexture, sampler };
}
```

```wgsl
fn shadowLookup(worldPos: vec3f, lightMatrix: mat4x4f) -> f32 {
  let lightClip = lightMatrix * vec4f(worldPos, 1.0);
  let ndc = lightClip.xyz / lightClip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 1.0;
  }

  let bias = 0.003;
  let shadow = textureSampleCompare(
    shadowMap,
    shadowSampler,
    uv,
    ndc.z - bias
  );

  return shadow;
}
```
</details>

---

### Exercice SM.2 — Ajouter le PCF 3x3

En partant de la solution precedente, ajoute un filtre PCF 3x3 pour adoucir les bords des ombres.

```wgsl
fn shadowLookupPCF(worldPos: vec3f, lightMatrix: mat4x4f) -> f32 {
  let lightClip = lightMatrix * vec4f(worldPos, 1.0);
  let ndc = lightClip.xyz / lightClip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);
  let bias = 0.003;

  // TODO: Calculer la taille d'un texel
  let texelSize = ???;

  // TODO: Boucle PCF 3x3 (de -1 a +1 sur x et y)
  var shadow = 0.0;
  // ???

  return shadow;
}
```

<details>
<summary>Solution</summary>

```wgsl
fn shadowLookupPCF(worldPos: vec3f, lightMatrix: mat4x4f) -> f32 {
  let lightClip = lightMatrix * vec4f(worldPos, 1.0);
  let ndc = lightClip.xyz / lightClip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);
  let bias = 0.003;

  let texelSize = 1.0 / f32(textureDimensions(shadowMap).x);

  var shadow = 0.0;
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      let offset = vec2f(f32(x), f32(y)) * texelSize;
      shadow += textureSampleCompare(
        shadowMap,
        shadowSampler,
        uv + offset,
        ndc.z - bias
      );
    }
  }

  return shadow / 9.0; // 3x3 = 9 echantillons
}
```
</details>

---

### Exercice SM.3 — Ombres dans Three.js

Configure une scene Three.js avec une directional light, un sol, et 3 cubes qui projettent des ombres. Utilise `PCFSoftShadowMap`.

```typescript
// TODO: Creer le renderer avec ombres activees
// TODO: Creer la lumiere avec shadow camera configuree
// TODO: Creer 3 cubes (castShadow) et un sol (receiveShadow)
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Scene + Camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(8, 8, 8);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);

// Lumiere directionnelle
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 15, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.002;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x404040));

// Sol
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// 3 Cubes
const colors = [0xff4444, 0x44ff44, 0x4444ff];
const positions = [[-2, 1, 0], [0, 1.5, -2], [2, 0.75, 1]];
const sizes = [2, 3, 1.5];

colors.forEach((color, i) => {
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(sizes[i], sizes[i], sizes[i]),
    new THREE.MeshStandardMaterial({ color })
  );
  cube.position.set(...(positions[i] as [number, number, number]));
  cube.castShadow = true;
  cube.receiveShadow = true;
  scene.add(cube);
});

// Animation
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
```
</details>

---

## Resume

| Technique | Usage | Passe(s) | Qualite | Performance |
|-----------|-------|----------|---------|-------------|
| **Shadow Map basique** | Ombres dures simples | 2 (shadow + render) | Basse (aliasing) | Excellente |
| **PCF** | Anti-aliasing des ombres | 2 | Moyenne (bords doux) | Bonne |
| **Poisson PCF** | Meilleur anti-aliasing | 2 | Bonne | Bonne |
| **CSM** | Grandes scenes, directional light | N+1 (N cascades + render) | Haute | Moyenne |
| **VSM** | Ombres floues | 2 + blur passes | Bonne (light bleeding) | Moyenne |
| **PCSS** | Ombres realistes (penombre variable) | 2 | Tres haute | Couteuse |
| **Point shadows** | Point lights | 6 + render | Haute | Couteuse (6 passes) |
| **Contact shadows** | Details fins screen-space | Post-process | Complement | Moyenne |

| Probleme | Cause | Solution |
|----------|-------|----------|
| **Shadow acne** | Discretisation de la shadow map | Bias + normal bias + front-face culling |
| **Peter panning** | Bias trop eleve | Reduire le bias, utiliser normal bias |
| **Aliasing** | Resolution insuffisante de la shadow map | PCF, augmenter la resolution, CSM |
| **Shadow swimming** | Mouvement de la camera change les cascades | Snapping des cascades sur les texels |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [17 - Performance et optimisation](./17-performance-optimisation.md) | [19 - Shaders creatifs et procedural](./19-shaders-creatifs.md) |

**Ressources associees :**
- [Lab 18 — Shadow mapping](../labs/lab-18-shadow-mapping/)
- [Quiz 18 — Shadow mapping](../quizzes/quiz-18-shadow-mapping.html)
