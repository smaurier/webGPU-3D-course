# Module 20 — Physique et interactions

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 4/5        | 120 min       | [Lab 20](../labs/lab-20-physique-interactions/) | [Quiz 20](../quizzes/quiz-20-physique-interactions.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Expliquer pourquoi un moteur physique est nécessaire et quelles alternatives existent
- Intégrer Rapier.js (WASM) avec Three.js et synchroniser les transforms
- Créer des rigid bodies dynamiques, kinematiques et fixes
- Choisir et configurer le bon type de collider pour chaque objet
- Appliquer des forces, impulses et velocites aux rigid bodies
- Gérer les collisions avec l'EventQueue et les sensor triggers
- Implementer un raycasting physique pour le picking d'objets
- Configurer des joints pour contraindre les mouvements entre bodies
- Créer un character controller avec detection du sol et gestion des pentes
- Debugger visuellement les colliders avec un wireframe overlay
- Gérer le fixed timestep avec interpolation pour un rendu smooth

---

<details>
<summary>Rappel du cours précédent — Shaders creatifs et procedural (Module 19)</summary>

Au module 19, nous avons explore les shaders proceduraux :

- **Noise functions** : Perlin (gradients interpoles), Simplex (simplexes, O(n²)), Worley (cellulaire)
- **FBM** : empiler des octaves de noise avec lacunarity (freq x2) et gain (amp /2) pour du detail multi-echelle
- **Terrain génération** : vertex displacement avec FBM dans le vertex shader, normales par différences finies
- **Water shader** : Gerstner waves (déplacement horizontal+vertical), Fresnel pour le mix refraction/reflexion
- **Procedural textures** : marble (sinusoide deformee), wood (anneaux + noise), fire (noise anime montant)
- **SDFs** : signed distance functions pour sphere, box, torus + operations booleennes (union, intersection, smooth blend)
- **Ray marching** : avancer le long du rayon par la distance SDF à chaque pas, rendu volumetrique complet
- **Effets stylises** : toon shading (step), outline (Sobel / extrusion), dissolution (discard + edge glow)

Nous allons maintenant ajouter de la physique a nos scenes 3D pour que les objets reagissent de manière realiste.

</details>

---

## Pourquoi un moteur physique ?

:::tip Analogie
Imagine que tu construis un jeu de billard en 3D. Tu pourrais calculer toi-même la trajectoire de chaque boule, les angles de rebond, la friction, le spin... Mais ça revient a reinventer la mecanique newtonienne. Un moteur physique c'est comme engager un physicien qui géré toutes ces equations pour toi — tu lui decris les objets (forme, masse, friction), tu appliques des forces, et il s'occupe du reste 60 fois par seconde.
:::

### Ce qu'un moteur physique géré

```
Sans moteur physique               Avec moteur physique
━━━━━━━━━━━━━━━━━━━━               ━━━━━━━━━━━━━━━━━━━━
Gravity ? Toi.                     world.gravity = {x:0, y:-9.81, z:0}
Collision ? Toi.                   Automatique (broad + narrow phase)
Rebonds ? Toi.                     Restitution coefficient
Friction ? Toi.                    Friction coefficient
Empilement ? Toi.                  Contact solver
Ragdoll ? ... Bonne chance.        Joints + constraints
```

### Comparaison des moteurs physiques JS

| Moteur | Langage | Taille | Performance | 3D | Maintenance |
|--------|---------|--------|-------------|:--:|-------------|
| **Rapier.js** | Rust -> WASM | ~300 KB | Excellente | Oui | Active (2024+) |
| **Cannon-es** | JS pur | ~150 KB | Moyenne | Oui | Fork maintenu |
| **Ammo.js** | C++ -> WASM (Bullet) | ~500 KB | Bonne | Oui | Stable mais lourd |
| **Havok** | C++ -> WASM | ~400 KB | Excellente | Oui | Babylon.js oriented |
| **Matter.js** | JS pur | ~80 KB | Bonne | 2D seulement | Active |

Nous utilisons **Rapier.js** : moderne, rapide (Rust compile en WASM), API claire, bien documente.

---

## Installation et initialisation

```typescript
// Installation
// pnpm add @dimforge/rapier3d-compat

import RAPIER from '@dimforge/rapier3d-compat';

// IMPORTANT: Rapier WASM doit etre initialise avant utilisation
async function initPhysics(): Promise<RAPIER.World> {
  await RAPIER.init(); // Charge et compile le module WASM

  // Creer le monde physique avec la gravite terrestre
  const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
  const world = new RAPIER.World(gravity);

  return world;
}
```

### Architecture d'intégration Three.js + Rapier

```
┌──────────────────────────────────────────────────┐
│                    Game Loop                      │
│                                                   │
│  1. Input handling (clavier, souris)              │
│  2. world.step()          ← Rapier simule 1 tick │
│  3. Sync transforms       ← Copier Rapier → Three│
│  4. renderer.render()     ← Three.js dessine     │
│                                                   │
│  ┌─────────────┐          ┌──────────────┐       │
│  │  Rapier      │  sync   │  Three.js     │       │
│  │  RigidBody   │ ──────► │  Mesh         │       │
│  │  position    │         │  position     │       │
│  │  rotation    │         │  quaternion   │       │
│  │  Collider    │         │  geometry     │       │
│  └─────────────┘          └──────────────┘       │
└──────────────────────────────────────────────────┘
```

```typescript
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// Map pour lier chaque rigidBody a son mesh Three.js
const bodyMeshMap = new Map<RAPIER.RigidBody, THREE.Mesh>();

// Synchroniser les positions Rapier -> Three.js
function syncPhysicsToGraphics(): void {
  bodyMeshMap.forEach((mesh, body) => {
    const pos = body.translation();
    const rot = body.rotation();

    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  });
}
```

---

## Rigid bodies

### Les 3 types de rigid body

```typescript
// 1. DYNAMIC — affecte par les forces, la gravite, les collisions
// Usage : balles, cubes qui tombent, vehicules
const dynamicBodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(0.0, 5.0, 0.0)    // Position initiale
  .setLinvel(0.0, 0.0, 0.0)          // Velocite lineaire initiale
  .setAngvel(0.0, 0.0, 0.0);         // Velocite angulaire initiale

const dynamicBody = world.createRigidBody(dynamicBodyDesc);

// 2. KINEMATIC (position-based) — on controle sa position, il pousse les dynamic
// Usage : plateformes mobiles, portes, ascenseurs
const kinematicBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
  .setTranslation(0.0, 0.0, 0.0);

const kinematicBody = world.createRigidBody(kinematicBodyDesc);

// Deplacer un kinematic body (chaque frame)
kinematicBody.setNextKinematicTranslation(
  new RAPIER.Vector3(Math.sin(time) * 3.0, 0.5, 0.0)
);

// 3. FIXED — ne bouge jamais, participe aux collisions
// Usage : sol, murs, decor statique
const fixedBodyDesc = RAPIER.RigidBodyDesc.fixed()
  .setTranslation(0.0, 0.0, 0.0);

const fixedBody = world.createRigidBody(fixedBodyDesc);
```

### Proprietes du rigid body

```typescript
// Damping — resistance au mouvement (comme la friction de l'air)
dynamicBodyDesc
  .setLinearDamping(0.5)   // Ralentissement lineaire
  .setAngularDamping(1.0); // Ralentissement de la rotation

// CCD (Continuous Collision Detection) — pour les objets rapides
// Empeche les balles de traverser les murs fins
dynamicBodyDesc.setCcdEnabled(true);

// Verrouiller certains axes
dynamicBody.setEnabledRotations(true, false, true, true);
// Permet X et Z, bloque Y → l'objet ne tourne pas sur l'axe Y

dynamicBody.setEnabledTranslations(true, true, false, true);
// Bloque le deplacement en Z (utile pour du 2.5D)
```

---

## Colliders

### Types de colliders

```
┌─────────────────────────────────────────────────────────────┐
│  Primitives (rapides)                                       │
│                                                              │
│  ● Ball         ■ Cuboid       ▬ Capsule     ▭ Cylinder    │
│  sdSphere       sdBox          sdCapsule     sdCylinder    │
│  Balles, fruits Caisses, murs  Personnages   Piliers       │
│                                                              │
│  Meshes (couteux)                                           │
│                                                              │
│  △ Trimesh      ◇ ConvexHull   ◆ HeightField               │
│  Collision       Enveloppe      Terrain                      │
│  exacte avec     convexe        optimise pour                │
│  le mesh         (simplifie)    les heightmaps               │
│                                                              │
│  Regle : primitives > convexHull > trimesh                  │
│  (du plus rapide au plus lent)                               │
└─────────────────────────────────────────────────────────────┘
```

```typescript
// Ball — sphere simple
const ballCollider = RAPIER.ColliderDesc.ball(0.5) // rayon = 0.5
  .setRestitution(0.7)   // Rebond (0 = pas de rebond, 1 = rebond parfait)
  .setFriction(0.3)      // Friction (0 = glace, 1 = caoutchouc)
  .setDensity(1.0);      // Densite (affecte la masse)

world.createCollider(ballCollider, dynamicBody);

// Cuboid — boite
const boxCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5) // demi-tailles
  .setRestitution(0.3)
  .setFriction(0.8);

world.createCollider(boxCollider, dynamicBody);

// Capsule — cylindre avec demi-spheres aux extremites
const capsuleCollider = RAPIER.ColliderDesc.capsule(
  0.5,   // demi-hauteur du cylindre central
  0.3    // rayon des demi-spheres
);

world.createCollider(capsuleCollider, characterBody);

// Trimesh — collision exacte avec un mesh 3D (FIXE uniquement !)
function createTrimeshCollider(
  geometry: THREE.BufferGeometry,
  body: RAPIER.RigidBody
): RAPIER.Collider {
  const vertices = new Float32Array(
    geometry.getAttribute('position').array
  );
  const indices = new Uint32Array(geometry.index!.array);

  const trimeshDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
  return world.createCollider(trimeshDesc, body);
}

// ConvexHull — enveloppe convexe calculee a partir des vertices
function createConvexHullCollider(
  geometry: THREE.BufferGeometry,
  body: RAPIER.RigidBody
): RAPIER.Collider | null {
  const vertices = new Float32Array(
    geometry.getAttribute('position').array
  );

  const hullDesc = RAPIER.ColliderDesc.convexHull(vertices);
  if (!hullDesc) return null; // Echec si trop peu de points

  return world.createCollider(hullDesc, body);
}

// HeightField — terrain optimise
function createHeightFieldCollider(
  heights: Float32Array,  // Grille de hauteurs
  rows: number,
  cols: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number
): RAPIER.Collider {
  const heightFieldDesc = RAPIER.ColliderDesc.heightfield(
    rows, cols, heights,
    new RAPIER.Vector3(scaleX, scaleY, scaleZ)
  );

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  return world.createCollider(heightFieldDesc, groundBody);
}
```

### Collider offset et rotation

```typescript
// Decaler un collider par rapport a son rigid body
const colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.1, 0.3)
  .setTranslation(0.0, 0.5, 0.0)  // Decale de 0.5 vers le haut
  .setRotation({                    // Rotation locale
    x: 0.0,
    y: 0.0,
    z: Math.sin(Math.PI / 8),      // Quaternion
    w: Math.cos(Math.PI / 8),
  });

// Un rigid body peut avoir PLUSIEURS colliders
// Exemple : un personnage = capsule (corps) + sphere (tete)
const bodyCollider = RAPIER.ColliderDesc.capsule(0.5, 0.3);
world.createCollider(bodyCollider, characterBody);

const headCollider = RAPIER.ColliderDesc.ball(0.25)
  .setTranslation(0.0, 1.0, 0.0);
world.createCollider(headCollider, characterBody);
```

---

## Forces, impulses et velocity

### La différence force vs impulse

```
Force (continue)                    Impulse (instantanee)
━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━━━━━━━
Appliquee a chaque step             Appliquee une seule fois
F = m * a                          Change la velocite directement
Le moteur, la gravite               Un coup de pied, une explosion
Plus physiquement realiste           Plus simple a doser

body.addForce(force, true)          body.applyImpulse(impulse, true)
```

```typescript
// Forces — appliquees continuellement (dans le game loop)
function applyThrust(body: RAPIER.RigidBody, direction: RAPIER.Vector3): void {
  const force = new RAPIER.Vector3(
    direction.x * 10.0,
    direction.y * 10.0,
    direction.z * 10.0
  );
  body.addForce(force, true); // true = reveiller le body s'il dort
}

// Impulse — ponctuelle (a un evenement)
function jump(body: RAPIER.RigidBody): void {
  const impulse = new RAPIER.Vector3(0.0, 5.0, 0.0);
  body.applyImpulse(impulse, true);
}

// Torque — rotation continue
function spin(body: RAPIER.RigidBody): void {
  const torque = new RAPIER.Vector3(0.0, 2.0, 0.0); // Tourne sur Y
  body.addTorque(torque, true);
}

// Impulse en un point specifique (cree aussi une rotation)
function hitAt(body: RAPIER.RigidBody, point: RAPIER.Vector3): void {
  const impulse = new RAPIER.Vector3(0.0, 3.0, 5.0);
  body.applyImpulseAtPoint(impulse, point, true);
  // L'objet va se deplacer ET tourner selon le bras de levier
}

// Velocity directe — court-circuiter la physique
function setVelocity(body: RAPIER.RigidBody): void {
  body.setLinvel(new RAPIER.Vector3(0.0, 10.0, 0.0), true);
  body.setAngvel(new RAPIER.Vector3(0.0, 5.0, 0.0), true);
}
```

### Gravity scale et masse

```typescript
// Modifier la gravite pour un body specifique
body.setGravityScale(0.0, true);   // 0 = zero-G (espace)
body.setGravityScale(0.5, true);   // Demi-gravite (lune)
body.setGravityScale(-1.0, true);  // Gravite inversee (flotte vers le haut)

// La masse est calculee automatiquement a partir de la densite et du volume du collider
// Pour forcer une masse specifique :
const colliderDesc = RAPIER.ColliderDesc.ball(0.5)
  .setMass(10.0);  // 10 kg

// Ou modifier apres creation
const collider = world.createCollider(colliderDesc, body);
collider.setMass(5.0);
```

---

## Collision events

### EventQueue

```typescript
const eventQueue = new RAPIER.EventQueue(true); // true = auto-drain

// A chaque step, passer l'event queue
world.step(eventQueue);

// Lire les events de collision
eventQueue.drainCollisionEvents(
  (handle1: RAPIER.ColliderHandle, handle2: RAPIER.ColliderHandle, started: boolean) => {
    const collider1 = world.getCollider(handle1);
    const collider2 = world.getCollider(handle2);

    if (started) {
      console.log('Collision START entre', handle1, 'et', handle2);
      // Jouer un son, appliquer des degats, etc.
    } else {
      console.log('Collision END entre', handle1, 'et', handle2);
    }
  }
);

// Lire les events de contact force (pour detecter la force d'impact)
eventQueue.drainContactForceEvents((event: RAPIER.TempContactForceEvent) => {
  const maxForce = event.maxForceMagnitude();
  if (maxForce > 50.0) {
    console.log('Impact violent !', maxForce);
    // Declencher une explosion, casser l'objet, etc.
  }
});
```

### Configurer les events sur les colliders

```typescript
// Par defaut, les collisions ne generent PAS d'events (pour la performance)
// Il faut les activer explicitement :

const colliderDesc = RAPIER.ColliderDesc.ball(0.5)
  .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  // Alternatives :
  // RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS — pour les forces d'impact
  // RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS

// Sensors — colliders qui detectent la presence sans bloquer
// Comme une zone de trigger dans un jeu
const sensorDesc = RAPIER.ColliderDesc.cuboid(2.0, 2.0, 2.0)
  .setSensor(true)  // Ne bloque pas le mouvement
  .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

// Exemple : zone de checkpoint
const checkpointBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
  .setTranslation(10.0, 1.0, 0.0));
world.createCollider(sensorDesc, checkpointBody);
```

### Collision groups et filtres

```typescript
// Les collision groups permettent de definir QUI collide avec QUI
// Format : 32 bits = 16 bits membership | 16 bits filter

// Groupes :
// Bit 0 = joueur
// Bit 1 = ennemis
// Bit 2 = projectiles
// Bit 3 = terrain

const PLAYER      = 0x0001;
const ENEMIES     = 0x0002;
const PROJECTILES = 0x0004;
const TERRAIN     = 0x0008;

// Le joueur collide avec les ennemis et le terrain (pas ses propres projectiles)
const playerCollider = RAPIER.ColliderDesc.capsule(0.5, 0.3)
  .setCollisionGroups(
    (PLAYER << 16) |       // Je suis dans le groupe PLAYER
    (ENEMIES | TERRAIN)    // Je collide avec ENEMIES et TERRAIN
  );

// Les projectiles du joueur collident avec les ennemis et le terrain
const bulletCollider = RAPIER.ColliderDesc.ball(0.1)
  .setCollisionGroups(
    (PROJECTILES << 16) |
    (ENEMIES | TERRAIN)
  );

// Les ennemis collident avec tout
const enemyCollider = RAPIER.ColliderDesc.capsule(0.5, 0.3)
  .setCollisionGroups(
    (ENEMIES << 16) |
    (PLAYER | PROJECTILES | TERRAIN)
  );
```

---

## Raycasting physique

### world.castRay() pour le picking

```typescript
// Raycasting depuis la camera (click souris -> objet 3D)
function pickObject(
  camera: THREE.PerspectiveCamera,
  mouse: THREE.Vector2,  // Coordonnees normalisees [-1, 1]
  world: RAPIER.World
): RAPIER.Collider | null {
  // Convertir le clic souris en rayon 3D
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const origin = raycaster.ray.origin;
  const direction = raycaster.ray.direction;

  // Creer le rayon Rapier
  const ray = new RAPIER.Ray(
    new RAPIER.Vector3(origin.x, origin.y, origin.z),
    new RAPIER.Vector3(direction.x, direction.y, direction.z)
  );

  // Lancer le rayon dans le monde physique
  const maxDistance = 100.0;
  const solid = true; // true = detecter aussi l'interieur des objets

  const hit = world.castRay(ray, maxDistance, solid);

  if (hit) {
    const collider = hit.collider;
    const hitPoint = ray.pointAt(hit.timeOfImpact);
    console.log('Touche:', collider.handle, 'a la distance', hit.timeOfImpact);
    console.log('Point d\'impact:', hitPoint.x, hitPoint.y, hitPoint.z);
    return collider;
  }

  return null;
}

// Raycast avec filtre
function castRayFiltered(
  world: RAPIER.World,
  origin: RAPIER.Vector3,
  direction: RAPIER.Vector3,
  excludeBody: RAPIER.RigidBody
): RAPIER.RayColliderHit | null {
  const ray = new RAPIER.Ray(origin, direction);

  return world.castRay(
    ray,
    100.0,  // maxToi
    true,   // solid
    undefined, // flags
    undefined, // groups
    undefined, // excludeCollider
    excludeBody // excludeRigidBody — ignorer ce body
  );
}
```

### Shape casting (sweep test)

```typescript
// Shape cast — projeter une FORME (pas juste un point) dans une direction
// Utile pour : "est-ce que mon personnage peut avancer sans collision ?"

function shapeCast(
  world: RAPIER.World,
  position: RAPIER.Vector3,
  direction: RAPIER.Vector3
): RAPIER.ShapeColliderTOI | null {
  const shape = new RAPIER.Ball(0.3); // Forme a projeter
  const rotation = { x: 0, y: 0, z: 0, w: 1 }; // Pas de rotation

  return world.castShape(
    position,
    rotation,
    direction,
    shape,
    10.0,    // maxToi
    true,    // stopAtPenetration
  );
}
```

---

## Joints et contraintes

### Types de joints

```
RevoluteJoint              PrismaticJoint           FixedJoint
(charniere)                (piston)                 (soude)

   ○──────●                ●═══════●═══►            ●━━━━━━●
   │      │                glisse sur un axe         aucun mouvement
   tourne sur un axe                                 relatif

BallJoint                  SphericalJoint           RopeJoint
(rotule)                   (= ball joint)           (corde)

   ○                       Identique au ball        ●
    \                      joint, 3 DOF rotation     │
     ●                                               │
   libre en rotation                                 ● max distance
```

```typescript
// RevoluteJoint — rotation autour d'un axe (porte, roue)
function createHinge(
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody
): RAPIER.ImpulseJoint {
  const params = RAPIER.JointData.revolute(
    new RAPIER.Vector3(0.0, 0.0, 0.5),   // Ancrage sur bodyA (local)
    new RAPIER.Vector3(0.0, 0.0, -0.5),  // Ancrage sur bodyB (local)
    new RAPIER.Vector3(0.0, 1.0, 0.0)    // Axe de rotation (Y)
  );

  // Limiter l'angle de rotation
  params.limitsEnabled = true;
  params.limits = [-Math.PI / 4, Math.PI / 4]; // ±45 degres

  return world.createImpulseJoint(params, bodyA, bodyB, true);
}

// PrismaticJoint — deplacement le long d'un axe (piston, tiroir)
function createSlider(
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody
): RAPIER.ImpulseJoint {
  const params = RAPIER.JointData.prismatic(
    new RAPIER.Vector3(0.0, 0.0, 0.0),   // Ancrage A
    new RAPIER.Vector3(0.0, 0.0, 0.0),   // Ancrage B
    new RAPIER.Vector3(0.0, 1.0, 0.0)    // Axe de deplacement (Y)
  );

  params.limitsEnabled = true;
  params.limits = [0.0, 2.0]; // Deplacement entre 0 et 2 unites

  return world.createImpulseJoint(params, bodyA, bodyB, true);
}

// FixedJoint — soude deux bodies ensemble (debris, objets composites)
function weldBodies(
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody
): RAPIER.ImpulseJoint {
  const params = RAPIER.JointData.fixed(
    new RAPIER.Vector3(0.5, 0.0, 0.0),     // Ancrage A
    { x: 0, y: 0, z: 0, w: 1 },            // Rotation A
    new RAPIER.Vector3(-0.5, 0.0, 0.0),    // Ancrage B
    { x: 0, y: 0, z: 0, w: 1 }             // Rotation B
  );

  return world.createImpulseJoint(params, bodyA, bodyB, true);
}

// BallJoint — rotule libre en rotation (epaule, pendule)
function createBallJoint(
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody
): RAPIER.ImpulseJoint {
  const params = RAPIER.JointData.spherical(
    new RAPIER.Vector3(0.0, -0.5, 0.0),  // Ancrage A
    new RAPIER.Vector3(0.0, 0.5, 0.0)    // Ancrage B
  );

  return world.createImpulseJoint(params, bodyA, bodyB, true);
}
```

### Chaine de joints (corde, pendule, ragdoll)

```typescript
// Creer une chaine de bodies relies par des ball joints
function createChain(
  world: RAPIER.World,
  scene: THREE.Scene,
  startPos: THREE.Vector3,
  links: number,
  linkLength: number
): { bodies: RAPIER.RigidBody[]; meshes: THREE.Mesh[] } {
  const bodies: RAPIER.RigidBody[] = [];
  const meshes: THREE.Mesh[] = [];

  const geo = new THREE.CapsuleGeometry(0.05, linkLength * 0.8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x886644 });

  for (let i = 0; i < links; i++) {
    // Premier maillon fixe (attache au plafond)
    const bodyType = i === 0
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic()
          .setLinearDamping(0.5)
          .setAngularDamping(1.0);

    const body = world.createRigidBody(
      bodyType.setTranslation(
        startPos.x,
        startPos.y - i * linkLength,
        startPos.z
      )
    );

    const collider = RAPIER.ColliderDesc.capsule(linkLength * 0.4, 0.05)
      .setDensity(2.0);
    world.createCollider(collider, body);

    // Relier au maillon precedent
    if (i > 0) {
      const params = RAPIER.JointData.spherical(
        new RAPIER.Vector3(0.0, -linkLength * 0.5, 0.0), // Bas du parent
        new RAPIER.Vector3(0.0, linkLength * 0.5, 0.0)   // Haut de l'enfant
      );
      world.createImpulseJoint(params, bodies[i - 1], body, true);
    }

    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    bodies.push(body);
    meshes.push(mesh);
  }

  return { bodies, meshes };
}
```

---

## Character controller

### KinematicCharacterController

```typescript
// Le character controller gere :
// - Detection du sol (isGrounded)
// - Gestion des pentes (max slope angle)
// - Marches d'escalier (step height)
// - Glissement le long des murs

function createCharacterController(world: RAPIER.World): {
  controller: RAPIER.KinematicCharacterController;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
} {
  // Le controller
  const controller = world.createCharacterController(
    0.01 // offset — petit espace entre le collider et les surfaces
  );

  // Configuration
  controller.setMaxSlopeClimbAngle(45 * Math.PI / 180);  // Max 45 degres
  controller.setMinSlopeSlideAngle(30 * Math.PI / 180);  // Glisse a partir de 30 degres
  controller.enableAutostep(0.3, 0.2, true);
  // maxHeight=0.3, minWidth=0.2, includeDynamic=true
  // Permet de monter des marches de 30cm

  controller.enableSnapToGround(0.3);
  // "Coller" au sol en descente (evite de "voler" dans les pentes)

  // Le body du personnage (kinematic position-based)
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0.0, 2.0, 0.0)
  );

  // Capsule comme collider (forme classique de personnage)
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.5, 0.3), // demi-hauteur=0.5, rayon=0.3
    body
  );

  return { controller, body, collider };
}

// Boucle de mouvement du personnage
function updateCharacter(
  controller: RAPIER.KinematicCharacterController,
  body: RAPIER.RigidBody,
  collider: RAPIER.Collider,
  world: RAPIER.World,
  input: { forward: boolean; back: boolean; left: boolean; right: boolean; jump: boolean },
  deltaTime: number,
  yVelocity: { value: number }
): void {
  // Detection du sol
  const isGrounded = controller.computedGrounded();

  // Mouvement horizontal (input)
  const speed = 5.0;
  const moveDir = new THREE.Vector3();
  if (input.forward) moveDir.z -= 1;
  if (input.back)    moveDir.z += 1;
  if (input.left)    moveDir.x -= 1;
  if (input.right)   moveDir.x += 1;
  moveDir.normalize().multiplyScalar(speed * deltaTime);

  // Gravite et saut
  if (isGrounded) {
    yVelocity.value = 0;
    if (input.jump) {
      yVelocity.value = 7.0; // Vitesse de saut initiale
    }
  } else {
    yVelocity.value -= 9.81 * deltaTime; // Gravite
  }

  // Vecteur de deplacement total
  const movement = new RAPIER.Vector3(
    moveDir.x,
    yVelocity.value * deltaTime,
    moveDir.z
  );

  // Le controller calcule le mouvement valide (gere les collisions)
  controller.computeColliderMovement(
    collider,
    movement,
    undefined, // filterFlags
    undefined  // filterGroups
  );

  // Appliquer le mouvement corrige
  const correctedMovement = controller.computedMovement();
  const currentPos = body.translation();
  body.setNextKinematicTranslation(new RAPIER.Vector3(
    currentPos.x + correctedMovement.x,
    currentPos.y + correctedMovement.y,
    currentPos.z + correctedMovement.z
  ));
}
```

---

## Debug renderer

### Wireframe des colliders

```typescript
// Afficher les colliders en wireframe pour le debug
class PhysicsDebugRenderer {
  private mesh: THREE.LineSegments;
  private world: RAPIER.World;

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.world = world;

    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      depthTest: false,    // Toujours visible
      transparent: true,
      opacity: 0.5,
    });

    this.mesh = new THREE.LineSegments(geo, mat);
    this.mesh.renderOrder = 999; // Dessiner par-dessus tout
    scene.add(this.mesh);
  }

  update(): void {
    // Rapier genere les vertices des wireframes
    const buffers = this.world.debugRender();

    // buffers.vertices : Float32Array de positions (x,y,z par paire de points)
    // buffers.colors : Float32Array de couleurs RGBA

    this.mesh.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(buffers.vertices, 3)
    );

    this.mesh.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(buffers.colors, 4)
    );

    // Activer les vertex colors
    (this.mesh.material as THREE.LineBasicMaterial).vertexColors = true;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }
}

// Utilisation
const debugRenderer = new PhysicsDebugRenderer(world, scene);

function animate() {
  world.step();
  debugRenderer.update(); // Mettre a jour chaque frame
  renderer.render(scene, camera);
}
```

---

## Fixed timestep et interpolation

### Pourquoi un timestep fixe ?

```
Timestep variable (MAUVAIS)          Fixed timestep (BON)
━━━━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━━━
world.step(deltaTime)                world.step(1/60)

16ms, 18ms, 33ms, 14ms...           16.67ms, 16.67ms, 16.67ms...
Physique non-deterministe            Physique deterministe
Explosions a bas FPS                 Stable quel que soit le FPS
Objets traversent les murs           Resultats reproductibles
```

```typescript
class PhysicsLoop {
  private world: RAPIER.World;
  private accumulator: number = 0;
  private readonly fixedDt: number = 1 / 60; // 60 Hz physique
  private previousPositions: Map<RAPIER.RigidBody, THREE.Vector3> = new Map();
  private previousRotations: Map<RAPIER.RigidBody, THREE.Quaternion> = new Map();

  constructor(world: RAPIER.World) {
    this.world = world;
  }

  update(deltaTime: number, bodyMeshMap: Map<RAPIER.RigidBody, THREE.Mesh>): void {
    // Clamper deltaTime pour eviter la spirale de la mort
    const dt = Math.min(deltaTime, 0.1); // Max 100ms (10 FPS minimum)

    this.accumulator += dt;

    // Sauvegarder les positions AVANT les steps physiques
    bodyMeshMap.forEach((_mesh, body) => {
      const pos = body.translation();
      const rot = body.rotation();
      this.previousPositions.set(body,
        new THREE.Vector3(pos.x, pos.y, pos.z));
      this.previousRotations.set(body,
        new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w));
    });

    // Executer autant de steps physiques que necessaire
    while (this.accumulator >= this.fixedDt) {
      this.world.step();
      this.accumulator -= this.fixedDt;
    }

    // Interpolation pour le rendu smooth
    // alpha = fraction du step restante
    const alpha = this.accumulator / this.fixedDt;

    bodyMeshMap.forEach((mesh, body) => {
      const currentPos = body.translation();
      const currentRot = body.rotation();
      const prevPos = this.previousPositions.get(body);
      const prevRot = this.previousRotations.get(body);

      if (prevPos && prevRot) {
        // Interpoler entre la position precedente et la position courante
        mesh.position.lerpVectors(
          prevPos,
          new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z),
          alpha
        );

        mesh.quaternion.slerpQuaternions(
          prevRot,
          new THREE.Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w),
          alpha
        );
      }
    });
  }
}
```

---

## Performance

### Broad phase et narrow phase

```
Pipeline de detection de collision
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. BROAD PHASE (rapide, approximatif)
   ┌──────────────────────────────────────┐
   │  AABB tree (Bounding Volume Hierarchy)│
   │                                       │
   │  Chaque objet = boite englobante     │
   │  Seules les boites qui se chevauchent│
   │  passent a la phase suivante          │
   │                                       │
   │  1000 objets → ~50 paires candidates │
   └──────────────────────────────────────┘
                     │
                     ▼
2. NARROW PHASE (precis, couteux)
   ┌──────────────────────────────────────┐
   │  GJK (Gilbert-Johnson-Keerthi)       │
   │  → Detecte SI deux formes collident  │
   │                                       │
   │  EPA (Expanding Polytope Algorithm)   │
   │  → Calcule la profondeur et la       │
   │    normale de penetration             │
   │                                       │
   │  ~50 paires → ~12 collisions reelles │
   └──────────────────────────────────────┘
                     │
                     ▼
3. CONTACT SOLVER
   ┌──────────────────────────────────────┐
   │  Resoudre les contraintes            │
   │  Appliquer les forces de reponse     │
   │  Integrer les velocites              │
   └──────────────────────────────────────┘
```

### Conseils de performance

```typescript
// 1. Utiliser des primitives simples (pas des trimeshes partout)
// MAUVAIS: trimesh pour chaque objet
// BON: cuboid/ball/capsule pour les objets dynamiques, trimesh pour le decor fixe

// 2. Endormir les objets inactifs (automatique dans Rapier)
// Les bodies qui ne bougent plus sont "endormis" et ne consomment plus de CPU
// body.isSleeping() → true si endormi
// body.wakeUp() → forcer le reveil

// 3. Simplifier les colliders
// Un personnage n'a pas besoin d'un trimesh de 5000 triangles
// Une capsule suffit largement

// 4. Collision groups pour limiter les paires testees
// Si 2 groupes ne peuvent jamais interagir, ne pas les tester

// 5. Limiter le nombre de bodies dynamiques
// < 500 dynamic bodies = fluide
// 500-2000 = correct avec optimisations
// > 2000 = il faut repenser l'architecture

// 6. Supprimer les bodies hors scene
function cleanupFarBodies(
  world: RAPIER.World,
  bodyMeshMap: Map<RAPIER.RigidBody, THREE.Mesh>,
  scene: THREE.Scene,
  maxDistance: number
): void {
  bodyMeshMap.forEach((mesh, body) => {
    const pos = body.translation();
    if (Math.abs(pos.y) > maxDistance || Math.abs(pos.x) > maxDistance) {
      world.removeRigidBody(body);
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      bodyMeshMap.delete(body);
    }
  });
}
```

---

## Pratique

### Exercice PH.1 — Scene interactive avec physique

Creez une scene Three.js ou :
1. Des cubes tombent du ciel a intervalle regulier
2. Un sol et des murs empechent les objets de sortir
3. Le joueur peut cliquer pour lancer une boule qui propulse les cubes
4. Un compteur affiche le nombre de cubes dans la scene

```typescript
// TODO: Initialiser Rapier + Three.js
// TODO: Creer le sol (fixed) et les murs
// TODO: Spawn de cubes dynamiques toutes les 500ms
// TODO: Raycasting + impulse sur clic souris
// TODO: Synchroniser physique -> graphique chaque frame
// TODO: Cleanup des objets tombes trop bas
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';

async function main() {
  // ─── Rapier init ─────────────────────────────────────
  await RAPIER.init();
  const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
  const eventQueue = new RAPIER.EventQueue(true);

  // ─── Three.js init ───────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222233);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 8, 12);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);

  // Lumieres
  scene.add(new THREE.AmbientLight(0x404060, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  scene.add(sun);

  // ─── Map body -> mesh ────────────────────────────────
  const bodyMeshMap = new Map<RAPIER.RigidBody, THREE.Mesh>();

  // ─── Sol ─────────────────────────────────────────────
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(5.0, 0.1, 5.0)
      .setRestitution(0.3).setFriction(0.8),
    floorBody
  );
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x666666 })
  );
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);
  bodyMeshMap.set(floorBody, floorMesh);

  // ─── Murs (4 cotes) ─────────────────────────────────
  const wallPositions = [
    { pos: [0, 2, -5], size: [5, 2, 0.1] },
    { pos: [0, 2, 5],  size: [5, 2, 0.1] },
    { pos: [-5, 2, 0], size: [0.1, 2, 5] },
    { pos: [5, 2, 0],  size: [0.1, 2, 5] },
  ];

  for (const wall of wallPositions) {
    const [px, py, pz] = wall.pos;
    const [sx, sy, sz] = wall.size;

    const wallBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(px, py, pz)
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx, sy, sz).setRestitution(0.5),
      wallBody
    );

    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2),
      new THREE.MeshStandardMaterial({ color: 0x444455, transparent: true, opacity: 0.3 })
    );
    wallMesh.position.set(px, py, pz);
    scene.add(wallMesh);
  }

  // ─── Spawn de cubes ──────────────────────────────────
  const cubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];
  let cubeCount = 0;

  function spawnCube(): void {
    const x = (Math.random() - 0.5) * 6;
    const z = (Math.random() - 0.5) * 6;
    const color = colors[Math.floor(Math.random() * colors.length)];

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 8 + Math.random() * 3, z)
        .setAngvel(new RAPIER.Vector3(
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        ))
    );

    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.3, 0.3, 0.3)
        .setRestitution(0.4)
        .setFriction(0.6)
        .setDensity(1.0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );

    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(cubeGeo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    bodyMeshMap.set(body, mesh);
    cubeCount++;
    updateCounter();
  }

  // Spawn toutes les 500ms
  setInterval(spawnCube, 500);

  // ─── Compteur UI ─────────────────────────────────────
  const counterDiv = document.createElement('div');
  counterDiv.style.cssText =
    'position:fixed;top:10px;left:10px;color:white;font:bold 18px monospace;' +
    'background:rgba(0,0,0,0.5);padding:8px 12px;border-radius:4px;';
  document.body.appendChild(counterDiv);

  function updateCounter(): void {
    counterDiv.textContent = `Cubes: ${cubeCount}`;
  }

  // ─── Clic = lancer une boule ─────────────────────────
  const mouse = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  renderer.domElement.addEventListener('click', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;

    // Creer une boule a la position de la camera
    const ballBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setCcdEnabled(true) // Empecher de traverser les objets
    );

    world.createCollider(
      RAPIER.ColliderDesc.ball(0.2)
        .setRestitution(0.8)
        .setDensity(5.0),
      ballBody
    );

    // Lancer dans la direction du clic
    const launchSpeed = 20.0;
    ballBody.setLinvel(new RAPIER.Vector3(
      dir.x * launchSpeed,
      dir.y * launchSpeed,
      dir.z * launchSpeed
    ), true);

    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0x553300 })
    );
    ballMesh.castShadow = true;
    scene.add(ballMesh);
    bodyMeshMap.set(ballBody, ballMesh);
  });

  // ─── Cleanup des objets tombes ───────────────────────
  function cleanup(): void {
    const toRemove: RAPIER.RigidBody[] = [];

    bodyMeshMap.forEach((mesh, body) => {
      const pos = body.translation();
      if (pos.y < -20) {
        toRemove.push(body);
      }
    });

    for (const body of toRemove) {
      const mesh = bodyMeshMap.get(body)!;
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      world.removeRigidBody(body);
      bodyMeshMap.delete(body);
      cubeCount--;
    }

    if (toRemove.length > 0) updateCounter();
  }

  // ─── Game loop ───────────────────────────────────────
  const clock = new THREE.Clock();
  let accumulator = 0;
  const fixedDt = 1 / 60;

  function animate(): void {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    accumulator += dt;

    while (accumulator >= fixedDt) {
      world.step(eventQueue);
      accumulator -= fixedDt;
    }

    // Sync physique -> graphique
    bodyMeshMap.forEach((mesh, body) => {
      const pos = body.translation();
      const rot = body.rotation();
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    });

    cleanup();
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // ─── Resize ──────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

main();
```
</details>

---

## Résumé

| Concept | API Rapier | Description |
|---------|-----------|-------------|
| **World** | `new RAPIER.World(gravity)` | Conteneur de toute la simulation |
| **Dynamic body** | `RigidBodyDesc.dynamic()` | Affecte par les forces et collisions |
| **Kinematic body** | `RigidBodyDesc.kinematicPositionBased()` | Position controlee manuellement, pousse les dynamic |
| **Fixed body** | `RigidBodyDesc.fixed()` | Immobile, participe aux collisions |
| **Ball collider** | `ColliderDesc.ball(radius)` | Sphere de collision |
| **Cuboid collider** | `ColliderDesc.cuboid(hx, hy, hz)` | Boite de collision (demi-tailles) |
| **Capsule collider** | `ColliderDesc.capsule(halfH, radius)` | Cylindre + demi-spheres |
| **Trimesh** | `ColliderDesc.trimesh(v, i)` | Mesh exact (FIXE uniquement) |
| **ConvexHull** | `ColliderDesc.convexHull(v)` | Enveloppe convexe simplifiee |
| **Force** | `body.addForce(f, true)` | Force continue (chaque frame) |
| **Impulse** | `body.applyImpulse(i, true)` | Impulsion ponctuelle |
| **Raycast** | `world.castRay(ray, max, solid)` | Lancer de rayon physique |
| **Joint** | `world.createImpulseJoint(data, a, b)` | Contrainte entre 2 bodies |
| **CharController** | `world.createCharacterController(offset)` | Mouvement de personnage |
| **EventQueue** | `eventQueue.drainCollisionEvents(cb)` | Detection d'events de collision |
| **Debug** | `world.debugRender()` | Wireframe de tous les colliders |

| Collider | Performance | Precision | Usage recommande |
|----------|-------------|-----------|-----------------|
| **Ball** | Excellent | Approximatif | Balles, fruits, particules |
| **Cuboid** | Excellent | Approximatif | Caisses, murs, blocs |
| **Capsule** | Excellent | Bon | Personnages, projectiles |
| **ConvexHull** | Bon | Bon | Vehicules, objets complexes convexes |
| **Trimesh** | Couteux | Exact | Terrain, decor fixe uniquement |
| **HeightField** | Bon | Exact | Terrain procedural |

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [19 - Shaders creatifs](./19-shaders-creatifs.md) | [21 - Projet final](./21-projet-final.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 20 physique](../screencasts/screencast-20-physique.md)
2. **Lab** : [lab-20-physique](../labs/lab-20-physique/README)
3. **Quiz** : [quiz 20 physique](../quizzes/quiz-20-physique.html)
:::
