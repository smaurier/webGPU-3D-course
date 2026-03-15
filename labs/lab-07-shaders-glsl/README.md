# Lab 07 — Shaders et GLSL

## Objectif

Comprendre les fondamentaux des shaders GLSL : parsing de declarations, calcul de niveaux mipmap,
modes de wrapping des coordonnees de texture, interpolation bilineaire, génération de coordonnees UV
et manipulation de normales/tangentes.

## Concepts clés

### Uniform blocks et attributs GLSL

Les shaders GLSL declarent leurs entrees avec des mots-clés spécifiques :
- `uniform` pour les variables constantes par draw call (matrices, lumieres)
- `attribute` (où `in` en GLSL 300+) pour les donnees par sommet

Savoir parser ces declarations est utile pour construire automatiquement les bindings cote CPU.

### Niveaux Mipmap

Le nombre de niveaux mipmap d'une texture de dimensions `w x h` est :
`floor(log2(max(w, h))) + 1`. Chaque niveau divise les dimensions par 2.

### Wrapping de coordonnees de texture

- **Repeat** : `fract(u)` — la texture se repete
- **Clamp** : `clamp(u, 0, 1)` — les bords sont etires
- **Mirror** : rebondit à chaque entier

### Interpolation bilineaire

Pour echantillonner entre 4 texels, on interpole lineairement en U puis en V :
`lerp(lerp(c00, c10, u), lerp(c01, c11, u), v)`

### Coordonnees UV

- **Sphere** (mapping spherique) : `u = atan2(z, x) / (2*PI) + 0.5`, `v = asin(y) / PI + 0.5`
- **Box** (mapping cubique) : on projette selon l'axe dominant de la normale

### Normales et tangentes

- Pack/unpack : convertir une normale de `[-1,1]` vers `[0,1]` et inversement
- Vecteur tangent : calcule à partir des positions et UV d'un triangle (base TBN)

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
