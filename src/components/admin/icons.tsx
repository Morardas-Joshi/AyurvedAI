import React from "react";

// ------------------------------------------------------------------ icons

type IconProps = { size?: number };

function svg({ size = 18, strokeWidth = 1.8 }: IconProps & { strokeWidth?: number }, children: React.ReactNode) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icons = {
  Dashboard: (p: IconProps) => (
    svg({ ...p }, <><path d="M3 13h8V3H3v10Z" /><path d="M13 21h8v-8h-8v8Z" /><path d="M13 3h8v6h-8V3Z" /><path d="M3 17h8v4H3v-4Z" /></>)
  ),
  Report: (p: IconProps) => (
    svg({ ...p }, <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /><path d="M9 17v-3" /><path d="M12 17v-6" /><path d="M15 17v-2" /></>)
  ),
  Users: (p: IconProps) => (
    svg({ ...p }, <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>)
  ),
  History: (p: IconProps) => (
    svg({ ...p }, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>)
  ),
  Documents: (p: IconProps) => (
    svg({ ...p }, <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></>)
  ),
  Leaf: (p: IconProps) => (
    svg({ ...p }, <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" /></>)
  ),
  Medicine: (p: IconProps) => (
    svg({ ...p }, <><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></>)
  ),
  Sun: (p: IconProps) => (
    svg({ ...p }, <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>)
  ),
  MapPin: (p: IconProps) => (
    svg({ ...p }, <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>)
  ),
  Shield: (p: IconProps) => (
    svg({ ...p }, <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="M12 8v4" /><path d="M12 16h.01" /></>)
  ),
  Pulse: (p: IconProps) => (
    svg({ ...p }, <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>)
  ),
  Logout: (p: IconProps) => (
    svg({ ...p }, <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>)
  ),
  Trash: (p: IconProps) => (
    svg({ size: 15, ...p }, <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 15H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>)
  ),
  Edit: (p: IconProps) => (
    svg({ size: 15, ...p }, <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></>)
  ),
  Plus: (p: IconProps) => (
    svg({ size: 16, ...p }, <><path d="M12 5v14" /><path d="M5 12h14" /></>)
  ),
  Check: (p: IconProps) => (
    svg({ size: 15, strokeWidth: 2.2, ...p }, <><path d="M20 6 9 17l-5-5" /></>)
  ),
  X: (p: IconProps) => (
    svg({ size: 15, strokeWidth: 2.2, ...p }, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>)
  ),
  Alert: (p: IconProps) => (
    svg({ size: 15, strokeWidth: 2, ...p }, <><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>)
  ),
  Download: (p: IconProps) => (
    svg({ size: 16, ...p }, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>)
  ),
  Upload: (p: IconProps) => (
    svg({ size: 16, ...p }, <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>)
  ),
  Printer: (p: IconProps) => (
    svg({ size: 16, ...p }, <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>)
  ),
  Refresh: (p: IconProps) => (
    svg({ size: 16, ...p }, <><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></>)
  ),
  Key: (p: IconProps) => (
    svg({ size: 15, ...p }, <><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>)
  ),
  ChevronLeft: (p: IconProps) => (
    svg({ size: 16, ...p }, <><path d="m15 18-6-6 6-6" /></>)
  ),
  ChevronRight: (p: IconProps) => (
    svg({ size: 16, ...p }, <><path d="m9 18 6-6-6-6" /></>)
  ),
  Globe: (p: IconProps) => (
    svg({ size: 16, ...p }, <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></>)
  ),
  Search: (p: IconProps) => (
    svg({ size: 16, ...p }, <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>)
  ),
};
