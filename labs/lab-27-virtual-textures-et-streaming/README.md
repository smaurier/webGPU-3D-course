# Lab 27 — Virtual textures et streaming

> **Outcome :** à la fin, tu sais charger une texture **KTX2 compressée** avec `KTX2Loader` (transcoder Basis + `detectSupport`) et mettre en place un **streaming LOD** (mip bas d'abord, montée en HD) sous un **budget VRAM** avec éviction — le tout dans un vrai navigateur.
> **Vrai outil :** Three.js (r160+) + `KTX2Loader` (addon officiel) dans Chrome — pas de harnais simulé, pas de gap-fill.
> **Feedback :** le coach valide en session à l'écran (`CompressedTexture` chargée, `renderer.info.memory.textures` qui plafonne, montée de résolution visible), pas de test-runner auto-correcteur.

## Énoncé

On reprend le catalogue de photos de sorties TribuZen du module. Tu vas afficher, sur des plans, des **photos KTX2 compressées** — d'abord une seule pour valider la chaîne `KTX2Loader`, puis un **streaming LOD sous budget** sur plusieurs photos.

Contrainte de réalité GPU : une photo `2048×2048` en RGBA8 coûte **16 Mo** en VRAM ; en KTX2/Basis elle reste compressée (**≈ 4 Mo**). Ton but est de garder `renderer.info.memory.textures` **borné** quel que soit le nombre de photos parcourues.

### Prérequis assets (à préparer une fois)

1. Récupère le transcoder Basis : copie le dossier `three/examples/jsm/libs/basis/` (contient `basis_transcoder.js` et `basis_transcoder.wasm`) dans `./basis/` à côté de ton `index.html`.
2. Encode 2–3 photos en `.ktx2` avec l'outil **`ktx`** de KTX-Software (une version basse résolution `_lo` et une haute `_hi` par photo). Si tu n'as pas l'outil installé, utilise des `.ktx2` d'exemple de three.js (`examples/textures/ktx2/`) renommés en `_lo`/`_hi`.

```bash
# _lo : petit et rapide (mip bas net immédiat)
ktx create --format R8G8B8A8_SRGB --encode basis-lz --generate-mipmap --width 128 photo1.png photo1_lo.ktx2
# _hi : haute qualité (montée progressive)
ktx create --format R8G8B8A8_SRGB --encode uastc --generate-mipmap photo1.png photo1_hi.ktx2
```

### Starter (à copier dans un dossier vide)

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Lab 27 — KTX2 + streaming LOD (TribuZen)</title>
  <style>body { margin: 0; overflow: hidden; } #hud { position: fixed; top: 8px; left: 8px; color: #0f0; font: 13px monospace; background: rgba(0,0,0,.75); padding: 8px; border-radius: 4px; }</style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <div id="hud">chargement…</div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`main.ts` — **point de départ (naïf, à corriger)** :

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);
new OrbitControls(camera, renderer.domElement);

// ❌ TextureLoader : le JPEG est décodé en RGBA8 → 16 Mo/photo en VRAM.
// À REMPLACER par KTX2Loader (CompressedTexture, ~4 Mo).
const loader = new THREE.TextureLoader();
const tex = await loader.loadAsync('/photos/photo1.jpg');
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ map: tex }),
);
scene.add(plane);

const hud = document.getElementById('hud')!;
function animate(): void {
  requestAnimationFrame(animate);
  hud.textContent = `textures VRAM: ${renderer.info.memory.textures}`;
  renderer.render(scene, camera);
}
animate();
```

Sers le dossier avec un serveur statique (`npx serve`) et ouvre-le dans Chrome. (KTX2Loader fonctionne aussi avec `WebGPURenderer` : `detectSupport` accepte les deux ; on reste ici sur `WebGLRenderer`, éprouvé.)

## Étapes (en friction)

1. **Branche `KTX2Loader`.** Importe-le depuis `three/addons/loaders/KTX2Loader.js`. Crée le loader avec `.setTranscoderPath('/basis/')` puis `.detectSupport(renderer)`. Remplace le `TextureLoader` et charge `photo1_hi.ktx2` via `loadAsync`. Vérifie dans la console que la texture est une `CompressedTexture` (`tex instanceof THREE.CompressedTexture === true`).
2. **Constate le gain VRAM.** Compare `renderer.info.memory.textures` et, si tu peux, l'onglet Memory. La `CompressedTexture` reste compressée.
3. **Deux niveaux LOD.** Charge d'abord `photo1_lo.ktx2` (petit) et affiche-le tout de suite, puis charge `photo1_hi.ktx2` et remplace le `map` quand il est prêt. Tu dois VOIR l'image passer de floue à nette.
4. **Plusieurs photos + budget.** Dispose 4–6 plans en grille, chacun une photo différente. Écris un `PhotoStreamer` qui, au survol (raycaster) ou en boucle, charge `_lo` puis `_hi`, avec un **budget** de N photos HD résidentes et une **éviction LRU** (`dispose()` la moins récente) au-delà.
5. **Prouve le plafond.** Parcours toutes les photos et vérifie que `renderer.info.memory.textures` **plafonne** (ne croît pas indéfiniment). Note la valeur.

Ne recopie pas le corrigé avant d'avoir buté sur au moins l'étape 1 (transcoder/`detectSupport`).

## Corrigé complet commenté

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101018);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);
new OrbitControls(camera, renderer.domElement);

// ─── ÉTAPE 1 : KTX2Loader partagé ────────────────────────────
// setTranscoderPath -> dossier du transcoder WASM Basis (basis_transcoder.js/.wasm).
// detectSupport(renderer) OBLIGATOIRE avant tout load : choisit BC7/ASTC/ETC2 selon le GPU.
const ktx2 = new KTX2Loader()
  .setTranscoderPath('/basis/')
  .detectSupport(renderer);

// Petit utilitaire : charge un .ktx2 en CompressedTexture sRGB.
async function loadKtx2(url: string): Promise<THREE.CompressedTexture> {
  const tex = (await ktx2.loadAsync(url)) as THREE.CompressedTexture;
  tex.colorSpace = THREE.SRGBColorSpace; // photo = espace sRGB
  return tex;
}

// ─── ÉTAPES 3+4 : streamer LOD + budget VRAM ────────────────
interface Photo { id: string; mat: THREE.MeshBasicMaterial; }

class PhotoStreamer {
  private hi = new Map<string, THREE.CompressedTexture>(); // HD résidentes
  private lastUsed = new Map<string, number>();
  private frame = 0;

  constructor(private budget: number) {}
  tick(): void { this.frame++; }

  /** LOD bas immédiat, puis HD si budget dispo (avec éviction LRU). */
  async attach(id: string, mat: THREE.MeshBasicMaterial): Promise<void> {
    this.lastUsed.set(id, this.frame);

    // 1) mip bas : minuscule, quasi instantané → l'utilisateur voit tout de suite (flou)
    const lo = await loadKtx2(`/photos/${id}_lo.ktx2`);
    if (!mat.map) { mat.map = lo; mat.needsUpdate = true; }

    // 2) éviction AVANT de charger le HD si le budget est plein
    if (!this.hi.has(id) && this.hi.size >= this.budget) this.evictOldest();

    // 3) montée en HD : remplace le flou par le net quand prêt
    const hi = await loadKtx2(`/photos/${id}_hi.ktx2`);
    this.hi.set(id, hi);
    lo.dispose();                 // le mip bas ne sert plus → libère la VRAM
    mat.map = hi;
    mat.needsUpdate = true;
  }

  /** Décharge la HD la moins récemment utilisée pour tenir le budget. */
  private evictOldest(): void {
    let oldestId = ''; let oldest = Infinity;
    for (const [id] of this.hi) {
      const t = this.lastUsed.get(id) ?? 0;
      if (t < oldest) { oldest = t; oldestId = id; }
    }
    if (oldestId) {
      this.hi.get(oldestId)!.dispose(); // libère la VRAM (module 17)
      this.hi.delete(oldestId);
    }
  }

  get residentCount(): number { return this.hi.size; }
}

// ─── Grille de plans (une photo par plan) ───────────────────
const IDS = ['photo1', 'photo2', 'photo3', 'photo4', 'photo5', 'photo6'];
const photos: Photo[] = [];
const geo = new THREE.PlaneGeometry(1.6, 1.6);

IDS.forEach((id, i) => {
  const mat = new THREE.MeshBasicMaterial({ color: 0x333333 }); // placeholder avant chargement
  const plane = new THREE.Mesh(geo, mat);
  plane.position.set((i % 3) * 2 - 2, Math.floor(i / 3) * -2 + 1, 0);
  plane.userData.id = id;
  scene.add(plane);
  photos.push({ id, mat });
});

// Budget : 3 photos HD résidentes max → prouve le plafond VRAM
const streamer = new PhotoStreamer(3);

// ─── ÉTAPE 5 : streaming au survol (raycaster) ──────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
});

let hovering: string | null = null;
function streamHovered(): void {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(scene.children)[0];
  const id = hit?.object.userData.id as string | undefined;
  if (id && id !== hovering) {
    hovering = id;
    const p = photos.find((x) => x.id === id)!;
    void streamer.attach(id, p.mat); // charge _lo puis _hi, sous budget
  }
}

// ─── HUD + boucle ───────────────────────────────────────────
const hud = document.getElementById('hud')!;
function animate(): void {
  requestAnimationFrame(animate);
  streamer.tick();
  streamHovered();
  // Attendu : textures plafonne (≈ budget HD + quelques _lo), ne croît pas sans fin.
  hud.textContent =
    `HD résidentes: ${streamer.residentCount}/3 | ` +
    `renderer.info textures: ${renderer.info.memory.textures}`;
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
```

**Résultat attendu :** au survol, chaque photo apparaît **floue (`_lo`) puis nette (`_hi`)**. En parcourant les 6 photos avec un budget de 3, `renderer.info.memory.textures` **plafonne** (les HD au-delà de 3 sont `dispose()`), au lieu de monter jusqu'à 6+ HD. Les textures sont des `CompressedTexture` (≈ ×4 de gain VRAM vs `TextureLoader`).

### Grille d'auto-évaluation

| Critère | Non acquis | En cours | Acquis |
|---|---|---|---|
| Chaîne KTX2 | `setTranscoderPath`/`detectSupport` oubliés (404 WASM ou échec) | charge un `.ktx2` mais ne sait pas pourquoi `detectSupport` | `CompressedTexture` chargée, sait le rôle du transcoder + `detectSupport` |
| Gain VRAM | croit que le JPEG économise la VRAM | voit la texture compressée sans l'expliquer | explique décodage RGBA8 vs `CompressedTexture` (×4) |
| Streaming LOD | charge direct le HD (écran figé) | `_lo` puis `_hi` mais sans dispose du `_lo` | montée `_lo`→`_hi` propre, `_lo` disposé |
| Budget/éviction | aucun budget, VRAM croît | budget posé mais pas d'éviction réelle | LRU + `dispose`, `memory.textures` plafonne (chiffre noté) |

### Coach — vérifier en session

1. **Coupe le dossier `/basis/`** (renomme-le) et fais recharger : le chargement doit planter sur le WASM. Demande pourquoi → attendu : Basis se transcode via un module WASM (`setTranscoderPath`), piège #3 du module.
2. **Retire `detectSupport(renderer)`** et fais recharger : échec/erreur de format. Demande le rôle exact → interroger le GPU pour choisir BC7/ASTC/ETC2, piège #2.
3. **Fais expliquer pourquoi un JPEG « léger » n'économise pas la VRAM** → décodé en RGBA8 (16 Mo/2048²) ; seule une `CompressedTexture` reste compressée, piège #1.
4. **Baisse le budget à 1** et fais parcourir les photos : `memory.textures` doit rester quasi plat. S'il ne relie pas ça à l'éviction LRU → piège #6.
5. **Bonus** : « pourquoi `_lo` en ETC1S et `_hi` en UASTC ? » → attendu : ETC1S petit pour la vignette, UASTC qualité pour le net, piège #7.

## Variante J+30 (fading)

Reprends l'exercice **sans le corrigé**, en **30 minutes chrono**, avec **une contrainte ajoutée** : remplace le survol par un **carrousel automatique** qui parcourt les 6 photos en boucle (une nouvelle toutes les 2 s), budget HD = **2**. Prouve dans le HUD que `renderer.info.memory.textures` reste **plafonné** malgré le défilement infini, et affiche le **nombre d'évictions** cumulées. Si tu ne retrouves pas de tête l'ordre `setTranscoderPath` → `detectSupport` → `loadAsync`, c'est le piège #2/#3 à réviser.

## Application TribuZen

Porte ce lab dans le vrai produit. Dans `smaurier/tribuzen`, la couche textures du globe :

- `scripts/encode-photos.sh` — `ktx create` génère `_lo` (ETC1S) et `_hi` (UASTC) pour chaque photo uploadée (étape de build/serveur).
- `src/3d/textures/ktx2Loader.ts` — `KTX2Loader` partagé : `setTranscoderPath('/basis/')` + `detectSupport(renderer)` au démarrage.
- `src/3d/textures/PhotoStreamer.ts` — LOD bas→HD, budget VRAM + éviction LRU.
- `src/3d/globe/MarkerPhotos.ts` — attache la photo streamée au marqueur survolé/zoomé.
- `public/basis/` — `basis_transcoder.js` + `.wasm` copiés depuis `three/examples/jsm/libs/basis/`.

Commit suggéré sur `smaurier/tribuzen` : `feat(photos): streaming KTX2 des photos de sorties (LOD lo→hi, budget VRAM + éviction LRU)`.
