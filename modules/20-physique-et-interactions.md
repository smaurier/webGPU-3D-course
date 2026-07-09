---
titre: Physique et interactions
cours: 20-webgpu-3d
notions:
  - "raycasting Three.js (Raycaster, setFromCamera, intersectObjects)"
  - "picking d'objets (hover, click, coordonnées NDC)"
  - "moteur physique WASM (Rapier @dimforge/rapier3d-compat)"
  - "World + gravité, RigidBodyDesc (dynamic / fixed / kinematic)"
  - "ColliderDesc (cuboid, ball), restitution, friction"
  - "world.step() et synchronisation physique -> Three.js"
  - "forces vs impulses (addForce, applyImpulse)"
  - "drag interactif (raycast + déplacement d'un objet)"
outcomes:
  - sait lancer un rayon depuis la caméra avec Raycaster.setFromCamera et récupérer l'objet cliqué via intersectObjects
  - sait distinguer hover et click, et convertir des coordonnées souris en NDC [-1, 1]
  - sait initialiser un World Rapier (compat + RAPIER.init) avec gravité et créer rigidbodies + colliders
  - sait synchroniser la position/rotation d'un RigidBody vers un Mesh Three.js à chaque frame
  - sait distinguer une force (continue) d'une impulse (ponctuelle) et les appliquer
  - sait implémenter un drag interactif d'objet à la souris via raycasting
prerequis:
  - "00-prerequis-et-introduction (3D temps réel, pipeline)"
  - "13-threejs-fondamentaux (Scene, Camera, Renderer, Mesh, boucle setAnimationLoop, OrbitControls)"
  - "14-materiaux-et-lumieres-threejs (materials, lights)"
  - "03-cameras-et-projections (view/projection, frustum, NDC)"
next: 21-modelisation-3d-et-geometrie
libs: ["three"]
tribuzen: "globe interactif TribuZen — cliquer un marqueur de sortie sur le globe pour ouvrir sa fiche (raycasting), et un badge/récompense 3D qui tombe avec la physique quand une sortie est validée"
last-reviewed: 2026-07
---

# Physique et interactions

> **Outcomes — tu sauras FAIRE :** lancer un rayon depuis la caméra pour sélectionner un objet 3D (`Raycaster`), distinguer hover et click, intégrer un moteur physique (Rapier) avec gravité/collisions, synchroniser les corps physiques vers les `Mesh` Three.js, appliquer forces et impulses, et déplacer un objet à la souris.
> **Difficulté :** :star::star::star::star:
>
> **Portée :** ce module rend la scène **interactive** (clic/hover/drag via raycasting) et **physique** (gravité, chutes, collisions, rebonds via Rapier). On reste sur l'essentiel : picking, moteur physique de base, forces vs impulses, drag. Les joints, character controllers et le fixed-timestep avancé sont mentionnés mais approfondis en projet final (module 28). Références : **Three.js r185**, **Rapier `@dimforge/rapier3d-compat` (v0.17+, 2026)**.

## 1. Cas concret d'abord

Au module 13, tu as monté le **globe interactif des sorties de la famille** : une `SphereGeometry` orbitable à la souris, avec un petit `Mesh` marqueur par sortie. Il est joli — mais **mort au clic**. Quand l'utilisateur clique un marqueur, rien ne se passe. Or la feature attendue est : **cliquer un marqueur ouvre la fiche de la sortie** (date, lieu, participants).

Problème : un clic souris est une position 2D à l'écran (`clientX`, `clientY`). Comment savoir **quel** objet 3D est sous le curseur, alors que la scène est une projection perspective d'un espace 3D ? Il n'existe aucune propriété « objet sous la souris » toute prête.

La réponse est le **raycasting** : on lance un rayon depuis la caméra à travers le pixel cliqué, et on regarde quel objet il touche en premier.

```typescript
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function onClick(event: MouseEvent): void {
  // 1. Convertir le pixel souris en coordonnées normalisées [-1, 1] (NDC)
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // 2. Configurer le rayon depuis la caméra à travers ce point
  raycaster.setFromCamera(pointer, camera);

  // 3. Tester l'intersection avec les marqueurs de sortie
  const hits = raycaster.intersectObjects(markers);
  if (hits.length > 0) {
    const marker = hits[0].object;   // le plus proche de la caméra
    openOutingSheet(marker.userData.outingId);
  }
}
```

Deuxième besoin du fil rouge : quand une sortie est **validée**, on veut une **récompense 3D** — un badge/trophée qui **tombe** et **rebondit** sur une étagère. Calculer soi-même la gravité, les rebonds et les collisions serait réinventer la mécanique newtonienne. C'est le rôle d'un **moteur physique** (Rapier). Ce module couvre les deux : **rendre la scène cliquable** (raycasting) et **lui donner une physique** (Rapier).

---

## 2. Théorie complète, concise

### 2.1 Le problème du picking : de l'écran vers la 3D

Un clic te donne un pixel 2D. La scène 3D a été **projetée** sur l'écran par la matrice de projection de la caméra (module 03). Le picking consiste à faire le chemin **inverse** : reconstruire, à partir du pixel, le **rayon** qui part de la caméra et traverse la scène, puis trouver le premier objet touché.

Three.js fournit `Raycaster` pour ça. Trois étapes invariables :

1. convertir le pixel souris en **coordonnées normalisées** (NDC) dans `[-1, 1]` ;
2. `raycaster.setFromCamera(pointer, camera)` construit le rayon ;
3. `raycaster.intersectObjects(objets)` retourne les intersections, **triées par distance croissante**.

### 2.2 Coordonnées normalisées (NDC)

Le rayon attend une position en **Normalized Device Coordinates** : `x` et `y` dans `[-1, 1]`, avec l'origine au **centre** du canvas, `y` vers le **haut** (l'inverse de `clientY` qui va vers le bas). D'où la formule :

```typescript
const rect = renderer.domElement.getBoundingClientRect();
pointer.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1; // 0..1 -> -1..1
pointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1; // inversion du sens Y
```

> **Piège classique :** utiliser `event.clientX / window.innerWidth` marche seulement si le canvas occupe tout l'écran **à l'origine (0,0)**. Dès que le canvas est dans un layout (marge, barre latérale TribuZen), il faut passer par `getBoundingClientRect()` pour être exact.

### 2.3 `Raycaster` : setFromCamera et intersectObjects

```typescript
const raycaster = new THREE.Raycaster();

// Construit un rayon partant de la caméra, à travers le point NDC
raycaster.setFromCamera(pointer, camera);

// Intersections avec UN objet (et ses enfants si recursive = true)
const hits1 = raycaster.intersectObject(globe, true);

// Intersections avec une LISTE d'objets
const hits = raycaster.intersectObjects(markers, false);
```

Chaque intersection retournée est un objet avec, notamment :

| Propriété | Type | Contenu |
|-----------|------|---------|
| `distance` | `number` | distance caméra -> point d'impact |
| `point` | `Vector3` | point d'impact en **coordonnées monde** |
| `object` | `Object3D` | l'objet touché (le `Mesh`) |
| `face` | `Face` \| null | la face touchée |
| `uv` | `Vector2` | coordonnées UV au point d'impact (si dispo) |

Le tableau est **trié par `distance` croissante** : `hits[0]` est donc l'objet **le plus proche de la caméra**, c'est-à-dire celui « devant ». Un tableau vide = le rayon n'a rien touché.

> **`recursive`** : par défaut `intersectObject` **ne** descend **pas** dans les enfants. Pour un globe dont les marqueurs sont des enfants (`globe.add(marker)`), soit tu passes `true`, soit tu testes directement le tableau `markers`.

### 2.4 Hover vs click : même rayon, event différent

Le **hover** (survol) et le **click** utilisent exactement le même raycasting ; seul l'événement DOM change :

```typescript
// HOVER : sur mousemove, changer le curseur / surligner
function onPointerMove(event: PointerEvent): void {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markers);
  renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
}

// CLICK : sur click, ouvrir la fiche
function onClick(event: MouseEvent): void {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markers);
  if (hits.length > 0) openOutingSheet(hits[0].object.userData.outingId);
}
```

Pour attacher une donnée métier à un objet 3D, on utilise `mesh.userData` (objet libre attaché à tout `Object3D`) :

```typescript
marker.userData.outingId = 'sortie-42';
```

### 2.5 Pourquoi un moteur physique

Un moteur physique simule gravité, collisions, rebonds, friction et empilement — 60 fois par seconde. Réimplémenter ça à la main est faisable pour une chute simple, mais devient rapidement du calcul de mécanique (détection de collision broad/narrow phase, résolution de contraintes) qu'on ne veut pas maintenir.

En JavaScript, le moteur recommandé en 2026 est **Rapier** (écrit en Rust, compilé en WASM) : rapide, API claire, activement maintenu. L'alternative historique en JS pur est **cannon-es** (fork maintenu de cannon.js), plus légère mais moins performante. On utilise **Rapier**.

```bash
npm install @dimforge/rapier3d-compat
```

> **Deux paquets Rapier :** `@dimforge/rapier3d` (le WASM chargé par le **bundler**, import synchrone) et `@dimforge/rapier3d-compat` (WASM **inliné**, nécessite `await RAPIER.init()`). Le paquet `-compat` est le plus simple à utiliser sans config de bundler (et dans un `<script type="module">`), c'est celui du lab.

### 2.6 Initialiser le monde physique

Rapier `-compat` doit être **initialisé de façon asynchrone** avant tout usage (chargement/compilation du WASM), puis on crée un `World` avec un vecteur de gravité :

```typescript
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init(); // OBLIGATOIRE avec -compat, une seule fois

const gravity = { x: 0.0, y: -9.81, z: 0.0 }; // gravité terrestre (m/s²) vers le bas
const world = new RAPIER.World(gravity);
```

### 2.7 RigidBody : dynamic, fixed, kinematic

Un **RigidBody** est un corps physique. Trois types couvrent l'essentiel :

- **`dynamic`** — subit gravité, forces et collisions (le badge qui tombe, une balle) ;
- **`fixed`** — immobile mais collisionnable (le sol, l'étagère, les murs) ;
- **`kinematic`** — sa position est pilotée par ton code, il pousse les dynamic mais n'est pas poussé (plateforme mobile).

```typescript
// Corps dynamique : un badge qui va tomber depuis (0, 5, 0)
const badgeBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(0.0, 5.0, 0.0);
const badgeBody = world.createRigidBody(badgeBodyDesc);

// Sol fixe
const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0.0, 0.0, 0.0);
const groundBody = world.createRigidBody(groundBodyDesc);
```

Le `RigidBody` n'a **pas de forme** en soi : il porte position, vitesse et masse. La **forme de collision** est le `Collider`.

### 2.8 Collider : forme, restitution, friction

Un `ColliderDesc` décrit la géométrie de collision, attachée à un body. Les primitives (rapides) suffisent la plupart du temps :

```typescript
// Boîte : demi-tailles (0.5 => cube de 1x1x1)
const badgeColliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
  .setRestitution(0.6)   // rebond : 0 = aucun, 1 = rebond parfait
  .setFriction(0.4);     // friction : 0 = glace, 1 = caoutchouc
world.createCollider(badgeColliderDesc, badgeBody); // attaché au body dynamique

// Sol : boîte large et plate
const groundColliderDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0);
world.createCollider(groundColliderDesc, groundBody);
```

Primitives principales : `cuboid(hx, hy, hz)` (demi-tailles), `ball(radius)`, `capsule(halfHeight, radius)`, `cylinder(...)`. **Règle de perf :** privilégier les primitives ; le `trimesh` (collision exacte) est coûteux et réservé au décor fixe.

### 2.9 La boucle : step + synchronisation

À chaque frame, on avance la simulation avec `world.step()`, puis on **copie** la position et la rotation de chaque body vers le `Mesh` Three.js correspondant :

```typescript
const bodyToMesh = new Map<RAPIER.RigidBody, THREE.Mesh>();
bodyToMesh.set(badgeBody, badgeMesh);

renderer.setAnimationLoop(() => {
  world.step(); // avance la physique d'un tick

  // Physique -> graphique : Rapier est la source de vérité
  bodyToMesh.forEach((mesh, body) => {
    const t = body.translation();       // { x, y, z }
    const r = body.rotation();          // quaternion { x, y, z, w }
    mesh.position.set(t.x, t.y, t.z);
    mesh.quaternion.set(r.x, r.y, r.z, r.w);
  });

  renderer.render(scene, camera);
});
```

Le sens du flux est **toujours** physique -> graphique : Rapier calcule, Three.js affiche. On ne modifie **pas** `mesh.position` à la main pour un corps dynamique (ce serait écrasé au step suivant) — on passe par le body.

### 2.10 Forces vs impulses

Deux façons de mettre un corps en mouvement :

| | **Force** (`addForce`) | **Impulse** (`applyImpulse`) |
|---|---|---|
| Application | **continue**, à chaque step | **ponctuelle**, une fois |
| Effet | accélération progressive (`F = m·a`) | change la vitesse instantanément |
| Analogie | un moteur, le vent | un coup de pied, une explosion |

```typescript
// Force continue (à rappeler chaque frame) : une poussée latérale du badge
badgeBody.addForce({ x: 2.0, y: 0.0, z: 0.0 }, true); // true = réveille le corps s'il dort

// Impulse ponctuelle : donner un "coup" vers le haut (un seul appel)
badgeBody.applyImpulse({ x: 0.0, y: 5.0, z: 0.0 }, true);
```

Le second argument `true` **réveille** le corps : Rapier endort les bodies immobiles pour économiser le CPU, il faut les réveiller pour qu'ils réagissent.

### 2.11 Drag interactif : raycasting + déplacement

Le drag combine tout : au `pointerdown` on **picke** l'objet (raycast), puis au `pointermove` on **projette** la souris sur un plan et on y déplace l'objet. Pour un objet **physique**, on le passe temporairement en `kinematic` (piloté par le code) pendant le drag, puis on le repasse `dynamic` au relâchement :

```typescript
// pointerdown : trouver l'objet sous la souris
raycaster.setFromCamera(pointer, camera);
const hits = raycaster.intersectObjects(draggables);
if (hits.length > 0) selected = hits[0].object;

// pointermove : projeter la souris sur un plan horizontal et y placer l'objet
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // plan y = 0
const target = new THREE.Vector3();
raycaster.setFromCamera(pointer, camera);
raycaster.ray.intersectPlane(dragPlane, target); // point d'impact sur le plan
if (selected) selected.position.copy(target);
```

Pour un objet **non physique** (comme repositionner un marqueur sur le globe), on manipule directement `mesh.position` — c'est plus simple et c'est le cas du lab.

---

## 3. Worked examples

### Exemple 1 — Cliquer un marqueur du globe pour ouvrir sa fiche (TribuZen)

On reprend le globe du module 13 et on le rend **cliquable**. Chaque marqueur porte son `outingId` dans `userData`. Au clic, on raycast et on ouvre la fiche du marqueur le plus proche.

```typescript
import * as THREE from 'three';

// ... scene, camera, renderer, globe déjà montés (module 13) ...

// Les marqueurs de sorties (enfants du globe)
const markers: THREE.Mesh[] = [];
function addMarker(outingId: string, position: THREE.Vector3): void {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff5533 }), // Basic : visible sans lumière
  );
  marker.position.copy(position);
  marker.userData.outingId = outingId; // donnée métier attachée à l'objet 3D
  globe.add(marker);                    // enfant du globe -> tourne avec lui
  markers.push(marker);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointer(event: MouseEvent): void {
  // NDC exacts via getBoundingClientRect (le canvas n'est pas plein écran)
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
}

// HOVER : curseur "main" au survol d'un marqueur
renderer.domElement.addEventListener('pointermove', (event) => {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markers);
  renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'default';
});

// CLICK : ouvrir la fiche de la sortie la plus proche
renderer.domElement.addEventListener('click', (event) => {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(markers); // trié par distance
  if (hits.length > 0) {
    const id = hits[0].object.userData.outingId as string;
    openOutingSheet(id); // ouvre le panneau latéral TribuZen
  }
});

function openOutingSheet(outingId: string): void {
  console.log('Ouvrir la fiche de la sortie', outingId);
  // -> dans TribuZen : émet un événement vers le composant Vue (store / emit)
}
```

Ce qui rend la scène vivante : `hits[0]` est **toujours** le marqueur le plus proche de la caméra, donc même si deux marqueurs se chevauchent à l'écran, on ouvre le bon (celui « devant »).

### Exemple 2 — Un badge qui tombe et rebondit (Rapier + Three.js)

La récompense 3D : quand une sortie est validée, un badge tombe depuis le haut et rebondit sur une étagère. Rapier gère la gravité et le rebond ; on synchronise vers le `Mesh`.

```typescript
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

async function main(): Promise<void> {
  // 1. Init WASM Rapier (OBLIGATOIRE avec -compat)
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // 2. Scène Three.js (rappel module 13-14) — supposée montée : scene, camera, renderer
  //    + une lumière (sinon MeshStandardMaterial est noir)

  // 3. Sol FIXE : un body fixed + un collider cuboid large et plat
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(5.0, 0.1, 5.0).setRestitution(0.3),
    groundBody,
  );
  const groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x555566 }),
  );
  scene.add(groundMesh); // fixe : position (0,0,0), pas besoin de sync

  // 4. Badge DYNAMIQUE : tombe depuis y = 5, rebondit (restitution 0.6)
  const badgeBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0),
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

  // 5. Lier body -> mesh pour la synchro (seuls les dynamiques bougent)
  const bodyToMesh = new Map<RAPIER.RigidBody, THREE.Mesh>();
  bodyToMesh.set(badgeBody, badgeMesh);

  // 6. Boucle : step physique PUIS copie physique -> graphique
  renderer.setAnimationLoop(() => {
    world.step(); // avance d'un tick (~1/60 s)

    bodyToMesh.forEach((mesh, body) => {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    });

    renderer.render(scene, camera);
  });

  // 7. Bonus : un "coup" vers le haut au clic (impulse ponctuelle)
  renderer.domElement.addEventListener('click', () => {
    badgeBody.applyImpulse({ x: 0, y: 5, z: 0 }, true); // true = réveille le corps
  });
}

main();
```

Résultat : le badge chute (gravité `y = -9.81`), heurte le sol et rebondit à ~60 % de sa hauteur (restitution `0.6`), le tout sans une ligne de calcul de trajectoire. Le clic lui redonne un coup vers le haut. La **synchro** est le point clé : Rapier calcule, on copie `translation()` et `rotation()` vers le `Mesh`.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Oublier `await RAPIER.init()` avec `-compat`

Avec `@dimforge/rapier3d-compat`, tout usage de `RAPIER.World`, `RigidBodyDesc`, etc. **avant** `await RAPIER.init()` échoue (le WASM n'est pas chargé). Symptôme : `RAPIER.World is not a constructor` ou erreur WASM. Le paquet **non**-compat (`@dimforge/rapier3d`) n'a pas ce besoin mais exige un bundler qui charge le `.wasm`. Retenir : `-compat` = `await RAPIER.init()` une fois au démarrage.

### PIÈGE #2 — NDC calculés avec `innerWidth` alors que le canvas n'est pas plein écran

`pointer.x = event.clientX / window.innerWidth * 2 - 1` ne marche que si le canvas couvre tout l'écran depuis (0,0). Dans un vrai layout (barre latérale, marge), le rayon vise à côté. Toujours calculer les NDC via `renderer.domElement.getBoundingClientRect()` (`clientX - rect.left`, etc.).

### PIÈGE #3 — Oublier d'inverser Y dans les NDC

En espace écran, `clientY` croît vers le **bas** ; en NDC, `y` croît vers le **haut**. Il faut le **signe moins** : `pointer.y = -(...) * 2 + 1`. Sans l'inversion, le picking est correct en X mais inversé verticalement (tu cliques en haut, ça sélectionne en bas).

### PIÈGE #4 — Déplacer `mesh.position` à la main pour un corps dynamique

Pour un `RigidBody` **dynamic**, modifier `mesh.position` directement est inutile : au prochain `world.step()`, Rapier réécrit la position depuis sa simulation, ta modification est **écrasée**. Le flux est physique -> graphique. Pour bouger un corps, agir sur le **body** (`applyImpulse`, `setTranslation`, ou passer en `kinematic`), pas sur le mesh.

### PIÈGE #5 — Confondre force et impulse

Une **force** (`addForce`) est **continue** : appelée une seule fois, elle n'a quasi aucun effet visible ; il faut la rappeler chaque frame. Une **impulse** (`applyImpulse`) est **ponctuelle** : un seul appel change la vitesse instantanément. Pour un saut/coup ponctuel -> impulse. Pour une poussée entretenue (vent, moteur) -> force à chaque step.

### PIÈGE #6 — Corps « endormi » qui ne réagit pas

Rapier **endort** les bodies immobiles pour la performance. Un corps endormi ignore une force/impulse si tu ne le réveilles pas : passer `true` en second argument (`applyImpulse(imp, true)`) réveille le corps. Symptôme : « j'applique une impulse mais rien ne bouge » sur un objet au repos.

### PIÈGE #7 — `intersectObject` sans `recursive` sur une hiérarchie

`raycaster.intersectObject(globe)` (sans `true`) **ne teste pas** les marqueurs enfants du globe : le tableau revient vide alors que tu cliques pile sur un marqueur. Soit passer `intersectObject(globe, true)`, soit tester directement la liste des marqueurs `intersectObjects(markers)`. C'est la cause n°1 d'un « clic qui ne détecte rien ».

---

## 5. Ancrage TribuZen

Ce module rend le **globe des sorties** interactif et introduit la **physique** dans TribuZen — deux features concrètes du fil rouge.

**Le globe cliquable (raycasting).** Chaque marqueur de sortie porte son `outingId` dans `userData`. Au survol, le curseur devient une main (feedback) ; au clic, un `Raycaster` trouve le marqueur le plus proche et ouvre sa **fiche** (date, lieu, photos, participants) dans le panneau latéral. C'est le pont entre la scène 3D et l'UI Vue : le raycast émet un événement métier (`select-outing`) que le composant Vue écoute.

**Le badge/récompense physique (Rapier).** Quand une sortie est validée (ou qu'un défi famille est complété), un **badge 3D** tombe et rebondit dans une petite vitrine de trophées — retour visuel gratifiant, entièrement piloté par Rapier (gravité, restitution). Plus tard, le **drag** permettra de réorganiser ses trophées à la souris.

```
tribuzen/
  src/
    3d/
      three/
        Globe.ts               ← module 13 : sphère + OrbitControls + boucle
      interaction/
        pickMarker.ts          ← Raycaster : NDC + setFromCamera + intersectObjects
        useGlobePicking.ts     ← composable Vue : émet select-outing au clic
      physics/
        world.ts               ← await RAPIER.init() + new World(gravity)
        TrophyShelf.ts         ← badge dynamic + sol fixed + sync body -> mesh
    components/
      globe/
        GlobeCanvas.vue        ← écoute select-outing -> ouvre OutingSheet
        OutingSheet.vue        ← la fiche ouverte au clic
```

> Le picking doit utiliser `getBoundingClientRect()` du canvas (le globe est dans un layout, pas plein écran). Le monde physique s'initialise une fois (`await RAPIER.init()`), au montage du composant qui l'utilise.

---

## 6. Points clés

1. **Picking = raycasting inverse** : pixel -> NDC `[-1,1]` -> `setFromCamera(pointer, camera)` -> `intersectObjects(...)` trié par distance ; `hits[0]` = objet le plus proche.
2. **NDC** : `x = ((clientX - rect.left)/rect.width)*2 - 1`, `y = -(...)*2 + 1` (inversion Y), via `getBoundingClientRect()` du canvas — jamais `innerWidth` si le canvas n'est pas plein écran.
3. **Hover et click** partagent le même rayon ; seul l'event DOM diffère. `mesh.userData` porte la donnée métier (`outingId`).
4. **Rapier `-compat`** exige `await RAPIER.init()` une fois avant tout usage ; `new World(gravity)` crée la simulation.
5. **RigidBody** : `dynamic` (subit la physique), `fixed` (immobile collisionnable), `kinematic` (piloté par le code). Le `Collider` (`cuboid`, `ball`...) porte la forme, `restitution`/`friction` le comportement.
6. **Boucle** : `world.step()` puis copie `body.translation()`/`body.rotation()` vers `mesh.position`/`mesh.quaternion`. Flux **toujours** physique -> graphique.
7. **Force** (`addForce`, continue, chaque frame) vs **impulse** (`applyImpulse`, ponctuelle) ; second argument `true` pour réveiller un corps endormi.
8. **Drag** = raycast au pointerdown + projection sur un plan (`ray.intersectPlane`) au pointermove ; passer un corps physique en `kinematic` pendant le drag.

---

## 7. Seeds Anki

```
Comment convertir une position souris (clientX, clientY) en coordonnées NDC pour un Raycaster ?|Via le rect du canvas : x = ((clientX - rect.left)/rect.width)*2 - 1 ; y = -((clientY - rect.top)/rect.height)*2 + 1. Le signe moins sur y inverse le sens (écran vers le bas, NDC vers le haut). Utiliser getBoundingClientRect(), pas innerWidth, si le canvas n'est pas plein écran.
Quelles sont les 3 étapes du picking d'un objet 3D avec Three.js ?|1) convertir le pixel souris en NDC [-1,1] ; 2) raycaster.setFromCamera(pointer, camera) ; 3) raycaster.intersectObjects(objets), qui retourne les intersections triées par distance croissante — hits[0] est l'objet le plus proche de la caméra.
Que contient un élément du tableau retourné par intersectObjects ?|Un objet avec distance (caméra->impact), point (Vector3 monde), object (l'Object3D touché), face et uv. Le tableau est trié par distance croissante ; un tableau vide = rien touché.
Pourquoi @dimforge/rapier3d-compat exige-t-il await RAPIER.init() ?|Le paquet -compat inline le WASM et doit le charger/compiler de façon asynchrone avant tout usage. Sans await RAPIER.init(), new RAPIER.World(...) échoue. Le paquet non-compat (@dimforge/rapier3d) n'a pas ce besoin mais requiert un bundler qui charge le .wasm.
Quelle est la différence entre RigidBody dynamic, fixed et kinematic dans Rapier ?|dynamic subit gravité, forces et collisions (badge qui tombe). fixed est immobile mais collisionnable (sol, murs). kinematic a sa position pilotée par le code, il pousse les dynamic sans être poussé (plateforme mobile).
Dans une boucle Rapier + Three.js, quel est le sens de la synchronisation et pourquoi ?|Toujours physique -> graphique : world.step() calcule, puis on copie body.translation() et body.rotation() vers mesh.position et mesh.quaternion. Modifier mesh.position à la main sur un corps dynamique est inutile : Rapier l'écrase au step suivant.
Quelle est la différence entre addForce et applyImpulse ?|addForce applique une force CONTINUE (F = m·a) : il faut la rappeler à chaque frame. applyImpulse applique une impulsion PONCTUELLE qui change la vitesse instantanément (un coup, un saut). Le 2e argument true réveille le corps s'il est endormi.
Pourquoi intersectObject(globe) peut-il ne rien détecter alors qu'on clique un marqueur enfant ?|Par défaut intersectObject NE teste PAS les enfants (recursive = false). Un marqueur ajouté via globe.add(marker) est un enfant : il faut intersectObject(globe, true) ou tester directement intersectObjects(markers).
```

---

## Pont vers le lab

> Lab associé : `labs/lab-20-physique-et-interactions/README.md`. Rendre le globe cliquable (raycasting : sélectionner un marqueur au clic) puis faire tomber un badge avec Rapier — dans un vrai navigateur, corrigé HTML/JS commenté intégral.
