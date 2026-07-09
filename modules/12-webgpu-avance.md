---
titre: WebGPU avancé
cours: 20-webgpu-3d
notions:
  - "instanced rendering (stepMode 'instance', @builtin(instance_index))"
  - "buffer d'instances (arrayStride, attributs par instance)"
  - "drawIndexedIndirect / drawIndirect (paramètres lus depuis un GPUBuffer)"
  - "format du buffer indirect (5 u32 indexé, 4 u32 non indexé)"
  - "render to texture (RENDER_ATTACHMENT + TEXTURE_BINDING)"
  - "rendu multi-pass (passe A écrit une texture, passe B la lit)"
  - "timestamp queries (timestampWrites, resolveQuerySet)"
  - "feature 'timestamp-query' et lecture BigUint64Array"
  - "MSAA (sampleCount > 1, resolveTarget)"
  - "gestion mémoire GPU (buffer pooling, ring buffer d'uniforms, dynamic offsets)"
outcomes:
  - sait dessiner des milliers de copies d'un mesh en un seul draw call via l'instancing (stepMode 'instance')
  - sait laisser le GPU décider du nombre d'objets à dessiner avec drawIndexedIndirect et un buffer indirect
  - sait rendre dans une texture puis la relire dans une seconde passe (render to texture, multi-pass)
  - sait mesurer le temps GPU d'une passe avec les timestamp queries et lire le résultat côté CPU
  - sait activer le MSAA (sampleCount + resolveTarget) et réduire les allocations avec un buffer pool / ring buffer
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "09-webgpu-architecture-et-wgsl (adapter/device, WGSL, GPUBuffer, usage flags)"
  - "10-render-pipeline-et-bind-groups (render pipeline, bind groups, uniforms, command encoder, render pass)"
  - "11-compute-shaders-et-gpgpu (compute pass, storage buffers, dispatchWorkgroups, staging buffer, mapAsync)"
next: 13-threejs-fondamentaux
libs: []
tribuzen: "moteur 3D TribuZen — passage à l'échelle : rendre des milliers de marqueurs de sorties sur le globe en un seul draw call (instancing), et mesurer le coût GPU réel de la frame (timestamp queries)"
last-reviewed: 2026-07
---

# WebGPU avancé

> **Outcomes — tu sauras FAIRE :** dessiner des milliers de copies d'un mesh en un draw call (instancing), laisser le GPU décider quoi dessiner (`drawIndexedIndirect`), rendre dans une texture puis la relire (multi-pass), mesurer le temps GPU d'une passe (timestamp queries), et activer le MSAA + réduire les allocations (buffer pool, ring buffer).
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** ce module suppose acquis le pipeline WebGPU (module 10) et le compute (module 11). On assemble maintenant les **techniques qui font passer à l'échelle** : de « ça affiche » à « ça affiche 10 000 objets à 60 fps, et je sais combien de millisecondes GPU ça coûte ».

## 1. Cas concret d'abord

Depuis le module 06, TribuZen affiche des marqueurs de sorties. Au module 10 on a un vrai pipeline WebGPU : un marqueur = un mesh, une model matrix, une couleur. Ça marche… pour **quelques dizaines** de marqueurs.

Mais le globe de TribuZen doit afficher **toutes les sorties de toutes les familles** : des milliers de points. Le réflexe naïf — une boucle CPU, un `setBindGroup` + un `draw` par marqueur — s'effondre :

```typescript
// ❌ Un draw call PAR marqueur : le CPU s'écroule bien avant le GPU
for (const sortie of sorties) {           // 5000 sorties
  device.queue.writeBuffer(uboMarker, 0, sortie.modelMatrix);
  pass.setBindGroup(0, sortie.bindGroup);
  pass.setVertexBuffer(0, markerMesh);
  pass.drawIndexed(markerIndexCount);      // 5000 draw calls → CPU-bound
}
```

Le GPU est capable de dessiner ces milliers de marqueurs sans transpirer. Le goulot, c'est le **CPU** : 5000 fois par frame, encoder les commandes, lier un bind group, poser un draw call. Le thread principal sature, la frame dépasse 16 ms, ça saccade — alors que le GPU était presque inactif.

La solution tient en un mot : **instancing**. Un seul mesh, un seul draw call, un buffer qui contient les 5000 positions/couleurs, et le GPU se débrouille. En plus, on veut **savoir** combien de temps la frame coûte réellement côté GPU (timestamp queries) pour décider où optimiser, laisser le GPU **filtrer** les marqueurs hors écran (`drawIndexedIndirect`), et lisser les bords (MSAA).

Ce module pose ces techniques une par une, sur ce fil rouge : **rendre des milliers de marqueurs, et mesurer ce que ça coûte**.

---

## 2. Théorie complète, concise

### 2.1 Instanced rendering : un draw call, N copies

L'instancing dessine le **même mesh** plusieurs fois en **un seul draw call**. Chaque copie (instance) reçoit des données propres : position, couleur, échelle. Le dernier argument de `draw`/`drawIndexed` est le **nombre d'instances** :

```typescript
// drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance)
pass.drawIndexed(markerIndexCount, 5000); // 1 appel → 5000 marqueurs
```

Deux façons d'alimenter les données par instance :

1. **Vertex buffer avec `stepMode: 'instance'`** — un second buffer dont le curseur avance **une fois par instance** (au lieu d'une fois par sommet). C'est la voie détaillée ici.
2. Un **storage buffer** indexé par `@builtin(instance_index)` dans le shader (utile quand les données par instance sont volumineuses ou calculées par un compute shader).

### 2.2 Le layout du buffer d'instances (`stepMode: 'instance'`)

Un pipeline peut déclarer **plusieurs vertex buffers**. Le buffer 0 porte la géométrie (par sommet), le buffer 1 les données par instance. La clé est `stepMode`:

```typescript
const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module,
    entryPoint: 'vs_main',
    buffers: [
      // Buffer 0 — géométrie du mesh, avance PAR SOMMET
      {
        arrayStride: 24,                 // 3 pos + 3 normal = 6 floats × 4 octets
        stepMode: 'vertex',
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // position
          { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
        ],
      },
      // Buffer 1 — données par instance, avance PAR INSTANCE
      {
        arrayStride: 32,                 // vec3 offset + f32 scale + vec4 color = 8 floats
        stepMode: 'instance',            // ← le curseur avance à chaque instance
        attributes: [
          { shaderLocation: 2, offset: 0,  format: 'float32x3' }, // offset monde
          { shaderLocation: 3, offset: 12, format: 'float32'   }, // scale
          { shaderLocation: 4, offset: 16, format: 'float32x4' }, // couleur RGBA
        ],
      },
    ],
  },
  fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
  primitive: { topology: 'triangle-list', cullMode: 'back' },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
});
```

`arrayStride` est **la taille d'un élément en octets** (piège classique : c'est en octets, pas en floats). Pour passer une `mat4x4` par instance, il faut **4 attributs `float32x4`** (un attribut ne peut pas dépasser un `vec4`).

### 2.3 Le shader : géométrie + instance dans le même vertex

Côté WGSL, les attributs par sommet et par instance arrivent **au même endroit** : le vertex shader les reçoit tous par `@location`. `@builtin(instance_index)` donne en plus l'indice de l'instance courante (utile pour indexer un storage buffer).

```wgsl
struct VertexInput {
  @location(0) position: vec3f,   // par sommet
  @location(1) normal:   vec3f,   // par sommet
  @location(2) offset:   vec3f,   // par instance
  @location(3) scale:    f32,     // par instance
  @location(4) color:    vec4f,   // par instance
}

struct Uniforms { view_proj: mat4x4f }
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
  @builtin(position) clip_pos: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  // Position monde = sommet mis à l'échelle puis translaté par les données d'instance
  let world = in.position * in.scale + in.offset;
  var out: VertexOutput;
  out.clip_pos = u.view_proj * vec4f(world, 1.0);
  out.color = in.color;
  return out;
}
```

### 2.4 Draw indirect : le GPU décide quoi dessiner

En dessin **direct**, le CPU passe les paramètres du draw (`drawIndexed(indexCount, instanceCount)`). En dessin **indirect**, ces paramètres sont **lus depuis un GPUBuffer** :

```typescript
// drawIndexedIndirect(indirectBuffer, indirectOffset)  — offset multiple de 4
pass.drawIndexedIndirect(indirectBuffer, 0);
```

Intérêt : un **compute shader** peut écrire ces paramètres sans que le CPU les connaisse. Cas typique du globe TribuZen : un compute fait le **frustum culling** (ne garder que les marqueurs visibles à l'écran) et écrit lui-même le nombre d'instances à dessiner — le CPU n'a jamais la liste, tout reste sur le GPU (pas de readback coûteux).

Le format du buffer indirect est **fixe** (vérifié sur MDN) :

```typescript
// drawIndexedIndirect → 5 × u32 (20 octets) :
//   [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
// drawIndirect (non indexé) → 4 × u32 (16 octets) :
//   [vertexCount, instanceCount, firstVertex, firstInstance]

const indirectBuffer = device.createBuffer({
  size: 20,                                       // 5 u32
  usage: GPUBufferUsage.INDIRECT                  // ← flag OBLIGATOIRE
       | GPUBufferUsage.STORAGE                   // pour qu'un compute l'écrive
       | GPUBufferUsage.COPY_DST,
});
```

Le flag `GPUBufferUsage.INDIRECT` est obligatoire. `instanceCount` initialisé à 0, incrémenté par le compute via `atomicAdd` (un `instance_count: atomic<u32>` dans le struct WGSL) — c'est exactement le pattern atomique vu au module 11.

### 2.5 Render to texture & rendu multi-pass

Jusqu'ici, une passe de rendu écrit dans la texture du canvas (l'écran). Mais un `colorAttachment` peut viser **n'importe quelle texture** créée avec l'usage `RENDER_ATTACHMENT`. Si on lui ajoute aussi `TEXTURE_BINDING`, une **seconde passe** peut la relire comme entrée :

```typescript
// Texture cible d'une première passe, relue par une seconde
const sceneTexture = device.createTexture({
  size: { width, height },
  format: 'rgba8unorm',
  usage: GPUTextureUsage.RENDER_ATTACHMENT   // passe A écrit dedans
       | GPUTextureUsage.TEXTURE_BINDING,    // passe B la lit comme entrée
});
```

Le schéma **multi-pass** :

```
PASSE A (rendu → texture)          PASSE B (texture → écran)
  colorAttachment =                   colorAttachment = canvas
    sceneTexture.createView()         bindGroup lit sceneTexture
  dessine la scène                    quad plein écran (post-traitement)
        │                                     ▲
        └──── sceneTexture ───────────────────┘
```

C'est le socle de **tout** ce qui est post-traitement : bloom, flou, effets d'écran, mais aussi le **deferred rendering** (passe géométrie → G-buffer de plusieurs textures, puis passe lighting qui les lit). Le quad plein écran de la passe B se génère **sans vertex buffer**, avec un triangle surdimensionné indexé par `@builtin(vertex_index)`:

```wgsl
@vertex
fn vs_fullscreen(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4f {
  // Un seul triangle qui déborde de l'écran couvre tout le viewport
  var p = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(p[vid], 0.0, 1.0);
}
```

### 2.6 Timestamp queries : mesurer le temps GPU

`console.time` mesure le temps **CPU** d'encodage, pas le temps **GPU** réel. Pour mesurer le GPU, WebGPU fournit les **timestamp queries**, derrière une feature à demander explicitement à la création du device :

```typescript
const adapter = await navigator.gpu.requestAdapter();
const canTimestamp = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({
  requiredFeatures: canTimestamp ? ['timestamp-query'] : [],
});
```

On attache deux écritures de timestamp (début/fin) à la passe via `timestampWrites`, puis on **résout** le query set vers un buffer, qu'on relit comme au module 11 (staging + `mapAsync`). Les valeurs sont en **nanosecondes**, stockées en `uint64` → on les lit en `BigUint64Array`:

```typescript
const querySet = device.createQuerySet({ type: 'timestamp', count: 2 }); // début + fin
const resolve  = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
const readback = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

const pass = encoder.beginRenderPass({
  colorAttachments: [/* ... */],
  timestampWrites: {
    querySet,
    beginningOfPassWriteIndex: 0,  // timestamp au début de la passe → index 0
    endOfPassWriteIndex: 1,        // timestamp à la fin → index 1
  },
});
// ... dessin ...
pass.end();

// Résoudre le query set (u64 bruts) → buffer, puis copier vers le staging
encoder.resolveQuerySet(querySet, 0, 2, resolve, 0); // destinationOffset multiple de 256
encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16);
device.queue.submit([encoder.finish()]);

await readback.mapAsync(GPUMapMode.READ);
const ts = new BigUint64Array(readback.getMappedRange());
const durationMs = Number(ts[1] - ts[0]) / 1_000_000; // ns → ms
readback.unmap();
```

> **FLAG :** ne jamais lire le même buffer que celui en cours de `mapAsync` (il est verrouillé le temps du mapping). Comme pour le compute, on relit une frame en retard, pas la frame courante.

### 2.7 MSAA : lisser les bords

Sans anti-aliasing, les bords des marqueurs « crénellent » (marches d'escalier). Le **MSAA** (Multi-Sample Anti-Aliasing) rend dans une texture **multi-échantillonnée** (`sampleCount: 4`), puis **résout** vers une texture mono-échantillon. Trois points à aligner (vérifiés sur MDN) :

- le **pipeline** déclare `multisample: { count: 4 }` ;
- la texture cible (`view`) a `sampleCount: 4` ;
- le `colorAttachment` fournit un `resolveTarget` dont la texture a `sampleCount: 1` (souvent le canvas).

```typescript
const msaaTexture = device.createTexture({
  size: { width, height },
  sampleCount: 4,                                // multi-échantillon
  format,
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: msaaTexture.createView(),              // on dessine dans le multi-sample
    resolveTarget: context.getCurrentTexture().createView(), // résolu vers le canvas (sampleCount 1)
    clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
    loadOp: 'clear',
    storeOp: 'store',
  }],
});
```

### 2.8 Gestion mémoire : buffer pool & ring buffer

Créer/détruire des `GPUBuffer` à chaque frame fragmente la mémoire et coûte cher. Deux patterns clés :

- **Buffer pooling** — recycler les buffers relâchés au lieu d'en recréer. On indexe un pool par taille (arrondie à la puissance de 2 supérieure pour limiter la fragmentation) ; `acquire()` réutilise un buffer libre ou en crée un, `release()` le rend au pool.
- **Ring buffer d'uniforms + dynamic offsets** — au lieu de N petits uniform buffers, **un seul gros buffer** ; chaque objet écrit à un offset aligné sur `device.limits.minUniformBufferOffsetAlignment` (souvent 256). Le bind group est déclaré avec `hasDynamicOffset: true`, et on passe l'offset au moment du draw :

```typescript
// Un seul bind group, un offset dynamique par objet (offset multiple de 256)
for (const obj of objects) {
  const offset = ring.write(obj.uniformData); // écrit dans le gros buffer, renvoie l'offset aligné
  pass.setBindGroup(0, bindGroup, [offset]);  // 3e arg = tableau des dynamic offsets
  pass.drawIndexed(obj.indexCount);
}
```

Règle générale de perf WebGPU : **minimiser les changements d'état** (trier les objets par pipeline pour éviter les `setPipeline` répétés) et **réduire le nombre d'objets GPU** (pooling, instancing).

---

## 3. Worked examples

### Exemple 1 — Instancing : 5000 marqueurs en un draw call (TribuZen)

On rend 5000 marqueurs, chacun avec sa position/échelle/couleur, en **un seul** `drawIndexed`. Le mesh du marqueur (un quad) tient dans le buffer 0 ; les 5000 instances dans le buffer 1.

```typescript
const INSTANCE_COUNT = 5000;
const FLOATS_PER_INSTANCE = 8;   // vec3 offset + f32 scale + vec4 color

// 1. Générer les données d'instance (offset, scale, couleur par sortie)
const data = new Float32Array(INSTANCE_COUNT * FLOATS_PER_INSTANCE);
for (let i = 0; i < INSTANCE_COUNT; i++) {
  const b = i * FLOATS_PER_INSTANCE;
  data[b + 0] = (Math.random() - 0.5) * 40;   // offset.x
  data[b + 1] = (Math.random() - 0.5) * 40;   // offset.y
  data[b + 2] = (Math.random() - 0.5) * 40;   // offset.z
  data[b + 3] = 0.2 + Math.random() * 0.3;    // scale
  data[b + 4] = 0.1; data[b + 5] = 0.8;       // couleur (vert = sortie bouclée)
  data[b + 6] = 0.3; data[b + 7] = 1.0;
}

// 2. Uploader le buffer d'instances (usage VERTEX)
const instanceBuffer = device.createBuffer({
  size: data.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(instanceBuffer, 0, data);

// 3. Dessiner : les DEUX vertex buffers, puis UN seul draw call instancié
const pass = encoder.beginRenderPass(renderPassDesc);
pass.setPipeline(pipeline);            // pipeline avec les 2 buffers (§2.2)
pass.setBindGroup(0, bindGroup);       // view_proj
pass.setVertexBuffer(0, markerMesh);   // buffer 0 : géométrie (stepMode 'vertex')
pass.setVertexBuffer(1, instanceBuffer); // buffer 1 : instances (stepMode 'instance')
pass.setIndexBuffer(markerIndex, 'uint16');
pass.drawIndexed(markerIndexCount, INSTANCE_COUNT); // 5000 marqueurs, 1 appel CPU
pass.end();
```

Le gain est structurel : **un** appel CPU au lieu de 5000. Le thread principal est libéré, la frame tient dans les 16 ms, et le GPU — qui n'était pas le goulot — dessine les 5000 marqueurs sans effort.

### Exemple 2 — Mesurer le coût GPU de la passe d'instancing

On veut savoir combien de **millisecondes GPU** coûtent réellement ces 5000 marqueurs, pour décider si l'optimisation suivante (culling indirect) vaut le coup.

```typescript
// Setup (une fois) — feature demandée à la création du device (§2.6)
const querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
const resolve  = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
const readback = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

async function renderAndMeasure(): Promise<number> {
  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
    // Deux timestamps encadrent la passe
    timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, markerMesh);
  pass.setVertexBuffer(1, instanceBuffer);
  pass.setIndexBuffer(markerIndex, 'uint16');
  pass.drawIndexed(markerIndexCount, 5000);
  pass.end();

  // Résoudre (u64 bruts) → resolve → readback
  encoder.resolveQuerySet(querySet, 0, 2, resolve, 0);
  encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16);
  device.queue.submit([encoder.finish()]);

  // Lire les deux timestamps (nanosecondes, uint64)
  await readback.mapAsync(GPUMapMode.READ);
  const ts = new BigUint64Array(readback.getMappedRange());
  const ms = Number(ts[1] - ts[0]) / 1_000_000;
  readback.unmap();                 // TOUJOURS unmap avant la frame suivante
  return ms;
}

const gpuMs = await renderAndMeasure();
console.log(`Passe marqueurs : ${gpuMs.toFixed(2)} ms GPU`);
```

Si `gpuMs` est déjà minuscule (ex. 0.3 ms), le culling GPU n'apportera rien de visible : le module vient d'éviter une optimisation inutile. C'est tout l'intérêt de **mesurer avant d'optimiser**.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que `arrayStride` est en floats

`arrayStride` et les `offset` d'attributs sont **en octets**, jamais en floats. Un `vec3` + `f32` + `vec4` par instance = 8 floats = **32 octets** de stride, l'offset de la couleur = `4 * 4 = 16` octets. Se tromper d'unité décale toutes les instances → géométrie explosée à l'écran, sans erreur.

### PIÈGE #2 — Confondre `stepMode: 'vertex'` et `'instance'`

`stepMode: 'vertex'` fait avancer le curseur **par sommet** (la géométrie) ; `'instance'` **par instance**. Mettre `'vertex'` sur le buffer d'instances relit les mêmes octets pour chaque sommet → toutes les instances se superposent. Le buffer par instance **doit** être `stepMode: 'instance'`.

### PIÈGE #3 — Passer une `mat4x4` comme un seul attribut

Un attribut de vertex buffer ne peut pas dépasser un `vec4` (`float32x4`). Une `mat4x4` par instance = **4 attributs `float32x4`** à des `shaderLocation` consécutifs, reconstruits en `mat4x4f(col0, col1, col2, col3)` dans le shader. Déclarer `format: 'float32x16'` n'existe pas.

### PIÈGE #4 — Oublier `GPUBufferUsage.INDIRECT` sur le buffer indirect

`drawIndexedIndirect` exige que le buffer ait le flag `INDIRECT`. Sans lui, validation error à l'appel. Et le format est **fixe** : `[indexCount, instanceCount, firstIndex, baseVertex, firstInstance]` (indexé) vs `[vertexCount, instanceCount, firstVertex, firstInstance]` (non indexé) — inverser les deux dessine n'importe quoi.

### PIÈGE #5 — Mesurer le temps CPU au lieu du GPU

`performance.now()` autour de `submit()` mesure le temps **d'encodage CPU**, qui n'a aucun rapport avec le travail GPU (asynchrone). Seules les **timestamp queries** mesurent le GPU. Et il faut la feature `'timestamp-query'` **demandée à la création du device** — sinon `timestampWrites` échoue.

### PIÈGE #6 — MSAA sans `resolveTarget` (ou avec les sampleCount inversés)

En MSAA, le `view` doit être **multi-échantillon** (`sampleCount: 4`) et le `resolveTarget` **mono-échantillon** (`sampleCount: 1`, typiquement le canvas). Oublier le `resolveTarget` laisse une texture multi-sample non résolue (rien à l'écran) ; inverser les sampleCount = validation error. Le pipeline doit aussi porter `multisample: { count: 4 }`.

### PIÈGE #7 — Dynamic offset non aligné

Les dynamic offsets d'un uniform buffer doivent être multiples de `device.limits.minUniformBufferOffsetAlignment` (souvent 256), pas de la taille réelle des données. Écrire des slots de 192 octets sans alignement → validation error. On aligne **toujours** l'offset vers le haut sur cette limite.

---

## 5. Ancrage TribuZen

Ces techniques font passer le moteur 3D de TribuZen **du prototype à l'échelle réelle**.

**Globe des sorties — instancing.** Le globe affiche toutes les sorties de la communauté : des milliers de marqueurs. Un `MarkerInstancer` construit un `Float32Array` (offset géo → position monde, couleur selon l'état : vert bouclée, orange prévue, gris annulée) et dessine tout en **un** `drawIndexed(indexCount, N)`. Le CPU pose un seul draw call par frame.

**Culling GPU — draw indirect.** Quand le globe tourne, la moitié des marqueurs est derrière l'horizon. Un compute shader (module 11) teste la visibilité de chaque marqueur, écrit les instances visibles et leur nombre dans un buffer `INDIRECT`, puis la passe de rendu fait `drawIndexedIndirect` : le CPU n'a jamais la liste des marqueurs visibles, tout reste sur le GPU.

**Budget de frame — timestamp queries.** Le mode debug de TribuZen affiche « Passe marqueurs : X ms GPU / Passe globe : Y ms GPU », mesuré par timestamp queries. C'est ce qui permet de décider **où** optimiser au lieu de deviner.

**Qualité & mémoire — MSAA + pooling.** Le MSAA (`sampleCount: 4`) lisse les bords des marqueurs et du globe. Un `BufferPool` recycle les buffers d'instances entre frames quand le nombre de sorties change, et un ring buffer d'uniforms sert les panneaux d'info par sortie via dynamic offsets.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      gpu/
        MarkerInstancer.ts   ← buffer d'instances + drawIndexed instancié (Exemple 1)
        GpuTimer.ts          ← timestamp queries + lecture ms (Exemple 2)
        BufferPool.ts        ← pooling / ring buffer d'uniforms
      culling/
        frustumCull.wgsl     ← compute qui remplit le buffer INDIRECT
      GlobeCanvas.vue        ← <canvas> WebGPU du globe, passe MSAA
```

> Le module 13 bascule ensuite sur **Three.js**, qui abstrait instancing (`InstancedMesh`) et MSAA — mais comprendre ces mécaniques bas niveau permet de savoir **ce que Three.js fait sous le capot** et de diagnostiquer une chute de fps.

---

## 6. Points clés

1. L'instancing dessine N copies d'un mesh en **un draw call** ; le dernier argument de `drawIndexed(indexCount, instanceCount)` est le nombre d'instances.
2. Les données par instance passent par un vertex buffer en `stepMode: 'instance'` ; `arrayStride`/`offset` sont **en octets**, et une `mat4x4` = 4 attributs `float32x4`.
3. `drawIndexedIndirect(buffer, offset)` lit les paramètres depuis un `GPUBuffer` (flag `INDIRECT`) : le GPU décide combien dessiner (culling en compute).
4. Le format indirect est fixe : `[indexCount, instanceCount, firstIndex, baseVertex, firstInstance]` (indexé, 20 octets).
5. Render to texture (`RENDER_ATTACHMENT | TEXTURE_BINDING`) permet le **multi-pass** : passe A écrit une texture, passe B la relit — base du post-traitement et du deferred.
6. Les **timestamp queries** (feature `'timestamp-query'`, `timestampWrites`, `resolveQuerySet`) mesurent le temps **GPU** en nanosecondes, lu en `BigUint64Array` ; le CPU ne le mesure pas.
7. Le MSAA aligne trois choses : `multisample.count` du pipeline, `sampleCount` du `view`, et un `resolveTarget` mono-échantillon.
8. Buffer pooling et ring buffer d'uniforms (dynamic offsets alignés sur `minUniformBufferOffsetAlignment`) réduisent allocations et changements d'état.

---

## 7. Seeds Anki

```
En WebGPU, comment dessine-t-on 5000 copies d'un mesh en un seul draw call ?|Instancing : le dernier argument de drawIndexed(indexCount, instanceCount) est le nombre d'instances. Les données par instance passent par un vertex buffer déclaré stepMode: 'instance' (le curseur avance une fois par instance, pas par sommet).
Dans un vertex buffer layout, en quelle unité sont arrayStride et les offset d'attributs ?|En OCTETS, jamais en floats. vec3+f32+vec4 par instance = 8 floats = 32 octets de stride ; offset de la couleur = 4*4 = 16 octets. Se tromper d'unité décale toutes les instances sans erreur.
Comment passe-t-on une mat4x4 comme donnée par instance dans un vertex buffer ?|En 4 attributs float32x4 à des shaderLocation consécutifs (un attribut ne peut pas dépasser un vec4), reconstruits dans le shader en mat4x4f(col0, col1, col2, col3). Le format float32x16 n'existe pas.
À quoi sert drawIndexedIndirect et quel est le format de son buffer ?|Il lit les paramètres du draw depuis un GPUBuffer (flag GPUBufferUsage.INDIRECT) au lieu des arguments JS : un compute shader peut décider quoi dessiner (culling GPU). Format fixe = 5 u32 : [indexCount, instanceCount, firstIndex, baseVertex, firstInstance] (20 octets).
Comment fait-on du rendu multi-pass (render to texture) en WebGPU ?|On crée une texture avec usage RENDER_ATTACHMENT | TEXTURE_BINDING : la passe A la vise comme colorAttachment (écrit dedans), la passe B la lit via un bind group. Base du post-traitement et du deferred rendering.
Comment mesure-t-on le temps GPU réel d'une passe de rendu ?|Timestamp queries : demander la feature 'timestamp-query' à la création du device, ajouter timestampWrites {querySet, beginningOfPassWriteIndex, endOfPassWriteIndex} à la passe, puis resolveQuerySet → copyBufferToBuffer → mapAsync. Valeurs en nanosecondes (uint64), lues en BigUint64Array. performance.now() ne mesure que le CPU.
Quelles trois choses doivent s'aligner pour activer le MSAA en WebGPU ?|(1) le pipeline déclare multisample: { count: 4 } ; (2) la texture du view a sampleCount: 4 (multi-échantillon) ; (3) le colorAttachment fournit un resolveTarget dont la texture a sampleCount: 1 (le canvas). Oublier le resolveTarget = rien à l'écran.
Pourquoi utiliser un ring buffer d'uniforms avec dynamic offsets plutôt que N uniform buffers ?|Un seul gros buffer + un offset dynamique par objet évite de créer N petits buffers (moins d'allocations, moins de bind groups). Les dynamic offsets doivent être multiples de device.limits.minUniformBufferOffsetAlignment (souvent 256), pas de la taille réelle des données.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-12-webgpu-avance/README.md`. Rendre des milliers de marqueurs instanciés dans un `<canvas>` WebGPU (Chrome) — buffer d'instances, `drawIndexed` instancié, et mesure du coût GPU par timestamp queries. Corrigé HTML/TS + WGSL commenté.
