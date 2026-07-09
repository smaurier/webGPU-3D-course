---
titre: Le pipeline de rendu (rasterisation)
cours: 20-webgpu-3d
notions:
  - "pipeline de rasterisation"
  - "vertex shader"
  - "primitive assembly et clipping"
  - "rasterisation et fragments"
  - "interpolation barycentrique"
  - "fragment shader"
  - "depth test et z-buffer"
  - "stencil test"
  - "alpha blending"
  - "backface culling et winding order"
  - "framebuffer"
outcomes:
  - sait tracer le parcours d'un vertex jusqu'à un pixel à travers les étapes du pipeline
  - sait distinguer le rôle du vertex shader (par sommet) et du fragment shader (par fragment)
  - sait expliquer comment le depth test (z-buffer) résout la visibilité indépendamment de l'ordre de dessin
  - sait expliquer le backface culling et le winding order (CCW/CW)
  - sait distinguer les étapes fixes (rasterisation, tests, blending) des étapes programmables (shaders)
prerequis:
  - "00-prerequis-et-introduction (GPU, aperçu pipeline)"
  - "01-algebre-lineaire-pour-la-3d (vecteurs, produit vectoriel)"
  - "02-transformations-et-quaternions (matrice model)"
  - "03-cameras-et-projections (view/projection, clip space, NDC, depth buffer)"
next: 05-lumiere-materiaux-et-pbr
libs: []
tribuzen: "moteur de rendu 3D TribuZen — comprendre comment un point de la carte des sorties devient un pixel à l'écran (fondation conceptuelle avant l'API)"
last-reviewed: 2026-07
---

# Le pipeline de rendu (rasterisation)

> **Outcomes — tu sauras FAIRE :** tracer le parcours d'un vertex jusqu'à un pixel, distinguer vertex shader et fragment shader, expliquer le depth test (z-buffer) et le backface culling.
> **Difficulté :** :star::star::star:
>
> **Portée :** ce module est **conceptuel**, avant toute API. On décrit *ce que fait* le GPU, étape par étape, du sommet au pixel. Le code WebGL (module 06) et WebGPU (module 09) viendront brancher ces concepts sur une vraie API. Ici, on comprend la machine.

## 1. Cas concret d'abord

TribuZen veut afficher une **carte 3D des sorties de la famille** : un globe avec des marqueurs colorés. Le module précédent t'a appris à transformer un point du globe en coordonnées clip via `projection * view * model`. Mais un point clip n'est **pas** un pixel. Il reste tout un chemin.

Prends un seul triangle du globe, avec trois sommets déjà transformés en clip space :

```
Sommet A (haut, rouge)      →  clip (0.0,  0.8, 0.3, 1.0)
Sommet B (bas-gauche, vert) →  clip (-0.6, -0.4, 0.3, 1.0)
Sommet C (bas-droit, bleu)  →  clip (0.6, -0.4, 0.3, 1.0)
```

Questions auxquelles ce module répond :

1. Comment ces **3 sommets** deviennent-ils **des centaines de pixels** colorés à l'écran ?
2. D'où vient la couleur d'un pixel **au milieu** du triangle, alors qu'aucun sommet n'est là ?
3. Si un deuxième marqueur passe **devant** celui-ci, comment le GPU sait-il lequel afficher, sans que je trie mes triangles à la main ?
4. La face **arrière** du globe (celle qu'on ne voit pas) : pourquoi le GPU ne perd-il pas son temps à la dessiner ?

Le trajet « 3 sommets → écran » s'appelle le **pipeline de rasterisation**. C'est la chaîne d'assemblage du GPU. On la parcourt maintenant, étape par étape.

---

## 2. Théorie complète, concise

### 2.1 Vue d'ensemble : la chaîne d'assemblage

Le pipeline transforme des **sommets** (données géométriques) en **pixels** (couleurs dans le framebuffer). Chaque étape a une entrée, une sortie, et un statut : **programmable** (tu écris le code : un shader) ou **fixe** (le GPU s'en charge, tu ne fais que le configurer).

```
PIPELINE DE RASTERISATION
════════════════════════════════════════════════════════════

  Vertex buffer (sommets : position, couleur, normale…)
        │
        ▼
  ┌─────────────────────┐
  │  VERTEX SHADER      │  ★ PROGRAMMABLE — 1 thread / sommet
  │  position → clip    │  transforme chaque sommet (MVP)
  └──────────┬──────────┘
        │
        ▼
  ┌─────────────────────┐
  │  PRIMITIVE ASSEMBLY │  fixe — regroupe les sommets en
  │  + CLIPPING         │  triangles, découpe contre le frustum
  └──────────┬──────────┘
        │
        ▼
  ┌─────────────────────┐
  │  RASTERISATION      │  fixe — triangle → fragments (pixels
  │  + backface culling │  candidats) ; interpole les attributs
  └──────────┬──────────┘
        │
        ▼
  ┌─────────────────────┐
  │  FRAGMENT SHADER    │  ★ PROGRAMMABLE — 1 thread / fragment
  │  → couleur du pixel │  calcule la couleur finale
  └──────────┬──────────┘
        │
        ▼
  ┌─────────────────────┐
  │  TESTS + BLEND      │  fixe — depth test, stencil test,
  │  (output merger)    │  alpha blending, écriture
  └──────────┬──────────┘
        │
        ▼
  FRAMEBUFFER (l'image affichée)
```

Idée directrice : **massivement parallèle**. Le vertex shader tourne sur tous les sommets en même temps ; le fragment shader sur tous les fragments en même temps. Aucune invocation ne connaît ses voisines. C'est pour ça qu'un GPU dessine des millions de triangles à 60 fps.

### 2.2 Vertex shader — une fois par sommet

Le **vertex shader** est le premier étage programmable. Il s'exécute **une fois par sommet**, indépendamment. Son rôle obligatoire : produire la **position en clip space** du sommet (le fameux `projection * view * model * position` du module 03).

Entrée : les attributs du sommet (position locale, couleur, normale, UV). Sortie : la position clip **obligatoire**, plus des attributs dits *varyings* (couleur, normale…) qui seront transmis à l'étape suivante.

```
VERTEX SHADER (conceptuel)

  entrée  : position locale, couleur, normale (du sommet)
  uniforms: model, view, projection (partagés par tous les sommets)

  sortie  : clipPos = projection · view · model · position   ← OBLIGATOIRE
            + couleur, normale (transmis tels quels : "varyings")
```

Ce qu'il ne fait **pas** : il ne connaît qu'**un** sommet. Il ne sait pas qu'il forme un triangle, ne voit pas les pixels, n'a aucune notion de couleur finale. Il positionne, point.

### 2.3 Primitive assembly et clipping

Après le vertex shader, le GPU regroupe les sommets en **primitives** selon la **topologie** demandée. La plus courante : `triangle-list` (3 sommets = 1 triangle). Existent aussi `triangle-strip`, `line-list`, `point-list`.

Puis vient le **clipping** : chaque triangle est découpé contre les 6 plans du frustum (le volume visible, vu au module 03). Trois cas :

```
CLIPPING contre le frustum

  Entièrement DEDANS  → passe tel quel
  Entièrement DEHORS  → éliminé (rien à dessiner)
  À CHEVAL sur un bord → découpé en 1 ou 2 triangles plus petits,
                         pour ne garder que la partie visible
```

Le clipping évite de rasteriser des pixels hors écran. C'est de la géométrie pure, pas encore des pixels.

### 2.4 Rasterisation — de la géométrie aux fragments

C'est le cœur : la **rasterisation** convertit un triangle continu (3 sommets) en un ensemble discret de **fragments** — des « pixels candidats ». Pour chaque pixel couvert par le triangle, le GPU génère un fragment.

```
RASTERISATION

  Triangle (3 sommets)        Fragments générés (chaque □ = 1 pixel)
      A                        · · · ■ · · ·
     ╱ ╲                       · · ■ ■ ■ · ·
    ╱   ╲                      · ■ ■ ■ ■ ■ ·
   B ─── C                     ■ ■ ■ ■ ■ ■ ■

  Pour chaque pixel de la boîte englobante du triangle :
    1. Est-il À L'INTÉRIEUR du triangle ?
    2. Si oui → générer un fragment et INTERPOLER les attributs
```

**Interpolation barycentrique.** Chaque point à l'intérieur d'un triangle s'écrit comme une moyenne pondérée des 3 sommets :

```
P = w0·A + w1·B + w2·C     avec  w0 + w1 + w2 = 1  et  wi ≥ 0
```

Les poids `(w0, w1, w2)` — les **coordonnées barycentriques** — servent à interpoler **tout** attribut du sommet vers le fragment : couleur, UV, normale, et surtout la **profondeur**. C'est la réponse à la question 2 du cas concret : un pixel au centre du triangle prend une couleur mélangée des trois sommets (au centre exact, `1/3` de chaque → gris).

C'est aussi ici qu'intervient le **backface culling** (voir 2.7).

### 2.5 Fragment shader — une fois par fragment

Le **fragment shader** est le second étage programmable. Il s'exécute **une fois par fragment**, en parallèle. Son rôle : calculer la **couleur finale** (RGBA) du pixel. Il reçoit les attributs interpolés (couleur, normale, UV du fragment) et produit une couleur.

```
FRAGMENT SHADER (conceptuel)

  entrée : couleur interpolée, normale interpolée, UV interpolés
  sortie : couleur RGBA du pixel

  Version minimale : renvoyer la couleur interpolée telle quelle.
  Version éclairée  : couleur × facteur de lumière (module 05).
```

Piège de vocabulaire : un **fragment n'est pas encore un pixel**. C'est un *candidat*. Il peut encore être rejeté par les tests de sortie (depth, stencil). Un pixel affiché est un fragment qui a survécu.

### 2.6 Tests de sortie — depth, stencil, blending

Dernier maillon fixe (l'**output merger**). Il décide si le fragment est écrit dans le framebuffer, et comment.

**Depth test (z-buffer).** C'est la réponse à la question 3. Un **depth buffer** (ou z-buffer) stocke, pour chaque pixel, la profondeur de ce qui y est actuellement affiché. Quand un nouveau fragment arrive :

```
DEPTH TEST (fonction par défaut : "less")

  si  fragment.depth < depthBuffer[x][y] :
      → le fragment est DEVANT
      → on l'écrit ET on met à jour depthBuffer[x][y]
  sinon :
      → il est DERRIÈRE → REJETÉ
```

Conséquence majeure : les objets proches masquent les objets lointains **quel que soit l'ordre de dessin**. Plus besoin de trier ses triangles à la main. La profondeur du fragment vient de l'interpolation barycentrique du `z` NDC des sommets (2.4). Rappel du module 03 : cette profondeur est **non linéaire** (précision concentrée près du near plane).

Les GPU modernes font même de l'**early depth test** : rejeter le fragment *avant* le fragment shader quand c'est possible, pour ne pas gaspiller de calcul sur un pixel masqué.

**Stencil test.** Un **stencil buffer** est un masque (8 bits par pixel) qui autorise ou interdit le rendu dans certaines zones. Usages : miroirs/portails, contours (outline), ombres planaires. Principe en deux passes : passe 1 = écrire le masque ; passe 2 = ne dessiner que là où le masque vaut la valeur voulue.

**Alpha blending.** Pour la transparence, on **mélange** la couleur du fragment avec celle déjà présente. Formule standard *(over)* :

```
finalColor = srcColor · srcAlpha + dstColor · (1 − srcAlpha)
```

Avec `alpha = 0.5`, rouge sur bleu → violet. **Piège classique :** contrairement au depth test, le blending **dépend de l'ordre de dessin**. On dessine d'abord les opaques (depth test actif), puis les transparents triés du plus loin au plus près, en désactivant l'écriture de profondeur.

### 2.7 Backface culling et winding order

Réponse à la question 4. Un triangle a deux faces : avant et arrière. Sur un objet fermé (une sphère, un cube), les faces arrière sont **invisibles** — cachées par l'objet lui-même. Le **backface culling** les élimine avant de les rasteriser, ce qui économise plus de 50 % du travail de fragment shader sur un objet fermé.

Comment le GPU distingue avant et arrière ? Par le **winding order** (ordre d'enroulement) des sommets projetés à l'écran :

```
WINDING ORDER (convention par défaut : CCW = face avant)

  Sommets vus dans l'ordre ANTI-HORAIRE (CCW) → face AVANT (gardée)
  Sommets vus dans l'ordre HORAIRE       (CW) → face ARRIÈRE (culled)

        A                       A
       ╱ ╲   ordre A→B→C        ╲ ╱   la même face, vue de
      ╱   ╲  anti-horaire       ╱ ╲   derrière : l'ordre paraît
     C ─── B  = AVANT          B ─── C  horaire = ARRIÈRE
```

Un même triangle CCW paraît CW quand on le regarde par-derrière : c'est ainsi que le GPU sait qu'on voit sa face arrière. En WebGL cela se règle avec `glEnable(GL_CULL_FACE)`, `glCullFace(GL_BACK)`, `glFrontFace(GL_CCW)` ; en WebGPU via l'état `primitive: { cullMode, frontFace }` du pipeline (modules 06 et 10). Ici, retiens le **concept** : l'ordre des sommets encode l'orientation.

### 2.8 Framebuffer et double buffering

Le **framebuffer** est la cible finale : le tableau de pixels affiché. Pour éviter le scintillement (voir l'écran en cours de dessin), on utilise le **double buffering** : le GPU dessine dans un *back buffer* invisible, puis on **échange** (swap) back et front une fois l'image terminée. L'utilisateur ne voit jamais un frame incomplet. En WebGPU, ce système est géré par la configuration du canvas : `context.configure({ device, format, alphaMode })`, puis `context.getCurrentTexture()` fournit le back buffer courant à chaque frame.

### 2.9 Fixe vs programmable — la carte mentale à retenir

| Étape | Statut | Ce que tu contrôles |
|---|---|---|
| Vertex shader | **programmable** | tu écris le code (position clip) |
| Primitive assembly + clipping | fixe | topologie choisie |
| Rasterisation + culling | fixe | cullMode, frontFace |
| Fragment shader | **programmable** | tu écris le code (couleur) |
| Depth / stencil / blend | fixe | tu configures l'état |
| Framebuffer | fixe | format, clear |

Les deux seuls endroits où tu écris du **code de shader** sont le vertex shader et le fragment shader. Tout le reste, tu le **configures**.

---

## 3. Worked examples

### Exemple 1 — Le trajet complet d'un vertex jusqu'à un pixel

Reprenons le triangle du cas concret et suivons **le sommet A**, puis un **pixel au centre**.

**Étape 0 — donnée d'entrée.** Le sommet A a une position locale et une couleur rouge `(1, 0, 0)`.

**Étape 1 — vertex shader.** Il calcule `clipPos = projection · view · model · A`. On obtient `clip A = (0.0, 0.8, 0.3, 1.0)`. La couleur rouge est transmise en varying, non modifiée. Idem pour B (vert) et C (bleu). *3 invocations parallèles, une par sommet.*

**Étape 2 — primitive assembly + clipping.** Les 3 sommets forment 1 triangle (`triangle-list`). Il est entièrement dans le frustum → passe tel quel.

**Étape 3 — rasterisation.** Le GPU parcourt la boîte englobante du triangle à l'écran. Prenons le **pixel central** P. Le test d'intérieur réussit. Ses coordonnées barycentriques y valent environ `(1/3, 1/3, 1/3)`. Le GPU interpole :

```
couleur(P) = 1/3·(1,0,0) + 1/3·(0,1,0) + 1/3·(0,0,1) = (0.33, 0.33, 0.33)  → gris
profondeur(P) = 1/3·0.3 + 1/3·0.3 + 1/3·0.3 = 0.3
```

Un **fragment** est généré pour P, avec couleur grise et profondeur 0.3.

**Étape 4 — fragment shader.** Version minimale : il renvoie la couleur interpolée telle quelle → `(0.33, 0.33, 0.33, 1)`. *Une invocation par fragment, en parallèle sur tous les pixels du triangle.*

**Étape 5 — tests de sortie.** Depth test : `0.3 < depthBuffer[P]` (initialisé à 1.0) → **vrai**. Le fragment est écrit : `colorBuffer[P] = gris`, `depthBuffer[P] = 0.3`.

**Résultat :** le pixel central est gris. Le sommet A, lui, est un coin rouge pur. Entre les deux, un dégradé continu produit par l'interpolation barycentrique — sans qu'aucun sommet n'existe au milieu.

### Exemple 2 — Deux marqueurs : le z-buffer résout la visibilité

TribuZen dessine **deux marqueurs** qui se chevauchent à l'écran. Marqueur R (rouge) est **loin** (`depth 0.8`), marqueur B (bleu) est **près** (`depth 0.3`). On les dessine dans le « mauvais » ordre : **R d'abord, puis B**.

```
DÉROULÉ DU DEPTH TEST au pixel de chevauchement Q
(depthBuffer[Q] initialisé à 1.0)

  1) Dessin de R (loin, depth 0.8) :
       0.8 < 1.0 ?  OUI  → écrit rouge, depthBuffer[Q] = 0.8

  2) Dessin de B (près, depth 0.3) :
       0.3 < 0.8 ?  OUI  → écrit bleu,  depthBuffer[Q] = 0.3

  Pixel Q final : BLEU (le plus proche gagne)
```

Maintenant l'ordre **inverse** (B d'abord, puis R) :

```
  1) Dessin de B (près, depth 0.3) :
       0.3 < 1.0 ?  OUI  → écrit bleu,  depthBuffer[Q] = 0.3

  2) Dessin de R (loin, depth 0.8) :
       0.8 < 0.3 ?  NON  → fragment REJETÉ, rien n'est écrit

  Pixel Q final : BLEU (identique !)
```

**Le résultat est identique dans les deux ordres.** C'est toute la puissance du z-buffer : la visibilité correcte **sans trier les objets opaques**. (À nuancer : les objets *transparents*, eux, doivent être triés — voir le piège blending en 2.6.)

---

## 4. Pièges & misconceptions

### PIÈGE #1 — « Un fragment est un pixel »

Faux. Un **fragment** est un *candidat* produit par la rasterisation. Il peut encore être rejeté par le depth test ou le stencil test. Un **pixel** est ce qui reste affiché dans le framebuffer. Sur une scène avec beaucoup de recouvrement (*overdraw*), le GPU génère bien plus de fragments qu'il n'y a de pixels affichés.

### PIÈGE #2 — Confondre le rôle du vertex shader et du fragment shader

- **Vertex shader** : *une fois par sommet*, positionne (sortie = clip position). Il n'a aucune notion de pixel ni de couleur finale.
- **Fragment shader** : *une fois par fragment*, colore (sortie = couleur RGBA).

Erreur typique : vouloir calculer la position dans le fragment shader, ou l'éclairage par pixel dans le vertex shader (ça donne un éclairage grossier, interpolé — le fameux Gouraud vs Phong du module 05).

### PIÈGE #3 — Croire qu'il faut trier les triangles opaques

Non : le **depth test** s'en charge (Exemple 2). Trier les opaques manuellement est inutile et coûteux. **En revanche**, les objets **transparents** doivent être triés (du plus loin au plus près) car le blending, lui, dépend de l'ordre de dessin. Ne pas confondre les deux régimes.

### PIÈGE #4 — Oublier le winding order après une transformation miroir

Le backface culling se base sur le winding order. Une **échelle négative** (miroir, ex. `scale(-1, 1, 1)`) **inverse** l'orientation apparente : les faces avant paraissent arrière et sont culled → l'objet devient invisible ou « à l'envers ». Symptôme classique d'un modèle qui disparaît après un mirroring. Solution : ajuster `frontFace` ou re-corriger l'échelle.

### PIÈGE #5 — Penser que rasterisation et ray tracing sont la même chose

La **rasterisation** part de la géométrie et projette *les triangles vers les pixels* (« pour chaque triangle, quels pixels ? »). Le **ray tracing** (module 22) part de l'écran et lance *des rayons vers la géométrie* (« pour chaque pixel, quel triangle ? »). Ce module décrit **uniquement la rasterisation** — c'est le pipeline temps réel standard de WebGL et WebGPU.

### PIÈGE #6 — « Le depth buffer est linéaire »

Non (rappel module 03). À cause de la division perspective, la profondeur stockée suit un `1/z` : haute précision près du near plane, faible au loin. C'est la cause du **z-fighting** entre surfaces coplanaires lointaines. Rapprocher le near plane empire le problème.

---

## 5. Ancrage TribuZen

La **carte 3D des sorties de la famille** (fil rouge de ce cours) est un cas d'école du pipeline :

- **Vertex shader** : chaque sommet du globe et chaque marqueur est projeté en clip space via `projection · view · model` (module 03 branché ici).
- **Rasterisation + interpolation** : les dégradés de couleur sur les marqueurs (ex. un marqueur qui va du chaud au froid selon l'ancienneté de la sortie) sont produits gratuitement par l'interpolation barycentrique entre sommets.
- **Depth test** : quand un marqueur passe devant un autre en tournant le globe, le z-buffer garantit le bon ordre d'affichage **sans code de tri** côté TribuZen. C'est ce qui rend la carte fiable quand la famille ajoute des dizaines de sorties.
- **Backface culling** : la moitié arrière du globe (invisible) est éliminée → le rendu reste fluide sur mobile.
- **Alpha blending** : le halo semi-transparent autour du marqueur « sortie du jour » utilise le blending — et devra être dessiné **après** les marqueurs opaques.

Ce module est **conceptuel** : aucun fichier `tribuzen` n'est produit ici. Il est la **fondation mentale** des modules 06 (WebGL) et 09-10 (WebGPU), où ces étapes deviendront du vrai code de rendu pour la carte.

---

## 6. Points clés

1. Le pipeline de rasterisation transforme des **sommets** en **pixels** via une chaîne fixe d'étapes, massivement parallèle.
2. **Vertex shader** (programmable) : une fois par sommet, produit la position clip.
3. **Primitive assembly + clipping** (fixe) : regroupe en triangles, découpe contre le frustum.
4. **Rasterisation** (fixe) : triangle → fragments ; **interpolation barycentrique** de tous les attributs (couleur, profondeur…).
5. **Fragment shader** (programmable) : une fois par fragment, produit la couleur RGBA.
6. **Depth test / z-buffer** : résout la visibilité des opaques **indépendamment de l'ordre de dessin**.
7. **Alpha blending** : la transparence **dépend** de l'ordre (dessiner les transparents triés, après les opaques).
8. **Backface culling** : élimine les faces arrière via le **winding order** (CCW = avant par défaut).
9. Un **fragment** n'est pas un pixel : c'est un candidat, qui peut être rejeté par les tests.
10. Les deux seuls étages où tu écris du code sont le **vertex shader** et le **fragment shader** ; le reste se **configure**.

---

## 7. Seeds Anki

```
Quel est le rôle obligatoire du vertex shader ?|Produire, une fois par sommet, la position du sommet en clip space (projection · view · model · position). Il ne connaît qu'un sommet à la fois.
Quelle est la différence entre un fragment et un pixel ?|Un fragment est un pixel candidat produit par la rasterisation ; il peut encore être rejeté (depth/stencil test). Un pixel est un fragment survivant, écrit dans le framebuffer.
Comment un pixel au centre d'un triangle obtient-il sa couleur ?|Par interpolation barycentrique : couleur = w0·A + w1·B + w2·C avec w0+w1+w2=1. Au centre exact, 1/3 de chaque sommet.
Pourquoi le depth test dispense-t-il de trier les objets opaques ?|Le z-buffer stocke la profondeur du plus proche par pixel ; un fragment plus loin est rejeté quel que soit l'ordre de dessin. Le résultat est identique dans tout ordre.
Les objets transparents doivent-ils être triés ? Pourquoi ?|Oui : l'alpha blending mélange src et dst (finalColor = src·srcAlpha + dst·(1−srcAlpha)) et dépend de l'ordre. On les dessine du plus loin au plus près, après les opaques.
Comment le GPU distingue face avant et face arrière d'un triangle ?|Par le winding order des sommets projetés à l'écran : anti-horaire (CCW) = face avant par défaut, horaire (CW) = face arrière (culled avec GL_CULL_FACE / cullMode).
Quelles sont les deux seules étapes programmables du pipeline ?|Le vertex shader (position, par sommet) et le fragment shader (couleur, par fragment). Rasterisation, clipping, tests et blending sont fixes : on les configure.
Pourquoi le depth buffer est-il non linéaire ?|La division perspective donne une profondeur en 1/z : forte précision près du near plane, faible au loin. Cause du z-fighting sur surfaces coplanaires lointaines.
Rasterisation vs ray tracing : quelle différence de sens ?|Rasterisation : pour chaque triangle, quels pixels ? (géométrie → écran). Ray tracing : pour chaque pixel, quel triangle ? (écran → géométrie). Ce module ne couvre que la rasterisation.
```

---

## Pont vers le lab

> Lab associé : `labs/lab-04-pipeline-de-rendu/README.md`. Tracer à la main le parcours d'un vertex jusqu'au pixel, puis expérimenter le depth test et le backface culling — README-only, validé par le coach en session, zéro harnais.
