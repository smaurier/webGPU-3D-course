---
titre: Lumière, matériaux et PBR
cours: 20-webgpu-3d
notions:
  - "modèle diffus de Lambert (N·L)"
  - "spéculaire Phong (R·V)"
  - "spéculaire Blinn-Phong (half-vector N·H)"
  - normales et normalisation
  - "PBR : conservation d'énergie"
  - "microfacettes et roughness"
  - "BRDF Cook-Torrance (D, F, G)"
  - "distribution GGX / Trowbridge-Reitz"
  - "Fresnel-Schlick et F0"
  - "workflow metallic-roughness (glTF)"
outcomes:
  - sait implémenter un éclairage diffus de Lambert à partir de la normale et de la direction de lumière
  - sait implémenter un spéculaire Blinn-Phong avec le half-vector et expliquer pourquoi il remplace Phong
  - sait décrire les 4 principes du PBR (conservation d'énergie, microfacettes, Fresnel, metallic vs diélectrique)
  - sait assembler la BRDF Cook-Torrance (D GGX, F Schlick, G Smith) pour une lumière directe
  - sait choisir albedo/metallic/roughness/F0 pour un matériau réaliste (or, plastique)
prerequis:
  - "algèbre linéaire 3D — module 01 (produit scalaire, normalisation)"
  - "transformations et normales — module 02"
  - "pipeline de rendu — module 04 (fragment shader, où se calcule l'éclairage)"
next: 06-webgl-fondamentaux
libs: []
tribuzen: rendu 3D TribuZen — matériau PBR d'un trophée métallique de sortie (badge « rando bouclée »)
last-reviewed: 2026-07
---

# Lumière, matériaux et PBR

> **Outcomes — tu sauras FAIRE :** implémenter un diffus Lambert et un spéculaire Blinn-Phong dans un shader, assembler la BRDF Cook-Torrance (D/F/G), et régler albedo/metallic/roughness pour un matériau réaliste.
> **Difficulté :** :star::star::star::star:

## 1. Cas concret d'abord

TribuZen veut récompenser les familles : à chaque sortie bouclée (une rando, un pique-nique), l'app débloque un **trophée 3D** affiché sur le profil. Le design demande un **trophée en or, métallique et brillant**, qui tourne lentement sous une lumière de studio.

Tu poses une sphère dorée dans le fragment shader avec le premier réflexe « débutant » :

```wgsl
// fragment shader — première tentative NAÏVE
fn shade(N: vec3f, L: vec3f, albedo: vec3f) -> vec3f {
  let diffuse = max(dot(N, L), 0.0);   // Lambert seul
  return albedo * diffuse;             // ← résultat : sphère plate, mate, en carton
}
```

Le rendu est décevant : l'or ressemble à du **carton jaune mat**. Il manque tout ce qui fait « métal » :

1. **Aucun reflet spéculaire** — un métal poli a un point brillant net là où la lumière rebondit vers l'œil.
2. **La couleur ne dépend pas de l'angle de vue** — un vrai métal réfléchit plus fort sur les bords (Fresnel).
3. **Le reflet de l'or est doré, pas blanc** — sur un métal, c'est la couleur du métal qui teinte le reflet, contrairement au plastique.

Ce module construit, étape par étape, le shader qui transforme ce carton jaune en or crédible : Lambert → Blinn-Phong → **PBR metallic-roughness**.

---

## 2. Théorie complète, concise

### 2.1 La normale : l'entrée de tout éclairage

Tout l'éclairage part de trois vecteurs **normalisés** définis en chaque point de surface :

```
N = normale de la surface  (perpendiculaire, vers l'extérieur)
L = direction VERS la lumière
V = direction VERS la caméra (l'œil)
```

Le produit scalaire `dot(N, L)` mesure l'alignement entre la surface et la lumière : il vaut `cos(θ)`, l'angle entre les deux. Si `N` ou `L` n'est **pas normalisé**, `dot` ne vaut plus le cosinus et tout l'éclairage est faux. D'où la règle : normaliser N, L, V avant toute formule.

### 2.2 Diffus de Lambert

La lumière diffuse frappe la surface et **rebondit dans toutes les directions** de façon uniforme (surface mate). Son intensité ne dépend donc **que** de l'angle d'incidence, pas de la position de la caméra :

```
diffuse = max(0, N·L) * lightColor * albedo
```

Le `max(0, …)` coupe la contribution quand la surface tourne le dos à la lumière (`N·L < 0`). `albedo` est la couleur de base du matériau.

### 2.3 Spéculaire Phong

Le spéculaire est le **reflet brillant** : la lumière rebondit de façon quasi-miroir. Il dépend de l'angle entre le rayon **réfléchi** `R` et la direction de vue `V`. Phong calcule :

```
R = reflect(-L, N) = 2 * (N·L) * N - L
specular = pow(max(0, R·V), shininess) * lightColor * specColor
```

`shininess` (exposant) contrôle la taille du reflet : petit → reflet large et mou (plastique), grand → reflet punaisé (métal poli).

### 2.4 Spéculaire Blinn-Phong (le half-vector)

Blinn-Phong remplace le calcul de `R` par le **half-vector** `H`, à mi-chemin entre `L` et `V` :

```
H = normalize(L + V)
specular = pow(max(0, N·H), shininess) * lightColor * specColor
```

Deux raisons de préférer Blinn-Phong :

- **Moins cher / plus stable** : pas de calcul de réflexion, et le rendu aux angles rasants est meilleur (Phong produit un reflet qui se coupe brutalement).
- **`N·H` converge plus lentement que `R·V`** : pour un reflet visuellement équivalent, il faut un exposant plus grand (facteur ~2 à 4). C'est purement une convention d'échelle.

Surtout, `H` est **la brique de base du PBR** : la BRDF Cook-Torrance raisonne elle aussi sur l'alignement des microfacettes avec `H`.

### 2.5 PBR : les 4 principes

Le PBR (*Physically Based Rendering*) est le standard actuel. Il repose sur quatre idées physiques.

**1. Conservation d'énergie.** La lumière réfléchie ne peut pas dépasser la lumière reçue. Ce qui part en reflet spéculaire ne peut pas repartir en diffus : `diffuse + specular ≤ 1`. Plus une surface est réfléchissante, plus elle est sombre en diffus.

**2. Microfacettes.** À l'échelle micro, une surface est une multitude de mini-miroirs. La **roughness** (rugosité) décrit leur désordre :

```
roughness = 0  → microfacettes alignées → reflet net et concentré
roughness = 1  → microfacettes désordonnées → reflet large et diffus
```

**3. Fresnel.** Toute surface réfléchit **plus** aux angles rasants. Une table en bois vue de face reflète peu ; vue en rasant, elle devient presque un miroir. La réflectance à incidence normale s'appelle **F0**.

**4. Metallic vs diélectrique.** Deux familles de matériaux :

```
Diélectrique (plastique, bois, peau) : F0 ≈ 0.04 (blanc), diffus COLORÉ (albedo)
Métal (or, cuivre, alu)              : F0 = couleur du métal, PAS de diffus
```

C'est le point n°3 du cas concret : sur l'or, le reflet est **doré** parce que `F0` vaut la couleur du métal ; et il n'y a pas de diffus parce que les métaux absorbent la lumière réfractée.

### 2.6 Workflow metallic-roughness (glTF / Three.js / Unreal)

Le standard industriel décrit un matériau par 3 paramètres intuitifs :

```
albedo (baseColor) : couleur de base RGB
metallic           : 0 = diélectrique, 1 = métal
roughness          : 0 = lisse (miroir), 1 = rugueux (mat)
```

Le shader en dérive les deux quantités physiques dont il a besoin :

```
F0           = mix(vec3(0.04), albedo, metallic)   // diélectrique blanc → couleur métal
diffuseColor = albedo * (1.0 - metallic)           // les métaux perdent le diffus
```

Quelques valeurs réalistes :

| Matériau  | albedo (linéaire)      | metallic | roughness |
|-----------|------------------------|----------|-----------|
| Or        | (1.0, 0.76, 0.33)      | 1.0      | 0.3       |
| Cuivre    | (0.95, 0.64, 0.54)     | 1.0      | 0.4       |
| Plastique | libre                  | 0.0      | 0.5       |
| Bois      | (0.53, 0.36, 0.24)     | 0.0      | 0.8       |

### 2.7 La BRDF Cook-Torrance (le cœur du PBR)

La BRDF (*Bidirectional Reflectance Distribution Function*) donne la fraction de lumière renvoyée de `L` vers `V`. Le terme spéculaire de Cook-Torrance combine **trois** fonctions (formules confirmées via learnopengl.com/PBR/Theory et google.github.io/filament) :

```
              D * F * G
f_specular = ───────────────────
             4 * (N·V) * (N·L)

D = distribution des normales des microfacettes (forme du reflet)
F = Fresnel (fraction réfléchie vs réfractée, monte aux angles rasants)
G = géométrie (auto-ombrage des microfacettes)
```

**D — GGX / Trowbridge-Reitz.** `α = roughness²` (remapping perceptuel) :

```
D(N, H, α) = α² / (π * ((N·H)² * (α² − 1) + 1)²)
```

**F — Fresnel-Schlick.** Part de `F0` à incidence normale, tend vers 1 au rasant :

```
F(H, V, F0) = F0 + (1 − F0) * (1 − (H·V))⁵
```

**G — Smith avec Schlick-GGX.** Combine le masquage vu de la lumière et de la caméra. Pour l'**éclairage direct**, `k = (roughness + 1)² / 8` :

```
G_sub(N, X, k) = (N·X) / ((N·X) * (1 − k) + k)
G = G_sub(N, V, k) * G_sub(N, L, k)
```

L'assemblage final pour une lumière directe (équation de réflectance) :

```
kS = F                                  // part spéculaire
kD = (1 − kS) * (1 − metallic)          // part diffuse, nulle sur métal
diffuse  = kD * albedo / π              // Lambert normalisé
specular = D * F * G / (4 * (N·V) * (N·L))
Lo = (diffuse + specular) * lightColor * (N·L)
```

> **Note.** `diffuse` est ici scalaire-par-canal via `albedo`, tandis que `F` (donc `kS`, `specular`) est un **vec3** : le Fresnel se calcule par canal RGB, ce qui donne au métal son reflet coloré.

---

## 3. Worked examples

### Exemple 1 — Blinn-Phong complet (le trophée en plastique)

On éclaire le trophée comme un objet **plastique rouge** brillant. Fragment shader WGSL :

```wgsl
// Blinn-Phong — une lumière directionnelle
fn blinnPhong(
  N: vec3f, L: vec3f, V: vec3f,   // supposés déjà normalisés
  albedo: vec3f, lightColor: vec3f,
  shininess: f32,
) -> vec3f {
  // 1. Ambiant : plancher d'éclairage indirect grossier
  let ambient = 0.05 * albedo;

  // 2. Diffus de Lambert
  let NdotL = max(dot(N, L), 0.0);
  let diffuse = NdotL * lightColor * albedo;

  // 3. Spéculaire Blinn-Phong via le half-vector
  let H = normalize(L + V);
  let NdotH = max(dot(N, H), 0.0);
  let spec = pow(NdotH, shininess);        // reflet blanc (plastique)
  let specular = spec * lightColor;

  return ambient + diffuse + specular;
}
```

Pour un plastique rouge : `albedo = vec3(0.8, 0.1, 0.1)`, `shininess = 64`. Le reflet est **blanc** (couleur de la lumière) car un diélectrique ne teinte pas son spéculaire — c'est exactement ce que le PBR formalisera avec `F0 = 0.04`.

### Exemple 2 — PBR Cook-Torrance (le trophée en or)

Maintenant l'or. On assemble D, F, G. Fragment shader WGSL :

```wgsl
const PI: f32 = 3.14159265;

fn distributionGGX(NdotH: f32, roughness: f32) -> f32 {
  let a  = roughness * roughness;   // remapping perceptuel α = roughness²
  let a2 = a * a;
  let d  = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn fresnelSchlick(HdotV: f32, F0: vec3f) -> vec3f {
  return F0 + (vec3f(1.0) - F0) * pow(1.0 - HdotV, 5.0);
}

fn geometrySchlickGGX(NdotX: f32, k: f32) -> f32 {
  return NdotX / (NdotX * (1.0 - k) + k);
}

fn geometrySmith(NdotV: f32, NdotL: f32, roughness: f32) -> f32 {
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;   // k pour lumière directe
  return geometrySchlickGGX(NdotV, k) * geometrySchlickGGX(NdotL, k);
}

fn pbrDirect(
  N: vec3f, L: vec3f, V: vec3f,
  albedo: vec3f, metallic: f32, roughness: f32,
  lightColor: vec3f,
) -> vec3f {
  let H = normalize(L + V);
  let NdotL = max(dot(N, L), 0.0);
  let NdotV = max(dot(N, V), 0.001);   // éviter la division par 0
  let NdotH = max(dot(N, H), 0.0);
  let HdotV = max(dot(H, V), 0.0);

  if (NdotL <= 0.0) { return vec3f(0.0); }  // surface de dos

  // F0 : 0.04 pour un diélectrique, couleur du métal si metallic = 1
  let F0 = mix(vec3f(0.04), albedo, metallic);

  // BRDF Cook-Torrance
  let D = distributionGGX(NdotH, roughness);
  let F = fresnelSchlick(HdotV, F0);
  let G = geometrySmith(NdotV, NdotL, roughness);

  let specular = (D * G) * F / (4.0 * NdotV * NdotL);

  // Diffus : nul sur un métal (kD * (1 - metallic))
  let kD = (vec3f(1.0) - F) * (1.0 - metallic);
  let diffuse = kD * albedo / PI;

  return (diffuse + specular) * lightColor * NdotL;
}
```

Appelé avec l'or `albedo = vec3(1.0, 0.76, 0.33)`, `metallic = 1.0`, `roughness = 0.3` : le reflet est **doré** (car `F0 = albedo`), il n'y a **pas de diffus** (`kD = 0` quand `metallic = 1`), et il monte aux bords via Fresnel. Le carton jaune du cas concret devient enfin de l'or.

---

## 4. Pièges & misconceptions

### PIÈGE #1 — Oublier de normaliser N, L, V

`dot(N, L)` ne vaut `cos(θ)` **que** si les deux vecteurs sont unitaires. Une normale interpolée entre deux sommets dans le fragment shader **n'est plus normalisée** (l'interpolation linéaire raccourcit le vecteur). Il faut `N = normalize(N)` en début de fragment shader, sinon l'éclairage s'assombrit sur les faces courbes.

### PIÈGE #2 — Croire que Phong et Blinn-Phong prennent le même exposant

`N·H` (Blinn) décroît **plus lentement** que `R·V` (Phong) autour du reflet. Copier le même `shininess` donne un reflet Blinn-Phong plus large que le Phong d'origine. Il faut typiquement multiplier l'exposant par ~2 à 4 pour retrouver la même taille de highlight. Ce n'est pas un bug, c'est la géométrie du half-vector.

### PIÈGE #3 — Mettre un reflet blanc sur un métal

Erreur la plus visible : garder `specColor = blanc` (réflexe plastique) sur un métal. Un métal **teinte** son reflet avec sa propre couleur. En PBR, c'est automatique : `F0 = mix(0.04, albedo, metallic)` fait passer le reflet de blanc (diélectrique) à la couleur du métal. Ne jamais coder un spéculaire blanc en dur pour un objet métallique.

### PIÈGE #4 — Garder du diffus sur un métal

Un métal pur n'a **pas** de composante diffuse (il absorbe la lumière réfractée). Oublier le facteur `(1 - metallic)` sur le diffus donne un métal laiteux et délavé. La formule `kD = (1 - F) * (1 - metallic)` annule le diffus quand `metallic = 1`.

### PIÈGE #5 — Confondre `roughness` et `α` (et sauter le remapping)

Le paramètre artistique `roughness` (perceptualRoughness) n'est **pas** le `α` de la formule GGX. Le remapping standard est `α = roughness²`, ce qui rend la variation visuellement linéaire pour l'œil. Passer `roughness` brut à GGX donne des surfaces qui paraissent toutes trop lisses dans la moitié basse du curseur.

### PIÈGE #6 — Division par zéro dans le dénominateur Cook-Torrance

Le `4 * (N·V) * (N·L)` au dénominateur explose quand la surface est vue en rasant (`N·V → 0`). Clamper avec `max(dot(N, V), 0.001)` évite les pixels blancs (NaN/Inf) sur la silhouette des objets.

---

## 5. Ancrage TribuZen

Le **trophée de sortie** est la feature 3D de ce module. Quand une famille boucle une activité, TribuZen affiche un badge 3D tournant sur le profil :

- **Trophée « rando »** : or poli → `metallic = 1.0`, `roughness = 0.3`, `albedo = (1.0, 0.76, 0.33)`. Reflet doré, brillant.
- **Trophée « premier pas »** : bronze mat → `metallic = 1.0`, `roughness = 0.6`, `albedo` cuivré. Même shader, reflet plus étalé.
- **Badge « participation »** : plastique coloré → `metallic = 0.0`, reflet blanc, diffus vif. Le shader retombe sur un simple Blinn-Phong perceptuel.

Un **seul** fragment shader PBR sert les trois : seuls les trois uniforms `albedo`/`metallic`/`roughness` changent. C'est tout l'intérêt du workflow metallic-roughness — un matériau, des réglages.

Fichiers cibles dans `smaurier/tribuzen` :

```
tribuzen/
  src/
    3d/
      shaders/
        pbr.wgsl            ← BRDF Cook-Torrance de l'Exemple 2
      materials/
        trophyMaterials.ts  ← presets or / bronze / plastique
      TrophyBadge.vue       ← canvas WebGPU qui fait tourner le trophée
```

> L'IBL (éclairage par environment map), le tone mapping HDR et le normal mapping enrichiront ce trophée dans les modules Three.js avancés (14, 17) ; ici on reste sur l'éclairage **direct** analytique, le socle indispensable.

---

## 6. Points clés

1. Tout éclairage part de N, L, V **normalisés** ; `dot(N, L) = cos(θ)` mesure l'alignement surface-lumière.
2. Diffus de Lambert : `max(0, N·L) * lightColor * albedo`, indépendant de la caméra.
3. Blinn-Phong remplace `R·V` (Phong) par `N·H` avec le half-vector `H = normalize(L + V)` — plus stable, brique du PBR.
4. Les 4 principes PBR : conservation d'énergie, microfacettes (roughness), Fresnel (reflet aux bords), metallic vs diélectrique.
5. Workflow metallic-roughness : `F0 = mix(0.04, albedo, metallic)`, `diffuseColor = albedo * (1 - metallic)`.
6. Cook-Torrance : `specular = D * F * G / (4 * (N·V) * (N·L))` — D = GGX, F = Schlick, G = Smith.
7. GGX : `α = roughness²` puis `D = α² / (π * ((N·H)²(α²−1)+1)²)`.
8. Fresnel-Schlick : `F0 + (1 − F0)(1 − H·V)⁵` ; le reflet du métal est coloré car `F0 = albedo`.

---

## 7. Seeds Anki

```
Pourquoi faut-il normaliser la normale au début d'un fragment shader ?|La normale interpolée entre sommets n'est plus unitaire (l'interpolation linéaire la raccourcit). Sans normalize, dot(N,L) ne vaut plus cos(θ) et l'éclairage s'assombrit à tort sur les surfaces courbes.
Quelle est la différence entre Phong et Blinn-Phong pour le spéculaire ?|Phong utilise R·V (R = réflexion de L). Blinn-Phong utilise N·H avec H = normalize(L+V) (half-vector). Blinn est plus stable aux angles rasants et sert de base au PBR ; N·H décroît plus lentement, il faut donc un exposant ~2-4x plus grand.
Quels sont les 4 principes du PBR ?|1) Conservation d'énergie (diffuse+specular ≤ 1). 2) Microfacettes (roughness = désordre des mini-miroirs). 3) Fresnel (plus de reflet aux angles rasants). 4) Metallic vs diélectrique (métal = reflet coloré, pas de diffus ; diélectrique = reflet blanc F0≈0.04, diffus coloré).
Comment le workflow metallic-roughness calcule-t-il F0 et le diffuse ?|F0 = mix(vec3(0.04), albedo, metallic) — blanc pour un diélectrique, couleur du métal si metallic=1. diffuseColor = albedo * (1 - metallic) — les métaux perdent leur composante diffuse.
Quelle est la formule complète de la BRDF spéculaire Cook-Torrance ?|specular = (D * F * G) / (4 * (N·V) * (N·L)). D = distribution GGX (forme du reflet), F = Fresnel-Schlick (fraction réfléchie), G = géométrie Smith (auto-ombrage des microfacettes).
Quelle est la formule de la distribution GGX et le rôle de alpha ?|D = α² / (π * ((N·H)²(α²−1)+1)²), avec α = roughness² (remapping perceptuel). roughness bas → D très concentré (reflet punaisé) ; roughness haut → D étalé (reflet large).
Pourquoi le reflet d'un métal est-il coloré alors que celui d'un plastique est blanc ?|Le Fresnel F se calcule par canal RGB à partir de F0. Sur un diélectrique F0≈0.04 (gris neutre) → reflet blanc. Sur un métal F0 = albedo (couleur du métal) → reflet teinté (l'or reflète doré).
Pourquoi clamper N·V avec max(dot(N,V), 0.001) dans Cook-Torrance ?|Le dénominateur 4*(N·V)*(N·L) tend vers 0 aux angles rasants (silhouette de l'objet), produisant des NaN/Inf (pixels blancs). Le clamp à 0.001 borne le dénominateur.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-05-lumiere-materiaux-et-pbr/README.md`. Implémenter d'abord un Blinn-Phong, puis un shading PBR Cook-Torrance dans un shader qui tourne dans le navigateur — corrigé WGSL complet commenté.
