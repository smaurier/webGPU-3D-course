# Lab 22 — Ray tracer de sphères en compute shader

> **Outcome :** à la fin, tu sais coder un **ray tracer de sphères** qui tourne dans un vrai navigateur — génération de rayons primaires, intersection rayon-sphère, éclairage diffus + ombre, et **accumulation temporelle progressive** pour lisser le bruit. Tu rends l'**objet-souvenir TribuZen** (galet ≈ sphère).
> **Vrai outil :** WebGPU dans **Chrome** (ou Edge) à jour — un `<canvas>` + un compute shader WGSL réels. Pas de harnais, pas de test-runner.
> **Feedback :** le coach valide en session avec la grille ci-dessous. Aucun auto-correcteur.

## Prérequis techniques

- Chrome/Edge récent avec WebGPU actif (vérifie `if (!navigator.gpu) { ... }` ou `chrome://gpu`).
- Servir les fichiers via un serveur local (les modules ES ne se chargent pas en `file://`) : `npx serve` ou l'extension Live Server.
- Acquis du module 11 (compute shaders, storage buffers, dispatch) et du module 22 (intersection rayon-sphère, path tracing, accumulation).

## Énoncé

Tu vas rendre une petite scène de **sphères** en ray tracing, dans un compute shader. Une invocation = un pixel. Pour chaque pixel :

1. générer un **rayon primaire** depuis la caméra ;
2. tester l'intersection contre **toutes les sphères**, garder la plus proche ;
3. calculer la couleur : **diffus** (N·L) + **ombre** (shadow ray vers la lumière), sinon la couleur du **ciel** ;
4. **accumuler** l'échantillon de ce frame dans un buffer et afficher la moyenne.

La scène contient l'**objet-souvenir TribuZen** : un galet (grande sphère mate), posé sur un « sol » (sphère géante), sous un ciel dégradé. Avec un léger **jitter** par frame, l'accumulation lisse les bords (anti-aliasing) et l'ombre.

> Objet-souvenir = **sphères analytiques** : aucune BVH nécessaire (voir module 22 §2.10). C'est exactement le cas où le ray tracing est simple et payant.

### Starter

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Objet-souvenir TribuZen — ray tracer WebGPU</title>
  <style>
    body { margin: 0; background: #05060a; }
    canvas { display: block; width: 100vw; height: 100vh; }
    #hud { position: fixed; top: 8px; left: 8px; color: #cdd; font: 14px monospace; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hud">échantillons accumulés : —</div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`main.ts` (squelette à compléter — les `TODO` sont à ta charge) :

```typescript
async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  if (!navigator.gpu) throw new Error('WebGPU non supporté (Chrome/Edge à jour requis).');

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  canvas.width = 800;
  canvas.height = 600;

  // TODO 1 : buffer de sphères (centre.xyz, rayon, albedo.xyz, _pad) → storage.
  // TODO 2 : buffer d'accumulation (vec4f par pixel : rgb = somme, a = count) → storage.
  // TODO 3 : uniform (frame_count, dimensions) pour le seed aléatoire et le jitter.
  // TODO 4 : compute pipeline (raytrace.wgsl) : 1 invocation/pixel, @workgroup_size(8,8).
  // TODO 5 : texture de sortie rgba8unorm (STORAGE_BINDING | TEXTURE_BINDING).
  // TODO 6 : render pipeline "fullscreen triangle" qui échantillonne la texture.
  // TODO 7 : boucle rAF : incrémenter frame_count → compute pass
  //          (dispatchWorkgroups(ceil(w/8), ceil(h/8))) → render pass → submit.

  requestAnimationFrame(function frame() {
    // ...
    requestAnimationFrame(frame);
  });
}

main();
```

## Étapes (en friction)

1. **Écris `raytrace.wgsl`** : structs `Ray`, `Sphere { center: vec3f, radius: f32, albedo: vec3f, _pad: f32 }`, un tableau `spheres`. Écris `intersect_sphere(ray, s) -> f32` avec la quadratique `a=1`, `b=2(D·L)`, `c=L·L-r²` (module 22 §2.3). N'oublie **pas** l'epsilon `0.001`.
2. **Génère le rayon primaire** : `generate_ray(px, py, dims)` — pixel → NDC, direction dans le repère caméra. Ajoute un **jitter** `random_float(&seed) - 0.5` sur `px`/`py` (anti-aliasing).
3. **Trouve le hit le plus proche** : boucle sur les sphères, garde le plus petit `t > 0`, mémorise centre/albedo. Normale = `normalize(P - center)`.
4. **Éclaire** : `diffuse = albedo * max(0, dot(N, L))` avec `L` vers la lumière. Lance un **shadow ray** depuis `P + N*0.001` vers la lumière : s'il touche une sphère avant, le point est à l'ombre (couleur ambiante seule).
5. **Ciel** : si aucun hit, renvoie un dégradé vertical `mix(blanc, bleu, 0.5*(dir.y+1))` (module 22, RTIOW).
6. **Accumule** : `sum = prev.xyz + sample; count = prev.w + 1`, écris `vec4f(sum, count)`, affiche `sum/count` (tonemap + gamma). Affiche `count` dans `#hud`.
7. **Reset caméra (bonus)** : sur `pointermove`/drag, bouge la caméra et **remets `count` à 0** (sinon image fantôme — module 22 piège #5).

## Corrigé complet commenté

`raytrace.wgsl` :

```wgsl
struct Ray { origin: vec3f, dir: vec3f, }

struct Sphere {
  center: vec3f,
  radius: f32,
  albedo: vec3f,
  _pad: f32,          // alignement 16 bytes (2 * vec4f)
}

struct Uniforms {
  frame_count: u32,
  width: u32,
  height: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(2) var<storage, read_write> accum: array<vec4f>;
@group(0) @binding(3) var out_tex: texture_storage_2d<rgba8unorm, write>;

const LIGHT_POS = vec3f(3.0, 5.0, 2.0);
const CAM_POS   = vec3f(0.0, 0.7, 3.0);

// PRNG déterministe par pixel+frame (pcg-like)
fn rand(seed: ptr<function, u32>) -> f32 {
  var x = *seed * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  *seed = x;
  return f32(x) / 4294967295.0;
}

// Intersection rayon-sphère : a=1 (dir normalisée), b=2(D·L), c=L·L-r²
fn intersect_sphere(ray: Ray, s: Sphere) -> f32 {
  let L = ray.origin - s.center;
  let b = 2.0 * dot(ray.dir, L);
  let c = dot(L, L) - s.radius * s.radius;
  let disc = b * b - 4.0 * c;
  if (disc < 0.0) { return -1.0; }        // le rayon manque la sphère
  let sq = sqrt(disc);
  var t = (-b - sq) / 2.0;                 // racine la plus proche
  if (t < 0.001) {                         // derrière / auto-collision → l'autre
    t = (-b + sq) / 2.0;
    if (t < 0.001) { return -1.0; }
  }
  return t;
}

struct Hit { t: f32, point: vec3f, normal: vec3f, albedo: vec3f, hit: bool, }

// Sphère la plus proche sur toute la scène
fn closest_hit(ray: Ray) -> Hit {
  var best: Hit;
  best.hit = false;
  best.t = 1e30;
  for (var i = 0u; i < arrayLength(&spheres); i++) {
    let s = spheres[i];
    let t = intersect_sphere(ray, s);
    if (t > 0.0 && t < best.t) {
      best.t = t;
      best.point = ray.origin + t * ray.dir;
      best.normal = normalize(best.point - s.center);
      best.albedo = s.albedo;
      best.hit = true;
    }
  }
  return best;
}

fn sky(dir: vec3f) -> vec3f {
  let a = 0.5 * (dir.y + 1.0);             // dégradé vertical (RTIOW)
  return mix(vec3f(1.0), vec3f(0.5, 0.7, 1.0), a);
}

// Rayon primaire pour le pixel (px, py), avec repère caméra simple
fn generate_ray(px: f32, py: f32) -> Ray {
  let aspect = f32(u.width) / f32(u.height);
  let tan_half_fov = 0.5;                   // ~53° de FOV vertical
  let ndc_x = (2.0 * px / f32(u.width) - 1.0) * aspect * tan_half_fov;
  let ndc_y = (1.0 - 2.0 * py / f32(u.height)) * tan_half_fov;
  // caméra qui regarde vers -Z, up = +Y
  let dir = normalize(vec3f(ndc_x, ndc_y, -1.0));
  return Ray(CAM_POS, dir);
}

fn shade(hit: Hit) -> vec3f {
  let to_light = normalize(LIGHT_POS - hit.point);
  let ambient = hit.albedo * 0.15;
  // shadow ray : origine décalée d'un epsilon (module 22 piège #2)
  let shadow_ray = Ray(hit.point + hit.normal * 0.001, to_light);
  let sh = closest_hit(shadow_ray);
  let light_dist = length(LIGHT_POS - hit.point);
  if (sh.hit && sh.t < light_dist) {
    return ambient;                          // à l'ombre : ambiant seul
  }
  let ndotl = max(dot(hit.normal, to_light), 0.0);
  return ambient + hit.albedo * ndotl;       // diffus de Lambert
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }   // garde-fou (module 11)
  let idx = gid.y * u.width + gid.x;

  // seed unique par pixel ET par frame
  var seed = (gid.x * 1973u + gid.y * 9277u + u.frame_count * 26699u) | 1u;

  // jitter sous-pixel → anti-aliasing par accumulation
  let jx = rand(&seed) - 0.5;
  let jy = rand(&seed) - 0.5;
  let ray = generate_ray(f32(gid.x) + jx, f32(gid.y) + jy);

  let hit = closest_hit(ray);
  var sample: vec3f;
  if (hit.hit) { sample = shade(hit); } else { sample = sky(ray.dir); }

  // accumulation temporelle progressive
  let prev = accum[idx];
  let sum = prev.xyz + sample;
  let count = prev.w + 1.0;
  accum[idx] = vec4f(sum, count);

  let avg = sum / count;
  let mapped = pow(avg, vec3f(1.0 / 2.2));                  // correction gamma
  textureStore(out_tex, gid.xy, vec4f(mapped, 1.0));
}
```

`main.ts` :

```typescript
import raytraceWgsl from './raytrace.wgsl?raw';

async function main(): Promise<void> {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const hud = document.getElementById('hud')!;
  if (!navigator.gpu) throw new Error('WebGPU non supporté (Chrome/Edge à jour requis).');

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  const W = 800, H = 600;
  canvas.width = W;
  canvas.height = H;

  // --- Scène : sphères (centre.xyz, radius, albedo.xyz, pad) = 8 floats ---
  // galet-souvenir + sol géant. TribuZen : le galet ≈ une sphère mate.
  const spheres = new Float32Array([
    // cx, cy, cz,  r,     ar,  ag,  ab,  pad
     0.0, 0.3, 0.0, 0.5,   0.75, 0.72, 0.68, 0,   // galet (gris chaud, mat)
     0.0, -100.5, 0.0, 100, 0.35, 0.55, 0.35, 0,  // sol (sphère géante verte)
  ]);
  const sphereBuffer = device.createBuffer({
    size: spheres.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(sphereBuffer, 0, spheres);

  // --- Accumulation : vec4f par pixel ---
  const accumBuffer = device.createBuffer({
    size: W * H * 4 * 4,
    usage: GPUBufferUsage.STORAGE,
  });

  // --- Uniforms : frame_count, width, height, pad (4 * u32 = 16 bytes) ---
  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // --- Texture de sortie ---
  const outTex = device.createTexture({
    size: [W, H],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });

  // --- Compute pipeline (ray tracer) ---
  const computeModule = device.createShaderModule({ code: raytraceWgsl });
  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: computeModule, entryPoint: 'main' },
  });
  const computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: sphereBuffer } },
      { binding: 2, resource: { buffer: accumBuffer } },
      { binding: 3, resource: outTex.createView() },
    ],
  });

  // --- Render pipeline : fullscreen triangle qui affiche la texture ---
  const blitCode = /* wgsl */ `
    @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
      let p = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
      return vec4f(p[i], 0, 1);
    }
    @group(0) @binding(0) var tex: texture_2d<f32>;
    @group(0) @binding(1) var samp: sampler;
    @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
      let uv = pos.xy / vec2f(${W}.0, ${H}.0);
      return textureSample(tex, samp, uv);
    }`;
  const blitModule = device.createShaderModule({ code: blitCode });
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: blitModule, entryPoint: 'vs' },
    fragment: { module: blitModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const renderBindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: outTex.createView() },
      { binding: 1, resource: sampler },
    ],
  });

  const gx = Math.ceil(W / 8), gy = Math.ceil(H / 8);   // workgroups, pas invocations

  let frameCount = 0;
  function frame(): void {
    frameCount++;
    device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([frameCount, W, H, 0]));

    const encoder = device.createCommandEncoder();

    // 1) COMPUTE : path/ray trace, 1 échantillon accumulé
    const cpass = encoder.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, computeBindGroup);
    cpass.dispatchWorkgroups(gx, gy);
    cpass.end();

    // 2) RENDER : afficher la texture accumulée
    const rpass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBindGroup);
    rpass.draw(3);
    rpass.end();

    device.queue.submit([encoder.finish()]);
    hud.textContent = `échantillons accumulés : ${frameCount}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
```

**Points clés du corrigé :**
- `intersect_sphere` applique exactement la quadratique du module 22 §2.3 (`a=1`, `b=2(D·L)`, `c=L·L-r²`), epsilon `0.001` contre l'auto-collision.
- Le **shadow ray** part de `hit.point + N*0.001` (piège #2 du module) : sans cet epsilon, chaque point s'ombre lui-même (*shadow acne*).
- L'**accumulation** stocke `(somme, count)` par pixel et affiche `somme/count` : avec le jitter sous-pixel, les bords et l'ombre se lissent frame après frame (anti-aliasing gratuit).
- `dispatchWorkgroups(ceil(W/8), ceil(H/8))` — des **workgroups**, jamais le nombre de pixels (piège #1 du module 11).
- Un buffer STORAGE ne s'affiche pas : le compute écrit `out_tex`, le **render pass** la blitte sur un triangle plein écran.

## Grille de validation (coach)

| # | Critère | OK ? |
|---|---------|:---:|
| 1 | L'intersection rayon-sphère utilise la quadratique correcte (`a=1`, `b=2(D·L)`, `c=L·L-r²`) avec epsilon | ☐ |
| 2 | Le galet est visible, correctement éclairé (diffus N·L), posé sur le sol | ☐ |
| 3 | Une **ombre** portée apparaît (shadow ray), sans *shadow acne* (epsilon présent) | ☐ |
| 4 | Le ciel est un dégradé (pas de fond noir) quand le rayon manque tout | ☐ |
| 5 | L'image se **lisse** au fil des frames (accumulation + jitter visible sur les bords) | ☐ |
| 6 | `dispatchWorkgroups` reçoit `ceil(W/8), ceil(H/8)`, pas W×H | ☐ |
| 7 | L'apprenant sait expliquer *pourquoi* l'image converge (Monte Carlo, 1/√N) | ☐ |

### Coach — relances (au moins 3, à dégainer si l'apprenant cale ou survole)

1. **« Ton ombre a des points noirs / du grain sur la surface éclairée. »** → Fais expliquer le *shadow acne* : le shadow ray part **du** point d'impact et re-touche sa propre sphère à `t≈0`. Où est l'epsilon ? (piège #2 du module).
2. **« Passe le jitter à zéro : que se passe-t-il ? »** → Les bords redeviennent crénelés et l'accumulation n'apporte plus rien (tous les échantillons identiques). Fais formuler que le jitter + accumulation = anti-aliasing par Monte Carlo.
3. **« Ton image ne s'améliore pas avec le temps. »** → Vérifier : `frame_count` incrémenté ? Le buffer d'accumulation est-il bien relu (`prev`) puis réécrit ? Affiche-t-on `sum/count` ou `sample` brut ?
4. **« Combien de frames pour diviser le bruit par deux ? »** → Doit répondre **4×** plus d'échantillons (erreur en `1/√N`). Si l'apprenant dit « 2× », reprendre le module 22 §2.7.
5. **« Pourquoi ne fais-tu pas rebondir les rayons ici (path tracing complet) ? »** → Vérifier la compréhension : ici, éclairage direct + ombre (proche Whitted) ; le path tracing complet ajoute des rebonds diffus aléatoires. Faire situer les deux (module 22 §2.6-2.7).

## Variante J+30 (fading)

Reprends **sans regarder le corrigé**, en **30 min**, avec **une contrainte ajoutée** : rendre le galet **réfléchissant** (miroir). À chaque hit sur le galet, lance **un rayon réfléchi** `R = D - 2(D·N)N` (module 22 §2.5) et mélange sa couleur (réflexion du ciel + du sol) avec la couleur diffuse selon un facteur `reflectivity` du matériau. Ajoute un champ au struct `Sphere`. Objectif : voir le ciel et le sol se refléter sur le galet mouillé. Tu dois écrire la boucle de rebond et la formule de réflexion **de mémoire** ; seul le câblage du buffer peut être re-vérifié.

## Application TribuZen

Porte ce ray tracer dans `smaurier/tribuzen` :

- `src/3d/raytracing/raytrace.wgsl` + `RayTracer.ts` : classe réutilisable (`init(scene)`, `accumulate()`, `reset()`), rendu progressif de la **fiche objet-souvenir**.
- `src/3d/raytracing/souvenirScene.ts` : décrire l'objet scanné en **sphères analytiques** (galet, verre de mer, trophée) + matériaux (albedo, réflectivité).
- Brancher `reset()` de l'accumulation sur tout mouvement caméra/orbit (module 22 piège #5), puis committer : `git commit -m "feat(3d): rendu ray tracing progressif de l'objet-souvenir (compute WebGPU)"`.
