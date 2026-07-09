/** Parsed nginx location → upstream port mapping (brownfield servers). */
export interface NginxUpstreamRoute {
  location: string;
  port: number;
  listening: boolean;
}

const SECTION = {
  routes: "@@NGINX_ROUTES@@",
  listeners: "@@LISTENERS@@",
  end: "@@END@@",
};

export function buildNginxRoutesScanCommand(): string {
  return [
    `echo "${SECTION.routes}"`,
    // location blocks with proxy_pass to localhost — one line per match for simple parsing.
    `sudo grep -R -h -E 'location |proxy_pass' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -120 || true`,
    `echo "${SECTION.listeners}"`,
    `(sudo -n ss -tlnp 2>/dev/null || ss -tlnp 2>/dev/null) | grep -oE ':[0-9]+ ' | tr -d ': ' | sort -nu | tr '\\n' ' '`,
    `echo "${SECTION.end}"`,
  ].join("; ");
}

/** Parse nginx config snippet + listening port list from SSH scan output. */
export function parseNginxRoutesScan(stdout: string): NginxUpstreamRoute[] {
  const routesSection = extractSection(stdout, SECTION.routes, SECTION.listeners);
  const listenersSection = extractSection(stdout, SECTION.listeners, SECTION.end);
  const listening = new Set(
    listenersSection
      .split(/\s+/)
      .map((p) => parseInt(p, 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

  const routes: NginxUpstreamRoute[] = [];
  let currentLocation = "/";
  for (const line of routesSection.split("\n")) {
    const trimmed = line.trim();
    const loc = trimmed.match(/^location\s+([^\s{]+)/);
    if (loc) {
      currentLocation = loc[1];
      continue;
    }
    const pass = trimmed.match(/proxy_pass\s+https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)/);
    if (pass) {
      const port = parseInt(pass[1], 10);
      if (Number.isFinite(port)) {
        routes.push({
          location: currentLocation,
          port,
          listening: listening.has(port),
        });
      }
    }
  }
  return routes;
}

export function deadNginxUpstreamPorts(routes: NginxUpstreamRoute[]): number[] {
  return [...new Set(routes.filter((r) => !r.listening).map((r) => r.port))];
}

/** Safe sed: retarget specific dead upstream ports to the Coolify app port. */
export function buildNginxRetargetCommand(deadPorts: number[], targetPort: number): string {
  if (!deadPorts.length || !Number.isFinite(targetPort) || targetPort < 1 || targetPort > 65535) {
    return "echo 'nothing-to-retarget'";
  }
  const files = "/etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf";
  const backup = `sudo cp -a /etc/nginx/sites-available/default /etc/nginx/sites-available/default.bak-praxarch-$(date +%Y%m%d%H%M%S) 2>/dev/null || true`;
  const sedParts = deadPorts.map(
    (p) =>
      `sudo sed -i 's|http://localhost:${p}|http://localhost:${targetPort}|g; s|http://127.0.0.1:${p}|http://127.0.0.1:${targetPort}|g' ${files} 2>/dev/null || true`
  );
  return [
    backup,
    ...sedParts,
    "sudo nginx -t",
    "sudo systemctl reload nginx || sudo service nginx reload",
    `echo retargeted_ports=${deadPorts.join(",")}_to_${targetPort}`,
  ].join(" && ");
}

function extractSection(text: string, start: string, end: string): string {
  const i = text.indexOf(start);
  if (i < 0) return "";
  const j = text.indexOf(end, i + start.length);
  return j < 0 ? text.slice(i + start.length) : text.slice(i + start.length, j);
}
