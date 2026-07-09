const paths = [
  "/app/g/agreeatime",
  "/1/app/g/agreeatime",
  "/3/app/g/agreeatime",
  "/app/g/agreeatime/main.js",
  "/browser/main.js",
];

async function main() {
  for (const path of paths) {
    const url = "https://alpha.bubblbook.com" + path;
    const res = await fetch(url, { redirect: "follow" });
    console.log(path, "->", res.status, res.url !== url ? `(final: ${res.url})` : "");
  }
  const html = await fetch("https://alpha.bubblbook.com/app/g/agreeatime").then((r) => r.text());
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => u.startsWith("/"));
  for (const ref of refs.slice(0, 12)) {
    const res = await fetch("https://alpha.bubblbook.com" + ref);
    console.log("asset", ref, "->", res.status);
  }
}

main().catch(console.error);
