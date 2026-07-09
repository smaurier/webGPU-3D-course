# Lab 25 — WebXR et animation procédurale

> **Outcome :** à la fin, tu sais, au choix, (A) rendre une scène Three.js **visitable en VR** (`VRButton` + grab au controller), OU (B) coder une **animation d'accueil procédurale** (spring sur l'échelle du globe), qui tourne dans un vrai navigateur.
> **Vrai outil :** Three.js r185 dans le navigateur (Chrome/Edge desktop pour le WebXR ; casque Quest via son navigateur pour la VR réelle), via une simple import map — aucun bundler, aucun harnais simulé.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Critère visuel : (A) le bouton "Enter VR" apparaît et l'objet s'attrape à la manette ; (B) le globe grossit avec un rebond puis se stabilise, indépendamment du framerate.

## Énoncé

Deux couches d'expérience pour le **globe des sorties de TribuZen** (monté au lab 13). **Choisis UNE piste** (l'autre est en variante J+30).

- **Piste A — Globe visitable en VR.** Une scène Three.js avec le globe flottant devant l'utilisateur ; sur un casque, "Enter VR" fait entrer dans la scène, et une manette permet d'**attraper** le globe (viser + gâchette) pour le tourner à la main.
- **Piste B — Animation d'accueil procédurale.** À l'ouverture, le globe **grossit de 0 à 1 avec un léger rebond élastique** puis tourne doucement — **sans fichier d'animation**, par un ressort (spring) calculé à chaque frame.

Contrainte commune : tout le rendu passe par Three.js r185, animation **indépendante du framerate** (`* dt`). Zéro GLSL, zéro clip glTF.

> **Tester le WebXR sans casque :** installe l'extension **WebXR API Emulator** (Chrome/Firefox) — elle simule un casque + deux manettes dans les DevTools. Sinon, la piste B ne demande aucun matériel.

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement (canvas + import map). WebXR exige un **contexte sécurisé** (`localhost` OK, `file://` KO) :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 25 — Globe TribuZen (WebXR / animation procédurale)</title>
  <style>html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }</style>
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
  <script type="module" src="./main.js"></script>
</body>
</html>
```

**`main.js`** — squelette à COMPLÉTER selon ta piste :

```javascript
import * as THREE from 'three';
// PISTE A : import { VRButton } from 'three/addons/webxr/VRButton.js';
// PISTE A : import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// --- Commun ---
// TODO 1 : Renderer plein écran + (PISTE A) renderer.xr.enabled = true
// TODO 2 : Scene + fond + PerspectiveCamera à y=1.6 (hauteur des yeux)
// TODO 3 : lumières (Ambient + Directional) sinon le globe est NOIR
// TODO 4 : le globe = SphereGeometry(0.3) + MeshStandardMaterial

// --- PISTE A (VR) ---
// TODO A1 : document.body.appendChild(VRButton.createButton(renderer))
// TODO A2 : pour i in [0,1] : getController(i) -> scene.add ; getControllerGrip(i) + modèle
// TODO A3 : sur 'selectstart', raycaster depuis la manette (-Z), attach du globe si touché
// TODO A4 : sur 'selectend', scene.attach pour relâcher

// --- PISTE B (procédural) ---
// TODO B1 : class Spring { value; velocity; update(target, dt) { ... } }
// TODO B2 : globe.scale.setScalar(0) au départ
// TODO B3 : dans la boucle, s = spring.update(1, dt) ; globe.scale.setScalar(s)

// TODO 5 : renderer.setAnimationLoop(...) — OBLIGATOIRE en XR, avec Clock + dt borné
```

Lancer : un serveur statique dans le dossier du lab.

```bash
npx serve .
# ouvrir http://localhost:3000  (localhost = contexte sécurisé, WebXR autorisé)
```

## Étapes (en friction)

Écris le code toi-même avant le corrigé. Ordre conseillé (les deux pistes partagent 1→4) :

1. **Renderer** plein écran ; pour la piste A, `renderer.xr.enabled = true`.
2. **Scene** + fond sombre ; **Camera** `PerspectiveCamera(50, ...)`, `position.set(0, 1.6, 3)` (yeux debout).
3. **Lumières** `AmbientLight` + `DirectionalLight` (sinon globe noir), `GridHelper` pour le sol.
4. **Globe** `SphereGeometry(0.3, 48, 32)` + `MeshStandardMaterial`, `position.set(0, 1.4, -0.6)`.
5. **Piste A** : `VRButton.createButton(renderer)` dans le DOM ; boucle sur les 2 controllers (`getController` + `getControllerGrip` + modèle + ligne de visée) ; `selectstart` → `Raycaster` orienté `-Z` de la manette → `controller.attach(globe)` si touché ; `selectend` → `scene.attach(globe)`.
6. **Piste B** : écris la classe `Spring` (`x'' = -k(x-cible) - d·x'`) ; `globe.scale.setScalar(0)` au départ ; dans la boucle `spring.update(1, dt)` sur l'échelle.
7. **Boucle** `renderer.setAnimationLoop(...)` (**obligatoire** en XR) avec `Clock` et `dt = Math.min(clock.getDelta(), 1/30)`.

Erreurs à débusquer toi-même : bouton "Enter VR" absent (pas de casque/émulateur, ou pas `localhost`), globe qui saute à la prise (`add` au lieu de `attach`), globe noir (pas de lumière), ressort qui explose (`dt` non borné), animation liée au FPS (`+= 0.01` sans `* dt`).

## Corrigé complet commenté

**Piste A — Globe visitable en VR :**

```javascript
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// 1. Renderer + activation du mode XR
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;                                   // active le rendu XR
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));   // bouton "Enter VR"

// 2. Scene + camera à hauteur des yeux (debout, local-floor)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1e);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3);

// 3. Lumières (sinon MeshStandardMaterial = NOIR) + sol de repère
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 2);
scene.add(sun);
scene.add(new THREE.GridHelper(10, 20, 0x444466, 0x222233));

// 4. Le globe des sorties, attrapable
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.6 }),
);
globe.position.set(0, 1.4, -0.6);
scene.add(globe);
const grabbables = [globe];

// 5. Controllers : modèle 3D + ligne de visée + grab
const factory = new XRControllerModelFactory();
const raycaster = new THREE.Raycaster();
const grabbed = [null, null];

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i); // Object3D suivant la manette
  scene.add(controller);

  const grip = renderer.xr.getControllerGrip(i);   // pour le modèle 3D de la manette
  grip.add(factory.createControllerModel(grip));
  scene.add(grip);

  // rayon de visée matérialisé (une ligne vers -Z)
  const rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2),
  ]);
  controller.add(new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x00ffff })));

  const idx = i;
  controller.addEventListener('selectstart', () => {           // gâchette enfoncée
    const m = new THREE.Matrix4().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);     // -Z = devant la manette
    const hits = raycaster.intersectObjects(grabbables);
    if (hits.length > 0) {
      grabbed[idx] = hits[0].object;
      controller.attach(grabbed[idx]);   // attach = garde la position MONDE (pas de saut)
    }
  });
  controller.addEventListener('selectend', () => {             // gâchette relâchée
    if (grabbed[idx]) { scene.attach(grabbed[idx]); grabbed[idx] = null; }
  });
}

// 6. Boucle : setAnimationLoop OBLIGATOIRE en XR (rend les 2 yeux automatiquement)
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (!grabbed.includes(globe)) globe.rotation.y += 0.3 * dt;  // tourne quand libre
  renderer.render(scene, camera);
});
```

**Piste B — Animation d'accueil procédurale (spring) :**

```javascript
import * as THREE from 'three';

// Ressort amorti : x'' = -k·(x - cible) - d·x'  (k = raideur, d = amortissement)
class Spring {
  value = 0;
  velocity = 0;
  constructor(stiffness = 140, damping = 12) { this.k = stiffness; this.d = damping; }
  update(target, dt) {
    const force = -this.k * (this.value - target); // rappel vers la cible
    const damp  = -this.d * this.velocity;         // frottement (amortit l'oscillation)
    this.velocity += (force + damp) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1e);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 1.5);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(2, 3, 2);
scene.add(sun);

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.6 }),
);
globe.scale.setScalar(0);              // départ invisible : le ressort le fait grossir
scene.add(globe);

const scaleSpring = new Spring();      // damping bas -> dépasse ~1.1 puis revient à 1 (rebond)
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30); // borner dt : sinon le ressort diverge

  const s = scaleSpring.update(1, dt);  // 0 -> ~1.1 -> 1, puis se fige
  globe.scale.setScalar(s);

  globe.rotation.y += 0.3 * dt;         // rotation d'accueil, indépendante du framerate
  renderer.render(scene, camera);
});
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Scène de base | Scene + Camera à y=1.6 + globe `SphereGeometry` + lumière | ☐ |
| Boucle correcte | `renderer.setAnimationLoop(...)`, animation en `* dt` (`Clock`) | ☐ |
| **(A)** Mode XR activé | `renderer.xr.enabled = true` + `VRButton` dans le DOM | ☐ |
| **(A)** Controllers | `getController(i)` ajouté à la scène + modèle via `getControllerGrip` | ☐ |
| **(A)** Grab correct | `Raycaster` orienté `-Z` + `controller.attach` / `scene.attach` (pas `add`) | ☐ |
| **(B)** Spring | classe `Spring` avec `x'' = -k(x-cible) - d·x'`, `update(target, dt)` | ☐ |
| **(B)** Rebond visible | échelle 0 → dépasse 1 → revient à 1, se stabilise | ☐ |
| Robustesse | `dt` borné (`Math.min(dt, 1/30)`), pas de `+= constante` sans `dt` | ☐ |
| Zéro clip / zéro GLSL | animation par code, rendu 100% Three.js | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Pourquoi la boucle DOIT-elle être `setAnimationLoop` et pas `requestAnimationFrame` dès qu'on vise le XR ?** (Attendu : le runtime XR cadence les frames à 72–90 Hz et appelle `setAnimationLoop` ; `requestAnimationFrame` reste sur l'horloge de la page et ne rend rien dans le casque. `setAnimationLoop` reçoit aussi le `XRFrame` en 2e argument.)
2. **(Piste A) Quelle est la différence entre `controller.attach(obj)` et `controller.add(obj)` pour attraper le globe ?** (Attendu : `attach` re-parente en conservant la transform MONDE → pas de saut ; `add` re-parente en local → l'objet saute à la position relative à la manette.)
3. **(Piste B) En quoi un spring diffère-t-il d'un easing `easeOutBack` sur une durée fixe ?** (Attendu : même rebond visuel, mais l'easing a une durée figée ; le spring est réactif — changer la cible (`update(1.3, dt)`) le fait re-bouger sans réécrire de timeline. Idéal pour un "pop" quand une sortie est ajoutée.)
4. **Pourquoi borner `dt` avec `Math.min(dt, 1/30)` ?** (Attendu : un onglet en arrière-plan produit un `dt` énorme au retour ; injecté dans l'intégration du ressort, la `velocity` diverge et le globe "explose". Borner `dt` stabilise l'intégration.)
5. **Que veut dire "rendu stéréo" et qui l'écrit dans un projet Three.js ?** (Attendu : deux images, une par œil, décalées de l'IPD ≈ 63 mm ; c'est Three.js qui les produit automatiquement quand `renderer.xr.enabled = true` — on n'écrit jamais la boucle `getViewerPose`/`views` à la main.)

## Variante J+30 (fading)

Reprendre **sans le corrigé**, en **30 minutes chrono**, avec la piste **non choisie** + une contrainte :

- Si tu avais fait **A (VR)** : implémente **B (spring d'accueil)** ET fais en sorte que, quand on **relâche** le globe en VR, un petit "pop" se déclenche (le ressort d'échelle repart brièvement vers `1.15` puis `1`).
- Si tu avais fait **B (procédural)** : implémente **A (VR + grab)** ET remplace la rotation libre par un **path following** : quand le globe n'est pas tenu, un petit marqueur `Mesh` **suit une `CatmullRomCurve3`** autour de lui via `getPointAt(t)` (vitesse constante).

Objectif : prouver que le trio XR (`renderer.xr.enabled` + `VRButton` + `setAnimationLoop`), le grab par `attach`, et l'animation par code (spring / courbe) sont acquis sans support.

## Application TribuZen

Ces deux couches s'ajoutent au **globe des sorties** dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        Globe.ts        ← scène du lab 13 (SphereGeometry, marqueurs)
      xr/
        enableVR.ts     ← renderer.xr.enabled + VRButton + getController/attach (corrigé A)
      anim/
        Spring.ts       ← ressort réutilisable (accueil du globe, pop de marqueur) (corrigé B)
      GlobeCanvas.vue   ← monte la scène + branche VR + animation d'accueil
```

Portage concret :

- extraire `Spring` en `anim/Spring.ts` et l'appliquer à l'échelle du globe au montage (`onMounted`), et au `scale` d'un marqueur quand une nouvelle sortie arrive dans le feed ;
- extraire le branchement VR en `xr/enableVR.ts` (renvoie une fonction de nettoyage) ; au `onUnmounted`, `renderer.setAnimationLoop(null)` **et** retirer le `VRButton` du DOM (sinon doublon) ;
- commit `smaurier/tribuzen` : `feat(3d): globe visitable en VR + animation d'accueil procédurale`.
