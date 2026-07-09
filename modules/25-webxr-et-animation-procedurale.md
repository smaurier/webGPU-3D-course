---
titre: WebXR et animation procédurale
cours: 20-webgpu-3d
notions:
  - "WebXR Device API (navigator.xr, isSessionSupported, requestSession)"
  - "modes de session immersive-vr / immersive-ar"
  - "requiredFeatures / optionalFeatures et reference spaces (local, local-floor, viewer)"
  - "rendu stéréo (deux vues, une par œil) géré par le runtime"
  - "Three.js WebXR : renderer.xr.enabled, VRButton, ARButton, setAnimationLoop"
  - "controllers XR (getController, events select/squeeze) et grab d'objets"
  - "hit-test AR (requestHitTestSource, getHitTestResults) et réticule de placement"
  - "animation procédurale : easing, spring dynamics, path following"
outcomes:
  - sait détecter le support WebXR et démarrer une session VR/AR avec les bons features
  - sait activer le mode XR dans un renderer Three.js et ajouter un VRButton/ARButton
  - sait lire un controller XR (getController, select) et attraper un objet dans la scène
  - sait implémenter le hit-test AR avec un réticule qui suit les surfaces réelles
  - sait animer sans keyframes avec easing, ressort (spring) et suivi de chemin
prerequis:
  - "13-threejs-fondamentaux (Scene, Camera, WebGLRenderer, Mesh, setAnimationLoop, OrbitControls)"
  - "14-materiaux-et-lumieres-threejs (materials, lights)"
  - "15-modeles-et-animations (glTF, AnimationMixer)"
  - "20-physique-et-interactions (raycasting, Raycaster)"
next: 26-audio-3d-spatial
libs: ["three"]
tribuzen: "expérience immersive TribuZen — visiter le globe des sorties de la famille en VR (VRButton) et animation d'accueil procédurale du globe (easing + spring, sans keyframes)"
last-reviewed: 2026-07
---

# WebXR et animation procédurale

> **Outcomes — tu sauras FAIRE :** détecter le support WebXR, démarrer une session VR/AR, activer le mode XR d'un renderer Three.js avec `VRButton`/`ARButton`, lire un controller et attraper un objet, poser un réticule de hit-test AR, et animer sans keyframes (easing, spring, path following).
> **Difficulté :** :star::star::star::star:
>
> **Portée :** deux sujets complémentaires. **WebXR** — faire "sortir" de l'écran une scène Three.js dans un casque VR/AR. **Animation procédurale** — générer du mouvement par le code (fonctions, physique légère) plutôt que par des clips pré-enregistrés (les clips glTF sont au **module 15**). On reste au niveau *intégration* : l'IK avancée (CCD, FABRIK) et les state machines d'animation sont hors portée ici. Version de référence : **Three.js r185** (2026).

## 1. Cas concret d'abord

TribuZen a son **globe interactif des sorties de la famille** (monté au module 13 : `SphereGeometry`, `OrbitControls`, boucle `setAnimationLoop`). Deux demandes produit arrivent :

1. **« On veut pouvoir visiter le globe en VR. »** Le père a un casque Quest ; il veut ouvrir TribuZen dans le navigateur du casque, cliquer un bouton, et se retrouver *à côté* du globe, l'attraper et le tourner à la main.
2. **« L'arrivée sur le globe est trop brutale. »** Aujourd'hui le globe apparaît figé. On veut une **animation d'accueil** : le globe grossit depuis zéro avec un léger rebond élastique, puis tourne doucement — le tout **sans fichier d'animation**, juste du code.

Le premier point est du **WebXR** : la même scène Three.js, rendue en stéréo (une image par œil), avec le casque qui *tracke* la tête et les mains. Bonne nouvelle — Three.js abstrait presque tout :

```typescript
import { VRButton } from 'three/addons/webxr/VRButton.js';

renderer.xr.enabled = true;                              // 1 ligne : active le mode XR
document.body.appendChild(VRButton.createButton(renderer)); // le bouton "Enter VR"
// setAnimationLoop (déjà en place) gère automatiquement le rendu stéréo
```

Le second point est de l'**animation procédurale** : au lieu d'un clip glTF (module 15), on calcule la position/échelle à chaque frame avec une fonction de rebond (spring). Ce module couvre les deux, et les branche sur le globe TribuZen.

---

## 2. Théorie complète, concise

### 2.1 WebXR Device API : le socle bas-niveau

WebXR est l'API standard W3C pour la VR/AR dans le navigateur. Le point d'entrée est **`navigator.xr`** (interface `XRSystem`). Trois modes de session :

- **`immersive-vr`** — réalité virtuelle, l'utilisateur est *dans* la scène.
- **`immersive-ar`** — réalité augmentée, la scène se superpose au monde réel (passthrough).
- **`inline`** — rendu non immersif dans la page (fallback 2D).

On **teste** d'abord le support, puis on **demande** une session :

```typescript
// Détecter le support (ne jamais supposer que WebXR existe)
async function checkXRSupport(): Promise<{ vr: boolean; ar: boolean }> {
  if (!('xr' in navigator)) return { vr: false, ar: false };
  const xr = navigator.xr!;
  const vr = await xr.isSessionSupported('immersive-vr');
  const ar = await xr.isSessionSupported('immersive-ar');
  return { vr, ar };
}

// Démarrer une session VR
const session = await navigator.xr!.requestSession('immersive-vr', {
  requiredFeatures: ['local-floor'],       // échoue si non supporté
  optionalFeatures: ['hand-tracking'],     // continue sans si absent
});
```

**`requiredFeatures` vs `optionalFeatures` :** une feature *requise* absente fait **échouer** `requestSession` ; une feature *optionnelle* absente est simplement ignorée. Mettre en requis uniquement ce sans quoi l'expérience n'a pas de sens.

### 2.2 Reference spaces : où est l'origine du monde ?

Un **reference space** définit le système de coordonnées du tracking. On l'obtient avec `session.requestReferenceSpace(type)` :

| Type | Origine | Usage typique |
|------|---------|---------------|
| `'local'` | position initiale du casque | VR assise, à la position de départ |
| `'local-floor'` | au **sol**, sous le casque | VR debout (le plus courant) |
| `'bounded-floor'` | sol + zone de jeu délimitée | room-scale avec limites |
| `'viewer'` | toujours centré sur le casque | hit-test AR, HUD collé à la tête |

Pour de la VR debout, `'local-floor'` : l'origine `y = 0` est au sol, donc une caméra à `y = 1.6` correspond à la hauteur des yeux d'une personne debout.

### 2.3 Le rendu stéréo, en une phrase

En VR, il faut dessiner **deux images légèrement décalées** (une par œil, séparées de l'IPD ≈ 63 mm) pour créer la profondeur. À chaque frame, `frame.getViewerPose(refSpace)` retourne un `XRViewerPose` dont `pose.views` contient **une `XRView` par œil** (`view.eye` vaut `'left'` ou `'right'`, avec sa `projectionMatrix` et sa `transform`).

> **En Three.js, tu n'écris jamais cette boucle.** Quand `renderer.xr.enabled = true` et qu'une session est active, `renderer.render(scene, camera)` **rend automatiquement les deux vues**. C'est tout l'intérêt d'utiliser le framework : le protocole `XRFrame`/`XRView`/viewport ci-dessus est géré pour toi. Le connaître aide à débugger, pas à coder au quotidien.

### 2.4 Three.js WebXR : le chemin normal

Trois branchements suffisent pour transformer une scène classique en scène VR :

```typescript
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// 1. Activer le mode XR
renderer.xr.enabled = true;

// 2. Ajouter le bouton "Enter VR" (gère isSessionSupported + requestSession)
document.body.appendChild(VRButton.createButton(renderer));

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3); // hauteur des yeux, debout (local-floor)

// 3. setAnimationLoop OBLIGATOIRE en XR (requestAnimationFrame ne suffit pas)
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera); // rend les 2 yeux tout seul en session
});
```

> **Règle d'or XR :** en mode XR, la boucle **doit** être `renderer.setAnimationLoop(...)`, jamais `requestAnimationFrame`. Le runtime XR cadence les frames (72–90 Hz) et `setAnimationLoop` s'y branche ; `requestAnimationFrame` reste sur l'horloge de la page et ne fonctionne pas en session.

Pour l'AR, on remplace `VRButton` par `ARButton` (même API), en déclarant les features AR voulues :

```typescript
import { ARButton } from 'three/addons/webxr/ARButton.js';
document.body.appendChild(ARButton.createButton(renderer, {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay', 'light-estimation'],
}));
```

### 2.5 Les controllers XR

Three.js expose les manettes via `renderer.xr.getController(i)` (i = 0 ou 1). L'objet retourné est un `Object3D` que tu **ajoutes à la scène** ; sa position/orientation suit la manette réelle. Les interactions arrivent en **événements** :

```typescript
const controller = renderer.xr.getController(0);
scene.add(controller);

controller.addEventListener('selectstart', () => { /* gâchette (trigger) enfoncée */ });
controller.addEventListener('selectend',   () => { /* gâchette relâchée */ });
controller.addEventListener('squeezestart',() => { /* grip latéral enfoncé */ });
```

- **`select*`** = gâchette / tap principal (trigger). **`squeeze*`** = poignée latérale (grip).
- Pour afficher un **modèle 3D de la manette**, `renderer.xr.getControllerGrip(i)` + `XRControllerModelFactory` (addon).

Pour **pointer et attraper**, on lance un rayon depuis la manette (comme le `Raycaster` du module 20) et on re-parente l'objet touché sur le controller :

```typescript
const raycaster = new THREE.Raycaster();
controller.addEventListener('selectstart', () => {
  const m = new THREE.Matrix4().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m); // -Z = "devant" la manette
  const hits = raycaster.intersectObjects(grabbables);
  if (hits.length > 0) controller.attach(hits[0].object); // suit la main
});
controller.addEventListener('selectend', () => { /* scene.attach(objet) pour relâcher */ });
```

> `controller.attach(obj)` (et `scene.attach(obj)`) re-parentent **en conservant la position monde** — l'objet ne saute pas. C'est la bonne méthode pour un grab.

### 2.6 Hit-test AR : poser un objet sur une vraie surface

En AR, on veut placer un objet virtuel sur une table réelle. Le **hit-test** projette un rayon depuis le casque/téléphone et renvoie où il rencontre une surface détectée. On crée la source depuis l'espace `'viewer'`, puis on lit les résultats à chaque frame :

```typescript
let hitTestSource: XRHitTestSource | null = null;

renderer.xr.addEventListener('sessionstart', async () => {
  const session = renderer.xr.getSession()!;
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource!({ space: viewerSpace });
});

// Un réticule (anneau) qui se colle à la surface visée
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.05, 0.06, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
reticle.matrixAutoUpdate = false; // on pilote la matrice à la main
reticle.visible = false;
scene.add(reticle);

renderer.setAnimationLoop((_time, frame?: XRFrame) => {
  if (frame && hitTestSource) {
    const refSpace = renderer.xr.getReferenceSpace()!;
    const results = frame.getHitTestResults(hitTestSource);
    if (results.length > 0) {
      const pose = results[0].getPose(refSpace);
      if (pose) {
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix); // colle le réticule à la surface
      }
    } else {
      reticle.visible = false;
    }
  }
  renderer.render(scene, camera);
});
```

Le callback de `setAnimationLoop` reçoit un **2e argument `frame: XRFrame`** en session XR — c'est par lui qu'on accède au hit-test.

### 2.7 Animation procédurale : générer le mouvement par le code

L'animation procédurale calcule pose/position/échelle **par une fonction du temps**, sans clip pré-enregistré. Trois outils suffisent pour l'essentiel.

**a) Easing** — une interpolation non linéaire de `a` vers `b`. On paramètre par `t ∈ [0, 1]` passé dans une **fonction d'easing** :

```typescript
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Fonctions d'easing classiques (t de 0 à 1)
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);        // démarre vite, ralentit
const easeInOutQuad = (t: number) => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
const easeOutBack = (t: number) => {                               // léger dépassement (rebond)
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Usage : animer une échelle de 0 → 1 sur 1 s avec dépassement
const scale = lerp(0, 1, easeOutBack(Math.min(elapsed / 1.0, 1)));
```

**b) Spring dynamics** — au lieu de viser un temps fixe, on simule un **ressort amorti** : la valeur poursuit une cible avec inertie. Idéal pour un mouvement organique qui réagit en continu :

```typescript
class Spring {
  value = 0;
  velocity = 0;
  constructor(public stiffness = 120, public damping = 14) {}
  // dt en secondes, target = valeur visée
  update(target: number, dt: number): number {
    const force = -this.stiffness * (this.value - target); // rappel vers la cible
    const damp = -this.damping * this.velocity;            // frottement
    this.velocity += (force + damp) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}
```

L'équation sous-jacente est `x'' = -k·(x - cible) - d·x'` (k = raideur, d = amortissement). Plus `k` est grand, plus c'est rapide ; plus `d` est petit, plus ça oscille.

**c) Path following** — faire suivre une trajectoire à un objet. Three.js fournit des courbes (`CatmullRomCurve3`, `CubicBezierCurve3`) qui donnent un point pour `t ∈ [0, 1]` via `getPointAt` :

```typescript
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-2, 0, 0),
  new THREE.Vector3(0, 1.5, -1),
  new THREE.Vector3(2, 0, 0),
], true); // true = boucle fermée

// Dans la boucle : t avance avec le temps, l'objet suit la courbe
const t = (elapsed * 0.2) % 1;
avatar.position.copy(curve.getPointAt(t));  // position uniforme le long de la courbe
```

> `getPointAt(t)` (reparamétrée par la longueur d'arc) donne une vitesse **constante** le long de la courbe, contrairement à `getPoint(t)` dont la vitesse varie avec la courbure.

---

## 3. Worked examples

### Exemple 1 — Le globe TribuZen visitable en VR

On part de la scène du module 13 et on la rend visitable en VR : bouton "Enter VR", globe attrapable à la manette. Deux fichiers.

**`index.html`** — canvas + import map (WebXR exige **HTTPS** ; en local, `localhost` est traité comme sécurisé) :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Globe TribuZen — VR</title>
  <style>html, body { margin: 0; height: 100%; overflow: hidden; }</style>
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
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

**`main.ts`** — scène + XR + controller grab :

```typescript
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// --- Renderer + XR ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;                                   // active le mode XR
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));   // bouton "Enter VR"

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1e);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3);                               // hauteur des yeux, debout

// --- Lumières + repères ---
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 2);
scene.add(sun);
scene.add(new THREE.GridHelper(10, 20, 0x444466, 0x222233));  // sol de repère

// --- Le globe des sorties (attrapable) ---
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.6 }),
);
globe.position.set(0, 1.4, -0.6);
scene.add(globe);
const grabbables = [globe];

// --- Controllers ---
const factory = new XRControllerModelFactory();
const raycaster = new THREE.Raycaster();
const grabbed: (THREE.Object3D | null)[] = [null, null];

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  scene.add(controller);

  // modèle 3D de la manette
  const grip = renderer.xr.getControllerGrip(i);
  grip.add(factory.createControllerModel(grip));
  scene.add(grip);

  // rayon de visée (ligne)
  const rayGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2),
  ]);
  controller.add(new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x00ffff })));

  const idx = i;
  controller.addEventListener('selectstart', () => {
    const m = new THREE.Matrix4().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
    const hits = raycaster.intersectObjects(grabbables);
    if (hits.length > 0) {
      grabbed[idx] = hits[0].object;
      controller.attach(grabbed[idx]!);   // suit la main SANS sauter (garde la pos monde)
    }
  });
  controller.addEventListener('selectend', () => {
    if (grabbed[idx]) { scene.attach(grabbed[idx]!); grabbed[idx] = null; }
  });
}

// --- Boucle : setAnimationLoop OBLIGATOIRE en XR ---
renderer.setAnimationLoop(() => {
  if (!grabbed.includes(globe)) globe.rotation.y += 0.005; // tourne quand non tenu
  renderer.render(scene, camera);                          // rend les 2 yeux tout seul
});
```

Sur un casque, cliquer "Enter VR" ⇒ on se retrouve debout devant le globe flottant ; viser avec la manette, presser la gâchette pour l'attraper, le déplacer, relâcher. Hors casque, la scène s'affiche en 2D (le bouton reste grisé si aucun device VR).

### Exemple 2 — Animation d'accueil procédurale du globe (spring, sans keyframes)

La demande produit n°2 : le globe **grossit depuis zéro avec un rebond**, puis se stabilise. Aucun fichier d'animation — un ressort sur l'échelle.

```typescript
import * as THREE from 'three';

// Ressort amorti : la valeur poursuit une cible avec inertie
class Spring {
  value = 0;
  velocity = 0;
  constructor(public stiffness = 140, public damping = 12) {}
  update(target: number, dt: number): number {
    const force = -this.stiffness * (this.value - target);
    const damp  = -this.damping * this.velocity;
    this.velocity += (force + damp) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}

const globe = new THREE.Mesh(
  new THREE.SphereGeometry(0.3, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.6 }),
);
globe.scale.setScalar(0);        // départ : invisible (échelle 0)
scene.add(globe);

const scaleSpring = new Spring(); // damping bas -> léger dépassement (rebond) puis stabilisation
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 30); // borne dt pour éviter l'explosion du ressort

  // Le ressort tire l'échelle vers 1 : passe 0 -> ~1.1 -> 1 (rebond), puis se fige
  const s = scaleSpring.update(1, dt);
  globe.scale.setScalar(s);

  globe.rotation.y += 0.3 * dt;   // rotation d'accueil douce, indépendante du framerate
  renderer.render(scene, camera);
});
```

**Pourquoi un spring plutôt qu'un easing à durée fixe ?** L'easing (`easeOutBack` sur `elapsed / durée`) donne exactement le même rebond mais sur une **durée figée**. Le spring, lui, **réagit en continu** : si demain le produit veut que le globe "resaute" quand une nouvelle sortie est ajoutée, il suffit de changer la cible du ressort (`update(1.15, dt)` puis `update(1, dt)`) — aucune timeline à réécrire. Pour une intro one-shot, l'easing suffit ; pour un état qui bouge, le spring gagne.

**Variante path following** — si l'on veut plutôt qu'un avatar de la famille *tourne autour* du globe pour l'accueil :

```typescript
const orbit = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.6, 1.4, 0), new THREE.Vector3(0, 1.4, -0.6),
  new THREE.Vector3(-0.6, 1.4, 0), new THREE.Vector3(0, 1.4, 0.6),
], true); // boucle fermée

renderer.setAnimationLoop(() => {
  const t = (clock.getElapsedTime() * 0.1) % 1;
  avatar.position.copy(orbit.getPointAt(t)); // vitesse constante le long de l'orbite
  avatar.lookAt(globe.position);
  renderer.render(scene, camera);
});
```

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Utiliser `requestAnimationFrame` en session XR

En mode XR, `requestAnimationFrame` de la fenêtre **ne cadence pas** les frames du casque. La boucle doit être `renderer.setAnimationLoop(cb)` : le runtime XR l'appelle au bon rythme (72–90 Hz) et fournit le `XRFrame` en 2e argument. Symptôme d'un mauvais choix : écran noir ou figé dans le casque alors que la page marche en 2D.

### PIÈGE #2 — Croire qu'il faut coder la boucle stéréo à la main

`frame.getViewerPose`, `pose.views`, les viewports par œil : c'est le protocole **bas-niveau** WebXR. En Three.js, avec `renderer.xr.enabled = true`, `renderer.render(scene, camera)` rend **automatiquement** les deux yeux. Réécrire la boucle stéréo à la main dans un projet Three.js est une perte de temps (et casse le rendu). Le bas-niveau ne sert qu'à comprendre/débugger.

### PIÈGE #3 — WebXR sans HTTPS

L'API WebXR n'est disponible que dans un **contexte sécurisé** : HTTPS en production, `http://localhost` toléré en dev. Servir la page via `file://` ou un `http://` distant ⇒ `navigator.xr` est `undefined` ou `isSessionSupported` renvoie `false`. Toujours tester `'xr' in navigator` avant d'appeler quoi que ce soit.

### PIÈGE #4 — `requiredFeatures` trop gourmand

Mettre `hand-tracking`, `bounded-floor`, `light-estimation` en **requis** fait échouer `requestSession` sur tout device qui n'en a pas un seul. Règle : en `requiredFeatures`, uniquement le strict indispensable (souvent juste `local-floor` en VR, `hit-test` en AR) ; tout le reste en `optionalFeatures` avec un fallback dans le code.

### PIÈGE #5 — Grab qui fait "sauter" l'objet (`add` au lieu de `attach`)

Faire `controller.add(objet)` re-parente en **coordonnées locales** : l'objet saute à la position relative à la manette. Pour attraper un objet **là où il est**, utiliser `controller.attach(objet)` (et `scene.attach(objet)` pour relâcher), qui **préserve la transform monde**. Confondre les deux est le bug de grab n°1.

### PIÈGE #6 — Animation procédurale dépendante du framerate

Écrire `globe.rotation.y += 0.01` par frame lie la vitesse au FPS : rapide à 144 Hz, lent à 30 Hz. En VR c'est pire (72–90 Hz variables). Toujours multiplier par le **delta temps** : `+= vitesse * dt` avec `dt = clock.getDelta()`. Et **borner** `dt` (`Math.min(dt, 1/30)`) : un gros pic de dt (onglet en arrière-plan) fait **exploser** un ressort (velocity qui diverge).

### PIÈGE #7 — `getPoint(t)` vs `getPointAt(t)` sur une courbe

`curve.getPoint(t)` paramètre par le **paramètre de courbe** : la vitesse varie avec la courbure (l'objet accélère dans les virages serrés). `curve.getPointAt(t)` reparamètre par la **longueur d'arc** : vitesse constante. Pour un déplacement régulier le long d'un chemin, c'est `getPointAt` qu'il faut.

---

## 5. Ancrage TribuZen

Ce module ajoute deux couches à l'expérience du **globe des sorties** (module 13).

**Immersion VR (`immersive-vr`).** TribuZen expose une entrée "Visiter en VR" : sur un casque, le membre de la famille se retrouve debout devant le globe, l'attrape à la manette (`getController` + `attach`), le tourne pour explorer les marqueurs de sorties passées. La même scène Three.js sert le web 2D **et** la VR — seul le trio `renderer.xr.enabled` + `VRButton` + `setAnimationLoop` change. Une évolution AR (`ARButton` + hit-test) permettrait de **poser le globe sur la table du salon** lors d'un repas de famille.

**Animation d'accueil procédurale.** À l'ouverture de la vue Globe, une animation d'entrée sans fichier : le globe grossit de 0 à 1 avec un rebond (spring sur l'échelle) puis tourne doucement. Quand une **nouvelle sortie** est ajoutée au feed, un petit "pop" du marqueur correspondant (même `Spring`, cible qui passe de 1 à 1.3 puis revient) attire l'œil — le tout piloté par code, réactif, sans clip à maintenir.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        Globe.ts               ← scène du module 13 (SphereGeometry, marqueurs)
      xr/
        enableVR.ts            ← renderer.xr.enabled + VRButton + getController/attach
        grab.ts                ← raycaster manette + attach/detach
      anim/
        Spring.ts              ← ressort amorti réutilisable (accueil, pop de marqueur)
        easing.ts              ← easeOutBack, easeInOutQuad
      GlobeCanvas.vue          ← monte la scène + branche VR/animation d'accueil
```

> Comme au module 13, le montage Vue impose `renderer.setAnimationLoop(null)` au démontage, et de retirer le `VRButton` du DOM pour éviter les doublons.

---

## 6. Points clés

1. WebXR = API W3C VR/AR du navigateur : `navigator.xr`, `isSessionSupported(mode)`, `requestSession(mode, opts)` ; modes `immersive-vr` / `immersive-ar` / `inline`.
2. `requiredFeatures` (échoue si absent) vs `optionalFeatures` (ignoré si absent) ; reference spaces : `local-floor` pour la VR debout, `viewer` pour le hit-test AR.
3. En Three.js : `renderer.xr.enabled = true` + `VRButton.createButton(renderer)` + `setAnimationLoop` ⇒ rendu stéréo automatique. `ARButton` pour l'AR.
4. `setAnimationLoop` est **obligatoire** en XR (pas `requestAnimationFrame`) ; son callback reçoit `(time, frame: XRFrame)`.
5. Controllers : `renderer.xr.getController(i)` (Object3D à `scene.add`), events `selectstart/selectend`, `squeezestart` ; grab via `Raycaster` + `controller.attach(obj)` (garde la pos monde).
6. Hit-test AR : `requestHitTestSource({ space: viewerSpace })` puis `frame.getHitTestResults(source)` ⇒ coller un réticule à la surface.
7. Animation procédurale : easing (`easeOutBack` = rebond), spring (`x'' = -k(x-cible) - d·x'`, réactif), path following (`curve.getPointAt(t)` = vitesse constante).
8. Toujours animer avec `* dt` (indépendance du framerate) et **borner** `dt` pour ne pas faire diverger un ressort.

---

## 7. Seeds Anki

```
Quelle boucle d'animation faut-il utiliser en session WebXR et pourquoi ?|renderer.setAnimationLoop(cb) — obligatoire en XR. Le runtime du casque cadence les frames (72-90 Hz) et fournit le XRFrame en 2e argument du callback. requestAnimationFrame de la fenêtre ne cadence pas le casque (écran noir/figé).
Quels trois branchements transforment une scène Three.js en scène VR ?|1) renderer.xr.enabled = true ; 2) document.body.appendChild(VRButton.createButton(renderer)) ; 3) la boucle en renderer.setAnimationLoop(...). Ensuite renderer.render(scene, camera) rend automatiquement les deux yeux.
Différence entre requiredFeatures et optionalFeatures dans requestSession ?|Une requiredFeature absente fait ÉCHOUER requestSession ; une optionalFeature absente est simplement ignorée. Ne mettre en requis que l'indispensable (ex: local-floor en VR, hit-test en AR), le reste en optionnel avec fallback.
Quel reference space pour de la VR debout, et pourquoi ?|'local-floor' : l'origine y=0 est au sol sous le casque, donc une caméra à y=1.6 correspond à la hauteur des yeux debout. 'local' met l'origine à la position initiale du casque (VR assise).
Pourquoi utiliser controller.attach(obj) et non controller.add(obj) pour attraper un objet ?|attach() re-parente en conservant la transform MONDE : l'objet ne saute pas, il reste là où on l'a attrapé. add() re-parente en coordonnées locales, l'objet saute à la position relative à la manette. Relâcher = scene.attach(obj).
Comment placer un objet sur une surface réelle en AR (hit-test) ?|requestHitTestSource({ space: viewerSpace }) au sessionstart, puis dans la boucle frame.getHitTestResults(source) ; si un résultat, results[0].getPose(refSpace) donne la matrice de la surface, qu'on applique à un réticule. Le callback setAnimationLoop reçoit frame en 2e argument.
Qu'est-ce qu'un spring dynamics et son équation ?|Un ressort amorti qui fait poursuivre une cible à une valeur avec inertie : x'' = -k·(x - cible) - d·x' (k = raideur, d = amortissement). Réactif (change la cible et ça re-anime) contrairement à un easing à durée fixe. Idéal pour rebond/pop organique.
Différence entre curve.getPoint(t) et curve.getPointAt(t) ?|getPoint(t) paramètre par le paramètre de courbe : la vitesse varie avec la courbure (accélère dans les virages). getPointAt(t) reparamètre par la longueur d'arc : vitesse CONSTANTE le long du chemin. Pour un déplacement régulier, getPointAt.
Pourquoi multiplier une animation procédurale par dt et borner ce dt ?|* dt (delta temps) rend la vitesse indépendante du framerate (sinon rapide à 144 Hz, lent à 30 Hz, instable en VR). Borner dt (Math.min(dt, 1/30)) évite qu'un gros pic (onglet en arrière-plan) fasse diverger/exploser un ressort.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-25-webxr-et-animation-procedurale/README.md`. Au choix : rendre une scène Three.js visitable en VR (`VRButton` + grab au controller), OU coder une animation d'accueil procédurale (spring sur l'échelle du globe) — dans un vrai navigateur, corrigé HTML/TS commenté intégral.
