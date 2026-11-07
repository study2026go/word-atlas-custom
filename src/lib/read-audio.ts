import type { Accent } from "../atlas/types";
import { play, stopAudio } from "./audio";

/** Step 2 (word-atlas-custom): device reading for 书房 sentences.
 *  Kept in its own module because it imports ./audio, which reads
 *  import.meta.env at load time and therefore needs Vite. The pure
 *  helpers in ./read.ts stay testable under plain node.
 *
 *  There is NO native recording for any 书房 text. All sentence
 *  playback is the device's own speech synthesis, always labelled
 *  设备朗读 — never presented as a native recording. */

/** Read one sentence aloud with the DEVICE voice. Returns "device" when
 *  spoken, "unsupported" when this browser has no speech synthesis, and
 *  "stopped" when interrupted. Callers must label this 设备朗读. */
export async function speakSentence(
  text: string,
  opts: { lang: "en" | "zh"; accent?: Accent; rate?: number },
): Promise<"device" | "unsupported" | "stopped"> {
  const rate = opts.rate ?? 1;
  if (opts.lang === "zh") {
    stopAudio();
    if (!("speechSynthesis" in window)) return "unsupported";
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = rate * 0.95;
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith("zh"));
    const best = voices.find((v) => /natural|premium|enhanced|google/i.test(v.name)) || voices[0];
    if (best) u.voice = best;
    return new Promise<"device" | "stopped">((resolve) => {
      u.onend = () => resolve("device");
      u.onerror = () => resolve("stopped");
      speechSynthesis.speak(u);
    });
  }
  // English: play() with no recording URL falls through to device speech.
  const r = await play(null, text, opts.accent ?? "uk", rate);
  return r === "recorded" ? "device" : r;
}

export function stopReading() {
  stopAudio();
}
