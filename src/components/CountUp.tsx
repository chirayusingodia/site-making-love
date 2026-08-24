import { useEffect, useRef } from "react";
import { useMotionValue, animate, useInView } from "framer-motion";

interface CountUpProps {
  value: number;
  suffix?: string;
  className?: string;
}

export function CountUp({ value, suffix = "+", className = "" }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  useEffect(() => {
    if (isInView) {
      const controls = animate(motionValue, value, {
        duration: 1.5,
        ease: "easeOut",
        onUpdate: (latest) => {
          // [Bug 3.7] en-IN grouping, matching every other numeric
          // display in the app (lakh/crore) regardless of browser locale.
          if (ref.current) {
            ref.current.textContent = Math.round(latest).toLocaleString("en-IN");
          }
        },
      });
      return () => controls.stop();
    }
  }, [isInView, motionValue, value]);

  return (
    <span className={`inline-flex items-center ${className}`}>
      <span ref={ref}>0</span>
      {suffix}
    </span>
  );
}
