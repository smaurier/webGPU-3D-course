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
  if (distance <= refDistance) return 1;
  if (distance >= maxDistance) return 0;
  return 1 - (distance - refDistance) / (maxDistance - refDistance);
}

/**
 * Attenuation inverse : gain = 1 / (1 + rolloffFactor * (distance - refDistance))
 */
function distanceAttenuationInverse(
  distance: number,
  refDistance: number,
  rolloffFactor: number,
): number {
  if (distance <= refDistance) return 1;
  return 1 / (1 + rolloffFactor * (distance - refDistance));
}

/**
 * Attenuation exponentielle : gain = pow(distance / refDistance, -rolloffFactor)
 */
function distanceAttenuationExponential(
  distance: number,
  refDistance: number,
  rolloffFactor: number,
): number {
  if (distance <= refDistance) return 1;
  return Math.pow(distance / refDistance, -rolloffFactor);
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
  const absAngle = Math.abs(angle);
  if (absAngle <= innerAngle) return 1;
  if (absAngle >= outerAngle) return outerGain;
  // Interpolation lineaire entre le bord interieur et exterieur
  const t = (absAngle - innerAngle) / (outerAngle - innerAngle);
  return 1 + (outerGain - 1) * t;
}

// ─── HRTF : difference de temps interaurale (ITD) ──────────────────────────

/**
 * Modele de Woodworth simplifie : delta_t = r/c * (angle + sin(angle))
 * r = rayon de la tete (~0.0875 m), c = vitesse du son (~343 m/s)
 * angle en radians (0 = devant, pi/2 = cote)
 */
function hrtfInterauralTimeDifference(
  angle: number,
  headRadius: number,
  speedOfSound: number,
): number {
  return (headRadius / speedOfSound) * (angle + Math.sin(angle));
}

// ─── Stereo panning ─────────────────────────────────────────────────────────

/**
 * Stereo pan de -1 (gauche) a 1 (droite) depuis l'angle
 * relatif a l'auditeur (en radians, 0 = devant, pi/2 = droite, -pi/2 = gauche)
 */
function stereoPanFromAngle(angle: number): number {
  return Math.max(-1, Math.min(1, Math.sin(angle)));
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
  const clamped = Math.max(0, Math.min(duration, t));
  const progress = clamped / duration;
  return { weightA: 1 - progress, weightB: progress };
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
  if (distance <= refDistance) return maxCutoff;
  const cutoff = maxCutoff * (refDistance / distance);
  return Math.max(minCutoff, Math.min(maxCutoff, cutoff));
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
  const wet = Math.max(0, Math.min(maxWet, roomSize * maxWet));
  return { wet, dry: 1 - wet };
}

// ─── Duree d'un buffer audio ────────────────────────────────────────────────

/**
 * Duree en secondes = length (nombre d'echantillons) / sampleRate.
 */
function audioBufferDuration(sampleRate: number, length: number): number {
  return length / sampleRate;
}

// ─── Conversion decibels <-> lineaire ───────────────────────────────────────

/**
 * Convertit des decibels en gain lineaire : gain = 10^(dB/20)
 */
function decibelToLinear(dB: number): number {
  return Math.pow(10, dB / 20);
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
  return index * sampleRate / fftSize;
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
  // d=11, ref=1, rolloff=1 -> 1/(1+1*10) = 1/11
  assertApprox(distanceAttenuationInverse(11, 1, 1), 1 / 11, 0.001);
});

// Distance attenuation exponentielle
runner.test('distanceAttenuationExponential — pow(d/ref, -rolloff)', () => {
  // d=4, ref=1, rolloff=2 -> pow(4, -2) = 1/16
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
  // angle=0.75, inner=0.5, outer=1.0, outerGain=0
  // t = (0.75 - 0.5) / (1.0 - 0.5) = 0.5
  // gain = 1 + (0 - 1) * 0.5 = 0.5
  assertApprox(coneGain(0.75, 0.5, 1.0, 0), 0.5, 0.001);
});

// HRTF ITD
runner.test('hrtfInterauralTimeDifference — formule de Woodworth', () => {
  const r = 0.0875;
  const c = 343;
  const angle = Math.PI / 2; // 90 degres
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
  // index=10, sampleRate=44100, fftSize=1024
  assertApprox(frequencyBinFromIndex(10, 44100, 1024), 10 * 44100 / 1024, 0.01);
});

runner.run();
