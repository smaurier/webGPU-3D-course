# Screencast 05 — Lumiere et PBR

## Objectifs
- Comprendre les modeles d'eclairage : Lambert, Phong, Blinn-Phong
- Decouvrir le Physically Based Rendering (PBR) et ses parametres
- Implementer progressivement chaque modele d'eclairage
- Comparer visuellement les resultats avec un editeur de materiaux

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Comment la lumiere interagit avec les surfaces | Slides |
| 1:00-2:30 | Lumiere ambiante, diffuse, speculaire : les composantes | Slides schema |
| 2:30-4:00 | Modele Lambert : eclairage diffus pur (N dot L) | VS Code + demo canvas |
| 4:00-5:30 | Modele Phong : ajout du reflet speculaire (R dot V) | VS Code + demo canvas |
| 5:30-7:00 | Modele Blinn-Phong : optimisation avec le half vector (N dot H) | VS Code + demo canvas |
| 7:00-9:00 | Introduction au PBR : metalness, roughness, conservation d'energie | Slides |
| 9:00-11:00 | Les fonctions du PBR : BRDF Cook-Torrance, Fresnel, distribution GGX | Slides + VS Code |
| 11:00-13:00 | Implementation d'un editeur de materiaux interactif | VS Code + navigateur |
| 13:00-14:30 | Comparaison cote a cote des quatre modeles | Visualisation lighting-models.html |
| 14:30-15:00 | Recapitulatif | Slides |

## Points cles a montrer
- La progression naturelle de Lambert vers PBR
- Le dot product est au coeur de tous les modeles d'eclairage
- PBR utilise des proprietes physiques mesurables (metalness, roughness)
- La conservation d'energie : un materiau ne peut pas refleter plus de lumiere qu'il n'en recoit

## Ressources
- Visualisation `visualizations/lighting-models.html`
- Code source `labs/05-lumiere-pbr/`
- Reference : "PBR Book" de Pharr, Jakob et Humphreys
- Learn OpenGL PBR : https://learnopengl.com/PBR/Theory
