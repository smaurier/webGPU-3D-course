# Lab 14 — Matériaux et lumières Three.js (le trophée éclairé)

> **Outcome :** à la fin, tu sais construire une scène Three.js réelle où un objet **PBR** (métal + vernis) est **éclairé** (ambient + soleil) et **projette une ombre** sur un sol qui la reçoit, avec une environment map pour les reflets.
> **Vrai outil :** Three.js (`three`) dans un vrai navigateur (Chrome/Firefox), via Vite. AUCUN harnais simulé, aucun test-runner auto-correcteur.
> **Feedback :** le coach valide en session à l'œil et via la grille ci-dessous (l'oracle est l'image rendue à l'écran, pas un assert).

## Énoncé

Tu pars du **bug classique** : un trophée doré en `MeshStandardMaterial` s'affiche **noir** parce que la scène n'a pas de lumière. Ta mission : livrer une scène TribuZen crédible.

Objectif visuel à atteindre :

1. Un **trophée** (icosaèdre ou tore) en matériau PBR **doré métallique** (idéalement verni via `MeshPhysicalMaterial`).
2. Un **socle** + un **sol** en `MeshStandardMaterial` mat.
3. Un éclairage **`AmbientLight` faible + `DirectionalLight` (soleil)**.
4. Des **ombres complètes** : le trophée projette, le socle/sol reçoivent.
5. Une **environment map** (cube map ou couleur d'environnement) pour que l'or ne soit pas terne.
6. `OrbitControls` pour tourner autour, et une rotation lente du trophée.

### Starter

Arborescence minimale (Vite + Three) :

```
lab-trophy/
  index.html
  main.ts
  package.json   →  npm i three  (+ vite en dev)
```

`index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Trophée TribuZen — matériaux & lumières</title>
  <style>
    body { margin: 0; overflow: hidden; background: #000; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`main.ts` (starter volontairement CASSÉ — le trophée est noir) :

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

// ⚠️ Trophée PBR mais AUCUNE lumière, AUCUNE ombre, AUCUN environnement → noir.
const trophy = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1, 0),
  new THREE.MeshStandardMaterial({ color: 0xffd700 }),
);
trophy.position.y = 0.9;
scene.add(trophy);

// TODO 1 : ajouter AmbientLight (faible) + DirectionalLight (soleil, fort)
// TODO 2 : activer les ombres (renderer.shadowMap + castShadow + receiveShadow)
// TODO 3 : régler la shadow camera de la DirectionalLight (frustum + mapSize)
// TODO 4 : passer le trophée en MeshPhysicalMaterial doré/verni
// TODO 5 : ajouter socle + sol qui reçoivent l'ombre
// TODO 6 : ajouter une environment map (cube map ou au moins reflets)

function animate(): void {
  requestAnimationFrame(animate);
  trophy.rotation.y += 0.01;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

Lancer : `npm i three && npx vite`, ouvrir l'URL locale. Tu dois voir un disque **noir** au départ — c'est le point de départ à corriger.

## Étapes (en friction)

Fais-les **dans l'ordre**, en vérifiant l'écran après chaque TODO (chaque étape doit changer visiblement l'image) :

1. **TODO 1 — lumières.** Ajoute `AmbientLight(0xffffff, 0.4)` puis `DirectionalLight(0xffffff, 2.0)` positionnée en `(5, 8, 4)`. Le trophée doit passer de noir à doré/éclairé. Coupe l'ambiant seul, puis le soleil seul, pour *sentir* le rôle de chacun.
2. **TODO 2 — les trois interrupteurs d'ombre.** Active `renderer.shadowMap.enabled` + `PCFSoftShadowMap`, `sun.castShadow`, `trophy.castShadow`. À ce stade rien ne reçoit encore l'ombre : normal.
3. **TODO 3 — shadow camera.** Règle `sun.shadow.mapSize.set(2048, 2048)`, le frustum ortho (`left/right/top/bottom` ≈ ±5, `near/far`), et `sun.shadow.bias = -0.0005`. Sans réglage, l'ombre sera coupée ou pixélisée.
4. **TODO 4 — matériau.** Remplace le `MeshStandardMaterial` du trophée par `MeshPhysicalMaterial` (`metalness: 1`, `roughness: 0.35`, `clearcoat: 1`, `clearcoatRoughness: 0.05`).
5. **TODO 5 — socle + sol.** Ajoute un cylindre (socle) et un plan (sol), tous deux en `MeshStandardMaterial` mat, avec `receiveShadow = true`. L'ombre du trophée doit apparaître dessous.
6. **TODO 6 — environnement.** Ajoute une `CubeTextureLoader` (ou au minimum une couleur d'environnement claire) sur `scene.environment` pour que l'or accroche des reflets. Compare avec/sans.

Contrainte de friction : **n'ouvre pas le corrigé** avant d'avoir une ombre visible à l'écran par tes propres moyens.

## Corrigé complet commenté

`main.ts` complet (remplace le starter) :

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Renderer : ombres activées ────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;               // (interrupteur ombre 1/3)
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // bords d'ombre adoucis
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

// ── Environment map : reflets + éclairage indirect (TODO 6) ───
// Cube map de studio ; à défaut d'assets, une couleur suffit à sortir du noir total.
const envMap = new THREE.CubeTextureLoader()
  .setPath('/env/')
  .load(['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']);
scene.environment = envMap; // profite à TOUS les matériaux PBR sans les toucher

// ── Lumières : ambiant faible + soleil fort (TODO 1) ──────────
scene.add(new THREE.AmbientLight(0xffffff, 0.4)); // remplissage : évite le noir dur

const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(5, 8, 4);            // POSITION = direction des rayons (vers l'origine)
sun.castShadow = true;                // (interrupteur ombre 2/3)
sun.shadow.mapSize.set(2048, 2048);   // ombre nette (TODO 3)
sun.shadow.camera.left = -5;          // frustum ortho SERRÉ autour de la scène
sun.shadow.camera.right = 5;
sun.shadow.camera.top = 5;
sun.shadow.camera.bottom = -5;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 30;
sun.shadow.bias = -0.0005;            // anti shadow-acne (moirage d'auto-ombrage)
scene.add(sun);

// ── Le trophée : PBR doré + vernis (TODO 4) ───────────────────
const trophy = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1, 0),
  new THREE.MeshPhysicalMaterial({
    color: 0xffd700,
    metalness: 1.0,           // métal (quasi binaire : 0 ou 1)
    roughness: 0.35,          // reflets nets sans être miroir
    clearcoat: 1.0,           // couche de vernis transparente
    clearcoatRoughness: 0.05, // vernis quasi-miroir
  }),
);
trophy.position.y = 0.9;
trophy.castShadow = true;      // (interrupteur ombre 3/3 : il PROJETTE)
scene.add(trophy);

// ── Socle : reçoit l'ombre (TODO 5) ───────────────────────────
const socle = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.4, 0.2, 48),
  new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.9, metalness: 0 }),
);
socle.position.y = -0.1;
socle.receiveShadow = true;    // il AFFICHE l'ombre du trophée
scene.add(socle);

// ── Sol : reçoit aussi l'ombre portée ─────────────────────────
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2; // le plan est vertical par défaut → on le couche
ground.position.y = -0.2;
ground.receiveShadow = true;
scene.add(ground);

// ── Boucle de rendu ───────────────────────────────────────────
function animate(): void {
  requestAnimationFrame(animate);
  trophy.rotation.y += 0.01;  // rotation lente
  controls.update();          // damping OrbitControls
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

> Note assets : si tu n'as pas de cube map `/env/*.jpg`, commente le bloc `envMap`/`scene.environment` — la scène reste correcte (l'or sera juste un peu plus terne). Des HDRIs/cube maps CC0 sont dispo sur polyhaven.com.

### Grille d'auto-évaluation

| # | Critère | OK ? |
|---|---------|:---:|
| 1 | Le trophée n'est plus noir : il est doré et éclairé | ☐ |
| 2 | Je distingue le rôle de l'ambiant (remplissage) et du soleil (relief) | ☐ |
| 3 | Une ombre portée nette apparaît sous le trophée | ☐ |
| 4 | J'ai bien les **trois** interrupteurs d'ombre (renderer + light + mesh) | ☐ |
| 5 | Le frustum de la shadow camera n'ampute ni ne pixélise l'ombre | ☐ |
| 6 | Le trophée utilise un matériau PBR (metalness/roughness cohérents) | ☐ |
| 7 | L'environment map (ou son absence) change visiblement les reflets | ☐ |
| 8 | Je sais expliquer pourquoi metalness ~0.5 n'a pas de sens physique | ☐ |

### Coach — questions de vérification (session)

Le coach ne valide pas tant que tu ne réponds pas de tête, sans relire le code :

1. **« Coupe le soleil, garde l'ambiant. Décris et explique l'image. »** — attendu : trophée visible mais **plat, sans relief ni ombre** ; l'ambiant éclaire uniformément, sans direction.
2. **« Je retire `socle.receiveShadow`. Que se passe-t-il et pourquoi le trophée garde-t-il son `castShadow` ? »** — attendu : l'ombre disparaît du socle ; castShadow (projeter) et receiveShadow (afficher) sont **indépendants**.
3. **« Pourquoi mettre `metalness: 1` et `roughness: 0.35` plutôt que `metalness: 0.5` pour un or moins brillant ? »** — attendu : metalness est quasi binaire ; pour moduler l'éclat on joue **roughness**, pas metalness.
4. *(bonus)* **« Ton ombre est pixélisée. Deux leviers ? »** — attendu : resserrer le frustum de la shadow camera **et/ou** augmenter `shadow.mapSize`.

## Variante J+30 (fading)

Reprends le même objectif **de mémoire, sans rouvrir le corrigé, en 25 minutes**, avec ces contraintes ajoutées :

- Remplace la `DirectionalLight` par une **`SpotLight`** (projecteur) qui éclaire le trophée par le haut, cône `Math.PI / 6`, `penumbra: 0.3`, avec ombre — et fais fonctionner l'ombre (attention : la shadow camera d'un spot est **perspective**, pas orthographique).
- Ajoute une **seconde sphère en verre** (`MeshPhysicalMaterial`, `transmission: 1`, `ior: 1.5`) à côté du trophée.
- Contrainte finale : la scène doit rester lisible **sans** `AmbientLight` (uniquement spot + environment).

## Application TribuZen

Porte la scène dans `smaurier/tribuzen` :

```
tribuzen/src/3d/trophy/
  TrophyMaterial.ts   ← factory MeshPhysicalMaterial doré/verni, teinte selon le niveau (bronze/argent/or)
  TrophyScene.ts       ← lumières (ambient + sun), ombres, scene.environment
  TrophyCanvas.vue      ← <canvas> monté sur le profil famille, rotation lente
```

Le trophée s'affiche sur le profil quand la famille atteint 10 sorties bouclées. La teinte (`material.color`) encode le palier, l'ombre portée le fait *poser* sur la carte de profil. Commit type sur `smaurier/tribuzen` :

```
feat(3d): trophée famille PBR éclairé avec ombre portée (Three.js)
```

> Étape suivante (module 15) : remplacer l'icosaèdre par un vrai modèle **glTF** de trophée, puis l'animer (montée + éclat) via `AnimationMixer`.
