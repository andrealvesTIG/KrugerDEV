import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Trash2, Mic, MicOff, Volume2, VolumeX, StopCircle, ToggleLeft, ToggleRight, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJarvis, type JarvisMessage } from "@/hooks/use-jarvis";
import { useSpeechRecognition, useSpeechSynthesis } from "@/hooks/use-speech";
import { useLocation } from "wouter";

function linkifyResponse(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const regex = /(Project #(\d+)\s*[-–—]\s*[^.!?\n]+|Task #(\d+)\s*[-–—]\s*[^.!?\n]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }

    const fullMatch = match[0];
    const projectId = match[2];
    const taskId = match[3];

    if (projectId) {
      parts.push(
        <a
          key={`link-${match.index}`}
          href={`/projects/${projectId}`}
          className="text-violet-400 hover:text-violet-300 underline cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/projects/${projectId}`;
          }}
        >
          {fullMatch}
        </a>
      );
    } else if (taskId) {
      parts.push(
        <span key={`task-${match.index}`} className="text-blue-400 font-medium">
          {fullMatch}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`text-end`}>{text.slice(lastIndex)}</span>);
  }

  return parts;
}

function MessageBubble({ message }: { message: JarvisMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-violet-600 text-white rounded-br-sm"
            : "bg-slate-700 text-slate-100 rounded-bl-sm"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <div className="whitespace-pre-wrap">{linkifyResponse(message.content)}</div>
        )}
      </div>
    </div>
  );
}

interface JarvisPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function JarvisPanel({ isOpen, onClose }: JarvisPanelProps) {
  const {
    messages,
    isLoading,
    sendMessage,
    stopResponse,
    clearHistory,
    conciseMode,
    setConciseMode,
  } = useJarvis();

  const { isListening, transcript, startListening, stopListening, isSupported: speechRecSupported } = useSpeechRecognition();
  const { isSpeaking, speak, stopSpeaking, isSupported: speechSynSupported } = useSpeechSynthesis();

  const [input, setInput] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isListening && transcript) {
      handleSendMessage(transcript);
    }
  }, [isListening]);

  const handleSendMessage = useCallback(async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    if (isSpeaking) stopSpeaking();

    setInput("");
    const response = await sendMessage(messageText);

    if (response && voiceEnabled && speechSynSupported) {
      speak(response.content);
    }
  }, [input, sendMessage, voiceEnabled, speechSynSupported, speak, isSpeaking, stopSpeaking]);

  const handleMicClick = useCallback(() => {
    if (isLoading) {
      stopResponse();
      return;
    }
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isLoading, isSpeaking, isListening, stopResponse, stopSpeaking, stopListening, startListening]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 400 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 400 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-slate-900 border-l border-slate-700 z-[60] flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Friday Copilot</h3>
                <p className="text-xs text-slate-400">AI Project Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={() => setConciseMode(!conciseMode)}
                title={conciseMode ? "Concise mode on" : "Concise mode off"}
              >
                {conciseMode ? <ToggleRight className="h-4 w-4 text-violet-400" /> : <ToggleLeft className="h-4 w-4" />}
              </Button>
              {speechSynSupported && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white"
                  onClick={() => {
                    setVoiceEnabled(!voiceEnabled);
                    if (isSpeaking) stopSpeaking();
                  }}
                  title={voiceEnabled ? "Voice output on" : "Voice output off"}
                >
                  {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={clearHistory}
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 text-violet-400" />
                </div>
                <h4 className="text-lg font-medium text-white mb-2">Hi, I'm Friday Copilot</h4>
                <p className="text-sm text-slate-400 max-w-[280px]">
                  Ask me anything about your projects, tasks, issues, or resources. I have full context of your project data.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    "What's the status of my projects?",
                    "Show me overdue tasks",
                    "What are the top risks?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSendMessage(suggestion)}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {isLoading && (
              <div className="flex justify-start mb-3">
                <div className="bg-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <motion.div
                      className="w-2 h-2 bg-violet-400 rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                    />
                    <motion.div
                      className="w-2 h-2 bg-violet-400 rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                    />
                    <motion.div
                      className="w-2 h-2 bg-violet-400 rounded-full"
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-slate-700 p-3">
            {isListening && (
              <div className="flex items-center gap-2 mb-2 px-2">
                <motion.div
                  className="w-2 h-2 rounded-full bg-red-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-xs text-slate-400">
                  {transcript || "Listening..."}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Friday anything..."
                className="flex-1 bg-slate-800 text-white text-sm rounded-xl px-4 py-2.5 border border-slate-600 focus:border-violet-500 focus:outline-none placeholder:text-slate-500"
              />
              {speechRecSupported && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-10 w-10 rounded-xl ${
                    isListening
                      ? "bg-red-500/20 text-red-400"
                      : isSpeaking
                        ? "bg-orange-500/20 text-orange-400"
                        : isLoading
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "text-slate-400 hover:text-white"
                  }`}
                  onClick={handleMicClick}
                  title={isLoading ? "Stop" : isListening ? "Stop listening" : isSpeaking ? "Stop speaking" : "Voice input"}
                >
                  {isLoading ? (
                    <StopCircle className="h-5 w-5" />
                  ) : isListening ? (
                    <MicOff className="h-5 w-5" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white"
                onClick={() => handleSendMessage()}
                disabled={!input.trim() && !isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
