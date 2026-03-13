# Screencast 14 — Materiaux PBR, environment maps et ombres

## Objectifs
- Configurer des materiaux PBR realistes avec Three.js
- Charger et appliquer des environment maps (HDR, cubemap)
- Activer et configurer les ombres portees (shadow maps)
- Combiner textures : albedo, normal, roughness, metalness, AO

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Rappel PBR et objectif de la session | Slides |
| 1:00-3:00 | MeshStandardMaterial : metalness, roughness, envMapIntensity | VS Code + navigateur |
| 3:00-4:30 | MeshPhysicalMaterial : clearcoat, transmission, sheen | VS Code + navigateur |
| 4:30-6:30 | Charger un HDR avec RGBELoader, PMREMGenerator | VS Code + navigateur |
| 6:30-8:00 | Environment map comme eclairage indirect (IBL) | VS Code + navigateur |
| 8:00-9:30 | Texture maps combinee : albedo + normal + roughness + AO | VS Code + navigateur |
| 9:30-11:00 | Ombres : renderer.shadowMap, light.castShadow, mesh.receiveShadow | VS Code + navigateur |
| 11:00-12:30 | Types de shadow map : Basic, PCF, PCFSoft, VSM | VS Code + navigateur comparaison |
| 12:30-14:00 | Optimisation des ombres : shadow camera, bias, resolution | VS Code + navigateur |
| 14:00-14:30 | Recapitulatif | Slides |

## Points cles a montrer
- L'environment map transforme completement le realisme d'une scene
- PMREMGenerator pre-filtre la HDR pour les differents niveaux de roughness
- Les ombres sont couteuses : limiter la resolution et le nombre de lumieres avec ombres
- Le shadow bias evite le shadow acne (artefacts de surface)

## Ressources
- Code source `labs/14-materiaux/`
- Polyhaven pour les HDR gratuites : https://polyhaven.com/
- ambientCG pour les textures PBR : https://ambientcg.com/
