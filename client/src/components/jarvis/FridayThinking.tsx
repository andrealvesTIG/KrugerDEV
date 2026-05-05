import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FridayThinkingProps {
  className?: string;
  size?: number;
  title?: string;
}

const ORANGE = "#FF751F";
const BLUE = "#075DD1";

const orangeBlocks: { d: string; delay: number }[] = [
  {
    d: "M140.7,362.8H64.9c-19.3,0-34.9,15.7-34.9,34.9v75.8c0,19.3,15.7,34.9,34.9,34.9h75.8 c19.3,0,34.9-15.7,34.9-34.9v-75.8C175.6,378.5,159.9,362.8,140.7,362.8z",
    delay: 0.0,
  },
  {
    d: "M140.7,195.6H64.9c-19.3,0-34.9,15.7-34.9,34.9v75.8c0,19.3,15.7,34.9,34.9,34.9h75.8 c19.3,0,34.9-15.7,34.9-34.9v-75.8C175.6,211.3,159.9,195.6,140.7,195.6z",
    delay: 0.12,
  },
  {
    d: "M140.7,28.4C79.7,28.4,30,78.1,30,139.1c0,19.3,15.7,34.9,34.9,34.9h75.8c19.3,0,34.9-15.7,34.9-34.9V63.3 C175.6,44.1,159.9,28.4,140.7,28.4z",
    delay: 0.24,
  },
  {
    d: "M270,195.6h-37.9c-19.3,0-34.9,15.7-34.9,34.9v75.8c0,19.3,15.7,34.9,34.9,34.9H270 c40.1,0,72.8-32.7,72.8-72.8C342.8,228.3,310.1,195.6,270,195.6z",
    delay: 0.36,
  },
  {
    d: "M307.8,28.4h-75.7c-19.3,0-34.9,15.7-34.9,34.9v75.8c0,19.2,15.7,34.9,34.9,34.9h75.7 c19.3,0,34.9-15.7,34.9-34.9V63.4C342.8,44.1,327.1,28.4,307.8,28.4z",
    delay: 0.48,
  },
  {
    d: "M399.3,174h37.9c40.1,0,72.8-32.7,72.8-72.8c0-40.1-32.7-72.8-72.8-72.8h-37.9c-19.3,0-34.9,15.7-34.9,34.9 v75.8C364.4,158.4,380.1,174,399.3,174z",
    delay: 0.6,
  },
];

const blueCircle =
  "M433.8,359.7c-41.9,0-75.9,34.1-75.9,75.9c0,41.9,34.1,75.9,75.9,75.9c20.2,0,39.3-7.9,53.7-22.3 c14.4-14.4,22.3-33.4,22.3-53.7C509.7,393.8,475.6,359.7,433.8,359.7z";

export default function FridayThinking({
  className,
  size = 32,
  title = "Friday is thinking",
}: FridayThinkingProps) {
  return (
    <motion.span
      role="img"
      aria-label={title}
      className={cn("inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      animate={{
        filter: [
          "drop-shadow(0 0 0px rgba(255,117,31,0.0))",
          "drop-shadow(0 0 6px rgba(255,117,31,0.55))",
          "drop-shadow(0 0 0px rgba(255,117,31,0.0))",
        ],
      }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg
        viewBox="0 0 540 540"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        <g style={{ transformOrigin: "270px 270px" }}>
          {orangeBlocks.map((block, idx) => (
            <motion.path
              key={idx}
              d={block.d}
              fill={ORANGE}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ opacity: 0.45, scale: 0.85 }}
              animate={{
                opacity: [0.45, 1, 0.45],
                scale: [0.88, 1.04, 0.88],
              }}
              transition={{
                duration: 1.6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: block.delay,
              }}
            />
          ))}
          <motion.path
            d={blueCircle}
            fill={BLUE}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            animate={{
              opacity: [0.55, 1, 0.55],
              scale: [0.9, 1.1, 0.9],
            }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.72,
            }}
          />
        </g>
      </svg>
    </motion.span>
  );
}
