// dashboard/app/agent-hq/page.tsx
// TradingAgentHQ route (THQ-3/4) — read-only visual mode.
// SAFETY: presentation only. No source-of-truth. No order/approval/live flags.
// THQ-4 renders the static prototype from MOCK_VIEW_MODEL.
// THQ-5 will replace MOCK_VIEW_MODEL with a public-safe adapter (no private/execution API).

import type { Metadata } from "next";
import TradingAgentHQPage from "@/components/trading-agent-hq/TradingAgentHQPage";
import { MOCK_VIEW_MODEL } from "@/lib/trading-agent-hq/mockState";

export const metadata: Metadata = {
  title: "TradingAgentHQ (prototype)",
};

export default function AgentHqRoute() {
  // THQ-5: server provides mock as initial; client hydrates from public-safe endpoints.
  // Do NOT fetch private/runtime data here.
  return (
    <main className="min-h-screen bg-[#faf6ee]">
      <TradingAgentHQPage initialVm={MOCK_VIEW_MODEL} />
    </main>
  );
}
