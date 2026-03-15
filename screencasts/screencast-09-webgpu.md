# Screencast 09 — Premier triangle WebGPU

## Objectifs
- Comprendre l'architecture de WebGPU : adapter, device, queue
- Écrire un premier shader en WGSL (WebGPU Shading Language)
- Créer un render pipeline et dessiner un triangle
- Comparer l'approche WebGPU vs WebGL : command-based vs state machine

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Pourquoi WebGPU : les limites de WebGL et la modernisation | Slides |
| 1:00-2:30 | Architecture WebGPU : adapter -> device -> queue | Slides schema |
| 2:30-4:00 | Initialisation : requestAdapter, requestDevice, configurer le canvas | VS Code + navigateur |
| 4:00-5:30 | WGSL : syntaxe de base, différences avec GLSL | VS Code |
| 5:30-7:00 | Vertex shader WGSL : @vertex, @builtin(position) | VS Code |
| 7:00-8:00 | Fragment shader WGSL : @fragment, @location(0) | VS Code |
| 8:00-10:00 | Créer le render pipeline : vertex state, fragment state, topology | VS Code |
| 10:00-11:30 | Command encoder : beginRenderPass, draw, submit | VS Code |
| 11:30-13:00 | Dessiner le triangle et debugger les erreurs courantes | VS Code + navigateur |
| 13:00-14:30 | Comparaison WebGL vs WebGPU : code cote a cote | VS Code split |
| 14:30-15:00 | Récapitulatif | Slides |

## Points clés a montrer
- WebGPU est command-based : on enregistre des commandes puis on les soumet
- WGSL utilise des annotations (@vertex, @fragment) au lieu de void main()
- Le pipeline est un objet immutable créé une seule fois
- La gestion d'erreurs est meilleure qu'en WebGL (messages explicites)

## Ressources
- Visualisation `visualizations/gpu-pipeline.html`
- Code source `labs/09-webgpu/`
- WebGPU spec : https://www.w3.org/TR/webgpu/
- WGSL spec : https://www.w3.org/TR/WGSL/
