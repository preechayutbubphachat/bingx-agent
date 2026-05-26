import fs from "fs";
import path from "path";

export type RouteProofPair = "source_build" | "source_runtime" | "build_runtime";

export type RouteMarkerProof = {
  marker: string;
  source_marker: string;
  build_marker: string;
  runtime_marker: string;
  runtime_marker_stamped: string;
  build_identity: string | null;
  source_build_match: boolean;
  source_runtime_match: boolean;
  build_runtime_match: boolean;
  all_match: boolean;
  mismatches: string[];
  mismatch_reasons: string[];
};

export type RouteMarkerPolicy = {
  marker: string;
  invariant: string;
  proof_pairs: RouteProofPair[];
  canonical_writer_policy: string;
  proof_observability: "payload_machine_readable";
  build_identity: string | null;
  runtime_marker_stamped: string;
  proof: RouteMarkerProof;
};

export type RouteRuntimeProof = {
  route_version: string;
  source_marker: string;
  build_marker: string;
  runtime_marker: string;
  runtime_marker_stamped: string;
  build_identity: string | null;
  marker_match: boolean;
  pairwise_matches: {
    source_build: boolean;
    source_runtime: boolean;
    build_runtime: boolean;
  };
  mismatches: string[];
  mismatch_reasons: string[];
  runtime_started_at: string;
  process_identity: string;
  proof_observability: "top_level_proof_block";
  route_policy: {
    reader_first: boolean;
    canonical_writer_policy: string;
    canonical_write_enabled: boolean;
  };
  plan_truth: {
    root_plan_owner: "plan";
    derived_plan_owner: "plan_status_state.plan";
    resolved_plan_source: string | null;
    canonical_root_plan_present: boolean;
    derived_state_plan_present: boolean;
  };
};

export type BuildRouteProofArgs = {
  marker: string;
  sourceMarker: string;
  buildMarker: string;
  runtimeMarker: string;
  runtimeMarkerStamped: string;
  buildIdentity?: string | null;
};

export type BuildRouteMarkerPolicyArgs = BuildRouteProofArgs & {
  invariant: string;
  proofPairs: RouteProofPair[];
  canonicalWriterPolicy: string;
};

export type BuildRouteRuntimeProofArgs = BuildRouteProofArgs & {
  runtimeStartedAt: string;
  processIdentity: string;
  canonicalWriterPolicy: string;
  canonicalWriteEnabled: boolean;
  resolvedPlanSource?: string | null;
  canonicalRootPlanPresent: boolean;
  derivedStatePlanPresent: boolean;
};

function normalizeBuildIdentity(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readBuildIdentityFromFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return normalizeBuildIdentity(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function candidateBuildIdentityPaths(): string[] {
  const cwd = process.cwd();

  return [
    path.resolve(cwd, ".next", "BUILD_ID"),
    path.resolve(cwd, "dashboard", ".next", "BUILD_ID"),
  ];
}

export function resolveRouteBuildIdentity(env?: Record<string, string | undefined>): string | null {
  for (const filePath of candidateBuildIdentityPaths()) {
    const fromFile = readBuildIdentityFromFile(filePath);
    if (fromFile) return fromFile;
  }

  return normalizeBuildIdentity(
    env?.NEXT_BUILD_ID ??
      env?.VERCEL_GIT_COMMIT_SHA ??
      env?.VERCEL_DEPLOYMENT_ID ??
      env?.RAILWAY_DEPLOYMENT_ID ??
      null
  );
}

export function buildRouteProof(args: BuildRouteProofArgs): RouteMarkerProof {
  const source_build_match = args.sourceMarker === args.buildMarker;
  const source_runtime_match = args.sourceMarker === args.runtimeMarker;
  const build_runtime_match = args.buildMarker === args.runtimeMarker;

  const mismatches: string[] = [];
  if (!source_build_match) mismatches.push("source_build_mismatch");
  if (!source_runtime_match) mismatches.push("source_runtime_mismatch");
  if (!build_runtime_match) mismatches.push("build_runtime_mismatch");

  return {
    marker: args.marker,
    source_marker: args.sourceMarker,
    build_marker: args.buildMarker,
    runtime_marker: args.runtimeMarker,
    runtime_marker_stamped: args.runtimeMarkerStamped,
    build_identity: args.buildIdentity ?? null,
    source_build_match,
    source_runtime_match,
    build_runtime_match,
    all_match: mismatches.length === 0,
    mismatches,
    mismatch_reasons: [...mismatches],
  };
}

export function buildRouteMarkerPolicy(args: BuildRouteMarkerPolicyArgs): RouteMarkerPolicy {
  const proof = buildRouteProof(args);

  return {
    marker: args.marker,
    invariant: args.invariant,
    proof_pairs: [...args.proofPairs],
    canonical_writer_policy: args.canonicalWriterPolicy,
    proof_observability: "payload_machine_readable",
    build_identity: args.buildIdentity ?? null,
    runtime_marker_stamped: args.runtimeMarkerStamped,
    proof,
  };
}

export function buildRouteRuntimeProof(args: BuildRouteRuntimeProofArgs): RouteRuntimeProof {
  const proof = buildRouteProof(args);

  return {
    route_version: args.marker,
    source_marker: proof.source_marker,
    build_marker: proof.build_marker,
    runtime_marker: proof.runtime_marker,
    runtime_marker_stamped: proof.runtime_marker_stamped,
    build_identity: proof.build_identity,
    marker_match: proof.all_match,
    pairwise_matches: {
      source_build: proof.source_build_match,
      source_runtime: proof.source_runtime_match,
      build_runtime: proof.build_runtime_match,
    },
    mismatches: [...proof.mismatches],
    mismatch_reasons: [...proof.mismatch_reasons],
    runtime_started_at: args.runtimeStartedAt,
    process_identity: args.processIdentity,
    proof_observability: "top_level_proof_block",
    route_policy: {
      reader_first: true,
      canonical_writer_policy: args.canonicalWriterPolicy,
      canonical_write_enabled: args.canonicalWriteEnabled,
    },
    plan_truth: {
      root_plan_owner: "plan",
      derived_plan_owner: "plan_status_state.plan",
      resolved_plan_source: args.resolvedPlanSource ?? null,
      canonical_root_plan_present: args.canonicalRootPlanPresent,
      derived_state_plan_present: args.derivedStatePlanPresent,
    },
  };
}
