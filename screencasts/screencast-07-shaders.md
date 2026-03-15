# Screencast 07 — GLSL en profondeur et texture mapping

## Objectifs
- Maîtriser la syntaxe GLSL : types, fonctions built-in, précision
- Comprendre le passage de donnees entre vertex et fragment shader (varyings)
- Charger et appliquer des textures 2D sur une geometrie
- Comprendre les coordonnees UV et le filtrage de textures

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | GLSL : un langage C-like pour le GPU | Slides |
| 1:00-2:30 | Types : vec2, vec3, vec4, mat4, sampler2D | VS Code |
| 2:30-4:00 | Fonctions built-in : mix, clamp, smoothstep, dot, cross | VS Code + demo |
| 4:00-5:30 | Varyings : interpolation entre vertex et fragment shader | Slides + VS Code |
| 5:30-7:00 | Uniforms : passer des donnees depuis JavaScript | VS Code |
| 7:00-8:30 | Charger une image et créer une texture WebGL | VS Code + navigateur |
| 8:30-10:00 | Coordonnees UV : mapping de la texture sur la geometrie | VS Code + navigateur |
| 10:00-11:30 | Filtrage : nearest vs linear, mipmaps | Navigateur comparaison |
| 11:30-13:00 | Wrapping : repeat, clamp, mirror | Navigateur comparaison |
| 13:00-14:00 | Multi-texturing : combiner diffuse map et normal map | VS Code + navigateur |
| 14:00-14:30 | Récapitulatif | Slides |

## Points clés a montrer
- Les varyings sont interpoles lineairement par la rasterization
- Les uniforms sont constants pour tous les vertices/fragments d'un draw call
- Les coordonnees UV vont de 0 a 1, independamment de la résolution de la texture
- Le mipmapping ameliore la qualite et les performances pour les textures distantes

## Ressources
- Visualisation `visualizations/shader-sandbox.html`
- Code source `labs/07-shaders/`
- The Book of Shaders : https://thebookofshaders.com/
