import React from "react";

interface PunyataLogoProps {
  className?: string;
}

export function PunyataLogo({ className = "w-12 h-12" }: PunyataLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="105 380 520 675"
      role="img"
      aria-labelledby="logo-title logo-desc"
      className={`${className} overflow-visible`}
    >
      <title id="logo-title">Punyata logo</title>
      <desc id="logo-desc">पुण्यता — तीर्थ गुरु पुष्करराज से मासिक सेवा</desc>
      <defs>
        <filter
          id="punyata-relief"
          x="-12%"
          y="-12%"
          width="136%"
          height="142%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="8"
            dy="11"
            stdDeviation="5"
            floodColor="#2d2b27"
            floodOpacity={0.25}
          />
          <feDropShadow
            dx="-1"
            dy="-1"
            stdDeviation="1.2"
            floodColor="#ffffff"
            floodOpacity={0.7}
          />
        </filter>
        <filter id="punyata-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <style>
        {`
          .logo-inner-group {
            animation: logoCycle 7s ease-in-out infinite;
          }
          .trace {
            stroke-dasharray: 1;
            stroke-dashoffset: 1;
            animation: logoDraw 7s ease-in-out infinite;
          }
          .earth { animation-delay: 0s; }
          .stem { animation-delay: 0.3s; }
          
          .hand {
            fill: #D85A30;
            fill-opacity: 0;
            animation: logoDraw 7s ease-in-out infinite, fillFadeHand 7s ease-in-out infinite;
            animation-delay: 0s, 0s;
          }
          
          .leaf {
            fill: #F5A742;
            fill-opacity: 0;
            animation: logoDraw 7s ease-in-out infinite, fillFadeLeaf 7s ease-in-out infinite;
            animation-delay: 0s, 0s;
          }
          
          .leaf-glow {
            opacity: 0;
            animation: logoGlow 7s ease-in-out infinite;
          }
          
          @keyframes logoCycle {
            0%, 78% { opacity: 1; }
            85%, 95% { opacity: 0; }
            100% { opacity: 1; }
          }
          
          @keyframes logoDraw {
            0% { stroke-dashoffset: 1; }
            17%, 78% { stroke-dashoffset: 0; }
            85%, 100% { stroke-dashoffset: 1; }
          }
          
          @keyframes fillFadeHand {
            0%, 15% { fill-opacity: 0; }
            22%, 78% { fill-opacity: 1; }
            85%, 100% { fill-opacity: 0; }
          }
          
          @keyframes fillFadeLeaf {
            0%, 19% { fill-opacity: 0; }
            26%, 78% { fill-opacity: 1; }
            85%, 100% { fill-opacity: 0; }
          }
          
          @keyframes logoGlow {
            0%, 25%, 78% { opacity: 0; }
            35%, 65% { opacity: 0.85; }
            85%, 100% { opacity: 0; }
          }
          
          @media (prefers-reduced-motion: reduce) {
            .trace { animation: none; stroke-dashoffset: 0; }
            .hand { fill-opacity: 1; }
            .leaf { fill-opacity: 1; }
            .leaf-glow { animation: none; opacity: 0; }
          }
        `}
      </style>
      
      <g className="logo-inner-group">
        {/* Saffron components: Earth, Stem, Hand */}
        <g
          fill="none"
          stroke="#D85A30"
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#punyata-relief)"
        >
          <path
            className="trace earth"
            strokeWidth={26}
            pathLength={1}
            d="M142 1020C270 929 447 929 607 1020"
          />
          <path
            className="trace stem"
            strokeWidth={26}
            pathLength={1}
            d="M357 954V687C364 630 398 552 460 492"
          />
          <path
            className="trace hand"
            pathLength={1}
            d="M357 687C340 649 309 620 274 606C244 594 211 581 190 560C169 539 155 508 148 479C147 475 151 474 154 477C174 493 179 522 198 541C213 556 229 567 245 572C250 574 253 570 250 565C240 550 231 535 229 521C229 516 233 515 236 518C254 531 270 536 288 547C332 573 355 620 357 687Z"
          />
        </g>

        {/* Golden sprout leaf */}
        <g
          fill="none"
          stroke="#F5A742"
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#punyata-relief)"
        >
          <path
            className="trace leaf"
            pathLength={1}
            d="M370 566C369 487 408 422 514 402C510 484 468 551 370 566Z"
          />
        </g>

        {/* Glowing Leaf overlay (Golden-yellow glow) */}
        <path
          className="leaf-glow"
          d="M370 566C369 487 408 422 514 402C510 484 468 551 370 566Z"
          fill="none"
          stroke="#FBD38D"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#punyata-glow)"
        />
      </g>
    </svg>
  );
}
