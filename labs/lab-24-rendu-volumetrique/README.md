# Lab 24 — Rendu volumétrique (brume par raymarching)

> **Outcome :** à la fin, tu sais écrire de zéro un **fragment shader de brume volumétrique** (density field + Beer-Lambert + in-scattering) dans un `ShaderMaterial` Three.js qui tourne dans un vrai navigateur, sans aucune texture.
> **Vrai outil :** Three.js r185 dans le navigateur (Chrome/Firefox), via une import map — aucun bundler, aucun harnais simulé. Le GLSL est écrit à la main.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Le critère est **visuel** : une nappe de brume qui ondule, atténue le fond selon la distance, et s'éclaire dans la direction du soleil (halo), animée par `uTime`.

## Énoncé

Tu poses la **brume d'ambiance de la carte 3D des sorties de TribuZen** : un volume calculé **entièrement dans le fragment shader**, qui atténue une scène de fond selon la distance traversée et **ajoute** de la lumière (in-scattering) là où le soleil frappe le volume — zéro texture, tout est procédural.

Pour rester autonome (pas de vraie scène 3D ni de depth buffer à câbler), le fond est un **dégradé procédural** avec quelques « collines » simulées par une fonction de profondeur : le rayon s'arrête à une distance `maxDist` calculée dans le shader. Tu raymarches la brume entre la caméra et cette distance.

Contraintes : **aucune image**, une **boucle de raymarching bornée**, deux accumulateurs (`transmittance` qui descend, `accum` qui monte), l'animation vient d'un uniform `uTime`.

### Starter (à créer, deux fichiers)

**`index.html`** — fourni intégralement (canvas plein écran + import map). Ne rien changer :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 24 — Brume volumétrique TribuZen</title>
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

**`main.js`** — squelette à COMPLÉTER. Le montage « quad plein écran » et les uniforms sont fournis ; le **GLSL est à toi** (les `// TODO`) :

```javascript
import * as THREE from 'three';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// quad plein écran : plan 2x2 vu par une caméra ortho -1..1
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uniforms = {
  uTime:       { value: 0 },
  uResolution: { value: new THREE.Vector2() },
  uLightDir:   { value: new THREE.Vector3(0.6, 0.5, -0.6).normalize() },
  uLightColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
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
    uniform vec3 uLightDir;
    uniform vec3 uLightColor;

    // fond procédural : un dégradé ciel + une "colline" qui borne le rayon.
    // renvoie la couleur de fond ET écrit la distance max dans out maxDist.
    vec3 background(vec2 uv, out float maxDist) {
      vec3 sky = mix(vec3(0.30, 0.45, 0.65), vec3(0.70, 0.80, 0.92), uv.y);
      float horizon = 0.35 + 0.05 * sin(uv.x * 6.0);
      // plus le pixel est bas, plus la surface est "proche" (grande brume)
      maxDist = mix(30.0, 6.0, smoothstep(horizon + 0.1, horizon - 0.1, uv.y));
      return sky;
    }

    // TODO 1 : henyeyGreenstein(cosTheta, g)
    // TODO 2 : sampleFogDensity(pos) — dense en bas, ondule avec uTime
    // TODO 3 : raymarch — boucle bornée, transmittance (1->0) + accum (0->)

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution;
      float maxDist;
      vec3 sceneColor = background(uv, maxDist);

      // rayon : caméra à (0,2,10), regarde vers -Z, uv pilote la direction
      vec3 ro = vec3(0.0, 2.0, 10.0);
      vec3 rd = normalize(vec3((uv - 0.5) * vec2(2.0, 1.2), -1.0));

      // TODO 4 : raymarcher la brume entre ro et ro+rd*maxDist,
      //          combiner : finalColor = transmittance * sceneColor + accum
      vec3 finalColor = sceneColor;

      gl_FragColor = vec4(finalColor, 1.0);
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
  // TODO : mettre uTime à jour SINON la brume est figée
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

1. **`henyeyGreenstein(cosTheta, g)`** — `(1-g²)/(4π·(1+g²-2g·cosθ)^1.5)`, protège la puissance (`max(denom, 1e-4)`). C'est elle qui crée le halo vers le soleil.
2. **`sampleFogDensity(pos)`** — densité qui **décroît avec la hauteur** (`exp(-pos.y * k)`) et **ondule** avec `uTime` (deux `sin` croisés en x/z). Échelle finale faible (~0.15).
3. **`raymarch`** — dans `main`, boucle **bornée** (`i < N` avec `N` constant, ex. 48) :
   - `stepSize = maxDist / N`, `t = (i+0.5)*stepSize`, `pos = ro + rd*t` ;
   - `density = sampleFogDensity(pos)` ; si `density > 0.001` :
     - `stepSigmaT = density * sigmaT` ; `stepT = exp(-stepSigmaT * stepSize)` (**Beer-Lambert**) ;
     - `inScatter = uLightColor * phase * density * sigmaS` ;
     - `accum += transmittance * inScatter * (1 - stepT) / max(stepSigmaT, 1e-4)` ;
     - `transmittance *= stepT` ; **early-out** si `transmittance < 0.01`.
4. **Combiner** : `finalColor = transmittance * sceneColor + accum`.

Vérifie dans le navigateur à chaque étape. Erreurs à débusquer toi-même : brume figée (`uTime` non mis à jour ?), fond qui clignote/réapparaît (`transmittance` additionnée au lieu de multipliée, ou remise à 1 ?), onglet qui gèle (boucle non bornée / borne = uniform ?), pas de halo soleil (`g` négatif ou nul ?), brume qui « ajoute » de la lumière partout même sans soleil (in-scatter non pondéré par `transmittance` ?).

## Corrigé complet commenté

Remplacer le `fragmentShader` du starter par ceci (le reste de `main.js` est inchangé) :

```glsl
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uLightColor;

// --- fond procédural + distance max (fourni dans le starter) ---
vec3 background(vec2 uv, out float maxDist) {
  vec3 sky = mix(vec3(0.30, 0.45, 0.65), vec3(0.70, 0.80, 0.92), uv.y);
  float horizon = 0.35 + 0.05 * sin(uv.x * 6.0);
  maxDist = mix(30.0, 6.0, smoothstep(horizon + 0.1, horizon - 0.1, uv.y));
  return sky;
}

// fonction de phase : fraction de la source diffusée vers l'œil (halo si g>0)
float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 0.0001), 1.5));
}

// densité de la brume : dense en bas, nappe qui ondule dans le temps
float sampleFogDensity(vec3 p) {
  float base = exp(-max(p.y, 0.0) * 0.5);          // décroît avec la hauteur
  float wobble = 0.5 + 0.5 * sin(p.x * 0.3 + uTime * 0.4)
                          * sin(p.z * 0.3 - uTime * 0.3);
  return base * wobble * 0.15;                      // échelle globale faible
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float maxDist;
  vec3 sceneColor = background(uv, maxDist);

  vec3 ro = vec3(0.0, 2.0, 10.0);                   // caméra
  vec3 rd = normalize(vec3((uv - 0.5) * vec2(2.0, 1.2), -1.0));

  const int STEPS = 48;                             // borne CONSTANTE (GLSL ES)
  float stepSize = maxDist / float(STEPS);
  float sigmaS = 0.6;                               // scattering
  float sigmaT = 0.8;                               // extinction (>= sigmaS)

  vec3 accum = vec3(0.0);                           // in-scattering accumulé (monte)
  float transmittance = 1.0;                        // fraction du fond survivante (descend)
  float cosTheta = dot(rd, uLightDir);
  float phase = henyeyGreenstein(cosTheta, 0.76);   // forward -> halo vers le soleil

  for (int i = 0; i < 48; i++) {
    float t = (float(i) + 0.5) * stepSize;
    vec3 pos = ro + rd * t;
    float density = sampleFogDensity(pos);

    if (density > 0.001) {
      float stepSigmaT = density * sigmaT;
      float stepT = exp(-stepSigmaT * stepSize);     // Beer-Lambert sur ce pas

      // in-scattering : lumière de la source projetée vers l'œil, pondérée
      // par la transmittance courante (ce qui la précède l'a déjà atténuée)
      vec3 inScatter = uLightColor * phase * density * sigmaS;
      accum += transmittance * inScatter * (1.0 - stepT) / max(stepSigmaT, 0.0001);
      transmittance *= stepT;                        // ne remonte JAMAIS

      if (transmittance < 0.01) break;               // fond éteint : on arrête
    }
  }

  // le fond survivant + ce que la brume a ajouté
  vec3 finalColor = transmittance * sceneColor + accum;
  gl_FragColor = vec4(finalColor, 1.0);
}
```

Ce qui doit apparaître : un ciel dégradé, une brume plus dense en bas de l'image, qui **ondule** doucement, **atténue** le fond avec la distance, et présente un **halo plus lumineux** dans la zone où `rd` s'aligne avec `uLightDir` (forward scattering). Bouge `uLightDir` (dans `main.js`) et le halo se déplace.

## Grille d'évaluation

| Critère | Attendu | OK ? |
|---|---|---|
| Quad plein écran | `ShaderMaterial` sur `PlaneGeometry(2,2)`, caméra ortho | ☐ |
| Fonction de phase | `henyeyGreenstein` correcte, puissance protégée | ☐ |
| Density field | densité décroît avec la hauteur ET ondule avec `uTime` | ☐ |
| Raymarch borné | boucle `i<48` (borne **constante**) + early-out `transmittance<0.01` | ☐ |
| Beer-Lambert par pas | `stepT = exp(-density*sigmaT*stepSize)` | ☐ |
| Deux accumulateurs | `transmittance` descend (`*=`), `accum` monte, jamais confondus | ☐ |
| In-scattering pondéré | `accum += transmittance * inScatter * …` (pondéré par la transmittance) | ☐ |
| Combinaison finale | `transmittance * sceneColor + accum` | ☐ |
| Halo visible | zone plus lumineuse vers `uLightDir` (forward scattering) | ☐ |
| Animation | `uTime` mis à jour dans la boucle, brume qui bouge | ☐ |
| Zéro texture image | tout est procédural | ☐ |

## Coach — questions de validation en session

Au moins trois, à poser à froid après le lab :

1. **Pourquoi `transmittance` part-elle de 1 et pourquoi ne doit-elle jamais remonter ?** (Attendu : c'est la fraction du fond qui survit à la traversée ; au départ rien n'a été traversé, tout passe = 1. Chaque pas la multiplie par `exp(-…) < 1`, donc elle décroît strictement. La remonter ou l'additionner ferait « réapparaître » le fond à travers la brume.)
2. **Quelle est la différence entre les deux accumulateurs de la boucle ?** (Attendu : `transmittance` mesure ce qui reste du **fond** (descend de 1) ; `accum` mesure la lumière que le **volume ajoute** par in-scattering (monte de 0). Résultat final = `transmittance*fond + accum`.)
3. **Pourquoi la borne de la boucle est-elle une constante (`i < 48`) et pas un uniform ?** (Attendu : en GLSL ES, les boucles doivent avoir une borne connue à la compilation ; une borne dynamique ne compile pas ou fige le GPU. On combine avec un early-out pour ne pas gâcher les pas.)
4. **À quoi sert le paramètre `g` de la fonction de phase, et que verrais-tu avec `g = 0` ?** (Attendu : `g` = asymétrie ; `g>0` = forward scattering, qui crée le halo lumineux vers le soleil. À `g=0` la phase est isotrope : la brume s'éclaire uniformément, plus de halo directionnel.)
5. **Pourquoi ne pas appliquer `exp(-sigmaT * maxDist)` d'un coup au lieu de raymarcher ?** (Attendu : Beer-Lambert d'un coup n'est valable que si l'extinction est **constante** ; ici la densité varie avec la hauteur et le temps (hétérogène). Il faut accumuler pas à pas. Et surtout, un `exp` global n'ajoute aucun in-scattering — pas de halo ni de brume lumineuse.)

## Variante J+30 (fading)

Reprendre le lab **sans regarder le corrigé**, en **30 minutes chrono**, avec une contrainte ajoutée :

- **jitter anti-banding** : décale le point de départ du raymarch d'un offset pseudo-aléatoire par pixel (`t0 += random(gl_FragCoord.xy) * stepSize`, avec un `random` hash comme au module 19) et vérifie que les **bandes concentriques** de la brume dense disparaissent au profit d'un grain fin — le tout sans réutiliser le corrigé.

Objectif : prouver que la structure (density field → raymarch → transmittance/accum → combinaison) est acquise sans support, et comprendre pourquoi le jitter bat l'augmentation du nombre de pas.

## Application TribuZen

Cette brume devient l'**ambiance de la carte 3D des sorties** dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      shaders/
        volumetricFog.frag.glsl    ← corrigé (raymarch in-scattering)
        heightFog.frag.glsl        ← version analytique bon marché (fallback mobile)
      OutingsMap.vue                ← carte 3D + passe de fog (EffectComposer)
```

Portage concret :

- extraire le `fragmentShader` dans un fichier `.glsl` importé comme chaîne (via `?raw` avec Vite) ;
- brancher la passe sur la **vraie carte** : reconstruire `maxDist`/`rd` par pixel depuis le **depth buffer** de la scène (au lieu du fond procédural du lab), et passer la direction réelle du soleil (heure de la sortie) dans `uLightDir` ;
- prévoir un **fallback** `heightFog.frag.glsl` (analytique, un `exp`/pixel) sur mobile/GPU faible, et **disposer** la passe et ses render targets au `onUnmounted` (module 17) ;
- commit `smaurier/tribuzen` : `feat(3d): brume volumétrique d'ambiance sur la carte des sorties (raymarch fog)`.
