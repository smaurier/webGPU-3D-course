# Screencast 25 — Rendu volumetrique

## Objectifs
- Implementer un brouillard volumetrique avec ray marching et in-scattering
- Comprendre et appliquer la loi de Beer-Lambert pour la transmittance
- Realiser un rendu de nuages proceduraux avec bruit Perlin-Worley
- Simuler le scattering atmospherique (Rayleigh + Mie)

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:30 | Introduction : milieux participatifs, absorption, scattering, emission | Slides avec diagrammes |
| 1:30-4:00 | Beer-Lambert : transmittance exponentielle, implementation en shader | Code WGSL + visualisation densite |
| 4:00-7:00 | Volumetric fog : ray marching basique, densite uniforme puis variable | Demo fog progressif |
| 7:00-9:30 | In-scattering et god rays : intégration de la lumiere à chaque pas | Demo avec spot light dans le fog |
| 9:30-12:00 | Fonction de phase Henyey-Greenstein : effet du paramètre g | Slider interactif pour g |
| 12:00-15:00 | Nuages : texture 3D Perlin-Worley, weather map, shape/detail noise | Visualisation couches de bruit |
| 15:00-18:00 | Rendu des nuages : ray marching avec light marching, silver lining | Demo rendu nuages temps réel |
| 18:00-20:00 | Atmospheric scattering : Rayleigh + Mie, cycle jour/nuit | Demo ciel procedural |
| 20:00-21:00 | Recap et techniques d'optimisation (temporal reprojection, half-res) | Slides de synthese |

## Points clés a montrer
- Visualisation de la transmittance qui decroit le long du rayon
- God rays apparaissant naturellement quand la lumiere traverse le volume
- Slider pour le paramètre g de Henyey-Greenstein : forward vs back scattering
- Coupes 2D de la texture de bruit 3D Perlin-Worley utilisee pour les nuages
- Transition jour/nuit montrant le changement de couleur du ciel (Rayleigh)

## Ressources
- "The Real-time Volumetric Cloudscapes of Horizon Zero Dawn" (Guerrilla Games, SIGGRAPH 2015)
- "Physically Based Sky, Atmosphere and Cloud Rendering" (Hillaire, 2020)
- Sebastian Lague "Coding Adventure: Clouds"
- Shadertoy exemples de atmospheric scattering
