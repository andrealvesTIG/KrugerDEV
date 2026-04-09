import { useEffect, useRef, useCallback, useState } from "react";

export function useWakeWord(onWakeWord: () => void, enabled: boolean = true) {
  const [isActive, setIsActive] = useState(false);
  const recognitionRef = useRef<any>(null);
  const onWakeWordRef = useRef(onWakeWord);
  const isActiveRef = useRef(false);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    onWakeWordRef.current = onWakeWord;
  }, [onWakeWord]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const isSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!isSupported || !enabledRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase().trim();
        if (
          transcript.includes("hey friday") ||
          transcript.includes("hi friday") ||
          transcript.includes("okay friday")
        ) {
          onWakeWordRef.current();
          break;
        }
      }
    };

    recognition.onend = () => {
      if (isActiveRef.current && enabledRef.current) {
        try {
          recognition.start();
        } catch {}
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "aborted" && isActiveRef.current && enabledRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch {}
        }, 1000);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      isActiveRef.current = true;
      setIsActive(true);
    } catch {}
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    isActiveRef.current = false;
    setIsActive(false);
  }, []);

  useEffect(() => {
    if (enabled && !isActiveRef.current) {
      startListening();
    } else if (!enabled && isActiveRef.current) {
      stopListening();
    }
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      isActiveRef.current = false;
    };
  }, []);

  return { isActive, isSupported, startListening, stopListening };
}
