# Screencast 29 — Projet Final Expert

## Objectifs
- Intégrer l'ensemble des concepts du cours dans un projet final complet
- Construire l'architecture d'un moteur 3D temps réel étape par étape
- Connecter physique, rendu, audio, animation et gestion mémoire
- Profiler et optimiser les performances avec des budgets par système

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-2:00 | Vue d'ensemble du projet final : architecture, systèmes, boucle de jeu | Slides |
| 2:00-4:00 | Scene Manager : enregistrer des systèmes avec priorites, boucle update ordonnee | VS Code + navigateur |
| 4:00-5:30 | Asset Manifest : charger et valider un JSON de ressources (modèles, textures, audio) | VS Code + navigateur |
| 5:30-7:30 | Terrain : chunks visibles autour de la camera, LOD par distance | VS Code + navigateur |
| 7:30-9:00 | Eau (Gerstner) : superposition d'ondes sinusoidales pour un plan d'eau anime | VS Code + navigateur |
| 9:00-10:30 | Atmosphere et brouillard : couleur du ciel Rayleigh, fog exponentiel en hauteur | VS Code + navigateur |
| 10:30-12:00 | Rendu hybride : decision rasterisation vs ray tracing selon le materiau | VS Code + navigateur |
| 12:00-14:00 | Ombres CSM + Reflexions SSR : selection de cascade, ray march en espace ecran | VS Code + navigateur |
| 14:00-15:30 | TAA : sequence de Halton pour le jitter sous-pixel, reprojection temporelle | VS Code + navigateur |
| 15:30-17:00 | Virtual Textures : requête de page, eviction LRU, feedback buffer | VS Code + navigateur |
| 17:00-18:30 | Physique : pas de temps fixe, accumulateur, interpolation entre frames | VS Code + navigateur |
| 18:30-20:00 | Audio spatial + IK look-at : attenuation par distance, pan stereo, orientation tete | VS Code + navigateur |
| 20:00-21:30 | Animation : machine a états, transitions conditionnelles, crossfade | VS Code + navigateur |
| 21:30-23:00 | Performance : budget par système, stats FPS (min/avg/max), detection de fuites mémoire | VS Code + navigateur |
| 23:00-24:00 | Quality presets : adapter les paramètres selon le tier GPU (low/mid/high) | VS Code + navigateur |
| 24:00-25:00 | Récapitulatif : architecture finale, conseils pour aller plus loin | Slides |

## Points clés a montrer
- L'ordre d'exécution des systèmes est critique : physique avant rendu, rendu avant post-process
- Le pas de temps fixe en physique garantit determinisme et stabilite numérique
- Le rendu hybride reserve le ray tracing aux surfaces metalliques lisses (cout/benefice)
- Le feedback buffer de virtual textures créé une boucle GPU -> CPU pour le streaming
- Le TAA accumule des echantillons sur plusieurs frames grace au jitter de Halton
- Le profiling par système permet d'identifier rapidement les goulots d'etranglement
- Les quality presets adaptent automatiquement la qualite au materiel de l'utilisateur

## Ressources
- Code source `labs/lab-29-projet-final-expert/`
- "Game Engine Architecture" (Jason Gregory, 3rd edition)
- Fix Your Timestep : https://gafferongames.com/post/fix_your_timestep/
- Halton Sequence : https://en.wikipedia.org/wiki/Halton_sequence
- Virtual Texturing : https://silverspaceship.com/src/svt/
- Hybrid Rendering (UE5) : https://docs.unrealengine.com/5.0/en-US/lumen-global-illumination-and-reflections-in-unreal-engine/
