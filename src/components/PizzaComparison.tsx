import React from "react";
import { UtensilsCrossed } from "lucide-react";
import { useTranslation } from "@/lib/translations";

interface PizzaComparisonProps {
  /** Public plan id (e.g. "basic" | "grah" | "varsh" | any new plan slug) */
  planId: string;
  price: string;
  cycle: string;
  size?: "sm" | "md" | "lg";
}

// Custom CSS-Animated Pizza SVG slice (floating + rising steam)
function AnimatedPizzaIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} overflow-visible`}>
      <style>
        {`
          @keyframes floatPizza {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-1.5px); }
          }
          @keyframes steamRise {
            0% { transform: translateY(0) scaleX(0.8); opacity: 0; }
            30% { opacity: 0.75; }
            100% { transform: translateY(-3.5px) scaleX(1.15); opacity: 0; }
          }
          .pizza-slice {
            animation: floatPizza 2s ease-in-out infinite;
            transform-origin: center bottom;
          }
          .steam-line {
            animation: steamRise 1.6s ease-in-out infinite;
            stroke: #D85A30;
            stroke-width: 1.2;
            fill: none;
            stroke-linecap: round;
          }
          .s-1 { animation-delay: 0s; }
          .s-2 { animation-delay: 0.5s; }
          .s-3 { animation-delay: 1s; }
        `}
      </style>
      {/* Hot steam waves */}
      <path d="M7 6Q8 4.2 7.2 2.5" className="steam-line s-1" />
      <path d="M12 5Q13 3.2 12.2 1.5" className="steam-line s-2" />
      <path d="M17 6Q18 4.2 17.2 2.5" className="steam-line s-3" />
      
      {/* Pizza Slice Body */}
      <g className="pizza-slice">
        {/* Saffron Crust */}
        <path d="M2 7C4 7 20 7 22 7C22 8.5 21 10.5 19.5 11.5L12.5 22C12.2 22.5 11.8 22.5 11.5 22L4.5 11.5C3 10.5 2 8.5 2 7Z" fill="#D85A30" />
        {/* Golden Cheese */}
        <path d="M4 8.5L12 20.5L20 8.5H4Z" fill="#F5A742" />
        {/* Red Pepperonis */}
        <circle cx="8" cy="11.5" r="1.5" fill="#C0362C" />
        <circle cx="12" cy="15.5" r="1.5" fill="#C0362C" />
        <circle cx="16" cy="11.5" r="1.5" fill="#C0362C" />
      </g>
    </svg>
  );
}

// Custom CSS-Animated Dinner SVG (floating steam)
function AnimatedDinnerIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} overflow-visible`}>
      <style>
        {`
          @keyframes floatDinner {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-1.5px); }
          }
          @keyframes steamRiseDinner {
            0% { transform: translateY(0) scaleX(0.8); opacity: 0; }
            30% { opacity: 0.65; }
            100% { transform: translateY(-3.5px) scaleX(1.1); opacity: 0; }
          }
          .dinner-group {
            animation: floatDinner 2s ease-in-out infinite;
          }
          .steam-line-dinner {
            animation: steamRiseDinner 1.8s ease-in-out infinite;
            stroke: #D85A30;
            stroke-width: 1.2;
            fill: none;
            stroke-linecap: round;
          }
          .sd-1 { animation-delay: 0.2s; }
          .sd-2 { animation-delay: 0.9s; }
        `}
      </style>
      {/* Steam lines */}
      <path d="M10 6Q11 4.5 10 3" className="steam-line-dinner sd-1" />
      <path d="M14 6Q15 4.5 14 3" className="steam-line-dinner sd-2" />
      
      {/* Plated dinner and utensils */}
      <g className="dinner-group" fill="#D85A30">
        <path d="M2 18C2 15 6 13 12 13C18 13 22 15 22 18H2Z" />
        <rect x="4" y="19" width="16" height="1.5" rx="0.55" />
        <path d="M7 8.5V11.5M7 8.5C6.5 8.5 6 9 6 9.5V11.5H8V9.5C8 9 7.5 8.5 7 8.5ZM7 11.5V13.5H7ZM7 8.5" stroke="#F5A742" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M17 8C16 8 15.5 10 16 11.5L17 13.5L18 11.5C18.5 10 18 8 17 8Z" fill="#F5A742" />
      </g>
    </svg>
  );
}

// Custom CSS-Animated Diya SVG (flickering flame + breathing glow)
function AnimatedDiyaIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} overflow-visible`}>
      <style>
        {`
          @keyframes flickerDiya {
            0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.9; }
            33% { transform: scale(1.06) rotate(1.2deg); opacity: 1; }
            66% { transform: scale(0.94) rotate(-1.2deg); opacity: 0.85; }
          }
          .diya-flame {
            animation: flickerDiya 0.9s ease-in-out infinite;
            transform-origin: 12px 10.5px;
          }
          @keyframes glowDiya {
            0%, 100% { transform: scale(0.95); opacity: 0.25; }
            50% { transform: scale(1.1); opacity: 0.45; }
          }
          .diya-glow {
            animation: glowDiya 2s ease-in-out infinite;
            transform-origin: 12px 6.5px;
          }
        `}
      </style>
      {/* Flame Glow Aura */}
      <circle cx="12" cy="6.5" r="4.5" fill="#F5A742" className="diya-glow" filter="blur(1.5px)" />
      
      {/* Flame */}
      <path
        d="M12 1.5C10.5 4 10.5 6 12 8C13.5 6 13.5 4 12 1.5Z"
        fill="#F5A742"
        className="diya-flame"
      />
      {/* Saffron Lamp Base */}
      <path
        d="M3 13C3 17.5 7 21 12 21C17 21 21 17.5 21 13C21 13 19 12 12 12C5 12 3 13 3 13Z"
        fill="#D85A30"
      />
    </svg>
  );
}

export function PizzaComparison({ planId, price, cycle, size = "md" }: PizzaComparisonProps) {
  const { lang } = useTranslation();

  const isLg = size === "lg";

  // Dynamic configuration based on plan type for the left (Pizza/Dinner) side
  let leftIcon = <AnimatedPizzaIcon className={isLg ? "w-6.5 h-6.5" : "w-4.5 h-4.5"} />;
  let leftLabel = lang === "hindi" ? "रेगुलर पिज्जा" : "Regular Pizza";
  let leftPrice = "₹300+";

  if (planId === "grah") {
    leftIcon = <AnimatedPizzaIcon className={isLg ? "w-6.5 h-6.5" : "w-4.5 h-4.5"} />;
    leftLabel = lang === "hindi" ? "फैमिली पिज्जा" : "Family Pizza";
    leftPrice = "₹450+";
  } else if (planId === "varsh") {
    leftIcon = <AnimatedDinnerIcon className={isLg ? "w-6.5 h-6.5" : "w-4.5 h-4.5"} />;
    leftLabel = lang === "hindi" ? "फैमिली डिनर" : "Family Dinner";
    leftPrice = "₹5,000+";
  }

  const rightLabel = planId === "varsh" 
    ? (lang === "hindi" ? "पूरे साल का पुण्य" : "Full Year Punya")
    : (lang === "hindi" ? "पूरे महीने का पुण्य" : "Full Month Punya");

  // Format pricing cycle display to be compact
  const compactCycle = cycle.toLowerCase().includes("monthly") 
    ? "/Month" 
    : cycle.toLowerCase().includes("yearly") 
      ? "/Year" 
      : cycle;

  // Render a clean space-efficient vertical stack comparison inside plan cards (sizes sm/md)
  if (!isLg) {
    return (
      <div className="bg-[#FDF3EB] border border-[#F0DFC8] rounded-xl p-2.5 flex flex-col gap-1 w-full text-xs shadow-inner">
        {/* Row 1: Pizza / Dinner */}
        <div className="flex items-center gap-2">
          <div className="w-6.5 h-6.5 rounded-full bg-orange-100/80 flex items-center justify-center shrink-0 border border-orange-200">
            {leftIcon}
          </div>
          <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
            <span className="text-[9.5px] font-extrabold text-muted-foreground uppercase truncate">
              {leftLabel}
            </span>
            <span className="text-[11px] font-black text-[#5B1A1A] shrink-0">
              {leftPrice}
            </span>
          </div>
        </div>

        {/* Divider with VS */}
        <div className="relative flex items-center justify-center py-0.5">
          <div className="absolute inset-x-0 h-[1px] bg-[#F0DFC8]/60" />
          <span className="relative z-10 text-[8px] font-black text-[#D85A30] bg-[#FDF3EB] px-2.5 py-0.25 rounded-full border border-[#F0DFC8]/50 select-none uppercase tracking-wider">
            VS
          </span>
        </div>

        {/* Row 2: Punyata */}
        <div className="flex items-center gap-2">
          <div className="w-6.5 h-6.5 rounded-full bg-[#E85D1F]/10 flex items-center justify-center shrink-0 border border-[#E85D1F]/20">
            <AnimatedDiyaIcon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
            <span className="text-[9.5px] font-extrabold text-muted-foreground uppercase truncate">
              {rightLabel}
            </span>
            <span className="text-[11px] font-black text-[#D85A30] shrink-0 whitespace-nowrap">
              {price}{compactCycle}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Render side-by-side layout on large widths (Plan Detail Page) - perfectly centered VS
  return (
    <div className="bg-[#FDF3EB] border border-[#F0DFC8] rounded-xl p-4 shadow-inner flex items-center w-full overflow-hidden">
      {/* Left side: Pizza/Dinner (aligned start, takes 50% flex width) */}
      <div className="flex items-center gap-3 flex-1 min-w-0 justify-start">
        <div className="w-11 h-11 rounded-full bg-orange-100/80 flex items-center justify-center shrink-0 border border-orange-200">
          {leftIcon}
        </div>
        <div className="leading-tight">
          <div className="text-[10px] font-extrabold text-muted-foreground uppercase truncate">
            {leftLabel}
          </div>
          <div className="text-sm font-black text-[#5B1A1A] mt-0.5">
            {leftPrice}
          </div>
        </div>
      </div>

      {/* VS Divider (Exactly in the horizontal 50% center mark) */}
      <span className="text-[10px] font-black text-[#D85A30] bg-[#D85A30]/10 px-3.5 py-1 rounded-full border border-[#D85A30]/20 shrink-0 mx-4 select-none uppercase tracking-wider">
        VS
      </span>

      {/* Right side: Punyata (aligned end, takes 50% flex width) */}
      <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
        <div className="leading-tight text-right">
          <div className="text-[10px] font-extrabold text-muted-foreground uppercase truncate">
            {rightLabel}
          </div>
          <div className="text-sm font-black text-[#D85A30] mt-0.5 whitespace-nowrap">
            {price}{compactCycle}
          </div>
        </div>
        <div className="w-11 h-11 rounded-full bg-[#E85D1F]/10 flex items-center justify-center shrink-0 border border-[#E85D1F]/20">
          <AnimatedDiyaIcon className="w-6.5 h-6.5" />
        </div>
      </div>
    </div>
  );
}
