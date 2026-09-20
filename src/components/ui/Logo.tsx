// Shared logo component — NexStudio-style angular mark + wordmark
// Icon: bold angular lightning/arrow shape (pure SVG, no external assets)

interface LogoProps {
  className?: string;
  iconSize?: number;
}

export function Logo({ className = '', iconSize = 28 }: LogoProps) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      {/* Angular geometric mark */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Bold angular lightning-bolt shape, similar to NexStudio's mark */}
        <path
          d="M17 2L7 15.5H14L11 26L22 12H15L17 2Z"
          fill="black"
        />
      </svg>

      {/* Wordmark */}
      <span
        className="text-[15px] tracking-[-0.02em] text-black leading-none"
        style={{ fontFamily: 'var(--font-inter)', fontWeight: 500 }}
      >
        Kickstart<em style={{ fontStyle: 'italic', fontWeight: 400 }}>Crypto</em>
      </span>
    </span>
  );
}
