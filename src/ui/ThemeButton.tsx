// The theme switch in the top bar: System, then Light, then Dark.
import { useState } from 'react';
import { applyTheme, nextTheme, readTheme, type ThemeChoice } from './theme';

const LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function Icon({ choice }: { choice: ThemeChoice }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const };
  if (choice === 'light') {
    return (
      <svg width={16} height={16} viewBox="-8 -8 16 16" aria-hidden="true">
        <circle r={3} {...common} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <line key={a} x1={0} y1={-5} x2={0} y2={-6.6} transform={`rotate(${a})`} {...common} />
        ))}
      </svg>
    );
  }
  if (choice === 'dark') {
    return (
      <svg width={16} height={16} viewBox="-8 -8 16 16" aria-hidden="true">
        <path d="M 2.5 -6 A 6 6 0 1 0 6 2.5 A 4.6 4.6 0 0 1 2.5 -6 Z" {...common} strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={16} height={16} viewBox="-8 -8 16 16" aria-hidden="true">
      <circle r={6} {...common} />
      <path d="M 0 -6 A 6 6 0 0 1 0 6 Z" fill="currentColor" />
    </svg>
  );
}

export function ThemeButton({ className }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme());
  return (
    <button
      type="button" className={className}
      aria-label={`Theme: ${LABEL[choice]}`} title={`Theme: ${LABEL[choice]} (click for ${LABEL[nextTheme(choice)]})`}
      onClick={() => {
        const next = nextTheme(choice);
        applyTheme(next);
        setChoice(next);
      }}
    >
      <Icon choice={choice} />
    </button>
  );
}
