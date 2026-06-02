// dashboard/app/agent-hq/page.tsx
// Trading Caffee HQ route — static mock-only UI shell.
// SAFETY: presentation only. No source-of-truth. No order/approval/live flags.
// This route does not fetch runtime/trading data in this phase.

import type { Metadata } from "next";
import TradingCafeHQPage from "@/components/trading-cafe-hq/TradingCafeHQPage";
import { TRADING_CAFE_HQ_MOCK } from "@/lib/trading-cafe-hq/mockData";

export const metadata: Metadata = {
  title: "Trading Caffee HQ (static prototype)",
};

export default function AgentHqRoute() {
  return (
    <TradingCafeHQPage data={TRADING_CAFE_HQ_MOCK} />
  );
}
