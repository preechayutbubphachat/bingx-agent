# D7.6 Canonical Current Price Propagation

## Why This Exists

D7.5 added `currentPriceConsistencyAudit` and exposed when different trend diagnostics were still reading different price contexts.

The runtime case that triggered D7.6 showed:

- Canonical current price from `market_snapshot.15m.close`
- Older journal/snapshot price still present in some trend consumers
- No active trend zone because the canonical regime was `VOLATILITY_COMPRESSION / NEUTRAL`
- Audit output used plain `UNKNOWN` for zone re-evaluation even though the reason was known

## Canonical Current Price Rule

Trend diagnostics should prefer the canonical current price context when it is available:

1. `mtfEntryCandidatePipeline.currentPriceContext.currentPrice`
2. Market snapshot current price context
3. `currentPriceEligibleExactSubset.currentPrice.value`
4. Missing current price

The older journal price remains visible as `snapshotPrice` so the audit can explain drift, but it should not be labeled as current truth for trend setup interpretation.

## Stale Current-Price Consumers

D7.6 keeps mismatch detection and adds `pricePropagationAudit`:

- `staleConsumerCount`
- `propagatedConsumerCount`
- `previousAnalysisPriceCount`
- `notes`

Mismatched prices are treated as previous analysis or snapshot context, not current price.

## No-Zone Semantics

When the current regime is not a trend regime, the audit now uses explicit statuses instead of plain `UNKNOWN`:

- `REGIME_NOT_TREND`
- `NO_ACTIVE_TREND_ZONE`
- `MISSING_ZONE_GEOMETRY`

For `price_inside_entry_zone_or_edge`, no active trend zone means:

- `currentPriceBasedValue=false`
- `impact=NO_CHANGE` when the previous value was already false
- `impact=PASS_TO_FAIL` when the previous value was true

This prevents a stale in-zone interpretation from being treated as current truth.

## Safety Model

D7.6 is diagnostics-only:

- `reviewOnly=true`
- `shadowOnly=true`
- `activationAllowed=false`
- `paperActivationAllowed=false`
- `liveActivationAllowed=false`
- `orderAllowed=false`

No order placement, approval, private exchange access, runtime file writes, or execution behavior changes are introduced.

## Next Phase Recommendation

Keep runtime collection focused on proving clean exact-zone candidates under a fresh trend regime. When the regime is neutral or volatility compression, the correct interpretation is no active trend entry zone, not a weak entry signal.
