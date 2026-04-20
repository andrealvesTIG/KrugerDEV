import { useState, useCallback, useRef, useEffect } from "react";

interface SpeechRecognitionOptions {
  onResult?: (transcript: string) => void;
  onInterimResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

export function useSpeechRecognition(options?: SpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef(options?.onResult);
  const onInterimRef = useRef(options?.onInterimResult);
  const onErrorRef = useRef(options?.onError);

  useEffect(() => { onResultRef.current = options?.onResult; }, [options?.onResult]);
  useEffect(() => { onInterimRef.current = options?.onInterimResult; }, [options?.onInterimResult]);
  useEffect(() => { onErrorRef.current = options?.onError; }, [options?.onError]);

  const isSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!isSupported) {
      const msg = "Speech recognition is not supported in this browser. Please try Chrome or Edge.";
      setError(msg);
      onErrorRef.current?.(msg);
      return;
    }

    setError(null);

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";
    let resultFired = false;

    recognition.onresult = (event: any) => {
      let interim = "";
      finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }
      const combined = finalTranscript || interim;
      setTranscript(combined);

      if (interim && onInterimRef.current) {
        onInterimRef.current(interim);
      }
      if (finalTranscript && onResultRef.current) {
        resultFired = true;
        onResultRef.current(finalTranscript);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (finalTranscript && onResultRef.current && !resultFired) {
        onResultRef.current(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      const errorType = event?.error || "unknown";
      let msg = "";
      switch (errorType) {
        case "not-allowed":
          msg = "Microphone access was denied. Please allow microphone permissions and try again.";
          break;
        case "no-speech":
          msg = "No speech was detected. Please try again.";
          break;
        case "audio-capture":
          msg = "No microphone was found. Please check your device settings.";
          break;
        case "network":
          msg = "Network error during speech recognition. Please check your connection.";
          break;
        case "aborted":
          return;
        default:
          msg = `Speech recognition error: ${errorType}. Try opening in a new browser tab.`;
      }
      setError(msg);
      onErrorRef.current?.(msg);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      setTranscript("");
    } catch (e: any) {
      const msg = "Could not start speech recognition. Try opening in a new browser tab.";
      setError(msg);
      onErrorRef.current?.(msg);
      setIsListening(false);
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return { isListening, transcript, startListening, stopListening, toggleListening, isSupported, error, clearError };
}

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const cachedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!isSupported) return;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;
      setVoicesReady(true);

      const preferred = voices.find(v =>
        v.name.includes("Microsoft Aria") ||
        v.name.includes("Microsoft Jenny") ||
        v.name.includes("Google UK English Female") ||
        v.name.includes("Karen") ||
        v.name.includes("Samantha") ||
        v.name.includes("Google US English")
      ) || voices.find(v => v.lang === "en-US" && v.localService) || voices.find(v => v.lang.startsWith("en"));

      cachedVoiceRef.current = preferred || null;
    };

    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported) return;

    window.speechSynthesis.cancel();

    const cleaned = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^#{1,3}\s/gm, "")
      .replace(/^[-*]\s/gm, "")
      .replace(/^\d+\.\s/gm, "")
      .replace(/^>\s/gm, "");

    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1.0;

    if (cachedVoiceRef.current) {
      utterance.voice = cachedVoiceRef.current;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isSupported]);

  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  return { isSpeaking, speak, stop, stopSpeaking: stop, isSupported, voicesReady };
}
