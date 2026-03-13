# Module 26 — WebXR et animation procedurale

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 4/5        | 150 min       | [Lab 26](../labs/lab-26-webxr-animation/) | [Quiz 26](../quizzes/quiz-26-webxr-animation.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Utiliser l'API WebXR Device pour detecter les capacites XR du navigateur
- Creer une XRSession (immersive-vr ou immersive-ar) et gerer le cycle de vie
- Comprendre XRReferenceSpace, XRFrame, XRView et XRViewerPose
- Implementer le rendu stereo (deux cameras, per-eye frustum, IPD)
- Decrire le foveated rendering et son impact sur les performances
- Gerer les controllers XR (XRInputSource, gamepad, hand tracking)
- Integrer WebXR avec Three.js (renderer.xr, VRButton, ARButton)
- Implementer le hit testing AR et l'estimation de lumiere
- Comprendre les contraintes de performance VR (72-90 FPS, reprojection)
- Implementer l'Inverse Kinematics avec CCD et FABRIK
- Creer un cycle de marche procedural avec des fonctions sinusoidales
- Appliquer des spring dynamics pour le mouvement secondaire (cheveux, capes)
- Construire un blend tree et une state machine d'animation
- Utiliser le CCDIKSolver de Three.js pour l'IK en temps reel

---

<details>
<summary>Rappel du cours precedent — Rendu volumetrique (Module 25)</summary>

Au module 25, nous avons explore le rendu de volumes :

- **Milieux participatifs** : absorption (sigma_a), scattering (sigma_s), extinction (sigma_t = sigma_a + sigma_s)
- **Beer-Lambert** : transmittance T = exp(-sigma_t × distance), integration numerique pour les milieux heterogenes
- **Fonctions de phase** : Henyey-Greenstein (g = asymetrie), Rayleigh (petites particules, sigma proportionnel a 1/lambda^4)
- **Ray marching** : integration pas-a-pas le long du rayon, front-to-back compositing, early exit quand transmittance < 0.01
- **Brouillard** : depth fog (lineaire, exponentiel), height fog (densite decroissant avec l'altitude)
- **God rays** : ray march + shadow map sampling pour la lumiere volumetrique visible
- **Nuages** : Perlin-Worley noise (shape + detail), weather map, height gradient, Beer-powder pour le multi-scattering
- **Atmosphere** : Rayleigh (ciel bleu) + Mie (halo du soleil), integration en 2 couches
- **Optimisations** : half-res rendering, reprojection temporelle, blue noise dithering

Nous allons maintenant explorer deux domaines complementaires : la realite virtuelle/augmentee sur le web (WebXR) et l'animation procedurale (IK, spring dynamics, state machines).

</details>

---

## WebXR : la realite virtuelle et augmentee dans le navigateur

:::tip Analogie
Le WebXR, c'est comme une fenetre magique. Normalement, ton navigateur affiche une page plate sur un ecran 2D. Avec WebXR, cette fenetre se transforme en deux petites fenetres — une pour chaque oeil — et la scene 3D que tu as construite "sort" de l'ecran pour t'entourer. C'est le meme moteur de rendu Three.js ou WebGPU, mais au lieu de dessiner une seule image, tu en dessines deux (legerement decalees pour creer la stereoscopie), et le casque s'occupe de tracker ta tete pour mettre a jour la camera en temps reel.
:::

### L'API WebXR Device

```
Architecture WebXR :

  Navigateur (Chrome, Firefox, Quest Browser)
  ┌─────────────────────────────────────────┐
  │  navigator.xr                            │
  │  ├── isSessionSupported('immersive-vr')  │
  │  ├── isSessionSupported('immersive-ar')  │
  │  └── requestSession(mode, options)       │
  │       ↓                                  │
  │  XRSession                               │
  │  ├── requestReferenceSpace(type)         │
  │  ├── requestAnimationFrame(callback)     │
  │  ├── inputSources[] (controllers)        │
  │  └── end()                               │
  │       ↓                                  │
  │  XRFrame (chaque frame ~11ms pour 90fps) │
  │  ├── getViewerPose(refSpace)             │
  │  │   └── XRViewerPose                    │
  │  │       ├── transform (position + rot)  │
  │  │       └── views[] (1 par oeil)        │
  │  │           ├── eye ('left'|'right')    │
  │  │           ├── projectionMatrix        │
  │  │           └── transform               │
  │  └── getPose(inputSource, refSpace)      │
  └─────────────────────────────────────────┘
           ↓
  Hardware XR (Meta Quest, HTC Vive, HoloLens...)
  ┌─────────────────────────────────────────┐
  │  Tracking (6DOF : position + rotation)   │
  │  Affichage (2 ecrans, ~90-120Hz)        │
  │  Controllers / Hand tracking             │
  │  Cameras (passthrough AR)                │
  └─────────────────────────────────────────┘
```

### Detection et creation de session

```typescript
// Verifier le support WebXR
async function checkXRSupport(): Promise<{vr: boolean; ar: boolean}> {
  if (!('xr' in navigator)) {
    console.warn('WebXR non disponible dans ce navigateur');
    return { vr: false, ar: false };
  }

  const xr = navigator.xr!;
  const vr = await xr.isSessionSupported('immersive-vr');
  const ar = await xr.isSessionSupported('immersive-ar');

  return { vr, ar };
}

// Creer une session VR
async function startVRSession(): Promise<void> {
  const session = await navigator.xr!.requestSession('immersive-vr', {
    // Features obligatoires (la session echoue si non supportees)
    requiredFeatures: ['local-floor'],

    // Features optionnelles (la session continue sans elles)
    optionalFeatures: [
      'bounded-floor',    // Zone de jeu definie
      'hand-tracking',    // Suivi des mains
      'layers',           // XR Composition Layers
    ],
  });

  // Configurer le reference space
  const refSpace = await session.requestReferenceSpace('local-floor');
  // 'local-floor' : origine au sol, sous le casque
  // 'local' : origine a la position initiale du casque
  // 'bounded-floor' : zone de jeu delimitee
  // 'viewer' : toujours centre sur le casque

  // Boucle de rendu XR
  session.requestAnimationFrame(function onFrame(
    time: DOMHighResTimeStamp,
    frame: XRFrame
  ): void {
    session.requestAnimationFrame(onFrame);

    const pose = frame.getViewerPose(refSpace);
    if (!pose) return; // Tracking perdu

    // Position et orientation du casque
    const headPos = pose.transform.position;
    const headRot = pose.transform.orientation;
    console.log(`Head: (${headPos.x.toFixed(2)}, ${headPos.y.toFixed(2)}, ${headPos.z.toFixed(2)})`);

    // Rendre pour chaque oeil
    const glLayer = session.renderState.baseLayer!;

    for (const view of pose.views) {
      const viewport = glLayer.getViewport(view)!;

      // view.eye === 'left' ou 'right'
      // view.projectionMatrix : matrice de projection pour cet oeil
      // view.transform : position/rotation de cet oeil

      // Configurer le viewport et rendre la scene
      // gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
      // renderScene(view.projectionMatrix, view.transform.inverse.matrix);
    }
  });

  session.addEventListener('end', () => {
    console.log('Session XR terminee');
  });
}
```

---

## Rendu stereo : deux cameras, un monde

### Stereoscopie et IPD

```
Rendu stereo :

  Oeil gauche          Oeil droit
  ┌──────────┐         ┌──────────┐
  │    ○     │         │      ○   │  ← Le meme objet, legerement decale
  └──────────┘         └──────────┘
       ← IPD →  (Inter-Pupillary Distance ≈ 63mm)

  Le casque fournit la projection par oeil (inclut le decalage IPD).
  Framebuffer : 2 viewports cote a cote (ex: 1440×1600 × 2 sur Quest 2)
  → 2× la charge GPU d'un ecran standard
```

### Implementation bas-niveau (WebGL + WebXR)

```typescript
interface StereoRenderer {
  gl: WebGL2RenderingContext;
  session: XRSession;
  refSpace: XRReferenceSpace;
  sceneProgram: WebGLProgram;
}

function renderStereoFrame(
  renderer: StereoRenderer,
  frame: XRFrame,
  sceneData: SceneData
): void {
  const { gl, session, refSpace, sceneProgram } = renderer;
  const pose = frame.getViewerPose(refSpace);
  if (!pose) return;

  const glLayer = session.renderState.baseLayer!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(sceneProgram);

  for (const view of pose.views) {
    const viewport = glLayer.getViewport(view)!;
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

    // Matrice de vue = inverse de la transform de l'oeil
    const viewMatrix = view.transform.inverse.matrix;

    // Matrice de projection (asymetrique, fournie par le runtime XR)
    const projMatrix = view.projectionMatrix;

    // Envoyer les matrices au shader
    gl.uniformMatrix4fv(
      gl.getUniformLocation(sceneProgram, 'u_view'),
      false,
      viewMatrix
    );
    gl.uniformMatrix4fv(
      gl.getUniformLocation(sceneProgram, 'u_projection'),
      false,
      projMatrix
    );

    // Rendre la scene
    drawScene(gl, sceneData);
  }
}
```

---

## Foveated rendering

```
Foveated rendering : rendre avec plus de detail au centre

  L'oeil humain ne voit en haute resolution qu'au centre
  (la fovea, ~2° d'angle). La peripherie est floue.

  ┌───────────────────────────────┐
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  Zone peripherique : 1/4 res
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  │ ░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░ │  Zone intermediaire : 1/2 res
  │ ░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░ │
  │ ░░░░░▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒░░░░░░ │  Zone foveale : pleine res
  │ ░░░░░▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒░░░░░░ │
  │ ░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░ │
  │ ░░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░ │
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  └───────────────────────────────┘

  Types :
  - Fixed foveated rendering (FFR) :
    Centre fixe de l'ecran = haute resolution
    Simple, pas besoin d'eye tracking
    Supporte par Quest 2/3 nativement

  - Dynamic foveated rendering :
    Centre suit le regard (eye tracking requis)
    Quest Pro, Apple Vision Pro, PSVR2
    Encore plus efficace (~50% de gain)

  Impact performance :
  Sans FFR : 2880×1600 pixels = 4.6M
  Avec FFR : equivalent ~2.5M pixels → gain ~45%
```

```typescript
// WebXR ne gere pas le foveated rendering directement
// C'est le runtime du casque qui l'applique automatiquement
// On peut le configurer via les extensions proprietaires

// Quest : Fixed Foveated Rendering via l'extension OVR
// Niveaux : 0 (off), 1 (low), 2 (medium), 3 (high)
// Le runtime l'applique sur le framebuffer XR

// Three.js : activer le foveated rendering
function enableFoveatedRendering(renderer: THREE.WebGLRenderer): void {
  // Three.js r158+ supporte le foveated rendering
  // Le niveau est un hint, le runtime decide
  renderer.xr.setFoveation(1.0); // 0.0 = off, 1.0 = maximum
}
```

---

## Controllers et hand tracking

### XRInputSource

```typescript
function readControllers(session: XRSession, frame: XRFrame, refSpace: XRReferenceSpace): void {
  for (const source of session.inputSources) {
    // source.handedness : 'left' | 'right' | 'none'
    // source.targetRayMode : 'gaze' | 'tracked-pointer' | 'screen'

    // Position/orientation du controller (grip) et du rayon de pointage
    const gripPose = frame.getPose(source.gripSpace!, refSpace);
    const rayPose = frame.getPose(source.targetRaySpace, refSpace);

    // Gamepad : boutons et axes
    if (source.gamepad) {
      // Boutons Oculus Touch : 0=trigger, 1=squeeze, 3=thumbstick, 4=A/X, 5=B/Y
      const trigger = source.gamepad.buttons[0];
      if (trigger.pressed) { /* ... */ }

      // Axes : [thumbstick_x, thumbstick_y]  (-1 a +1)
      const [thumbX, thumbY] = source.gamepad.axes;
    }
  }
}
```

### Hand tracking

```typescript
function readHandTracking(frame: XRFrame, session: XRSession, refSpace: XRReferenceSpace): void {
  for (const source of session.inputSources) {
    if (!source.hand) continue;

    // XRHand : 25 joints par main (WRIST, THUMB_*, INDEX_FINGER_*, etc.)
    for (const [jointName, jointSpace] of source.hand.entries()) {
      const jointPose = frame.getJointPose(jointSpace, refSpace);
      if (jointPose) {
        // jointPose.transform.position → position 3D du joint
        // jointPose.radius → rayon approximatif du doigt
      }
    }

    // Detecter un pinch (pouce + index se touchent)
    const thumbPose = frame.getJointPose(source.hand.get('thumb-tip' as XRHandJoint)!, refSpace);
    const indexPose = frame.getJointPose(source.hand.get('index-finger-tip' as XRHandJoint)!, refSpace);
    if (thumbPose && indexPose) {
      const tp = thumbPose.transform.position, ip = indexPose.transform.position;
      const dist = Math.sqrt((tp.x-ip.x)**2 + (tp.y-ip.y)**2 + (tp.z-ip.z)**2);
      if (dist < 0.02) { console.log(`Pinch ! (${source.handedness})`); }
    }
  }
}
```

---

## Three.js + WebXR

```typescript
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

// --- Setup de base ---
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true; // Active le mode XR
renderer.xr.setFoveation(1.0);

document.body.appendChild(renderer.domElement);

// Ajouter le bouton VR (ou AR)
document.body.appendChild(VRButton.createButton(renderer));
// OU : document.body.appendChild(ARButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 3); // Hauteur des yeux debout

// --- Eclairage ---
scene.add(new THREE.AmbientLight(0x404040));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// --- Scene ---
// Sol avec grille
const gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x222222);
scene.add(gridHelper);

// Quelques objets interactifs
const cubes: THREE.Mesh[] = [];
for (let i = 0; i < 5; i++) {
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(i / 5, 0.8, 0.6),
      roughness: 0.5,
      metalness: 0.3,
    })
  );
  cube.position.set((i - 2) * 0.5, 1.2, -1);
  scene.add(cube);
  cubes.push(cube);
}

// --- Controllers ---
const controllerModelFactory = new XRControllerModelFactory();

// Controller 0 (gauche typiquement)
const controller0 = renderer.xr.getController(0);
controller0.addEventListener('selectstart', () => {
  console.log('Controller 0: trigger pressed');
});
controller0.addEventListener('selectend', () => {
  console.log('Controller 0: trigger released');
});
controller0.addEventListener('squeezestart', () => {
  console.log('Controller 0: grip pressed');
});
scene.add(controller0);

// Controller 1 (droite)
const controller1 = renderer.xr.getController(1);
scene.add(controller1);

// Modeles 3D des controllers
const controllerGrip0 = renderer.xr.getControllerGrip(0);
controllerGrip0.add(controllerModelFactory.createControllerModel(controllerGrip0));
scene.add(controllerGrip0);

const controllerGrip1 = renderer.xr.getControllerGrip(1);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
scene.add(controllerGrip1);

// Rayon de pointage (teleport / selection)
function createRayLine(): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -5),
  ]);
  const material = new THREE.LineBasicMaterial({ color: 0x00ffff });
  return new THREE.Line(geometry, material);
}

controller0.add(createRayLine());
controller1.add(createRayLine());

// --- Hand tracking (optionnel) ---
const handModelFactory = new XRHandModelFactory();

const hand0 = renderer.xr.getHand(0);
hand0.add(handModelFactory.createHandModel(hand0, 'mesh'));
scene.add(hand0);

const hand1 = renderer.xr.getHand(1);
hand1.add(handModelFactory.createHandModel(hand1, 'mesh'));
scene.add(hand1);

// --- Interaction : grab d'objets ---
const raycaster = new THREE.Raycaster();
let grabbedObject: THREE.Mesh | null = null;

controller1.addEventListener('selectstart', () => {
  const tempMatrix = new THREE.Matrix4().identity().extractRotation(controller1.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const intersects = raycaster.intersectObjects(cubes);
  if (intersects.length > 0) {
    grabbedObject = intersects[0].object as THREE.Mesh;
    controller1.attach(grabbedObject); // Re-parent au controller
  }
});
controller1.addEventListener('selectend', () => {
  if (grabbedObject) { scene.attach(grabbedObject); grabbedObject = null; }
});

// --- Teleportation (controller gauche) ---
// Principe : raycaster vers le sol → anneau de teleport → offset du reference space
controller0.addEventListener('selectend', () => {
  const tempMatrix = new THREE.Matrix4().identity().extractRotation(controller0.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller0.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10));
  floorPlane.rotation.x = -Math.PI / 2;
  const hits = raycaster.intersectObject(floorPlane);

  if (hits.length > 0) {
    const target = hits[0].point;
    const currentRefSpace = renderer.xr.getReferenceSpace()!;
    const transform = new XRRigidTransform(
      { x: -target.x, y: 0, z: -target.z, w: 0 },
      { x: 0, y: 0, z: 0, w: 1 }
    );
    renderer.xr.setReferenceSpace(currentRefSpace.getOffsetReferenceSpace(transform));
  }
});

// --- Render loop ---
// En mode XR, Three.js gere automatiquement le stereo, la camera et le framebuffer
renderer.setAnimationLoop(() => {
  cubes.forEach((cube, i) => { cube.rotation.y += 0.01 * (i + 1); });
  renderer.render(scene, camera);
});
```

---

## AR : hit testing et light estimation

```typescript
import { ARButton } from 'three/addons/webxr/ARButton.js';

document.body.appendChild(ARButton.createButton(renderer, {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay', 'light-estimation'],
}));

let hitTestSource: XRHitTestSource | null = null;

renderer.xr.addEventListener('sessionstart', async () => {
  const session = renderer.xr.getSession()!;
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource!({ space: viewerSpace });
});

// Reticule de placement
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.05, 0.06, 32),
  new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
);
reticle.rotation.x = -Math.PI / 2;
reticle.visible = false;
scene.add(reticle);

renderer.setAnimationLoop((_time: number, frame?: XRFrame) => {
  if (frame && hitTestSource) {
    const refSpace = renderer.xr.getReferenceSpace()!;
    const results = frame.getHitTestResults(hitTestSource);

    if (results.length > 0) {
      const pose = results[0].getPose(refSpace);
      if (pose) {
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.matrix.decompose(reticle.position, reticle.quaternion, reticle.scale);
      }
    } else { reticle.visible = false; }

    // Light estimation : SH de l'eclairage reel → objets 3D coherents
    const lightEstimate = frame.getLightEstimate?.();
    if (lightEstimate) {
      // lightEstimate.sphericalHarmonicsCoefficients → mettre a jour le LightProbe Three.js
    }
  }
  renderer.render(scene, camera);
});

// Placer un objet au tap
renderer.xr.getSession()?.addEventListener('select', () => {
  if (!reticle.visible) return;
  const obj = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xff6600 })
  );
  obj.position.copy(reticle.position);
  obj.position.y += 0.05;
  scene.add(obj);
});
```

---

## Performance VR : contraintes critiques

```
Contraintes de performance VR :

  Framerate minimum : 72 FPS (Quest 2), 90 FPS (Quest 3, PCVR)
  → Budget par frame : 13.9ms (72fps) ou 11.1ms (90fps)
  → Si le framerate chute → motion sickness + reprojection (ASW)

  Strategies d'optimisation :
  1. Fixed foveated rendering          -30-45%
  2. Reduire les draw calls (instancing)
  3. LOD agressif (3-4 niveaux)        -40%
  4. Frustum + occlusion culling
  5. Single-pass stereo rendering      -30%
  6. Baked lighting, shadow maps basse res
  7. Eviter transparences et post-processing couteux
```

---

## Inverse Kinematics (IK) : faire bouger les os

:::tip Analogie
Quand tu attrapes une poignee de porte, ton cerveau ne calcule pas individuellement l'angle de ton epaule, puis ton coude, puis ton poignet. Il "vise" la poignee et tout le bras s'ajuste automatiquement. C'est exactement ce que fait l'IK : au lieu de specifier l'angle de chaque articulation (Forward Kinematics), tu specifies la position cible de l'extremite (la main), et l'algorithme calcule les angles necessaires pour l'atteindre.
:::

### Forward Kinematics vs Inverse Kinematics

```
Forward Kinematics (FK) :
  Input  : angles des joints (θ₁, θ₂, θ₃)
  Output : position de l'effecteur (x, y, z)

  Epaule (θ₁=30°)      Coude (θ₂=45°)      Main (resultat)
    ●──────────────────────●─────────────────────● ?
    On connait les angles → on calcule la position


Inverse Kinematics (IK) :
  Input  : position cible de l'effecteur (x, y, z)
  Output : angles des joints (θ₁, θ₂, θ₃)

  Epaule (θ₁=?)        Coude (θ₂=?)        Main (cible connue)
    ●──────────────────────●─────────────────────★
    On connait la cible → on calcule les angles

  Problemes :
  - Peut avoir 0 solution (cible hors d'atteinte)
  - Peut avoir plusieurs solutions (coude en haut ou en bas ?)
  - Systemes redondants (7+ DOF) → infinites solutions
```

### CCD (Cyclic Coordinate Descent)

```
CCD : l'algorithme IK le plus simple et le plus robuste

  Principe : iterer sur chaque joint (du plus loin au plus proche),
  et tourner chaque joint pour rapprocher l'effecteur de la cible.

  Iteration 1 :
  ──────────────
  Joint 3 (le plus proche de l'effecteur) :
    ●───●───●───●  effecteur
                    ★ cible
    Tourner joint 3 pour que l'effecteur pointe vers la cible

  Joint 2 :
    ●───●───●───● → ★
    Tourner joint 2 pour rapprocher encore

  Joint 1 :
    ●───●───●───● → ★
    Tourner joint 1

  Repeter 5-10 iterations → converge vers la solution
```

```typescript
interface Joint {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  length: number;        // Distance jusqu'au prochain joint
  minAngle?: number;     // Contrainte angulaire min
  maxAngle?: number;     // Contrainte angulaire max
}

function solveCCD(
  joints: Joint[],
  target: THREE.Vector3,
  maxIterations: number = 10,
  tolerance: number = 0.01
): void {
  const endIdx = joints.length - 1;

  for (let iter = 0; iter < maxIterations; iter++) {
    const effectorPos = getEffectorPosition(joints);
    if (effectorPos.distanceTo(target) < tolerance) break;

    // Iterer du joint le plus loin (avant-dernier) jusqu'a la racine
    for (let i = endIdx - 1; i >= 0; i--) {
      const jointPos = joints[i].position;

      // Vecteur du joint vers l'effecteur, puis vers la cible
      const toEffector = new THREE.Vector3()
        .subVectors(getEffectorPosition(joints), jointPos).normalize();
      const toTarget = new THREE.Vector3()
        .subVectors(target, jointPos).normalize();

      // Rotation pour aligner toEffector vers toTarget
      const rotation = new THREE.Quaternion().setFromUnitVectors(toEffector, toTarget);
      joints[i].rotation.premultiply(rotation);

      // Contraintes angulaires
      if (joints[i].minAngle !== undefined) {
        const euler = new THREE.Euler().setFromQuaternion(joints[i].rotation);
        euler.x = THREE.MathUtils.clamp(euler.x, joints[i].minAngle!, joints[i].maxAngle!);
        joints[i].rotation.setFromEuler(euler);
      }
    }
  }
}

function getEffectorPosition(joints: Joint[]): THREE.Vector3 {
  const pos = joints[0].position.clone();
  const rot = new THREE.Quaternion();
  for (let i = 0; i < joints.length - 1; i++) {
    rot.multiply(joints[i].rotation);
    pos.add(new THREE.Vector3(0, joints[i].length, 0).applyQuaternion(rot));
  }
  return pos;
}
```

### FABRIK (Forward And Backward Reaching Inverse Kinematics)

```
FABRIK : algorithme IK base sur les positions (pas les rotations)

  Plus intuitif que CCD, converge plus vite, gere bien les contraintes.

  Phase 1 : BACKWARD — deplacer l'effecteur sur la cible, puis reculer
  chaque joint a "longueur du bone" vers son predecesseur. La racine bouge.

  Phase 2 : FORWARD — remettre la racine a sa position fixe, puis
  propager chaque joint a "longueur du bone" vers le suivant.

  Repeter phases 1+2 : 3-5 iterations suffisent generalement
```

```typescript
function solveFABRIK(
  positions: THREE.Vector3[],     // Positions des joints
  boneLengths: number[],          // Longueur de chaque bone
  target: THREE.Vector3,
  rootFixed: boolean = true,
  maxIterations: number = 10,
  tolerance: number = 0.01
): void {
  const n = positions.length;
  const rootPos = positions[0].clone();

  // Verifier si la cible est atteignable
  const totalLength = boneLengths.reduce((a, b) => a + b, 0);
  const distToTarget = positions[0].distanceTo(target);

  if (distToTarget > totalLength) {
    // Cible hors d'atteinte → etendre la chaine vers la cible
    const dir = new THREE.Vector3().subVectors(target, positions[0]).normalize();
    for (let i = 1; i < n; i++) {
      positions[i].copy(positions[i - 1]).addScaledVector(dir, boneLengths[i - 1]);
    }
    return;
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    // Verifier la convergence
    if (positions[n - 1].distanceTo(target) < tolerance) break;

    // Phase 1 : BACKWARD (effecteur → racine)
    positions[n - 1].copy(target);
    for (let i = n - 2; i >= 0; i--) {
      const dir = new THREE.Vector3()
        .subVectors(positions[i], positions[i + 1])
        .normalize();
      positions[i].copy(positions[i + 1])
        .addScaledVector(dir, boneLengths[i]);
    }

    // Phase 2 : FORWARD (racine → effecteur)
    if (rootFixed) {
      positions[0].copy(rootPos);
    }
    for (let i = 1; i < n; i++) {
      const dir = new THREE.Vector3()
        .subVectors(positions[i], positions[i - 1])
        .normalize();
      positions[i].copy(positions[i - 1])
        .addScaledVector(dir, boneLengths[i - 1]);
    }
  }
}
```

---

## Animation procedurale : marche, springs et blend trees

### Cycle de marche procedural

```
Cycle de marche : phases

  0%            25%           50%           75%          100%
  Contact       Passing       Contact       Passing      Contact
  (pied droit)  (mi-swing)    (pied gauche) (mi-swing)   (retour)

    ╱╲            │              ╱╲           │
   ╱  ╲     ╱╲   │╱╲           ╱  ╲     ╱╲  │
  ╱    ╲   ╱  ╲  ╱  ╲         ╱    ╲   ╱  ╲ │
  ──────╲─╱────╲╱────╲───────╲─╱────╲╱────╲──
         V                     V

  Pied droit : sin(t × 2π)
  Pied gauche : sin(t × 2π + π)   ← dephasage de 180°
  Hanche : oscillation verticale = -|sin(t × 4π)| × bounce_height
```

```typescript
function proceduralWalk(skeleton: THREE.Skeleton, time: number, speed: number, stepLength: number): void {
  const t = ((time * speed / stepLength) % 1.0) * Math.PI * 2;

  // Hanches : rebond vertical + balancement lateral
  const hips = skeleton.getBoneByName('Hips')!;
  hips.position.y += Math.abs(Math.sin(t * 2)) * 0.02;
  hips.position.x += Math.sin(t) * 0.015;

  // Jambes : cuisse (sin), genou (plie quand en l'air), pied (compensation)
  const rThigh = skeleton.getBoneByName('RightUpLeg')!;
  const rShin = skeleton.getBoneByName('RightLeg')!;
  rThigh.rotation.x = Math.sin(t) * 0.5;
  rShin.rotation.x = Math.max(0, -Math.sin(t)) * 0.8;

  const lThigh = skeleton.getBoneByName('LeftUpLeg')!;
  const lShin = skeleton.getBoneByName('LeftLeg')!;
  lThigh.rotation.x = Math.sin(t + Math.PI) * 0.5;       // Dephasage π
  lShin.rotation.x = Math.max(0, -Math.sin(t + Math.PI)) * 0.8;

  // Bras : oppose aux jambes
  skeleton.getBoneByName('RightArm')!.rotation.x = -Math.sin(t) * 0.3;
  skeleton.getBoneByName('LeftArm')!.rotation.x = -Math.sin(t + Math.PI) * 0.3;

  // Torse : legere rotation + inclinaison
  const spine = skeleton.getBoneByName('Spine')!;
  spine.rotation.y = Math.sin(t) * 0.05;
  spine.rotation.x = 0.05; // Lean forward
}
```

### Spring dynamics : mouvement secondaire

```
Spring dynamics : simuler les oscillations elastiques

  Position de l'os parent (P)    Position du "cheveu" (X)
       ●━━━━━━━━━━━━━━━━━━━━━━━━●
       |← spring force            |
       |  F = -k × (X - rest)     |
       |  F += -damping × velocity |

  Equation : x'' = -k × (x - target) - d × x'

  k = raideur (spring constant)
  d = amortissement (damping)

  Applications :
  - Cheveux, capes, rubans
  - Oreilles de personnages
  - Antennes, queues
  - Seins, ventres (jiggle physics)
  - Rebond d'accessoires (sac a dos, arme)
```

```typescript
class SpringBone {
  currentPos = new THREE.Vector3();
  velocity = new THREE.Vector3();
  private restLength: number;

  constructor(
    private bone: THREE.Bone,
    private parentBone: THREE.Bone,
    private stiffness = 2.0,
    private damping = 0.85,
    private gravity = new THREE.Vector3(0, -0.5, 0)
  ) {
    this.restLength = bone.position.length();
    bone.getWorldPosition(this.currentPos);
  }

  update(dt: number): void {
    const parentWorldPos = new THREE.Vector3();
    this.parentBone.getWorldPosition(parentWorldPos);
    const restPos = new THREE.Vector3();
    this.bone.getWorldPosition(restPos);

    // Spring force + gravite
    const force = new THREE.Vector3().subVectors(restPos, this.currentPos)
      .multiplyScalar(this.stiffness).add(this.gravity);

    this.velocity.add(force.multiplyScalar(dt)).multiplyScalar(this.damping);
    this.currentPos.add(this.velocity.clone().multiplyScalar(dt));

    // Contrainte de longueur
    const toParent = new THREE.Vector3().subVectors(this.currentPos, parentWorldPos);
    if (toParent.length() > this.restLength * 1.2) {
      this.currentPos.copy(parentWorldPos).add(toParent.normalize().multiplyScalar(this.restLength));
    }

    // Appliquer en local space
    const localPos = this.currentPos.clone().applyMatrix4(
      new THREE.Matrix4().copy(this.parentBone.matrixWorld).invert()
    );
    this.bone.position.copy(localPos);
  }
}
```

### Look-at constraint

```typescript
function applyLookAt(bone: THREE.Bone, target: THREE.Vector3, influence = 1.0, maxAngle = Math.PI / 3): void {
  const originalQuat = bone.quaternion.clone();
  const boneWorldPos = new THREE.Vector3();
  bone.getWorldPosition(boneWorldPos);

  const direction = new THREE.Vector3().subVectors(target, boneWorldPos).normalize();

  // Convertir en local space du bone
  const parentWorldQuat = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorldQuat);
  const localDir = direction.clone().applyQuaternion(parentWorldQuat.clone().invert());

  const lookQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), localDir);

  // Limiter l'angle et appliquer avec influence
  const angle = 2 * Math.acos(Math.abs(lookQuat.w));
  if (angle > maxAngle) { lookQuat.slerp(new THREE.Quaternion(), 1 - maxAngle / angle); }
  bone.quaternion.copy(originalQuat).slerp(lookQuat, influence);
}
```

---

## Animation state machine et blend tree

### Blend tree

```
Blend tree : combiner des animations par parametres

  Parametre : speed (0 → 10 m/s)

  ┌─────────────────────────────────────────────────┐
  │                                                  │
  │  [Idle]──────[Walk]──────[Run]──────[Sprint]    │
  │   0 m/s      1.5 m/s     5 m/s      8 m/s      │
  │                                                  │
  │  Si speed = 2.5 m/s :                           │
  │    Walk weight = 0.7 (interpolation)            │
  │    Run weight = 0.3                              │
  │    Resultat = lerp(Walk, Run, 0.3)              │
  │                                                  │
  └─────────────────────────────────────────────────┘

  Blend tree 2D (direction + vitesse) :

         Forward
           ↑
  Left ← Idle → Right     Parametre X : direction (-1 a 1)
           ↓               Parametre Y : vitesse (0 a 1)
        Backward

  Resultat = interpolation bilineaire entre les 4+ animations
```

```typescript
interface BlendNode { animation: THREE.AnimationAction; threshold: number; }

class BlendTree1D {
  private nodes: BlendNode[];

  constructor(mixer: THREE.AnimationMixer, nodes: BlendNode[]) {
    this.nodes = nodes.sort((a, b) => a.threshold - b.threshold);
    for (const node of this.nodes) { node.animation.play(); node.animation.setEffectiveWeight(0); }
  }

  update(parameter: number): void {
    // Trouver les deux nodes adjacentes et interpoler
    let lo = 0, hi = this.nodes.length - 1;
    for (let i = 0; i < this.nodes.length - 1; i++) {
      if (parameter >= this.nodes[i].threshold && parameter <= this.nodes[i + 1].threshold) {
        lo = i; hi = i + 1; break;
      }
    }
    if (parameter <= this.nodes[0].threshold) { lo = hi = 0; }
    if (parameter >= this.nodes[this.nodes.length - 1].threshold) { lo = hi = this.nodes.length - 1; }

    const blend = lo !== hi
      ? (parameter - this.nodes[lo].threshold) / (this.nodes[hi].threshold - this.nodes[lo].threshold)
      : 0;

    for (let i = 0; i < this.nodes.length; i++) {
      let w = 0;
      if (i === lo) w = 1 - blend;
      if (i === hi) w += blend;
      this.nodes[i].animation.setEffectiveWeight(w);
    }
  }
}
```

### Animation state machine

```
State machine d'animation :

  ┌──────┐  speed > 0.1   ┌──────┐  speed > 4   ┌──────┐
  │ Idle │ ──────────────→ │ Walk │ ────────────→ │ Run  │
  │      │ ←────────────── │      │ ←──────────── │      │
  └──────┘  speed < 0.05   └──────┘  speed < 3    └──────┘
     │                        │                      │
     │ jump                   │ jump                 │ jump
     ↓                        ↓                      ↓
  ┌──────┐                 ┌──────┐               ┌──────┐
  │ Jump │                 │ Jump │               │ Jump │
  │      │ ──→ grounded ──→│      │               │      │
  └──────┘    → Idle        └──────┘ → Walk        └──────┘ → Run

  Chaque transition a :
  - Condition (ex: speed > 0.1)
  - Duree de crossfade (ex: 0.3s)
  - Priorite (jump > tout)
```

```typescript
interface AnimState {
  name: string;
  action: THREE.AnimationAction;
  transitions: AnimTransition[];
}

interface AnimTransition {
  targetState: string;
  condition: (params: Record<string, number>) => boolean;
  crossfadeDuration: number;
  priority: number;
}

class AnimationStateMachine {
  private states: Map<string, AnimState> = new Map();
  private currentState: AnimState | null = null;
  private mixer: THREE.AnimationMixer;
  private isTransitioning = false;

  constructor(mixer: THREE.AnimationMixer) {
    this.mixer = mixer;
  }

  addState(
    name: string,
    clip: THREE.AnimationClip,
    transitions: Omit<AnimTransition, 'priority'>[]
  ): void {
    const action = this.mixer.clipAction(clip);
    action.play();
    action.setEffectiveWeight(0);

    this.states.set(name, {
      name,
      action,
      transitions: transitions.map((t, i) => ({ ...t, priority: i })),
    });
  }

  start(stateName: string): void {
    const state = this.states.get(stateName)!;
    state.action.setEffectiveWeight(1);
    state.action.reset();
    this.currentState = state;
  }

  update(params: Record<string, number>, deltaTime: number): void {
    if (!this.currentState || this.isTransitioning) return;

    // Evaluer les transitions par priorite
    const validTransitions = this.currentState.transitions
      .filter(t => t.condition(params))
      .sort((a, b) => a.priority - b.priority);

    if (validTransitions.length > 0) {
      const transition = validTransitions[0];
      this.transitionTo(transition.targetState, transition.crossfadeDuration);
    }

    this.mixer.update(deltaTime);
  }

  private transitionTo(targetName: string, duration: number): void {
    const targetState = this.states.get(targetName)!;
    if (targetState === this.currentState) return;

    this.isTransitioning = true;

    // Crossfade
    targetState.action.reset();
    targetState.action.setEffectiveWeight(1);
    targetState.action.crossFadeFrom(
      this.currentState!.action,
      duration,
      true // warp (ajuster la vitesse pour matcher les poses)
    );

    this.currentState = targetState;

    // Fin de la transition
    setTimeout(() => {
      this.isTransitioning = false;
    }, duration * 1000);
  }
}

// --- Utilisation ---
const mixer = new THREE.AnimationMixer(character);
const sm = new AnimationStateMachine(mixer);

sm.addState('idle', idleClip, [
  { targetState: 'walk', condition: (p) => p.speed > 0.1, crossfadeDuration: 0.3 },
  { targetState: 'jump', condition: (p) => p.jump > 0, crossfadeDuration: 0.1 },
]);
sm.addState('walk', walkClip, [
  { targetState: 'idle', condition: (p) => p.speed < 0.05, crossfadeDuration: 0.3 },
  { targetState: 'run', condition: (p) => p.speed > 4, crossfadeDuration: 0.2 },
  { targetState: 'jump', condition: (p) => p.jump > 0, crossfadeDuration: 0.1 },
]);
sm.addState('run', runClip, [
  { targetState: 'walk', condition: (p) => p.speed < 3, crossfadeDuration: 0.2 },
  { targetState: 'jump', condition: (p) => p.jump > 0, crossfadeDuration: 0.1 },
]);
sm.addState('jump', jumpClip, [
  { targetState: 'idle', condition: (p) => p.grounded > 0 && p.speed < 0.1, crossfadeDuration: 0.2 },
  { targetState: 'walk', condition: (p) => p.grounded > 0 && p.speed >= 0.1, crossfadeDuration: 0.2 },
]);
sm.start('idle');

// Game loop
function gameLoop(dt: number): void {
  sm.update({ speed: ctrl.speed, jump: input.jumpPressed ? 1 : 0, grounded: ctrl.isGrounded ? 1 : 0 }, dt);
}
```

---

## Three.js : CCDIKSolver

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CCDIKSolver } from 'three/addons/animation/CCDIKSolver.js';

const gltf = await new GLTFLoader().loadAsync('/models/character.glb');
const skinnedMesh = gltf.scene.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
scene.add(gltf.scene);

const bones = skinnedMesh.skeleton;
const idx = (name: string) => bones.bones.findIndex(b => b.name === name);

// Chaines IK : bras droit (epaule → coude → main) + jambe gauche
const ikConfig = [
  {
    target: idx('RightHandTarget'),  // Bone cible (ajoute manuellement)
    effector: idx('RightHand'),
    links: [
      { index: idx('RightForeArm'),
        rotationMin: new THREE.Vector3(-Math.PI / 2, 0, 0),
        rotationMax: new THREE.Vector3(0, 0, 0) },
      { index: idx('RightArm'),
        rotationMin: new THREE.Vector3(-Math.PI / 2, -Math.PI / 4, -Math.PI / 4),
        rotationMax: new THREE.Vector3(Math.PI / 2, Math.PI / 4, Math.PI / 4) },
    ],
    iteration: 10,
  },
  {
    target: idx('LeftFootTarget'),
    effector: idx('LeftFoot'),
    links: [
      { index: idx('LeftLeg'),
        rotationMin: new THREE.Vector3(0, 0, 0),
        rotationMax: new THREE.Vector3(Math.PI * 0.8, 0, 0) },
      { index: idx('LeftUpLeg'),
        rotationMin: new THREE.Vector3(-Math.PI / 2, -Math.PI / 6, -Math.PI / 6),
        rotationMax: new THREE.Vector3(Math.PI / 4, Math.PI / 6, Math.PI / 6) },
    ],
    iteration: 10,
  },
];

const ikSolver = new CCDIKSolver(skinnedMesh, ikConfig);

// Render loop : deplacer le bone cible puis resoudre
function animate(): void {
  requestAnimationFrame(animate);
  bones.bones[idx('RightHandTarget')].position.copy(targetHelper.position);
  ikSolver.update();
  renderer.render(scene, camera);
}
animate();
```

### FABRIK custom en Three.js

L'implementation FABRIK vue plus haut s'applique directement aux bones Three.js. Il suffit d'extraire les positions world des bones, executer les passes backward/forward, puis convertir les positions resultantes en rotations locales pour chaque bone :

```typescript
function solveFABRIKChain(bones: THREE.Bone[], target: THREE.Vector3, iterations = 5): void {
  const positions = bones.map(b => new THREE.Vector3().copy(b.getWorldPosition(new THREE.Vector3())));
  const lengths = positions.slice(0, -1).map((p, i) => p.distanceTo(positions[i + 1]));
  const rootPos = positions[0].clone();

  for (let iter = 0; iter < iterations; iter++) {
    // Backward : effecteur → racine
    positions[positions.length - 1].copy(target);
    for (let i = positions.length - 2; i >= 0; i--) {
      const dir = new THREE.Vector3().subVectors(positions[i], positions[i + 1]).normalize();
      positions[i].copy(positions[i + 1]).addScaledVector(dir, lengths[i]);
    }
    // Forward : racine → effecteur
    positions[0].copy(rootPos);
    for (let i = 1; i < positions.length; i++) {
      const dir = new THREE.Vector3().subVectors(positions[i], positions[i - 1]).normalize();
      positions[i].copy(positions[i - 1]).addScaledVector(dir, lengths[i - 1]);
    }
  }

  // Convertir les positions en rotations locales des bones
  for (let i = 0; i < bones.length - 1; i++) {
    const dir = new THREE.Vector3().subVectors(positions[i + 1], positions[i]).normalize();
    const parentQuat = new THREE.Quaternion();
    bones[i].parent?.getWorldQuaternion(parentQuat);
    const localDir = dir.applyQuaternion(parentQuat.invert());
    bones[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localDir);
  }
}
```

---

## Pratique

### Exercice XR.1 — Scene VR interactive avec IK

Creer une scene VR dans Three.js avec :
1. Un environnement simple (sol, quelques objets)
2. Des mains virtuelles qui suivent les controllers via IK (bras complets)
3. Grab d'objets avec le trigger
4. Teleportation avec le thumbstick
5. Un personnage NPC avec un cycle de marche procedural

```typescript
// TODO: Setup Three.js + WebXR (VRButton, renderer.xr.enabled)
// TODO: Creer l'environnement (GridHelper, cubes colores)
// TODO: Ajouter les controllers avec modeles
// TODO: Implementer le grab (selectstart/selectend)
// TODO: Implementer la teleportation (thumbstick + parabole)
// TODO: Creer un squelette simple pour les bras (3 bones)
// TODO: Appliquer FABRIK pour que les mains suivent les controllers
// TODO: Ajouter un NPC avec marche procedurale (sin/cos)
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// --- Setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFoveation(1.0);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a3e);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 100
);
camera.position.set(0, 1.6, 3);

// --- Eclairage + Sol ---
scene.add(new THREE.AmbientLight(0x404060, 0.5));
const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
scene.add(dirLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
scene.add(new THREE.GridHelper(20, 40, 0x444466, 0x222233));

// --- Objets attrapables ---
const grabbables: THREE.Mesh[] = [];
const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff];
for (let i = 0; i < 5; i++) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.15),
    new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.3, metalness: 0.5 })
  );
  mesh.position.set((i - 2) * 0.4, 1.0, -1);
  mesh.castShadow = true;
  scene.add(mesh);
  grabbables.push(mesh);
}

// --- Controllers avec grab ---
const controllerFactory = new XRControllerModelFactory();
const grabbed: (THREE.Mesh | null)[] = [null, null];

for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i);
  scene.add(controller);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(controllerFactory.createControllerModel(grip));
  scene.add(grip);

  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -3)]);
  controller.add(new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x00ffff })));

  const ci = i;
  controller.addEventListener('selectstart', () => {
    const rc = new THREE.Raycaster();
    const m = new THREE.Matrix4().identity().extractRotation(controller.matrixWorld);
    rc.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    rc.ray.direction.set(0, 0, -1).applyMatrix4(m);
    const hits = rc.intersectObjects(grabbables);
    if (hits.length > 0) { grabbed[ci] = hits[0].object as THREE.Mesh; controller.attach(grabbed[ci]!); }
  });
  controller.addEventListener('selectend', () => {
    if (grabbed[ci]) { scene.attach(grabbed[ci]!); grabbed[ci] = null; }
  });
}

// --- NPC avec marche procedurale ---
const npcGroup = new THREE.Group();
npcGroup.position.set(2, 0, -2);
scene.add(npcGroup);

// Corps simplifie (torso, tete, 2 jambes, 2 bras)
const npcMat = new THREE.MeshStandardMaterial({ color: 0x6688aa });
const limbMat = new THREE.MeshStandardMaterial({ color: 0x334455 });

const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.2), npcMat);
torso.position.y = 1.2;
npcGroup.add(torso);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffcc99 }));
head.position.y = 1.7;
npcGroup.add(head);

const legGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
const rightLeg = new THREE.Mesh(legGeo, limbMat); rightLeg.position.set(0.1, 0.65, 0); npcGroup.add(rightLeg);
const leftLeg = new THREE.Mesh(legGeo, limbMat); leftLeg.position.set(-0.1, 0.65, 0); npcGroup.add(leftLeg);

const armGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
const rightArm = new THREE.Mesh(armGeo, limbMat); rightArm.position.set(0.3, 1.1, 0); npcGroup.add(rightArm);
const leftArm = new THREE.Mesh(armGeo, limbMat); leftArm.position.set(-0.3, 1.1, 0); npcGroup.add(leftArm);

let npcTime = 0, npcDirection = 1;

function animateNPC(dt: number): void {
  npcTime += dt;
  const p = npcTime * 4; // phase de marche

  npcGroup.position.x += 0.5 * dt * npcDirection;
  if (npcGroup.position.x > 3) npcDirection = -1;
  if (npcGroup.position.x < -3) npcDirection = 1;
  npcGroup.rotation.y = npcDirection > 0 ? 0 : Math.PI;

  rightLeg.rotation.x = Math.sin(p) * 0.4;
  leftLeg.rotation.x = Math.sin(p + Math.PI) * 0.4;
  rightArm.rotation.x = -Math.sin(p) * 0.3;
  leftArm.rotation.x = -Math.sin(p + Math.PI) * 0.3;
  torso.position.y = 1.2 + Math.abs(Math.sin(p * 2)) * 0.03;
  head.position.y = 1.7 + Math.abs(Math.sin(p * 2)) * 0.03;
}

// --- Render loop ---
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  animateNPC(dt);
  renderer.render(scene, camera);
});
```

</details>

---

## Resume

| Concept | Description | Complexite |
|---------|-------------|:----------:|
| **WebXR Device API** | navigator.xr, XRSession, XRFrame, XRView, XRViewerPose | Standard W3C |
| **Rendu stereo** | Deux viewports (gauche/droite), IPD ~63mm, projection asymetrique | 2x la charge GPU |
| **Foveated rendering** | Haute resolution au centre, basse en peripherie | -30-45% GPU |
| **XRInputSource** | Controllers (trigger, squeeze, thumbstick) + hand tracking (25 joints) | Temps reel |
| **Three.js + WebXR** | renderer.xr.enabled, VRButton/ARButton, getController/getHand | Abstraction haut niveau |
| **AR hit testing** | Detecter les surfaces reelles pour placer des objets virtuels | requestHitTestSource |
| **Light estimation** | SH de l'eclairage reel pour integrer les objets 3D | Frame-level |
| **VR performance** | 72-90 FPS obligatoire, budget ~11ms/frame, ASW/reprojection | Critique |
| **CCD IK** | Iterer joint par joint, tourner vers la cible, converge en 5-10 iter | Simple, robuste |
| **FABRIK IK** | Backward + forward reaching, base sur les positions | Rapide, intuitif |
| **Marche procedurale** | sin/cos par articulation, dephasage jambe/bras | Parametrique |
| **Spring dynamics** | F = -k(x-rest) - d*v, pour cheveux/capes/accessoires | Par bone |
| **Look-at constraint** | Orienter un bone vers une cible avec limite d'angle | Slerp + clamp |
| **Blend tree** | Interpoler entre animations selon un parametre (vitesse, direction) | Lineaire/bilineaire |
| **State machine** | Etats (idle, walk, run, jump) + transitions conditionnelles + crossfade | Graphe d'etats |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [25 - Rendu volumetrique](./25-rendu-volumetrique.md) | [Module suivant](./27-prochain-module.md) |

**Ressources associees :**
- [Lab 26 — WebXR et animation procedurale](../labs/lab-26-webxr-animation/)
- [Quiz 26 — WebXR et animation procedurale](../quizzes/quiz-26-webxr-animation.html)
