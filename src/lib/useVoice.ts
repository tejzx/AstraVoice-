import { useCallback, useEffect, useRef, useState } from "react";

type Rec = any;

export type VoiceErrorReason =
  | "permission-denied"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "aborted"
  | "unsupported"
  | "unknown";

export function useVoice() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Rec | null>(null);
  const onResultRef = useRef<(text: string) => void>(() => {});
  const onSilenceRef = useRef<() => void>(() => {});
  const onErrorRef = useRef<(reason: VoiceErrorReason) => void>(() => {});
  const gotResultRef = useRef(false);
  const hadErrorRef = useRef(false);

  useEffect(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    let rec: Rec;
    try {
      rec = new SR();
    } catch {
      setSupported(false);
      return;
    }
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript?.trim();
      if (text) {
        gotResultRef.current = true;
        onResultRef.current(text);
      }
    };
    rec.onerror = (e: any) => {
      hadErrorRef.current = true;
      setListening(false);
      const code = e?.error as string | undefined;
      let reason: VoiceErrorReason = "unknown";
      if (code === "not-allowed" || code === "service-not-allowed") reason = "permission-denied";
      else if (code === "no-speech") reason = "no-speech";
      else if (code === "audio-capture") reason = "audio-capture";
      else if (code === "network") reason = "network";
      else if (code === "aborted") reason = "aborted";
      // "aborted" almost always means the user (or our own code) intentionally
      // stopped listening — don't surface that as an error.
      if (reason !== "aborted") onErrorRef.current(reason);
    };
    rec.onend = () => {
      // onerror always fires before onend for a failed attempt; onend is the one
      // guaranteed terminal event, so it's the single place we clear "listening".
      setListening(false);
      if (!gotResultRef.current && !hadErrorRef.current) onSilenceRef.current();
      hadErrorRef.current = false;
    };
    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const listen = useCallback(
    (
      onResult: (t: string) => void,
      onSilence: () => void,
      onError?: (reason: VoiceErrorReason) => void,
    ) => {
      if (!recRef.current) {
        onError?.("unsupported");
        return;
      }
      onResultRef.current = onResult;
      onSilenceRef.current = onSilence;
      onErrorRef.current = onError ?? (() => {});
      gotResultRef.current = false;
      hadErrorRef.current = false;
      try {
        window.speechSynthesis?.cancel();
        recRef.current.start();
        setListening(true);
      } catch {
        // start() throws if recognition is already running — stop and retry once
        // rather than leaving the button stuck in a non-functional state.
        try {
          recRef.current.abort();
          recRef.current.start();
          setListening(true);
        } catch {
          setListening(false);
          onError?.("unknown");
        }
      }
    },
    [],
  );

  const stopListening = useCallback(() => {
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth || !text) return resolve();
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        u.pitch = 1;
        u.lang = "en-IN";
        const voice = synth.getVoices().find((v) => /en-(IN|GB|US)/i.test(v.lang));
        if (voice) u.voice = voice;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(guard);
          resolve();
        };
        // Safety net: some browsers never fire onend.
        const guard = setTimeout(finish, Math.min(20000, 2500 + text.length * 90));
        u.onend = finish;
        u.onerror = finish;
        synth.speak(u);
      } catch {
        resolve();
      }
    });
  }, []);

  return { supported, listening, listen, stopListening, speak };
}
