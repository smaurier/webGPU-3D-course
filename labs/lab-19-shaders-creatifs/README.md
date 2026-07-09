# Lab 19 — Shaders créatifs (noise, fbm, raymarching)

> **Outcome :** à la fin, tu sais écrire de zéro un **fragment shader procédural animé** (fbm ou raymarching) dans un `ShaderMaterial` Three.js qui tourne dans un vrai navigateur, sans aucune texture image.
> **Vrai outil :** Three.js r185 dans le navigateur (Chrome/Firefox), via une import map — aucun bundler, aucun harnais simulé. Le GLSL est écrit à la main.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Le critère est **visuel** : une brume qui ondule (voie A) ou des formes SDF fusionnées et éclairées (voie B), animées par `uTime`, nettes à toute taille.

## Énoncé

Tu poses le **fond animé de l'écran des sorties de TribuZen** : un visuel calculé **entièrement dans le fragment shader**, à partir de mathématiques et du temps — zéro octet de texture. Deux voies, **choisis-en une** (la voie A est le fil rouge TribuZen ; la voie B est le badge 3D procédural) :

- **Voie A — nuage fbm animé.** Une brume bleutée qui ondule lentement (hash → value noise → fbm → domain warping → palette + `uTime`).
- **Voie B — raymarcher SDF.** Une sphère et une box en **smooth union** qui bougent, éclairées par une lumière directionnelle (SDF → raymarch → normale → diffuse).

Contrainte commune : **aucune image**, tout est procédural ; l'animation vient d'un uniform `uTime` mis à jour dans la boucle.

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement (canvas plein écran + import map). Ne rien changer :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 19 — Shader procédural TribuZen</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; }
    #app { display: block; width: 100vw; height: 100vh; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js"
    }
  }
  </script>
</head>
<body>
  <canvas id="app"></canvas>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

**`main.js`** — squelette à COMPLÉTER. Le montage « quad plein écran » est fourni ; le **GLSL est à toi** (les `// TODO`) :

```javascript
import * as THREE from 'three';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Caméra + scène "plein écran" : un plan qui couvre exactement la vue.
// (Ortho de -1..1, plan 2x2 : chaque fragment = un pixel de l'écran.)
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uTime:       { value: 0 },
  uResolution: { value: new THREE.Vector2() },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ `
    void main() { gl_Position = vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;

    // TODO A : random() + noise() + fbm(), puis domain warping + palette
    // TODO B : sdSphere/sdBox + opSmoothUnion + estimateNormal + rayMarch

    void main() {
      // TODO : calculer la couleur du pixel (voie A ou B)
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
  `,
});

scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

const clock = new THREE.Clock();
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
  uniforms.uResolution.value.set(canvas.width, canvas.height);
}
renderer.setAnimationLoop(() => {
  resize();
  // TODO : mettre uTime à jour SINON l'image est figée
  uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
});
```

Lancer : un serveur statique dans le dossier du lab (les modules ES + import map ne se chargent pas en `file://`) :

```bash
npx serve .
# puis ouvrir l'URL affichée (ex : http://localhost:3000)
```

## Étapes (en friction)

Écris le GLSL toi-même avant de regarder le corrigé.

**Voie A — nuage fbm :**

1. `random(vec2)` — hash `fract(sin(dot(...)) * 43758.5453123)`.
2. `noise(vec2)` — `floor`/`fract`, 4 coins, interpolation **cubique** `f*f*(3-2*f)` (pas linéaire, sinon arêtes).
3. `fbm(vec2)` — boucle 6 octaves : `value += amp*noise(p*freq)`, `freq*=2.0`, `amp*=0.5`.
4. `main` — `uv` normalisé + correction d'aspect, **domain warping** (un fbm dans un autre), `mix` de deux couleurs par `smoothstep`, décalage par `uTime`.

**Voie B — raymarcher SDF :**

1. `sdSphere`, `sdBox`, `opSmoothUnion(a, b, k)`.
2. `sceneSDF(p)` — une sphère qui bouge (`sin(uTime)`) en smooth union avec une box.
3. `estimateNormal(p)` — gradient par différences finies.
4. `rayMarch(ro, rd)` — boucle **bornée** (`i<100`) + abandon (`t>50.0`), avance `t += d`.
5. `main` — `uv` centré `(fragCoord - 0.5*res)/res.y`, `ro`/`rd`, marche, diffuse `max(dot(n, lightDir), 0)`.

Vérifie dans le navigateur à chaque étape. Erreurs à débusquer toi-même : écran « neige » (tu affiches `random` au lieu de `noise` ?), arêtes en facettes (interpolation linéaire ?), image figée (`uTime` non mis à jour ?), onglet qui gèle (raymarch sans borne ?), surface qui scintille/disparaît (SDF mise à l'échelle sans re-normaliser ?).

## Corrigé complet commenté

**Voie A — nuage fbm animé** (le fond de l'écran des sorties). Remplacer le `fragmentShader` du starter par :

```glsl
precision highp float;
uniform vec2 uResolution;
uniform float uTime;

// hash 1D : position -> pseudo-aléatoire déterministe [0,1]
float random(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
}

// value noise : random aux 4 coins + interpolation CUBIQUE (lisse les arêtes)
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);          // courbe cubique = clé du lissage
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x)
                        + (d - b) * u.x * u.y;
}

// fbm : 6 octaves, fréquence x2 (lacunarity) et amplitude /2 (gain) par octave
float fbm(vec2 p) {
  float value = 0.0, amp = 0.5, freq = 1.0;
  for (int i = 0; i < 6; i++) {
    value += amp * noise(p * freq);
    freq *= 2.0;
    amp  *= 0.5;                              // décroissance OBLIGATOIRE
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.x *= uResolution.x / uResolution.y;      // pas de déformation

  // domain warping : passer un fbm dans un autre -> aspect "nuage torsadé"
  vec2 q = vec2(fbm(uv * 3.0 + uTime * 0.05),
                fbm(uv * 3.0 + vec2(5.2, 1.3)));
  float n = fbm(uv * 3.0 + q + uTime * 0.03); // uTime = mouvement lent

  // palette : bleu nuit -> bleu clair selon la densité du nuage
  vec3 deep  = vec3(0.05, 0.10, 0.25);
  vec3 light = vec3(0.45, 0.60, 0.85);
  vec3 color = mix(deep, light, smoothstep(0.2, 0.8, n));

  gl_FragColor = vec4(color, 1.0);
}
```

**Voie B — raymarcher SDF** (badge 3D procédural) :

```glsl
precision highp float;
uniform vec2 uResolution;
uniform float uTime;

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// smooth union (Inigo Quilez) : fondu doux au lieu du min brut, k = rayon du fondu
float opSmoothUnion(float a, float b, float k) {
  k *= 4.0;
  float h = max(k - abs(a - b), 0.0);
  return min(a, b) - h * h * 0.25 / k;
}

// toute la scène en une fonction : sphère mobile fondue à une box fixe
float sceneSDF(vec3 p) {
  float sphere = sdSphere(p - vec3(sin(uTime) * 0.8, 0.0, 0.0), 0.6);
  float box    = sdBox(p, vec3(0.5));
  return opSmoothUnion(sphere, box, 0.3);
}

// normale = gradient de la SDF par différences finies
vec3 estimateNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}

// sphere tracing : avance par pas = distance SDF ; borne + distance max OBLIGATOIRES
float rayMarch(vec3 ro, vec3 rd) {
  float t = 0.0;
  for (int i = 0; i < 100; i++) {
    float d = sceneSDF(ro + rd * t);
    if (d < 0.001) return t;                  // touché
    if (t > 50.0) break;                      // trop loin -> abandon
    t += d;
  }
  return -1.0;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y; // centré + aspect
  vec3 ro = vec3(0.0, 0.0, 3.0);              // caméra reculée sur Z
  vec3 rd = normalize(vec3(uv, -1.0));        // rayon vers l'avant

  float t = rayMarch(ro, rd);
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = estimateNormal(p);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.8));
    float diffuse = max(dot(n, lightDir), 0.0);
    vec3 color = vec3(0.3, 0.6, 0.9) * (0.15 + 0.85 * diffuse);
    gl_FragColor = vec4(color, 1.0);
  } else {
    gl_FragColor = vec4(0.05, 0.07, 0.12, 1.0);
  }
}
```

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Quad plein écran | `ShaderMaterial` sur un `PlaneGeometry(2,2)`, caméra ortho | ☐ |
| Noise cohérent (A) | `random` alimente `noise`, jamais affiché seul (pas de « neige ») | ☐ |
| Interpolation lisse (A) | courbe cubique `f*f*(3-2*f)`, pas d'arêtes de cellule | ☐ |
| fbm correct (A) | 6 octaves, `freq*=2`, `amp*=0.5` (amplitude décroissante) | ☐ |
| SDF + combinaison (B) | `sdSphere`/`sdBox` + `opSmoothUnion`, fusion visible | ☐ |
| Raymarch borné (B) | boucle `i<100` **et** abandon `t>50`, `t += d` | ☐ |
| Normale + éclairage (B) | `estimateNormal` par différences finies, diffuse | ☐ |
| Animation | `uTime` mis à jour dans la boucle, mouvement visible | ☐ |
| Zéro texture image | tout est procédural | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Pourquoi ton fond serait-il figé si tu retires `uniforms.uTime.value = ...` de la boucle ?** (Attendu : le shader n'a aucune mémoire d'une frame à l'autre ; `uTime` reste à 0, le pattern est calculé identique à chaque frame. Tout le mouvement vient du CPU qui incrémente l'uniform.)
2. **Que verrais-tu si tu remplaçais `f*f*(3-2*f)` par `f` brut dans le value noise, et pourquoi ?** (Attendu : des arêtes diagonales « en facettes » aux frontières de cellules — l'interpolation linéaire ne lisse pas la dérivée aux coins ; la courbe cubique l'annule.)
3. **Pourquoi la boucle de raymarch a-t-elle DEUX conditions d'arrêt ?** (Attendu : `d < epsilon` = surface touchée ; `t > distance max` / `i < 100` = rayon vers le vide, sinon boucle qui gèle le GPU. Les deux sont indispensables.)
4. **Que représente le signe de la valeur retournée par une SDF ?** (Attendu : positif = dehors, négatif = dedans, zéro = sur la surface. `sdSphere = length(p) - r`.)
5. **À quoi sert le paramètre `k` de `opSmoothUnion`, et que se passe-t-il si `k → 0` ?** (Attendu : `k` est le rayon du fondu entre les deux formes ; à `k → 0`, le smooth union redevient un `min` brut = jointure nette, plus de « blob ».)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **25 minutes chrono**, avec une contrainte ajoutée selon ta voie :

- **Voie A** : ajouter une **deuxième couche** de fbm qui dérive dans le sens opposé (`- uTime * 0.04`) et la mélanger à la première — obtenir un mouvement plus vivant, sans réutiliser le corrigé.
- **Voie B** : ajouter une **troisième primitive** (un `sdTorus`) à la scène en `opSmoothUnion`, et lui faire tourner autour de l'axe Y avec `uTime` — sans regarder le corrigé.

Objectif : prouver que la structure (noise→fbm→palette, ou SDF→raymarch→éclairage) est acquise sans support.

## Application TribuZen

Ce shader devient le **fond animé de l'écran des sorties** dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      shaders/
        fbmBackground.frag.glsl   ← corrigé voie A (nuage animé)
        raymarchBadge.frag.glsl   ← corrigé voie B (blob SDF)
      OutingsBackground.vue       ← quad plein écran + ShaderMaterial + uTime
```

Portage concret :

- extraire le `fragmentShader` dans un fichier `.glsl` importé comme chaîne (via `?raw` avec Vite) ;
- monter le quad plein écran dans `OutingsBackground.vue`, mettre `uTime`/`uResolution` à jour au `onMounted`/boucle, et **disposer** le `ShaderMaterial` au `onUnmounted` (`material.dispose()` — fuite mémoire sinon, module 17) ;
- commit `smaurier/tribuzen` : `feat(3d): fond procédural animé de l'écran des sorties (fbm shader)`.
