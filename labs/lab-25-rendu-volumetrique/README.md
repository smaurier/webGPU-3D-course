# Lab 25 — Rendu volumetrique

## Objectif

Implementer les algorithmes fondamentaux du rendu volumetrique : absorption de lumiere
(loi de Beer-Lambert), fonctions de phase pour la diffusion, ray marching dans un champ
de densite, brouillard, echantillonnage de lumiere volumetrique et modelisation de nuages.

## Concepts clés

### Loi de Beer-Lambert

La transmittance `T` d'un rayon traversant un milieu de densite uniforme `sigma` sur
une distance `d` suit une decroissance exponentielle :

```
T = exp(-sigma * d)
```

A distance 0, T = 1 (aucune absorption). Plus la distance ou la densite augmente,
plus T tend vers 0 (absorption totale).

### Fonctions de phase

Les fonctions de phase decrivent la probabilite qu'un photon soit diffuse dans une
direction donnee après interaction avec une particule.

- **Henyey-Greenstein** : paramètre `g` dans [-1, 1]. g=0 isotrope, g>0 diffusion vers l'avant, g<0 vers l'arriere.
- **Rayleigh** : diffusion par petites particules (molecules d'air). Symetrique avec des pics a 0 et PI.

```
HG(theta, g) = (1 - g^2) / (4*PI * (1 + g^2 - 2*g*cos(theta))^1.5)
Rayleigh(theta) = (3 / (16*PI)) * (1 + cos(theta)^2)
```

### Ray marching volumetrique

On avance le long d'un rayon par pas fixes. A chaque pas, on echantillonne la densite
du milieu, on accumule la couleur et on met a jour la transmittance :

```
Pour chaque pas i :
  densite = sampleDensity(position_i)
  transmittance *= exp(-densite * stepSize)
  couleur += transmittance * densite * stepSize * couleurMilieu
```

### Brouillard (fog)

- **Lineaire** : `factor = (distance - near) / (far - near)`, clamp [0, 1]
- **Exponentiel** : `factor = 1 - exp(-densite * distance)`
- **Brouillard de hauteur** : la densite decroit exponentiellement avec l'altitude

### Nuages et bruit

La densite d'un nuage est modelisee par du bruit (Perlin/Worley). On applique un seuil
puis un remapping lisse. Le detail est ajoute par soustraction de bruit haute frequence
au bruit de forme basse frequence.

### Profondeur optique

L'integrale de la densite le long du chemin. La transmittance totale est `exp(-opticalDepth)`.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
