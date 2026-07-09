# Lab 20 — Physique et interactions

> **Outcome :** à la fin, tu sais **sélectionner un objet 3D au clic** (raycasting) et **faire tomber un objet avec la physique** (Rapier), dans un vrai navigateur.
> **Vrai outil :** Three.js r185 + Rapier (`@dimforge/rapier3d-compat`) dans le navigateur (Chrome/Firefox), via une simple import map — aucun bundler, aucun harnais simulé.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Critères visuels : cliquer un marqueur le met en surbrillance dans la console ; un cube tombe, touche le sol et rebondit.

## Énoncé

Tu ajoutes **l'interactivité** et **la physique** au globe des sorties de TribuZen. Deux objectifs concrets :

1. **Picking** — un globe (`SphereGeometry`) porte trois **marqueurs** de sorties (petites sphères rouges, enfants du globe). Au **clic** sur un marqueur, afficher son `outingId` (console + surbrillance du marqueur). Au **survol**, le curseur devient une main.
2. **Physique** — un **cube badge** tombe depuis le haut, heurte un **sol** et **rebondit**, via Rapier. La position du cube est pilotée par la physique et synchronisée vers le `Mesh`.

Contrainte : le picking passe par un `THREE.Raycaster` avec des NDC calculés depuis `getBoundingClientRect()` ; la physique passe par Rapier (`await RAPIER.init()`, `World`, `RigidBody`, `Collider`, `world.step()`). Aucun calcul de trajectoire à la main.

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement (canvas + import map three ET rapier). Ne rien changer ici :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 20 — Physique et interactions (TribuZen)</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; }
    #app { display: block; width: 100vw; height: 100vh; }
    #hud {
      position: fixed; top: 10px; left: 10px; color: #fff;
      font: bold 14px monospace; background: rgba(0,0,0,.5);
      padding: 6px 10px; border-radius: 4px;
    }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/",
      "@dimforge/rapier3d-compat": "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.17.3/rapier.es.js"
    }
  }
  </script>
</head>
<body>
  <canvas id="app"></canvas>
  <div id="hud">Clique un marqueur…</div>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

**`main.js`** — squelette à COMPLÉTER (les `// TODO` sont à toi) :

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';

const canvas = document.querySelector('#app');
const hud = document.querySelector('#hud');

// Scène de base (fournie)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);
const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 3, 7);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(4, 6, 3); scene.add(sun);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Globe + 3 marqueurs (fournis)
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.6 }),
);
globe.position.set(-2.5, 1.5, 0);
scene.add(globe);
const markers = [];
for (const [id, pos] of [
  ['sortie-1', new THREE.Vector3(0, 1, 0)],
  ['sortie-2', new THREE.Vector3(0.8, 0.3, 0.5)],
  ['sortie-3', new THREE.Vector3(-0.6, -0.4, 0.7)],
]) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff5533 }),
  );
  m.position.copy(pos);
  m.userData.outingId = id;
  globe.add(m);
  markers.push(m);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// TODO 1 : updatePointer(event) — calcule pointer.x / pointer.y en NDC via getBoundingClientRect

// TODO 2 : pointermove -> raycast sur markers -> curseur 'pointer' si hit, sinon 'default'

// TODO 3 : click -> raycast sur markers -> si hit, afficher hits[0].object.userData.outingId
//          dans le HUD et colorer le marqueur touché en jaune

// TODO 4 : init physique — await RAPIER.init() ; world = new World({x:0,y:-9.81,z:0})

// TODO 5 : sol FIXE (RigidBodyDesc.fixed + ColliderDesc.cuboid large et plat) + son Mesh

// TODO 6 : badge DYNAMIQUE qui tombe de y=6 (RigidBodyDesc.dynamic + cuboid restitution 0.6)
//          + son Mesh ; lier body -> mesh dans une Map

// TODO 7 : boucle setAnimationLoop — world.step(), sync body->mesh, controls.update(), render

// TODO 8 : click sur le canvas -> applyImpulse({x:0,y:5,z:0}, true) sur le badge
```

Lancer : n'importe quel serveur statique dans le dossier du lab, par ex.

```bash
npx serve .
# puis ouvrir l'URL affichée (http://localhost:3000)
```

(Un serveur est nécessaire : les modules ES et l'import map ne se chargent pas en `file://`.)

## Étapes (en friction)

Écris le code toi-même avant de regarder le corrigé. Ordre conseillé :

1. **NDC** — `updatePointer(event)` : `rect = renderer.domElement.getBoundingClientRect()`, puis `pointer.x = ((event.clientX - rect.left)/rect.width)*2 - 1` et `pointer.y = -((event.clientY - rect.top)/rect.height)*2 + 1`.
2. **Hover** — sur `pointermove` : `updatePointer`, `raycaster.setFromCamera(pointer, camera)`, `intersectObjects(markers)`, curseur `'pointer'`/`'default'`.
3. **Click** — sur `click` : même raycast ; si `hits.length > 0`, écris `hits[0].object.userData.outingId` dans le HUD et passe le marqueur en jaune (`material.color.set(0xffff00)`).
4. **Init physique** — `await RAPIER.init()` PUIS `new RAPIER.World({ x: 0, y: -9.81, z: 0 })`. (Enveloppe le tout dans une fonction `async main()`.)
5. **Sol** — `world.createRigidBody(RAPIER.RigidBodyDesc.fixed())` + `world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.1, 5).setRestitution(0.3), groundBody)` + un `Mesh` `BoxGeometry(10, 0.2, 10)`.
6. **Badge** — `RigidBodyDesc.dynamic().setTranslation(2.5, 6, 0)` + `ColliderDesc.cuboid(0.5,0.5,0.5).setRestitution(0.6).setFriction(0.4)` + un `Mesh` `BoxGeometry(1,1,1)` ; `bodyToMesh.set(badgeBody, badgeMesh)`.
7. **Boucle** — `setAnimationLoop` : `world.step()`, puis pour chaque `(mesh, body)` copie `body.translation()` -> `mesh.position` et `body.rotation()` -> `mesh.quaternion` ; `controls.update()` ; `render`.
8. **Impulse** — `click` sur le canvas : `badgeBody.applyImpulse({ x: 0, y: 5, z: 0 }, true)`.

Vérifie dans le navigateur. Erreurs à débusquer toi-même : clic sans effet (mauvais Y NDC ? `intersectObjects(markers)` et pas `intersectObject(globe)` ?), `RAPIER.World is not a constructor` (`await RAPIER.init()` oublié ?), badge figé en l'air (synchro physique->mesh absente ?), impulse sans effet (2e argument `true` oublié ?).

## Corrigé complet commenté

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';

const canvas = document.querySelector('#app');
const hud = document.querySelector('#hud');

// ─── Scène de base ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);
const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 3, 7);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(4, 6, 3); scene.add(sun);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ─── Globe + 3 marqueurs (enfants du globe) ───────────────────────
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.6 }),
);
globe.position.set(-2.5, 1.5, 0);
scene.add(globe);

const markers = [];
for (const [id, pos] of [
  ['sortie-1', new THREE.Vector3(0, 1, 0)],
  ['sortie-2', new THREE.Vector3(0.8, 0.3, 0.5)],
  ['sortie-3', new THREE.Vector3(-0.6, -0.4, 0.7)],
]) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff5533 }), // Basic : visible sans lumière
  );
  m.position.copy(pos);
  m.userData.outingId = id;   // donnée métier attachée à l'objet 3D
  globe.add(m);               // enfant du globe -> tourne avec lui
  markers.push(m);
}

// ─── Raycasting (picking) ─────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// TODO 1 — NDC exacts via getBoundingClientRect (canvas pas forcément plein écran)
function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1; // inversion Y
}

// TODO 2 — Hover : curseur "main" au survol d'un marqueur
renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markers);
  renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
});

// TODO 3 — Click : sélectionner le marqueur le plus proche
renderer.domElement.addEventListener('click', (event) => {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markers); // trié par distance croissante
  if (hits.length > 0) {
    const marker = hits[0].object;                  // le plus proche = "devant"
    const id = marker.userData.outingId;
    hud.textContent = `Sortie sélectionnée : ${id}`;
    marker.material.color.set(0xffff00);            // surbrillance
    console.log('Ouvrir la fiche', id);
  }
});

// ─── Physique (Rapier) ────────────────────────────────────────────
async function main() {
  // TODO 4 — init WASM OBLIGATOIRE avec -compat, puis le monde + gravité
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // TODO 5 — Sol FIXE : body immobile + collider large et plat
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(5.0, 0.1, 5.0).setRestitution(0.3),
    groundBody,
  );
  const groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x444455 }),
  );
  scene.add(groundMesh); // fixe en (0,0,0), pas besoin de synchro

  // TODO 6 — Badge DYNAMIQUE : tombe de y=6, rebondit (restitution 0.6)
  const badgeBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(2.5, 6, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setRestitution(0.6).setFriction(0.4),
    badgeBody,
  );
  const badgeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.6, roughness: 0.3 }),
  );
  scene.add(badgeMesh);

  // Lier body -> mesh (seuls les dynamiques bougent)
  const bodyToMesh = new Map();
  bodyToMesh.set(badgeBody, badgeMesh);

  // TODO 8 — Clic = coup vers le haut (impulse ponctuelle, true = réveille le corps)
  renderer.domElement.addEventListener('click', () => {
    badgeBody.applyImpulse({ x: 0, y: 5, z: 0 }, true);
  });

  // TODO 7 — Boucle : step physique PUIS copie physique -> graphique
  renderer.setAnimationLoop(() => {
    world.step(); // avance la simulation d'un tick

    bodyToMesh.forEach((mesh, body) => {
      const t = body.translation();          // { x, y, z }
      const r = body.rotation();             // quaternion { x, y, z, w }
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    });

    controls.update();                       // OBLIGATOIRE avec enableDamping
    renderer.render(scene, camera);
  });
}

main();
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| NDC corrects | `getBoundingClientRect()` + inversion Y (`-...*2+1`) | ☐ |
| Picking click | `setFromCamera` + `intersectObjects(markers)`, `hits[0].object` utilisé | ☐ |
| Hover | curseur `'pointer'` au survol d'un marqueur, `'default'` sinon | ☐ |
| Donnée métier | `userData.outingId` lu et affiché au clic | ☐ |
| Init Rapier | `await RAPIER.init()` AVANT `new World(gravity)` | ☐ |
| Sol / badge | sol `fixed`, badge `dynamic` + colliders `cuboid` (restitution) | ☐ |
| Synchro | `world.step()` puis copie `translation()`/`rotation()` -> mesh | ☐ |
| Impulse | `applyImpulse({...}, true)` au clic, badge sursaute | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Pourquoi calcules-tu les NDC avec `getBoundingClientRect()` et pas `window.innerWidth` ?** (Attendu : si le canvas n'est pas plein écran depuis (0,0) — vrai layout TribuZen —, `innerWidth` fausse la position ; le rect donne l'offset et la taille réels du canvas.)
2. **Pourquoi `intersectObjects(markers)` et pas `intersectObject(globe)` ?** (Attendu : les marqueurs sont des enfants du globe ; `intersectObject(globe)` sans `recursive=true` ne les teste pas et renvoie un tableau vide. Tester directement la liste des marqueurs est plus simple.)
3. **Que se passe-t-il si tu retires `await RAPIER.init()` ?** (Attendu : le WASM n'est pas chargé, `new RAPIER.World(...)` échoue — `is not a constructor`. `-compat` exige cette init asynchrone une fois.)
4. **Pourquoi ne pas déplacer `badgeMesh.position` à la main pour faire monter le badge ?** (Attendu : le corps est `dynamic` ; au prochain `world.step()`, Rapier réécrit la position, ta modif est écrasée. Il faut agir sur le body — `applyImpulse` — pas sur le mesh.)
5. **Différence entre `addForce` et `applyImpulse` ici ?** (Attendu : `applyImpulse` est ponctuel — un coup au clic. `addForce` est continu et devrait être rappelé chaque frame ; un seul appel n'aurait quasi aucun effet.)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **30 minutes chrono**, avec deux contraintes ajoutées :

1. **Drag d'un marqueur non physique** : au lieu du simple clic, permettre de **déplacer un marqueur** à la surface visible en le glissant à la souris (pointerdown = pick, pointermove = repositionner via `raycaster.ray.intersectPlane` sur un plan, pointerup = relâcher). Le marqueur reste un objet Three.js pur (pas de Rapier).
2. **Trois badges au lieu d'un** : spawner **trois** cubes dynamiques à des positions et hauteurs différentes, chacun avec sa propre entrée dans la `Map` body->mesh — vérifier qu'ils tombent, se percutent et s'empilent (collisions entre dynamiques).

Objectif : prouver que le picking (raycast + plan), la boucle de synchro multi-corps et les collisions dynamiques sont acquis sans support.

## Application TribuZen

Ce lab devient deux briques concrètes de `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      interaction/
        pickMarker.ts      ← Raycaster : NDC (getBoundingClientRect) + intersectObjects
        useGlobePicking.ts ← composable Vue : émet select-outing au clic
      physics/
        world.ts           ← await RAPIER.init() + new World(gravity)
        TrophyShelf.ts      ← badge dynamic + sol fixed + sync body -> mesh
    components/
      globe/
        GlobeCanvas.vue    ← écoute select-outing -> ouvre OutingSheet
```

Portage concret :

- extraire le picking en `pickMarker.ts` (retourne l'`outingId` touché ou `null`) et le brancher dans un composable `useGlobePicking` qui **émet** `select-outing` — `GlobeCanvas.vue` écoute et ouvre `OutingSheet.vue` ;
- initialiser le monde physique une seule fois (`await RAPIER.init()`) au montage du composant trophées, et **libérer** au démontage (`world.free()`, `setAnimationLoop(null)`, `dispose()` des géométries/matériaux) ;
- commit `smaurier/tribuzen` : `feat(3d): globe cliquable (raycasting) + badge physique (Rapier)`.
