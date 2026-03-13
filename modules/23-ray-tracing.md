# Module 23 — Ray tracing et path tracing

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 180 min       | [Lab 23](../labs/lab-23-ray-tracing/) | [Quiz 23](../quizzes/quiz-23-ray-tracing.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Expliquer la difference fondamentale entre rasterization et ray tracing
- Implementer les intersections rayon-sphere, rayon-triangle et rayon-AABB
- Construire une BVH (Bounding Volume Hierarchy) avec la Surface Area Heuristic
- Traverser une BVH avec un algorithme stack-based front-to-back
- Implementer le Whitted ray tracing (reflexion, refraction, ombres)
- Comprendre le path tracing par integration de Monte Carlo
- Appliquer l'echantillonnage cosine-weighted et l'importance sampling
- Utiliser la Russian roulette pour terminer les chemins probabilistiquement
- Implementer un ray tracer basique en compute shader WebGPU (WGSL)
- Appliquer des techniques de denoising : accumulation temporelle, filtre bilateral
- Utiliser l'addon pathtracing de Three.js pour du rendu progressif

---

<details>
<summary>Rappel du cours precedent — Modelisation 3D (Module 22)</summary>

Au module 22, nous avons couvert la creation d'assets 3D :

- **Blender** : navigation (MMB orbit, scroll zoom, Shift+MMB pan), modes Object/Edit, raccourcis G/R/S
- **Modelisation polygonale** : vertices, edges, faces, quads vs tris, modifiers (Subdivision Surface, Mirror, Boolean)
- **UV unwrapping** : deplier le mesh 3D en 2D, seams, UV Editor
- **Materiaux PBR** : Principled BSDF = metallic-roughness workflow
- **Baking** : cuire les details high-poly en textures (normal map, AO map, lightmap)
- **Rigging** : armature (squelette de bones), weight painting, pose
- **Animation** : keyframes, interpolation, F-curves, NLA editor
- **Export glTF** : format standard 3D web, structure JSON + binaire, extensions Draco/Meshopt
- **Pipeline** : modelisation → UV → texturing → rigging → animation → export → integration Three.js

Nous allons maintenant explorer comment la lumiere interagit reellement avec la geometrie — en simulant le trajet de chaque rayon lumineux.

</details>

---

## Rasterization vs Ray tracing

:::tip Analogie
La rasterization, c'est comme peindre un tableau en projetant chaque objet sur la toile un par un, sans se soucier de ce que les autres objets refletent. Le ray tracing, c'est comme regarder la scene a travers chaque pixel de la toile et suivre le rayon de lumiere en arriere — de ton oeil jusqu'a la source lumineuse — pour savoir exactement quelle couleur tu vois. C'est plus lent, mais ca capture naturellement les reflexions, les refractions et les ombres douces.
:::

### Les deux philosophies

```
Rasterization (ce que font WebGL/WebGPU par defaut)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pour chaque triangle :
  Projeter sur l'ecran
  Pour chaque pixel couvert :
    Executer le fragment shader
    Ecrire dans le framebuffer

→ O(triangles × pixels couverts)
→ Tres rapide (GPU optimise pour ca)
→ Pas de reflexions/refractions natives
→ Ombres = technique separee (shadow maps)


Ray tracing (simulation physique de la lumiere)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pour chaque pixel :
  Lancer un rayon depuis la camera
  Trouver la premiere intersection
  Calculer la couleur (ombres, reflexions, refractions)
  Potentiellement lancer d'autres rayons (recursif)

→ O(pixels × complexite scene)
→ Plus lent mais physiquement correct
→ Reflexions/refractions/ombres = gratuites
→ Qualite "photoraliste" naturelle
```

### Quand utiliser quoi

| Critere | Rasterization | Ray tracing |
|---------|:------------:|:-----------:|
| **Performance** | Temps reel (60+ FPS) | Offline ou hybride |
| **Reflexions** | Approximation (SSR, cubemaps) | Exactes |
| **Refractions** | Approximation (screen-space) | Exactes (loi de Snell) |
| **Ombres** | Shadow maps (artefacts possibles) | Naturellement douces |
| **Illumination globale** | Approximation (probes, SSGI) | Convergente (path tracing) |
| **Cas d'usage web** | Jeux, visualisation interactive | Configurateurs produit, arch-viz |

---

## Ray tracing basics : lancer des rayons

### Le rayon

Un rayon est defini par une origine et une direction :

```
R(t) = O + t × D      ou  t > 0

O = origine (position de la camera ou du dernier rebond)
D = direction (normalisee)
t = parametre (distance le long du rayon)
```

```
              Camera
                ●  O (origine)
               /
              / D (direction)
             /
            /
           / t=2.5
          ●━━━━━━━━━━━ Point d'intersection P
         /|
        / |  Normale N
       /  ↑
      ━━━━━━━━━━━━━━━━ Surface
```

### Generer les rayons primaires

Pour chaque pixel (x, y) de l'ecran, on genere un rayon :

```typescript
interface Ray {
  origin: [number, number, number];
  direction: [number, number, number];
}

function generatePrimaryRay(
  pixelX: number,
  pixelY: number,
  width: number,
  height: number,
  cameraPos: [number, number, number],
  cameraTarget: [number, number, number],
  fov: number
): Ray {
  // Convertir pixel en coordonnees normalisees [-1, 1]
  const aspectRatio = width / height;
  const tanHalfFov = Math.tan((fov * Math.PI / 180) / 2);

  // NDC avec anti-aliasing (jitter de 0.5 pixel)
  const ndcX = (2 * (pixelX + 0.5) / width - 1) * aspectRatio * tanHalfFov;
  const ndcY = (1 - 2 * (pixelY + 0.5) / height) * tanHalfFov;

  // Construire le repere camera (look-at)
  const forward = normalize(subtract(cameraTarget, cameraPos));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);

  // Direction du rayon dans le monde
  const direction = normalize([
    right[0] * ndcX + up[0] * ndcY + forward[0],
    right[1] * ndcX + up[1] * ndcY + forward[1],
    right[2] * ndcX + up[2] * ndcY + forward[2],
  ]);

  return { origin: cameraPos, direction };
}
```

---

## Ray-sphere intersection

### L'equation quadratique

L'intersection rayon-sphere se reduit a une equation du second degre.

```
Sphere : |P - C|² = r²        (centre C, rayon r)
Rayon  : P = O + t × D

Substituer P :
|O + tD - C|² = r²

Poser L = O - C :
|L + tD|² = r²
(D·D)t² + 2(D·L)t + (L·L - r²) = 0

C'est at² + bt + c = 0 avec :
  a = D · D = 1 (D normalise)
  b = 2(D · L)
  c = L · L - r²

Discriminant Δ = b² - 4ac
  Δ < 0 → pas d'intersection
  Δ = 0 → tangent (1 point)
  Δ > 0 → 2 intersections (entree + sortie)

  t = (-b ± √Δ) / 2a
  On prend le plus petit t > 0
```

```
Δ < 0 : rayon manque        Δ = 0 : tangent         Δ > 0 : traverse
       ╱                         ╱                         ╱
      ╱                         ╱●                        ╱●━━━●
     ╱     ○                   ╱  ○                      ╱ (  ○  )
    ╱                         ╱                         ╱
```

### Implementation TypeScript

```typescript
interface HitRecord {
  t: number;
  point: [number, number, number];
  normal: [number, number, number];
  material: Material;
}

function intersectSphere(
  ray: Ray,
  center: [number, number, number],
  radius: number
): number | null {
  const L = subtract(ray.origin, center);

  // a = 1 car direction normalisee
  const b = 2 * dot(ray.direction, L);
  const c = dot(L, L) - radius * radius;

  const discriminant = b * b - 4 * c;

  if (discriminant < 0) return null;

  const sqrtD = Math.sqrt(discriminant);
  let t = (-b - sqrtD) / 2; // Plus proche intersection

  if (t < 0.001) { // Epsilon pour eviter self-intersection
    t = (-b + sqrtD) / 2;
    if (t < 0.001) return null;
  }

  return t;
}
```

### Implementation WGSL

```wgsl
struct Ray {
  origin: vec3f,
  direction: vec3f,
}

struct HitRecord {
  t: f32,
  point: vec3f,
  normal: vec3f,
  material_id: u32,
  hit: bool,
}

fn intersect_sphere(ray: Ray, center: vec3f, radius: f32) -> f32 {
  let L = ray.origin - center;

  let b = 2.0 * dot(ray.direction, L);
  let c = dot(L, L) - radius * radius;

  let discriminant = b * b - 4.0 * c;

  if (discriminant < 0.0) {
    return -1.0; // Pas d'intersection
  }

  let sqrt_d = sqrt(discriminant);
  var t = (-b - sqrt_d) / 2.0;

  if (t < 0.001) {
    t = (-b + sqrt_d) / 2.0;
    if (t < 0.001) {
      return -1.0;
    }
  }

  return t;
}

fn sphere_normal(point: vec3f, center: vec3f) -> vec3f {
  return normalize(point - center);
}
```

---

## Ray-triangle intersection (Moller-Trumbore)

### L'algorithme

L'algorithme de Moller-Trumbore est le standard pour l'intersection rayon-triangle. Il utilise les coordonnees barycentriques.

```
Triangle defini par 3 vertices : V0, V1, V2

Point sur le triangle :
  P = (1-u-v)V0 + uV1 + vV2     avec u >= 0, v >= 0, u+v <= 1

Intersection avec le rayon O + tD :
  O + tD = (1-u-v)V0 + uV1 + vV2

Reecrit sous forme matricielle :
  [-D, V1-V0, V2-V0] × [t, u, v]ᵀ = O - V0

Resolu par la regle de Cramer avec des produits vectoriels.
```

```
        V0
        /\
       /  \         Coordonnees barycentriques (u, v) :
      / ●P \        u = poids de V1
     / u,v  \       v = poids de V2
    /________\      1-u-v = poids de V0
  V1          V2    P est dans le triangle si u>=0, v>=0, u+v<=1
```

### Implementation TypeScript

```typescript
function intersectTriangle(
  ray: Ray,
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number]
): { t: number; u: number; v: number } | null {
  const EPSILON = 0.000001;

  const edge1 = subtract(v1, v0);
  const edge2 = subtract(v2, v0);

  // Produit vectoriel direction × edge2
  const pvec = cross(ray.direction, edge2);
  const det = dot(edge1, pvec);

  // Rayon parallele au triangle
  if (Math.abs(det) < EPSILON) return null;

  const invDet = 1 / det;

  // Vecteur de V0 a l'origine du rayon
  const tvec = subtract(ray.origin, v0);

  // Coordonnee barycentrique u
  const u = dot(tvec, pvec) * invDet;
  if (u < 0 || u > 1) return null;

  // Coordonnee barycentrique v
  const qvec = cross(tvec, edge1);
  const v = dot(ray.direction, qvec) * invDet;
  if (v < 0 || u + v > 1) return null;

  // Parametre t (distance)
  const t = dot(edge2, qvec) * invDet;
  if (t < EPSILON) return null;

  return { t, u, v };
}
```

### Implementation WGSL

```wgsl
struct TriangleHit {
  t: f32,
  u: f32,
  v: f32,
  hit: bool,
}

fn intersect_triangle(
  ray: Ray,
  v0: vec3f, v1: vec3f, v2: vec3f
) -> TriangleHit {
  let EPSILON = 0.000001;

  let edge1 = v1 - v0;
  let edge2 = v2 - v0;

  let pvec = cross(ray.direction, edge2);
  let det = dot(edge1, pvec);

  if (abs(det) < EPSILON) {
    return TriangleHit(0.0, 0.0, 0.0, false);
  }

  let inv_det = 1.0 / det;
  let tvec = ray.origin - v0;

  let u = dot(tvec, pvec) * inv_det;
  if (u < 0.0 || u > 1.0) {
    return TriangleHit(0.0, 0.0, 0.0, false);
  }

  let qvec = cross(tvec, edge1);
  let v_coord = dot(ray.direction, qvec) * inv_det;
  if (v_coord < 0.0 || u + v_coord > 1.0) {
    return TriangleHit(0.0, 0.0, 0.0, false);
  }

  let t = dot(edge2, qvec) * inv_det;
  if (t < EPSILON) {
    return TriangleHit(0.0, 0.0, 0.0, false);
  }

  return TriangleHit(t, u, v_coord, true);
}
```

---

## Ray-AABB intersection (slab method)

### Principe

On decoupe l'AABB en 3 paires de plans paralleles (slabs). Pour chaque paire, on calcule l'intervalle [tmin, tmax] ou le rayon est entre les deux plans. L'intersection finale est l'intersection des 3 intervalles.

```
Vue de dessus (2D simplifie) :

   tmin_y ─────────────────── tmax_y
          │                 │
  tmin_x ─┼─────────────────┤ tmax_x
          │    AABB         │
          │     ╱           │
          │    ╱  rayon     │
          │   ╱             │
          │  ╱              │
          ├─╱───────────────┤
          │╱                │
          ╱                 │
         ╱                  │
        ╱                   │

Intersection = max(tmin_x, tmin_y) a min(tmax_x, tmax_y)
Si max(tmin) > min(tmax) → pas d'intersection
```

### Implementation WGSL

```wgsl
struct AABB {
  min_point: vec3f,
  max_point: vec3f,
}

fn intersect_aabb(ray: Ray, aabb: AABB) -> bool {
  // Inverse de la direction (calcule une seule fois)
  let inv_dir = 1.0 / ray.direction;

  // Pour chaque axe, calculer tmin et tmax
  let t1 = (aabb.min_point - ray.origin) * inv_dir;
  let t2 = (aabb.max_point - ray.origin) * inv_dir;

  // min/max par composante (gere les directions negatives)
  let tmin_v = min(t1, t2);
  let tmax_v = max(t1, t2);

  // Intersection des 3 intervalles
  let tmin = max(max(tmin_v.x, tmin_v.y), tmin_v.z);
  let tmax = min(min(tmax_v.x, tmax_v.y), tmax_v.z);

  // Intersection valide si tmin <= tmax et tmax > 0
  return tmin <= tmax && tmax > 0.0;
}

// Version avec distance t (utile pour BVH traversal)
fn intersect_aabb_t(ray: Ray, aabb: AABB) -> f32 {
  let inv_dir = 1.0 / ray.direction;

  let t1 = (aabb.min_point - ray.origin) * inv_dir;
  let t2 = (aabb.max_point - ray.origin) * inv_dir;

  let tmin_v = min(t1, t2);
  let tmax_v = max(t1, t2);

  let tmin = max(max(tmin_v.x, tmin_v.y), tmin_v.z);
  let tmax = min(min(tmax_v.x, tmax_v.y), tmax_v.z);

  if (tmin > tmax || tmax < 0.0) {
    return -1.0; // Pas d'intersection
  }

  if (tmin > 0.0) { return tmin; }
  return tmax; // On est a l'interieur de l'AABB
}
```

---

## BVH (Bounding Volume Hierarchy)

### Pourquoi une structure d'acceleration

Tester chaque rayon contre chaque triangle est O(n). Pour une scene de 1M de triangles a 1920×1080 pixels, ca fait ~2 trillions de tests d'intersection. Inacceptable.

```
Sans BVH : O(n) par rayon              Avec BVH : O(log n) par rayon
━━━━━━━━━━━━━━━━━━━━━━━━━━              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1M triangles × 2M pixels               ~20 niveaux × 2M pixels
= 2 000 000 000 000 tests              = ~40 000 000 tests
= impossible en temps reel             = faisable (quelques secondes)
```

### Structure de l'arbre

```
                    ┌─────────────┐
                    │  Noeud root │
                    │  AABB scene │
                    └──────┬──────┘
                    ┌──────┴──────┐
              ┌─────┴─────┐ ┌─────┴─────┐
              │  Noeud L  │ │  Noeud R  │
              │  AABB     │ │  AABB     │
              └─────┬─────┘ └─────┬─────┘
              ┌─────┴────┐  ┌─────┴────┐
           ┌──┴──┐ ┌──┴──┐│Feuille│┌──┴──┐
           │Leaf │ │Leaf ││ △△△  ││Leaf │
           │ △△  │ │ △△△ │└──────┘│ △△  │
           └─────┘ └─────┘        └─────┘

Chaque noeud interne = AABB englobant ses enfants
Chaque feuille = AABB + liste de triangles
```

### Construction top-down avec SAH

La **Surface Area Heuristic (SAH)** estime le cout de chaque partition possible. L'idee : la probabilite qu'un rayon touche un noeud est proportionnelle a sa surface.

```
Cout SAH d'une partition en L et R :

  C(L, R) = C_traversal + (SA(L)/SA(parent)) × N_L × C_intersect
                         + (SA(R)/SA(parent)) × N_R × C_intersect

SA(x) = surface de l'AABB de x
N_L, N_R = nombre de primitives dans L et R
C_traversal ≈ 1 (cout de traverser un noeud)
C_intersect ≈ 1 (cout de tester un triangle)

On teste toutes les positions de split (ou un sous-ensemble)
et on choisit celle qui minimise le cout.
```

```typescript
interface BVHNode {
  aabb: AABB;
  left: BVHNode | null;   // null si feuille
  right: BVHNode | null;  // null si feuille
  triangles: number[];    // indices des triangles (feuille uniquement)
}

function buildBVH(
  triangles: Triangle[],
  indices: number[],
  depth: number = 0
): BVHNode {
  // Calculer l'AABB englobant
  const aabb = computeAABB(triangles, indices);

  // Condition d'arret : peu de triangles ou profondeur max
  if (indices.length <= 4 || depth > 32) {
    return { aabb, left: null, right: null, triangles: indices };
  }

  // --- SAH : trouver le meilleur split ---
  let bestCost = Infinity;
  let bestAxis = 0;
  let bestSplitPos = 0;

  const parentSA = surfaceArea(aabb);

  for (let axis = 0; axis < 3; axis++) {
    // Trier les centroides sur cet axe
    const sorted = [...indices].sort((a, b) =>
      triangleCentroid(triangles[a])[axis] -
      triangleCentroid(triangles[b])[axis]
    );

    // Tester N-1 positions de split
    const NUM_BINS = 32;
    for (let i = 1; i < NUM_BINS; i++) {
      const splitIdx = Math.floor(i * sorted.length / NUM_BINS);
      if (splitIdx === 0 || splitIdx === sorted.length) continue;

      const leftIndices = sorted.slice(0, splitIdx);
      const rightIndices = sorted.slice(splitIdx);

      const leftAABB = computeAABB(triangles, leftIndices);
      const rightAABB = computeAABB(triangles, rightIndices);

      const cost = 1.0
        + (surfaceArea(leftAABB) / parentSA) * leftIndices.length
        + (surfaceArea(rightAABB) / parentSA) * rightIndices.length;

      if (cost < bestCost) {
        bestCost = cost;
        bestAxis = axis;
        bestSplitPos = splitIdx;
      }
    }
  }

  // Si le split n'ameliore pas, faire une feuille
  const leafCost = indices.length;
  if (bestCost >= leafCost) {
    return { aabb, left: null, right: null, triangles: indices };
  }

  // Partitionner
  const sorted = [...indices].sort((a, b) =>
    triangleCentroid(triangles[a])[bestAxis] -
    triangleCentroid(triangles[b])[bestAxis]
  );

  const leftIndices = sorted.slice(0, bestSplitPos);
  const rightIndices = sorted.slice(bestSplitPos);

  return {
    aabb,
    left: buildBVH(triangles, leftIndices, depth + 1),
    right: buildBVH(triangles, rightIndices, depth + 1),
    triangles: [],
  };
}
```

### Traversal stack-based

```wgsl
// BVH lineaire (flatten pour le GPU)
struct BVHNodeGPU {
  aabb_min: vec3f,
  left_or_first: u32,   // index enfant gauche (ou premier triangle si feuille)
  aabb_max: vec3f,
  count: u32,            // 0 = noeud interne, >0 = nombre de triangles (feuille)
}

@group(0) @binding(0) var<storage> bvh_nodes: array<BVHNodeGPU>;
@group(0) @binding(1) var<storage> triangles: array<Triangle>;

fn traverse_bvh(ray: Ray) -> HitRecord {
  var hit = HitRecord(1e30, vec3f(0.0), vec3f(0.0), 0u, false);

  // Stack manuelle (pas de recursion en WGSL)
  var stack: array<u32, 64>;
  var stack_ptr: i32 = 0;
  stack[0] = 0u; // Commencer par la racine

  while (stack_ptr >= 0) {
    let node_idx = stack[stack_ptr];
    stack_ptr -= 1;

    let node = bvh_nodes[node_idx];
    let aabb = AABB(node.aabb_min, node.aabb_max);

    // Tester l'AABB
    let t_aabb = intersect_aabb_t(ray, aabb);
    if (t_aabb < 0.0 || t_aabb > hit.t) {
      continue; // Sauter ce noeud (rate ou trop loin)
    }

    if (node.count > 0u) {
      // Feuille : tester tous les triangles
      for (var i = 0u; i < node.count; i++) {
        let tri = triangles[node.left_or_first + i];
        let tri_hit = intersect_triangle(ray, tri.v0, tri.v1, tri.v2);

        if (tri_hit.hit && tri_hit.t < hit.t) {
          hit.t = tri_hit.t;
          hit.point = ray.origin + tri_hit.t * ray.direction;
          hit.normal = triangle_normal(tri, tri_hit.u, tri_hit.v);
          hit.material_id = tri.material_id;
          hit.hit = true;
        }
      }
    } else {
      // Noeud interne : empiler les deux enfants
      // Empiler le plus loin d'abord (front-to-back)
      let left_idx = node.left_or_first;
      let right_idx = node.left_or_first + 1u;

      let left_aabb = AABB(bvh_nodes[left_idx].aabb_min, bvh_nodes[left_idx].aabb_max);
      let right_aabb = AABB(bvh_nodes[right_idx].aabb_min, bvh_nodes[right_idx].aabb_max);

      let t_left = intersect_aabb_t(ray, left_aabb);
      let t_right = intersect_aabb_t(ray, right_aabb);

      // Empiler le plus loin d'abord pour que le plus proche soit traite en premier
      if (t_left < t_right) {
        if (t_right >= 0.0) { stack_ptr += 1; stack[stack_ptr] = right_idx; }
        if (t_left >= 0.0)  { stack_ptr += 1; stack[stack_ptr] = left_idx; }
      } else {
        if (t_left >= 0.0)  { stack_ptr += 1; stack[stack_ptr] = left_idx; }
        if (t_right >= 0.0) { stack_ptr += 1; stack[stack_ptr] = right_idx; }
      }
    }
  }

  return hit;
}
```

---

## Whitted ray tracing : reflexion, refraction, ombres

### Le modele de Whitted (1980)

Turner Whitted a propose le premier ray tracing recursif : a chaque intersection, lancer des rayons supplementaires pour les reflexions, les refractions et les ombres.

```
                Camera
                  ●
                 /|
    Rayon       / |  Rayon reflechi
    primaire   /  |  ╱
              /   | ╱
             /    |╱
    ━━━━━━━━●━━━━━━━━━━━━━━  Surface miroir
             \
              \  Rayon refracte
               \ (si transparent)
                \
                 ●  Objet sous la surface
                 |
                 |  Shadow ray (vers la lumiere)
                 |
                 ☀  Lumiere
```

### Reflexion

```wgsl
// Direction reflechie : R = D - 2(D·N)N
fn reflect_dir(incident: vec3f, normal: vec3f) -> vec3f {
  return incident - 2.0 * dot(incident, normal) * normal;
}
```

### Refraction (loi de Snell)

```
Loi de Snell : n₁ sin(θ₁) = n₂ sin(θ₂)

n₁ = indice de refraction du milieu source
n₂ = indice de refraction du milieu cible
θ₁ = angle d'incidence
θ₂ = angle de refraction

Indices courants :
  Air    = 1.0
  Eau    = 1.33
  Verre  = 1.5
  Diamant = 2.42
```

```wgsl
fn refract_dir(incident: vec3f, normal: vec3f, eta: f32) -> vec3f {
  // eta = n1/n2
  let cos_i = -dot(incident, normal);
  let sin2_t = eta * eta * (1.0 - cos_i * cos_i);

  // Reflexion totale interne
  if (sin2_t > 1.0) {
    return reflect_dir(incident, normal);
  }

  let cos_t = sqrt(1.0 - sin2_t);
  return eta * incident + (eta * cos_i - cos_t) * normal;
}

// Coefficient de Fresnel (approximation de Schlick)
fn fresnel_schlick(cos_theta: f32, n1: f32, n2: f32) -> f32 {
  var r0 = (n1 - n2) / (n1 + n2);
  r0 = r0 * r0;
  return r0 + (1.0 - r0) * pow(1.0 - cos_theta, 5.0);
}
```

### Algorithme Whitted complet

```typescript
function whittedTrace(
  ray: Ray,
  scene: Scene,
  depth: number = 0
): [number, number, number] {
  if (depth > 5) return [0, 0, 0]; // Limite de recursion

  const hit = scene.intersect(ray);
  if (!hit) return scene.backgroundColor;

  const material = hit.material;
  let color: [number, number, number] = [0, 0, 0];

  // --- Eclairage direct ---
  for (const light of scene.lights) {
    const toLight = normalize(subtract(light.position, hit.point));
    const shadowRay: Ray = {
      origin: add(hit.point, scale(hit.normal, 0.001)), // Offset
      direction: toLight,
    };

    // Shadow ray : si aucun obstacle entre le point et la lumiere
    const shadowHit = scene.intersect(shadowRay);
    const lightDist = distance(light.position, hit.point);

    if (!shadowHit || shadowHit.t > lightDist) {
      // Pas d'ombre : ajouter la contribution diffuse + speculaire
      const NdotL = Math.max(0, dot(hit.normal, toLight));
      const diffuse = scale(material.albedo, NdotL * light.intensity);
      color = add(color, diffuse);

      // Speculaire Blinn-Phong
      const halfVec = normalize(add(toLight, scale(ray.direction, -1)));
      const NdotH = Math.max(0, dot(hit.normal, halfVec));
      const spec = light.intensity * Math.pow(NdotH, material.shininess);
      color = add(color, [spec, spec, spec]);
    }
  }

  // --- Reflexion (si metallique ou miroir) ---
  if (material.reflectivity > 0) {
    const reflectDir = reflect(ray.direction, hit.normal);
    const reflectRay: Ray = {
      origin: add(hit.point, scale(hit.normal, 0.001)),
      direction: reflectDir,
    };
    const reflectColor = whittedTrace(reflectRay, scene, depth + 1);
    color = add(color, scale(reflectColor, material.reflectivity));
  }

  // --- Refraction (si transparent) ---
  if (material.transparency > 0) {
    const entering = dot(ray.direction, hit.normal) < 0;
    const n = entering ? hit.normal : scale(hit.normal, -1);
    const eta = entering ? 1.0 / material.ior : material.ior;

    const cosTheta = Math.abs(dot(ray.direction, n));
    const fresnel = fresnelSchlick(cosTheta, 1.0, material.ior);

    // Refraction
    const refractDir = refract(ray.direction, n, eta);
    const refractRay: Ray = {
      origin: add(hit.point, scale(n, -0.001)),
      direction: refractDir,
    };
    const refractColor = whittedTrace(refractRay, scene, depth + 1);

    // Melanger reflexion et refraction selon Fresnel
    color = add(
      color,
      scale(refractColor, material.transparency * (1 - fresnel))
    );
  }

  return color;
}
```

---

## Path tracing : Monte Carlo integration

### Le probleme

Whitted ray tracing ne capture que les reflexions et refractions speculaires. L'illumination indirecte (lumiere qui rebondit sur des surfaces diffuses) est ignoree. Le path tracing resout ce probleme en integrant la **rendering equation** de Kajiya (1986).

```
Rendering equation :
  Lo(p, ωo) = Le(p, ωo) + ∫ fr(p, ωi, ωo) Li(p, ωi) cos(θi) dωi
                            Ω

Lo = radiance sortante
Le = emission
fr = BRDF (comment la surface reflechit la lumiere)
Li = radiance incidente
cos(θi) = facteur cosinus (loi de Lambert)
Ω = hemisphere au-dessus du point

Le probleme : l'integrale est sur un hemisphere continu
→ On ne peut pas la calculer analytiquement
→ Solution : Monte Carlo (echantillonner aleatoirement)
```

### Integration de Monte Carlo

```
Estimateur de Monte Carlo :

  ∫ f(x) dx ≈ (1/N) Σ f(xi) / p(xi)

N = nombre d'echantillons
xi = echantillon aleatoire
p(xi) = densite de probabilite de l'echantillon

Plus N est grand, plus l'estimation converge
Erreur ∝ 1/√N  (convergence lente !)
```

### Echantillonnage cosine-weighted

Pour un path tracer, on doit echantillonner des directions dans l'hemisphere. L'echantillonnage uniforme est simple mais inefficace. L'echantillonnage cosine-weighted concentre les echantillons la ou la contribution est la plus forte.

```
Hemisphere uniforme :           Cosine-weighted :
     ↑ ↑ ↑ ↑ ↑ ↑                  ↑↑↑↑↑
    ╱ ╱ │ │ ╲ ╲                   ↗↗↑↑↑↖↖
   ╱╱  │ │  ╲╲                  ↗ ↗ ↑ ↖ ↖
  ╱╱   │ │   ╲╲                → → ↑ ← ←
━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━━━
Densite uniforme               Plus d'echantillons pres
sur l'hemisphere               de la normale (ou cos est grand)
```

```wgsl
// Echantillonnage cosine-weighted de l'hemisphere
fn cosine_sample_hemisphere(r1: f32, r2: f32) -> vec3f {
  // Coordonnees polaires avec distribution cosinus
  let phi = 2.0 * 3.14159265 * r1;
  let cos_theta = sqrt(r2);
  let sin_theta = sqrt(1.0 - r2);

  return vec3f(
    cos(phi) * sin_theta,
    cos_theta,             // Y = up (direction de la normale)
    sin(phi) * sin_theta
  );
}

// Construire un repere local a partir de la normale
fn build_onb(normal: vec3f) -> mat3x3f {
  // Choisir un vecteur non-parallele a la normale
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(normal.y) > 0.999) {
    up = vec3f(1.0, 0.0, 0.0);
  }

  let tangent = normalize(cross(up, normal));
  let bitangent = cross(normal, tangent);

  return mat3x3f(tangent, normal, bitangent);
}

// Direction dans l'hemisphere oriente selon la normale
fn sample_hemisphere(normal: vec3f, r1: f32, r2: f32) -> vec3f {
  let local_dir = cosine_sample_hemisphere(r1, r2);
  let onb = build_onb(normal);
  return onb * local_dir;
}
```

### Russian roulette

Pour eviter une profondeur de recursion infinie, on utilise la Russian roulette : a chaque rebond, on a une probabilite d'arreter le chemin. Si on continue, on compense par la probabilite de survie.

```wgsl
fn path_trace(initial_ray: Ray, seed: ptr<function, u32>) -> vec3f {
  var throughput = vec3f(1.0);  // Poids accumule
  var radiance = vec3f(0.0);   // Couleur accumulee
  var ray = initial_ray;

  for (var bounce = 0u; bounce < 16u; bounce++) {
    let hit = traverse_bvh(ray);

    if (!hit.hit) {
      // Pas d'intersection : couleur du ciel
      radiance += throughput * sky_color(ray.direction);
      break;
    }

    let material = materials[hit.material_id];

    // Emission (si la surface est une lumiere)
    radiance += throughput * material.emission;

    // --- Russian roulette (a partir du 3e rebond) ---
    if (bounce >= 3u) {
      let survival_prob = min(
        max(throughput.x, max(throughput.y, throughput.z)),
        0.95
      );
      if (random_float(seed) > survival_prob) {
        break; // Terminer le chemin
      }
      throughput /= survival_prob; // Compenser
    }

    // Echantillonner une direction de rebond
    let r1 = random_float(seed);
    let r2 = random_float(seed);
    let new_dir = sample_hemisphere(hit.normal, r1, r2);

    // Mettre a jour le throughput avec le BRDF
    // Pour un Lambert diffus : BRDF = albedo/pi
    // PDF cosine-weighted : cos(theta)/pi
    // throughput *= BRDF * cos(theta) / PDF = albedo
    throughput *= material.albedo;

    // Nouveau rayon
    ray = Ray(
      hit.point + hit.normal * 0.001,
      new_dir
    );
  }

  return radiance;
}
```

### Importance sampling du BRDF

L'echantillonnage cosine-weighted est optimal pour les surfaces lambertiennes. Pour les surfaces speculaires (GGX), on echantillonne la distribution de normales :

```wgsl
// Importance sampling GGX (micro-facettes)
fn sample_ggx(normal: vec3f, roughness: f32, r1: f32, r2: f32) -> vec3f {
  let a = roughness * roughness;
  let a2 = a * a;

  // Echantillonner la micro-facette half-vector
  let phi = 2.0 * 3.14159265 * r1;
  let cos_theta = sqrt((1.0 - r2) / (1.0 + (a2 - 1.0) * r2));
  let sin_theta = sqrt(1.0 - cos_theta * cos_theta);

  // Coordonnees locales
  let h_local = vec3f(
    cos(phi) * sin_theta,
    cos_theta,
    sin(phi) * sin_theta
  );

  // Transformer dans le repere monde
  let onb = build_onb(normal);
  return normalize(onb * h_local);
}
```

---

## Convergence et denoising

### Nombre de samples per pixel (SPP)

```
1 SPP                   16 SPP                  256 SPP
┌──────────────┐       ┌──────────────┐        ┌──────────────┐
│ ░▓▒░▓░▒▓░▒▓ │       │ ░░▒▓▓▓▒░░▒▒ │        │ ░░▒▓▓▓▒▒░░░ │
│ ▓░▒░▓▒░▒▓░▒ │       │ ░▒▒▓▓▓▓▒▒░░ │        │ ░▒▒▓▓▓▓▒░░░ │
│ ▒▓░▒░▓░▒▓░▒ │       │ ▒▒▓▓▓▓▓▓▒▒░ │        │ ▒▒▓▓▓▓▓▒▒░░ │
│ ░▒▓▒▓░▒░▓▒▓ │       │ ▒▓▓▓▓▓▓▓▓▒▒ │        │ ▒▓▓▓▓▓▓▓▒▒░ │
└──────────────┘       └──────────────┘        └──────────────┘
 Tres bruite            Encore bruite            Presque propre

Erreur ∝ 1/√N :
  1 SPP   → erreur = 1.0
  16 SPP  → erreur = 0.25   (4x plus d'echantillons = 2x moins de bruit)
  256 SPP → erreur = 0.0625
  Pour 2x moins de bruit → 4x plus d'echantillons !
```

### Accumulation temporelle (progressive rendering)

```wgsl
// A chaque frame, on ajoute un echantillon et on fait la moyenne

@group(0) @binding(0) var<storage, read_write> accumulation_buffer: array<vec4f>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let pixel = vec2u(gid.xy);
  let dims = textureDimensions(output_texture);

  if (pixel.x >= dims.x || pixel.y >= dims.y) { return; }

  let idx = pixel.y * dims.x + pixel.x;

  // Generer un rayon avec un jitter aleatoire pour ce frame
  var seed = init_seed(pixel, frame_count);
  let jitter_x = random_float(&seed) - 0.5;
  let jitter_y = random_float(&seed) - 0.5;

  let ray = generate_ray(
    f32(pixel.x) + jitter_x,
    f32(pixel.y) + jitter_y,
    f32(dims.x), f32(dims.y)
  );

  // Path trace
  let sample_color = path_trace(ray, &seed);

  // Accumuler
  let prev = accumulation_buffer[idx];
  let count = prev.w + 1.0;
  let new_color = prev.xyz + sample_color;

  accumulation_buffer[idx] = vec4f(new_color, count);

  // Ecrire la moyenne dans la texture de sortie
  let averaged = new_color / count;

  // Tone mapping (ACES) + gamma
  let mapped = aces_tonemap(averaged);
  let gamma_corrected = pow(mapped, vec3f(1.0 / 2.2));

  textureStore(output_texture, pixel, vec4f(gamma_corrected, 1.0));
}
```

### Filtre bilateral (denoising simple)

```wgsl
// Le filtre bilateral lisse le bruit tout en preservant les aretes
fn bilateral_filter(
  pixel: vec2u,
  radius: i32,
  sigma_spatial: f32,
  sigma_color: f32
) -> vec3f {
  let center_color = get_color(pixel);
  let center_normal = get_normal(pixel);
  let center_depth = get_depth(pixel);

  var weighted_sum = vec3f(0.0);
  var weight_sum = 0.0;

  for (var dy = -radius; dy <= radius; dy++) {
    for (var dx = -radius; dx <= radius; dx++) {
      let neighbor = vec2i(pixel) + vec2i(dx, dy);
      let neighbor_color = get_color(vec2u(neighbor));
      let neighbor_normal = get_normal(vec2u(neighbor));
      let neighbor_depth = get_depth(vec2u(neighbor));

      // Poids spatial (distance en pixels)
      let dist2 = f32(dx * dx + dy * dy);
      let w_spatial = exp(-dist2 / (2.0 * sigma_spatial * sigma_spatial));

      // Poids de couleur (difference de couleur)
      let color_diff = length(center_color - neighbor_color);
      let w_color = exp(-color_diff * color_diff / (2.0 * sigma_color * sigma_color));

      // Poids de normale (surfaces differentes = pas de melange)
      let w_normal = pow(max(0.0, dot(center_normal, neighbor_normal)), 128.0);

      // Poids de profondeur
      let depth_diff = abs(center_depth - neighbor_depth);
      let w_depth = exp(-depth_diff * 10.0);

      let weight = w_spatial * w_color * w_normal * w_depth;
      weighted_sum += neighbor_color * weight;
      weight_sum += weight;
    }
  }

  return weighted_sum / max(weight_sum, 0.0001);
}
```

### AI denoiser (concept)

Les denoisers bases sur le deep learning (Intel Open Image Denoise, NVIDIA OptiX) peuvent produire une image propre a partir de 1-4 SPP. Ils utilisent des reseaux de neurones entraines sur des paires "image bruitee → image propre".

```
Inputs du denoiser :
  - Image bruitee (color buffer)
  - Normal buffer (G-buffer)
  - Albedo buffer (couleur sans eclairage)
  - Depth buffer (optionnel)

Le reseau utilise les buffers auxiliaires pour comprendre
la structure de la scene et distinguer le bruit du detail.

En WebGPU, on pourrait potentiellement executer un petit
reseau de neurones dans un compute shader, mais les
implementations actuelles sont cote CPU (OIDN, WASM).
```

---

## WebGPU compute shader ray tracer

### Architecture complete

```typescript
import { mat4, vec3 } from 'wgpu-matrix';

interface RTScene {
  spheres: Float32Array;  // [cx, cy, cz, r, albedo_r, albedo_g, albedo_b, metallic, ...]
  triangles: Float32Array;
  bvhNodes: Float32Array;
  materials: Float32Array;
}

async function createRayTracer(canvas: HTMLCanvasElement): Promise<void> {
  // --- Init WebGPU ---
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('WebGPU non supporte');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu')!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format });

  const width = canvas.width;
  const height = canvas.height;

  // --- Buffers ---
  const accumulationBuffer = device.createBuffer({
    size: width * height * 4 * 4, // vec4f per pixel
    usage: GPUBufferUsage.STORAGE,
  });

  const uniformBuffer = device.createBuffer({
    size: 128, // camera + frame count
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Scene data (spheres pour cet exemple)
  const sphereData = new Float32Array([
    // cx, cy, cz, radius, r, g, b, metallic
    0, 0, -3, 1, 0.8, 0.2, 0.2, 0.0,     // Sphere rouge diffuse
    2, 0, -4, 1, 0.8, 0.8, 0.8, 1.0,      // Sphere miroir
    -2, 0, -4, 1, 0.2, 0.8, 0.2, 0.0,     // Sphere verte diffuse
    0, -1001, -3, 1000, 0.5, 0.5, 0.5, 0.0, // Sol
  ]);

  const sphereBuffer = device.createBuffer({
    size: sphereData.byteLength,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  new Float32Array(sphereBuffer.getMappedRange()).set(sphereData);
  sphereBuffer.unmap();

  // --- Output texture ---
  const outputTexture = device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });

  // --- Compute pipeline ---
  const computeShaderCode = `
    // [... Inserer le shader WGSL complet avec path_trace, BVH, etc. ...]
    // Voir les exemples WGSL ci-dessus

    struct Uniforms {
      camera_pos: vec3f,
      frame_count: u32,
      camera_forward: vec3f,
      _pad1: f32,
      camera_right: vec3f,
      _pad2: f32,
      camera_up: vec3f,
      fov_tan: f32,
    }

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var<storage, read_write> accumulation: array<vec4f>;
    @group(0) @binding(2) var output: texture_storage_2d<rgba8unorm, write>;
    @group(0) @binding(3) var<storage> spheres: array<Sphere>;

    @compute @workgroup_size(8, 8)
    fn main(@builtin(global_invocation_id) gid: vec3u) {
      // ... (voir implementation complete ci-dessus)
    }
  `;

  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: device.createShaderModule({ code: computeShaderCode }),
      entryPoint: 'main',
    },
  });

  // --- Render pipeline (fullscreen quad pour afficher la texture) ---
  const renderPipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: `
          @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
            let pos = array(
              vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)
            );
            return vec4f(pos[i], 0, 1);
          }
        `,
      }),
      entryPoint: 'vs',
    },
    fragment: {
      module: device.createShaderModule({
        code: `
          @group(0) @binding(0) var tex: texture_2d<f32>;
          @group(0) @binding(1) var tex_sampler: sampler;

          @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
            let uv = pos.xy / vec2f(${width}.0, ${height}.0);
            return textureSample(tex, tex_sampler, uv);
          }
        `,
      }),
      entryPoint: 'fs',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // --- Animation loop ---
  let frameCount = 0;

  function frame(): void {
    frameCount++;

    // Update uniforms
    const uniformData = new Float32Array(16);
    // [camera_pos.xyz, frame_count, camera_forward.xyz, pad, ...]
    uniformData.set([0, 1, 3], 0);   // camera pos
    uniformData[3] = frameCount;
    // ... (remplir le reste)
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const encoder = device.createCommandEncoder();

    // Compute pass (path trace 1 sample)
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    // ... set bind groups
    computePass.dispatchWorkgroups(
      Math.ceil(width / 8),
      Math.ceil(height / 8)
    );
    computePass.end();

    // Render pass (afficher le resultat)
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    renderPass.setPipeline(renderPipeline);
    // ... set bind groups
    renderPass.draw(3);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
```

---

## Three.js : pathtracing addon

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  PathTracingRenderer,
  PhysicalPathTracingMaterial,
  PathTracingSceneGenerator,
} from 'three-gpu-pathtracer';

// Scene Three.js standard
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

// Materiaux PBR
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x888888,
  roughness: 0.8,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const mirrorMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  metalness: 1.0,
  roughness: 0.05,
});
const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), mirrorMat);
sphere.position.set(0, 1, 0);
scene.add(sphere);

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  transmission: 1.0,
  roughness: 0.0,
  ior: 1.5,
  thickness: 2.0,
});
const glassSphere = new THREE.Mesh(new THREE.SphereGeometry(0.7, 64, 64), glassMat);
glassSphere.position.set(-2, 0.7, 1);
scene.add(glassSphere);

// Lumiere emissive (rectangle)
const lightMat = new THREE.MeshStandardMaterial({
  emissive: 0xffffff,
  emissiveIntensity: 10,
});
const areaLight = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), lightMat);
areaLight.position.set(0, 5, 0);
areaLight.rotation.x = Math.PI / 2;
scene.add(areaLight);

// Camera
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 6);

// Path tracer
const ptRenderer = new PathTracingRenderer(new THREE.WebGLRenderer({
  canvas: document.querySelector('canvas')!,
  antialias: false,
}));
ptRenderer.setSize(innerWidth, innerHeight);

// Generer la BVH de la scene
const generator = new PathTracingSceneGenerator();
const { bvh, textures, materials, lights } = generator.generate(scene);

// Appliquer a la material du path tracer
ptRenderer.material = new PhysicalPathTracingMaterial();
ptRenderer.material.bvh = bvh;
ptRenderer.material.textures = textures;
ptRenderer.material.materials = materials;
ptRenderer.material.lights = lights;

// Controls
const controls = new OrbitControls(camera, ptRenderer.domElement);
controls.addEventListener('change', () => {
  ptRenderer.reset(); // Recommencer l'accumulation
});

// Render loop
function animate(): void {
  requestAnimationFrame(animate);
  ptRenderer.update(camera); // Ajoute 1 sample
}
animate();

// Affichage du compteur de samples
setInterval(() => {
  console.log(`Samples: ${ptRenderer.samples}`);
}, 1000);
```

---

## Real-time ray tracing : approche hybride

### Le meilleur des deux mondes

Les jeux modernes utilisent une approche hybride : rasterization pour les passes primaires (geometrie, G-buffer), ray tracing pour les effets specifiques.

```
Pipeline hybride :
━━━━━━━━━━━━━━━━━

1. G-Buffer pass (rasterization — rapide)
   → Depth, Normal, Albedo, Metallic, Roughness

2. Lighting pass (rasterization — rapide)
   → Eclairage direct (diffus + speculaire)

3. Shadow rays (ray tracing — couteux mais precis)
   → Ombres douces sans shadow map

4. Reflection rays (ray tracing — couteux)
   → Reflexions exactes (pas SSR avec fallback)

5. AO rays (ray tracing — couteux)
   → Ambient occlusion exacte (pas SSAO approximatif)

6. Denoising (compute shader)
   → Nettoyer le bruit avec accumulation temporelle

7. Compositing (rasterization — rapide)
   → Assembler tous les passes, post-processing
```

### Hardware RT cores (concept)

```
Les GPU modernes (NVIDIA RTX, AMD RDNA 2+) ont des unites
dediees au ray tracing :

  RT Core :
  ┌────────────────────────────────┐
  │  BVH Traversal Unit           │  ← Traverse la BVH en hardware
  │  Ray-Triangle Intersection    │  ← Teste les intersections
  └────────────────────────────────┘

  Avantage : ~10x plus rapide que le compute shader
  Limitation : pas encore expose dans WebGPU (2026)

  WebGPU expose le ray tracing via des extensions futures :
  - "ray-tracing" feature (en discussion au W3C)
  - Actuellement, on emule tout en compute shaders
```

---

## Pratique

### Exercice RT.1 — Ray tracer basique en TypeScript

Implementer un ray tracer CPU qui rend une scene avec :
- 3 spheres (rouge diffuse, miroir, verre)
- 1 plan (sol gris)
- 1 lumiere ponctuelle
- Reflexion recursive (profondeur max 5)
- Ombres dures (shadow rays)

Rendre le resultat dans un `<canvas>` pixel par pixel.

```typescript
// TODO: Definir les interfaces Ray, Sphere, Plane, HitRecord, Material
// TODO: Implementer intersectSphere et intersectPlane
// TODO: Implementer la boucle de ray tracing :
//   Pour chaque pixel :
//     1. Generer le rayon primaire
//     2. Trouver la premiere intersection
//     3. Calculer la couleur (eclairage direct + ombres)
//     4. Si miroir, lancer un rayon reflechi (recursif)
//     5. Ecrire le pixel dans l'ImageData
// TODO: Afficher le canvas avec ctx.putImageData()
```

<details>
<summary>Solution</summary>

```typescript
// --- Types ---
type Vec3 = [number, number, number];

interface Ray { origin: Vec3; direction: Vec3; }
interface Material {
  albedo: Vec3;
  reflectivity: number;  // 0 = diffus, 1 = miroir
  transparency: number;  // 0 = opaque, 1 = verre
  ior: number;           // Indice de refraction
}
interface HitInfo {
  t: number;
  point: Vec3;
  normal: Vec3;
  material: Material;
}

// --- Math utils ---
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
}
function mul(a: Vec3, s: number): Vec3 {
  return [a[0]*s, a[1]*s, a[2]*s];
}
function dot3(a: Vec3, b: Vec3): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
}
function len(a: Vec3): number {
  return Math.sqrt(dot3(a, a));
}
function norm(a: Vec3): Vec3 {
  const l = len(a); return [a[0]/l, a[1]/l, a[2]/l];
}
function reflect3(d: Vec3, n: Vec3): Vec3 {
  return sub(d, mul(n, 2 * dot3(d, n)));
}
function mulVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0]*b[0], a[1]*b[1], a[2]*b[2]];
}

// --- Scene ---
interface Sphere { center: Vec3; radius: number; material: Material; }
interface Plane { point: Vec3; normal: Vec3; material: Material; }

const spheres: Sphere[] = [
  { center: [0, 0, -5], radius: 1,
    material: { albedo: [0.8, 0.2, 0.2], reflectivity: 0, transparency: 0, ior: 1.5 } },
  { center: [2.5, 0, -6], radius: 1,
    material: { albedo: [0.9, 0.9, 0.9], reflectivity: 0.95, transparency: 0, ior: 1.5 } },
  { center: [-2.5, 0, -6], radius: 1,
    material: { albedo: [0.2, 0.8, 0.2], reflectivity: 0, transparency: 0, ior: 1.5 } },
];

const planes: Plane[] = [
  { point: [0, -1, 0], normal: [0, 1, 0],
    material: { albedo: [0.5, 0.5, 0.5], reflectivity: 0.1, transparency: 0, ior: 1.5 } },
];

const light = { position: [3, 5, -2] as Vec3, intensity: 1.5 };

// --- Intersection ---
function hitSphere(ray: Ray, s: Sphere): number | null {
  const L = sub(ray.origin, s.center);
  const b = 2 * dot3(ray.direction, L);
  const c = dot3(L, L) - s.radius * s.radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  let t = (-b - sqrtD) / 2;
  if (t < 0.001) { t = (-b + sqrtD) / 2; }
  return t > 0.001 ? t : null;
}

function hitPlane(ray: Ray, p: Plane): number | null {
  const denom = dot3(p.normal, ray.direction);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot3(sub(p.point, ray.origin), p.normal) / denom;
  return t > 0.001 ? t : null;
}

function closestHit(ray: Ray): HitInfo | null {
  let best: HitInfo | null = null;

  for (const s of spheres) {
    const t = hitSphere(ray, s);
    if (t !== null && (!best || t < best.t)) {
      const point = add(ray.origin, mul(ray.direction, t));
      best = { t, point, normal: norm(sub(point, s.center)), material: s.material };
    }
  }

  for (const p of planes) {
    const t = hitPlane(ray, p);
    if (t !== null && (!best || t < best.t)) {
      const point = add(ray.origin, mul(ray.direction, t));
      best = { t, point, normal: p.normal, material: p.material };
    }
  }

  return best;
}

// --- Trace ---
function trace(ray: Ray, depth: number): Vec3 {
  if (depth > 5) return [0.1, 0.1, 0.2]; // Ciel sombre

  const hit = closestHit(ray);
  if (!hit) {
    // Ciel gradie
    const t = 0.5 * (ray.direction[1] + 1);
    return add(mul([1, 1, 1], 1 - t), mul([0.5, 0.7, 1.0], t));
  }

  let color: Vec3 = [0, 0, 0];

  // Eclairage direct
  const toLight = norm(sub(light.position, hit.point));
  const shadowOrigin = add(hit.point, mul(hit.normal, 0.001));
  const shadowRay: Ray = { origin: shadowOrigin, direction: toLight };
  const shadowHit = closestHit(shadowRay);
  const lightDist = len(sub(light.position, hit.point));

  if (!shadowHit || shadowHit.t > lightDist) {
    const NdotL = Math.max(0, dot3(hit.normal, toLight));
    const diffuse = mul(hit.material.albedo, NdotL * light.intensity);
    color = add(color, diffuse);

    // Speculaire
    const halfV = norm(add(toLight, mul(ray.direction, -1)));
    const NdotH = Math.max(0, dot3(hit.normal, halfV));
    const spec = light.intensity * Math.pow(NdotH, 64);
    color = add(color, [spec * 0.3, spec * 0.3, spec * 0.3]);
  }

  // Ambient
  color = add(color, mul(hit.material.albedo, 0.05));

  // Reflexion
  if (hit.material.reflectivity > 0) {
    const reflDir = reflect3(ray.direction, hit.normal);
    const reflRay: Ray = {
      origin: add(hit.point, mul(hit.normal, 0.001)),
      direction: reflDir,
    };
    const reflColor = trace(reflRay, depth + 1);
    color = add(
      mul(color, 1 - hit.material.reflectivity),
      mul(reflColor, hit.material.reflectivity)
    );
  }

  return color;
}

// --- Render ---
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const W = 800;
const H = 600;
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d')!;
const imageData = ctx.createImageData(W, H);

const cameraPos: Vec3 = [0, 1, 3];
const aspect = W / H;
const fovTan = Math.tan(30 * Math.PI / 180);

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const ndcX = (2 * (x + 0.5) / W - 1) * aspect * fovTan;
    const ndcY = (1 - 2 * (y + 0.5) / H) * fovTan;

    const ray: Ray = {
      origin: cameraPos,
      direction: norm([ndcX, ndcY, -1]),
    };

    const color = trace(ray, 0);

    // Gamma correction
    const idx = (y * W + x) * 4;
    imageData.data[idx]     = Math.min(255, Math.pow(color[0], 1/2.2) * 255);
    imageData.data[idx + 1] = Math.min(255, Math.pow(color[1], 1/2.2) * 255);
    imageData.data[idx + 2] = Math.min(255, Math.pow(color[2], 1/2.2) * 255);
    imageData.data[idx + 3] = 255;
  }
}

ctx.putImageData(imageData, 0, 0);
console.log('Rendu termine !');
```

</details>

---

## Resume

| Concept | Description | Complexite |
|---------|-------------|:----------:|
| **Ray-sphere intersection** | Equation quadratique at² + bt + c = 0, discriminant | O(1) |
| **Moller-Trumbore** | Intersection rayon-triangle via coordonnees barycentriques | O(1) |
| **Slab method** | Intersection rayon-AABB via 3 paires de plans | O(1) |
| **BVH** | Arbre binaire d'AABBs, construction SAH top-down | O(n log n) build, O(log n) query |
| **Whitted ray tracing** | Reflexion + refraction + ombres recursives | Deterministe |
| **Path tracing** | Monte Carlo, echantillonnage aleatoire de l'hemisphere | Stochastique, converge en 1/sqrt(N) |
| **Cosine-weighted sampling** | Concentrer les echantillons pres de la normale | Reduit la variance |
| **Importance sampling** | Echantillonner selon le BRDF (ex: GGX) | Convergence plus rapide |
| **Russian roulette** | Terminer les chemins probabilistiquement | Pas de biais, pas de profondeur fixe |
| **Accumulation temporelle** | Moyenne progressive sur plusieurs frames | 1 SPP/frame → converge |
| **Filtre bilateral** | Lisse le bruit en preservant les aretes | Denoising geometrique |
| **AI denoiser** | Reseau de neurones (OIDN, OptiX) sur color+normal+albedo | 1-4 SPP suffit |
| **Approche hybride** | Rasterization (G-buffer) + RT (ombres, reflexions) | Meilleur compromis |

| Technique | SPP minimum | Temps (1080p, GPU mid) | Qualite |
|-----------|:-----------:|:----------------------:|:-------:|
| Whitted (spheres) | 1 | ~5ms | Reflexions speculaires uniquement |
| Path tracing 1 SPP | 1 | ~20ms | Tres bruite |
| Path tracing 64 SPP | 64 | ~1.3s | Bruite mais lisible |
| Path tracing 1024 SPP | 1024 | ~20s | Propre |
| Path tracing 1 SPP + denoiser | 1 | ~25ms | Bon (denoiser simple) |
| Hybride (raster + RT) | 1-4 | ~16ms | Excellent (temps reel) |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [22 - Modelisation 3D](./22-modelisation-3d.md) | [24 - Global illumination et screen-space](./24-global-illumination-screen-space.md) |

**Ressources associees :**
- [Lab 23 — Ray tracing](../labs/lab-23-ray-tracing/)
- [Quiz 23 — Ray tracing](../quizzes/quiz-23-ray-tracing.html)
