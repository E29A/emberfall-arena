// Audio: every sound in the game is synthesised with WebAudio — no files, no samples.
// Short oscillator-and-noise effects for shots, hits, explosions, pickups and the Warden,
// over a quiet two-oscillator music bed: a slow bass pulse and a sparse minor arpeggio
// the step sequencer schedules a beat ahead. The context is created lazily on the first
// user gesture (browsers refuse it sooner), M mutes the master gain, and every effect is
// throttled so a 40-enemy frame cannot turn into a wall of identical blips.

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudio() {
  let context = null;
  let master = null;
  let musicGain = null;
  let noiseBuffer = null;
  let muted = false;
  let musicOn = false;
  let nextNoteTime = 0;
  let stepIndex = 0;
  const lastPlayed = new Map();

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(context.destination);
    musicGain = context.createGain();
    musicGain.gain.value = 0.34;
    musicGain.connect(master);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return true;
  }

  function throttled(name, milliseconds) {
    const now = performance.now();
    if (now - (lastPlayed.get(name) ?? 0) < milliseconds) return true;
    lastPlayed.set(name, now);
    return false;
  }

  /** One enveloped oscillator blip; the building block of almost every effect. */
  function tone(freqFrom, freqTo, seconds, type, volume, when = 0, destination = null) {
    if (!context) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain);
    gain.connect(destination ?? master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A burst of filtered noise: explosions, the Warden's death, dash wind. */
  function noise(seconds, volume, filterFreq, when = 0) {
    if (!context) return;
    const start = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
  }

  const BASS_LINE = [33, 33, 36, 33, 38, 33, 31, 36, 33, 33, 36, 33, 41, 40, 38, 36];
  const ARP_LINE = [57, 60, 64, 67, 64, 60, 62, 65, 69, 65, 62, 60, 59, 62, 64, 59];
  const STEP_SECONDS = 60 / 112 / 2;

  /** Schedule the music bed a little ahead of the playhead; called every frame. */
  function updateMusic() {
    if (!context || !musicOn) return;
    if (nextNoteTime < context.currentTime) {
      nextNoteTime = context.currentTime + 0.05;
      stepIndex = 0;
    }
    while (nextNoteTime < context.currentTime + 0.14) {
      const when = nextNoteTime - context.currentTime;
      const bass = BASS_LINE[stepIndex % BASS_LINE.length];
      tone(midiToFreq(bass), midiToFreq(bass), STEP_SECONDS * 1.7, 'triangle', 0.16, when, musicGain);
      if (stepIndex % 2 === 0) {
        const arp = ARP_LINE[(stepIndex / 2) % ARP_LINE.length];
        tone(midiToFreq(arp + 12), midiToFreq(arp + 12), STEP_SECONDS * 1.4, 'sine', 0.045, when, musicGain);
      }
      nextNoteTime += STEP_SECONDS;
      stepIndex += 1;
    }
  }

  return {
    ensure,
    updateMusic,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.02);
      return muted;
    },
    startMusic() {
      if (!ensure()) return;
      musicOn = true;
      nextNoteTime = 0;
    },
    stopMusic() {
      musicOn = false;
    },
    /** Play the named effect for a world event; unknown names are ignored. */
    play(name) {
      if (!context || muted) return;
      switch (name) {
        case 'shoot':
          if (!throttled('shoot', 45)) tone(880, 320, 0.07, 'square', 0.05);
          break;
        case 'hit':
          if (!throttled('hit', 40)) tone(300, 180, 0.05, 'sawtooth', 0.04);
          break;
        case 'crit':
          if (!throttled('crit', 60)) { tone(1240, 620, 0.09, 'square', 0.07); tone(1860, 930, 0.07, 'sine', 0.05, 0.02); }
          break;
        case 'kill':
          if (!throttled('kill', 55)) { noise(0.16, 0.12, 900); tone(220, 55, 0.16, 'triangle', 0.1); }
          break;
        case 'split':
          if (!throttled('split', 80)) tone(520, 880, 0.08, 'sine', 0.06);
          break;
        case 'hurt':
          tone(160, 60, 0.22, 'sawtooth', 0.16);
          noise(0.14, 0.1, 500);
          break;
        case 'dash':
          if (!throttled('dash', 90)) noise(0.12, 0.07, 2400);
          break;
        case 'spit':
          if (!throttled('spit', 90)) tone(420, 240, 0.08, 'sine', 0.035);
          break;
        case 'pickup':
          if (!throttled('pickup', 70)) tone(660, 990, 0.07, 'sine', 0.055);
          break;
        case 'heal':
          tone(523, 523, 0.1, 'sine', 0.08);
          tone(784, 784, 0.14, 'sine', 0.08, 0.08);
          break;
        case 'upgrade':
          tone(523, 523, 0.11, 'triangle', 0.1);
          tone(659, 659, 0.11, 'triangle', 0.1, 0.09);
          tone(784, 784, 0.18, 'triangle', 0.1, 0.18);
          break;
        case 'wave':
          tone(392, 392, 0.12, 'triangle', 0.09);
          tone(587, 587, 0.2, 'triangle', 0.09, 0.1);
          break;
        case 'waveclear':
          tone(659, 659, 0.1, 'triangle', 0.09);
          tone(880, 880, 0.22, 'triangle', 0.09, 0.09);
          break;
        case 'bossenter':
          tone(98, 49, 0.7, 'sawtooth', 0.16);
          noise(0.6, 0.1, 300);
          break;
        case 'bosstelegraph':
          tone(196, 196, 0.09, 'square', 0.07);
          tone(196, 196, 0.09, 'square', 0.07, 0.14);
          break;
        case 'bosscharge':
          noise(0.3, 0.1, 1400);
          tone(130, 65, 0.3, 'sawtooth', 0.08);
          break;
        case 'bossburst':
          if (!throttled('bossburst', 120)) { noise(0.2, 0.09, 1100); tone(180, 90, 0.18, 'triangle', 0.08); }
          break;
        case 'bosssummon':
          tone(330, 495, 0.16, 'sine', 0.07);
          break;
        case 'win':
          [523, 659, 784, 1046].forEach((freq, index) => tone(freq, freq, 0.24, 'triangle', 0.11, index * 0.13));
          noise(0.5, 0.06, 3000, 0.1);
          break;
        case 'over':
          [392, 330, 262, 196].forEach((freq, index) => tone(freq, freq * 0.97, 0.26, 'triangle', 0.1, index * 0.16));
          break;
        default:
          break;
      }
    },
  };
}
