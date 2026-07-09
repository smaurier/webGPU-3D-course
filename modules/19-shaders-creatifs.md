---
titre: Shaders créatifs — noise, SDF et raymarching
cours: 20-webgpu-3d
notions:
  - "value noise (hash + interpolation cubique)"
  - "gradient noise (Perlin) et simplex noise"
  - "fbm (fractional Brownian motion — octaves, lacunarity, gain)"
  - "patterns procéduraux (grille, cellules, turbulence)"
  - "SDF (signed distance functions — sphere, box, torus)"
  - "opérations booléennes sur SDF (union, soustraction, smooth union)"
  - "raymarching de base (sphere tracing)"
  - "temps et animation dans le shader (uniform uTime)"
outcomes:
  - sait écrire une fonction de value noise et de Perlin noise en GLSL
  - sait empiler des octaves de noise avec le fbm et régler lacunarity/gain
  - sait générer des patterns procéduraux animés à partir de noise et de uTime
  - sait définir des SDF de primitives et les combiner par opérations booléennes
  - sait implémenter une boucle de raymarching (sphere tracing) dans un fragment shader
  - sait animer un effet procédural via un uniform de temps
prerequis:
  - "07-shaders-buffers-textures (GLSL vertex/fragment, uniforms, textures)"
  - "06-webgl-fondamentaux (contexte, draw call, fragment shader)"
  - "13-threejs-fondamentaux (ShaderMaterial, uniforms, boucle)"
  - "01-algebre-lineaire-pour-la-3d (produit scalaire, longueur, vecteurs)"
next: 20-physique-et-interactions
libs: []
tribuzen: "front-office TribuZen — fond animé procédural (nuage de noise fbm) derrière l'écran des sorties de la famille, rendu 100% en shader sans aucune texture image"
last-reviewed: 2026-07
---

# Shaders créatifs — noise, SDF et raymarching

> **Outcomes — tu sauras FAIRE :** écrire du value/Perlin noise en GLSL, empiler des octaves avec le fbm, générer des patterns procéduraux animés, définir et combiner des SDF, et implémenter un raymarcher de base.
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** ce module transforme des **mathématiques dans le fragment shader** en visuels — sans aucune texture image. On couvre le noise (le cœur du procédural), le fbm, les SDF et le raymarching de base. Le rendu volumétrique poussé (nuages, fog) est au **module 24**, les effets stylisés complets (toon, outline, dissolution) restent des variantes que tu pourras dériver de ces briques.

## 1. Cas concret d'abord

L'écran des sorties de TribuZen a besoin d'un **fond vivant** : un dégradé qui ondule doucement, comme des nuages ou de la brume, derrière la liste des randos et week-ends de la famille. Une image de fond animée pèserait des centaines de Ko et se répéterait ; une vidéo, plusieurs Mo.

La solution 3D : **tout calculer dans le fragment shader**, à partir d'une seule fonction mathématique et du temps. Zéro octet de texture, résolution infinie, animation gratuite.

Voici la brique de départ — un `ShaderMaterial` Three.js dont le fragment shader colore chaque pixel selon sa position et le temps :

```glsl
// fragment shader — fond procédural minimal
precision highp float;

uniform vec2 uResolution;
uniform float uTime;

void main() {
  // uv normalisé [0,1] à partir de la position du pixel à l'écran
  vec2 uv = gl_FragCoord.xy / uResolution;

  // pour l'instant : un dégradé qui pulse avec le temps
  float t = 0.5 + 0.5 * sin(uTime + uv.x * 3.0);
  gl_FragColor = vec4(vec3(t), 1.0);
}
```

Ce dégradé sinusoïdal est trop régulier — il fait « écran de veille des années 90 ». Ce qu'on veut, c'est du **hasard structuré** : ni une grille parfaite, ni du bruit blanc chaotique, mais quelque chose d'**organique**. C'est exactement ce que le **noise** apporte. Ce module part de ce shader et le fait évoluer, brique par brique, jusqu'au nuage animé — puis pousse la même logique vers les SDF et le raymarching.

---

## 2. Théorie complète, concise

### 2.1 Bruit blanc vs noise cohérent

Un `random()` classique renvoie une valeur **indépendante** pour chaque point : deux points voisins n'ont aucun rapport. C'est du **bruit blanc**, visuellement inutilisable (neige de télévision).

Le **noise cohérent** (Perlin, value, simplex) garantit que deux points **proches** ont des valeurs **proches** : des transitions douces, un aspect « naturel ». C'est la base de presque tout le procédural (nuages, terrain, feu, marbre).

```
Bruit blanc (random)        Noise cohérent
▓░▒▓░▒░▓▒░▓░▒▓▒░▓          ░░░▒▒▓▓▓▓▒▒░░░░▒▒
░▒▓░▓▒▓░▒▓░▒▓░▒▓░          ░░▒▒▒▓▓▓▓▓▒▒░░░▒▒
▓▒░▓░▒░▓▒░▓░▒▓░▒▓          ▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒▓
chaque point indépendant   transitions douces entre voisins
```

### 2.2 La fonction de hash

Toutes les fonctions de noise partent d'un **hash** : une fonction déterministe qui transforme une position en pseudo-aléatoire reproductible. La forme canonique (Book of Shaders) :

```glsl
// hash 1D : position 2D -> un scalaire pseudo-aléatoire dans [0,1]
float random(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}
```

Le `dot` mélange x et y, `sin` casse la linéarité, la grande constante `43758...` amplifie, et `fract` ne garde que la partie fractionnaire → une valeur « aléatoire » mais **déterministe** (même entrée = même sortie). C'est ce qui rend le noise reproductible d'une frame à l'autre.

### 2.3 Value noise : hash aux coins + interpolation

Le **value noise** est le plus simple à comprendre. Principe : évaluer `random()` aux **coins entiers** d'une grille, puis **interpoler** entre eux pour les positions intermédiaires.

```glsl
// value noise 2D (Book of Shaders)
float noise(vec2 st) {
  vec2 i = floor(st);   // coin bas-gauche de la cellule
  vec2 f = fract(st);   // position dans la cellule [0,1]

  // valeur pseudo-aléatoire aux 4 coins
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));

  // interpolation cubique (smoothstep) : évite les cassures linéaires
  vec2 u = f * f * (3.0 - 2.0 * f);

  // bilinéaire : mix horizontal puis vertical
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x)
                        + (d - b) * u.x * u.y;
}
```

Le point crucial est la courbe `u = f*f*(3.0-2.0*f)` (le polynôme de `smoothstep`) : sans elle, l'interpolation linéaire crée des **arêtes visibles** aux frontières de cellules. La courbe cubique annule la dérivée aux coins → transitions lisses.

### 2.4 Gradient noise (Perlin)

Le **Perlin noise** (gradient noise) est plus riche : au lieu d'interpoler des *valeurs* aux coins, il interpole des **gradients** (directions aléatoires) via leur produit scalaire avec le vecteur distance. Résultat : moins de « blobs » circulaires, un aspect plus fluide.

```glsl
// gradient pseudo-aléatoire 2D
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)),
           dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}

float perlinNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  // produit scalaire gradient . (position - coin) aux 4 coins
  float a = dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float b = dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

  // courbe quintique : 6t^5 - 15t^4 + 10t^3 (dérivée seconde nulle aux coins)
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
```

La courbe **quintique** `f*f*f*(f*(f*6-15)+10)` (au lieu de cubique) est recommandée pour le Perlin : elle annule aussi la dérivée *seconde* aux coins, éliminant des artefacts de continuité visibles sur les surfaces éclairées.

**Simplex noise** (Ken Perlin, 2001) est l'évolution du Perlin : il utilise une grille de **simplexes** (triangles en 2D, tétraèdres en 3D) au lieu d'hypercubes. En 2D il évalue **3 coins** au lieu de 4, en 3D **4** au lieu de 8 → coût nettement moindre en haute dimension, et **pas d'artefacts directionnels** alignés sur les axes. Son implémentation est plus dense (skew de la grille, permutations) ; en 2D, le Perlin ci-dessus suffit largement pour TribuZen.

### 2.5 fbm — empiler les octaves

Le noise seul est trop lisse (une seule échelle de détail). Le **fbm** (fractional Brownian motion) additionne plusieurs **octaves** de noise : à chaque octave la **fréquence** monte (×`lacunarity`) et l'**amplitude** baisse (×`gain`). Comme des harmoniques en musique.

```glsl
// fbm : somme d'octaves de noise à fréquence croissante / amplitude décroissante
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  const int OCTAVES = 6;

  for (int i = 0; i < OCTAVES; i++) {
    value += amplitude * noise(p * frequency);
    frequency *= 2.0;    // lacunarity — détails 2x plus serrés à chaque octave
    amplitude *= 0.5;    // gain (persistance) — chaque octave pèse moitié moins
  }
  return value;
}
```

Les trois réglages :

| Paramètre | Rôle | Valeur typique | Effet |
|-----------|------|----------------|-------|
| **octaves** | nombre de couches | 4-8 | plus = plus de détail fin (plus cher) |
| **lacunarity** | multiplicateur de fréquence | 2.0 | >2 = détails plus serrés par octave |
| **gain** (persistance) | multiplicateur d'amplitude | 0.5 | >0.5 = détails fins plus prononcés |

C'est le fbm — pas le noise brut — qui donne l'aspect « nuage » ou « brume » recherché pour le fond TribuZen.

### 2.6 Le temps : animer dans le shader

Un shader est réévalué à **chaque frame**. Pour animer, on injecte un **uniform `uTime`** (secondes écoulées) et on le mêle aux coordonnées ou au noise. Trois patterns de base :

```glsl
uniform float uTime;

// 1. défilement : décale les coordonnées -> le pattern "glisse"
float a = fbm(uv + vec2(uTime * 0.1, 0.0));

// 2. évolution : le noise change de forme dans le temps (3e dimension simulée)
float b = fbm(uv + vec2(uTime * 0.05, uTime * 0.03));

// 3. pulsation : module une intensité par une sinusoïde
float c = 0.5 + 0.5 * sin(uTime);
```

`uTime` est mis à jour côté JavaScript dans la boucle d'animation (`material.uniforms.uTime.value = clock.getElapsedTime()`). Le shader, lui, ne connaît que l'instant courant.

### 2.7 SDF — signed distance functions

Une **SDF** répond à : « à quelle distance suis-je de la surface de cet objet ? ». Elle renvoie un scalaire **signé** : positif à l'extérieur, négatif à l'intérieur, **zéro pile sur la surface**. Avec cette seule information, on peut décrire n'importe quelle forme mathématiquement, sans un seul sommet.

Primitives de référence (Inigo Quilez), en coordonnées locales `p` :

```glsl
// sphère de rayon r
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

// box de demi-dimensions b
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// tore : t.x = rayon majeur, t.y = rayon mineur
float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}
```

La sphère est limpide : `length(p)` est la distance au centre ; on soustrait le rayon → 0 sur la surface, négatif dedans.

### 2.8 Combiner les SDF : opérations booléennes

Puisqu'une SDF est un simple scalaire, on **combine** des formes par des opérations sur ces distances (Inigo Quilez) :

```glsl
// union : la plus proche des deux surfaces
float opUnion(float a, float b) { return min(a, b); }

// intersection : ne garder que le volume commun
float opIntersection(float a, float b) { return max(a, b); }

// soustraction : creuser b dans a
float opSubtraction(float a, float b) { return max(-a, b); }

// smooth union : fondu progressif entre deux formes (effet "blob")
float opSmoothUnion(float a, float b, float k) {
  k *= 4.0;
  float h = max(k - abs(a - b), 0.0);
  return min(a, b) - h * h * 0.25 / k;
}
```

Le `min`/`max` suffit pour des jointures nettes. Le **smooth union** remplace la cassure du `min` par une fusion douce (paramètre `k` = rayon du fondu) — c'est lui qui donne l'aspect « gouttes de mercure » des blobs organiques.

### 2.9 Raymarching (sphere tracing)

Comment **dessiner** une SDF ? Par **raymarching** : depuis la caméra, on lance un rayon par pixel et on **avance par pas égaux à la distance retournée par la SDF**. Comme la SDF garantit qu'aucune surface n'est plus proche que sa valeur, on peut sauter de cette distance sans rien traverser — puis recommencer. On s'arrête quand la distance passe sous un `epsilon` (touché) ou après trop de pas (raté). C'est le **sphere tracing**.

```
Camera                                       Surface
  o──────>o─────>o───>o──>o─>X
   d=3.2   d=1.8  d=0.9 ... d<eps (touché)
  chaque pas = distance renvoyée par la SDF
```

```glsl
// scène = une seule fonction qui combine toutes les SDF
float sceneSDF(vec3 p) {
  float sphere = sdSphere(p - vec3(0.0, 0.0, 0.0), 1.0);
  float ground = p.y + 1.0;              // plan horizontal
  return opUnion(sphere, ground);
}

// raymarch : renvoie la distance parcourue, ou -1.0 si rien touché
float rayMarch(vec3 origin, vec3 dir) {
  float t = 0.0;
  for (int i = 0; i < 100; i++) {        // borne d'itérations obligatoire
    vec3 p = origin + dir * t;
    float d = sceneSDF(p);
    if (d < 0.001) return t;             // touché : d sous epsilon
    if (t > 50.0) break;                 // trop loin : abandon
    t += d;                              // avancer de la distance SDF
  }
  return -1.0;
}
```

La **normale** en un point touché s'estime par le **gradient** de la SDF (différences finies) — indispensable pour l'éclairage :

```glsl
vec3 estimateNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}
```

---

## 3. Worked examples

### Exemple 1 — Le nuage animé TribuZen (fbm + uTime)

On reprend le shader du cas concret et on remplace le dégradé sinusoïdal par un **fbm animé** — le fond de l'écran des sorties. Deux couches de fbm se croisent pour un mouvement plus vivant, et une palette teinte le résultat.

```glsl
precision highp float;

uniform vec2 uResolution;
uniform float uTime;

// --- hash + value noise (2.2 / 2.3) ---
float random(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x)
                        + (d - b) * u.x * u.y;
}

// --- fbm (2.5) ---
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    value += amp * noise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return value;
}

void main() {
  // uv normalisé, corrigé de l'aspect ratio pour ne pas déformer le pattern
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.x *= uResolution.x / uResolution.y;

  // deux couches de fbm qui dérivent dans le temps (pattern "évolution", 2.6)
  vec2 q = vec2(fbm(uv * 3.0 + uTime * 0.05),
                fbm(uv * 3.0 + vec2(5.2, 1.3)));
  float n = fbm(uv * 3.0 + q + uTime * 0.03);

  // palette : bleu nuit -> bleu clair selon la densité du nuage
  vec3 deep = vec3(0.05, 0.10, 0.25);
  vec3 light = vec3(0.45, 0.60, 0.85);
  vec3 color = mix(deep, light, smoothstep(0.2, 0.8, n));

  gl_FragColor = vec4(color, 1.0);
}
```

Le pattern **domain warping** de la ligne `vec2 q = ...` (passer un fbm *dans* un autre fbm) est ce qui donne l'aspect « nuage torsadé » plutôt qu'un simple grain uniforme. Côté JavaScript, un seul uniform bouge :

```javascript
// dans la boucle d'animation (Three.js)
material.uniforms.uTime.value = clock.getElapsedTime();
material.uniforms.uResolution.value.set(canvas.width, canvas.height);
```

Résultat : une brume bleutée qui ondule doucement, **zéro texture image**, nette à toute résolution.

### Exemple 2 — Raymarcher deux formes fusionnées

Un fragment shader complet qui raymarche une **sphère et une box en smooth union**, éclairées, avec la caméra fixe. C'est le squelette minimal d'une scène SDF animée.

```glsl
precision highp float;

uniform vec2 uResolution;
uniform float uTime;

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float opSmoothUnion(float a, float b, float k) {
  k *= 4.0;
  float h = max(k - abs(a - b), 0.0);
  return min(a, b) - h * h * 0.25 / k;
}

// scène : une sphère qui va-et-vient, fusionnée à une box fixe
float sceneSDF(vec3 p) {
  float sphere = sdSphere(p - vec3(sin(uTime) * 0.8, 0.0, 0.0), 0.6);
  float box = sdBox(p, vec3(0.5));
  return opSmoothUnion(sphere, box, 0.3);
}

vec3 estimateNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}

float rayMarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 100; i++) {
    float d = sceneSDF(ro + rd * t);
    if (d < 0.001) return t;
    if (t > 50.0) break;
    t += d;
  }
  return -1.0;
}

void main() {
  // coordonnées centrées [-1,1], corrigées de l'aspect
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  vec3 ro = vec3(0.0, 0.0, 3.0);         // caméra reculée sur Z
  vec3 rd = normalize(vec3(uv, -1.0));   // rayon vers l'avant (fov ~90°)

  float t = rayMarch(ro, rd);
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = estimateNormal(p);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.8));
    float diffuse = max(dot(n, lightDir), 0.0);
    vec3 color = vec3(0.3, 0.6, 0.9) * (0.15 + 0.85 * diffuse);
    gl_FragColor = vec4(color, 1.0);
  } else {
    gl_FragColor = vec4(0.05, 0.07, 0.12, 1.0); // fond
  }
}
```

À l'exécution : une box bleue dont une sphère surgit et se rétracte sur le côté, les deux se **fondant** l'une dans l'autre (le `k = 0.3` du smooth union), éclairées par une seule lumière directionnelle. Tout tient dans un fragment shader — aucun sommet, aucune géométrie CPU.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Confondre `random()` (bruit blanc) et `noise()` (cohérent)

`random(st)` renvoie une valeur indépendante par point → neige inutilisable. `noise(st)` interpole entre coins → transitions douces. On n'affiche **jamais** `random()` directement comme visuel ; il ne sert qu'à **alimenter** le noise. Symptôme d'erreur : un écran de « neige » granuleuse au lieu d'un pattern organique.

### PIÈGE #2 — Interpolation linéaire au lieu de cubique dans le value noise

Sans la courbe `u = f*f*(3-2*f)` (utiliser `f` brut), l'interpolation reste linéaire et laisse des **arêtes diagonales visibles** aux frontières de cellules — un effet « facettes ». La courbe cubique (ou quintique pour le Perlin) annule la dérivée aux coins et lisse ces cassures. C'est le bug n°1 des premières implémentations.

### PIÈGE #3 — fbm sans faire décroître l'amplitude

Si toutes les octaves gardent la même amplitude, les hautes fréquences **dominent** et le résultat redevient du bruit chaotique. Le fbm exige `amplitude *= gain` (gain < 1, typiquement 0.5) à chaque octave : les grandes structures portent le signal, les fines n'ajoutent que du détail. Oublier la décroissance = perdre tout l'intérêt du fbm.

### PIÈGE #4 — Raymarch sans borne d'itérations ni distance max

Un `for` de raymarching **doit** avoir une borne d'itérations fixe (`i < 100`) ET un abandon sur distance (`t > 50.0`). Sans borne : boucle infinie potentielle (GPU figé, onglet crashé) quand le rayon part vers le vide. Sans `break` sur distance : itérations gâchées sur des rayons qui ne toucheront jamais rien. En GLSL, la borne de boucle doit souvent être une **constante** (pas un uniform), contrainte du langage.

### PIÈGE #5 — SDF non normalisée après une mise à l'échelle

Une SDF renvoie une **vraie distance euclidienne** — c'est ce qui rend le sphere tracing correct. Si tu multiplies naïvement `p` par un facteur d'échelle `s` sans diviser le résultat par `s`, la distance retournée est **surestimée** → le raymarch **saute par-dessus** la surface (elle disparaît ou scintille). Règle : après `p /= s`, il faut `return sdX(p) * s`. Même vigilance pour les rotations (préserver la métrique).

### PIÈGE #6 — Croire que le temps « avance » tout seul dans le shader

Un shader ne connaît que l'instant présent : il n'a **aucune mémoire** d'une frame à l'autre. Toute animation vient d'un **uniform `uTime` mis à jour côté CPU** à chaque frame. Oublier de faire `material.uniforms.uTime.value = ...` dans la boucle → image **figée**, même si le shader utilise `uTime` partout. Le mouvement est piloté par le JavaScript, pas par le GPU.

---

## 5. Ancrage TribuZen

Le procédural en shader donne à TribuZen des visuels **légers, animés et infiniment nets** sans un octet de texture ou de vidéo. La feature portée par ce module : le **fond animé de l'écran des sorties**.

**Le fond « brume » de l'écran des sorties.** Un plan plein cadre (ou un `ShaderMaterial` sur un quad plein écran) affiche le **fbm animé** de l'Exemple 1 : une brume bleutée qui ondule lentement derrière la liste des sorties de la famille. Avantages concrets face à une image :

- **poids nul** : ~2 Ko de GLSL vs des centaines de Ko d'image de fond ;
- **résolution infinie** : net sur mobile comme sur écran 4K, sans variantes @2x/@3x ;
- **animation gratuite** : le seul coût est un uniform `uTime` mis à jour par frame ;
- **thématisable** : changer la palette (`deep`/`light`) suffit à décliner un thème par saison.

Les briques SDF/raymarching (Exemple 2) alimentent, elles, les **détails décoratifs** : un badge/trophée 3D procédural (blob en smooth union) pour récompenser une famille active, sans charger de modèle glTF.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      shaders/
        fbmBackground.frag.glsl   ← Exemple 1 (nuage animé)
        raymarchBadge.frag.glsl   ← Exemple 2 (blob SDF)
      OutingsBackground.vue       ← quad plein écran + ShaderMaterial + uTime
```

> Le montage impose de mettre à jour `uTime` et `uResolution` dans la boucle et de **disposer** le `ShaderMaterial` au démontage du composant (`material.dispose()`), comme pour tout objet Three.js (module 17).

---

## 6. Points clés

1. Le **noise cohérent** garantit des valeurs proches pour des points proches — la base de tout visuel organique ; le bruit blanc (`random`) ne sert qu'à l'alimenter.
2. **Value noise** = hash aux coins + interpolation ; l'interpolation **cubique** `f*f*(3-2*f)` (quintique pour le Perlin) est ce qui lisse les frontières de cellules.
3. **Perlin/gradient noise** interpole des gradients (produit scalaire) → plus fluide ; **simplex** est sa version rapide et isotrope pour la 3D+.
4. **fbm** = somme d'octaves : fréquence ×`lacunarity` (2.0), amplitude ×`gain` (0.5) — c'est lui qui donne l'aspect nuage/brume.
5. Animer = injecter un **uniform `uTime`** dans les coordonnées ou le noise ; le shader n'a **aucune mémoire**, le CPU met `uTime` à jour chaque frame.
6. Une **SDF** renvoie la distance signée à une surface (négatif dedans) ; les primitives (`sdSphere`, `sdBox`, `sdTorus`) se combinent par `min`/`max` et **smooth union**.
7. Le **raymarching** avance le long d'un rayon par pas = distance SDF (sphere tracing) ; borne d'itérations **et** distance max obligatoires.
8. La **normale** d'une SDF s'estime par différences finies (gradient) — nécessaire pour l'éclairage du point touché.

---

## 7. Seeds Anki

```
Quelle est la différence entre bruit blanc (random) et noise cohérent ?|Le bruit blanc donne une valeur indépendante par point (aspect neige, inutilisable). Le noise cohérent (value/Perlin/simplex) garantit des valeurs proches pour des points proches -> transitions douces, aspect organique. random() ne sert qu'à alimenter le noise, jamais à afficher directement.
Pourquoi interpole-t-on avec f*f*(3-2*f) plutôt que f brut dans le value noise ?|f brut = interpolation linéaire, qui laisse des arêtes visibles aux frontières de cellules. La courbe cubique f*f*(3-2*f) (smoothstep) annule la dérivée aux coins et lisse les transitions. Le Perlin utilise la quintique f*f*f*(f*(f*6-15)+10) pour annuler aussi la dérivée seconde.
Que sont lacunarity et gain dans le fbm ?|À chaque octave, la fréquence est multipliée par lacunarity (typiquement 2.0 : détails 2x plus serrés) et l'amplitude par gain/persistance (typiquement 0.5 : chaque octave pèse moitié moins). Sans décroissance de l'amplitude, les hautes fréquences dominent et le fbm redevient chaotique.
Comment anime-t-on un effet dans un fragment shader ?|Par un uniform uTime (secondes écoulées) mis à jour côté CPU à chaque frame, injecté dans les coordonnées ou le noise (défilement, évolution, pulsation). Le shader n'a aucune mémoire d'une frame à l'autre : tout le mouvement vient du CPU qui incrémente uTime.
Qu'est-ce qu'une SDF et que signifie son signe ?|Une signed distance function renvoie la distance à la surface d'un objet : positive à l'extérieur, négative à l'intérieur, zéro sur la surface. Ex : sdSphere(p, r) = length(p) - r. On décrit ainsi n'importe quelle forme sans aucun sommet.
Comment combiner deux SDF par union, soustraction et smooth union ?|Union = min(a, b) ; intersection = max(a, b) ; soustraction = max(-a, b). Le smooth union remplace la cassure du min par un fondu doux paramétré par k (effet blob) : k*=4; h=max(k-abs(a-b),0); min(a,b)-h*h*0.25/k.
Explique le principe du raymarching (sphere tracing).|Depuis la caméra, un rayon par pixel avance par pas égaux à la distance retournée par la SDF (aucune surface n'est plus proche, donc le saut est sûr). On répète jusqu'à d < epsilon (touché) ou t > distance max / trop d'itérations (raté). Borne d'itérations et distance max sont obligatoires pour éviter les boucles infinies.
Comment obtient-on la normale d'une surface définie par une SDF ?|Par le gradient de la SDF estimé en différences finies : on échantillonne sceneSDF autour du point sur chaque axe (p ± epsilon) et on normalise le vecteur des différences. Cette normale sert ensuite à l'éclairage du point touché.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-19-shaders-creatifs/README.md`. Écrire de zéro un fragment shader procédural animé (fbm ou raymarching) dans un `ShaderMaterial` Three.js qui tourne dans un vrai navigateur — corrigé GLSL commenté intégral.
