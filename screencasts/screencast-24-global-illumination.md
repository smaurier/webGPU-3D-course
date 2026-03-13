# Screencast 24 — Global Illumination

## Objectifs
- Implementer le Screen-Space Reflections (SSR) avec ray marching dans le depth buffer
- Comparer les resultats avant/apres Temporal Anti-Aliasing (TAA)
- Visualiser les light probes et les harmoniques spheriques
- Mettre en place le HBAO pour l'ambient occlusion

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:30 | Introduction : eclairage direct vs indirect, pourquoi la GI est importante | Slides comparatifs |
| 1:30-4:30 | Screen-Space Reflections : principe du ray marching dans le depth buffer | Code + demo on/off |
| 4:30-7:00 | Limites du SSR : objets hors ecran, fallback vers environment map | Demo montrant les artefacts |
| 7:00-10:00 | TAA : jitter sub-pixel, reprojection, blending temporel | Before/after side-by-side |
| 10:00-12:30 | TAA : ghosting et rejection, velocity buffer | Demo avec objets en mouvement |
| 12:30-15:00 | HBAO : echantillonnage horizon, comparaison avec SSAO classique | Split-screen SSAO vs HBAO |
| 15:00-18:00 | Light probes : placement, capture cubemap, encodage SH | Visualisation des probes dans la scene |
| 18:00-20:00 | Integration complete : GI temps reel avec probes + SSR + HBAO | Scene finale avec tous les effets |
| 20:00-21:00 | Recap et optimisations possibles | Slides de synthese |

## Points cles a montrer
- Ray marching SSR pas a pas avec visualisation des echantillons dans le depth buffer
- Toggle interactif SSR on/off pour voir l'impact sur les reflexions
- Comparaison frame TAA off (aliase) vs TAA on (lisse), puis zoom sur les details
- Visualisation des spheres de probes dans la scene 3D avec leur irradiance SH
- Split-screen SSAO vs HBAO montrant la meilleure precision dans les coins et creux

## Ressources
- "Stochastic Screen-Space Reflections" (Tomasz Stachowiak, GDC)
- "Temporal Reprojection Anti-Aliasing in INSIDE" (Playdead)
- "Scalable Ambient Obscurance" (McGuire et al.)
- Filament documentation sur les light probes
