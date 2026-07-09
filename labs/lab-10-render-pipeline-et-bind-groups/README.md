# Lab 10 — Render pipeline et bind groups : le trophée cube animé

> **Outcome :** à la fin, tu sais construire de zéro un `GPURenderPipeline` complet + un `GPUBindGroup` (uniform buffer + texture + sampler) et rendre un **cube texturé animé** dans un vrai navigateur WebGPU.
> **Vrai outil :** Chrome (ou Edge) ≥ 113 avec WebGPU, un serveur statique (`npx vite` ou `npx serve`), TypeScript via `<script type="module">` transpilé par Vite. JAMAIS de harnais simulé.
> **Feedback :** le coach valide en session (le cube tourne, la texture apparaît, une face est éclairée) — pas de test-runner auto-correcteur.

## Énoncé

Rendre le **trophée 3D de TribuZen** : un cube texturé (damier procédural), éclairé en directionnel, qui tourne en continu. Tu pars d'un starter qui te donne **l'init WebGPU et la géométrie du cube** (déjà vus au module 09). À toi d'écrire les briques du module 10 :

1. le **shader WGSL** (struct uniforms, vertex + fragment, échantillonnage texture, éclairage) ;
2. le **`GPURenderPipeline`** (vertex buffer layout + depth-stencil) ;
3. la **texture** damier + le **sampler** ;
4. l'**uniform buffer** aligné (208 o) + le **bind group** ;
5. la **boucle de rendu** (mise à jour uniforms + render pass indexé).

### Pré-requis navigateur

Ouvre `chrome://gpu` et vérifie que « WebGPU » est *Enabled*. Sers le dossier en HTTP (WebGPU refuse `file://`) :

```bash
npx vite          # ou : npx serve .
```

### Starter — `index.html`

```html
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><title>Trophée TribuZen — WebGPU</title>
<style>body{margin:0;background:#111}canvas{display:block;width:100vw;height:100vh}</style></head>
<body>
  <canvas id="gpu"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

### Starter — `geometry.ts` (fourni, ne pas réécrire)

```typescript
// Cube interleavé : position(3) + normal(3) + uv(2) = 8 floats/sommet, 24 sommets.
export const cubeVertices = new Float32Array([
  // avant
  -1,-1, 1,  0,0,1,  0,1,   1,-1, 1,  0,0,1,  1,1,   1, 1, 1,  0,0,1,  1,0,  -1, 1, 1,  0,0,1,  0,0,
  // arrière
   1,-1,-1,  0,0,-1, 0,1,  -1,-1,-1,  0,0,-1, 1,1,  -1, 1,-1,  0,0,-1, 1,0,   1, 1,-1,  0,0,-1, 0,0,
  // haut
  -1, 1, 1,  0,1,0,  0,1,   1, 1, 1,  0,1,0,  1,1,   1, 1,-1,  0,1,0,  1,0,  -1, 1,-1,  0,1,0,  0,0,
  // bas
  -1,-1,-1,  0,-1,0, 0,1,   1,-1,-1,  0,-1,0, 1,1,   1,-1, 1,  0,-1,0, 1,0,  -1,-1, 1,  0,-1,0, 0,0,
  // droite
   1,-1, 1,  1,0,0,  0,1,   1,-1,-1,  1,0,0,  1,1,   1, 1,-1,  1,0,0,  1,0,   1, 1, 1,  1,0,0,  0,0,
  // gauche
  -1,-1,-1, -1,0,0,  0,1,  -1,-1, 1, -1,0,0,  1,1,  -1, 1, 1, -1,0,0,  1,0,  -1, 1,-1, -1,0,0,  0,0,
]);
export const cubeIndices = new Uint16Array([
   0, 1, 2,  0, 2, 3,    4, 5, 6,  4, 6, 7,    8, 9,10,  8,10,11,
  12,13,14, 12,14,15,   16,17,18, 16,18,19,   20,21,22, 20,22,23,
]);
```

### Starter — `main.ts` (init fourni, TODOs à remplir)

```typescript
import { cubeVertices, cubeIndices } from './geometry';

async function main() {
  const canvas = document.getElementById('gpu') as HTMLCanvasElement;
  canvas.width = 800; canvas.height = 600;

  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU indisponible (chrome://gpu).');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  // TODO 1 — shader WGSL (const WGSL = `...`)
  // TODO 2 — vertexBuffer + indexBuffer (VERTEX/INDEX | COPY_DST)
  // TODO 3 — pipeline (vertex layout + depthStencil)
  // TODO 4 — depthTexture
  // TODO 5 — texture damier + sampler
  // TODO 6 — uniformBuffer (208 o) + bindGroup
  // TODO 7 — boucle render()
}
main();
```

## Étapes (en friction)

1. **Écris le shader WGSL** : struct `Uniforms { model, view, projection: mat4x4f, light_dir: vec3f }`, les 3 bindings (`var<uniform>`, `texture_2d<f32>`, `sampler`), un `@vertex` qui applique MVP et transmet normal+uv, un `@fragment` qui fait `textureSample` × éclairage diffus. Ne regarde le corrigé qu'après avoir tenté.
2. **Crée les buffers** vertex et index (`writeBuffer`). Oublie volontairement `COPY_DST` une fois pour voir l'erreur de validation, puis corrige.
3. **Construis le pipeline** : `GPUVertexBufferLayout` avec `arrayStride: 32` et 3 attributs (offsets 0/12/24), `depthStencil` en `depth24plus` / `less`. Vérifie que `shaderLocation` correspond aux `@location` du shader.
4. **Génère la texture damier** (boucle double, `writeTexture`, `bytesPerRow: S*4`) et le sampler linéaire `repeat`.
5. **Alloue l'uniform buffer (208 o)** et le bind group via `pipeline.getBindGroupLayout(0)`. Remplis le `Float32Array(52)` aux bons offsets (model 0, view 16, projection 32, light 48).
6. **Écris la boucle** `requestAnimationFrame` : recalcule la matrice `model` (rotation Y = `performance.now()`), `writeBuffer`, encode le render pass (color + depth), `drawIndexed(36)`, `submit`.
7. **Casse et observe** : mets `depthCompare: 'always'` → les faces arrière percent ; remets `'less'`. Mets `count: 4` en multisample sans texture MSAA → erreur ; comprends pourquoi.

## Corrigé complet commenté

`shader.wgsl` (inline dans `main.ts` sous forme de template string) :

```wgsl
struct Uniforms {
  model: mat4x4f,        // offset 0   (64 o)
  view: mat4x4f,         // offset 64  (64 o)
  projection: mat4x4f,   // offset 128 (64 o)
  light_dir: vec3f,      // offset 192 (12 o, align 16 OK) + 4 o padding → 208 o
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var t_diffuse: texture_2d<f32>;   // texture séparée du sampler
@group(0) @binding(2) var s_diffuse: sampler;

struct VOut {
  @builtin(position) position: vec4f,   // clip space (obligatoire)
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
}

@vertex
fn vs_main(
  @location(0) pos: vec3f,     // matche l'attribut offset 0
  @location(1) normal: vec3f,  // offset 12
  @location(2) uv: vec2f,      // offset 24
) -> VOut {
  var out: VOut;
  // MVP : projection * view * model * position
  out.position = u.projection * u.view * u.model * vec4f(pos, 1.0);
  // normale en espace monde (w=0 → pas de translation)
  out.normal = (u.model * vec4f(normal, 0.0)).xyz;
  out.uv = uv;
  return out;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4f {
  let N = normalize(in.normal);
  let L = normalize(u.light_dir);
  let diffuse = max(dot(N, L), 0.0);                       // Lambert
  let albedo = textureSample(t_diffuse, s_diffuse, in.uv).rgb;
  return vec4f(albedo * (0.15 + diffuse), 1.0);            // ambient + diffus
}
```

`main.ts` (corps complet des TODO) :

```typescript
import { cubeVertices, cubeIndices } from './geometry';

async function main() {
  const canvas = document.getElementById('gpu') as HTMLCanvasElement;
  canvas.width = 800; canvas.height = 600;

  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error('WebGPU indisponible (chrome://gpu).');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  // TODO 2 — buffers géométrie (COPY_DST obligatoire pour writeBuffer)
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

  // TODO 3 — pipeline
  const module = device.createShaderModule({ code: WGSL /* la string ci-dessus */ });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',                       // bind group layout inféré du WGSL
    vertex: {
      module, entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 32,                  // 8 floats × 4 o
        attributes: [
          { shaderLocation: 0, offset: 0,  format: 'float32x3' }, // position
          { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
          { shaderLocation: 2, offset: 24, format: 'float32x2' }, // uv
        ],
      }],
    },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });

  // TODO 4 — depth texture (même taille que le canvas)
  const depthTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // TODO 5 — texture damier + sampler
  const S = 64;
  const texData = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const c = (((x >> 3) ^ (y >> 3)) & 1) ? 220 : 40;  // damier 8×8 px
    texData[i] = c; texData[i + 1] = c; texData[i + 2] = c; texData[i + 3] = 255;
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

  // TODO 6 — uniform buffer (208 o) + bind group
  const uniformBuffer = device.createBuffer({
    size: 208,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),   // valable car layout:'auto'
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texture.createView() },
      { binding: 2, resource: sampler },
    ],
  });

  // TODO 7 — boucle de rendu
  const aspect = canvas.width / canvas.height;
  function frame() {
    const t = performance.now() / 1000;

    // uniforms : 208 o = 52 floats
    const data = new Float32Array(52);
    const c = Math.cos(t), s = Math.sin(t);
    data.set([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1], 0);   // model (rot Y)
    data.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,-5,1], 16);  // view (recul 5)
    const f = 1 / Math.tan(Math.PI / 8), near = 0.1, far = 100;
    data.set([f/aspect,0,0,0, 0,f,0,0, 0,0,far/(near-far),-1, 0,0,near*far/(near-far),0], 32);
    data[48] = 0.5; data[49] = 1.0; data[50] = 0.3;       // light_dir
    device.queue.writeBuffer(uniformBuffer, 0, data);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.05, b: 0.08, a: 1 },
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
    pass.drawIndexed(36);          // 36 indices = 12 triangles = 1 cube
    pass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  frame();
}
main();
```

Résultat attendu : un cube damier qui tourne, une face nettement plus claire (celle qui fait face à `light_dir`), fond bleu nuit. Retirer le `depthStencilAttachment` fait clignoter/percer les faces arrière — preuve que le depth test travaille.

## Grille d'auto-évaluation

| Critère | Non acquis | En cours | Acquis |
|---------|-----------|----------|--------|
| Pipeline créé (vertex layout + depth) | copié sans comprendre | pipeline OK, layout flou | sait justifier stride/offset/format |
| Bind group (uniform + texture + sampler) | 1 seule ressource | 3 entries, rôles confus | distingue texture/sampler et leurs `@binding` |
| Uniform buffer aligné | mauvais offsets, cube déformé | offsets OK par copie | explique l'align 16 de `vec3f` |
| Render pass + depth | pas de depth | depth OK sans comprendre | sait pourquoi `less` + `clearValue 1.0` |
| Animation | statique | tourne | model réécrit/frame sans recompiler |

## Variante J+30 (fading)

Reprends **de mémoire, en 25 min, sans relire le corrigé** : rends le même cube mais **remplace le damier par une texture chargée depuis un fichier PNG** (`fetch` → `createImageBitmap` → `device.queue.copyExternalImageToTexture`). Contrainte : la texture doit alors avoir l'usage `RENDER_ATTACHMENT` en plus, et tu ne dois pas toucher au pipeline ni au bind group **layout** — seule la `GPUTextureView` change. Si tu bloques sur l'alignement de l'uniform buffer, c'est le signal que la notion n'est pas ancrée : refais l'Exemple 2 du module.

## Application TribuZen

Porte ce cube dans `smaurier/tribuzen` comme composant `TrophyCanvas.vue` : un `<canvas>` WebGPU monté dans le profil famille, qui affiche le badge du dernier défi bouclé. Extrais `pipeline.ts` (création pipeline), `cubeGeometry.ts` et `uniforms.ts` (struct 208 o + `writeBuffer`). La texture du badge est choisie selon le palier (bronze/argent/or) : on échange la `GPUTextureView` dans le bind group, le pipeline reste identique.

Commit suggéré sur `smaurier/tribuzen` :

```
feat(3d): trophée cube WebGPU animé (pipeline + bind group + uniform)

- TrophyCanvas.vue : rendu WebGPU du badge sur le profil famille
- pipeline.ts / cubeGeometry.ts / uniforms.ts (struct 208 o alignée WGSL)
- texture par palier (bronze/argent/or) via échange de GPUTextureView
```
