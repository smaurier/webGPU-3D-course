# Lab 05 — Lumiere et materiaux

## Objectif

Implementer les modeles d'eclairage classiques (Lambert, Phong, Blinn-Phong) et le
modele PBR (Cook-Torrance) avec les fonctions GGX, Fresnel-Schlick et Smith.

## Concepts cles

### Lambert (diffus)

L'eclairage diffus depend de l'angle entre la normale N et la direction de la lumiere L :
`diffuse = max(0, dot(N, L))`

### Phong (speculaire)

Utilise le vecteur de reflexion R = `reflect(-L, N)` et la direction de vue V :
`specular = pow(max(0, dot(R, V)), shininess)`

### Blinn-Phong (speculaire ameliore)

Utilise le half-vector H = `normalize(L + V)` au lieu du vecteur de reflexion :
`specular = pow(max(0, dot(N, H)), shininess)`

### Attenuation de lumiere ponctuelle

`attenuation = 1 / (constant + linear * d + quadratic * d^2)`

### Spotlight (cone de lumiere)

Le facteur d'intensite depend de l'angle entre la direction du spot et la direction
vers le fragment. Utilise un cone interieur et exterieur pour un degrade doux.

### PBR — Cook-Torrance

Le BRDF speculaire PBR combine :
- **D** : distribution normale (GGX/Trowbridge-Reitz)
- **F** : Fresnel (Schlick)
- **G** : geometrie/masquage (Smith avec GGX)

`specular = (D * F * G) / (4 * dot(N, L) * dot(N, V))`

### Tone mapping et gamma

- **Reinhard** : `color / (color + 1)` — compresse les hautes valeurs
- **Linear -> sRGB** : `pow(color, 1/2.2)` — correction gamma pour l'affichage

## Exercices

```bash
npx tsx exercise.ts
```
