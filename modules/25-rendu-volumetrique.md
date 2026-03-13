# Module 25 — Rendu volumetrique

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 5/5        | 150 min       | [Lab 25](../labs/lab-25-rendu-volumetrique/) | [Quiz 25](../quizzes/quiz-25-rendu-volumetrique.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Expliquer ce qu'est un milieu participatif (participating media) et ses proprietes optiques
- Appliquer la loi de Beer-Lambert pour calculer la transmittance
- Distinguer in-scattering et out-scattering et leur role dans le transport de lumiere
- Implementer les fonctions de phase Henyey-Greenstein et Rayleigh
- Decrire l'equation du rendu volumetrique et son integration numerique
- Implementer le ray marching volumetrique avec pas fixe et adaptatif
- Creer differents types de brouillard : depth fog, height fog, exponential fog
- Implementer un eclairage volumetrique (god rays) par ray marching + shadow map
- Generer des nuages avec du bruit Perlin-Worley et le modele Beer-powder
- Comprendre la diffusion atmospherique de Rayleigh (ciel bleu) et de Mie (couchers de soleil)
- Implementer un fog volumetrique en WGSL compute pass
- Optimiser les performances avec le rendu half-res, la reprojection temporelle et le blue noise

---

<details>
<summary>Rappel du cours precedent — Global illumination et techniques screen-space (Module 24)</summary>

Au module 24, nous avons explore l'illumination globale en temps reel :

- **Illumination globale** : lumiere indirecte via rebonds, color bleeding, caustics
- **Light probes / SH** : capturer l'irradiance en 9 coefficients SH (bandes 0/1/2), interpolation trilineaire dans une grille 3D
- **Reflection probes** : cubemaps avec box projection pour les reflexions dans les interieurs
- **Cubemap convolution** : integrer l'hemisphere pour obtenir une irradiance map diffuse
- **VXGI** : voxeliser la scene, mipmaps 3D, cone tracing pour l'indirect
- **SSR** : ray march dans le depth buffer, Hi-Z tracing pour l'acceleration, fallback environment map
- **SSGI** : generaliser le SSR a toutes les directions pour le diffus indirect
- **TAA** : jitter projection (Halton), reprojection temporelle, neighborhood clamping (YCoCg), velocity buffer
- **HBAO+ / GTAO** : ambient occlusion base sur l'horizon, integration analytique par slice

Nous allons maintenant plonger dans le rendu volumetrique — simuler la lumiere qui traverse des milieux comme le brouillard, la fumee et les nuages.

</details>

---

## Milieux participatifs : quand l'air n'est pas vide

:::tip Analogie
Imagine que tu conduis dans un epais brouillard la nuit. Tes phares eclairent le brouillard lui-meme — tu vois des "rayons" de lumiere. Pourquoi ? Parce que les gouttelettes d'eau en suspension dans l'air interceptent la lumiere, en absorbent une partie, et en renvoient une partie vers tes yeux. L'air n'est plus "invisible" : il participe au transport de la lumiere. C'est exactement ce que font les milieux participatifs en 3D — le brouillard, la fumee, les nuages ne sont pas des surfaces mais des volumes qui interagissent avec chaque rayon lumineux.
:::

### Proprietes optiques d'un milieu participatif

```
Un milieu participatif a 3 proprietes :

1. Absorption (σ_a)
   La lumiere est convertie en chaleur
   → Le milieu "mange" la lumiere
   Exemple : fumee noire

2. Out-scattering (σ_s)
   La lumiere est deviee dans une autre direction
   → Le milieu "disperse" la lumiere
   Exemple : brouillard blanc

3. Extinction = absorption + scattering
   σ_t = σ_a + σ_s
   → Quantite totale de lumiere perdue par unite de distance

   Albedo du milieu = σ_s / σ_t
   → 0 = absorption pure (fumee noire)
   → 1 = scattering pur (brouillard blanc)

4. In-scattering
   Lumiere venant d'autres directions deviee VERS l'observateur
   → Le milieu "ajoute" de la lumiere (depuis les sources lumineuses)
   → C'est ce qui rend les god rays visibles

5. Emission (optionnel)
   Le milieu emet sa propre lumiere
   → Feu, lave, plasma
```

```
Schema du transport de lumiere dans un volume :

                    ☀ source lumineuse
                    |
                    |  in-scattering
                    |  (lumiere deviee vers l'oeil)
                    ↓
  Camera ← ← ← ← ●← ← ← ← ← ← Surface
         L_final   ↑     ↑
                   |     |
            absorption  out-scattering
            (lumiere    (lumiere deviee
             perdue)     ailleurs)

  L_final = L_surface × T(a,b) + ∫ L_inscattering × T(a,x) dx

  ou T(a,b) = transmittance entre les points a et b
```

---

## Loi de Beer-Lambert : la transmittance

La loi de Beer-Lambert decrit l'attenuation exponentielle de la lumiere a travers un milieu homogene.

```
Transmittance = fraction de lumiere qui survit

  T(d) = exp(-σ_t × d)

  σ_t = coefficient d'extinction (plus grand = plus opaque)
  d   = distance traversee

  Exemples :
  σ_t = 0.01 :  T(100m) = exp(-1) ≈ 0.37  → Brume legere
  σ_t = 0.1  :  T(100m) = exp(-10) ≈ 0.00 → Brouillard epais
  σ_t = 1.0  :  T(10m)  = exp(-10) ≈ 0.00 → Fumee dense

  Pour un milieu heterogene (densite variable) :
  T(a,b) = exp(-∫_a^b σ_t(x) dx)

  → On ne peut plus utiliser la formule simple
  → Il faut integrer numeriquement (ray marching)
```

```wgsl
// Transmittance pour un milieu homogene
fn beer_lambert(sigma_t: f32, distance: f32) -> f32 {
  return exp(-sigma_t * distance);
}

// Transmittance pour un milieu heterogene (ray marching)
fn transmittance_ray_march(
  origin: vec3f,
  direction: vec3f,
  max_dist: f32,
  num_steps: u32
) -> f32 {
  let step_size = max_dist / f32(num_steps);
  var optical_depth = 0.0; // Accumulation de σ_t × ds

  for (var i = 0u; i < num_steps; i++) {
    let t = (f32(i) + 0.5) * step_size;
    let pos = origin + direction * t;
    let density = sample_density(pos); // Fonction de densite du milieu
    optical_depth += density * step_size;
  }

  return exp(-optical_depth);
}
```

---

## Fonctions de phase : dans quelle direction la lumiere est-elle diffusee ?

### Isotrope

La lumiere est diffusee egalement dans toutes les directions. Utile comme approximation simple.

```
Phase isotrope :
  p(θ) = 1 / (4π)

  Distribution uniforme sur la sphere
```

### Henyey-Greenstein

La fonction de phase la plus utilisee en graphisme. Le parametre `g` controle l'asymetrie.

```
Henyey-Greenstein :

  p(θ) = (1 - g²) / (4π × (1 + g² - 2g × cos(θ))^(3/2))

  g = 0   : isotrope (diffusion egale partout)
  g > 0   : forward scattering (lumiere continue vers l'avant)
  g < 0   : back scattering (lumiere renvoyee vers la source)

  Valeurs typiques :
  - Brouillard :  g ≈ 0.7 - 0.85  (forward dominant)
  - Nuages :      g ≈ 0.85         (silver lining effect)
  - Fumee :       g ≈ 0.3 - 0.5

      g = -0.5          g = 0           g = 0.8
        ╱╲              ╱|╲              │╲
       ╱  ╲            ╱ | ╲             │ ╲
  ←───●    ╲      ←───● | ●───→    ←───●  ╲──→
       ╲  ╱            ╲ | ╱             │ ╱
        ╲╱              ╲|╱              │╱
   Back-scatter     Isotrope      Forward-scatter
```

```wgsl
fn henyey_greenstein(cos_theta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * cos_theta;
  return (1.0 - g2) / (4.0 * 3.14159 * pow(denom, 1.5));
}

// Double lobe : combine forward et back scattering
fn dual_lobe_phase(cos_theta: f32, g_forward: f32, g_back: f32, blend: f32) -> f32 {
  let forward = henyey_greenstein(cos_theta, g_forward);
  let back = henyey_greenstein(cos_theta, g_back);
  return mix(back, forward, blend);
}
```

### Rayleigh

Pour les tres petites particules (molecules d'air) : la lumiere bleue est plus diffusee que la rouge.

```
Rayleigh scattering :

  p(θ) = 3/(16π) × (1 + cos²(θ))

  σ_s ∝ 1/λ⁴

  λ = 440nm (bleu)  → σ_s eleve    → diffuse beaucoup
  λ = 680nm (rouge) → σ_s faible   → traverse sans etre devie

  → Ciel bleu le jour (lumiere bleue diffusee dans toutes les directions)
  → Coucher de soleil rouge (la lumiere traverse plus d'atmosphere,
     le bleu est completement diffuse, il ne reste que le rouge)
```

```wgsl
fn rayleigh_phase(cos_theta: f32) -> f32 {
  return 3.0 / (16.0 * 3.14159) * (1.0 + cos_theta * cos_theta);
}

// Coefficients de Rayleigh pour l'air au niveau de la mer
fn rayleigh_coefficients() -> vec3f {
  // σ_s par canal RGB (unites : 1/m)
  return vec3f(5.802e-6, 13.558e-6, 33.1e-6);
  // Rouge < Vert < Bleu → le bleu est 5.7x plus diffuse que le rouge
}
```

---

## Equation du rendu volumetrique

```
L'equation complete du rendu volumetrique :

  L(x, ω) = L_surface × T(x, x_surface)     ← lumiere de surface attenuee
           + ∫ T(x, x') × σ_s(x')            ← pour chaque point x' le long du rayon
             × ∫ p(ω, ω') × L_i(x', ω') dω' ← in-scattering (toutes directions)
             dx'

  En pratique, on simplifie :
  - On ne considere que l'eclairage direct (pas de multi-scattering)
  - L_i(x', ω') ≈ V(x', light) × L_light × p(ω, ω_light)

  Algorithme de ray marching :
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  accumulated_color = 0
  transmittance = 1

  Pour chaque pas le long du rayon :
    density = sample_density(position)
    if density > 0 :
      extinction = density × σ_t
      step_transmittance = exp(-extinction × step_size)

      // In-scattering : lumiere directe attenuee par la phase function
      visibility = shadow_test(position, light_dir)
      in_scatter = visibility × light_color × phase(view_dir, light_dir)
                 × density × σ_s

      // Integrer
      accumulated_color += transmittance × in_scatter × step_size
      transmittance *= step_transmittance

    if transmittance < 0.01 : break  // Early exit

  final_color = accumulated_color + transmittance × background_color
```

---

## Ray marching volumetrique : implementation

### Pas fixe

```wgsl
struct VolumeParams {
  camera_pos: vec3f,
  light_dir: vec3f,
  light_color: vec3f,
  sigma_a: f32,          // Coefficient d'absorption
  sigma_s: f32,          // Coefficient de scattering
  phase_g: f32,          // Parametre Henyey-Greenstein
  max_distance: f32,
  num_steps: u32,
}

@group(0) @binding(0) var<uniform> params: VolumeParams;
@group(0) @binding(1) var depth_texture: texture_2d<f32>;
@group(0) @binding(2) var color_texture: texture_2d<f32>;
@group(0) @binding(3) var shadow_map: texture_depth_2d;
@group(0) @binding(4) var shadow_sampler: sampler_comparison;
@group(0) @binding(5) var<uniform> light_vp: mat4x4f;
@group(0) @binding(6) var output: texture_storage_2d<rgba16float, write>;

fn sample_density(pos: vec3f) -> f32 {
  // Brouillard uniforme dans une boite
  if (pos.y < 0.0 || pos.y > 5.0) { return 0.0; }
  if (abs(pos.x) > 20.0 || abs(pos.z) > 20.0) { return 0.0; }

  // Densite decroissante avec la hauteur
  return exp(-pos.y * 0.5) * 0.1;
}

fn shadow_test(pos: vec3f) -> f32 {
  let light_clip = light_vp * vec4f(pos, 1.0);
  let light_ndc = light_clip.xyz / light_clip.w;
  let shadow_uv = light_ndc.xy * 0.5 + 0.5;
  let shadow_depth = light_ndc.z;

  return textureSampleCompare(
    shadow_map, shadow_sampler,
    vec2f(shadow_uv.x, 1.0 - shadow_uv.y),
    shadow_depth - 0.005
  );
}

@compute @workgroup_size(8, 8)
fn volumetric_fog(@builtin(global_invocation_id) gid: vec3u) {
  let screen_size = vec2f(textureDimensions(color_texture));
  let uv = (vec2f(gid.xy) + 0.5) / screen_size;

  // Direction du rayon
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  // Simplification : on suppose une camera look-at standard
  let ray_dir = normalize(vec3f(ndc.x * 1.33, ndc.y, -1.0));

  // Distance de la surface (depth buffer)
  let scene_depth = textureLoad(depth_texture, vec2i(gid.xy), 0).r;
  let scene_color = textureLoad(color_texture, vec2i(gid.xy), 0).rgb;

  let sigma_t = params.sigma_a + params.sigma_s;
  let step_size = params.max_distance / f32(params.num_steps);

  var accumulated = vec3f(0.0);
  var transmittance = 1.0;

  for (var i = 0u; i < params.num_steps; i++) {
    let t = (f32(i) + 0.5) * step_size;

    // Ne pas aller plus loin que la surface
    if (t > scene_depth * params.max_distance) { break; }

    let pos = params.camera_pos + ray_dir * t;
    let density = sample_density(pos);

    if (density > 0.001) {
      let extinction = density * sigma_t;
      let step_transmittance = exp(-extinction * step_size);

      // In-scattering
      let cos_theta = dot(ray_dir, params.light_dir);
      let phase = henyey_greenstein(cos_theta, params.phase_g);
      let visibility = shadow_test(pos);

      let in_scatter = visibility * params.light_color * phase
                     * density * params.sigma_s;

      // Integration (energy-conserving)
      // Formule exacte pour un pas constant :
      // integral = (in_scatter / extinction) × (1 - step_transmittance)
      let scatter_integral = in_scatter * (1.0 - step_transmittance) / max(extinction, 0.00001);
      accumulated += transmittance * scatter_integral;
      transmittance *= step_transmittance;

      if (transmittance < 0.01) { break; }
    }
  }

  // Combiner avec la couleur de la scene
  let final_color = accumulated + transmittance * scene_color;
  textureStore(output, gid.xy, vec4f(final_color, 1.0));
}
```

### Pas adaptatif vs pas fixe

```
Pas fixe :
  ●───●───●───●───●───●───●───●───●
  Chaque pas = meme taille
  + Simple, predictible
  - Gaspille des echantillons dans les zones vides
  - Pas assez precis dans les zones denses

Pas adaptatif :
  ●─────────●──●─●──●─────────────●
  Zone vide : grands pas
  Zone dense : petits pas
  + Meilleur rapport qualite/performance
  - Plus complexe a implementer

Jittered stepping (anti-banding) :
  ●──●───●──●───●──●───●──●───●──●
       + offset aleatoire par pixel
  → Convertit le banding en bruit (moins visible)
  → Combine avec accumulation temporelle = tres efficace
```

---

## Types de brouillard

### Depth fog (lineaire et exponentiel)

```wgsl
// Fog lineaire : transition nette entre debut et fin
fn linear_fog(distance: f32, fog_start: f32, fog_end: f32) -> f32 {
  return clamp((distance - fog_start) / (fog_end - fog_start), 0.0, 1.0);
}

// Fog exponentiel : attenuation douce (Beer-Lambert)
fn exponential_fog(distance: f32, density: f32) -> f32 {
  return 1.0 - exp(-density * distance);
}

// Fog exponentiel carre : transition encore plus douce
fn exponential_squared_fog(distance: f32, density: f32) -> f32 {
  let d = density * distance;
  return 1.0 - exp(-d * d);
}

// Application dans le fragment shader
@fragment
fn fs_with_fog(in: VertexOutput) -> @location(0) vec4f {
  let surface_color = pbr_lighting(in);
  let distance = length(in.world_pos - camera_pos);

  let fog_factor = exponential_fog(distance, 0.02);
  let fog_color = vec3f(0.7, 0.75, 0.8); // Gris-bleu

  let final_color = mix(surface_color.rgb, fog_color, fog_factor);
  return vec4f(final_color, 1.0);
}
```

### Height fog

```wgsl
// Height fog : brouillard qui se concentre pres du sol
fn height_fog(
  camera_pos: vec3f,
  fragment_pos: vec3f,
  fog_density: f32,
  fog_height: f32,       // Hauteur maximale du brouillard
  fog_falloff: f32        // Vitesse de decroissance verticale
) -> f32 {
  let ray = fragment_pos - camera_pos;
  let ray_length = length(ray);
  let ray_dir = ray / ray_length;

  // Integrer la densite le long du rayon en tenant compte de la hauteur
  // La densite decroit exponentiellement avec la hauteur :
  // density(h) = fog_density × exp(-fog_falloff × max(h - fog_height, 0))

  let a = camera_pos.y;
  let b = fragment_pos.y;

  // Si le rayon est horizontal, formule simplifiee
  if (abs(ray_dir.y) < 0.001) {
    let density = fog_density * exp(-fog_falloff * max(a, 0.0));
    return 1.0 - exp(-density * ray_length);
  }

  // Integration analytique le long du rayon
  let fog_amount = fog_density / fog_falloff
    * (exp(-fog_falloff * min(a, b))
     - exp(-fog_falloff * max(a, b)))
    / abs(ray_dir.y);

  return 1.0 - exp(-fog_amount);
}
```

---

## Eclairage volumetrique (God Rays)

```
God rays : la lumiere "visible" dans un milieu

  ☀───────────────────────────
  │   \   \   \   \
  │    \   \   \   \
  │     \   \   \   \   ←── Rayons visibles dans le brouillard/poussiere
  │      \   \   \   \
  │       ▓▓▓▓▓▓▓▓▓▓▓▓▓     Obstacle (arbre, fenetre...)
  │      ░░░░░░░░░░░░░░
  │     ░░ OMBRE ░░░░░░     ←── Zones d'ombre dans le volume
  │      ░░░░░░░░░░░░░░
  ─────────────────────────── Sol

  Technique :
  Pour chaque pixel de l'ecran :
    Ray march de la camera vers la surface
    A chaque pas, tester la shadow map
    Si eclaire → ajouter de la lumiere (in-scattering)
    Si dans l'ombre → rien
```

```wgsl
fn volumetric_light_rays(
  camera_pos: vec3f,
  ray_dir: vec3f,
  max_dist: f32,
  num_steps: u32
) -> vec3f {
  let step_size = max_dist / f32(num_steps);
  var light_accum = vec3f(0.0);
  var transmittance = 1.0;

  // Jitter le premier pas pour eviter le banding
  let jitter = blue_noise(gid.xy);
  let start_offset = jitter * step_size;

  for (var i = 0u; i < num_steps; i++) {
    let t = start_offset + f32(i) * step_size;
    let pos = camera_pos + ray_dir * t;

    let density = sample_fog_density(pos);
    if (density < 0.001) { continue; }

    // Tester la shadow map
    let shadow = sample_shadow_map(pos);

    // In-scattering (eclairage direct dans le volume)
    let cos_theta = dot(ray_dir, light_direction);
    let phase = henyey_greenstein(cos_theta, 0.7);

    let in_scatter = shadow * light_color * light_intensity
                   * phase * density;

    let extinction = density * sigma_t;
    let step_trans = exp(-extinction * step_size);

    light_accum += transmittance * in_scatter * (1.0 - step_trans) / max(extinction, 0.0001);
    transmittance *= step_trans;

    if (transmittance < 0.01) { break; }
  }

  return light_accum;
}
```

---

## Nuages : Perlin-Worley noise et Beer-powder

### Densite des nuages

```
Modelisation des nuages :

1. Shape noise (basse frequence)
   Perlin-Worley 3D → forme globale du nuage
   Remappe avec un weather map 2D (couverture, type)

2. Detail noise (haute frequence)
   Worley 3D → erode les bords du nuage
   Soustrait du shape noise pour ajouter du detail

3. Height gradient
   Differents types de nuages selon l'altitude :
   - Stratus (bas, plat)     : gradient [0.0, 0.3]
   - Cumulus (moyen, gonfle) : gradient [0.1, 0.7]
   - Cumulonimbus (haut)     : gradient [0.0, 1.0]

   Densite = shape_noise × height_gradient - detail_noise × 0.35
   Densite = max(densite, 0)     ← Pas de densite negative
```

```wgsl
// Remap utilitaire
fn remap(value: f32, low1: f32, high1: f32, low2: f32, high2: f32) -> f32 {
  return low2 + (value - low1) / (high1 - low1) * (high2 - low2);
}

fn sample_cloud_density(pos: vec3f) -> f32 {
  // Normaliser la hauteur dans la couche de nuages [cloud_bottom, cloud_top]
  let height_fraction = (pos.y - cloud_bottom) / (cloud_top - cloud_bottom);
  if (height_fraction < 0.0 || height_fraction > 1.0) { return 0.0; }

  // Weather map (2D, xz) : R = couverture, G = type
  let weather_uv = pos.xz * 0.0001 + 0.5;
  let weather = textureSampleLevel(weather_map, samp, weather_uv, 0.0);
  let coverage = weather.r;
  let cloud_type = weather.g;

  // Height gradient selon le type de nuage
  let stratus_gradient = smoothstep(0.0, 0.1, height_fraction)
                       * smoothstep(0.3, 0.2, height_fraction);
  let cumulus_gradient = smoothstep(0.0, 0.2, height_fraction)
                       * smoothstep(0.7, 0.5, height_fraction);
  let height_gradient = mix(stratus_gradient, cumulus_gradient, cloud_type);

  // Shape noise (Perlin-Worley 3D, 4 octaves empaquetees en RGBA)
  let shape_uv = pos * 0.0003;
  let shape = textureSampleLevel(shape_noise_3d, samp, shape_uv, 0.0);

  // FBM avec les 4 octaves
  let shape_fbm = shape.g * 0.625 + shape.b * 0.25 + shape.a * 0.125;
  var base_cloud = remap(shape.r, shape_fbm - 1.0, 1.0, 0.0, 1.0);

  // Appliquer la couverture et le gradient de hauteur
  base_cloud = remap(base_cloud * height_gradient, 1.0 - coverage, 1.0, 0.0, 1.0);
  base_cloud = max(base_cloud, 0.0);

  // Detail noise (Worley 3D, erode les bords)
  let detail_uv = pos * 0.001;
  let detail = textureSampleLevel(detail_noise_3d, samp, detail_uv, 0.0);
  let detail_fbm = detail.r * 0.625 + detail.g * 0.25 + detail.b * 0.125;

  // Eroder davantage au sommet du nuage
  let detail_modifier = mix(detail_fbm, 1.0 - detail_fbm, height_fraction);
  let final_density = remap(base_cloud, detail_modifier * 0.35, 1.0, 0.0, 1.0);

  return max(final_density, 0.0) * cloud_density_scale;
}
```

### Beer-Powder : eclairage des nuages

```
Beer-Lambert classique :
  T = exp(-σ_t × d)
  → Plus c'est dense, plus c'est sombre
  → Probleme : les bords fins des nuages sont trop clairs

Beer-Powder (approximation de multi-scattering) :
  T_beer_powder = 2 × exp(-σ_t × d) × (1 - exp(-2 × σ_t × d))

  → Le terme "powder" assombrit les bords fins
  → Simule la lumiere qui rebondit a l'interieur du nuage
  → Plus physiquement correct pour les nuages denses

      Beer seul          Beer-Powder
  ┌──────────────┐   ┌──────────────┐
  │  ░░░▒▒▓▓▒▒░░│   │  ░░▒▒▓▓▒▒░░░│
  │ ░░▒▒▓▓▓▓▒▒░ │   │ ░▒▒▓▓▓▓▒▒▒░ │
  │░░▒▒▓▓████▓▒░│   │░▒▒▓▓████▓▓▒░│
  │ ░░▒▒▓▓▓▓▒▒░ │   │ ░▒▒▓▓▓▓▒▒▒░ │
  │  ░░░▒▒▓▓▒▒░░│   │  ░░▒▒▓▓▒▒░░░│
  └──────────────┘   └──────────────┘
  Bords trop clairs   Bords plus sombres (realiste)
```

```wgsl
fn beer_powder(optical_depth: f32) -> f32 {
  let beer = exp(-optical_depth);
  let powder = 1.0 - exp(-optical_depth * 2.0);
  return 2.0 * beer * powder;
}

fn light_march_cloud(pos: vec3f, light_dir: vec3f, num_steps: u32) -> f32 {
  let step_size = 50.0; // Metres par pas (vers la lumiere)
  var optical_depth = 0.0;

  for (var i = 0u; i < num_steps; i++) {
    let sample_pos = pos + light_dir * f32(i + 1u) * step_size;
    optical_depth += sample_cloud_density(sample_pos) * step_size;
  }

  return beer_powder(optical_depth * sigma_t);
}

fn render_clouds(
  camera_pos: vec3f,
  ray_dir: vec3f
) -> vec4f {
  // Intersection avec la couche de nuages [cloud_bottom, cloud_top]
  let t_bottom = (cloud_bottom - camera_pos.y) / ray_dir.y;
  let t_top = (cloud_top - camera_pos.y) / ray_dir.y;
  let t_start = max(min(t_bottom, t_top), 0.0);
  let t_end = max(t_bottom, t_top);

  if (t_start >= t_end) { return vec4f(0.0, 0.0, 0.0, 0.0); }

  let num_steps = 64u;
  let step_size = (t_end - t_start) / f32(num_steps);

  var accumulated_color = vec3f(0.0);
  var transmittance = 1.0;

  // Jitter pour le banding
  let jitter = blue_noise_value(gid.xy) * step_size;

  for (var i = 0u; i < num_steps; i++) {
    let t = t_start + jitter + f32(i) * step_size;
    let pos = camera_pos + ray_dir * t;

    let density = sample_cloud_density(pos);
    if (density < 0.001) { continue; }

    // Light marching (6 pas vers le soleil)
    let light_energy = light_march_cloud(pos, sun_direction, 6u);

    // Phase function
    let cos_theta = dot(ray_dir, sun_direction);
    let phase = dual_lobe_phase(cos_theta, 0.8, -0.5, 0.7);

    // Ambient : lumiere diffuse du ciel
    let height_frac = (pos.y - cloud_bottom) / (cloud_top - cloud_bottom);
    let ambient = mix(vec3f(0.4, 0.45, 0.5), vec3f(0.6, 0.65, 0.7), height_frac);

    // Couleur du pas
    let light_color_step = sun_color * light_energy * phase + ambient * 0.2;

    let extinction = density * sigma_t;
    let step_trans = exp(-extinction * step_size);

    accumulated_color += transmittance * light_color_step * (1.0 - step_trans);
    transmittance *= step_trans;

    if (transmittance < 0.01) { break; }
  }

  return vec4f(accumulated_color, 1.0 - transmittance);
}
```

---

## Diffusion atmospherique

### Rayleigh + Mie = ciel realiste

```
Atmosphere terrestre :

                    Espace
  ─────────────────────────────── 100 km (bord de l'atmosphere)
        ╲                   ╱
         ╲    Rayleigh     ╱     Molecules d'air (N₂, O₂)
          ╲   σ ∝ 1/λ⁴   ╱      → Diffuse le bleu >> rouge
           ╲             ╱
            ╲           ╱
  ──────────────────────────────  ~10 km
              ╲   Mie  ╱        Aerosols, poussiere, pollution
               ╲      ╱         → Diffuse toutes les longueurs d'onde
                ╲    ╱           → Halo autour du soleil
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  Sol

  Ciel vu de jour (soleil haut) :
    Rayleigh dominant → bleu partout
    Mie faible → legere brume a l'horizon

  Coucher de soleil (soleil bas) :
    Traversee longue → Rayleigh a elimine tout le bleu
    Il ne reste que le rouge/orange
    Mie → halo dore autour du soleil
```

```wgsl
struct AtmosphereParams {
  sun_direction: vec3f,
  sun_intensity: f32,
  planet_radius: f32,        // 6371 km
  atmosphere_radius: f32,    // 6471 km
  rayleigh_scale_height: f32,  // 8 km
  mie_scale_height: f32,       // 1.2 km
  rayleigh_coeffs: vec3f,      // (5.802, 13.558, 33.1) × 10⁻⁶
  mie_coeff: f32,              // 3.996 × 10⁻⁶
  mie_g: f32,                  // 0.758
}

fn atmosphere_density(height: f32, scale_height: f32) -> f32 {
  return exp(-height / scale_height);
}

fn ray_sphere_intersect(
  origin: vec3f,
  direction: vec3f,
  center: vec3f,
  radius: f32
) -> vec2f {
  let oc = origin - center;
  let b = dot(oc, direction);
  let c = dot(oc, oc) - radius * radius;
  let disc = b * b - c;
  if (disc < 0.0) { return vec2f(-1.0, -1.0); }
  let sq = sqrt(disc);
  return vec2f(-b - sq, -b + sq);
}

fn compute_atmospheric_scattering(
  ray_origin: vec3f,
  ray_dir: vec3f,
  params: AtmosphereParams
) -> vec3f {
  let planet_center = vec3f(0.0, -params.planet_radius, 0.0);

  // Intersection avec l'atmosphere
  let atmo_hit = ray_sphere_intersect(
    ray_origin, ray_dir, planet_center, params.atmosphere_radius
  );
  if (atmo_hit.y < 0.0) { return vec3f(0.0); }

  let t_start = max(atmo_hit.x, 0.0);
  let t_end = atmo_hit.y;

  let num_steps = 32u;
  let step_size = (t_end - t_start) / f32(num_steps);

  var rayleigh_accum = vec3f(0.0);
  var mie_accum = vec3f(0.0);
  var optical_depth_r = vec3f(0.0);
  var optical_depth_m = 0.0;

  for (var i = 0u; i < num_steps; i++) {
    let t = t_start + (f32(i) + 0.5) * step_size;
    let pos = ray_origin + ray_dir * t;
    let height = length(pos - planet_center) - params.planet_radius;

    // Densite a cette altitude
    let density_r = atmosphere_density(height, params.rayleigh_scale_height) * step_size;
    let density_m = atmosphere_density(height, params.mie_scale_height) * step_size;

    optical_depth_r += params.rayleigh_coeffs * density_r;
    optical_depth_m += params.mie_coeff * density_m;

    // Light marching vers le soleil
    let sun_hit = ray_sphere_intersect(
      pos, params.sun_direction, planet_center, params.atmosphere_radius
    );
    let sun_steps = 8u;
    let sun_step = sun_hit.y / f32(sun_steps);

    var sun_optical_r = vec3f(0.0);
    var sun_optical_m = 0.0;

    for (var j = 0u; j < sun_steps; j++) {
      let sun_t = (f32(j) + 0.5) * sun_step;
      let sun_pos = pos + params.sun_direction * sun_t;
      let sun_height = length(sun_pos - planet_center) - params.planet_radius;

      sun_optical_r += params.rayleigh_coeffs
        * atmosphere_density(sun_height, params.rayleigh_scale_height) * sun_step;
      sun_optical_m += params.mie_coeff
        * atmosphere_density(sun_height, params.mie_scale_height) * sun_step;
    }

    // Transmittance totale (camera → point → soleil)
    let total_optical = optical_depth_r + sun_optical_r
                      + (optical_depth_m + sun_optical_m) * vec3f(1.0);
    let attenuation = exp(-total_optical);

    rayleigh_accum += attenuation * density_r;
    mie_accum += attenuation * vec3f(density_m);
  }

  // Appliquer les phases et les coefficients
  let cos_theta = dot(ray_dir, params.sun_direction);
  let rayleigh_phase = rayleigh_phase(cos_theta);
  let mie_phase_val = henyey_greenstein(cos_theta, params.mie_g);

  let scatter = rayleigh_accum * params.rayleigh_coeffs * rayleigh_phase
              + mie_accum * params.mie_coeff * mie_phase_val;

  return scatter * params.sun_intensity;
}
```

---

## Three.js : brouillard et sky shader

```typescript
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 2000
);
camera.position.set(0, 10, 50);

// --- Brouillard Three.js natif ---
// Option A : fog lineaire
scene.fog = new THREE.Fog(0xcccccc, 10, 200);

// Option B : fog exponentiel
scene.fog = new THREE.FogExp2(0xcccccc, 0.01);

// --- Sky shader (Rayleigh + Mie) ---
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);

const skyUniforms = sky.material.uniforms;
skyUniforms.turbidity.value = 2;       // Clarte de l'air (0-20)
skyUniforms.rayleigh.value = 1;        // Coefficient Rayleigh
skyUniforms.mieCoefficient.value = 0.005;
skyUniforms.mieDirectionalG.value = 0.7;

// Position du soleil
const sun = new THREE.Vector3();
const phi = THREE.MathUtils.degToRad(90 - 20); // Elevation 20°
const theta = THREE.MathUtils.degToRad(180);    // Azimut
sun.setFromSphericalCoords(1, phi, theta);
skyUniforms.sunPosition.value.copy(sun);

// --- Volumetric fog custom (post-processing) ---
const volumetricFogShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: camera.near },
    cameraFar: { value: camera.far },
    fogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
    fogDensity: { value: 0.02 },
    fogHeight: { value: 5.0 },
    fogFalloff: { value: 0.5 },
    cameraPosition: { value: camera.position },
    inverseProjectionMatrix: { value: camera.projectionMatrixInverse },
    inverseViewMatrix: { value: camera.matrixWorld },
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 fogColor;
    uniform float fogDensity;
    uniform float fogHeight;
    uniform float fogFalloff;
    uniform vec3 cameraPosition;
    uniform mat4 inverseProjectionMatrix;
    uniform mat4 inverseViewMatrix;

    varying vec2 vUv;

    float linearize_depth(float d) {
      return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
    }

    void main() {
      vec4 sceneColor = texture2D(tDiffuse, vUv);
      float depth = texture2D(tDepth, vUv).r;
      float linearDepth = linearize_depth(depth);

      // Reconstruire la position monde
      vec4 clipPos = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 viewPos = inverseProjectionMatrix * clipPos;
      viewPos /= viewPos.w;
      vec3 worldPos = (inverseViewMatrix * viewPos).xyz;

      // Height fog
      float dist = length(worldPos - cameraPosition);
      float heightFactor = exp(-fogFalloff * max(worldPos.y, 0.0));
      float fogAmount = 1.0 - exp(-fogDensity * dist * heightFactor);
      fogAmount = clamp(fogAmount, 0.0, 1.0);

      gl_FragColor = vec4(mix(sceneColor.rgb, fogColor, fogAmount), 1.0);
    }
  `,
};

// Utiliser avec EffectComposer + ShaderPass
```

---

## Performance : optimisations essentielles

### Half-resolution rendering

```
Full-res (1920x1080) :     Half-res (960x540) + upsample :
  1920 × 1080 = 2M pixels    960 × 540 = 518K pixels (4x moins)
  64 pas × 2M = 128M samples  64 pas × 518K = 33M samples
  ~8ms GPU                     ~2ms GPU + 0.3ms upsample

  Bilateral upsample :
  Utiliser le depth buffer pleine resolution pour
  eviter les halos aux bords des objets lors de l'upsample
```

### Reprojection temporelle

```
Frame N : ray marcher 32 pas → resultat bruite
Frame N+1 : melanger 90% frame N (reprojetee) + 10% frame N+1
→ Equivalent a ~320 pas apres 10 frames
→ Qualite bien meilleure sans cout supplementaire

  Cle : reprojeter avec les motion vectors (comme le TAA)
  Invalider si la profondeur a trop change (desocclusion)
```

### Blue noise dithering

```
White noise :                Blue noise :
┌───────────────────┐       ┌───────────────────┐
│▓░▒▓░▒░▓▒░▓░▒▓▒░▓│       │░▒░▓░▒░▓░▒░▓░▒░▓░│
│░▒▓░▓▒▓░▒▓░▒▓░▒▓░│       │▓░▒░▓░▒░▓░▒░▓░▒░▓│
│▓▒░▓░▒░▓▒░▓░▒▓░▒▓│       │░▓░▒░▓░▒░▓░▒░▓░▒░│
│░▓▒░▓▒▓░▒▓░▒▓░▒▓░│       │▒░▓░▒░▓░▒░▓░▒░▓░▒│
└───────────────────┘       └───────────────────┘
Clusters visibles           Distribution uniforme
Derangeant visuellement     Agreable, "fondu" perceptuellement

→ Utiliser une texture blue noise 128x128
→ Offset = blue_noise[pixel % 128] pour le jitter du ray marching
→ Avec accumulation temporelle, le bruit disparait rapidement
```

```wgsl
@group(0) @binding(7) var blue_noise_tex: texture_2d<f32>;

fn blue_noise_value(pixel: vec2u) -> f32 {
  let noise_pixel = pixel % vec2u(128u, 128u);
  return textureLoad(blue_noise_tex, vec2i(noise_pixel), 0).r;
}

// Animer le blue noise entre frames pour la reprojection temporelle
fn animated_blue_noise(pixel: vec2u, frame: u32) -> f32 {
  let base = blue_noise_value(pixel);
  // Golden ratio pour les offsets temporels
  let golden_ratio = 0.618033988749;
  return fract(base + f32(frame) * golden_ratio);
}
```

---

## Pratique

### Exercice VOL.1 — Height fog + god rays en Three.js

Creer une scene avec :
1. Un terrain genere (PlaneGeometry + displacement)
2. Un height fog qui se concentre dans les vallees
3. Un soleil directionnel avec des god rays (ray march dans un ShaderPass)
4. Parametre `fogDensity`, `fogHeight` et `sunIntensity` ajustables avec dat.gui

```typescript
// TODO: Creer le terrain (PlaneGeometry + PerlinNoise displacement)
// TODO: Ajouter des objets (arbres = CylinderGeometry + SphereGeometry)
// TODO: Implementer le height fog en post-processing
// TODO: Ajouter le volumetric light scattering
// TODO: Combiner fog + god rays + scene
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';

// --- Setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 500
);
camera.position.set(0, 15, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 5, 0);
controls.update();

// --- Terrain ---
const terrainGeo = new THREE.PlaneGeometry(100, 100, 128, 128);
terrainGeo.rotateX(-Math.PI / 2);

const vertices = terrainGeo.attributes.position;
for (let i = 0; i < vertices.count; i++) {
  const x = vertices.getX(i);
  const z = vertices.getZ(i);
  // Simple noise (sin-based pour la demo)
  const height = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3
               + Math.sin(x * 0.05 + 1) * Math.cos(z * 0.07) * 5;
  vertices.setY(i, height);
}
terrainGeo.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshStandardMaterial({ color: 0x3a7c3a, roughness: 0.9 })
);
terrain.receiveShadow = true;
scene.add(terrain);

// --- Arbres simples ---
for (let i = 0; i < 30; i++) {
  const x = (Math.random() - 0.5) * 80;
  const z = (Math.random() - 0.5) * 80;
  const y = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3
          + Math.sin(x * 0.05 + 1) * Math.cos(z * 0.07) * 5;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.3, 3, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3520 })
  );
  trunk.position.set(x, y + 1.5, z);
  trunk.castShadow = true;
  scene.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x2d5a1e })
  );
  foliage.position.set(x, y + 4, z);
  foliage.castShadow = true;
  scene.add(foliage);
}

// --- Lumiere ---
const sunLight = new THREE.DirectionalLight(0xffeedd, 2);
sunLight.position.set(20, 30, 10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -50;
sunLight.shadow.camera.right = 50;
sunLight.shadow.camera.top = 50;
sunLight.shadow.camera.bottom = -50;
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x404060, 0.5));

// --- Depth render target ---
const depthTarget = new THREE.WebGLRenderTarget(
  window.innerWidth, window.innerHeight
);
depthTarget.depthTexture = new THREE.DepthTexture(
  window.innerWidth, window.innerHeight
);
depthTarget.depthTexture.type = THREE.FloatType;

// --- Height fog + god rays shader ---
const fogGodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    cameraNear: { value: camera.near },
    cameraFar: { value: camera.far },
    fogColor: { value: new THREE.Color(0.75, 0.78, 0.82) },
    fogDensity: { value: 0.03 },
    fogHeight: { value: 8.0 },
    fogFalloff: { value: 0.3 },
    sunDirection: { value: new THREE.Vector3() },
    sunColor: { value: new THREE.Color(1.0, 0.9, 0.7) },
    sunIntensity: { value: 1.5 },
    cameraPos: { value: camera.position },
    invProjMatrix: { value: camera.projectionMatrixInverse },
    invViewMatrix: { value: camera.matrixWorld },
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 fogColor;
    uniform float fogDensity;
    uniform float fogHeight;
    uniform float fogFalloff;
    uniform vec3 sunDirection;
    uniform vec3 sunColor;
    uniform float sunIntensity;
    uniform vec3 cameraPos;
    uniform mat4 invProjMatrix;
    uniform mat4 invViewMatrix;

    varying vec2 vUv;

    float linearDepth(float d) {
      return cameraNear * cameraFar / (cameraFar - d * (cameraFar - cameraNear));
    }

    // Henyey-Greenstein
    float hg(float cosTheta, float g) {
      float g2 = g * g;
      float denom = 1.0 + g2 - 2.0 * g * cosTheta;
      return (1.0 - g2) / (12.566 * pow(denom, 1.5));
    }

    void main() {
      vec4 sceneColor = texture2D(tDiffuse, vUv);
      float depth = texture2D(tDepth, vUv).r;

      // Reconstruire la position monde
      vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 view = invProjMatrix * clip;
      view /= view.w;
      vec3 worldPos = (invViewMatrix * view).xyz;

      vec3 rayDir = normalize(worldPos - cameraPos);
      float dist = length(worldPos - cameraPos);

      // Height fog
      float heightFactor = exp(-fogFalloff * max(worldPos.y, 0.0));
      float fogAmount = 1.0 - exp(-fogDensity * dist * heightFactor);

      // Simple god rays : in-scattering le long du rayon
      float godRays = 0.0;
      int numSteps = 16;
      float stepSize = dist / float(numSteps);
      float cosTheta = dot(rayDir, sunDirection);

      for (int i = 0; i < 16; i++) {
        float t = (float(i) + 0.5) * stepSize;
        vec3 samplePos = cameraPos + rayDir * t;
        float h = max(samplePos.y, 0.0);
        float localDensity = fogDensity * exp(-fogFalloff * h);
        float phase = hg(cosTheta, 0.7);
        godRays += localDensity * phase * stepSize;
      }

      vec3 volumetricLight = sunColor * sunIntensity * godRays;

      vec3 finalColor = mix(sceneColor.rgb, fogColor, clamp(fogAmount, 0.0, 1.0));
      finalColor += volumetricLight;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};

// --- Composer ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const fogPass = new ShaderPass(fogGodRaysShader);
composer.addPass(fogPass);

// --- GUI ---
const params = {
  fogDensity: 0.03,
  fogHeight: 8.0,
  fogFalloff: 0.3,
  sunIntensity: 1.5,
  sunElevation: 20,
};

const gui = new GUI();
gui.add(params, 'fogDensity', 0, 0.1, 0.001);
gui.add(params, 'fogHeight', 0, 20, 0.5);
gui.add(params, 'fogFalloff', 0, 2, 0.05);
gui.add(params, 'sunIntensity', 0, 5, 0.1);
gui.add(params, 'sunElevation', -10, 90, 1);

// --- Render loop ---
function animate(): void {
  requestAnimationFrame(animate);

  // Mettre a jour les uniforms
  fogPass.uniforms.fogDensity.value = params.fogDensity;
  fogPass.uniforms.fogHeight.value = params.fogHeight;
  fogPass.uniforms.fogFalloff.value = params.fogFalloff;
  fogPass.uniforms.sunIntensity.value = params.sunIntensity;

  const phi = THREE.MathUtils.degToRad(90 - params.sunElevation);
  const sunDir = new THREE.Vector3(
    Math.sin(phi) * Math.cos(0),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(0)
  ).normalize();
  fogPass.uniforms.sunDirection.value.copy(sunDir);
  sunLight.position.copy(sunDir).multiplyScalar(50);

  fogPass.uniforms.cameraPos.value.copy(camera.position);
  fogPass.uniforms.invProjMatrix.value.copy(camera.projectionMatrixInverse);
  fogPass.uniforms.invViewMatrix.value.copy(camera.matrixWorld);

  // Render depth
  renderer.setRenderTarget(depthTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  fogPass.uniforms.tDepth.value = depthTarget.depthTexture;

  composer.render();
}
animate();
```

</details>

---

## Resume

| Concept | Description | Formule / Cout |
|---------|-------------|:--------------:|
| **Milieu participatif** | Volume qui absorbe, diffuse et emet de la lumiere | sigma_t = sigma_a + sigma_s |
| **Beer-Lambert** | Transmittance exponentielle a travers un milieu homogene | T = exp(-sigma_t × d) |
| **In/Out-scattering** | Lumiere deviee vers/hors de la direction d'observation | Integrale sur la sphere |
| **Henyey-Greenstein** | Phase function parametrique (g: forward/back scatter) | g=0 isotrope, g=0.8 forward |
| **Rayleigh** | Diffusion par petites particules, sigma proportionnel a 1/lambda^4 | Ciel bleu, couchee de soleil |
| **Ray marching** | Integration numerique le long du rayon, pas fixe ou adaptatif | 32-128 pas typiquement |
| **Depth fog** | Lineaire ou exponentiel, base sur la distance camera-fragment | ~0.1ms (fragment shader) |
| **Height fog** | Densite decroissant exponentiellement avec l'altitude | ~0.1ms (fragment shader) |
| **God rays** | Ray march + shadow map sampling le long du rayon | ~1-3ms (16-32 pas) |
| **Cloud noise** | Perlin-Worley shape + Worley detail + weather map + height gradient | 3D textures |
| **Beer-powder** | 2 × exp(-d) × (1 - exp(-2d)), simule le multi-scattering dans les nuages | Approximation rapide |
| **Atmosphere** | Rayleigh (molecules) + Mie (aerosols) integres le long du rayon | ~2ms (32+8 pas) |
| **Half-res render** | Rendre le volume a 1/4 des pixels, upsample bilateral | 4x plus rapide |
| **Reprojection temporelle** | Reutiliser 90% de la frame precedente (reprojetee) | Qualite gratuite |
| **Blue noise** | Distribution de bruit uniforme pour le jitter du ray marching | Banding invisible |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [24 - Global illumination](./24-global-illumination-screen-space.md) | [26 - WebXR et animation procedurale](./26-webxr-animation-procedurale.md) |

**Ressources associees :**
- [Lab 25 — Rendu volumetrique](../labs/lab-25-rendu-volumetrique/)
- [Quiz 25 — Rendu volumetrique](../quizzes/quiz-25-rendu-volumetrique.html)
