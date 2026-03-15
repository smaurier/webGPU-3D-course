# Screencast 04 — Le pipeline de rendu 3D

## Objectifs
- Comprendre chaque étape du pipeline de rendu graphique
- Suivre le parcours d'un triangle depuis les vertices jusqu'aux pixels
- Implementer un rasterizer logiciel simplifie en TypeScript
- Comparer le pipeline fixe et le pipeline programmable

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Vue d'ensemble du pipeline de rendu | Slides schema |
| 1:00-2:30 | Étape 1 : Input Assembly (vertices, indices, topologie) | Slides + visualisation |
| 2:30-4:00 | Étape 2 : Vertex Shader (transformations par sommet) | Slides + visualisation |
| 4:00-5:00 | Étape 3 : Primitive Assembly et clipping | Slides |
| 5:00-7:00 | Étape 4 : Rasterization (conversion triangles en fragments) | Slides + visualisation |
| 7:00-8:30 | Étape 5 : Fragment Shader (couleur par pixel) | Slides + visualisation |
| 8:30-9:30 | Étape 6 : Output merger (depth test, blending) | Slides |
| 9:30-13:00 | Live coding : rasterizer logiciel en TypeScript | VS Code + navigateur |
| 13:00-14:30 | Comparaison rasterizer logiciel vs GPU | VS Code + navigateur |
| 14:30-15:00 | Récapitulatif | Slides |

## Points clés a montrer
- Le pipeline est une chaine : la sortie d'une étape est l'entree de la suivante
- Le vertex shader s'exécuté une fois par vertex, le fragment shader une fois par pixel
- La rasterization déterminé quels pixels sont couverts par un triangle
- Le depth test empeche les objets derriere d'ecraser ceux devant

## Ressources
- Visualisation `visualizations/rendering-pipeline.html`
- Code source `labs/04-pipeline/software-rasterizer.ts`
- Référence : Scratchapixel "Rasterization: a Practical Implementation"
