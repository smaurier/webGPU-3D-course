---
titre: Virtual textures et streaming
cours: 20-webgpu-3d
notions:
  - "virtual texturing (mégatexture, découpage en tuiles/pages, feedback buffer)"
  - "page table (texture d'indirection UV virtuel -> position physique)"
  - "page cache LRU en VRAM (pool de slots physiques, éviction)"
  - "streaming de gros assets (LOD progressif, mip du plus bas au plus haut)"
  - "texture streaming vs geometry streaming"
  - "formats compressés GPU (BC7, ASTC, ETC2) et leur non-portabilité"
  - "Basis Universal (ETC1S, UASTC) transcodé à runtime"
  - "conteneur KTX2 (.ktx2) et KTX2Loader (setTranscoderPath, detectSupport, loadAsync)"
  - "outil CLI ktx (create/encode) de KTX-Software"
  - "gestion mémoire GPU à grande échelle (budget VRAM, CompressedTexture reste compressée)"
outcomes:
  - sait expliquer pourquoi une scène de plusieurs Go de textures ne peut pas tenir en VRAM et ce que résout le virtual texturing
  - sait décrire l'architecture d'un système de virtual texturing (feedback buffer -> page table -> page cache LRU)
  - sait charger une texture KTX2 compressée avec KTX2Loader (setTranscoderPath, detectSupport, loadAsync)
  - sait choisir entre ETC1S et UASTC dans Basis Universal et encoder un .ktx2 avec l'outil ktx
  - sait mettre en place un streaming LOD (mip bas d'abord, montée progressive) en surveillant un budget VRAM
prerequis:
  - "00-prerequis-et-introduction (GPU, VRAM, aperçu pipeline)"
  - "04-pipeline-de-rendu (rasterisation, fragments, coût du rendu)"
  - "07-shaders-buffers-textures (textures, échantillonnage, UV, mip maps)"
  - "13-threejs-fondamentaux (scene/camera/renderer, TextureLoader)"
  - "15-modeles-et-animations (glTF, pipeline d'assets)"
  - "17-performance-et-optimisation (budget de frame, renderer.info, dispose, VRAM)"
next: 28-projet-final
libs: [{ name: three, version: "r160+" }]
tribuzen: "moteur de rendu 3D TribuZen — le globe des sorties affiche des milliers de photos de sorties en haute résolution ; on ne charge en VRAM que les vignettes visibles, en KTX2 compressé, avec montée progressive de résolution (streaming LOD) et un budget VRAM strict"
last-reviewed: 2026-07
---

# Virtual textures et streaming

> **Outcomes — tu sauras FAIRE :** expliquer le problème « trop de textures pour la VRAM », décrire l'architecture virtual texturing (feedback → page table → cache LRU), charger une texture **KTX2** compressée avec `KTX2Loader`, choisir **ETC1S vs UASTC** dans Basis Universal, et mettre en place un **streaming LOD** sous budget VRAM.
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** ce module suppose acquis le budget de frame, `renderer.info` et le dispose pattern du **module 17**. Ici on ne réduit plus le nombre de draw calls : on résout un problème de **mémoire GPU à grande échelle** — des gigaoctets de textures pour quelques gigaoctets de VRAM. C'est l'avant-dernier module ; le **module 28 (projet final)** intègre ces techniques dans le capstone.

## 1. Cas concret d'abord

Le globe TribuZen (module 17) affiche des marqueurs de sorties. On veut maintenant que chaque marqueur, au survol ou au zoom, montre **la photo de la sortie en haute résolution** : une vignette 2048×2048.

Sur la beta, une famille a **3 000 sorties photographiées**. Le développeur écrit naïvement :

```typescript
// ❌ Tout charger d'un coup : 3 000 photos 2048×2048 en RGBA8
const loader = new THREE.TextureLoader();
for (const sortie of sorties) {          // 3 000 itérations
  sortie.texture = await loader.loadAsync(sortie.photoUrl); // .jpg décodé -> RGBA8
}
```

Le calcul de VRAM est brutal. Une texture `2048×2048` en **RGBA8** (le format en VRAM après décodage d'un JPEG) occupe :

```
2048 × 2048 × 4 octets = 16 Mo par photo (mip maps incluses ≈ 21 Mo)
3 000 photos × ~21 Mo  = ~63 Go de VRAM
```

Un laptop moyen a **2 à 8 Go de VRAM**. Résultat : le contexte WebGL plante (`CONTEXT_LOST`), ou le navigateur tue l'onglet. Et le JPEG n'aide pas : il est petit **sur le réseau** mais, une fois décodé, il occupe la taille non compressée en VRAM.

Trois problèmes distincts se cachent là :

1. **On charge tout**, alors que l'utilisateur ne regarde que ~20 photos à la fois. Il faut **streamer** : ne charger que le visible, décharger le reste.
2. **On charge en pleine résolution d'emblée**, ce qui fige l'écran. Il faut une **montée progressive** (mip bas net tout de suite, résolution qui monte ensuite) : le **streaming LOD**.
3. **Le format VRAM est non compressé.** Il faut un format **compressé côté GPU** qui reste compressé en VRAM : **KTX2 / Basis Universal**, qui divise l'empreinte par 4 à 8.

L'objectif du module : afficher des milliers de photos haute résolution en tenant un **budget VRAM** de quelques centaines de Mo, grâce au virtual texturing (le principe), aux formats compressés KTX2 (l'outil concret), et au streaming LOD (la stratégie de chargement).

---

## 2. Théorie complète, concise

### 2.1 Le problème central : VRAM finie, assets infinis

Le rendu 3D à grande échelle bute toujours sur le même mur : la quantité de textures d'une scène (open-world, photogrammétrie, catalogue de photos) dépasse de plusieurs ordres de grandeur la VRAM disponible.

```
Terrain 10 km × 10 km, 1 texel/cm      → plusieurs To de textures
Scan photogrammétrique d'un site       → 50–200 Go
Catalogue TribuZen (milliers de photos) → dizaines de Go décodés

VRAM réelle : 2–24 Go (souvent moins accessible en pratique)
```

Le constat qui débloque tout : **on n'a jamais besoin de tout en même temps**. À un instant donné, la caméra ne voit qu'une fraction des textures, et pour les objets lointains une version basse résolution suffit. Toute la discipline consiste à **ne résider en VRAM que ce qui est visible, à la résolution juste nécessaire**.

### 2.2 Virtual texturing : le principe

Le **virtual texturing** applique aux textures l'idée de la mémoire virtuelle d'un OS. Une **mégatexture** virtuelle énorme (ex. 128 000 × 128 000, impossible à tenir en VRAM) est découpée en **tuiles** de taille fixe appelées **pages** (typiquement 128×128). Seules les pages réellement échantillonnées à l'écran sont chargées dans un **cache physique** en VRAM.

Trois structures collaborent :

- **Feedback buffer** : un rendu basse résolution où chaque pixel écrit, au lieu d'une couleur, **quelles pages** (coordonnée + niveau de mip) il aurait besoin d'échantillonner. Le CPU relit (readback) ce buffer et obtient la liste des pages visibles.
- **Page table** : une petite texture d'**indirection**. Pour une zone UV virtuelle, elle donne la **position physique** de la page correspondante dans le cache (ou un flag « absente »).
- **Page cache** : un pool de slots physiques en VRAM (ex. une grande texture atlas). Quand une page manque, on la charge dans un slot libre ; s'il n'y en a plus, on **évince** la page la moins récemment utilisée (**LRU**).

Le shader final fait une **double lecture** : il échantillonne d'abord la page table pour savoir *où* est la page, puis lit le cache physique à cette position. Une page absente est signalée (souvent en magenta en debug).

### 2.3 Mip-level selection : quelle résolution charger

Le niveau de détail à charger dépend de la taille à l'écran. Si un texel couvre environ un pixel, on veut le mip 0 (pleine résolution). S'il en couvre 16, un mip plus grossier suffit. Le calcul repose sur les **dérivées screen-space** des UV :

```
mipLevel = log2( max(|dU/dx|, |dV/dy|) × textureSize )
```

Plus l'objet est loin ou petit à l'écran, plus le mip choisi est élevé, donc moins de données à charger. C'est ce mécanisme qui rend le streaming viable : le lointain ne coûte presque rien.

### 2.4 Streaming de gros assets : texture vs geometry

Le **streaming** charge les données à la demande pendant l'exécution, au lieu de tout précharger.

- **Texture streaming** : on charge les mip d'une texture **du plus bas au plus haut**. Une version 32×32 (quelques Ko) s'affiche instantanément, puis 256×256, puis la pleine résolution — l'image « se précise » (progressive loading). C'est l'objet direct de ce module.
- **Geometry streaming** : même idée pour la géométrie. On charge d'abord un maillage grossier (peu de triangles), puis on raffine avec la distance. Techniques associées : LOD discrets (module 17), ou meshlets/Nanite-like côté moteurs natifs. Sur le web, on reste le plus souvent sur des **LOD glTF discrets** chargés à la demande.

Les deux partagent la même logique : **priorité au visible et au proche**, chargement asynchrone, budget mémoire.

### 2.5 Formats compressés GPU : pourquoi et le piège de la portabilité

Un JPEG/PNG est compressé **sur le réseau** mais **décodé en RGBA8** en VRAM : aucun gain mémoire GPU. Les **formats compressés GPU** (block compression) restent compressés **en VRAM** et sont lus directement par le matériel — gain typique **×4 à ×8** de mémoire et de bande passante.

| Format | Bits/pixel | Ratio vs RGBA8 | Support natif |
|---|:---:|:---:|---|
| RGBA8 (non compressé) | 32 | 1× | Universel |
| BC7 / BC1 (S3TC) | 8 / 4 | 4× / 8× | Desktop |
| ASTC | variable | 4×+ | Mobile récent |
| ETC2 | 8 | 4× | OpenGL ES 3.0+ |

Le piège : **aucun format n'est supporté partout**. Un `.ktx2` en BC7 plante sur un mobile ASTC, et inversement. Encoder une variante par format et par plateforme est ingérable. D'où Basis Universal.

### 2.6 Basis Universal : ETC1S et UASTC

**Basis Universal** est un format **intermédiaire** conçu pour être **transcodé à runtime** vers le format natif de l'appareil (BC7 sur desktop, ASTC sur mobile, ETC2 sur Android ancien). Un seul fichier, tous les GPU.

Deux modes :

- **ETC1S** : très petit fichier, qualité moindre. Idéal pour de gros volumes où la taille prime (miniatures, textures secondaires).
- **UASTC** : fichier plus lourd, meilleure qualité (proche de l'original). Pour les textures où la qualité compte (albédo héros, normal maps).

Le transcodage se fait via un module **WASM** (le « transcoder »/basis) chargé au runtime — c'est lui qu'il faut fournir au loader.

### 2.7 KTX2 : le conteneur et `KTX2Loader`

**KTX2** (`.ktx2`, Khronos) est le **conteneur** standard qui embarque une texture (mip maps, cubemap, array), y compris encodée en Basis Universal. Three.js le charge avec **`KTX2Loader`** (addon `three/addons/loaders/KTX2Loader.js`).

API publique confirmée (three.js r160+, exemple `webgl_loader_texture_ktx2`) :

```typescript
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const loader = new KTX2Loader()
  .setTranscoderPath('/basis/')   // dossier du transcoder WASM Basis (basis_transcoder.js/.wasm)
  .detectSupport(renderer);       // interroge le GPU pour choisir le format cible (BC7/ASTC/ETC2)

// loadAsync(url) hérité de Loader ; renvoie une CompressedTexture (formats compressés)
const texture: THREE.CompressedTexture = await loader.loadAsync('/photos/sortie-42.ktx2');
```

Trois points critiques (doc/exemple three.js) :

- **`setTranscoderPath(path)`** doit pointer vers les fichiers du transcoder Basis (`basis_transcoder.js` + `.wasm`), copiés depuis `three/examples/jsm/libs/basis/`. Sans eux, le transcodage échoue.
- **`detectSupport(renderer)`** doit être appelé **avant** tout chargement : le loader interroge le GPU (via le `WebGLRenderer` ou `WebGPURenderer`) pour savoir quels formats compressés natifs il supporte, et transcode vers l'un d'eux.
- Le résultat est une **`CompressedTexture`** : elle **reste compressée en VRAM** (contrairement à une texture issue de `TextureLoader`).

`setPath(path)` (hérité) préfixe l'URL, `setWorkerLimit(n)` règle le nombre de workers de transcodage, `dispose()` libère les workers.

### 2.8 Encoder un `.ktx2` : l'outil `ktx`

Les `.ktx2` se produisent hors ligne avec l'outil CLI **`ktx`** de **KTX-Software** (KhronosGroup). Sous-commandes principales : `ktx create`, `ktx encode`, `ktx transcode`, `ktx info`, `ktx validate`.

```bash
# ETC1S (petit, qualité moindre) — pour de gros volumes de vignettes
ktx create --format R8G8B8A8_SRGB --encode basis-lz --generate-mipmap sortie-42.png sortie-42.ktx2

# UASTC (plus lourd, haute qualité) — pour les textures héros
ktx create --format R8G8B8A8_SRGB --encode uastc --generate-mipmap albedo.png albedo.ktx2
```

`--generate-mipmap` est essentiel : c'est ce qui permet le streaming LOD (chaque mip est chargeable séparément). (`toktx` est l'ancien outil équivalent, toujours cité dans d'anciens tutos.)

### 2.9 Gestion mémoire GPU à grande échelle : le budget VRAM

À grande échelle, on raisonne en **budget** : un plafond de VRAM (ex. 256 Mo pour les photos) qu'on ne dépasse jamais. Les briques :

- **File de priorité** : trier les chargements par importance (couverture écran, distance, différence entre mip courant et mip désiré). On charge le plus prioritaire d'abord.
- **Éviction** : quand le budget est atteint, décharger (via `dispose()`, module 17) les textures les moins prioritaires — typiquement LRU ou par distance.
- **Chargements concurrents limités** : ne pas lancer 3 000 `fetch` d'un coup ; un petit pool (2–6 en vol) suffit et garde l'UI réactive.
- **Métriques** : *resident ratio* (pages présentes / visibles, viser > 95 %), *page fault rate* (manques par frame), VRAM consommée. `renderer.info.memory.textures` (module 17) reste le compteur de vérité.

---

## 3. Worked examples

### Exemple 1 — Charger une photo KTX2 compressée (TribuZen)

On remplace le `TextureLoader` du cas concret par un `KTX2Loader` partagé. Chaque photo de sortie est un `.ktx2` (ETC1S) généré hors ligne ; elle reste compressée en VRAM.

```typescript
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// ✅ UN loader partagé pour toute l'appli (workers réutilisés)
function makeKtx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  return new KTX2Loader()
    .setTranscoderPath('/basis/')  // basis_transcoder.js/.wasm copiés depuis three/examples/jsm/libs/basis
    .detectSupport(renderer);      // OBLIGATOIRE avant tout load : choisit BC7/ASTC/ETC2 selon le GPU
}

interface Sortie {
  id: string;
  photoKtx2Url: string; // ex: '/photos/sortie-42.ktx2'
}

// Charge la photo d'une sortie en texture compressée
async function loadPhoto(loader: KTX2Loader, sortie: Sortie): Promise<THREE.CompressedTexture> {
  // loadAsync est hérité de Loader ; renvoie une CompressedTexture (reste compressée en VRAM)
  const texture = await loader.loadAsync(sortie.photoKtx2Url) as THREE.CompressedTexture;
  texture.colorSpace = THREE.SRGBColorSpace; // photo = espace sRGB
  return texture;
}

// Usage : n'afficher que la photo survolée
const loader = makeKtx2Loader(renderer);

async function showPhotoOnHover(sortie: Sortie, marker: THREE.Mesh): Promise<void> {
  const texture = await loadPhoto(loader, sortie);
  const mat = marker.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();       // libère l'ancienne photo (anti-fuite VRAM, module 17)
  mat.map = texture;
  mat.needsUpdate = true;
}
```

**Ce qui a changé vs le cas concret :** on ne charge plus 3 000 photos d'un coup. Une seule photo compressée à la fois, en `CompressedTexture` (≈ 4 Mo au lieu de 16 Mo), libérée dès qu'on survole une autre sortie. La VRAM reste plate.

### Exemple 2 — Streaming LOD : mip bas d'abord, montée progressive

On veut que la photo apparaisse **instantanément en flou** puis se précise. On stocke deux fichiers par photo : une vignette basse résolution (`_lo`, 128×128, quelques Ko) et la pleine résolution (`_hi`, 2048×2048). On charge le `_lo` d'abord, puis on remplace par le `_hi` — avec un budget qui plafonne le nombre de `_hi` résidents.

```typescript
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

class PhotoStreamer {
  private hiResident = new Map<string, THREE.CompressedTexture>();
  private lastUsed = new Map<string, number>();
  private frame = 0;

  constructor(
    private loader: KTX2Loader,
    private budget: number, // nb max de photos HD résidentes en VRAM
  ) {}

  tick(): void { this.frame++; }

  /** Affiche la photo : LOD bas immédiat, puis montée en HD si budget dispo. */
  async attach(id: string, mat: THREE.MeshBasicMaterial): Promise<void> {
    this.lastUsed.set(id, this.frame);

    // 1) Mip bas d'abord : minuscule, quasi instantané -> l'utilisateur voit tout de suite
    const lo = await this.loader.loadAsync(`/photos/${id}_lo.ktx2`) as THREE.CompressedTexture;
    lo.colorSpace = THREE.SRGBColorSpace;
    if (!mat.map) { mat.map = lo; mat.needsUpdate = true; }

    // 2) Éviction si le budget HD est plein, AVANT de charger le HD
    if (!this.hiResident.has(id) && this.hiResident.size >= this.budget) {
      this.evictOldest();
    }

    // 3) Montée en HD : remplace le flou par le net quand c'est prêt
    const hi = await this.loader.loadAsync(`/photos/${id}_hi.ktx2`) as THREE.CompressedTexture;
    hi.colorSpace = THREE.SRGBColorSpace;
    this.hiResident.set(id, hi);
    lo.dispose();               // le mip bas ne sert plus
    mat.map = hi;
    mat.needsUpdate = true;
  }

  /** Décharge la photo HD la moins récemment utilisée (LRU) pour tenir le budget. */
  private evictOldest(): void {
    let oldestId = ''; let oldest = Infinity;
    for (const [id] of this.hiResident) {
      const t = this.lastUsed.get(id) ?? 0;
      if (t < oldest) { oldest = t; oldestId = id; }
    }
    if (oldestId) {
      this.hiResident.get(oldestId)!.dispose(); // libère la VRAM (module 17)
      this.hiResident.delete(oldestId);
    }
  }
}
```

À vérifier dans la console (module 17) : `renderer.info.memory.textures` doit **plafonner** autour de `budget + quelques _lo`, au lieu de croître sans fin. L'utilisateur voit chaque photo apparaître floue puis nette, sans jamais figer l'écran.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire qu'un JPEG « léger » économise la VRAM

Un JPEG de 200 Ko est petit **sur le réseau**, mais le GPU le **décode en RGBA8** : une photo 2048×2048 occupe **16 Mo en VRAM**, quel que soit le poids du JPEG. Seuls les **formats compressés GPU** (KTX2/Basis, `CompressedTexture`) restent compressés en VRAM. Le poids réseau et l'empreinte VRAM sont deux choses indépendantes.

### PIÈGE #2 — Oublier `detectSupport` (ou l'appeler trop tard)

`KTX2Loader` doit interroger le GPU pour savoir vers quel format natif transcoder. Sans `detectSupport(renderer)` **avant** le premier `loadAsync`, le loader ne sait pas quel format cibler et le chargement échoue. C'est une étape d'init, pas une option.

### PIÈGE #3 — Oublier le transcoder Basis (`setTranscoderPath`)

Basis Universal se transcode via un module WASM. Si `setTranscoderPath` ne pointe pas vers un dossier contenant `basis_transcoder.js` et `basis_transcoder.wasm` (copiés depuis `three/examples/jsm/libs/basis/`), le décodage plante (404 sur le WASM). Ces fichiers ne sont pas embarqués automatiquement par le bundler.

### PIÈGE #4 — Confondre un format compressé GPU et Basis Universal

BC7/ASTC/ETC2 sont des formats **finaux**, chacun supporté par une famille de GPU seulement — non portables. Basis Universal (ETC1S/UASTC) est un format **intermédiaire** transcodé à runtime vers le format final du GPU courant. On distribue du Basis (un fichier) ; le GPU reçoit du BC7/ASTC/ETC2. Distribuer directement du BC7 casse sur mobile.

### PIÈGE #5 — Tout précharger « pour éviter les latences »

Charger toutes les textures d'avance est exactement ce qui fait exploser la VRAM (cas concret). Le streaming assume une **petite latence** (le flou du mip bas) en échange d'une empreinte bornée. Vouloir zéro latence en préchargeant tout, c'est renoncer au streaming — et planter à grande échelle.

### PIÈGE #6 — Streamer sans budget ni éviction

Charger à la demande sans jamais **décharger** (`dispose`) n'est pas du streaming : c'est un préchargement paresseux qui finit par tout résider. Un vrai streaming impose un **budget VRAM** et une politique d'**éviction** (LRU/distance). Sans éviction, `renderer.info.memory.textures` monte sans redescendre — la fuite du module 17.

### PIÈGE #7 — ETC1S partout « parce que c'est plus petit »

ETC1S minimise la taille mais dégrade la qualité, visible sur les **normal maps** et les dégradés fins (banding). UASTC est fait pour ça. Le bon réflexe : ETC1S pour les gros volumes peu critiques (vignettes), UASTC pour les textures où la qualité compte. Un seul mode pour tout est un mauvais compromis.

---

## 5. Ancrage TribuZen

Le catalogue de photos de sorties est le premier endroit de TribuZen où la **mémoire GPU** devient le facteur limitant, avant même les FPS.

**Encodage hors ligne → `ktx create`.** Chaque photo uploadée par une famille est convertie en deux `.ktx2` : un `_lo` 128×128 ETC1S (vignette, quelques Ko) et un `_hi` 2048×2048 (UASTC pour la qualité, ou ETC1S si on privilégie le volume). Étape de build/serveur, jamais dans le navigateur.

**Chargement → `KTX2Loader` partagé.** Un seul loader pour l'appli, `setTranscoderPath('/basis/')` + `detectSupport(renderer)` au démarrage. Chaque photo affichée est une `CompressedTexture` qui reste compressée en VRAM (×4 à ×8 de gain).

**Affichage → streaming LOD.** Au survol/zoom d'un marqueur, on charge le `_lo` (net immédiat en flou) puis le `_hi` (montée progressive). L'utilisateur ne voit jamais l'écran figer.

**Budget → éviction LRU.** Un plafond de photos HD résidentes (ex. 40) ; au-delà, la moins récemment vue est `dispose()`. `renderer.info.memory.textures` plafonne au lieu de croître.

Le virtual texturing complet (feedback buffer + page table + cache GPU) est réservé aux terrains/mégatextures : pour un catalogue de photos indépendantes, le streaming LOD par fichier KTX2 suffit et reste maintenable.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  scripts/
    encode-photos.sh     ← ktx create (_lo ETC1S / _hi UASTC) au build
  src/
    3d/
      textures/
        ktx2Loader.ts     ← KTX2Loader partagé : setTranscoderPath + detectSupport
        PhotoStreamer.ts   ← LOD bas -> HD, budget VRAM + éviction LRU
      globe/
        MarkerPhotos.ts    ← attache la photo streamée au marqueur survolé
  public/
    basis/                 ← basis_transcoder.js + .wasm (transcoder Basis)
```

> Le rendu du globe et les marqueurs relèvent des modules 13/17 ; ici on garantit que **des milliers de photos haute résolution** tiennent dans un budget VRAM fixe.

---

## 6. Points clés

1. La VRAM est finie (2–24 Go) et les textures d'une scène la dépassent de plusieurs ordres de grandeur : on ne réside que le **visible**, à la **résolution juste nécessaire**.
2. Un JPEG/PNG est décodé en **RGBA8** en VRAM (16 Mo pour 2048²) : le poids réseau n'économise **pas** la mémoire GPU.
3. **Virtual texturing** = mégatexture découpée en **pages** ; **feedback buffer** (pages visibles) → **page table** (indirection) → **page cache LRU** en VRAM ; double lecture dans le shader.
4. **Mip-level selection** via dérivées screen-space : le lointain charge un mip grossier, ce qui rend le streaming viable.
5. **Streaming LOD** = charger les mip du plus bas au plus haut (flou → net) ; texture streaming (ce module) et geometry streaming partagent la logique « priorité au visible/proche ».
6. **Formats compressés GPU** (BC7/ASTC/ETC2) restent compressés en VRAM (×4 à ×8) mais **aucun n'est portable** : chaque famille de GPU a le sien.
7. **Basis Universal** (ETC1S petit/qualité moindre, UASTC lourd/haute qualité) est un format **intermédiaire transcodé à runtime** vers le format natif — un fichier, tous les GPU.
8. **KTX2 + `KTX2Loader`** : `setTranscoderPath('/basis/')` (WASM), `detectSupport(renderer)` **avant** tout load, `loadAsync` → `CompressedTexture`. Encodage hors ligne avec `ktx create --encode basis-lz|uastc --generate-mipmap`.
9. À grande échelle on raisonne **budget VRAM** : file de priorité + **éviction** (LRU/distance) + chargements concurrents limités ; `renderer.info.memory.textures` doit **plafonner**.

---

## 7. Seeds Anki

```
Pourquoi charger 3 000 photos JPEG 2048x2048 fait-il exploser la VRAM alors que les JPEG sont petits ?|Le GPU décode le JPEG en RGBA8 en VRAM : 2048x2048x4 = 16 Mo par photo, quel que soit le poids du JPEG. 3 000 x ~16 Mo = ~48 Go >> VRAM (2-24 Go). Le poids réseau et l'empreinte VRAM sont indépendants ; seuls les formats compressés GPU restent compressés en VRAM.
Quelles sont les trois structures du virtual texturing et leur rôle ?|Feedback buffer : rendu basse-res où chaque pixel écrit quelles pages (coord + mip) il échantillonne, relu par le CPU. Page table : petite texture d'indirection UV virtuel -> position physique dans le cache. Page cache : pool LRU de slots physiques en VRAM, évince la page la moins récemment utilisée quand plein.
Pourquoi BC7/ASTC/ETC2 ne suffisent-ils pas et que résout Basis Universal ?|BC7/ASTC/ETC2 sont des formats finaux non portables : chaque famille de GPU supporte le sien (BC desktop, ASTC mobile, ETC2 Android ancien). Basis Universal est un format intermédiaire (ETC1S/UASTC) transcodé à runtime vers le format natif du GPU courant : un seul fichier fonctionne partout.
Quelles sont les 3 étapes d'init de KTX2Loader et pourquoi ?|setTranscoderPath('/basis/') : pointe vers le module WASM Basis (basis_transcoder.js/.wasm) qui fait le transcodage. detectSupport(renderer) AVANT tout load : interroge le GPU pour choisir le format cible (BC7/ASTC/ETC2). loadAsync(url) : renvoie une CompressedTexture qui reste compressée en VRAM.
Différence entre ETC1S et UASTC dans Basis Universal ?|ETC1S : fichier très petit, qualité moindre — pour de gros volumes peu critiques (vignettes). UASTC : fichier plus lourd, haute qualité proche de l'original — pour les textures où la qualité compte (albédo héros, normal maps qui souffrent du banding en ETC1S).
Qu'est-ce que le streaming LOD (progressive loading) d'une texture ?|Charger les mip du plus bas au plus haut : une version 32x32 (quelques Ko) s'affiche instantanément (flou), puis 256x256, puis pleine résolution (net). L'image se précise sans figer l'écran. Le mip à charger dépend de la taille écran via les dérivées screen-space des UV.
Pourquoi streamer sans budget ni éviction n'est-il pas du vrai streaming ?|Charger à la demande sans jamais décharger (dispose) fait tout résider à terme : c'est un préchargement paresseux qui fuit (renderer.info.memory.textures monte sans redescendre). Le vrai streaming impose un budget VRAM et une politique d'éviction (LRU/distance) pour borner l'empreinte.
Avec quel outil et quelle commande produit-on un .ktx2 compressé, et pourquoi les mipmaps ?|L'outil CLI ktx de KTX-Software : ktx create --encode basis-lz (ETC1S) ou --encode uastc, avec --generate-mipmap. Les mipmaps sont indispensables au streaming LOD : chaque niveau est chargeable séparément (bas d'abord). toktx est l'ancien outil équivalent.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-27-virtual-textures-et-streaming/README.md`. Charger une vraie texture KTX2 compressée avec `KTX2Loader` (transcoder Basis + `detectSupport`) dans un navigateur WebGPU/Chrome, puis mettre en place un streaming LOD (mip bas d'abord, montée en HD) sous budget VRAM — corrigé TypeScript commenté intégral.
