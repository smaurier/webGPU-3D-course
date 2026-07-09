# Lab 12 — WebGPU avancé : instancing + mesure GPU

> **Outcome :** à la fin, tu sais rendre **des milliers de marqueurs** en un seul draw call via l'instancing WebGPU (`stepMode: 'instance'`), et mesurer le **temps GPU réel** de la passe avec les timestamp queries.
> **Vrai outil :** WebGPU natif dans **Chrome 113+** (`navigator.gpu`), un `<canvas>` + module TypeScript/JS servi par n'importe quel serveur statique (`npx serve`, extension Live Server…). Aucun harnais, aucun framework.
> **Feedback :** le coach valide **visuellement** en session (le champ de marqueurs s'affiche, tourne, et le temps GPU s'imprime dans la console) — pas de test-runner auto-correcteur.

---

## Énoncé

Tu construis `MarkerField` : un champ de **2000 marqueurs de sorties TribuZen** (des quads colorés) rendus **en un seul `drawIndexed` instancié**, plus un **`GpuTimer`** qui imprime le coût GPU de la passe.

Cahier des charges **exact** :

1. Initialiser WebGPU (`adapter` → `device` → configurer le `context` du canvas). Demander la feature `'timestamp-query'` si l'adapter la supporte.
2. Définir la géométrie d'**un** marqueur : un quad (4 sommets, 6 indices) dans un vertex buffer (`stepMode: 'vertex'`).
3. Générer **2000 instances**, chacune avec `offset` (vec2, position en clip space), `scale` (f32) et `color` (vec4) → un `Float32Array` uploadé dans un vertex buffer `stepMode: 'instance'`.
4. Un pipeline avec **deux vertex buffers** (géométrie + instances) ; le vertex shader combine sommet et données d'instance.
5. Un **seul** `drawIndexed(6, 2000)` par frame.
6. Encadrer la passe de `timestampWrites` (si la feature est là) et imprimer `X ms GPU` dans la console une fois par seconde.

**Prérequis navigateur :** ouvre `chrome://gpu` et vérifie que « WebGPU » est *Hardware accelerated*. Si `navigator.gpu` est `undefined`, mets à jour Chrome.

**Pas de gap-fill** — tu écris le tout à partir du starter minimal.

### Starter minimal

Deux fichiers, servis par un serveur statique (WebGPU exige `http(s)://`, pas `file://`).

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 12 — Marqueurs instanciés TribuZen</title>
  <style>
    body { margin: 0; background: #0b0f1a; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <canvas id="gpu-canvas"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`main.ts` (squelette — à compléter) :

```typescript
// À toi : initGpu(), construire le quad, générer 2000 instances,
// le pipeline à 2 vertex buffers, la boucle de frame, le GpuTimer.
async function initGpu(canvas: HTMLCanvasElement) {
  // navigator.gpu.requestAdapter() -> requestDevice() -> context.configure(...)
}

const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;
initGpu(canvas);
```

Lance : `npx serve` dans le dossier, ouvre l'URL dans Chrome.

---

## Étapes (en friction)

1. **Init WebGPU** — `requestAdapter()`, tester `adapter.features.has('timestamp-query')`, `requestDevice({ requiredFeatures })`, `context.configure({ device, format, alphaMode: 'opaque' })`. Jette une erreur claire si `navigator.gpu` est absent.
2. **Redimensionne le drawing buffer** — `canvas.width = clientWidth * devicePixelRatio` (idem hauteur).
3. **Géométrie du quad** — 4 sommets `vec2` en repère local `[-1,1]`, 6 indices (`uint16`) formant 2 triangles. Deux buffers : positions (`VERTEX`) + indices (`INDEX`).
4. **Génère 2000 instances** — boucle qui remplit un `Float32Array` : `offset` (vec2 aléatoire dans `[-0.95, 0.95]`), `scale` (~0.01–0.03), `color` (vec4). Upload en buffer `VERTEX | COPY_DST`.
5. **Écris le WGSL** — vertex : reçoit position de sommet (`@location(0)`) + offset/scale/color d'instance (`@location(1..3)`), calcule la position clip. Fragment : renvoie la couleur d'instance.
6. **Pipeline à 2 buffers** — buffer 0 `stepMode: 'vertex'` (le quad), buffer 1 `stepMode: 'instance'` (les instances). Attention aux `arrayStride` **en octets**.
7. **Frame** — `beginRenderPass` (clear), `setPipeline`, `setVertexBuffer(0, quad)`, `setVertexBuffer(1, instances)`, `setIndexBuffer`, **un** `drawIndexed(6, 2000)`, `end`, `submit`.
8. **GpuTimer** — ajoute `timestampWrites` à la passe, `resolveQuerySet` → `copyBufferToBuffer` → `mapAsync`, calcule `ms`, imprime au plus une fois/seconde. **Ne relis jamais** le buffer en cours de mapping (mesure une frame en retard).
9. **Vérifie** : les 2000 marqueurs s'affichent ; **augmente à 20000** — ça tient toujours à 60 fps (le CPU ne fait qu'un draw call). Compare le `ms GPU` entre 2000 et 20000.

---

## Corrigé complet commenté

`main.ts` :

```typescript
// main.ts — 2000 marqueurs instanciés + mesure du temps GPU (TribuZen)

const WGSL = /* wgsl */ `
struct Uniforms { aspect: f32 }
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VIn {
  @location(0) pos:    vec2f,  // sommet du quad (par sommet)
  @location(1) offset: vec2f,  // position du marqueur (par instance)
  @location(2) scale:  f32,    // taille (par instance)
  @location(3) color:  vec4f,  // couleur (par instance)
}
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs(in: VIn) -> VOut {
  // Corrige le ratio pour que les quads restent carrés à l'écran
  let p = vec2f(in.pos.x * in.scale / u.aspect, in.pos.y * in.scale) + in.offset;
  var out: VOut;
  out.clip = vec4f(p, 0.0, 1.0);
  out.color = in.color;
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  return in.color;
}
`;

async function main() {
  const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;

  // 1. Init WebGPU
  if (!navigator.gpu) throw new Error('WebGPU indisponible — Chrome 113+ requis.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('Aucun adapter GPU.');

  // Feature timestamp demandée seulement si supportée (sinon requestDevice échoue)
  const canTimestamp = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({
    requiredFeatures: canTimestamp ? ['timestamp-query'] : [],
  });

  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  // 2. Résolution réelle
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  // 3. Géométrie d'UN quad (4 sommets vec2, 6 indices)
  const quad = new Float32Array([-1, -1,  1, -1,  1, 1,  -1, 1]);
  const quadBuffer = device.createBuffer({ size: quad.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(quadBuffer, 0, quad);

  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const indexBuffer = device.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // 4. 2000 instances : offset(vec2) + scale(f32) + color(vec4) = 7 floats = 28 octets
  const COUNT = 2000;
  const FPI = 7;                          // floats par instance
  const inst = new Float32Array(COUNT * FPI);
  for (let i = 0; i < COUNT; i++) {
    const b = i * FPI;
    inst[b + 0] = (Math.random() * 2 - 1) * 0.95;  // offset.x
    inst[b + 1] = (Math.random() * 2 - 1) * 0.95;  // offset.y
    inst[b + 2] = 0.01 + Math.random() * 0.02;     // scale
    // Couleur = état de la sortie : vert (bouclée), orange (prévue), gris (annulée)
    const r = Math.random();
    if (r < 0.6)       { inst[b+3]=0.1; inst[b+4]=0.8; inst[b+5]=0.3; }  // vert
    else if (r < 0.85) { inst[b+3]=1.0; inst[b+4]=0.6; inst[b+5]=0.0; }  // orange
    else               { inst[b+3]=0.5; inst[b+4]=0.5; inst[b+5]=0.5; }  // gris
    inst[b + 6] = 1.0;                              // alpha
  }
  const instBuffer = device.createBuffer({ size: inst.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(instBuffer, 0, inst);

  // Uniform : aspect ratio (pour que les quads restent carrés)
  const ubo = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ubo, 0, new Float32Array([canvas.width / canvas.height]));

  // 5. Pipeline à 2 vertex buffers
  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        // Buffer 0 : géométrie du quad (par sommet) — 2 floats = 8 octets
        { arrayStride: 8, stepMode: 'vertex', attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x2' },
        ]},
        // Buffer 1 : instances (par instance) — 7 floats = 28 octets
        { arrayStride: 28, stepMode: 'instance', attributes: [
          { shaderLocation: 1, offset: 0,  format: 'float32x2' }, // offset
          { shaderLocation: 2, offset: 8,  format: 'float32'   }, // scale
          { shaderLocation: 3, offset: 12, format: 'float32x4' }, // color
        ]},
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubo } }],
  });

  // 8. GpuTimer (si la feature est là)
  let querySet: GPUQuerySet | null = null;
  let resolve: GPUBuffer | null = null;
  let readback: GPUBuffer | null = null;
  if (canTimestamp) {
    querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
    resolve  = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    readback = device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }
  let lastPrint = 0;
  let mapPending = false;

  // 7. Boucle de frame
  function frame(now: number) {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.043, g: 0.059, b: 0.102, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      // timestamps encadrant la passe (si supporté)
      ...(querySet ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}),
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, quadBuffer);   // géométrie
    pass.setVertexBuffer(1, instBuffer);   // instances
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(6, COUNT);            // UN seul draw call -> 2000 marqueurs
    pass.end();

    if (querySet && resolve && readback && !mapPending) {
      encoder.resolveQuerySet(querySet, 0, 2, resolve, 0);
      encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16);
    }
    device.queue.submit([encoder.finish()]);

    // Lire le timing UNE frame en retard (le buffer ne doit pas être remappé pendant qu'il est verrouillé)
    if (readback && !mapPending && now - lastPrint > 1000) {
      mapPending = true;
      readback.mapAsync(GPUMapMode.READ).then(() => {
        const ts = new BigUint64Array(readback!.getMappedRange());
        const ms = Number(ts[1] - ts[0]) / 1_000_000;
        console.log(`Passe marqueurs (${COUNT}) : ${ms.toFixed(3)} ms GPU`);
        readback!.unmap();
        mapPending = false;
        lastPrint = now;
      });
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
```

**Pourquoi ce corrigé est correct :**
- **Un seul `drawIndexed(6, COUNT)`** dessine les 2000 marqueurs : le CPU n'encode qu'un draw call, quel que soit le nombre d'instances (passer `COUNT` à 20000 ne change *rien* côté CPU).
- Le buffer 1 est en **`stepMode: 'instance'`** : son curseur avance une fois par marqueur ; `arrayStride: 28` est bien **en octets** (7 floats × 4).
- La feature `'timestamp-query'` est demandée **seulement si supportée** — sinon `requestDevice` échouerait ; le code dégrade proprement (pas de timing).
- Le `readback` n'est **jamais** remappé tant que `mapPending` est vrai : on lit une frame en retard, jamais le buffer verrouillé.
- Les timestamps sont en **nanosecondes** (`BigUint64Array`) ; la différence / 1e6 donne des millisecondes.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées.** De mémoire, en **30 minutes**, sans rouvrir ce corrigé ni le module :

1. Fais **tourner** le champ : ajoute un uniform `time` et une **rotation 2D** dans le vertex shader (les marqueurs orbitent lentement autour du centre).
2. Anime le nombre : passe de 2000 à **20000** instances et vérifie dans la console que le `ms GPU` monte mais que le fps tient — **preuve** que le goulot était le nombre de draw calls, pas le GPU.
3. **Sans** recréer le buffer d'instances à chaque frame (garde-le statique ; seul l'uniform `time` change via `writeBuffer`).

**Critère de réussite :** 20000 marqueurs tournent à 60 fps, et tu peux expliquer à voix haute pourquoi l'instancing débloque ce passage à l'échelle.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce lab devient le moteur du globe des sorties :

```
tribuzen/
  src/
    3d/
      gpu/
        MarkerInstancer.ts   ← build du Float32Array d'instances + drawIndexed instancié
        GpuTimer.ts          ← timestamp queries extraites en classe réutilisable
      GlobeCanvas.vue        ← <canvas> WebGPU, boucle de frame
```

**Différences par rapport au lab :**
- Les `offset` viennent de la **projection géo → clip space** (coordonnées réelles des sorties), pas de `Math.random()`.
- La `color` est dérivée de l'**état métier** de la sortie (`bouclée` / `prévue` / `annulée`), lu depuis le store, pas tiré au hasard.
- Le `GpuTimer` alimente un **overlay debug** (`Passe marqueurs : X ms`) togglable, pas un `console.log`.
- Le buffer d'instances est **reconstruit uniquement quand la liste des sorties change** (sinon réutilisé tel quel) — première brique du buffer pooling du module.

**Commit cible :**
```
feat(globe): rendu instancié des marqueurs de sorties + timer GPU (timestamp queries)
```
