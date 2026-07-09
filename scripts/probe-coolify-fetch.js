const token = process.env.COOLIFY_API_TOKEN;
const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
(async () => {
  try {
    const h = { Authorization: `Bearer ${token}` };
    const r = await fetch(`${base}/api/v1/servers/ray76gl90ckl5iur3fk2zgvt`, { headers: h, signal: AbortSignal.timeout(30000) });
    console.log("server", r.status, await r.text().then((t) => t.slice(0, 80)));
    const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h, signal: AbortSignal.timeout(30000) });
    console.log("keys", keys.status);
  } catch (e) {
    console.error("err", e.message);
  }
})();
