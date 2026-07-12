import { useRef, useEffect, useState } from "react";
import Lottie from "lottie-react";
import { useInView } from "framer-motion";

const LottieComponent = (Lottie as any).default || Lottie;

interface LottieIconProps {
  animationData: any;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  playOnView?: boolean;
  delay?: number;
  className?: string;
  lottieRef?: any;
  [key: string]: any;
}

export function LottieIcon({
  animationData,
  size = 64,
  loop = true,
  autoplay = true,
  playOnView = false,
  delay = 0,
  className = "",
  lottieRef: externalLottieRef,
  fallback,
  ...props
}: LottieIconProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const localLottieRef = useRef<any>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });
  const [hasPlayed, setHasPlayed] = useState(false);

  // Check if the animation JSON is an empty placeholder (no layers or assets)
  const isPlaceholder =
    !animationData ||
    !animationData.layers ||
    animationData.layers.length === 0;

  // Assign internal or external reference
  const activeLottieRef = externalLottieRef || localLottieRef;

  useEffect(() => {
    if (!isPlaceholder && playOnView && isInView && activeLottieRef.current && !hasPlayed) {
      const timer = setTimeout(() => {
        activeLottieRef.current.play();
        setHasPlayed(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isInView, playOnView, hasPlayed, delay, activeLottieRef, isPlaceholder]);

  // Scaling down by 20% on small screens (max-width: 640px)
  const mobileSize = Math.round(size * 0.8);

  if (isPlaceholder && fallback) {
    return (
      <div
        ref={containerRef}
        style={{
          width: "var(--lottie-size)",
          height: "var(--lottie-size)",
          "--lottie-size": `${mobileSize}px`,
        } as React.CSSProperties}
        className={`inline-flex items-center justify-center sm:[--lottie-size:${size}px] ${className}`}
      >
        {fallback}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: "var(--lottie-size)",
        height: "var(--lottie-size)",
        "--lottie-size": `${mobileSize}px`,
      } as React.CSSProperties}
      className={`inline-block sm:[--lottie-size:${size}px] ${className}`}
    >
      <LottieComponent
        lottieRef={activeLottieRef}
        animationData={animationData}
        loop={playOnView ? false : loop}
        autoplay={playOnView ? false : autoplay}
        style={{ width: "100%", height: "100%" }}
        {...props}
      />
    </div>
  );
}
