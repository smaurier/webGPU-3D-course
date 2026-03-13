# Module 10 — Render pipeline et bind groups

| Difficulte | Duree estimee | Lab | Quiz |
|------------|---------------|-----|------|
| 4/5        | 120 min       | [Lab 10](../labs/lab-10-render-pipeline/) | [Quiz 10](../quizzes/quiz-10-pipeline.html) |

## Objectifs

- Comprendre la structure complete d'un GPURenderPipeline
- Configurer les vertex buffers avec GPUVertexBufferLayout
- Maitriser les bind groups et bind group layouts
- Creer et mettre a jour des uniform buffers et storage buffers
- Binder des textures et des samplers aux shaders
- Configurer le depth-stencil et le multisampling (MSAA)
- Encoder un render pass complet avec toutes ses etapes
- Comprendre la difference fondamentale entre les bindings WebGL et WebGPU

---

<details>
<summary>Rappel du cours precedent (Module 09 — WebGPU architecture et WGSL)</summary>

Dans le module 09, nous avons decouvert :
- Le paradigme command-based de WebGPU vs la state machine de WebGL
- L'initialisation : `navigator.gpu` → `requestAdapter()` → `requestDevice()`
- La configuration du canvas avec `context.configure({ device, format })`
- La syntaxe WGSL : types (`vec4f`, `mat4x4f`), decorateurs (`@vertex`, `@fragment`, `@location`, `@group`, `@binding`)
- Un premier triangle avec un pipeline minimal et un shader inline
- La gestion d'erreurs : `device.lost`, `pushErrorScope` / `popErrorScope`

Dans ce module, nous allons approfondir le coeur du rendu WebGPU : le render pipeline et le systeme de bind groups qui remplace les appels `gl.bindTexture`, `gl.uniformMatrix4fv`, etc. de WebGL.

</details>

---

## GPURenderPipeline : vue d'ensemble

### L'analogie de la chaine de montage

Pensez au render pipeline comme une chaine de montage dans une usine automobile :

- **Vertex stage** = l'atelier de decoupe : transforme la matiere brute (vertices) en pieces positionnees
- **Primitive assembly + rasterization** = l'atelier d'assemblage : assemble les pieces en formes (triangles) et les decoupe aux dimensions
- **Fragment stage** = l'atelier de peinture : donne la couleur finale a chaque pixel visible
- **Depth-stencil** = le controle qualite : verifie que chaque piece est visible (pas cachee derriere une autre)
- **Output merger** = l'expedition : ecrit le resultat final dans le framebuffer

La difference avec WebGL : en WebGPU, toute la chaine est **pre-configuree et immutable**. On ne peut pas changer un seul maillon en cours de route. Si on veut une variante, on cree une nouvelle chaine.

### Structure du pipeline

```
GPURenderPipeline
  |
  +-- layout                    Pipeline layout (ou 'auto')
  |
  +-- vertex                    Vertex stage
  |     +-- module              GPUShaderModule (WGSL)
  |     +-- entryPoint          Nom de la fonction @vertex
  |     +-- buffers[]           GPUVertexBufferLayout[]
  |           +-- arrayStride   Taille d'un vertex en bytes
  |           +-- stepMode      'vertex' ou 'instance'
  |           +-- attributes[]  Quels champs extraire
  |
  +-- fragment                  Fragment stage
  |     +-- module              GPUShaderModule (WGSL)
  |     +-- entryPoint          Nom de la fonction @fragment
  |     +-- targets[]           Format de sortie (couleur)
  |           +-- format        GPUTextureFormat
  |           +-- blend         Configuration du blending
  |           +-- writeMask     Quels canaux RGBA ecrire
  |
  +-- primitive                 Configuration de la rasterisation
  |     +-- topology            'triangle-list', 'triangle-strip', etc.
  |     +-- frontFace           'ccw' ou 'cw'
  |     +-- cullMode            'none', 'front', 'back'
  |     +-- stripIndexFormat    Pour les strip topologies
  |
  +-- depthStencil              Test de profondeur (optionnel)
  |     +-- format              'depth24plus', 'depth32float', etc.
  |     +-- depthWriteEnabled   true/false
  |     +-- depthCompare        'less', 'greater', 'equal', etc.
  |
  +-- multisample               Anti-aliasing (optionnel)
        +-- count               1 (pas de MSAA) ou 4 (MSAA 4x)
        +-- alphaToCoverageEnabled
```

### Creation d'un pipeline complet

```typescript
const pipeline = device.createRenderPipeline({
  label: 'Main render pipeline',
  layout: 'auto', // Le layout sera infere depuis les shaders

  vertex: {
    module: shaderModule,
    entryPoint: 'vs_main',
    buffers: [
      {
        // Buffer 0 : positions + normales + UVs
        arrayStride: 8 * 4, // 8 floats * 4 bytes = 32 bytes par vertex
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // position
          { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
          { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
        ],
      },
    ],
  },

  fragment: {
    module: shaderModule,
    entryPoint: 'fs_main',
    targets: [{
      format: navigator.gpu.getPreferredCanvasFormat(),
      blend: {
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
      },
    }],
  },

  primitive: {
    topology: 'triangle-list',
    frontFace: 'ccw',          // Counter-clockwise = face avant
    cullMode: 'back',          // Ne pas dessiner les faces arriere
  },

  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',      // Le fragment le plus proche gagne
  },

  multisample: {
    count: 4,                  // MSAA 4x
  },
});
```

---

## Pipeline layout vs auto layout

### Auto layout (simple)

```typescript
// Avec 'auto', WebGPU infere le layout depuis le code WGSL
const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module: shaderModule, entryPoint: 'vs_main' },
  fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
});

// Pour creer un bind group, on recupere le layout infere
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0), // Layout du @group(0)
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } },
  ],
});
```

### Layout explicite (avance)

```typescript
// Avec un layout explicite, on peut partager le layout entre plusieurs pipelines
const bindGroupLayout = device.createBindGroupLayout({
  label: 'Scene bind group layout',
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    },
  ],
});

const pipelineLayout = device.createPipelineLayout({
  label: 'Main pipeline layout',
  bindGroupLayouts: [bindGroupLayout], // @group(0)
});

// Utiliser le layout explicite
const pipeline = device.createRenderPipeline({
  layout: pipelineLayout,
  vertex: { module: shaderModule, entryPoint: 'vs_main' },
  fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
});

// Le bind group utilise le meme layout
const bindGroup = device.createBindGroup({
  layout: bindGroupLayout, // Meme layout explicite
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: textureView },
    { binding: 2, resource: sampler },
  ],
});
```

### Quand utiliser un layout explicite ?

| Situation | Recommandation |
|-----------|---------------|
| Prototype / apprentissage | `'auto'` |
| Pipeline unique | `'auto'` |
| Plusieurs pipelines partagent des bind groups | Layout explicite |
| Bind groups crees avant le pipeline | Layout explicite |
| Performance critique (eviter les re-creations) | Layout explicite |
| Plusieurs variantes de shader (debug, release) | Layout explicite |

---

## Vertex buffers

### Format et stride

```typescript
// Un vertex buffer contient les attributs de chaque sommet.
// Le stride (arrayStride) est la taille totale d'un vertex en bytes.

// Exemple : position (vec3f) + normal (vec3f) + uv (vec2f)
// = 3*4 + 3*4 + 2*4 = 32 bytes par vertex

const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 32, // 32 bytes entre chaque vertex
  stepMode: 'vertex', // Un vertex par invocation (ou 'instance')
  attributes: [
    {
      shaderLocation: 0,     // Correspond a @location(0) dans WGSL
      offset: 0,             // Debut du buffer
      format: 'float32x3',   // vec3f : 3 floats de 32 bits
    },
    {
      shaderLocation: 1,     // @location(1)
      offset: 12,            // Apres 3 floats = 12 bytes
      format: 'float32x3',   // vec3f
    },
    {
      shaderLocation: 2,     // @location(2)
      offset: 24,            // Apres 6 floats = 24 bytes
      format: 'float32x2',   // vec2f
    },
  ],
};
```

### Formats d'attributs courants

| Format | Type WGSL | Taille | Usage typique |
|--------|-----------|--------|---------------|
| `float32` | `f32` | 4 bytes | Scalaire |
| `float32x2` | `vec2f` | 8 bytes | UV, position 2D |
| `float32x3` | `vec3f` | 12 bytes | Position 3D, normal, couleur |
| `float32x4` | `vec4f` | 16 bytes | Couleur RGBA, tangent |
| `uint8x4` | `vec4u` | 4 bytes | Couleur compacte (0-255) |
| `unorm8x4` | `vec4f` | 4 bytes | Couleur normalisee (0.0-1.0) |
| `sint16x2` | `vec2i` | 4 bytes | Position compacte |
| `uint32` | `u32` | 4 bytes | Index, ID |

### Buffers multiples vs buffer unique (interleaved)

```typescript
// --- Approche 1 : Buffer unique interleave ---
// [pos0, norm0, uv0, pos1, norm1, uv1, ...]
// Un seul buffer, un seul arrayStride
const interleavedLayout: GPUVertexBufferLayout = {
  arrayStride: 32,
  attributes: [
    { shaderLocation: 0, offset: 0,  format: 'float32x3' },
    { shaderLocation: 1, offset: 12, format: 'float32x3' },
    { shaderLocation: 2, offset: 24, format: 'float32x2' },
  ],
};
// pass.setVertexBuffer(0, interleavedBuffer);

// --- Approche 2 : Buffers separes ---
// Buffer A : [pos0, pos1, pos2, ...]
// Buffer B : [norm0, norm1, norm2, ...]
// Buffer C : [uv0, uv1, uv2, ...]
const posLayout: GPUVertexBufferLayout = {
  arrayStride: 12,
  attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
};
const normLayout: GPUVertexBufferLayout = {
  arrayStride: 12,
  attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }],
};
const uvLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }],
};
// pass.setVertexBuffer(0, posBuffer);
// pass.setVertexBuffer(1, normBuffer);
// pass.setVertexBuffer(2, uvBuffer);
```

| Approche | Avantage | Inconvenient |
|----------|----------|-------------|
| Interleave | Meilleure localite de cache GPU | Mise a jour partielle complexe |
| Separe | Flexibilite (mettre a jour un seul attribut) | Plus d'appels setVertexBuffer |

### stepMode : vertex vs instance

```typescript
// stepMode: 'vertex' — le buffer avance d'un stride par vertex
// stepMode: 'instance' — le buffer avance d'un stride par instance

// Exemple : 100 cubes a des positions differentes
const perVertexLayout: GPUVertexBufferLayout = {
  arrayStride: 12,
  stepMode: 'vertex', // Une position par vertex (la geometrie du cube)
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' },
  ],
};

const perInstanceLayout: GPUVertexBufferLayout = {
  arrayStride: 16,
  stepMode: 'instance', // Une position par instance (l'offset de chaque cube)
  attributes: [
    { shaderLocation: 3, offset: 0, format: 'float32x3' },  // instance offset
    { shaderLocation: 4, offset: 12, format: 'unorm8x4' },  // instance color
  ],
};

// Dans le shader WGSL :
// @vertex
// fn vs_main(
//   @location(0) local_pos: vec3f,     // stepMode: vertex
//   @location(3) instance_offset: vec3f, // stepMode: instance
//   @location(4) instance_color: vec4f,  // stepMode: instance
// ) -> VertexOutput { ... }
```

---

## Bind groups : le coeur du systeme de ressources

### Concept

En WebGL, on lie les ressources une par une :

```typescript
// WebGL : chaque ressource est liee individuellement
gl.uniform1f(timeLoc, time);
gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, diffuseTexture);
gl.uniform1i(diffuseLoc, 0);
// Si on oublie un bind, bug silencieux...
```

En WebGPU, les ressources sont groupees en bind groups **immutables** :

```typescript
// WebGPU : les ressources sont groupees et validees a la creation
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: textureView },
    { binding: 2, resource: sampler },
  ],
});

// A l'utilisation : un seul appel pour tout le groupe
pass.setBindGroup(0, bindGroup);
```

### Organisation en groupes

```wgsl
// Bonne pratique : organiser les bind groups par frequence de mise a jour

// @group(0) : donnees par frame (camera, temps, lumiere globale)
@group(0) @binding(0) var<uniform> frame: FrameUniforms;

// @group(1) : donnees par materiau (textures, proprietes du materiau)
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var t_albedo: texture_2d<f32>;
@group(1) @binding(2) var t_normal: texture_2d<f32>;
@group(1) @binding(3) var s_linear: sampler;

// @group(2) : donnees par objet (matrice model)
@group(2) @binding(0) var<uniform> object: ObjectUniforms;
```

```typescript
// Cote TypeScript :
// Group 0 change 1x par frame → on le cree une fois et on met a jour le buffer
pass.setBindGroup(0, frameBindGroup);

// Group 1 change quand on change de materiau → un bind group par materiau
pass.setBindGroup(1, woodMaterialBindGroup);
pass.draw(/* objets en bois */);

pass.setBindGroup(1, metalMaterialBindGroup);
pass.draw(/* objets en metal */);

// Group 2 change par objet → un bind group par objet (ou dynamique)
pass.setBindGroup(2, object1BindGroup);
pass.draw(/* objet 1 */);

pass.setBindGroup(2, object2BindGroup);
pass.draw(/* objet 2 */);
```

---

## Uniform buffers

### Creation et mise a jour

```typescript
// Les uniforms sont des donnees constantes pour un draw call.
// En WebGPU, on les passe via un buffer (pas des appels individuels).

// Structure cote WGSL :
// struct Uniforms {
//   model: mat4x4f,        // 64 bytes
//   view: mat4x4f,         // 64 bytes
//   projection: mat4x4f,   // 64 bytes
//   time: f32,             // 4 bytes
//   // padding: 12 bytes (alignement a 16 bytes)
// }
// Total : 64 + 64 + 64 + 16 = 208 bytes

const UNIFORM_BUFFER_SIZE = 208; // Doit correspondre a la taille de la struct WGSL

const uniformBuffer = device.createBuffer({
  label: 'Scene uniforms',
  size: UNIFORM_BUFFER_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Mise a jour chaque frame
function updateUniforms(time: number) {
  const data = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
  const view = new Float32Array(data);

  // model : identite (offset 0, 16 floats)
  view.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], 0);
  // view : lookAt (offset 16, 16 floats)
  view.set(viewMatrix, 16);
  // projection : perspective (offset 32, 16 floats)
  view.set(projMatrix, 32);
  // time (offset 48, 1 float)
  view[48] = time;

  device.queue.writeBuffer(uniformBuffer, 0, data);
}
```

### Regles d'alignement WGSL

```wgsl
// ATTENTION : WGSL impose des regles d'alignement strictes.
// Chaque type a un alignement minimum :

// f32          → align 4,  size 4
// vec2f        → align 8,  size 8
// vec3f        → align 16, size 12  (attention: align 16 !)
// vec4f        → align 16, size 16
// mat4x4f      → align 16, size 64
// mat3x3f      → align 16, size 48  (3 vec4f en memoire)
// array<T, N>  → align = align(T), stride = roundUp(align(T), size(T))

// Exemple de piege courant :
struct BadLayout {
  time: f32,       // offset 0, size 4
  // PADDING 12 bytes (vec3f doit etre aligne a 16 !)
  position: vec3f, // offset 16, size 12
  // PADDING 4 bytes
  color: vec4f,    // offset 32, size 16
}
// Taille totale : 48 bytes (pas 20 comme on pourrait croire)

// Bonne pratique : mettre les types les plus gros en premier
struct GoodLayout {
  color: vec4f,    // offset 0,  size 16, align 16 ✓
  position: vec3f, // offset 16, size 12, align 16 ✓
  time: f32,       // offset 28, size 4,  align 4  ✓
}
// Taille totale : 32 bytes (plus compact)
```

### Dynamic offsets

```typescript
// Au lieu de creer un uniform buffer par objet, on peut utiliser
// un seul grand buffer avec des offsets dynamiques.

const NUM_OBJECTS = 100;
const ALIGN = 256; // minUniformBufferOffsetAlignment (souvent 256)
const OBJECT_SIZE = Math.ceil(64 / ALIGN) * ALIGN; // 256 bytes (aligne)

const dynamicUniformBuffer = device.createBuffer({
  size: NUM_OBJECTS * OBJECT_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Bind group layout avec hasDynamicOffset
const layout = device.createBindGroupLayout({
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX,
    buffer: {
      type: 'uniform',
      hasDynamicOffset: true, // Activer les offsets dynamiques
      minBindingSize: 64,     // Taille minimum attendue par le shader
    },
  }],
});

// Un seul bind group pour tous les objets
const bindGroup = device.createBindGroup({
  layout,
  entries: [{
    binding: 0,
    resource: {
      buffer: dynamicUniformBuffer,
      offset: 0,
      size: 64, // Taille de la struct par objet
    },
  }],
});

// A l'utilisation : passer l'offset dynamique
for (let i = 0; i < NUM_OBJECTS; i++) {
  const offset = i * OBJECT_SIZE;
  pass.setBindGroup(0, bindGroup, [offset]); // Offset dynamique
  pass.draw(36); // 36 vertices du cube
}
```

---

## Storage buffers

### Difference avec les uniform buffers

| Aspect | Uniform buffer | Storage buffer |
|--------|---------------|----------------|
| Acces | Lecture seule | Lecture + ecriture |
| Taille max | ~64 Ko (typique) | ~128 Mo a 2 Go |
| Alignement | Strict (256 bytes pour dynamic offset) | 4 bytes |
| Performance | Optimise pour petites donnees frequentes | Optimise pour grandes donnees |
| Cas d'usage | Matrices, temps, parametres | Tableaux de particules, instances, resultats compute |

### Utilisation dans le shader

```wgsl
// Un storage buffer peut contenir un tableau de taille dynamique

struct Particle {
  position: vec3f,
  velocity: vec3f,
  color: vec4f,
  life: f32,
}

// Lecture seule (dans le vertex/fragment shader)
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

// Lecture + ecriture (dans le compute shader)
@group(0) @binding(2) var<storage, read_write> particles_rw: array<Particle>;

@vertex
fn vs_main(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VertexOutput {
  let p = particles[ii]; // Lire la position de la particule
  // ...
}
```

### Creation cote TypeScript

```typescript
interface Particle {
  position: [number, number, number];
  velocity: [number, number, number];
  color: [number, number, number, number];
  life: number;
}

const NUM_PARTICLES = 10_000;
// Taille d'une particule en bytes :
// vec3f (pad to 16) + vec3f (pad to 16) + vec4f (16) + f32 (pad to 16) = 64
const PARTICLE_SIZE = 64;

const particleBuffer = device.createBuffer({
  label: 'Particle storage buffer',
  size: NUM_PARTICLES * PARTICLE_SIZE,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

// Initialiser les particules
const data = new Float32Array(NUM_PARTICLES * (PARTICLE_SIZE / 4));
for (let i = 0; i < NUM_PARTICLES; i++) {
  const base = i * 16; // 16 floats par particule (64 bytes / 4)
  // position
  data[base + 0] = (Math.random() - 0.5) * 2;
  data[base + 1] = (Math.random() - 0.5) * 2;
  data[base + 2] = (Math.random() - 0.5) * 2;
  // padding
  // velocity
  data[base + 4] = (Math.random() - 0.5) * 0.1;
  data[base + 5] = Math.random() * 0.2;
  data[base + 6] = (Math.random() - 0.5) * 0.1;
  // padding
  // color
  data[base + 8]  = Math.random();
  data[base + 9]  = Math.random();
  data[base + 10] = Math.random();
  data[base + 11] = 1.0;
  // life
  data[base + 12] = Math.random() * 5.0;
}

device.queue.writeBuffer(particleBuffer, 0, data);
```

---

## Texture bindings

### Creer une texture depuis une image

```typescript
async function loadTexture(
  device: GPUDevice,
  url: string
): Promise<{ texture: GPUTexture; view: GPUTextureView; sampler: GPUSampler }> {
  // Charger l'image
  const response = await fetch(url);
  const blob = await response.blob();
  const imageBitmap = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
  });

  // Creer la texture GPU
  const texture = device.createTexture({
    label: `Texture: ${url}`,
    size: { width: imageBitmap.width, height: imageBitmap.height },
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Copier les pixels vers le GPU
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture },
    { width: imageBitmap.width, height: imageBitmap.height }
  );

  // Creer une vue (comment le shader voit la texture)
  const view = texture.createView({
    label: `View: ${url}`,
  });

  // Creer un sampler (comment echantillonner la texture)
  const sampler = device.createSampler({
    label: 'Linear sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    maxAnisotropy: 16,
  });

  return { texture, view, sampler };
}
```

### Binder dans le shader

```wgsl
// Types de texture WGSL :
// texture_2d<f32>         — texture 2D classique
// texture_cube<f32>       — cubemap
// texture_2d_array<f32>   — tableau de textures
// texture_3d<f32>         — texture 3D (volume)
// texture_depth_2d        — texture de profondeur
// texture_storage_2d<rgba8unorm, write> — ecriture directe (compute)

@group(0) @binding(1) var t_albedo: texture_2d<f32>;
@group(0) @binding(2) var t_normal: texture_2d<f32>;
@group(0) @binding(3) var s_linear: sampler;
@group(0) @binding(4) var s_nearest: sampler; // Pas de filtrage (pixel art)

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let albedo = textureSample(t_albedo, s_linear, uv);
  let normal = textureSample(t_normal, s_linear, uv).xyz * 2.0 - 1.0;
  // ...
  return albedo;
}
```

### Bind group avec textures

```typescript
const textureBindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: albedoTextureView },
    { binding: 2, resource: normalTextureView },
    { binding: 3, resource: linearSampler },
    { binding: 4, resource: nearestSampler },
  ],
});
```

> **Analogie WebGL** : en WebGL, texture et sampler sont fusionnes dans un `sampler2D`. En WebGPU, ils sont separes — on peut reutiliser le meme sampler pour plusieurs textures, ou changer de sampler sans recreer la texture.

---

## Depth-stencil

### Pourquoi un depth buffer ?

Sans depth test, les objets sont dessines dans l'ordre de soumission — un objet dessine en dernier apparait toujours devant, meme s'il est geometriquement derriere.

### Configuration

```typescript
// 1. Creer la texture de profondeur
const depthTexture = device.createTexture({
  label: 'Depth texture',
  size: { width: canvas.width, height: canvas.height },
  format: 'depth24plus', // 24 bits de profondeur
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
const depthTextureView = depthTexture.createView();

// 2. Configurer le pipeline avec depth-stencil
const pipeline = device.createRenderPipeline({
  // ...
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,   // Ecrire dans le depth buffer
    depthCompare: 'less',      // Garder le fragment le plus proche
  },
});

// 3. Attacher au render pass
const renderPass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
    loadOp: 'clear',
    storeOp: 'store',
  }],
  depthStencilAttachment: {
    view: depthTextureView,
    depthClearValue: 1.0,      // Profondeur maximum = loin
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  },
});
```

### Formats de profondeur

| Format | Precision | Stencil | Notes |
|--------|-----------|---------|-------|
| `depth16unorm` | 16 bits | Non | Economique, mobile |
| `depth24plus` | 24+ bits | Non | Standard desktop |
| `depth32float` | 32 bits float | Non | Haute precision |
| `depth24plus-stencil8` | 24 bits + 8 bits | Oui | Avec stencil |
| `depth32float-stencil8` | 32 bits + 8 bits | Oui | Max precision + stencil |

### depthCompare : fonctions de comparaison

| Valeur | Signification |
|--------|---------------|
| `'never'` | Jamais (rien ne passe) |
| `'less'` | Passe si fragment < depth buffer (le plus courant) |
| `'equal'` | Passe si fragment == depth buffer |
| `'less-equal'` | Passe si fragment <= depth buffer |
| `'greater'` | Passe si fragment > depth buffer (reverse-Z) |
| `'not-equal'` | Passe si fragment != depth buffer |
| `'greater-equal'` | Passe si fragment >= depth buffer |
| `'always'` | Toujours (tout passe, utile pour le debug) |

---

## Multi-sample (MSAA)

### Principe

MSAA (Multi-Sample Anti-Aliasing) echantillonne chaque pixel a plusieurs positions pour lisser les bords des triangles. En WebGPU, on utilise typiquement 4 samples.

```typescript
// 1. Creer une texture MSAA (resolve target)
const msaaTexture = device.createTexture({
  label: 'MSAA texture',
  size: { width: canvas.width, height: canvas.height },
  format: navigator.gpu.getPreferredCanvasFormat(),
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
  sampleCount: 4, // 4x MSAA
});
const msaaView = msaaTexture.createView();

// 2. Configurer le pipeline
const pipeline = device.createRenderPipeline({
  // ...
  multisample: {
    count: 4, // Doit correspondre a sampleCount de la texture
  },
});

// 3. Render pass : rendre dans la texture MSAA, resoudre vers le canvas
const renderPass = encoder.beginRenderPass({
  colorAttachments: [{
    view: msaaView,            // Rendre ici (MSAA)
    resolveTarget: context.getCurrentTexture().createView(), // Resoudre ici
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
    loadOp: 'clear',
    storeOp: 'discard', // On n'a pas besoin de la texture MSAA apres resolve
  }],
});
```

> **Analogie WebGL** : en WebGL, MSAA etait gere implicitement par le navigateur via `antialias: true` dans les options du contexte. En WebGPU, c'est explicite — on cree la texture MSAA et on configure le resolve.

---

## Render pass complet

### GPURenderPassDescriptor

```typescript
const renderPassDescriptor: GPURenderPassDescriptor = {
  label: 'Main render pass',

  colorAttachments: [
    {
      // Ou rendre (texture MSAA si MSAA active, sinon canvas directement)
      view: msaaView, // ou context.getCurrentTexture().createView()

      // Ou resoudre les samples MSAA (optionnel, seulement si MSAA)
      resolveTarget: context.getCurrentTexture().createView(),

      // Couleur de nettoyage
      clearValue: { r: 0.05, g: 0.05, b: 0.08, a: 1.0 },

      // Que faire au debut du pass :
      // 'clear' : nettoyer avec clearValue
      // 'load'  : conserver le contenu precedent
      loadOp: 'clear',

      // Que faire a la fin du pass :
      // 'store'   : garder le resultat
      // 'discard' : jeter (si on n'a besoin que du resolveTarget)
      storeOp: 'discard',
    },
  ],

  depthStencilAttachment: {
    view: depthTextureView,
    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  },
};
```

### Encodage complet d'une frame

```typescript
function renderFrame(scene: Scene) {
  // 1. Mettre a jour les uniforms
  updateFrameUniforms(scene.camera, scene.time);

  // 2. Creer l'encoder
  const encoder = device.createCommandEncoder({ label: 'Frame encoder' });

  // 3. Commencer le render pass
  const pass = encoder.beginRenderPass(renderPassDescriptor);

  // 4. Dessiner la scene
  pass.setPipeline(opaquePipeline);
  pass.setBindGroup(0, frameBindGroup); // Donnees par frame

  for (const mesh of scene.opaqueMeshes) {
    pass.setBindGroup(1, mesh.materialBindGroup); // Donnees par materiau
    pass.setBindGroup(2, mesh.objectBindGroup);   // Donnees par objet
    pass.setVertexBuffer(0, mesh.vertexBuffer);
    pass.setIndexBuffer(mesh.indexBuffer, 'uint16');
    pass.drawIndexed(mesh.indexCount);
  }

  // 5. Dessiner les objets transparents (pipeline avec blending)
  pass.setPipeline(transparentPipeline);
  for (const mesh of scene.transparentMeshes) {
    pass.setBindGroup(1, mesh.materialBindGroup);
    pass.setBindGroup(2, mesh.objectBindGroup);
    pass.setVertexBuffer(0, mesh.vertexBuffer);
    pass.setIndexBuffer(mesh.indexBuffer, 'uint16');
    pass.drawIndexed(mesh.indexCount);
  }

  // 6. Fin du pass
  pass.end();

  // 7. Soumettre
  device.queue.submit([encoder.finish()]);
}
```

### Appels draw

```typescript
// draw(vertexCount, instanceCount, firstVertex, firstInstance)
pass.draw(36);           // 36 vertices, 1 instance
pass.draw(36, 100);      // 36 vertices, 100 instances
pass.draw(36, 1, 0, 0);  // Forme complete

// drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance)
pass.drawIndexed(36);            // 36 indices
pass.drawIndexed(36, 100);       // 36 indices, 100 instances
pass.drawIndexed(36, 1, 0, 0, 0); // Forme complete
```

---

## Multiple render passes

### Deferred rendering : concept

Le deferred rendering separe le calcul de la geometrie et celui de l'eclairage en deux passes distinctes.

```
Pass 1 : G-Buffer (Geometry Pass)
  → Ecrire position, normal, albedo dans 3 textures separees

Pass 2 : Lighting Pass
  → Lire les 3 textures du G-Buffer
  → Calculer l'eclairage pour chaque pixel
  → Ecrire le resultat final
```

```typescript
// Pass 1 : G-Buffer
const gBufferPass = encoder.beginRenderPass({
  colorAttachments: [
    { view: positionTextureView, loadOp: 'clear', storeOp: 'store',
      clearValue: { r: 0, g: 0, b: 0, a: 0 } },
    { view: normalTextureView,   loadOp: 'clear', storeOp: 'store',
      clearValue: { r: 0, g: 0, b: 0, a: 0 } },
    { view: albedoTextureView,   loadOp: 'clear', storeOp: 'store',
      clearValue: { r: 0, g: 0, b: 0, a: 1 } },
  ],
  depthStencilAttachment: {
    view: depthView,
    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  },
});
gBufferPass.setPipeline(gBufferPipeline);
// ... dessiner tous les objets
gBufferPass.end();

// Pass 2 : Lighting (fullscreen quad)
const lightingPass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
  }],
});
lightingPass.setPipeline(lightingPipeline);
lightingPass.setBindGroup(0, gBufferBindGroup); // Les 3 textures du G-Buffer
lightingPass.draw(3); // Fullscreen triangle
lightingPass.end();
```

---

## Comparaison WebGL vs WebGPU : bindings

### WebGL : etat mutable, bindings individuels

```typescript
// WebGL : chaque binding est un appel separe, etat global mutable
gl.useProgram(program);

// Uniforms : un appel par variable
gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uModel'), false, model);
gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uView'), false, view);
gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProjection'), false, proj);
gl.uniform1f(gl.getUniformLocation(program, 'uTime'), time);

// Textures : activer une unite, binder, configurer
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, albedoTex);
gl.uniform1i(gl.getUniformLocation(program, 'uAlbedo'), 0);

gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, normalTex);
gl.uniform1i(gl.getUniformLocation(program, 'uNormalMap'), 1);

// Vertex buffer : binder, configurer chaque attribut
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
gl.enableVertexAttribArray(2);

gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
```

### WebGPU : objets immutables, bindings groupes

```typescript
// WebGPU : tout est pre-configure et immutable
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass(renderPassDesc);

pass.setPipeline(pipeline);                  // 1 appel (inclut vertex layout)
pass.setBindGroup(0, sceneBindGroup);        // 1 appel (uniforms + textures)
pass.setVertexBuffer(0, vertexBuffer);       // 1 appel
pass.setIndexBuffer(indexBuffer, 'uint16');   // 1 appel
pass.drawIndexed(indexCount);                // 1 appel

pass.end();
device.queue.submit([encoder.finish()]);
// 5 appels au lieu de ~15, validation a la creation, pas au draw
```

### Tableau comparatif des appels

| Operation | WebGL | WebGPU |
|-----------|-------|--------|
| Choisir le shader | `gl.useProgram()` | `pass.setPipeline()` |
| Envoyer une matrice | `gl.uniformMatrix4fv()` | `device.queue.writeBuffer()` + `pass.setBindGroup()` |
| Binder une texture | `gl.activeTexture()` + `gl.bindTexture()` + `gl.uniform1i()` | Inclus dans le bind group |
| Configurer un attribut | `gl.bindBuffer()` + `gl.vertexAttribPointer()` + `gl.enableVertexAttribArray()` | Inclus dans le pipeline (buffers) |
| Dessiner | `gl.drawElements()` | `pass.drawIndexed()` |
| Validation | Au draw call (lent, silencieux) | A la creation du pipeline/bind group (rapide, explicite) |

---

## Exercice pratique

Creez une scene WebGPU avec :

1. Un cube texture avec eclairage directionnel
2. Un vertex buffer interleave (position + normal + uv)
3. Un index buffer pour les 36 indices du cube
4. Un uniform buffer pour les matrices MVP et la direction de la lumiere
5. Un bind group avec l'uniform buffer, une texture et un sampler
6. Un depth buffer pour le test de profondeur
7. Une rotation automatique du cube avec `requestAnimationFrame`

<details>
<summary>Solution</summary>

```wgsl
// cube.wgsl

struct Uniforms {
  model: mat4x4f,
  view: mat4x4f,
  projection: mat4x4f,
  light_dir: vec3f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
}

@vertex
fn vs_main(
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> VertexOutput {
  var out: VertexOutput;
  let world_pos = u.model * vec4f(pos, 1.0);
  out.position = u.projection * u.view * world_pos;
  out.normal = (u.model * vec4f(normal, 0.0)).xyz;
  out.uv = uv;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let L = normalize(u.light_dir);
  let diffuse = max(dot(N, L), 0.0);
  let ambient = 0.15;
  let albedo = textureSample(t_diffuse, s_diffuse, in.uv).rgb;
  let color = albedo * (ambient + diffuse);
  return vec4f(color, 1.0);
}
```

```typescript
// main.ts — Cube texture avec eclairage

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = 800;
  canvas.height = 600;

  // --- Init ---
  const adapter = await navigator.gpu!.requestAdapter();
  const device = await adapter!.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  // --- Cube geometry (interleaved: pos3 + normal3 + uv2 = 8 floats) ---
  const cubeVertices = new Float32Array([
    // Front face
    -1, -1,  1,   0,  0,  1,   0, 1,
     1, -1,  1,   0,  0,  1,   1, 1,
     1,  1,  1,   0,  0,  1,   1, 0,
    -1,  1,  1,   0,  0,  1,   0, 0,
    // Back face
     1, -1, -1,   0,  0, -1,   0, 1,
    -1, -1, -1,   0,  0, -1,   1, 1,
    -1,  1, -1,   0,  0, -1,   1, 0,
     1,  1, -1,   0,  0, -1,   0, 0,
    // Top face
    -1,  1,  1,   0,  1,  0,   0, 1,
     1,  1,  1,   0,  1,  0,   1, 1,
     1,  1, -1,   0,  1,  0,   1, 0,
    -1,  1, -1,   0,  1,  0,   0, 0,
    // Bottom face
    -1, -1, -1,   0, -1,  0,   0, 1,
     1, -1, -1,   0, -1,  0,   1, 1,
     1, -1,  1,   0, -1,  0,   1, 0,
    -1, -1,  1,   0, -1,  0,   0, 0,
    // Right face
     1, -1,  1,   1,  0,  0,   0, 1,
     1, -1, -1,   1,  0,  0,   1, 1,
     1,  1, -1,   1,  0,  0,   1, 0,
     1,  1,  1,   1,  0,  0,   0, 0,
    // Left face
    -1, -1, -1,  -1,  0,  0,   0, 1,
    -1, -1,  1,  -1,  0,  0,   1, 1,
    -1,  1,  1,  -1,  0,  0,   1, 0,
    -1,  1, -1,  -1,  0,  0,   0, 0,
  ]);

  const cubeIndices = new Uint16Array([
     0,  1,  2,  0,  2,  3,  // front
     4,  5,  6,  4,  6,  7,  // back
     8,  9, 10,  8, 10, 11,  // top
    12, 13, 14, 12, 14, 15,  // bottom
    16, 17, 18, 16, 18, 19,  // right
    20, 21, 22, 20, 22, 23,  // left
  ]);

  const vertexBuffer = device.createBuffer({
    size: cubeVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, cubeVertices);

  const indexBuffer = device.createBuffer({
    size: cubeIndices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, cubeIndices);

  // --- Uniform buffer (3 mat4 + vec3 + pad = 208 bytes) ---
  const uniformBuffer = device.createBuffer({
    size: 208,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // --- Texture (checkerboard generee) ---
  const texSize = 64;
  const texData = new Uint8Array(texSize * texSize * 4);
  for (let y = 0; y < texSize; y++) {
    for (let x = 0; x < texSize; x++) {
      const i = (y * texSize + x) * 4;
      const isWhite = ((x >> 3) ^ (y >> 3)) & 1;
      const c = isWhite ? 220 : 40;
      texData[i] = c; texData[i+1] = c; texData[i+2] = c; texData[i+3] = 255;
    }
  }
  const texture = device.createTexture({
    size: { width: texSize, height: texSize },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    texData,
    { bytesPerRow: texSize * 4 },
    { width: texSize, height: texSize }
  );
  const sampler = device.createSampler({
    magFilter: 'linear', minFilter: 'linear',
    addressModeU: 'repeat', addressModeV: 'repeat',
  });

  // --- Pipeline ---
  const shaderModule = device.createShaderModule({ code: cubeShaderCode });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 32, // 8 floats
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' },
        ],
      }],
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // --- Depth texture ---
  const depthTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // --- Bind group ---
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler },
    ],
  });

  // --- Render loop ---
  function render() {
    const t = performance.now() / 1000;
    // Matrices simples (en production, utiliser glMatrix ou similaire)
    const data = new Float32Array(52); // 3*16 + 4 = 52
    // model: rotation Y
    const c = Math.cos(t), s = Math.sin(t);
    data.set([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1], 0);
    // view: recul de 4 unites
    data.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-4,1], 16);
    // projection: perspective simple
    const aspect = canvas.width / canvas.height;
    const fov = Math.PI / 4;
    const f = 1 / Math.tan(fov / 2);
    const near = 0.1, far = 100;
    data.set([f/aspect,0,0,0, 0,f,0,0, 0,0,far/(near-far),-1, 0,0,near*far/(near-far),0], 32);
    // light direction
    data[48] = 0.5; data[49] = 1.0; data[50] = 0.3;
    device.queue.writeBuffer(uniformBuffer, 0, data);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(36);
    pass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(render);
  }

  render();
}

main();
```

</details>

---

## Resume

| Concept | Description |
|---------|-------------|
| `GPURenderPipeline` | Objet immutable combinant vertex stage, fragment stage, rasterisation, depth, MSAA |
| `layout: 'auto'` | WebGPU infere le pipeline layout depuis le WGSL |
| `GPUPipelineLayout` | Layout explicite : permet de partager des bind group layouts entre pipelines |
| `GPUVertexBufferLayout` | Decrit comment lire les donnees du vertex buffer (stride, attributs) |
| `stepMode: 'vertex'` | Le buffer avance d'un stride par vertex |
| `stepMode: 'instance'` | Le buffer avance d'un stride par instance |
| `GPUBindGroup` | Groupe immutable de ressources (buffers, textures, samplers) |
| `GPUBindGroupLayout` | Decrit la structure d'un bind group (types, visibilite) |
| `@group(G) @binding(B)` | Reference WGSL vers un binding dans un bind group |
| Uniform buffer | Petit, lecture seule, optimise pour donnees frequemment mises a jour |
| Storage buffer | Grand, lecture/ecriture, pour tableaux et donnees volumineuses |
| `depthStencil` | Configuration du test de profondeur dans le pipeline |
| `multisample: { count: 4 }` | MSAA 4x (anti-aliasing) |
| `colorAttachments` | Cibles de rendu du render pass (textures de sortie) |
| `depthStencilAttachment` | Texture de profondeur du render pass |
| `loadOp` / `storeOp` | Que faire au debut/fin du pass (clear/load, store/discard) |
| Deferred rendering | Separer geometrie (G-Buffer) et eclairage en passes distinctes |

---

## Navigation

| Precedent | Suivant |
|-----------|---------|
| [09 - WebGPU architecture et WGSL](./09-webgpu-architecture-wgsl) | [11 - Compute shaders et GPGPU](./11-compute-shaders-gpgpu) |

---

## Ressources

- [Quiz 10 : Testez vos connaissances](../quizzes/quiz-10-pipeline.html)
- [Lab 10 : Render pipeline](../labs/lab-10-render-pipeline/)
- [WebGPU Spec — GPURenderPipeline](https://www.w3.org/TR/webgpu/#render-pipeline)
- [WebGPU Spec — Bind Groups](https://www.w3.org/TR/webgpu/#bind-groups)
- [WebGPU Best Practices — Buffer Upload](https://toji.dev/webgpu-best-practices/buffer-uploads)
- [WGSL Memory Layout](https://www.w3.org/TR/WGSL/#memory-layouts)
- [WebGPU Fundamentals — Vertex Buffers](https://webgpufundamentals.org/webgpu/lessons/webgpu-vertex-buffers.html)
