import { useRef, type MouseEvent, type ReactNode } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";

/** Shared easing – a soft, expensive-feeling "expo out". */
export const EASE = [0.22, 1, 0.36, 1] as const;

/* -------------------------------------------------------------------------- */
/*  Reveal – scroll-triggered entrance                                        */
/* -------------------------------------------------------------------------- */

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  x?: number;
};

export function Reveal({
  children,
  className = "",
  delay = 0,
  y = 32,
  x = 0,
}: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  LineReveal – headline lines that rise out of a mask                       */
/* -------------------------------------------------------------------------- */

type LineRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** true = animate on mount (hero), false = animate when scrolled into view */
  onMount?: boolean;
};

export function LineReveal({
  children,
  className = "",
  delay = 0,
  onMount = false,
}: LineRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Observe the *mask* (not the moving text) – text that is translated out of
  // an overflow-hidden parent would otherwise never count as "visible".
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const show = onMount || inView;

  return (
    <span ref={ref} className="block overflow-hidden pb-[0.14em] -mb-[0.14em]">
      <motion.span
        className={`block ${className}`}
        initial={{ y: "115%" }}
        animate={{ y: show ? "0%" : "115%" }}
        transition={{ duration: 1.05, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  TiltCard – 3D tilt + cursor spotlight                                     */
/* -------------------------------------------------------------------------- */

type TiltCardProps = {
  children: ReactNode;
  /** goes on the outer wrapper – use it for grid placement (col-span etc.) */
  className?: string;
  /** goes on the tilting surface – background, border, radius, padding */
  cardClassName?: string;
  intensity?: number;
  glow?: string;
};

export function TiltCard({
  children,
  className = "",
  cardClassName = "",
  intensity = 5,
  glow = "rgba(227,168,43,0.16)",
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const springX = useSpring(rx, { stiffness: 170, damping: 18, mass: 0.6 });
  const springY = useSpring(ry, { stiffness: 170, damping: 18, mass: 0.6 });

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);

    if (!reduce) {
      ry.set((px - 0.5) * intensity * 2);
      rx.set(-(py - 0.5) * intensity * 2);
    }
  };

  const handleLeave = () => {
    rx.set(0);
    ry.set(0);
  };

  return (
    <div className={className} style={{ perspective: 1200 }}>
      <motion.div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ rotateX: springX, rotateY: springY }}
        className={`group relative h-full overflow-hidden ${cardClassName}`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background: `radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), ${glow}, transparent 45%)`,
          }}
        />
        <div className="relative z-10 flex h-full flex-col">{children}</div>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Magnetic – element gently follows the cursor                              */
/* -------------------------------------------------------------------------- */

export function Magnetic({
  children,
  className = "",
  strength = 0.28,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 });

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Marquee – endless ticker                                                  */
/* -------------------------------------------------------------------------- */

export function Marquee({
  items,
  className = "",
  speed = 46,
}: {
  items: string[];
  className?: string;
  speed?: number;
}) {
  const list = [...items, ...items];

  return (
    <div className={`relative flex overflow-hidden ${className}`}>
      <div
        className="flex w-max items-center"
        style={{ animation: `marquee ${speed}s linear infinite` }}
      >
        {list.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center whitespace-nowrap px-5">
            <span>{item}</span>
            <span className="ml-10 text-[#E3A82B]">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}