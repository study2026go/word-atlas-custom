import { duck } from "./sound";

let current: HTMLAudioElement | null = null;
let token = 0;

export function stopAudio() {
  token++;
  current?.pause();
  current = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Play only a recorded UK/US file. Never falls back to device speech, so a
 *  "recorded" result is always the repo's native audio. Returns "missing"
 *  when there is no file — all 7,298 words have UK+US audio in the dataset,
 *  so this means a file failed to load, not a word without audio. New
 *  listening-first code must use this, never play(), for the first listen. */
export async function playRecorded(url: string | null | undefined, rate = 1): Promise<"recorded" | "missing"> {
  duck(true);
  try {
    if (!url) return "missing";
    stopAudio();
    const mine = ++token;
    const a = new Audio(url);
    a.playbackRate = rate;
    current = a;
    try {
      await a.play();
      await new Promise<void>((r) => {
        a.onended = () => r();
        a.onpause = () => r();
      });
      return "recorded";
    } catch {
      if (mine !== token) return "missing";
      current = null;
      return "missing";
    }
  } finally {
    duck(false);
  }
}

/** Play a recording, falling back to the device voice. Resolves when playback ends.
 *  NOTE: the device fallback must never be presented as a native recording.
 *  Listening-first steps use playRecorded() instead. */
export async function play(url: string | null | undefined, text: string, accent: "uk" | "us" = "uk", rate = 1) {
  duck(true);
  try {
    return await speak(url, text, accent, rate);
  } finally {
    duck(false);
  }
}

async function speak(url: string | null | undefined, text: string, accent: "uk" | "us", rate: number) {
  stopAudio();
  const mine = ++token;
  if (url) {
    const a = new Audio(url);
    a.playbackRate = rate;
    current = a;
    try {
      await a.play();
      await new Promise<void>((r) => {
        a.onended = () => r();
        a.onpause = () => r();
      });
      return "recorded" as const;
    } catch {
      if (mine !== token) return "stopped" as const;
      current = null;
    }
  }
  if (!("speechSynthesis" in window)) return "unsupported" as const;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent === "uk" ? "en-GB" : "en-US";
  u.rate = rate * 0.95;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-") === u.lang);
  const best = voices.find((v) => /premium|enhanced|natural|google/i.test(v.name)) || voices[0];
  if (best) u.voice = best;
  await new Promise<void>((r) => {
    u.onend = () => r();
    u.onerror = () => r();
    speechSynthesis.speak(u);
  });
  return "device" as const;
}
