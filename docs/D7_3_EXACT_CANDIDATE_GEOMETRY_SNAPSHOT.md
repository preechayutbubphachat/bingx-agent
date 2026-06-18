# D7.3 Exact Candidate Geometry Snapshot

## Purpose

D7.3 adds read-only geometry observability for exact OB/FVG candidates so D7.2 can evaluate the current-price eligible exact subset without guessing.

The snapshot source is:

- `exactCandidateGeometrySnapshot.schemaVersion = 1`
- `exactCandidateGeometrySnapshot.source = EXACT_CANDIDATE_GEOMETRY_SNAPSHOT_V1`

## Source Path

The builder uses already-available runtime diagnostics:

- `smcMtfShadowSnapshot.exactZone.fillResolutionInput`
- `smcMtfShadowSnapshot.exactZone`
- current-price context from the same evidence cycle
- aggregate `exactZoneComparisonSummary` only to count missing geometry

If only aggregate exact evidence exists, D7.3 does not create fake candidates. It returns `candidates: []` and increments `summary.missingGeometryCount`.

## Candidate Geometry

Each structured candidate can carry:

- `id`
- `direction`
- `zoneType`
- `dataStatus`
- `readiness`
- `entry`, `entryLow`, `entryHigh`
- `stopLoss`, `invalidation`
- `target1`, `target2`
- `rawRR`, `netRR`, `requiredRR`
- `distanceToEntryPct`, `targetDistancePct`, `stopDistancePct`
- `costPct`, `feePct`, `slippagePct`
- `htfBias`
- `timeframeSource`
- `evidenceSource`
- `flags`
- `notes`

## D7.2 Consumption

D7.2 now prefers `exactCandidateGeometrySnapshot.candidates` before older candidate record paths. This lets the dashboard move from Case B to Case A when per-candidate geometry is actually present.

If geometry is missing, D7.2 remains honest:

- `status = GEOMETRY_INPUTS_MISSING`
- `currentPriceEligibleExactSamples = null`
- Thai UI states that the system will not guess geometry
- next action is to add `exactCandidateGeometrySnapshot` to the evidence log

## Safety Model

D7.3 is observability-only:

- `reviewOnly = true`
- `shadowOnly = true`
- `activationAllowed = false`
- `paperActivationAllowed = false`
- `liveActivationAllowed = false`
- `orderAllowed = false`

It does not change entry logic, runner behavior, broker behavior, runtime control, paper activation, Live activation, approval, or Order placement.
