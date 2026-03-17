let sharedAudioContext = null;

function getAudioContext(win = window) {
  const AudioContextCtor = win.AudioContext || win.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedAudioContext) sharedAudioContext = new AudioContextCtor();
  return sharedAudioContext;
}

export function playBoundaryClank(win = window) {
  const audioContext = getAudioContext(win);
  if (!audioContext) return false;

  if (audioContext.state === 'suspended') {
    audioContext.resume?.().catch?.(() => {});
  }

  const now = audioContext.currentTime || 0;
  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  gainNode.connect(audioContext.destination);

  const lowTone = audioContext.createOscillator();
  lowTone.type = 'triangle';
  lowTone.frequency.setValueAtTime(620, now);
  lowTone.frequency.exponentialRampToValueAtTime(180, now + 0.11);
  lowTone.connect(gainNode);

  const highTone = audioContext.createOscillator();
  highTone.type = 'square';
  highTone.frequency.setValueAtTime(820, now);
  highTone.frequency.exponentialRampToValueAtTime(220, now + 0.07);
  highTone.connect(gainNode);

  lowTone.start(now);
  highTone.start(now + 0.003);
  lowTone.stop(now + 0.12);
  highTone.stop(now + 0.08);
  return true;
}

export function resetBoundaryClankAudioContext() {
  sharedAudioContext = null;
}
