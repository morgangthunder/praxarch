/** Sync bridge networking env vars to Praxarch production vault + Coolify. */
async function main() {
  const envText = [
    "MONGO_URI=mongodb://mongo:27017/bubblbook",
    "REDIS_HOST=redis",
    "REDIS_PORT=6379",
    "ONBOARDING_AGENT_MCP_URL=http://mcp:3400",
  ].join("\n");

  const apiBase = (process.env.API_URL || "http://localhost:3901").replace(/\/$/, "");
  const res = await fetch(`${apiBase}/capabilities/deployments.setServiceEnvVars/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-praxarch-tenant": "bubblbook",
    },
    body: JSON.stringify({
      input: {
        serviceId: "bubblbook",
        environment: "production",
        envText,
        merge: true,
        syncToCoolify: true,
      },
    }),
  });
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
  if (body.status !== "ok") process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
