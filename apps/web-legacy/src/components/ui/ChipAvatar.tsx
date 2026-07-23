interface Props {
  size?: number;
  className?: string;
}

export function ChipAvatar({ size = 40, className }: Props) {
  const id = `chip-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Chip"
      role="img"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00C47D" />
          <stop offset="100%" stopColor="#007A4D" />
        </linearGradient>
      </defs>
      {/* Rounded square background */}
      <rect width="40" height="40" rx="12" fill={`url(#${id})`} />
      {/* Central sparkle */}
      <path d="M20 10 L21.5 17.5 L29 19 L21.5 20.5 L20 28 L18.5 20.5 L11 19 L18.5 17.5 Z" fill="white" opacity="0.95" />
      {/* Small accent sparkles */}
      <circle cx="28" cy="11" r="1.5" fill="white" opacity="0.6" />
      <circle cx="12" cy="28" r="1" fill="white" opacity="0.5" />
      {/* Circuit dot hints */}
      <circle cx="10" cy="14" r="1" fill="white" opacity="0.35" />
      <circle cx="30" cy="26" r="1" fill="white" opacity="0.35" />
    </svg>
  );
}
