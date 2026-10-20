import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

type Tip = { tip: string; label: string; sources: { title: string; page?: number }[]; season: string };

export default function LifestyleTip({ userKey }: { userKey: string }) {
  const navigate = useNavigate();
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`${API_BASE}/api/lifestyle/tip`, { headers: { "X-User-Id": userKey } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Daily tip request failed (${response.status})`);
        return response.json() as Promise<Tip>;
      })
      .then((result) => { if (active) setTip(result); })
      .catch((cause: unknown) => { console.error("[LifestyleTip] Could not load today's tip:", cause); });
    return () => { active = false; };
  }, [userKey]);

  if (!tip) return null;
  return (
    <section className="mx-auto my-8 max-w-6xl px-5 sm:px-8" aria-label="Today's lifestyle tip">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-[#A9C97C]/20 bg-[#10251A] p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#A9C97C]">Today’s tip · {tip.season}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#D5DFC9]">{tip.tip}</p>
          <p className="mt-2 text-[10px] text-[#9FB08F]">{tip.sources[0]?.title ?? tip.label}{tip.sources[0]?.page ? `, page ${tip.sources[0].page}` : ""}</p>
        </div>
        <button type="button" onClick={() => navigate("/lifestyle")} className="shrink-0 rounded-xl border border-[#A9C97C]/35 px-4 py-2.5 text-sm font-semibold text-[#D5DFC9] hover:bg-[#8FAF5A]/10">Explore Diet &amp; Lifestyle</button>
      </div>
    </section>
  );
}
