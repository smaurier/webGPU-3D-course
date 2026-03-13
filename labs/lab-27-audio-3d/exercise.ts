import {
  createTestRunner,
  assertApprox,
  assertTrue,
  assertFalse,
  assertEqual,
  assertDeepEqual,
  assertArrayApprox,
  type Vec3,
} from '../test-utils.ts';

// ─── Modeles d'attenuation par distance ─────────────────────────────────────

/**
 * Attenuation lineaire : gain diminue lineairement de 1 (a refDistance)
 * a 0 (a maxDistance).
 */
function distanceAttenuationLinear(
  distance: number,
  refDistance: number,
  maxDistance: number,
): number {
  // TODO: retourner 1 si distance <= refDistance
  // TODO: retourner 0 si distance >= maxDistance
  // TODO: sinon interpoler lineairement entre 1 et 0
  return 0;
}

/**
 * Attenuation inverse : gain = 1 / (1 + rolloffFactor * (distance - refDistance))
 */
function distanceAttenuationInverse(
  distance: number,
  refDistance: number,
  rolloffFactor: number,
): number {
  // TODO: retourner 1 si distance <= refDistance
  // TODO: sinon appliquer la formule inverse
  return 0;
}

/**
 * Attenuation exponentielle : gain = pow(distance / refDistance, -rolloffFactor)
 */
function distanceAttenuationExponential(
  distance: number,
  refDistance: number,
  rolloffFactor: number,
): number {
  // TODO: retourner 1 si distance <= refDistance
  // TODO: sinon appliquer la formule exponentielle
  return 0;
}

// ─── Cone de directivite ────────────────────────────────────────────────────

/**
 * Calcul du gain du cone (PannerNode coneInnerAngle / coneOuterAngle / coneOuterGain).
 * angle = angle entre la direction de la source et le vecteur vers l'auditeur (en radians).
 * innerAngle et outerAngle en radians (demi-angles).
 */
function coneGain(
  angle: number,
  innerAngle: number,
  outerAngle: number,
  outerGain: number,
): number {
  // TODO: si |angle| <= innerAngle -> gain = 1
  // TODO: si |angle| >= outerAngle -> gain = outerGain
  // TODO: sinon interpoler lineairement
  return 0;
}

// ─── HRTF : difference de temps interaurale (ITD) ──────────────────────────

/**
 * Modele de Woodworth simplifie : delta_t = r/c * (angle + sin(angle))
 * r = rayon de la tete, c = vitesse du son
 * angle en radians (0 = devant, pi/2 = cote)
 */
function hrtfInterauralTimeDifference(
  angle: number,
  headRadius: number,
  speedOfSound: number,
): number {
  // TODO: appliquer la formule de Woodworth
  return 0;
}

// ─── Stereo panning ─────────────────────────────────────────────────────────

/**
 * Stereo pan de -1 (gauche) a 1 (droite) depuis l'angle
 * relatif a l'auditeur (en radians, 0 = devant, pi/2 = droite, -pi/2 = gauche)
 */
function stereoPanFromAngle(angle: number): number {
  // TODO: pan = sin(angle), clampe entre -1 et 1
  return 0;
}

// ─── Crossfade ──────────────────────────────────────────────────────────────

/**
 * Poids de crossfade lineaire entre deux sources audio.
 * t = temps courant, duration = duree du crossfade.
 * Retourne { weightA, weightB } avec weightA + weightB = 1.
 */
function crossfadeWeights(
  t: number,
  duration: number,
): { weightA: number; weightB: number } {
  // TODO: calculer le ratio t/duration (clampe entre 0 et 1)
  // TODO: weightA = 1 - ratio, weightB = ratio
  return { weightA: 0, weightB: 0 };
}

// ─── Filtre passe-bas par distance ──────────────────────────────────────────

/**
 * Frequence de coupure du filtre passe-bas en fonction de la distance.
 * Plus la source est loin, plus on coupe les hautes frequences.
 * cutoff = maxCutoff * (refDistance / distance) clampe a [minCutoff, maxCutoff]
 */
function lowPassCutoffFromDistance(
  distance: number,
  refDistance: number,
  minCutoff: number,
  maxCutoff: number,
): number {
  // TODO: si distance <= refDistance -> maxCutoff
  // TODO: sinon cutoff = maxCutoff * (refDistance / distance)
  // TODO: clamper entre minCutoff et maxCutoff
  return 0;
}

// ─── Reverb wet/dry ─────────────────────────────────────────────────────────

/**
 * Mix wet/dry de la reverb en fonction de la taille de la salle.
 * roomSize entre 0 (petite) et 1 (grande).
 * wetRatio = roomSize * maxWet, dryRatio = 1 - wetRatio.
 */
function reverbMix(
  roomSize: number,
  maxWet: number,
): { wet: number; dry: number } {
  // TODO: calculer wet = roomSize * maxWet (clampe a [0, maxWet])
  // TODO: dry = 1 - wet
  return { wet: 0, dry: 0 };
}

// ─── Duree d'un buffer audio ────────────────────────────────────────────────

/**
 * Duree en secondes = length (nombre d'echantillons) / sampleRate.
 */
function audioBufferDuration(sampleRate: number, length: number): number {
  // TODO: duree = length / sampleRate
  return 0;
}

// ─── Conversion decibels <-> lineaire ───────────────────────────────────────

/**
 * Convertit des decibels en gain lineaire : gain = 10^(dB/20)
 */
function decibelToLinear(dB: number): number {
  // TODO: appliquer la formule gain = 10^(dB/20)
  return 0;
}

// ─── Bin de frequence FFT ───────────────────────────────────────────────────

/**
 * Frequence centrale du bin d'index i dans une FFT.
 * freq = index * sampleRate / fftSize
 */
function frequencyBinFromIndex(
  index: number,
  sampleRate: number,
  fftSize: number,
): number {
  // TODO: freq = index * sampleRate / fftSize
  return 0;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const runner = createTestRunner('Lab 27 — Audio 3D');

// Distance attenuation lineaire
runner.test('distanceAttenuationLinear — a refDistance, gain = 1', () => {
  assertApprox(distanceAttenuationLinear(1, 1, 100), 1);
});

runner.test('distanceAttenuationLinear — a maxDistance, gain = 0', () => {
  assertApprox(distanceAttenuationLinear(100, 1, 100), 0);
});

runner.test('distanceAttenuationLinear — a mi-chemin, gain = 0.5', () => {
  assertApprox(distanceAttenuationLinear(50.5, 1, 100), 0.5, 0.001);
});

// Distance attenuation inverse
runner.test('distanceAttenuationInverse — formule 1/(1+rolloff*(d-ref))', () => {
  assertApprox(distanceAttenuationInverse(11, 1, 1), 1 / 11, 0.001);
});

// Distance attenuation exponentielle
runner.test('distanceAttenuationExponential — pow(d/ref, -rolloff)', () => {
  assertApprox(distanceAttenuationExponential(4, 1, 2), 1 / 16, 0.001);
});

// Cone gain
runner.test('coneGain — dans le cone interieur, gain = 1', () => {
  assertApprox(coneGain(0.1, 0.5, 1.0, 0.2), 1);
});

runner.test('coneGain — hors du cone exterieur, gain = outerGain', () => {
  assertApprox(coneGain(1.5, 0.5, 1.0, 0.2), 0.2);
});

runner.test('coneGain — entre inner et outer, gain interpole', () => {
  assertApprox(coneGain(0.75, 0.5, 1.0, 0), 0.5, 0.001);
});

// HRTF ITD
runner.test('hrtfInterauralTimeDifference — formule de Woodworth', () => {
  const r = 0.0875;
  const c = 343;
  const angle = Math.PI / 2;
  const expected = (r / c) * (angle + Math.sin(angle));
  assertApprox(hrtfInterauralTimeDifference(angle, r, c), expected, 1e-8);
});

// Stereo pan
runner.test('stereoPanFromAngle — devant = 0 (centre)', () => {
  assertApprox(stereoPanFromAngle(0), 0, 0.001);
});

runner.test('stereoPanFromAngle — droite = 1, gauche = -1', () => {
  assertApprox(stereoPanFromAngle(Math.PI / 2), 1, 0.001);
  assertApprox(stereoPanFromAngle(-Math.PI / 2), -1, 0.001);
});

// Crossfade
runner.test('crossfadeWeights — t=0, weightA=1 weightB=0', () => {
  const w = crossfadeWeights(0, 2);
  assertApprox(w.weightA, 1);
  assertApprox(w.weightB, 0);
});

runner.test('crossfadeWeights — t=duration, weightA=0 weightB=1', () => {
  const w = crossfadeWeights(2, 2);
  assertApprox(w.weightA, 0);
  assertApprox(w.weightB, 1);
});

// Low-pass filter
runner.test('lowPassCutoff — proche = cutoff max, loin = cutoff reduit', () => {
  assertApprox(lowPassCutoffFromDistance(1, 1, 200, 20000), 20000);
  assertApprox(lowPassCutoffFromDistance(10, 1, 200, 20000), 2000, 1);
});

// Reverb mix
runner.test('reverbMix — roomSize 0 = tout dry, roomSize 1 = max wet', () => {
  const small = reverbMix(0, 0.8);
  assertApprox(small.wet, 0);
  assertApprox(small.dry, 1);
  const large = reverbMix(1, 0.8);
  assertApprox(large.wet, 0.8);
  assertApprox(large.dry, 0.2);
});

// Audio buffer duration
runner.test('audioBufferDuration — 44100 Hz, 88200 echantillons = 2s', () => {
  assertApprox(audioBufferDuration(44100, 88200), 2);
});

// dB -> lineaire
runner.test('decibelToLinear — 0 dB = 1, -6 dB ~ 0.5, -20 dB = 0.1', () => {
  assertApprox(decibelToLinear(0), 1);
  assertApprox(decibelToLinear(-6), 0.5012, 0.01);
  assertApprox(decibelToLinear(-20), 0.1, 0.001);
});

// FFT frequency bin
runner.test('frequencyBinFromIndex — bin = index * sampleRate / fftSize', () => {
  assertApprox(frequencyBinFromIndex(10, 44100, 1024), 10 * 44100 / 1024, 0.01);
});

runner.run();
