# Lab 15 — Modèles et animations

> **Outcome :** à la fin, tu sais charger un modèle glTF/GLB **animé** dans le navigateur et jouer une de ses animations en boucle via `AnimationMixer`.
> **Vrai outil :** Three.js (r170+) + Vite dev server, ouvert dans un navigateur réel (WebGL).
> **Feedback :** le coach valide visuellement en session — pas de test-runner auto-correcteur.

---

## Énoncé

Tu construis `MascotteScene`, le socle de la **mascotte d'accueil TribuZen** : un avatar 3D animé qui accueille la famille sur la fiche d'une sortie. Cahier des charges **exact** :

1. Une scène Three.js minimale : renderer, caméra `PerspectiveCamera`, `OrbitControls`, un sol qui reçoit les ombres, un `HemisphereLight` + un `DirectionalLight` avec ombres.
2. Charger un modèle glTF **animé** avec `GLTFLoader.loadAsync` (voir « Où trouver un modèle » ci-dessous).
3. Activer `castShadow`/`receiveShadow` sur chaque mesh du modèle (via `traverse`).
4. Créer **un** `AnimationMixer` attaché à `gltf.scene`.
5. Jouer le **premier clip** de `gltf.animations` en boucle (`LoopRepeat`).
6. Dans la boucle `requestAnimationFrame`, appeler `mixer.update(delta)` avec `delta = clock.getDelta()` (secondes).
7. Logguer dans la console le nombre d'animations et leurs noms.

**Pas de gap-fill** — tu écris le fichier complet à partir du starter minimal.

### Où trouver un modèle glTF animé

Modèles gratuits, prêts à l'emploi (`.glb` avec animations) :

- Three.js fournit des exemples dans `three/examples/models/gltf/` (ex. `Soldier.glb`, `RobotExpressive/RobotExpressive.glb` — plusieurs clips nommés).
- [Mixamo](https://www.mixamo.com/) — personnages + animations, export glTF.
- [Khronos glTF Sample Models](https://github.com/KhronosGroup/glTF-Sample-Models) (ex. `BrainStem`, `CesiumMan` — animés).

Place le fichier dans `public/models/` et référence-le par `/models/<nom>.glb`.

### Starter minimal

Projet Vite avec `three` installé (`npm i three`). Crée `src/main.ts` :

```typescript
// main.ts — starter
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// À toi : renderer, scene, camera, controls, lumières, sol
// À toi : loadAsync du modèle, mixer, clipAction().play(), boucle avec mixer.update(delta)

const clock = new THREE.Clock();
let mixer: THREE.AnimationMixer | null = null;

// ... construis la scène, charge le modèle, lance animate()
```

Lance `npm run dev` et ouvre le navigateur : la mascotte doit **bouger**, pas rester figée.

---

## Étapes (en friction)

1. **Monte la scène** — renderer (`shadowMap.enabled = true`), caméra placée devant le modèle, `OrbitControls` avec `target` à hauteur de poitrine.
2. **Ajoute lumières + sol** — `HemisphereLight` doux, `DirectionalLight` avec `castShadow`, un `PlaneGeometry` `receiveShadow` tourné à plat.
3. **Charge le modèle** — `await new GLTFLoader().loadAsync('/models/<nom>.glb')`, puis `scene.add(gltf.scene)`.
4. **Active les ombres** — `gltf.scene.traverse(...)`, sur chaque `THREE.Mesh` mets `castShadow`/`receiveShadow`.
5. **Logue les animations** — `gltf.animations.length` et chaque `clip.name` + `clip.duration`.
6. **Crée le mixer** — `mixer = new THREE.AnimationMixer(gltf.scene)` (une seule fois).
7. **Joue le clip** — `mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopRepeat, Infinity).play()`.
8. **Branche la boucle** — dans `animate()`, `mixer.update(clock.getDelta())` **avant** `renderer.render`.
9. **Vérifie les cas limites** — retire `mixer.update` → le modèle se fige (piège n°1) ; passe des millisecondes → défilement 1000× trop rapide (piège n°2).

---

## Corrigé complet commenté

```typescript
// main.ts — corrigé
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Renderer ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;                 // active le calcul d'ombres
renderer.shadowMap.type = THREE.PCFSoftShadowMap;  // ombres douces (module 14)
document.body.appendChild(renderer.domElement);

// ─── Scène + caméra ───────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 100,
);
camera.position.set(0, 1.4, 3);                    // devant, à hauteur d'yeux

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;                     // inertie douce
controls.target.set(0, 1, 0);                      // regarde le torse
controls.update();

// ─── Lumières (module 14) ─────────────────────────────────
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0)); // remplissage doux
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 5, 2);
sun.castShadow = true;                             // la source projette des ombres
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

// ─── Sol qui reçoit les ombres ────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x2e2e48, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;                  // à plat
ground.receiveShadow = true;                       // reçoit l'ombre de la mascotte
scene.add(ground);

// ─── Horloge + mixer (créé au chargement, PAS dans la boucle) ───
const clock = new THREE.Clock();
let mixer: THREE.AnimationMixer | null = null;

// ─── Chargement du modèle glTF animé ──────────────────────
async function loadMascotte(): Promise<void> {
  const loader = new GLTFLoader();
  // loadAsync renvoie une Promise<GLTF> ; gltf.scene = Group, gltf.animations = AnimationClip[]
  const gltf = await loader.loadAsync('/models/mascotte.glb');

  // Ombres sur chaque mesh du modèle
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  scene.add(gltf.scene);

  // Inventaire des animations (utile pour choisir le bon clip)
  console.log(`${gltf.animations.length} animation(s) :`);
  gltf.animations.forEach((clip) => {
    console.log(`  - "${clip.name}" (${clip.duration.toFixed(2)} s)`);
  });

  // 1 mixer attaché à la racine du modèle
  mixer = new THREE.AnimationMixer(gltf.scene);

  // Jouer le premier clip en boucle infinie
  if (gltf.animations.length > 0) {
    const action = mixer.clipAction(gltf.animations[0]);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();                                 // active l'action…
  } else {
    console.warn('Ce modèle ne contient aucune animation.');
  }
}

// ─── Boucle de rendu ──────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();                  // SECONDES depuis la frame précédente
  if (mixer) mixer.update(delta);                  // …et c'est ceci qui la fait avancer
  controls.update();
  renderer.render(scene, camera);
}

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadMascotte();
animate();
```

**Pourquoi ce corrigé est correct :**
- Le `mixer` est créé **une seule fois** dans `loadMascotte`, jamais dans `animate` — le recréer par frame réinitialiserait l'animation (piège n°5).
- `mixer.update(clock.getDelta())` reçoit un **delta en secondes** — l'unité qu'attend Three.js. C'est cet appel, pas `action.play()`, qui fait avancer l'animation (pièges n°1, 2, 6).
- `GLTFLoader`/`OrbitControls` sont importés depuis `three/addons/...`, pas depuis le cœur `three` (piège n°3).
- Le sol `receiveShadow` + `DirectionalLight.castShadow` + meshes `castShadow` donnent une ombre portée sous la mascotte (chaîne d'ombres du module 14).

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées.** Reproduis `MascotteScene` **de mémoire, en 30 minutes**, avec :

1. **Deux clips enchaînés** — joue un clip « salut » **une seule fois** (`LoopOnce`, `clampWhenFinished = true`), puis, à l'événement `finished` du mixer, fais un `crossFadeTo` de 0,4 s vers un clip « idle » en boucle. (Si ton modèle n'a qu'un clip, simule en jouant le même clip à deux `timeScale` différents.)
2. **Un slider de vitesse** — un `<input type="range">` HTML qui pilote `action.timeScale` en direct.
3. **Sans rouvrir ce corrigé** ni le module 15.

**Critère de réussite :** la mascotte salue puis passe en idle sans à-coup visible, et le slider change sa vitesse en temps réel.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, la mascotte vit ici :

```
tribuzen/
  public/
    models/mascotte.glb          ← avatar animé (compressé Draco en prod)
    draco/                       ← fichiers du décodeur Draco
  src/
    3d/
      loaders/gltf.ts            ← GLTFLoader + DRACOLoader configurés
      MascotteScene.ts           ← scène + mixer + clips (ce lab)
    components/
      outing/OutingMascotte.vue  ← <canvas> hôte sur la fiche sortie
```

**Différences par rapport au lab :**

- Le modèle sera **compressé Draco** en production (`gltf-transform draco`) → on branche un `DRACOLoader` (`setDecoderPath('/draco/')`) sur le `GLTFLoader`.
- Le chargement se fait dans un **composable** (`useMascotte`) qui expose un état de chargement pour afficher un placeholder pendant le `loadAsync`.
- La boucle `requestAnimationFrame` est **démarrée/arrêtée** au montage/démontage du composant Vue (`onMounted`/`onUnmounted`) pour ne pas fuir de RAF quand on quitte la fiche.

**Commit cible :**
```
feat(outing): mascotte 3D d'accueil — GLTFLoader + AnimationMixer, clip idle en boucle
```
