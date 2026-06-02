// dashboard/app/agent-hq/page.tsx
// TradingAgentHQ route: read-only UI shell.
// SAFETY: presentation only. No source-of-truth. No order/approval/live flags.
// This route hydrates only from public-safe endpoints inside the client shell.

import type { Metadata } from "next";
import TradingAgentHQPage from "@/components/trading-agent-hq/TradingAgentHQPage";
import { MOCK_VIEW_MODEL } from "@/lib/trading-agent-hq/mockState";

export const metadata: Metadata = {
  title: "TradingAgentHQ",
};

export default function AgentHqRoute() {
  return <TradingAgentHQPage initialVm={MOCK_VIEW_MODEL} />;
}
