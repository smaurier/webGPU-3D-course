# Screencast 18 — Shadow mapping en profondeur

## Objectifs
- Comprendre le shadow mapping : rendu du point de vue de la lumiere
- Implementer une shadow map basique depuis zero
- Appliquer le PCF (Percentage Closer Filtering) pour des ombres douces
- Decouvrir le CSM (Cascaded Shadow Maps) pour les grandes scenes

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:00 | Le problème des ombres en temps réel | Slides |
| 1:00-3:00 | Shadow mapping : principe du depth pass depuis la lumiere | Slides schema |
| 3:00-5:00 | Implementation : render-to-texture du point de vue de la lumiere | VS Code |
| 5:00-7:00 | Comparaison de profondeur dans le fragment shader | VS Code + navigateur |
| 7:00-8:30 | Shadow acne : cause et solution avec le bias | VS Code + navigateur |
| 8:30-9:30 | Peter panning : quand le bias est trop fort | VS Code + navigateur |
| 9:30-11:00 | PCF : echantillonner plusieurs texels pour des ombres douces | VS Code + navigateur |
| 11:00-12:30 | Resolution de la shadow map : impact sur la qualite | VS Code + navigateur |
| 12:30-14:00 | CSM : plusieurs shadow maps pour différentes distances | Slides + VS Code |
| 14:00-15:00 | CSM avec Three.js : implementation pratique | VS Code + navigateur |
| 15:00-15:30 | Récapitulatif | Slides |

## Points clés a montrer
- Le shadow mapping est un problème de comparaison de profondeurs
- Le bias est un compromis entre shadow acne et peter panning
- Le PCF transforme des ombres dures en ombres douces avec un cout modere
- Le CSM alloue plus de résolution de shadow map pres de la camera

## Ressources
- Code source `labs/18-shadows/`
- Référence : "Real-Time Shadows" de Eisemann et al.
- Learn OpenGL shadow mapping : https://learnopengl.com/Advanced-Lighting/Shadows/Shadow-Mapping
