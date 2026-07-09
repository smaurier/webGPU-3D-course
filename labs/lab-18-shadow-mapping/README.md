# Lab 18 — Shadow mapping

> **Outcome :** à la fin, tu sais ajouter des ombres portées à une scène Three.js (r185), puis **régler le compromis shadow acne / peter panning** et adoucir les bords au PCF — dans un vrai navigateur.
> **Vrai outil :** Three.js r185 dans le navigateur (Chrome/Firefox), via import map — aucun bundler, aucun harnais simulé.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Le critère est visuel : les objets projettent des ombres nettes, ancrées à leur pied, sans moiré (acne) ni décollement (peter panning).

## Énoncé

Tu ajoutes les **ombres portées** à la scène des sorties de TribuZen. Objectif visuel : **trois marqueurs** (sphères colorées) posés sur un **sol**, éclairés par une **`DirectionalLight`** (le soleil). Chaque marqueur **projette une ombre** nette sur le sol, ce qui l'**ancre** visuellement au lieu de le faire flotter.

Puis le vrai travail du lab : **diagnostiquer et régler** les deux artefacts d'ombre (shadow acne, peter panning) et **adoucir** les bords au PCF.

Contrainte : tout passe par Three.js (aucune ligne de GLSL, aucun shadow shader manuel). Version de référence : **Three.js r185**.

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement, canvas + import map. Ne rien changer ici :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 18 — Ombres TribuZen (shadow mapping Three.js)</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; }
    #app { display: block; width: 100vw; height: 100vh; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <canvas id="app"></canvas>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

**`main.js`** — squelette à COMPLÉTER (les `// TODO` sont à toi) :

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// TODO 1 : activer les ombres sur le renderer + choisir un type (PCFSoftShadowMap)

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(6, 6, 8);

// TODO 2 : DirectionalLight (le soleil) + castShadow + régler shadow.camera / bias / normalBias
scene.add(new THREE.AmbientLight(0xffffff, 0.4)); // sinon l'ombre serait noir absolu

// TODO 3 : le SOL (PlaneGeometry) → receiveShadow = true

// TODO 4 : trois MARQUEURS (SphereGeometry) posés sur le sol → castShadow = true

// TODO 5 (debug) : CameraHelper(sun.shadow.camera) pour voir le frustum d'ombre

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function resizeRendererToDisplaySize(r) {
  const c = r.domElement;
  const need = c.width !== c.clientWidth || c.height !== c.clientHeight;
  if (need) r.setSize(c.clientWidth, c.clientHeight, false);
  return need;
}

renderer.setAnimationLoop(() => {
  if (resizeRendererToDisplaySize(renderer)) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
  controls.update();
  renderer.render(scene, camera);
});
```

Lancer : n'importe quel serveur statique dans le dossier du lab, par ex.

```bash
npx serve .
# puis ouvrir l'URL affichée (http://localhost:3000)
```

(Un serveur est nécessaire : les modules ES et l'import map ne se chargent pas en `file://`.)

## Étapes (en friction)

Écris le code toi-même avant de regarder le corrigé. Ordre conseillé :

1. **Renderer** — `renderer.shadowMap.enabled = true` puis `renderer.shadowMap.type = THREE.PCFSoftShadowMap`.
2. **Soleil** — `DirectionalLight`, `position`, `castShadow = true`, `shadow.mapSize.set(2048, 2048)`, régler `shadow.camera` (`near/far/left/right/top/bottom`) au plus juste, `shadow.bias`, `shadow.normalBias`, `shadow.radius`.
3. **Sol** — `PlaneGeometry`, `rotation.x = -Math.PI/2`, `receiveShadow = true`.
4. **Marqueurs** — trois `Mesh(SphereGeometry, MeshStandardMaterial)` posés à `y = rayon`, `castShadow = true` (et `receiveShadow` si tu veux qu'ils s'ombrent entre eux).
5. **Debug** — `CameraHelper(sun.shadow.camera)` : visualiser (et resserrer) le frustum d'ombre.
6. **Réglage** — mets d'abord `bias = 0` et `normalBias = 0` pour **provoquer** l'acne, puis règle (voir la grille et la variante).

Erreurs à débusquer toi-même : **aucune ombre** (`castShadow`/`receiveShadow` oubliés, ou `shadowMap.enabled` non mis) ; **moiré** (acne : monter `normalBias`) ; **ombre décollée du pied** (peter panning : baisser le bias) ; **ombre pixelisée/baveuse** (frustum d'ombre trop large pour la scène, ou `mapSize` trop faible).

## Corrigé complet commenté

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 1. RENDERER : activer les ombres + filtrage PCF doux (bords adoucis)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // BasicShadowMap = dur ; PCFShadowMap = défaut

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(6, 6, 8);

// 2. SOLEIL : DirectionalLight qui CASTE des ombres
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);       // résolution de la shadow map
// La "shadow camera" d'une DirectionalLight est ORTHOGRAPHIQUE (rayons parallèles).
// Régler le frustum AU PLUS JUSTE autour de la zone visible → texels denses → ombres nettes.
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;   sun.shadow.camera.bottom = -12;
// Anti-acne : le normalBias fait le gros du travail, un petit bias négatif complète.
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;                      // rayon du PCF (avec PCFSoftShadowMap)
scene.add(sun);

// AmbientLight : sinon les zones d'ombre seraient noir absolu (aucune lumière reçue)
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// 3. SOL : reçoit les ombres
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true; // ← sinon aucune ombre visible sur le sol
scene.add(floor);

// 4. MARQUEURS : trois sorties, chacune projette une ombre
const specs = [
  { color: 0xff5533, r: 0.6, pos: [-2.5, 0.6, 0] },
  { color: 0x33cc88, r: 0.9, pos: [0, 0.9, -2] },
  { color: 0x4488ff, r: 0.4, pos: [2.5, 0.4, 1.5] },
];
for (const s of specs) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(s.r, 32, 32),
    new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.5 }),
  );
  marker.position.set(s.pos[0], s.pos[1], s.pos[2]); // y = rayon → posé sur le sol
  marker.castShadow = true;    // projette une ombre
  marker.receiveShadow = true; // reçoit (si un marqueur en ombre un autre)
  scene.add(marker);
}

// 5. DEBUG : visualiser le frustum de la shadow camera (à retirer en prod)
scene.add(new THREE.CameraHelper(sun.shadow.camera));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);
controls.update();

function resizeRendererToDisplaySize(r) {
  const c = r.domElement;
  const need = c.width !== c.clientWidth || c.height !== c.clientHeight;
  if (need) r.setSize(c.clientWidth, c.clientHeight, false);
  return need;
}

renderer.setAnimationLoop(() => {
  if (resizeRendererToDisplaySize(renderer)) {
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
  controls.update();
  renderer.render(scene, camera);
});
```

### Protocole de réglage acne ⇄ peter panning

À faire **dans le navigateur**, en modifiant seulement les lignes de bias :

```javascript
// A) Provoquer l'ACNE (pour la reconnaître) : bandes de moiré sur le sol / les sphères
sun.shadow.bias = 0;
sun.shadow.normalBias = 0;

// B) Provoquer le PETER PANNING : l'ombre se détache du pied des sphères (elles lévitent)
sun.shadow.bias = -0.01;
sun.shadow.normalBias = 0.3;

// C) Équilibre : monter normalBias jusqu'à tuer le moiré, sans décoller l'ombre
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.03;
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Ombres activées | `renderer.shadowMap.enabled = true` + `type` (PCFSoftShadowMap) | ☐ |
| Lumière casteuse | `DirectionalLight.castShadow = true` + `shadow.mapSize` réglé | ☐ |
| Frustum d'ombre serré | `shadow.camera` (near/far/left/right/top/bottom) ajusté à la scène | ☐ |
| castShadow / receiveShadow | marqueurs `castShadow`, sol `receiveShadow` | ☐ |
| Acne diagnostiqué | sait montrer le moiré (bias = 0) et l'expliquer | ☐ |
| Peter panning diagnostiqué | sait montrer l'ombre décollée (gros bias) et l'expliquer | ☐ |
| Réglage équilibré | ombre nette, ancrée au pied, sans moiré | ☐ |
| PCF | bords doux via `PCFSoftShadowMap` + `shadow.radius` | ☐ |
| Zéro shadow shader manuel | tout passe par l'API ombres de Three.js | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Explique le pipeline shadow mapping en 2 passes, sans regarder tes notes.** (Attendu : passe 1 = rendre la profondeur depuis la lumière → shadow map ; passe 2 = depuis la caméra, projeter chaque fragment dans l'espace lumière et comparer sa profondeur à la shadow map → ombre si un objet est devant.)
2. **Tu vois du moiré sur le sol. C'est de l'acne ou du peter panning ? Quel réglage bouges-tu et dans quel sens ?** (Attendu : acne = manque de bias ; monter `normalBias` (et/ou `bias`). Peter panning serait au contraire une ombre décollée = trop de bias.)
3. **Pourquoi le frustum de `sun.shadow.camera` doit-il être serré autour de la scène ?** (Attendu : il est étalé sur `mapSize` texels ; trop large = peu de texels par mètre = ombres baveuses/pixelisées. Trop court en `far` = ombres coupées. Le `CameraHelper` sert à le visualiser.)
4. **En quoi le PCF adoucit-il les bords, et quelle erreur classique le fausse ?** (Attendu : il moyenne le RÉSULTAT du test de comparaison sur un noyau de texels ; erreur = moyenner les profondeurs puis comparer une fois, ce qui ne donne pas de dégradé.)
5. **Un objet est éclairé mais ne projette aucune ombre. Deux causes possibles côté Three.js ?** (Attendu : `renderer.shadowMap.enabled` non activé, ou l'objet n'a pas `castShadow = true` / le sol pas `receiveShadow = true` — false par défaut.)
6. **Pour une carte des sorties beaucoup plus grande, tes ombres deviennent baveuses au loin. Quelle technique et pourquoi ?** (Attendu : Cascaded Shadow Maps — découper le frustum caméra en tranches, chacune avec sa shadow map, pour garder des texels denses près de la caméra.)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **30 minutes chrono**, avec deux contraintes ajoutées :

1. **Réglage à l'aveugle** : pars de `bias = 0` / `normalBias = 0`, et **règle toi-même** jusqu'à une ombre nette et ancrée — en **verbalisant** à chaque changement quel artefact tu corriges (acne → ↑bias, peter panning → ↓bias).
2. **Sans réutiliser** l'`AmbientLight` de secours : monte à la place une deuxième `DirectionalLight` de remplissage (sans `castShadow`) pour éclairer les zones d'ombre — et vérifie que l'ombre principale reste lisible.

Objectif : prouver que le diagnostic acne/peter panning et le rôle des `castShadow`/`receiveShadow` sont acquis sans support.

## Application TribuZen

Ces ombres deviennent la **couche d'ancrage visuel** de la scène des sorties dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        createScene.ts    ← renderer.shadowMap.enabled + type PCFSoftShadowMap
        lights/
          Sun.ts          ← DirectionalLight.castShadow + shadow.camera/bias/normalBias
        markers/
          OutingMarker.ts ← castShadow = true (le sol : receiveShadow = true)
```

Portage concret :

- dans `createScene.ts`, activer `renderer.shadowMap` (enabled + `PCFSoftShadowMap`) ;
- dans `Sun.ts`, poser la `DirectionalLight` avec `castShadow` et un frustum d'ombre calibré sur l'étendue des marqueurs ;
- dans `OutingMarker.ts`, mettre `castShadow = true` à chaque marqueur créé, `receiveShadow = true` sur le sol ;
- garder `bias`/`normalBias` en constantes réglables (le réglage se fait à l'œil), et un `CameraHelper` derrière un flag `dev` ;
- commit `smaurier/tribuzen` : `feat(3d): ombres portées sur la scène des sorties (shadow mapping Three.js)`.
