import type { CafeDecision } from "@/lib/trading-cafe-hq/mockData";
import PanelShell from "./PanelShell";

const statusIcon: Record<CafeDecision["status"], string> = {
  accepted: "✅",
  watching: "👁️",
  blocked: "⛔",
};

export default function DecisionLogPanel({ decisions, emptyCopy }: { decisions: CafeDecision[]; emptyCopy: string }) {
  return (
    <PanelShell title="Decision Log" icon="🧾" actionLabel="Open Decision Log">
      {decisions.length ? (
        <ul>
          {decisions.map((decision) => (
            <li key={decision.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 border-b border-[#ead7b8] py-2 text-xs last:border-0">
              <span className="font-bold tabular-nums text-[#8a735d]">{decision.time}</span>
              <span className="truncate font-bold text-[#3f2f22]">{decision.summary}</span>
              <span>{statusIcon[decision.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl bg-[#fff1d6] p-3 text-xs font-bold text-[#7a5532]">{emptyCopy}</div>
      )}
    </PanelShell>
  );
}
