# Lab 23 — Global illumination et techniques screen-space

> **Outcome :** à la fin, tu sais ajouter du **SSAO** (occlusion ambiante screen-space) à une scène Three.js (r185) via `SSAOPass`, l'accorder à l'échelle de la scène, et prouver l'effet à l'œil — un objet posé qui cesse de « flotter ».
> **Vrai outil :** Three.js r185 dans le navigateur (Chrome/Firefox), `EffectComposer` + `SSAOPass`, via import map — aucun bundler, aucun harnais simulé.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Le critère est visuel : avec SSAO, un halo d'ombre de contact apparaît sous les objets, les creux ressortent ; le mode `SSAOPass.OUTPUT.SSAO` montre une carte d'AO cohérente (sombre aux contacts, clair sur les zones dégagées).

## Énoncé

Tu ajoutes l'**ancrage réaliste** au globe des sorties de TribuZen. La scène de départ (globe + marqueurs posés à la surface) souffre du **flottement** : sans occlusion ambiante, les marqueurs paraissent collés en surface, sans ombre de contact. Objectif — brancher un `SSAOPass` sur un `EffectComposer` et le régler pour que les contacts s'assombrissent naturellement.

Contrainte : tout passe par l'API Three.js post-processing (`EffectComposer`, `RenderPass`, `SSAOPass`). Version de référence : **Three.js r185**. La boucle doit appeler **`composer.render()`** (pas `renderer.render()`).

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement, canvas + import map. Ne rien changer ici :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 23 — SSAO sur le globe TribuZen</title>
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

**`main.js`** — squelette à COMPLÉTER (les `// TODO` sont à toi). La scène est fournie ; c'est le **pipeline SSAO** que tu dois câbler :

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// TODO 1 : importer EffectComposer, RenderPass, SSAOPass depuis three/addons/postprocessing/

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const w = canvas.clientWidth, h = canvas.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
camera.position.set(0, 1.5, 4);

// Globe + marqueurs (FOURNI — c'est la scène qui "flotte" sans SSAO)
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.7 }),
);
scene.add(globe);
for (let i = 0; i < 8; i++) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5 }),
  );
  marker.position.setFromSphericalCoords(1, Math.random() * Math.PI, Math.random() * 2 * Math.PI);
  globe.add(marker);
}
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 4, 2);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// TODO 2 : créer l'EffectComposer et lui ajouter un RenderPass(scene, camera)

// TODO 3 : créer le SSAOPass(scene, camera, w, h) et l'ajouter au composer

// TODO 4 : régler kernelRadius / minDistance / maxDistance à l'échelle du globe (~1 unité)

// TODO 5 : boucle setAnimationLoop — rotation globe, controls.update(), composer.render()
//          (PAS renderer.render() !)
```

Lancer : n'importe quel serveur statique dans le dossier du lab, par ex.

```bash
npx serve .
# puis ouvrir l'URL affichée (http://localhost:3000)
```

(Un serveur est nécessaire : les modules ES et l'import map ne se chargent pas en `file://`.)

## Étapes (en friction)

Écris le code toi-même avant de regarder le corrigé. Ordre conseillé :

1. **Imports** — `EffectComposer`, `RenderPass`, `SSAOPass` depuis `three/addons/postprocessing/...`.
2. **Composer** — `new EffectComposer(renderer)`, puis `composer.addPass(new RenderPass(scene, camera))`.
3. **SSAOPass** — `new SSAOPass(scene, camera, w, h)`, `composer.addPass(ssaoPass)`.
4. **Réglage** — `kernelRadius`, `minDistance`, `maxDistance` en **unités scène** (globe ≈ 1 unité).
5. **Boucle** — `renderer.setAnimationLoop(() => { globe.rotation.y += 0.002; controls.update(); composer.render(); })`.
6. **Debug** — mets `ssaoPass.output = SSAOPass.OUTPUT.SSAO` pour voir la carte d'AO seule, accorde le rayon, puis reviens à `Default`.

Vérifie dans le navigateur : sans SSAO les marqueurs flottent ; avec SSAO bien réglé, une ombre de contact apparaît à leur base. Erreurs à débusquer toi-même : aucun effet (tu as gardé `renderer.render()` ? piège #1), aplat gris uniforme (rayon trop grand), AO invisible (rayon trop petit pour l'échelle), halo autour des silhouettes (`maxDistance` trop grand).

## Corrigé complet commenté

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// 1. Imports post-processing — chemin d'addon canonique (r185)
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const w = canvas.clientWidth, h = canvas.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
camera.position.set(0, 1.5, 4);

// --- Scène (fournie) : globe + marqueurs posés à la surface ---
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.7 }),
);
scene.add(globe);

for (let i = 0; i < 8; i++) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5 }),
  );
  // setFromSphericalCoords(rayon, phi, theta) : place le marqueur SUR la surface (rayon = 1)
  marker.position.setFromSphericalCoords(1, Math.random() * Math.PI, Math.random() * 2 * Math.PI);
  globe.add(marker); // enfant du globe → tourne avec lui (graphe hiérarchique, module 13)
}

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 4, 2);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 2. EffectComposer : rend la scène dans un buffer que les passes suivantes traitent
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera)); // passe 1 : la scène brute

// 3. SSAOPass : constructeur réel = (scene, camera, width = 512, height = 512, kernelSize = 32)
const ssaoPass = new SSAOPass(scene, camera, w, h);

// 4. Réglage EN UNITÉS DE LA SCÈNE (globe ≈ 1 unité de rayon)
ssaoPass.kernelRadius = 8;      // jusqu'où chercher des occludeurs
ssaoPass.minDistance = 0.005;   // en-deçà : bruit de surface ignoré (anti-acné)
ssaoPass.maxDistance = 0.1;     // au-delà : plus un contact → coupe les halos
composer.addPass(ssaoPass);

// Debug : décommente pour voir UNIQUEMENT la carte d'occlusion (niveaux de gris)
// ssaoPass.output = SSAOPass.OUTPUT.SSAO;

// 5. Boucle : composer.render() — PAS renderer.render() (sinon le SSAO est court-circuité)
renderer.setAnimationLoop(() => {
  globe.rotation.y += 0.002; // rotation lente pour apprécier l'AO sous plusieurs angles
  controls.update();         // OBLIGATOIRE avec enableDamping
  composer.render();         // exécute RenderPass -> SSAOPass -> écran
});
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Composer monté | `EffectComposer` + `RenderPass(scene, camera)` en première passe | ☐ |
| SSAOPass ajouté | `new SSAOPass(scene, camera, w, h)` puis `composer.addPass(ssaoPass)` | ☐ |
| Bon appel de rendu | boucle appelle `composer.render()` (pas `renderer.render()`) | ☐ |
| Réglage à l'échelle | `kernelRadius`/`minDistance`/`maxDistance` accordés au globe (~1 unité) | ☐ |
| Effet visible | ombre de contact à la base des marqueurs ; creux assombris | ☐ |
| Pas de halo / pas d'acné | pas de liseré sombre autour des silhouettes, pas de bruit sur surfaces plates | ☐ |
| Debug maîtrisé | sait afficher `SSAOPass.OUTPUT.SSAO` et interpréter la carte d'AO | ☐ |
| Imports corrects | `three/addons/postprocessing/...` (pas `three/examples/jsm/`) | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Que se passe-t-il si tu laisses `renderer.render(scene, camera)` dans la boucle au lieu de `composer.render()` ?** (Attendu : le pipeline de passes est court-circuité, le `SSAOPass` n'est jamais exécuté, on voit la scène brute sans AO.)
2. **Pourquoi le noyau SSAO échantillonne-t-il un hémisphère orienté selon la normale, et pas une sphère ?** (Attendu : une sphère met la moitié des échantillons derrière la surface, toujours occlus → toute surface plane tend vers 50 % d'occlusion, l'AO devient un aplat gris inutile.)
3. **À quoi sert le range check (piloté par `maxDistance`) et quel artefact évite-t-il ?** (Attendu : il ignore les occludeurs trop lointains ; sans lui, un objet devant un fond éloigné crée un halo d'occlusion parasite autour de sa silhouette.)
4. **Pourquoi les valeurs `kernelRadius`/`maxDistance` d'un tuto ne marchent-elles pas toujours sur ta scène ?** (Attendu : ce sont des unités monde ; sur une autre échelle, l'AO est soit invisible, soit un aplat gris. Il faut régler via `output = SSAOPass.OUTPUT.SSAO` sur sa propre scène.)
5. **Quelle est la limite structurelle du SSAO (et du SSR) que le G-buffer impose ?** (Attendu : screen-space = ne voit que ce qui est à l'écran ; un occludeur hors-champ ou masqué n'existe pas pour l'algorithme. Ce n'est pas un bug, c'est la nature de la technique.)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **20 minutes chrono**, avec deux contraintes ajoutées :

1. **Ajouter un second pass après le SSAO** : un `OutputPass` (`three/addons/postprocessing/OutputPass.js`) en fin de chaîne pour le tone mapping correct — et vérifier que l'ordre des passes compte (SSAO **avant** l'output).
2. **Piloter `kernelRadius` en direct** avec les touches `+` / `-` du clavier (un simple `window.addEventListener('keydown', ...)`), et observer en temps réel le passage « AO invisible → juste → aplat gris ». Prouver que tu sais diagnostiquer le réglage à l'œil, sans copier une valeur.

Objectif : prouver que le pipeline de passes (ordre, `composer.render()`) et le réglage à l'échelle sont acquis sans support.

## Application TribuZen

Ce SSAO devient l'**ancrage réaliste** du globe des sorties dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      postprocessing/
        createComposer.ts   ← EffectComposer + RenderPass + BloomPass (module 16)
        addSSAO.ts          ← SSAOPass réglé à l'échelle du globe (ce lab)
```

Portage concret :

- extraire le câblage en `addSSAO.ts` : une fonction `addSSAO(composer, scene, camera, size)` qui crée le `SSAOPass`, applique le réglage (`kernelRadius`, `min/maxDistance`) et l'ajoute au composer déjà monté (`createComposer.ts` du module 16) ;
- exposer un flag de debug (env ou query param) qui bascule `ssaoPass.output = SSAOPass.OUTPUT.SSAO` pour régler à l'œil en dev ;
- penser au **resize** : le `SSAOPass` doit être redimensionné (`ssaoPass.setSize(w, h)`) en même temps que le composer quand le canvas change ;
- commit `smaurier/tribuzen` : `feat(3d): occlusion ambiante SSAO sur le globe des sorties`.
