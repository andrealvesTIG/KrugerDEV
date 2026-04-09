import { motion } from "framer-motion";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface JarvisOrbFloatingProps {
  onClick: () => void;
  isActive?: boolean;
}

export default function JarvisOrbFloating({ onClick, isActive }: JarvisOrbFloatingProps) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      title="Friday Agent"
    >
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-full bg-violet-400/30"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
      <Bot className="h-6 w-6 relative z-10" />
    </motion.button>
  );
}

interface JarvisOrbProps {
  state?: "idle" | "listening" | "thinking" | "speaking";
  size?: number;
}

export function JarvisOrb({ state = "idle", size = 200 }: JarvisOrbProps) {
  const isSmall = size <= 100;
  const pulseColors: Record<string, string> = {
    idle: "rgba(0,200,255,0.15)",
    listening: "rgba(255,60,60,0.25)",
    thinking: "rgba(0,200,255,0.3)",
    speaking: "rgba(0,255,180,0.25)",
  };
  const glowColors: Record<string, string> = {
    idle: "rgba(0,200,255,0.2)",
    listening: "rgba(255,60,60,0.4)",
    thinking: "rgba(0,200,255,0.5)",
    speaking: "rgba(0,255,180,0.4)",
  };
  const borderColors: Record<string, string> = {
    idle: "rgba(0,200,255,0.3)",
    listening: "rgba(255,80,80,0.5)",
    thinking: "rgba(0,200,255,0.6)",
    speaking: "rgba(0,255,180,0.5)",
  };

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: pulseColors[state] }}
        animate={state !== "idle" ? {
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.2, 0.5],
        } : {}}
        transition={{ duration: state === "thinking" ? 1.5 : 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {state === "listening" && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid rgba(255,80,80,0.3)` }}
          animate={{ scale: [1, 1.3, 1.6], opacity: [0.6, 0.3, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.div
        className="rounded-full flex items-center justify-center"
        style={{
          width: size * 0.65,
          height: size * 0.65,
          background: `radial-gradient(circle at 40% 40%, rgba(0,200,255,0.15), rgba(10,14,26,0.9))`,
          border: `1.5px solid ${borderColors[state]}`,
          boxShadow: `0 0 ${isSmall ? 15 : 30}px ${glowColors[state]}, inset 0 0 ${isSmall ? 10 : 20}px rgba(0,200,255,0.05)`,
        }}
        animate={state === "thinking" ? { rotate: 360 } : {}}
        transition={state === "thinking" ? { duration: 4, repeat: Infinity, ease: "linear" } : {}}
      >
        <svg
          width={size * 0.3}
          height={size * 0.3}
          viewBox="0 0 60 60"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.circle
            cx="30" cy="30" r="18"
            stroke="rgba(0,200,255,0.6)"
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="113"
            animate={state !== "idle" ? { strokeDashoffset: [0, 113] } : {}}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
          <motion.circle
            cx="30" cy="30" r="10"
            fill={state === "listening" ? "rgba(255,80,80,0.6)" : state === "speaking" ? "rgba(0,255,180,0.5)" : "rgba(0,200,255,0.4)"}
            animate={state !== "idle" ? { scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] } : {}}
            transition={{ duration: state === "thinking" ? 1 : 1.5, repeat: Infinity }}
          />
          <motion.circle
            cx="30" cy="30" r="4"
            fill={cn(
              state === "idle" && "rgba(0,200,255,0.8)",
              state === "listening" && "rgba(255,120,120,0.9)",
              state === "thinking" && "rgba(0,200,255,0.9)",
              state === "speaking" && "rgba(0,255,180,0.9)",
            )}
          />
        </svg>
      </motion.div>
    </div>
  );
}
