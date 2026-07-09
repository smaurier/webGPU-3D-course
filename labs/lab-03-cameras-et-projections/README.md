# Lab 03 — Caméras et projections

> **Outcome :** à la fin, tu sais construire une matrice de vue `lookAt`, une matrice de projection perspective **et** orthographique (convention WebGPU), assembler la matrice `MVP`, et projeter des points 3D en pixels écran — le tout tournant dans un vrai navigateur.
> **Vrai outil :** un fichier HTML + module TypeScript/JS chargé par le navigateur (Chrome), rendu visuel sur un `<canvas>` 2D. Pas de framework, pas de harnais auto-correcteur.
> **Feedback :** le coach valide **visuellement** en session — les marqueurs projetés doivent tomber au bon endroit à l'écran.

---

## Énoncé

Tu construis le cœur mathématique de la **carte 3D des sorties de TribuZen** : une classe `Camera` qui survole la carte, plus la projection qui place les **étiquettes** des sorties.

L'oracle est **visuel** : tu dessines des marqueurs 3D projetés sur un `<canvas>` 2D. Si ta caméra et ta projection sont justes, les points forment une grille cohérente qui se resserre au loin (perspective) ou reste régulière (orthographique). Un point pile devant la caméra doit tomber au **centre** du canvas.

Tu dois écrire **toi-même** :

1. `lookAt(eye, target, up)` → `Mat4` (matrice de vue).
2. `perspective(fovY, aspect, near, far)` → `Mat4` (convention WebGPU, z NDC ∈ [0, 1]).
3. `orthographic(size, aspect, near, far)` → `Mat4` (convention WebGPU).
4. `projectToScreen(point, mvp, width, height)` → `{ x, y, depth, visible } | null`.
5. Une boucle qui projette une **grille de marqueurs** et les dessine sur le canvas.

**Pas de gap-fill** : tu pars du starter minimal ci-dessous et tu écris les fonctions complètes.

### Starter minimal

Crée le dossier `lab-03/` avec deux fichiers.

`index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Lab 03 — Caméras et projections</title>
    <style>
      body { margin: 0; background: #0f172a; color: #e2e8f0; font-family: system-ui; }
      canvas { display: block; margin: 1rem auto; background: #1e293b; }
      button { margin: 0.5rem; padding: 0.4rem 0.8rem; cursor: pointer; }
    </style>
  </head>
  <body>
    <div style="text-align:center">
      <button id="mode">Basculer perspective / ortho</button>
    </div>
    <canvas id="c" width="960" height="540"></canvas>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

`main.js` (starter — à compléter) :

```js
// ── Mini algèbre linéaire (fournie) ─────────────────────
// Vec3 et Mat4 column-major minimalistes pour ce lab.
class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  sub(v)      { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z) }
  cross(v)    { return new Vec3(
                  this.y * v.z - this.z * v.y,
                  this.z * v.x - this.x * v.z,
                  this.x * v.y - this.y * v.x) }
  dot(v)      { return this.x * v.x + this.y * v.y + this.z * v.z }
  normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1
                return new Vec3(this.x / l, this.y / l, this.z / l) }
}
const UP = new Vec3(0, 1, 0)
const toRad = (deg) => (deg * Math.PI) / 180

// Mat4 column-major. fromRows prend les 16 valeurs EN ORDRE LIGNE (lisible),
// et les range en interne en column-major (comme attend le GPU).
class Mat4 {
  constructor(data) { this.m = data } // 16 floats, column-major
  static fromRows(
    a,b,c,d,  e,f,g,h,  i,j,k,l,  n,o,p,q,
  ) {
    // rangement column-major : colonne 0 = (a,e,i,n), etc.
    return new Mat4([ a,e,i,n,  b,f,j,o,  c,g,k,p,  d,h,l,q ])
  }
  // this * other (compose : applique other puis this)
  multiply(o) {
    const A = this.m, B = o.m, R = new Array(16).fill(0)
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++)
        for (let k = 0; k < 4; k++)
          R[col * 4 + row] += A[k * 4 + row] * B[col * 4 + k]
    return new Mat4(R)
  }
  // multiplie par un vecteur homogène (x,y,z,w) → [x',y',z',w']
  multiplyVec4(x, y, z, w) {
    const m = this.m
    return [
      m[0]*x + m[4]*y + m[8]*z  + m[12]*w,
      m[1]*x + m[5]*y + m[9]*z  + m[13]*w,
      m[2]*x + m[6]*y + m[10]*z + m[14]*w,
      m[3]*x + m[7]*y + m[11]*z + m[15]*w,
    ]
  }
}

// ── À TOI D'ÉCRIRE ──────────────────────────────────────
function lookAt(eye, target, up)               { /* TODO 1 */ }
function perspective(fovY, aspect, near, far)  { /* TODO 2 */ }
function orthographic(size, aspect, near, far) { /* TODO 3 */ }
function projectToScreen(point, mvp, w, h)     { /* TODO 4 */ }

// ── Rendu (TODO 5 : compléter la boucle de projection) ──
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
let ortho = false

function frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  // TODO 5 : caméra drone + grille de marqueurs projetés
  requestAnimationFrame(frame)
}
document.getElementById('mode').onclick = () => { ortho = !ortho }
frame()
```

Ouvre `index.html` via un serveur local (`npx serve` ou l'extension Live Server) — un `file://` direct bloque les modules ES sur certains navigateurs.

---

## Étapes (en friction)

1. **`lookAt`** — calcule `forward = normalize(target - eye)`, `right = normalize(forward × up)`, `newUp = right × forward`. Range-les en lignes avec la translation `-axe·eye`, et **n'oublie pas le `-forward`** sur la 3e ligne.
2. **`perspective`** — `f = 1/tan(fovY/2)`. Remplis la matrice WebGPU : `f/aspect`, `f`, puis `far/(near-far)` et `near·far/(near-far)` sur la 3e ligne, et `-1` en (ligne 3, col 2).
3. **`orthographic`** — version symétrique : `halfH = size/2`, `halfW = halfH·aspect`. Diagonale `1/halfW`, `1/halfH`, `-1/(far-near)`, translation `-near/(far-near)`.
4. **`projectToScreen`** — multiplie le point par `mvp`, **teste `w > 0`** (sinon `return null`), divise par `w` (NDC), puis `x = (ndcX+1)·0.5·w`, `y = (1-ndcY)·0.5·h`. `visible` si `ndcX,ndcY ∈ [-1,1]` et `ndcZ ∈ [0,1]`.
5. **Boucle de rendu** — place la caméra drone (`eye = (0, 40, 40)`, `target = (0,0,0)`), construis `vp = P·V`, projette une grille de points au sol (ex. `x,z ∈ {-20,-10,0,10,20}`, `y=0`) et dessine un cercle à chaque `(x, y)` projeté visible.
6. **Vérifie visuellement** : le point `(0,0,0)` tombe au **centre** ; en perspective la grille se **resserre au fond** ; le bouton bascule en ortho où la grille reste **régulière**.

---

## Corrigé complet commenté

```js
// ── 1. lookAt ───────────────────────────────────────────
function lookAt(eye, target, up) {
  const forward = target.sub(eye).normalize()   // direction visée
  const right   = forward.cross(up).normalize() // axe X caméra
  const newUp   = right.cross(forward)          // axe Y caméra (orthonormé)

  // Rotation = transposée du repère ; translation = -axe·eye.
  // -forward sur la 3e ligne : la caméra regarde vers -Z.
  return Mat4.fromRows(
     right.x,    right.y,    right.z,   -right.dot(eye),
     newUp.x,    newUp.y,    newUp.z,   -newUp.dot(eye),
    -forward.x, -forward.y, -forward.z,  forward.dot(eye),
     0,          0,          0,          1,
  )
}

// ── 2. perspective (WebGPU : z NDC ∈ [0, 1]) ────────────
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2) // focale — contrôle le zoom
  return Mat4.fromRows(
    f / aspect, 0, 0,                  0,
    0,          f, 0,                  0,
    0,          0, far / (near - far), (near * far) / (near - far),
    0,          0, -1,                 0,  // -1 copie -z dans w → perspective divide
  )
}

// ── 3. orthographic (symétrique, WebGPU) ────────────────
function orthographic(size, aspect, near, far) {
  const halfH = size / 2
  const halfW = halfH * aspect
  const fn = far - near
  return Mat4.fromRows(
    1 / halfW, 0,         0,       0,
    0,         1 / halfH, 0,       0,
    0,         0,        -1 / fn, -near / fn, // w reste 1 : pas de perspective
    0,         0,         0,       1,
  )
}

// ── 4. projectToScreen ──────────────────────────────────
function projectToScreen(point, mvp, w, h) {
  const [cx, cy, cz, cw] = mvp.multiplyVec4(point.x, point.y, point.z, 1)

  if (cw <= 0) return null // point derrière la caméra : on ne projette pas

  // Perspective divide → NDC
  const ndcX = cx / cw
  const ndcY = cy / cw
  const ndcZ = cz / cw

  // Viewport transform → pixels (Y inversé : NDC y=1 en haut, pixel y=0 en haut)
  return {
    x: (ndcX + 1) * 0.5 * w,
    y: (1 - ndcY) * 0.5 * h,
    depth: ndcZ,
    visible: ndcX >= -1 && ndcX <= 1 &&
             ndcY >= -1 && ndcY <= 1 &&
             ndcZ >= 0  && ndcZ <= 1,
  }
}

// ── 5. Rendu : caméra drone + grille de marqueurs ───────
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
let ortho = false

// Marqueurs = sorties de la famille, posées au sol (y = 0)
const markers = []
for (let x = -20; x <= 20; x += 10)
  for (let z = -20; z <= 20; z += 10)
    markers.push(new Vec3(x, 0, z))

function frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const w = canvas.width, h = canvas.height

  // Caméra drone : en hauteur, en recul, regarde le centre
  const view = lookAt(new Vec3(0, 40, 40), new Vec3(0, 0, 0), UP)
  const aspect = w / h
  const proj = ortho
    ? orthographic(90, aspect, 0.1, 500)
    : perspective(toRad(60), aspect, 0.1, 500)
  const vp = proj.multiply(view) // MVP = P·V (pas de Model : marqueurs déjà en monde)

  for (const marker of markers) {
    const p = projectToScreen(marker, vp, w, h)
    if (!p || !p.visible) continue

    // La profondeur module la taille (feedback visuel de la perspective)
    const r = ortho ? 5 : 5 + (1 - p.depth) * 6
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#38bdf8'
    ctx.fill()
  }

  // Repère : le centre (0,0,0) doit tomber au centre du canvas
  const center = projectToScreen(new Vec3(0, 0, 0), vp, w, h)
  if (center) {
    ctx.strokeStyle = '#f97316'
    ctx.strokeRect(center.x - 8, center.y - 8, 16, 16)
  }

  requestAnimationFrame(frame)
}

document.getElementById('mode').onclick = () => { ortho = !ortho }
frame()
```

**Pourquoi ce corrigé est correct :**

- `lookAt` produit un repère orthonormé et l'inverse directement (transposée de la rotation + translation `-axe·eye`). Le `-forward` respecte la convention « caméra vers -Z ».
- `perspective` remplit la matrice WebGPU : le `-1` en (ligne 3, col 2) copie `-z` dans `w`, ce qui déclenche le perspective divide → la grille se resserre au loin.
- `orthographic` laisse `w = 1` : aucun rétrécissement, la grille reste régulière.
- `projectToScreen` teste `cw > 0` avant le divide (points derrière la caméra écartés) et inverse l'axe Y au viewport transform.
- **Oracle visuel** : le carré orange (centre monde) tombe au centre du canvas ; en perspective les cercles du fond sont plus petits et plus serrés, en ortho ils sont réguliers.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées — sans rouvrir ce corrigé ni le module 03 :**

1. Reproduis les 4 fonctions **de mémoire, en 30 minutes**.
2. Ajoute une **étiquette texte** au-dessus de chaque marqueur visible : `ctx.fillText('Sortie', p.x, p.y - 12)` — c'est exactement le cas « étiquette HTML » de TribuZen, mais dessiné sur le canvas.
3. Fais **orbiter la caméra** : `eye = (40·sin(t), 40, 40·cos(t))` avec `t` qui avance à chaque frame. Vérifie que les étiquettes suivent bien leurs marqueurs quand la caméra tourne.
4. **Bonus discrimination** : mets volontairement `+forward` au lieu de `-forward` dans `lookAt` et observe l'écran se vider — puis corrige. Ancre le piège #1.

**Critère de réussite :** la caméra orbite, les étiquettes restent collées aux marqueurs, et le passage perspective ↔ ortho fonctionne toujours.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce code devient la caméra réutilisable de la carte des sorties :

```
tribuzen/
  src/
    three/
      OutingsMapCamera.ts   ← lookAt + perspective + projectToScreen
      OutingsMinimap.ts      ← orthographic (aperçu vue de dessus)
```

**Différences par rapport au lab :**

- `Vec3`/`Mat4` viendront de la lib math du projet (ou `wgpu-matrix`) plutôt que de la version minimaliste du starter — l'API `lookAt`/`perspective`/`projectToScreen` reste la même.
- Les marqueurs viendront de la vraie liste des sorties (`Outing[]` depuis l'API), pas d'une grille en dur.
- Les étiquettes seront de vrais `<div>` HTML positionnés en overlay via `projectToScreen`, pas du `fillText` sur canvas — la logique de projection est identique.
- La projection alimentera le vertex shader WGSL (module 10) : `MVP` passé en uniform, en gardant la convention WebGPU `z ∈ [0, 1]`.

**Commit cible :**
```
feat(map): caméra drone carte des sorties — lookAt + perspective/ortho + projection étiquettes
```
