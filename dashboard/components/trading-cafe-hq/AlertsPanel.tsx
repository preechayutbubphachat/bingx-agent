import type { CafeAlert } from "@/lib/trading-cafe-hq/mockData";
import PanelShell from "./PanelShell";

const severityIcon: Record<CafeAlert["severity"], string> = {
  success: "🟢",
  warning: "⚠️",
  danger: "🔴",
  info: "🔵",
};

export default function AlertsPanel({ alerts, emptyCopy }: { alerts: CafeAlert[]; emptyCopy: string }) {
  const sorted = [...alerts].sort((a, b) => {
    const order = { danger: 0, warning: 1, info: 2, success: 3 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <PanelShell title="Alerts" icon="🔔" actionLabel="View All Alerts">
      {sorted.length ? (
        <ul>
          {sorted.map((alert) => (
            <li key={alert.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 border-b border-[#ead7b8] py-2 text-xs last:border-0">
              <span>{severityIcon[alert.severity]}</span>
              <span className="truncate font-bold text-[#3f2f22]">{alert.title}</span>
              <span className="text-[10px] font-bold text-[#8a735d]">{alert.timestamp}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl bg-[#fff1d6] p-3 text-xs font-bold text-[#7a5532]">{emptyCopy}</div>
      )}
    </PanelShell>
  );
}
