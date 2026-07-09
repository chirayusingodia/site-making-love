type Props = { size?: number; className?: string };

/**
 * Punyata emblem — stylized diya + temple shikhara inside a saffron gradient circle.
 * Single accent color, transparent background, works on light & dark.
 */
export function PunyataLogo({ size = 40, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Punyata"
    >
      <defs>
        <linearGradient id="pnyBadge" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5A742" />
          <stop offset="100%" stopColor="#E85D1F" />
        </linearGradient>
        <linearGradient id="pnyFlame" x1="32" y1="10" x2="32" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF3C4" />
          <stop offset="100%" stopColor="#FFB84D" />
        </linearGradient>
      </defs>

      {/* Saffron circle badge */}
      <circle cx="32" cy="32" r="30" fill="url(#pnyBadge)" />
      <circle cx="32" cy="32" r="30" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="1.5" />

      {/* Flame (top) */}
      <path
        d="M32 12 C29 18 27 20 27 23.5 C27 26.5 29.2 28.5 32 28.5 C34.8 28.5 37 26.5 37 23.5 C37 20 35 18 32 12 Z"
        fill="url(#pnyFlame)"
      />

      {/* Temple shikhara silhouette (inside diya bowl area) */}
      <g fill="#FFFFFF">
        {/* central shikhara */}
        <path d="M32 32 L28 40 L36 40 Z" />
        <rect x="30" y="40" width="4" height="6" />
        {/* left small spire */}
        <path d="M24 36 L21.5 42 L26.5 42 Z" />
        <rect x="22.5" y="42" width="3" height="4" />
        {/* right small spire */}
        <path d="M40 36 L37.5 42 L42.5 42 Z" />
        <rect x="38.5" y="42" width="3" height="4" />
        {/* platform */}
        <rect x="18" y="46" width="28" height="3" rx="1" />
      </g>

      {/* Diya bowl */}
      <path
        d="M14 49 Q32 60 50 49 L46 52 Q32 58 18 52 Z"
        fill="#FFFFFF"
        opacity="0.95"
      />
    </svg>
  );
}
