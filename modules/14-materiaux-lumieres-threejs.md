# Module 14 — Materiaux et lumieres Three.js

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 3/5        | 90 min        | [Lab 14](../labs/lab-14-materiaux-lumieres/) | [Quiz 14](../quizzes/quiz-14-materiaux-lumieres.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Configurer un materiau PBR complet avec toutes ses textures (albedo, normal, roughness, metalness, AO)
- Exploiter les proprietes avancees de MeshPhysicalMaterial (clearcoat, transmission, sheen, iridescence)
- Charger et configurer des textures avec TextureLoader
- Utiliser des environment maps HDR pour des reflexions realistes
- Maitriser les 6 types de lumieres Three.js
- Configurer le shadow mapping avec qualite et performance optimales
- Ecrire un ShaderMaterial personnalise en reutilisant vos connaissances GLSL

---

<details>
<summary>Rappel du cours precedent — Three.js fondamentaux (Module 13)</summary>

Au module 13, nous avons mis en place les bases de Three.js :

- **Scene, Camera, Renderer** : le trio fondamental de toute application
- **PerspectiveCamera** : fov, aspect, near, far et `updateProjectionMatrix()`
- **WebGLRenderer** : antialias, pixelRatio, toneMapping, outputColorSpace
- **Mesh = Geometry + Material** : BoxGeometry, SphereGeometry, BufferGeometry custom
- **MeshBasicMaterial vs MeshStandardMaterial** : sans/avec eclairage
- **Render loop** : `requestAnimationFrame` + `THREE.Clock` pour le delta time
- **OrbitControls** : rotation, zoom, pan avec damping
- **Helpers** : AxesHelper, GridHelper pour le debug

Nous allons maintenant approfondir les materiaux et les lumieres — les deux elements qui rendent une scene realiste.

</details>

---

## Materiaux PBR en detail

### MeshStandardMaterial : toutes les proprietes

Au module 05, vous avez etudie la theorie PBR (Physically Based Rendering) : le modele Cook-Torrance, la BRDF, les concepts de metalness/roughness. Three.js implemente tout cela dans `MeshStandardMaterial`.

```typescript
import * as THREE from 'three';

const material = new THREE.MeshStandardMaterial({
  // ─── Couleur de base (albedo) ─────────────────────────
  color: 0xffffff,           // couleur multiplicative avec la texture map
  map: albedoTexture,        // texture de couleur (sRGB)

  // ─── Metalness / Roughness ────────────────────────────
  metalness: 0.0,            // 0 = dielectrique, 1 = metal
  roughness: 0.5,            // 0 = miroir parfait, 1 = completement mat
  metalnessMap: metalTexture, // texture de metalness (canal R)
  roughnessMap: roughTexture, // texture de roughness (canal R)

  // ─── Normal map ───────────────────────────────────────
  normalMap: normalTexture,   // ajoute du detail geometrique sans vertices
  normalMapType: THREE.TangentSpaceNormalMap, // type par defaut
  normalScale: new THREE.Vector2(1, 1),       // intensite du normal map

  // ─── Ambient Occlusion ────────────────────────────────
  aoMap: aoTexture,           // zones occultees (sombres dans les creux)
  aoMapIntensity: 1.0,        // intensite de l'AO
  // ⚠️ aoMap necessite un 2e jeu d'UVs : geometry.setAttribute('uv2', ...)

  // ─── Emissive ─────────────────────────────────────────
  emissive: 0x000000,         // couleur emise (s'ajoute a l'eclairage)
  emissiveMap: emissiveTexture,
  emissiveIntensity: 1.0,

  // ─── Displacement ─────────────────────────────────────
  displacementMap: displacementTexture, // deplace les vertices (pas un trick visuel)
  displacementScale: 0.1,               // amplitude du deplacement
  displacementBias: 0.0,                // offset

  // ─── Bump map (alternative au normal map) ─────────────
  // bumpMap: bumpTexture,     // simule le relief via les normales
  // bumpScale: 0.05,

  // ─── Alpha ────────────────────────────────────────────
  alphaMap: alphaTexture,     // texture de transparence
  transparent: true,          // activer le alpha blending
  opacity: 1.0,               // opacite globale

  // ─── Rendu ────────────────────────────────────────────
  side: THREE.FrontSide,      // FrontSide | BackSide | DoubleSide
  flatShading: false,          // true = shading par face (low-poly look)
  wireframe: false,
  envMapIntensity: 1.0,        // intensite des reflexions de l'env map
});
```

### Textures PBR : convention de nommage

```
textures/
  brick_wall/
    brick_wall_albedo.jpg      ← couleur (sRGB)
    brick_wall_normal.jpg      ← normales (linear)
    brick_wall_roughness.jpg   ← rugosite (linear, canal R)
    brick_wall_metalness.jpg   ← metallique (linear, canal R)
    brick_wall_ao.jpg          ← ambient occlusion (linear)
    brick_wall_height.jpg      ← displacement (linear)
```

:::tip Sources de textures PBR gratuites
- [ambientCG](https://ambientcg.com/) — CC0, haute qualite
- [Poly Haven](https://polyhaven.com/) — CC0, textures + HDRIs + modeles
- [textures.com](https://www.textures.com/) — gratuit avec compte
:::

---

## MeshPhysicalMaterial : proprietes avancees

### Clearcoat — peinture de voiture, parquet verni

```typescript
const carPaint = new THREE.MeshPhysicalMaterial({
  color: 0xcc0000,
  metalness: 0.9,
  roughness: 0.5,

  // Couche de vernis par-dessus le materiau de base
  clearcoat: 1.0,              // intensite (0 a 1)
  clearcoatRoughness: 0.05,    // rugosite du vernis
  clearcoatMap: null,           // texture pour varier l'intensite
  clearcoatRoughnessMap: null,  // texture pour varier la rugosite du vernis
  clearcoatNormalMap: null,     // normal map specifique au vernis (peau d'orange)
  clearcoatNormalScale: new THREE.Vector2(0.3, 0.3),
});
```

### Transmission — verre, cristal, liquides

```typescript
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.0,
  roughness: 0.0,

  // Transmission : la lumiere traverse le materiau
  transmission: 1.0,           // 0 = opaque, 1 = totalement transparent
  ior: 1.5,                    // indice de refraction (verre = 1.5, eau = 1.33, diamant = 2.42)
  thickness: 0.5,              // epaisseur du materiau (affecte la refraction)
  thicknessMap: null,          // texture d'epaisseur variable

  // Attenuation de la lumiere dans le materiau
  attenuationColor: new THREE.Color(0x88ccff), // teinte de la lumiere absorbee
  attenuationDistance: 2.0,                      // distance d'absorption

  // ⚠️ Transmission necessite que le renderer fasse un render supplementaire
  // Cout GPU non negligeable — utiliser avec parcimonie
});
```

### Sheen — tissu, velours, satin

```typescript
const fabric = new THREE.MeshPhysicalMaterial({
  color: 0x2244aa,
  metalness: 0.0,
  roughness: 0.8,

  // Sheen : micro-fibres qui diffusent la lumiere sur les bords
  sheen: 1.0,                  // intensite
  sheenRoughness: 0.5,         // rugosite du sheen
  sheenColor: new THREE.Color(0x4488ff), // couleur des micro-fibres
  sheenRoughnessMap: null,
  sheenColorMap: null,
});
```

### Iridescence — bulles de savon, ailes de papillon

```typescript
const iridescent = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0.0,
  roughness: 0.1,

  // Iridescence : couleur qui change selon l'angle de vue
  iridescence: 1.0,            // intensite
  iridescenceIOR: 1.3,         // indice de refraction de la couche mince
  iridescenceThicknessRange: [100, 400], // epaisseur en nanometres [min, max]
  iridescenceMap: null,         // texture d'intensite
  iridescenceThicknessMap: null, // texture d'epaisseur
});
```

### Anisotropy — metal brosse, cheveux

```typescript
const brushedMetal = new THREE.MeshPhysicalMaterial({
  color: 0xcccccc,
  metalness: 1.0,
  roughness: 0.3,

  // Anisotropie : reflexion etree dans une direction
  anisotropy: 1.0,             // intensite (0 a 1)
  anisotropyRotation: 0,       // rotation en radians
  anisotropyMap: null,          // texture de direction
});
```

---

## TextureLoader : charger des textures

### Chargement de base

```typescript
const textureLoader = new THREE.TextureLoader();

// Chargement synchrone (bloquant — la texture arrive plus tard)
const texture = textureLoader.load('/textures/brick_albedo.jpg');

// Chargement avec callbacks
const textureWithCallbacks = textureLoader.load(
  '/textures/brick_albedo.jpg',
  (texture) => { console.log('Texture chargee !', texture); },
  (progress) => { console.log('Progression :', progress); },
  (error) => { console.error('Erreur de chargement :', error); },
);
```

### Chargement avec LoadingManager

```typescript
// LoadingManager : suivre le chargement de TOUTES les ressources
const manager = new THREE.LoadingManager();

manager.onStart = (url, loaded, total) => {
  console.log(`Debut du chargement : ${url} (${loaded}/${total})`);
};

manager.onProgress = (url, loaded, total) => {
  const percent = Math.round((loaded / total) * 100);
  console.log(`Progression : ${percent}%`);
  // Mettre a jour une barre de chargement
  document.getElementById('progress')!.style.width = `${percent}%`;
};

manager.onLoad = () => {
  console.log('Tout est charge !');
  // Cacher l'ecran de chargement, lancer le rendu
};

manager.onError = (url) => {
  console.error(`Erreur de chargement : ${url}`);
};

// Passer le manager a tous les loaders
const textureLoader = new THREE.TextureLoader(manager);
const albedo = textureLoader.load('/textures/brick_albedo.jpg');
const normal = textureLoader.load('/textures/brick_normal.jpg');
const roughness = textureLoader.load('/textures/brick_roughness.jpg');
```

### Proprietes des textures

```typescript
const texture = textureLoader.load('/textures/brick_albedo.jpg');

// ─── Wrapping (repetition) ──────────────────────────────
texture.wrapS = THREE.RepeatWrapping;   // axe horizontal
texture.wrapT = THREE.RepeatWrapping;   // axe vertical
// Valeurs : ClampToEdgeWrapping (defaut), RepeatWrapping, MirroredRepeatWrapping

// ─── Repetition et offset ───────────────────────────────
texture.repeat.set(2, 2);    // repeter 2x horizontalement et verticalement
texture.offset.set(0.5, 0);  // decaler de 50% horizontalement
texture.rotation = Math.PI / 4; // rotation en radians
texture.center.set(0.5, 0.5);   // centre de rotation

// ─── Filtrage ───────────────────────────────────────────
texture.minFilter = THREE.LinearMipmapLinearFilter; // quand la texture est petite (defaut)
texture.magFilter = THREE.LinearFilter;              // quand la texture est grande (defaut)
// NearestFilter pour un rendu pixelise (retro/voxel)

// ─── Anisotropie ────────────────────────────────────────
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
// Ameliore la nettete des textures vues en angle (sol, murs)

// ─── Color space ────────────────────────────────────────
texture.colorSpace = THREE.SRGBColorSpace;   // pour les textures de couleur (albedo)
// Les textures de donnees (normal, roughness, metalness) restent en Linear
// Three.js gere ca automatiquement pour .map, mais pas pour les textures custom

// ─── Flip Y ─────────────────────────────────────────────
texture.flipY = true; // defaut — attention avec les textures de modeles glTF (qui ont flipY=false)
```

<details>
<summary>Analogie : textures en WebGL brut vs Three.js</summary>

```typescript
// ══════════════════════════════════════════════════
// WebGL brut : ~25 lignes pour charger une texture
// ══════════════════════════════════════════════════
const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

const image = new Image();
image.onload = () => {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
};
image.src = '/textures/brick_albedo.jpg';
// + gerer le sampler uniform dans le shader ...

// ══════════════════════════════════════════════════
// Three.js : 2 lignes
// ══════════════════════════════════════════════════
const texture = textureLoader.load('/textures/brick_albedo.jpg');
material.map = texture;
```

</details>

---

## Environment maps et HDR

### Pourquoi des environment maps ?

Les reflexions realistes necessitent une image de l'environnement. Sans env map, un materiau metallique reflete... rien (noir).

```
   Sans environment map          Avec environment map
   ┌─────────────────┐           ┌─────────────────┐
   │  ●               │           │  ●  (reflets     │
   │ (sphere noire   │           │   du ciel, des  │
   │  — pas de       │           │   batiments...) │
   │  reflexions)    │           │                 │
   └─────────────────┘           └─────────────────┘
```

### CubeTextureLoader — 6 faces

```typescript
const cubeTextureLoader = new THREE.CubeTextureLoader();

const envMap = cubeTextureLoader.load([
  '/textures/env/px.jpg', // positive X (droite)
  '/textures/env/nx.jpg', // negative X (gauche)
  '/textures/env/py.jpg', // positive Y (haut)
  '/textures/env/ny.jpg', // negative Y (bas)
  '/textures/env/pz.jpg', // positive Z (devant)
  '/textures/env/nz.jpg', // negative Z (derriere)
]);

// Appliquer comme fond de scene
scene.background = envMap;

// Appliquer comme source de reflexions pour TOUS les materiaux PBR
scene.environment = envMap;
```

### RGBELoader — HDR equirectangulaire

Le format HDR (`.hdr`) est plus pratique : une seule image au lieu de 6.

```typescript
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const rgbeLoader = new RGBELoader();
const pmremGenerator = new THREE.PMREMGenerator(renderer);

rgbeLoader.load('/textures/env/studio.hdr', (hdrTexture) => {
  // PMREMGenerator : convertir le HDR en cube map pre-filtree pour le PBR
  const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;

  scene.background = envMap;
  scene.environment = envMap;

  // Liberer la texture brute
  hdrTexture.dispose();
  pmremGenerator.dispose();
});
```

:::info PMREMGenerator
PMREM = Pre-filtered Mipmaped Radiance Environment Map. C'est le meme concept que vous avez etudie au module 05 : la convolution de l'env map a differents niveaux de rugosite pour les reflexions speculaires. Three.js le fait automatiquement avec `PMREMGenerator`.
:::

### EXR Loader (alternative haute precision)

```typescript
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const exrLoader = new EXRLoader();
exrLoader.load('/textures/env/studio.exr', (exrTexture) => {
  const envMap = pmremGenerator.fromEquirectangular(exrTexture).texture;
  scene.environment = envMap;
  exrTexture.dispose();
});
```

---

## Les 6 types de lumieres

### Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│                    Types de lumieres                         │
├──────────────────┬───────────────────────────────────────────┤
│ AmbientLight     │ Eclairage uniforme partout (pas d'ombre) │
│ HemisphereLight  │ Ciel + sol (gradient, pas d'ombre)       │
│ DirectionalLight │ Soleil (rayons paralleles, ombres)       │
│ PointLight       │ Ampoule (rayons dans toutes directions)  │
│ SpotLight        │ Projecteur (cone de lumiere, ombres)     │
│ RectAreaLight    │ Fenetre/neon (surface lumineuse)          │
└──────────────────┴───────────────────────────────────────────┘
```

### AmbientLight — eclairage de base

```typescript
// Eclairage uniforme dans toutes les directions
// Pas d'ombre, pas de direction — simule la lumiere indirecte ambiante
const ambient = new THREE.AmbientLight(
  0xffffff, // couleur
  0.3       // intensite
);
scene.add(ambient);
```

### HemisphereLight — ciel et sol

```typescript
// Gradient entre couleur du ciel (dessus) et couleur du sol (dessous)
// Plus realiste qu'AmbientLight, toujours pas d'ombre
const hemisphere = new THREE.HemisphereLight(
  0x87ceeb, // couleur du ciel (skyColor)
  0x362907, // couleur du sol (groundColor)
  0.6       // intensite
);
scene.add(hemisphere);
```

### DirectionalLight — le soleil

```typescript
// Rayons paralleles — simule une source infiniment distante (soleil)
const directional = new THREE.DirectionalLight(0xffffff, 1.0);
directional.position.set(5, 10, 7); // position = direction des rayons
// La lumiere vise (0, 0, 0) par defaut — on peut changer la cible :
// directional.target.position.set(0, 0, 0);
// scene.add(directional.target);
scene.add(directional);
```

### PointLight — ampoule

```typescript
// Rayons dans toutes les directions depuis un point
const point = new THREE.PointLight(
  0xff8800, // couleur
  2.0,      // intensite
  20,       // distance maximale (0 = infini)
  2         // decay (attenuation physique = 2)
);
point.position.set(0, 3, 0);
scene.add(point);
```

### SpotLight — projecteur

```typescript
// Cone de lumiere depuis un point vers une cible
const spot = new THREE.SpotLight(
  0xffffff, // couleur
  2.0,      // intensite
  30,       // distance maximale
  Math.PI / 6, // angle du cone (radians)
  0.3,      // penumbra (0 = bord dur, 1 = bord tres flou)
  2         // decay
);
spot.position.set(0, 10, 0);
spot.target.position.set(0, 0, 0);
scene.add(spot);
scene.add(spot.target);
```

### RectAreaLight — fenetre / neon

```typescript
import { RectAreaLightHelper } from 'three/addons/helpers/RectAreaLightHelper.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// Initialiser les uniforms necessaires (une seule fois)
RectAreaLightUniformsLib.init();

// Surface lumineuse rectangulaire
const rectArea = new THREE.RectAreaLight(
  0xffffff, // couleur
  5,        // intensite
  4,        // largeur
  2         // hauteur
);
rectArea.position.set(0, 3, -3);
rectArea.lookAt(0, 0, 0);
scene.add(rectArea);

// Helper pour visualiser la surface
const helper = new RectAreaLightHelper(rectArea);
rectArea.add(helper);
```

:::warning RectAreaLight
- Ne fonctionne qu'avec `MeshStandardMaterial` et `MeshPhysicalMaterial`
- Ne genere PAS d'ombres (shadow map)
- Necessite `RectAreaLightUniformsLib.init()` avant utilisation
:::

### Recette d'eclairage type

```typescript
// Setup d'eclairage pour une scene exterieure realiste
function setupOutdoorLighting(scene: THREE.Scene): void {
  // Hemisphere pour l'ambiance ciel/sol
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362907, 0.4);
  scene.add(hemi);

  // Directional pour le soleil
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.2);
  sun.position.set(20, 30, 10);
  sun.castShadow = true; // activer les ombres
  scene.add(sun);
}

// Setup d'eclairage pour une scene interieure
function setupIndoorLighting(scene: THREE.Scene): void {
  // Ambient faible
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambient);

  // PointLights pour les lampes
  const lamp1 = new THREE.PointLight(0xffcc77, 1.5, 15, 2);
  lamp1.position.set(-3, 2.5, 0);
  lamp1.castShadow = true;
  scene.add(lamp1);

  // SpotLight pour un eclairage directionnel
  const spot = new THREE.SpotLight(0xffffff, 2.0, 20, Math.PI / 5, 0.4, 2);
  spot.position.set(2, 4, 2);
  spot.castShadow = true;
  scene.add(spot);
}
```

---

## Shadow mapping

### Principe

Le shadow mapping est une technique en deux passes que vous avez vue en theorie au module 05 :

```
Passe 1 : Rendu depuis la lumiere → depth map (shadow map)
Passe 2 : Rendu depuis la camera → comparer depth vs shadow map
```

### Activation

```typescript
// 1. Activer les ombres sur le renderer
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // type de filtrage

// 2. Activer castShadow sur les lumieres
directionalLight.castShadow = true;

// 3. Activer castShadow/receiveShadow sur les meshes
cube.castShadow = true;       // cet objet projette une ombre
cube.receiveShadow = true;    // cet objet recoit les ombres d'autres objets
floor.receiveShadow = true;   // le sol recoit les ombres
```

### Types de shadow map

| Type | Qualite | Performance | Description |
|------|---------|-------------|-------------|
| `BasicShadowMap` | Basse | Rapide | Pas de filtrage — ombres pixelisees |
| `PCFShadowMap` | Moyenne | Moyen | Percentage-Closer Filtering |
| `PCFSoftShadowMap` | Bonne | Moyen+ | PCF avec echantillonnage plus large |
| `VSMShadowMap` | Bonne | Lent | Variance Shadow Map — bords doux |

### Configuration de la shadow camera

```typescript
// La shadow map est rendue depuis une camera attachee a la lumiere
const light = new THREE.DirectionalLight(0xffffff, 1);
light.castShadow = true;

// ─── Resolution de la shadow map ────────────────────────
light.shadow.mapSize.width = 2048;   // defaut : 512
light.shadow.mapSize.height = 2048;  // puissances de 2 recommandees
// 512 = rapide mais pixelise, 2048 = bonne qualite, 4096 = haute qualite (couteux)

// ─── Frustum de la shadow camera ────────────────────────
// Pour DirectionalLight : OrthographicCamera
light.shadow.camera.left = -10;
light.shadow.camera.right = 10;
light.shadow.camera.top = 10;
light.shadow.camera.bottom = -10;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 50;

// ─── Bias (corriger le shadow acne) ─────────────────────
light.shadow.bias = -0.0005;        // decalage en profondeur
light.shadow.normalBias = 0.02;     // decalage le long de la normale
// shadow acne = artefacts stries sur les surfaces eclairees
// Trop de bias = ombres "detachees" (Peter Panning)

// ─── Blur radius (PCFSoftShadowMap uniquement) ─────────
light.shadow.radius = 4; // rayon du flou

// ─── Debug : visualiser la shadow camera ────────────────
const shadowCameraHelper = new THREE.CameraHelper(light.shadow.camera);
scene.add(shadowCameraHelper);
```

:::tip Optimiser les ombres
1. **Reduire le frustum** de la shadow camera au minimum necessaire
2. **Augmenter la resolution** (mapSize) uniquement si visible
3. **Limiter le nombre** de lumieres avec ombres (1-3 max)
4. **Desactiver castShadow** sur les petits objets lointains
5. **Utiliser PCFSoftShadowMap** pour le meilleur rapport qualite/perf
:::

### Ombres pour PointLight et SpotLight

```typescript
// PointLight : 6 shadow maps (une par face du cube)
// Beaucoup plus couteux qu'une DirectionalLight !
const pointLight = new THREE.PointLight(0xffcc00, 2, 20);
pointLight.castShadow = true;
pointLight.shadow.mapSize.set(1024, 1024);
pointLight.shadow.camera.near = 0.1;
pointLight.shadow.camera.far = 20;

// SpotLight : 1 shadow map (perspective)
const spotLight = new THREE.SpotLight(0xffffff, 2);
spotLight.castShadow = true;
spotLight.shadow.mapSize.set(2048, 2048);
spotLight.shadow.camera.near = 0.5;
spotLight.shadow.camera.far = 30;
spotLight.shadow.camera.fov = 30; // angle du cone de la shadow camera
```

---

## LightProbe pour l'eclairage indirect

```typescript
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';

// Generer un LightProbe a partir d'un cube map d'environnement
const lightProbe = new THREE.LightProbe();
scene.add(lightProbe);

// Remplir avec les donnees de l'environment map
rgbeLoader.load('/textures/env/studio.hdr', (hdrTexture) => {
  const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
  lightProbe.copy(LightProbeGenerator.fromCubeTexture(envMap as any));
  lightProbe.intensity = 0.5;
});
```

---

## ShaderMaterial personnalise

### Reutiliser vos connaissances GLSL

Au module 07, vous avez ecrit des shaders GLSL pour WebGL. Three.js permet de reutiliser ces competences directement :

```typescript
// ShaderMaterial : acces aux uniforms/varyings de Three.js
const customMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x00ff88) },
    uTexture: { value: textureLoader.load('/textures/noise.png') },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },

  vertexShader: /* glsl */ `
    uniform float uTime;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;

      // Deformation ondulatoire
      vec3 pos = position;
      pos.z += sin(pos.x * 5.0 + uTime * 2.0) * 0.1;
      pos.z += sin(pos.y * 3.0 + uTime * 1.5) * 0.05;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform sampler2D uTexture;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Eclairage diffus basique
      vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
      float diff = max(dot(vNormal, lightDir), 0.0);

      // Texture
      vec4 texColor = texture2D(uTexture, vUv + uTime * 0.05);

      // Couleur finale
      vec3 color = uColor * diff * texColor.rgb;

      gl_FragColor = vec4(color, 1.0);
    }
  `,

  // Options de rendu
  transparent: false,
  side: THREE.DoubleSide,
  wireframe: false,
});

// Mettre a jour le temps dans le render loop
function animate(): void {
  requestAnimationFrame(animate);
  customMaterial.uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
}
```

:::info Uniforms automatiques de Three.js
Avec `ShaderMaterial`, Three.js injecte automatiquement :
- `projectionMatrix` — matrice de projection de la camera
- `modelViewMatrix` — matrice model * view combinee
- `normalMatrix` — matrice pour transformer les normales
- `position`, `normal`, `uv` — attributs de la geometrie
- `cameraPosition` — position de la camera dans le monde

Vous n'avez pas a les declarer comme uniforms, ils sont disponibles directement dans le shader.
:::

### RawShaderMaterial — controle total

```typescript
// RawShaderMaterial : AUCUN uniform/attribute/varying injecte automatiquement
// Vous devez TOUT declarer vous-meme (comme en WebGL brut)
const rawMaterial = new THREE.RawShaderMaterial({
  uniforms: {
    uProjectionMatrix: { value: camera.projectionMatrix },
    uModelViewMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
  },

  vertexShader: /* glsl */ `
    #version 300 es
    precision highp float;

    // Tout est explicite — comme vos shaders WebGL du module 07
    in vec3 position;
    in vec3 normal;
    in vec2 uv;

    uniform mat4 uProjectionMatrix;
    uniform mat4 uModelViewMatrix;
    uniform float uTime;

    out vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    #version 300 es
    precision highp float;

    uniform float uTime;
    in vec2 vUv;
    out vec4 fragColor;

    void main() {
      vec3 color = vec3(vUv, sin(uTime) * 0.5 + 0.5);
      fragColor = vec4(color, 1.0);
    }
  `,

  glslVersion: THREE.GLSL3,
});
```

<details>
<summary>Quand utiliser ShaderMaterial vs RawShaderMaterial ?</summary>

| Critere | ShaderMaterial | RawShaderMaterial |
|---------|---------------|-------------------|
| Uniforms Three.js automatiques | Oui | Non |
| Compatibilite eclairage Three.js | Partielle (via chunks) | Non |
| Controle total du GLSL | Moyen | Total |
| Effort de code | Moyen | Eleve |
| Cas d'usage | Effets custom avec eclairage Three.js | Shaders 100% custom, portage WebGL brut |

En general, preferez `ShaderMaterial` sauf si vous avez besoin d'un controle absolu sur le GLSL ou si vous portez un shader existant depuis votre code WebGL brut.

</details>

---

## Exercice pratique

### Enonce

Creez une scene de demonstration de materiaux :

1. Un sol texture avec des textures PBR completes (albedo, normal, roughness)
2. 5 spheres alignees montrant differents materiaux :
   - Metal (metalness=1, roughness=0.2)
   - Plastique (metalness=0, roughness=0.4)
   - Verre (transmission=1, ior=1.5)
   - Tissu (sheen=1, roughness=0.8)
   - Clearcoat (clearcoat=1, metalness=0.8)
3. Un environment map HDR pour les reflexions
4. Une DirectionalLight avec ombres de bonne qualite
5. OrbitControls pour naviguer

**Indice** : Vous pouvez utiliser des couleurs solides (pas de textures obligatoires pour les spheres). L'important est la configuration des proprietes PBR.

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ─── Setup ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 100
);
camera.position.set(0, 3, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.update();

// ─── Environment map HDR ──────────────────────────────────
const pmremGenerator = new THREE.PMREMGenerator(renderer);
new RGBELoader().load('/textures/env/studio.hdr', (hdrTexture) => {
  const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
  scene.environment = envMap;
  scene.background = envMap;
  hdrTexture.dispose();
  pmremGenerator.dispose();
});

// ─── Lumiere directionnelle avec ombres ───────────────────
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(5, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8;
sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;
sun.shadow.camera.bottom = -8;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.02;
scene.add(sun);

scene.add(new THREE.AmbientLight(0xffffff, 0.15));

// ─── Sol texture ──────────────────────────────────────────
const textureLoader = new THREE.TextureLoader();

function loadFloorTexture(name: string): THREE.Texture {
  const tex = textureLoader.load(`/textures/floor/${name}`);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

const floorMaterial = new THREE.MeshStandardMaterial({
  map: loadFloorTexture('albedo.jpg'),
  normalMap: loadFloorTexture('normal.jpg'),
  roughnessMap: loadFloorTexture('roughness.jpg'),
  roughness: 1.0,
  metalness: 0.0,
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ─── Spheres de demonstration ─────────────────────────────
const sphereGeometry = new THREE.SphereGeometry(0.6, 64, 32);
const labels = ['Metal', 'Plastique', 'Verre', 'Tissu', 'Clearcoat'];

const materials: THREE.MeshPhysicalMaterial[] = [
  // Metal
  new THREE.MeshPhysicalMaterial({
    color: 0xcccccc,
    metalness: 1.0,
    roughness: 0.2,
  }),
  // Plastique
  new THREE.MeshPhysicalMaterial({
    color: 0xff4444,
    metalness: 0.0,
    roughness: 0.4,
  }),
  // Verre
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.0,
    transmission: 1.0,
    ior: 1.5,
    thickness: 0.5,
  }),
  // Tissu
  new THREE.MeshPhysicalMaterial({
    color: 0x2244aa,
    metalness: 0.0,
    roughness: 0.8,
    sheen: 1.0,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0x4488ff),
  }),
  // Clearcoat
  new THREE.MeshPhysicalMaterial({
    color: 0xcc0000,
    metalness: 0.8,
    roughness: 0.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  }),
];

materials.forEach((mat, i) => {
  const sphere = new THREE.Mesh(sphereGeometry, mat);
  sphere.position.set((i - 2) * 2, 1, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);
});

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Render loop ──────────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
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
| Materiau PBR standard | `MeshStandardMaterial` | metalness, roughness + 7 types de textures |
| Materiau PBR avance | `MeshPhysicalMaterial` | clearcoat, transmission, sheen, iridescence, anisotropy |
| Charger des textures | `TextureLoader` | wrapS/T, repeat, offset, colorSpace, anisotropy |
| Environment maps | `RGBELoader` + `PMREMGenerator` | HDR equirectangulaire → cube map pre-filtree |
| Cube maps | `CubeTextureLoader` | 6 faces (px, nx, py, ny, pz, nz) |
| Lumiere ambiante | `AmbientLight` | Eclairage uniforme, pas d'ombre |
| Lumiere hemispherique | `HemisphereLight` | Ciel + sol, pas d'ombre |
| Lumiere directionnelle | `DirectionalLight` | Soleil, rayons paralleles, ombres |
| Lumiere ponctuelle | `PointLight` | Ampoule, omnidirectionnelle (6 shadow maps) |
| Projecteur | `SpotLight` | Cone de lumiere, ombres |
| Surface lumineuse | `RectAreaLight` | Fenetre/neon, pas d'ombre |
| Shadow mapping | `renderer.shadowMap.enabled` | PCFSoftShadowMap recommande |
| Shadow qualite | `shadow.mapSize`, `shadow.bias` | 2048x2048 = bon compromis |
| Shader personnalise | `ShaderMaterial` | GLSL + uniforms automatiques Three.js |
| Shader brut | `RawShaderMaterial` | Controle total, rien d'injecte |

---

## Pour aller plus loin

- [Three.js Materials Documentation](https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial)
- [Poly Haven — HDRIs gratuits](https://polyhaven.com/hdris)
- [ambientCG — Textures PBR CC0](https://ambientcg.com/)
- [Three.js Lighting Examples](https://threejs.org/examples/?q=light)
- [LearnOpenGL — PBR Theory](https://learnopengl.com/PBR/Theory) — la theorie derriere l'implementation Three.js
