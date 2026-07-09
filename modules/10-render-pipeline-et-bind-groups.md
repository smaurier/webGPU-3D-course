---
titre: Render pipeline et bind groups (WebGPU)
cours: 20-webgpu-3d
notions:
  - "GPURenderPipeline (objet immutable, pré-compilé)"
  - "layout: 'auto' vs GPUPipelineLayout explicite"
  - "GPUVertexBufferLayout (arrayStride, stepMode, attributes)"
  - "formats d'attributs (float32x3, float32x2, unorm8x4)"
  - "GPUBindGroupLayout (binding, visibility, type de ressource)"
  - "GPUBindGroup (entries immutables : buffer, texture, sampler)"
  - "@group(G) @binding(B) côté WGSL"
  - "uniform buffer (writeBuffer, règles d'alignement WGSL)"
  - "textures et samplers WebGPU (séparés)"
  - "render pass (colorAttachments, depthStencilAttachment, loadOp/storeOp)"
outcomes:
  - sait créer un GPURenderPipeline complet avec vertex/fragment stages et depth-stencil
  - sait décrire un vertex buffer via GPUVertexBufferLayout (stride, offset, format)
  - sait construire un bind group layout puis un bind group (uniform + texture + sampler)
  - sait remplir un uniform buffer en respectant les règles d'alignement WGSL
  - sait encoder un render pass complet et dessiner un mesh indexé
prerequis:
  - "06-webgl-fondamentaux (VBO, attributs, uniforms, draw call — le modèle WebGL à contraster)"
  - "09-webgpu-architecture-et-wgsl (adapter/device, canvas configure, WGSL, premier triangle)"
next: 11-compute-shaders-et-gpgpu
libs: []
tribuzen: "moteur de rendu 3D TribuZen — passer du triangle au premier objet réel : un badge/trophée 3D texturé et animé (cube tournant) rendu via un pipeline WebGPU complet, uniform buffer + bind group"
last-reviewed: 2026-07
---

# Render pipeline et bind groups (WebGPU)

> **Outcomes — tu sauras FAIRE :** créer un `GPURenderPipeline` complet, décrire un vertex buffer via `GPUVertexBufferLayout`, construire un bind group (uniform + texture + sampler), remplir un uniform buffer aligné WGSL, et encoder un render pass qui dessine un mesh indexé animé.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** le module 09 a posé l'architecture WebGPU (adapter/device, canvas, WGSL) et affiché **un triangle** avec un pipeline minimal et **zéro ressource**. Ici on passe à un **objet réel** : un cube texturé, éclairé, animé. Ça exige les trois briques que 09 n'avait pas — vertex buffers structurés, uniform buffers, et le **système de bind groups** qui remplace tous les `gl.uniform*` / `gl.bindTexture` de WebGL. Le compute (module 11) et le WebGPU avancé (module 12) s'appuient dessus.

## 1. Cas concret d'abord

TribuZen veut récompenser les familles : quand une famille boucle un défi (5 sorties dans le mois), elle gagne un **trophée 3D animé** affiché sur son profil — un cube texturé qui tourne lentement, éclairé, comme un vrai badge de jeu vidéo.

Au module 09, on savait afficher **un triangle** WebGPU. Mais un triangle codé en dur dans le shader, sans données externes, ne mène nulle part : pas de géométrie réutilisable, pas de texture, pas de matrice de caméra, pas d'animation. Le réflexe « je continue comme WebGL » ne marche pas — WebGPU n'a **ni** `gl.uniformMatrix4fv`, **ni** `gl.bindTexture`, **ni** `gl.vertexAttribPointer`.

```typescript
// ❌ Aucune de ces méthodes n'existe en WebGPU
gl.uniformMatrix4fv(loc, false, modelMatrix); // pas de uniform*
gl.activeTexture(gl.TEXTURE0);                 // pas de texture units mutables
gl.bindTexture(gl.TEXTURE_2D, tex);            // pas de bindTexture
gl.vertexAttribPointer(0, 3, gl.FLOAT, ...);   // pas de vertexAttribPointer
```

En WebGPU, **tout se déclare à l'avance**, une seule fois, dans deux objets immutables : le **pipeline** (qui décrit la géométrie et les étages de shader) et les **bind groups** (qui regroupent les ressources — matrices, texture, sampler). Ensuite, chaque frame se résume à cinq appels : `setPipeline`, `setBindGroup`, `setVertexBuffer`, `setIndexBuffer`, `drawIndexed`.

Ce module construit ce trophée cube de bout en bout : le pipeline, le bind group, l'uniform buffer aligné, le render pass avec depth test.

---

## 2. Théorie complète, concise

### 2.1 GPURenderPipeline : un objet immutable

En WebGL, l'état de rendu est **mutable et global** : on change le shader, le blending, le culling par des appels séparés en cours de route. En WebGPU, tout ça est figé dans **un seul objet pré-compilé et immutable** : le `GPURenderPipeline`. Une variante (autre shader, autre blending) = un **autre** pipeline.

Un pipeline combine : les deux étages programmables (`vertex`, `fragment`), la description des vertex buffers, la configuration de rasterisation (`primitive`), le test de profondeur (`depthStencil`), et le MSAA (`multisample`).

```typescript
const pipeline = device.createRenderPipeline({
  label: 'Trophée cube',
  layout: 'auto',                         // layout inféré depuis le WGSL
  vertex: {
    module: shaderModule,
    entryPoint: 'vs_main',                // optionnel si un seul @vertex
    buffers: [vertexBufferLayout],        // cf. 2.3
  },
  fragment: {
    module: shaderModule,
    entryPoint: 'fs_main',
    targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
  },
  primitive: {
    topology: 'triangle-list',
    frontFace: 'ccw',                     // face avant = sommets anti-horaires
    cullMode: 'back',                     // ne pas dessiner les faces arrière
  },
  depthStencil: {                         // cf. 2.7
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});
```

`entryPoint` est **optionnel** : si le module WGSL contient une seule fonction `@vertex` (resp. `@fragment`), le navigateur la choisit par défaut (confirmé MDN).

### 2.2 Pipeline layout : `'auto'` vs explicite

Le **pipeline layout** décrit la structure des bind groups qu'attend le shader. Deux options :

- **`layout: 'auto'`** — WebGPU infère les bind group layouts depuis le code WGSL (les `@group`/`@binding`). Simple, parfait pour un pipeline unique. On récupère ensuite le layout inféré via `pipeline.getBindGroupLayout(0)`.
- **Layout explicite** — on crée les `GPUBindGroupLayout` à la main puis un `GPUPipelineLayout`. Nécessaire pour **partager** un layout entre plusieurs pipelines, ou créer un bind group **avant** le pipeline.

```typescript
// 'auto' : le layout du @group(0) est récupéré APRÈS création du pipeline
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [ /* ... */ ],
});
```

| Situation | Choix |
|-----------|-------|
| Apprentissage, pipeline unique | `'auto'` |
| Plusieurs pipelines partagent des bind groups | layout explicite |
| Bind group créé avant le pipeline | layout explicite |
| Éviter les re-créations (perf) | layout explicite |

Ce module utilise `'auto'` ; le module 12 (WebGPU avancé) introduit les layouts explicites partagés.

### 2.3 Vertex buffers : `GPUVertexBufferLayout`

Un vertex buffer est un bloc d'octets. Le `GPUVertexBufferLayout` **décrit** comment le GPU le découpe en sommets — l'équivalent structuré du `vertexAttribPointer` de WebGL, mais posé **une fois** dans le pipeline.

```typescript
// Un vertex = position(vec3f) + normal(vec3f) + uv(vec2f) = 8 floats = 32 octets
const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 32,             // octets entre deux sommets
  stepMode: 'vertex',          // un vertex par invocation (défaut)
  attributes: [
    { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // @location(0) position
    { shaderLocation: 1, offset: 12, format: 'float32x3' }, // @location(1) normal
    { shaderLocation: 2, offset: 24, format: 'float32x2' }, // @location(2) uv
  ],
};
```

- `arrayStride` : taille totale d'un sommet en **octets**.
- `offset` : position **en octets** de l'attribut dans le sommet (`float32x3` = 12 octets, donc l'uv commence à 24).
- `shaderLocation` : correspond au `@location(n)` WGSL.
- `format` : encode type + nombre de composantes.

Formats d'attributs courants :

| Format | Type WGSL | Taille | Usage |
|--------|-----------|--------|-------|
| `float32x2` | `vec2f` | 8 o | UV, position 2D |
| `float32x3` | `vec3f` | 12 o | position 3D, normal |
| `float32x4` | `vec4f` | 16 o | couleur RGBA, tangente |
| `unorm8x4` | `vec4f` | 4 o | couleur compacte (0-255 → 0.0-1.0) |
| `uint32` | `u32` | 4 o | index, ID |

`stepMode: 'instance'` fait avancer le buffer d'un stride **par instance** au lieu de par sommet — base de l'instancing (module 17).

### 2.4 Bind groups : le cœur du système de ressources

C'est **le** changement de paradigme vs WebGL. En WebGL, chaque ressource est liée individuellement, dans un état global mutable :

```typescript
// WebGL : chaque binding est un appel séparé, oublier un bind = bug silencieux
gl.uniformMatrix4fv(modelLoc, false, model);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, diffuseTex);
gl.uniform1i(diffuseLoc, 0);
```

En WebGPU, les ressources sont regroupées dans un **`GPUBindGroup` immutable**, validé **à la création** :

```typescript
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } }, // GPUBufferBinding
    { binding: 1, resource: texture.createView() },       // GPUTextureView
    { binding: 2, resource: sampler },                    // GPUSampler
  ],
});

// À l'utilisation : un seul appel pour tout le groupe
pass.setBindGroup(0, bindGroup);
```

Chaque `entry` a un `binding` (qui matche `@binding(n)` WGSL) et un `resource`. Le `resource` prend plusieurs formes (confirmé MDN) : un `GPUBufferBinding` (`{ buffer, offset?, size? }`), un `GPUTextureView`, un `GPUSampler`, ou un `GPUExternalTexture`.

Côté WGSL, on référence chaque ressource par `@group(G) @binding(B)` :

```wgsl
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;
```

**Bonne pratique** : organiser les bind groups **par fréquence de mise à jour** — `@group(0)` = données par frame (caméra, temps), `@group(1)` = par matériau (textures), `@group(2)` = par objet (matrice model). On ne re-bind que ce qui change.

### 2.5 GPUBindGroupLayout (quand explicite)

Si on ne prend pas `'auto'`, on décrit soi-même la structure. Chaque entrée déclare le `binding`, la **visibilité** (quels étages y accèdent) et le **type** de ressource :

```typescript
const bindGroupLayout = device.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' } },
  ],
});
```

La visibilité est un **avantage sécurité/perf** de WebGPU : le GPU sait exactement quel étage lit quoi, et valide dès la création. Avec `'auto'`, WebGPU déduit tout ça du WGSL.

### 2.6 Uniform buffers et alignement WGSL

En WebGL on envoyait chaque uniform par un appel (`gl.uniform*`). En WebGPU, les uniforms vivent dans **un buffer** qu'on remplit avec `device.queue.writeBuffer`. Le buffer doit avoir l'usage `UNIFORM | COPY_DST` :

```typescript
const uniformBuffer = device.createBuffer({
  size: 208,   // doit correspondre à la struct WGSL (cf. alignement)
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Mise à jour (chaque frame)
device.queue.writeBuffer(uniformBuffer, 0, floatData);
```

**Piège majeur : l'alignement WGSL.** WGSL impose des règles strictes qui ne suivent **pas** l'intuition C. En particulier `vec3f` a un **alignement de 16 octets** (pas 12) :

```
f32       → align 4,  size 4
vec2f     → align 8,  size 8
vec3f     → align 16, size 12   ← align 16, PAS 12 !
vec4f     → align 16, size 16
mat4x4f   → align 16, size 64
```

Concrètement, une struct mal ordonnée gaspille de la place et **décale les champs** — si le JS écrit aux mauvais offsets, l'objet est déformé sans erreur :

```wgsl
struct Uniforms {
  model: mat4x4f,       // offset 0,   64 o
  view: mat4x4f,        // offset 64,  64 o
  projection: mat4x4f,  // offset 128, 64 o
  light_dir: vec3f,     // offset 192, 12 o  (align 16 → offset 192 OK)
  // padding 4 o        → taille totale 208 o
}
```

Côté JS, on écrit dans un `Float32Array` en respectant ces offsets (en **floats** = octets / 4) : `model` à l'index 0, `view` à 16, `projection` à 32, `light_dir` à 48.

### 2.7 Textures et samplers WebGPU

Autre rupture avec WebGL : **texture et sampler sont séparés**. En GLSL, un `sampler2D` fusionne les deux. En WebGPU/WGSL, une `texture_2d<f32>` (les données) et un `sampler` (comment échantillonner) sont deux ressources distinctes — on peut réutiliser un sampler pour plusieurs textures.

Créer une texture, la remplir, en faire une vue, créer un sampler :

```typescript
const texture = device.createTexture({
  size: { width, height },
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
device.queue.writeTexture(
  { texture },
  pixelData,                       // Uint8Array RGBA
  { bytesPerRow: width * 4 },
  { width, height },
);
const view = texture.createView();
const sampler = device.createSampler({
  magFilter: 'linear', minFilter: 'linear',
  addressModeU: 'repeat', addressModeV: 'repeat',
});
```

Pour charger depuis une image, `device.queue.copyExternalImageToTexture({ source: imageBitmap }, { texture }, size)` (la texture doit alors aussi avoir l'usage `RENDER_ATTACHMENT`). Dans le shader : `textureSample(t_diffuse, s_diffuse, uv)`.

### 2.8 Depth test et render pass

Sans depth test, les objets sont dessinés dans l'ordre de soumission — un objet dessiné en dernier passe devant même s'il est géométriquement derrière. On crée une **texture de profondeur** et on l'attache au render pass.

```typescript
const depthTexture = device.createTexture({
  size: { width: canvas.width, height: canvas.height },
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
```

Le **render pass** décrit où l'on rend. `loadOp: 'clear'` efface au début, `storeOp: 'store'` conserve le résultat :

```typescript
const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 0.05, g: 0.05, b: 0.08, a: 1 },
    loadOp: 'clear',
    storeOp: 'store',
  }],
  depthStencilAttachment: {
    view: depthTexture.createView(),
    depthClearValue: 1.0,           // profondeur max = loin
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  },
});
```

`depthClearValue: 1.0` + `depthCompare: 'less'` : le fragment le plus **proche** (plus petit z) gagne.

### 2.9 Encoder une frame

Le rendu WebGPU est **command-based** : on encode des commandes dans un `GPUCommandEncoder`, on ferme le pass, on soumet à la queue. Le draw indexé consomme le pipeline + bind group + buffers courants :

```typescript
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass(renderPassDesc);
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.setVertexBuffer(0, vertexBuffer);
pass.setIndexBuffer(indexBuffer, 'uint16');
pass.drawIndexed(36);               // 36 indices = 12 triangles = 1 cube
pass.end();
device.queue.submit([encoder.finish()]);
```

Cinq appels au lieu des ~15 de WebGL, et la validation a eu lieu **à la création** du pipeline/bind group, pas au draw.

---

## 3. Worked examples

### Exemple 1 — Vertex buffer + bind group d'un cube (TribuZen)

Le trophée : un cube interleavé `position(3) + normal(3) + uv(2)`, indexé, avec un bind group uniform + texture + sampler.

**La géométrie et les buffers :**

```typescript
// 8 floats par sommet, 24 sommets (4 par face, normales propres par face)
const cubeVertices = new Float32Array([
  // face avant : position       normal       uv
  -1, -1,  1,   0, 0, 1,   0, 1,
   1, -1,  1,   0, 0, 1,   1, 1,
   1,  1,  1,   0, 0, 1,   1, 0,
  -1,  1,  1,   0, 0, 1,   0, 0,
  // ... 5 autres faces (24 sommets au total) ...
]);
const cubeIndices = new Uint16Array([
  0, 1, 2,  0, 2, 3,   // avant
  // ... 5 autres faces → 36 indices ...
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
```

**Une texture procédurale (damier) + sampler :**

```typescript
const S = 64;
const texData = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const white = ((x >> 3) ^ (y >> 3)) & 1;   // damier 8×8 px
    const c = white ? 220 : 40;
    texData[i] = c; texData[i + 1] = c; texData[i + 2] = c; texData[i + 3] = 255;
  }
}
const texture = device.createTexture({
  size: { width: S, height: S },
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
device.queue.writeTexture({ texture }, texData, { bytesPerRow: S * 4 }, { width: S, height: S });
const sampler = device.createSampler({
  magFilter: 'linear', minFilter: 'linear',
  addressModeU: 'repeat', addressModeV: 'repeat',
});
```

**Le bind group (layout `'auto'`) :**

```typescript
const uniformBuffer = device.createBuffer({
  size: 208,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),  // récupéré du pipeline 'auto'
  entries: [
    { binding: 0, resource: { buffer: uniformBuffer } },
    { binding: 1, resource: texture.createView() },
    { binding: 2, resource: sampler },
  ],
});
```

Un seul bind group porte les trois ressources ; à l'usage, un seul `setBindGroup(0, bindGroup)` suffit.

### Exemple 2 — Remplir l'uniform buffer sans se tromper d'offset

L'écueil qui déforme silencieusement l'objet : écrire les matrices aux mauvais offsets. La struct WGSL fait 208 octets (3 `mat4x4f` + `vec3f` + padding). On écrit dans un `Float32Array` — les offsets sont en **floats** (octets / 4) :

```typescript
function updateUniforms(t: number, aspect: number) {
  // 208 octets = 52 floats
  const data = new Float32Array(52);

  // model : rotation Y (offset 0, 16 floats)
  const c = Math.cos(t), s = Math.sin(t);
  data.set([c, 0, -s, 0,  0, 1, 0, 0,  s, 0, c, 0,  0, 0, 0, 1], 0);

  // view : recul de 4 unités (offset 16)
  data.set([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, -4, 1], 16);

  // projection : perspective (offset 32)
  const f = 1 / Math.tan(Math.PI / 8), near = 0.1, far = 100;
  data.set([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0,
  ], 32);

  // light_dir : vec3f (offset 48 ; align 16 → tombe pile sur 48)
  data[48] = 0.5; data[49] = 1.0; data[50] = 0.3;

  device.queue.writeBuffer(uniformBuffer, 0, data);
}
```

Le shader lit exactement cette disposition :

```wgsl
struct Uniforms {
  model: mat4x4f,
  view: mat4x4f,
  projection: mat4x4f,
  light_dir: vec3f,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;
@group(0) @binding(2) var s_diffuse: sampler;

struct VOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
}

@vertex
fn vs_main(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VOut {
  var out: VOut;
  out.position = u.projection * u.view * u.model * vec4f(pos, 1.0);
  out.normal = (u.model * vec4f(normal, 0.0)).xyz;
  out.uv = uv;
  return out;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let L = normalize(u.light_dir);
  let diffuse = max(dot(N, L), 0.0);
  let albedo = textureSample(t_diffuse, s_diffuse, in.uv).rgb;
  return vec4f(albedo * (0.15 + diffuse), 1.0);   // ambient 0.15 + diffus
}
```

Le cube tourne (l'uniform `model` change chaque frame), la texture est échantillonnée, l'éclairage directionnel donne le relief — sans **aucune** recompilation de shader, on ne réécrit que l'uniform buffer.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire qu'un pipeline est mutable comme l'état WebGL

Un `GPURenderPipeline` est **immutable**. On ne « change pas le blending » ou « le cull mode » entre deux draws sur le même pipeline. Chaque combinaison d'états = **un pipeline distinct** créé à l'avance (ex. un pipeline opaque + un pipeline transparent). C'est ce qui rend WebGPU rapide : zéro validation au draw.

### PIÈGE #2 — Alignement `vec3f` : croire qu'il fait 12 octets d'alignement

`vec3f` a une **taille** de 12 octets mais un **alignement de 16**. Placer un `vec3f` suivi d'un `f32` ne les colle pas (`12 + 4`) : le `vec3f` force l'offset suivant à un multiple de 16. Ignorer ça décale tous les champs suivants et déforme l'objet **sans erreur**. Règle de survie : mettre les gros types (`mat4x4f`, `vec4f`) d'abord, vérifier chaque offset.

### PIÈGE #3 — Oublier `COPY_DST` sur un buffer qu'on remplit avec `writeBuffer`

`device.queue.writeBuffer(buf, ...)` copie **vers** le buffer. Sans le flag `GPUBufferUsage.COPY_DST` dans `usage`, WebGPU rejette l'écriture (erreur de validation). Un uniform buffer mis à jour chaque frame a **toujours** `UNIFORM | COPY_DST`.

### PIÈGE #4 — Confondre texture et sampler (réflexe WebGL)

En WebGL, `sampler2D` = texture + filtrage fusionnés. En WebGPU ce sont **deux bindings séparés** : `texture_2d<f32>` (les pixels) et `sampler` (le filtrage/wrap). Il faut deux entries distinctes dans le bind group, et deux `@binding` distincts en WGSL. Avantage : un même sampler sert plusieurs textures.

### PIÈGE #5 — Le `count` de `drawIndexed` est un nombre d'indices, pas de triangles

`pass.drawIndexed(36)` dessine **36 indices** = 12 triangles = 1 cube (6 faces × 2 triangles × 3 indices). Écrire `12` (« 12 triangles ») ne dessine qu'un tiers du cube. `count` = nombre d'**indices**.

### PIÈGE #6 — `getBindGroupLayout(0)` avec un pipeline non-`'auto'`

`pipeline.getBindGroupLayout(0)` ne renvoie un layout exploitable que si le pipeline a été créé avec `layout: 'auto'`. Avec un layout explicite, on utilise directement le `GPUBindGroupLayout` qu'on a créé. Mélanger les deux (créer le bind group avec `getBindGroupLayout` alors que le pipeline a un layout explicite compatible) marche parfois mais brouille l'intention — rester cohérent.

### PIÈGE #7 — Depth texture non redimensionnée après resize du canvas

La texture de profondeur a une taille **fixe** à la création. Si le canvas change de taille (resize fenêtre), il faut **recréer** la depth texture à la nouvelle dimension, sinon le render pass échoue (tailles color/depth incohérentes). Même logique que le drawing buffer en WebGL.

---

## 5. Ancrage TribuZen

Ce module fait passer le moteur 3D de TribuZen du **triangle brut** (module 09) au **premier objet réel** : le **trophée/badge 3D animé** affiché quand une famille boucle un défi.

**Le trophée cube.** Un cube texturé (texture du logo TribuZen ou motif du badge), éclairé en directionnel, qui tourne lentement sur le profil famille. Techniquement c'est exactement le worked example : vertex buffer interleavé, index buffer, uniform buffer (MVP + lumière), bind group (uniform + texture + sampler), depth test, boucle `requestAnimationFrame`.

- **`@group(0)` par frame** : matrices view/projection de la petite caméra du badge + temps (rotation).
- **texture** : l'image du badge selon le palier (bronze / argent / or) — on échange la `GPUTextureView` dans un bind group par palier, le reste du pipeline ne bouge pas.
- **model matrix** : la rotation animée, réécrite chaque frame dans l'uniform buffer.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      webgpu/
        pipeline.ts        ← createRenderPipeline (vertex layout + depth)
        cubeGeometry.ts     ← vertices interleavés + indices du cube
        uniforms.ts         ← struct 208 o + writeBuffer aligné
      TrophyCanvas.vue      ← <canvas webgpu> du badge, boucle rAF
```

> Le badge multi-objets (plusieurs trophées côte à côte), l'instancing et les effets viendront plus tard (modules 12, 17). Ici on pose la brique : **un** objet texturé, éclairé, animé, rendu par un pipeline + bind group WebGPU complets.

---

## 6. Points clés

1. `GPURenderPipeline` est **immutable** et pré-compilé ; une variante d'état = un autre pipeline (zéro validation au draw).
2. `layout: 'auto'` infère les bind group layouts du WGSL ; on récupère `pipeline.getBindGroupLayout(0)` pour créer le bind group.
3. `GPUVertexBufferLayout` décrit le vertex buffer : `arrayStride`, `stepMode`, `attributes` (`shaderLocation`/`offset`/`format`, offsets **en octets**).
4. Un `GPUBindGroup` regroupe des ressources **immutables** (buffer, texture view, sampler) ; `resource` accepte `GPUBufferBinding` / `GPUTextureView` / `GPUSampler`.
5. `@group(G) @binding(B)` en WGSL référence l'entrée correspondante ; organiser par fréquence de mise à jour (frame / matériau / objet).
6. Les uniforms passent par un buffer (`UNIFORM | COPY_DST`) rempli via `queue.writeBuffer` ; respecter l'**alignement WGSL** (`vec3f` align 16 !).
7. Texture et sampler sont **séparés** en WebGPU (`texture_2d<f32>` + `sampler`), échantillonnés par `textureSample(tex, samp, uv)`.
8. Le render pass déclare `colorAttachments` + `depthStencilAttachment` (`loadOp`/`storeOp`) ; `drawIndexed(count)` où `count` = nombre d'**indices**.

---

## 7. Seeds Anki

```
Pourquoi un GPURenderPipeline est-il immutable en WebGPU ?|Toute la config (shaders, blending, culling, depth, MSAA) est figée à la création. Une variante d'état = un AUTRE pipeline. Avantage : la validation a lieu à la création, pas au draw call → rendu rapide et prévisible (contraire de l'état global mutable de WebGL).
Que fait layout: 'auto' dans createRenderPipeline, et comment récupérer le bind group layout ?|WebGPU infère les bind group layouts depuis les @group/@binding du WGSL. On récupère le layout inféré du groupe 0 via pipeline.getBindGroupLayout(0) pour créer le bind group. Simple, parfait pour un pipeline unique.
Dans un GPUVertexBufferLayout, en quelle unité sont arrayStride et offset ?|En OCTETS. Pour position(vec3f)+normal(vec3f)+uv(vec2f) : arrayStride=32, offset normal=12, offset uv=24. shaderLocation matche @location(n) WGSL, format encode type+composantes (float32x3 = vec3f).
Quel est l'alignement de vec3f en WGSL, et pourquoi c'est un piège ?|vec3f a une TAILLE de 12 octets mais un ALIGNEMENT de 16. Un champ suivant un vec3f est décalé au prochain multiple de 16. Ignorer ça décale tous les offsets et déforme l'objet sans erreur. Solution : gros types d'abord, vérifier chaque offset.
Quelle est la différence WebGL vs WebGPU pour lier des ressources (uniforms, textures) ?|WebGL : chaque ressource liée individuellement (gl.uniform*, gl.bindTexture) dans un état global mutable, oubli = bug silencieux. WebGPU : ressources regroupées dans un GPUBindGroup immutable validé à la création, un seul setBindGroup(0, group) à l'usage.
Comment texture et sampler sont-ils gérés en WebGPU vs WebGL ?|WebGL : fusionnés dans sampler2D. WebGPU : SÉPARÉS — texture_2d<f32> (les pixels) et sampler (filtrage/wrap) sont deux bindings distincts. On échantillonne avec textureSample(tex, samp, uv). Avantage : un sampler réutilisable pour plusieurs textures.
Quels flags d'usage pour un uniform buffer mis à jour chaque frame via writeBuffer ?|GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST. COPY_DST est OBLIGATOIRE car writeBuffer copie VERS le buffer ; sans lui, erreur de validation. On remplit avec device.queue.writeBuffer(buffer, 0, data).
Dans pass.drawIndexed(36) pour un cube, que représente le 36 ?|Le nombre d'INDICES, pas de triangles. Un cube = 6 faces × 2 triangles × 3 indices = 36 indices = 12 triangles. Écrire 12 ne dessinerait qu'un tiers du cube.
Que déclarent colorAttachments et depthStencilAttachment dans un render pass, avec loadOp/storeOp ?|colorAttachments = cibles couleur (ex. la vue du canvas), depthStencilAttachment = texture de profondeur. loadOp:'clear' efface au début (clearValue), storeOp:'store' conserve le résultat. depthClearValue:1.0 + depthCompare:'less' = le fragment le plus proche gagne.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-10-render-pipeline-et-bind-groups/README.md`. Coder de zéro, dans Chrome/WebGPU, un cube texturé animé (uniform buffer + bind group) : pipeline complet, depth test, boucle rAF. Corrigé WGSL + TS commenté.
