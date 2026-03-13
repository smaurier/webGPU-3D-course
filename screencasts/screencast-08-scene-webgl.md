# Screencast 08 — Scene complete en WebGL

## Objectifs
- Construire une scene 3D complete avec plusieurs objets
- Implementer une camera orbite avec controles souris
- Ajouter l'eclairage Phong dans les shaders
- Gerer le depth buffer et le backface culling

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Objectif : une scene 3D interactive complete | Slides |
| 1:00-3:00 | Generer des geometries : cube, sphere, plan | VS Code |
| 3:00-5:00 | Matrice model-view-projection : combiner les transformations | VS Code |
| 5:00-7:00 | Camera orbite : gestion de la souris (mousedown, mousemove, wheel) | VS Code + navigateur |
| 7:00-9:00 | Eclairage Phong dans le fragment shader | VS Code |
| 9:00-10:30 | Depth buffer : activer et configurer le test de profondeur | VS Code + navigateur |
| 10:30-11:30 | Backface culling : ne pas dessiner les faces arriere | VS Code + navigateur |
| 11:30-13:00 | Dessiner plusieurs objets avec des transformations differentes | VS Code + navigateur |
| 13:00-14:30 | Ajout d'un plan au sol avec texture en damier | VS Code + navigateur |
| 14:30-15:00 | Recapitulatif et limites de WebGL pur | Slides |

## Points cles a montrer
- La matrice MVP = Projection x View x Model, appliquee dans le vertex shader
- Le depth buffer resout automatiquement l'ordre d'affichage des objets
- Le backface culling utilise l'ordre des vertices (clockwise vs counter-clockwise)
- Chaque objet a sa propre matrice model, mais partage view et projection

## Ressources
- Code source `labs/08-scene-webgl/`
- Reference : matrices de transformation des differentes geometries
