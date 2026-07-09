---
titre: Modélisation 3D et géométrie procédurale
cours: 20-webgpu-3d
notions:
  - "BufferGeometry = conteneur d'attributs de sommets"
  - "attributs de sommet : position / normal / uv"
  - "BufferAttribute et Float32BufferAttribute (array + itemSize)"
  - "géométrie indexée (setIndex) vs non indexée"
  - "générer un mesh par code (géométrie procédurale)"
  - "primitives paramétriques (grille de plan paramétrée)"
  - "normales : calcul manuel vs computeVertexNormals()"
  - "déformation de mesh par une fonction de hauteur (heightfield)"
  - "computeBoundingSphere / dispose"
outcomes:
  - sait construire une BufferGeometry à la main avec des attributs position/normal/uv typés
  - sait choisir entre géométrie indexée et non indexée et en expliquer le coût mémoire
  - sait générer une grille de plan paramétrique par code (double boucle sur i, j)
  - sait déformer les sommets d'une géométrie par une fonction de hauteur pour créer un terrain procédural
  - sait recalculer les normales avec computeVertexNormals() et expliquer pourquoi c'est nécessaire après déformation
  - sait libérer la mémoire GPU d'une géométrie avec dispose()
prerequis:
  - "13-threejs-fondamentaux (Scene, Mesh = Geometry + Material, boucle)"
  - "07-shaders-buffers-textures (VBO, index buffer, attributs de sommet)"
  - "05-lumiere-materiaux-et-pbr (rôle des normales dans l'éclairage)"
  - "01-algebre-lineaire-pour-la-3d (produit vectoriel pour les normales)"
next: 22-ray-tracing
libs: ["three"]
tribuzen: "moteur 3D TribuZen — le relief procédural de la carte des sorties : un terrain généré par code (BufferGeometry déformée par une fonction de hauteur) sur lequel se posent les marqueurs de sorties de la famille"
last-reviewed: 2026-07
---

# Modélisation 3D et géométrie procédurale

> **Outcomes — tu sauras FAIRE :** construire une `BufferGeometry` à la main (attributs `position`/`normal`/`uv`), choisir indexée vs non indexée, générer une grille de plan par code, la déformer en terrain par une fonction de hauteur, et recalculer les normales.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module est le **cœur data de la géométrie**. Au module 13, tu consommais des primitives toutes faites (`BoxGeometry`, `SphereGeometry`). Ici tu descends d'un cran : **quoi** contient vraiment une géométrie, et comment en **fabriquer une par code**. Ce n'est **pas** de la modélisation dans Blender (métier d'artiste) : c'est de la **géométrie procédurale** — générer des meshes algorithmiquement. Version de référence : **Three.js r185** (2026).

## 1. Cas concret d'abord

Le fil rouge TribuZen a un **globe des sorties** (module 13) et bientôt une **carte des sorties** en vue rapprochée. Pour cette carte, on veut un **relief** : des collines, des vallées, un terrain qui donne du corps à la scène, sur lequel poser les marqueurs de sorties de la famille.

Aucune primitive Three.js ne fournit « un terrain ». `PlaneGeometry` donne un plan **plat**. Il faut donc **générer la géométrie par code** : une grille de sommets, puis pousser chaque sommet en hauteur selon une fonction. C'est le problème central de ce module.

Voici l'objectif — un terrain ondulé généré entièrement par code, sans aucun fichier d'asset :

```javascript
import * as THREE from 'three';

// Une grille de 100 × 100 quads, déformée par une fonction sinusoïdale de hauteur
const geometry = createTerrainGeometry(100, 100, 10, (x, z) =>
  Math.sin(x * 0.5) * Math.cos(z * 0.5) * 0.6,
);
geometry.computeVertexNormals(); // sinon l'éclairage est plat/faux

const terrain = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({ color: 0x4c8a3a, flatShading: false }),
);
scene.add(terrain);
```

Tout le module sert à écrire `createTerrainGeometry` — c'est-à-dire à comprendre ce qu'est une `BufferGeometry`, comment on la remplit d'attributs, et comment on déforme ses sommets. La primitive `BoxGeometry` du module 13 faisait **exactement** ça en interne ; on ouvre la boîte.

---

## 2. Théorie complète, concise

### 2.1 Une géométrie = des tableaux d'attributs de sommet

Au module 07, tu remplissais des **VBO** à la main : un buffer de positions, un buffer de normales, un buffer d'UV, envoyés au GPU. Une `BufferGeometry` Three.js est **exactement** ce conteneur, en objet : elle regroupe des **attributs de sommet**, chacun étant un tableau typé plat.

Un attribut associe, **pour chaque sommet**, un petit vecteur de nombres :

| Attribut  | `itemSize` | Signification | Rôle |
|-----------|:----------:|---------------|------|
| `position`| 3 | `(x, y, z)` | où est le sommet dans l'espace |
| `normal`  | 3 | `(nx, ny, nz)` | orientation de la surface → éclairage (module 05) |
| `uv`      | 2 | `(u, v)` | coordonnée de texture (module 07) |
| `color`   | 3 ou 4 | `(r, g, b[, a])` | couleur par sommet (optionnel) |

Le point clé : chaque attribut est **un seul `Float32Array` plat**. Pour 3 sommets, `position` fait 9 flottants : `[x0,y0,z0, x1,y1,z1, x2,y2,z2]`. L'`itemSize` (ici 3) dit à Three.js **combien de nombres consommer par sommet**. C'est le même contrat que `gl.vertexAttribPointer(loc, size, ...)` du module 07 — Three.js le pose pour toi.

### 2.2 `BufferAttribute` : envelopper un tableau typé

Un tableau brut n'est pas montable tel quel : il faut l'envelopper dans un `BufferAttribute`, qui porte le tableau **et** son `itemSize`.

```javascript
// Forme explicite : BufferAttribute(array, itemSize)
const positions = new Float32Array([
  0, 0, 0,   // sommet 0
  1, 0, 0,   // sommet 1
  0, 1, 0,   // sommet 2
]);
const attr = new THREE.BufferAttribute(positions, 3); // 3 = itemSize
```

Three.js fournit des **sous-classes raccourci** qui créent le bon type de tableau : `Float32BufferAttribute`, `Uint16BufferAttribute`, `Uint32BufferAttribute` (et d'autres). Elles évitent d'écrire `new Float32Array(...)` autour :

```javascript
// Équivalent, plus court : Float32BufferAttribute(arrayOrArrayLike, itemSize)
const attr = new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,0], 3);
```

Propriétés utiles d'un `BufferAttribute` :

- `.count` — nombre de **sommets** (= `array.length / itemSize`), **pas** le nombre de nombres.
- `.itemSize` — nombres par sommet.
- `.array` — le tableau typé sous-jacent.
- `.needsUpdate = true` — à poser après avoir muté `.array` pour re-uploader au GPU.

On monte l'attribut sur la géométrie avec **`setAttribute(name, attribute)`**, le `name` étant une chaîne conventionnelle (`'position'`, `'normal'`, `'uv'`) :

```javascript
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geometry.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
geometry.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
```

> Les noms `'position'`, `'normal'`, `'uv'` sont **conventionnels** : les matériaux Three.js et leurs shaders internes les cherchent par ce nom exact. Une faute de frappe (`'positions'`) = attribut ignoré, mesh invisible.

### 2.3 Géométrie non indexée vs indexée

Deux façons de décrire les **triangles**.

**Non indexée.** On répète chaque sommet autant de fois qu'il apparaît dans un triangle. Un quad (2 triangles) partage 2 sommets sur sa diagonale, mais on les **duplique** : 6 sommets stockés au lieu de 4.

```javascript
// Un quad plat = 2 triangles = 6 sommets répétés (le sommet du coin est écrit 2×)
const positions = new Float32Array([
  0,0,0,  1,0,0,  0,1,0,   // triangle 1
  0,1,0,  1,0,0,  1,1,0,   // triangle 2 (0,1,0 et 1,0,0 dupliqués)
]);
```

**Indexée.** On stocke chaque sommet **une seule fois**, puis un tableau d'**indices** qui référence ces sommets pour former les triangles. C'est l'`index buffer` (EBO) du module 07.

```javascript
const positions = new Float32Array([
  0,0,0,  1,0,0,  0,1,0,  1,1,0,   // 4 sommets uniques
]);
// 2 triangles, 3 indices chacun ; les sommets 1 et 2 sont réutilisés
geometry.setIndex([0, 1, 2,  2, 1, 3]);
```

`setIndex` accepte un tableau JS **ou** un `BufferAttribute` d'`itemSize` 1 :

```javascript
geometry.setIndex(new THREE.Uint16BufferAttribute(indices, 1)); // < 65536 sommets
geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1)); // gros meshes
```

**Quand indexer ?** Dès qu'il y a **partage** de sommets — c'est-à-dire toute grille/terrain. Sur une grille `N×N`, l'indexation divise le nombre de sommets stockés par ~6 (chaque sommet intérieur est partagé par 6 triangles). Gain mémoire net, meilleur cache GPU. **Choisir Uint16 si `< 65536` sommets, sinon Uint32** (limite du type).

### 2.4 Générer une grille de plan paramétrique

Une grille paramétrique = deux boucles imbriquées qui échantillonnent un paramètre `(i, j)`. Pour un plan de `w × d` segments, il y a `(w+1) × (d+1)` **sommets** (les coins de chaque cellule).

```javascript
function createGrid(width, depth, segX, segZ) {
  const positions = [];
  const uvs = [];
  // (segX+1) × (segZ+1) sommets
  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      const x = (i / segX - 0.5) * width;  // centré en 0
      const z = (j / segZ - 0.5) * depth;
      positions.push(x, 0, z);             // plan à plat (y = 0) pour l'instant
      uvs.push(i / segX, j / segZ);        // uv normalisé [0..1]
    }
  }
  // ... indices ci-dessous
}
```

Les **indices** relient les sommets 4 par 4 en 2 triangles par cellule. Pour la cellule `(i, j)`, les 4 coins ont pour index :

```javascript
const indices = [];
const cols = segX + 1; // nb de sommets par rangée
for (let j = 0; j < segZ; j++) {
  for (let i = 0; i < segX; i++) {
    const a =  j      * cols + i;      // coin bas-gauche
    const b =  j      * cols + i + 1;  // bas-droit
    const c = (j + 1) * cols + i;      // haut-gauche
    const d = (j + 1) * cols + i + 1;  // haut-droit
    indices.push(a, c, b,   b, c, d);  // 2 triangles (ordre CCW = face visible)
  }
}
```

> L'**ordre des indices** d'un triangle définit sa face avant (winding). En Three.js, l'ordre **anti-horaire (CCW)** vu de face est la convention ; un ordre inversé rend la face invisible si le back-face culling est actif (piège #4).

### 2.5 Déformer la grille en terrain (heightfield)

Un **heightfield** (champ de hauteur) : la grille est plate en `y=0`, on **remonte** chaque sommet selon une fonction `height(x, z)`. C'est ça, un terrain procédural — au lieu d'un `sin/cos`, on met souvent du **bruit** (Perlin/simplex, vu au module 19) pour un relief naturel.

```javascript
// Dans la double boucle de génération des sommets :
const y = height(x, z);        // ex : Math.sin(x*0.5)*Math.cos(z*0.5)*amplitude
positions.push(x, y, z);       // le sommet est poussé en hauteur
```

Alternative : déformer une géométrie **existante** en mutant son attribut `position` après coup (utile pour animer les vagues d'un océan) :

```javascript
const pos = geometry.attributes.position; // BufferAttribute
for (let k = 0; k < pos.count; k++) {
  const x = pos.getX(k), z = pos.getZ(k);
  pos.setY(k, height(x, z));   // écrit la composante y du sommet k
}
pos.needsUpdate = true;        // re-upload au GPU
geometry.computeVertexNormals(); // les normales ont changé → recalculer
```

### 2.6 Normales : pourquoi et comment

Une **normale** est le vecteur perpendiculaire à la surface en un sommet ; l'éclairage (module 05) en dépend **entièrement**. Une grille plate a des normales toutes verticales `(0,1,0)`. Dès qu'on **déforme** le terrain, les normales verticales deviennent **fausses** → éclairage plat, relief invisible.

Deux options :

1. **`geometry.computeVertexNormals()`** — Three.js calcule la normale de chaque face (produit vectoriel de deux arêtes, module 01), puis **moyenne** les normales des faces adjacentes à chaque sommet → surface **lisse** (smooth shading). C'est le choix par défaut pour un terrain.
2. **Normales à la main** — les fournir soi-même via l'attribut `normal` (nécessaire pour des arêtes **dures**, ou un rendu facetté volontaire).

```javascript
geometry.computeVertexNormals(); // APRÈS avoir posé/modifié 'position' et 'index'
```

> `computeVertexNormals()` **exige un index** pour lisser correctement entre faces partageant un sommet. Sur une géométrie non indexée, chaque sommet étant dupliqué, on obtient un rendu **facetté** (flat) même en smooth — d'où l'intérêt d'indexer un terrain.

Le matériau, lui, choisit le style : `flatShading: true` sur `MeshStandardMaterial` force un rendu facetté quelles que soient les normales ; `false` (défaut) utilise les normales lissées.

### 2.7 Cycle de vie : bounding volumes et `dispose`

- **`computeBoundingSphere()` / `computeBoundingBox()`** — recalculent le volume englobant, utilisé par le **frustum culling** (module 03) et le raycasting (module 20). À rappeler si tu **mutes** les positions, sinon l'objet peut disparaître à tort (le culling teste l'ancienne sphère).
- **`geometry.dispose()`** — libère les buffers GPU. Une géométrie procédurale régénérée à chaque frame **sans** `dispose()` = fuite mémoire GPU garantie. Même règle qu'au module 13 pour le démontage d'un composant.

```javascript
// Régénérer proprement un terrain (ex : nouveau seed)
oldTerrain.geometry.dispose();
oldTerrain.geometry = createTerrainGeometry(/* ... */);
```

---

## 3. Worked examples

### Exemple 1 — `createTerrainGeometry` complet (indexé, TribuZen)

La fonction attendue depuis le §1 : une grille indexée `segX × segZ`, déformée par une fonction de hauteur, avec `position`, `uv`, indices et normales.

```javascript
import * as THREE from 'three';

/**
 * Génère un terrain heightfield centré à l'origine.
 * @param {number} width  taille monde en X
 * @param {number} depth  taille monde en Z
 * @param {number} segX   nb de segments (quads) en X → segX+1 sommets par rangée
 * @param {number} segZ   nb de segments en Z
 * @param {(x:number, z:number) => number} height  fonction de hauteur
 */
function createTerrainGeometry(width, depth, segX, segZ, height) {
  const positions = [];
  const uvs = [];
  const cols = segX + 1;

  // 1. Sommets : (segX+1) × (segZ+1), poussés en hauteur par height(x, z)
  for (let j = 0; j <= segZ; j++) {
    for (let i = 0; i <= segX; i++) {
      const x = (i / segX - 0.5) * width;
      const z = (j / segZ - 0.5) * depth;
      positions.push(x, height(x, z), z);
      uvs.push(i / segX, j / segZ);
    }
  }

  // 2. Indices : 2 triangles par cellule (winding CCW pour une face vers le haut)
  const indices = [];
  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      const a =  j      * cols + i;
      const b =  j      * cols + i + 1;
      const c = (j + 1) * cols + i;
      const d = (j + 1) * cols + i + 1;
      indices.push(a, c, b,   b, c, d);
    }
  }

  // 3. Assemblage de la BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  // Uint32 : une grille 200×200 dépasse 65535 sommets → Uint16 déborderait
  geometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1));

  // 4. Normales lissées (indispensable APRÈS déformation, et l'index permet le lissage)
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere(); // pour le frustum culling

  return geometry;
}

// Utilisation TribuZen : relief doux de la carte des sorties
const terrain = new THREE.Mesh(
  createTerrainGeometry(20, 20, 120, 120, (x, z) =>
    Math.sin(x * 0.6) * Math.cos(z * 0.6) * 0.8,
  ),
  new THREE.MeshStandardMaterial({ color: 0x4c8a3a, roughness: 0.9 }),
);
scene.add(terrain);
```

Points de lecture : (1) `segX+1` sommets par rangée — l'erreur classique est de boucler `< segX` et d'obtenir un trou en bordure ; (2) `Uint32` choisi car `121×121 = 14641` sommets ici, mais la grille est prévue extensible au-delà de 65535 ; (3) `computeVertexNormals()` **après** que les positions sont déformées, jamais avant.

### Exemple 2 — un quad minimal, indexé, monté à la main

Le plus petit cas complet, pour ancrer `position`/`uv`/`index` sans le bruit de la double boucle : un carré de côté 1, texturable.

```javascript
const geometry = new THREE.BufferGeometry();

// 4 sommets uniques (coins du carré dans le plan XY)
geometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.5, -0.5, 0,   // 0 : bas-gauche
   0.5, -0.5, 0,   // 1 : bas-droit
  -0.5,  0.5, 0,   // 2 : haut-gauche
   0.5,  0.5, 0,   // 3 : haut-droit
], 3));

// uv : coin de texture correspondant (0,0 en bas-gauche → 1,1 en haut-droit)
geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
  0, 0,   1, 0,   0, 1,   1, 1,
], 2));

// 2 triangles réutilisant les sommets 1 et 2 (CCW vu de +Z)
geometry.setIndex([0, 1, 2,   2, 1, 3]);

// Face plane vers +Z : computeVertexNormals donne (0,0,1) partout
geometry.computeVertexNormals();

const quad = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({ color: 0xff8844 }),
);
scene.add(quad);
```

Sans l'index, il aurait fallu **6** positions (les sommets 1 et 2 écrits deux fois) : 18 flottants au lieu de 12. Sur un quad c'est anecdotique ; sur un terrain de 100×100, c'est ~6× de mémoire économisée.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Confondre `itemSize`, `.count` et `array.length`

`array.length` = nombre de **nombres** ; `.count` = nombre de **sommets** = `array.length / itemSize`. Vouloir itérer sur `pos.array.length` en croyant compter des sommets donne des index faux (3× trop). Toujours itérer `for (k = 0; k < pos.count; k++)` et lire avec `pos.getX(k)/getY(k)/getZ(k)`.

### PIÈGE #2 — Nom d'attribut incorrect

Les matériaux cherchent `'position'`, `'normal'`, `'uv'` **au mot exact**. `setAttribute('positions', ...)` (avec un `s`) ou `'Position'` (majuscule) = attribut ignoré, mesh **invisible** sans aucune erreur. Vérifier l'orthographe avant de suspecter la géométrie.

### PIÈGE #3 — Oublier `computeVertexNormals()` après déformation

Une grille plate a des normales verticales correctes. Après avoir poussé les sommets en hauteur, ces normales sont **fausses** : l'éclairage reste plat, le relief est invisible malgré une bonne géométrie. Symptôme : « mon terrain est bosselé en fil de fer mais uniforme en couleur ». Solution : `computeVertexNormals()` **après** avoir écrit les positions (et poser `needsUpdate` si mutation en place).

### PIÈGE #4 — Winding inversé → faces invisibles

L'ordre des indices d'un triangle (`a, c, b` vs `a, b, c`) définit sa face avant. Un ordre horaire là où Three.js attend de l'anti-horaire (CCW) rend la face **culée** (invisible de face). Symptôme : le terrain n'apparaît que vu de dessous. Corriger l'ordre des indices, ou en debug passer `material.side = THREE.DoubleSide` pour confirmer que c'est bien un problème de winding.

### PIÈGE #5 — `Uint16` qui déborde sur un gros mesh

`Uint16BufferAttribute` code des index `0..65535`. Une grille `256×256` a `257×257 = 66049` sommets → les index au-delà de 65535 **débordent** silencieusement (wrap-around), produisant des triangles aberrants qui traversent le mesh. Règle : `> 65535` sommets → `Uint32BufferAttribute`. (Three.js gère ce choix pour ses primitives ; en géométrie manuelle, c'est à toi.)

### PIÈGE #6 — Croire que « modélisation 3D » = Blender ici

Ce module ne parle **pas** de sculpter dans Blender (topologie, UV unwrap, rigging — métier d'artiste). Il parle de **générer de la géométrie par code**. Les deux se rejoignent sur le format final (un mesh = attributs + index), mais la compétence dev visée est **procédurale** : produire un terrain/relief algorithmiquement, pas à la souris.

### PIÈGE #7 — Régénérer une géométrie sans `dispose()`

Recréer `terrain.geometry` à chaque changement (nouveau seed, resize de la grille) sans appeler `dispose()` sur l'ancienne laisse ses buffers en mémoire GPU → fuite qui finit par crasher l'onglet. Toujours `oldGeometry.dispose()` avant de remplacer.

---

## 5. Ancrage TribuZen

Ce module fabrique le **relief de la carte des sorties** de TribuZen. Là où le module 13 posait le globe (sphère toute faite), la vue rapprochée « carte » a besoin d'un **terrain avec du relief** — collines et vallées — généré **par code**, sans dépendre d'un asset artiste ni d'un modeleur.

**Le terrain de la carte.** `createTerrainGeometry` (Exemple 1) produit une `BufferGeometry` indexée déformée par une fonction de hauteur. Chaque **marqueur de sortie** (module 13) se pose ensuite **sur** la surface : on évalue la même fonction `height(x, z)` à la position du marqueur pour l'y accrocher au bon `y`. Sur ce socle se brancheront :

- le **module 19** (shaders créatifs) remplacera le `sin/cos` par du **bruit simplex** → relief naturel ;
- le **module 20** (physique/raycasting) utilisera le heightfield pour **poser** précisément les marqueurs et gérer le picking au sol ;
- le **module 17** (performance) instanciera des centaines de marqueurs sur ce terrain.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      three/
        geometry/
          createTerrainGeometry.ts  ← grille indexée + heightfield + normales (Exemple 1)
          heightField.ts            ← fonction height(x, z) (sin/cos puis bruit au module 19)
        Map3D.ts                    ← Mesh(terrain) + pose des marqueurs sur la surface
      MapCanvas.vue                 ← <canvas> ; dispose() de la géométrie au onUnmounted
```

> Régénérer le terrain (changer la graine, l'échelle) impose `geometry.dispose()` avant de remplacer — sinon fuite GPU, exactement comme la libération de la boucle au module 13.

---

## 6. Points clés

1. Une **`BufferGeometry`** = un ensemble d'**attributs de sommet** (`position`, `normal`, `uv`, ...), chacun un `Float32Array` plat + un `itemSize`.
2. `setAttribute(name, new Float32BufferAttribute(array, itemSize))` monte un attribut ; `name` est **conventionnel** au mot exact.
3. `.count` (= `array.length / itemSize`) compte les **sommets**, pas les nombres ; lire avec `getX/getY/getZ`, muter puis `needsUpdate = true`.
4. **Indexée** (`setIndex`) réutilise les sommets partagés : gros gain mémoire dès qu'il y a partage (toute grille) ; `Uint16` si `< 65536` sommets, sinon `Uint32`.
5. **Géométrie procédurale** = générer les sommets par code (double boucle `i, j` → grille paramétrique).
6. **Heightfield** : partir d'une grille plate et pousser chaque sommet par `height(x, z)` → terrain.
7. `computeVertexNormals()` **après** déformation (et sur une géométrie **indexée** pour lisser) ; sinon éclairage faux.
8. Winding **CCW** = face avant ; ordre inversé → face invisible (culling).
9. `computeBoundingSphere()` après mutation des positions (culling/raycast) ; `dispose()` pour libérer la mémoire GPU.

---

## 7. Seeds Anki

```
Que contient une BufferGeometry Three.js ?|Un ensemble d'attributs de sommet, chacun un tableau typé plat (Float32Array) plus un itemSize : 'position' (itemSize 3), 'normal' (3), 'uv' (2), 'color' (3/4). C'est l'équivalent objet des VBO du module 07.
Différence entre array.length, itemSize et .count sur un BufferAttribute ?|array.length = nombre de nombres ; itemSize = nombres par sommet (3 pour position) ; .count = nombre de SOMMETS = array.length / itemSize. Itérer sur .count, pas sur array.length.
Comment monter un attribut de position sur une BufferGeometry ?|geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)). Le nom 'position' est conventionnel au mot exact ; itemSize 3 = (x, y, z) par sommet.
Géométrie indexée vs non indexée : quelle différence et quand indexer ?|Non indexée = chaque sommet répété par triangle (duplication). Indexée = sommets uniques + un tableau d'indices (setIndex) qui les réutilise. Indexer dès qu'il y a partage de sommets (toute grille/terrain) : gros gain mémoire et meilleur cache GPU.
Uint16 ou Uint32 pour les indices ?|Uint16BufferAttribute code 0..65535 : suffisant si < 65536 sommets. Au-delà, il déborde silencieusement → utiliser Uint32BufferAttribute. Ex : une grille 256×256 = 66049 sommets exige Uint32.
Qu'est-ce qu'un heightfield (terrain procédural) ?|Une grille de plan plate dont on pousse chaque sommet en hauteur selon une fonction height(x, z). On génère les sommets par code (double boucle i, j), puis y = height(x, z). En vrai terrain on remplace sin/cos par du bruit (Perlin/simplex).
Pourquoi appeler computeVertexNormals() après avoir déformé un terrain ?|Une grille plate a des normales verticales correctes ; après avoir poussé les sommets en hauteur, ces normales sont fausses et l'éclairage reste plat (relief invisible). computeVertexNormals() recalcule et lisse les normales à partir des faces — à faire APRÈS avoir écrit les positions, sur une géométrie indexée pour le lissage.
Que fait le winding (ordre des indices) d'un triangle ?|Il définit la face avant. Three.js attend l'ordre anti-horaire (CCW) vu de face. Un ordre inversé rend la face culée (invisible de face) ; symptôme : le mesh n'apparaît que vu de dessous. Debug : material.side = THREE.DoubleSide.
Pourquoi appeler geometry.dispose() ?|Pour libérer les buffers en mémoire GPU. Régénérer une géométrie procédurale (nouveau seed, resize) sans dispose() sur l'ancienne = fuite mémoire GPU qui finit par crasher l'onglet.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-21-modelisation-3d-et-geometrie/README.md`. Générer de zéro un terrain procédural en `BufferGeometry` indexée (grille + heightfield + normales) qui tourne dans un vrai navigateur — corrigé HTML/JS commenté intégral.
