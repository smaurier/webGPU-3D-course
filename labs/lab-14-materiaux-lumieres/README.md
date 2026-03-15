# Lab 14 — Materiaux et lumieres

## Objectif

Implementer les calculs fondamentaux lies aux materiaux PBR, aux textures, aux ombres
et aux conversions d'espace colorimetrique utilises dans les moteurs 3D modernes.

## Concepts clés

### Materiaux PBR (Physically Based Rendering)

Le modèle PBR utilise deux paramètres principaux :
- **Metalness** [0, 1] : 0 = dielectrique (plastique, bois), 1 = metal
- **Roughness** [0, 1] : 0 = parfaitement lisse (miroir), 1 = très rugueux

### Texture UV Tiling

Les coordonnees UV peuvent etre repetees et decalees :
`finalUV = fract(uv * repeat + offset)`
ou `fract(x)` retourne la partie fractionnaire de x.

### Shadow Mapping

- **Shadow map** : la scene est rendue du point de vue de la lumiere
- **Shadow bias** : petit decalage pour éviter le shadow acne
- **PCF** (Percentage Closer Filtering) : echantillonnage du voisinage pour adoucir les ombres
- **Cascaded Shadow Maps** : plusieurs niveaux de detail pour les ombres directionnelles

### Espace colorimetrique

- **sRGB** : espace non lineaire utilise par les ecrans
- **Lineaire** : espace utilise pour les calculs d'eclairage
- Conversion : `linear = srgb <= 0.04045 ? srgb/12.92 : ((srgb+0.055)/1.055)^2.4`

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
