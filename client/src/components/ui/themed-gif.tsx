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
        className={`${className} hidden dark:inline-flex items-center justify-center rounded-md bg-white p-0.5 ring-1 ring-slate-200/40`}
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
