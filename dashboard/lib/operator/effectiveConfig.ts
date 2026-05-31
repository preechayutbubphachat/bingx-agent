import {
  getDefaultLimitedCaps,
  type TradingModeCaps,
} from "../execution/tradingModeGate";
import { getDefaultRiskCaps } from "../riskEngine";
import { buildKillSwitchResponse, readKillSwitchState } from "./killSwitch";

const EXECUTION_RUNNER_ORDER_TYPE_WHITELIST = [
  "MARKET",
  "LIMIT",
  "STOP_MARKET",
  "TAKE_PROFIT_MARKET",
] as const;

export const EFFECTIVE_CONFIG_STATUS_SCHEMA_VERSION =
  "effective_config_status_v1" as const;

export function buildExecutionRunnerFixtureCaps(symbol: string): TradingModeCaps {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase() || "BTC-USDT";
  return {
    maxConcurrentPositions: 1,
    maxOpenIntentCount: 4,
    maxOrderNotional: 2000,
    maxTotalNotional: 3000,
    symbolWhitelist: [normalizedSymbol],
    orderTypeWhitelist: [...EXECUTION_RUNNER_ORDER_TYPE_WHITELIST],
  };
}

export function getExecutionRunnerFixtureCapsTemplate() {
  return {
    maxConcurrentPositions: 1,
    maxOpenIntentCount: 4,
    maxOrderNotional: 2000,
    maxTotalNotional: 3000,
    symbolWhitelistMode: "fixture_symbol_only" as const,
    orderTypeWhitelist: [...EXECUTION_RUNNER_ORDER_TYPE_WHITELIST],
  };
}

export async function buildEffectiveConfigStatus() {
  const killSwitchSnapshot = await readKillSwitchState();

  return {
    schema_version: EFFECTIVE_CONFIG_STATUS_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    effective_config: {
      live_limited_gate: {
        source: "code_default" as const,
        mutability: "code_controlled" as const,
        caps: getDefaultLimitedCaps(),
      },
      risk_engine: {
        source: "code_default" as const,
        mutability: "code_controlled" as const,
        caps: getDefaultRiskCaps(),
      },
      execution_runner_fixture: {
        source: "smoke_fixture_only" as const,
        mutability: "test_only" as const,
        caps_template: getExecutionRunnerFixtureCapsTemplate(),
      },
      operator_controls: {
        kill_switch: buildKillSwitchResponse(killSwitchSnapshot, {
          source: "operator_runtime_state",
        }),
      },
    },
    review_boundary: {
      mutable_controls: ["kill_switch"],
      code_controlled_controls: [
        "live_limited_gate_caps",
        "risk_engine_caps",
        "symbol_whitelist_defaults",
        "order_type_whitelist_defaults",
      ],
      notes: [
        "execution_runner_fixture is qualification-only and not the operative production envelope",
        "no mutable cap or whitelist surface is signed off in the current baseline",
      ],
    },
  };
}
