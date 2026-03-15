# Module 19 — Shaders creatifs et procedural

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 150 min       | [Lab 19](../labs/lab-19-shaders-creatifs/) | [Quiz 19](../quizzes/quiz-19-shaders-creatifs.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Implementer les fonctions de noise (Perlin, Simplex, Worley) en GLSL et WGSL
- Combiner des octaves de noise avec le FBM pour créer des details multi-echelles
- Générer un terrain procedural avec vertex displacement dans le vertex shader
- Créer un water shader avec deformation sinusoidale, refraction et Fresnel
- Écrire des textures procedurales (marble, wood, fire) purement mathematiques
- Définir des SDFs et les combiner avec des operations booleennes
- Implementer un ray marcher dans le fragment shader pour le rendu volumetrique
- Appliquer des effets stylises : toon shading, outline, dissolution, UV distortion

---

<details>
<summary>Rappel du cours précédent — Shadow mapping et techniques d'ombres (Module 18)</summary>

Au module 18, nous avons couvert les techniques d'ombres :

- **Shadow mapping 2 passes** : render depuis la lumiere (depth map) puis comparer la profondeur de chaque fragment avec la shadow map
- **Shadow acne / Peter panning** : artefacts causes par la discretisation, corriges avec bias et normal bias
- **PCF (Percentage Closer Filtering)** : echantillonner plusieurs texels de la shadow map pour adoucir les bords
- **CSM (Cascaded Shadow Maps)** : découper le frustum en cascades pour repartir la résolution sur les grandes scenes
- **VSM (Variance Shadow Maps)** : stocker depth + depth² pour permettre le blur gaussien, inegalite de Chebyshev
- **Point light shadows** : 6 passes de rendu dans un cubemap (fov = 90°)
- **Three.js** : `castShadow`, `receiveShadow`, `shadow.mapSize`, `shadow.bias`, `PCFSoftShadowMap`

Nous allons maintenant utiliser les shaders pour créer des effets visuels proceduraux — sans aucune texture image.

</details>

---

## Noise functions : le coeur du procedural

:::tip Analogie
Imagine un champ de ble vu d'avion. Les epis ne sont pas parfaitement alignes, mais leur desordre à une **structure** — il y a des zones qui ondulent ensemble, des motifs a grande echelle et des details fins. Les fonctions de noise font exactement ça : elles generent du "hasard structure" — ni trop ordonne (grille), ni trop chaotique (bruit blanc). C'est la base de pratiquement tout ce qui a l'air "naturel" en 3D.
:::

### Bruit blanc vs noise coherent

```
Bruit blanc (random)          Noise coherent (Perlin/Simplex)
┌───────────────────┐         ┌───────────────────┐
│▓░▒▓░▒░▓▒░▓░▒▓▒░▓│         │░░░▒▒▓▓▓▓▒▒░░░░▒▒│
│░▒▓░▓▒▓░▒▓░▒▓░▒▓░│         │░░▒▒▒▓▓▓▓▓▒▒░░░▒▒│
│▓▒░▓░▒░▓▒░▓░▒▓░▒▓│         │░▒▒▒▓▓▓▓▓▓▓▒▒░▒▒▒│
│░▓▒░▓▒▓░▒▓░▒▓░▒▓░│         │▒▒▒▓▓▓▓▓▓▓▓▓▒▒▒▒▓│
│▓░▒▓░▒░▓▒░▓░▒▓▒░▓│         │▒▒▓▓▓▓▓▓▓▓▓▓▒▒▓▓▓│
└───────────────────┘         └───────────────────┘
Chaque pixel independant       Transitions douces entre voisins
Inutilisable visuellement      Aspect "naturel" et organique
```

### Perlin noise — les bases

Le Perlin noise fonctionne en 3 étapes :
1. **Grille** : définir des gradients aleatoires aux noeuds d'une grille reguliere
2. **Vecteurs distance** : pour chaque point, calculer le vecteur vers chaque noeud voisin
3. **Interpolation** : combiner les produits scalaires (gradient . distance) avec une courbe de lissage

```glsl
// Perlin noise 2D — implementation GLSL
// Fonction de hash pour generer des gradients pseudo-aleatoires
vec2 hash2D(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

// Courbe de lissage quintic (5t^4 - 4t^3 + t) — meilleure que smoothstep
vec2 quintic(vec2 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float perlinNoise2D(vec2 p) {
  vec2 i = floor(p);  // Coordonnees de la cellule
  vec2 f = fract(p);  // Position dans la cellule [0,1]

  // Gradients aux 4 coins de la cellule
  float a = dot(hash2D(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash2D(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2D(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2D(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

  // Interpolation bilineaire avec courbe quintic
  vec2 u = quintic(f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
```

```wgsl
// Perlin noise 2D — implementation WGSL
fn hash2D(p: vec2f) -> vec2f {
  let k = vec2f(dot(p, vec2f(127.1, 311.7)),
                dot(p, vec2f(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(k) * 43758.5453);
}

fn quintic(t: vec2f) -> vec2f {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn perlinNoise2D(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);

  let a = dot(hash2D(i + vec2f(0.0, 0.0)), f - vec2f(0.0, 0.0));
  let b = dot(hash2D(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0));
  let c = dot(hash2D(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0));
  let d = dot(hash2D(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0));

  let u = quintic(f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
```

### Simplex noise — plus rapide, moins d'artefacts

Le simplex noise de Ken Perlin (2001) corrige les defauts du Perlin classique :

| Critere | Perlin noise | Simplex noise |
|---------|-------------|---------------|
| **Grille** | Hypercube (carre, cube) | Simplexe (triangle, tetraedre) |
| **Points evalues** | 4 en 2D, 8 en 3D | 3 en 2D, 4 en 3D |
| **Complexite** | O(2^n) | O(n^2) |
| **Artefacts directionnels** | Oui (axes de la grille) | Non |
| **Cout en 3D+** | Eleve | Nettement plus rapide |

```glsl
// Simplex noise 2D — version optimisee
// Basee sur la permutation de Ian McEwan / Ashima Arts
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float simplexNoise2D(vec2 v) {
  // Constantes de skew pour transformer carre -> triangle
  const vec4 C = vec4(0.211324865405187,   // (3 - sqrt(3)) / 6
                      0.366025403784439,   // 0.5 * (sqrt(3) - 1)
                     -0.577350269189626,   // -1 + 2 * C.x
                      0.024390243902439);  // 1 / 41

  // Skew : espace (x,y) -> espace simplexe (i,j)
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  // Determiner dans quel triangle on se trouve
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  // Permutation pour les gradients pseudo-aleatoires
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));

  // Gradients circulaires
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                          dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;

  return 130.0 * dot(m, g);  // Resultat dans [-1, 1]
}
```

### Worley noise (cellular noise)

Le Worley noise produit des motifs cellulaires — parfait pour les ecailles, la pierre, les cellules biologiques.

```glsl
// Worley noise 2D — distance au point de feature le plus proche
float worleyNoise2D(vec2 p) {
  vec2 cell = floor(p);
  vec2 frac = fract(p);

  float minDist = 1e10;

  // Parcourir les 9 cellules voisines (3x3)
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));

      // Point de feature aleatoire dans cette cellule
      vec2 point = hash2D(cell + neighbor);
      point = 0.5 + 0.5 * sin(point * 6.2831); // Remap [-1,1] -> [0,1]

      // Distance au point de feature
      vec2 diff = neighbor + point - frac;
      float dist = length(diff);

      minDist = min(minDist, dist);
    }
  }

  return minDist;
}
```

```wgsl
// Worley noise 2D — WGSL
fn worleyNoise2D(p: vec2f) -> f32 {
  let cell = floor(p);
  let fr = fract(p);

  var minDist: f32 = 1e10;

  for (var y: i32 = -1; y <= 1; y++) {
    for (var x: i32 = -1; x <= 1; x++) {
      let neighbor = vec2f(f32(x), f32(y));
      let point = 0.5 + 0.5 * sin(hash2D(cell + neighbor) * 6.2831);
      let diff = neighbor + point - fr;
      let dist = length(diff);
      minDist = min(minDist, dist);
    }
  }

  return minDist;
}
```

---

## FBM — Fractional Brownian Motion

### Empiler les octaves

Le noise seul produit des formes trop lisses. Le FBM empile plusieurs couches de noise a des frequences croissantes et des amplitudes decroissantes — comme les harmoniques en musique.

```
Octave 1 (freq=1, amp=1.0)     ──╲     ╱──  ╲      ╱──
                                    ╲   ╱      ╲    ╱
                                     ╲─╱        ╲──╱

Octave 2 (freq=2, amp=0.5)     ─╲ ╱─╲ ╱─╲ ╱─╲ ╱─╲ ╱─
                                  ╳    ╳    ╳    ╳    ╳

Octave 3 (freq=4, amp=0.25)    ╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱

FBM = somme des 3              ──╲    ╱╲╱╲ ╲     ╱╲╱──
                                   ╲╱╱    ╲ ╲╱╲╱╱
                                            ╲╱
                                Detail multi-echelle !
```

```glsl
// FBM generique — fonctionne avec n'importe quelle fonction de noise
float fbm(vec2 p, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < octaves; i++) {
    value += amplitude * perlinNoise2D(p * frequency);
    frequency *= lacunarity;  // Typiquement 2.0
    amplitude *= gain;         // Typiquement 0.5 (= persistance)
  }

  return value;
}
```

```wgsl
// FBM — WGSL
fn fbm(p: vec2f, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
  var value: f32 = 0.0;
  var amplitude: f32 = 0.5;
  var frequency: f32 = 1.0;
  var pos = p;

  for (var i: i32 = 0; i < octaves; i++) {
    value += amplitude * perlinNoise2D(pos * frequency);
    frequency *= lacunarity;
    amplitude *= gain;
  }

  return value;
}
```

### Parametres du FBM

| Paramètre | Role | Valeur typique | Effet visuel |
|-----------|------|----------------|--------------|
| **octaves** | Nombre de couches | 4-8 | Plus d'octaves = plus de detail fin |
| **lacunarity** | Multiplicateur de frequence | 2.0 | >2 = details plus serres par octave |
| **gain (persistance)** | Multiplicateur d'amplitude | 0.5 | >0.5 = details fins plus prononces |
| **amplitude initiale** | Poids de la première octave | 0.5-1.0 | Echelle globale du bruit |

---

## Terrain génération

### Heightmap procedural

```glsl
// Vertex shader — displacement du terrain avec FBM
#version 300 es
precision highp float;

in vec3 aPosition;
in vec2 aUV;

uniform mat4 uModelViewProjection;
uniform mat4 uModel;
uniform float uTime;
uniform float uTerrainHeight;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;

float terrainHeight(vec2 p) {
  // Grandes collines
  float h = fbm(p * 0.3, 6, 2.0, 0.5) * uTerrainHeight;

  // Cretes rocheuses
  float ridged = 1.0 - abs(perlinNoise2D(p * 0.8));
  ridged = ridged * ridged;
  h += ridged * uTerrainHeight * 0.3;

  return h;
}

// Calcul de la normale par differences finies
vec3 terrainNormal(vec2 p, float epsilon) {
  float hL = terrainHeight(p - vec2(epsilon, 0.0));
  float hR = terrainHeight(p + vec2(epsilon, 0.0));
  float hD = terrainHeight(p - vec2(0.0, epsilon));
  float hU = terrainHeight(p + vec2(0.0, epsilon));

  return normalize(vec3(hL - hR, 2.0 * epsilon, hD - hU));
}

void main() {
  vec2 worldXZ = (uModel * vec4(aPosition, 1.0)).xz;

  // Vertex displacement sur l'axe Y
  float height = terrainHeight(worldXZ);
  vec3 displaced = aPosition + vec3(0.0, height, 0.0);

  vWorldPosition = (uModel * vec4(displaced, 1.0)).xyz;
  vNormal = terrainNormal(worldXZ, 0.05);
  vUV = aUV;

  gl_Position = uModelViewProjection * vec4(displaced, 1.0);
}
```

```wgsl
// Terrain vertex shader — WGSL
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  time: f32,
  terrainHeight: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) uv: vec2f,
};

struct VertexOutput {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

fn terrainHeight(p: vec2f) -> f32 {
  var h = fbm(p * 0.3, 6, 2.0, 0.5) * u.terrainHeight;
  let ridged = 1.0 - abs(perlinNoise2D(p * 0.8));
  h += ridged * ridged * u.terrainHeight * 0.3;
  return h;
}

fn terrainNormal(p: vec2f, eps: f32) -> vec3f {
  let hL = terrainHeight(p - vec2f(eps, 0.0));
  let hR = terrainHeight(p + vec2f(eps, 0.0));
  let hD = terrainHeight(p - vec2f(0.0, eps));
  let hU = terrainHeight(p + vec2f(0.0, eps));
  return normalize(vec3f(hL - hR, 2.0 * eps, hD - hU));
}

@vertex
fn main(in: VertexInput) -> VertexOutput {
  let worldXZ = (u.model * vec4f(in.position, 1.0)).xz;
  let height = terrainHeight(worldXZ);
  let displaced = in.position + vec3f(0.0, height, 0.0);

  var out: VertexOutput;
  out.clipPos = u.mvp * vec4f(displaced, 1.0);
  out.worldPos = (u.model * vec4f(displaced, 1.0)).xyz;
  out.normal = terrainNormal(worldXZ, 0.05);
  out.uv = in.uv;
  return out;
}
```

### Terrain coloring par altitude

```glsl
// Fragment shader — coloration du terrain par altitude + pente
vec3 terrainColor(vec3 worldPos, vec3 normal) {
  float height = worldPos.y;
  float slope = 1.0 - normal.y; // 0 = plat, 1 = vertical

  // Couleurs par biome
  vec3 water    = vec3(0.1, 0.3, 0.6);
  vec3 sand     = vec3(0.76, 0.70, 0.50);
  vec3 grass    = vec3(0.2, 0.5, 0.1);
  vec3 rock     = vec3(0.5, 0.45, 0.4);
  vec3 snow     = vec3(0.95, 0.95, 0.98);

  // Blend par altitude
  vec3 color = water;
  color = mix(color, sand,  smoothstep(0.0, 0.5, height));
  color = mix(color, grass, smoothstep(0.5, 2.0, height));
  color = mix(color, rock,  smoothstep(5.0, 8.0, height));
  color = mix(color, snow,  smoothstep(10.0, 12.0, height));

  // Les pentes raides = roche
  color = mix(color, rock, smoothstep(0.3, 0.7, slope));

  return color;
}
```

---

## Water shader

### Vertex displacement sinusoidal

```glsl
// Water vertex shader — superposition de vagues (Gerstner waves)
struct Wave {
  vec2 direction;
  float amplitude;
  float frequency;
  float speed;
  float steepness;  // 0 = sinusoidal pur, 1 = Gerstner pointu
};

vec3 gerstnerWave(Wave w, vec3 position, float time) {
  float k = w.frequency;
  float phase = k * dot(w.direction, position.xz) - w.speed * time;

  // Deplacement horizontal (ce qui rend Gerstner plus realiste que sin)
  float x = w.steepness * w.amplitude * w.direction.x * cos(phase);
  float z = w.steepness * w.amplitude * w.direction.y * cos(phase);
  float y = w.amplitude * sin(phase);

  return vec3(x, y, z);
}

vec3 waterDisplacement(vec3 pos, float time) {
  Wave waves[3];
  waves[0] = Wave(normalize(vec2(1.0, 0.3)), 0.15, 2.0, 1.5, 0.5);
  waves[1] = Wave(normalize(vec2(0.5, 1.0)), 0.08, 4.0, 2.0, 0.3);
  waves[2] = Wave(normalize(vec2(-0.3, 0.7)), 0.04, 8.0, 3.0, 0.2);

  vec3 displacement = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    displacement += gerstnerWave(waves[i], pos, time);
  }
  return displacement;
}
```

### Refraction, reflection et Fresnel

```glsl
// Water fragment shader
uniform sampler2D uReflectionTexture;  // Scene rendue a l'envers
uniform sampler2D uRefractionTexture;  // Scene rendue normalement
uniform sampler2D uDepthTexture;       // Depth de la refraction
uniform float uTime;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec4 vClipSpace;
in vec2 vUV;

out vec4 fragColor;

void main() {
  // Coordonnees d'ecran pour sampler les textures reflection/refraction
  vec2 ndc = vClipSpace.xy / vClipSpace.w;
  vec2 screenUV = ndc * 0.5 + 0.5;

  // Distortion des UVs avec du noise pour les vaguelettes
  vec2 distortion = vec2(
    perlinNoise2D(vUV * 20.0 + uTime * 0.5),
    perlinNoise2D(vUV * 20.0 + uTime * 0.3 + 100.0)
  ) * 0.02;

  vec2 reflectUV = vec2(screenUV.x, 1.0 - screenUV.y) + distortion;
  vec2 refractUV = screenUV + distortion;

  vec3 reflection = texture(uReflectionTexture, reflectUV).rgb;
  vec3 refraction = texture(uRefractionTexture, refractUV).rgb;

  // Fresnel — plus l'angle est rasant, plus on voit la reflection
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
  fresnel = clamp(fresnel, 0.02, 0.98);

  // Melange reflection/refraction selon Fresnel
  vec3 waterColor = mix(refraction, reflection, fresnel);

  // Teinte bleutee
  waterColor = mix(waterColor, vec3(0.0, 0.3, 0.5), 0.2);

  // Specular highlight (soleil)
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  vec3 halfVec = normalize(viewDir + lightDir);
  float spec = pow(max(dot(vNormal, halfVec), 0.0), 256.0);
  waterColor += vec3(1.0) * spec;

  fragColor = vec4(waterColor, 0.85);
}
```

---

## Procedural textures

### Marble — turbulence sinusoidale

```glsl
vec3 proceduralMarble(vec2 uv) {
  // Le "truc" du marbre : une sinusoide deformee par du noise
  float noise = fbm(uv * 5.0, 6, 2.0, 0.5);
  float pattern = sin(uv.x * 10.0 + noise * 10.0);

  // Remap [-1,1] -> [0,1] et ajuster le contraste
  pattern = pattern * 0.5 + 0.5;
  pattern = pow(pattern, 0.7);

  // Couleurs du marbre
  vec3 dark = vec3(0.1, 0.1, 0.12);
  vec3 light = vec3(0.9, 0.88, 0.85);
  vec3 vein = vec3(0.4, 0.35, 0.3);

  vec3 color = mix(dark, light, pattern);
  // Veines fines
  float veinMask = smoothstep(0.48, 0.5, pattern) - smoothstep(0.5, 0.52, pattern);
  color = mix(color, vein, veinMask * 0.5);

  return color;
}
```

### Wood — anneaux de croissance

```glsl
vec3 proceduralWood(vec2 uv) {
  // Distance au centre (cerne de bois)
  float dist = length(uv * 10.0);

  // Ajouter du noise pour deformer les cercles
  dist += perlinNoise2D(uv * 2.0) * 2.0;

  // Anneaux concentriques
  float rings = fract(dist);
  rings = smoothstep(0.0, 0.05, rings) * smoothstep(0.1, 0.05, rings);

  // Fibres du bois (direction Y)
  float grain = perlinNoise2D(uv * vec2(1.0, 50.0)) * 0.1;

  vec3 lightWood = vec3(0.65, 0.45, 0.25);
  vec3 darkWood  = vec3(0.35, 0.2, 0.1);

  vec3 color = mix(lightWood, darkWood, rings * 0.5 + grain);
  return color;
}
```

### Fire — noise anime

```glsl
vec3 proceduralFire(vec2 uv, float time) {
  // Le feu monte : decaler les UVs vers le haut avec le temps
  vec2 fireUV = uv;
  fireUV.y -= time * 1.5;

  // Noise deforme pour la turbulence
  float noise = fbm(fireUV * 4.0, 5, 2.5, 0.45);

  // Forme de flamme : intensite decroit vers le haut
  float flameMask = 1.0 - uv.y;
  flameMask = pow(flameMask, 1.5);

  // Intensite de la flamme
  float intensity = flameMask * (noise * 0.5 + 0.5);
  intensity = clamp(intensity, 0.0, 1.0);

  // Gradient de couleur feu (temperature)
  vec3 color;
  color = mix(vec3(0.1, 0.0, 0.0), vec3(0.8, 0.1, 0.0), smoothstep(0.0, 0.3, intensity));
  color = mix(color, vec3(1.0, 0.6, 0.0), smoothstep(0.3, 0.6, intensity));
  color = mix(color, vec3(1.0, 1.0, 0.7), smoothstep(0.7, 1.0, intensity));

  return color;
}
```

---

## SDF — Signed Distance Functions

:::tip Analogie
Imagine que tu es dans un parc et que tu veux savoir a quelle distance tu es de chaque arbre. La SDF c'est pareil : pour chaque point de l'espace, elle retourne la distance au **bord** de l'objet le plus proche. Positive a l'exterieur, negative a l'interieur, zero pile sur la surface. Avec juste cette information, tu peux "reconstruire" la forme de n'importe quel objet.
:::

### SDFs primitives

```glsl
// Sphere : la plus simple de toutes les SDFs
float sdSphere(vec3 p, float radius) {
  return length(p) - radius;
}

// Box
float sdBox(vec3 p, vec3 halfSize) {
  vec3 d = abs(p) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// Torus
float sdTorus(vec3 p, float majorRadius, float minorRadius) {
  vec2 q = vec2(length(p.xz) - majorRadius, p.y);
  return length(q) - minorRadius;
}

// Cylindre infini sur l'axe Y
float sdCylinder(vec3 p, float radius) {
  return length(p.xz) - radius;
}

// Plan (normal vers le haut)
float sdPlane(vec3 p) {
  return p.y;
}
```

```wgsl
// SDFs primitives — WGSL
fn sdSphere(p: vec3f, radius: f32) -> f32 {
  return length(p) - radius;
}

fn sdBox(p: vec3f, halfSize: vec3f) -> f32 {
  let d = abs(p) - halfSize;
  return length(max(d, vec3f(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);
}

fn sdTorus(p: vec3f, majorR: f32, minorR: f32) -> f32 {
  let q = vec2f(length(p.xz) - majorR, p.y);
  return length(q) - minorR;
}
```

### Operations booleennes sur SDFs

```glsl
// Union : le plus proche des deux
float opUnion(float d1, float d2) {
  return min(d1, d2);
}

// Intersection : garder uniquement l'interieur des deux
float opIntersection(float d1, float d2) {
  return max(d1, d2);
}

// Soustraction : enlever d2 de d1
float opSubtraction(float d1, float d2) {
  return max(d1, -d2);
}

// Smooth union — blend progressif entre deux formes
float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// Exemple : blob organique = 3 spheres blendees
float sceneBlob(vec3 p, float time) {
  float s1 = sdSphere(p - vec3(sin(time), 0.0, 0.0), 0.5);
  float s2 = sdSphere(p - vec3(0.0, sin(time * 1.3), 0.0), 0.4);
  float s3 = sdSphere(p - vec3(0.0, 0.0, sin(time * 0.7)), 0.35);

  float d = opSmoothUnion(s1, s2, 0.3);
  d = opSmoothUnion(d, s3, 0.3);
  return d;
}
```

---

## Ray marching

### Le principe

Le ray marching avance le long d'un rayon par pas variables : à chaque étape, on évalué la SDF au point courant pour connaître la distance minimale au plus proche objet, et on avance de cette distance.

```
Camera                                          Surface
  o─────────────────────────────────────────────┤
  │                                             │
  │  d=3.2    d=1.8    d=0.9   d=0.3  d=0.01   │
  o────────>o────────>o──────>o─────>o──────>X  │
  │  Pas 1   Pas 2    Pas 3   Pas 4  Pas 5     │
  │  (grand)  (moyen) (petit) (tres   (touche!) │
  │                           petit)            │
  └─────────────────────────────────────────────┘
  Chaque pas = distance retournee par la SDF
  On s'arrete quand la distance < epsilon (ex: 0.001)
```

### Implementation complete

```glsl
#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCameraPosition;
uniform mat4 uCameraRotation;

out vec4 fragColor;

// Scene SDF — tout l'univers en une seule fonction
float sceneSDF(vec3 p) {
  // Sol
  float ground = sdPlane(p);

  // Sphere qui rebondit
  vec3 spherePos = vec3(0.0, 1.0 + abs(sin(uTime * 2.0)) * 0.5, 0.0);
  float sphere = sdSphere(p - spherePos, 0.5);

  // Torus en rotation
  vec3 tp = p - vec3(2.0, 1.0, 0.0);
  // Rotation autour de Y
  float c = cos(uTime);
  float s = sin(uTime);
  tp.xz = mat2(c, -s, s, c) * tp.xz;
  float torus = sdTorus(tp, 0.6, 0.2);

  // Box arrondie
  vec3 bp = p - vec3(-2.0, 0.75, 0.0);
  float box = sdBox(bp, vec3(0.5)) - 0.05; // -0.05 = arrondir les coins

  return opUnion(ground, opUnion(sphere, opUnion(torus, box)));
}

// Normale par gradient de la SDF
vec3 estimateNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}

// Ray marching principal
float rayMarch(vec3 origin, vec3 direction) {
  float totalDist = 0.0;

  for (int i = 0; i < 128; i++) {       // Max 128 iterations
    vec3 p = origin + direction * totalDist;
    float dist = sceneSDF(p);

    if (dist < 0.001) return totalDist;  // Touche !
    if (totalDist > 100.0) break;        // Trop loin, on abandonne

    totalDist += dist;                   // Avancer de la distance SDF
  }

  return -1.0; // Rien touche
}

void main() {
  // Coordonnees normalisees [-1, 1] avec aspect ratio
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;

  // Rayon depuis la camera
  vec3 rayOrigin = uCameraPosition;
  vec3 rayDir = normalize(vec3(uv, -1.0)); // FOV ~ 90 degres
  rayDir = (uCameraRotation * vec4(rayDir, 0.0)).xyz;

  // Marcher !
  float dist = rayMarch(rayOrigin, rayDir);

  if (dist > 0.0) {
    vec3 hitPoint = rayOrigin + rayDir * dist;
    vec3 normal = estimateNormal(hitPoint);

    // Eclairage Lambertien simple
    vec3 lightDir = normalize(vec3(1.0, 2.0, 1.0));
    float diffuse = max(dot(normal, lightDir), 0.0);

    // Ombre douce : ray marcher vers la lumiere
    float shadow = 1.0;
    vec3 shadowOrigin = hitPoint + normal * 0.01;
    float t = 0.02;
    for (int i = 0; i < 64; i++) {
      float d = sceneSDF(shadowOrigin + lightDir * t);
      shadow = min(shadow, 10.0 * d / t);
      t += d;
      if (d < 0.001 || t > 20.0) break;
    }
    shadow = clamp(shadow, 0.0, 1.0);

    vec3 color = vec3(0.8) * (0.2 + 0.8 * diffuse * shadow);
    fragColor = vec4(color, 1.0);
  } else {
    // Ciel gradie
    float t = 0.5 + 0.5 * rayDir.y;
    fragColor = vec4(mix(vec3(0.8, 0.85, 0.9), vec3(0.3, 0.5, 0.9), t), 1.0);
  }
}
```

---

## Fresnel effect

L'effet Fresnel controle la reflexion en fonction de l'angle de vue. Il est utilise partout : eau, verre, rim lighting.

```glsl
// Approximation de Schlick
float fresnelSchlick(float cosTheta, float F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// Rim lighting — lueur sur les bords
vec3 rimLight(vec3 normal, vec3 viewDir, vec3 rimColor, float rimPower) {
  float rim = 1.0 - max(dot(normal, viewDir), 0.0);
  rim = pow(rim, rimPower);
  return rimColor * rim;
}

// Utilisation dans un fragment shader
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);

  // Eclairage classique
  vec3 color = diffuseLighting(N);

  // Ajouter le rim light (halo lumineux sur les bords)
  color += rimLight(N, V, vec3(0.3, 0.5, 1.0), 3.0);

  // Transparence de verre basee sur Fresnel
  float transparency = fresnelSchlick(max(dot(N, V), 0.0), 0.04);
  // 0.04 = F0 pour les dielectriques (verre, eau, plastique)

  fragColor = vec4(color, transparency);
}
```

---

## Dissolution shader

### Noise-based dissolve avec edge glow

```glsl
// Fragment shader — dissolution progressive
uniform float uDissolveAmount;  // 0 = intact, 1 = completement dissous
uniform vec3 uEdgeColor;         // Couleur du bord de dissolution (ex: orange)
uniform float uEdgeWidth;        // Largeur du bord lumineux

void main() {
  // Noise 3D pour la dissolution
  float noise = perlinNoise2D(vUV * 8.0);
  noise = noise * 0.5 + 0.5; // Remap [0, 1]

  // Discard les fragments "dissous"
  if (noise < uDissolveAmount) {
    discard;
  }

  // Calcul de la couleur de base (eclairage normal)
  vec3 baseColor = calculateLighting(vNormal, vWorldPos);

  // Edge glow : les fragments proches du seuil de dissolution brillent
  float edge = smoothstep(uDissolveAmount, uDissolveAmount + uEdgeWidth, noise);
  float edgeGlow = 1.0 - edge;

  // Melanger la couleur de base avec le glow
  vec3 finalColor = mix(uEdgeColor * 3.0, baseColor, edge);
  // *3.0 pour le bloom HDR — la lueur va "deborder" si un bloom est actif

  fragColor = vec4(finalColor, 1.0);
}
```

```wgsl
// Dissolution — WGSL
@group(1) @binding(0) var<uniform> dissolve: DissolveUniforms;

struct DissolveUniforms {
  amount: f32,
  edgeWidth: f32,
  edgeColor: vec3f,
};

@fragment
fn main(in: FragInput) -> @location(0) vec4f {
  let noise = perlinNoise2D(in.uv * 8.0) * 0.5 + 0.5;

  if (noise < dissolve.amount) {
    discard;
  }

  let baseColor = calculateLighting(in.normal, in.worldPos);
  let edge = smoothstep(dissolve.amount, dissolve.amount + dissolve.edgeWidth, noise);
  let finalColor = mix(dissolve.edgeColor * 3.0, baseColor, edge);

  return vec4f(finalColor, 1.0);
}
```

---

## Toon / cel shading

### Discretiser le lighting avec step()

```glsl
// Toon shading — bandes de lumiere discretes
vec3 toonShading(vec3 normal, vec3 lightDir, vec3 baseColor) {
  float NdotL = dot(normal, lightDir);

  // Au lieu d'un gradient continu, on "ecrase" en paliers
  float intensity;
  if (NdotL > 0.7)      intensity = 1.0;    // Pleine lumiere
  else if (NdotL > 0.3)  intensity = 0.6;    // Demi-teinte
  else if (NdotL > 0.0)  intensity = 0.35;   // Ombre legere
  else                    intensity = 0.15;   // Ombre profonde

  // Equivalent avec smoothstep pour des transitions legeres
  // float intensity = smoothstep(-0.1, 0.0, NdotL) * 0.2
  //                 + smoothstep(0.2, 0.4, NdotL) * 0.25
  //                 + smoothstep(0.6, 0.8, NdotL) * 0.4 + 0.15;

  return baseColor * intensity;
}
```

---

## Outline shader

### Méthode 1 : post-process (Sobel edge detection)

```glsl
// Fragment shader post-process — detection de contours Sobel
uniform sampler2D uNormalTexture;  // G-Buffer normals
uniform sampler2D uDepthTexture;   // G-Buffer depth
uniform vec2 uTexelSize;           // 1.0 / resolution

float sobelEdge(sampler2D tex, vec2 uv) {
  // Noyaux Sobel 3x3
  float tl = texture(tex, uv + vec2(-1, -1) * uTexelSize).r;
  float t  = texture(tex, uv + vec2( 0, -1) * uTexelSize).r;
  float tr = texture(tex, uv + vec2( 1, -1) * uTexelSize).r;
  float l  = texture(tex, uv + vec2(-1,  0) * uTexelSize).r;
  float r  = texture(tex, uv + vec2( 1,  0) * uTexelSize).r;
  float bl = texture(tex, uv + vec2(-1,  1) * uTexelSize).r;
  float b  = texture(tex, uv + vec2( 0,  1) * uTexelSize).r;
  float br = texture(tex, uv + vec2( 1,  1) * uTexelSize).r;

  float sobelX = tl + 2.0*l + bl - tr - 2.0*r - br;
  float sobelY = tl + 2.0*t + tr - bl - 2.0*b - br;

  return sqrt(sobelX * sobelX + sobelY * sobelY);
}

void main() {
  vec2 uv = gl_FragCoord.xy * uTexelSize;

  // Detecter les edges sur la profondeur ET les normales
  float depthEdge = sobelEdge(uDepthTexture, uv);
  float normalEdge = sobelEdge(uNormalTexture, uv);

  float edge = max(depthEdge * 50.0, normalEdge * 5.0);
  edge = smoothstep(0.3, 0.8, edge);

  // Scene originale
  vec3 sceneColor = texture(uSceneTexture, uv).rgb;

  // Superposer les outlines
  vec3 outlineColor = vec3(0.0); // Noir
  fragColor = vec4(mix(sceneColor, outlineColor, edge), 1.0);
}
```

### Méthode 2 : normal extrusion (vertex-based)

```glsl
// Vertex shader — passe d'outline par extrusion des normales
// On rend d'abord les outlines (faces arriere extrudees), puis la scene normale

uniform float uOutlineWidth;

void main() {
  // Extruder le vertex le long de sa normale
  vec3 extruded = aPosition + aNormal * uOutlineWidth;
  gl_Position = uMVP * vec4(extruded, 1.0);
}

// Fragment shader de la passe outline
void main() {
  fragColor = vec4(0.0, 0.0, 0.0, 1.0); // Noir uni
}

// Rendu en 2 passes :
// Passe 1 : outline — gl.cullFace(gl.FRONT) + extrusion
// Passe 2 : scene  — gl.cullFace(gl.BACK) normal
```

---

## UV distortion

### Heat haze

```glsl
// Post-process — distorsion de chaleur
vec2 heatHaze(vec2 uv, float time) {
  // Ondes de distorsion montantes
  float distX = sin(uv.y * 40.0 + time * 3.0) * 0.003;
  float distY = cos(uv.x * 30.0 + time * 2.5) * 0.002;

  // Plus fort en bas de l'ecran (pres de la source de chaleur)
  float mask = smoothstep(0.6, 0.0, uv.y);

  return uv + vec2(distX, distY) * mask;
}
```

### Underwater caustics

```glsl
// Caustics — motifs lumineux sous l'eau
float caustics(vec2 uv, float time) {
  // Superposer 2 couches de Worley noise animees
  float c1 = worleyNoise2D(uv * 8.0 + time * vec2(0.3, 0.2));
  float c2 = worleyNoise2D(uv * 8.0 + time * vec2(-0.2, 0.1) + 100.0);

  // La ou les cellules se chevauchent = caustic brillant
  float caustic = pow(c1 * c2, 0.5);
  caustic = smoothstep(0.0, 0.15, caustic);

  return caustic;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Scene sous-marine
  vec3 sceneColor = texture(uSceneTexture, uv).rgb;

  // Teinte bleue
  sceneColor *= vec3(0.4, 0.7, 0.9);

  // Caustics projetees
  float c = caustics(uv, uTime);
  sceneColor += vec3(0.3, 0.4, 0.5) * c;

  // Distorsion legere
  vec2 distUV = uv + vec2(
    sin(uv.y * 15.0 + uTime) * 0.005,
    cos(uv.x * 10.0 + uTime * 0.7) * 0.003
  );
  sceneColor = texture(uSceneTexture, distUV).rgb * vec3(0.4, 0.7, 0.9);
  sceneColor += vec3(0.3, 0.4, 0.5) * c;

  fragColor = vec4(sceneColor, 1.0);
}
```

---

## Pratique

### Exercice SH.1 — Terrain procedural avec water shader

Creez une scene Three.js contenant :
1. Un terrain généré par noise (ShaderMaterial avec vertex displacement)
2. Un plan d'eau avec Fresnel et reflets speculaires
3. Une animation en boucle (vagues, temps)

```typescript
// TODO: Creer la geometrie du terrain (PlaneGeometry subdivisee)
// TODO: Ecrire le vertex shader avec FBM pour le displacement
// TODO: Ecrire le fragment shader avec coloration par altitude
// TODO: Creer le plan d'eau (ShaderMaterial avec Fresnel)
// TODO: Animer le tout avec un uniform uTime
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Setup ───────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(15, 12, 15);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2, 0);
controls.update();

// ─── Noise GLSL commun ──────────────────────────────────
const noiseGLSL = /* glsl */ `
  vec2 hash2D(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)),
             dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
  }

  vec2 quintic(vec2 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  }

  float perlinNoise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = dot(hash2D(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
    float b = dot(hash2D(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash2D(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash2D(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    vec2 u = quintic(f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amplitude * perlinNoise2D(p * frequency);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }
`;

// ─── Terrain ─────────────────────────────────────────────
const terrainVert = /* glsl */ `
  ${noiseGLSL}

  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUV;

  float terrainH(vec2 p) {
    return fbm(p * 0.15, 6) * 8.0;
  }

  vec3 terrainN(vec2 p) {
    float eps = 0.05;
    float hL = terrainH(p - vec2(eps, 0.0));
    float hR = terrainH(p + vec2(eps, 0.0));
    float hD = terrainH(p - vec2(0.0, eps));
    float hU = terrainH(p + vec2(0.0, eps));
    return normalize(vec3(hL - hR, 2.0 * eps, hD - hU));
  }

  void main() {
    vec3 pos = position;
    float h = terrainH(pos.xz);
    pos.y += h;

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vNormal = terrainN(pos.xz);
    vUV = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const terrainFrag = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUV;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(dot(N, lightDir), 0.0);

    float h = vWorldPos.y;
    float slope = 1.0 - N.y;

    vec3 sand  = vec3(0.76, 0.70, 0.50);
    vec3 grass = vec3(0.2, 0.5, 0.1);
    vec3 rock  = vec3(0.5, 0.45, 0.4);
    vec3 snow  = vec3(0.95, 0.95, 0.98);

    vec3 color = sand;
    color = mix(color, grass, smoothstep(0.5, 2.0, h));
    color = mix(color, rock,  smoothstep(4.0, 6.0, h));
    color = mix(color, snow,  smoothstep(6.0, 7.5, h));
    color = mix(color, rock,  smoothstep(0.3, 0.7, slope));

    vec3 ambient = vec3(0.15, 0.18, 0.25);
    gl_FragColor = vec4(color * (ambient + diffuse * 0.85), 1.0);
  }
`;

const terrainGeo = new THREE.PlaneGeometry(40, 40, 256, 256);
terrainGeo.rotateX(-Math.PI / 2);

const terrainMat = new THREE.ShaderMaterial({
  vertexShader: terrainVert,
  fragmentShader: terrainFrag,
  uniforms: {
    uTime: { value: 0 },
  },
});

scene.add(new THREE.Mesh(terrainGeo, terrainMat));

// ─── Water ───────────────────────────────────────────────
const waterVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 pos = position;

    // Superposition de vagues sinusoidales
    float w1 = sin(pos.x * 2.0 + uTime * 1.5) * 0.08;
    float w2 = sin(pos.z * 3.0 + uTime * 2.0) * 0.05;
    float w3 = sin((pos.x + pos.z) * 1.5 + uTime * 1.0) * 0.06;
    pos.y += w1 + w2 + w3;

    // Normale approximee
    float dx = cos(pos.x * 2.0 + uTime * 1.5) * 2.0 * 0.08
             + cos((pos.x + pos.z) * 1.5 + uTime) * 1.5 * 0.06;
    float dz = cos(pos.z * 3.0 + uTime * 2.0) * 3.0 * 0.05
             + cos((pos.x + pos.z) * 1.5 + uTime) * 1.5 * 0.06;
    vNormal = normalize(vec3(-dx, 1.0, -dz));

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFrag = /* glsl */ `
  uniform vec3 uCameraPos;
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(vec3(0.5, 1.0, 0.3));

    // Fresnel
    float fresnel = pow(1.0 - max(dot(V, N), 0.0), 4.0);
    fresnel = clamp(fresnel, 0.05, 0.95);

    // Couleurs
    vec3 waterDeep = vec3(0.0, 0.15, 0.3);
    vec3 waterShallow = vec3(0.0, 0.4, 0.5);
    vec3 skyColor = vec3(0.5, 0.7, 0.95);

    vec3 waterColor = mix(waterShallow, waterDeep, fresnel);
    vec3 reflectedColor = mix(skyColor, vec3(0.8, 0.9, 1.0), fresnel);
    vec3 finalColor = mix(waterColor, reflectedColor, fresnel);

    // Specular
    vec3 H = normalize(V + L);
    float spec = pow(max(dot(N, H), 0.0), 256.0);
    finalColor += vec3(1.0) * spec;

    gl_FragColor = vec4(finalColor, 0.8);
  }
`;

const waterGeo = new THREE.PlaneGeometry(40, 40, 128, 128);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.ShaderMaterial({
  vertexShader: waterVert,
  fragmentShader: waterFrag,
  uniforms: {
    uTime: { value: 0 },
    uCameraPos: { value: camera.position },
  },
  transparent: true,
  side: THREE.DoubleSide,
});

const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = 1.0; // Niveau de l'eau
scene.add(water);

// ─── Lumiere ─────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x404060, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(10, 15, 10);
scene.add(sun);

// ─── Animation ───────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  terrainMat.uniforms.uTime.value = t;
  waterMat.uniforms.uTime.value = t;
  waterMat.uniforms.uCameraPos.value.copy(camera.position);

  controls.update();
  renderer.render(scene, camera);
}

animate();

// ─── Resize ──────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
```
</details>

---

## Résumé

| Technique | Principe | Usage typique |
|-----------|----------|---------------|
| **Perlin noise** | Gradients interpoles sur une grille | Base de tout procedural |
| **Simplex noise** | Simplexes au lieu d'hypercubes, O(n²) | Alternative plus rapide au Perlin |
| **Worley noise** | Distance au point de feature le plus proche | Cellules, pierre, ecailles |
| **FBM** | Somme d'octaves de noise (freq x2, amp /2) | Details multi-echelles |
| **Vertex displacement** | Modifier la position dans le vertex shader | Terrain, vagues |
| **Gerstner waves** | Deplacement horizontal + vertical | Eau realiste |
| **Fresnel** | Reflexion augmente aux angles rasants | Eau, verre, rim light |
| **SDF** | Distance signee au bord d'un objet | Formes mathematiques |
| **Ray marching** | Avancer par pas = distance SDF | Rendu volumetrique |
| **Toon shading** | Discretiser le diffuse en paliers | Style cartoon |
| **Outline** | Sobel post-process ou normal extrusion | Contours noirs |
| **Dissolution** | Discard si noise < seuil + edge glow | Effets de disparition |

| Fonction noise | Cout GPU | Qualite | Dimension optimale |
|---------------|----------|---------|-------------------|
| **Perlin classique** | Moyen | Artefacts axiaux possibles | 2D-3D |
| **Simplex** | Faible (O(n²)) | Excellent, isotrope | 3D+ |
| **Worley** | Eleve (boucle 3x3 ou 3x3x3) | Cellulaire unique | 2D-3D |
| **FBM (6 octaves)** | 6x le cout du noise de base | Detail riche | Toutes |

---

## Navigation

| Précédent | Suivant |
|:---------:|:-------:|
| [18 - Shadow mapping](./18-shadow-mapping.md) | [20 - Physique et interactions](./20-physique-interactions.md) |

---

<!-- parcours-recommande -->

::: tip Parcours recommandé
1. **Screencast** : [screencast 19 shaders creatifs](../screencasts/screencast-19-shaders-creatifs.md)
2. **Lab** : [lab-19-shaders-creatifs](../labs/lab-19-shaders-creatifs/README)
3. **Visualisation** : [Shader Sandbox](../visualizations/shader-sandbox.html)
4. **Quiz** : [quiz 19 shaders creatifs](../quizzes/quiz-19-shaders-creatifs.html)
:::
