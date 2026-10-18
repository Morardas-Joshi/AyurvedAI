import type Lenis from "lenis";

/**
 * Holds the single Lenis instance created in Home.tsx so any component
 * (navbar, footer, buttons) can trigger a buttery smooth scroll.
 */
let instance: Lenis | null = null;

export function setLenis(lenis: Lenis | null) {
  instance = lenis;
}

export function scrollToId(id: string, offset = 0) {
  const el = document.getElementById(id);
  if (!el) return;

  if (instance) {
    instance.scrollTo(el, { offset, duration: 1.5 });
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}