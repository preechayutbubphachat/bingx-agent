import type { CafeAgent } from "@/lib/trading-cafe-hq/mockData";
import { getAgentVisualConfig } from "@/lib/trading-cafe-hq/agentVisualConfig";

const rowByStatus: Record<CafeAgent["status"], string> = {
  idle: "0%",
  working: "33.333%",
  alert: "66.666%",
  happy: "66.666%",
  stale: "0%",
  error: "100%",
};

export default function AgentSprite({
  agent,
  size = "station",
}: {
  agent: CafeAgent;
  size?: "station" | "compact" | "portrait";
}) {
  const visual = getAgentVisualConfig(agent.id);
  const sizeClass =
    size === "portrait"
      ? "h-32 w-32 xl:h-40 xl:w-40"
      : size === "compact"
        ? "h-20 w-20"
        : visual.scaleClass;

  return (
    <div
      className={`${sizeClass} cafe-agent-sprite shrink-0`}
      style={{
        backgroundImage: `url(${visual.spriteSrc})`,
        ["--cafe-sprite-row" as string]: rowByStatus[agent.status],
      }}
      aria-hidden="true"
    >
      <span className="sr-only">{agent.fallbackIcon}</span>
    </div>
  );
}
