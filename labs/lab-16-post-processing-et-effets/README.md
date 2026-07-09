# Lab 16 — Post-processing et effets (EffectComposer)

> **Outcome :** à la fin, tu sais monter un `EffectComposer` sur une scène Three.js, ajouter un `UnrealBloomPass` réglé et un `ShaderPass` vignette custom, dans le bon ordre — le tout tournant dans un vrai navigateur.
> **Vrai outil :** Three.js (r170+) + Vite, dans Chrome. Aucun harnais, aucun test-runner : l'oracle est **ce que tu vois à l'écran**.
> **Feedback :** le coach valide en session (halo visible sur l'objet émissif + bords assombris par la vignette = lab réussi).

---

## Énoncé

Tu pars d'une scène Three.js qui **s'affiche déjà** : quelques objets, une lumière, `OrbitControls`, et un `renderer.render(scene, camera)` classique dans la boucle. Ta mission :

1. Remplacer le rendu direct par un `EffectComposer` (`RenderPass` → `OutputPass`).
2. Ajouter un `UnrealBloomPass` réglé pour qu'**un seul objet** (le plus émissif) rayonne d'un halo.
3. Écrire un `ShaderPass` **vignette** custom (fragment shader lisant `tDiffuse`) et l'insérer **au bon endroit** dans la chaîne.

**Règle absolue :** tu ne touches **pas** à la scène (pas de manipulation des géométries pour « fausser » un halo). Le halo doit venir du bloom, la vignette d'un shader d'image.

### Starter minimal

Crée un projet Vite vanilla-ts (`npm create vite@latest lab16 -- --template vanilla-ts`), `npm i three`, puis mets ce `main.ts` — il rend une scène **sans aucun post-processing** :

```typescript
// main.ts — scène de départ (rendu direct, à faire évoluer)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true }); // ← à revoir
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a14);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0x334466, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(3, 5, 2);
scene.add(dir);

// Objet "normal" (mat) et objet "sélectionné" (très émissif → doit rayonner)
const mat = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.8, 0),
  new THREE.MeshStandardMaterial({ color: 0x3388ff, roughness: 0.4 }),
);
mat.position.x = -1.6;
scene.add(mat);

const glow = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.8, 0),
  new THREE.MeshStandardMaterial({
    color: 0xffcc33,
    emissive: 0xffcc33,
    emissiveIntensity: 3.0, // > 1 : dépassera le threshold du bloom
  }),
);
glow.position.x = 1.6;
scene.add(glow);

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera); // ← à REMPLACER par composer.render()
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
```

Lance `npm run dev`. Tu dois voir deux icosaèdres : un bleu mat, un jaune vif — **sans halo** (l'émissif seul ne déborde pas). C'est le point de départ.

---

## Étapes (en friction)

1. **Désactive le MSAA natif** — avec un composer, `antialias: true` sur le renderer est inefficace. Passe-le à `false`. (À la fin, tu ajouteras une passe SMAA/FXAA en bonus.)
2. **Monte le socle** — importe `EffectComposer`, `RenderPass`, `OutputPass` depuis `three/addons/postprocessing/`. Crée le composer, ajoute `RenderPass(scene, camera)` puis `OutputPass()`. Remplace `renderer.render(scene, camera)` par `composer.render()` dans `animate`. Vérifie que l'image est **identique** au départ (le socle ne change rien de visible).
3. **Ajoute le bloom** — insère un `UnrealBloomPass` **entre** RenderPass et OutputPass. Constructeur : `(new THREE.Vector2(innerWidth, innerHeight), strength, radius, threshold)`. Choisis un `threshold` assez haut pour que **seul** l'objet jaune émissif rayonne (l'objet bleu mat ne doit pas briller). Ajuste `strength` et `radius` jusqu'à un halo net.
4. **Écris la vignette** — crée un objet shader `{ uniforms, vertexShader, fragmentShader }` avec `tDiffuse: { value: null }` et un `uDarkness`. Le fragment lit `texture2D(tDiffuse, vUv)`, calcule la distance au centre, et assombrit les bords via `smoothstep`. Enveloppe-le dans un `ShaderPass`.
5. **Place la vignette au bon endroit** — insère-la **après** le bloom, **avant** l'`OutputPass`. Vérifie de tes yeux : le halo est intact, les bords sont assombris.
6. **Teste l'ordre à l'envers** (diagnostic) — mets temporairement la vignette **avant** le bloom. Observe : les coins ne s'assombrissent plus autant. Remets l'ordre correct. C'est la démonstration que les passes ne commutent pas.
7. **Gère le resize** — ajoute `composer.setSize(innerWidth, innerHeight)` dans le handler `resize`. Redimensionne la fenêtre : l'image ne doit pas se déformer.
8. **(Bonus) Antialiasing** — ajoute un `SMAAPass` (ou un `ShaderPass(FXAAShader)`) juste avant l'`OutputPass`. Compare les bords crénelés avant/après.

---

## Grille d'auto-évaluation

Coche chaque ligne. Le lab est réussi quand toutes les lignes « obligatoire » sont vertes.

| # | Critère | Niveau | Vérifié à l'œil / au code |
|---|---------|--------|---------------------------|
| 1 | `renderer` créé avec `antialias: false` | obligatoire | pas de MSAA natif inutile |
| 2 | `composer.render()` remplace `renderer.render()` (un seul des deux) | obligatoire | boucle `animate` |
| 3 | Chaîne = `RenderPass` … `OutputPass` **en dernier** | obligatoire | ordre d'`addPass` |
| 4 | Bloom : **seul** l'objet émissif rayonne (bleu mat non affecté) | obligatoire | threshold bien calé |
| 5 | ShaderPass vignette déclare l'uniform `tDiffuse` | obligatoire | sinon écran vide |
| 6 | Vignette placée **après** le bloom, **avant** `OutputPass` | obligatoire | coins assombris + halo intact |
| 7 | `composer.setSize()` appelé au resize | obligatoire | image non déformée |
| 8 | Passe AA (SMAA/FXAA) avant `OutputPass` | bonus | bords lissés |
| 9 | `strength` / `radius` / `threshold` réglés à la main, pas au hasard | maîtrise | tu sais quel paramètre fait quoi |

---

## Coach — indices progressifs (ne lis que si tu bloques)

> **Indice 1 — « mon image est noire après avoir ajouté le composer »**
> Vérifie que `RenderPass(scene, camera)` est bien la **première** passe ajoutée. Sans elle, aucune image n'entre dans la chaîne : les passes suivantes traitent du vide. Vérifie aussi que tu as bien remplacé `renderer.render()` par `composer.render()` (et pas juste ajouté à côté).

> **Indice 2 — « mon ShaderPass vignette donne un écran noir »**
> Le composer injecte l'image entrante dans l'uniform **exactement nommé `tDiffuse`**. Si tu l'as appelé `uImage` ou `uInput`, l'image n'arrive jamais. Soit tu renommes en `tDiffuse`, soit tu passes le nom en 2ᵉ argument : `new ShaderPass(shader, 'uInput')`. Vérifie aussi que le fragment fait bien `gl_FragColor = color;` à la fin.

> **Indice 3 — « le bloom fait briller TOUTE la scène, pas juste l'objet jaune »**
> Ton `threshold` est trop bas. Monte-le (essaie `0.85`–`0.95`) : seuls les pixels plus brillants que ce seuil rayonnent. L'objet jaune a `emissiveIntensity: 3.0`, donc il dépasse ; l'objet bleu mat non émissif reste sous le seuil. Si rien ne brille du tout, ton threshold est trop haut ou `strength` trop bas.

> **Indice 4 — « le halo et la vignette ne cohabitent pas bien »**
> C'est un problème d'ordre. La vignette doit venir **après** le bloom : sinon le bloom rallume les pixels que la vignette venait d'assombrir. Ordre correct : `RenderPass → UnrealBloomPass → vignette (ShaderPass) → [AA] → OutputPass`. L'`OutputPass` est **toujours** la dernière.

---

## Corrigé complet commenté

```typescript
// main.ts — corrigé : EffectComposer + bloom sélectif + vignette custom
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

// ── Étape 1 : antialias:false (le MSAA natif ne sert pas avec un composer) ──
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a14);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0x334466, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(3, 5, 2);
scene.add(dir);

const matMesh = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.8, 0),
  new THREE.MeshStandardMaterial({ color: 0x3388ff, roughness: 0.4 }),
);
matMesh.position.x = -1.6;
scene.add(matMesh);

const glow = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.8, 0),
  new THREE.MeshStandardMaterial({
    color: 0xffcc33,
    emissive: 0xffcc33,
    emissiveIntensity: 3.0, // > 1 : dépasse le threshold du bloom → seul lui rayonne
  }),
);
glow.position.x = 1.6;
scene.add(glow);

// ── Étape 4 : shader de vignette (fragment lisant tDiffuse) ────────────────
const VignetteShader = {
  uniforms: {
    tDiffuse:  { value: null }, // OBLIGATOIRE : le composer y met l'image entrante
    uDarkness: { value: 1.3 },  // intensité de l'assombrissement des bords
  },
  // Le vertex ne fait que projeter le quad plein écran et passer les uv
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDarkness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);   // image de la passe précédente
      float dist = length(vUv - 0.5);          // 0 au centre → ~0.7 aux coins
      // smoothstep : 1 au centre (net), 0 vers les bords (sombre)
      float v = smoothstep(0.8, 0.2, dist * uDarkness);
      color.rgb *= v;
      gl_FragColor = color;
    }
  `,
};

// ── Étapes 2, 3, 5 : montage de la chaîne dans le BON ordre ────────────────
const composer = new EffectComposer(renderer);

// 1. Rendu de la scène dans le framebuffer (toujours en premier)
composer.addPass(new RenderPass(scene, camera));

// 2. Halo : threshold haut → seul l'objet émissif (glow) dépasse
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  1.4,  // strength  : combien ça brille
  0.5,  // radius    : jusqu'où le halo déborde ([0,1])
  0.9,  // threshold : quoi brille (haut → seul l'émissif passe)
);
composer.addPass(bloom);

// 3. Vignette : APRÈS le bloom (sinon le bloom rallumerait les coins)
composer.addPass(new ShaderPass(VignetteShader));

// 4. (Bonus) AA ici, avant l'output — ex. import SMAAPass et composer.addPass(...)

// 5. Sortie : tone mapping + conversion sRGB — TOUJOURS en dernier
composer.addPass(new OutputPass());

// ── Boucle : composer.render() À LA PLACE de renderer.render() ─────────────
function animate(): void {
  requestAnimationFrame(animate);
  controls.update();
  composer.render(); // un seul rendu : ne pas garder renderer.render() en plus
}
animate();

// ── Étape 7 : resize sur renderer ET composer ─────────────────────────────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight); // sinon framebuffers à l'ancienne taille
});
```

**Pourquoi ce corrigé est correct :**
- Le socle `RenderPass → OutputPass` reproduit à l'identique le rendu direct : c'est la preuve que le composer n'altère rien tant qu'aucun effet n'est inséré.
- Le `threshold: 0.9` combiné à `emissiveIntensity: 3.0` sur le seul objet `glow` produit un bloom **sélectif** sans rendu multi-passes : l'objet bleu mat reste sous le seuil.
- La vignette placée **après** le bloom garantit que l'assombrissement des bords n'est pas rallumé par le halo — l'ordre est le cœur de l'exercice.
- `composer.setSize()` au resize évite l'étirement des framebuffers internes, distinct de `renderer.setSize()`.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — 25 minutes, corrigé interdit, page blanche.**

Repars du starter et, **sans relire le corrigé** :

1. Monte le composer de mémoire (`RenderPass` → `OutputPass`), bascule le renderer en `antialias: false`.
2. Ajoute le bloom sélectif — trouve seul le trio `strength / radius / threshold` qui ne fait rayonner que l'objet émissif.
3. **Contrainte nouvelle :** écris un `ShaderPass` **color grading** (pas la vignette) : un fragment qui ajuste la **saturation** de l'image. Indice maths : `luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722))`, puis `color.rgb = mix(vec3(luminance), color.rgb, uSaturation)`. Expose `uSaturation` (0 = N&B, 1 = normal, 2 = saturé) et règle-le à `1.3`.
4. **Contrainte d'ordre :** place le color grading **avant** le bloom cette fois, et explique à voix haute pourquoi ça change le rendu du halo (le halo est saturé lui aussi vs saturé après).
5. Ajoute une passe FXAA (`ShaderPass(FXAAShader)` depuis `three/addons/shaders/FXAAShader.js`) avec son uniform `resolution` en `1/pixels`.

**Critère de réussite :** à l'écran, halo sélectif + couleurs plus saturées + bords lissés, sans jamais avoir gardé `renderer.render()` dans la boucle.

---

## Application TribuZen

Dans `smaurier/tribuzen`, le pipeline de ce lab habille la couche 3D réelle :

```
tribuzen/
  src/
    3d/
      post/
        composer.ts        ← EffectComposer : RenderPass → bloom → vignette → SMAA → OutputPass
        VignetteShader.ts   ← le ShaderPass custom du lab (tDiffuse + uDarkness)
      map/
        SelectionBloom.ts   ← monte emissiveIntensity du marqueur sélectionné (le halo suit)
      MapCanvas.vue         ← animate() → composer.render()
```

**Différences par rapport au lab :**
- Le `threshold` du bloom sera exposé dans un thème (design system) plutôt que codé en dur.
- Le marqueur « sélectionné » viendra d'un état Pinia (`useSelectionStore`) — le lab code la sélection en dur (`glow`).
- La vignette (`uDarkness`) sera un réglage d'ambiance du feed 3D, activable/désactivable.

Lance le rendu dans Chrome avant de committer — le halo doit rester **sélectif** (un seul marqueur), pas contaminer toute la carte.

**Commit cible :**

```
feat(3d): pipeline post-processing — bloom sélectif sur sélection + vignette d'ambiance
```
