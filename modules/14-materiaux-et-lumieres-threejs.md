---
titre: Matériaux et lumières Three.js
cours: 20-webgpu-3d
notions:
  - "MeshStandardMaterial (PBR metalness/roughness)"
  - "MeshPhysicalMaterial (clearcoat, transmission, ior)"
  - "matériaux non-PBR (MeshBasicMaterial / MeshLambertMaterial / MeshPhongMaterial)"
  - "AmbientLight (éclairage uniforme sans direction)"
  - "DirectionalLight (soleil, rayons parallèles)"
  - "PointLight (ampoule omnidirectionnelle)"
  - "SpotLight (cône de lumière)"
  - "ombres (castShadow / receiveShadow)"
  - "shadow map (renderer.shadowMap.enabled, PCFSoftShadowMap)"
  - "shadow camera (frustum, mapSize, bias)"
  - "environment map / HDRI (scene.environment)"
outcomes:
  - sait choisir entre MeshBasic/Lambert/Phong et MeshStandard/Physical selon le besoin de réalisme
  - sait configurer un MeshStandardMaterial PBR avec metalness et roughness
  - sait éclairer une scène avec Ambient + Directional (et connaît Point/Spot)
  - sait activer des ombres complètes (renderer.shadowMap, castShadow, receiveShadow, shadow camera)
  - sait ajouter une environment map pour les réflexions et l'éclairage indirect
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "05-lumiere-materiaux-et-pbr (modèles d'éclairage, PBR metalness/roughness, shadow mapping en théorie)"
  - "13-threejs-fondamentaux (Scene/Camera/Renderer, Mesh = Geometry + Material, render loop, OrbitControls)"
next: 15-modeles-et-animations
libs: ["three"]
tribuzen: "trophée 3D TribuZen — le badge de la famille passe d'un aplat plat (MeshBasicMaterial) à un objet PBR métallique/verni éclairé par un soleil, posé sur un socle qui reçoit son ombre portée"
last-reviewed: 2026-07
---

# Matériaux et lumières Three.js

> **Outcomes — tu sauras FAIRE :** choisir le bon matériau (Basic/Lambert/Phong vs Standard/Physical), configurer un `MeshStandardMaterial` PBR, éclairer avec Ambient + Directional (Point/Spot en réserve), activer des ombres complètes, et brancher une environment map pour les réflexions.
> **Difficulté :** :star::star::star:
>
> **Portée :** au module 13 on a fait apparaître un mesh à l'écran avec un matériau « qui marche ». Ici on répond à la vraie question : **pourquoi ma scène est-elle noire, plate ou irréaliste ?** — c'est-à-dire le couple matériau + lumière. Le glTF, le skinning et les animations viennent au **module 15** ; le shadow mapping avancé (PCF, cascades) au **module 18**.

## 1. Cas concret d'abord

TribuZen veut récompenser une famille qui boucle dix sorties : un **trophée 3D** affiché sur son profil, qui tourne doucement. Au module 13 on sait déjà poser un mesh. On écrit donc naïvement :

```typescript
import * as THREE from 'three';

const geometry = new THREE.IcosahedronGeometry(1, 0);
const material = new THREE.MeshStandardMaterial({ color: 0xffd700 }); // or
const trophy = new THREE.Mesh(geometry, material);
scene.add(trophy);

renderer.render(scene, camera);
```

Résultat à l'écran : **un disque parfaitement noir**. Pas d'erreur, pas d'avertissement. Le trophée est là, à la bonne taille — mais totalement noir.

La cause : `MeshStandardMaterial` est un matériau **PBR** (module 05). Il calcule combien de lumière chaque point de la surface renvoie vers la caméra. **S'il n'y a aucune lumière dans la scène, la réponse est zéro partout** → noir. Contrairement à `MeshBasicMaterial` (qui affiche sa couleur telle quelle, sans se soucier de la lumière), un matériau PBR **exige** des lumières pour être visible.

Le réflexe débutant est alors de « juste ajouter de la lumière » au hasard, sans comprendre la différence entre les types, ni comment obtenir une ombre portée sous le trophée. Ce module pose les deux briques qui manquent : **quel matériau** (ce que la surface fait de la lumière) et **quelle lumière** (d'où elle vient), puis les **ombres** et l'**environnement** qui rendent la scène crédible. À la fin, le trophée est un objet doré verni, éclairé par un soleil, posé sur un socle qui reçoit son ombre.

---

## 2. Théorie complète, concise

### 2.1 Deux familles de matériaux : sans lumière vs avec lumière

Un matériau Three.js décrit **ce que fait une surface de la lumière qui l'atteint**. Deux familles :

| Matériau | Réagit à la lumière ? | Coût | Usage |
|---|---|---|---|
| `MeshBasicMaterial` | **Non** — affiche sa couleur telle quelle | très faible | UI, wireframe, debug, objets « émissifs » plats |
| `MeshLambertMaterial` | Oui, diffus seulement (pas de reflet net) | faible | surfaces mates, mobile/perf |
| `MeshPhongMaterial` | Oui, diffus + reflet spéculaire (Blinn-Phong) | moyen | ancien réalisme, reflets brillants simples |
| `MeshStandardMaterial` | Oui, **PBR** metalness/roughness | moyen+ | **le défaut réaliste moderne** |
| `MeshPhysicalMaterial` | Oui, PBR **étendu** (clearcoat, verre…) | élevé | vernis, verre, tissu, effets avancés |

La bascule mentale : `Basic` est **plat et gratuit** (aucune lumière requise), les autres **simulent l'éclairage** et exigent donc des lumières dans la scène. `Lambert`/`Phong` sont les modèles historiques (module 05) ; `Standard`/`Physical` sont **physiquement basés** et constituent le choix par défaut aujourd'hui.

### 2.2 MeshStandardMaterial : le workflow PBR metalness/roughness

`MeshStandardMaterial` implémente le PBR vu au module 05. Il **étend `Material`** (pas `MeshBasicMaterial`) et **nécessite des lumières**. Ses deux paramètres centraux :

- **`metalness`** (0 → 1, **défaut `0.0`**) : 0 = diélectrique (plastique, bois, pierre), 1 = métal pur. Peu de valeurs intermédiaires existent dans la nature — c'est presque un booléen.
- **`roughness`** (0 → 1, **défaut `1.0`**) : 0 = miroir net, 1 = complètement mat/diffus.

```typescript
const gold = new THREE.MeshStandardMaterial({
  color: 0xffd700,   // albedo (teinte de base), multiplié par `map` si présente
  metalness: 1.0,    // métal
  roughness: 0.25,   // assez poli → reflets nets
});
```

Chaque scalaire a sa version **texture** (une valeur par texel), qui vient moduler le scalaire :

```typescript
const brick = new THREE.MeshStandardMaterial({
  map: albedoTex,           // couleur (à marquer en sRGB, cf. 2.8)
  roughnessMap: roughTex,   // rugosité par texel (canal vert lu par défaut)
  metalnessMap: metalTex,   // métalité par texel (canal bleu)
  normalMap: normalTex,     // détail de relief sans géométrie
  aoMap: aoTex,             // occlusion ambiante (assombrit les creux)
});
```

> **Attention `aoMap`** : elle a besoin d'un **second jeu d'UV** (`geometry.attributes.uv2`, souvent une copie de `uv`), sinon elle n'a aucun effet.

### 2.3 MeshPhysicalMaterial : PBR étendu

`MeshPhysicalMaterial` **étend** `MeshStandardMaterial` : tout ce qui précède marche, plus des couches physiques supplémentaires. Les trois plus utiles :

```typescript
// Vernis (peinture de voiture, trophée verni, parquet)
const varnished = new THREE.MeshPhysicalMaterial({
  color: 0xffd700, metalness: 1.0, roughness: 0.4,
  clearcoat: 1.0,            // couche de vernis transparente par-dessus
  clearcoatRoughness: 0.05,  // vernis quasi-miroir
});

// Verre / cristal
const glass = new THREE.MeshPhysicalMaterial({
  metalness: 0.0, roughness: 0.0,
  transmission: 1.0,  // la lumière TRAVERSE le matériau (transparence réfractive)
  ior: 1.5,           // indice de réfraction (verre ≈ 1.5, eau ≈ 1.33, diamant ≈ 2.42)
  thickness: 0.5,     // épaisseur traversée (affecte la réfraction)
});
```

`transmission` a un **coût GPU réel** (rendu supplémentaire de la scène) : à réserver aux quelques objets qui en ont vraiment besoin.

### 2.4 Les lumières : d'où vient la lumière

Une lumière n'a de sens qu'ajoutée à la scène (`scene.add(light)`). Les quatre types de base :

| Lumière | Constructeur | Modèle physique | Ombres ? |
|---|---|---|---|
| `AmbientLight` | `(color, intensity)` | éclaire **tout** uniformément, **sans direction** | non |
| `DirectionalLight` | `(color, intensity)` | **soleil** : rayons parallèles, source infiniment lointaine | oui |
| `PointLight` | `(color, intensity, distance, decay)` | **ampoule** : rayonne dans toutes les directions depuis un point | oui |
| `SpotLight` | `(color, intensity, distance, angle, penumbra, decay)` | **projecteur** : cône depuis un point vers une cible | oui |

```typescript
// Ambiant : remplit les noirs, ne crée ni relief ni ombre (à garder faible)
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

// Directionnelle (le soleil) : la POSITION ne fait que définir la DIRECTION des rayons.
// Elle vise .target (un Object3D à l'origine par défaut).
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(5, 10, 7); // direction = de (5,10,7) vers (0,0,0)
scene.add(sun);
```

- `AmbientLight` n'a **ni position ni ombre** : c'est un remplissage constant. Seule, elle donne une image plate (aucun relief). Elle sert à éviter le noir absolu dans les zones non éclairées directement.
- `DirectionalLight` : sa **position** encode uniquement la **direction** (rayons parallèles), pas une distance. Elle vise `light.target` (origine par défaut). C'est la seule lumière dont on a besoin pour simuler un soleil.
- `PointLight` / `SpotLight` : `distance` = portée max (0 = infini), `decay` = atténuation physique (défaut `2` = inverse du carré). L'`angle` du spot est en **radians**, `penumbra` (0→1) adoucit le bord du cône.

Recette d'éclairage minimale et robuste : **un `AmbientLight` faible** (remplissage) **+ un `DirectionalLight` fort** (relief + ombre). C'est ce qu'on utilisera pour le trophée.

### 2.5 Les ombres : trois interrupteurs à aligner

Aucune ombre n'apparaît par défaut. Il faut **trois** activations séparées, et oublier une seule laisse l'ombre absente sans erreur :

```typescript
// 1. Le RENDERER doit calculer les shadow maps
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // bords adoucis (cf. 2.6)

// 2. La LUMIÈRE doit projeter une ombre
sun.castShadow = true;

// 3. Chaque MESH déclare son rôle (défaut : les deux à false)
trophy.castShadow = true;     // le trophée PROJETTE une ombre
socle.receiveShadow = true;   // le socle REÇOIT les ombres
```

`castShadow` (« je projette une ombre ») et `receiveShadow` (« j'affiche les ombres des autres ») sont **indépendants** : un sol ne projette généralement rien mais reçoit ; un petit objet volant projette mais ne reçoit pas. Les deux sont des booléens à `false` par défaut sur tout `Object3D`.

### 2.6 La shadow map : une image de profondeur vue depuis la lumière

Sous le capot, le shadow mapping (théorie au module 05) est une passe de rendu **depuis le point de vue de la lumière** qui enregistre la profondeur de chaque surface (la « shadow map »). Un point est dans l'ombre s'il est plus loin que ce que la lumière « voit » en premier. Cette image a une **résolution** et un **frustum** à régler :

```typescript
// Résolution de la shadow map (puissances de 2 ; défaut 512 → souvent pixélisé)
sun.shadow.mapSize.set(2048, 2048);

// Pour une DirectionalLight, la shadow camera est ORTHOGRAPHIQUE :
// son frustum doit ENGLOBER exactement la zone qui reçoit des ombres.
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 50;

// Corriger le "shadow acne" (auto-ombrage moiré) sans provoquer de "Peter Panning"
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
```

Types de filtrage (`renderer.shadowMap.type`) : `BasicShadowMap` (dur, pixélisé, rapide), `PCFShadowMap` (Percentage-Closer Filtering, bords moyens), **`PCFSoftShadowMap`** (le meilleur compromis, recommandé), `VSMShadowMap` (très doux, plus coûteux). Le frustum de la shadow camera est le **premier levier de qualité** : trop large → ombres pixélisées ; trop étroit → ombres coupées.

### 2.7 Environment map / HDRI : réflexions et lumière ambiante réaliste

Un métal poli sans environnement à refléter apparaît **noir** : il n'a rien à renvoyer. On donne à la scène une image d'environnement (souvent un **HDRI** panoramique) qui sert à la fois de source de **réflexions** et d'**éclairage indirect** doux :

```typescript
// Voie simple : une cube map (6 faces)
const envMap = new THREE.CubeTextureLoader().load([
  'px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg',
]);
scene.environment = envMap;  // éclaire + reflète sur TOUS les matériaux PBR
scene.background = envMap;    // (optionnel) affiche l'image en fond
```

Assigner `scene.environment` suffit à ce que **tous** les `MeshStandard/Physical` en profitent, sans toucher chaque matériau. Pour un vrai `.hdr` équirectangulaire, on passe par `RGBELoader` + `PMREMGenerator` (addons) qui pré-filtre l'HDRI pour le PBR — voir le module 16 (post-processing) et la doc addons.
<!-- FLAG-DOC: chaîne RGBELoader/PMREMGenerator vérifiée sur l'exemplar legacy mais non re-confirmée sur threejs.org (addons) ; API principale (scene.environment, CubeTextureLoader) confirmée sur threejs.org/docs. -->

### 2.8 Piège transversal : l'espace colorimétrique

Le rendu réaliste dépend d'une chaîne sRGB correcte. Sur le renderer, `outputColorSpace` vaut `SRGBColorSpace` par défaut (Three.js récent). Les **textures de couleur** (albedo `map`, `emissiveMap`) doivent être marquées `texture.colorSpace = THREE.SRGBColorSpace` ; les **textures de données** (`normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`) restent en **linéaire** (défaut). Se tromper donne des matériaux délavés ou trop sombres.

---

## 3. Worked examples

### Exemple 1 — Le trophée doré éclairé avec ombre portée (TribuZen)

On répare le cas de la section 1, de bout en bout : trophée PBR verni, socle qui reçoit l'ombre, soleil + ambiant, ombres complètes.

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Renderer : ombres activées ────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;             // (1) le renderer calcule les shadow maps
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.1, 100,
);
camera.position.set(3, 3, 5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

// ── Lumières : ambiant faible + soleil fort ───────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.4)); // remplissage, évite le noir

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(5, 8, 4);           // direction des rayons (vers l'origine)
sun.castShadow = true;               // (2) la lumière projette
sun.shadow.mapSize.set(2048, 2048);  // ombre nette
sun.shadow.camera.left = -5;         // frustum ortho serré autour de la scène
sun.shadow.camera.right = 5;
sun.shadow.camera.top = 5;
sun.shadow.camera.bottom = -5;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0005;           // anti shadow-acne
scene.add(sun);

// ── Le trophée : MeshPhysicalMaterial doré + vernis ───────────
const trophy = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1, 0),
  new THREE.MeshPhysicalMaterial({
    color: 0xffd700,
    metalness: 1.0,             // métal
    roughness: 0.35,            // reflets nets mais pas miroir
    clearcoat: 1.0,             // couche de vernis
    clearcoatRoughness: 0.05,
  }),
);
trophy.position.y = 0.9;
trophy.castShadow = true;        // (3a) le trophée projette une ombre
scene.add(trophy);

// ── Le socle : reçoit l'ombre ─────────────────────────────────
const socle = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.4, 0.2, 48),
  new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.9, metalness: 0 }),
);
socle.position.y = -0.1;
socle.receiveShadow = true;      // (3b) le socle reçoit les ombres
scene.add(socle);

// ── Sol : reçoit aussi l'ombre portée ─────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.2;
ground.receiveShadow = true;
scene.add(ground);

// ── Boucle : rotation lente + damping ─────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  trophy.rotation.y += 0.01;
  controls.update();
  renderer.render(scene, camera);
}
animate();
```

Résultat : le trophée doré verni tourne, accroche la lumière du soleil, et **projette une ombre nette** sur le socle et le sol. Retirer le `sun` → écran quasi noir (seul l'ambiant reste). Retirer `renderer.shadowMap.enabled` **ou** `sun.castShadow` **ou** `receiveShadow` du socle → l'ombre disparaît, silencieusement.

### Exemple 2 — Comparer les matériaux : quand la lumière ne compte PAS

Pour ancrer la différence Basic vs Standard, on met deux sphères côte à côte dans la **même** scène, puis on retire toutes les lumières :

```typescript
const geo = new THREE.SphereGeometry(0.7, 48, 32);

// À gauche : Basic — affiche sa couleur, ignore totalement la lumière
const basic = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x22cc88 }));
basic.position.x = -1;
scene.add(basic);

// À droite : Standard — a besoin de lumière pour être visible
const standard = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
  color: 0x22cc88, metalness: 0.2, roughness: 0.5,
}));
standard.position.x = 1;
scene.add(standard);

// ⚠️ AUCUNE lumière ajoutée à la scène :
// - la sphère Basic  → vert plat, parfaitement visible
// - la sphère Standard → NOIRE (rien ne l'éclaire)
```

C'est exactement le bug de la section 1. La leçon : `MeshBasicMaterial` est un aplat sans relief (utile pour du debug ou de l'UI 3D), `MeshStandardMaterial` **révèle le volume** grâce à la lumière — mais exige donc qu'il y en ait.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Scène noire avec un matériau PBR sans lumière
`MeshStandardMaterial`/`MeshPhysicalMaterial` **exigent des lumières**. Sans aucune lumière (ni `scene.environment`), ils rendent **noir**, sans erreur. Ajouter au minimum un `AmbientLight` + un `DirectionalLight`, ou une environment map. `MeshBasicMaterial`, lui, s'affiche même sans lumière (il ignore l'éclairage).

### PIÈGE #2 — Croire que la position d'une DirectionalLight est une distance
La `position` d'une `DirectionalLight` n'encode qu'une **direction** (rayons parallèles, source « à l'infini »). L'éloigner ou la rapprocher ne change **pas** l'intensité. Pour une atténuation avec la distance, c'est `PointLight`/`SpotLight` (`distance`, `decay`) qu'il faut.

### PIÈGE #3 — Oublier un des trois interrupteurs d'ombre
Une ombre exige `renderer.shadowMap.enabled = true` **ET** `light.castShadow = true` **ET** `mesh.castShadow`/`receiveShadow` sur les bons meshes. En manquer un seul supprime l'ombre **sans message**. Le sol/socle doit `receiveShadow`, l'objet doit `castShadow` — ce sont deux réglages distincts.

### PIÈGE #4 — Frustum de shadow camera mal dimensionné
La shadow camera d'une `DirectionalLight` est **orthographique**. Trop large (`left/right/top/bottom` énormes) → la résolution finie de la shadow map s'étale → ombres pixélisées. Trop étroite → les ombres sont **coupées** hors du frustum. La régler au plus juste autour de la zone visible ; augmenter `mapSize` seulement ensuite.

### PIÈGE #5 — Confondre metalness intermédiaire et « demi-métal »
Dans le workflow PBR, `metalness` est quasi binaire : 0 (diélectrique) ou 1 (métal). Une valeur comme `0.5` ne décrit **aucun matériau réel** et donne un rendu bizarre. Pour « moins brillant », on augmente `roughness`, on ne baisse pas `metalness`.

### PIÈGE #6 — Textures de couleur laissées en linéaire (mauvais colorSpace)
Une texture d'albedo (`map`) doit être en `SRGBColorSpace`, mais les cartes de données (`normalMap`, `roughnessMap`, `metalnessMap`) doivent rester **linéaires**. Marquer une roughnessMap en sRGB (ou une albedo en linéaire) délave ou assombrit tout le rendu. Régler `texture.colorSpace` par type de carte.

### PIÈGE #7 — Métal poli tout noir faute d'environnement
Un `metalness: 1, roughness: 0` sans `scene.environment` n'a **rien à refléter** → apparaît noir/terne, même avec des lumières (un miroir ne renvoie que ce qu'il voit). Ajouter une environment map (cube map ou HDRI) donne des réflexions et de l'éclairage indirect crédibles.

---

## 5. Ancrage TribuZen

Le **trophée 3D** est la première feature TribuZen où le rendu doit être *joli*, pas seulement *présent*. Il matérialise la progression de la famille (10 sorties bouclées) sur son profil.

- **Matériau** : `MeshPhysicalMaterial` doré verni (`metalness: 1`, `roughness: 0.35`, `clearcoat: 1`). Le niveau de la famille peut piloter la teinte (`color`) : bronze → argent → or.
- **Éclairage** : recette `AmbientLight` faible + `DirectionalLight` (soleil) — assez pour du relief et une ombre, sans usine à gaz.
- **Ombre portée** : le trophée `castShadow`, le socle et le sol `receiveShadow` → l'objet est *posé*, pas flottant. C'est ce qui vend le « vrai objet 3D ».
- **Environnement** : une petite cube map de studio (`scene.environment`) donne au métal ses reflets — indispensable pour que l'or ne soit pas terne.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      trophy/
        TrophyMaterial.ts   ← MeshPhysicalMaterial doré/verni + variantes de niveau
        TrophyScene.ts       ← lumières (ambient + sun), ombres, environment map
      TrophyCanvas.vue        ← <canvas> Three.js du profil famille
```

> Le trophée réel réutilisera un **modèle glTF** (module 15) au lieu de l'icosaèdre, et pourra passer par du **post-processing** (bloom du reflet, module 16). Ici on fige la couche matériau + lumière + ombre.

---

## 6. Points clés

1. `MeshBasicMaterial` ignore la lumière (aplat) ; `Lambert`/`Phong`/`Standard`/`Physical` la simulent et **exigent des lumières**.
2. `MeshStandardMaterial` est le défaut PBR : `metalness` (défaut `0.0`, quasi binaire) et `roughness` (défaut `1.0`, 0 = miroir → 1 = mat).
3. `MeshPhysicalMaterial` étend Standard : `clearcoat` (vernis), `transmission`+`ior` (verre) — plus coûteux.
4. Lumières : `AmbientLight` (uniforme, sans ombre), `DirectionalLight` (soleil, sa position = direction), `PointLight`/`SpotLight` (avec `distance`/`decay`).
5. Recette robuste : `AmbientLight` faible + `DirectionalLight` fort.
6. Ombre = trois interrupteurs : `renderer.shadowMap.enabled`, `light.castShadow`, et `castShadow`/`receiveShadow` par mesh (défaut `false`).
7. Qualité d'ombre : `shadow.mapSize` (2048 = bon), frustum de la shadow camera **serré**, `shadow.bias` contre le shadow acne, `PCFSoftShadowMap`.
8. `scene.environment` (cube map / HDRI) donne réflexions + éclairage indirect à tous les matériaux PBR ; sans elle, un métal poli est noir.

---

## 7. Seeds Anki

```
Pourquoi une sphère en MeshStandardMaterial apparaît-elle noire alors qu'une MeshBasicMaterial de même couleur s'affiche ?|MeshStandardMaterial est PBR : il calcule la lumière reçue. Sans aucune lumière (ni scene.environment) il rend noir. MeshBasicMaterial ignore l'éclairage et affiche sa couleur telle quelle.
Quels sont les défauts de metalness et roughness sur MeshStandardMaterial et que signifient les extrêmes ?|metalness défaut 0.0 (0 = diélectrique, 1 = métal, quasi binaire) ; roughness défaut 1.0 (0 = miroir net, 1 = complètement mat). Pour « moins brillant » on monte roughness, on ne baisse pas metalness.
En quoi une DirectionalLight diffère-t-elle d'une PointLight ?|DirectionalLight = rayons parallèles (soleil), sa position n'encode qu'une DIRECTION vers .target, pas de distance/atténuation. PointLight rayonne dans toutes les directions depuis un point, avec distance (portée) et decay (atténuation, défaut 2).
Quels sont les trois réglages à activer pour obtenir une ombre portée en Three.js ?|(1) renderer.shadowMap.enabled = true ; (2) light.castShadow = true ; (3) sur les meshes : castShadow sur l'objet qui projette, receiveShadow sur celui qui reçoit (les deux false par défaut). En oublier un supprime l'ombre sans erreur.
Que règle-t-on pour améliorer la qualité d'une ombre de DirectionalLight ?|shadow.mapSize (ex. 2048×2048), le frustum de la shadow camera ORTHOGRAPHIQUE (left/right/top/bottom serrés autour de la scène), shadow.bias/normalBias contre le shadow acne, et renderer.shadowMap.type = PCFSoftShadowMap.
À quoi sert scene.environment et pourquoi un métal poli apparaît-il noir sans elle ?|scene.environment (cube map ou HDRI) fournit réflexions + éclairage indirect à tous les matériaux PBR. Un métal (metalness 1, roughness ~0) ne renvoie que ce qu'il reflète : sans environnement il n'a rien à refléter → noir/terne.
Quelle différence entre castShadow et receiveShadow sur un mesh ?|castShadow = l'objet PROJETTE une ombre ; receiveShadow = l'objet AFFICHE les ombres des autres. Ils sont indépendants (défaut false) : un sol reçoit sans projeter, un petit objet volant projette sans recevoir.
Qu'apporte MeshPhysicalMaterial par rapport à MeshStandardMaterial ?|Il l'étend avec des couches physiques : clearcoat/clearcoatRoughness (vernis), transmission + ior + thickness (verre réfractif), sheen (tissu), iridescence. Plus réaliste mais plus coûteux (transmission ajoute une passe de rendu).
```

---

## Pont vers le lab

> Lab associé : `labs/lab-14-materiaux-et-lumieres-threejs/README.md`. Construire une scène Three.js réelle dans le navigateur : trophée PBR doré/verni, éclairage ambient + soleil, ombres complètes (shadow map + cast/receive), environment map. Starter HTML/TS fourni, corrigé commenté, grille d'auto-éval, coach, variante J+30.
