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
        className="absolute rounded-full"
        style={{ width: size * 0.95, height: size * 0.95, background: pulseColors[state] }}
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.3, 0.12, 0.3],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.85,
          height: size * 0.85,
          border: `1px solid rgba(0,200,255,0.15)`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{
            width: size * 0.06,
            height: size * 0.06,
            background: "rgba(0,200,255,0.5)",
            top: -size * 0.03,
            left: "50%",
            marginLeft: -size * 0.03,
            boxShadow: "0 0 8px rgba(0,200,255,0.6)",
          }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.78,
          height: size * 0.78,
          border: `1px solid rgba(0,200,255,0.08)`,
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{
            width: size * 0.04,
            height: size * 0.04,
            background: "rgba(0,180,255,0.35)",
            bottom: -size * 0.02,
            left: "50%",
            marginLeft: -size * 0.02,
            boxShadow: "0 0 6px rgba(0,200,255,0.4)",
          }}
          animate={{ opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </motion.div>

      {state === "listening" && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid rgba(255,80,80,0.3)` }}
          animate={{ scale: [1, 1.3, 1.6], opacity: [0.6, 0.3, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.72,
          height: size * 0.72,
          background: "transparent",
          overflow: "hidden",
        }}
      >
        <motion.div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            width: 1,
            height: "50%",
            background: "linear-gradient(to bottom, rgba(0,200,255,0.25), transparent)",
            transformOrigin: "bottom center",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>

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
            animate={{ strokeDashoffset: [0, 113] }}
            transition={{ duration: state !== "idle" ? 3 : 8, repeat: Infinity, ease: "linear" }}
          />
          <motion.circle
            cx="30" cy="30" r="10"
            fill={state === "listening" ? "rgba(255,80,80,0.6)" : state === "speaking" ? "rgba(0,255,180,0.5)" : "rgba(0,200,255,0.4)"}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: state === "thinking" ? 1 : 2.5, repeat: Infinity }}
          />
          <motion.circle
            cx="30" cy="30" r="4"
            fill={cn(
              state === "idle" && "rgba(0,200,255,0.8)",
              state === "listening" && "rgba(255,120,120,0.9)",
              state === "thinking" && "rgba(0,200,255,0.9)",
              state === "speaking" && "rgba(0,255,180,0.9)",
            )}
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </motion.div>
    </div>
  );
}
