import { motion } from "framer-motion";
import { Bot } from "lucide-react";

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
      title="Friday Report"
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
  const s = size;
  const headSize = s * 0.6;
  const eyeSize = headSize * 0.13;
  const eyeY = headSize * 0.38;
  const eyeSpacing = headSize * 0.18;
  const mouthY = headSize * 0.6;

  const accentColor: Record<string, string> = {
    idle: "#00c8ff",
    listening: "#ff5050",
    thinking: "#00c8ff",
    speaking: "#00ffb4",
  };
  const glowColor: Record<string, string> = {
    idle: "rgba(0,200,255,0.3)",
    listening: "rgba(255,80,80,0.4)",
    thinking: "rgba(0,200,255,0.5)",
    speaking: "rgba(0,255,180,0.4)",
  };

  const color = accentColor[state];
  const glow = glowColor[state];

  return (
    <div className="relative flex items-center justify-center" style={{ width: s, height: s }}>
      <motion.div
        className="absolute rounded-full"
        style={{
          width: s * 0.9,
          height: s * 0.9,
          background: `radial-gradient(circle, ${glow}, transparent 70%)`,
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.25, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute rounded-full"
        style={{
          width: s * 0.82,
          height: s * 0.82,
          border: `1px solid ${color}22`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{
            width: s * 0.04,
            height: s * 0.04,
            background: `${color}88`,
            top: -s * 0.02,
            left: "50%",
            marginLeft: -s * 0.02,
            boxShadow: `0 0 6px ${color}aa`,
          }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {state === "listening" && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: s * 0.75,
            height: s * 0.75,
            border: `2px solid rgba(255,80,80,0.3)`,
          }}
          animate={{ scale: [1, 1.25, 1.5], opacity: [0.5, 0.2, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <motion.div
        className="relative rounded-full flex items-center justify-center"
        style={{
          width: headSize,
          height: headSize,
          background: `radial-gradient(circle at 40% 35%, rgba(15,25,50,0.95), rgba(5,10,20,1))`,
          border: `1.5px solid ${color}55`,
          boxShadow: `0 0 30px ${glow}, inset 0 0 20px rgba(0,200,255,0.04)`,
        }}
        animate={
          state === "idle" ? { y: [0, -3, 0] } :
          state === "thinking" ? { y: [0, -2, 0], rotate: [0, -2, 2, 0] } :
          state === "speaking" ? { y: [0, -4, 0] } :
          {}
        }
        transition={{
          duration: state === "thinking" ? 2 : 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <svg
          width={headSize}
          height={headSize}
          viewBox={`0 0 ${headSize} ${headSize}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {state === "idle" && (
            <>
              <motion.ellipse
                cx={headSize / 2 - eyeSpacing}
                cy={eyeY}
                rx={eyeSize}
                ry={eyeSize}
                fill={color}
                animate={{ opacity: [0.8, 1, 0.8], ry: [eyeSize, eyeSize, eyeSize * 0.15, eyeSize] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", times: [0, 0.85, 0.9, 0.95] }}
              />
              <motion.ellipse
                cx={headSize / 2 + eyeSpacing}
                cy={eyeY}
                rx={eyeSize}
                ry={eyeSize}
                fill={color}
                animate={{ opacity: [0.8, 1, 0.8], ry: [eyeSize, eyeSize, eyeSize * 0.15, eyeSize] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", times: [0, 0.85, 0.9, 0.95] }}
              />
              <motion.path
                d={`M ${headSize / 2 - eyeSpacing * 0.8} ${mouthY} Q ${headSize / 2} ${mouthY + headSize * 0.06} ${headSize / 2 + eyeSpacing * 0.8} ${mouthY}`}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                fill="none"
                animate={{ opacity: [0.5, 0.7, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          )}

          {state === "listening" && (
            <>
              <motion.ellipse
                cx={headSize / 2 - eyeSpacing}
                cy={eyeY}
                rx={eyeSize * 1.2}
                ry={eyeSize * 1.3}
                fill={color}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <motion.ellipse
                cx={headSize / 2 + eyeSpacing}
                cy={eyeY}
                rx={eyeSize * 1.2}
                ry={eyeSize * 1.3}
                fill={color}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <motion.circle
                cx={headSize / 2}
                cy={mouthY + headSize * 0.02}
                r={headSize * 0.05}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            </>
          )}

          {state === "thinking" && (
            <>
              <motion.line
                x1={headSize / 2 - eyeSpacing - eyeSize}
                y1={eyeY}
                x2={headSize / 2 - eyeSpacing + eyeSize}
                y2={eyeY}
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                animate={{ y1: [eyeY, eyeY - 2, eyeY], y2: [eyeY, eyeY - 2, eyeY] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.line
                x1={headSize / 2 + eyeSpacing - eyeSize}
                y1={eyeY}
                x2={headSize / 2 + eyeSpacing + eyeSize}
                y2={eyeY}
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                animate={{ y1: [eyeY, eyeY - 2, eyeY], y2: [eyeY, eyeY - 2, eyeY] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.path
                d={`M ${headSize / 2 - eyeSpacing * 0.6} ${mouthY} L ${headSize / 2 + eyeSpacing * 0.6} ${mouthY}`}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                animate={{ opacity: [0.4, 0.7, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              {[0, 1, 2].map((i) => (
                <motion.circle
                  key={i}
                  cx={headSize / 2 + eyeSpacing * 1.3 + i * headSize * 0.06}
                  cy={eyeY - headSize * 0.12}
                  r={headSize * 0.015 + i * 0.004}
                  fill={color}
                  animate={{ opacity: [0, 0.7, 0], y: [0, -3, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                />
              ))}
            </>
          )}

          {state === "speaking" && (
            <>
              <motion.ellipse
                cx={headSize / 2 - eyeSpacing}
                cy={eyeY}
                rx={eyeSize}
                ry={eyeSize * 0.7}
                fill={color}
                animate={{ ry: [eyeSize * 0.7, eyeSize * 0.5, eyeSize * 0.7] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <motion.ellipse
                cx={headSize / 2 + eyeSpacing}
                cy={eyeY}
                rx={eyeSize}
                ry={eyeSize * 0.7}
                fill={color}
                animate={{ ry: [eyeSize * 0.7, eyeSize * 0.5, eyeSize * 0.7] }}
                transition={{ duration: 0.6, repeat: Infinity }}
              />
              <motion.path
                d={`M ${headSize / 2 - eyeSpacing * 0.7} ${mouthY - headSize * 0.02} Q ${headSize / 2} ${mouthY + headSize * 0.08} ${headSize / 2 + eyeSpacing * 0.7} ${mouthY - headSize * 0.02}`}
                fill={`${color}33`}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                animate={{
                  d: [
                    `M ${headSize / 2 - eyeSpacing * 0.7} ${mouthY - headSize * 0.02} Q ${headSize / 2} ${mouthY + headSize * 0.08} ${headSize / 2 + eyeSpacing * 0.7} ${mouthY - headSize * 0.02}`,
                    `M ${headSize / 2 - eyeSpacing * 0.5} ${mouthY} Q ${headSize / 2} ${mouthY + headSize * 0.03} ${headSize / 2 + eyeSpacing * 0.5} ${mouthY}`,
                    `M ${headSize / 2 - eyeSpacing * 0.7} ${mouthY - headSize * 0.02} Q ${headSize / 2} ${mouthY + headSize * 0.08} ${headSize / 2 + eyeSpacing * 0.7} ${mouthY - headSize * 0.02}`,
                  ],
                }}
                transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          )}

          <motion.ellipse
            cx={headSize / 2 - eyeSpacing * 1.6}
            cy={eyeY + headSize * 0.05}
            rx={headSize * 0.06}
            ry={headSize * 0.03}
            fill={state === "speaking" ? "rgba(0,255,180,0.08)" : state === "listening" ? "rgba(255,80,80,0.08)" : "rgba(0,200,255,0.06)"}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.ellipse
            cx={headSize / 2 + eyeSpacing * 1.6}
            cy={eyeY + headSize * 0.05}
            rx={headSize * 0.06}
            ry={headSize * 0.03}
            fill={state === "speaking" ? "rgba(0,255,180,0.08)" : state === "listening" ? "rgba(255,80,80,0.08)" : "rgba(0,200,255,0.06)"}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          />

          <motion.circle
            cx={headSize / 2 - eyeSpacing - eyeSize * 0.35}
            cy={eyeY - eyeSize * 0.35}
            r={eyeSize * 0.2}
            fill="rgba(255,255,255,0.4)"
          />
          <motion.circle
            cx={headSize / 2 + eyeSpacing - eyeSize * 0.35}
            cy={eyeY - eyeSize * 0.35}
            r={eyeSize * 0.2}
            fill="rgba(255,255,255,0.4)"
          />
        </svg>

        {state !== "idle" && (
          <motion.div
            className="absolute rounded-full"
            style={{
              width: headSize * 0.15,
              height: headSize * 0.15,
              background: `${color}11`,
              border: `1px solid ${color}22`,
              top: -headSize * 0.04,
              right: headSize * 0.1,
            }}
            animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </motion.div>
    </div>
  );
}
