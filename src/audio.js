/**
 * Original, synthesized ambience. Nothing downloads and audio never autoplays.
 * A D-major suspended pad, filtered air, and slow amplitude modulation.
 */
export function createAmbience() {
  let context;
  let master;
  let enabled = false;
  const nodes = [];
  const sources = [];
  async function toggle() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio is unavailable in this browser.');
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      master.connect(compressor);
      compressor.connect(context.destination);
      nodes.push(master, compressor);
      [146.83, 220, 293.66, 369.99, 440].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const pan = context.createStereoPanner();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index % 2 ? -4 : 3;
        gain.gain.value = .06 / (1 + index * .35);
        pan.pan.value = (index - 2) * .3;
        oscillator.connect(gain).connect(pan).connect(master);
        oscillator.start();
        sources.push(oscillator);
        nodes.push(gain, pan);
        const lfo = context.createOscillator();
        const depth = context.createGain();
        lfo.frequency.value = .07 + index * .023;
        depth.gain.value = .014;
        lfo.connect(depth).connect(gain.gain);
        lfo.start();
        sources.push(lfo);
        nodes.push(depth);
      });
      const buffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02;
        data[i] = brown * 3.5;
      }
      const air = context.createBufferSource();
      air.buffer = buffer;
      air.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const airGain = context.createGain();
      airGain.gain.value = .05;
      air.connect(filter).connect(airGain).connect(master);
      air.start();
      sources.push(air);
      nodes.push(filter, airGain);
    }
    await context.resume();
    enabled = !enabled;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(enabled ? .65 : 0, context.currentTime, .4);
    return enabled;
  }
  function onVisibility() {
    if (!context) return;
    if (document.hidden) context.suspend();
    else if (enabled) context.resume();
  }
  document.addEventListener('visibilitychange', onVisibility);
  return {
    toggle,
    dispose() {
      document.removeEventListener('visibilitychange', onVisibility);
      sources.forEach((source) => source.stop());
      nodes.forEach((node) => node.disconnect());
      context?.close();
    },
  };
}
