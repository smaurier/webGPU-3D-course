# Lab 28 — Capstone : l'expérience 3D TribuZen de bout en bout

> **Outcome :** à la fin, tu sais **concevoir et implémenter** une expérience 3D complète et aboutie dans un vrai navigateur — le **globe interactif des sorties de la famille** — en assemblant les modules 00-27, et tu sais la **prouver** (60 FPS mesurés, zéro fuite VRAM, une touche experte visible).
> **Vrai outil :** Three.js r185 (ou `WebGPURenderer`) dans un navigateur réel (Chrome/Edge WebGPU, ou WebGL2), `stats.js`, `renderer.info`. **JAMAIS un harnais simulé.**
> **Feedback :** le coach valide en session sur **3 checkpoints** (pas de test-runner auto-correcteur). C'est un projet, pas un exercice à trou.

Ce lab est le **capstone** du cours. Il n'introduit **aucune** notion neuve : il te fait **monter** une expérience entière et la **prouver**. Si un mécanisme te bloque (PBR, ombres, instancing, raycasting, `EffectComposer`, `dispose`, raymarching, WebXR), **rouvre le module source** — ne devine pas.

---

## Énoncé

Livrer **une expérience 3D TribuZen complète et aboutie** qui tourne dans un navigateur réel : le **globe interactif des sorties de la famille**. Un parent ouvre la page, fait tourner le globe à la souris, clique sur le marqueur d'une sortie, sa fiche s'ouvre et le marqueur s'illumine. L'expérience doit être **fluide (60 FPS)**, **sans fuite mémoire**, et **distinguée par une touche experte**.

### Starter (à toi de créer l'arborescence, rien n'est fourni « à trou »)

Un starter **minimal** — libre à toi de l'étoffer. Aucun code n'est donné à compléter : tu conçois l'architecture (§2.2 du module : scene graph / render pipeline / interaction séparés).

`index.html` (import map, canvas hôte) :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Globe TribuZen — capstone</title>
  <style>
    html, body { margin: 0; height: 100%; background: #05060f; }
    #app { display: block; width: 100vw; height: 100vh; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
  <canvas id="app"></canvas>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`main.ts` : **à toi de l'écrire**, en séparant proprement les fichiers/responsabilités (voir le mapping cible du §5 du module : `GlobeScene`, `Markers`, `Picker`, `postprocessing`, `Atmosphere`, `loop`, `dispose`).

### Données de sortie (jeu de test)

Génère **au moins 200 marqueurs** (lat/lon réalistes) pour éprouver l'instancing. Exemple de format :

```ts
interface Outing { id: string; title: string; lat: number; lon: number; date: string; }
```

---

## Cahier des charges (exigences MINIMALES pour livrer)

L'expérience **doit** :

1. **Socle** — scène Three.js (ou `WebGPURenderer`), `PerspectiveCamera`, `OrbitControls` avec `enableDamping` + `controls.update()` en boucle (modules 13, 20).
2. **Globe PBR** — `SphereGeometry` + `MeshStandardMaterial` texturé (albédo sRGB), éclairé par `DirectionalLight` + ambiante/hémisphérique (modules 05, 14).
3. **Ombres** — `renderer.shadowMap.enabled`, `PCFSoftShadowMap`, `shadow.bias` réglé (pas d'acne), marqueurs `castShadow`, globe `receiveShadow` (module 18).
4. **Marqueurs instanciés** — **≥ 200** sorties via **un seul** `InstancedMesh`, positionnées lat/lon → Vec3 (modules 01, 17). **1 draw call**, vérifié.
5. **Interaction** — clic → `Raycaster` (NDC corrects, `getBoundingClientRect`) → sortie sélectionnée + fiche affichée (module 20).
6. **Post-processing** — `EffectComposer` → `RenderPass` → `UnrealBloomPass` → `OutputPass`, tone mapping ACES, `composer.render()` remplace `renderer.render()`, `composer.setSize()` au resize (module 16).
7. **Boucle unique ordonnée** — resize → temps → interaction → logique → rendu (§2.3 du module).
8. **Une touche experte** (au moins une, aboutie) : **halo volumétrique** Fresnel (module 24) **OU** **shader créatif** pulsant sur les marqueurs (module 19) **OU** **ray tracing** hybride (module 22) **OU** **WebXR** (module 25).
9. **Performance** — **60 FPS mesurés** (`stats.js`) avec tous les marqueurs ; `renderer.info.render.calls` bas.
10. **Zéro fuite** — `dispose()` complet au démontage ; `renderer.info.memory` stable après ≥ 3 cycles montage/démontage.
11. **Fallback** — détecter l'absence de WebGL2/WebGPU et afficher un message clair au lieu de planter (module 09).

---

## Jalons (avec checkpoints coach)

### Jalon 1 — le globe vit *(checkpoint coach n°1)*

Scène + globe PBR ombré + `OrbitControls` + boucle unique. Rien ne clignote, rien n'est noir, le globe tourne et s'oriente à la souris.
- **Le coach vérifie :** pas de piège #1 (matériau noir), `controls.update()` présent, boucle ordonnée, aucun `Mesh` créé dans la boucle.

### Jalon 2 — les marqueurs et le clic *(checkpoint coach n°2)*

≥ 200 marqueurs en **1 draw call** (`InstancedMesh`), positionnés lat/lon. Clic → raycasting → sortie sélectionnée (log ou fiche).
- **Le coach vérifie :** `renderer.info.render.calls` bas (instancing réel, pas 200 meshes), NDC corrects (piège #6), `Raycaster` alloué **hors** boucle.

### Jalon 3 — post-processing, touche experte, preuve *(checkpoint coach n°3)*

Bloom + ACES (`composer.render`, redimensionné). **Une touche experte** aboutie. **60 FPS mesurés**, **zéro fuite** au démontage.
- **Le coach vérifie :** `composer.render()` remplace bien `renderer.render()` (piège #3), `composer.setSize()` au resize (piège #4), touche experte visible et fonctionnelle, `stats.js` affiche 60 FPS, `renderer.info.memory` stable après plusieurs cycles (piège #5).

---

## Grille d'évaluation (EXIGEANTE — capstone)

| Critère | Poids | Ce qui fait « acquis » |
|---|:---:|---|
| **Architecture** | 15 % | Scene graph / render pipeline / interaction **séparés** ; rien de créé/alloué dans la boucle ; fichiers découpés (§5 module). |
| **Rendu abouti (PBR + ombres)** | 20 % | PBR sous lumière (pas noir), ombres douces PCF **sans acne** (bias), tone mapping ACES ; rendu propre et crédible. |
| **Performance (budget de frame)** | 20 % | **≥ 200 marqueurs en 1 draw call** (instancing) ; **60 FPS mesurés** au compteur ; `render.calls` bas ; LOD/culling si pertinent. |
| **Interaction (raycasting)** | 10 % | Clic → bonne sortie sélectionnée, NDC corrects, `Raycaster` réutilisé. |
| **Post-processing** | 10 % | `composer.render()` pilote le rendu, redimensionné au resize ; bloom visible sur le marqueur sélectionné. |
| **Touche experte** | 15 % | **Au moins une** (shader créatif / volumétrique / ray tracing / WebXR) **aboutie**, visible, expliquée. C'est le critère qui prouve la maîtrise. |
| **Zéro fuite + robustesse** | 10 % | `dispose()` complet, `info.memory` stable après ≥ 3 cycles ; fallback WebGL2/WebGPU absent géré. |

**Seuil de livraison :** aucun critère à 0. Un capstone avec 300 draw calls, un globe noir, un composer non redimensionné, une VRAM qui fuit ou **aucune** touche experte n'est **pas** livrable — même s'il « a l'air de marcher ».

**Anti-triche pédagogique :** « ça tourne chez moi » ne prouve rien. La preuve, c'est le **compteur** (60 FPS), le **`renderer.info`** (draw calls bas, mémoire stable) et la **touche experte** qu'on **voit** à l'écran.

---

## Rôle du coach (≥ 3 checkpoints)

Le coach **drive** la session, il n'attend pas que tu demandes ce qui reste :

1. **Checkpoint 1 (Jalon 1)** — relire l'architecture **avant** que le code grossisse : les trois responsabilités sont-elles séparées ? La boucle est-elle ordonnée ? Corriger la structure ici coûte 5 min ; plus tard, 2 h.
2. **Checkpoint 2 (Jalon 2)** — ouvrir `renderer.info` **ensemble** : les 200 marqueurs sont-ils vraiment en 1 draw call ? Le raycasting tape-t-il la bonne instance ? Débusquer l'instancing raté et les NDC faux **maintenant**.
3. **Checkpoint 3 (Jalon 3)** — exiger la **preuve** : `stats.js` à 60 FPS sous les yeux, `info.memory` stable après 3 remontages, touche experte démontrée et **expliquée** (pourquoi ce Fresnel/ce raymarching/ce compute). Si une preuve manque, le capstone n'est pas fini.

Entre les checkpoints, si tu bloques : le coach te renvoie au **module source** (13-27), il ne code pas à ta place. L'objectif est l'**autonomie page blanche**.

---

## Variante J+30 (fading) — extension experte

Trente jours plus tard, sans relire le corrigé, **étends** l'expérience avec **une** contrainte ajoutée (au choix, mais une vraie extension, pas un réglage cosmétique) :

- **Deuxième touche experte** : ajouter un mode **WebXR** (inspecter le globe en VR) **en plus** du halo volumétrique déjà présent — deux systèmes experts qui cohabitent dans la même boucle.
- **Arcs de trajet** (module 21) : relier deux sorties par une courbe (`BufferGeometry` procédurale) qui suit la surface du globe, animée.
- **Compute WebGPU** (modules 11-12) : déplacer le calcul des positions/pulsations des marqueurs dans un **compute shader** WGSL, via `WebGPURenderer` — et prouver le gain au compteur.
- **Virtual texture** (module 27) : streamer une texture Terre haute résolution en fonction du zoom, sans saturer la VRAM.
- **Contrainte de temps** : reconstruire le socle (Jalon 1) **en 30 min chrono**, de mémoire.

Le but du J+30 : prouver que l'assemblage est **acquis** (autonome), pas seulement **reproduit**.

---

## Application TribuZen

Cette expérience **est** la couche 3D de TribuZen. Portée dans le vrai produit :

- fichiers cibles : `src/3d/globe/*` (voir le mapping §5 du module) ;
- montée dans un composant Vue `GlobeCanvas.vue` : `onMounted` construit la scène, `onUnmounted` appelle `dispose()` (sinon fuite VRAM à chaque navigation) ;
- les sorties viennent de l'API TribuZen (lat/lon + métadonnées) — le globe est la **vue exploratoire** du feed des sorties ;
- commit sur `smaurier/tribuzen` : `feat(3d): globe interactif des sorties — PBR, instancing, raycasting, bloom + halo volumétrique`.

C'est l'aboutissement du fil rouge tiré depuis le module 13 : d'une sphère qui tourne à une **expérience 3D aboutie, performante, sans fuite et distinguée**, prête à vivre dans le produit.
