# Lab 11 — Compute shaders et GPGPU

> **Outcome :** à la fin, tu sais écrire un compute shader WGSL, câbler des storage buffers, lancer `dispatchWorkgroups` par frame, et faire tourner une **simulation de particules festives TribuZen** (confettis) entièrement sur GPU — puis relire un agrégat côté CPU.
> **Vrai outil :** WebGPU dans **Chrome** (ou Edge) à jour — pas de harnais, pas de test-runner. Un `<canvas>` + un module TS/WGSL réels qui tournent dans le navigateur.
> **Feedback :** le coach valide en session (grille ci-dessous). Aucun auto-correcteur.

## Prérequis techniques

- Chrome/Edge récent avec WebGPU actif. Vérifie sur `about:gpu` ou avec `if (!navigator.gpu) { ... }`.
- Servir les fichiers via un serveur local (les modules ES ne se chargent pas en `file://`) : `npx serve` ou l'extension Live Server.

## Énoncé

TribuZen célèbre une sortie bouclée par une **explosion de confettis 3D**. Tu vas coder cette simulation : `N` particules (position + vélocité) mises à jour **chaque frame par un compute shader** (gravité, intégration d'Euler, rebond au sol), puis dessinées en points. Le buffer de particules est **partagé** entre le compute pass et le render pass (usage `STORAGE | VERTEX`) : rien ne repasse par le CPU.

Tu ajouteras ensuite un **readback** : compter les particules encore « vivantes » via un second compute shader (compteur atomique) et relire ce nombre en JavaScript.

### Starter

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Confettis TribuZen — compute WebGPU</title>
  <style>
    body { margin: 0; background: #05060a; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #hud { position: fixed; top: 8px; left: 8px; color: #cdd; font: 14px monospace; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hud">particules vivantes : —</div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`main.ts` (squelette à compléter — les `TODO` sont à ta charge) :

```typescript
const NUM_PARTICLES = 30_000;
const WORKGROUP_SIZE = 64;

async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  if (!navigator.gpu) throw new Error('WebGPU non supporté (Chrome/Edge à jour requis).');

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  // TODO 1 : créer le buffer de particules (STORAGE | VERTEX) et l'initialiser
  //          (positions au centre, vélocités aléatoires vers le haut, life 2–4s).
  // TODO 2 : uniform buffer SimParams { dt, gravity, num_particles }.
  // TODO 3 : compute pipeline (simulate) + render pipeline (point-list).
  // TODO 4 : boucle requestAnimationFrame : writeBuffer(params) → compute pass
  //          (dispatchWorkgroups) → render pass (draw) → submit.
  // TODO 5 : readback : compute "count_alive" (atomic) → staging → mapAsync → HUD.

  requestAnimationFrame(function frame() {
    // ...
    requestAnimationFrame(frame);
  });
}

main();
```

## Étapes (en friction)

1. **Écris `particles.wgsl`** : struct `Particle { pos: vec4f, vel: vec4f }` (`pos.w` = life), struct `SimParams { dt, gravity, num_particles }`, l'entrée `@compute @workgroup_size(64) fn simulate(...)`. N'oublie **pas** le garde-fou `if (i >= params.num_particles) { return; }`.
2. **Intègre** : `vel.y -= gravity*dt`, `pos += vel*dt`, rebond `if (pos.y < -1) { pos.y = -1; vel.y = abs(vel.y)*0.7; }`. Respawn quand `pos.w <= 0`.
3. **Initialise le buffer CPU** (`Float32Array`, 8 floats/particule), `writeBuffer` une fois. Usage `STORAGE | VERTEX`.
4. **Compute pass par frame** : calcule `Math.ceil(NUM_PARTICLES / WORKGROUP_SIZE)` et `dispatchWorkgroups(...)`. Vérifie que tu ne passes **pas** `NUM_PARTICLES` directement.
5. **Render pass** : shaders `vs_main`/`fs_main` lisant le **même** buffer (`var<storage, read>` côté render), topology `point-list`, `draw(NUM_PARTICLES)`.
6. **Readback (bonus obligatoire)** : second compute shader avec `atomic<u32>` incrémenté quand `pos.w > 0`, copie vers un staging `MAP_READ | COPY_DST`, `mapAsync`, affiche le compte dans `#hud`. Pense à **copier avant `unmap()`**.

## Corrigé complet commenté

`particles.wgsl` :

```wgsl
struct Particle {
  pos: vec4f,   // xyz = position, w = durée de vie restante (life)
  vel: vec4f,   // xyz = vélocité, w = inutilisé
}

struct SimParams {
  dt: f32,
  gravity: f32,
  num_particles: u32,
  _pad: f32,          // alignement à 16 bytes
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

// petit générateur pseudo-aléatoire déterministe (pour le respawn)
fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  return f32((x >> 22u) ^ x) / 4294967295.0;
}

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.num_particles) { return; }   // GARDE-FOU obligatoire

  var p = particles[i];

  p.vel.y = p.vel.y - params.gravity * params.dt;   // gravité
  p.pos = p.pos + p.vel * params.dt;                // intégration d'Euler explicite

  if (p.pos.y < -1.0) {                             // rebond au sol
    p.pos.y = -1.0;
    p.vel.y = abs(p.vel.y) * 0.7;                   // perte d'énergie
  }

  p.pos.w = p.pos.w - params.dt;                    // vieillissement
  if (p.pos.w <= 0.0) {                             // respawn (confetti relancé)
    p.pos = vec4f(0.0, 0.8, 0.0, 2.0 + hash(i) * 2.0);
    p.vel = vec4f((hash(i * 3u) - 0.5) * 2.0, hash(i * 7u) * 1.5 + 0.5,
                  (hash(i * 11u) - 0.5) * 2.0, 0.0);
  }

  particles[i] = p;                                 // réécriture in-place
}
```

`render.wgsl` :

```wgsl
struct Particle { pos: vec4f, vel: vec4f, }

struct RenderUniforms { aspect: f32, }

@group(0) @binding(0) var<uniform> u: RenderUniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) color: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VSOut {
  let p = particles[vid];
  var out: VSOut;
  // projection ultra-simple : on corrige juste le ratio du canvas
  out.clip = vec4f(p.pos.x / u.aspect, p.pos.y, 0.0, 1.0);
  // couleur festive selon la vitesse + fondu sur la vie restante
  let speed = length(p.vel.xyz);
  out.color = vec4f(clamp(speed, 0.2, 1.0), 0.5, clamp(p.pos.w * 0.4, 0.2, 1.0),
                    clamp(p.pos.w, 0.0, 1.0));
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4f {
  return in.color;
}
```

`main.ts` :

```typescript
import particlesWgsl from './particles.wgsl?raw';
import renderWgsl from './render.wgsl?raw';

const NUM_PARTICLES = 30_000;
const WORKGROUP_SIZE = 64;
const PARTICLE_FLOATS = 8;            // 2 * vec4f
const PARTICLE_BYTES = PARTICLE_FLOATS * 4;

async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  if (!navigator.gpu) throw new Error('WebGPU non supporté (Chrome/Edge à jour requis).');

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  // --- Buffer de particules : PARTAGÉ compute (STORAGE) + render (VERTEX/STORAGE) ---
  const particleBuffer = device.createBuffer({
    size: NUM_PARTICLES * PARTICLE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
  });
  // Initialisation CPU (une seule fois)
  const init = new Float32Array(NUM_PARTICLES * PARTICLE_FLOATS);
  for (let i = 0; i < NUM_PARTICLES; i++) {
    const b = i * PARTICLE_FLOATS;
    init[b + 0] = 0;                              // pos.x
    init[b + 1] = 0.8;                            // pos.y (part du haut)
    init[b + 2] = 0;                             // pos.z
    init[b + 3] = 2 + Math.random() * 2;         // life 2–4 s
    init[b + 4] = (Math.random() - 0.5) * 2;     // vel.x
    init[b + 5] = Math.random() * 1.5 + 0.5;     // vel.y (vers le haut)
    init[b + 6] = (Math.random() - 0.5) * 2;     // vel.z
    init[b + 7] = 0;                             // unused
  }
  device.queue.writeBuffer(particleBuffer, 0, init);

  // --- Uniform SimParams (dt, gravity, num_particles, pad) : 16 bytes ---
  const simParamsBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // --- Uniform render (aspect) ---
  const renderUniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(renderUniformBuffer, 0,
    new Float32Array([canvas.width / canvas.height, 0, 0, 0]));

  // --- Compute pipeline (simulation) ---
  const computeModule = device.createShaderModule({ code: particlesWgsl });
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

  // --- Render pipeline (points) ---
  const renderModule = device.createShaderModule({ code: renderWgsl });
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: renderModule, entryPoint: 'vs_main' },
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
  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: renderUniformBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
    ],
  });

  // Nombre de workgroups : ceil(N / workgroup_size) — JAMAIS N directement
  const workgroupCount = Math.ceil(NUM_PARTICLES / WORKGROUP_SIZE);

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // params de simulation (dt, gravity, num_particles en u32)
    const p = new ArrayBuffer(16);
    new Float32Array(p, 0, 2).set([dt, 2.0]);          // dt, gravity
    new Uint32Array(p, 8, 1).set([NUM_PARTICLES]);     // num_particles
    device.queue.writeBuffer(simParamsBuffer, 0, p);

    const encoder = device.createCommandEncoder();

    // 1) COMPUTE PASS : mise à jour des particules
    const cpass = encoder.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, computeBindGroup);
    cpass.dispatchWorkgroups(workgroupCount);          // workgroups, pas invocations
    cpass.end();

    // 2) RENDER PASS : dessin des particules (lit le MÊME buffer)
    const rpass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBindGroup);
    rpass.draw(NUM_PARTICLES);                          // 1 point par particule
    rpass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- Readback (bonus) : compter les particules vivantes toutes les ~500 ms ---
  const countAliveWgsl = /* wgsl */ `
    struct Particle { pos: vec4f, vel: vec4f, }
    @group(0) @binding(0) var<storage, read> particles: array<Particle>;
    @group(0) @binding(1) var<storage, read_write> counter: atomic<u32>;
    @compute @workgroup_size(64)
    fn count(@builtin(global_invocation_id) gid: vec3u) {
      let i = gid.x;
      if (i >= arrayLength(&particles)) { return; }
      if (particles[i].pos.w > 0.0) { atomicAdd(&counter, 1u); }
    }`;
  const countModule = device.createShaderModule({ code: countAliveWgsl });
  const countPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: countModule, entryPoint: 'count' },
  });
  const counterBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const staging = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const countBindGroup = device.createBindGroup({
    layout: countPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuffer } },
      { binding: 1, resource: { buffer: counterBuffer } },
    ],
  });

  async function updateHud(): Promise<void> {
    device.queue.writeBuffer(counterBuffer, 0, new Uint32Array([0])); // reset compteur
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(countPipeline);
    pass.setBindGroup(0, countBindGroup);
    pass.dispatchWorkgroups(workgroupCount);
    pass.end();
    enc.copyBufferToBuffer(counterBuffer, 0, staging, 0, 4);          // STORAGE → staging
    device.queue.submit([enc.finish()]);

    await staging.mapAsync(GPUMapMode.READ);
    const alive = new Uint32Array(staging.getMappedRange().slice(0))[0]; // COPIER avant unmap
    staging.unmap();
    hud.textContent = `particules vivantes : ${alive} / ${NUM_PARTICLES}`;
  }
  setInterval(updateHud, 500);
}

main();
```

**Points clés du corrigé :**
- Le buffer `particleBuffer` a l'usage `STORAGE | VERTEX` : le compute l'écrit, le render le lit **sans repasser par le CPU**.
- `dispatchWorkgroups(Math.ceil(N / 64))` — jamais `N` directement (piège #1 du module).
- Le garde-fou `if (i >= num_particles) return;` neutralise les invocations en surplus.
- Le readback suit strictement STORAGE → `copyBufferToBuffer` → staging `MAP_READ | COPY_DST` → `mapAsync` → **copie (`slice(0)`) avant `unmap()`**.
- Le compteur atomique (`atomic<u32>` + `atomicAdd`) évite les courses entre invocations.

## Variante J+30 (fading)

Reprends **sans regarder le corrigé**, en **25 min**, avec **une contrainte ajoutée** : ajouter une **force d'attraction vers la souris**. Écoute `pointermove`, passe la position souris (en clip space) dans `SimParams`, et dans le shader ajoute `vel += normalize(mouse - pos.xy) * force / (dist² + 0.1) * dt`. Objectif : que les confettis soient aspirés vers le curseur. Tu dois écrire le shader et le câblage uniform de mémoire ; seul le calcul du dispatch peut être re-vérifié.

## Application TribuZen

Porte ce système dans `smaurier/tribuzen` :

- `src/3d/compute/particlesCompute.wgsl` + `ParticleSystem.ts` : classe réutilisable (init, `update(dt)`, `render(pass)`), déclenchée quand une sortie passe au statut « bouclée ».
- `src/3d/compute/gpuReadback.ts` : la fonction `countAlive()` (staging + `mapAsync`) pour couper la simulation quand toutes les particules sont mortes.
- Brancher l'explosion sur l'événement métier « sortie validée » (badge/trophée), puis committer : `git commit -m "feat(3d): confettis GPGPU sur sortie bouclée (compute WebGPU)"`.
