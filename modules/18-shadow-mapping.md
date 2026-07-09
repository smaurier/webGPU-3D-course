---
titre: Shadow mapping
cours: 20-webgpu-3d
notions:
  - "shadow mapping en 2 passes (depth pass depuis la lumière + comparaison de profondeur)"
  - "matrice light-space (light view-projection)"
  - "shadow map = texture de profondeur"
  - "test de profondeur : fragment.z vs shadowMap[x,y]"
  - "shadow acne (moiré) et depth bias (constant + slope-scaled + normal bias)"
  - "peter panning (bias trop élevé) et front-face culling"
  - "PCF (Percentage-Closer Filtering) pour ombres douces"
  - "Cascaded Shadow Maps (CSM) pour grandes scènes"
  - "ombres Three.js (castShadow/receiveShadow) vs implémentation WebGPU manuelle"
outcomes:
  - sait expliquer le pipeline shadow mapping en 2 passes (depth pass depuis la lumière, puis comparaison)
  - sait construire la matrice light-space (ortho pour directional, perspective pour spot)
  - sait diagnostiquer et corriger le shadow acne avec un bias adaptatif et le front-face culling
  - sait reconnaître le peter panning et l'équilibrer contre le shadow acne
  - sait appliquer un PCF pour adoucir les bords d'ombre
  - sait expliquer le rôle des Cascaded Shadow Maps pour une grande scène directionnelle
  - sait activer et régler les ombres dans Three.js (renderer, lumière, castShadow/receiveShadow)
prerequis:
  - "03-cameras-et-projections (view/projection, ortho vs perspective, frustum, NDC)"
  - "04-pipeline-de-rendu (depth buffer, depth test)"
  - "10-render-pipeline-et-bind-groups (render pass WebGPU, depth attachment, uniforms)"
  - "13-threejs-fondamentaux (Scene / Camera / WebGLRenderer, boucle)"
  - "14-materiaux-et-lumieres-threejs (DirectionalLight, MeshStandardMaterial, ombres Three.js)"
next: 19-shaders-creatifs
libs: ["three"]
tribuzen: "moteur 3D TribuZen — ombres portées réalistes sur le globe/la scène 3D des sorties de la famille (le marqueur d'une sortie projette une ombre sur le sol, ancrant visuellement l'objet)"
last-reviewed: 2026-07
---

# Shadow mapping

> **Outcomes — tu sauras FAIRE :** expliquer le pipeline shadow mapping en 2 passes, construire la matrice light-space, corriger le shadow acne (bias adaptatif + front-face culling), reconnaître le peter panning, appliquer un PCF, et régler les ombres dans Three.js.
> **Difficulté :** :star::star::star::star::star:

> **Portée :** ce module attaque **les ombres portées** — la technique n°1 pour ancrer un objet dans une scène 3D. On voit le principe (2 passes), l'implémentation WebGPU manuelle (pour comprendre), les artefacts (acne, peter panning) et leurs correctifs (bias, PCF, front-face culling), les **Cascaded Shadow Maps** en survol (grandes scènes), puis **les ombres Three.js** qui automatisent tout ça. Version de référence : **Three.js r185** (2026). Les techniques avancées (VSM, PCSS, point/spot shadows) sont mentionnées mais approfondies plus tard.

## 1. Cas concret d'abord

Au module 14, tu as posé un `MeshStandardMaterial`, une `DirectionalLight` et un `AmbientLight` sur le globe des sorties de TribuZen. La scène est éclairée, les faces exposées au soleil sont claires, celles à l'ombre sont sombres. Mais il manque quelque chose : un marqueur de sortie posé sur le sol **ne projette aucune ombre**. Résultat, il paraît **flotter** — l'œil ne sait pas s'il touche le sol ou lévite à 10 cm.

```typescript
// Scène TribuZen — module 14 : éclairée, mais AUCUNE ombre portée
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 10, 5);
scene.add(sun);

const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 24, 24),
  new THREE.MeshStandardMaterial({ color: 0xff5533 }),
);
marker.position.set(0, 0.3, 0);
scene.add(marker); // ← posé sur le sol… mais il a l'air de flotter
```

Le problème : l'éclairage diffus (module 14) sait qu'une face est **orientée** loin de la lumière (elle s'assombrit), mais il **ignore totalement** qu'un autre objet peut **bloquer** la lumière. Une ombre portée, c'est exactement ça : *un point de la scène est-il caché de la lumière par un autre objet ?*

Répondre à cette question pour chaque pixel est le rôle du **shadow mapping**. L'idée-clé, contre-intuitive : pour savoir ce qui est dans l'ombre depuis la caméra, on **rend d'abord la scène depuis la lumière**. Ce module montre le mécanisme complet — d'abord à la main en WebGPU (pour comprendre), puis en trois lignes dans Three.js.

---

## 2. Théorie complète, concise

### 2.1 L'idée : rendre depuis la lumière

Analogie : mets-toi **à la place de la lampe** et regarde la scène. Tout ce que tu vois est éclairé ; tout ce qui est caché derrière un objet plus proche est dans l'ombre. Le shadow mapping formalise ça en **deux passes de rendu** :

```
Passe 1 — Shadow pass (point de vue de la LUMIÈRE)
  On rend la scène depuis la lumière, on ne garde QUE la profondeur
  de chaque fragment → texture de profondeur = « shadow map ».
  shadowMap[x,y] = distance lumière → premier objet dans cette direction.

Passe 2 — Render pass (point de vue de la CAMÉRA)
  Pour chaque fragment visible :
    1. projeter sa position monde dans l'espace de la lumière
    2. lire dans la shadow map la profondeur du plus proche occludeur
    3. comparer :
         profondeur du fragment  >  shadowMap[x,y]  → un objet est DEVANT
                                                       → fragment DANS L'OMBRE
         profondeur du fragment <= shadowMap[x,y]  → rien devant → ÉCLAIRÉ
```

C'est tout le principe. Le reste du module est constitué des **détails qui font que ça marche** (matrice light-space, bias, filtrage).

### 2.2 La matrice light-space

Pour projeter un point monde « comme si » la lumière était une caméra, on construit une **light view-projection matrix**, exactement comme la view-projection d'une caméra (module 03) :

```typescript
import { mat4, vec3 } from 'gl-matrix';

// lightSpaceMatrix = lightProjection * lightView
function createLightSpaceMatrix(
  lightPos: vec3, target: vec3,
  orthoSize: number, near: number, far: number,
): mat4 {
  const view = mat4.create();
  mat4.lookAt(view, lightPos, target, [0, 1, 0]);        // la lumière « regarde » la scène

  const proj = mat4.create();
  // Directional light → projection ORTHOGRAPHIQUE (rayons parallèles)
  mat4.ortho(proj, -orthoSize, orthoSize, -orthoSize, orthoSize, near, far);

  const lightSpace = mat4.create();
  mat4.multiply(lightSpace, proj, view);
  return lightSpace;
}
```

Le **type de projection dépend du type de lumière** :

- **Directional light** (soleil) → **orthographique** : les rayons sont parallèles, il n'y a pas de point de convergence.
- **Spot light** → **perspective** avec le demi-angle du cône comme fov.
- **Point light** → **6 perspectives** (fov 90°), une par face d'un cube (cubemap shadow) : approfondi plus tard.

### 2.3 La shadow map : une texture de profondeur

La shadow map n'est **pas** une image couleur : c'est une **depth texture**. Chaque texel stocke la distance normalisée (0→1) entre la lumière et le premier objet. En WebGPU, on la crée comme render target de profondeur, lisible ensuite par un **sampler de comparaison** :

```typescript
const SHADOW_SIZE = 2048; // plus grand = ombres plus nettes, plus de mémoire

const shadowMap = device.createTexture({
  size: { width: SHADOW_SIZE, height: SHADOW_SIZE },
  format: 'depth32float',
  usage: GPUTextureUsage.RENDER_ATTACHMENT   // on écrit dedans (shadow pass)
       | GPUTextureUsage.TEXTURE_BINDING,     // on lit dedans (render pass)
});

// Sampler de COMPARAISON : compare le sample à une profondeur de référence,
// renvoie 1.0 si le fragment passe le test (éclairé), 0.0 sinon.
const shadowSampler = device.createSampler({
  compare: 'less',      // sampleStocké < référence  → 1.0
  magFilter: 'linear',  // active le PCF hardware 2x2 gratuit
  minFilter: 'linear',
});
```

> **Convention à fixer une bonne fois :** avec un `sampler_comparison` WebGPU + `compare: 'less'`, `textureSampleCompare(...)` renvoie **1.0 = éclairé** et **0.0 = ombre**. (LearnOpenGL, en GLSL manuel, calcule l'inverse — `1.0 = ombre` — et multiplie autrement. Ce sont deux conventions du même test ; ce module suit celle de WebGPU pour rester cohérent avec le code.)

### 2.4 Le test de profondeur dans le fragment shader

En passe 2, pour chaque fragment on projette sa position monde dans l'espace lumière, on repasse en coordonnées de texture, et on compare :

```wgsl
fn calculateShadow(worldPos: vec3f, normal: vec3f) -> f32 {
  // 1. Projeter dans l'espace de la lumière
  let lightClip = light.lightSpaceMatrix * vec4f(worldPos, 1.0);

  // 2. Perspective divide → NDC [-1, 1]  (inutile en ortho car w=1, mais robuste)
  let ndc = lightClip.xyz / lightClip.w;

  // 3. NDC → coords de texture [0,1]. L'axe Y est INVERSÉ (texture top-left).
  let uv = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);

  // 4. Hors de la shadow map (ou derrière far) → considéré éclairé
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || ndc.z > 1.0) {
    return 1.0;
  }

  // 5. Bias adaptatif (cf. 2.5)
  let bias = max(0.005 * (1.0 - dot(normal, -light.direction)), 0.001);
  let refDepth = ndc.z - bias;

  // 6. Comparaison hardware : 1.0 = éclairé, 0.0 = ombre
  return textureSampleCompare(shadowMap, shadowSampler, uv, refDepth);
}
```

Le résultat (`0.0`→`1.0`) module ensuite l'éclairage diffus : `finalColor = albedo * (ambient + diffuse * shadow)`. Un fragment dans l'ombre ne garde que l'ambient.

### 2.5 Shadow acne et le bias

**Shadow acne** : des bandes noires en moiré sur les surfaces **éclairées**. Cause : la shadow map est **discrétisée** (2048×2048). Un texel couvre une petite zone de surface ; sur une surface inclinée, certains fragments de cette zone ont une profondeur **légèrement supérieure** à la valeur stockée → ils se croient (à tort) derrière un occludeur → ombre parasite.

```
Surface inclinée vue par les texels de la shadow map :
   texel 0    texel 1    texel 2
  ┌────────┬────────┬────────┐
  │  ✓     │  ✗     │  ✓     │   ✗ = fragment juste au-dessus de la
  └────────┴────────┴────────┘       marche discrétisée → faux positif d'ombre
```

**Correctif : le depth bias** — on soustrait une petite marge à la profondeur de référence avant la comparaison. Trois formes, cumulables :

```wgsl
// (a) bias CONSTANT — simple, mais mauvais compromis sur surfaces obliques
let bias = 0.005;

// (b) bias SLOPE-SCALED (adaptatif) — plus de bias quand la surface est
//     rasante par rapport à la lumière (dot(normal, -lightDir) → 0)
let bias = max(0.05 * (1.0 - dot(normal, -light.direction)), 0.005);

// (c) NORMAL bias — on décale la POSITION échantillonnée le long de la normale,
//     plutôt que la profondeur. Souvent le plus efficace, combiné à (a).
let biasedPos = worldPos + normal * NORMAL_BIAS; // puis projeter biasedPos
```

La formule (b) est celle de LearnOpenGL : `max(0.05 * (1 - dot(N, L)), 0.005)`. Les valeurs exactes se règlent **à l'œil, par scène** — il n'y a pas de constante universelle.

### 2.6 Peter panning et front-face culling

Trop de bias produit l'artefact inverse : le **peter panning**. L'ombre se **détache** du pied de l'objet, qui semble léviter (comme Peter Pan). C'est le même symptôme visuel que le bug du cas concret (§1), mais causé cette fois par un **excès** de bias.

```
Bias trop faible (acne) │ Équilibré         │ Bias trop fort (peter panning)
  ▓ moiré sur le sol     │  ombre nette       │  ombre décollée du pied de l'objet
```

Il faut **équilibrer** : assez de bias pour tuer l'acne, pas trop pour éviter le peter panning. Une technique complémentaire évite ce compromis : le **front-face culling pendant la shadow pass**. On rend la profondeur des **faces arrière** (au lieu des faces avant) : l'acne, qui apparaît sur les faces éclairées (avant), disparaît sans avoir besoin de gros bias.

```typescript
// Shadow pass : cull FRONT (on garde la profondeur des back-faces)
shadowPipeline: { primitive: { cullMode: 'front' } }

// Render pass normal : cull BACK (défaut)
renderPipeline: { primitive: { cullMode: 'back' } }
```

> **Limite :** le front-face culling suppose une géométrie **fermée** (solide, épaisse). Sur un plan mince (une feuille, un mur d'un texel), il n'y a pas de back-face utile → garder le bias. C'est pourquoi Three.js expose **à la fois** `shadow.bias` et `shadow.normalBias`.

### 2.7 PCF — adoucir les bords (soft shadows)

Un seul échantillon donne des ombres **dures** avec des bords crénelés (aliasing). Le **PCF (Percentage-Closer Filtering)** échantillonne **plusieurs texels autour** du point et **moyenne les résultats du test** (pas les profondeurs !) :

```wgsl
fn calculateShadowPCF(worldPos: vec3f, normal: vec3f) -> f32 {
  let lightClip = light.lightSpaceMatrix * vec4f(worldPos, 1.0);
  let ndc = lightClip.xyz / lightClip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, ndc.y * -0.5 + 0.5);
  let bias = max(0.005 * (1.0 - dot(normal, -light.direction)), 0.001);
  let refDepth = ndc.z - bias;

  let texel = 1.0 / f32(textureDimensions(shadowMap).x);
  var sum = 0.0;
  // Noyau 3x3 : 9 échantillons autour du point
  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      let offset = vec2f(f32(x), f32(y)) * texel;
      sum += textureSampleCompare(shadowMap, shadowSampler, uv + offset, refDepth);
    }
  }
  return sum / 9.0; // moyenne → bord d'ombre en dégradé
}
```

Un bord d'ombre passe alors de « 0 ou 1 » à un dégradé (`4/9`, `7/9`…). Plus le noyau est grand (5×5, 7×7), plus le bord est doux — mais plus c'est coûteux. Three.js expose ça via `shadow.radius` (type `PCFSoftShadowMap`).

### 2.8 Cascaded Shadow Maps (CSM) — survol

Une **seule** shadow map couvrant une grande scène extérieure gaspille sa résolution : les objets lointains n'ont pas besoin du même détail que ceux près de la caméra. Les **Cascaded Shadow Maps** découpent le frustum de la caméra en **plusieurs tranches** (cascades), chacune avec sa propre shadow map ajustée à sa tranche :

```
Frustum caméra découpé :  [ cascade 0 ][ cascade 1 ][   cascade 2   ]
                            proche       moyen          lointain
  → shadow map dédiée par tranche : haute densité de texels près de la caméra
```

Le shader choisit la cascade selon la profondeur du fragment (view-space z). C'est **la** technique standard pour un soleil sur un monde ouvert. Three.js la fournit en addon (`three/addons/csm/CSM.js`) — voir §5. Piège associé : le **shadow swimming** (les ombres « nagent » quand la caméra bouge) se corrige en **snappant** les cascades sur la grille de texels.

### 2.9 Ombres Three.js : trois interrupteurs

Three.js implémente tout ce qui précède (light-space, bias, PCF, cube pour point lights) en interne. Trois niveaux à activer :

```typescript
// 1. Le RENDERER : activer + choisir le filtrage
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
//   BasicShadowMap    → dur, rapide (pas de PCF)
//   PCFShadowMap      → PCF (défaut)
//   PCFSoftShadowMap  → PCF adouci (recommandé)
//   VSMShadowMap      → Variance Shadow Map (flou gaussien possible)

// 2. La LUMIÈRE : caster + régler son frustum d'ombre
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);          // résolution de la shadow map
sun.shadow.camera.near = 0.5;                // la « shadow camera » (ortho pour DirectionalLight)
sun.shadow.camera.far = 50;
sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;   sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0002;                   // ↓ acne (souvent NÉGATIF dans Three.js)
sun.shadow.normalBias = 0.02;                // ↓ acne sur surfaces obliques
sun.shadow.radius = 4;                        // rayon PCF (PCFSoftShadowMap)

// 3. Les OBJETS : qui projette / qui reçoit
marker.castShadow = true;    // projette une ombre
floor.receiveShadow = true;  // reçoit les ombres
```

> **Point non négociable :** dans Three.js, un objet ne projette **et** ne reçoit d'ombre **que si** `castShadow`/`receiveShadow` sont mis explicitement — ils sont à `false` par défaut. C'est la cause n°1 d'« ombres qui n'apparaissent pas » (piège #1).

---

## 3. Worked examples

### Exemple 1 — Le marqueur TribuZen projette enfin son ombre (Three.js)

On corrige le cas concret : le marqueur flottant du §1 pose désormais une vraie ombre sur le sol. Scène complète, prête à tourner.

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// (1) RENDERER : ombres activées + PCF doux
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
camera.position.set(4, 4, 6);

// (2) LUMIÈRE directionnelle qui CASTE des ombres
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(5, 10, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;   sun.shadow.camera.bottom = -10;
sun.shadow.bias = -0.0002;    // ↓ acne
sun.shadow.normalBias = 0.03; // ↓ acne oblique (évite un gros bias → peter panning)
sun.shadow.radius = 4;        // bords doux (PCFSoftShadowMap)
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.4)); // sinon l'ombre serait noir absolu

// (3a) Le SOL reçoit l'ombre
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x333344 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true; // ← sinon aucune ombre visible dessus
scene.add(floor);

// (3b) Le MARQUEUR de sortie projette l'ombre
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.5, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5 }),
);
marker.position.set(0, 0.5, 0);
marker.castShadow = true;    // ← projette
marker.receiveShadow = true; // (utile si plusieurs marqueurs s'ombrent entre eux)
scene.add(marker);

// Debug : visualiser le frustum de la shadow camera
scene.add(new THREE.CameraHelper(sun.shadow.camera));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
```

**Ce qui change vs le module 14 :** trois blocs (`renderer.shadowMap`, `sun.castShadow` + frustum, `castShadow`/`receiveShadow` par objet). Le marqueur est maintenant **ancré** : il pose une ombre nette sous lui. Si tu vois du moiré, augmente `normalBias`. Si l'ombre est décollée du pied de la sphère, réduis `bias`/`normalBias`.

### Exemple 2 — Régler le compromis acne ⇄ peter panning

Reprends l'Exemple 1 et fais varier un seul paramètre pour **observer les deux artefacts** aux extrêmes — c'est le geste de diagnostic à maîtriser.

```typescript
// A) Bias nul → SHADOW ACNE garanti : bandes de moiré sur le sol et la sphère
sun.shadow.bias = 0;
sun.shadow.normalBias = 0;

// B) Bias énorme → PETER PANNING : l'ombre se détache du bas de la sphère,
//    elle semble léviter (le contact ombre/objet est perdu)
sun.shadow.bias = -0.01;
sun.shadow.normalBias = 0.2;

// C) Équilibre (point de départ raisonnable, à affiner à l'œil) :
sun.shadow.bias = -0.0002;   // petit bias constant
sun.shadow.normalBias = 0.03; // le gros du travail via le normal bias
```

**Méthode de réglage** (dans cet ordre) :
1. `bias = 0`, `normalBias = 0` → confirmer que l'acne apparaît (sinon la scène n'a pas d'ombres réglables).
2. Monter `normalBias` progressivement jusqu'à faire disparaître le moiré.
3. Si l'ombre se décolle (peter panning) → redescendre. Si le moiré résiste sur des surfaces rasantes → petit `bias` négatif en complément.
4. Augmenter `shadow.mapSize` (2048 → 4096) si les bords restent trop crénelés malgré le PCF.

En WebGPU manuel, ces `bias`/`normalBias` sont exactement les termes de la formule §2.5 — Three.js ne fait que les exposer.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Ombres invisibles : `castShadow`/`receiveShadow` oubliés

Dans Three.js, activer `renderer.shadowMap.enabled` **ne suffit pas**. Chaque objet a `castShadow = false` et `receiveShadow = false` par défaut. Sans les mettre : le caster ne projette rien, ou le sol ne montre rien. Règle : **l'objet qui projette** → `castShadow = true` ; **la surface qui reçoit** → `receiveShadow = true`. Les deux pour un objet à la fois ombré et ombrant.

### PIÈGE #2 — Confondre shadow acne et peter panning

Ce sont **deux réglages de bias opposés** :
- **Acne** = bandes de moiré sur les surfaces **éclairées** → **manque** de bias.
- **Peter panning** = ombre **détachée** du pied de l'objet → **excès** de bias.
Régler le bias, c'est trouver la fenêtre entre les deux. Diagnostic rapide : moiré → monter le bias ; ombre décollée → le baisser.

### PIÈGE #3 — Moyenner les profondeurs au lieu des tests (faux PCF)

Le PCF moyenne le **résultat du test de comparaison** (0/1) de chaque échantillon, **pas** les valeurs de profondeur. Moyenner les profondeurs *puis* comparer une seule fois ne produit **pas** de bord doux (et introduit des artefacts sur les silhouettes). D'où le `sampler_comparison` WebGPU : la comparaison se fait **avant** le filtrage linéaire, par le hardware.

### PIÈGE #4 — Shadow camera trop large → ombres pixelisées

Le frustum de la shadow camera (`left/right/top/bottom/near/far` en ortho) est étalé sur `mapSize` texels. Un frustum énorme pour une petite scène = peu de texels par mètre = ombres baveuses. Régler le frustum **au plus juste** autour de la zone visible (le `CameraHelper` aide à le voir). Pour une **grande** scène, c'est précisément le problème que résolvent les **CSM** (§2.8).

### PIÈGE #5 — `near`/`far` de la shadow camera mal réglés

Comme toute caméra (module 03), la shadow camera clippe hors `[near, far]`. Un `far` trop court **coupe** l'ombre des objets éloignés de la lumière ; un intervalle `[near, far]` trop large **détruit la précision** de la depth texture (aggrave l'acne). Régler `near`/`far` serré autour de la profondeur réelle de la scène vue par la lumière.

### PIÈGE #6 — Croire que l'éclairage diffus « fait » déjà les ombres

L'assombrissement d'une face orientée loin de la lumière (`dot(N, L)`, module 14) est de l'**ombrage** (self-shading), pas une **ombre portée**. Il ignore les occludeurs. Une scène peut être parfaitement éclairée et n'avoir **aucune** ombre portée. Le shadow mapping est une passe **en plus**, dédiée à la question « suis-je caché de la lumière ? ».

### PIÈGE #7 — Front-face culling sur une géométrie mince

Le trick « cull front en shadow pass » (§2.6) suppose des solides fermés avec des back-faces. Sur un plan/quad d'un seul côté (mur mince, feuille), il n'y a pas de back-face → la profondeur est vide → ombres absentes ou fausses. Pour ces objets : garder `cullMode: 'back'` en shadow pass et compter sur le bias.

---

## 5. Ancrage TribuZen

Le shadow mapping donne du **poids visuel** à la scène 3D des sorties. Sans ombre portée, chaque marqueur flotte ; avec, il est **posé**, l'œil lit instantanément les distances et les contacts.

**La scène des sorties.** Sur le sol (ou le globe) de TribuZen, chaque sortie de la famille est un marqueur `Mesh`. En activant les ombres :
- le `renderer.shadowMap` est activé une fois, en `PCFSoftShadowMap` (bords doux, cohérent avec un rendu soigné) ;
- la `DirectionalLight` (le « soleil » de la scène, posé au module 14) devient `castShadow = true`, avec un frustum d'ombre réglé au plus juste autour de la zone des marqueurs ;
- chaque marqueur `castShadow`, le sol `receiveShadow`.

Pour une **grande** carte (beaucoup de sorties étalées sur une large surface), la simple shadow map pixellise : c'est le cas d'usage des **CSM** (addon Three.js), à activer si la scène s'agrandit :

```typescript
import { CSM } from 'three/addons/csm/CSM.js';

const csm = new CSM({
  camera,
  parent: scene,
  cascades: 4,
  maxFar: camera.far,
  mode: 'logarithmic',
  shadowMapSize: 2048,
  lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
});
csm.setupMaterial(floorMaterial); // injecte les uniforms CSM dans le matériau
// dans la boucle : csm.update();
```

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        createScene.ts   ← renderer.shadowMap.enabled + type PCFSoftShadowMap
        lights/
          Sun.ts         ← DirectionalLight.castShadow + shadow.camera/bias/normalBias
        markers/
          OutingMarker.ts ← castShadow = true (le sol : receiveShadow = true)
        csm/
          setupCSM.ts    ← optionnel, si la carte des sorties devient grande
```

> Réglage attendu en revue : `normalBias` fait le gros du travail anti-acne, `bias` négatif complète, `mapSize` monte à 4096 seulement si les bords restent crénelés. Le `CameraHelper(sun.shadow.camera)` reste en dev pour visualiser (et resserrer) le frustum d'ombre.

---

## 6. Points clés

1. Shadow mapping = **2 passes** : (1) rendre la profondeur **depuis la lumière** (shadow map), (2) depuis la caméra, projeter chaque fragment dans l'espace lumière et **comparer** sa profondeur à la shadow map.
2. **Matrice light-space** = `lightProjection * lightView` : **ortho** pour une directional, **perspective** pour une spot, **6 faces** pour une point light.
3. La shadow map est une **depth texture**, lue via un **sampler de comparaison** (`compare: 'less'` → `textureSampleCompare` renvoie 1.0 = éclairé, 0.0 = ombre en WebGPU).
4. **Shadow acne** (moiré) = manque de bias, dû à la discrétisation ; correctifs : **bias constant**, **slope-scaled** `max(k·(1−dot(N,L)), m)`, **normal bias**, **front-face culling** en shadow pass.
5. **Peter panning** = ombre décollée = **excès** de bias ; le réglage cherche la fenêtre entre acne et peter panning.
6. **PCF** = moyenner le **résultat du test** sur un noyau de texels (3×3, 5×5) → bords doux ; à ne pas confondre avec moyenner les profondeurs.
7. **CSM** = plusieurs shadow maps sur des tranches du frustum caméra → résolution constante sur une grande scène directionnelle ; attention au shadow swimming (snap sur texels).
8. **Three.js** : `renderer.shadowMap.enabled` + `type`, `light.castShadow` + `light.shadow.{mapSize, camera, bias, normalBias, radius}`, et `castShadow`/`receiveShadow` **par objet** (false par défaut).

---

## 7. Seeds Anki

```
Pourquoi le shadow mapping commence-t-il par rendre la scène depuis la lumière ?|Pour construire la shadow map : une depth texture où chaque texel = distance lumière → premier occludeur. En passe 2 (depuis la caméra), on compare la profondeur de chaque fragment à cette map pour savoir s'il est caché de la lumière (ombre) ou non (éclairé).
Quelle projection utilise la matrice light-space selon le type de lumière ?|Directional light → projection orthographique (rayons parallèles). Spot light → perspective (fov = angle du cône). Point light → 6 perspectives fov 90°, une par face d'un cube (cubemap shadow). lightSpaceMatrix = lightProjection * lightView.
Qu'est-ce que le shadow acne et comment le corriger ?|Des bandes de moiré sur les surfaces ÉCLAIRÉES, dues à la discrétisation de la shadow map (un texel couvre une zone, certains fragments se croient derrière un occludeur). Correctifs : depth bias (constant, slope-scaled max(k·(1−dot(N,L)), m)), normal bias, et front-face culling pendant la shadow pass.
Qu'est-ce que le peter panning et quelle est sa cause ?|L'ombre se détache du pied de l'objet, qui semble léviter. Cause : un depth bias TROP élevé (l'inverse du shadow acne). Le réglage consiste à trouver la fenêtre entre acne (trop peu de bias) et peter panning (trop de bias).
En quoi consiste le PCF et quelle erreur classique fausse le résultat ?|Percentage-Closer Filtering : on échantillonne plusieurs texels autour du point (noyau 3x3, 5x5) et on moyenne le RÉSULTAT DU TEST de comparaison (0/1) → bords d'ombre doux. Erreur classique : moyenner les profondeurs puis comparer une seule fois — ça ne produit pas de bord doux. La comparaison doit précéder le filtrage (sampler_comparison).
À quoi servent les Cascaded Shadow Maps (CSM) ?|Découper le frustum de la caméra en plusieurs tranches (cascades), chacune avec sa propre shadow map ajustée. Cela maintient une densité de texels élevée près de la caméra sans gaspiller la résolution au loin — indispensable pour un soleil sur une grande scène. Piège : shadow swimming, corrigé en snappant les cascades sur la grille de texels.
Quels trois niveaux activer pour avoir des ombres dans Three.js ?|(1) renderer.shadowMap.enabled = true + type (ex PCFSoftShadowMap). (2) light.castShadow = true + réglage de light.shadow (mapSize, camera near/far/left/right/top/bottom, bias, normalBias, radius). (3) Par objet : castShadow (projette) et receiveShadow (reçoit), tous deux false par défaut.
Pourquoi l'éclairage diffus (dot(N, L)) ne suffit-il pas à créer des ombres portées ?|dot(N, L) fait de l'ombrage (self-shading) : il assombrit une face orientée loin de la lumière, mais IGNORE les occludeurs. Une scène peut être parfaitement éclairée sans aucune ombre portée. Le shadow mapping est une passe dédiée en plus, qui répond à « ce point est-il caché de la lumière par un autre objet ? ».
```

---

## Pont vers le lab

> Lab associé : `labs/lab-18-shadow-mapping/README.md`. Ajouter des ombres portées à une scène Three.js (r185), puis régler le compromis shadow acne / peter panning et adoucir les bords au PCF — dans un vrai navigateur, corrigé HTML/TS commenté intégral.
