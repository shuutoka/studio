import type { InterfaceSound } from "@/lib/studio";

export function playInterfaceSound(sound: InterfaceSound) {
  if (sound === "none") return;
  try {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const values = {
      soft: { frequency: 330, type: "sine" as OscillatorType, duration: 0.045, volume: 0.035 },
      mechanical: { frequency: 120, type: "square" as OscillatorType, duration: 0.025, volume: 0.025 },
      digital: { frequency: 720, type: "triangle" as OscillatorType, duration: 0.04, volume: 0.025 },
    }[sound];
    oscillator.type = values.type;
    oscillator.frequency.value = values.frequency;
    gain.gain.setValueAtTime(values.volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + values.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + values.duration);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Sound feedback is optional and must never block an action.
  }
}
