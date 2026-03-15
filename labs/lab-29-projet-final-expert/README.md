# Lab 29 — Projet Final Expert

## Objectif

Ce lab est le **capstone** du cours : il intégré l'ensemble des concepts abordes
dans les 28 modules précédents en un projet final complet. Chaque fonction
represente un sous-système que l'on retrouve dans un moteur 3D temps réel :

- **Gestion de scene** : systèmes ECS, boucle de mise a jour
- **Chargement d'assets** : manifest JSON, validation
- **Terrain** : chunks visibles, niveaux de detail (LOD)
- **Eau** : vagues de Gerstner (somme de sinus)
- **Atmosphere** : couleur du ciel (diffusion de Rayleigh simplifiee)
- **Brouillard volumetrique** : densite exponentielle basee sur la hauteur
- **Rendu hybride** : decision rasterisation vs ray tracing
- **Cascaded Shadow Maps** : selection de cascade selon la profondeur
- **Screen-Space Reflections** : ray marching en espace ecran
- **TAA** : sequence de Halton pour le jitter sous-pixel
- **Virtual Textures** : requête de page, eviction LRU
- **Physique** : pas de temps fixe, accumulateur, alpha d'interpolation
- **Audio spatial** : attenuation par distance, pan stereo
- **IK look-at** : rotation de la tete vers une cible
- **Animation** : machine a états, crossfade
- **Performance** : budget de frame, statistiques FPS, detection de fuites mémoire
- **Presets qualite** : paramètres adaptes au tier GPU

## Instructions

1. Ouvrir `exercise.ts` et implementer chaque fonction marquee `// TODO`
2. Lancer les tests : `npx tsx exercise.ts`
3. Comparer avec `solution.ts` si besoin : `npx tsx solution.ts`

## Concepts integres

Ce lab valide votre maîtrise de : algebre lineaire, pipeline de rendu,
shaders, physique, audio, animation, optimisation, gestion mémoire et
architecture moteur.

Bon courage pour ce dernier lab !
