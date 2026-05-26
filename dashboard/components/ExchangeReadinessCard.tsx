"use client";

/**
 * dashboard/components/ExchangeReadinessCard.tsx
 * Phase M-0 — Shadow Live / Read-only Exchange Sync Readiness
 *
 * แสดงสถานะ Phase M-0 readiness — no exchange API calls, no order placement
 * default: WAITING_FOR_OPERATOR_APPROVAL / SHADOW_SYNC_DISABLED
 */

import { useEffect, useState } from "react";

type PermissionCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  note?: string;
};

type ExchangeReadinessData = {
  ok: boolean;
  readOnly: boolean;
  status: string;
  shadowLiveEnabled: boolean;
  exchangeReadOnlySyncEnabled: boolean;
  manualApprovalRequired: boolean;
  manualApprovalStatus: string;
  hasReadonlyApiKey: boolean;
  hasReadonlySecret: boolean;
  permissionChecklist: PermissionCheckItem[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  checkedAt: string;
  noExchangeApiCalls?: boolean;
  noOrderPlacement?: boolean;
  phase?: string;
  error?: string;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  SHADOW_SYNC_DISABLED: {
    label: "Shadow Sync: Disabled",
    color: "text-gray-700",
    bg: "bg-gray-50",
    border: "border-gray-300",
  },
  WAITING_FOR_OPERATOR_APPROVAL: {
    label: "รอ Operator Approval",
    color: "text-amber-800",
    bg: "bg-amber-50",
    border: "border-amber-300",
  },
  READY_FOR_READONLY_SETUP: {
    label: "Ready for Read-only Setup",
    color: "text-blue-800",
    bg: "bg-blue-50",
    border: "border-blue-300",
  },
  BLOCKED: {
    label: "BLOCKED",
    color: "text-red-800",
    bg: "bg-red-50",
    border: "border-red-400",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    color: "text-gray-700",
    bg: "bg-gray-100",
    border: "border-gray-300",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${cfg.color} ${cfg.bg} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

function FlagBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono border ${
        enabled
          ? "bg-orange-100 border-orange-300 text-orange-800"
          : "bg-green-50 border-green-300 text-green-800"
      }`}
    >
      {label}: {enabled ? "true ⚠️" : "false ✅"}
    </span>
  );
}

function ChecklistRow({ item }: { item: PermissionCheckItem }) {
  return (
    <li className="flex items-start gap-2 text-xs py-0.5">
      <span className={item.passed ? "text-green-600" : "text-gray-400"}>
        {item.passed ? "✅" : "☐"}
      </span>
      <span className={item.passed ? "text-gray-800" : "text-gray-500"}>
        {item.label}
        {item.note && !item.passed && (
          <span className="block text-gray-400 text-xs mt-0.5">{item.note}</span>
        )}
      </span>
    </li>
  );
}

export default function ExchangeReadinessCard() {
  const [data, setData] = useState<ExchangeReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/exchange-readiness", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setFetchError(null);
        }
      } catch (e) {
        if (!cancelled)
          setFetchError(
            e instanceof Error ? e.message : "Failed to load exchange readiness"
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-gray-800 tracking-wide uppercase">
            🔌 Shadow Live / Read-only Exchange Sync
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Phase M-0 Readiness</p>
        </div>
        <span className="text-xs text-gray-400 font-mono bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
          NO EXCHANGE API CALLS
        </span>
      </div>

      {/* Safety Banner */}
      <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 space-y-0.5">
        <div className="font-semibold">Phase M-0 = Planning & Readiness Only</div>
        <div>ยังไม่มี network calls ไป BingX — ยังไม่มี order ใดๆ — ต้องมี operator approval ก่อน</div>
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-xs text-gray-400 animate-pulse">กำลังโหลด readiness status…</div>
      )}
      {fetchError && !loading && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          ⚠️ ไม่สามารถโหลด exchange readiness: {fetchError}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Status */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-600 font-medium">Status:</span>
            <StatusBadge status={data.status} />
          </div>

          {/* Safety Flags */}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-600">Safety Flags</div>
            <div className="flex flex-wrap gap-2">
              <FlagBadge enabled={false} label="LIVE_TRADING" />
              <FlagBadge enabled={false} label="ORDER_PLACEMENT" />
              <FlagBadge
                enabled={data.shadowLiveEnabled}
                label="SHADOW_LIVE"
              />
              <FlagBadge
                enabled={data.exchangeReadOnlySyncEnabled}
                label="READONLY_SYNC"
              />
            </div>
          </div>

          {/* Approval */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-medium">
              Manual Approval:
            </span>
            <span
              className={`text-xs font-bold ${
                data.manualApprovalStatus === "approved"
                  ? "text-green-700"
                  : "text-amber-700"
              }`}
            >
              {data.manualApprovalStatus === "approved"
                ? "✅ Approved"
                : "⏳ Required — not yet approved"}
            </span>
          </div>

          {/* API Keys (boolean only) */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-600">
            <span>
              Read-only API Key:{" "}
              <span
                className={
                  data.hasReadonlyApiKey ? "text-green-700 font-bold" : "text-gray-400"
                }
              >
                {data.hasReadonlyApiKey ? "✅ Set" : "☐ Not set"}
              </span>
            </span>
            <span>
              Read-only Secret:{" "}
              <span
                className={
                  data.hasReadonlySecret ? "text-green-700 font-bold" : "text-gray-400"
                }
              >
                {data.hasReadonlySecret ? "✅ Set" : "☐ Not set"}
              </span>
            </span>
          </div>

          {/* Blockers */}
          {data.blockers.length > 0 && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 space-y-1">
              <div className="text-xs font-semibold text-red-700">
                ❌ Blockers ({data.blockers.length})
              </div>
              <ul className="space-y-0.5">
                {data.blockers.map((b, i) => (
                  <li key={i} className="text-xs text-red-700">
                    • {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {data.warnings.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
              <div className="text-xs font-semibold text-amber-700">
                ⚠️ Warnings ({data.warnings.length})
              </div>
              <ul className="space-y-0.5">
                {data.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">
                    • {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Permission Checklist */}
          {data.permissionChecklist.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-600">
                Read-only API Permission Checklist
              </div>
              <ul className="space-y-0.5 pl-1">
                {data.permissionChecklist.map((item) => (
                  <ChecklistRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          )}

          {/* Next Actions */}
          {data.nextActions.length > 0 && (
            <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 space-y-1">
              <div className="text-xs font-semibold text-gray-600">
                Next Actions
              </div>
              <ul className="space-y-0.5">
                {data.nextActions.map((a, i) => (
                  <li key={i} className="text-xs text-gray-600">
                    → {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
            <span>
              Checked: {new Date(data.checkedAt).toLocaleString("th-TH")}
            </span>
            <span className="font-mono">
              Phase {data.phase ?? "M-0"} · READ-ONLY
            </span>
          </div>

          {data.error && (
            <div className="text-xs text-red-500 font-mono">
              Error: {data.error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
