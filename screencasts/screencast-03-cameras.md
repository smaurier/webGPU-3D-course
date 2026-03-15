# Screencast 03 — Cameras et projections

## Objectifs
- Construire une matrice lookAt pour positionner une camera
- Comprendre la projection perspective et orthographique
- Visualiser le frustum de la camera et le volume de vue
- Implementer une camera orbite interactive

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-0:45 | Le concept de camera en 3D : position, cible, up | Slides |
| 0:45-2:30 | Construction de la matrice lookAt pas a pas | Slides + VS Code |
| 2:30-4:00 | Projection perspective : FOV, aspect ratio, near, far | Slides schema |
| 4:00-5:30 | Projection orthographique : left, right, top, bottom | Slides schema |
| 5:30-7:00 | Visualisation interactive : comparaison des deux projections | Visualisation projections.html |
| 7:00-8:30 | Le frustum : qu'est-ce qui est visible, culling basique | Slides + demo |
| 8:30-10:30 | Implementation : camera orbite avec souris (yaw, pitch, distance) | VS Code + navigateur |
| 10:30-12:00 | Gestion du zoom, du pan, et des limites | VS Code + navigateur |
| 12:00-12:30 | Récapitulatif | Slides |

## Points clés a montrer
- La matrice view est l'inverse de la transformation de la camera
- Le FOV controle le champ de vision et affecte la perspective
- Near et far definissent la plage de profondeur (z-buffer)
- L'orbite camera utilise des coordonnees spheriques converties en cartesiennes

## Ressources
- Visualisation `visualizations/projections.html`
- Code source `labs/03-cameras/`
- Référence : matrice de projection OpenGL vs DirectX (row-major vs column-major)
