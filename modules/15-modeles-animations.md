# Module 15 — Modeles et animations

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 3/5        | 90 min        | [Lab 15](../labs/lab-15-modeles-animations/) | [Quiz 15](../quizzes/quiz-15-modeles-animations.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Comparer les formats 3D (glTF, FBX, OBJ, USDZ) et justifier la dominance de glTF 2.0 sur le web
- Charger un modele `.glb`/`.gltf` avec GLTFLoader et naviguer dans sa structure
- Configurer DRACOLoader pour la compression de geometrie et KTX2Loader pour les textures GPU
- Parcourir la hierarchie d'une scene avec `traverse()` et `getObjectByName()`
- Utiliser AnimationMixer, AnimationClip et AnimationAction pour jouer et enchainer des animations
- Comprendre les animations squelettiques (bones, SkinnedMesh) et les morph targets
- Instancier des milliers d'objets efficacement avec InstancedMesh

---

<details>
<summary>Rappel du cours precedent — Materiaux et lumieres Three.js (Module 14)</summary>

Au module 14, nous avons explore les materiaux PBR et l'eclairage dans Three.js :

- **MeshStandardMaterial** : metalness, roughness + 7 types de textures (albedo, normal, roughness, metalness, AO, emissive, displacement)
- **MeshPhysicalMaterial** : clearcoat, transmission (verre), sheen (tissu), iridescence, anisotropy
- **TextureLoader** : chargement, wrapS/T, repeat, colorSpace, anisotropy de filtrage
- **Environment maps HDR** : RGBELoader + PMREMGenerator pour des reflexions realistes
- **6 types de lumieres** : AmbientLight, HemisphereLight, DirectionalLight, PointLight, SpotLight, RectAreaLight
- **Shadow mapping** : configuration de la shadow camera, mapSize, bias, normalBias, PCFSoftShadowMap
- **ShaderMaterial / RawShaderMaterial** : GLSL personnalise dans Three.js

Nous allons maintenant apprendre a charger des modeles 3D crees dans des logiciels comme Blender, et a jouer leurs animations.

</details>

---

## Formats 3D : le paysage actuel

### Analogie : les formats d'image du 3D

Tout comme les images ont PNG, JPEG, WebP, SVG — chacun avec ses forces — le monde 3D a ses propres formats. Et tout comme WebP a fini par dominer le web pour les images, **glTF 2.0** est devenu le standard du web pour la 3D.

```
Formats 3D ←→ Formats image

glTF 2.0   ←→  WebP    (standard web, compact, features modernes)
FBX        ←→  PSD     (format proprietaire, tres utilise en production)
OBJ        ←→  BMP     (ancien, simple, pas d'animations)
USDZ       ←→  HEIF    (ecosysteme Apple, AR Kit)
```

### Comparaison des formats

| Format | Extension | Animations | PBR | Compression | Ecosysteme |
|--------|-----------|:----------:|:---:|:-----------:|-----------|
| **glTF 2.0** | `.gltf` / `.glb` | Oui | Oui | Draco + KTX2 | Standard Khronos, web-first |
| **FBX** | `.fbx` | Oui | Partiel | Non | Autodesk, standard industrie jeux |
| **OBJ** | `.obj` + `.mtl` | Non | Non | Non | Ancien, universellement supporte |
| **USDZ** | `.usdz` | Oui | Oui | Non | Apple AR, Pixar |
| **PLY** | `.ply` | Non | Non | Non | Scan 3D, point clouds |

### Pourquoi glTF domine le web

```
┌────────────────────────────────────────────────────────────────────┐
│                     Pourquoi glTF 2.0 ?                            │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. Format ouvert (Khronos Group, meme organisation que WebGL)    │
│  2. Concu pour le web : JSON + binaire, pas de parsing complexe   │
│  3. PBR natif : metallic-roughness workflow integre               │
│  4. Animations : skeletal, morph targets, keyframes               │
│  5. Extensions : compression Draco, textures KTX2, lights, ...   │
│  6. .glb = tout en un seul fichier (pas de dependances externes)  │
│  7. Tous les logiciels 3D l'exportent : Blender, Maya, 3ds Max   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### .gltf vs .glb

```
┌─── .gltf ──────────────────────────┐  ┌─── .glb ──────────────────────────┐
│                                      │  │                                    │
│  scene.gltf    (JSON, lisible)      │  │  model.glb   (binaire, tout-en-un)│
│  scene.bin     (donnees binaires)   │  │                                    │
│  textures/     (fichiers separes)   │  │  JSON + BIN + textures             │
│    albedo.png                        │  │  empaquetes en un seul fichier     │
│    normal.png                        │  │                                    │
│                                      │  │  → Ideal pour le web              │
│  → Utile pour le debug              │  │  → Un seul fetch HTTP              │
│  → Plusieurs fichiers a servir      │  │  → Pas de CORS sur les textures   │
└──────────────────────────────────────┘  └────────────────────────────────────┘
```

---

## GLTFLoader : charger un modele

### Chargement de base

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

// ─── Chargement avec callback ─────────────────────────────
loader.load(
  '/models/robot.glb',
  // onLoad
  (gltf) => {
    console.log('Modele charge :', gltf);
    scene.add(gltf.scene);
  },
  // onProgress
  (event) => {
    const percent = (event.loaded / event.total) * 100;
    console.log(`Chargement : ${percent.toFixed(1)}%`);
  },
  // onError
  (error) => {
    console.error('Erreur de chargement :', error);
  }
);

// ─── Chargement avec async/await (recommande) ─────────────
async function loadModel(): Promise<void> {
  const gltf = await loader.loadAsync('/models/robot.glb');
  scene.add(gltf.scene);
}
```

### Structure du resultat GLTF

Quand un modele est charge, le callback recoit un objet `GLTF` dont la structure est riche :

```typescript
interface GLTFResult {
  scene: THREE.Group;              // la hierarchie 3D complete
  scenes: THREE.Group[];           // toutes les scenes du fichier
  animations: THREE.AnimationClip[]; // tous les clips d'animation
  cameras: THREE.Camera[];         // cameras embarquees dans le fichier
  asset: {                         // metadonnees
    generator: string;
    version: string;
  };
  parser: GLTFParser;              // acces bas niveau au parsing
  userData: Record<string, unknown>; // donnees custom de l'artiste
}
```

```typescript
async function inspectModel(): Promise<void> {
  const gltf = await loader.loadAsync('/models/character.glb');

  console.log('Scene :', gltf.scene);
  console.log('Animations :', gltf.animations.length);
  console.log('Cameras :', gltf.cameras.length);
  console.log('Generator :', gltf.asset.generator); // ex: "Blender 3.6"

  // ─── Lister tous les objets de la scene ───────────────
  gltf.scene.traverse((child) => {
    console.log(
      `${child.type}: "${child.name}"`,
      child instanceof THREE.Mesh ? `(${child.geometry.attributes.position.count} vertices)` : ''
    );
  });

  // ─── Lister les animations ────────────────────────────
  gltf.animations.forEach((clip) => {
    console.log(`Animation: "${clip.name}" — duree: ${clip.duration.toFixed(2)}s`);
  });

  scene.add(gltf.scene);
}
```

### Configurer les materiaux et les ombres

Les modeles glTF importent leurs materiaux PBR, mais il faut souvent activer les ombres et ajuster l'environment map :

```typescript
async function loadWithShadows(): Promise<void> {
  const gltf = await loader.loadAsync('/models/scene.glb');

  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // ─── Activer les ombres sur chaque mesh ─────────
      child.castShadow = true;
      child.receiveShadow = true;

      // ─── Appliquer l'environment map de la scene ────
      if (child.material instanceof THREE.MeshStandardMaterial) {
        child.material.envMapIntensity = 0.8;
      }
    }
  });

  scene.add(gltf.scene);
}
```

---

## DRACOLoader : compression de geometrie

### Le probleme

Un modele 3D detaille peut facilement peser 50 Mo+ en geometrie brute. **Draco** est un algorithme de compression developpe par Google qui reduit la taille des geometries de **60 a 90%**.

```
Sans Draco :   model.glb = 45 Mo
Avec Draco :   model.glb =  5 Mo   (compression ~89%)
```

### Configuration

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ─── Configurer le decoder Draco ──────────────────────────
const dracoLoader = new DRACOLoader();

// Le decoder est un fichier WASM heberge separement
// Three.js fournit les fichiers dans node_modules/three/examples/jsm/libs/draco/
dracoLoader.setDecoderPath('/draco/');  // chemin vers les fichiers decoder
dracoLoader.setDecoderConfig({ type: 'js' }); // 'js' ou 'wasm'
dracoLoader.preload(); // pre-charger le decoder (optionnel, recommande)

// ─── Associer DRACOLoader au GLTFLoader ───────────────────
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// Maintenant le GLTFLoader decompresse automatiquement les geometries Draco
const gltf = await gltfLoader.loadAsync('/models/city_compressed.glb');
scene.add(gltf.scene);

// ─── Liberer le decoder quand on n'en a plus besoin ───────
// (important : le decoder utilise un Web Worker)
dracoLoader.dispose();
```

:::tip Fichiers du decoder Draco
Copiez les fichiers du decoder dans votre dossier public :
```bash
cp -r node_modules/three/examples/jsm/libs/draco/ public/draco/
```
Les fichiers necessaires : `draco_decoder.js`, `draco_decoder.wasm`, `draco_wasm_wrapper.js`
:::

### Compresser un modele avec glTF-Transform

```bash
# Installer glTF-Transform (outil CLI)
npm install -g @gltf-transform/cli

# Compresser la geometrie avec Draco
gltf-transform draco model.glb model_draco.glb

# Compresser les textures en KTX2 (Basis Universal)
gltf-transform ktx2 model.glb model_ktx2.glb --slots "baseColor,normal,emissive"

# Combiner les deux
gltf-transform draco model.glb model_opt.glb
gltf-transform ktx2 model_opt.glb model_final.glb
```

---

## KTX2Loader : textures GPU compressees

### Pourquoi compresser les textures ?

Les textures sont souvent le plus gros poste de memoire GPU. Une texture 4K RGBA non compressee occupe **64 Mo** en VRAM. Les formats GPU compresses (BCn, ETC, ASTC) restent compresses en VRAM.

```
Texture 4096x4096 RGBA :
  PNG sur disque    :   8 Mo  (compresse, mais decompresse en 64 Mo en VRAM)
  KTX2/Basis        :   2 Mo  (compresse sur disque ET en VRAM : ~16 Mo)
```

### Configuration

```typescript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ─── Configurer KTX2Loader ───────────────────────────────
const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('/basis/');  // fichiers du transcodeur
ktx2Loader.detectSupport(renderer);       // detecte le format GPU supporte

// ─── Associer au GLTFLoader ──────────────────────────────
const gltfLoader = new GLTFLoader();
gltfLoader.setKTX2Loader(ktx2Loader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder); // alternative a Draco

const gltf = await gltfLoader.loadAsync('/models/scene_ktx2.glb');
scene.add(gltf.scene);
```

:::info Formats GPU par plateforme
Basis Universal (utilise par KTX2) transcode automatiquement vers le format optimal :
- **Desktop** : BC7 (DirectX) ou BC1/BC3 (ancien)
- **Android** : ETC2/EAC
- **iOS** : ASTC
- **Fallback** : RGBA brut si rien n'est supporte
:::

---

## Hierarchie de scene

### Parcourir la scene

Chaque modele glTF importe une hierarchie d'objets — comme un arbre DOM en HTML. Three.js fournit des methodes pour la parcourir :

```typescript
// ─── traverse() : parcours recursif de tous les descendants ───
gltf.scene.traverse((node) => {
  // node peut etre : Group, Mesh, Bone, Light, Camera, Object3D...
  console.log(`${node.type}: "${node.name}"`);
});

// ─── traverseVisible() : ignore les objets invisibles ────────
gltf.scene.traverseVisible((node) => {
  // Seuls les objets avec visible=true
});

// ─── getObjectByName() : recherche par nom ────────────────────
const head = gltf.scene.getObjectByName('Head');
if (head) {
  head.rotation.y = Math.PI / 4;
}

// ─── getObjectByProperty() : recherche par propriete ──────────
const firstMesh = gltf.scene.getObjectByProperty('type', 'Mesh');

// ─── children : acces direct aux enfants ──────────────────────
const root = gltf.scene;
console.log('Enfants directs :', root.children.length);
root.children.forEach((child) => {
  console.log(` - ${child.name} (${child.type})`);
});
```

### Exemple : inventaire d'un modele

```typescript
interface SceneInventory {
  meshes: THREE.Mesh[];
  bones: THREE.Bone[];
  lights: THREE.Light[];
  totalVertices: number;
  totalTriangles: number;
  materials: Set<THREE.Material>;
}

function inventoryScene(root: THREE.Object3D): SceneInventory {
  const inventory: SceneInventory = {
    meshes: [],
    bones: [],
    lights: [],
    totalVertices: 0,
    totalTriangles: 0,
    materials: new Set(),
  };

  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      inventory.meshes.push(node);
      const posAttr = node.geometry.attributes.position;
      if (posAttr) {
        inventory.totalVertices += posAttr.count;
      }
      if (node.geometry.index) {
        inventory.totalTriangles += node.geometry.index.count / 3;
      } else if (posAttr) {
        inventory.totalTriangles += posAttr.count / 3;
      }
      // Material peut etre un tableau (multi-material)
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => inventory.materials.add(m));
    }
    if (node instanceof THREE.Bone) {
      inventory.bones.push(node);
    }
    if (node instanceof THREE.Light) {
      inventory.lights.push(node);
    }
  });

  return inventory;
}

// Utilisation
const inv = inventoryScene(gltf.scene);
console.log(`Meshes: ${inv.meshes.length}`);
console.log(`Bones: ${inv.bones.length}`);
console.log(`Vertices: ${inv.totalVertices.toLocaleString()}`);
console.log(`Triangles: ${inv.totalTriangles.toLocaleString()}`);
console.log(`Materials uniques: ${inv.materials.size}`);
```

---

## AnimationMixer : le systeme d'animation

### Analogie : le lecteur de musique

Pensez a AnimationMixer comme un **lecteur de musique multi-piste** :

```
AnimationMixer  =  Lecteur de musique
AnimationClip   =  Morceau de musique (idle.mp3, walk.mp3, run.mp3)
AnimationAction =  Piste en cours (play, pause, volume, vitesse)
mixer.update()  =  Avancer la tete de lecture chaque frame
crossFadeTo()   =  Fondu enchaine entre deux morceaux
```

### Setup de base

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const clock = new THREE.Clock();
let mixer: THREE.AnimationMixer | null = null;

async function loadAnimatedModel(): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync('/models/character.glb');
  scene.add(gltf.scene);

  // ─── Creer le mixer attache au modele ──────────────────
  mixer = new THREE.AnimationMixer(gltf.scene);

  // ─── Lister les animations disponibles ─────────────────
  console.log('Animations disponibles :');
  gltf.animations.forEach((clip, index) => {
    console.log(`  [${index}] "${clip.name}" — ${clip.duration.toFixed(2)}s`);
  });

  // ─── Jouer la premiere animation ───────────────────────
  if (gltf.animations.length > 0) {
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }
}

// ─── Mettre a jour le mixer dans le render loop ────────────
function animate(): void {
  requestAnimationFrame(animate);

  const delta = clock.getDelta(); // temps ecoule depuis le dernier frame
  if (mixer) {
    mixer.update(delta); // CRUCIAL : avance les animations
  }

  renderer.render(scene, camera);
}

animate();
```

:::warning N'oubliez pas `mixer.update(delta)` !
L'erreur la plus courante est d'oublier d'appeler `mixer.update()` dans le render loop. Sans cet appel, les animations ne bougent pas. Le `delta` doit etre en **secondes** (c'est ce que `clock.getDelta()` renvoie).
:::

---

## AnimationClip et AnimationAction

### AnimationClip : le morceau

Un `AnimationClip` est un ensemble de **KeyframeTrack** — des courbes d'animation pour chaque propriete animee :

```typescript
// ─── Structure d'un AnimationClip ─────────────────────────
const clip = gltf.animations[0];

console.log('Nom :', clip.name);           // "idle"
console.log('Duree :', clip.duration);     // 2.5 (secondes)
console.log('Tracks :', clip.tracks.length); // nombre de proprietes animees

clip.tracks.forEach((track) => {
  console.log(
    `  Track: ${track.name}`,     // ex: "Hips.position", "LeftArm.quaternion"
    `type: ${track.ValueTypeName}`, // "vector" | "quaternion" | "number"
    `keys: ${track.times.length}`   // nombre de keyframes
  );
});
```

### AnimationAction : les controles

Un `AnimationAction` est le controleur qui joue un clip sur le mixer :

```typescript
const mixer = new THREE.AnimationMixer(model);
const clips = gltf.animations;

// ─── Creer des actions pour chaque clip ───────────────────
const actions: Map<string, THREE.AnimationAction> = new Map();

clips.forEach((clip) => {
  const action = mixer.clipAction(clip);
  actions.set(clip.name, action);
});

// ─── Controles de base ────────────────────────────────────
const idle = actions.get('idle')!;

idle.play();     // demarre l'animation
idle.stop();     // arrete et remet au debut
idle.paused = true;  // pause sans reset
idle.paused = false; // reprend

// ─── Proprietes de lecture ────────────────────────────────
idle.timeScale = 1.0;       // vitesse (2.0 = double, 0.5 = moitie)
idle.setEffectiveWeight(1.0); // influence (0 = pas d'effet, 1 = plein effet)
idle.setLoop(THREE.LoopRepeat, Infinity); // boucle infinie
idle.clampWhenFinished = true; // reste sur la derniere frame a la fin

// ─── Modes de boucle ──────────────────────────────────────
idle.setLoop(THREE.LoopOnce, 1);         // joue une seule fois
idle.setLoop(THREE.LoopRepeat, Infinity); // boucle normale
idle.setLoop(THREE.LoopPingPong, Infinity); // aller-retour
```

### Enchainer les animations avec crossFadeTo

Le crossfade permet une transition fluide entre deux animations :

```typescript
class CharacterAnimationController {
  private mixer: THREE.AnimationMixer;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentAction: THREE.AnimationAction | null = null;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);

    clips.forEach((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(0);
      this.actions.set(clip.name, action);
    });
  }

  play(name: string, fadeDuration: number = 0.5): void {
    const nextAction = this.actions.get(name);
    if (!nextAction) {
      console.warn(`Animation "${name}" introuvable`);
      return;
    }

    if (this.currentAction === nextAction) return;

    // ─── Activer la nouvelle action ──────────────────────
    nextAction.reset();
    nextAction.setEffectiveWeight(1);
    nextAction.setEffectiveTimeScale(1);
    nextAction.play();

    // ─── Crossfade depuis l'action en cours ──────────────
    if (this.currentAction) {
      this.currentAction.crossFadeTo(nextAction, fadeDuration, true);
    }

    this.currentAction = nextAction;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }
}

// ─── Utilisation ──────────────────────────────────────────
const controller = new CharacterAnimationController(gltf.scene, gltf.animations);
controller.play('idle');

// Quand le joueur appuie sur une touche :
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'w': controller.play('walk', 0.3); break;
    case 'W': controller.play('run', 0.3); break;
    case ' ': controller.play('jump', 0.1); break;
  }
});

document.addEventListener('keyup', (e) => {
  if (['w', 'W', ' '].includes(e.key)) {
    controller.play('idle', 0.5);
  }
});

// Dans le render loop
function animate(): void {
  requestAnimationFrame(animate);
  controller.update(clock.getDelta());
  renderer.render(scene, camera);
}
```

### Evenements d'animation

```typescript
// ─── Ecouter la fin d'une animation ──────────────────────
mixer.addEventListener('finished', (event) => {
  const action = event.action as THREE.AnimationAction;
  const clip = action.getClip();
  console.log(`Animation "${clip.name}" terminee`);

  // Revenir a idle apres un saut
  if (clip.name === 'jump') {
    controller.play('idle', 0.3);
  }
});

// ─── Ecouter les boucles ─────────────────────────────────
mixer.addEventListener('loop', (event) => {
  const action = event.action as THREE.AnimationAction;
  console.log(`Animation "${action.getClip().name}" boucle`);
});
```

---

## Animations squelettiques

### Bones et SkinnedMesh

Les animations squelettiques utilisent un **squelette** (ensemble de bones) pour deformer un mesh. C'est exactement comme un pantin avec des articulations :

```
┌─────────────────────────────────────────────────────────┐
│               Animation squelettique                     │
│                                                          │
│              [Head]                                      │
│                |                                         │
│             [Spine2]                                     │
│            /        \                                    │
│      [LeftArm]   [RightArm]                             │
│         |            |                                   │
│    [LeftHand]   [RightHand]    ← Bones (squelette)      │
│            \        /                                    │
│             [Spine1]                                     │
│                |                                         │
│             [Hips]                                       │
│            /      \                                      │
│      [LeftLeg]  [RightLeg]                               │
│         |          |                                     │
│     [LeftFoot] [RightFoot]                               │
│                                                          │
│  Le mesh (peau) est deforme par les bones               │
│  Chaque vertex a des poids (weights) indiquant          │
│  quels bones l'influencent et a quel degre              │
└─────────────────────────────────────────────────────────┘
```

```typescript
// ─── Inspecter le squelette d'un modele ───────────────────
gltf.scene.traverse((node) => {
  if (node instanceof THREE.SkinnedMesh) {
    console.log(`SkinnedMesh: "${node.name}"`);
    console.log(`  Skeleton:`, node.skeleton);
    console.log(`  Bones:`, node.skeleton.bones.length);
    console.log(`  Bind matrix:`, node.bindMatrix);

    // Lister les bones
    node.skeleton.bones.forEach((bone, index) => {
      console.log(`    [${index}] ${bone.name}`);
    });
  }
});
```

### SkeletonHelper : visualiser le squelette

```typescript
import { SkeletonHelper } from 'three';

// ─── Ajouter un helper pour voir le squelette ────────────
const skeletonHelper = new THREE.SkeletonHelper(gltf.scene);
skeletonHelper.visible = true;
scene.add(skeletonHelper);

// ─── Toggle avec une touche ──────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'b') {
    skeletonHelper.visible = !skeletonHelper.visible;
  }
});
```

### Manipuler les bones directement

```typescript
// ─── Tourner la tete du personnage vers un point ──────────
const head = gltf.scene.getObjectByName('Head') as THREE.Bone | undefined;

function lookAt(target: THREE.Vector3): void {
  if (!head) return;

  // Calculer la direction locale
  const worldPos = new THREE.Vector3();
  head.getWorldPosition(worldPos);

  const direction = target.clone().sub(worldPos).normalize();

  // Limiter la rotation pour eviter des poses impossibles
  const yaw = Math.atan2(direction.x, direction.z);
  const pitch = Math.asin(direction.y);

  head.rotation.y = THREE.MathUtils.clamp(yaw, -Math.PI / 3, Math.PI / 3);
  head.rotation.x = THREE.MathUtils.clamp(pitch, -Math.PI / 4, Math.PI / 4);
}
```

---

## Morph targets (blend shapes)

### Le concept

Les morph targets permettent de deformer un mesh entre des formes predefinies. C'est la technique standard pour les **expressions faciales** :

```
Base mesh  ──→  Morph "smile"    (poids 0.0 → 1.0)
           ──→  Morph "blink"    (poids 0.0 → 1.0)
           ──→  Morph "surprise" (poids 0.0 → 1.0)

Resultat = Base + smile*0.7 + blink*0.3 + surprise*0.0
```

```typescript
// ─── Acceder aux morph targets ────────────────────────────
gltf.scene.traverse((node) => {
  if (node instanceof THREE.Mesh && node.morphTargetInfluences) {
    console.log(`Mesh "${node.name}" a des morph targets :`);
    console.log('  Dictionnaire :', node.morphTargetDictionary);
    console.log('  Influences :', node.morphTargetInfluences);

    // Exemple de dictionnaire :
    // { "smile": 0, "blink_L": 1, "blink_R": 2, "surprise": 3 }
  }
});

// ─── Modifier les morph targets manuellement ─────────────
function setExpression(
  mesh: THREE.Mesh,
  name: string,
  weight: number
): void {
  if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

  const index = mesh.morphTargetDictionary[name];
  if (index !== undefined) {
    mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(weight, 0, 1);
  }
}

// Faire sourire le personnage
const faceMesh = gltf.scene.getObjectByName('Face') as THREE.Mesh;
setExpression(faceMesh, 'smile', 0.8);
setExpression(faceMesh, 'blink_L', 0.0);
setExpression(faceMesh, 'blink_R', 0.0);
```

### Animer les morph targets

Les morph targets peuvent etre animes dans les clips d'animation glTF, ou manuellement :

```typescript
// ─── Animation manuelle de clignement ─────────────────────
let blinkTimer = 0;
const BLINK_INTERVAL = 3.0; // cligner toutes les 3 secondes
const BLINK_SPEED = 0.15;   // duree du clignement

function updateBlink(delta: number): void {
  if (!faceMesh?.morphTargetInfluences || !faceMesh.morphTargetDictionary) return;

  blinkTimer += delta;
  const blinkCycle = blinkTimer % BLINK_INTERVAL;

  let blinkWeight = 0;
  if (blinkCycle < BLINK_SPEED) {
    blinkWeight = blinkCycle / BLINK_SPEED; // fermer
  } else if (blinkCycle < BLINK_SPEED * 2) {
    blinkWeight = 1 - (blinkCycle - BLINK_SPEED) / BLINK_SPEED; // ouvrir
  }

  const leftIdx = faceMesh.morphTargetDictionary['blink_L'];
  const rightIdx = faceMesh.morphTargetDictionary['blink_R'];
  if (leftIdx !== undefined) faceMesh.morphTargetInfluences[leftIdx] = blinkWeight;
  if (rightIdx !== undefined) faceMesh.morphTargetInfluences[rightIdx] = blinkWeight;
}
```

---

## InstancedMesh : milliers d'objets

### Le probleme des draw calls

Chaque `scene.add(mesh)` = un draw call GPU. 10 000 arbres = 10 000 draw calls = ~15 FPS. `InstancedMesh` resout ce probleme en dessinant N copies d'une meme geometrie en **un seul draw call**.

```
Sans instancing :   10 000 meshes  →  10 000 draw calls  →  15 FPS
Avec instancing :   1 InstancedMesh  →  1 draw call       →  60 FPS
```

### API InstancedMesh

```typescript
import * as THREE from 'three';

// ─── Creer un InstancedMesh avec 10 000 instances ────────
const count = 10_000;
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x44aa88 });

const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
instancedMesh.castShadow = true;
instancedMesh.receiveShadow = true;

// ─── Positionner chaque instance ──────────────────────────
const dummy = new THREE.Object3D(); // objet temporaire pour construire la matrice

for (let i = 0; i < count; i++) {
  // Position aleatoire dans un volume
  dummy.position.set(
    (Math.random() - 0.5) * 100,
    Math.random() * 5,
    (Math.random() - 0.5) * 100
  );

  // Rotation aleatoire
  dummy.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    0
  );

  // Echelle aleatoire
  const scale = 0.5 + Math.random() * 1.5;
  dummy.scale.setScalar(scale);

  // Appliquer la matrice de transformation
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(i, dummy.matrix);
}

// ─── Couleur par instance (optionnel) ─────────────────────
const color = new THREE.Color();
for (let i = 0; i < count; i++) {
  color.setHSL(Math.random(), 0.7, 0.5);
  instancedMesh.setColorAt(i, color);
}

// ─── Signaler que les buffers ont change ──────────────────
instancedMesh.instanceMatrix.needsUpdate = true;
if (instancedMesh.instanceColor) {
  instancedMesh.instanceColor.needsUpdate = true;
}

scene.add(instancedMesh);
```

### Animer des instances

```typescript
// ─── Animer individuellement chaque instance ──────────────
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();

function animateInstances(time: number): void {
  for (let i = 0; i < count; i++) {
    // Recuperer la matrice actuelle
    instancedMesh.getMatrixAt(i, matrix);
    matrix.decompose(position, quaternion, scale);

    // Animer la position Y (flottement)
    position.y = Math.sin(time * 2 + i * 0.1) * 0.5 + 2.5;

    // Reconstruire la matrice
    matrix.compose(position, quaternion, scale);
    instancedMesh.setMatrixAt(i, matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
}
```

### Instancier un modele glTF

```typescript
async function createForest(): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync('/models/tree.glb');

  // Trouver le mesh principal de l'arbre
  let treeGeometry: THREE.BufferGeometry | null = null;
  let treeMaterial: THREE.Material | null = null;

  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh && !treeGeometry) {
      treeGeometry = node.geometry;
      treeMaterial = node.material;
    }
  });

  if (!treeGeometry || !treeMaterial) return;

  // ─── Creer la foret instancée ──────────────────────────
  const treeCount = 5000;
  const forest = new THREE.InstancedMesh(treeGeometry, treeMaterial, treeCount);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < treeCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 95;

    dummy.position.set(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    );
    dummy.rotation.y = Math.random() * Math.PI * 2;

    const s = 0.8 + Math.random() * 0.6;
    dummy.scale.set(s, s + Math.random() * 0.4, s);

    dummy.updateMatrix();
    forest.setMatrixAt(i, dummy.matrix);
  }

  forest.instanceMatrix.needsUpdate = true;
  forest.castShadow = true;
  forest.receiveShadow = true;
  scene.add(forest);
}
```

---

## Loading manager : suivi global du chargement

```typescript
import * as THREE from 'three';

// ─── Manager de chargement centralise ─────────────────────
const loadingManager = new THREE.LoadingManager();

loadingManager.onStart = (url, loaded, total) => {
  console.log(`Debut chargement : ${url} (${loaded}/${total})`);
};

loadingManager.onProgress = (url, loaded, total) => {
  const percent = (loaded / total) * 100;
  updateProgressBar(percent);
  console.log(`Progres : ${percent.toFixed(0)}% (${url})`);
};

loadingManager.onLoad = () => {
  console.log('Tous les assets sont charges !');
  hideLoadingScreen();
  startApp();
};

loadingManager.onError = (url) => {
  console.error(`Erreur de chargement : ${url}`);
};

// ─── Passer le manager a tous les loaders ─────────────────
const textureLoader = new THREE.TextureLoader(loadingManager);
const gltfLoader = new GLTFLoader(loadingManager);
const audioLoader = new THREE.AudioLoader(loadingManager);

// Tous les chargements sont maintenant suivis par le manager
textureLoader.load('/textures/floor.jpg', (tex) => { /* ... */ });
gltfLoader.load('/models/scene.glb', (gltf) => { /* ... */ });

function updateProgressBar(percent: number): void {
  const bar = document.getElementById('progress-bar');
  if (bar) bar.style.width = `${percent}%`;
}

function hideLoadingScreen(): void {
  const screen = document.getElementById('loading-screen');
  if (screen) screen.style.display = 'none';
}

function startApp(): void {
  // Lancer le render loop
  animate();
}
```

---

## Exercice pratique

### Enonce

Creez une application qui :

1. Charge un modele glTF anime (utilisez un modele gratuit de [Mixamo](https://www.mixamo.com/) ou [Ready Player Me](https://readyplayer.me/))
2. Affiche la liste des animations disponibles dans la console
3. Joue l'animation "idle" par defaut
4. Permet de basculer entre idle / walk / run avec les touches du clavier (crossfade de 0.3s)
5. Affiche le SkeletonHelper (toggle avec la touche "B")
6. Ajoute 100 instances d'un arbre ou rocher autour du personnage

**Indices** :
- Utilisez la classe `CharacterAnimationController` vue plus haut comme point de depart
- Les modeles Mixamo exportent en glTF avec des noms d'animation comme "idle", "walking", "running"
- N'oubliez pas `mixer.update(delta)` dans le render loop

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─── Setup ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 30, 80);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 200
);
camera.position.set(0, 3, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.update();

const clock = new THREE.Clock();

// ─── Lumieres ─────────────────────────────────────────────
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 15, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0003;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.3));

// ─── Sol ──────────────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({ color: 0x3a7d44, roughness: 0.9 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ─── Animation controller ─────────────────────────────────
class CharacterAnimationController {
  private mixer: THREE.AnimationMixer;
  private actions: Map<string, THREE.AnimationAction> = new Map();
  private currentAction: THREE.AnimationAction | null = null;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(model);

    clips.forEach((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(0);
      this.actions.set(clip.name.toLowerCase(), action);
      console.log(`  Animation registree : "${clip.name}" (${clip.duration.toFixed(2)}s)`);
    });
  }

  get animationMixer(): THREE.AnimationMixer {
    return this.mixer;
  }

  play(name: string, fadeDuration: number = 0.5): void {
    const nextAction = this.actions.get(name.toLowerCase());
    if (!nextAction) {
      console.warn(`Animation "${name}" introuvable`);
      return;
    }
    if (this.currentAction === nextAction) return;

    nextAction.reset();
    nextAction.setEffectiveWeight(1);
    nextAction.setEffectiveTimeScale(1);
    nextAction.play();

    if (this.currentAction) {
      this.currentAction.crossFadeTo(nextAction, fadeDuration, true);
    }
    this.currentAction = nextAction;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }
}

// ─── Charger le personnage ────────────────────────────────
let controller: CharacterAnimationController | null = null;
let skeletonHelper: THREE.SkeletonHelper | null = null;

async function loadCharacter(): Promise<void> {
  const gltfLoader = new GLTFLoader();
  const gltf = await gltfLoader.loadAsync('/models/character.glb');

  // Activer les ombres
  gltf.scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(gltf.scene);

  // Skeleton helper
  skeletonHelper = new THREE.SkeletonHelper(gltf.scene);
  skeletonHelper.visible = false;
  scene.add(skeletonHelper);

  // Controller
  console.log(`Modele charge — ${gltf.animations.length} animations :`);
  controller = new CharacterAnimationController(gltf.scene, gltf.animations);
  controller.play('idle');
}

// ─── Creer des rochers instancies ─────────────────────────
function createRocks(): void {
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.9,
    flatShading: true,
  });

  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 100);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < 100; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 30;

    dummy.position.set(
      Math.cos(angle) * radius,
      0,
      Math.sin(angle) * radius
    );
    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      0
    );
    const s = 0.3 + Math.random() * 1.2;
    dummy.scale.set(s * 1.2, s * 0.7, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);

    color.setHSL(0, 0, 0.3 + Math.random() * 0.3);
    rocks.setColorAt(i, color);
  }

  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  scene.add(rocks);
}

// ─── Controles clavier ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (!controller) return;
  switch (e.key.toLowerCase()) {
    case 'w': controller.play(e.shiftKey ? 'run' : 'walk', 0.3); break;
    case 'b':
      if (skeletonHelper) skeletonHelper.visible = !skeletonHelper.visible;
      break;
  }
});

document.addEventListener('keyup', (e) => {
  if (!controller) return;
  if (e.key.toLowerCase() === 'w') {
    controller.play('idle', 0.5);
  }
});

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Init et render loop ──────────────────────────────────
loadCharacter();
createRocks();

function animate(): void {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  if (controller) controller.update(delta);
  controls.update();

  renderer.render(scene, camera);
}

animate();
```

</details>

---

## Resume

| Concept | API Three.js | Details cles |
|---------|-------------|-------------|
| Format 3D web | glTF 2.0 (`.glb`/`.gltf`) | Standard Khronos, PBR natif, animations, compression |
| Charger un modele | `GLTFLoader.loadAsync()` | Retourne `{ scene, animations, cameras, asset }` |
| Compression geometrie | `DRACOLoader` | Reduction 60-90%, necessite le decoder WASM |
| Compression textures | `KTX2Loader` | Basis Universal, reste compresse en VRAM |
| Parcours hierarchie | `traverse()`, `getObjectByName()` | Parcours recursif de tous les descendants |
| Systeme d'animation | `AnimationMixer` | `mixer.update(delta)` dans le render loop |
| Clip d'animation | `AnimationClip` | Ensemble de KeyframeTrack, duree, nom |
| Controles lecture | `AnimationAction` | play, stop, pause, timeScale, weight, loop |
| Transition fluide | `crossFadeTo()` | Fondu enchaine entre deux actions |
| Squelette | `SkinnedMesh` + `Bone` | Deformation de mesh par bones + weights |
| Debug squelette | `SkeletonHelper` | Visualise les bones en wireframe |
| Expressions faciales | Morph targets | `morphTargetInfluences[]` + dictionnaire |
| Milliers d'objets | `InstancedMesh` | `setMatrixAt()`, `setColorAt()`, 1 draw call |
| Suivi chargement | `LoadingManager` | onStart, onProgress, onLoad, onError |

---

## Pour aller plus loin

- [Three.js GLTFLoader Documentation](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [glTF Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Mixamo — Animations gratuites](https://www.mixamo.com/)
- [Sketchfab — Modeles glTF](https://sketchfab.com/)
- [glTF-Transform — Optimisation CLI](https://gltf-transform.dev/)
- [Three.js Animation System](https://threejs.org/docs/#manual/en/introduction/Animation-system)
- [Ready Player Me — Avatars 3D](https://readyplayer.me/)
