import { useId } from 'react';
import { cn } from './ui';

export type LogoVariant = 'primary' | 'compact' | 'symbol' | 'stacked';
export type LogoTone = 'dark' | 'light';

function BrandMark({ className }: { className?: string }) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const tileId = `ws-tile-${id}`;
  const goldId = `ws-gold-${id}`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('h-9 w-9 shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={tileId} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A62A2A" />
          <stop offset="0.55" stopColor="var(--color-sidebar)" />
          <stop offset="1" stopColor="#5E0E0E" />
        </linearGradient>
        <linearGradient id={goldId} x1="16" y1="26" x2="48" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EFD9A5" />
          <stop offset="0.5" stopColor="#D6B26A" />
          <stop offset="1" stopColor="#B98D45" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="17" fill={`url(#${tileId})`} />
      <rect
        x="1.75"
        y="1.75"
        width="60.5"
        height="60.5"
        rx="16.25"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />
      <g fill={`url(#${goldId})`}>
        <rect x="36.5" y="14.8" width="13" height="2.5" rx="1.25" />
        <rect x="40" y="19.9" width="9.5" height="2.5" rx="1.25" opacity="0.8" />
        <rect x="43" y="25" width="6.5" height="2.5" rx="1.25" opacity="0.6" />
      </g>
      <path
        d="M15.4 41.2V25.6c0-3.3 2.7-6 6-6h3.8c3.9 0 7.1 3.2 7.1 7.1 0 1.7-.6 3.4-1.7 4.7l-4.4 5.2c-.4.5-.6 1.1-.6 1.7v2.9H15.4Z"
        fill="#F7EAD3"
      />
      <path
        d="M25.4 19.8c3.6.2 6.4 3.1 6.4 6.7 0 1.6-.6 3.2-1.6 4.4l-1 1.2"
        fill="none"
        stroke="#D6B26A"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <rect x="19.4" y="24.2" width="6.6" height="3.3" rx="1.65" fill={`url(#${goldId})`} />
      <rect x="24.6" y="30.2" width="10.6" height="5.2" rx="2.6" fill={`url(#${goldId})`} />
      <rect x="15.3" y="35.6" width="32.4" height="7" rx="3" fill="#F7EAD3" />
      <path d="M34.8 37v5" stroke="#C39A4D" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="19.6" y="42.2" width="2.4" height="3.2" rx="1" fill="#F7EAD3" />
      <rect x="42.5" y="42.2" width="2.4" height="3.2" rx="1" fill="#F7EAD3" />
      <path
        d="M12.8 50.6c10.6-3.8 28.6-3.8 38.4 0"
        fill="none"
        stroke={`url(#${goldId})`}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M12.8 56.3c11.2-3.4 27.6-3.4 38.4 0"
        fill="none"
        stroke={`url(#${goldId})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <g fill="#D6B26A" opacity="0.5">
        <rect x="19.8" y="52.2" width="1.8" height="3.6" rx="0.9" />
        <rect x="27.8" y="52" width="1.8" height="3.8" rx="0.9" />
        <rect x="35.8" y="52" width="1.8" height="3.8" rx="0.9" />
        <rect x="43.8" y="52.2" width="1.8" height="3.6" rx="0.9" />
      </g>
    </svg>
  );
}

function Wordmark({ tone, withTagline }: { tone: LogoTone; withTagline: boolean }) {
  const isLight = tone === 'light';
  return (
    <span className="leading-none">
      <span className="flex items-baseline gap-1.5 whitespace-nowrap text-[15px] font-extrabold uppercase tracking-[0.14em]">
        <span className={isLight ? 'text-white' : 'text-ink-950'}>Whoosh</span>
        <span className={isLight ? 'text-gold-400' : 'text-brand-accent'}>Stay</span>
      </span>
      {withTagline ? (
        <span
          className={cn(
            'mt-1.5 hidden text-[8px] font-bold uppercase leading-none tracking-[0.28em] sm:block',
            isLight ? 'text-white/60' : 'text-ink-400',
          )}
        >
          Crew Accommodation Platform
        </span>
      ) : null}
    </span>
  );
}

export function Logo({
  variant = 'primary',
  tone = 'dark',
  className,
}: {
  variant?: LogoVariant;
  tone?: LogoTone;
  className?: string;
}) {
  if (variant === 'symbol') {
    return (
      <span className={cn('inline-flex', className)} data-testid="brand-logo">
        <BrandMark />
        <span className="sr-only">Whoosh Stay</span>
      </span>
    );
  }

  if (variant === 'stacked') {
    return (
      <span
        className={cn('inline-flex flex-col items-center text-center', className)}
        data-testid="brand-logo"
      >
        <BrandMark className="h-14 w-14" />
        <span
          className={cn(
            'mt-4 whitespace-nowrap text-xl font-extrabold uppercase tracking-[0.2em]',
            tone === 'light' ? 'text-white' : 'text-ink-950',
          )}
        >
          Whoosh <span className={tone === 'light' ? 'text-gold-400' : 'text-brand-accent'}>Stay</span>
        </span>
        <span
          className={cn(
            'mt-2 whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.3em]',
            tone === 'light' ? 'text-white/60' : 'text-ink-400',
          )}
        >
          Crew Accommodation Platform
        </span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <span className={cn('inline-flex items-center gap-2.5', className)} data-testid="brand-logo">
        <BrandMark className="h-8 w-8" />
        <span
          className={cn(
            'whitespace-nowrap text-[13px] font-extrabold uppercase tracking-[0.12em]',
            tone === 'light' ? 'text-white' : 'text-ink-950',
          )}
        >
          Whoosh <span className={tone === 'light' ? 'text-gold-400' : 'text-brand-accent'}>Stay</span>
        </span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} data-testid="brand-logo">
      <BrandMark className="h-10 w-10" />
      <Wordmark tone={tone} withTagline />
    </span>
  );
}
