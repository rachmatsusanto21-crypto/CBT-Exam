// Audio Alert Synthesizer using Web Audio API

const STORAGE_KEY_SOUND = "slide_exam_sound_enabled";

export const isSoundNotificationEnabled = (): boolean => {
  try {
    const val = localStorage.getItem(STORAGE_KEY_SOUND);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
};

export const setSoundNotificationEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY_SOUND, enabled ? "true" : "false");
  } catch (e) {
    console.warn("Failed to save sound preference", e);
  }
};

/**
 * Plays a clean, pleasant notification tone for exam time warnings.
 * Uses Web Audio API oscillator synthesis (no external audio files required).
 */
export function playExamTimeWarningSound(type: "5min" | "1min" | "test" = "5min") {
  if (!isSoundNotificationEnabled()) return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    if (type === "5min" || type === "test") {
      // 3-tone ascending alert chime (D5: 587.33Hz -> F#5: 739.99Hz -> A5: 880Hz)
      const notes = [
        { freq: 587.33, start: 0.0, duration: 0.35, gain: 0.2 },
        { freq: 739.99, start: 0.18, duration: 0.35, gain: 0.25 },
        { freq: 880.0, start: 0.36, duration: 0.6, gain: 0.3 },
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(note.freq, now + note.start);

        gainNode.gain.setValueAtTime(0.001, now + note.start);
        gainNode.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + note.start);
        osc.stop(now + note.start + note.duration);
      });
    } else if (type === "1min") {
      // Urgent double high warning beep (A5: 880Hz -> C6: 1046.5Hz) repeated twice
      const pulses = [
        { freq: 880, start: 0.0, duration: 0.15, gain: 0.3 },
        { freq: 1046.5, start: 0.16, duration: 0.25, gain: 0.35 },
        { freq: 880, start: 0.45, duration: 0.15, gain: 0.3 },
        { freq: 1046.5, start: 0.61, duration: 0.35, gain: 0.35 },
      ];

      pulses.forEach((pulse) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(pulse.freq, now + pulse.start);

        gainNode.gain.setValueAtTime(0.001, now + pulse.start);
        gainNode.gain.exponentialRampToValueAtTime(pulse.gain, now + pulse.start + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + pulse.start + pulse.duration);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + pulse.start);
        osc.stop(now + pulse.start + pulse.duration);
      });
    }
  } catch (err) {
    console.warn("AudioContext warning chime error:", err);
  }
}
