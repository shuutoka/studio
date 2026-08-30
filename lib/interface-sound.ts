import type { InterfaceSound } from "@/lib/studio";

let sharedAudioContext: AudioContext | null = null;

export function playInterfaceSound(sound: InterfaceSound) {
  if (sound === "none") return;
  try {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    sharedAudioContext ??= new AudioContextClass();
    const context = sharedAudioContext;
    const play = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const values = {
        soft: { frequency: 360, type: "sine" as OscillatorType, duration: 0.065, volume: 0.075 },
        mechanical: { frequency: 145, type: "square" as OscillatorType, duration: 0.04, volume: 0.055 },
        digital: { frequency: 760, type: "triangle" as OscillatorType, duration: 0.055, volume: 0.06 },
      }[sound];
      oscillator.type = values.type;
      oscillator.frequency.setValueAtTime(values.frequency, context.currentTime);
      gain.gain.setValueAtTime(values.volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + values.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + values.duration);
    };
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    // Sound feedback is optional and must never block an action.
  }
}
