# Screencast 28 — Virtual Textures et Streaming

## Objectifs
- Comprendre le principe des virtual textures (textures virtuelles)
- Implementer un système de page table et de feedback buffer
- Visualiser le budget VRAM et le cache LRU en temps réel
- Utiliser Basis Universal pour le transcodage multi-plateforme

## Plan de tournage
| Timing | Contenu | Ecran |
|--------|---------|-------|
| 0:00-1:30 | Le problème : scenes ouvertes avec des Go de textures, VRAM limitee | Slides |
| 1:30-3:30 | Principe des virtual textures : découpage en pages, page table, atlas physique | Slides + diagramme |
| 3:30-5:30 | Demo : visualiser la page table — couleur = page physique mappee | VS Code + navigateur |
| 5:30-7:30 | Feedback buffer : shader qui écrit les pages visibles, analyse CPU | VS Code + navigateur |
| 7:30-9:30 | Cache LRU : eviction, chargement prioritaire, fallback mip | VS Code + navigateur |
| 9:30-11:00 | Selection du mip level : distance camera, taille ecran, derivees UV | VS Code + navigateur |
| 11:00-13:00 | Budget VRAM : tracker en temps réel, seuil d'alerte, eviction proactive | VS Code + navigateur |
| 13:00-14:30 | Atlas packing : shelf algorithm, pas de chevauchement, bordures de padding | VS Code + navigateur |
| 14:30-16:00 | Basis Universal : .ktx2, transcodage vers BC7/ASTC/ETC2, taille estimee | VS Code + navigateur |
| 16:00-17:00 | Progressive loading : commencer par les mips bas, raffiner progressivement | Navigateur |
| 17:00-18:00 | Intégration Three.js : `KTX2Loader`, `CompressedTexture`, streaming custom | VS Code + navigateur |
| 18:00-18:30 | Récapitulatif et bonnes pratiques | Slides |

## Points clés a montrer
- La page table est l'élément central : indirection UV virtuel -> UV physique
- Le feedback buffer est rendu a basse résolution pour limiter le cout GPU
- Le cache LRU garantit que les pages visibles restent en VRAM
- Basis Universal permet de distribuer un seul fichier pour tous les GPU
- Le resident ratio (pages chargees / pages visibles) est la metrique clé de qualite
- Les page faults sont normaux au debut ; le système converge vers un état stable

## Ressources
- Code source `labs/lab-28-virtual-textures/`
- Basis Universal : https://github.com/BinomialLLC/basis_universal
- KTX2 spec : https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html
- Three.js KTX2Loader : https://threejs.org/docs/#examples/en/loaders/KTX2Loader
- "Virtual Texturing in Software and Hardware" (Mittring, 2008)
