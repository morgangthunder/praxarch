/** Praxarch-managed compose overlay — build app from repo Dockerfile instead of a pinned registry image. */
export const PRAXARCH_BUILD_OVERLAY_FILENAME = "docker-compose.praxarch-build.yml";

export const PRAXARCH_BUILD_OVERLAY = `services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: praxarch-local-app:latest
`;

export function composeBuildCommand(composeDir: string, includeMcp: boolean): string {
  const b64 = Buffer.from(PRAXARCH_BUILD_OVERLAY).toString("base64");
  const files = [
    "-f docker-compose.yml",
    `-f ${PRAXARCH_BUILD_OVERLAY_FILENAME}`,
    ...(includeMcp ? ["-f docker-compose.mcp.yml"] : []),
  ].join(" ");
  return [
    `cd "${composeDir}"`,
    `echo '${b64}' | base64 -d > ${PRAXARCH_BUILD_OVERLAY_FILENAME}`,
    `sudo docker compose ${files} build app 2>&1 | tail -40`,
    `sudo docker compose ${files} up -d app${includeMcp ? " mcp" : ""} 2>&1 | tail -20`,
  ].join(" && ");
}

export function composeMcpOnlyCommand(composeDir: string): string {
  return [
    `cd "${composeDir}"`,
    "test -f docker-compose.mcp.yml",
    "sudo docker compose -f docker-compose.yml -f docker-compose.mcp.yml up -d --build mcp 2>&1 | tail -15",
    composeMcpNetworkJoinCommand(),
  ].join(" && ");
}

/** Coolify app + MCP overlay often land on different Compose networks; join so app→mcp and mcp→app DNS work. */
export function composeMcpNetworkJoinCommand(): string {
  return [
    `APP=$(docker ps --format '{{.Names}}' | grep -E '^(app-|work-)' | head -1)`,
    'MCP_NET=$(docker inspect mcp-server --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'APP_NET=$(docker inspect "$APP" --format "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}" 2>/dev/null | awk "{print \\$1}")',
    'test -n "$APP" && test -n "$MCP_NET" && docker network inspect "$MCP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q "$APP" || docker network connect "$MCP_NET" "$APP" 2>/dev/null || true',
    'test -n "$APP_NET" && docker network inspect "$APP_NET" --format "{{range .Containers}}{{.Name}} {{end}}" | grep -q mcp-server || docker network connect "$APP_NET" mcp-server 2>/dev/null || true',
  ].join(" && ");
}
