interface ThemedGifProps {
  src: string;
  alt: string;
  className?: string;
}

export default function ThemedGif({ src, alt, className = "" }: ThemedGifProps) {
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className} block dark:hidden mix-blend-multiply`}
      />
      <span
        className={`${className} hidden dark:inline-flex items-center justify-center mix-blend-screen`}
        style={{ filter: "invert(1)", background: "white" }}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain mix-blend-multiply"
        />
      </span>
    </>
  );
}
