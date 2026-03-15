# Screencast 27 — Audio 3D avec Web Audio API

## Objectifs
- Comprendre l'architecture de la Web Audio API pour l'audio spatial
- Implementer un audio positionnel dans une scene Three.js
- Configurer les modèles de distance et les cones de directivite
- Ajouter de la reverb avec ConvolverNode et une impulse response

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:30 | Introduction : pourquoi l'audio 3D est essentiel pour l'immersion | Slides |
| 1:30-3:00 | Architecture Web Audio API : AudioContext, nodes, graph | Slides + diagramme |
| 3:00-5:00 | AudioListener : position et orientation synchronisees avec la camera Three.js | VS Code + navigateur |
| 5:00-7:00 | PannerNode : créer une source sonore positionnelle, positionX/Y/Z | VS Code + navigateur |
| 7:00-9:00 | Modeles de distance : linear, inverse, exponential — comparaison auditive | VS Code + navigateur |
| 9:00-10:30 | Cone de directivite : coneInnerAngle, coneOuterAngle, coneOuterGain | VS Code + navigateur |
| 10:30-12:00 | HRTF vs equal-power : différence de spatialisation au casque | Navigateur |
| 12:00-14:00 | Three.js AudioListener + PositionalAudio : intégration simplifiee | VS Code + navigateur |
| 14:00-16:00 | ConvolverNode : charger une impulse response pour la reverb | VS Code + navigateur |
| 16:00-17:00 | Crossfade entre ambiances sonores selon la zone de la scene | VS Code + navigateur |
| 17:00-18:00 | Analyser le spectre avec AnalyserNode et dessiner un visualiseur | VS Code + navigateur |
| 18:00-18:30 | Récapitulatif et bonnes pratiques | Slides |

## Points clés a montrer
- La Web Audio API fonctionne en graphe : source -> traitement -> destination
- Le PannerNode combine distance, cone et panning en un seul noeud
- La HRTF offre une spatialisation plus realiste que equal-power mais nécessité plus de CPU
- Three.js encapsule AudioListener et PositionalAudio pour simplifier l'intégration
- Le ConvolverNode avec une IR réelle donne une reverb convaincante sans modelisation complexe
- Toujours initialiser l'AudioContext après une interaction utilisateur (politique navigateur)

## Ressources
- Code source `labs/lab-27-audio-3d/`
- Web Audio API spec : https://webaudio.github.io/web-audio-api/
- Three.js Audio : https://threejs.org/docs/#api/en/audio/PositionalAudio
- Impulse responses gratuites : https://openairlib.net/
