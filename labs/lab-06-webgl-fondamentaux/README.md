# Lab 06 — WebGL fondamentaux (preparation des donnees)

## Objectif

Implementer les fonctions de preparation de donnees pour WebGL : creation de buffers
de sommets entrelaces, buffers d'indices, analyse de shaders GLSL, et generation de geometrie.

WebGL necessite un navigateur pour le rendu, mais toute la preparation des donnees se fait
en JavaScript pur. Ce lab teste cette partie.

## Concepts cles

### Vertex buffer entrelace

Au lieu de separer positions et couleurs dans des buffers differents, on les entrelace :
`[px, py, pz, r, g, b, px, py, pz, r, g, b, ...]`

Cela ameliore la localite du cache GPU.

### Index buffer

Pour un quad (carre), on definit 4 sommets et 6 indices (2 triangles) au lieu de
6 sommets. Economie de memoire et de bande passante.

### Stride et offsets

Le stride est la taille totale d'un sommet en octets. Les offsets indiquent ou commence
chaque attribut a l'interieur d'un sommet.

Exemple : position (3 floats) + color (3 floats) = stride 24 octets.
Position offset = 0, color offset = 12.

### Analyse de shaders GLSL

Extraire les declarations `uniform` d'un shader avec des expressions regulieres.
Utile pour l'introspection et les outils de debug.

### Generation de geometrie

Generer un plan subdivise avec ses positions, indices et coordonnees UV.
Base de tout systeme de generation procedurale de terrain ou de grille.

## Exercices

```bash
npx tsx exercise.ts
```
