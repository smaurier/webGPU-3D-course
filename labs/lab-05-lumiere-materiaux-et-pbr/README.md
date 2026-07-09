# Lab 05 — Lumière, matériaux et PBR

> **Outcome :** à la fin, tu sais éclairer une sphère dans un fragment shader WebGPU — d'abord en **Blinn-Phong**, puis en **PBR Cook-Torrance metallic-roughness** — et faire passer une sphère de « plastique mat » à « or crédible » en changeant 3 uniforms.
> **Vrai outil :** WebGPU dans **Chrome 113+** (un fichier `index.html` autonome, aucune dépendance npm). Le shading se fait dans un fragment shader WGSL réel, exécuté sur le GPU.
> **Feedback :** le coach valide **visuellement** en session — pas de test-runner auto-correcteur.

---

## Énoncé

Tu construis le rendu du **trophée de sortie** de TribuZen (module 05). Pour rester focalisé sur l'éclairage, la géométrie est trichée : on dessine un **quad plein écran** et on calcule la normale d'une **sphère analytique** dans le fragment shader (une « imposteur sphère »). Tout le travail est dans le WGSL.

Tu dois, dans l'ordre :

1. **Blinn-Phong** — éclairer la sphère comme un plastique : ambiant + diffus de Lambert + spéculaire half-vector.
2. **PBR Cook-Torrance** — remplacer le spéculaire par la BRDF D/F/G et brancher le workflow metallic-roughness.
3. **Vérifier le passage plastique → or** : `metallic = 0` (plastique, reflet blanc) puis `metallic = 1`, `albedo = or` (reflet doré, plus de diffus).

**Pas de gap-fill** — tu écris les fonctions WGSL toi-même à partir du starter ci-dessous.

### Prérequis machine

- Chrome (ou Edge) 113+. Vérifie que `navigator.gpu` existe (tape-le dans la console).
- Sers le fichier via un serveur local (le module ES et WebGPU n'aiment pas `file://`) :

```bash
# depuis le dossier du lab
npx serve .
# ou : python -m http.server 8000
```

Puis ouvre `http://localhost:3000` (ou `:8000`).

### Starter minimal

Crée `index.html` dans ce dossier. Le harnais WebGPU (device, pipeline, quad) est fourni **intégralement** — tu ne touches qu'au bloc WGSL marqué `// ⇩ À TOI`.

```html
<!doctype html>
<html lang="fr">
<head><meta charset="utf-8" /><title>Lab 05 — PBR</title>
<style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style></head>
<body>
<canvas id="c"></canvas>
<script type="module">
const canvas = document.getElementById('c');
const dpr = devicePixelRatio || 1;
canvas.width = canvas.clientWidth * dpr;
canvas.height = canvas.clientHeight * dpr;

if (!navigator.gpu) throw new Error('WebGPU indisponible — utilise Chrome 113+');
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice();
const ctx = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });

// --- Uniforms : resolution(2) + albedo(3) + metallic + roughness + pad ---
const uni = new Float32Array(8);
const uniBuf = device.createBuffer({
  size: uni.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// ⇩ RÉGLAGES matériau — change-les pour l'étape 3
const albedo   = [0.8, 0.1, 0.1];   // rouge
const metallic = 0.0;               // 0 = plastique, 1 = métal
const roughness = 0.35;

const shader = device.createShaderModule({ code: `
struct U { res: vec2f, albedo: vec3f, metallic: f32, roughness: f32 };
@group(0) @binding(0) var<uniform> u: U;

// Vertex : un triangle plein écran (pas de buffer)
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  return vec4f(p[i], 0, 1);
}

const PI: f32 = 3.14159265;
const LIGHT_DIR = vec3f(0.5, 0.7, 0.6);   // vers la lumière
const LIGHT_COL = vec3f(1.0, 1.0, 1.0);
const VIEW_DIR  = vec3f(0.0, 0.0, 1.0);    // caméra en +Z

// ─────────────────────────────────────────────────────────
// ⇩ À TOI — étape 1 (Blinn-Phong) puis étape 2 (PBR)
// ─────────────────────────────────────────────────────────

fn shade(N: vec3f) -> vec3f {
  // TODO étape 1 : ambiant + Lambert + spéculaire Blinn-Phong
  // TODO étape 2 : remplacer par pbrDirect(...)
  return N * 0.5 + 0.5;   // placeholder : affiche les normales en couleur
}

// ─────────────────────────────────────────────────────────

@fragment fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  // Reconstruit une sphère : coord écran [-1,1], normale = point sur la sphère
  let uv = (frag.xy / u.res) * 2.0 - 1.0;
  let p = vec2f(uv.x, -uv.y);
  let r2 = dot(p, p);
  if (r2 > 1.0) { return vec4f(0.05, 0.05, 0.07, 1.0); }  // fond
  let N = normalize(vec3f(p, sqrt(1.0 - r2)));

  var color = shade(N);
  color = color / (color + vec3f(1.0));            // tone map Reinhard (HDR→LDR)
  color = pow(color, vec3f(1.0 / 2.2));            // correction gamma sRGB
  return vec4f(color, 1.0);
}
` });

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module: shader, entryPoint: 'vs' },
  fragment: { module: shader, entryPoint: 'fs', targets: [{ format }] },
  primitive: { topology: 'triangle-list' },
});
const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniBuf } }],
});

function frame() {
  uni.set([canvas.width, canvas.height], 0);
  uni.set(albedo, 2);
  uni[5] = metallic; uni[6] = roughness;
  device.queue.writeBuffer(uniBuf, 0, uni);

  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(3);
  pass.end();
  device.queue.submit([enc.finish()]);
}
frame();
</script>
</body>
</html>
```

Ouvre la page : tu vois une sphère colorée par ses normales (le placeholder). Ton travail commence dans `fn shade`.

---

## Étapes (en friction)

1. **Blinn-Phong.** Dans `shade`, normalise les constantes `LIGHT_DIR` et `VIEW_DIR`, calcule `NdotL = max(dot(N, L), 0)`, le half-vector `H = normalize(L + V)`, `NdotH = max(dot(N, H), 0)`. Retourne `ambient + diffuse + specular` avec `ambient = 0.05 * u.albedo`, `diffuse = NdotL * LIGHT_COL * u.albedo`, `specular = pow(NdotH, 64.0) * LIGHT_COL`.
2. **Vérifie** : sphère rouge mate avec un point brillant blanc. Bouge `LIGHT_DIR` (recharge) → le highlight se déplace.
3. **PBR — écris les 3 fonctions BRDF** : `distributionGGX(NdotH, roughness)`, `fresnelSchlick(HdotV, F0)` (retourne un `vec3f`), `geometrySmith(NdotV, NdotL, roughness)` (avec `k = (r+1)²/8`).
4. **Écris `pbrDirect(N)`** : calcule H, les 4 produits scalaires (clamp `NdotV` à `0.001`), `F0 = mix(vec3f(0.04), u.albedo, u.metallic)`, assemble `specular = D*G*F / (4*NdotV*NdotL)`, `kD = (1 - F) * (1 - u.metallic)`, `diffuse = kD * u.albedo / PI`, retourne `(diffuse + specular) * LIGHT_COL * NdotL`.
5. **Branche** `pbrDirect` dans `shade` (remplace le Blinn-Phong).
6. **Passage à l'or** : dans le JS, mets `albedo = [1.0, 0.76, 0.33]`, `metallic = 1.0`, `roughness = 0.3`. Recharge → reflet **doré**, plus de diffus rouge.
7. **Cas limites** : `roughness = 0.05` (reflet punaisé) vs `roughness = 0.9` (reflet étalé). `metallic = 0.5` (transition irréaliste mais instructive).

---

## Corrigé complet commenté

Remplace **uniquement** le bloc `// ⇩ À TOI` (entre les deux lignes de tirets) par ce qui suit :

```wgsl
// ── Blinn-Phong (étape 1) ────────────────────────────────
fn blinnPhong(N: vec3f) -> vec3f {
  let L = normalize(LIGHT_DIR);
  let V = normalize(VIEW_DIR);
  let ambient = 0.05 * u.albedo;                 // plancher indirect grossier
  let NdotL = max(dot(N, L), 0.0);
  let diffuse = NdotL * LIGHT_COL * u.albedo;     // Lambert
  let H = normalize(L + V);                        // half-vector
  let NdotH = max(dot(N, H), 0.0);
  let specular = pow(NdotH, 64.0) * LIGHT_COL;     // reflet blanc (diélectrique)
  return ambient + diffuse + specular;
}

// ── PBR Cook-Torrance (étape 2) ──────────────────────────
fn distributionGGX(NdotH: f32, roughness: f32) -> f32 {
  let a  = roughness * roughness;   // α = roughness² (remapping perceptuel)
  let a2 = a * a;
  let d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn fresnelSchlick(HdotV: f32, F0: vec3f) -> vec3f {
  // Fresnel par canal RGB → c'est ce qui teinte le reflet du métal
  return F0 + (vec3f(1.0) - F0) * pow(1.0 - HdotV, 5.0);
}

fn geometrySchlickGGX(NdotX: f32, k: f32) -> f32 {
  return NdotX / (NdotX * (1.0 - k) + k);
}

fn geometrySmith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;  // k pour lumière directe
  return geometrySchlickGGX(NdotV, k) * geometrySchlickGGX(NdotL, k);
}

fn pbrDirect(N: vec3f) -> vec3f {
  let L = normalize(LIGHT_DIR);
  let V = normalize(VIEW_DIR);
  let H = normalize(L + V);

  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 0.001);   // clamp : évite /0 au rasant (NaN)
  let NdotH = max(dot(N, H), 0.0);
  let HdotV = max(dot(H, V), 0.0);

  if (NdotL <= 0.0) { return vec3f(0.0); }  // surface de dos

  // F0 : 0.04 diélectrique → couleur du métal si metallic = 1
  let F0 = mix(vec3f(0.04), u.albedo, u.metallic);

  let D = distributionGGX(NdotH, u.roughness);
  let F = fresnelSchlick(HdotV, F0);
  let G = geometrySmith(NdotV, NdotL, u.roughness);

  let specular = (D * G) * F / (4.0 * NdotV * NdotL);

  // Diffus annulé sur métal via (1 - metallic)
  let kD = (vec3f(1.0) - F) * (1.0 - u.metallic);
  let diffuse = kD * u.albedo / PI;

  // Petit ambiant pour ne pas avoir un fond de sphère tout noir
  let ambient = 0.03 * u.albedo * (1.0 - u.metallic);

  return ambient + (diffuse + specular) * LIGHT_COL * NdotL;
}

fn shade(N: vec3f) -> vec3f {
  // return blinnPhong(N);   // ← décommente pour comparer l'étape 1
  return pbrDirect(N);
}
```

**Pourquoi ce corrigé est correct :**

- Le **remapping `α = roughness²`** est fait à l'intérieur de `distributionGGX` : on passe le `roughness` artistique, pas `α`. Formule GGX confirmée via learnopengl.com/PBR/Theory et google.github.io/filament.
- Le **Fresnel est un `vec3f`** : calculé par canal, c'est lui qui rend le reflet de l'or **doré** (car `F0 = albedo` quand `metallic = 1`) au lieu de blanc.
- `kD = (1 - F) * (1 - metallic)` **annule le diffus** sur un métal pur : c'est pourquoi passer `metallic` de 0 à 1 fait disparaître le diffus rouge et ne laisse que le reflet coloré.
- Le **clamp `NdotV` à 0.001** protège le dénominateur `4*NdotV*NdotL` des NaN sur la silhouette de la sphère.
- Le tone mapping Reinhard + gamma (déjà dans le harnais) compresse les valeurs HDR (le spéculaire dépasse 1.0) vers l'écran — sinon le highlight serait un disque blanc « cramé ».

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, en 30 minutes, sans rouvrir ce corrigé ni le module 05 :**

1. Réécris `distributionGGX`, `fresnelSchlick`, `geometrySmith` et `pbrDirect` **de mémoire**.
2. Ajoute une **deuxième lumière** (une `vec3f LIGHT_DIR_2` d'une autre couleur, ex. bleutée) : la couleur finale est la **somme** des deux contributions `pbrDirect` (l'ambiant ne se compte qu'une fois). C'est le pattern réel : on boucle `Lo += pbrLight(...)` sur chaque source.
3. Fais **tourner la lumière** dans le temps : passe un uniform `time` (via `performance.now()`) et une `requestAnimationFrame(frame)`, calcule `LIGHT_DIR = vec3f(cos(t), 0.5, sin(t))`.

**Critère de réussite :** le trophée en or tourne sous deux lumières colorées, le reflet doré suit les lumières, et il n'y a **aucun pixel blanc cramé** ni artefact sur la silhouette.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce shader devient le matériau des trophées de sortie :

```
tribuzen/
  src/
    3d/
      shaders/
        pbr.wgsl            ← les fonctions D/F/G + pbrDirect de ce lab
      materials/
        trophyMaterials.ts  ← presets { albedo, metallic, roughness } or/bronze/plastique
      TrophyBadge.vue       ← canvas WebGPU (le harnais index.html de ce lab, en composant)
```

**Différences par rapport au lab :**

- La sphère analytique devient une **vraie géométrie** (coupe/trophée en glTF) avec des normales issues du vertex buffer — il faudra `normalize` la normale interpolée (piège #1 du module).
- Les uniforms `albedo/metallic/roughness` viendront d'un **preset** choisi selon le type de sortie (rando = or, premier pas = bronze), pas codés en dur.
- L'éclairage direct de ce lab sera enrichi d'**IBL** (environment map) dans les modules Three.js avancés pour un rendu studio complet.

**Commit cible :**

```
feat(3d): matériau PBR trophée — BRDF Cook-Torrance metallic-roughness en WGSL
```
