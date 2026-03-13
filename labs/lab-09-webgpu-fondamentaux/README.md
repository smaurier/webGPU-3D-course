# Lab 09 — WebGPU fondamentaux

## Objectif

Maitriser les bases de WebGPU et WGSL : parsing de shaders WGSL, alignement de buffers,
descripteurs de vertex layout, correspondances GLSL/WGSL, et conversion de triangle strip.

## Concepts cles

### Parsing WGSL

WGSL utilise une syntaxe differente de GLSL :
- Les structs sont declares avec `struct Name { field: type, ... }`
- Les bind groups : `@group(G) @binding(B) var<uniform> name: Type;`
- Les entry points : `@vertex`, `@fragment`, `@compute`

### Alignement des buffers WebGPU

Les uniform buffers WebGPU necessitent un alignement de **256 octets**.
La taille du buffer doit etre un multiple de 256 : `ceil(size / 256) * 256`.

### Vertex buffer layout

Un descripteur de vertex buffer definit le `arrayStride` (octets par sommet)
et les attributs (`shaderLocation`, `offset`, `format`).

### Correspondances GLSL → WGSL

| GLSL         | WGSL            |
|--------------|-----------------|
| `vec2`       | `vec2f`         |
| `vec3`       | `vec3f`         |
| `vec4`       | `vec4f`         |
| `mat4`       | `mat4x4f`       |
| `sampler2D`  | `texture_2d<f32>` + `sampler` |
| `int`        | `i32`           |
| `float`      | `f32`           |

### Triangle strip vers triangle list

Un triangle strip de N sommets genere N-2 triangles. Le triangle i utilise les sommets
`[i, i+1, i+2]` avec inversion du winding pour les triangles impairs.

## Exercices

Completez les fonctions dans `exercise.ts` puis lancez les tests :

```bash
npx tsx exercise.ts
```

Verifiez vos resultats avec la solution :

```bash
npx tsx solution.ts
```
