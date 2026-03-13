# Module 27 — Audio 3D spatial

| Difficulte | Duree estimee | Lab | Quiz |
|:----------:|:-------------:|:---:|:----:|
| 3/5        | 120 min       | [Lab 27](../labs/lab-27-audio-3d-spatial/) | [Quiz 27](../quizzes/quiz-27-audio-3d-spatial.html) |

## Objectifs pedagogiques

A la fin de ce module, vous serez capable de :

- Creer et configurer un AudioContext et comprendre l'audio graph
- Charger des fichiers audio avec fetch + decodeAudioData
- Spatialiser une source audio avec PannerNode et AudioListener
- Configurer les modeles de distance (linear, inverse, exponential)
- Utiliser le panningModel HRTF pour un rendu binaural realiste
- Appliquer des effets (reverb, filtres, compression, delay) dans le graphe audio
- Integrer l'audio positionnel dans Three.js avec AudioListener et PositionalAudio
- Gerer la politique autoplay des navigateurs (user gesture + resume)
- Visualiser les frequences audio avec AnalyserNode

---

<details>
<summary>Rappel du cours precedent — WebXR et animation procedurale (Module 26)</summary>

Au module 26, nous avons couvert l'immersion via WebXR :

- **WebXR Device API** : navigator.xr, requestSession('immersive-vr'), XRFrame, XRReferenceSpace
- **Pose tracking** : XRViewerPose, XRView (un par oeil), projection et view matrices
- **Controleurs** : XRInputSource, gamepad, grip space, target ray space
- **Animation procedurale** : IK (Inverse Kinematics), FABRIK, CCD
- **Three.js XR** : renderer.xr.enabled, XRControllerModelFactory, teleportation
- **Performance XR** : 72-90 FPS obligatoires, foveated rendering, reprojection

Nous allons maintenant ajouter la dimension sonore a nos scenes 3D — car une experience immersive sans audio spatial, c'est comme un film muet en couleur.

</details>

---

## Pourquoi l'audio spatial

:::tip Analogie
Imagine que tu es dans une foret. Tu entends un oiseau chanter a droite, un ruisseau couler devant toi, et le vent souffler derriere. Sans meme ouvrir les yeux, tu peux localiser chaque source sonore. L'audio spatial dans une scene 3D reproduit exactement ca : il place les sons dans l'espace pour que ton cerveau les localise comme dans le monde reel. Sans audio spatial, tous les sons arrivent "a plat" — comme ecouter la foret a travers un telephone mono.
:::

```
Sans audio spatial :                    Avec audio spatial :
━━━━━━━━━━━━━━━━━━━━                   ━━━━━━━━━━━━━━━━━━━━
- Son identique gauche/droite           - Son positionne dans l'espace 3D
- Pas d'attenuation par distance        - Volume diminue avec la distance
- Pas de sens de direction              - Perception de la direction (HRTF)
- Ambiance plate                        - Reverb selon l'environnement
```

---

## Web Audio API : les fondamentaux

### AudioContext et audio graph

:::tip Analogie
L'audio graph fonctionne exactement comme le pipeline de rendu 3D. Les vertices passent par des transformations (vertex shader -> fragment shader -> framebuffer). Dans l'audio graph, le signal passe par des noeuds de traitement (source -> effets -> gain -> destination). Chaque noeud transforme le signal, et tu les connectes avec `.connect()`.
:::

```
Audio Graph — architecture en noeuds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Source(s)          Effets              Controle        Sortie
┌──────────┐     ┌──────────────┐    ┌──────────┐   ┌─────────────┐
│ Buffer   │────→│ BiquadFilter │───→│ GainNode │──→│ Destination │
│ Source   │     │ (low-pass)   │    │ (volume) │   │ (speakers)  │
└──────────┘     └──────────────┘    └──────────┘   └─────────────┘

┌──────────┐     ┌──────────────┐
│ MediaElem│────→│ PannerNode   │────→ (merge dans le graph)
│ Source   │     │ (spatial 3D) │
└──────────┘     └──────────────┘
```

```typescript
const audioCtx = new AudioContext();

// Types de sources
const bufferSource = audioCtx.createBufferSource();
bufferSource.buffer = myAudioBuffer;
bufferSource.loop = true;

const oscillator = audioCtx.createOscillator();
oscillator.type = 'sine';
oscillator.frequency.value = 440;

// Effets
const gainNode = audioCtx.createGain();
gainNode.gain.value = 0.5;

const filter = audioCtx.createBiquadFilter();
filter.type = 'lowpass';
filter.frequency.value = 1000;

const panner = audioCtx.createPanner();
panner.panningModel = 'HRTF';

// Connexion : source -> gain -> filter -> panner -> speakers
bufferSource.connect(gainNode);
gainNode.connect(filter);
filter.connect(panner);
panner.connect(audioCtx.destination);
bufferSource.start(0);
```

---

## Chargement audio

```typescript
async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erreur chargement audio: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}

// Gestionnaire avec cache
class AudioAssetManager {
  private ctx: AudioContext;
  private cache: Map<string, AudioBuffer> = new Map();
  private loading: Map<string, Promise<AudioBuffer>> = new Map();

  constructor(ctx: AudioContext) { this.ctx = ctx; }

  async load(url: string): Promise<AudioBuffer> {
    const cached = this.cache.get(url);
    if (cached) return cached;
    const existing = this.loading.get(url);
    if (existing) return existing;

    const promise = (async () => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return this.ctx.decodeAudioData(arrayBuffer);
    })();

    this.loading.set(url, promise);
    const buffer = await promise;
    this.cache.set(url, buffer);
    this.loading.delete(url);
    return buffer;
  }
}
```

| Format | Compression | Support navigateur | Cas d'usage |
|--------|:-----------:|:------------------:|-------------|
| **OGG Vorbis** | Lossy | Chrome, Firefox, Edge | Sons courts, effets |
| **MP3** | Lossy | Tous | Musique, ambiance |
| **WAV** | Aucune (PCM) | Tous | Haute fidelite, boucles exactes |
| **Opus** | Lossy | Chrome, Firefox, Edge | Meilleur ratio qualite/taille |

---

## Spatialisation : PannerNode et AudioListener

### Position du listener et des sources

```typescript
// AudioListener = les "oreilles" (un seul par contexte)
const listener = audioCtx.listener;
listener.positionX.value = 0;
listener.positionY.value = 1.6;
listener.positionZ.value = 0;
listener.forwardX.value = 0;
listener.forwardY.value = 0;
listener.forwardZ.value = -1;
listener.upX.value = 0;
listener.upY.value = 1;
listener.upZ.value = 0;

// Synchroniser avec la camera 3D
function syncListenerWithCamera(listener: AudioListener, camera: THREE.Camera): void {
  listener.positionX.value = camera.position.x;
  listener.positionY.value = camera.position.y;
  listener.positionZ.value = camera.position.z;
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  listener.forwardX.value = fwd.x;
  listener.forwardY.value = fwd.y;
  listener.forwardZ.value = fwd.z;
  listener.upX.value = camera.up.x;
  listener.upY.value = camera.up.y;
  listener.upZ.value = camera.up.z;
}
```

```typescript
// PannerNode = positionner une source dans l'espace
function createSpatialSource(
  ctx: AudioContext, buffer: AudioBuffer,
  position: [number, number, number]
): { source: AudioBufferSourceNode; panner: PannerNode } {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1;
  panner.maxDistance = 10000;
  panner.rolloffFactor = 1;
  panner.positionX.value = position[0];
  panner.positionY.value = position[1];
  panner.positionZ.value = position[2];

  source.connect(panner);
  panner.connect(ctx.destination);
  return { source, panner };
}
```

### Modeles de distance

```
Volume
  1.0 ┤█
      │ ██
      │   ███
  0.5 ┤      ████          ← inverse : gain = ref / (ref + roll * (d - ref))
      │          ██████
  0.0 ┤───────────────────→ Distance

  1.0 ┤████████
      │        █
  0.5 ┤         ████       ← linear : gain = 1 - roll * (d - ref) / (max - ref)
      │             ████
  0.0 ┤─────────────────█→ Distance

  1.0 ┤█
      │  ████
  0.5 ┤      ████████████  ← exponential : gain = (d / ref) ^ (-roll)
  0.0 ┤───────────────────→ Distance
```

### Cone directionnel

```
                orientation (forward)
                      │
              ╱───────│───────╲   innerAngle (plein volume)
            ╱         │         ╲
        ╱ ╱───────────│───────────╲ ╲   outerAngle (attenuation)
      ╱ ╱         [SOURCE]          ╲ ╲
                    │
            zone exterieure = outerGain (quasi-silence)
```

```typescript
panner.coneInnerAngle = 60;
panner.coneOuterAngle = 120;
panner.coneOuterGain = 0.1;
panner.orientationX.value = 0;
panner.orientationY.value = 0;
panner.orientationZ.value = -1;
```

---

## HRTF : Head-Related Transfer Function

```
Le cerveau localise les sons grace a 3 indices :
1. ITD (Interaural Time Difference) : son arrive plus tot a l'oreille proche
2. ILD (Interaural Level Difference) : son plus fort a l'oreille proche
3. Filtrage spectral : la forme de l'oreille filtre selon la direction

'equalpower' : simple difference de volume gauche/droite, pas de haut/bas
'HRTF' :       simule le filtrage complet, perception 3D reelle
               Indispensable pour la VR/AR avec casque audio
```

---

## Effets audio

### ConvolverNode — reverb par convolution

```typescript
async function createReverb(ctx: AudioContext, irUrl: string): Promise<ConvolverNode> {
  const convolver = ctx.createConvolver();
  const response = await fetch(irUrl);
  convolver.buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  return convolver;
}

// Dry/wet mix
const reverb = await createReverb(audioCtx, '/sounds/ir-cathedral.wav');
const dryGain = audioCtx.createGain(); dryGain.gain.value = 0.7;
const wetGain = audioCtx.createGain(); wetGain.gain.value = 0.3;

source.connect(dryGain); dryGain.connect(audioCtx.destination);
source.connect(reverb); reverb.connect(wetGain); wetGain.connect(audioCtx.destination);
```

### BiquadFilterNode, DynamicsCompressor, Delay

```typescript
// Low-pass : etouffe derriere un mur, sous l'eau
const lowpass = audioCtx.createBiquadFilter();
lowpass.type = 'lowpass';
lowpass.frequency.value = 500;

// High-pass : son lointain (basses attenuees)
const highpass = audioCtx.createBiquadFilter();
highpass.type = 'highpass';
highpass.frequency.value = 200;

// Bandpass : radio, telephone
const bandpass = audioCtx.createBiquadFilter();
bandpass.type = 'bandpass';
bandpass.frequency.value = 1000;
bandpass.Q.value = 5;

// Compresseur : normalise le volume
const compressor = audioCtx.createDynamicsCompressor();
compressor.threshold.value = -24;
compressor.ratio.value = 12;

// Delay avec feedback (echo)
const delay = audioCtx.createDelay(5.0);
delay.delayTime.value = 0.3;
const feedback = audioCtx.createGain();
feedback.gain.value = 0.4;
source.connect(delay);
delay.connect(feedback);
feedback.connect(delay);  // Boucle
delay.connect(audioCtx.destination);
```

---

## Integration Three.js

```typescript
import * as THREE from 'three';

// 1. AudioListener attache a la camera (synchro automatique)
const listener = new THREE.AudioListener();
camera.add(listener);

// 2. Son positionnel (3D) attache a un objet
const speaker = new THREE.Mesh(boxGeom, boxMat);
speaker.position.set(3, 1, -2);
scene.add(speaker);

const positionalSound = new THREE.PositionalAudio(listener);
new THREE.AudioLoader().load('/sounds/music.ogg', (buffer: AudioBuffer) => {
  positionalSound.setBuffer(buffer);
  positionalSound.setRefDistance(1);
  positionalSound.setRolloffFactor(1);
  positionalSound.setLoop(true);
  positionalSound.setVolume(0.8);
  positionalSound.play();
});
speaker.add(positionalSound);  // Suit la position du mesh

// 3. Son d'ambiance (non-positionnel)
const ambientSound = new THREE.Audio(listener);
new THREE.AudioLoader().load('/sounds/ambience.mp3', (buffer: AudioBuffer) => {
  ambientSound.setBuffer(buffer);
  ambientSound.setLoop(true);
  ambientSound.setVolume(0.3);
  ambientSound.play();
});

// 4. Cone directionnel + helper visuel
positionalSound.setDirectionalCone(60, 120, 0.05);
speaker.add(new THREE.PositionalAudioHelper(positionalSound, 2));

// 5. Ajouter un filtre (ex: sous l'eau)
const waterFilter = listener.context.createBiquadFilter();
waterFilter.type = 'lowpass';
waterFilter.frequency.value = 22050;
positionalSound.setFilter(waterFilter);

// Toggle sous l'eau
function setUnderwater(enabled: boolean): void {
  const now = listener.context.currentTime;
  waterFilter.frequency.linearRampToValueAtTime(
    enabled ? 300 : 22050, now + 0.5
  );
}
```

---

## Cas d'usage

### Pas qui resonnent selon la surface

```typescript
const surfaces: Record<string, { buffer: AudioBuffer; reverbMix: number; filterFreq: number }> = {
  stone: { buffer: stoneBuffer, reverbMix: 0.6, filterFreq: 8000 },
  grass: { buffer: grassBuffer, reverbMix: 0, filterFreq: 4000 },
  metal: { buffer: metalBuffer, reverbMix: 0.5, filterFreq: 16000 },
};

function playFootstep(ctx: AudioContext, surfaceType: string, pos: [number, number, number]): void {
  const s = surfaces[surfaceType]; if (!s) return;
  const src = ctx.createBufferSource();
  src.buffer = s.buffer;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;  // Variation pitch

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.positionX.value = pos[0];
  panner.positionY.value = pos[1];
  panner.positionZ.value = pos[2];

  src.connect(panner);
  panner.connect(ctx.destination);
  src.start(0);
}
```

### Crossfade entre ambiances

```typescript
class AmbienceCrossfader {
  private ctx: AudioContext;
  private current: AudioBufferSourceNode | null = null;
  private currentGain: GainNode;
  private nextGain: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.currentGain = ctx.createGain(); this.currentGain.connect(ctx.destination);
    this.nextGain = ctx.createGain(); this.nextGain.connect(ctx.destination);
    this.currentGain.gain.value = 1;
    this.nextGain.gain.value = 0;
  }

  crossfadeTo(buffer: AudioBuffer, duration: number = 2): void {
    const now = this.ctx.currentTime;
    const next = this.ctx.createBufferSource();
    next.buffer = buffer; next.loop = true;
    next.connect(this.nextGain);
    next.start(0);

    this.currentGain.gain.linearRampToValueAtTime(0, now + duration);
    this.nextGain.gain.linearRampToValueAtTime(1, now + duration);

    setTimeout(() => {
      this.current?.stop();
      this.current = next;
      const tmp = this.currentGain;
      this.currentGain = this.nextGain;
      this.nextGain = tmp;
      this.nextGain.gain.value = 0;
    }, duration * 1000);
  }
}
```

---

## Autoplay policy

```typescript
// Les navigateurs bloquent l'audio sans geste utilisateur
const audioCtx = new AudioContext();
console.log(audioCtx.state);  // 'suspended'

// Solution : bouton "Entrer" ou premier clic
document.querySelector('#start')!.addEventListener('click', async () => {
  await audioCtx.resume();
  startApp(audioCtx);
});

// Gerer la visibilite (pause quand l'onglet est cache)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audioCtx.suspend();
  else audioCtx.resume();
});
```

---

## Performance : AudioWorklet et OfflineAudioContext

```typescript
// AudioWorklet — traitement custom sur le thread audio
// Fichier separe : noise-gate-processor.ts
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [{ name: 'threshold', defaultValue: 0.01, minValue: 0, maxValue: 1 }];
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][],
          parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0]; const output = outputs[0];
    const threshold = parameters.threshold[0];
    for (let ch = 0; ch < input.length; ch++)
      for (let i = 0; i < input[ch].length; i++)
        output[ch][i] = Math.abs(input[ch][i]) > threshold ? input[ch][i] : 0;
    return true;
  }
}
registerProcessor('noise-gate', NoiseGateProcessor);

// main.ts — charger le worklet
await audioCtx.audioWorklet.addModule('/worklets/noise-gate-processor.js');
const noiseGate = new AudioWorkletNode(audioCtx, 'noise-gate');
```

```typescript
// OfflineAudioContext — pre-render un buffer avec des effets
async function prerenderWithReverb(
  sourceBuffer: AudioBuffer, impulseResponse: AudioBuffer
): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(
    sourceBuffer.numberOfChannels,
    sourceBuffer.length + impulseResponse.length,
    sourceBuffer.sampleRate
  );
  const source = offline.createBufferSource();
  source.buffer = sourceBuffer;
  const convolver = offline.createConvolver();
  convolver.buffer = impulseResponse;
  source.connect(convolver);
  convolver.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}
```

---

## AnalyserNode : visualisation audio

```typescript
function createAudioVisualizer(ctx: AudioContext, source: AudioNode, canvas: HTMLCanvasElement) {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  const data = new Uint8Array(analyser.frequencyBinCount);
  source.connect(analyser);
  analyser.connect(ctx.destination);

  const c = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;

  return {
    update() {
      analyser.getByteFrequencyData(data);
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      const barW = (w / data.length) * 2.5;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const barH = (data[i] / 255) * h;
        c.fillStyle = `hsl(${(i / data.length) * 360}, 80%, 50%)`;
        c.fillRect(x, h - barH, barW, barH);
        x += barW + 1;
      }
    },
  };
}
```

---

## Pratique

### Exercice AUDIO.1 — Scene 3D avec audio spatial

Creer une scene Three.js contenant :
1. Trois sources audio positionnelles (feu, ruisseau, haut-parleur directionnel)
2. Un analyseur de frequences affiche sur un plan dans la scene
3. Controle orbital — le son change quand on se deplace
4. Un bouton "Entrer" pour gerer l'autoplay policy
5. Un toggle "Sous l'eau" qui applique un filtre low-pass global

```typescript
// TODO: Setup scene Three.js (renderer, camera, controls, lumieres)
// TODO: AudioListener attache a la camera
// TODO: Charger 3 fichiers audio, creer 3 PositionalAudio
//   Feu: refDistance=2, rolloff=1 | Ruisseau: refDistance=3, lowpass 2000Hz
//   Haut-parleur: cone 60/120, outerGain=0.05
// TODO: AnalyserNode sur le feu → CanvasTexture sur un PlaneGeometry
// TODO: Filtre global sous-marin (toggle)
```

<details>
<summary>Solution</summary>

```typescript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 2, 8);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);

// Sol + lumieres
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x2d5a27 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.AmbientLight(0x404060, 0.5));
const dirLight = new THREE.DirectionalLight(0xffeedd, 1);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

// Objets : feu, ruisseau, haut-parleur
const fireGroup = new THREE.Group();
scene.add(fireGroup);
const flame = new THREE.Mesh(
  new THREE.ConeGeometry(0.3, 0.8, 8),
  new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff6600, emissiveIntensity: 2 })
);
flame.position.y = 0.5;
fireGroup.add(flame);
fireGroup.add(new THREE.PointLight(0xff6600, 2, 10));

const stream = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 10),
  new THREE.MeshStandardMaterial({ color: 0x3388cc, transparent: true, opacity: 0.6 })
);
stream.rotation.x = -Math.PI / 2;
stream.position.set(-6, 0.02, 0);
scene.add(stream);

const speakerBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.6, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x222222 })
);
speakerBox.position.set(6, 1, -2);
scene.add(speakerBox);

// Visualiseur
const vizCanvas = document.createElement('canvas');
vizCanvas.width = 512; vizCanvas.height = 256;
const vizCtx = vizCanvas.getContext('2d')!;
const vizTex = new THREE.CanvasTexture(vizCanvas);
const vizPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 1.5),
  new THREE.MeshBasicMaterial({ map: vizTex })
);
vizPlane.position.set(0, 3, -5);
scene.add(vizPlane);

// --- Audio (demarre au clic) ---
let listener: THREE.AudioListener;
let analyser: AnalyserNode;
let analyserData: Uint8Array;
let underwaterFilter: BiquadFilterNode;
let isUnderwater = false;

const startBtn = document.createElement('button');
startBtn.textContent = 'Entrer dans la scene';
startBtn.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px 40px;font-size:24px;cursor:pointer;background:#ff6600;color:#fff;border:none;border-radius:8px';
document.body.appendChild(startBtn);

const uwBtn = document.createElement('button');
uwBtn.textContent = 'Sous l\'eau: OFF';
uwBtn.style.cssText = 'position:fixed;top:20px;right:20px;padding:10px 20px;font-size:16px;cursor:pointer;display:none;background:#3388cc;color:#fff;border:none;border-radius:4px';
document.body.appendChild(uwBtn);

startBtn.addEventListener('click', async () => {
  startBtn.remove();
  uwBtn.style.display = 'block';
  listener = new THREE.AudioListener();
  camera.add(listener);
  const ctx = listener.context;
  await ctx.resume();

  // Filtre global sous-marin
  underwaterFilter = ctx.createBiquadFilter();
  underwaterFilter.type = 'lowpass';
  underwaterFilter.frequency.value = 22050;
  listener.gain.disconnect();
  listener.gain.connect(underwaterFilter);
  underwaterFilter.connect(ctx.destination);

  // Analyser
  analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyserData = new Uint8Array(analyser.frequencyBinCount);

  const loader = new THREE.AudioLoader();

  // Feu
  const fireSound = new THREE.PositionalAudio(listener);
  loader.load('/sounds/campfire.ogg', (buf: AudioBuffer) => {
    fireSound.setBuffer(buf);
    fireSound.setRefDistance(2);
    fireSound.setRolloffFactor(1);
    fireSound.setLoop(true);
    fireSound.play();
    fireSound.getOutput().connect(analyser);
  });
  fireGroup.add(fireSound);

  // Ruisseau avec filtre
  const streamSound = new THREE.PositionalAudio(listener);
  loader.load('/sounds/stream-water.ogg', (buf: AudioBuffer) => {
    streamSound.setBuffer(buf);
    streamSound.setRefDistance(3);
    streamSound.setRolloffFactor(1.5);
    streamSound.setLoop(true);
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass'; wf.frequency.value = 2000;
    streamSound.setFilter(wf);
    streamSound.play();
  });
  stream.add(streamSound);

  // Haut-parleur directionnel
  const spkSound = new THREE.PositionalAudio(listener);
  loader.load('/sounds/music-loop.ogg', (buf: AudioBuffer) => {
    spkSound.setBuffer(buf);
    spkSound.setRefDistance(1);
    spkSound.setRolloffFactor(2);
    spkSound.setLoop(true);
    spkSound.setDirectionalCone(60, 120, 0.05);
    spkSound.play();
  });
  speakerBox.add(spkSound);
  speakerBox.add(new THREE.PositionalAudioHelper(spkSound, 3));
});

uwBtn.addEventListener('click', () => {
  isUnderwater = !isUnderwater;
  uwBtn.textContent = `Sous l'eau: ${isUnderwater ? 'ON' : 'OFF'}`;
  const now = listener.context.currentTime;
  underwaterFilter.frequency.linearRampToValueAtTime(
    isUnderwater ? 300 : 22050, now + 0.5
  );
});

const clock = new THREE.Clock();
function animate(): void {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  flame.scale.y = 0.8 + Math.sin(t * 8) * 0.2;

  if (analyser && analyserData) {
    analyser.getByteFrequencyData(analyserData);
    vizCtx.fillStyle = 'rgba(0,0,0,0.8)';
    vizCtx.fillRect(0, 0, 512, 256);
    const bw = 512 / analyserData.length;
    for (let i = 0; i < analyserData.length; i++) {
      const v = analyserData[i] / 255;
      vizCtx.fillStyle = `hsl(${(i / analyserData.length) * 60 + 10},90%,${30 + v * 40}%)`;
      vizCtx.fillRect(i * bw, 256 - v * 256, bw - 1, v * 256);
    }
    vizTex.needsUpdate = true;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
```

</details>

---

## Resume

| Concept | Description | API / Classe |
|---------|-------------|:------------:|
| **AudioContext** | Coeur du systeme audio, gere le graphe et le timing | `new AudioContext()` |
| **AudioBuffer** | Donnees audio decodees en memoire (PCM) | `ctx.decodeAudioData()` |
| **PannerNode** | Positionne une source dans l'espace 3D | `ctx.createPanner()` |
| **AudioListener** | Position/orientation de l'auditeur | `ctx.listener` |
| **HRTF** | Modele binaural realiste (filtrage de la tete) | `panningModel: 'HRTF'` |
| **Distance models** | linear, inverse, exponential | `panner.distanceModel` |
| **Cone directionnel** | innerAngle, outerAngle, outerGain | `panner.coneInnerAngle` |
| **ConvolverNode** | Reverb par convolution (impulse response) | `ctx.createConvolver()` |
| **BiquadFilterNode** | Filtres frequentiels (lowpass, highpass...) | `ctx.createBiquadFilter()` |
| **DelayNode** | Echo / retard audio avec feedback | `ctx.createDelay()` |
| **AnalyserNode** | Extraction de donnees frequentielles | `ctx.createAnalyser()` |
| **AudioWorklet** | Traitement audio custom sur le thread audio | `ctx.audioWorklet.addModule()` |
| **THREE.PositionalAudio** | Source audio 3D attachee a un Object3D | `new THREE.PositionalAudio()` |
| **Autoplay policy** | Contexte suspendu sans geste utilisateur | `ctx.resume()` |

| Technique | Quand l'utiliser | Cout CPU |
|-----------|------------------|:--------:|
| `equalpower` panning | Enceintes stereo, peu de sources | Faible |
| `HRTF` panning | Casque, VR/AR, immersion | Moyen |
| ConvolverNode reverb | Ambiance de salle, cathedrale | Eleve |
| BiquadFilter | Murs, eau, radio, distance | Faible |
| AudioWorklet | Effets custom temps reel | Variable |
| OfflineAudioContext | Pre-calcul, generation procedurale | Aucun (offline) |

---

## Navigation

| Precedent | Suivant |
|:---------:|:-------:|
| [26 - WebXR et animation procedurale](./26-webxr-immersive.md) | [28 - Virtual textures et texture streaming](./28-virtual-textures-streaming.md) |

**Ressources associees :**
- [Lab 27 — Audio 3D spatial](../labs/lab-27-audio-3d-spatial/)
- [Quiz 27 — Audio 3D spatial](../quizzes/quiz-27-audio-3d-spatial.html)
