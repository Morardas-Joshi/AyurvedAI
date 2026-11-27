import { useEffect, useRef, useState } from "react";

import { chartColors as PALETTE, type ChartTheme } from "./palette";

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** Rectangle with rounded top corners and a square base, so the bar stays anchored to the baseline. */
function topRounded(x: number, y: number, width: number, height: number, radius: number) {
  if (height <= 0) return "";
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

/** Rounds the axis maximum up to an even step so the middle gridline is a whole number. */
function niceMax(value: number) {
  if (value <= 4) return 4;
  const step = value <= 20 ? 2 : value <= 100 ? 10 : 2 * 10 ** (Math.floor(Math.log10(value)) - 1) * 5;
  return Math.ceil(value / step) * step;
}

export function Legend({ items, theme = "screen" }: { items: { label: string; color: string; value?: number | string }[]; theme?: ChartTheme }) {
  const colors = PALETTE[theme];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2 text-xs" style={{ color: colors.text }}>
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
          {item.value !== undefined && <span style={{ color: colors.strong }}>{item.value}</span>}
        </span>
      ))}
    </div>
  );
}

type DailyPoint = { date: string; success: number; failed: number };

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function DailyLoginChart({ data, theme = "screen", height = 220 }: { data: DailyPoint[]; theme?: ChartTheme; height?: number }) {
  const colors = PALETTE[theme];
  const { ref, width } = useWidth(theme === "print" ? 680 : 640);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const padding = { top: 12, right: 8, bottom: 26, left: 30 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(1, ...data.map((point) => point.success + point.failed)));
  const slot = innerWidth / Math.max(1, data.length);
  const barWidth = Math.max(4, Math.min(18, slot * 0.62));
  const y = (value: number) => padding.top + innerHeight - (value / max) * innerHeight;
  const ticks = [0, max / 2, max];
  const labelEvery = data.length > 20 ? 5 : data.length > 10 ? 2 : 1;
  const totals = data.reduce((acc, point) => ({ success: acc.success + point.success, failed: acc.failed + point.failed }), { success: 0, failed: 0 });
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Legend
          theme={theme}
          items={[
            { label: "Successful", color: colors.primary, value: totals.success },
            { label: "Failed", color: colors.secondary, value: totals.failed },
          ]}
        />
        {theme === "screen" && (
          <button type="button" onClick={() => setShowTable((value) => !value)} className="text-xs text-[#8FAF5A] underline-offset-2 hover:underline">
            {showTable ? "Show chart" : "Show as table"}
          </button>
        )}
      </div>
      {showTable ? (
        <div className="max-h-[240px] overflow-y-auto rounded-xl border border-white/10">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#71806C]">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">Successful</th>
                <th className="px-3 py-2 text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date} className="border-t border-white/5 text-[#A6B399]">
                  <td className="px-3 py-1.5">{shortDate(point.date)}</td>
                  <td className="px-3 py-1.5 text-right">{point.success}</td>
                  <td className="px-3 py-1.5 text-right">{point.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={height} role="img" aria-label={`Login attempts per day: ${totals.success} successful and ${totals.failed} failed over ${data.length} days`}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} stroke={colors.grid} strokeWidth={1} />
                <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={10} fill={colors.axis}>
                  {Math.round(tick)}
                </text>
              </g>
            ))}
            {data.map((point, index) => {
              const x = padding.left + slot * index + (slot - barWidth) / 2;
              const successTop = y(point.success);
              const successHeight = padding.top + innerHeight - successTop;
              const gap = point.success > 0 && point.failed > 0 ? 2 : 0;
              const failedHeight = (point.failed / max) * innerHeight;
              const failedTop = successTop - gap - failedHeight;
              const dim = hover !== null && hover !== index;
              return (
                <g key={point.date} opacity={dim ? 0.45 : 1}>
                  {point.success > 0 && (
                    <path d={point.failed > 0 ? `M${x},${successTop} H${x + barWidth} V${successTop + successHeight} H${x} Z` : topRounded(x, successTop, barWidth, successHeight, 4)} fill={colors.primary} />
                  )}
                  {point.failed > 0 && <path d={topRounded(x, failedTop, barWidth, failedHeight, 4)} fill={colors.secondary} />}
                  {index % labelEvery === 0 && (
                    <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize={10} fill={colors.axis}>
                      {shortDate(point.date)}
                    </text>
                  )}
                  {theme === "screen" && (
                    <rect x={padding.left + slot * index} y={padding.top} width={slot} height={innerHeight} fill="transparent" onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)} />
                  )}
                </g>
              );
            })}
          </svg>
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-white/10 px-3 py-2 text-xs shadow-xl"
              style={{
                background: "rgba(12,26,18,0.96)",
                left: Math.min(Math.max(padding.left + slot * hover + slot / 2 - 70, 0), width - 140),
                top: 0,
                width: 140,
              }}
            >
              <p className="mb-1 font-medium text-[#EAF2DD]">{shortDate(hovered.date)}</p>
              <p className="flex items-center justify-between text-[#A6B399]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: colors.primary }} />Successful</span>
                <span className="text-[#EAF2DD]">{hovered.success}</span>
              </p>
              <p className="flex items-center justify-between text-[#A6B399]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: colors.secondary }} />Failed</span>
                <span className="text-[#EAF2DD]">{hovered.failed}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ColumnChart({ data, theme = "screen", height = 200, label }: { data: { label: string; count: number }[]; theme?: ChartTheme; height?: number; label: string }) {
  const colors = PALETTE[theme];
  const { ref, width } = useWidth(theme === "print" ? 680 : 420);
  const [hover, setHover] = useState<number | null>(null);
  const padding = { top: 18, right: 8, bottom: 26, left: 8 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.map((item) => item.count));
  const slot = innerWidth / Math.max(1, data.length);
  const barWidth = Math.min(44, slot * 0.56);

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={`${label}: ${data.map((item) => `${item.label} ${item.count}`).join(", ")}`}>
        <line x1={padding.left} x2={width - padding.right} y1={padding.top + innerHeight} y2={padding.top + innerHeight} stroke={colors.grid} />
        {data.map((item, index) => {
          const x = padding.left + slot * index + (slot - barWidth) / 2;
          const barHeight = (item.count / max) * innerHeight;
          const top = padding.top + innerHeight - barHeight;
          return (
            <g key={item.label} opacity={hover !== null && hover !== index ? 0.5 : 1}>
              {item.count > 0 ? (
                <path d={topRounded(x, top, barWidth, barHeight, 4)} fill={colors.primary} />
              ) : (
                <rect x={x} y={padding.top + innerHeight - 2} width={barWidth} height={2} fill={colors.track} />
              )}
              <text x={x + barWidth / 2} y={top - 5} textAnchor="middle" fontSize={11} fill={colors.strong}>
                {item.count}
              </text>
              <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize={10} fill={colors.axis}>
                {item.label}
              </text>
              {theme === "screen" && <rect x={padding.left + slot * index} y={0} width={slot} height={height} fill="transparent" onMouseEnter={() => setHover(index)} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Horizontal bar list rendered with plain HTML so it prints cleanly and stays readable at any width. */
export function BarList({ items, theme = "screen", emptyText = "No data yet.", color }: { items: { label: string; count: number }[]; theme?: ChartTheme; emptyText?: string; color?: string }) {
  const colors = PALETTE[theme];
  const max = Math.max(1, ...items.map((item) => item.count));
  if (!items.length) return <p className="text-sm" style={{ color: colors.axis }}>{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate capitalize" style={{ color: colors.text }}>{item.label}</span>
            <span className="font-medium" style={{ color: colors.strong }}>{item.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: colors.track }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (item.count / max) * 100)}%`, background: color ?? colors.primary }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

