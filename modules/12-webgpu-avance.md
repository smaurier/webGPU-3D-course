# Module 12 — Techniques avancees WebGPU

| Difficulte | Duree estimee | Lab | Quiz |
|------------|---------------|-----|------|
| 5/5        | 150 min       | [Lab 12](../labs/lab-12-webgpu-avance/) | [Quiz 12](../quizzes/quiz-12-avance.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Utiliser l'instanced rendering en WebGPU avec `instance` step mode
- Configurer le dessin indirect via `drawIndirect` et `drawIndexedIndirect`
- Pre-enregistrer des commandes avec les render bundles
- Mesurer le temps GPU avec les timestamp queries
- Effectuer des occlusion queries pour la visibility testing
- Écrire dans plusieurs textures simultanement (MRT)
- Implementer un deferred rendering complet avec G-buffer et lighting pass
- Travailler avec les texture arrays et les cubemaps en WebGPU
- Générer des mipmaps avec un compute shader
- Appliquer des stratégies de memory management (pooling, suballocation)
- Connaître les bonnes pratiques WebGPU pour maximiser la performance
- Comparer WebGL et WebGPU pour choisir la bonne technologie

---

<details>
<summary>Rappel du module précédent — Compute shaders et GPGPU</summary>

Dans le module 11, nous avons decouvert :

1. **Qu'est-ce qu'un compute shader ?**
   Un programme GPU pour du calcul général, sans pipeline graphique. Il lit/écrit des storage buffers et s'exécuté en workgroups de threads paralleles.

2. **Comment lancer un compute shader ?**
   `encoder.beginComputePass()` → `pass.setPipeline()` → `pass.setBindGroup()` → `pass.dispatchWorkgroups(x, y, z)` → `pass.end()`.

3. **Qu'est-ce qu'un workgroup ?**
   Un groupe d'invocations (threads) qui partagent une mémoire locale (`var<workgroup>`) et peuvent se synchroniser via `workgroupBarrier()`.

4. **Comment lire les résultats cote CPU ?**
   Via un staging buffer (`MAP_READ | COPY_DST`), `mapAsync(GPUMapMode.READ)`, puis `getMappedRange()`.

5. **Comment combiner compute et render ?**
   Un même buffer peut avoir `STORAGE | VERTEX` usage. Le compute écrit les positions, le render les lit comme vertex buffer.

</details>

---

## 1. Analogie — Les techniques avancees comme un studio de post-production

```
STUDIO DE POST-PRODUCTION              TECHNIQUES AVANCEES WEBGPU
==========================              =========================

Tournage multi-camera                  Multiple Render Targets (MRT)
  = filmer la meme scene                = ecrire position, normale, couleur
    sous plusieurs angles                  dans des textures separees
    simultanement                          simultanement

Montage pre-enregistre                 Render Bundles
  = sequence de coupes                   = commandes pre-enregistrees
    toujours identique                     et rejouees a chaque frame
    → copier/coller entre                  → elimine le cout CPU
    episodes                                d'encodage

Generiques (meme animation,           Instanced Rendering
 texte different)                        = meme mesh, donnees differentes
                                           en un seul draw call

Chronometre de scene                   Timestamp Queries
  = mesurer la duree exacte              = mesurer le temps GPU
    de chaque prise                        de chaque operation

"Est-ce que l'acteur est               Occlusion Queries
 visible a l'ecran ?"                    = "est-ce que cet objet
  → eviter de filmer un                    est visible ?"
    acteur cache derriere                  → eviter de le dessiner
    le decor                                si completement cache
```

:::tip Analogie clé
Le **deferred rendering** est comme filmer chaque aspect de la scene separement (profondeur, couleurs, normales), puis assembler le tout en post-production (lighting pass). C'est plus complexe a mettre en place, mais cela permet de gérer un grand nombre de lumieres sans ralentissement.
:::

---

## 2. Instanced rendering en WebGPU

### 2.1 Rappel du concept

L'instanced rendering dessine le même mesh plusieurs fois en un seul draw call. Chaque instance peut avoir des donnees différentes (position, couleur, scale...).

### 2.2 Instance step mode

```typescript
// Vertex buffer layout avec un buffer par-instance

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: shaderModule,
    entryPoint: 'vs_main',
    buffers: [
      // Buffer 0 : geometrie du mesh (par vertex)
      {
        arrayStride: 32, // 3 pos + 3 normal + 2 uv = 8 floats
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' },  // position
          { shaderLocation: 1, offset: 12, format: 'float32x3' },  // normal
          { shaderLocation: 2, offset: 24, format: 'float32x2' },  // uv
        ],
      },
      // Buffer 1 : donnees par instance
      {
        arrayStride: 80, // mat4 (64) + vec4 color (16) = 80 bytes
        stepMode: 'instance',  // <-- avance par instance, pas par vertex
        attributes: [
          // Passer une mat4 necessite 4 attributs vec4
          { shaderLocation: 3, offset: 0,  format: 'float32x4' },  // model col 0
          { shaderLocation: 4, offset: 16, format: 'float32x4' },  // model col 1
          { shaderLocation: 5, offset: 32, format: 'float32x4' },  // model col 2
          { shaderLocation: 6, offset: 48, format: 'float32x4' },  // model col 3
          { shaderLocation: 7, offset: 64, format: 'float32x4' },  // color
        ],
      },
    ],
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
```

### 2.3 Shader avec instance_index

```wgsl
struct VertexInput {
  // Per-vertex
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  // Per-instance (model matrix en 4 colonnes)
  @location(3) model_col0: vec4f,
  @location(4) model_col1: vec4f,
  @location(5) model_col2: vec4f,
  @location(6) model_col3: vec4f,
  @location(7) inst_color: vec4f,
}

struct Uniforms {
  view_proj: mat4x4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) color: vec4f,
}

@vertex
fn vs_main(
  in: VertexInput,
  @builtin(instance_index) instance_id: u32,
) -> VertexOutput {
  // Reconstruire la model matrix depuis les 4 colonnes
  let model = mat4x4f(
    in.model_col0,
    in.model_col1,
    in.model_col2,
    in.model_col3,
  );

  let world_pos = model * vec4f(in.position, 1.0);

  var out: VertexOutput;
  out.position = u.view_proj * world_pos;
  out.normal = (model * vec4f(in.normal, 0.0)).xyz;
  out.uv = in.uv;
  out.color = in.inst_color;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let L = normalize(vec3f(0.5, 1.0, 0.3));
  let diffuse = max(dot(N, L), 0.0) * 0.8 + 0.2;
  return vec4f(in.color.rgb * diffuse, in.color.a);
}
```

### 2.4 Remplir le buffer d'instances et dessiner

```typescript
// Creer les donnees pour 1000 instances
const INSTANCE_COUNT = 1000;
const INSTANCE_STRIDE = 80; // 64 bytes (mat4) + 16 bytes (vec4 color)
const instanceData = new Float32Array(INSTANCE_COUNT * 20); // 20 floats par instance

for (let i = 0; i < INSTANCE_COUNT; i++) {
  const base = i * 20;
  const x = (i % 32 - 16) * 2.5;
  const z = (Math.floor(i / 32) - 16) * 2.5;
  const scale = 0.5 + Math.random() * 0.5;
  const angle = Math.random() * Math.PI * 2;

  // Model matrix (rotation Y + translation + scale)
  const c = Math.cos(angle) * scale;
  const s = Math.sin(angle) * scale;
  // colonne 0
  instanceData[base + 0] = c;
  instanceData[base + 1] = 0;
  instanceData[base + 2] = -s;
  instanceData[base + 3] = 0;
  // colonne 1
  instanceData[base + 4] = 0;
  instanceData[base + 5] = scale;
  instanceData[base + 6] = 0;
  instanceData[base + 7] = 0;
  // colonne 2
  instanceData[base + 8] = s;
  instanceData[base + 9] = 0;
  instanceData[base + 10] = c;
  instanceData[base + 11] = 0;
  // colonne 3 (translation)
  instanceData[base + 12] = x;
  instanceData[base + 13] = 0;
  instanceData[base + 14] = z;
  instanceData[base + 15] = 1;
  // couleur
  instanceData[base + 16] = Math.random();
  instanceData[base + 17] = Math.random();
  instanceData[base + 18] = Math.random();
  instanceData[base + 19] = 1;
}

const instanceBuffer = device.createBuffer({
  size: instanceData.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(instanceBuffer, 0, instanceData);

// Dessiner
const pass = encoder.beginRenderPass(renderPassDesc);
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.setVertexBuffer(0, meshVertexBuffer);   // geometrie
pass.setVertexBuffer(1, instanceBuffer);      // instances
pass.setIndexBuffer(meshIndexBuffer, 'uint16');
pass.drawIndexed(meshIndexCount, INSTANCE_COUNT); // 2eme arg = nombre d'instances
pass.end();
```

---

## 3. Indirect draw

### 3.1 Qu'est-ce que le dessin indirect ?

Le dessin indirect lit les paramètres du draw call **depuis un buffer GPU** au lieu de les passer en argument JavaScript. Cela permet à un compute shader de decider combien d'objets dessiner sans intervention du CPU.

```
Dessin DIRECT (classique) :              Dessin INDIRECT :

// Le CPU decide combien dessiner        // Le GPU decide combien dessiner
pass.draw(vertexCount, instanceCount);   pass.drawIndirect(buffer, offset);

CPU ──[params]──▶ Draw Call              GPU ──[compute]──▶ Buffer ──▶ Draw Call

Cas d'usage :                            Cas d'usage :
- Nombre d'objets connu d'avance         - Frustum culling sur GPU
- Pas de filtrage GPU                    - LOD selection sur GPU
                                         - Systeme de particules (vivantes seulement)
```

### 3.2 Format du buffer indirect

```typescript
// Pour drawIndirect, le buffer contient 4 uint32 :
// [vertexCount, instanceCount, firstVertex, firstInstance]

// Pour drawIndexedIndirect, 5 uint32 :
// [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]

// Creer le buffer
const indirectBuffer = device.createBuffer({
  size: 20, // 5 * 4 bytes pour drawIndexedIndirect
  usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

// Un compute shader peut ecrire les parametres :
// Exemple : culling shader qui decide du nombre d'instances visibles
```

### 3.3 Compute shader de frustum culling + draw indirect

```wgsl
// frustum-cull.wgsl

struct DrawIndirectArgs {
  vertex_count: u32,
  instance_count: atomic<u32>,  // atomique car plusieurs threads l'incrementent
  first_vertex: u32,
  first_instance: u32,
}

struct BoundingSphere {
  center: vec3f,
  radius: f32,
}

@group(0) @binding(0) var<uniform> frustum_planes: array<vec4f, 6>;
@group(0) @binding(1) var<storage, read> objects: array<BoundingSphere>;
@group(0) @binding(2) var<storage, read_write> visible_indices: array<u32>;
@group(0) @binding(3) var<storage, read_write> draw_args: DrawIndirectArgs;

fn is_sphere_in_frustum(sphere: BoundingSphere) -> bool {
  for (var i = 0u; i < 6u; i++) {
    let plane = frustum_planes[i];
    let dist = dot(plane.xyz, sphere.center) + plane.w;
    if (dist < -sphere.radius) {
      return false; // entierement en dehors de ce plan
    }
  }
  return true;
}

@compute @workgroup_size(64)
fn cull(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&objects)) { return; }

  if (is_sphere_in_frustum(objects[i])) {
    // Objet visible : ajouter son index a la liste
    let slot = atomicAdd(&draw_args.instance_count, 1u);
    visible_indices[slot] = i;
  }
}
```

```typescript
// Cote TypeScript : reset du compteur, dispatch, puis draw indirect

// Reset le compteur d'instances visibles a 0
const resetData = new Uint32Array([36, 0, 0, 0, 0]); // indexCount=36, instanceCount=0
device.queue.writeBuffer(indirectBuffer, 0, resetData);

const encoder = device.createCommandEncoder();

// Compute pass : frustum culling
const computePass = encoder.beginComputePass();
computePass.setPipeline(cullPipeline);
computePass.setBindGroup(0, cullBindGroup);
computePass.dispatchWorkgroups(Math.ceil(objectCount / 64));
computePass.end();

// Render pass : dessiner seulement les objets visibles
const renderPass = encoder.beginRenderPass(renderPassDesc);
renderPass.setPipeline(renderPipeline);
renderPass.setBindGroup(0, renderBindGroup);
renderPass.setVertexBuffer(0, meshBuffer);
renderPass.setIndexBuffer(indexBuffer, 'uint16');
renderPass.drawIndexedIndirect(indirectBuffer, 0); // parametres lus depuis le GPU
renderPass.end();

device.queue.submit([encoder.finish()]);
```

---

## 4. Render bundles

### 4.1 Le problème : cout CPU de l'encodage

```
Sans render bundles :                  Avec render bundles :

Chaque frame :                         Une seule fois (initialisation) :
  encoder.beginRenderPass()              bundleEncoder = device.create...
  for (chaque objet) {                  for (chaque objet) {
    pass.setPipeline(...)                  bundle.setPipeline(...)
    pass.setBindGroup(...)                 bundle.setBindGroup(...)
    pass.setVertexBuffer(...)              bundle.setVertexBuffer(...)
    pass.draw(...)                         bundle.draw(...)
  }                                    }
  pass.end()                           renderBundle = bundle.finish()

CPU: ████████ (beaucoup de travail)    Chaque frame :
                                         pass.executeBundles([renderBundle])
                                       CPU: ██ (tres peu de travail)
```

### 4.2 Implementation

```typescript
// Creer le render bundle (une seule fois)
function createSceneBundle(
  device: GPUDevice,
  pipeline: GPURenderPipeline,
  objects: Array<{
    bindGroup: GPUBindGroup;
    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    indexCount: number;
  }>,
  format: GPUTextureFormat,
): GPURenderBundle {
  const bundleEncoder = device.createRenderBundleEncoder({
    colorFormats: [format],
    depthStencilFormat: 'depth24plus',
    sampleCount: 1,
  });

  bundleEncoder.setPipeline(pipeline);

  for (const obj of objects) {
    bundleEncoder.setBindGroup(0, obj.bindGroup);
    bundleEncoder.setVertexBuffer(0, obj.vertexBuffer);
    bundleEncoder.setIndexBuffer(obj.indexBuffer, 'uint16');
    bundleEncoder.drawIndexed(obj.indexCount);
  }

  return bundleEncoder.finish();
}

// Utiliser le bundle a chaque frame
function renderFrame(
  device: GPUDevice,
  context: GPUCanvasContext,
  depthTexture: GPUTexture,
  sceneBundle: GPURenderBundle,
): void {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });

  // Execute le bundle pre-enregistre (tres rapide)
  pass.executeBundles([sceneBundle]);

  pass.end();
  device.queue.submit([encoder.finish()]);
}
```

:::warning Limites des render bundles
Les render bundles sont **immutables**. Si la scene change (ajout/suppression d'objets, changement de pipeline), il faut en créer un nouveau. Ils sont plus utiles pour les parties statiques de la scene (decor, terrain) que pour les éléments dynamiques.
:::

---

## 5. Timestamp queries

### 5.1 Mesurer le temps GPU

```typescript
// Verifier que l'adaptateur supporte les timestamp queries
const adapter = await navigator.gpu!.requestAdapter();
const hasTimestamps = adapter!.features.has('timestamp-query');

const device = await adapter!.requestDevice({
  requiredFeatures: hasTimestamps ? ['timestamp-query'] : [],
});

if (!hasTimestamps) {
  console.warn('Timestamp queries non supportees');
}
```

### 5.2 Implementation

```typescript
function createTimingSystem(device: GPUDevice): {
  querySet: GPUQuerySet;
  resolveBuffer: GPUBuffer;
  readBuffer: GPUBuffer;
} {
  // Query set : contient les timestamps bruts
  const querySet = device.createQuerySet({
    type: 'timestamp',
    count: 2, // debut et fin
  });

  // Buffer pour resoudre les queries (GPU → buffer)
  const resolveBuffer = device.createBuffer({
    size: 2 * 8, // 2 timestamps * 8 bytes (uint64)
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });

  // Staging buffer pour lire cote CPU
  const readBuffer = device.createBuffer({
    size: 2 * 8,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  return { querySet, resolveBuffer, readBuffer };
}

async function measureRenderPassTime(
  device: GPUDevice,
  timing: ReturnType<typeof createTimingSystem>,
  renderPassDesc: GPURenderPassDescriptor,
  drawCommands: (pass: GPURenderPassEncoder) => void,
): Promise<number> {
  // Ajouter les timestamps au render pass
  const timedDesc = {
    ...renderPassDesc,
    timestampWrites: {
      querySet: timing.querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    },
  };

  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass(timedDesc);
  drawCommands(pass);
  pass.end();

  // Resoudre les queries (convertir en buffer lisible)
  encoder.resolveQuerySet(timing.querySet, 0, 2, timing.resolveBuffer, 0);

  // Copier vers le staging buffer
  encoder.copyBufferToBuffer(
    timing.resolveBuffer, 0,
    timing.readBuffer, 0,
    2 * 8,
  );

  device.queue.submit([encoder.finish()]);

  // Lire les resultats
  await timing.readBuffer.mapAsync(GPUMapMode.READ);
  const times = new BigUint64Array(timing.readBuffer.getMappedRange());

  const startNs = times[0];
  const endNs = times[1];
  const durationMs = Number(endNs - startNs) / 1_000_000;

  timing.readBuffer.unmap();

  return durationMs; // duree en millisecondes
}

// Utilisation
const timing = createTimingSystem(device);
const gpuTimeMs = await measureRenderPassTime(
  device, timing, renderPassDesc,
  (pass) => {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.drawIndexed(indexCount, instanceCount);
  },
);
console.log(`GPU render time: ${gpuTimeMs.toFixed(2)} ms`);
```

---

## 6. Occlusion queries

### 6.1 Principe

Les occlusion queries permettent de savoir si des fragments d'un draw call ont passe le depth test. Si aucun fragment n'est visible, l'objet est complètement occlude (cache).

```
Camera ─────▶ [Mur] [Cube cache]

Occlusion query pour le cube :
  → "0 fragments passes" = completement cache
  → On peut eviter de le dessiner en detail la frame suivante
```

### 6.2 Implementation

```typescript
// Creer le query set
const occlusionQuerySet = device.createQuerySet({
  type: 'occlusion',
  count: 100, // max 100 objets a tester
});

const occlusionResolveBuffer = device.createBuffer({
  size: 100 * 8, // 100 queries * 8 bytes (uint64)
  usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
});

// Dans le render pass
const pass = encoder.beginRenderPass({
  ...renderPassDesc,
  occlusionQuerySet, // attacher le query set
});

// Dessiner un bounding box simplifie pour chaque objet
for (let i = 0; i < objects.length; i++) {
  pass.beginOcclusionQuery(i); // debut du test pour l'objet i
  drawBoundingBox(pass, objects[i]); // dessine une boite simplifiee
  pass.endOcclusionQuery();          // fin du test
}

pass.end();

// Resoudre et lire les resultats
encoder.resolveQuerySet(occlusionQuerySet, 0, objects.length, occlusionResolveBuffer, 0);
// ... copier vers staging, mapAsync, lire les BigUint64Array ...
// Si result[i] == 0n → l'objet i est completement cache
```

---

## 7. Multiple Render Targets (MRT)

### 7.1 Écrire dans plusieurs textures simultanement

```
Render pass classique :               MRT (Multiple Render Targets) :

Fragment shader ecrit                  Fragment shader ecrit dans
dans 1 seule texture                   PLUSIEURS textures a la fois

    ┌───────────┐                         ┌───────────┐
    │ Fragment  │                         │ Fragment  │
    │  Shader   │                         │  Shader   │
    └─────┬─────┘                         └──┬──┬──┬──┘
          │                                  │  │  │
          ▼                                  ▼  ▼  ▼
    ┌───────────┐                    ┌────┐┌────┐┌────┐
    │  Couleur  │                    │Pos.││Norm││Alb.│
    │  (ecran)  │                    │    ││    ││    │
    └───────────┘                    └────┘└────┘└────┘

                                     = G-Buffer pour deferred rendering
```

### 7.2 Configuration du pipeline MRT

```typescript
// Fragment shader avec plusieurs sorties
const mrtShaderCode = `
  struct GBufferOutput {
    @location(0) position: vec4f,   // world position
    @location(1) normal: vec4f,     // world normal
    @location(2) albedo: vec4f,     // base color
  }

  @fragment
  fn fs_gbuffer(in: VertexOutput) -> GBufferOutput {
    var out: GBufferOutput;
    out.position = vec4f(in.world_pos, 1.0);
    out.normal = vec4f(normalize(in.world_normal), 0.0);
    out.albedo = textureSample(t_diffuse, s_diffuse, in.uv);
    return out;
  }
`;

// Pipeline avec 3 targets
const gbufferPipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module: shaderModule, entryPoint: 'vs_main', buffers: vertexBufferLayouts },
  fragment: {
    module: shaderModule,
    entryPoint: 'fs_gbuffer',
    targets: [
      { format: 'rgba16float' },  // position (haute precision)
      { format: 'rgba16float' },  // normal (haute precision)
      { format: 'rgba8unorm' },   // albedo
    ],
  },
  primitive: { topology: 'triangle-list', cullMode: 'back' },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
});

// Creer les textures du G-buffer
function createGBuffer(
  device: GPUDevice,
  width: number,
  height: number,
): { position: GPUTexture; normal: GPUTexture; albedo: GPUTexture; depth: GPUTexture } {
  const createTarget = (format: GPUTextureFormat) =>
    device.createTexture({
      size: { width, height },
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

  return {
    position: createTarget('rgba16float'),
    normal: createTarget('rgba16float'),
    albedo: createTarget('rgba8unorm'),
    depth: device.createTexture({
      size: { width, height },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }),
  };
}

// Render pass avec 3 color attachments
const gbufferPass = encoder.beginRenderPass({
  colorAttachments: [
    {
      view: gbuffer.position.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store',
    },
    {
      view: gbuffer.normal.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: 'clear',
      storeOp: 'store',
    },
    {
      view: gbuffer.albedo.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
  depthStencilAttachment: {
    view: gbuffer.depth.createView(),
    depthClearValue: 1.0,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  },
});
```

---

## 8. Deferred rendering complet

### 8.1 Architecture en 2 passes

```
PASSE 1 : G-Buffer                    PASSE 2 : Lighting
(geometrie → textures)                 (textures → ecran)

  Pour chaque objet :                   Quad plein ecran :
  ┌──────────────────┐                  ┌──────────────────┐
  │ Vertex shader    │                  │ Vertex shader    │
  │ (MVP transform)  │                  │ (quad 2D)        │
  └────────┬─────────┘                  └────────┬─────────┘
           │                                     │
  ┌────────▼─────────┐                  ┌────────▼─────────┐
  │ Fragment shader  │                  │ Fragment shader  │
  │ → position tex   │                  │ Lit les 3 textures│
  │ → normal tex     │                  │ Boucle sur les   │
  │ → albedo tex     │                  │ lumieres         │
  └──────────────────┘                  │ → couleur finale │
                                        └──────────────────┘

Avantage : les calculs d'eclairage ne se font que pour les
pixels VISIBLES. 100 lumieres → 1 passe geometrie + 1 passe lighting
au lieu de 100 passes de rendu.
```

### 8.2 Lighting pass — shader WGSL

```wgsl
// deferred-lighting.wgsl

struct Light {
  position: vec3f,
  radius: f32,
  color: vec3f,
  intensity: f32,
}

struct LightingUniforms {
  camera_pos: vec3f,
  num_lights: u32,
  lights: array<Light, 64>,
}

@group(0) @binding(0) var t_position: texture_2d<f32>;
@group(0) @binding(1) var t_normal: texture_2d<f32>;
@group(0) @binding(2) var t_albedo: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: LightingUniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Quad plein ecran genere sans vertex buffer
@vertex
fn vs_fullscreen(@builtin(vertex_index) vid: u32) -> VertexOutput {
  // 3 vertices d'un triangle qui couvre tout l'ecran
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  var uvs = array<vec2f, 3>(
    vec2f(0.0, 1.0),
    vec2f(2.0, 1.0),
    vec2f(0.0, -1.0),
  );

  var out: VertexOutput;
  out.position = vec4f(positions[vid], 0.0, 1.0);
  out.uv = uvs[vid];
  return out;
}

@fragment
fn fs_lighting(in: VertexOutput) -> @location(0) vec4f {
  let coords = vec2i(in.position.xy);

  // Lire les donnees du G-buffer
  let position = textureLoad(t_position, coords, 0).xyz;
  let normal = textureLoad(t_normal, coords, 0).xyz;
  let albedo = textureLoad(t_albedo, coords, 0).rgb;

  // Si la normale est nulle, c'est un pixel de fond (pas de geometrie)
  if (length(normal) < 0.01) {
    return vec4f(0.05, 0.05, 0.1, 1.0); // couleur de fond
  }

  let N = normalize(normal);
  let V = normalize(u.camera_pos - position);

  // Ambient
  var result = albedo * 0.1;

  // Accumuler l'eclairage de toutes les lumieres
  for (var i = 0u; i < u.num_lights; i++) {
    let light = u.lights[i];
    let to_light = light.position - position;
    let dist = length(to_light);

    // Ignorer si hors du rayon d'influence
    if (dist > light.radius) { continue; }

    let L = normalize(to_light);

    // Attenuation
    let falloff = 1.0 - (dist / light.radius);
    let attenuation = falloff * falloff;

    // Diffuse
    let diff = max(dot(N, L), 0.0);

    // Specular (Blinn-Phong)
    let H = normalize(L + V);
    let spec = pow(max(dot(N, H), 0.0), 64.0);

    result += (diff * albedo + spec * vec3f(0.5)) *
              light.color * light.intensity * attenuation;
  }

  // Tone mapping HDR → LDR
  result = result / (result + vec3f(1.0));

  return vec4f(result, 1.0);
}
```

### 8.3 Orchestration des deux passes

```typescript
function renderDeferred(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  context: GPUCanvasContext,
  gbuffer: GBuffer,
  gbufferPipeline: GPURenderPipeline,
  lightingPipeline: GPURenderPipeline,
  sceneBindGroups: GPUBindGroup[],
  lightingBindGroup: GPUBindGroup,
  objects: RenderObject[],
): void {
  // === PASSE 1 : G-Buffer ===
  const gbufferPass = encoder.beginRenderPass({
    colorAttachments: [
      { view: gbuffer.position.createView(), clearValue: { r:0,g:0,b:0,a:0 }, loadOp: 'clear', storeOp: 'store' },
      { view: gbuffer.normal.createView(), clearValue: { r:0,g:0,b:0,a:0 }, loadOp: 'clear', storeOp: 'store' },
      { view: gbuffer.albedo.createView(), clearValue: { r:0,g:0,b:0,a:1 }, loadOp: 'clear', storeOp: 'store' },
    ],
    depthStencilAttachment: {
      view: gbuffer.depth.createView(),
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  });

  gbufferPass.setPipeline(gbufferPipeline);
  for (let i = 0; i < objects.length; i++) {
    gbufferPass.setBindGroup(0, sceneBindGroups[i]);
    gbufferPass.setVertexBuffer(0, objects[i].vertexBuffer);
    gbufferPass.setIndexBuffer(objects[i].indexBuffer, 'uint16');
    gbufferPass.drawIndexed(objects[i].indexCount);
  }
  gbufferPass.end();

  // === PASSE 2 : Lighting ===
  const lightingPass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });

  lightingPass.setPipeline(lightingPipeline);
  lightingPass.setBindGroup(0, lightingBindGroup);
  lightingPass.draw(3); // triangle plein ecran (3 vertices, pas de buffer)
  lightingPass.end();
}
```

---

## 9. Texture arrays et cubemaps en WebGPU

### 9.1 Texture arrays

```typescript
// Creer un tableau de textures (meme taille, meme format)
const textureArray = device.createTexture({
  size: { width: 512, height: 512, depthOrArrayLayers: 8 }, // 8 layers
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});

// Ecrire dans une layer specifique
device.queue.writeTexture(
  { texture: textureArray, origin: { x: 0, y: 0, z: 3 } }, // layer 3
  imageData,
  { bytesPerRow: 512 * 4, rowsPerImage: 512 },
  { width: 512, height: 512, depthOrArrayLayers: 1 },
);

// Creer une vue sur tout le tableau
const arrayView = textureArray.createView({
  dimension: '2d-array',
});
```

```wgsl
// Dans le shader WGSL
@group(0) @binding(0) var t_array: texture_2d_array<f32>;
@group(0) @binding(1) var s: sampler;

@fragment
fn fs_main(@location(0) uv: vec2f, @location(1) layer: u32) -> @location(0) vec4f {
  // Echantillonner une layer specifique du tableau
  return textureSample(t_array, s, uv, layer);
}
```

### 9.2 Cubemaps en WebGPU

```typescript
// Creer une cubemap (6 faces)
const cubemapTexture = device.createTexture({
  size: { width: 1024, height: 1024, depthOrArrayLayers: 6 }, // 6 faces
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});

// Ecrire chaque face (z = index de la face)
// 0: +X, 1: -X, 2: +Y, 3: -Y, 4: +Z, 5: -Z
for (let face = 0; face < 6; face++) {
  device.queue.writeTexture(
    { texture: cubemapTexture, origin: { x: 0, y: 0, z: face } },
    faceData[face],
    { bytesPerRow: 1024 * 4, rowsPerImage: 1024 },
    { width: 1024, height: 1024, depthOrArrayLayers: 1 },
  );
}

// Vue cubemap
const cubemapView = cubemapTexture.createView({
  dimension: 'cube',
});
```

```wgsl
// Shader pour skybox WebGPU
@group(0) @binding(0) var t_skybox: texture_cube<f32>;
@group(0) @binding(1) var s_skybox: sampler;

@fragment
fn fs_skybox(@location(0) direction: vec3f) -> @location(0) vec4f {
  return textureSample(t_skybox, s_skybox, direction);
}
```

---

## 10. Mipmap génération avec compute shader

WebGPU ne fournit pas de `generateMipmaps()` comme WebGL. Il faut générer les mipmaps manuellement, typiquement avec un compute shader.

### 10.1 Compute shader de génération de mipmaps

```wgsl
// mipmap-gen.wgsl

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn generate_mip(@builtin(global_invocation_id) gid: vec3u) {
  let dst_dims = textureDimensions(dst);
  if (gid.x >= dst_dims.x || gid.y >= dst_dims.y) { return; }

  // Lire 4 texels du niveau source (2x2 block)
  let src_coord = vec2i(gid.xy) * 2;
  let a = textureLoad(src, src_coord + vec2i(0, 0), 0);
  let b = textureLoad(src, src_coord + vec2i(1, 0), 0);
  let c = textureLoad(src, src_coord + vec2i(0, 1), 0);
  let d = textureLoad(src, src_coord + vec2i(1, 1), 0);

  // Moyenne des 4 texels (box filter)
  let result = (a + b + c + d) * 0.25;

  textureStore(dst, gid.xy, result);
}
```

### 10.2 Pipeline TypeScript pour générer tous les niveaux

```typescript
function generateMipmaps(
  device: GPUDevice,
  texture: GPUTexture,
  width: number,
  height: number,
): void {
  const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;

  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: mipmapShaderCode }),
      entryPoint: 'generate_mip',
    },
  });

  const encoder = device.createCommandEncoder();

  for (let level = 1; level < mipLevelCount; level++) {
    const srcView = texture.createView({
      baseMipLevel: level - 1,
      mipLevelCount: 1,
    });
    const dstView = texture.createView({
      baseMipLevel: level,
      mipLevelCount: 1,
    });

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: dstView },
      ],
    });

    const mipWidth = Math.max(1, width >> level);
    const mipHeight = Math.max(1, height >> level);

    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(mipWidth / 8),
      Math.ceil(mipHeight / 8),
    );
    pass.end();
  }

  device.queue.submit([encoder.finish()]);
}

// Utilisation : creer la texture avec assez de mip levels
const mipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1;
const texture = device.createTexture({
  size: { width, height },
  format: 'rgba8unorm',
  mipLevelCount,
  usage: GPUTextureUsage.TEXTURE_BINDING
       | GPUTextureUsage.STORAGE_BINDING
       | GPUTextureUsage.COPY_DST,
});
// Ecrire le niveau 0, puis generer les mipmaps
device.queue.writeTexture({ texture }, imageData, { bytesPerRow: width * 4 }, { width, height });
generateMipmaps(device, texture, width, height);
```

---

## 11. Memory management

### 11.1 Buffer pooling

```typescript
// Reutiliser des buffers au lieu d'en creer/detruire en permanence

class BufferPool {
  private available: Map<number, GPUBuffer[]> = new Map();
  private inUse: Set<GPUBuffer> = new Set();

  constructor(private device: GPUDevice) {}

  acquire(size: number, usage: GPUBufferUsageFlags): GPUBuffer {
    // Arrondir a la puissance de 2 superieure (reduit la fragmentation)
    const alignedSize = this.nextPow2(size);

    const pool = this.available.get(alignedSize);
    if (pool && pool.length > 0) {
      const buffer = pool.pop()!;
      this.inUse.add(buffer);
      return buffer;
    }

    // Pas de buffer disponible → en creer un nouveau
    const buffer = this.device.createBuffer({ size: alignedSize, usage });
    this.inUse.add(buffer);
    return buffer;
  }

  release(buffer: GPUBuffer): void {
    if (!this.inUse.has(buffer)) return;
    this.inUse.delete(buffer);

    const size = buffer.size;
    if (!this.available.has(size)) {
      this.available.set(size, []);
    }
    this.available.get(size)!.push(buffer);
  }

  destroy(): void {
    for (const [, pool] of this.available) {
      for (const buf of pool) buf.destroy();
    }
    for (const buf of this.inUse) buf.destroy();
    this.available.clear();
    this.inUse.clear();
  }

  private nextPow2(n: number): number {
    let p = 256; // taille minimum
    while (p < n) p *= 2;
    return p;
  }
}
```

### 11.2 Suballocation — un gros buffer, plusieurs usages

```typescript
// Au lieu de creer 100 petits uniform buffers,
// creer 1 gros buffer et utiliser des offsets dynamiques

class UniformRingBuffer {
  private buffer: GPUBuffer;
  private offset = 0;
  private readonly alignment: number;

  constructor(
    private device: GPUDevice,
    private totalSize: number,
  ) {
    this.alignment = device.limits.minUniformBufferOffsetAlignment; // typiquement 256

    this.buffer = device.createBuffer({
      size: totalSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  // Allouer un slot dans le ring buffer
  allocate(data: Float32Array): { buffer: GPUBuffer; offset: number } {
    // Aligner l'offset
    const alignedOffset = Math.ceil(this.offset / this.alignment) * this.alignment;

    if (alignedOffset + data.byteLength > this.totalSize) {
      // Ring buffer plein → revenir au debut
      this.offset = 0;
      return this.allocate(data);
    }

    this.device.queue.writeBuffer(this.buffer, alignedOffset, data);
    this.offset = alignedOffset + data.byteLength;

    return { buffer: this.buffer, offset: alignedOffset };
  }

  // Reset en debut de frame
  reset(): void {
    this.offset = 0;
  }

  getBuffer(): GPUBuffer { return this.buffer; }
}

// Utilisation avec dynamic offsets dans le bind group
const bindGroup = device.createBindGroup({
  layout: pipelineLayout.getBindGroupLayout(0),
  entries: [{
    binding: 0,
    resource: {
      buffer: ringBuffer.getBuffer(),
      offset: 0,          // offset de base (sera ajoute au dynamic offset)
      size: 256,           // taille d'un slot
    },
  }],
});

// Au rendu, passer le dynamic offset
for (const obj of objects) {
  const { offset } = ringBuffer.allocate(obj.uniformData);
  pass.setBindGroup(0, bindGroup, [offset]); // dynamic offset
  pass.drawIndexed(obj.indexCount);
}
```

---

## 12. WebGPU best practices

### 12.1 Minimiser les changements de pipeline

```typescript
// MAUVAIS : alterner entre pipelines
for (const obj of objects) {
  pass.setPipeline(obj.pipeline);    // changement frequente
  pass.draw(obj.count);
}

// BON : trier par pipeline, puis dessiner
objects.sort((a, b) => a.pipelineId - b.pipelineId);

let currentPipeline: GPURenderPipeline | null = null;
for (const obj of objects) {
  if (obj.pipeline !== currentPipeline) {
    pass.setPipeline(obj.pipeline);
    currentPipeline = obj.pipeline;
  }
  pass.setBindGroup(0, obj.bindGroup);
  pass.setVertexBuffer(0, obj.vertexBuffer);
  pass.draw(obj.count);
}
```

### 12.2 Tableau des bonnes pratiques

| Pratique | Impact | Recommandation |
|----------|--------|----------------|
| Tri par pipeline | Reduit les state changes | Trier les objets par materiau/pipeline |
| Render bundles | Reduit le travail CPU | Pre-enregistrer les draw calls statiques |
| Instanced draw | Reduit les draw calls | 1 call pour N copies du même mesh |
| Indirect draw | Eliminle le readback GPU→CPU | Le GPU decide du nombre d'instances |
| Buffer pooling | Reduit les allocations | Reutiliser les buffers entre frames |
| Ring buffer | Reduit le nombre de buffers | 1 gros buffer uniforms avec dynamic offsets |
| Taille des workgroups | Occupancy GPU | 64 ou 256, multiple de 32 |
| `loadOp: 'clear'` | Evite un load mémoire | Toujours `clear` si on redessine tout |
| `storeOp: 'discard'` | Evite un store mémoire | `discard` pour le depth si pas relu |
| Mipmaps | Qualite + performance | Toujours générer des mipmaps pour les textures 3D |

---

## 13. Comparaison finale WebGL vs WebGPU

| Critere | WebGL 2 | WebGPU |
|---------|---------|--------|
| **Paradigme** | State machine (bind, enable, disable) | Command-based (objets immutables) |
| **Langage shader** | GLSL ES 3.00 | WGSL |
| **Compute shaders** | Non | Oui (`GPUComputePipeline`) |
| **Validation** | Au draw call (tardive, parfois silencieuse) | A la création (fail-fast, explicite) |
| **Multi-threading** | Non (tout sur le main thread) | Oui (encodage sur workers possible) |
| **Draw indirect** | Via extension (`ANGLE_multi_draw`) | Natif (`drawIndirect`, `drawIndexedIndirect`) |
| **Render bundles** | Non | Oui |
| **Timestamp queries** | Via extension (limitee) | Feature standard |
| **MRT** | Oui (jusqu'a 8 targets) | Oui (jusqu'a 8 targets) |
| **Instanced rendering** | Oui (`drawArraysInstanced`) | Oui (instance step mode + `@builtin(instance_index)`) |
| **Memory management** | Automatique (driver) | Explicite (usage flags, staging buffers) |
| **Compatibilite** | Quasi universelle (98%+ des navigateurs) | Chrome 113+, Firefox 121+, Safari 18+ |
| **Performance brute** | Bonne | Meilleure (moins d'overhead CPU, compute) |
| **Courbe d'apprentissage** | Moderee | Raide (plus de concepts à maîtriser) |
| **Ecosysteme** | Très mature (Three.js, Babylon.js) | En croissance (Three.js WebGPU backend, wgpu) |

### Quand utiliser quoi ?

```
Choisir WebGL si :                      Choisir WebGPU si :

✓ Compatibilite maximale requise        ✓ Beaucoup de draw calls (> 1000)
  (anciens navigateurs, mobiles)        ✓ Besoin de compute shaders
✓ Petit projet / prototype rapide      ✓ Scene complexe (deferred, MRT)
✓ Equipe habituee a OpenGL             ✓ Performance CPU critique
✓ Three.js suffit (abstraction)        ✓ Projet nouveau, cible moderne
✓ Pas besoin de compute                ✓ Simulation GPU (particules, physique)

→ La plupart des projets 3D web        → Projets ambitieux, jeux AAA web,
  fonctionnent tres bien avec            outils de visualisation scientifique,
  Three.js qui abstrait les deux.        applications GPU-intensive.
```

---

## 14. Exercice pratique

### Enonce

Implementez un **deferred renderer simple** en WebGPU :

1. **G-Buffer pass** : dessinez 5 cubes avec des couleurs différentes. Ecrivez dans 3 textures (position, normal, albedo)
2. **Lighting pass** : dessinez un quad plein ecran qui lit le G-buffer et calcule l'eclairage de 4 lumieres ponctuelles
3. Ajoutez un **toggle** (touche espace) pour afficher chaque couche du G-buffer individuellement (debug view)
4. Utilisez des **timestamp queries** pour mesurer le temps GPU de chaque passe

**Bonus :**
- Ajouter une lumiere qui suit la souris
- Implementer un simple tone mapping (Reinhard)

<details>
<summary>Voir la solution</summary>

```wgsl
// gbuffer.wgsl — G-Buffer pass

struct Uniforms {
  model: mat4x4f,
  view_proj: mat4x4f,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) clip_pos: vec4f,
  @location(0) world_pos: vec3f,
  @location(1) world_normal: vec3f,
}

@vertex
fn vs_gbuffer(
  @location(0) pos: vec3f,
  @location(1) normal: vec3f,
) -> VertexOutput {
  let world = u.model * vec4f(pos, 1.0);
  var out: VertexOutput;
  out.clip_pos = u.view_proj * world;
  out.world_pos = world.xyz;
  out.world_normal = (u.model * vec4f(normal, 0.0)).xyz;
  return out;
}

struct GBufferOutput {
  @location(0) position: vec4f,
  @location(1) normal: vec4f,
  @location(2) albedo: vec4f,
}

@fragment
fn fs_gbuffer(in: VertexOutput) -> GBufferOutput {
  var out: GBufferOutput;
  out.position = vec4f(in.world_pos, 1.0);
  out.normal = vec4f(normalize(in.world_normal), 0.0);
  out.albedo = u.color;
  return out;
}
```

```wgsl
// lighting.wgsl — Lighting pass + debug views

struct Light {
  position: vec3f,
  radius: f32,
  color: vec3f,
  intensity: f32,
}

struct LightUniforms {
  camera_pos: vec4f,
  num_lights: u32,
  debug_mode: u32,  // 0=final, 1=position, 2=normal, 3=albedo
  _pad: vec2f,
  lights: array<Light, 8>,
}

@group(0) @binding(0) var t_pos: texture_2d<f32>;
@group(0) @binding(1) var t_norm: texture_2d<f32>;
@group(0) @binding(2) var t_alb: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: LightUniforms;

@vertex
fn vs_quad(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0),
  );
  return vec4f(pos[vid], 0.0, 1.0);
}

@fragment
fn fs_lighting(@builtin(position) frag_pos: vec4f) -> @location(0) vec4f {
  let coords = vec2i(frag_pos.xy);
  let pos = textureLoad(t_pos, coords, 0).xyz;
  let normal = textureLoad(t_norm, coords, 0).xyz;
  let albedo = textureLoad(t_alb, coords, 0).rgb;

  // Debug views
  if (u.debug_mode == 1u) { return vec4f(pos * 0.2 + 0.5, 1.0); }
  if (u.debug_mode == 2u) { return vec4f(normal * 0.5 + 0.5, 1.0); }
  if (u.debug_mode == 3u) { return vec4f(albedo, 1.0); }

  // Pas de geometrie → fond
  if (length(normal) < 0.01) {
    return vec4f(0.02, 0.02, 0.05, 1.0);
  }

  let N = normalize(normal);
  let V = normalize(u.camera_pos.xyz - pos);
  var result = albedo * 0.08; // ambient

  for (var i = 0u; i < u.num_lights; i++) {
    let light = u.lights[i];
    let L_vec = light.position - pos;
    let dist = length(L_vec);
    if (dist > light.radius) { continue; }

    let L = normalize(L_vec);
    let falloff = 1.0 - dist / light.radius;
    let atten = falloff * falloff;

    let diff = max(dot(N, L), 0.0);
    let H = normalize(L + V);
    let spec = pow(max(dot(N, H), 0.0), 64.0);

    result += (diff * albedo + spec * vec3f(0.3)) *
              light.color * light.intensity * atten;
  }

  // Reinhard tone mapping
  result = result / (result + vec3f(1.0));

  return vec4f(result, 1.0);
}
```

```typescript
// main.ts — Deferred rendering orchestration

async function main() {
  // ... init device, context, format ...

  const gbuffer = createGBuffer(device, canvas.width, canvas.height);

  // 5 cubes avec couleurs differentes
  const cubes = [
    { pos: [-3, 0, 0], color: [1.0, 0.2, 0.2, 1.0] },
    { pos: [-1.5, 0, 0], color: [0.2, 1.0, 0.2, 1.0] },
    { pos: [0, 0, 0], color: [0.2, 0.2, 1.0, 1.0] },
    { pos: [1.5, 0, 0], color: [1.0, 1.0, 0.2, 1.0] },
    { pos: [3, 0, 0], color: [1.0, 0.2, 1.0, 1.0] },
  ];

  // 4 lumieres
  const lights = [
    { position: [2, 3, 2], radius: 10, color: [1, 1, 1], intensity: 1.5 },
    { position: [-2, 2, -1], radius: 8, color: [1, 0.3, 0.3], intensity: 1.2 },
    { position: [0, 1, 3], radius: 8, color: [0.3, 0.3, 1], intensity: 1.0 },
    { position: [0, 4, 0], radius: 12, color: [0.3, 1, 0.3], intensity: 0.8 },
  ];

  let debugMode = 0; // 0=final, 1=position, 2=normal, 3=albedo
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      debugMode = (debugMode + 1) % 4;
      console.log(`Debug mode: ${['Final', 'Position', 'Normal', 'Albedo'][debugMode]}`);
    }
  });

  // Timestamp queries (si supportees)
  const hasTimestamps = device.features.has('timestamp-query');
  let querySet: GPUQuerySet | null = null;
  let resolveBuffer: GPUBuffer | null = null;

  if (hasTimestamps) {
    querySet = device.createQuerySet({ type: 'timestamp', count: 4 }); // 2 par passe
    resolveBuffer = device.createBuffer({
      size: 4 * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
  }

  function frame(): void {
    const encoder = device.createCommandEncoder();

    // G-Buffer pass
    const gbufferPass = encoder.beginRenderPass({
      colorAttachments: [
        { view: gbuffer.position.createView(), clearValue: {r:0,g:0,b:0,a:0}, loadOp:'clear', storeOp:'store' },
        { view: gbuffer.normal.createView(), clearValue: {r:0,g:0,b:0,a:0}, loadOp:'clear', storeOp:'store' },
        { view: gbuffer.albedo.createView(), clearValue: {r:0,g:0,b:0,a:1}, loadOp:'clear', storeOp:'store' },
      ],
      depthStencilAttachment: {
        view: gbuffer.depth.createView(),
        depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store',
      },
      ...(hasTimestamps ? {
        timestampWrites: { querySet: querySet!, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
      } : {}),
    });

    gbufferPass.setPipeline(gbufferPipeline);
    for (const cube of cubes) {
      // Mettre a jour les uniforms du cube (model matrix + couleur)
      // ... writeBuffer ...
      gbufferPass.setBindGroup(0, cube.bindGroup);
      gbufferPass.setVertexBuffer(0, cubeVertexBuffer);
      gbufferPass.setIndexBuffer(cubeIndexBuffer, 'uint16');
      gbufferPass.drawIndexed(36);
    }
    gbufferPass.end();

    // Lighting pass
    // Mettre a jour les uniforms de lighting (lumieres + debug mode)
    const lightData = new ArrayBuffer(288); // camera(16) + counts(16) + 8*lights(256)
    const f32 = new Float32Array(lightData);
    const u32 = new Uint32Array(lightData);
    // camera_pos
    f32[0] = 0; f32[1] = 3; f32[2] = 8; f32[3] = 1;
    // num_lights, debug_mode
    u32[4] = lights.length;
    u32[5] = debugMode;
    // lights data
    for (let i = 0; i < lights.length; i++) {
      const base = 8 + i * 8;
      f32[base] = lights[i].position[0];
      f32[base+1] = lights[i].position[1];
      f32[base+2] = lights[i].position[2];
      f32[base+3] = lights[i].radius;
      f32[base+4] = lights[i].color[0];
      f32[base+5] = lights[i].color[1];
      f32[base+6] = lights[i].color[2];
      f32[base+7] = lights[i].intensity;
    }
    device.queue.writeBuffer(lightUniformBuffer, 0, lightData);

    const lightingPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
      ...(hasTimestamps ? {
        timestampWrites: { querySet: querySet!, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 },
      } : {}),
    });

    lightingPass.setPipeline(lightingPipeline);
    lightingPass.setBindGroup(0, lightingBindGroup);
    lightingPass.draw(3);
    lightingPass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
```

**Points clés :**
- Le G-buffer utilise `rgba16float` pour la position et les normales (précision suffisante)
- Le lighting pass utilise un triangle surdimensionne (3 vertices) au lieu d'un quad (6 vertices)
- Le debug mode permet de visualiser chaque couche du G-buffer
- Les timestamp queries mesurent le cout de chaque passe
- Le Reinhard tone mapping `color / (color + 1)` convertit HDR en LDR de façon douce

</details>

---

## Résumé

| Concept | Description |
|---------|-------------|
| Instanced rendering | `stepMode: 'instance'` + `drawIndexed(count, instanceCount)` |
| `@builtin(instance_index)` | Index de l'instance courante dans le vertex shader |
| Draw indirect | `drawIndirect(buffer, offset)` — paramètres lus depuis un GPUBuffer |
| Frustum culling GPU | Compute shader écrit le nombre d'instances dans un indirect buffer |
| Render bundles | Commandes pre-enregistrees via `GPURenderBundleEncoder` |
| Timestamp queries | `timestampWrites` dans le render pass + `resolveQuerySet` |
| Occlusion queries | `beginOcclusionQuery(i)` / `endOcclusionQuery()` dans un render pass |
| MRT (Multiple Render Targets) | Fragment shader retourne plusieurs `@location(N)` |
| G-Buffer | Textures separees pour position, normale, albedo |
| Deferred rendering | G-buffer pass (geometrie) + lighting pass (eclairage) |
| Texture arrays | `texture_2d_array<f32>`, `depthOrArrayLayers: N` |
| Cubemaps WebGPU | `dimension: 'cube'`, `texture_cube<f32>` |
| Mipmap génération | Compute shader avec box filter, 1 dispatch par level |
| Buffer pooling | Reutiliser des buffers pour éviter les allocations |
| Ring buffer | 1 gros uniform buffer avec dynamic offsets |
| Tri par pipeline | Minimiser les `setPipeline` dans un render pass |
| WebGL vs WebGPU | WebGL = compatible partout, WebGPU = performant + compute |

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [11 — Compute shaders et GPGPU](./11-compute-shaders-gpgpu.md) | [13 — Three.js fondamentaux](./13-threejs-fondamentaux.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 12 webgpu avance](../screencasts/screencast-12-webgpu-avance.md)
2. **Lab** : [lab-12-webgpu-avance](../labs/lab-12-webgpu-avance/README)
3. **Quiz** : [quiz 12 webgpu avance](../quizzes/quiz-12-webgpu-avance.html)
:::
