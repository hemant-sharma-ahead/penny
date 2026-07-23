import { useState } from 'react';
import { usePrivacy } from '@/context/PrivacyContext';

interface MaskedValueProps {
  value: string | number;
  className?: string;
}

export function MaskedValue({ value, className = '' }: MaskedValueProps) {
  const { mode } = usePrivacy();
  const [isPeeking, setIsPeeking] = useState(false);

  const isHidden = (mode === 'safe' || mode === 'privacy') && !isPeeking;

  const handlePeek = () => {
    if (mode === 'open') return;
    setIsPeeking(true);
    setTimeout(() => setIsPeeking(false), 5000);
  };

  return (
    <span
      className={`${className} ${isHidden ? 'cursor-pointer select-none' : ''}`}
      onClick={isHidden || isPeeking ? handlePeek : undefined}
      title={isHidden ? 'Tap to peek (5 seconds)' : undefined}
      aria-label={isHidden ? 'Hidden value — tap to reveal' : String(value)}
    >
      {isHidden ? '••••' : String(value)}
    </span>
  );
}
