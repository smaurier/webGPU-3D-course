---
titre: Global illumination et techniques screen-space
cours: 20-webgpu-3d
notions:
  - "illumination globale = éclairage direct + indirect (rebonds, color bleeding)"
  - "light baking et lightmaps (GI pré-calculée pour scènes statiques)"
  - "radiosité (échange d'énergie diffuse entre surfaces)"
  - "GI probes / irradiance probes (capture de l'éclairage ambiant, grille interpolée)"
  - "G-buffer et rendu deferred (position, normale, albedo découplés du shading)"
  - "SSAO — Screen-Space Ambient Occlusion (hémisphère orienté normale + range check)"
  - "SSR — Screen-Space Reflections (ray marching dans le depth buffer)"
  - "limites du screen-space (ne voit que ce qui est à l'écran)"
outcomes:
  - sait expliquer la différence entre éclairage direct et illumination globale, et nommer color bleeding/radiosité
  - sait distinguer GI pré-calculée (light baking, lightmaps, probes baked) et GI temps réel
  - sait décrire ce qu'est un light/irradiance probe et l'interpolation entre probes d'une grille
  - sait expliquer le rôle d'un G-buffer et du rendu deferred pour les effets screen-space
  - sait poser l'algorithme SSAO (hémisphère orienté normale, noise, occlusion + range check, blur)
  - sait ajouter un SSAOPass Three.js à un EffectComposer et régler kernelRadius/minDistance/maxDistance
  - sait décrire le principe du SSR (ray marching dans le depth buffer) et ses limites intrinsèques
prerequis:
  - "05-lumiere-materiaux-et-pbr (modèles d'éclairage, BRDF, PBR)"
  - "16-post-processing-et-effets (EffectComposer, RenderPass, passes chaînées)"
  - "18-shadow-mapping (rendu dans une texture, depth buffer)"
  - "22-ray-tracing (rebonds de lumière, échantillonnage de l'hémisphère)"
next: 24-rendu-volumetrique
libs: ["three"]
tribuzen: "ambiance réaliste du globe des sorties — occlusion ambiante (SSAO) qui ancre les marqueurs et le relief dans la scène 3D, plus reflets screen-space pour l'eau/les surfaces brillantes"
last-reviewed: 2026-07
---

# Global illumination et techniques screen-space

> **Outcomes — tu sauras FAIRE :** expliquer l'illumination globale (direct + indirect, radiosité, color bleeding), distinguer GI pré-calculée (baking, lightmaps, probes) et temps réel, décrire le G-buffer/deferred, poser l'algorithme SSAO et l'ajouter via un `SSAOPass` Three.js, et décrire le SSR et ses limites.
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** ce module traite l'**illumination globale** (concepts) et les **techniques screen-space** qui l'approximent en temps réel : **SSAO** (occlusion ambiante), **SSR** (reflets), reposant sur le **G-buffer**. On câble un vrai `SSAOPass` Three.js (r185) ; les shaders WGSL bas niveau sont montrés en concept, pas ré-implémentés pixel par pixel. Le path tracing exact vient du module 22, le volumétrique du module 24.

## 1. Cas concret d'abord

Au module 13 tu as monté le **globe des sorties de la famille** (une sphère orbitable avec des marqueurs), puis les modules 14-16 lui ont donné des matériaux PBR, des ombres et du post-processing (bloom). Mais en regardant la scène de près, quelque chose sonne « faux » : les marqueurs posés à la surface du globe **flottent**. Là où un marqueur touche le relief, où deux objets se rejoignent, dans les creux — la réalité assombrit ces zones (moins de lumière ambiante y parvient). Ta scène, elle, les éclaire uniformément. Résultat : tout paraît plat, décollé, comme des stickers sur une bille.

Ce contact sombre a un nom : l'**occlusion ambiante**. C'est une facette de l'**illumination globale** — le fait que la lumière **rebondit** et que certaines zones en reçoivent moins. La calculer exactement (path tracing, module 22) est trop cher pour du temps réel. La solution productive : l'**approximer en screen-space**, à partir de ce que la caméra voit déjà.

Voici l'ajout concret — un `SSAOPass` branché sur ton `EffectComposer` existant (le même que le bloom du module 16) :

```javascript
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// SSAO : assombrit automatiquement les creux et les contacts
const ssaoPass = new SSAOPass(scene, camera, width, height);
ssaoPass.kernelRadius = 8;      // rayon d'échantillonnage (unités scène)
ssaoPass.minDistance = 0.005;   // ignore les micro-variations (acné)
ssaoPass.maxDistance = 0.1;     // au-delà, pas d'occlusion (halo)
composer.addPass(ssaoPass);

renderer.setAnimationLoop(() => composer.render());
```

Trois lignes de réglage, et les marqueurs **se posent** enfin : un halo sombre apparaît à leur base, les reliefs gagnent du volume, la scène cesse d'être plate. Ce module explique **d'où vient** cet effet — l'illumination globale — et **comment** ces techniques screen-space (SSAO, SSR) l'approximent sans lancer un seul rayon coûteux.

---

## 2. Théorie complète, concise

### 2.1 Éclairage direct vs illumination globale

L'**éclairage direct** est la lumière qui va **directement** de la source à la surface, sans détour. C'est tout ce que font `DirectionalLight`, `PointLight` & co. (module 14) : `L = BRDF × L_i × cos(θ)`. Simple, rapide — mais incomplet.

Dans le monde réel, la lumière **rebondit**. Elle frappe le sol, repart, éclaire le plafond, repart encore. C'est l'**illumination globale (GI)** : `GI = direct + indirect`, où l'indirect est l'intégrale de toute la lumière arrivant après un ou plusieurs rebonds. Sans GI, une scène ressemble à un décor de théâtre sous un seul projecteur : les zones non éclairées directement sont **noir absolu**.

Deux phénomènes visibles de la GI à retenir :

- **Color bleeding** — un mur rouge éclairé teinte de rouge les objets proches. La lumière indirecte transporte la couleur de la surface d'où elle rebondit.
- **Occlusion ambiante** — dans un creux, un coin, sous un objet, moins de lumière indirecte parvient (les surfaces voisines se masquent mutuellement). Ces zones sont plus sombres. C'est le phénomène que SSAO approxime.

### 2.2 Radiosité

La **radiosité** est la première grande méthode de GI (années 80), spécialisée dans l'**éclairage diffus** (surfaces mates, pas de reflets spéculaires). Idée : découper toute la scène en petits patches, et résoudre l'**échange d'énergie** entre eux — chaque patch émet et reçoit de la lumière des autres, pondéré par un **facteur de forme** (à quel point deux patches « se voient »).

C'est un système d'équations linéaires, résolu itérativement jusqu'à convergence. Le résultat est **indépendant du point de vue** (l'éclairage diffus ne dépend pas de l'angle de vue) — donc calculable **une fois** puis réutilisé. C'est exactement ce qui rend la radiosité idéale pour le **light baking**.

### 2.3 Light baking et lightmaps

**Baker** (cuire), c'est **pré-calculer** l'illumination globale **hors-ligne** (radiosité, path tracing offline...) et la stocker dans des textures, pour la lire **gratuitement** au runtime. La texture qui stocke cette lumière pré-calculée s'appelle une **lightmap**.

```
Light baking (offline, une fois)          Runtime (chaque frame)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━━━━
GI complète (radiosité / path tracing)    couleur = albedo × lightmap
   │  (minutes/heures de calcul)             (une lecture de texture)
   ▼
lightmap (texture d'irradiance par surface)
```

Chaque surface reçoit un jeu de coordonnées UV **dédié à la lightmap** (distinct des UV de texture couleur), et Three.js applique la lightmap via `material.lightMap`.

> **Limite absolue du baking : c'est STATIQUE.** Une lightmap est figée à la géométrie et aux lumières du moment du bake. Si un objet bouge ou qu'une lumière change, la lightmap est **fausse** — elle ne « suit » rien. Le baking est donc réservé au décor immobile (murs, sol, terrain). Pour le dynamique, il faut de la GI temps réel (probes, screen-space).

### 2.4 GI probes / irradiance probes

Une **lightmap** éclaire des **surfaces**. Mais un objet **dynamique** (un personnage qui se déplace) n'a pas de lightmap. Solution : les **light probes** (sondes).

Un **light probe** est un **point** de l'espace où l'on capture l'**irradiance** (la lumière ambiante) arrivant de **toutes les directions**. En pratique : on rend une cubemap depuis ce point, puis on la **convolue** (on l'intègre sur l'hémisphère) pour obtenir l'éclairage diffus reçu selon chaque normale — une **irradiance probe**.

```
Grille de probes                    Objet dynamique en P :
   ⊕────⊕────⊕                      1. trouver la cellule contenant P
   │    │    │                      2. interpoler (trilinéaire) entre les
   ⊕────⊕────⊕     P·                   8 probes aux coins de la cellule
   │    │    │                      3. utiliser l'irradiance interpolée
   ⊕────⊕────⊕                          pour l'éclairage indirect de P
```

On place les probes sur une **grille 3D**. Pour un point quelconque, on **interpole trilinéairement** entre les 8 probes voisines. L'irradiance diffuse étant **basse fréquence** (elle varie lentement dans l'espace), cette interpolation grossière suffit visuellement. Les probes peuvent être **baked** (statiques, gratuits au runtime) ou **runtime** (recalculés périodiquement pour suivre les changements). Three.js expose `LightProbe` et un `LightProbeGenerator` pour les produire depuis une cubemap.

> **Encodage compact :** l'irradiance d'une probe est souvent stockée en **harmoniques sphériques** (9 coefficients par canal RGB = 27 floats), l'équivalent d'un « Fourier sur la sphère ». Suffisant justement parce que le diffus est basse fréquence.

### 2.5 G-buffer et rendu deferred

Toutes les techniques screen-space (SSAO, SSR) ont besoin, **par pixel de l'écran**, de connaître la géométrie : où est le point (position/profondeur), comment il est orienté (normale), sa couleur (albedo). Le **rendu deferred** (différé) répond à ce besoin.

En rendu **forward** (classique), on éclaire chaque objet **au moment** où on le dessine. En rendu **deferred**, on procède en **deux temps** :

```
Passe 1 — Geometry pass          Passe 2 — Lighting pass
━━━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━━━━
dessiner la géométrie            pour chaque PIXEL écran :
dans le G-buffer :                 lire position/normale/albedo
  ┌ position (ou depth)            dans le G-buffer,
  ┤ normale                        calculer l'éclairage,
  └ albedo / roughness             appliquer SSAO, SSR...
(pas d'éclairage ici)
```

Le **G-buffer** (Geometry buffer) est cet ensemble de textures écran : position/profondeur, normale, albedo, roughness. Une fois rempli, **toute** l'information géométrique visible est disponible **en espace écran**, sous forme de textures — c'est précisément ce que SSAO et SSR vont échantillonner. Même en forward, on rend souvent un mini G-buffer (depth + normales) juste pour ces effets ; c'est ce que fait le `SSAOPass` de Three.js en interne.

### 2.6 SSAO — Screen-Space Ambient Occlusion

**SSAO** approxime l'occlusion ambiante **uniquement à partir du G-buffer** (profondeur + normales), sans connaître la scène 3D complète. L'idée : pour chaque pixel, **échantillonner des points autour** du fragment et **compter combien sont « enterrés »** sous la géométrie visible. Beaucoup d'occlusion → creux/coin → assombrir.

L'algorithme de référence (learnopengl) :

```
Pour chaque pixel (fragment) :
  1. Lire sa position view-space et sa normale (G-buffer)
  2. Générer N échantillons dans un HÉMISPHÈRE orienté selon la normale
     (hémisphère, pas sphère : on ne teste que "devant" la surface)
  3. Orienter aléatoirement l'hémisphère par pixel (texture de NOISE 4×4)
     → casse le banding, transforme les artefacts en bruit fin (lissé au blur)
  4. Pour chaque échantillon :
       projeter en screen-space, lire la profondeur du G-buffer à cet endroit
       si la géométrie réelle est DEVANT l'échantillon → il est occlus
       + RANGE CHECK : ignorer les occludeurs trop lointains (évite les halos)
  5. occlusion = fraction d'échantillons occlus
  6. BLUR final (box 4×4) pour lisser le bruit du noise
```

Paramètres typiques : **noyau de 32-64 échantillons**, **rayon ≈ 0.5 unité** (dépend de l'échelle de la scène), **bias ≈ 0.025** (évite l'auto-occlusion / « acné »). Deux détails cruciaux :

- **Hémisphère orienté normale** (pas sphère complète) : une sphère mettrait la moitié des échantillons **derrière** la surface, faussant tout plan plat vers 50 % d'occlusion.
- **Range check** (`smoothstep` sur la distance) : sans lui, une surface lointaine derrière un objet crée un **halo** d'occlusion parasite autour de sa silhouette.

Le résultat SSAO est une texture en niveaux de gris (1 = pas d'occlusion, 0 = totalement occlus) qu'on **multiplie** sur la composante ambiante/diffuse de la scène.

### 2.7 SSAOPass dans Three.js

Three.js fournit un `SSAOPass` prêt à l'emploi, à chaîner après le `RenderPass` dans un `EffectComposer` (module 16). Signature réelle du constructeur (r185) :

```javascript
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

// new SSAOPass(scene, camera, width = 512, height = 512, kernelSize = 32)
const ssaoPass = new SSAOPass(scene, camera, width, height);
ssaoPass.kernelRadius = 8;      // rayon d'échantillonnage
ssaoPass.minDistance = 0.005;   // borne basse du range check (anti-acné)
ssaoPass.maxDistance = 0.1;     // borne haute (anti-halo)
composer.addPass(ssaoPass);
```

Pour **debugger le réglage**, `SSAOPass` expose des modes de sortie via l'enum `SSAOPass.OUTPUT` (`Default`, `SSAO`, `Blur`, `Depth`, `Normal`) : `ssaoPass.output = SSAOPass.OUTPUT.SSAO;` affiche **uniquement** la carte d'occlusion en niveaux de gris — indispensable pour voir ce que le pass calcule vraiment.

> **GTAO — la version moderne.** Three.js fournit aussi un `GTAOPass` (Ground Truth Ambient Occlusion, `three/addons/postprocessing/GTAOPass.js`), une évolution plus physiquement fidèle et souvent plus performante. Même principe d'intégration (un pass dans le composer). SSAO reste le socle conceptuel à maîtriser d'abord.

### 2.8 SSR — Screen-Space Reflections

**SSR** applique la même philosophie screen-space aux **reflets**. Au lieu de rendre une seconde fois la scène pour chaque miroir (coûteux) ou de se limiter à une cubemap fixe, SSR **trace le rayon réfléchi directement dans le depth buffer** :

```
SSR — ray marching dans le depth buffer
  1. Pour un pixel réfléchissant (faible roughness) : direction de reflet R
  2. Avancer pas à pas le long de R en espace écran (ray marching)
  3. À chaque pas, comparer la profondeur du rayon à celle du G-buffer
  4. Rayon PASSE DERRIÈRE la surface (avec un test d'épaisseur) → HIT
  5. Lire la COULEUR de l'écran à ce pixel → c'est le reflet
```

C'est bon marché (on réutilise ce qui est déjà rendu) et dynamique. Une optimisation classique, le **Hi-Z tracing**, utilise une pyramide de mipmaps du depth buffer pour sauter les zones vides (`O(log n)` au lieu de `O(n)` pas).

> **Limite intrinsèque, structurelle, du screen-space (SSR ET SSAO) :** on ne peut réfléchir/occlure **que ce qui est visible à l'écran**. Un objet hors champ, ou caché derrière un autre, **n'existe pas** pour l'algorithme. En SSR, un reflet qui « devrait » montrer quelque chose de hors-écran disparaît aux bords (d'où le **fade** sur les bords de l'écran) ; on **retombe** alors sur une cubemap/environment map de secours (`mix(env, ssr, confiance)`). Ce n'est jamais exact — c'est une approximation plausible et rapide, pas de la GI physique.

---

## 3. Worked examples

### Exemple 1 — SSAO sur le globe TribuZen (SSAOPass complet)

On part de la scène du globe (module 13-16) et on ajoute l'occlusion ambiante. But visuel : les marqueurs et le relief **se posent** au lieu de flotter. Un seul fichier de scène, focalisé sur le pipeline post-processing.

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

const canvas = document.querySelector('#app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const w = canvas.clientWidth, h = canvas.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
camera.position.set(0, 1.5, 4);

// Globe + quelques marqueurs posés à la surface (source du "flottement" sans SSAO)
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 48, 32),
  new THREE.MeshStandardMaterial({ color: 0x2266cc, roughness: 0.7 }),
);
scene.add(globe);

for (let i = 0; i < 8; i++) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xff5533, roughness: 0.5 }),
  );
  const phi = Math.random() * Math.PI, theta = Math.random() * 2 * Math.PI;
  marker.position.setFromSphericalCoords(1, phi, theta); // sur la surface
  globe.add(marker); // enfant du globe → tourne avec lui
}

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(3, 4, 2);
scene.add(sun);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// --- Pipeline post-processing : RenderPass -> SSAOPass ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const ssaoPass = new SSAOPass(scene, camera, w, h);
ssaoPass.kernelRadius = 8;     // rayon des échantillons (à accorder à l'échelle)
ssaoPass.minDistance = 0.005;  // sous cette distance : ignoré (anti-acné)
ssaoPass.maxDistance = 0.1;    // au-delà : pas d'occlusion (anti-halo)
composer.addPass(ssaoPass);

// Debug possible : ssaoPass.output = SSAOPass.OUTPUT.SSAO; (voir la carte d'AO seule)

renderer.setAnimationLoop(() => {
  globe.rotation.y += 0.002;
  controls.update();
  composer.render(); // composer.render(), PAS renderer.render() (piège #1)
});
```

Résultat : à la base de chaque marqueur, un léger halo d'ombre de contact apparaît ; les marqueurs cessent de « flotter » et paraissent posés sur le globe. Passe `ssaoPass.output = SSAOPass.OUTPUT.SSAO` pour visualiser la carte d'occlusion pure (gris) et vérifier que l'effet se concentre bien aux contacts.

### Exemple 2 — Accorder le rayon à l'échelle de la scène

`kernelRadius`, `minDistance`, `maxDistance` sont en **unités de la scène** : les valeurs par défaut supposent une certaine échelle. Sur une scène plus grande ou plus petite, il faut les accorder — sinon l'AO est soit invisible, soit un aplat gris.

```javascript
// Scène "petite" (objets de ~1 unité, notre globe) : rayon modéré
ssaoPass.kernelRadius = 8;
ssaoPass.minDistance = 0.005;
ssaoPass.maxDistance = 0.1;

// Scène "grande" (bâtiment de dizaines d'unités) : élargir le rayon
// sinon l'occlusion, mesurée sur ~8 unités, devient imperceptible.
ssaoPass.kernelRadius = 16;   // échantillonner plus loin
ssaoPass.maxDistance = 1.0;   // laisser l'occlusion agir plus loin

// Méthode de réglage (à froid, reproductible) :
// 1. ssaoPass.output = SSAOPass.OUTPUT.SSAO   → on voit l'AO seule (gris)
// 2. monter kernelRadius jusqu'à ce que les creux ressortent nettement
// 3. si HALO autour des silhouettes → baisser maxDistance
// 4. si ACNÉ (bruit sombre sur surfaces plates) → monter minDistance
// 5. revenir à ssaoPass.output = SSAOPass.OUTPUT.Default
```

La règle mentale : `kernelRadius` = « jusqu'où je cherche des occludeurs », `maxDistance` = « au-delà, ce n'est plus un contact » (coupe les halos), `minDistance` = « en-deçà, c'est du bruit de surface » (coupe l'acné).

### Exemple 3 — Le cœur du SSAO, en GLSL (ce que `SSAOPass` fait pour toi)

Pour comprendre ce que le `SSAOPass` calcule en interne, voici la **boucle d'occlusion** telle qu'elle s'écrit dans un fragment shader (algorithme de référence learnopengl). Tu n'as pas à l'écrire — `SSAOPass` s'en charge — mais la lire ancre les quatre notions clés : hémisphère, TBN, occlusion test, range check.

```glsl
// G-buffer déjà rempli : gPosition (view-space), gNormal ; kernel[64] en tangent-space
uniform sampler2D gPosition;   // position view-space par pixel
uniform sampler2D gNormal;     // normale view-space par pixel
uniform sampler2D texNoise;    // bruit 4x4 pour tourner l'hémisphère
uniform vec3 samples[64];      // noyau : 64 points dans un HÉMISPHÈRE +Z
uniform mat4 projection;
const float radius = 0.5;
const float bias   = 0.025;

void main() {
  vec3 fragPos = texture(gPosition, TexCoords).xyz;
  vec3 normal  = normalize(texture(gNormal, TexCoords).xyz);
  // Vecteur de bruit → rotation aléatoire de l'hémisphère par pixel (casse le banding)
  vec3 randomVec = normalize(texture(texNoise, noiseScale * TexCoords).xyz);

  // Repère TBN : oriente le noyau hémisphérique SELON la normale (Gram-Schmidt)
  vec3 tangent   = normalize(randomVec - normal * dot(randomVec, normal));
  vec3 bitangent = cross(normal, tangent);
  mat3 TBN       = mat3(tangent, bitangent, normal);

  float occlusion = 0.0;
  for (int i = 0; i < 64; ++i) {
    // 1. échantillon tangent-space → view-space, autour du fragment
    vec3 samplePos = fragPos + TBN * samples[i] * radius;

    // 2. projeter l'échantillon en screen-space pour lire le G-buffer
    vec4 offset = projection * vec4(samplePos, 1.0);
    offset.xyz /= offset.w;              // perspective divide
    offset.xyz = offset.xyz * 0.5 + 0.5; // [-1,1] → [0,1]

    // 3. profondeur de la GÉOMÉTRIE RÉELLE à cet endroit de l'écran
    float sampleDepth = texture(gPosition, offset.xy).z;

    // 4. range check : ignore les occludeurs trop lointains (anti-halo)
    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(fragPos.z - sampleDepth));

    // 5. occlus si la géométrie réelle est DEVANT l'échantillon (+ bias anti-acné)
    occlusion += (sampleDepth >= samplePos.z + bias ? 1.0 : 0.0) * rangeCheck;
  }
  occlusion = 1.0 - (occlusion / 64.0); // 1 = dégagé, 0 = totalement occlus
  FragColor = vec4(vec3(occlusion), 1.0);
}
```

Un **second pass** (box blur 4×4) lisse ensuite le bruit hérité du `texNoise`, et le résultat est multiplié sur la composante ambiante de la scène. Chaque ligne correspond à une notion de la section 2.6 — c'est exactement ce que `SSAOPass` encapsule.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Appeler `renderer.render()` au lieu de `composer.render()`

Dès qu'un `EffectComposer` est en place, la boucle doit appeler **`composer.render()`**. Garder `renderer.render(scene, camera)` court-circuite tout le pipeline de passes : le `SSAOPass` (et le bloom, etc.) n'est **jamais** exécuté, et tu vois la scène brute en te demandant pourquoi l'AO n'apparaît pas. Même piège qu'au module 16.

### PIÈGE #2 — Échantillonner dans une sphère au lieu d'un hémisphère (SSAO)

Le noyau SSAO doit être un **hémisphère orienté selon la normale**, pas une sphère complète. Une sphère place la moitié des échantillons **derrière** la surface (toujours « occlus »), ce qui pousse **toute** surface plane vers ~50 % d'occlusion : la scène entière devient uniformément grise, l'AO perd tout sens. C'est l'erreur n°1 des SSAO faits main.

### PIÈGE #3 — Oublier le range check → halos

Sans **range check** (pondération `smoothstep` par la distance de l'occludeur), un objet **très en avant** d'un fond lointain projette de l'occlusion sur ce fond : un **halo** sombre entoure sa silhouette. Le range check ignore les occludeurs au-delà de `maxDistance`. Symptôme typique d'un `maxDistance` trop grand.

### PIÈGE #4 — Confondre SSAO et ombres portées

SSAO n'est **pas** un système d'ombres. Les **ombres portées** (module 18, shadow mapping) viennent de l'occlusion d'une **source de lumière précise** (le soleil est-il bloqué ?). SSAO occlut la lumière **ambiante** (indirecte, sans direction), dans les **contacts et creux** de proximité. Les deux coexistent : ombres pour les grandes zones dirigées, SSAO pour les petits contacts diffus. L'un ne remplace pas l'autre.

### PIÈGE #5 — Croire que le screen-space voit toute la scène

SSR et SSAO ne connaissent que le **G-buffer**, donc **uniquement ce qui est à l'écran**. Un reflet censé montrer un objet hors-champ (ou masqué) **disparaît** ; une occlusion causée par un objet hors-écran **manque**. Ce ne sont pas des bugs mais la **nature** du screen-space. D'où les artefacts de bord et le fallback cubemap en SSR. Pour de la réflexion exacte, il faut du ray tracing (module 22).

### PIÈGE #6 — Croire que le light baking gère le dynamique

Une **lightmap est figée** à l'instant du bake. Elle est splendide et gratuite sur un décor **immobile**, mais **fausse** dès qu'un objet ou une lumière bouge (l'ombre indirecte reste « collée » à l'ancienne position). Le baking ne remplace pas la GI temps réel : on **combine** baking (décor statique) + probes (dynamique) + screen-space (contacts/reflets).

### PIÈGE #7 — Régler `kernelRadius` sans tenir compte de l'échelle

Les distances SSAO sont en **unités monde**. Copier `kernelRadius`/`maxDistance` d'un tuto conçu pour une autre échelle donne soit une AO **invisible** (rayon trop petit pour la scène), soit un **aplat gris** (rayon trop grand). Toujours régler via `output = SSAOPass.OUTPUT.SSAO` sur **ta** scène.

---

## 5. Ancrage TribuZen

L'illumination globale et le screen-space donnent au **globe des sorties** son réalisme final. Jusqu'ici (modules 13-16) le globe avait forme, matériaux, ombres et bloom ; il lui manquait l'**ancrage** — cette sensation que les éléments **appartiennent** à la scène plutôt que d'y être collés.

**SSAO — l'occlusion ambiante.** C'est la feature portée par ce module. Les **marqueurs de sortie** posés à la surface du globe reçoivent une ombre de contact ; les reliefs (montagnes du globe, regroupements de marqueurs pour une même région) gagnent du volume. Concrètement : un `SSAOPass` dans l'`EffectComposer` déjà en place pour le bloom, réglé sur l'échelle du globe (`kernelRadius` ~8, `maxDistance` ~0.1). Coût : ~0.5 ms, invisible sur le budget frame.

**SSR — les reflets (bonus visuel).** Si le globe présente des zones d'**eau** (océans) ou une **surface vitrée** sous les marqueurs, le SSR ajoute des reflets screen-space plausibles sans doubler le coût de rendu — avec fallback sur l'environment map de la scène pour les bords.

**Baking / probes — pour plus tard.** Le décor fixe autour du globe (socle, éléments d'UI 3D immobiles) est un candidat idéal au **light baking** (lightmap statique, gratuite). Les avatars de la famille (modèles glTF dynamiques, module 15) qui se déplaceraient dans la scène relèveraient des **irradiance probes**.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      postprocessing/
        createComposer.ts   ← EffectComposer + RenderPass + BloomPass (module 16)
        addSSAO.ts          ← SSAOPass réglé à l'échelle du globe (ce module)
        addSSR.ts           ← SSRPass optionnel pour l'eau/surfaces brillantes
      baking/
        bakeStaticDecor.ts  ← lightmaps du décor immobile (plus tard)
```

> Réglage reproductible en session : `ssaoPass.output = SSAOPass.OUTPUT.SSAO` pour visualiser la carte d'AO, accorder `kernelRadius`/`maxDistance` à l'échelle réelle du globe, puis repasser en `Default`.

---

## 6. Points clés

1. **GI = direct + indirect** : l'indirect (rebonds) produit le **color bleeding** et l'**occlusion ambiante** ; sans lui, les zones non éclairées directement sont noires.
2. **Radiosité** : GI **diffuse** par échange d'énergie entre patches, indépendante du point de vue → parfaite à **baker**.
3. **Light baking / lightmaps** : GI **pré-calculée** stockée en texture, gratuite au runtime mais **strictement statique** (fausse si ça bouge).
4. **Probes / irradiance probes** : capturent l'irradiance en un point ; grille 3D + **interpolation trilinéaire** pour éclairer le **dynamique** ; souvent encodées en harmoniques sphériques (9 coeffs RGB).
5. **G-buffer / deferred** : géométrie (position, normale, albedo) rendue en textures écran **avant** le shading — le substrat de tout effet screen-space.
6. **SSAO** : occlusion ambiante depuis le G-buffer — **hémisphère orienté normale** + **noise** + **occlusion test** + **range check** + **blur** ; ~32-64 échantillons.
7. **SSAOPass Three.js** : `new SSAOPass(scene, camera, w, h)` dans un `EffectComposer` ; régler `kernelRadius`/`minDistance`/`maxDistance` **à l'échelle de la scène** ; `output = SSAOPass.OUTPUT.SSAO` pour débuguer.
8. **SSR** : reflets par **ray marching dans le depth buffer** ; **limite structurelle** du screen-space — ne voit que l'écran (fade aux bords + fallback cubemap). Jamais exact, mais rapide.

---

## 7. Seeds Anki

```
Quelle est la différence entre éclairage direct et illumination globale (GI) ?|L'éclairage direct est la lumière allant directement de la source à la surface (BRDF × L_i × cos θ). La GI ajoute l'indirect : la lumière qui rebondit sur d'autres surfaces. L'indirect produit le color bleeding (un mur rouge teinte les objets proches) et l'occlusion ambiante (creux et contacts plus sombres). Sans GI, les zones non éclairées directement sont noires.
Pourquoi le light baking (lightmaps) ne convient-il qu'aux scènes statiques ?|Une lightmap pré-calcule la GI hors-ligne (radiosité/path tracing) et la fige dans une texture, pour la lire gratuitement au runtime. Mais elle est figée à la géométrie et aux lumières du moment du bake : si un objet ou une lumière bouge, la lightmap devient fausse (l'ombre indirecte reste collée à l'ancienne position). Réservée au décor immobile.
Qu'est-ce qu'un irradiance probe et comment l'utilise-t-on pour un objet dynamique ?|Un point de l'espace où l'on capture l'irradiance (lumière ambiante) de toutes les directions, souvent stockée en harmoniques sphériques (9 coeffs RGB). On place les probes sur une grille 3D ; pour un objet dynamique en un point donné, on interpole trilinéairement entre les 8 probes voisines. Suffit car l'irradiance diffuse est basse fréquence.
À quoi sert un G-buffer et pourquoi les techniques screen-space en dépendent-elles ?|Le G-buffer (rendu deferred) stocke la géométrie visible en textures écran : position/profondeur, normale, albedo, roughness — remplies avant le shading. SSAO et SSR échantillonnent ces textures : ils ne connaissent la scène que via le G-buffer, donc uniquement ce qui est à l'écran.
Décris l'algorithme SSAO et deux détails cruciaux.|Pour chaque pixel : lire position/normale (G-buffer), générer N échantillons dans un hémisphère orienté selon la normale, orienter aléatoirement via une texture de noise, tester pour chacun si la géométrie réelle est devant (occlus) avec un range check, moyenner, puis blur. Crucial : (1) hémisphère et pas sphère (sinon toute surface plane tend vers 50 % d'occlusion) ; (2) range check (sinon halo autour des silhouettes).
Comment ajoute-t-on SSAO dans Three.js et quels paramètres régler ?|new SSAOPass(scene, camera, width, height) ajouté à un EffectComposer après le RenderPass. Régler kernelRadius, minDistance, maxDistance EN UNITÉS DE LA SCÈNE. Debug avec ssaoPass.output = SSAOPass.OUTPUT.SSAO (affiche la carte d'AO seule). Et appeler composer.render(), pas renderer.render().
Quel est le principe du SSR et sa limite intrinsèque ?|SSR trace le rayon réfléchi par ray marching dans le depth buffer : à chaque pas, comparer la profondeur du rayon à celle du G-buffer ; si le rayon passe derrière la surface (test d'épaisseur), c'est un hit, on lit la couleur de l'écran. Limite structurelle : le screen-space ne voit que ce qui est à l'écran — un objet hors-champ ou masqué n'existe pas, d'où le fade aux bords et le fallback cubemap. Jamais exact.
Différence entre occlusion ambiante (SSAO) et ombres portées (shadow mapping) ?|Les ombres portées viennent de l'occlusion d'une source de lumière précise et directionnelle (le soleil est-il bloqué ?). SSAO occlut la lumière ambiante indirecte (sans direction) dans les contacts et creux de proximité. Les deux coexistent et ne se remplacent pas : ombres pour les grandes zones dirigées, SSAO pour les petits contacts diffus.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-23-global-illumination-et-screen-space/README.md`. Ajouter du SSAO à une scène Three.js (r185) via `SSAOPass`, l'accorder à l'échelle avec le mode de sortie `SSAOPass.OUTPUT.SSAO`, et vérifier visuellement que les contacts s'ancrent — dans un vrai navigateur, corrigé commenté intégral.
