import { motion } from "framer-motion";
import { Bot } from "lucide-react";

interface JarvisOrbProps {
  onClick: () => void;
  isActive?: boolean;
}

export default function JarvisOrb({ onClick, isActive }: JarvisOrbProps) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      title="Friday Copilot"
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
