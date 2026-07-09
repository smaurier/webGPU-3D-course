# Lab 02 — Transformations et quaternions

> **Outcome :** à la fin, tu sais composer une model matrix SRT pour placer un objet dans le monde, puis orienter et interpoler cet objet avec un quaternion (axe-angle + slerp), le tout exécuté dans un navigateur réel.
> **Vrai outil :** navigateur (Chrome) + un module ES `<script type="module">` — aucun harnais, aucun framework. Tu observes les résultats dans la console DevTools et sur un `<canvas>` 2D qui projette le globe.
> **Feedback :** le coach valide en session (pas de test-runner auto-correcteur). Le canvas et la console sont l'oracle.

---

## Énoncé

Tu construis le cœur mathématique du **globe des sorties de la famille** de TribuZen, en isolé, sans Three.js ni WebGPU (ça vient plus tard). Deux livrables :

1. **`placePin(yaw, pitch, scale)`** — retourne la **model matrix** (T·R·S) qui pose un pin à la surface d'un globe unitaire, à la longitude `yaw` et latitude `pitch`, réduit au facteur `scale`.
2. **Une orientation de globe par quaternion** — l'utilisateur tape un pin ; le globe **slerp** de son orientation courante vers celle qui amène le pin face à la caméra. Tu affiches l'animation sur un `<canvas>` : les pins doivent glisser en douceur sur l'arc le plus court, même pour un pin proche du pôle (pitch ≈ 80°), **sans gimbal lock**.

**Pas de gap-fill.** Tu écris `Mat4`, `Vec3` et `Quat` toi-même (minimal), à partir du starter ci-dessous.

### Starter minimal

Crée `lab-02.html` et ouvre-le dans Chrome. Le squelette fournit le canvas et la boucle ; **à toi** de remplir `Vec3`, `Mat4`, `Quat`, `placePin` et l'orientation cible.

```html
<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Lab 02 — transformations & quaternions</title></head>
<body>
<canvas id="c" width="400" height="400" style="border:1px solid #ccc"></canvas>
<script type="module">
const rad = (d) => (d * Math.PI) / 180

// ── À CONSTRUIRE : Vec3 (add, scale, cross, normalize, hypot length) ──
class Vec3 { /* ... */ }

// ── À CONSTRUIRE : Mat4 column-major (identity, multiply, transformPoint,
//    translationMatrix, scaleMatrix, rotationY, rotationX) ──
class Mat4 { /* ... */ }

// ── À CONSTRUIRE : Quat (fromAxisAngle, multiply, normalize, dot,
//    rotateVector, slerp) ──
class Quat { /* ... */ }

// ── LIVRABLE 1 : model matrix SRT plaçant un pin sur le globe unitaire ──
function placePin(yaw, pitch, scale) {
  // TODO : T · R · S. Position surface = rotation appliquée à (0,0,1).
}

// ── LIVRABLE 2 : orientation du globe + animation slerp ──
const pins = [ /* {yaw, pitch} pour quelques sorties */ ]
let globe = Quat.IDENTITY
let cible = Quat.IDENTITY

const ctx = document.getElementById('c').getContext('2d')
function project(v) { // globe unitaire -> écran 400x400 (projection orthographique simple)
  return [200 + v.x * 180, 200 - v.y * 180, v.z] // z pour le back-face
}
function draw() {
  globe = globe.slerp(cible, 0.08) // slerp un pas par frame
  ctx.clearRect(0, 0, 400, 400)
  for (const p of pins) {
    // direction du pin dans l'espace modèle, tournée par l'orientation du globe
    const dir = globe.rotateVector(new Vec3(Math.sin(rad(p.yaw)), Math.sin(rad(p.pitch)), Math.cos(rad(p.yaw))).normalize())
    const [x, y, z] = project(dir)
    ctx.fillStyle = z >= 0 ? '#2563eb' : '#cbd5e1' // face avant / arrière
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill()
  }
  requestAnimationFrame(draw)
}
// clic : viser le premier pin (à toi de calculer `cible`)
document.getElementById('c').onclick = () => { /* TODO : cible = quaternion vers pins[0] */ }
draw()
</script>
</body>
</html>
```

---

## Étapes (en friction)

1. **Écris `Vec3`** minimal : `add`, `scale`, `cross`, `normalize`, `length`.
2. **Écris `Mat4`** column-major : `identity`, `multiply`, `transformPoint`, plus `translationMatrix`, `scaleMatrix`, `rotationY`, `rotationX`. Vérifie `rotationY(π/2)` sur `(0,0,1)` → `(1,0,0)`.
3. **Implémente `placePin(yaw, pitch, scale)`** en **T·R·S**. La position de surface = rotation (yaw autour Y, pitch autour X) appliquée à `(0,0,1)`. Vérifie dans la console que le sommet `(0,0,0)` du pin atterrit bien sur la sphère unité (`length ≈ 1`).
4. **Casse volontairement l'ordre** : compose `S·R·T` et observe le pin s'enfoncer/déraper. Reviens à `T·R·S`. (Ancrage du piège #1.)
5. **Écris `Quat`** : `fromAxisAngle` (attention au **demi-angle**), `multiply`, `dot`, `normalize`, `rotateVector`, `slerp` (avec les **deux garde-fous** : signe + nlerp).
6. **Renseigne `pins`** (4-5 sorties, dont une à `pitch: 80`) et calcule `cible` au clic : le quaternion qui amène `pins[0]` face caméra.
7. **Observe l'animation** : au clic, les pins glissent en douceur. Vérifie que le pin à `pitch:80` ne provoque **aucun saut** (ce serait le gimbal lock si tu avais utilisé des angles d'Euler).
8. **Cas limite** : clique deux pins opposés (yaw 0 puis yaw 170) et confirme que le globe prend l'**arc le plus court** grâce au test `dot < 0` dans slerp.

---

## Corrigé complet commenté

```html
<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Lab 02 — corrigé</title></head>
<body>
<canvas id="c" width="400" height="400" style="border:1px solid #ccc"></canvas>
<p id="log" style="font-family:monospace"></p>
<script type="module">
const rad = (d) => (d * Math.PI) / 180

// ── Vec3 minimal ────────────────────────────────────────────────
class Vec3 {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z }
  add(o)   { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z) }
  scale(s) { return new Vec3(this.x * s, this.y * s, this.z * s) }
  cross(o) {
    return new Vec3(
      this.y * o.z - this.z * o.y,
      this.z * o.x - this.x * o.z,
      this.x * o.y - this.y * o.x,
    )
  }
  length() { return Math.hypot(this.x, this.y, this.z) }
  normalize() { const l = this.length() || 1; return this.scale(1 / l) }
  toString() { return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})` }
}

// ── Mat4 column-major : data[col*4 + row] ───────────────────────
class Mat4 {
  constructor(data) { this.data = data }
  static identity() {
    return new Mat4([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
  }
  // this * o  (this appliqué APRÈS o sur un vecteur)
  multiply(o) {
    const a = this.data, b = o.data, r = new Array(16).fill(0)
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 4; row++)
        for (let k = 0; k < 4; k++)
          r[col*4 + row] += a[k*4 + row] * b[col*4 + k]
    return new Mat4(r)
  }
  // point homogène w=1
  transformPoint(v) {
    const d = this.data
    return new Vec3(
      d[0]*v.x + d[4]*v.y + d[8]*v.z  + d[12],
      d[1]*v.x + d[5]*v.y + d[9]*v.z  + d[13],
      d[2]*v.x + d[6]*v.y + d[10]*v.z + d[14],
    )
  }
}
function translationMatrix(tx, ty, tz) {
  const m = Mat4.identity(); m.data[12] = tx; m.data[13] = ty; m.data[14] = tz; return m
}
function scaleMatrix(sx, sy, sz) {
  const m = Mat4.identity(); m.data[0] = sx; m.data[5] = sy; m.data[10] = sz; return m
}
function rotationY(t) {
  const c = Math.cos(t), s = Math.sin(t), m = Mat4.identity()
  m.data[0] = c;  m.data[8] = s
  m.data[2] = -s; m.data[10] = c
  return m
}
function rotationX(t) {
  const c = Math.cos(t), s = Math.sin(t), m = Mat4.identity()
  m.data[5] = c;  m.data[9] = -s
  m.data[6] = s;  m.data[10] = c
  return m
}

// ── Quat ─────────────────────────────────────────────────────────
class Quat {
  constructor(w, x, y, z) { this.w = w; this.x = x; this.y = y; this.z = z }
  static get IDENTITY() { return new Quat(1, 0, 0, 0) }
  static fromAxisAngle(axis, theta) {
    const h = theta / 2, s = Math.sin(h), n = axis.normalize() // DEMI-angle
    return new Quat(Math.cos(h), n.x*s, n.y*s, n.z*s)
  }
  length() { return Math.hypot(this.w, this.x, this.y, this.z) }
  normalize() { const l = this.length() || 1; return new Quat(this.w/l, this.x/l, this.y/l, this.z/l) }
  dot(o) { return this.w*o.w + this.x*o.x + this.y*o.y + this.z*o.z }
  multiply(o) {
    return new Quat(
      this.w*o.w - this.x*o.x - this.y*o.y - this.z*o.z,
      this.w*o.x + this.x*o.w + this.y*o.z - this.z*o.y,
      this.w*o.y - this.x*o.z + this.y*o.w + this.z*o.x,
      this.w*o.z + this.x*o.y - this.y*o.x + this.z*o.w,
    )
  }
  // q·v·q⁻¹ optimisé
  rotateVector(v) {
    const u = new Vec3(this.x, this.y, this.z)
    const uv = u.cross(v), uuv = u.cross(uv)
    return v.add(uv.scale(2 * this.w)).add(uuv.scale(2))
  }
  slerp(o, t) {
    let dot = this.dot(o), target = o
    if (dot < 0) {                       // garde-fou 1 : arc le plus court
      target = new Quat(-o.w, -o.x, -o.y, -o.z); dot = -dot
    }
    if (dot > 0.9995) {                  // garde-fou 2 : nlerp si quasi colinéaires
      return new Quat(
        this.w + t*(target.w - this.w),
        this.x + t*(target.x - this.x),
        this.y + t*(target.y - this.y),
        this.z + t*(target.z - this.z),
      ).normalize()
    }
    const omega = Math.acos(dot), sinO = Math.sin(omega)
    const s0 = Math.sin((1 - t) * omega) / sinO
    const s1 = Math.sin(t * omega) / sinO
    return new Quat(
      s0*this.w + s1*target.w, s0*this.x + s1*target.x,
      s0*this.y + s1*target.y, s0*this.z + s1*target.z,
    )
  }
}

// ── LIVRABLE 1 : model matrix SRT ───────────────────────────────
function placePin(yaw, pitch, scale) {
  const R = rotationY(rad(yaw)).multiply(rotationX(rad(pitch)))
  // Position de surface = R appliquée au pôle avant (0,0,1) du globe unité
  const pos = R.transformPoint(new Vec3(0, 0, 1))
  const T = translationMatrix(pos.x, pos.y, pos.z)
  const S = scaleMatrix(scale, scale, scale)
  return T.multiply(R).multiply(S)          // T · R · S
}

// ── LIVRABLE 2 : orientation du globe + slerp ───────────────────
const pins = [
  { yaw:   0, pitch:  0 },
  { yaw:  40, pitch: 20 },
  { yaw: 170, pitch: 10 },
  { yaw:  90, pitch: 80 }, // proche du pôle : piège à gimbal lock
]
// orientation modèle d'un pin = direction unitaire sur la sphère
function pinDir(p) {
  return rotationY(rad(p.yaw)).multiply(rotationX(rad(p.pitch)))
    .transformPoint(new Vec3(0, 0, 1)).normalize()
}

let globe = Quat.IDENTITY
let cible = Quat.IDENTITY
const ctx = document.getElementById('c').getContext('2d')
const log = document.getElementById('log')

function project(v) { return [200 + v.x*180, 200 - v.y*180, v.z] }

function draw() {
  globe = globe.slerp(cible, 0.08)          // un pas de slerp par frame
  ctx.clearRect(0, 0, 400, 400)
  for (const p of pins) {
    const dir = globe.rotateVector(pinDir(p))
    const [x, y, z] = project(dir)
    ctx.fillStyle = z >= 0 ? '#2563eb' : '#cbd5e1'
    ctx.beginPath(); ctx.arc(x, y, z >= 0 ? 7 : 5, 0, Math.PI*2); ctx.fill()
  }
  requestAnimationFrame(draw)
}

let idx = 0
document.getElementById('c').onclick = () => {
  idx = (idx + 1) % pins.length
  const p = pins[idx]
  // cible : orientation qui amène pinDir(p) sur l'axe caméra (0,0,1)
  const from = pinDir(p), to = new Vec3(0, 0, 1)
  const axis = from.cross(to)
  const angle = Math.acos(Math.max(-1, Math.min(1, from.x*to.x + from.y*to.y + from.z*to.z)))
  cible = axis.length() < 1e-6 ? Quat.IDENTITY : Quat.fromAxisAngle(axis, angle)
  log.textContent = `cible = pin[${idx}] (yaw ${p.yaw}, pitch ${p.pitch})`
}

// ── Vérifs console (livrable 1) ─────────────────────────────────
const m = placePin(40, 0, 0.2)
const base = m.transformPoint(new Vec3(0, 0, 0))
console.log('pin base sur surface ?', base.toString(), '| length =', base.length().toFixed(3)) // ≈ 1.000
draw()
</script>
</body>
</html>
```

**Pourquoi ce corrigé est correct :**
- `placePin` compose **T·R·S** : le pin est réduit et orienté à l'origine, puis translaté à sa position de surface calculée par la même rotation appliquée au pôle `(0,0,1)`. Le sommet local `(0,0,0)` atterrit à `length ≈ 1` (sur la sphère unité) — la vérif console le confirme.
- L'orientation du globe est un **quaternion** ; `slerp(cible, 0.08)` par frame donne une convergence fluide à vitesse angulaire régulière.
- Le pin à `pitch:80` ne provoque aucun saut : aucune reconstruction d'angles d'Euler n'a lieu, donc **pas de gimbal lock**.
- Le test `dot < 0` dans slerp garantit l'**arc le plus court** entre deux pins opposés (yaw 0 → 170).

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées, en 30 minutes, sans rouvrir ce corrigé ni le module 02 :**

1. Réécris `Quat` et `slerp` **de mémoire** (les deux garde-fous obligatoires).
2. Ajoute une **rotation continue** du globe même sans clic : compose l'orientation courante avec `Quat.fromAxisAngle(new Vec3(0,1,0), rad(0.3))` à chaque frame — le globe tourne lentement sur lui-même. **Renormalise** l'orientation toutes les ~100 frames (piège #5 du module).
3. Contrainte : **interdit d'utiliser une seule matrice de rotation** pour l'orientation du globe — tout passe par les quaternions.

**Critère de réussite :** le globe tourne en continu sans dérive numérique visible, et un clic slerp toujours proprement vers le pin visé par-dessus la rotation de fond.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, cette logique alimente la couche visualisation du globe :

```
tribuzen/
  src/
    viz/
      math/
        Vec3.ts
        Mat4.ts
        Quat.ts            ← fromAxisAngle, multiply, slerp
      globe/
        placePin.ts        ← model matrix SRT (livrable 1)
        globeOrientation.ts ← quaternion + slerp au clic (livrable 2)
```

**Différences par rapport au lab :**
- Le rendu final passera par **Three.js / WebGPU** (modules 09+), pas un canvas 2D — mais `Quat` et `placePin` restent identiques ; seule la couche de rendu change.
- Les pins viendront de l'API des sorties (`GET /families/:id/outings`), typés `Outing[]`, au lieu d'un tableau local.
- `Quat` sera probablement remplacé par `THREE.Quaternion` en prod — mais l'avoir écrit à la main ici garantit que tu comprends `slerp` et le gimbal lock quand tu débogues Three.js.

**Commit cible :**
```
feat(viz): globe des sorties — placePin (model matrix SRT) + orientation quaternion/slerp sans gimbal lock
```
