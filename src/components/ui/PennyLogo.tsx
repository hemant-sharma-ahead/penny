interface Props {
  size?: number;
  className?: string;
}

export function PennyLogo({ size = 32, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Penny"
      role="img"
    >
      {/* Outer ring */}
      <circle cx="16" cy="16" r="15" stroke="#00A86B" strokeWidth="2" fill="none" />
      {/* Inner ring */}
      <circle cx="16" cy="16" r="11" stroke="#00A86B" strokeWidth="1.5" fill="none" opacity="0.4" />
      {/* Growth sprout — stem */}
      <path d="M16 22V14" stroke="#00A86B" strokeWidth="2" strokeLinecap="round" />
      {/* Left leaf */}
      <path d="M16 17 C14 16 11 14 12 11 C13 8 16 10 16 14" fill="#00A86B" opacity="0.85" />
      {/* Right leaf */}
      <path d="M16 15 C18 14 21 12 20 9 C19 6 16 8 16 12" fill="#00A86B" />
    </svg>
  );
}

interface WordmarkProps {
  height?: number;
  className?: string;
}

export function PennyWordmark({ height = 28, className }: WordmarkProps) {
  const ratio = 120 / 32;
  const width = height * ratio;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`text-primary ${className ?? ''}`}
      aria-label="Penny"
      role="img"
    >
      {/* Coin mark */}
      <circle cx="16" cy="16" r="15" stroke="#00A86B" strokeWidth="2" fill="none" />
      <circle cx="16" cy="16" r="11" stroke="#00A86B" strokeWidth="1.5" fill="none" opacity="0.4" />
      <path d="M16 22V14" stroke="#00A86B" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 17 C14 16 11 14 12 11 C13 8 16 10 16 14" fill="#00A86B" opacity="0.85" />
      <path d="M16 15 C18 14 21 12 20 9 C19 6 16 8 16 12" fill="#00A86B" />
      {/* "Penny" text */}
      <text
        x="38"
        y="22"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="600"
        fontSize="18"
        fill="currentColor"
        letterSpacing="-0.3"
      >
        Penny
      </text>
    </svg>
  );
}
