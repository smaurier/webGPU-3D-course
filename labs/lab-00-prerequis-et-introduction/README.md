# Lab 00 — Prérequis & introduction : détecter WebGPU et afficher un premier canvas

> **Outcome :** à la fin, tu sais détecter le support WebGPU d'un navigateur réel, initialiser un canvas net (HiDPI), et faire dessiner le GPU (canvas coloré + animation pilotée par `deltaTime`).
> **Vrai outil :** un navigateur réel (**Chrome ou Edge 113+**) + une page HTML/JS servie en local. Aucun harnais, aucun test-runner : tu observes le résultat à l'écran et dans la console.
> **Feedback :** le coach valide visuellement en session (canvas coloré animé + logs GPU dans la console).

---

## Énoncé

Tu poses la première pierre de `FamilyGlobe`, le globe interactif des sorties de la famille dans TribuZen. Pas encore de sphère : d'abord **prouver que le GPU est disponible et dessine**.

Écris une page `index.html` autonome qui :

1. Contient un `<canvas id="family-globe">` (dimensionné en CSS, ex. 480×480).
2. **Détecte** le support WebGPU. Si absent → remplace le canvas par un message de repli lisible et s'arrête proprement.
3. Si supporté → obtient `adapter` puis `device`, et **logue** dans la console : le format préféré du canvas et `device.limits.maxTextureDimension2D`.
4. Dimensionne le buffer interne du canvas avec `devicePixelRatio` (rendu net sur Retina).
5. Lance une **boucle `requestAnimationFrame`** qui efface le canvas avec une **couleur qui varie dans le temps** (via `deltaTime` / temps écoulé), pour prouver que la boucle GPU tourne à 60 fps.

**Contrainte :** aucune bibliothèque (pas de Three.js). WebGPU brut + DOM. Servi en `localhost` (contexte sécurisé requis).

### Comment servir la page

WebGPU exige HTTPS **ou** `localhost`. Ouvrir le fichier en `file://` ne suffit pas. Depuis le dossier du lab :

```bash
# au choix — n'importe quel serveur statique sur localhost
npx serve .
# ou
python -m http.server 5173
```

Puis ouvre l'URL `http://localhost:...` dans **Chrome ou Edge**.

### Starter minimal

Crée `index.html` avec ce squelette — **à toi de remplir les 5 TODO** :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Lab 00 — FamilyGlobe : premier contact GPU</title>
    <style>
      body { margin: 0; display: grid; place-items: center; height: 100vh; background: #0b1020; }
      #family-globe { width: 480px; height: 480px; border-radius: 50%; }
      .fallback { color: #e5e7eb; font-family: sans-serif; max-width: 30rem; text-align: center; }
    </style>
  </head>
  <body>
    <canvas id="family-globe"></canvas>

    <script type="module">
      async function main() {
        const canvas = document.getElementById('family-globe')

        // TODO 1 — feature-detection navigator.gpu : si absent, repli lisible + return
        // TODO 2 — requestAdapter puis requestDevice
        // TODO 3 — logs console : format préféré + device.limits.maxTextureDimension2D
        // TODO 4 — dimensionner canvas.width/height avec devicePixelRatio
        // TODO 5 — boucle requestAnimationFrame : render pass qui clear avec une couleur animée
      }

      main().catch(console.error)
    </script>
  </body>
</html>
```

---

## Étapes (en friction)

1. **Feature-detection.** Teste `if (!navigator.gpu)`. Dans le repli, remplace le canvas par un `<p class="fallback">` expliquant qu'il faut Chrome/Edge 113+. `return` ensuite.
2. **Adapter + device.** `await navigator.gpu.requestAdapter()` ; si `null`, lève une erreur. Puis `await adapter.requestDevice()`.
3. **Logs.** Récupère `navigator.gpu.getPreferredCanvasFormat()` et `device.limits.maxTextureDimension2D`, affiche-les avec `console.log`.
4. **Canvas net.** `const dpr = window.devicePixelRatio || 1` ; règle `canvas.width = canvas.clientWidth * dpr` (idem hauteur). Configure le contexte : `context.configure({ device, format, alphaMode: 'premultiplied' })`.
5. **Boucle animée.** Dans `requestAnimationFrame`, calcule `elapsed` (temps écoulé en secondes), déduis une couleur qui oscille (`Math.sin`), crée un `commandEncoder`, un `beginRenderPass` avec `loadOp: 'clear'` et `clearValue` = ta couleur, `pass.end()`, `device.queue.submit(...)`, puis re-programme la frame.
6. **Vérifie.** Le disque (canvas rond) doit changer de couleur en continu, et la console afficher les infos GPU. Coupe le Wi-Fi / ouvre dans Firefox par défaut → le repli doit s'afficher sans planter.

---

## Corrigé complet commenté

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Lab 00 — FamilyGlobe : premier contact GPU</title>
    <style>
      body { margin: 0; display: grid; place-items: center; height: 100vh; background: #0b1020; }
      #family-globe { width: 480px; height: 480px; border-radius: 50%; }
      .fallback { color: #e5e7eb; font-family: sans-serif; max-width: 30rem; text-align: center; }
    </style>
  </head>
  <body>
    <canvas id="family-globe"></canvas>

    <script type="module">
      async function main() {
        const canvas = document.getElementById('family-globe')

        // ── TODO 1 — Feature-detection ─────────────────────────────
        // navigator.gpu est undefined si WebGPU absent OU hors contexte sécurisé.
        if (!navigator.gpu) {
          const p = document.createElement('p')
          p.className = 'fallback'
          p.textContent =
            'Globe 3D indisponible : WebGPU non supporté. Ouvre cette page dans Chrome ou Edge 113+ (en http://localhost).'
          canvas.replaceWith(p)
          return // arrêt propre, pas d'exception
        }

        // ── TODO 2 — Adapter puis Device ───────────────────────────
        // adapter = GPU physique exposé ; device = connexion logique (tout passe par lui).
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
        if (!adapter) throw new Error('Aucun adapter GPU disponible.')
        const device = await adapter.requestDevice()

        // ── TODO 3 — Logs des capacités GPU ────────────────────────
        const format = navigator.gpu.getPreferredCanvasFormat() // bgra8unorm ou rgba8unorm
        console.log('Format préféré du canvas :', format)
        console.log('Max texture 2D :', device.limits.maxTextureDimension2D)

        // ── TODO 4 — Canvas net sur écrans HiDPI ───────────────────
        // Le buffer interne doit valoir taille CSS × devicePixelRatio, sinon flou.
        const dpr = window.devicePixelRatio || 1
        canvas.width = canvas.clientWidth * dpr
        canvas.height = canvas.clientHeight * dpr

        const context = canvas.getContext('webgpu')
        context.configure({ device, format, alphaMode: 'premultiplied' })

        // ── TODO 5 — Boucle de rendu : clear animé ─────────────────
        // On mesure le temps écoulé pour animer la couleur (indépendant du framerate).
        let start = 0
        function frame(now) {
          if (start === 0) start = now
          const elapsed = (now - start) / 1000 // secondes depuis le début

          // Couleur qui oscille dans le temps (dégradé bleu → violet → bleu)
          const r = Math.sin(elapsed * 0.5) * 0.15 + 0.15
          const g = Math.sin(elapsed * 0.4 + 1.0) * 0.1 + 0.15
          const b = Math.sin(elapsed * 0.3 + 2.0) * 0.2 + 0.4

          // Un render pass minimal : effacer la texture du canvas avec (r,g,b)
          const encoder = device.createCommandEncoder()
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: context.getCurrentTexture().createView(), // back buffer de cette frame
                clearValue: { r, g, b, a: 1 },
                loadOp: 'clear',  // efface avant de dessiner
                storeOp: 'store', // conserve le résultat pour l'affichage
              },
            ],
          })
          pass.end() // on ne dessine rien de plus : juste le clear (Hello World du rendu)
          device.queue.submit([encoder.finish()]) // envoi des commandes au GPU

          requestAnimationFrame(frame) // frame suivante, synchronisée sur l'écran
        }
        requestAnimationFrame(frame)

        // Bonus robustesse : réagir à la perte du device (onglet en veille, driver reset)
        device.lost.then((info) => console.warn('GPU device perdu :', info.message))
      }

      main().catch(console.error)
    </script>
  </body>
</html>
```

**Pourquoi ce corrigé est correct :**
- **Feature-detection avant tout appel** : `navigator.gpu` est testé en premier ; le repli remplace le canvas et `return` — aucune exception si WebGPU manque.
- **adapter ≠ device** : on demande l'adapter une fois, puis le device *à partir de l'adapter*. Tout le rendu passe ensuite par `device`.
- **DPR appliqué** : `canvas.width = clientWidth * dpr` garantit un rendu net sur Retina ; la taille visuelle reste fixée par le CSS (480 px).
- **Animation par le temps** : la couleur dépend de `elapsed` (secondes écoulées), pas du numéro de frame — comportement identique sur 60 et 120 Hz.
- **Render pass minimal** : `loadOp: 'clear'` + `storeOp: 'store'` sans draw call = on efface le canvas avec une couleur. C'est le socle sur lequel viendront se greffer les triangles (module 09) puis la sphère.

---

## Variante J+30 (fading)

**Même objectif, contraintes ajoutées** — reproduis la page **de mémoire, en 25 minutes**, sans rouvrir ce corrigé ni le module 00 :

1. Affiche en **overlay HTML** (par-dessus le canvas) le **texte du format** et de `maxTextureDimension2D` — plus seulement dans la console.
2. Ajoute un **compteur de FPS** temps réel dans cet overlay (moyenne glissante sur ~1 s, à partir de `deltaTime`).
3. Gère le **redimensionnement** : un `ResizeObserver` qui recalcule `canvas.width/height` avec le DPR quand la fenêtre change.

**Critère de réussite :** dans Chrome/Edge, le canvas rond change de couleur en continu, l'overlay affiche format + limites + FPS stable (~60), et redimensionner la fenêtre garde le rendu net. Dans Firefox par défaut, le repli s'affiche sans erreur en console.

---

## Application TribuZen

Dans le repo `smaurier/tribuzen`, ce premier contact GPU devient le socle de `FamilyGlobe` :

```
tribuzen/
  src/
    components/
      globe/
        FamilyGlobe.vue        ← <canvas> dans le template, init + boucle dans <script setup>
        useWebGPUSupport.ts     ← composable : détection navigator.gpu + état de repli réactif
```

**Différences par rapport au lab :**
- La feature-detection passe dans un **composable `useWebGPUSupport()`** qui expose un `ref<boolean>` `isSupported` — le template affiche le globe ou un fallback selon sa valeur.
- L'init GPU et la boucle démarrent dans **`onMounted`** et s'arrêtent dans **`onUnmounted`** (`cancelAnimationFrame`, `device.destroy()`), pour ne pas fuir quand on quitte la page.
- Le canvas est dimensionné via le layout Vue/CSS du produit, pas en dur — mais la logique DPR reste identique.

**Commit cible :**
```
feat(globe): FamilyGlobe — détection WebGPU + canvas GPU animé (socle du globe des sorties)
```
