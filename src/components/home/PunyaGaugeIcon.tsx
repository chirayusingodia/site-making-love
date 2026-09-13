// A small animated gauge — arc + sweeping needle — standing in for the
// "Punya Meter" badge. The project's other Lottie files under
// src/assets/lottie and public/lottie are empty placeholder stubs (a few
// bytes each, never real animations), so PunyaMeter.tsx always fell back
// to a static flame icon. Rather than pull in an unvetted third-party
// Lottie file, this draws the meter itself — brand-colored, genuinely
// moving, no external asset.
export function PunyaGaugeIcon({ size = 46 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="punya-gauge-arc" x1="6" y1="48" x2="58" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5A742" />
          <stop offset="100%" stopColor="#E85D1F" />
        </linearGradient>
      </defs>

      {/* Track */}
      <path
        d="M 8 48 A 24 24 0 0 1 56 48"
        stroke="#E85D1F"
        strokeOpacity="0.15"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Active arc */}
      <path
        d="M 8 48 A 24 24 0 0 1 56 48"
        stroke="url(#punya-gauge-arc)"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* Needle — sweeps back and forth across the arc, looping */}
      <g style={{ transformOrigin: "32px 48px", animation: "punya-gauge-sweep 2.6s ease-in-out infinite" }}>
        <line x1="32" y1="48" x2="32" y2="26" stroke="#5B1A1A" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="32" cy="48" r="4.5" fill="#5B1A1A" />
      <circle cx="32" cy="48" r="2" fill="#F5A742" />

      <style>
        {`
          @keyframes punya-gauge-sweep {
            0%   { transform: rotate(-58deg); }
            50%  { transform: rotate(58deg); }
            100% { transform: rotate(-58deg); }
          }
        `}
      </style>
    </svg>
  );
}
