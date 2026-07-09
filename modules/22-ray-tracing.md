---
titre: Ray tracing et path tracing
cours: 20-webgpu-3d
notions:
  - "rasterisation vs ray tracing (deux philosophies de rendu)"
  - "rayon paramétrique P(t) = O + t·D"
  - "intersection rayon-sphère (équation quadratique, discriminant)"
  - "intersection rayon-triangle (Möller-Trumbore, coordonnées barycentriques)"
  - "réflexion (R = D - 2(D·N)N) et réfraction (loi de Snell, Fresnel-Schlick)"
  - "Whitted ray tracing (récursif : ombres, réflexions, réfractions)"
  - "path tracing et rendering equation (Kajiya)"
  - "intégration de Monte Carlo (estimateur, erreur en 1/sqrt(N))"
  - "échantillonnage cosine-weighted de l'hémisphère"
  - "Russian roulette (terminaison probabiliste des chemins)"
  - "implémentation en fragment/compute shader WebGPU + accumulation temporelle"
  - "BVH (bounding volume hierarchy) — survol de l'accélération"
outcomes:
  - sait expliquer la différence entre rasterisation et ray tracing et quand utiliser chacun
  - sait dériver et implémenter l'intersection rayon-sphère et rayon-triangle
  - sait calculer une direction réfléchie et réfractée (Snell, Fresnel-Schlick)
  - sait expliquer le path tracing comme estimation Monte Carlo de la rendering equation
  - sait écrire un ray tracer de sphères en compute shader WGSL avec accumulation temporelle
  - sait expliquer à quoi sert une BVH et pourquoi la force brute ne passe pas à l'échelle
prerequis:
  - "00-prerequis-et-introduction (pipeline, GPU, coordonnées 3D)"
  - "01-algebre-lineaire-pour-la-3d (produit scalaire, produit vectoriel, normalisation)"
  - "05-lumiere-materiaux-et-pbr (BRDF, albedo, éclairage diffus/spéculaire)"
  - "11-compute-shaders-et-gpgpu (compute WGSL, workgroups, storage buffers, dispatch)"
next: 23-global-illumination-et-screen-space
libs: []
tribuzen: "moteur 3D TribuZen — rendu photoréaliste d'un objet-souvenir de sortie (galet, trophée, coquillage) en ray tracing progressif : réflexions et ombres douces exactes pour un mode carte-souvenir premium"
last-reviewed: 2026-07
---

# Ray tracing et path tracing

> **Outcomes — tu sauras FAIRE :** distinguer rasterisation et ray tracing, dériver et coder les intersections rayon-sphère et rayon-triangle, calculer réflexions/réfractions (Snell, Fresnel-Schlick), expliquer le path tracing comme estimation Monte Carlo de la rendering equation, écrire un ray tracer de sphères en compute shader WGSL avec accumulation temporelle, et expliquer le rôle d'une BVH.
> **Difficulté :** :star::star::star::star::star:
>
> **Portée :** on renverse la logique du cours. Jusqu'ici (modules 04-21) on **rasterisait** : projeter la géométrie, colorer les pixels couverts. Ici, on **lance des rayons** depuis la caméra et on simule le trajet de la lumière. La BVH est **survolée** (structure d'accélération) : sa construction fine est hors périmètre. L'illumination globale temps réel approchée (SSAO, SSR) est le sujet du **module 23**.

## 1. Cas concret d'abord

TribuZen veut un **mode carte-souvenir premium** : à la fin d'une sortie, la famille rapporte un objet — un galet poli, un coquillage, un petit trophée. On le scanne, et TribuZen en affiche un **rendu photoréaliste** : le galet mouillé qui **réfléchit** le ciel, l'ombre **douce** qu'il projette, la lumière qui **traverse** un morceau de verre de mer. Pas un rendu « jeu vidéo » plat : quelque chose qui a l'air *vrai*.

Le réflexe « rasterisation » (tout le cours jusqu'ici) coince :

```typescript
// ❌ Avec la rasterisation classique, ces effets ne sont PAS natifs :
scene.add(objetSouvenir);   // un mesh, un material PBR
renderer.render(scene, camera);
// - Réflexion du ciel sur le galet ? → il faut une cubemap approximative (SSR/env map)
// - Ombre douce ? → shadow map + PCF, avec artefacts de résolution
// - Réfraction dans le verre ? → hack screen-space, faux dès qu'on tourne
```

Chaque effet réaliste devient une **technique séparée**, approximative, à empiler. La rasterisation dessine la géométrie *sans savoir ce que les autres objets reflètent* : les rebonds de lumière ne sont pas dans son modèle.

Le **ray tracing** inverse la question. Au lieu de projeter les objets sur l'écran, on part de **chaque pixel** et on suit un rayon *à l'envers* — de l'œil vers la scène, puis de rebond en rebond vers les sources de lumière. Réflexions, réfractions, ombres douces : elles **tombent naturellement** du modèle, parce qu'on simule le trajet réel de la lumière.

Ce module pose ce mécanisme, de l'intersection rayon-sphère jusqu'à un **path tracer** qui tourne dans le navigateur en compute shader WebGPU. On rend d'abord une scène de sphères (le galet ≈ une sphère), progressivement, image après image.

---

## 2. Théorie complète, concise

### 2.1 Deux philosophies : rasterisation vs ray tracing

La **rasterisation** parcourt la **géométrie** : pour chaque triangle, on le projette à l'écran et on colore les pixels couverts. C'est ce que font WebGL/WebGPU par défaut (modules 04-21). Rapide, mais aveugle aux interactions entre objets.

Le **ray tracing** parcourt les **pixels** : pour chaque pixel, on lance un rayon dans la scène, on trouve la première surface touchée, on calcule sa couleur — en lançant au besoin d'autres rayons (ombre, réflexion, réfraction).

| Critère | Rasterisation | Ray tracing |
|---|---|---|
| Boucle | pour chaque triangle | pour chaque pixel |
| Coût | O(triangles × pixels couverts) | O(pixels × coût scène) |
| Réflexions/réfractions | approximées (SSR, cubemaps) | exactes |
| Ombres | shadow maps (artefacts) | naturellement douces |
| Performance web | temps réel 60 fps | offline / progressif / hybride |
| Cas TribuZen | feed, carte, UI 3D | rendu premium de l'objet-souvenir |

Ce ne sont pas des rivaux : les moteurs modernes sont **hybrides** (rasteriser la géométrie, ray-tracer seulement ombres/réflexions). WebGPU en 2026 n'expose **pas** encore de ray tracing matériel (RT cores) — on émule tout en compute shader.

### 2.2 Le rayon et les rayons primaires

Un **rayon** est une demi-droite paramétrique :

```
P(t) = O + t·D     avec t > 0
```

`O` = origine (la caméra, ou le point du dernier rebond), `D` = direction **normalisée**, `t` = distance le long du rayon. On cherche toujours le **plus petit `t > 0`** : la surface la plus proche.

Pour chaque pixel `(x, y)`, on génère un **rayon primaire** partant de la caméra et passant par ce pixel :

```typescript
function generatePrimaryRay(
  px: number, py: number, width: number, height: number,
  camPos: Vec3, camForward: Vec3, camRight: Vec3, camUp: Vec3,
  tanHalfFov: number
): Ray {
  const aspect = width / height;
  // pixel → NDC [-1, 1], + jitter 0.5 pour viser le centre du pixel
  const ndcX = (2 * (px + 0.5) / width - 1) * aspect * tanHalfFov;
  const ndcY = (1 - 2 * (py + 0.5) / height) * tanHalfFov;
  // combiner le repère caméra
  const direction = normalize(add3(
    scale3(camRight, ndcX),
    scale3(camUp, ndcY),
    camForward,
  ));
  return { origin: camPos, direction };
}
```

### 2.3 Intersection rayon-sphère

Le cas fondateur (et le galet-souvenir). Une sphère de centre `C`, rayon `r` : les points `P` tels que `|P - C|² = r²`. On substitue `P = O + t·D` :

```
|O + t·D - C|² = r²

Poser L = O - C :
|L + t·D|² = r²
(D·D)·t² + 2(D·L)·t + (L·L - r²) = 0
```

C'est une **équation quadratique** `a·t² + b·t + c = 0` avec :

```
a = D·D = 1     (D normalisée)
b = 2·(D·L)
c = L·L - r²

Discriminant  Δ = b² - 4ac
  Δ < 0  → pas d'intersection (le rayon manque la sphère)
  Δ = 0  → tangent (un point)
  Δ > 0  → deux intersections (entrée + sortie)

  t = (-b ± √Δ) / (2a)     → on prend le plus petit t > 0
```

Implémentation TypeScript (formule vérifiée sur *Ray Tracing in One Weekend* et iquilezles.org/intersectors) :

```typescript
// Retourne le t de la 1re intersection, ou null
function intersectSphere(ray: Ray, center: Vec3, radius: number): number | null {
  const L = sub3(ray.origin, center);
  const b = 2 * dot3(ray.direction, L);   // a = 1 (direction normalisée)
  const c = dot3(L, L) - radius * radius;
  const disc = b * b - 4 * c;             // Δ, avec a = 1
  if (disc < 0) return null;              // manque la sphère
  const sqrtD = Math.sqrt(disc);
  let t = (-b - sqrtD) / 2;               // racine la plus proche
  if (t < 0.001) {                        // derrière l'origine → tenter l'autre
    t = (-b + sqrtD) / 2;
    if (t < 0.001) return null;
  }
  return t;                               // normale au point : normalize(P - C)
}
```

L'**epsilon** `0.001` évite la *self-intersection* : sans lui, un rayon relancé depuis un point touche à nouveau sa propre surface à `t ≈ 0`.

### 2.4 Intersection rayon-triangle (Möller-Trumbore)

Les vrais meshes sont des triangles. L'algorithme standard est **Möller-Trumbore** : il calcule d'un coup `t` et les **coordonnées barycentriques** `(u, v)` du point d'impact.

```
Triangle V0, V1, V2. Un point interne :
  P = (1 - u - v)·V0 + u·V1 + v·V2     avec u ≥ 0, v ≥ 0, u + v ≤ 1

On résout O + t·D = P par la règle de Cramer (produits vectoriels).
Les tests u/v filtrent au passage les points hors du triangle.
```

```wgsl
struct TriangleHit { t: f32, u: f32, v: f32, hit: bool, }

fn intersect_triangle(ray: Ray, v0: vec3f, v1: vec3f, v2: vec3f) -> TriangleHit {
  let EPSILON = 0.000001;
  let edge1 = v1 - v0;
  let edge2 = v2 - v0;
  let pvec = cross(ray.direction, edge2);
  let det = dot(edge1, pvec);
  if (abs(det) < EPSILON) { return TriangleHit(0.0, 0.0, 0.0, false); } // parallèle

  let inv_det = 1.0 / det;
  let tvec = ray.origin - v0;
  let u = dot(tvec, pvec) * inv_det;
  if (u < 0.0 || u > 1.0) { return TriangleHit(0.0, 0.0, 0.0, false); }

  let qvec = cross(tvec, edge1);
  let v = dot(ray.direction, qvec) * inv_det;
  if (v < 0.0 || u + v > 1.0) { return TriangleHit(0.0, 0.0, 0.0, false); }

  let t = dot(edge2, qvec) * inv_det;
  if (t < EPSILON) { return TriangleHit(0.0, 0.0, 0.0, false); }
  return TriangleHit(t, u, v, true);
}
```

Les `(u, v)` servent ensuite à **interpoler** normale, UV et couleur du point d'impact à partir des trois sommets.

### 2.5 Réflexion et réfraction

À une intersection, on peut relancer des rayons. La **réflexion** (miroir) suit une formule directe — le rayon rebondit symétriquement à la normale :

```
R = D - 2·(D·N)·N        (D incident, N normale unitaire)
```

La **réfraction** (le rayon *traverse* un matériau transparent) suit la **loi de Snell** `n₁·sin(θ₁) = n₂·sin(θ₂)`. Indices usuels : air ≈ 1.0, eau ≈ 1.33, verre ≈ 1.5, diamant ≈ 2.42.

```wgsl
fn reflect_dir(incident: vec3f, normal: vec3f) -> vec3f {
  return incident - 2.0 * dot(incident, normal) * normal;
}

fn refract_dir(incident: vec3f, normal: vec3f, eta: f32) -> vec3f {
  // eta = n1 / n2
  let cos_i = -dot(incident, normal);
  let sin2_t = eta * eta * (1.0 - cos_i * cos_i);
  if (sin2_t > 1.0) { return reflect_dir(incident, normal); } // réflexion totale interne
  let cos_t = sqrt(1.0 - sin2_t);
  return eta * incident + (eta * cos_i - cos_t) * normal;
}
```

Le partage entre réflexion et réfraction dépend de l'angle : c'est le **coefficient de Fresnel** (un galet mouillé vu de biais réfléchit fort, vu de face réfléchit peu). Approximation de **Schlick** :

```wgsl
fn fresnel_schlick(cos_theta: f32, n1: f32, n2: f32) -> f32 {
  var r0 = (n1 - n2) / (n1 + n2);
  r0 = r0 * r0;
  return r0 + (1.0 - r0) * pow(1.0 - cos_theta, 5.0);
}
```

### 2.6 Whitted ray tracing (récursif)

Le premier ray tracer récursif (**Turner Whitted, 1980**) : à chaque intersection, on ajoute l'**éclairage direct** puis on relance des rayons pour ce qui est *spéculaire* :

- **Shadow ray** vers chaque lumière : s'il rencontre un obstacle avant la lumière, le point est **à l'ombre**.
- **Rayon réfléchi** si le matériau est miroir → couleur récursive.
- **Rayon réfracté** si le matériau est transparent → couleur récursive.

Une **profondeur maximale** (ex. 5) borne la récursion. Whitted rend nettement miroirs et verre, mais **ignore** la lumière qui rebondit sur les surfaces *diffuses* (une pièce rouge ne teinte pas de rouge le plafond blanc). Ce manque, c'est le **path tracing** qui le comble.

### 2.7 Path tracing : la rendering equation et Monte Carlo

Le path tracing intègre la **rendering equation** de **Kajiya (1986)** — l'équation qui décrit *toute* la lumière quittant un point :

```
Lo(p, ωo) = Le(p, ωo) + ∫  fr(p, ωi, ωo)·Li(p, ωi)·cos(θi) dωi
                          Ω

Lo = radiance sortante        Le = émission (surface-lumière)
fr = BRDF (module 05)         Li = radiance incidente
cos(θi) = loi de Lambert      Ω  = hémisphère au-dessus du point
```

Cette intégrale est sur un **hémisphère continu** : pas de solution analytique. Solution : l'**estimation de Monte Carlo** — on échantillonne des directions **au hasard** et on moyenne :

```
∫ f(x) dx  ≈  (1/N) · Σ  f(xi) / p(xi)

N = nombre d'échantillons
xi = direction tirée au hasard
p(xi) = densité de probabilité du tirage
erreur ∝ 1/√N   → convergence LENTE : 4× plus d'échantillons = 2× moins de bruit
```

Concrètement : à chaque rebond, on tire **une** direction aléatoire dans l'hémisphère, on suit le chemin, et on **accumule** beaucoup de chemins par pixel. Peu de chemins → image **bruitée** (grain) ; beaucoup → image propre.

### 2.8 Échantillonnage cosine-weighted et Russian roulette

Deux optimisations rendent le path tracing praticable.

**Cosine-weighted sampling.** Le facteur `cos(θi)` fait que les directions proches de la normale comptent plus. Plutôt que tirer uniformément puis pondérer, on tire **directement** selon une densité en cosinus — les échantillons se concentrent là où ça compte (formule vérifiée, PDF `cos θ / π`) :

```wgsl
fn cosine_sample_hemisphere(r1: f32, r2: f32) -> vec3f {
  let phi = 2.0 * 3.14159265 * r1;
  let cos_theta = sqrt(r2);
  let sin_theta = sqrt(1.0 - r2);
  return vec3f(cos(phi) * sin_theta, cos_theta, sin(phi) * sin_theta); // Y = normale locale
}
```

Pour un matériau **Lambert diffus**, ce choix simplifie magnifiquement le poids du chemin : `BRDF · cos θ / PDF = (albedo/π) · cos θ / (cos θ/π) = albedo`. On multiplie juste le *throughput* par l'albedo à chaque rebond.

**Russian roulette.** Pour éviter des chemins infinis sans biaiser le résultat, à partir du 3ᵉ rebond on **arrête** le chemin avec une probabilité, et on **compense** en divisant le throughput par la probabilité de survie. Les chemins peu contributifs meurent tôt, les importants continuent.

### 2.9 Implémentation WebGPU : compute shader + accumulation temporelle

En WebGPU (pas de RT matériel en 2026), le ray tracer est un **compute shader** : une invocation par pixel (module 11). À chaque frame, chaque pixel tire **un** échantillon supplémentaire, avec un **jitter** aléatoire, et on l'**accumule** dans un buffer — la moyenne converge image après image (*progressive rendering*).

```wgsl
@group(0) @binding(0) var<storage, read_write> accumulation: array<vec4f>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(output_tex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }   // garde-fou (module 11)
  let idx = gid.y * dims.x + gid.x;

  var seed = init_seed(gid.xy, frame_count);
  let jx = random_float(&seed) - 0.5;                    // anti-aliasing par jitter
  let jy = random_float(&seed) - 0.5;
  let ray = generate_ray(f32(gid.x) + jx, f32(gid.y) + jy, dims);

  let sample = path_trace(ray, &seed);                  // 1 échantillon ce frame

  let prev = accumulation[idx];
  let sum = prev.xyz + sample;
  let count = prev.w + 1.0;
  accumulation[idx] = vec4f(sum, count);

  let averaged = sum / count;                           // moyenne accumulée
  let mapped = pow(averaged / (averaged + vec3f(1.0)), vec3f(1.0 / 2.2)); // tonemap + gamma
  textureStore(output_tex, gid.xy, vec4f(mapped, 1.0));
}
```

Un buffer STORAGE ne s'affiche pas directement : un petit **render pass** dessine `output_tex` sur un triangle plein écran (le compute produit l'image, le render l'affiche). Dès que la caméra bouge, on **remet à zéro** l'accumulation (`count = 0`), sinon on mélange deux points de vue.

### 2.10 BVH : pourquoi la force brute ne passe pas (survol)

Tester chaque rayon contre chaque triangle est **O(n)**. Pour 1 M de triangles × 2 M de pixels → ~2 000 milliards de tests : impossible. La solution standard est une **BVH (Bounding Volume Hierarchy)** : un arbre de **boîtes englobantes** (AABB). Chaque nœud interne contient une AABB qui englobe ses enfants ; chaque feuille contient quelques triangles.

Un rayon teste d'abord la grosse boîte : s'il la manque, on **saute tout le sous-arbre**. On descend récursivement — coût **O(log n)** par rayon au lieu de O(n). Le test rayon-AABB (méthode des *slabs*) est très bon marché, et sur GPU on parcourt l'arbre avec une **pile manuelle** (pas de récursion en WGSL).

> **Survol assumé :** la *construction* d'une bonne BVH (heuristique SAH, ordre des splits) et sa traversée GPU optimisée sont un sujet à part entière. Retiens ici **le rôle** : une structure d'accélération qui transforme O(n) en O(log n) et rend le ray tracing de vrais meshes envisageable.

---

## 3. Worked examples

### Exemple 1 — Un rayon touche-t-il le galet ? (sphère, pas à pas)

Caméra en `O = (0, 0, 0)`, rayon vers `D = (0, 0, -1)` (normalisée). Galet = sphère centre `C = (0, 0, -5)`, rayon `r = 1`.

```
L = O - C = (0, 0, 5)
a = 1                            (D normalisée)
b = 2·(D·L) = 2·((0)(0)+(0)(0)+(-1)(5)) = 2·(-5) = -10
c = L·L - r² = 25 - 1 = 24
Δ = b² - 4ac = 100 - 96 = 4  > 0   → deux intersections

t = (-b ± √Δ)/2 = (10 ± 2)/2  → t = 4  ou  t = 6
On garde le plus petit t > 0 : t = 4.
```

Point d'impact `P = O + 4·D = (0, 0, -4)` — la face avant du galet, à 4 unités. Normale `N = normalize(P - C) = normalize((0,0,1)) = (0,0,1)`, elle pointe vers la caméra : cohérent. Si on avait décalé le rayon (`D = (0, 1, 0)`), on obtiendrait `Δ < 0` → le rayon manque le galet, on renvoie la couleur du ciel.

### Exemple 2 — Le cœur d'un path tracer diffus (boucle de rebonds)

Le squelette d'un path tracer pour surfaces diffuses. Chaque itération = un rebond ; `throughput` accumule le poids, `radiance` la couleur.

```wgsl
fn path_trace(initial_ray: Ray, seed: ptr<function, u32>) -> vec3f {
  var throughput = vec3f(1.0);   // poids du chemin (part de lumière transportée)
  var radiance = vec3f(0.0);     // couleur accumulée
  var ray = initial_ray;

  for (var bounce = 0u; bounce < 16u; bounce++) {
    let hit = intersect_scene(ray);
    if (!hit.hit) {
      radiance += throughput * sky_color(ray.direction); // le rayon part au ciel
      break;
    }
    let mat = materials[hit.material_id];
    radiance += throughput * mat.emission;               // surface-lumière ?

    // Russian roulette dès le 3e rebond
    if (bounce >= 3u) {
      let p = min(max(throughput.x, max(throughput.y, throughput.z)), 0.95);
      if (random_float(seed) > p) { break; }             // on tue le chemin
      throughput /= p;                                   // ...et on compense
    }

    // rebond diffus : direction cosine-weighted dans l'hémisphère de la normale
    let dir = sample_hemisphere(hit.normal, random_float(seed), random_float(seed));
    throughput *= mat.albedo;                            // Lambert : BRDF·cos/PDF = albedo
    ray = Ray(hit.point + hit.normal * 0.001, dir);      // relance (+ epsilon anti-self-hit)
  }
  return radiance;
}
```

Points clés : la couleur ne « remonte » que si le chemin **atteint** une source (émission ou ciel) ; sinon il meurt noir. Le `* 0.001` sur la normale évite la self-intersection (même epsilon qu'en 2.3). Un seul appel = **un** échantillon bruité ; c'est l'accumulation sur des centaines de frames (2.9) qui nettoie l'image.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Croire que le ray tracing « remplace » la rasterisation

Faux dans l'usage web/temps réel. Le ray tracing est **coûteux** ; les moteurs modernes sont **hybrides** (rasteriser la géométrie, ray-tracer seulement ombres/réflexions). Et WebGPU en 2026 n'a **pas** de ray tracing matériel : on émule en compute. Le bon mental : le ray tracing est un **complément** pour les effets exacts, pas un remplacement.

### PIÈGE #2 — Oublier l'epsilon sur les rayons relancés

Un rayon réfléchi/réfracté/de rebond part **de la surface elle-même**. Sans décalage (`hit.point + N * 0.001`), il touche à nouveau sa propre surface à `t ≈ 0` : *shadow acne*, points noirs, artefacts. Toujours décaler l'origine d'un petit epsilon le long de la normale.

### PIÈGE #3 — Confondre Whitted et path tracing

Whitted (récursif spéculaire) rend miroirs et verre, mais **ignore l'illumination indirecte diffuse** : un mur rouge ne teinte pas le plafond. Le path tracing (Monte Carlo sur la rendering equation) capture *tous* les rebonds, y compris diffus — au prix du bruit et de la convergence lente. Ce ne sont pas deux versions du même algo : ce sont deux modèles de lumière différents.

### PIÈGE #4 — Attendre une image propre en 1 échantillon

L'erreur Monte Carlo est en `1/√N`. Une image à 1 échantillon/pixel est **très bruitée** — c'est normal, pas un bug. Il faut **accumuler** (des centaines de frames) ou débruiter. Corollaire du `1/√N` : pour **diviser le bruit par 2**, il faut **4×** plus d'échantillons. La convergence est lente par nature.

### PIÈGE #5 — Ne pas remettre l'accumulation à zéro quand la caméra bouge

Le progressive rendering **moyenne** les échantillons dans un buffer. Si la caméra bouge et qu'on **n'efface pas** le buffer (`count = 0`), on moyenne des échantillons de **deux points de vue différents** → image fantôme, traînées. Toute modification de la scène/caméra doit déclencher un reset de l'accumulation.

### PIÈGE #6 — Vouloir tester chaque rayon contre chaque triangle

Sur un vrai mesh, la force brute O(n) est ingérable (milliards de tests). Sans **structure d'accélération** (BVH), un path tracer de meshes ne tourne pas. Une scène de quelques **sphères analytiques** (comme le galet-souvenir) s'en passe ; dès qu'on charge un glTF, la BVH n'est plus optionnelle.

### PIÈGE #7 — Passer `a` variable à la formule de sphère alors que `D` n'est pas normalisée

La simplification `a = 1`, `disc = b² - 4c` (section 2.3) **suppose `D` normalisée**. Si la direction n'est pas unitaire, `a = D·D ≠ 1` et il faut la vraie formule `(-b ± √(b²-4ac))/(2a)`. Le `t` retourné change alors d'échelle. Normaliser `D` en amont, ou garder `a` explicite.

---

## 5. Ancrage TribuZen

Le ray tracing ouvre le **rendu photoréaliste** dans TribuZen — le mode premium « objet-souvenir ».

**Rendu de l'objet-souvenir.** À la clôture d'une sortie, la famille scanne un objet ramené (galet, coquillage, trophée). TribuZen le rend en **path tracing progressif** : le compute shader (section 2.9) accumule les échantillons, l'image se nettoie en une seconde ou deux, et on obtient réflexions et ombres douces **exactes**. Pour une V1, l'objet est approché par une ou deux **sphères analytiques** (galet ≈ sphère) — aucune BVH nécessaire, intersection rayon-sphère directe (2.3).

**Matériaux crédibles.** Galet mouillé = diffus + réflexion Fresnel (2.5) : brillant vu de biais, mat vu de face. Verre de mer = réfraction (loi de Snell). Trophée métallique = miroir spéculaire. Le même path tracer gère les trois via le champ matériau.

**Le mode reste hybride.** Le feed, la carte 3D et l'UI (modules 13-21) restent **rasterisés** à 60 fps. Seule la vue « fiche souvenir », statique, bascule en ray tracing progressif — le bon compromis coût/qualité sur le web.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      raytracing/
        raytracer.wgsl        ← compute : path_trace + intersect_sphere (2.3, exemple 2)
        RayTracer.ts          ← pipeline compute + accumulation + reset caméra (2.9)
        souvenirScene.ts      ← sphères analytiques + matériaux (galet, verre, trophée)
```

> La BVH (pour rendre un vrai mesh glTF de l'objet plutôt que des sphères) et l'illumination globale temps réel approchée (SSAO/SSR pour le mode carte rasterisé) sont approfondies au **module 23**. Ici, on pose le ray tracing : rayons, intersections, path tracing, accumulation.

---

## 6. Points clés

1. Rasterisation = boucle sur la **géométrie** (rapide, effets approximés) ; ray tracing = boucle sur les **pixels** (réflexions/réfractions/ombres exactes, coûteux). Les moteurs réels sont **hybrides**.
2. Un rayon est `P(t) = O + t·D`, `D` normalisée ; on cherche le plus petit `t > 0`.
3. Intersection rayon-sphère = quadratique `a·t² + b·t + c = 0` avec `a=1`, `b=2(D·L)`, `c=L·L-r²`, `L=O-C` ; `Δ<0` = manque, sinon `t=(-b-√Δ)/2`.
4. Intersection rayon-triangle = **Möller-Trumbore** : `t` + coordonnées barycentriques `(u,v)` pour interpoler normale/UV.
5. Réflexion `R = D - 2(D·N)N` ; réfraction = loi de **Snell** ; répartition = **Fresnel** (Schlick).
6. **Whitted** = récursif spéculaire (ombres, miroirs, verre) mais **ignore** le diffus indirect.
7. **Path tracing** = estimation **Monte Carlo** de la **rendering equation** (Kajiya) ; erreur en `1/√N` (convergence lente).
8. **Cosine-weighted sampling** → pour Lambert, throughput `*= albedo` ; **Russian roulette** borne les chemins sans biais.
9. En WebGPU : **compute shader**, 1 pixel/invocation, 1 échantillon/frame **accumulé** ; reset au moindre mouvement caméra ; render pass pour afficher.
10. **BVH** = arbre d'AABB, O(n) → O(log n) : indispensable pour les meshes, superflu pour quelques sphères analytiques.

---

## 7. Seeds Anki

```
Quelle est la différence fondamentale entre rasterisation et ray tracing ?|La rasterisation boucle sur la GÉOMÉTRIE (projeter chaque triangle, colorer les pixels couverts) : rapide, mais réflexions/réfractions/ombres sont approximées. Le ray tracing boucle sur les PIXELS (lancer un rayon par pixel, suivre les rebonds) : réflexions/réfractions/ombres exactes, mais coûteux. Les moteurs réels sont hybrides.
Comment dérive-t-on l'intersection rayon-sphère et quels sont a, b, c ?|On substitue P = O + t·D dans |P-C|² = r². Avec L = O-C on obtient a·t²+b·t+c=0 où a = D·D = 1 (D normalisée), b = 2(D·L), c = L·L - r². Discriminant Δ = b²-4ac : Δ<0 manque, Δ=0 tangent, Δ>0 deux points. On garde le plus petit t>0 : t=(-b-√Δ)/2.
Que calcule l'algorithme de Möller-Trumbore ?|L'intersection rayon-triangle : d'un coup le paramètre t ET les coordonnées barycentriques (u,v) du point d'impact. Les tests u≥0, v≥0, u+v≤1 filtrent les points hors triangle. Les (u,v) servent à interpoler normale, UV et couleur depuis les 3 sommets.
Quelle est la formule de la direction réfléchie, et sur quoi repose la réfraction ?|Réflexion : R = D - 2(D·N)N (D incident, N normale unitaire). Réfraction : loi de Snell n1·sin(θ1) = n2·sin(θ2) ; répartition réflexion/réfraction selon l'angle = coefficient de Fresnel (approximation de Schlick). Réflexion totale interne si sin²(θt) > 1.
Qu'est-ce que le path tracing par rapport au Whitted ray tracing ?|Whitted (1980) est récursif spéculaire : ombres, réflexions miroir, réfractions — mais IGNORE l'illumination indirecte diffuse (un mur rouge ne teinte pas le plafond). Le path tracing intègre la rendering equation de Kajiya par Monte Carlo et capture TOUS les rebonds (dont diffus), au prix du bruit et d'une convergence lente.
Pourquoi une image path-tracée est-elle bruitée et comment converge-t-elle ?|L'estimateur Monte Carlo a une erreur ∝ 1/√N (N = échantillons par pixel). 1 échantillon = très bruité (normal, pas un bug). Pour diviser le bruit par 2, il faut 4× plus d'échantillons. On accumule des centaines de frames (progressive rendering) ou on débruite.
Comment implémente-t-on un ray tracer en WebGPU en 2026 ?|En COMPUTE SHADER (pas de ray tracing matériel exposé en WebGPU) : 1 invocation par pixel, 1 échantillon supplémentaire par frame avec jitter aléatoire, accumulé dans un buffer (moyenne progressive). Un render pass affiche la texture résultat. On RESET l'accumulation dès que la caméra bouge.
Pourquoi ajoute-t-on un epsilon à l'origine des rayons relancés ?|Un rayon réfléchi/réfracté/de rebond part de la surface elle-même. Sans décalage (hit.point + N*0.001), il ré-intersecte sa propre surface à t≈0 : shadow acne, points noirs, artefacts. On décale l'origine d'un petit epsilon le long de la normale.
À quoi sert une BVH et quel est son intérêt ?|Une BVH (Bounding Volume Hierarchy) est un arbre de boîtes englobantes (AABB). Un rayon teste la grosse boîte d'abord : s'il la manque, on saute tout le sous-arbre. Coût O(log n) par rayon au lieu de O(n) en force brute. Indispensable pour un vrai mesh (millions de triangles), superflu pour quelques sphères analytiques.
Pourquoi le cosine-weighted sampling simplifie-t-il un rebond Lambert ?|On tire la direction directement selon une densité en cosinus (PDF = cos θ/π), concentrant les échantillons près de la normale (là où cos θ compte). Pour un Lambert diffus, le poids du chemin BRDF·cos θ/PDF = (albedo/π)·cos θ/(cos θ/π) = albedo. On multiplie juste le throughput par l'albedo à chaque rebond.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-22-ray-tracing/README.md`. Coder un ray tracer de sphères qui tourne dans le navigateur (compute shader WGSL, intersection rayon-sphère, accumulation temporelle progressive) et rendre l'objet-souvenir TribuZen. Corrigé HTML/TS/WGSL commenté.
