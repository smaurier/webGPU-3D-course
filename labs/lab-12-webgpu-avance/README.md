# Lab 12 — WebGPU avance

## Objectif

Explorer les techniques avancees de WebGPU : instanced rendering, indirect draw,
deferred rendering (G-buffer), cubemap, generation de mipmaps, ring buffer allocator
et analyse de timestamps GPU.

## Concepts cles

### Instance buffer

Pour dessiner N instances d'un meme mesh, on prepare un buffer contenant une matrice modele 4x4
(16 floats = 64 octets) par instance. Le GPU lit automatiquement la matrice correspondant
a chaque instance via `stepMode: 'instance'`.

### Indirect draw

Au lieu de specifier les arguments de draw dans le code CPU, on les ecrit dans un buffer GPU :
`[vertexCount, instanceCount, firstVertex, firstInstance]` (4 x uint32).

### G-buffer (deferred rendering)

Le rendu differe ecrit dans plusieurs render targets (G-buffer) :
- Position : `rgba32float`
- Normale : `rgba16float`
- Albedo : `rgba8unorm`

Ensuite, un pass de lighting lit ces textures pour calculer l'eclairage final.

### Cubemap

6 faces avec des matrices de vue orientees dans les 6 directions cardinales (+X, -X, +Y, -Y, +Z, -Z).
Utilise pour les reflections, les skybox, et les shadow maps omnidirectionnelles.

### Mipmap box filter

Chaque texel du niveau N+1 est la moyenne des 4 texels correspondants du niveau N.

### Ring buffer allocator

Un allocateur circulaire qui alloue des blocs dans un buffer fixe.
Quand on atteint la fin, on revient au debut (wrap-around).

### Timestamp queries

Les GPU mesurent le temps en ticks. Pour convertir en millisecondes :
`ms = (endTick - startTick) / timestampFrequency * 1000`.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
