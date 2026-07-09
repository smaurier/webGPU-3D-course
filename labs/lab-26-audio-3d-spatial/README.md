# Lab 26 — Audio 3D spatial

> **Outcome :** à la fin, tu sais attacher un **son 3D positionnel** à un objet d'une scène Three.js (r185) — spatialisé, atténué par la distance, orienté par la caméra — qui tourne dans un vrai navigateur.
> **Vrai outil :** Three.js r185 (`AudioListener` + `PositionalAudio` + `AudioLoader`) dans le navigateur, via une import map — aucun bundler, aucun harnais simulé.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Le critère est **auditif** (casque conseillé) : le son vient de l'objet, baisse quand on s'éloigne, se réoriente à la souris ; et **comportemental** : rien ne sort avant le clic « Entrer ».

## Énoncé

Tu poses la couche **présence sonore** de TribuZen : sur la carte 3D d'une sortie, un **feu de camp** émet un son qui vient **de sa position**. Objectif — une sphère/cône « feu » posé à `(-3, 0.4, 0)`, un son en boucle **attaché** à cet objet, **atténué par la distance** (on tourne autour avec `OrbitControls` et on entend le volume changer), **démarré uniquement au clic** sur un bouton « Entrer » (autoplay policy).

Contraintes :
- le son doit être **enfant de l'objet** (`campfire.add(sound)`), pas de la scène ;
- l'`AudioListener` doit être **sur la caméra** (synchro automatique) ;
- aucun `PannerNode` câblé à la main — tout passe par l'API Three.js `PositionalAudio`.

Version de référence : **Three.js r185**. Il te faut un fichier son en boucle (`campfire.ogg` ou n'importe quel `.ogg`/`.mp3` court) placé à côté des fichiers.

### Starter (à créer, deux fichiers + un son)

**`index.html`** — fourni intégralement (canvas + import map + bouton « Entrer »). Ne rien changer ici :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 26 — Audio 3D spatial (TribuZen)</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; }
    #app { display: block; width: 100vw; height: 100vh; }
    #enter {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      padding: 18px 36px; font-size: 22px; cursor: pointer;
      background: #ff6600; color: #fff; border: none; border-radius: 8px;
    }
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
  <button id="enter">Entrer dans la scène</button>
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

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11131f);

const camera = new THREE.PerspectiveCamera(70, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 2, 8);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// L'objet source : le feu de camp
const campfire = new THREE.Mesh(
  new THREE.ConeGeometry(0.3, 0.8, 12),
  new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff6600, emissiveIntensity: 2 }),
);
campfire.position.set(-3, 0.4, 0);
scene.add(campfire);

// TODO 1 : créer un THREE.AudioListener et l'ajouter à la CAMÉRA

// TODO 2 : créer un THREE.PositionalAudio(listener)

// TODO 3 : charger le son avec THREE.AudioLoader().load('./campfire.ogg', onLoad)
//          dans onLoad : setBuffer, setRefDistance(2), setRolloffFactor(1.5), setLoop(true)
//          (NE PAS appeler play() ici si le contexte est encore suspended — voir TODO 5)

// TODO 4 : attacher le son à l'OBJET (campfire.add(sound)), pas à la scène

// TODO 5 : au clic sur #enter -> await listener.context.resume(), retirer le bouton, puis sound.play()

// TODO 6 : boucle setAnimationLoop -> controls.update() + renderer.render(scene, camera)
//          (le listener suit la caméra tout seul : aucune synchro manuelle)
```

Lancer : n'importe quel serveur statique dans le dossier du lab, par ex.

```bash
npx serve .
# puis ouvrir l'URL affichée (http://localhost:3000)
```

(Un serveur est nécessaire : les modules ES, l'import map et `fetch` du son ne fonctionnent pas en `file://`. **Casque conseillé** pour bien percevoir la spatialisation.)

## Étapes (en friction)

Écris le code toi-même avant de regarder le corrigé. Ordre conseillé :

1. **Listener sur la caméra** — `new THREE.AudioListener()` puis `camera.add(listener)`. C'est lui qui rend la synchro automatique.
2. **Son positionnel** — `new THREE.PositionalAudio(listener)`.
3. **Chargement** — `new THREE.AudioLoader().load('./campfire.ogg', (buffer) => { ... })` ; dans le callback : `setBuffer`, `setRefDistance(2)`, `setRolloffFactor(1.5)`, `setLoop(true)`.
4. **Attacher à l'objet** — `campfire.add(sound)` (surtout **pas** `scene.add(sound)`).
5. **Autoplay** — au clic sur `#enter` : `await listener.context.resume()`, cache/retire le bouton, puis `sound.play()`. Gère le cas où le buffer n'est pas encore chargé (drapeau ou `play()` dans le `onLoad` après resume).
6. **Boucle** — `renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); })`.

Vérifie dans le navigateur (casque) : avant le clic, **silence** ; après, le feu crépite **depuis la gauche** (x=−3). En orbitant, le son **se réoriente** et **baisse** quand tu t'éloignes. Erreurs à débusquer toi-même : muet après clic (`resume()` manquant ? `play()` avant chargement ?), son « à plat » non spatialisé (son attaché à la scène et non à l'objet, ou listener pas sur la caméra), volume constant (`refDistance` trop grand).

## Corrigé complet commenté

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11131f);

const camera = new THREE.PerspectiveCamera(70, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 2, 8);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Objet source : le feu de camp, posé à gauche
const campfire = new THREE.Mesh(
  new THREE.ConeGeometry(0.3, 0.8, 12),
  new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff6600, emissiveIntensity: 2 }),
);
campfire.position.set(-3, 0.4, 0);
scene.add(campfire);

// 1. Listener sur la CAMÉRA : suit sa position ET son orientation, sans synchro manuelle.
//    (Sous le capot, c'est l'AudioListener de la Web Audio API synchronisé chaque frame.)
const listener = new THREE.AudioListener();
camera.add(listener);

// 2. Son 3D positionnel rattaché à ce listener
const sound = new THREE.PositionalAudio(listener);

// 3. Chargement asynchrone du buffer. On mémorise "prêt" pour ne pas jouer trop tôt.
let ready = false;
new THREE.AudioLoader().load('./campfire.ogg', (buffer) => {
  sound.setBuffer(buffer);
  sound.setRefDistance(2);     // volume de référence à 2 unités ; au-delà, ça baisse
  sound.setRolloffFactor(1.5); // décroissance assez marquée : un feu s'entend de près
  sound.setDistanceModel('inverse'); // loi d'atténuation naturelle (défaut, explicité ici)
  sound.setLoop(true);
  sound.setVolume(0.9);
  ready = true;
  // Si l'utilisateur a déjà cliqué "Entrer" avant la fin du chargement, on démarre maintenant.
  if (started) sound.play();
});

// 4. ATTACHER le son à l'OBJET (pas à la scène) : il suit la position du feu dans le graphe.
campfire.add(sound);

// 5. Autoplay policy : l'AudioContext démarre 'suspended'. On le réveille au clic (geste user).
let started = false;
const enterBtn = document.querySelector('#enter');
enterBtn.addEventListener('click', async () => {
  await listener.context.resume(); // DOIT venir d'un geste utilisateur
  started = true;
  enterBtn.remove();
  if (ready) sound.play(); // si le buffer est déjà chargé, on joue ; sinon le onLoad s'en charge
});

// 6. Boucle : le listener suit la caméra tout seul -> aucune synchro audio manuelle.
renderer.setAnimationLoop(() => {
  controls.update();              // OBLIGATOIRE avec enableDamping
  renderer.render(scene, camera);
});
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Listener sur la caméra | `new THREE.AudioListener()` + `camera.add(listener)` | ☐ |
| Son positionnel | `new THREE.PositionalAudio(listener)` (pas `THREE.Audio`) | ☐ |
| Attaché à l'objet | `campfire.add(sound)` — **pas** `scene.add(sound)` | ☐ |
| Chargement | `AudioLoader().load(...)` + `setBuffer` dans le callback | ☐ |
| Atténuation par distance | `setRefDistance` + `setRolloffFactor` réglés, volume varie en orbitant | ☐ |
| Autoplay géré | `listener.context.resume()` sur le clic, silence avant | ☐ |
| Pas de course | `play()` correct que le buffer charge avant ou après le clic | ☐ |
| Spatialisation audible | le son vient bien de la gauche (x=−3), se réoriente à la souris | ☐ |
| Zéro PannerNode manuel | tout passe par l'API Three.js `PositionalAudio` | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Pourquoi l'`AudioListener` va-t-il sur la caméra et pas sur la scène ou un objet ?** (Attendu : le listener = les « oreilles » ; il doit suivre le point de vue de l'utilisateur, donc la caméra. `camera.add(listener)` synchronise position ET orientation automatiquement chaque frame, ce qui fait varier le rendu spatial quand on orbite.)
2. **Que se passe-t-il si tu fais `scene.add(sound)` au lieu de `campfire.add(sound)` ?** (Attendu : le son ne suit plus l'objet s'il bouge et sa position dans le graphe est mal placée ; la spatialisation ne correspond plus au feu. Le son doit être enfant de l'objet dont il émane.)
3. **Pourquoi rien ne sort tant qu'on n'a pas cliqué « Entrer » ?** (Attendu : autoplay policy — l'`AudioContext` démarre à l'état `'suspended'` ; il faut `resume()` depuis un geste utilisateur. `listener.context` est ce contexte.)
4. **Quel est le rôle exact de `setRefDistance` et `setRolloffFactor` ?** (Attendu : `refDistance` = distance de volume de référence, en deçà pas d'atténuation ; `rolloffFactor` = vitesse de décroissance au-delà. Plus `rolloffFactor` est grand, plus le son est « local ».)
5. **En Three.js, sous quel objet Web Audio brut se cache `PositionalAudio` ? Et `THREE.AudioListener` ?** (Attendu : `PositionalAudio` enveloppe un `PannerNode` ; `THREE.AudioListener` enveloppe l'`AudioListener` de la Web Audio API, accessible via `listener.context.listener`.)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **25 minutes chrono**, avec deux contraintes ajoutées :

1. **Deuxième source, directionnelle** : ajouter un **haut-parleur** (`BoxGeometry`) à `(6, 1, -2)` avec un `PositionalAudio` **directionnel** — `setDirectionalCone(60, 120, 0.05)` — qui pointe vers `-Z`. Vérifier qu'en passant devant vs derrière le haut-parleur, le volume change nettement.
2. **Occlusion au clavier** : ajouter un `BiquadFilterNode` lowpass sur le son du feu via `sound.setFilter(...)`, et une touche (ex. `o`) qui bascule `frequency` entre `22050` (ouvert) et `350` (occulté) avec `linearRampToValueAtTime(..., ctx.currentTime + 0.4)`. Le feu doit s'**étouffer** progressivement.

Objectif : prouver que cône directionnel, filtre d'occlusion et rampes sur l'horloge audio sont acquis sans support.

## Application TribuZen

Ce lab devient la couche **présence sonore** de la carte des sorties dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      audio/
        createListener.ts   ← new THREE.AudioListener() + camera.add(listener) + resume() au clic
        SpatialSound.ts      ← PositionalAudio + AudioLoader + refDistance/rolloff (corrigé de ce lab)
        occlusion.ts         ← BiquadFilterNode lowpass + setOccluded(bool) (variante J+30)
      points-of-interest/
        Campfire.ts          ← Mesh + SpatialSound omnidirectionnel
      SceneCanvas.vue        ← bouton "Entrer" -> listener.context.resume()
```

Portage concret :

- extraire le corrigé en `createListener.ts` (listener + gestion de l'autoplay) et `SpatialSound.ts` (charge un buffer, règle l'atténuation, renvoie un `PositionalAudio` prêt à attacher) ;
- attacher un `SpatialSound` à chaque point d'intérêt de la sortie (feu, rivière, place) via `poi.add(sound)` ;
- **libérer au démontage** dans `SceneCanvas.vue` : `onUnmounted(() => { sound.stop(); sound.disconnect(); })`, sinon fuite de nœuds audio ;
- commit `smaurier/tribuzen` : `feat(3d): ambiance sonore spatialisée des points d'intérêt d'une sortie`.
```
