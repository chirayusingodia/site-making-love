import { useEffect, useState } from "react";

type CountUpProps = {
  end: number;
  duration?: number;
  suffix?: string;
  className?: string;
};

export function CountUp({ end, duration = 2000, suffix = "", className = "" }: CountUpProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const startValue = 0;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Quad ease-out formula
      const easeProgress = progress * (2 - progress);
      setCount(Math.floor(easeProgress * (end - startValue) + startValue));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return <span className={className}>{count.toLocaleString()}{suffix}</span>;
}
