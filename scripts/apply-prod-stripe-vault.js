/** Merge non-empty lines from bubblbook-production-stripe.env.local into Praxarch production vault. */
const { readFile } = require("fs/promises");
const { join } = require("path");

async function main() {
  const file = process.env.STRIPE_ENV_FILE || join(__dirname, "bubblbook-production-stripe.env.local");
  const text = await readFile(file, "utf8");
  const envText = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .filter((l) => {
      const v = l.slice(l.indexOf("=") + 1).trim();
      return v.length > 0;
    })
    .join("\n");

  if (!envText) {
    console.error("No KEY=VALUE lines to apply.");
    process.exit(2);
  }

  const keys = envText.split("\n").map((l) => l.split("=")[0]);
  console.log("Applying keys:", keys.join(", "));

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
  if (body.status !== "ok") {
    console.error(body.message || JSON.stringify(body));
    process.exit(1);
  }
  console.log("Vault updated:", JSON.stringify(body.data));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
