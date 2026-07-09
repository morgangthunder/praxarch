export const DEFAULT_STAGING_BRANCH = "staging";
export const DEFAULT_PRODUCTION_BRANCH = "master";

/** Resolve per-environment git branches; legacy `branch` sets both when specifics are omitted. */
export function resolveEnvironmentBranches(input: {
  branch?: string;
  stagingBranch?: string;
  productionBranch?: string;
}): { staging: string; production: string } {
  const legacy = input.branch?.trim();
  return {
    staging: input.stagingBranch?.trim() || legacy || DEFAULT_STAGING_BRANCH,
    production: input.productionBranch?.trim() || legacy || DEFAULT_PRODUCTION_BRANCH,
  };
}
