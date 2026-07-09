/** Markers: repo file present but missing in the running app container → likely stale pre-built image. */
export interface ComposeSourceMarker {
  repoPath: string;
  containerPath: string;
  label: string;
}

export const DEFAULT_SOURCE_MARKERS: ComposeSourceMarker[] = [
  {
    repoPath: "Back-end/routes/onboardingAgent.routes.js",
    containerPath: "/app/routes/onboardingAgent.routes.js",
    label: "onboarding agent API",
  },
  {
    repoPath: "Back-end/services/llm/provider-factory.js",
    containerPath: "/app/services/llm/provider-factory.js",
    label: "LLM provider factory",
  },
];

export interface ComposeImageAudit {
  composeDir: string;
  appService: string;
  composeUsesBuild: boolean;
  composeImage: string | null;
  dockerfilePresent: boolean;
  containerName: string | null;
  containerImage: string | null;
  missingInContainer: Array<{ label: string; repoPath: string }>;
  stalePrebuiltImage: boolean;
}

/** Shell snippet: audit compose dir + app container (run on Coolify host). */
export function buildComposeAuditCommand(
  composeDir: string,
  appUuid: string,
  markers: ComposeSourceMarker[] = DEFAULT_SOURCE_MARKERS
): string {
  const markerChecks = markers
    .map(
      (m) =>
        `(test -f "${composeDir}/${m.repoPath}" && docker exec "$APP" test -f "${m.containerPath}" 2>/dev/null || echo "MISSING:${m.label}:${m.repoPath}")`
    )
    .join("; ");

  return [
    `COMPOSE_DIR="${composeDir}"`,
    `APP=$(docker ps --format '{{.Names}}' | grep -E '${appUuid.slice(0, 12)}|^app-|^work-' | head -1)`,
    'echo "@@AUDIT@@"',
    'grep -E "^[[:space:]]*(build:|image:)" "$COMPOSE_DIR/docker-compose.yml" 2>/dev/null | head -6',
    'test -f "$COMPOSE_DIR/Dockerfile" && echo DOCKERFILE=yes || echo DOCKERFILE=no',
    'echo "CONTAINER=$APP"',
    'test -n "$APP" && docker inspect "$APP" --format "{{.Config.Image}}" || echo NO_CONTAINER',
    markerChecks,
    'echo "@@END@@"',
  ].join(" && ");
}

export function parseComposeAuditOutput(stdout: string, composeDir: string): ComposeImageAudit {
  const section = stdout.split("@@AUDIT@@")[1]?.split("@@END@@")[0] ?? stdout;
  const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);

  let composeUsesBuild = false;
  let composeImage: string | null = null;
  let dockerfilePresent = false;
  let containerName: string | null = null;
  let containerImage: string | null = null;
  let afterContainer = false;
  const missingInContainer: ComposeImageAudit["missingInContainer"] = [];

  for (const line of lines) {
    if (/build:/i.test(line)) composeUsesBuild = true;
    const img = line.match(/image:\s*['"]?([^'"]+)['"]?/i);
    if (img && !/mongo|redis|alpine/i.test(line)) composeImage = img[1].trim();
    if (line === "DOCKERFILE=yes") dockerfilePresent = true;
    if (line.startsWith("CONTAINER=")) {
      const name = line.slice("CONTAINER=".length);
      containerName = name && name !== "NO_CONTAINER" ? name : null;
      afterContainer = true;
      continue;
    }
    if (afterContainer && !containerImage && !line.startsWith("MISSING") && line.length > 3) {
      containerImage = line;
      afterContainer = false;
      continue;
    }
    const miss = line.match(/^MISSING:([^:]+):(.+)$/);
    if (miss) missingInContainer.push({ label: miss[1], repoPath: miss[2] });
  }

  const stalePrebuiltImage =
    Boolean(dockerfilePresent) &&
    !composeUsesBuild &&
    Boolean(composeImage) &&
    missingInContainer.length > 0;

  return {
    composeDir,
    appService: "app",
    composeUsesBuild,
    composeImage,
    dockerfilePresent,
    containerName,
    containerImage,
    missingInContainer,
    stalePrebuiltImage,
  };
}
