let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtor) return null;
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioCtor();
  }
  return sharedContext;
}

export function primeAlarmAudio(): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
    return true;
  } catch {
    return false;
  }
}

export async function getPrimedAlarmAudioContext(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => undefined);
  }
  return ctx;
}