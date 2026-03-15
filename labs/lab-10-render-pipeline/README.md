# Lab 10 — Render pipeline

## Objectif

Maîtriser la configuration d'un pipeline de rendu WebGPU : bind group layouts,
packing de buffers (std140/std430), descripteurs de pipeline, vertex stride,
depth/stencil, blending, multisampling et génération de chaines mipmap.

## Concepts clés

### Bind group layout

Les entrees d'un bind group layout sont generees à partir de la reflexion du shader :
chaque `@group/@binding` devient une entree avec visibilite, type de buffer ou de texture.

### Packing std140 (uniform buffers)

Regles d'alignement std140 (OpenGL/WebGPU uniform buffers) :
- `float` : 4 octets, aligne a 4
- `vec2` : 8 octets, aligne a 8
- `vec3` : 12 octets, **aligne a 16** (padde a 16)
- `vec4` : 16 octets, aligne a 16
- `mat4` : 4 x vec4 = 64 octets, aligne a 16

### Packing std430 (storage buffers)

Regles similaires a std140 mais `vec3` n'est PAS padde a 16 :
- `vec3` : 12 octets, aligne a 16 mais taille réelle 12

### Pipeline descriptor

Un objet qui rassemble : vertex state, fragment state, primitive topology,
depth/stencil, multisample, et layout.

### Depth/stencil state

Configure le test de profondeur (`less`, `greater`, etc.) et les operations stencil.

### Blend state

Le mode alpha standard : `src * srcAlpha + dst * (1 - srcAlpha)`.

### Mipmap chain

Genere la sequence de dimensions depuis la résolution de base jusqu'a 1x1.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos résultats avec la solution :

```bash
npx tsx solution.ts
```
