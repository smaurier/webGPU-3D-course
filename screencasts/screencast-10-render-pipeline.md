# Screencast 10 — Render pipeline WebGPU avance

## Objectifs
- Comprendre les bind groups et bind group layouts
- Utiliser des uniform buffers pour passer des donnees aux shaders
- Configurer le depth buffer en WebGPU
- Dessiner des geometries indexees avec un index buffer

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Rappel du pipeline de base, objectifs de la session | Slides |
| 1:00-3:00 | Bind groups : le systeme de ressources de WebGPU | Slides + VS Code |
| 3:00-5:00 | Uniform buffers : creer, ecrire, binder au shader | VS Code |
| 5:00-6:30 | Passer les matrices MVP via un uniform buffer | VS Code + navigateur |
| 6:30-8:00 | Bind group layouts : declarer la structure des ressources | VS Code |
| 8:00-9:30 | Depth buffer : creer une depth texture, configurer le depth stencil state | VS Code |
| 9:30-11:00 | Index buffer : dessiner un cube avec des indices partages | VS Code + navigateur |
| 11:00-12:30 | Vertex buffer layout : stride, attributes, shader locations | VS Code |
| 12:30-14:00 | Mettre tout ensemble : cube 3D avec depth et uniforms | VS Code + navigateur |
| 14:00-14:30 | Recapitulatif | Slides |

## Points cles a montrer
- Les bind groups remplacent les appels gl.uniform* de WebGL
- Un uniform buffer peut contenir plusieurs valeurs (matrices, parametres de lumiere)
- Le depth buffer doit etre recree si le canvas change de taille
- Les index buffers evitent de dupliquer des vertices partages entre triangles

## Ressources
- Code source `labs/10-render-pipeline/`
- WebGPU best practices : https://toji.dev/webgpu-best-practices/
