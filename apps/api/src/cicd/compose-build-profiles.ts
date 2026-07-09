import { PRAXARCH_BUILD_OVERLAY_FILENAME } from "./compose-build.util";

/** How Praxarch drives deploys for a provisioned environment. */
export type DeployProfile = "coolify" | "source-compose" | "source-compose-host";

export interface DeployProfileOptions {
  envFilePath?: string;
  includeMcpOverlay?: boolean;
  minDiskMb?: number;
  mongoDataVolume?: string;
  ecrRepository?: string;
  ecrRegion?: string;
  ecrImageTag?: string;
  ecrBuildServerUuid?: string;
  ecrSkipBuild?: boolean;
}

export const DEPLOY_PROFILE_META: Record<
  DeployProfile,
  { label: string; hint: string }
> = {
  coolify: {
    label: "Coolify (default)",
    hint: "Git deploy via Coolify API — best for greenfield apps with standard compose.",
  },
  "source-compose": {
    label: "Source build (compose overlay)",
    hint: "SSH build from Dockerfile when compose pins a stale registry image; bridge network.",
  },
  "source-compose-host": {
    label: "Source build (host network)",
    hint: "Source build with host networking for apps that reach Redis/Mongo/MCP on 127.0.0.1.",
  },
};

export type ResolvedDeployProfileOptions = {
  envFilePath: string;
  includeMcpOverlay: boolean;
  minDiskMb: number;
  mongoDataVolume?: string;
  ecrRepository?: string;
  ecrRegion?: string;
  ecrImageTag?: string;
  ecrBuildServerUuid?: string;
  ecrSkipBuild?: boolean;
};

const DEFAULT_OPTIONS: Omit<ResolvedDeployProfileOptions, "mongoDataVolume"> = {
  envFilePath: "Back-end/.secret",
  includeMcpOverlay: true,
  minDiskMb: 2048,
};

export function isSourceBuildProfile(profile: DeployProfile | string | null | undefined): boolean {
  return profile === "source-compose" || profile === "source-compose-host";
}

export function normalizeDeployProfile(raw?: string | null): DeployProfile {
  if (raw === "source-compose" || raw === "source-compose-host") return raw;
  return "coolify";
}

export function resolveProfileOptions(
  options?: DeployProfileOptions | Record<string, unknown> | null
): ResolvedDeployProfileOptions {
  const o = (options ?? {}) as DeployProfileOptions;
  const mongoDataVolume = o.mongoDataVolume?.trim();
  const ecrRepository = o.ecrRepository?.trim();
  const ecrRegion = o.ecrRegion?.trim();
  const ecrImageTag = o.ecrImageTag?.trim();
  const ecrBuildServerUuid = o.ecrBuildServerUuid?.trim();
  return {
    envFilePath: o.envFilePath?.trim() || DEFAULT_OPTIONS.envFilePath,
    includeMcpOverlay: o.includeMcpOverlay !== false,
    minDiskMb: typeof o.minDiskMb === "number" && o.minDiskMb > 0 ? o.minDiskMb : DEFAULT_OPTIONS.minDiskMb,
    ...(mongoDataVolume ? { mongoDataVolume } : {}),
    ...(ecrRepository ? { ecrRepository } : {}),
    ...(ecrRegion ? { ecrRegion } : {}),
    ...(ecrImageTag ? { ecrImageTag } : {}),
    ...(ecrBuildServerUuid ? { ecrBuildServerUuid } : {}),
    ...(o.ecrSkipBuild ? { ecrSkipBuild: true } : {}),
  };
}

export function buildOverlayYaml(profile: DeployProfile): string {
  if (profile === "source-compose-host") {
    return `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: praxarch-local-app:latest
    network_mode: host
    ports: []
    environment:
      - REDIS_HOST=127.0.0.1
      - REDIS_PORT=6378
`;
  }
  return `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: praxarch-local-app:latest
`;
}

export function composeFileArgs(includeMcp: boolean): string {
  const files = [
    "-f docker-compose.yml",
    `-f ${PRAXARCH_BUILD_OVERLAY_FILENAME}`,
    ...(includeMcp ? ["-f docker-compose.mcp.yml"] : []),
  ];
  return files.join(" ");
}

/** Remote bash script: git pull, sync env file, build, up, smoke checks. */
export function buildRemoteSourceDeployScript(input: {
  composeDir: string;
  profile: DeployProfile;
  branch: string;
  includeMcp: boolean;
  envFilePath: string;
  envFileB64: string;
  minDiskMb: number;
  donePath: string;
  appPort: string;
}): string {
  const overlayB64 = Buffer.from(buildOverlayYaml(input.profile)).toString("base64");
  const composeArgs = composeFileArgs(input.includeMcp);
  const mcpJoin =
    input.profile === "source-compose-host"
      ? "# host network — MCP via 127.0.0.1 in vault"
      : [
          'APP=$(docker ps --format "{{.Names}}" | grep -E "^(app-|work-)" | head -1)',
          'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
          'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
          'test -n "$APP" && test -n "$MCP_NET" && docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP" 2>/dev/null || true',
          'test -n "$APP_NET" && docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
        ].join("\n");

  return [
    "#!/bin/bash",
    "set -e",
    `cd "${input.composeDir}"`,
    "echo '=== disk ==='",
    "df -h / | tail -1",
    "sudo docker builder prune -af 2>&1 | tail -2 || true",
    "sudo docker image prune -f 2>&1 | tail -2 || true",
    `FREE_MB=$(df -BM / | tail -1 | awk '{print $4}' | tr -d M)`,
    `if [ "$FREE_MB" -lt ${input.minDiskMb} ]; then echo "DISK_LOW:$FREE_MB"; exit 1; fi`,
    "git fetch origin",
    `git checkout "${input.branch}"`,
    `git pull --ff-only origin "${input.branch}"`,
    'COMMIT=$(git rev-parse HEAD)',
    `echo '${input.envFileB64}' | base64 -d > "${input.envFilePath}"`,
    `chmod 600 "${input.envFilePath}"`,
    `cp "${input.envFilePath}" .env`,
    `echo '${overlayB64}' | base64 -d > ${PRAXARCH_BUILD_OVERLAY_FILENAME}`,
    "export DOCKER_BUILDKIT=1",
    `sudo -E docker compose ${composeArgs} build app`,
    `sudo docker compose ${composeArgs} up -d --force-recreate app${input.includeMcp ? " mcp" : ""}`,
    mcpJoin,
    "sleep 8",
    `curl -sf -o /dev/null "http://127.0.0.1:${input.appPort}/" || { echo "HEALTH_FAIL"; exit 1; }`,
    `echo "$COMMIT" > "${input.donePath}"`,
    'echo "OK commit=$COMMIT"',
  ].join("\n");
}
