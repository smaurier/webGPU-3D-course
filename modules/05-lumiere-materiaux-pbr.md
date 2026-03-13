# 05 — Lumiere, materiaux et PBR

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 4/5        | 120 min       | [Lab 05](../labs/lab-05-lumiere-materiaux/) | [Quiz 05](../quizzes/quiz-05-lumiere-materiaux-pbr.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Distinguer les types de lumieres (directionnelle, point, spot, ambiante, area, hemisphere)
- Implementer le modele de Phong (ambient + diffuse Lambert + specular)
- Implementer le modele Blinn-Phong avec le half-vector
- Expliquer les principes du PBR : conservation d'energie et microfacets
- Decrire le workflow metallic-roughness (standard glTF)
- Implementer la BRDF Cook-Torrance (D, F, G)
- Comprendre le normal mapping et l'espace tangent (matrice TBN)
- Connaitre les bases de l'IBL (Image Based Lighting)
- Appliquer le tone mapping HDR (Reinhard, ACES)

---

<details>
<summary>Rappel du module precedent</summary>

- **Pipeline GPU** : Input Assembly → Vertex Shader → Clipping → Rasterisation → Fragment Shader → Output Merger
- **Vertex Shader** : transforme chaque sommet via MVP, passe des varyings au fragment shader
- **Rasterisation** : convertit un triangle en fragments via edge functions et interpolation barycentrique
- **Fragment Shader** : calcule la couleur de chaque pixel — c'est ICI que l'eclairage est calcule
- **Depth test** : compare la profondeur du fragment avec le depth buffer
- **Alpha blending** : melange les couleurs pour la transparence (l'ordre de dessin compte)

</details>

---

## Analogie : les lumieres comme les styles CSS

:::tip Analogie pour developpeurs Vue.js
En CSS, vous appliquez des "couches" visuelles a un element :

```css
.card {
  background-color: #fff;          /* couleur de base (albedo) */
  box-shadow: 0 4px 12px #0002;    /* ombre (eclairage diffus inverse) */
  border: 1px solid #0001;         /* contour (Fresnel / edge highlight) */
}
.card:hover {
  box-shadow: 0 8px 24px #0003;    /* lumiere plus forte au hover */
}
```

En 3D, l'eclairage est une somme de "couches" similaires :

| CSS | Eclairage 3D |
|-----|-------------|
| `background-color` | Albedo (couleur de base du materiau) |
| `box-shadow` (douce) | Eclairage diffus (Lambert N·L) |
| `box-shadow` (nette, blanche) | Reflet speculaire (highlight) |
| `border` subtile | Effet Fresnel (plus de reflet aux bords) |
| `:hover` change les ombres | Deplacer une lumiere change le rendu |

La difference : en CSS, les "lumieres" sont fausses (box-shadow statique). En 3D, chaque pixel est calcule dynamiquement a partir de la position de la lumiere, de la camera et de la normale de la surface.
:::

---

## Types de lumieres

```
TYPES DE LUMIERES
════════════════════════════════════════════════════════════════

DIRECTIONNELLE (soleil) :
  Tous les rayons sont PARALLELES.
  Pas de position, seulement une direction.
  Pas d'attenuation avec la distance.
  ↓  ↓  ↓  ↓  ↓  ↓  ↓
  ↓  ↓  ↓  ↓  ↓  ↓  ↓
  ───────────────────────  surface

POINT (ampoule) :
  Rayons partent d'un POINT dans toutes les directions.
  Attenuation avec la distance (1/d²).
          ╱│╲
        ╱  │  ╲
      ╱    ●    ╲
        ╱  │  ╲
          ╱│╲
  ───────────────────────  surface

SPOT (lampe torche) :
  Comme point, mais limite a un CONE.
  Parametres : direction, angle interieur, angle exterieur.
        ╱╲
       ╱  ╲  angle
      ╱    ╲
     ╱  ●   ╲  position
    ╱    ↓    ╲
  ──────────────  surface

AMBIANTE :
  Lumiere uniforme dans toutes les directions.
  Simule la lumiere indirecte de facon tres simplifiee.
  Meme intensite partout, pas de direction.

HEMISPHERE :
  Lumiere ambiante amelioree : une couleur pour le "ciel" (haut)
  et une autre pour le "sol" (bas). Interpolation lineaire entre les deux.

AREA (rectangulaire, spherique) :
  Lumiere emise par une SURFACE (pas un point).
  Produit des ombres douces naturelles.
  Couteux a calculer — souvent approxime.
```

```typescript
// ── lights.ts ─────────────────────────────────────────

/** Lumiere directionnelle (soleil) */
interface DirectionalLight {
  type: 'directional';
  direction: Vec3;    // direction VERS la lumiere (normalisee)
  color: Vec3;        // couleur RGB [0, 1]
  intensity: number;  // multiplicateur
}

/** Lumiere ponctuelle (ampoule) */
interface PointLight {
  type: 'point';
  position: Vec3;
  color: Vec3;
  intensity: number;
  range: number;      // distance maximale d'effet
}

/** Spot */
interface SpotLight {
  type: 'spot';
  position: Vec3;
  direction: Vec3;    // direction du cone (normalisee)
  color: Vec3;
  intensity: number;
  range: number;
  innerAngle: number; // angle interieur (pleine intensite) en radians
  outerAngle: number; // angle exterieur (attenuation a zero) en radians
}

/** Lumiere ambiante */
interface AmbientLight {
  type: 'ambient';
  color: Vec3;
  intensity: number;
}

/** Lumiere hemisphere */
interface HemisphereLight {
  type: 'hemisphere';
  skyColor: Vec3;      // couleur du ciel
  groundColor: Vec3;   // couleur du sol
  intensity: number;
}

type Light = DirectionalLight | PointLight | SpotLight | AmbientLight | HemisphereLight;

/**
 * Attenuation d'une lumiere ponctuelle.
 *
 * L'attenuation physique suit la loi du carre inverse : 1/d²
 * En pratique, on ajoute une "range" pour couper a distance finie.
 */
function pointLightAttenuation(distance: number, range: number): number {
  if (distance >= range) return 0;

  // Attenuation lisse avec falloff
  const ratio = distance / range;
  const clamped = Math.max(0, 1 - ratio * ratio);
  return clamped * clamped / (distance * distance + 0.0001);
}

/** Attenuation d'un spot : distance * angle */
function spotLightAttenuation(
  lightPos: Vec3, lightDir: Vec3, surfacePos: Vec3,
  range: number, innerAngle: number, outerAngle: number,
): number {
  const toSurface = surfacePos.sub(lightPos);
  const distAtten = pointLightAttenuation(toSurface.length(), range);
  const cosAngle = toSurface.normalize().dot(lightDir.normalize());
  const angularAtten = Math.max(0, Math.min(1,
    (cosAngle - Math.cos(outerAngle)) / (Math.cos(innerAngle) - Math.cos(outerAngle)),
  ));
  return distAtten * angularAtten;
}
```

---

## Modele de Phong

Le modele de Phong decompose l'eclairage en 3 composantes :

```
MODELE DE PHONG
════════════════════════════════════════════════════════════════

Couleur finale = Ambient + Diffuse + Specular

1. AMBIENT : lumiere minimale omnidirectionnelle
   → Simule (grossierement) la lumiere indirecte
   → Constante : ambientColor * materialColor

2. DIFFUSE (Lambert) : lumiere qui frappe la surface et se disperse
   → Depend de l'angle entre la normale (N) et la lumiere (L)
   → Formule : max(0, N · L) * lightColor * materialColor

          N (normale)
          ↑
          │  θ
    L ────┤         ← angle entre N et L
    (lumiere)       N·L = cos(θ)
   ─────────────── surface

3. SPECULAR : reflet brillant de la lumiere
   → Depend de l'angle entre la reflexion (R) et la vue (V)
   → Formule : pow(max(0, R · V), shininess) * lightColor * specularColor

          N
          ↑
    L ────┤────► R (reflexion de L par rapport a N)
          │
          │         V (direction vers la camera)
          │        ╱
   ───────┼───────╱─── surface
          │

   R = reflect(-L, N) = 2 * (N · L) * N - L

   shininess (exposant) : controle la taille du reflet
     - shininess = 4   → reflet large (plastique)
     - shininess = 32  → reflet moyen (bois verni)
     - shininess = 256 → reflet pince (metal poli)
```

```typescript
// ── phong.ts ──────────────────────────────────────────

/**
 * Proprietes du materiau pour le modele de Phong.
 */
interface PhongMaterial {
  ambient: Vec3;     // couleur ambiante (souvent = diffuse * facteur)
  diffuse: Vec3;     // couleur diffuse (albedo)
  specular: Vec3;    // couleur speculaire (souvent blanc pour non-metaux)
  shininess: number; // exposant speculaire (4 → 512)
}

/**
 * Eclairage de Phong pour une lumiere directionnelle.
 *
 * C'est LE modele classique de l'eclairage en temps reel.
 * Utilise dans les jeux video des annees 90-2000.
 */
function phongLighting(
  material: PhongMaterial,
  // Vecteurs normalises
  normal: Vec3,        // N : normale de la surface
  lightDir: Vec3,      // L : direction VERS la lumiere
  viewDir: Vec3,       // V : direction VERS la camera
  lightColor: Vec3,    // couleur de la lumiere
  ambientColor: Vec3,  // couleur ambiante de la scene
): Vec3 {
  const N = normal.normalize();
  const L = lightDir.normalize();
  const V = viewDir.normalize();

  // 1. AMBIENT
  const ambient = ambientColor.multiply(material.ambient);

  // 2. DIFFUSE (Lambert)
  const NdotL = Math.max(0, N.dot(L));
  const diffuse = lightColor.scale(NdotL).multiply(material.diffuse);

  // 3. SPECULAR (Phong)
  // R = 2 * (N · L) * N - L
  const R = N.scale(2 * N.dot(L)).sub(L).normalize();
  const RdotV = Math.max(0, R.dot(V));
  const specFactor = Math.pow(RdotV, material.shininess);
  const specular = lightColor.scale(specFactor).multiply(material.specular);

  // Resultat final
  return ambient.add(diffuse).add(specular);
}

// Exemple : eclairage d'un point sur une surface
const material: PhongMaterial = {
  ambient: new Vec3(0.1, 0.1, 0.1),
  diffuse: new Vec3(0.8, 0.2, 0.2),  // rouge
  specular: new Vec3(1, 1, 1),         // reflet blanc
  shininess: 32,
};

const normal = Vec3.UP;                           // surface horizontale
const lightDir = new Vec3(1, 1, 0).normalize();   // lumiere a 45° en haut a droite
const viewDir = new Vec3(0, 1, 1).normalize();    // camera en haut devant
const lightColor = new Vec3(1, 1, 1);              // lumiere blanche
const ambientColor = new Vec3(0.1, 0.1, 0.1);     // ambiant faible

const color = phongLighting(material, normal, lightDir, viewDir, lightColor, ambientColor);
console.log('Phong color:', color.toString());
```

---

## Modele Blinn-Phong

Le modele Blinn-Phong remplace le calcul du vecteur de reflexion R par le **half-vector** H, ce qui est plus efficace et donne de meilleurs resultats aux angles rasants.

```
BLINN-PHONG : HALF VECTOR
════════════════════════════════════════════════════════════════

Au lieu de calculer R (reflexion) et comparer avec V :
  On calcule H (mi-chemin entre L et V) et compare avec N :

  H = normalize(L + V)

          N        H = mi-chemin entre L et V
          ↑       ╱
          │      ╱
    L ────┤────╱──── V
          │
   ───────┼─────────── surface

  Specular = pow(max(0, N · H), shininess)

Avantages du half-vector :
  - Plus rapide (pas besoin de calculer la reflexion R)
  - Meilleur rendu aux angles rasants
  - Utilise par la plupart des moteurs avant le PBR
  - Base de la BRDF Cook-Torrance (PBR)
```

```typescript
// ── blinn-phong.ts ────────────────────────────────────

/**
 * Eclairage Blinn-Phong.
 *
 * Amelioration de Phong : utilise le half-vector H
 * au lieu du vecteur de reflexion R.
 *
 * Plus efficace et plus physiquement correct que Phong pur.
 */
function blinnPhongLighting(
  material: PhongMaterial,
  normal: Vec3,
  lightDir: Vec3,
  viewDir: Vec3,
  lightColor: Vec3,
  ambientColor: Vec3,
): Vec3 {
  const N = normal.normalize();
  const L = lightDir.normalize();
  const V = viewDir.normalize();

  // 1. AMBIENT
  const ambient = ambientColor.multiply(material.ambient);

  // 2. DIFFUSE (Lambert — identique a Phong)
  const NdotL = Math.max(0, N.dot(L));
  const diffuse = lightColor.scale(NdotL).multiply(material.diffuse);

  // 3. SPECULAR (Blinn-Phong avec half-vector)
  const H = L.add(V).normalize(); // Half-vector
  const NdotH = Math.max(0, N.dot(H));
  const specFactor = Math.pow(NdotH, material.shininess * 4); // *4 car N·H converge plus lentement
  const specular = lightColor.scale(specFactor).multiply(material.specular);

  return ambient.add(diffuse).add(specular);
}

// Les deux donnent des resultats similaires, Blinn-Phong etant
// generalement prefere pour son meilleur comportement aux angles rasants
```

---

## PBR : Physically Based Rendering

Le PBR est le standard actuel pour l'eclairage en temps reel. Il produit des resultats plus realistes car il respecte les lois de la physique optique.

```
PRINCIPES DU PBR
════════════════════════════════════════════════════════════════

1. CONSERVATION D'ENERGIE
   La lumiere reflechie ne peut pas depasser la lumiere recue.
   diffuse + specular ≤ 1.0
   Plus le specular est fort, plus le diffuse est faible.

2. MODELE DE MICROFACETS
   A l'echelle microscopique, une surface est composee
   de minuscules miroirs orientes aleatoirement.

   Surface lisse (roughness = 0) :       Surface rugueuse (roughness = 1) :
   ─────────────────────────────         ╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲
   Les microfacets sont alignees         Les microfacets sont desordonnees
   → Reflet net et concentre            → Reflet large et diffus

3. FRESNEL
   Les surfaces reflechissent PLUS de lumiere aux angles rasants.
   Regardez une table en bois de face : peu de reflet.
   Regardez-la en rasant : beaucoup de reflet !

   Face (θ = 0°) :  reflet faible (F0)
   Rasant (θ = 90°) : reflet maximal (~1.0)

4. METALLIC vs DIELECTRIC
   Non-metal (plastique, bois, peau) :
     - Reflet BLANC (specular = couleur de la lumiere)
     - Diffuse COLORE (albedo)
     - F0 ≈ 0.04

   Metal (or, cuivre, aluminium) :
     - Reflet COLORE (specular = couleur du metal)
     - PAS de diffuse (les metaux absorbent la lumiere)
     - F0 = couleur du metal (0.5-1.0)
```

### Metallic-Roughness Workflow

```
METALLIC-ROUGHNESS (standard glTF / Three.js / Unreal)
════════════════════════════════════════════════════════════════

Parametres du materiau :
  - albedo (baseColor)  : couleur de base RGB [0, 1]
  - metallic            : 0.0 = non-metal, 1.0 = metal
  - roughness           : 0.0 = lisse (miroir), 1.0 = rugueux (mat)
  - ao (ambient occ.)   : 0.0 = totalement occlus, 1.0 = pleinement expose

metallic=0, roughness=0 :  plastique brillant   (bille de verre)
metallic=0, roughness=1 :  plastique mat         (caoutchouc)
metallic=1, roughness=0 :  metal poli            (chrome)
metallic=1, roughness=1 :  metal rugueux         (fonte brute)

Exemples de valeurs realistes :
  Materiau       albedo (sRGB)       metallic    roughness
  ──────────     ─────────────       ────────    ─────────
  Or             (1.0, 0.76, 0.33)    1.0         0.3
  Argent         (0.97, 0.96, 0.91)   1.0         0.2
  Cuivre         (0.97, 0.74, 0.62)   1.0         0.4
  Plastique      (couleur libre)       0.0         0.5
  Bois           (0.53, 0.36, 0.24)   0.0         0.8
  Peau           (0.76, 0.57, 0.42)   0.0         0.6
```

```typescript
// ── pbr-material.ts ───────────────────────────────────

/**
 * Materiau PBR metallic-roughness.
 *
 * Compatible avec le format glTF 2.0 et Three.js MeshStandardMaterial.
 */
interface PBRMaterial {
  albedo: Vec3;        // couleur de base (sRGB, linearise pour le calcul)
  metallic: number;    // 0 = dielectric, 1 = metal
  roughness: number;   // 0 = miroir, 1 = mat
  ao: number;          // ambient occlusion (0 = occlus, 1 = expose)
}
```

---

## BRDF Cook-Torrance

La BRDF (Bidirectional Reflectance Distribution Function) Cook-Torrance est le coeur du PBR. Elle se decompose en 3 termes :

```
BRDF COOK-TORRANCE
════════════════════════════════════════════════════════════════

           D(h) * F(θ) * G(l,v)
  f_spec = ─────────────────────
           4 * (N·L) * (N·V)

D = Distribution function (GGX / Trowbridge-Reitz)
    → Proportion de microfacets alignees avec le half-vector H
    → Controle la FORME du highlight speculaire

F = Fresnel-Schlick
    → Proportion de lumiere reflechie vs refractee
    → Plus fort aux angles rasants

G = Geometry function (Smith / Schlick-GGX)
    → Proportion de microfacets NON masquees (auto-ombrage)
    → Les surfaces rugueuses ont plus d'auto-ombrage

La BRDF complete :
  f = k_d * f_diffuse + f_specular

  k_d = (1 - F) * (1 - metallic)
  f_diffuse = albedo / PI
```

### D : Distribution GGX (Trowbridge-Reitz)

```typescript
// ── brdf-d.ts ─────────────────────────────────────────

/**
 * Distribution GGX (Trowbridge-Reitz).
 *
 * Mesure la proportion de microfacets dont la normale
 * est alignee avec le half-vector H.
 *
 * Plus roughness est grand, plus la distribution est large
 * (reflet etale). Plus roughness est petit, plus elle est
 * concentree (reflet pince).
 */
function distributionGGX(NdotH: number, roughness: number): number {
  const a = roughness * roughness;
  const a2 = a * a;
  const NdotH2 = NdotH * NdotH;

  const denom = NdotH2 * (a2 - 1) + 1;
  return a2 / (Math.PI * denom * denom);
}

// roughness bas → D tres eleve au centre, chute rapide → reflet pince
// roughness haut → D modere partout → reflet etale
console.log('D(NdotH=1, r=0.1):', distributionGGX(1.0, 0.1).toFixed(1)); // ~318
console.log('D(NdotH=1, r=0.9):', distributionGGX(1.0, 0.9).toFixed(3)); // ~0.5
```

### F : Fresnel-Schlick

```typescript
// ── brdf-f.ts ─────────────────────────────────────────

/**
 * Approximation de Fresnel par Schlick.
 *
 * A l'angle normal (face), le reflet vaut F0.
 * A l'angle rasant (90°), le reflet tend vers 1.0.
 *
 * F0 = reflectivite a incidence normale :
 *   - Dielectriques (plastique, bois) : F0 ≈ 0.04 (4%)
 *   - Metaux : F0 = couleur du metal (0.5-1.0)
 */
function fresnelSchlick(cosTheta: number, F0: Vec3): Vec3 {
  const oneMinusCos = 1 - cosTheta;
  const pow5 = oneMinusCos * oneMinusCos * oneMinusCos * oneMinusCos * oneMinusCos;
  return F0.add(new Vec3(1 - F0.x, 1 - F0.y, 1 - F0.z).scale(pow5));
}

/** Fresnel avec roughness (pour l'IBL) — attenue aux angles rasants sur surfaces rugueuses */
function fresnelSchlickRoughness(cosTheta: number, F0: Vec3, roughness: number): Vec3 {
  const r = 1 - roughness;
  const maxR = new Vec3(Math.max(r, F0.x), Math.max(r, F0.y), Math.max(r, F0.z));
  const p = Math.pow(1 - cosTheta, 5);
  return F0.add(maxR.sub(F0).scale(p));
}

// Le plastique passe de F0=0.04 (face) a ~1.0 (rasant)
const F0_plastic = new Vec3(0.04, 0.04, 0.04);
console.log('Plastic face:', fresnelSchlick(1.0, F0_plastic).x.toFixed(3));   // 0.040
console.log('Plastic 60°:', fresnelSchlick(0.5, F0_plastic).x.toFixed(3));    // 0.058
console.log('Plastic rasant:', fresnelSchlick(0.1, F0_plastic).x.toFixed(3)); // ~0.6
```

### G : Geometry function (Smith / Schlick-GGX)

```typescript
// ── brdf-g.ts ─────────────────────────────────────────

/**
 * Geometry function Schlick-GGX (pour un seul angle).
 *
 * Mesure la proportion de microfacets qui ne sont PAS
 * masquees par d'autres microfacets (auto-ombrage).
 *
 * Les surfaces rugueuses ont plus d'auto-ombrage car les
 * microfacets sont plus hautes et se cachent mutuellement.
 */
function geometrySchlickGGX(NdotV: number, roughness: number): number {
  const r = roughness + 1;
  const k = (r * r) / 8; // k pour eclairage direct (analytique)

  return NdotV / (NdotV * (1 - k) + k);
}

/**
 * Geometry function de Smith.
 *
 * Combine l'auto-ombrage vu depuis la lumiere (L)
 * et depuis la camera (V).
 */
function geometrySmith(NdotV: number, NdotL: number, roughness: number): number {
  const ggx1 = geometrySchlickGGX(NdotV, roughness);
  const ggx2 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}
```

### Assemblage : PBR Direct Light

```typescript
// ── pbr-direct.ts ─────────────────────────────────────

/**
 * Eclairage PBR pour UNE lumiere directe.
 *
 * Combine la BRDF Cook-Torrance (specular) et le
 * diffus Lambertien, pondere par metallic et Fresnel.
 *
 * C'est LA formule centrale du rendu PBR moderne.
 */
function pbrDirectLight(
  material: PBRMaterial,
  normal: Vec3,         // N
  lightDir: Vec3,       // L (vers la lumiere)
  viewDir: Vec3,        // V (vers la camera)
  lightColor: Vec3,     // radiance de la lumiere
): Vec3 {
  const N = normal.normalize();
  const L = lightDir.normalize();
  const V = viewDir.normalize();
  const H = L.add(V).normalize(); // half-vector

  // Dot products (clampes a 0)
  const NdotL = Math.max(0, N.dot(L));
  const NdotV = Math.max(0.001, N.dot(V)); // eviter /0
  const NdotH = Math.max(0, N.dot(H));
  const HdotV = Math.max(0, H.dot(V));

  // Pas de lumiere si la surface est de dos
  if (NdotL <= 0) return Vec3.ZERO;

  // --- F0 : reflectivite a incidence normale ---
  // Dielectriques : F0 = 0.04
  // Metaux : F0 = albedo (la couleur du metal EST le reflet)
  const F0_dielectric = new Vec3(0.04, 0.04, 0.04);
  const F0 = F0_dielectric.lerp(material.albedo, material.metallic);

  // --- BRDF Cook-Torrance ---
  const D = distributionGGX(NdotH, material.roughness);
  const F = fresnelSchlick(HdotV, F0);
  const G = geometrySmith(NdotV, NdotL, material.roughness);

  // Speculaire
  const numerator = D * G; // F est un Vec3, traite separement
  const denominator = 4 * NdotV * NdotL;
  const specScalar = numerator / Math.max(0.001, denominator);
  const specular = F.scale(specScalar);

  // --- Diffuse ---
  // k_d = (1 - F) * (1 - metallic)
  // Les metaux n'ont pas de diffuse
  const kD = new Vec3(1 - F.x, 1 - F.y, 1 - F.z).scale(1 - material.metallic);
  const diffuse = kD.multiply(material.albedo).scale(1 / Math.PI);

  // --- Resultat ---
  // Lo = (diffuse + specular) * lightColor * NdotL
  const Lo = diffuse.add(specular).multiply(lightColor).scale(NdotL);

  return Lo;
}

// Le plastique a un reflet blanc + diffuse rouge
// L'or a un reflet dore + pas de diffuse (metallic=1)
```

---

## Normal Mapping

Le normal mapping permet d'ajouter des details de surface sans augmenter le nombre de triangles.

```
NORMAL MAPPING
════════════════════════════════════════════════════════════════

Sans normal map :                 Avec normal map :
   Surface plate, 2 triangles     Surface plate, 2 triangles
   → eclairage plat               → eclairage detaille (illusion de relief)

   ┌──────────────────┐           ┌──────────────────┐
   │                  │           │ ╱╲ ╱╲ ╱╲ ╱╲ ╱╲  │
   │    plat          │    →      │ relief apparent   │
   │                  │           │ briques, rivets...│
   └──────────────────┘           └──────────────────┘

La normal map est une TEXTURE ou chaque pixel encode une NORMALE
perturbee en espace tangent :

   R → X (-1 a +1)
   G → Y (-1 a +1)
   B → Z ( 0 a +1)

   Couleur (128, 128, 255) = normale (0, 0, 1) = surface plate
   Couleur (255, 128, 128) = normale (1, 0, 0) = inclinee vers +X

ESPACE TANGENT (TBN) :
   T (tangent)  → le long de la coordonnee U de la texture
   B (bitangent) → le long de la coordonnee V de la texture
   N (normal)    → perpendiculaire a la surface

   La matrice TBN transforme la normale de la normal map
   (espace tangent) vers l'espace monde.
```

```typescript
// ── normal-mapping.ts ─────────────────────────────────

/**
 * Calculer les vecteurs tangent et bitangent pour un triangle.
 *
 * Necessaires pour construire la matrice TBN qui transforme
 * les normales de la normal map vers l'espace monde.
 */
function computeTangentBitangent(
  // Positions des 3 sommets
  v0: Vec3, v1: Vec3, v2: Vec3,
  // Coordonnees UV des 3 sommets
  uv0: Vec2, uv1: Vec2, uv2: Vec2,
): { tangent: Vec3; bitangent: Vec3 } {
  const edge1 = v1.sub(v0);
  const edge2 = v2.sub(v0);
  const deltaUV1 = uv1.sub(uv0);
  const deltaUV2 = uv2.sub(uv0);

  // Resoudre le systeme d'equations lineaires
  const det = deltaUV1.x * deltaUV2.y - deltaUV2.x * deltaUV1.y;
  const invDet = det === 0 ? 0 : 1 / det;

  const tangent = new Vec3(
    invDet * (deltaUV2.y * edge1.x - deltaUV1.y * edge2.x),
    invDet * (deltaUV2.y * edge1.y - deltaUV1.y * edge2.y),
    invDet * (deltaUV2.y * edge1.z - deltaUV1.y * edge2.z),
  ).normalize();

  const bitangent = new Vec3(
    invDet * (-deltaUV2.x * edge1.x + deltaUV1.x * edge2.x),
    invDet * (-deltaUV2.x * edge1.y + deltaUV1.x * edge2.y),
    invDet * (-deltaUV2.x * edge1.z + deltaUV1.x * edge2.z),
  ).normalize();

  return { tangent, bitangent };
}

/**
 * Construire la matrice TBN.
 *
 * TBN transforme les normales de l'espace tangent vers l'espace monde.
 * En GLSL/WGSL, on la construit dans le vertex shader
 * et on l'utilise dans le fragment shader.
 */
function buildTBNMatrix(tangent: Vec3, bitangent: Vec3, normal: Vec3): Mat4 {
  // La matrice TBN a les vecteurs T, B, N comme colonnes
  return Mat4.fromRows(
    tangent.x,   bitangent.x,  normal.x,  0,
    tangent.y,   bitangent.y,  normal.y,  0,
    tangent.z,   bitangent.z,  normal.z,  0,
    0,            0,            0,          1,
  );
}

/**
 * Appliquer la normal map dans le fragment shader.
 *
 * On lit la couleur de la normal map, on la convertit en vecteur,
 * puis on la transforme dans l'espace monde via TBN.
 */
function applyNormalMap(
  normalMapColor: Vec3,  // couleur lue dans la texture (0-1 par canal)
  tbn: Mat4,
): Vec3 {
  // Convertir de [0, 1] vers [-1, 1]
  const tangentNormal = new Vec3(
    normalMapColor.x * 2 - 1,
    normalMapColor.y * 2 - 1,
    normalMapColor.z * 2 - 1,
  );

  // Transformer de l'espace tangent vers l'espace monde
  return tbn.transformVector(tangentNormal).normalize();
}
```

---

## IBL : Image Based Lighting

```
IBL (IMAGE BASED LIGHTING)
════════════════════════════════════════════════════════════════

L'IBL utilise une IMAGE (environment map) comme source de lumiere.
Au lieu de quelques lumieres ponctuelles, CHAQUE pixel de l'image
est une lumiere → eclairage naturel et detaille.

Composantes de l'IBL :
  1. IRRADIANCE MAP (diffuse)
     → Floute l'environment map pour obtenir la lumiere diffuse moyenne
     → Cubemap basse resolution (32x32 par face suffit)
     → Utilisee pour le terme Lambert de la BRDF

  2. PREFILTERED ENVIRONMENT MAP (specular)
     → Plusieurs niveaux de flou (mip levels) selon le roughness
     → roughness = 0 : image nette (reflet miroir)
     → roughness = 1 : image tres floue (reflet diffus)
     → Stockee dans les mip levels de la cubemap

  3. BRDF LUT (Look-Up Table)
     → Texture 2D precalculee (512x512)
     → Indexee par (NdotV, roughness)
     → Contient les coefficients de l'integrale de Fresnel

                  Environment map (HDR)
                  ┌────────────────┐
                  │   ☀️ ciel      │
                  │  ┌────┐       │
                  │  │sol │ arbre │
                  │  └────┘       │
                  └────────────────┘
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
     Irradiance   Prefiltered   BRDF LUT
     (diffuse)    (specular)    (integral)

Equation IBL simplifiee :
  diffuse_ibl  = irradiance(N) * albedo * kD
  specular_ibl = prefilteredColor(R, roughness) * (F * brdfLUT.x + brdfLUT.y)
  ambient      = (diffuse_ibl + specular_ibl) * ao
```

```typescript
// ── ibl-concept.ts ────────────────────────────────────

/**
 * Eclairage IBL simplifie (conceptuel).
 *
 * En pratique, les lookups se font dans des cubemaps precalculees.
 * Ici on simule avec des fonctions analytiques.
 */
function iblLighting(
  material: PBRMaterial,
  normal: Vec3,
  viewDir: Vec3,
): Vec3 {
  const N = normal.normalize();
  const V = viewDir.normalize();
  const NdotV = Math.max(0.001, N.dot(V));

  // F0
  const F0_dielectric = new Vec3(0.04, 0.04, 0.04);
  const F0 = F0_dielectric.lerp(material.albedo, material.metallic);

  // Fresnel (avec roughness)
  const F = fresnelSchlickRoughness(NdotV, F0, material.roughness);

  // --- Diffuse IBL (irradiance map lookup simplifie) ---
  const kD = new Vec3(1 - F.x, 1 - F.y, 1 - F.z).scale(1 - material.metallic);
  const skyColor = new Vec3(0.5, 0.7, 1.0);
  const groundColor = new Vec3(0.3, 0.2, 0.1);
  const irradiance = groundColor.lerp(skyColor, N.y * 0.5 + 0.5);
  const diffuseIBL = kD.multiply(material.albedo).multiply(irradiance);

  // --- Specular IBL (prefiltered env map lookup simplifie) ---
  const R = N.scale(2 * NdotV).sub(V).normalize();
  const sharpColor = new Vec3(0.8, 0.9, 1.0);
  const blurColor = new Vec3(0.4, 0.5, 0.6);
  const prefilteredColor = sharpColor.lerp(blurColor, material.roughness);

  // BRDF LUT approximation (Karis)
  const brdfX = 1 - material.roughness * material.roughness * (1 - NdotV);
  const brdfY = material.roughness * (1 - NdotV);
  const specularIBL = prefilteredColor.multiply(
    F.scale(brdfX).add(new Vec3(brdfY, brdfY, brdfY)),
  );

  return diffuseIBL.add(specularIBL).scale(material.ao);
}
```

---

## HDR et Tone Mapping

```
HDR ET TONE MAPPING
════════════════════════════════════════════════════════════════

Les calculs PBR produisent des valeurs > 1.0 (High Dynamic Range).
L'ecran ne peut afficher que des valeurs dans [0, 1] (Low Dynamic Range).
Le TONE MAPPING compresse le HDR vers le LDR.

HDR (calcul brut) :        Tone Mapping :         LDR (ecran) :
  valeur = 5.0             Reinhard : 5/(1+5)=0.83   → affichable
  valeur = 0.1             Reinhard : 0.1/1.1=0.09   → affichable
  valeur = 100             Reinhard : 100/101=0.99    → affichable

Sans tone mapping :
  - Les zones eclairees sont "cramees" (tout blanc)
  - Pas de detail dans les highlights

Avec tone mapping :
  - Les hautes valeurs sont compressees graduellement
  - Les details sont preserves dans toute la plage
```

```typescript
// ── tone-mapping.ts ───────────────────────────────────

/**
 * Tone mapping de Reinhard (simple).
 *
 * Formule : output = color / (1 + color)
 * Avantage : simple, pas de parametres
 * Inconvenient : les couleurs sont desaturees
 */
function tonemapReinhard(color: Vec3): Vec3 {
  return new Vec3(
    color.x / (1 + color.x),
    color.y / (1 + color.y),
    color.z / (1 + color.z),
  );
}

/**
 * Tone mapping de Reinhard avec exposition.
 *
 * L'exposition controle la "luminosite" globale.
 */
function tonemapReinhardExposure(color: Vec3, exposure: number): Vec3 {
  const exposed = color.scale(exposure);
  return tonemapReinhard(exposed);
}

/**
 * Tone mapping ACES (Academy Color Encoding System).
 *
 * C'est le standard cinematographique.
 * Donne des couleurs plus saturees et un meilleur contraste
 * que Reinhard. Utilise dans la plupart des moteurs modernes.
 *
 * Approximation de Narkowicz (2015).
 */
function tonemapACES(color: Vec3): Vec3 {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;

  const map = (x: number): number => {
    const mapped = (x * (a * x + b)) / (x * (c * x + d) + e);
    return Math.max(0, Math.min(1, mapped));
  };

  return new Vec3(
    map(color.x),
    map(color.y),
    map(color.z),
  );
}

/**
 * Conversion lineaire → sRGB (gamma encoding).
 *
 * Les ecrans appliquent une courbe gamma (~2.2).
 * Il faut encoder en sRGB APRES le tone mapping.
 */
function linearToSRGB(color: Vec3): Vec3 {
  const gamma = 1 / 2.2;
  return new Vec3(
    Math.pow(Math.max(0, color.x), gamma),
    Math.pow(Math.max(0, color.y), gamma),
    Math.pow(Math.max(0, color.z), gamma),
  );
}

// Exemple
const hdr = new Vec3(3.0, 2.0, 1.5);
console.log('HDR:', hdr.toString());
console.log('Reinhard:', tonemapReinhard(hdr).toString());       // compresse vers ~0.75
console.log('ACES:', tonemapACES(hdr).toString());               // meilleur contraste
console.log('sRGB:', linearToSRGB(tonemapACES(hdr)).toString()); // pret pour l'ecran
```

---

## Exercice pratique

### Enonce

1. Implementez `phongLighting()` qui calcule l'eclairage de Phong complet (ambient + diffuse + specular)
2. Implementez `blinnPhongLighting()` avec le half-vector
3. Implementez `pbrDirectLight()` avec la BRDF Cook-Torrance (D, F, G)
4. Comparez les resultats pour un materiau plastique rouge et un materiau or

<details>
<summary>Voir la solution</summary>

```typescript
// --- Utilitaires ---

function toRadians(deg: number): number {
  return deg * Math.PI / 180;
}

// --- 1. Phong ---

function phongLighting(
  material: PhongMaterial,
  N: Vec3, L: Vec3, V: Vec3,
  lightColor: Vec3, ambientColor: Vec3,
): Vec3 {
  const n = N.normalize();
  const l = L.normalize();
  const v = V.normalize();

  // Ambient
  const ambient = ambientColor.multiply(material.ambient);

  // Diffuse Lambert
  const NdotL = Math.max(0, n.dot(l));
  const diffuse = lightColor.scale(NdotL).multiply(material.diffuse);

  // Specular Phong
  const R = n.scale(2 * n.dot(l)).sub(l).normalize();
  const RdotV = Math.max(0, R.dot(v));
  const spec = Math.pow(RdotV, material.shininess);
  const specular = lightColor.scale(spec).multiply(material.specular);

  return ambient.add(diffuse).add(specular);
}

// --- 2. Blinn-Phong ---

function blinnPhongLighting(
  material: PhongMaterial,
  N: Vec3, L: Vec3, V: Vec3,
  lightColor: Vec3, ambientColor: Vec3,
): Vec3 {
  const n = N.normalize();
  const l = L.normalize();
  const v = V.normalize();

  const ambient = ambientColor.multiply(material.ambient);

  const NdotL = Math.max(0, n.dot(l));
  const diffuse = lightColor.scale(NdotL).multiply(material.diffuse);

  // Half-vector
  const H = l.add(v).normalize();
  const NdotH = Math.max(0, n.dot(H));
  const spec = Math.pow(NdotH, material.shininess * 4);
  const specular = lightColor.scale(spec).multiply(material.specular);

  return ambient.add(diffuse).add(specular);
}

// --- 3. PBR Direct Light ---

function distributionGGX(NdotH: number, roughness: number): number {
  const a = roughness * roughness;
  const a2 = a * a;
  const d = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}

function fresnelSchlick(cosTheta: number, F0: Vec3): Vec3 {
  const p = Math.pow(1 - cosTheta, 5);
  return F0.add(new Vec3(1 - F0.x, 1 - F0.y, 1 - F0.z).scale(p));
}

function geometrySchlickGGX(NdotV: number, roughness: number): number {
  const r = roughness + 1;
  const k = (r * r) / 8;
  return NdotV / (NdotV * (1 - k) + k);
}

function geometrySmith(NdotV: number, NdotL: number, roughness: number): number {
  return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

function pbrDirectLight(
  material: PBRMaterial,
  N: Vec3, L: Vec3, V: Vec3,
  lightColor: Vec3,
): Vec3 {
  const n = N.normalize();
  const l = L.normalize();
  const v = V.normalize();
  const H = l.add(v).normalize();

  const NdotL = Math.max(0, n.dot(l));
  const NdotV = Math.max(0.001, n.dot(v));
  const NdotH = Math.max(0, n.dot(H));
  const HdotV = Math.max(0, H.dot(v));

  if (NdotL <= 0) return Vec3.ZERO;

  // F0
  const F0 = new Vec3(0.04, 0.04, 0.04).lerp(material.albedo, material.metallic);

  // Cook-Torrance
  const D = distributionGGX(NdotH, material.roughness);
  const F = fresnelSchlick(HdotV, F0);
  const G = geometrySmith(NdotV, NdotL, material.roughness);

  const specScalar = (D * G) / Math.max(0.001, 4 * NdotV * NdotL);
  const specular = F.scale(specScalar);

  // Diffuse
  const kD = new Vec3(1 - F.x, 1 - F.y, 1 - F.z).scale(1 - material.metallic);
  const diffuse = kD.multiply(material.albedo).scale(1 / Math.PI);

  return diffuse.add(specular).multiply(lightColor).scale(NdotL);
}

// --- 4. Comparaison ---

const phongMat: PhongMaterial = {
  ambient: new Vec3(0.1, 0.02, 0.02),
  diffuse: new Vec3(0.8, 0.1, 0.1),
  specular: new Vec3(1, 1, 1),
  shininess: 64,
};

const plasticPBR: PBRMaterial = {
  albedo: new Vec3(0.8, 0.1, 0.1),
  metallic: 0,
  roughness: 0.5,
  ao: 1,
};

const goldPBR: PBRMaterial = {
  albedo: new Vec3(1.0, 0.76, 0.33),
  metallic: 1,
  roughness: 0.3,
  ao: 1,
};

const N = Vec3.UP;
const L = new Vec3(1, 1, 0).normalize();
const V = new Vec3(0, 1, 1).normalize();
const white = new Vec3(1, 1, 1);
const ambient = new Vec3(0.1, 0.1, 0.1);

console.log('=== Comparaison des modeles ===');
console.log('Plastique rouge :');
console.log('  Phong      :', phongLighting(phongMat, N, L, V, white, ambient).toString());
console.log('  Blinn-Phong:', blinnPhongLighting(phongMat, N, L, V, white, ambient).toString());
console.log('  PBR        :', pbrDirectLight(plasticPBR, N, L, V, white).toString());

console.log('Or (PBR uniquement — Phong ne gere pas les metaux) :');
console.log('  PBR        :', pbrDirectLight(goldPBR, N, L, V, white).toString());
// L'or a un reflet dore (colore) et pas de diffuse — impossible avec Phong classique
```

</details>

---

## Resume

| Concept | Explication |
|---------|-------------|
| Lumiere directionnelle | Rayons paralleles, pas d'attenuation (soleil) |
| Lumiere ponctuelle | Rayons depuis un point, attenuation 1/d² (ampoule) |
| Spot | Cone de lumiere avec angle interieur/exterieur |
| Phong | Ambient + Diffuse (N·L) + Specular (R·V)^n |
| Blinn-Phong | Remplace R·V par N·H (half-vector) — plus efficace |
| PBR | Physically Based Rendering — conservation d'energie + microfacets |
| Metallic-Roughness | Workflow standard (glTF) : albedo, metallic, roughness |
| Distribution GGX | D — proportion de microfacets alignees avec H |
| Fresnel-Schlick | F — reflectivite augmente aux angles rasants |
| Geometry Smith | G — auto-ombrage des microfacets |
| Cook-Torrance | BRDF speculaire = D * F * G / (4 * NdotL * NdotV) |
| Normal mapping | Texture de normales perturbees en espace tangent (matrice TBN) |
| IBL | Eclairage par environment map (irradiance + prefiltered + BRDF LUT) |
| HDR | Valeurs > 1.0 issues du calcul physique |
| Tone mapping | Compression HDR → LDR (Reinhard, ACES) |
| sRGB | Correction gamma (lineaire → sRGB) pour l'affichage ecran |

---

## Pour aller plus loin

- [Learn OpenGL — PBR Theory](https://learnopengl.com/PBR/Theory)
- [Filament PBR (Google)](https://google.github.io/filament/Filament.html)
- [Real Shading in Unreal Engine 4 (Brian Karis)](https://blog.selfshadow.com/publications/s2013-shading-course/)
- [glTF PBR implementation reference](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#metallic-roughness-material)
- [Physically Based Rendering: From Theory to Implementation (PBRT book)](https://pbrt.org/)
- [HDRI Haven — Free HDR environment maps](https://polyhaven.com/hdris)
