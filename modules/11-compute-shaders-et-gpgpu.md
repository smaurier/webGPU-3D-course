---
titre: Compute shaders et GPGPU
cours: 20-webgpu-3d
notions:
  - "compute shader (calcul GPU hors rendu)"
  - "entrée @compute @workgroup_size(x, y, z)"
  - "workgroups vs invocations (threads GPU)"
  - "builtins d'identité (global_invocation_id, local_invocation_id, workgroup_id, num_workgroups)"
  - "relation gid = wid * workgroup_size + lid"
  - "storage buffers (var<storage, read> / read_write)"
  - "GPUComputePipeline et compute pass"
  - "dispatchWorkgroups(x, y, z) et calcul du nombre de workgroups"
  - "GPGPU : simulation de particules, intégration d'Euler"
  - "lecture des résultats (staging buffer, mapAsync, getMappedRange)"
outcomes:
  - sait écrire un compute shader WGSL avec @compute @workgroup_size et un builtin d'invocation
  - sait distinguer workgroup et invocation et calculer le nombre de workgroups à dispatcher
  - sait créer un GPUComputePipeline, encoder un compute pass et lancer dispatchWorkgroups
  - sait câbler des storage buffers (read / read_write) via un bind group
  - sait faire tourner une simulation de particules GPGPU et relire un résultat GPU côté CPU
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "09-webgpu-architecture-et-wgsl (adapter/device, WGSL, GPUBuffer)"
  - "10-render-pipeline-et-bind-groups (bind groups, @group/@binding, command encoder, uniforms)"
next: 12-webgpu-avance
libs: []
tribuzen: "moteur 3D TribuZen — calcul GPU parallèle : simuler des particules festives (confettis d'un badge/trophée) et recalculer les positions des marqueurs sur le globe entièrement sur le GPU"
last-reviewed: 2026-07
---

# Compute shaders et GPGPU

> **Outcomes — tu sauras FAIRE :** écrire un compute shader WGSL (`@compute @workgroup_size`), raisonner en workgroups/invocations, câbler des storage buffers via un bind group, encoder un compute pass et lancer `dispatchWorkgroups`, faire tourner une simulation de particules GPGPU et relire un résultat GPU côté CPU.
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** on quitte le pipeline de rendu (vertex → fragment du module 10) pour le **calcul pur sur GPU**. Ici, pas d'image en sortie obligatoire : le compute shader lit des buffers, calcule, écrit des buffers. Les techniques multi-pass, indirect et timestamp avancées sont le sujet du **module 12**.

## 1. Cas concret d'abord

TribuZen veut célébrer une sortie bouclée par une **explosion de confettis 3D** : 50 000 particules festives qui jaillissent, tombent, rebondissent. Chaque frame, il faut, **pour chacune des 50 000 particules**, appliquer la gravité, l'amortissement, intégrer la position, gérer le rebond au sol.

Le réflexe « CPU » ne tient pas :

```typescript
// ❌ 50 000 particules mises à jour sur le CPU, chaque frame
for (let i = 0; i < 50_000; i++) {
  particles[i].vel.y -= gravity * dt;
  particles[i].pos.x += particles[i].vel.x * dt;
  particles[i].pos.y += particles[i].vel.y * dt;
  // ...puis ré-uploader 50 000 positions vers le GPU à chaque frame
}
```

Deux problèmes. D'abord la **boucle séquentielle** : 50 000 itérations sur un seul thread JS, à 60 fps, c'est intenable. Ensuite le **transfert** : recalculer côté CPU oblige à ré-uploader tout le buffer vers le GPU chaque frame — le bus PCIe devient le goulot.

Or ces 50 000 mises à jour sont **totalement indépendantes** : la particule 12 340 ne dépend pas de la 12 341. C'est exactement le profil que le GPU dévore : des milliers de calculs identiques, parallèles, sur des données déjà en VRAM.

Le **compute shader** répond à ça. On écrit **une seule fois** le calcul « pour une particule » ; le GPU l'exécute sur les 50 000 en parallèle, **sans jamais quitter la VRAM** — le même buffer sert ensuite directement au rendu. Ce module pose ce mécanisme : du shader WGSL au `dispatchWorkgroups`, jusqu'à relire un résultat côté CPU quand on en a besoin.

---

## 2. Théorie complète, concise

### 2.1 Qu'est-ce qu'un compute shader

Un **compute shader** est un programme WGSL exécuté sur le GPU, mais **détaché du pipeline graphique** : pas de vertex shader, pas de rasterisation, pas de fragment shader, pas d'image imposée en sortie. Il lit des buffers, calcule, écrit des buffers. On utilise le GPU comme un processeur massivement parallèle — c'est le **GPGPU** (General-Purpose computing on GPU).

| | Fragment shader | Compute shader |
|---|---|---|
| Déclencheur | le rasterizer (implicite) | `dispatchWorkgroups()` (explicite) |
| Entrée | position, varyings interpolés | buffers quelconques |
| Sortie | une couleur (`vec4`) | écriture libre dans des buffers |
| Mémoire partagée | non | oui (`var<workgroup>`) |
| Cas TribuZen | colorer un pixel | simuler 50 000 particules |

### 2.2 La fonction d'entrée : `@compute @workgroup_size`

Un point d'entrée compute se déclare avec deux attributs :

```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  // ...calcul pour l'élément i
}
```

- `@compute` marque la fonction comme point d'entrée d'un compute pipeline.
- `@workgroup_size(x, y, z)` fixe la taille d'un **workgroup** (les `y`, `z` valent `1` par défaut). `@workgroup_size(64)` = 64 invocations par workgroup.

### 2.3 Workgroups et invocations

C'est **le** modèle mental à installer. Une **invocation** est un thread GPU : elle exécute la fonction une fois, pour un élément. Un **workgroup** est un paquet d'invocations qui s'exécutent ensemble et **partagent** une mémoire locale (`var<workgroup>`).

`dispatchWorkgroups(gx, gy, gz)` lance `gx * gy * gz` **workgroups**. Chaque workgroup contient `x * y * z` **invocations** (selon `@workgroup_size`). Le total :

```
total_invocations = (gx * gy * gz) * (x * y * z)
```

Exemple : `@workgroup_size(64)` + `dispatchWorkgroups(157)` → `157 * 64 = 10 048` invocations (assez pour 10 000 éléments).

> **Ne pas confondre :** `dispatchWorkgroups(N)` **ne lance pas N threads**, il lance N **workgroups**. Le nombre de threads est `N * workgroup_size`.

### 2.4 Les builtins d'identité

Chaque invocation reçoit son adresse via des `@builtin` passés en paramètre :

```wgsl
@compute @workgroup_size(8, 8)
fn main(
  @builtin(global_invocation_id)  gid: vec3u,  // id unique global (le plus utilisé)
  @builtin(local_invocation_id)   lid: vec3u,  // position dans le workgroup
  @builtin(workgroup_id)          wid: vec3u,  // quel workgroup
  @builtin(num_workgroups)        nwg: vec3u,  // dimensions passées à dispatchWorkgroups
) {
  // Relation garantie par la spec :
  //   gid = wid * workgroup_size + lid
}
```

`global_invocation_id` est l'identifiant unique de l'invocation sur toute la grille : c'est presque toujours lui qu'on mappe sur l'index de l'élément à traiter (`let i = gid.x;`).

### 2.5 Les storage buffers

Un compute shader lit/écrit ses données via des **storage buffers** — des `GPUBuffer` de grande capacité, accessibles en lecture et/ou écriture. En WGSL, on déclare l'espace d'adressage et le mode d'accès :

```wgsl
@group(0) @binding(0) var<storage, read>       input:  array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
```

- `read` — le shader ne peut que **lire** ce buffer.
- `read_write` — le shader peut lire **et** écrire.
- Il n'existe **pas** de mode « write-only » : pour écrire, c'est `read_write`.

`arrayLength(&input)` donne le nombre d'éléments d'un `array<T>` à taille dynamique — indispensable pour le garde-fou (2.7). Côté JS, un tel buffer doit avoir l'usage `GPUBufferUsage.STORAGE`.

### 2.6 Le compute pipeline et le compute pass

Le workflow JS est proche du render pipeline, en plus simple (un seul stage) :

```typescript
// 1. Pipeline : un seul stage compute
const pipeline = device.createComputePipeline({
  layout: 'auto',
  compute: { module: shaderModule, entryPoint: 'main' },
});

// 2. Bind group : brancher les buffers sur @group(0)
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: inputBuffer } },
    { binding: 1, resource: { buffer: outputBuffer } },
  ],
});

// 3. Encoder un compute pass
const encoder = device.createCommandEncoder();
const pass = encoder.beginComputePass();
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.dispatchWorkgroups(workgroupCount);   // ← lance le calcul
pass.end();
device.queue.submit([encoder.finish()]);
```

`beginComputePass()` renvoie un `GPUComputePassEncoder` dont les méthodes clés sont `setPipeline`, `setBindGroup`, `dispatchWorkgroups(x, y, z)` et `end` (signatures confirmées sur MDN).

### 2.7 Calculer le nombre de workgroups (et le garde-fou)

Le compte de workgroups se déduit du nombre d'éléments et du `workgroup_size`, arrondi **au supérieur** :

```typescript
const workgroupCount = Math.ceil(count / 64);   // 64 = workgroup_size
pass.dispatchWorkgroups(workgroupCount);
```

L'arrondi au supérieur lance **plus** d'invocations que d'éléments (ex. 10 000 éléments → 157 workgroups → 10 048 invocations). Les 48 invocations en trop liraient hors du buffer. D'où le **garde-fou obligatoire** en tête de shader :

```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&output)) { return; }   // stoppe les invocations en trop
  output[i] = input[i] * 2.0;
}
```

> **Limite dure :** le produit `x * y * z` de `@workgroup_size` ne peut dépasser `maxComputeInvocationsPerWorkgroup`, **256** sur la quasi-totalité des GPU. `@workgroup_size(16, 16)` = 256 passe ; `@workgroup_size(32, 32)` = 1024 est rejeté à la création du pipeline.

### 2.8 GPGPU en pratique : la simulation de particules

Le cas d'usage phare. Une particule = position + vélocité, stockées dans un storage `read_write`. Chaque invocation met à jour **une** particule par **intégration d'Euler explicite** (`nouvelle_position = position + vélocité * dt`) :

```wgsl
struct Particle {
  pos: vec4f,   // xyz = position, w = durée de vie restante
  vel: vec4f,   // xyz = vélocité,  w = inutilisé
}

struct SimParams {
  dt: f32,
  gravity: f32,
  num_particles: u32,
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.num_particles) { return; }   // garde-fou

  var p = particles[i];
  p.vel.y -= params.gravity * params.dt;       // gravité
  p.pos = p.pos + p.vel * params.dt;           // intégration d'Euler
  if (p.pos.y < -1.0) {                         // rebond au sol
    p.pos.y = -1.0;
    p.vel.y = abs(p.vel.y) * 0.7;              // perte d'énergie
  }
  particles[i] = p;                             // réécriture in-place
}
```

Le buffer `particles` peut porter l'usage `STORAGE | VERTEX` : le compute pass le met à jour, puis un render pass le lit **directement** comme source de sommets — **rien ne repasse par le CPU**. C'est tout l'intérêt du GPGPU pour les particules.

### 2.9 Relire un résultat GPU côté CPU

Parfois on veut le résultat en JavaScript (agrégat, export, debug). Problème : un buffer `STORAGE` **n'est pas mappable** par le CPU. Il faut un **staging buffer** intermédiaire (`MAP_READ | COPY_DST`), y copier le résultat, puis le mapper :

```typescript
// 1. Copier le buffer STORAGE → staging (dans le command encoder)
encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, byteSize);
device.queue.submit([encoder.finish()]);

// 2. Mapper le staging pour lecture, puis lire
await stagingBuffer.mapAsync(GPUMapMode.READ);
const view = stagingBuffer.getMappedRange();          // ArrayBuffer, vue sur la mémoire mappée
const result = new Float32Array(view.slice(0));       // COPIER avant unmap
stagingBuffer.unmap();                                 // invalide la vue précédente
```

`mapAsync(mode, offset?, size?)` renvoie une promesse résolue quand le GPU a fini ; `getMappedRange()` renvoie un `ArrayBuffer`. **Piège :** après `unmap()`, cette vue est invalide — il faut **copier** les données (`slice(0)`) avant de démapper (signatures confirmées sur MDN).

---

## 3. Worked examples

### Exemple 1 — Doubler un tableau sur GPU, de A à Z

Le « hello world » du compute : lire un tableau, écrire son double, relire le résultat en JS. Il condense tout le module (shader, pipeline, bind group, dispatch, readback).

**`double.wgsl`** :

```wgsl
@group(0) @binding(0) var<storage, read>       input:  array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&input)) { return; }   // garde-fou (invocations en trop)
  output[i] = input[i] * 2.0;
}
```

**`double.ts`** :

```typescript
async function runComputeDouble(device: GPUDevice): Promise<Float32Array> {
  const inputData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const byteSize = inputData.byteLength;

  // --- Buffers ---
  // Entrée : STORAGE (lu par le shader) + COPY_DST (on y écrit depuis le CPU)
  const inputBuffer = device.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(inputBuffer, 0, inputData);

  // Sortie : STORAGE (écrit par le shader) + COPY_SRC (on la copiera vers le staging)
  const outputBuffer = device.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // Staging : MAP_READ (mappable CPU) + COPY_DST (cible de la copie)
  const stagingBuffer = device.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // --- Pipeline (un seul stage compute) ---
  const module = device.createShaderModule({ code: doubleWgsl });
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  // --- Bind group : brancher les deux buffers ---
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inputBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });

  // --- Encoder : compute pass + copie vers staging ---
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  // 10 éléments, workgroup_size 64 → ceil(10 / 64) = 1 workgroup
  pass.dispatchWorkgroups(Math.ceil(inputData.length / 64));
  pass.end();

  encoder.copyBufferToBuffer(outputBuffer, 0, stagingBuffer, 0, byteSize);
  device.queue.submit([encoder.finish()]);

  // --- Readback ---
  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(stagingBuffer.getMappedRange().slice(0));
  stagingBuffer.unmap();

  return result; // Float32Array [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
}
```

Chaque étape est indispensable : sans le garde-fou le shader lit hors buffer ; sans le staging on ne peut pas relire côté CPU ; sans `slice(0)` la vue devient invalide après `unmap()`.

### Exemple 2 — Combien de workgroups pour N particules ?

Le calcul du dispatch se trompe facilement. Confettis TribuZen, `@workgroup_size(64)` :

```typescript
const NUM_PARTICLES = 50_000;
const WORKGROUP_SIZE = 64;

// ceil(50000 / 64) = 782 workgroups
const workgroupCount = Math.ceil(NUM_PARTICLES / WORKGROUP_SIZE);
pass.dispatchWorkgroups(workgroupCount);

// Total d'invocations lancées : 782 * 64 = 50 048
// → 48 de plus que 50 000 : le garde-fou `if (i >= num_particles) { return; }`
//   les neutralise.
```

Vérification du modèle : `dispatchWorkgroups(782)` lance **782 workgroups**, chacun de 64 invocations, soit 50 048 threads. On ne passe **jamais** `50000` à `dispatchWorkgroups` — ce serait 50 000 × 64 = 3,2 millions d'invocations, 64× trop. La règle : `dispatchWorkgroups(ceil(N / workgroup_size))`, garde-fou dans le shader.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Passer le nombre d'éléments à `dispatchWorkgroups`

`dispatchWorkgroups(N)` lance **N workgroups**, pas N invocations. Passer `dispatchWorkgroups(50000)` avec `@workgroup_size(64)` lance 3,2 millions d'invocations. Le correct : `dispatchWorkgroups(Math.ceil(50000 / 64))`. On dispatche des **workgroups**, jamais des threads directement.

### PIÈGE #2 — Oublier le garde-fou `if (i >= length) return;`

`Math.ceil` lance quasi toujours **plus** d'invocations que d'éléments. Sans `if (i >= arrayLength(&buf)) { return; }`, les invocations en surplus lisent/écrivent hors du buffer — comportement indéfini, corruption ou plantage. Le garde-fou est **la première ligne** de tout compute shader indexé.

### PIÈGE #3 — Croire qu'il existe un mode `write` seul

En WGSL les storage buffers sont `read` **ou** `read_write` — il n'y a pas de « write-only ». Pour écrire un résultat, on déclare `var<storage, read_write>`, même si on ne fait qu'écrire. (Le mode `write` n'existe que pour les *storage textures*, pas pour les buffers.)

### PIÈGE #4 — Vouloir mapper directement un buffer `STORAGE`

Un `GPUBuffer` d'usage `STORAGE` **n'est pas mappable** par le CPU (`mapAsync` échoue). Il faut copier le résultat dans un **staging buffer** (`MAP_READ | COPY_DST`) via `copyBufferToBuffer`, puis mapper ce staging. Les buffers STORAGE vivent en VRAM optimisée GPU, non exposée au CPU.

### PIÈGE #5 — Lire `getMappedRange()` après `unmap()`

`getMappedRange()` renvoie une **vue** sur la mémoire mappée ; `unmap()` l'**invalide**. Lire `result[0]` après `unmap()` donne des données corrompues ou une erreur. Il faut **copier** (`.slice(0)`, ou `new Float32Array(range.slice(0))`) **avant** `unmap()`.

### PIÈGE #6 — Attendre une synchronisation entre workgroups

`workgroupBarrier()` / `storageBarrier()` synchronisent uniquement les invocations **d'un même** workgroup. Il n'existe **aucune** synchronisation entre workgroups dans un même dispatch. Pour cela, il faut terminer le pass, soumettre, puis lancer un nouveau pass (approche multi-pass, module 12). Compter sur un ordre entre workgroups est un bug garanti.

### PIÈGE #7 — Dépasser `maxComputeInvocationsPerWorkgroup`

`@workgroup_size(x, y, z)` doit vérifier `x * y * z <= 256` (la limite usuelle). `@workgroup_size(32, 32)` = 1024 fait **échouer la création du pipeline**. Pour une image, on prend `@workgroup_size(16, 16)` = 256, pas plus.

---

## 5. Ancrage TribuZen

Le compute shader ouvre le **calcul GPU parallèle** dans TribuZen — tout ce qui est « le même calcul sur des milliers d'éléments ».

**Confettis festifs (particules GPGPU).** Quand une sortie familiale est bouclée, un badge/trophée 3D déclenche une explosion de confettis : 50 000 particules simulées entièrement sur GPU (gravité + intégration d'Euler + rebond, section 2.8). Le buffer de particules porte l'usage `STORAGE | VERTEX` : le compute pass les met à jour, le render pass les dessine en `point-list`, **sans jamais repasser par le CPU** — 60 fps tenus.

**Recalcul des positions sur le globe.** La carte 3D des sorties place des dizaines/centaines de marqueurs sur un globe. Reprojeter tous les marqueurs (lat/lon → position 3D sur la sphère) à chaque changement de rayon/rotation est un calcul identique répété N fois : un compute shader le fait en un dispatch, résultat écrit dans un storage buffer relu ensuite par le render pass.

**Agrégats relus côté CPU.** Certains calculs (ex. compter les particules encore vivantes, ou une statistique sur les sorties) doivent revenir en JS : c'est le chemin staging buffer → `mapAsync` → `getMappedRange` de la section 2.9.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      compute/
        particlesCompute.wgsl   ← shader de simulation (section 2.8)
        ParticleSystem.ts       ← pipeline + buffer STORAGE|VERTEX + dispatch par frame
        gpuReadback.ts          ← staging + mapAsync (relire un agrégat)
      globe/
        markersReproject.wgsl   ← reprojection lat/lon → sphère en compute
```

> Le rendu hybride complet (compute pass **puis** render pass dans le même encoder, buffer partagé) et les optimisations (occupancy, mémoire coalescente) sont approfondis au **module 12**. Ici, on pose le compute : shader, dispatch, storage buffers, readback.

---

## 6. Points clés

1. Un compute shader est du calcul GPU **hors pipeline graphique** : buffers en entrée, buffers en sortie, pas d'image imposée (GPGPU).
2. Point d'entrée : `@compute @workgroup_size(x, y, z)` ; `y`/`z` valent `1` par défaut ; produit `x*y*z <= 256`.
3. `dispatchWorkgroups(gx, gy, gz)` lance des **workgroups** ; total d'invocations = `gx*gy*gz * x*y*z`. Jamais passer le nombre d'éléments directement.
4. Les builtins donnent l'adresse : `global_invocation_id` (id unique global, le plus utilisé), avec `gid = wid * workgroup_size + lid`.
5. Nombre de workgroups = `Math.ceil(count / workgroup_size)` ; **garde-fou** `if (i >= arrayLength(&buf)) return;` obligatoire.
6. Storage buffers en WGSL : `var<storage, read>` ou `read_write` (pas de write-only) ; usage JS `GPUBufferUsage.STORAGE`.
7. Workflow JS : `createComputePipeline` → `createBindGroup` → `beginComputePass` → `setPipeline`/`setBindGroup`/`dispatchWorkgroups`/`end` → `submit`.
8. Particules GPGPU : buffer `STORAGE | VERTEX` partagé compute→render, aucun aller-retour CPU ; intégration d'Euler `pos += vel * dt`.
9. Relire un résultat : un buffer `STORAGE` n'est pas mappable → copier vers un staging `MAP_READ | COPY_DST`, `mapAsync`, `getMappedRange`, **copier avant `unmap()`**.

---

## 7. Seeds Anki

```
En WGSL, comment déclare-t-on le point d'entrée d'un compute shader ?|Avec @compute @workgroup_size(x, y, z) devant la fonction. y et z valent 1 par défaut. @workgroup_size(64) = 64 invocations par workgroup. Le produit x*y*z ne doit pas dépasser maxComputeInvocationsPerWorkgroup (256 en pratique).
Quelle est la différence entre un workgroup et une invocation ?|Une invocation = un thread GPU (exécute la fonction une fois pour un élément). Un workgroup = un paquet d'invocations qui s'exécutent ensemble et partagent une mémoire locale (var<workgroup>). dispatchWorkgroups lance des workgroups, chacun contenant workgroup_size invocations.
Que lance dispatchWorkgroups(157) avec @workgroup_size(64) ?|157 WORKGROUPS, pas 157 invocations. Total d'invocations = 157 * 64 = 10 048 threads. Piège classique : passer le nombre d'éléments à dispatchWorkgroups. Correct : dispatchWorkgroups(Math.ceil(count / workgroup_size)).
Pourquoi tout compute shader indexé commence-t-il par if (i >= arrayLength(&buf)) return; ?|Parce que Math.ceil(count/workgroup_size) lance presque toujours PLUS d'invocations que d'éléments. Sans ce garde-fou, les invocations en surplus lisent/écrivent hors du buffer (comportement indéfini). i vient de global_invocation_id.x.
Quels modes d'accès existent pour un storage buffer en WGSL ?|var<storage, read> (lecture seule) et var<storage, read_write> (lecture + écriture). Il n'existe PAS de mode write-only pour les buffers : pour écrire un résultat on utilise read_write. Côté JS, usage GPUBufferUsage.STORAGE.
Que donne la relation entre global_invocation_id, workgroup_id et local_invocation_id ?|gid = wid * workgroup_size + lid. global_invocation_id est l'id unique de l'invocation sur toute la grille (le plus utilisé, mappé sur l'index de l'élément). local_invocation_id est sa position dans le workgroup, workgroup_id désigne le workgroup.
Pourquoi ne peut-on pas lire directement un buffer STORAGE côté CPU ?|Un buffer d'usage STORAGE n'est pas mappable (mapAsync échoue) : il vit en VRAM optimisée GPU. Il faut copier son contenu (copyBufferToBuffer) dans un staging buffer d'usage MAP_READ | COPY_DST, puis mapAsync + getMappedRange sur le staging.
Quel piège avec getMappedRange() et unmap() ?|getMappedRange() renvoie une VUE (ArrayBuffer) sur la mémoire mappée ; unmap() l'invalide. Il faut copier les données (ex. new Float32Array(range.slice(0))) AVANT d'appeler unmap(), sinon la lecture est corrompue.
Comment le compute évite-t-il l'aller-retour CPU pour des particules ?|Le buffer de particules porte l'usage STORAGE | VERTEX. Le compute pass met à jour les positions in-place (var<storage, read_write>), puis le render pass lit le MÊME buffer comme source de sommets. Rien ne repasse par le CPU → 50 000 particules à 60 fps.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-11-compute-shaders-et-gpgpu/README.md`. Coder une simulation de particules festives TribuZen en compute WebGPU (shader WGSL, storage buffer, dispatch par frame, rendu en points), + une variante readback CPU. Corrigé HTML/TS commenté.
