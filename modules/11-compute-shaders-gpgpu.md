# Module 11 — Compute shaders et GPGPU

| Difficulte | Duree estimee | Lab | Quiz |
|------------|---------------|-----|------|
| 5/5        | 150 min       | [Lab 11](../labs/lab-11-compute-shaders/) | [Quiz 11](../quizzes/quiz-11-compute.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Comprendre ce qu'est un compute shader et en quoi il differe du rendu graphique
- Creer un `GPUComputePipeline` avec un shader WGSL
- Maitriser le modele d'execution : workgroups, invocations, dimensions
- Utiliser les builtins `global_invocation_id`, `local_invocation_id`, `workgroup_id`
- Lire et ecrire dans des storage buffers depuis un compute shader
- Implementer les patterns map et reduce sur GPU
- Utiliser `storageBarrier()` et `workgroupBarrier()` pour la synchronisation
- Combiner compute et render pipelines dans une application hybride
- Lire les resultats GPU cote CPU via `mapAsync` et `getMappedRange`
- Comprendre le role des staging buffers
- Eviter les pieges de performance : occupancy, memory coalescing, bank conflicts
- Implementer une simulation de particules complete

---

<details>
<summary>Rappel du module precedent — Render pipeline et bind groups</summary>

Dans le module 10, nous avons decouvert :

1. **Comment creer un GPURenderPipeline ?**
   Via `device.createRenderPipeline()` avec vertex stage, fragment stage, primitive topology, depth-stencil et multisample. Le pipeline est un objet **immutable**.

2. **Qu'est-ce qu'un bind group ?**
   Un ensemble immutable de ressources (uniform buffers, storage buffers, textures, samplers) liees au shader via `@group(G) @binding(B)`.

3. **Comment decrire le format des vertex buffers ?**
   Via `GPUVertexBufferLayout` : `arrayStride` (bytes par sommet), `stepMode` ('vertex' ou 'instance'), et `attributes` (offset, format, shaderLocation).

4. **Comment encoder un render pass ?**
   `device.createCommandEncoder()` → `encoder.beginRenderPass(desc)` → `pass.setPipeline/setBindGroup/setVertexBuffer/drawIndexed` → `pass.end()` → `device.queue.submit()`.

5. **Quelle est la difference majeure avec WebGL ?**
   WebGPU valide a la **creation** des objets (pipeline, bind group) et non au draw call. Les erreurs sont explicites et apparaissent tot.

</details>

---

## 1. Analogie — Le compute shader comme une usine de calcul

```
USINE CLASSIQUE (render pipeline)        USINE DE CALCUL (compute shader)
=================================        ================================

Chaine de montage fixe :                 Atelier polyvalent :
  Matiere premiere (vertices)              Donnees brutes (buffers)
  → Decoupe (vertex shader)                → Traitement libre (compute shader)
  → Assemblage (rasterization)             → Resultat (buffer de sortie)
  → Peinture (fragment shader)
  → Produit fini (pixel a l'ecran)         Pas de "chaine" imposee,
                                           on fait ce qu'on veut !

Ouvriers sur la chaine :                 Ouvriers dans l'atelier :
  Chaque ouvrier = 1 sommet               Chaque ouvrier = 1 invocation
  ou 1 pixel a traiter                    (thread GPU)

Equipes (pas de concept direct)          Equipes de travail = workgroups
                                           Chaque equipe partage un espace
                                           de travail commun (shared memory)

Convoyeur impose l'ordre                 Pas d'ordre impose :
  vertex → rasterizer → fragment           les invocations s'executent
                                           en parallele, dans n'importe
                                           quel ordre
```

:::tip Analogie cle
Un **compute shader** est comme un atelier ou chaque ouvrier (invocation) recoit un numero (`global_invocation_id`) et effectue sa tache independamment. Il n'y a pas de pipeline graphique impose — seulement un buffer d'entree, un calcul, et un buffer de sortie.
:::

---

## 2. Qu'est-ce qu'un compute shader ?

Un compute shader est un programme qui s'execute sur le GPU mais qui n'est **pas lie au rendu graphique**. Il n'a pas de vertex shader, pas de fragment shader, pas de rasterization. Il lit des donnees depuis des buffers, effectue des calculs, et ecrit les resultats dans d'autres buffers.

### 2.1 Cas d'usage typiques

| Domaine | Exemple | Pourquoi le GPU ? |
|---------|---------|-------------------|
| Simulation | Particules, fluides, tissu | Des millions d'elements independants |
| Traitement d'image | Flou, detection de contours, HDR | Chaque pixel est independant |
| Tri et recherche | Bitonic sort, radix sort, prefix sum | Parallelisme massif |
| Machine learning | Inference de modeles simples | Multiplications matricielles |
| Physique | N-body gravity, collision detection | O(n^2) mais parallelisable |
| Post-processing | Bloom, SSAO, motion blur | Chaque pixel independant |

### 2.2 Compute vs Fragment shader

```
Fragment shader :                        Compute shader :
  - S'execute 1 fois par fragment          - S'execute 1 fois par invocation
  - Entree : position, varyings            - Entree : buffers quelconques
  - Sortie : 1 couleur (vec4)              - Sortie : ecriture libre dans des buffers
  - Lance par le rasterizer                - Lance par dispatchWorkgroups()
  - Pas de memoire partagee                - Memoire partagee (workgroup)
  - Pas de synchronisation                 - Barrieres de synchronisation
```

---

## 3. GPUComputePipeline — structure minimale

### 3.1 Shader WGSL minimal

```wgsl
// double.wgsl — Compute shader qui double chaque valeur d'un buffer

@group(0) @binding(0) var<storage, read>       input:  array<f32>;
@group(0) @binding(1) var<storage, read_write>  output: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x;

  // Verifier qu'on ne depasse pas la taille du buffer
  if (index >= arrayLength(&input)) {
    return;
  }

  output[index] = input[index] * 2.0;
}
```

### 3.2 Pipeline TypeScript

```typescript
async function runComputeDouble(device: GPUDevice): Promise<Float32Array> {
  // Donnees d'entree
  const inputData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const count = inputData.length;

  // --- Buffers ---

  // Buffer d'entree (lecture seule par le shader)
  const inputBuffer = device.createBuffer({
    size: inputData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuffer, 0, inputData);

  // Buffer de sortie (ecriture par le shader)
  const outputBuffer = device.createBuffer({
    size: inputData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // Buffer de staging (pour lire les resultats cote CPU)
  const stagingBuffer = device.createBuffer({
    size: inputData.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // --- Shader module ---
  const shaderModule = device.createShaderModule({
    code: doubleShaderCode, // le code WGSL ci-dessus
  });

  // --- Pipeline ---
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint: 'main',
    },
  });

  // --- Bind group ---
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });

  // --- Dispatch ---
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);

  // Combien de workgroups lancer ?
  // workgroup_size = 64, on a 10 elements
  // → ceil(10 / 64) = 1 workgroup suffit
  const workgroupCount = Math.ceil(count / 64);
  pass.dispatchWorkgroups(workgroupCount);

  pass.end();

  // Copier output → staging pour pouvoir lire cote CPU
  encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, inputData.byteLength);

  device.queue.submit([encoder.finish()]);

  // --- Lire les resultats ---
  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
  stagingBuffer.unmap();

  console.log(result); // Float32Array [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

  // Cleanup
  inputBuffer.destroy();
  outputBuffer.destroy();
  stagingBuffer.destroy();

  return result;
}
```

---

## 4. Workgroups et invocations

### 4.1 Le modele d'execution

```
dispatchWorkgroups(4, 2, 1)   →   Lance 4 * 2 * 1 = 8 workgroups

Chaque workgroup contient @workgroup_size(8, 4, 1) = 32 invocations

Total : 8 workgroups * 32 invocations = 256 invocations (threads GPU)

Visualisation 2D (workgroup_size(8, 4)) :

  Workgroup (0,0)         Workgroup (1,0)         Workgroup (2,0)    ...
  ┌─┬─┬─┬─┬─┬─┬─┬─┐     ┌─┬─┬─┬─┬─┬─┬─┬─┐     ┌─┬─┬─┬─┬─┬─┬─┬─┐
  │0│1│2│3│4│5│6│7│     │0│1│2│3│4│5│6│7│     │0│1│2│3│4│5│6│7│
  ├─┼─┼─┼─┼─┼─┼─┼─┤     ├─┼─┼─┼─┼─┼─┼─┼─┤     ├─┼─┼─┼─┼─┼─┼─┼─┤
  │ │ │ │ │ │ │ │ │     │ │ │ │ │ │ │ │ │     │ │ │ │ │ │ │ │ │
  ├─┼─┼─┼─┼─┼─┼─┼─┤     ├─┼─┼─┼─┼─┼─┼─┼─┤     ├─┼─┼─┼─┼─┼─┼─┼─┤
  │ │ │ │ │ │ │ │ │     │ │ │ │ │ │ │ │ │     │ │ │ │ │ │ │ │ │
  ├─┼─┼─┼─┼─┼─┼─┼─┤     ├─┼─┼─┼─┼─┼─┼─┼─┤     ├─┼─┼─┼─┼─┼─┼─┼─┤
  │ │ │ │ │ │ │ │ │     │ │ │ │ │ │ │ │ │     │ │ │ │ │ │ │ │ │
  └─┴─┴─┴─┴─┴─┴─┴─┘     └─┴─┴─┴─┴─┴─┴─┴─┘     └─┴─┴─┴─┴─┴─┴─┴─┘

  Workgroup (0,1)         Workgroup (1,1)         ...
  ┌─┬─┬─┬─┬─┬─┬─┬─┐     ┌─┬─┬─┬─┬─┬─┬─┬─┐
  │ │ │ │ │ │ │ │ │     │ │ │ │ │ │ │ │ │
  ...                     ...
```

### 4.2 Les builtins d'identification

```wgsl
@compute @workgroup_size(8, 4, 1)
fn main(
  @builtin(global_invocation_id)  gid: vec3u,   // position globale
  @builtin(local_invocation_id)   lid: vec3u,   // position locale dans le workgroup
  @builtin(workgroup_id)          wid: vec3u,   // quel workgroup
  @builtin(num_workgroups)        nwg: vec3u,   // combien de workgroups au total
  @builtin(local_invocation_index) lidx: u32,   // index lineaire local (0..31)
) {
  // Exemple avec dispatchWorkgroups(4, 2, 1) et workgroup_size(8, 4, 1):
  //
  // Pour l'invocation au coin superieur gauche du workgroup (1, 0):
  //   gid  = vec3u(8, 0, 0)    // 1*8 + 0 = 8
  //   lid  = vec3u(0, 0, 0)    // debut du workgroup
  //   wid  = vec3u(1, 0, 0)    // workgroup numero 1 en X
  //   nwg  = vec3u(4, 2, 1)    // 4 workgroups en X, 2 en Y
  //   lidx = 0                  // premier dans le workgroup

  // Relation : gid = wid * workgroup_size + lid
  // gid.x = 1 * 8 + 0 = 8  ✓
}
```

### 4.3 Dimensionnement : choisir workgroup_size

| Dimension | Utilisation typique | Exemple |
|-----------|-------------------|---------|
| 1D : `@workgroup_size(64)` | Tableaux, listes, particules | Doubler un tableau |
| 1D : `@workgroup_size(256)` | Reductions, prefix sum | Somme de N elements |
| 2D : `@workgroup_size(16, 16)` | Images, textures, grilles | Flou gaussien |
| 3D : `@workgroup_size(4, 4, 4)` | Voxels, simulations 3D | Fluides volumetriques |

```wgsl
// 1D — traiter un tableau de 10000 elements
@compute @workgroup_size(64)
fn process1D(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= 10000u) { return; }
  // ...
}
// dispatch: dispatchWorkgroups(ceil(10000/64)) = dispatchWorkgroups(157)

// 2D — traiter une image 1920x1080
@compute @workgroup_size(16, 16)
fn process2D(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  let y = gid.y;
  if (x >= 1920u || y >= 1080u) { return; }
  let idx = y * 1920u + x;
  // ...
}
// dispatch: dispatchWorkgroups(ceil(1920/16), ceil(1080/16)) = (120, 68)
```

:::warning Limite de workgroup_size
Le nombre total d'invocations par workgroup est limite a **256** sur la plupart des GPU (`maxComputeInvocationsPerWorkgroup`). Donc `@workgroup_size(16, 16)` = 256 est ok, mais `@workgroup_size(32, 32)` = 1024 depassera la limite.
:::

---

## 5. Storage buffers en compute

### 5.1 Modes d'acces

```wgsl
// Lecture seule — le shader ne peut pas modifier ce buffer
@group(0) @binding(0) var<storage, read> positions: array<vec4f>;

// Lecture + ecriture — le shader peut lire ET ecrire
@group(0) @binding(1) var<storage, read_write> velocities: array<vec4f>;

// Ecriture seule n'existe PAS en WGSL (toujours read_write)
```

### 5.2 Structures dans les storage buffers

```wgsl
struct Particle {
  position: vec3f,
  velocity: vec3f,
  color: vec4f,
  life: f32,
  _padding: f32,   // alignement a 16 bytes
}

// Tableau de structures
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;

// Buffer avec taille dynamique
@group(0) @binding(1) var<storage, read> params: SimParams;

struct SimParams {
  delta_time: f32,
  gravity: vec3f,
  num_particles: u32,
  damping: f32,
}
```

### 5.3 Atomiques

```wgsl
// Pour des compteurs partages entre invocations
@group(0) @binding(2) var<storage, read_write> counter: atomic<u32>;

@compute @workgroup_size(64)
fn count_alive(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }

  if (particles[i].life > 0.0) {
    // Incremente atomiquement (thread-safe)
    atomicAdd(&counter, 1u);
  }
}
```

---

## 6. Pattern map/reduce sur GPU

### 6.1 Map — appliquer une fonction a chaque element

```wgsl
// map: f(x) = x * x (carre de chaque element)
@group(0) @binding(0) var<storage, read>       input:  array<f32>;
@group(0) @binding(1) var<storage, read_write>  output: array<f32>;

@compute @workgroup_size(64)
fn map_square(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&input)) { return; }
  output[i] = input[i] * input[i];
}
```

### 6.2 Reduce — agreger tous les elements

La reduction sur GPU se fait en plusieurs etapes, en utilisant la memoire partagee du workgroup :

```wgsl
// reduce: somme de tous les elements
// Chaque workgroup reduit ses 256 elements en 1 seul

@group(0) @binding(0) var<storage, read>       input:  array<f32>;
@group(0) @binding(1) var<storage, read_write>  partial_sums: array<f32>;

var<workgroup> shared_data: array<f32, 256>;

@compute @workgroup_size(256)
fn reduce_sum(
  @builtin(global_invocation_id)   gid: vec3u,
  @builtin(local_invocation_index) lid: u32,
  @builtin(workgroup_id)           wid: vec3u,
) {
  // Etape 1 : charger les donnees dans la memoire partagee
  if (gid.x < arrayLength(&input)) {
    shared_data[lid] = input[gid.x];
  } else {
    shared_data[lid] = 0.0;  // padding pour les invocations hors limites
  }

  // Synchroniser : tous les threads du workgroup doivent avoir charge leurs donnees
  workgroupBarrier();

  // Etape 2 : reduction arborescente
  //
  //   [a0, a1, a2, a3, a4, a5, a6, a7]   iteration 0 : stride = 1
  //     └──┤   └──┤   └──┤   └──┤
  //   [a0+a1, _, a2+a3, _, a4+a5, _, a6+a7, _]  iteration 1 : stride = 2
  //     └──────┤           └──────┤
  //   [a0..a3, _, _, _, a4..a7, _, _, _]         iteration 2 : stride = 4
  //     └──────────────┤
  //   [a0..a7, _, _, _, _, _, _, _]              Resultat dans shared_data[0]

  for (var stride = 1u; stride < 256u; stride *= 2u) {
    let index = lid * 2u * stride;
    if (index + stride < 256u) {
      shared_data[index] += shared_data[index + stride];
    }
    workgroupBarrier();
  }

  // Etape 3 : le premier thread ecrit le resultat partiel
  if (lid == 0u) {
    partial_sums[wid.x] = shared_data[0];
  }
}
```

```
Reduction arborescente pour 8 elements :

Iteration 0 (stride=1):  [1] [3] [5] [2] [7] [4] [6] [8]
                           └┬┘   └┬┘   └┬┘   └┬┘
Iteration 1 (stride=2):  [4]  _  [7]  _  [11] _  [14] _
                           └──┬──┘       └──┬──┘
Iteration 2 (stride=4):  [11] _   _   _  [25] _   _   _
                           └──────┬──────┘
Resultat:                 [36] → somme totale

Pour N elements, il faut log2(N) iterations au lieu de N-1 additions sequentielles.
```

:::tip Deux passes pour un grand tableau
Si le tableau a 1 million d'elements avec workgroup_size(256), la premiere passe produit ceil(1000000/256) = 3907 sommes partielles. Il faut ensuite une **deuxieme passe** (ou une reduction CPU) pour sommer ces 3907 valeurs.
:::

---

## 7. Synchronisation : barrieres

### 7.1 workgroupBarrier

```wgsl
var<workgroup> shared: array<f32, 64>;

@compute @workgroup_size(64)
fn example(@builtin(local_invocation_index) lid: u32) {
  // Toutes les invocations du workgroup ecrivent
  shared[lid] = f32(lid);

  // OBLIGATOIRE : attendre que TOUTES les invocations aient ecrit
  workgroupBarrier();

  // Maintenant on peut lire les valeurs ecrites par les autres invocations
  let neighbor = shared[(lid + 1u) % 64u];
}
```

### 7.2 storageBarrier

```wgsl
@group(0) @binding(0) var<storage, read_write> data: array<u32>;

@compute @workgroup_size(64)
fn example(@builtin(global_invocation_id) gid: vec3u) {
  // Ecrire dans le storage buffer
  data[gid.x] = gid.x * 2u;

  // S'assurer que l'ecriture est visible par les autres invocations
  // du MEME workgroup (pas entre workgroups differents !)
  storageBarrier();

  // Lire une valeur potentiellement ecrite par un autre thread du workgroup
  let val = data[gid.x ^ 1u]; // XOR pour lire le voisin
}
```

### 7.3 Ce que les barrieres ne font PAS

```
IMPORTANT : il n'existe PAS de synchronisation ENTRE workgroups
dans un meme dispatch.

  Workgroup 0         Workgroup 1
  ┌───────────┐       ┌───────────┐
  │ barriere  │       │ barriere  │
  │ = sync    │   ✗   │ = sync    │
  │ interne   │ ────► │ interne   │
  │ OK        │       │ OK        │
  └───────────┘       └───────────┘

Pour synchroniser entre workgroups, il faut :
  1. Terminer le compute pass
  2. Soumettre les commandes
  3. Lancer un nouveau compute pass
  = "multi-pass" approach
```

---

## 8. Cas d'usage : simulation de particules

### 8.1 Architecture hybride compute + render

```
Frame N :

  ┌─────────────────────────┐
  │ Compute Pass            │
  │                         │
  │ compute shader lit      │
  │ les positions/velocites │
  │ → applique gravite      │
  │ → detecte collisions    │
  │ → ecrit nouvelles       │
  │   positions/velocites   │
  └────────────┬────────────┘
               │
               ▼
  ┌─────────────────────────┐
  │ Render Pass             │
  │                         │
  │ vertex shader lit       │
  │ les positions calculees │
  │ par le compute shader   │
  │ → dessine les particules│
  │   comme des points/quads│
  └─────────────────────────┘

Le MEME buffer sert d'output pour le compute
et d'input (vertex buffer) pour le render.
Usage : STORAGE | VERTEX
```

### 8.2 Shader compute pour les particules

```wgsl
// particles-compute.wgsl

struct Particle {
  pos: vec4f,    // xyz = position, w = life
  vel: vec4f,    // xyz = velocity, w = unused
}

struct SimParams {
  dt: f32,
  gravity: f32,
  damping: f32,
  num_particles: u32,
  mouse: vec2f,
  mouse_force: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.num_particles) { return; }

  var p = particles[i];

  // Gravite
  p.vel.y -= params.gravity * params.dt;

  // Amortissement (air resistance)
  p.vel = p.vel * (1.0 - params.damping * params.dt);

  // Force d'attraction vers la souris (en espace normalise)
  let to_mouse = vec3f(params.mouse.x, params.mouse.y, 0.0) - p.pos.xyz;
  let dist = length(to_mouse);
  if (dist > 0.01) {
    let force = normalize(to_mouse) * params.mouse_force / (dist * dist + 0.1);
    p.vel = p.vel + vec4f(force * params.dt, 0.0);
  }

  // Integration (Euler explicite)
  p.pos = p.pos + p.vel * params.dt;

  // Rebond au sol (y = -1)
  if (p.pos.y < -1.0) {
    p.pos.y = -1.0;
    p.vel.y = abs(p.vel.y) * 0.7; // perte d'energie au rebond
  }

  // Murs lateraux
  if (abs(p.pos.x) > 2.0) {
    p.vel.x = -p.vel.x * 0.7;
    p.pos.x = clamp(p.pos.x, -2.0, 2.0);
  }

  // Vieillissement
  p.pos.w -= params.dt;
  if (p.pos.w <= 0.0) {
    // Respawn
    p.pos = vec4f(
      (f32(i % 100u) / 100.0 - 0.5) * 0.2,
      1.5,
      (f32(i / 100u) / 100.0 - 0.5) * 0.2,
      3.0 + f32(i % 37u) / 37.0 * 2.0, // duree de vie 3-5 sec
    );
    p.vel = vec4f(
      (f32(i % 17u) / 17.0 - 0.5) * 0.5,
      -0.5,
      (f32(i % 13u) / 13.0 - 0.5) * 0.5,
      0.0,
    );
  }

  particles[i] = p;
}
```

### 8.3 Shaders de rendu pour les particules

```wgsl
// particles-render.wgsl

struct Particle {
  pos: vec4f,
  vel: vec4f,
}

struct Uniforms {
  view_proj: mat4x4f,
  point_size: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {
  let p = particles[vid];

  var out: VertexOutput;
  out.position = u.view_proj * vec4f(p.pos.xyz, 1.0);

  // Couleur basee sur la velocite
  let speed = length(p.vel.xyz);
  out.color = vec4f(
    clamp(speed * 2.0, 0.0, 1.0),       // rouge = rapide
    clamp(1.0 - speed, 0.0, 1.0),        // vert = lent
    clamp(p.pos.w / 5.0, 0.0, 1.0),      // bleu = jeune
    clamp(p.pos.w, 0.0, 1.0),            // alpha = duree de vie restante
  );

  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4f {
  return in.color;
}
```

---

## 9. Lire les resultats — mapAsync et getMappedRange

### 9.1 Le probleme : CPU et GPU sont asynchrones

```
CPU timeline:    [dispatch]──────[...]──────────[read result]
GPU timeline:               [compute shader executing...]

Le CPU ne peut pas lire un buffer GPU directement.
Il faut :
1. Copier le buffer GPU vers un staging buffer
2. Attendre (mapAsync) que la copie soit terminee
3. Lire les donnees depuis le staging buffer (getMappedRange)
```

### 9.2 Implementation

```typescript
async function readBufferFromGPU(
  device: GPUDevice,
  sourceBuffer: GPUBuffer,
  size: number,
): Promise<Float32Array> {
  // 1. Creer un staging buffer (mappable par le CPU)
  const stagingBuffer = device.createBuffer({
    size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // 2. Encoder la copie GPU → staging
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(sourceBuffer, 0, stagingBuffer, 0, size);
  device.queue.submit([encoder.finish()]);

  // 3. Attendre que le GPU ait termine la copie
  await stagingBuffer.mapAsync(GPUMapMode.READ);

  // 4. Lire les donnees
  // getMappedRange retourne un ArrayBuffer qui est une VUE sur la memoire mappee
  const mappedRange = stagingBuffer.getMappedRange();

  // IMPORTANT : copier les donnees avant unmap (la vue devient invalide apres unmap)
  const result = new Float32Array(mappedRange.slice(0));

  // 5. Liberer le mapping
  stagingBuffer.unmap();
  stagingBuffer.destroy();

  return result;
}
```

### 9.3 Staging buffers — pourquoi sont-ils necessaires ?

```
Memoire GPU (VRAM)              Memoire CPU (RAM)
┌─────────────────┐             ┌─────────────────┐
│ Storage Buffer  │             │ JavaScript      │
│ (STORAGE)       │──── ✗ ────▶│ Float32Array    │
│ Pas mappable !  │             │                 │
└─────────────────┘             └─────────────────┘

        │ copyBufferToBuffer
        ▼
┌─────────────────┐             ┌─────────────────┐
│ Staging Buffer  │             │ JavaScript      │
│ (MAP_READ |     │──── ✓ ────▶│ Float32Array    │
│  COPY_DST)      │  mapAsync   │                 │
│ Mappable !      │             │                 │
└─────────────────┘             └─────────────────┘

Les buffers STORAGE ne sont pas mappables car ils sont optimises
pour l'acces GPU (memoire video rapide). Le staging buffer est
dans une zone memoire accessible par le CPU (plus lente pour le GPU).
```

---

## 10. Compute + Render pipeline hybride

### 10.1 TypeScript complet : simulation de particules

```typescript
const NUM_PARTICLES = 50000;

async function initParticleSystem(
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
): Promise<void> {
  // --- Particle buffer (partage entre compute et render) ---
  const particleByteSize = 32; // 2 * vec4f = 32 bytes
  const particleBuffer = device.createBuffer({
    size: NUM_PARTICLES * particleByteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
  });

  // Initialiser les particules
  const initData = new Float32Array(NUM_PARTICLES * 8);
  for (let i = 0; i < NUM_PARTICLES; i++) {
    const base = i * 8;
    initData[base + 0] = (Math.random() - 0.5) * 2;   // pos.x
    initData[base + 1] = Math.random() * 2;             // pos.y
    initData[base + 2] = (Math.random() - 0.5) * 2;   // pos.z
    initData[base + 3] = Math.random() * 5;             // life
    initData[base + 4] = (Math.random() - 0.5) * 0.5; // vel.x
    initData[base + 5] = -Math.random() * 0.5;          // vel.y
    initData[base + 6] = (Math.random() - 0.5) * 0.5; // vel.z
    initData[base + 7] = 0;                             // unused
  }
  device.queue.writeBuffer(particleBuffer, 0, initData);

  // --- Sim params uniform buffer ---
  const simParamsBuffer = device.createBuffer({
    size: 32, // aligne a 16
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // --- Compute pipeline ---
  const computeModule = device.createShaderModule({ code: computeShaderCode });
  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: computeModule, entryPoint: 'simulate' },
  });

  const computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: simParamsBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  });

  // --- Render pipeline ---
  const renderModule = device.createShaderModule({ code: renderShaderCode });
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: renderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: renderModule,
      entryPoint: 'fs_main',
      targets: [{
        format,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
          alpha: { srcFactor: 'one', dstFactor: 'one' },
        },
      }],
    },
    primitive: { topology: 'point-list' },
  });

  // Render uniform buffer (view-projection matrix + point size)
  const renderUniformBuffer = device.createBuffer({
    size: 80, // mat4x4 (64) + f32 (4) + padding (12)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: renderUniformBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  });

  // --- Render loop ---
  let lastTime = 0;

  function frame(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Mettre a jour les params de simulation
    const simParams = new Float32Array([
      dt,      // delta time
      9.81,    // gravity
      0.5,     // damping
    ]);
    const simParamsU32 = new Uint32Array([NUM_PARTICLES]);
    device.queue.writeBuffer(simParamsBuffer, 0, simParams);
    device.queue.writeBuffer(simParamsBuffer, 12, simParamsU32);

    // Mettre a jour la view-projection
    // (simplifiee : camera fixe regardant l'origine)
    const renderUniforms = new Float32Array(20);
    // Remplir view-projection matrix...
    device.queue.writeBuffer(renderUniformBuffer, 0, renderUniforms);

    const encoder = device.createCommandEncoder();

    // COMPUTE PASS : simuler les particules
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(NUM_PARTICLES / 64));
    computePass.end();

    // RENDER PASS : dessiner les particules
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.02, g: 0.02, b: 0.05, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(NUM_PARTICLES);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
```

---

## 11. Performance — pieges et optimisations

### 11.1 Occupancy (taux d'occupation du GPU)

```
Occupancy = nombre de warps actifs / nombre max de warps

Un warp = 32 threads (NVIDIA) ou 64 threads (AMD) qui s'executent
ensemble de facon SIMT (Single Instruction, Multiple Threads).

MAUVAIS : workgroup_size(1)       BON : workgroup_size(64) ou (256)
  → 1 thread par workgroup          → 64/256 threads par workgroup
  → le GPU est sous-utilise          → le GPU est bien rempli
  → overhead d'ordonnancement        → haute occupancy

Regle pratique : workgroup_size doit etre un multiple de 32 (ou 64)
et idealement >= 64. Valeur recommandee : 64 ou 256.
```

### 11.2 Memory coalescing (acces memoire coalescents)

```wgsl
// BON : acces coalescent (threads consecutifs → adresses consecutives)
@compute @workgroup_size(64)
fn good(@builtin(global_invocation_id) gid: vec3u) {
  // Thread 0 lit data[0], thread 1 lit data[1], thread 2 lit data[2]...
  // → 1 seul acces memoire pour tout le warp !
  let val = data[gid.x];
}

// MAUVAIS : acces non-coalescent (stride)
@compute @workgroup_size(64)
fn bad(@builtin(global_invocation_id) gid: vec3u) {
  // Thread 0 lit data[0], thread 1 lit data[64], thread 2 lit data[128]...
  // → N acces memoire separes = lent !
  let val = data[gid.x * 64u];
}
```

### 11.3 Bank conflicts (memoire partagee)

```
La memoire partagee (workgroup) est divisee en "banks" (typiquement 32).
Si 2 threads accedent a la meme bank simultanement → bank conflict → serialisation.

Bank:   0   1   2   3   4   5   ...  31
Addr:  [0] [1] [2] [3] [4] [5] ... [31]
       [32][33][34][35][36][37] ... [63]

SANS conflict :  thread 0→bank0, thread 1→bank1, thread 2→bank2...  ✓
AVEC conflict :  thread 0→bank0, thread 2→bank0  (meme bank!)      ✗
  → le 2eme acces doit attendre le premier

Solution : padding dans les tableaux partages
  var<workgroup> data: array<f32, 33>;  // 33 au lieu de 32 → decale les banks
```

### 11.4 Tableau recapitulatif des bonnes pratiques

| Pratique | Impact | Recommandation |
|----------|--------|----------------|
| workgroup_size | Occupancy | 64 ou 256, multiple de 32 |
| Acces memoire | Bande passante | Coalescent (threads consecutifs → adresses consecutives) |
| Shared memory | Latence | Eviter les bank conflicts, utiliser du padding |
| Branchement (if/else) | Divergence de warp | Minimiser, preferer step/mix |
| Nombre de registres | Occupancy | Moins de variables locales = plus de warps actifs |
| Buffer bindings | Overhead | Minimiser le nombre de bind groups |

---

## 12. Exercice pratique

### Enonce

Implementez un **traitement d'image en compute shader** :

1. Chargez une image dans une texture WebGPU
2. Ecrivez un compute shader qui applique un **flou gaussien 5x5** sur l'image
3. Affichez le resultat avec un render pass (quad plein ecran)
4. Utilisez `@workgroup_size(16, 16)` pour le dispatch 2D
5. Ajoutez un slider HTML qui controle l'intensite du flou (nombre de passes)

**Indices :**
- Le compute shader lit une `texture_2d<f32>` et ecrit dans une `texture_storage_2d<rgba8unorm, write>`
- Le noyau gaussien 5x5 :
  ```
  1  4  6  4  1
  4 16 24 16  4
  6 24 36 24  6
  4 16 24 16  4
  1  4  6  4  1
  ```
  (diviser chaque valeur par 256 pour normaliser)

<details>
<summary>Voir la solution</summary>

```wgsl
// blur.wgsl — Flou gaussien 5x5 en compute shader

@group(0) @binding(0) var input_tex: texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;

const KERNEL_SIZE = 5;
const KERNEL: array<array<f32, 5>, 5> = array(
  array(1.0,  4.0,  6.0,  4.0, 1.0),
  array(4.0, 16.0, 24.0, 16.0, 4.0),
  array(6.0, 24.0, 36.0, 24.0, 6.0),
  array(4.0, 16.0, 24.0, 16.0, 4.0),
  array(1.0,  4.0,  6.0,  4.0, 1.0),
);
const KERNEL_SUM: f32 = 256.0;

@compute @workgroup_size(16, 16)
fn blur(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_tex);

  // Verifier les limites
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  var color = vec4f(0.0);

  // Convolution 5x5
  for (var ky = 0; ky < KERNEL_SIZE; ky++) {
    for (var kx = 0; kx < KERNEL_SIZE; kx++) {
      let offset = vec2i(kx - 2, ky - 2);
      let sample_pos = vec2i(gid.xy) + offset;

      // Clamp aux bords de l'image
      let clamped = clamp(sample_pos, vec2i(0), vec2i(dims) - vec2i(1));

      let sample = textureLoad(input_tex, clamped, 0);
      color += sample * KERNEL[ky][kx];
    }
  }

  color /= KERNEL_SUM;
  color.a = 1.0; // garder l'alpha a 1

  textureStore(output_tex, gid.xy, color);
}
```

```typescript
// main.ts — Application de flou

async function blurImage(
  device: GPUDevice,
  inputTexture: GPUTexture,
  outputTexture: GPUTexture,
  width: number,
  height: number,
  passes: number,
): Promise<void> {
  const shaderModule = device.createShaderModule({ code: blurShaderCode });

  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shaderModule, entryPoint: 'blur' },
  });

  // Pour les passes multiples, on ping-pong entre 2 textures
  let srcTexture = inputTexture;
  let dstTexture = outputTexture;

  for (let pass = 0; pass < passes; pass++) {
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: srcTexture.createView() },
        { binding: 1, resource: dstTexture.createView() },
      ],
    });

    const encoder = device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(pipeline);
    computePass.setBindGroup(0, bindGroup);
    computePass.dispatchWorkgroups(
      Math.ceil(width / 16),
      Math.ceil(height / 16),
    );
    computePass.end();
    device.queue.submit([encoder.finish()]);

    // Swap pour le prochain pass
    if (pass < passes - 1) {
      [srcTexture, dstTexture] = [dstTexture, srcTexture];
    }
  }
}
```

**Points cles :**
- Le dispatch 2D `(ceil(width/16), ceil(height/16))` couvre toute l'image
- `textureLoad` lit un pixel a une coordonnee entiere (pas de filtrage)
- `textureStore` ecrit dans une `texture_storage_2d`
- Le ping-pong entre 2 textures permet d'appliquer plusieurs passes de flou
- Plus il y a de passes, plus le flou est intense (flou gaussien iteratif)

</details>

---

## Resume

| Concept | Description |
|---------|-------------|
| Compute shader | Programme GPU sans pipeline graphique, pour du calcul general |
| `GPUComputePipeline` | Pipeline contenant un seul stage compute |
| `@compute @workgroup_size(N)` | Declare la taille d'un workgroup (N invocations) |
| `dispatchWorkgroups(x, y, z)` | Lance x * y * z workgroups |
| `global_invocation_id` | Position globale d'une invocation (identifiant unique) |
| `local_invocation_id` | Position locale dans le workgroup |
| `workgroup_id` | Identifiant du workgroup |
| `var<storage, read_write>` | Storage buffer lisible et ecrivable par le compute shader |
| `var<workgroup>` | Memoire partagee entre les invocations d'un workgroup |
| `workgroupBarrier()` | Synchronise toutes les invocations d'un workgroup |
| `storageBarrier()` | Garantit la visibilite des ecritures storage dans le workgroup |
| `atomicAdd` | Operation atomique sur un compteur partage |
| Pattern map | Appliquer une fonction a chaque element (1:1) |
| Pattern reduce | Agreger tous les elements en un seul (N:1) |
| Staging buffer | Buffer `MAP_READ | COPY_DST` pour lire les resultats cote CPU |
| `mapAsync` / `getMappedRange` | API pour lire un buffer GPU depuis JavaScript |
| Compute + Render hybride | Un buffer STORAGE | VERTEX partage entre les deux pipelines |
| Occupancy | Ratio warps actifs / warps max, viser >= 50% |
| Memory coalescing | Threads consecutifs → adresses consecutives = performant |
| Bank conflicts | Acces simultanees a la meme bank de memoire partagee = lent |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [10 — Render pipeline et bind groups](./10-render-pipeline-bind-groups.md) | [12 — Techniques avancees WebGPU](./12-webgpu-avance.md) |
