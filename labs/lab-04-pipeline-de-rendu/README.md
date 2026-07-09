# Lab 04 — Le pipeline de rendu (du vertex au pixel)

> **Outcome :** à la fin, tu sais **tracer à la main** le parcours d'un vertex jusqu'à un pixel, et tu as **vu de tes yeux** dans un navigateur réel comment le depth test et le backface culling changent l'image.
> **Vrai outil :** Chrome + un mini-rasteriseur logiciel (Canvas 2D, HTML autonome). Pas d'API GPU ici (module 06+) — on observe le *comportement* du pipeline sur du vrai code qui tourne. **Zéro harnais auto-correcteur.**
> **Feedback :** le coach valide en session — le trace papier et l'observation visuelle dans le navigateur.

---

## Énoncé

Ce module est conceptuel : le lab l'ancre par **deux activités**.

- **Partie A (papier)** — tracer le parcours complet d'un sommet à travers le pipeline, sans machine. C'est du *generation effect* : tu produis le résultat avant de le vérifier.
- **Partie B (navigateur)** — ouvrir un mini-rasteriseur dans Chrome et **manipuler** le depth test et le backface culling pour voir leur effet réel sur l'image.

Contexte fil rouge : le triangle utilisé est un **marqueur de la carte 3D TribuZen** (un marqueur = un triangle coloré, rouge/vert/bleu aux 3 coins).

### Partie A — Trace papier (à faire AVANT d'ouvrir le navigateur)

On te donne un triangle déjà transformé en clip space (les valeurs sortent du vertex shader). Chaque sommet a une profondeur NDC et une couleur :

```
Sommet A : écran (200, 40)   depth 0.30   couleur rouge (1, 0, 0)
Sommet B : écran (60, 260)   depth 0.30   couleur vert  (0, 1, 0)
Sommet C : écran (340, 260)  depth 0.30   couleur bleu  (0, 0, 1)
```

Réponds sur papier, **sans code** :

1. Combien d'invocations du **vertex shader** pour ce triangle ? Combien de sorties `clipPosition` produit-il ?
2. Le pixel P au **centre** approx `(200, 187)` : ses coordonnées barycentriques sont `(1/3, 1/3, 1/3)`. Quelle **couleur** le fragment shader va-t-il produire pour P ? (calcule les 3 composantes)
3. Un **deuxième** marqueur bleu, `depth 0.10`, chevauche P. On dessine d'abord le triangle rouge/vert/bleu (depth 0.30), **puis** ce marqueur bleu (depth 0.10). Au pixel P, la fonction de depth test est « less » : quelle couleur finit affichée, et quelle valeur reste dans le `depthBuffer[P]` ?
4. Même question mais on **inverse** l'ordre de dessin (marqueur bleu d'abord). Le résultat au pixel P change-t-il ? Pourquoi ?
5. Le triangle est défini dans l'ordre A → B → C. À l'écran, cet ordre est-il horaire ou anti-horaire ? Avec la convention par défaut (CCW = face avant), ce triangle est-il **gardé** ou **culled** ?

Garde tes réponses écrites : tu les compareras à ce que fait le navigateur en Partie B.

### Partie B — Expérimentation navigateur

Crée un fichier `pipeline.html` avec le starter ci-dessous, puis **ouvre-le dans Chrome** (double-clic suffit, aucun serveur requis). Trois cases à cocher pilotent le rendu :

- **Depth test** ON/OFF
- **Backface culling** ON/OFF
- **Inverser l'ordre de dessin** des deux marqueurs

Ta mission : **manipuler** ces réglages et **noter ce qui change**, en confrontant à ta trace papier.

#### Starter — `pipeline.html`

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Lab 04 — Pipeline de rendu</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; }
    canvas { border: 1px solid #ccc; image-rendering: pixelated; }
    label { display: block; margin: .3rem 0; }
    #info { white-space: pre; font-family: monospace; margin-top: 1rem; color: #333; }
  </style>
</head>
<body>
  <h1>Pipeline de rendu — depth test &amp; culling</h1>
  <label><input type="checkbox" id="depth" checked /> Depth test</label>
  <label><input type="checkbox" id="cull" checked /> Backface culling (CCW = avant)</label>
  <label><input type="checkbox" id="swap" /> Inverser l'ordre de dessin</label>
  <canvas id="cv" width="400" height="300"></canvas>
  <div id="info"></div>

  <script>
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;

    // --- Buffers logiciels : le "framebuffer" et le "depth buffer" du pipeline ---
    let colorBuf, depthBuf;

    // Edge function : de quel côté de l'arête (v0->v1) se trouve p ?
    // (c'est un produit vectoriel 2D — signe = orientation)
    function edge(ax, ay, bx, by, px, py) {
      return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    }

    // Rasterise UN triangle. tri = { v:[[x,y],...], depth, color:[r,g,b] }
    function rasterize(tri, opts) {
      const [A, B, C] = tri.v;
      const area = edge(A[0], A[1], B[0], B[1], C[0], C[1]);

      // --- BACKFACE CULLING ---
      // area > 0 => sommets CCW à l'écran => face avant (convention du lab).
      // Si culling actif et face arrière (area <= 0), on saute le triangle.
      if (opts.cull && area <= 0) return;
      if (area === 0) return; // triangle dégénéré

      const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));

      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          // Coordonnées barycentriques via les edge functions
          let w0 = edge(B[0], B[1], C[0], C[1], px, py) / area;
          let w1 = edge(C[0], C[1], A[0], A[1], px, py) / area;
          let w2 = edge(A[0], A[1], B[0], B[1], px, py) / area;
          // Point à l'intérieur du triangle ? (tous les poids >= 0)
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;

          const idx = y * W + x;
          const depth = tri.depth; // même depth pour les 3 sommets ici

          // --- DEPTH TEST (fonction "less") ---
          if (opts.depth && depth >= depthBuf[idx]) continue; // rejeté : derrière

          // Le "fragment shader" : couleur interpolée (barycentrique)
          const r = w0 * tri.color[0] + w1 * 0 + w2 * 0; // A seul est rouge dans le tri principal
          // NB : pour garder le starter lisible, on colore chaque triangle
          // par sa couleur unie tri.color. La version dégradée est en défi.
          colorBuf[idx] = tri.color;
          if (opts.depth) depthBuf[idx] = depth;
        }
      }
    }

    function render() {
      const useDepth = document.getElementById('depth').checked;
      const useCull  = document.getElementById('cull').checked;
      const swap     = document.getElementById('swap').checked;
      const opts = { depth: useDepth, cull: useCull };

      // Clear
      colorBuf = new Array(W * H).fill(null);
      depthBuf = new Array(W * H).fill(1.0); // 1.0 = le plus loin

      // Marqueur 1 : triangle CCW, LOIN (depth 0.30), rouge
      const t1 = { v: [[200, 40], [60, 260], [340, 260]], depth: 0.30, color: [220, 40, 40] };
      // Marqueur 2 : triangle CCW, PRÈS (depth 0.10), bleu, chevauche t1
      const t2 = { v: [[200, 120], [110, 250], [290, 250]], depth: 0.10, color: [40, 90, 220] };

      const order = swap ? [t2, t1] : [t1, t2];
      for (const t of order) rasterize(t, opts);

      // Recopier le framebuffer logiciel dans le canvas
      const img = ctx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        const c = colorBuf[i];
        img.data[i * 4 + 0] = c ? c[0] : 245;
        img.data[i * 4 + 1] = c ? c[1] : 245;
        img.data[i * 4 + 2] = c ? c[2] : 245;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);

      document.getElementById('info').textContent =
        `depth test : ${useDepth ? 'ON' : 'OFF'}   culling : ${useCull ? 'ON' : 'OFF'}   ordre inversé : ${swap ? 'OUI' : 'NON'}\n` +
        `Observe le pixel de chevauchement (~200,180) : rouge ou bleu ?`;
    }

    for (const id of ['depth', 'cull', 'swap']) {
      document.getElementById(id).addEventListener('change', render);
    }
    render();
  </script>
</body>
</html>
```

---

## Étapes (en friction)

1. **Fais la Partie A d'abord**, sur papier. Ne saute pas — c'est là que l'apprentissage se fait.
2. Crée `pipeline.html`, colle le starter, ouvre-le dans Chrome. Tu dois voir un triangle bleu **devant** un triangle rouge.
3. **Expérience depth test :** décoche « Depth test ». Que devient le pixel de chevauchement ? Coche « Inverser l'ordre de dessin » avec depth test OFF, puis ON. Note les 4 combinaisons (depth ON/OFF × ordre normal/inversé) et **quelle couleur gagne** au centre à chaque fois.
4. **Expérience culling :** modifie dans le code le marqueur `t2` pour **inverser son winding** (échange les 2 derniers sommets : `[[200,120],[290,250],[110,250]]`). Recharge. Avec culling ON, le triangle bleu **disparaît** (il est devenu face arrière). Décoche « Backface culling » : il **réapparaît**. Explique pourquoi avec le concept de winding order.
5. **Confronte** tes observations à ta trace papier (questions 3, 4, 5). Où avais-tu raison ? Où t'es-tu trompé ?

---

## Corrigé complet commenté

### Partie A — réponses attendues

1. **3 invocations** du vertex shader (une par sommet), donc **3 sorties `clipPosition`**. Le vertex shader ne connaît qu'un sommet à la fois ; il ne « voit » pas le triangle.
2. Couleur de P = interpolation barycentrique :
   ```
   r = 1/3·1 + 1/3·0 + 1/3·0 = 0.33
   g = 1/3·0 + 1/3·1 + 1/3·0 = 0.33
   b = 1/3·0 + 1/3·0 + 1/3·1 = 0.33
   → gris (0.33, 0.33, 0.33)
   ```
   Aucun sommet n'est gris : la couleur naît de l'interpolation.
3. Ordre normal (rouge/vert/bleu `depth 0.30` **puis** marqueur bleu `depth 0.10`) :
   - dessin 1 : `0.30 < 1.0` → écrit, `depthBuffer[P] = 0.30`
   - dessin 2 : `0.10 < 0.30` → écrit, `depthBuffer[P] = 0.10`
   - **affiché : bleu**, `depthBuffer[P] = 0.10`.
4. Ordre inversé (bleu `0.10` d'abord, puis `0.30`) :
   - dessin 1 : `0.10 < 1.0` → écrit, `depthBuffer[P] = 0.10`
   - dessin 2 : `0.30 < 0.10` → **faux** → rejeté
   - **affiché : bleu**, `depthBuffer[P] = 0.10`. **Résultat identique** : c'est la garantie du z-buffer, indépendante de l'ordre pour les opaques.
5. A `(200,40)` en haut, B `(60,260)` bas-gauche, C `(340,260)` bas-droit. En coordonnées écran (y vers le bas), l'ordre A → B → C tourne dans le sens qui donne une `edge(A,B,C)` **positive** dans le starter → traité comme **CCW = face avant** → **gardé**. (Le point clé pédagogique : c'est l'ordre des sommets, pas leur position absolue, qui décide.)

### Partie B — observations attendues

| Depth test | Ordre | Pixel de chevauchement |
|---|---|---|
| ON | normal | **bleu** (le plus proche gagne) |
| ON | inversé | **bleu** (identique — z-buffer !) |
| OFF | normal | **bleu** (dernier dessiné écrase) |
| OFF | inversé | **rouge** (dernier dessiné écrase) |

Lecture : **avec depth test**, le résultat ne dépend **pas** de l'ordre. **Sans depth test**, c'est « le dernier dessiné gagne » (*painter's algorithm*) → l'ordre devient critique et l'image peut être fausse.

**Culling (étape 4) :** en inversant le winding de `t2`, ses sommets paraissent **horaires (CW)** à l'écran → `area <= 0` → le code le classe **face arrière**. Avec culling ON, il est éliminé (disparaît). OFF, il est dessiné. C'est exactement le mécanisme qui, sur un objet fermé, économise le rendu des faces internes invisibles.

> **Note d'honnêteté sur le starter :** pour rester lisible, chaque triangle est peint en **couleur unie** (`tri.color`), pas en dégradé barycentrique — mais les poids `w0,w1,w2` sont bien calculés (ils servent au test d'intérieur). Le dégradé rouge→vert→bleu est proposé en défi ci-dessous.

---

## Variante J+30 (fading)

**Même sujet, contraintes ajoutées, sans rouvrir ce corrigé :**

1. **Dégradé barycentrique réel :** modifie `rasterize` pour que le triangle principal soit coloré en interpolant **trois couleurs de sommet** (rouge en A, vert en B, bleu en C) via `w0, w1, w2`. Le centre doit apparaître gris — vérifie visuellement.
2. **Depth interpolé :** donne au triangle principal **trois profondeurs différentes** aux sommets (ex. A=0.1, B=0.5, C=0.9) et interpole la profondeur par `w0·zA + w1·zB + w2·zC`. Fais-le chevaucher un second triangle à profondeur constante et observe la **ligne d'intersection** produite par le depth test par fragment.
3. **En 25 minutes**, de mémoire, sans regarder la Partie A.

**Critère de réussite :** le centre du triangle est visiblement gris (interpolation correcte) **et** l'intersection des deux triangles à profondeurs croisées apparaît comme une frontière nette (depth test par pixel).

---

## Application TribuZen

Ce lab est **conceptuel** — pas de commit `smaurier/tribuzen` produit ici. Mais il fixe les décisions de rendu de la **carte 3D des sorties** que tu implémenteras aux modules 06 (WebGL) puis 09-10 (WebGPU) :

- Les marqueurs opaques de la carte s'appuieront sur le **depth test** → **aucun tri manuel** côté TribuZen, même avec des dizaines de sorties qui se chevauchent en tournant le globe.
- Le halo semi-transparent du « marqueur du jour » devra être dessiné **après** les marqueurs opaques, **trié**, avec l'écriture de profondeur désactivée (blending dépendant de l'ordre).
- Le **backface culling** sera activé sur le globe fermé pour ne pas rendre sa moitié arrière → gain de perf sur mobile.

Quand tu écriras le vrai pipeline WebGPU (module 10), tu retrouveras ces réglages sous forme de champs : `primitive.cullMode`, `primitive.frontFace`, `depthStencil.depthCompare`, `fragment.targets[].blend`. Ce lab t'aura donné le **modèle mental** derrière chacun.
