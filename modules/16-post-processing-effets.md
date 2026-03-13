# Module 16 — Post-processing et effets

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 4/5        | 120 min       | [Lab 16](../labs/lab-16-post-processing-effets/) | [Quiz 16](../quizzes/quiz-16-post-processing-effets.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Mettre en place un pipeline de post-processing avec EffectComposer
- Utiliser les passes standard : bloom, SSAO, depth of field, antialiasing
- Ecrire des shaders de post-processing personnalises (vignette, color grading, film grain)
- Combiner plusieurs passes de rendu (multi-pass rendering)
- Creer et animer des systemes de particules avec Points et BufferGeometry
- Utiliser GPUComputationRenderer pour des simulations de particules sur GPU
- Integrer des overlays HTML avec CSS2DRenderer et CSS3DRenderer
- Implementer le raycasting pour l'interaction souris/touch avec la scene 3D

---

<details>
<summary>Rappel du cours precedent — Modeles et animations (Module 15)</summary>

Au module 15, nous avons appris a travailler avec des modeles 3D et leurs animations :

- **glTF 2.0** : le format standard du web 3D, avec `.glb` (binaire) et `.gltf` (JSON + fichiers)
- **GLTFLoader** : chargement asynchrone, structure `{ scene, animations, cameras, asset }`
- **DRACOLoader** : compression de geometrie (60-90% de reduction)
- **KTX2Loader** : textures GPU compressees (Basis Universal)
- **traverse() / getObjectByName()** : navigation dans la hierarchie de scene
- **AnimationMixer** : systeme d'animation avec `mixer.update(delta)` dans le render loop
- **AnimationAction** : play, stop, crossFadeTo, timeScale, weight
- **SkinnedMesh + Bones** : animations squelettiques
- **Morph targets** : deformations pour expressions faciales
- **InstancedMesh** : milliers d'objets en un seul draw call

Nous allons maintenant ajouter des effets visuels spectaculaires a nos scenes — bloom, profondeur de champ, particules, et bien plus.

</details>

---

## Le pipeline de post-processing

### Analogie : les filtres photo

Le post-processing en 3D fonctionne exactement comme les filtres Instagram ou Photoshop, mais en temps reel, chaque frame :

```
Scene 3D rendue → Framebuffer (image 2D)
    │
    ├─→ Filtre 1 : Bloom (lueur)
    ├─→ Filtre 2 : SSAO (ombres fines)
    ├─→ Filtre 3 : Color grading
    ├─→ Filtre 4 : Vignette
    │
    └─→ Image finale → Ecran

Exactement comme :
Photo brute → Luminosite → Contraste → Saturation → Recadrage → Export
```

### EffectComposer : le gestionnaire de passes

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─── Setup du renderer ────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false }); // antialias off !
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

// ─── Creer le compositeur ─────────────────────────────────
const composer = new EffectComposer(renderer);

// Passe 1 : rendu de la scene dans un framebuffer intermediaire
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// ... (ajouter des effets ici) ...

// Derniere passe : tone mapping + encoding sRGB
const outputPass = new OutputPass();
composer.addPass(outputPass);

// ─── Render loop — utiliser composer au lieu de renderer ───
function animate(): void {
  requestAnimationFrame(animate);
  controls.update();

  // ⚠️ composer.render() remplace renderer.render(scene, camera)
  composer.render();
}
```

```
┌──────────────────────────────────────────────────────────────┐
│                    Pipeline EffectComposer                     │
│                                                                │
│  RenderPass  →  BloomPass  →  SSAOPass  →  OutputPass         │
│      │              │            │             │               │
│  Rend la scene  Ajoute la   Ajoute les    Tone mapping +      │
│  en texture     lueur       ombres fines  conversion sRGB     │
│                                                                │
│  Chaque passe lit un framebuffer et ecrit dans le suivant      │
└──────────────────────────────────────────────────────────────┘
```

:::warning Antialias desactive
Quand on utilise EffectComposer, on desactive `antialias: true` sur le renderer car le rendu passe par des framebuffers intermediaires. L'antialiasing est gere par une passe dediee (SMAA ou FXAA).
:::

---

## Passes standard

### UnrealBloomPass : lueur (bloom)

Le bloom simule l'eblouissement des sources de lumiere intenses. Il extrait les pixels les plus brillants et les etale avec un flou gaussien.

```typescript
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), // resolution
  1.5,    // strength — intensite du bloom (0 = off, 3 = tres fort)
  0.4,    // radius — rayon de diffusion (0 = serre, 1 = diffus)
  0.85    // threshold — seuil de luminosite (0 = tout brille, 1 = rien)
);

composer.addPass(bloomPass);

// ─── Ajuster en temps reel avec un GUI ────────────────────
// bloomPass.strength = 2.0;
// bloomPass.radius = 0.6;
// bloomPass.threshold = 0.7;
```

:::tip Bloom selectif
Pour que seuls certains objets brillent, utilisez la propriete `emissive` sur leurs materiaux :
```typescript
// Cet objet va briller a travers le bloom
const neonMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ffff,
  emissive: 0x00ffff,
  emissiveIntensity: 2.0, // valeur > 1 = depasse le threshold du bloom
});
```
:::

### SSAOPass : ambient occlusion en screen-space

L'SSAO ajoute des ombres subtiles dans les creux et les coins, donnant plus de profondeur a la scene :

```typescript
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssaoPass.kernelRadius = 16;      // rayon d'echantillonnage
ssaoPass.minDistance = 0.005;    // distance minimale
ssaoPass.maxDistance = 0.1;      // distance maximale

// Mode de sortie pour le debug
ssaoPass.output = SSAOPass.OUTPUT.Default;
// Autres modes : SSAOPass.OUTPUT.SSAO, SSAOPass.OUTPUT.Blur, SSAOPass.OUTPUT.Depth

composer.addPass(ssaoPass);
```

### BokehPass : profondeur de champ (depth of field)

Le bokeh simule le flou d'objectif — les objets hors du plan de mise au point deviennent flous :

```typescript
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

const bokehPass = new BokehPass(scene, camera, {
  focus: 5.0,      // distance de mise au point (en unites monde)
  aperture: 0.025,  // ouverture (plus grand = plus de flou)
  maxblur: 0.01,    // flou maximum
});

composer.addPass(bokehPass);

// ─── Mettre au point sur un objet clique ──────────────────
function focusOnObject(object: THREE.Object3D): void {
  const distance = camera.position.distanceTo(object.position);
  bokehPass.uniforms['focus'].value = distance;
}
```

### Antialiasing en post-process

```typescript
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ─── Option 1 : SMAA (meilleure qualite) ─────────────────
const smaaPass = new SMAAPass(
  window.innerWidth * renderer.getPixelRatio(),
  window.innerHeight * renderer.getPixelRatio()
);
composer.addPass(smaaPass);

// ─── Option 2 : FXAA (plus rapide, qualite moindre) ──────
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms['resolution'].value.set(
  1 / (window.innerWidth * renderer.getPixelRatio()),
  1 / (window.innerHeight * renderer.getPixelRatio())
);
// composer.addPass(fxaaPass); // utiliser l'un ou l'autre
```

| Methode | Qualite | Performance | Notes |
|---------|---------|------------|-------|
| MSAA (WebGL natif) | Bonne | Moyen | Incompatible avec EffectComposer |
| **SMAA** | Tres bonne | Moyen | Recommande avec post-processing |
| **FXAA** | Correcte | Rapide | Peut flouter le texte/les aretes |
| TAA | Excellente | Lourd | Necessite accumulation multi-frames |

---

## ShaderPass : effets personnalises

### Architecture d'un shader de post-processing

Un shader de post-processing est un fragment shader qui recoit l'image de la passe precedente en tant que texture :

```typescript
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ─── Structure d'un shader de post-processing ────────────
const MyEffect = {
  uniforms: {
    tDiffuse: { value: null },  // ⚠️ OBLIGATOIRE — texture de la passe precedente
    // ... vos uniforms custom
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      // ... modifier color ...
      gl_FragColor = color;
    }
  `,
};

const myPass = new ShaderPass(MyEffect);
composer.addPass(myPass);
```

### Effet vignette

```typescript
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uOffset: { value: 1.0 },     // debut de l'assombrissement
    uDarkness: { value: 1.3 },   // intensite de l'assombrissement
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uOffset;
    uniform float uDarkness;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Distance du centre (0 au centre, ~0.7 aux coins)
      vec2 center = vUv - 0.5;
      float dist = length(center);

      // Assombrissement progressif vers les bords
      float vignette = smoothstep(uOffset, uOffset - 0.5, dist * (uDarkness + uOffset));
      color.rgb *= vignette;

      gl_FragColor = color;
    }
  `,
};

const vignettePass = new ShaderPass(VignetteShader);
composer.addPass(vignettePass);
```

### Effet color grading

```typescript
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBrightness: { value: 0.0 },    // -1 a 1
    uContrast: { value: 1.0 },      // 0 a 2
    uSaturation: { value: 1.0 },    // 0 = N&B, 1 = normal, 2 = sature
    uTint: { value: new THREE.Color(1, 1, 1) },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBrightness;
    uniform float uContrast;
    uniform float uSaturation;
    uniform vec3 uTint;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Brightness
      color.rgb += uBrightness;

      // Contrast
      color.rgb = (color.rgb - 0.5) * uContrast + 0.5;

      // Saturation
      float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = mix(vec3(luminance), color.rgb, uSaturation);

      // Tint
      color.rgb *= uTint;

      gl_FragColor = color;
    }
  `,
};

const colorGradingPass = new ShaderPass(ColorGradingShader);
colorGradingPass.uniforms.uSaturation.value = 1.2;
colorGradingPass.uniforms.uContrast.value = 1.1;
colorGradingPass.uniforms.uTint.value.set(1.0, 0.95, 0.9); // leger ton chaud
composer.addPass(colorGradingPass);
```

### Effet film grain

```typescript
const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 0.08 },  // intensite du grain
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;

    // Hash pseudo-aleatoire
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Grain anime (change a chaque frame)
      float grain = hash(vUv * 1000.0 + uTime * 100.0) - 0.5;
      color.rgb += grain * uIntensity;

      gl_FragColor = color;
    }
  `,
};

const filmGrainPass = new ShaderPass(FilmGrainShader);
composer.addPass(filmGrainPass);

// Dans le render loop :
// filmGrainPass.uniforms.uTime.value = clock.getElapsedTime();
```

### Effet aberration chromatique

```typescript
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uOffset: { value: new THREE.Vector2(0.003, 0.003) }, // decalage R/B
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uOffset;
    varying vec2 vUv;

    void main() {
      // Decaler les canaux R et B dans des directions opposees
      vec2 direction = vUv - 0.5;
      float dist = length(direction); // plus fort aux bords

      float r = texture2D(tDiffuse, vUv + uOffset * dist).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - uOffset * dist).b;

      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

const chromaticPass = new ShaderPass(ChromaticAberrationShader);
composer.addPass(chromaticPass);
```

---

## WebGLRenderTarget : render-to-texture

### Le concept

Un `WebGLRenderTarget` est un framebuffer — on peut rendre une scene dedans au lieu de l'ecran, puis utiliser le resultat comme texture :

```typescript
// ─── Creer un render target ───────────────────────────────
const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,    // HDR pour le post-processing
    depthBuffer: true,
    stencilBuffer: false,
  }
);

// ─── Rendre dans le target au lieu de l'ecran ─────────────
renderer.setRenderTarget(renderTarget);
renderer.render(scene, camera);
renderer.setRenderTarget(null); // revenir a l'ecran

// ─── Utiliser la texture resultante ───────────────────────
const screenQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ map: renderTarget.texture })
);
```

### Depth texture pour les effets

Certains effets (SSAO, brouillard, DOF) ont besoin de la profondeur :

```typescript
// ─── Render target avec depth texture ─────────────────────
const depthTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight,
  {
    depthTexture: new THREE.DepthTexture(
      window.innerWidth,
      window.innerHeight,
      THREE.FloatType
    ),
    depthBuffer: true,
  }
);

// La profondeur est accessible dans un shader via :
// uniform sampler2D tDepth;
// float depth = texture2D(tDepth, vUv).r;
```

### Multi-pass rendering

Le principe : rendre differentes "couches" (scene principale, outlines, effets) dans des render targets separes, puis les combiner avec un ShaderPass de composition. Par exemple, rendre les objets a outliner avec un materiau de couleur unie dans un target, puis combiner avec la scene principale via un shader de detection de contour.

---

## Particules

### Points + BufferGeometry : systeme de particules basique

```typescript
// ─── Creer 10 000 particules ──────────────────────────────
const particleCount = 10_000;
const positions = new Float32Array(particleCount * 3);
const colors = new Float32Array(particleCount * 3);
const sizes = new Float32Array(particleCount);

for (let i = 0; i < particleCount; i++) {
  const i3 = i * 3;

  // Position aleatoire dans une sphere
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const radius = Math.pow(Math.random(), 1 / 3) * 20; // distribution uniforme en volume

  positions[i3 + 0] = radius * Math.sin(phi) * Math.cos(theta);
  positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
  positions[i3 + 2] = radius * Math.cos(phi);

  // Couleur aleatoire
  const color = new THREE.Color();
  color.setHSL(0.6 + Math.random() * 0.2, 0.8, 0.5 + Math.random() * 0.3);
  colors[i3 + 0] = color.r;
  colors[i3 + 1] = color.g;
  colors[i3 + 2] = color.b;

  // Taille aleatoire
  sizes[i] = 0.5 + Math.random() * 2.0;
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

// ─── Materiau de particules ───────────────────────────────
const material = new THREE.PointsMaterial({
  size: 0.3,
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  depthWrite: false,         // evite les artefacts de tri
  blending: THREE.AdditiveBlending, // effet lumineux
  // map: sparkleTexture,    // texture de particule (optionnel)
  sizeAttenuation: true,     // taille diminue avec la distance
});

const particles = new THREE.Points(geometry, material);
scene.add(particles);
```

### Animer les particules

```typescript
function animateParticles(time: number): void {
  const positions = particles.geometry.attributes.position;
  const posArray = positions.array as Float32Array;

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;

    // Mouvement orbital
    const x = posArray[i3 + 0];
    const z = posArray[i3 + 2];
    const angle = Math.atan2(z, x) + 0.001 * (1 + i * 0.0001);
    const radius = Math.sqrt(x * x + z * z);

    posArray[i3 + 0] = Math.cos(angle) * radius;
    posArray[i3 + 2] = Math.sin(angle) * radius;

    // Flottement vertical
    posArray[i3 + 1] += Math.sin(time + i * 0.1) * 0.002;
  }

  positions.needsUpdate = true; // signaler le changement au GPU
}
```

### Particules avec textures

Pour des particules plus jolies, utilisez une texture avec un gradient radial (blanc au centre, transparent aux bords). Creez-la proceduralement avec `CanvasTexture` ou chargez une image PNG. Ajoutez-la au `PointsMaterial` via la propriete `map`.

---

## GPUComputationRenderer : particules GPGPU

### Le concept

Pour des millions de particules, le CPU est trop lent. `GPUComputationRenderer` execute la simulation **entierement sur le GPU** via des fragment shaders qui ecrivent dans des textures :

```
┌─────────────────────────────────────────────────────────────┐
│                 GPGPU Particle Pipeline                      │
│                                                              │
│  Texture A (positions)  ──→  Fragment shader  ──→  Texture A'│
│  Texture B (velocites)  ──→  (simulation)     ──→  Texture B'│
│                                                              │
│  Chaque pixel = une particule (x, y, z, w dans RGBA)        │
│  Une texture 256x256 = 65 536 particules                     │
│                                                              │
│  Le vertex shader lit les positions pour afficher les points │
└─────────────────────────────────────────────────────────────┘
```

```typescript
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

const PARTICLES = 256; // texture 256x256 = 65 536 particules
const gpuCompute = new GPUComputationRenderer(PARTICLES, PARTICLES, renderer);

// Creer les textures de donnees (chaque pixel RGBA = une particule)
const positionTexture = gpuCompute.createTexture();
const velocityTexture = gpuCompute.createTexture();
// ... remplir positionTexture.image.data et velocityTexture.image.data ...

// Shaders de simulation (fragment shaders qui lisent/ecrivent les textures)
const posVar = gpuCompute.addVariable('texturePosition', positionGLSL, positionTexture);
const velVar = gpuCompute.addVariable('textureVelocity', velocityGLSL, velocityTexture);

// Chaque shader peut lire les deux textures
gpuCompute.setVariableDependencies(posVar, [posVar, velVar]);
gpuCompute.setVariableDependencies(velVar, [posVar, velVar]);

gpuCompute.init();

// Dans le render loop :
function animate(): void {
  requestAnimationFrame(animate);
  gpuCompute.compute(); // execute la simulation sur GPU

  // Lire la texture de positions pour le rendu
  const posTexture = gpuCompute.getCurrentRenderTarget(posVar).texture;
  particleMaterial.uniforms.uPositions.value = posTexture;

  renderer.render(scene, camera);
}
```

---

## Sprites et billboards

### Sprite : toujours face a la camera

Un `Sprite` est un plan qui fait toujours face a la camera — ideal pour les labels, les icones, les effets :

```typescript
// ─── Sprite avec une texture ──────────────────────────────
const spriteMap = new THREE.TextureLoader().load('/textures/glow.png');
const spriteMaterial = new THREE.SpriteMaterial({
  map: spriteMap,
  color: 0xff8800,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const sprite = new THREE.Sprite(spriteMaterial);
sprite.position.set(0, 3, 0);
sprite.scale.set(2, 2, 1); // largeur, hauteur
scene.add(sprite);

// ─── Sprites comme indicateurs de lumiere ─────────────────
function createLightGlow(light: THREE.PointLight): THREE.Sprite {
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: spriteMap,
      color: light.color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.position.copy(light.position);
  glow.scale.setScalar(light.intensity * 0.5);
  return glow;
}
```

---

## CSS2DRenderer et CSS3DRenderer : overlays HTML

### CSS2DRenderer : etiquettes 2D

```typescript
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ─── Setup du renderer CSS ───────────────────────────────
const cssRenderer = new CSS2DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.pointerEvents = 'none'; // laisser passer les clics
document.body.appendChild(cssRenderer.domElement);

// ─── Creer un label HTML ──────────────────────────────────
function createLabel(text: string, position: THREE.Vector3): CSS2DObject {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.cssText = `
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
    white-space: nowrap;
  `;

  const label = new CSS2DObject(div);
  label.position.copy(position);
  return label;
}

// ─── Attacher un label a un objet ─────────────────────────
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x44aaff })
);
scene.add(cube);

const label = createLabel('Mon cube', new THREE.Vector3(0, 1.5, 0));
cube.add(label); // le label suit le cube

// ─── Render loop (rendre les deux) ───────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  cssRenderer.render(scene, camera); // rendre les labels par dessus
}
```

### CSS3DRenderer : elements HTML en 3D

`CSS3DRenderer` fonctionne de maniere similaire, mais les elements HTML sont transformes dans l'espace 3D (rotation, perspective). Creez un `CSS3DObject` a partir d'un element DOM, positionnez-le avec `.position`/`.rotation`, et ajoutez-le a la scene. N'oubliez pas `scale.setScalar(0.01)` pour adapter l'echelle des pixels CSS aux unites 3D.

---

## Raycaster : interactions avec la scene

### Le concept

Le Raycaster trace un rayon invisible depuis la camera a travers un pixel de l'ecran et detecte les objets qu'il intersecte :

```
              Camera
                │
                │  Rayon
                │
                ▼
    ┌─────┐          ┌─────┐
    │ Cube│  ←hit!   │Sphere│
    └─────┘          └──────┘
                          ↑
                     pas touche
```

### Implementation

```typescript
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// ─── Mettre a jour les coordonnees normalisees ────────────
function onPointerMove(event: PointerEvent): void {
  // Convertir les pixels en coordonnees normalisees (-1 a +1)
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

window.addEventListener('pointermove', onPointerMove);

// ─── Detecter les objets sous le curseur ──────────────────
const interactableObjects: THREE.Mesh[] = []; // remplir avec vos objets
let hoveredObject: THREE.Mesh | null = null;
const originalColors: Map<THREE.Mesh, THREE.Color> = new Map();

function checkIntersections(): void {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(interactableObjects, false);

  // Reset du precedent survol
  if (hoveredObject) {
    const original = originalColors.get(hoveredObject);
    if (original && hoveredObject.material instanceof THREE.MeshStandardMaterial) {
      hoveredObject.material.emissive.copy(original);
    }
    hoveredObject = null;
  }

  if (intersects.length > 0) {
    const hit = intersects[0];
    const mesh = hit.object as THREE.Mesh;

    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      if (!originalColors.has(mesh)) {
        originalColors.set(mesh, mesh.material.emissive.clone());
      }
      mesh.material.emissive.set(0x333333); // surbrillance
    }

    hoveredObject = mesh;
    document.body.style.cursor = 'pointer';
  } else {
    document.body.style.cursor = 'default';
  }
}

// Appeler dans le render loop :
// checkIntersections();
```

### Clic sur un objet

```typescript
window.addEventListener('click', () => {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(interactableObjects, false);

  if (intersects.length > 0) {
    const hit = intersects[0];
    console.log('Objet clique :', hit.object.name);
    console.log('Point d\'intersection :', hit.point);
    console.log('Face touchee :', hit.faceIndex);
    console.log('Distance :', hit.distance);
    console.log('UV du hit :', hit.uv);

    // Exemple : animer l'objet clique
    const mesh = hit.object as THREE.Mesh;
    gsap.to(mesh.rotation, { y: mesh.rotation.y + Math.PI, duration: 0.5 });
    // (necessite la lib gsap)
  }
});
```

### Raycaster optimise

Trois techniques pour optimiser le raycaster :
- **Limiter la distance** : `raycaster.far = 50` pour ignorer les objets lointains
- **Utiliser les layers** : `raycaster.layers.set(1)` pour ne tester que les objets interactables
- **Throttle** : ne pas raycaster a chaque frame mais toutes les 50ms (suffisant pour le hover)

---

## Pipeline complet : assemblage

Voici un pipeline de post-processing complet combinant plusieurs effets :

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ─── Renderer sans antialias natif ───────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ─── Composer avec toutes les passes ──────────────────────
const composer = new EffectComposer(renderer);
const pixelRatio = renderer.getPixelRatio();
const width = window.innerWidth;
const height = window.innerHeight;

// 1. Rendu de la scene
composer.addPass(new RenderPass(scene, camera));

// 2. SSAO — ombres fines dans les creux
const ssao = new SSAOPass(scene, camera, width, height);
ssao.kernelRadius = 16;
ssao.minDistance = 0.005;
ssao.maxDistance = 0.1;
composer.addPass(ssao);

// 3. Bloom — lueur sur les objets emissifs
const bloom = new UnrealBloomPass(
  new THREE.Vector2(width, height), 0.8, 0.4, 0.9
);
composer.addPass(bloom);

// 4. Color grading custom
const colorGrading = new ShaderPass(ColorGradingShader);
colorGrading.uniforms.uContrast.value = 1.05;
colorGrading.uniforms.uSaturation.value = 1.15;
composer.addPass(colorGrading);

// 5. Vignette
const vignette = new ShaderPass(VignetteShader);
vignette.uniforms.uDarkness.value = 1.2;
composer.addPass(vignette);

// 6. Antialiasing SMAA
const smaa = new SMAAPass(width * pixelRatio, height * pixelRatio);
composer.addPass(smaa);

// 7. Output (tone mapping + sRGB)
composer.addPass(new OutputPass());

// ─── Render loop ──────────────────────────────────────────
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  controls.update();

  // Mettre a jour les uniforms animes
  filmGrainPass.uniforms.uTime.value = clock.getElapsedTime();

  composer.render(); // ⚠️ PAS renderer.render()
}

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);

  // Mettre a jour les passes qui dependent de la resolution
  const pr = renderer.getPixelRatio();
  smaa.setSize(w * pr, h * pr);
});
```

---

## Exercice pratique

### Enonce

Creez une scene "neon city" avec :

1. Plusieurs cubes et spheres avec des materiaux emissifs (couleurs neon)
2. Un sol reflechissant (MeshStandardMaterial, metalness haute, roughness basse)
3. Post-processing : bloom (pour la lueur neon) + vignette + chromatic aberration legere
4. 5000 particules flottantes avec blending additif
5. Labels CSS2D sur les objets principaux (nom de chaque objet)
6. Raycaster : quand on clique sur un objet, son emissiveIntensity augmente pendant 1 seconde

**Indices** :
- Le bloom avec `threshold: 0.8` ne fera briller que les objets tres emissifs
- Pour le sol reflechissant, `metalness: 0.95, roughness: 0.05` donne un bon resultat
- Utilisez `THREE.Clock` pour gerer le retour a l'emissiveIntensity normale

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ─── Setup ────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const cssRenderer = new CSS2DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(cssRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.03);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 100
);
camera.position.set(0, 5, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

const clock = new THREE.Clock();

// ─── Sol reflechissant ────────────────────────────────────
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshStandardMaterial({
    color: 0x111122,
    metalness: 0.95,
    roughness: 0.05,
  })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ─── Objets neon ──────────────────────────────────────────
const neonColors = [0xff0066, 0x00ffcc, 0x6600ff, 0xff6600, 0x00aaff];
const neonObjects: THREE.Mesh[] = [];

interface ClickEffect {
  mesh: THREE.Mesh;
  baseIntensity: number;
  timer: number;
}
const clickEffects: ClickEffect[] = [];

function createLabel(text: string): CSS2DObject {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.cssText = `
    background: rgba(0,0,0,0.7);
    color: #00ffcc;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: monospace;
  `;
  return new CSS2DObject(div);
}

neonColors.forEach((color, i) => {
  const isBox = i % 2 === 0;
  const geometry = isBox
    ? new THREE.BoxGeometry(1, 2, 1)
    : new THREE.SphereGeometry(0.7, 32, 16);

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.5,
    metalness: 0.3,
    roughness: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((i - 2) * 3, isBox ? 1 : 1.2, 0);
  mesh.name = `Neon-${i}`;
  mesh.castShadow = true;
  scene.add(mesh);
  neonObjects.push(mesh);

  const label = createLabel(mesh.name);
  label.position.set(0, isBox ? 1.5 : 1.2, 0);
  mesh.add(label);
});

// ─── Lumiere d'ambiance ───────────────────────────────────
scene.add(new THREE.AmbientLight(0x222244, 0.5));

// ─── Particules ───────────────────────────────────────────
const particleCount = 5000;
const pPositions = new Float32Array(particleCount * 3);
const pColors = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount; i++) {
  const i3 = i * 3;
  pPositions[i3 + 0] = (Math.random() - 0.5) * 40;
  pPositions[i3 + 1] = Math.random() * 15;
  pPositions[i3 + 2] = (Math.random() - 0.5) * 40;

  const c = new THREE.Color(neonColors[Math.floor(Math.random() * neonColors.length)]);
  pColors[i3 + 0] = c.r;
  pColors[i3 + 1] = c.g;
  pColors[i3 + 2] = c.b;
}

const pGeometry = new THREE.BufferGeometry();
pGeometry.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
pGeometry.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

const pMaterial = new THREE.PointsMaterial({
  size: 0.15,
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});

const particles = new THREE.Points(pGeometry, pMaterial);
scene.add(particles);

// ─── Post-processing ──────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.2, 0.5, 0.8
);
composer.addPass(bloom);

// Vignette
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDarkness: { value: 1.5 },
    uOffset: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uDarkness;
    uniform float uOffset;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float dist = length(vUv - 0.5);
      color.rgb *= smoothstep(uOffset, uOffset - 0.5, dist * (uDarkness + uOffset));
      gl_FragColor = color;
    }
  `,
};
composer.addPass(new ShaderPass(VignetteShader));

// Chromatic aberration
const ChromaShader = {
  uniforms: {
    tDiffuse: { value: null },
    uOffset: { value: new THREE.Vector2(0.002, 0.002) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uOffset;
    varying vec2 vUv;
    void main() {
      float dist = length(vUv - 0.5);
      float r = texture2D(tDiffuse, vUv + uOffset * dist).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - uOffset * dist).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};
composer.addPass(new ShaderPass(ChromaShader));

// SMAA + Output
const pr = renderer.getPixelRatio();
composer.addPass(new SMAAPass(window.innerWidth * pr, window.innerHeight * pr));
composer.addPass(new OutputPass());

// ─── Raycaster ────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('click', () => {
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(neonObjects, false);
  if (intersects.length > 0) {
    const mesh = intersects[0].object as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    clickEffects.push({
      mesh,
      baseIntensity: 1.5,
      timer: 1.0,
    });
    mat.emissiveIntensity = 4.0;
  }
});

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  cssRenderer.setSize(w, h);
});

// ─── Render loop ──────────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  controls.update();

  // Animer les particules (lent mouvement vertical)
  const posAttr = particles.geometry.attributes.position;
  const posArr = posAttr.array as Float32Array;
  for (let i = 0; i < particleCount; i++) {
    posArr[i * 3 + 1] += Math.sin(time + i * 0.01) * 0.003;
  }
  posAttr.needsUpdate = true;

  // Gerer les click effects (retour a la normale)
  for (let i = clickEffects.length - 1; i >= 0; i--) {
    const fx = clickEffects[i];
    fx.timer -= delta;
    if (fx.timer <= 0) {
      (fx.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = fx.baseIntensity;
      clickEffects.splice(i, 1);
    }
  }

  composer.render();
  cssRenderer.render(scene, camera);
}

animate();
```

</details>

---

## Resume

| Concept | API Three.js | Details cles |
|---------|-------------|-------------|
| Pipeline post-process | `EffectComposer` | Chaine de passes, remplace `renderer.render()` |
| Rendu de base | `RenderPass` | Rend la scene dans un framebuffer intermediaire |
| Bloom (lueur) | `UnrealBloomPass` | strength, radius, threshold — combine avec emissive |
| Ambient occlusion | `SSAOPass` | Ombres fines dans les creux, kernelRadius |
| Profondeur de champ | `BokehPass` | focus distance, aperture, maxblur |
| Antialiasing | `SMAAPass` / `FXAAPass` | SMAA = meilleure qualite, FXAA = plus rapide |
| Effets custom | `ShaderPass` | Fragment shader avec `tDiffuse` en entree |
| Tone mapping final | `OutputPass` | Derniere passe, conversion sRGB |
| Render-to-texture | `WebGLRenderTarget` | Framebuffer custom, depth texture possible |
| Particules CPU | `Points` + `PointsMaterial` | BufferGeometry, vertexColors, blending additif |
| Particules GPU | `GPUComputationRenderer` | Simulation en fragment shader, millions de particules |
| Sprites | `Sprite` + `SpriteMaterial` | Toujours face camera, ideal pour glows/icones |
| Labels HTML 2D | `CSS2DRenderer` + `CSS2DObject` | Overlay HTML positionne dans l'espace 3D |
| Panneaux HTML 3D | `CSS3DRenderer` + `CSS3DObject` | Elements HTML transformes en 3D |
| Picking objets | `Raycaster` | `setFromCamera()`, `intersectObjects()` |

---

## Pour aller plus loin

- [Three.js Post-Processing Examples](https://threejs.org/examples/?q=postprocessing)
- [Three.js Raycaster Documentation](https://threejs.org/docs/#api/en/core/Raycaster)
- [GPUComputationRenderer Example](https://threejs.org/examples/?q=gpgpu)
- [Bloom + Selective Bloom Tutorial](https://threejs.org/examples/?q=bloom)
- [CSS2DRenderer Documentation](https://threejs.org/docs/#examples/en/renderers/CSS2DRenderer)
- [The Book of Shaders](https://thebookofshaders.com/) — pour approfondir les effets shader
