---
titre: Rendu volumétrique — fog, nuages et raymarching de volumes
cours: 20-webgpu-3d
notions:
  - "milieu participatif (absorption, scattering, extinction, albedo)"
  - "loi de Beer-Lambert (transmittance exponentielle)"
  - "in-scattering vs out-scattering"
  - "fonction de phase Henyey-Greenstein (paramètre g)"
  - "raymarching volumétrique (accumulation le long du rayon)"
  - "depth fog (linéaire, exponentiel, exponentiel carré)"
  - "height fog (densité décroissante avec l'altitude, intégrale analytique)"
  - "god rays / light shafts (in-scattering + shadow map)"
  - "nuages procéduraux (density field, Beer-powder)"
outcomes:
  - sait décrire un milieu participatif par ses coefficients d'absorption et de scattering
  - sait appliquer la loi de Beer-Lambert pour calculer une transmittance
  - sait distinguer in-scattering et out-scattering dans le transport de lumière
  - sait implémenter une boucle de raymarching qui accumule couleur et transmittance
  - sait coder un depth fog et un height fog dans un fragment shader
  - sait produire un brouillard volumétrique par raymarching pour une carte 3D
prerequis:
  - "19-shaders-creatifs (noise, fbm, raymarching SDF, uniform uTime)"
  - "18-shadow-mapping (shadow map, test de visibilité)"
  - "05-lumiere-materiaux-et-pbr (modèles d'éclairage, direction de lumière)"
  - "04-pipeline-de-rendu (depth buffer, fragment shader)"
next: 25-webxr-et-animation-procedurale
libs: []
tribuzen: "front-office TribuZen — brume d'ambiance volumétrique sur la carte 3D des sorties de la famille, rendue par raymarching (density field + Beer-Lambert), sans texture ni vidéo"
last-reviewed: 2026-07
---

# Rendu volumétrique — fog, nuages et raymarching de volumes

> **Outcomes — tu sauras FAIRE :** décrire un milieu participatif, appliquer Beer-Lambert, distinguer in/out-scattering, écrire une boucle de raymarching qui accumule couleur et transmittance, coder un depth/height fog, et produire une brume volumétrique animée.
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** ce module traite les **volumes** — la lumière qui traverse un milieu (brouillard, fumée, nuages) au lieu de rebondir sur une surface. On part du modèle physique (absorption/scattering, Beer-Lambert), on l'intègre par raymarching, puis on décline en fog de distance, fog de hauteur, god rays et nuages. Le raymarching de **surfaces** (SDF) était au module 19 ; ici on raymarche un **champ de densité**, pas une distance.

## 1. Cas concret d'abord

La carte 3D des sorties de TribuZen (globe/plan interactif où chaque randonnée est un point) est **trop nette, trop propre** : elle ressemble à une maquette CAO, pas à un paysage. Ce qui manque, c'est de l'**air** — une brume d'ambiance qui estompe le fond, épaissit les vallées, et fait sentir la profondeur.

Une image de brouillard plaquée en overlay serait plate et ne réagirait ni à la caméra ni à la lumière. Ce qu'on veut, c'est un **vrai volume** : plus un point de la carte est loin, plus il est noyé dans la brume ; là où le soleil perce, on voit des **rais de lumière**.

Voici la brique de départ — un fragment shader de post-processing qui a déjà la couleur de la scène et la **distance** de chaque pixel (reconstruite du depth buffer), mais n'en fait encore rien :

```glsl
precision highp float;

uniform sampler2D uScene;   // couleur rendue de la carte
uniform float uDistance;    // distance caméra->point pour ce pixel (issue du depth)
varying vec2 vUv;

void main() {
  vec3 sceneColor = texture2D(uScene, vUv).rgb;

  // TODO : atténuer la couleur selon la distance traversée dans la brume
  gl_FragColor = vec4(sceneColor, 1.0);
}
```

La question de tout le module : **comment la lumière est-elle modifiée quand elle traverse `uDistance` mètres de brume ?** La réponse tient en une loi physique (Beer-Lambert) et une boucle d'intégration (raymarching). On part de ce shader et on le fait monter jusqu'à la brume volumétrique éclairée.

---

## 2. Théorie complète, concise

### 2.1 Milieu participatif : quand l'air n'est plus vide

Sur une **surface**, la lumière rebondit en un point. Dans un **milieu participatif** (brouillard, fumée, nuage, atmosphère), elle interagit **tout le long** de son trajet dans le volume. Trois phénomènes, décrits par des **coefficients** (unité : 1/mètre — probabilité d'interaction par unité de distance) :

- **absorption `σ_a`** : le milieu convertit la lumière en chaleur → il en « mange » (fumée noire) ;
- **scattering `σ_s`** : le milieu **dévie** la lumière dans une autre direction (brouillard blanc) ;
- **extinction `σ_t = σ_a + σ_s`** : la lumière **perdue** par unité de distance (dans la direction de vue), tous phénomènes confondus.

On en dérive l'**albédo du milieu** `= σ_s / σ_t` : 0 = absorption pure (fumée noire), 1 = scattering pur (brouillard blanc lumineux).

### 2.2 Absorption/out-scattering vs in-scattering

Le scattering agit dans **deux sens** opposés le long du rayon de vue — c'est le point qui piège tout le monde :

- **out-scattering** : de la lumière qui allait vers l'œil est **déviée ailleurs** → contribue, avec l'absorption, à **retirer** de la lumière (c'est ce que compte `σ_t`) ;
- **in-scattering** : de la lumière venant **d'autres directions** (typiquement une source) est déviée **vers l'œil** → **ajoute** de la lumière au rayon.

L'absorption et l'out-scattering **assombrissent** (extinction) ; l'in-scattering **éclaire** (c'est lui qui rend un brouillard blanc lumineux et qui dessine les god rays). Un rendu volumétrique complet fait les deux : atténuer ce qui vient du fond **et** ajouter ce que le volume renvoie.

### 2.3 Loi de Beer-Lambert : la transmittance

La **transmittance** `T` est la **fraction de lumière qui survit** à la traversée. Pour un milieu **homogène** (extinction constante), elle décroît **exponentiellement** avec la distance — c'est la loi de Beer-Lambert :

$$T(d) = e^{-\sigma_t \, d}$$

```glsl
// transmittance à travers un milieu homogène
float transmittance(float sigmaT, float distance) {
  return exp(-sigmaT * distance);
}
```

Quelques ordres de grandeur (avec `d` en mètres) :

| `σ_t` | `T` à 100 m | Rendu |
|-------|-------------|-------|
| 0.01 | `exp(-1) ≈ 0.37` | brume légère |
| 0.05 | `exp(-5) ≈ 0.007` | brouillard épais |
| 0.1 | `exp(-10) ≈ 0.00005` | mur de brouillard |

Pour un milieu **hétérogène** (densité variable — un vrai nuage), l'extinction n'est plus constante : il faut intégrer l'**épaisseur optique** `τ` (optical depth) le long du rayon, puis exponentier :

$$T(a,b) = e^{-\tau}, \quad \tau = \int_a^b \sigma_t(x)\,dx$$

Cette intégrale n'a pas de forme close en général → on l'**approche numériquement**, par raymarching.

### 2.4 Fonction de phase : dans quelle direction ?

L'in-scattering demande de savoir **quelle proportion** de la lumière d'une source part **vers l'œil**. C'est le rôle de la **fonction de phase** `p(θ)`, où `θ` est l'angle entre le rayon de vue et le rayon de lumière. La plus utilisée en graphisme est **Henyey-Greenstein**, pilotée par un seul paramètre `g` (asymétrie) :

$$p(\theta) = \frac{1 - g^2}{4\pi \, (1 + g^2 - 2g\cos\theta)^{3/2}}$$

- `g = 0` : **isotrope** (dévié également partout) ;
- `g > 0` : **forward scattering** (la lumière continue vers l'avant) — brouillard `g ≈ 0.7`, nuages `g ≈ 0.85` ;
- `g < 0` : **back scattering** (renvoyée vers la source).

```glsl
// Henyey-Greenstein : fraction de lumière diffusée vers l'angle theta
float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 0.0001), 1.5));
}
```

C'est le `g > 0` qui explique le **halo lumineux** quand on regarde vers le soleil à travers la brume : le forward scattering renvoie beaucoup de lumière vers l'œil dans cette direction.

### 2.5 L'équation, réduite à une boucle

L'équation complète du transport volumétrique intègre, pour chaque point du rayon, l'in-scattering pondéré par la transmittance jusqu'à ce point. En pratique on la simplifie (éclairage direct d'une seule source, pas de multi-scattering) et on l'intègre par **raymarching** : on avance par **pas fixes**, on échantillonne la densité, on accumule.

```
accumulated_color = 0        // lumière ajoutée par le volume (in-scattering)
transmittance     = 1        // fraction survivante du fond (part de 1 = tout passe)

pour chaque pas le long du rayon :
    density   = sample_density(position)      // champ de densité du milieu
    sigma_t   = density * extinction
    step_T    = exp(-sigma_t * step_size)     // Beer-Lambert sur ce pas

    // in-scattering : lumière de la source, visible ici, projetée vers l'œil
    in_scatter = shadow_test(position) * light_color
               * phase(view, light) * density * sigma_s
    accumulated_color += transmittance * in_scatter * step_size
    transmittance     *= step_T               // le fond s'atténue à chaque pas

    si transmittance < 0.01 : break           // early-out : le fond est éteint

final = accumulated_color + transmittance * background_color
```

Deux accumulateurs, jamais confondus : `transmittance` **descend** de 1 vers 0 (combien du fond survit), `accumulated_color` **monte** (ce que le volume ajoute). Le résultat mêle les deux.

### 2.6 Depth fog : le cas homogène, sans boucle

Si la densité est **constante** partout, l'intégrale de Beer-Lambert a une forme close → **pas de raymarching**, juste la distance. C'est le **depth fog**, le brouillard le moins cher (un `exp` par pixel). L'opacité du fog = `1 - T` :

```glsl
// fog linéaire : transition nette entre deux distances (peu réaliste, mais contrôlable)
float linearFog(float dist, float start, float end) {
  return clamp((dist - start) / (end - start), 0.0, 1.0);
}

// fog exponentiel : Beer-Lambert direct (Inigo Quilez) — le plus naturel
float exponentialFog(float dist, float density) {
  return 1.0 - exp(-dist * density);
}

// fog exponentiel carré : démarre plus doucement, monte plus vite ensuite
float exponentialSquaredFog(float dist, float density) {
  float d = dist * density;
  return 1.0 - exp(-d * d);
}
```

On mélange ensuite la couleur de la scène vers la couleur du fog par ce facteur (Inigo Quilez) :

```glsl
vec3 finalColor = mix(sceneColor, fogColor, exponentialFog(dist, density));
```

### 2.7 Height fog : densité qui décroît avec l'altitude

Le brouillard réel s'accumule **près du sol** : la densité décroît exponentiellement avec la hauteur, `d(y) = a·e^{-b·y}`. Intégrer cette densité le long d'un rayon incliné donne une **solution analytique** (Inigo Quilez) — encore sans boucle, ce qui la rend très bon marché :

$$\text{fogAmount} = \frac{a}{b}\, e^{-b\,y_0}\, \frac{1 - e^{-t\,b\,d_y}}{d_y}$$

où `y_0` est la hauteur de la caméra, `t` la distance au point, `d_y` la composante verticale de la direction du rayon.

```glsl
// height fog analytique (Inigo Quilez, iquilezles.org/articles/fog)
// col = couleur du pixel, t = distance, ro = position caméra, rd = direction caméra->point
vec3 applyHeightFog(vec3 col, float t, vec3 ro, vec3 rd) {
  // a = densité globale au niveau y=0 ; b = vitesse de décroissance verticale
  const float a = 0.10;
  const float b = 0.20;
  float fogAmount = (a / b) * exp(-ro.y * b) * (1.0 - exp(-t * rd.y * b)) / rd.y;
  vec3 fogColor = vec3(0.5, 0.6, 0.7);
  return mix(col, fogColor, clamp(fogAmount, 0.0, 1.0));
}
```

C'est cette version qui « remplit les vallées » de la carte TribuZen : bas = brume dense, sommets = air clair.

### 2.8 God rays : l'in-scattering rendu visible

Les **god rays** (light shafts, crépusculaires) sont l'in-scattering **là où la lumière atteint le volume** — et son absence là où un obstacle projette une ombre. La recette : raymarcher le volume et, **à chaque pas, tester la shadow map** (module 18) ; on n'ajoute d'in-scattering que si le point est éclairé.

```glsl
// god rays : raymarch + shadow test, accumule l'in-scattering
vec3 godRays(vec3 ro, vec3 rd, float maxDist, int steps, vec3 lightDir) {
  float stepSize = maxDist / float(steps);
  vec3 accum = vec3(0.0);
  float cosTheta = dot(rd, lightDir);
  float phase = henyeyGreenstein(cosTheta, 0.76);
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;                 // borne dynamique via constante (GLSL ES)
    vec3 pos = ro + rd * (float(i) + 0.5) * stepSize;
    float lit = shadowTest(pos);           // 1.0 si éclairé, 0.0 si dans l'ombre
    float density = sampleFogDensity(pos);
    accum += lit * density * phase * stepSize;
  }
  return accum;
}
```

Le **banding** (bandes visibles dues au pas fixe) se corrige en **décalant** le premier pas d'un offset pseudo-aléatoire par pixel (jitter) — le noise du module 19 sert exactement à ça.

### 2.9 Nuages : density field + Beer-powder

Un **nuage** est un milieu hétérogène : sa densité vient d'un **champ 3D** (fbm/noise 3D du module 19, remappé par une couverture et un gradient de hauteur). On le rend par le même raymarching, avec deux ajouts :

- un **light march** secondaire par pas (quelques pas **vers le soleil**) pour estimer combien de lumière atteint ce point à travers le reste du nuage ;
- **Beer-powder** au lieu de Beer-Lambert seul : les bords **fins** d'un nuage réel sont plus **sombres** (multi-scattering interne), ce que Beer seul ne rend pas. L'approximation (Frostbite/Guerrilla) :

$$T_{\text{powder}} = 2\, e^{-\tau} \, (1 - e^{-2\tau})$$

```glsl
// Beer-powder : assombrit les bords fins des nuages (approx. de multi-scattering)
float beerPowder(float opticalDepth) {
  float beer   = exp(-opticalDepth);
  float powder = 1.0 - exp(-opticalDepth * 2.0);
  return 2.0 * beer * powder;
}
```

Un nuage volumétrique complet est **cher** (raymarch principal × light march) ; pour TribuZen on reste sur une **brume** (density field simple, pas de light march) — le nuage détaillé est un objectif « expert » qu'on saura décliner à partir de ces briques.

---

## 3. Worked examples

### Exemple 1 — La brume de la carte TribuZen (depth + height fog)

On reprend le shader du cas concret et on applique un **height fog analytique** : la carte 3D des sorties se noie dans une brume dense en bas, claire en haut, sans une seule boucle. C'est le rendu le moins cher qui donne déjà de la profondeur.

```glsl
precision highp float;

uniform sampler2D uScene;   // couleur de la carte
uniform float uDistance;    // distance caméra->point (reconstruite du depth)
uniform vec3 uCameraPos;    // position caméra (monde)
uniform vec3 uRayDir;       // direction caméra->point (normalisée, monde)
varying vec2 vUv;

// height fog analytique (Inigo Quilez)
vec3 applyHeightFog(vec3 col, float t, vec3 ro, vec3 rd) {
  const float a = 0.12;   // densité au niveau du sol
  const float b = 0.25;   // décroissance verticale
  float fogAmount = (a / b) * exp(-ro.y * b) * (1.0 - exp(-t * rd.y * b)) / rd.y;
  vec3 fogColor = vec3(0.62, 0.68, 0.78);   // gris-bleu d'ambiance
  return mix(col, fogColor, clamp(fogAmount, 0.0, 1.0));
}

void main() {
  vec3 sceneColor = texture2D(uScene, vUv).rgb;
  vec3 foggy = applyHeightFog(sceneColor, uDistance, uCameraPos, uRayDir);
  gl_FragColor = vec4(foggy, 1.0);
}
```

Résultat : les randos lointaines et basses (fonds de vallée) s'estompent dans un gris-bleu, les sommets restent nets. Coût : **un `exp` par pixel**, aucune texture de brouillard, réagit automatiquement au déplacement de la caméra. Attention au cas `rd.y ≈ 0` (rayon horizontal) : la division par `rd.y` doit être protégée en production (on garde ici la forme d'origine pour la lisibilité).

### Exemple 2 — Brume volumétrique par raymarching (in-scattering)

Le height fog atténue mais **n'éclaire pas** : il ne montre pas de rais de lumière. Pour ça il faut **raymarcher** et accumuler l'in-scattering. Voici la boucle complète — c'est le squelette réutilisable pour la brume, les god rays et (étendu) les nuages.

```glsl
precision highp float;

uniform vec3 uCameraPos;
uniform vec3 uRayDir;       // direction du rayon pour ce pixel
uniform float uMaxDist;     // distance de la surface (fond) sur ce rayon
uniform vec3 uLightDir;     // direction de la lumière (soleil)
uniform vec3 uLightColor;
uniform float uTime;
uniform sampler2D uScene;
varying vec2 vUv;

float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  float denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 0.0001), 1.5));
}

// densité de brume : dense en bas, animée par uTime (nappe qui ondule)
float sampleFogDensity(vec3 p) {
  float base = exp(-max(p.y, 0.0) * 0.5);          // décroît avec la hauteur
  float wobble = 0.5 + 0.5 * sin(p.x * 0.3 + uTime * 0.4)
                          * sin(p.z * 0.3 - uTime * 0.3);
  return base * wobble * 0.15;
}

void main() {
  vec3 sceneColor = texture2D(uScene, vUv).rgb;

  const int STEPS = 48;
  float stepSize = uMaxDist / float(STEPS);
  float sigmaS = 0.6;                                // scattering
  float sigmaT = 0.8;                                // extinction (>= sigmaS)

  vec3 accum = vec3(0.0);                            // in-scattering accumulé
  float transmittance = 1.0;                         // fraction du fond survivante
  float cosTheta = dot(uRayDir, uLightDir);
  float phase = henyeyGreenstein(cosTheta, 0.76);    // forward scattering (halo soleil)

  for (int i = 0; i < 48; i++) {                     // borne = constante (GLSL ES)
    float t = (float(i) + 0.5) * stepSize;
    vec3 pos = uCameraPos + uRayDir * t;
    float density = sampleFogDensity(pos);

    if (density > 0.001) {
      float stepSigmaT = density * sigmaT;
      float stepT = exp(-stepSigmaT * stepSize);      // Beer-Lambert sur le pas

      // in-scattering : lumière de la source projetée vers l'œil
      vec3 inScatter = uLightColor * phase * density * sigmaS;
      // intégration exacte du pas (energy-conserving) plutôt que * stepSize brut
      accum += transmittance * inScatter * (1.0 - stepT) / max(stepSigmaT, 0.0001);
      transmittance *= stepT;

      if (transmittance < 0.01) break;                // fond éteint : inutile de continuer
    }
  }

  // le fond survivant + ce que la brume a ajouté
  vec3 finalColor = transmittance * sceneColor + accum;
  gl_FragColor = vec4(finalColor, 1.0);
}
```

Deux points cruciaux. (1) `transmittance` part de **1** et **ne remonte jamais** — chaque `*= stepT` la réduit ; le fond `sceneColor` est pondéré par sa valeur finale. (2) Le terme d'intégration `(1 - stepT) / stepSigmaT` (au lieu de `* stepSize` brut) conserve l'énergie même quand le pas est gros : c'est la forme exacte de l'intégrale sur un pas d'extinction constante. Côté CPU, on met `uTime`, `uMaxDist` (du depth buffer) et `uLightDir` à jour par frame — le shader, comme au module 19, n'a aucune mémoire.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Confondre in-scattering et out-scattering

L'out-scattering **retire** de la lumière au rayon de vue (compté dans `σ_t`, il assombrit) ; l'in-scattering **ajoute** de la lumière venue d'une source (il éclaire, dessine les god rays). Ce sont deux effets **opposés** du même phénomène de scattering le long du rayon. Ne modéliser que l'extinction (`σ_t`) donne un brouillard qui **assombrit** mais ne s'illumine jamais — pas de brume blanche lumineuse, pas de rais de soleil.

### PIÈGE #2 — Oublier que la transmittance ne remonte jamais

`transmittance` **part de 1** et décroît par `*= exp(-…)` à chaque pas. C'est la fraction du **fond** qui survit. Erreur classique : la réinitialiser dans la boucle, ou l'additionner au lieu de la multiplier → le fond réapparaît « à travers » la brume ou clignote. Elle est **strictement décroissante** ; seul `accumulated_color` monte.

### PIÈGE #3 — Beer-Lambert homogène sur un milieu hétérogène

`T = exp(-σ_t·d)` n'est valable que si l'extinction est **constante** sur toute la distance `d`. Pour un nuage (densité variable), l'appliquer d'un coup sur la distance totale est **faux** : il faut accumuler l'épaisseur optique `τ = Σ σ_t·step` pas à pas, puis `exp(-τ)`. Le depth fog homogène marche justement parce que la densité y est supposée constante.

### PIÈGE #4 — Raymarch sans early-out ni borne

Comme au module 19, la boucle **doit** avoir une borne d'itérations **constante** (`i < 48` en GLSL ES, où la borne ne peut pas être un uniform) — sinon le shader ne compile pas ou fige le GPU. En plus, l'**early-out** `if (transmittance < 0.01) break;` évite de raymarcher un volume déjà opaque : sans lui, on paie 48 pas même quand le fond est éteint depuis le 5e.

### PIÈGE #5 — Banding dû au pas fixe

Un raymarch à **pas fixe** produit des **bandes concentriques** visibles (surtout en fog dense) : chaque pas échantillonne la même « couche ». La correction n'est **pas** d'augmenter le nombre de pas (coûteux) mais de **jitter** le point de départ d'un offset pseudo-aléatoire par pixel (`t0 += random(pixel) * stepSize`) : le banding se transforme en bruit fin, bien moins visible, et disparaît avec l'accumulation temporelle.

### PIÈGE #6 — Height fog qui explose quand le rayon est horizontal

La forme analytique du height fog divise par `rd.y`. Quand le rayon est **horizontal** (`rd.y → 0`), la division explose (NaN, écran blanc). Il faut soit **clamper** `rd.y` loin de zéro, soit basculer sur une **forme limite** (densité constante × distance) pour les rayons quasi-horizontaux. Symptôme : une ligne blanche à l'horizon.

### PIÈGE #7 — Croire que Beer-powder remplace Beer-Lambert

Beer-powder `2·exp(-τ)·(1 - exp(-2τ))` n'est **pas** une transmittance générale : c'est un **facteur d'éclairage** spécifique aux nuages qui assombrit les bords fins (approximation de multi-scattering). L'extinction du fond, elle, reste du Beer-Lambert classique `exp(-τ)`. Utiliser Beer-powder pour atténuer le fond donne des résultats non conservatifs (le milieu peut « ajouter » de la lumière de nulle part).

---

## 5. Ancrage TribuZen

Le rendu volumétrique donne à la carte 3D des sorties de TribuZen une **atmosphère** — de la profondeur et de la lumière — sans un octet de texture ni de vidéo, et en réagissant à la caméra et au soleil en temps réel.

**La brume d'ambiance de la carte des sorties.** Sur le globe/plan 3D des randonnées de la famille, on applique deux couches complémentaires :

- **height fog analytique** (Exemple 1) en post-processing : les fonds de vallée et les points lointains s'estompent dans un gris-bleu, les sommets restent nets. Coût quasi nul (un `exp`/pixel), c'est le socle « profondeur ».
- **brume volumétrique raymarchée** (Exemple 2) là où le budget le permet (desktop, WebGPU) : une nappe basse qui ondule et **capte la lumière du soleil**, avec un léger halo quand on regarde vers la source — l'in-scattering rend la scène **vivante** plutôt que juste estompée.

Avantages concrets face à un overlay image :

- **réactif** : la brume suit la caméra et la direction du soleil (heure de la sortie), impossible avec une image plaquée ;
- **poids nul** : quelques lignes de GLSL vs une texture de brouillard ;
- **paramétrable** : `density`/`fogColor` déclinent une ambiance par saison ou météo de la sortie.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      shaders/
        heightFog.frag.glsl        ← Exemple 1 (fog analytique, post-process)
        volumetricFog.frag.glsl    ← Exemple 2 (raymarch in-scattering)
      OutingsMap.vue                ← carte 3D + passe de fog (EffectComposer)
```

> Le montage réutilise le **depth buffer** de la carte (reconstruction de `uDistance`/`uRayDir` par pixel) et le **shadow map** du soleil (module 18) pour les god rays. Comme tout objet Three.js, la passe et ses render targets doivent être **disposés** au démontage du composant (module 17).

---

## 6. Points clés

1. Un **milieu participatif** interagit avec la lumière tout au long du rayon, décrit par `σ_a` (absorption), `σ_s` (scattering) et `σ_t = σ_a + σ_s` (extinction).
2. **out-scattering + absorption** retirent de la lumière (assombrissent) ; **in-scattering** en ajoute depuis une source (éclaire, god rays) — deux effets opposés à modéliser ensemble.
3. **Beer-Lambert** `T = exp(-σ_t·d)` donne la transmittance d'un milieu **homogène** ; hétérogène → accumuler l'épaisseur optique `τ` puis `exp(-τ)`.
4. La **fonction de phase** Henyey-Greenstein (`g`) dit quelle part de la source part vers l'œil : `g>0` = forward (halo soleil), `g=0` = isotrope.
5. Le **raymarching volumétrique** accumule deux quantités : `transmittance` (part de 1, décroît) et `accumulated_color` (part de 0, monte) ; `final = T·fond + accum`.
6. **depth fog** (homogène, un `exp`/pixel) et **height fog** (densité `a·e^{-b·y}`, intégrale analytique) sont les fogs bon marché ; le raymarch est réservé à l'in-scattering et aux volumes hétérogènes.
7. **god rays** = raymarch + shadow test par pas (in-scattering seulement où c'est éclairé) ; jitter le départ pour tuer le banding.
8. **nuages** = density field 3D + light march vers le soleil + **Beer-powder** `2·exp(-τ)·(1-exp(-2τ))` pour assombrir les bords fins.

---

## 7. Seeds Anki

```
Quels sont les coefficients d'un milieu participatif et comment se combinent-ils ?|Absorption sigma_a (lumière convertie en chaleur) + scattering sigma_s (lumière déviée) = extinction sigma_t = sigma_a + sigma_s (lumière perdue par unité de distance dans la direction de vue). Albédo du milieu = sigma_s / sigma_t : 0 = fumée noire, 1 = brouillard blanc.
Quelle est la différence entre in-scattering et out-scattering ?|Out-scattering dévie hors du rayon de vue de la lumière qui allait vers l'œil -> retire de la lumière (avec l'absorption, c'est l'extinction, ça assombrit). In-scattering dévie vers l'œil de la lumière venant d'une source -> ajoute de la lumière (brume lumineuse, god rays). Ce sont deux effets opposés du scattering, tous deux à modéliser.
Énonce la loi de Beer-Lambert et sa limite.|T(d) = exp(-sigma_t * d) : la transmittance (fraction de lumière survivante) décroît exponentiellement avec la distance. Valable seulement si l'extinction est CONSTANTE (milieu homogène). Pour un milieu hétérogène (nuage), il faut accumuler l'épaisseur optique tau = intégrale de sigma_t le long du rayon, puis T = exp(-tau).
À quoi sert la fonction de phase Henyey-Greenstein et que fait le paramètre g ?|Elle donne la fraction de lumière d'une source diffusée vers l'angle theta (entre vue et lumière) : p = (1-g²)/(4π(1+g²-2g·cosθ)^1.5). g=0 isotrope, g>0 forward scattering (halo lumineux vers le soleil, brouillard ~0.7, nuages ~0.85), g<0 back scattering. Sert à pondérer l'in-scattering.
Décris la boucle de raymarching volumétrique et ses deux accumulateurs.|On avance par pas fixes le long du rayon. transmittance part de 1 et décroît (*= exp(-sigma_t*step)) : fraction du fond survivante. accumulated_color part de 0 et monte : in-scattering (shadow*light*phase*density*sigma_s) pondéré par la transmittance courante. Résultat : final = transmittance*fond + accumulated_color. Borne d'itérations constante + early-out quand transmittance < 0.01.
Différence entre depth fog et height fog, et pourquoi sont-ils bon marché ?|Depth fog : densité constante, opacité = 1 - exp(-density*distance), un exp par pixel, pas de boucle. Height fog : densité qui décroît avec l'altitude d(y)=a·exp(-b·y), intégrée analytiquement le long du rayon (fogAmount = (a/b)·exp(-ro.y·b)·(1-exp(-t·rd.y·b))/rd.y). Les deux ont une forme close -> pas de raymarching, très rapides. Le raymarch est réservé à l'in-scattering et aux milieux hétérogènes.
Comment produit-on des god rays, et comment évite-t-on le banding ?|God rays = raymarch du volume en testant la shadow map à chaque pas : on ajoute de l'in-scattering seulement où le point est éclairé (rien dans l'ombre projetée par un obstacle). Le banding (bandes dues au pas fixe) se corrige en jitterant le point de départ d'un offset pseudo-aléatoire par pixel (t0 += random(pixel)*step), pas en augmentant le nombre de pas.
Qu'est-ce que Beer-powder et pourquoi l'utilise-t-on pour les nuages ?|Beer seul (exp(-tau)) rend les bords fins des nuages trop clairs. Beer-powder = 2·exp(-tau)·(1-exp(-2·tau)) assombrit ces bords fins (approximation du multi-scattering interne). C'est un facteur d'ÉCLAIRAGE spécifique aux nuages, pas une transmittance générale : l'extinction du fond reste du Beer-Lambert classique.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-24-rendu-volumetrique/README.md`. Écrire de zéro un fragment shader de **brume volumétrique par raymarching** (density field + Beer-Lambert + in-scattering) dans un `ShaderMaterial` Three.js qui tourne dans un vrai navigateur — corrigé GLSL commenté intégral.
