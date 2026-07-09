const { execFile } = require("child_process");
const { promisify } = require("util");
const { writeFile, unlink } = require("fs/promises");
const { join } = require("path");
const { tmpdir } = require("os");
const execFileAsync = promisify(execFile);

async function main() {
  const token = process.env.COOLIFY_API_TOKEN;
  const base = process.env.COOLIFY_API_URL.replace(/\/$/, "");
  const h = { Authorization: `Bearer ${token}` };
  const srv = await fetch(`${base}/api/v1/servers/rorxx790bkr8db4ssro9v5fh`, { headers: h }).then((r) => r.json());
  const keys = await fetch(`${base}/api/v1/security/keys`, { headers: h }).then((r) => r.json());
  const kid = srv.private_key_uuid || srv.private_key_id;
  const pk = keys.find((k) => k.uuid === kid || k.id === kid)?.private_key;
  const keyPath = join(tmpdir(), "k");
  await writeFile(keyPath, pk, { mode: 0o600 });
  const APP = "app-gacc5qlsha4e9nrqk1vf58b3-215329321191";
  const cmd = [
    `docker network connect gacc5qlsha4e9nrqk1vf58b3_default ${APP} 2>&1 || true`,
    `docker network connect gacc5qlsha4e9nrqk1vf58b3 mcp-server 2>&1 || true`,
    `docker inspect ${APP} --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}'`,
    `docker inspect mcp-server --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}'`,
    `docker exec ${APP} node -e "require('dns').lookup('mcp',(e,a)=>console.log('mcp',e?e.message:a));require('dns').lookup('mcp-server',(e,a)=>console.log('mcp-server',e?e.message:a))"`,
    `docker exec ${APP} node -e "require('http').get('http://mcp:3400/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log('health',r.statusCode,d))}).on('error',e=>console.error(e.message))"`,
  ].join("; ");
  const { stdout } = await execFileAsync("ssh", ["-i", keyPath, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "UserKnownHostsFile=/dev/null", `ubuntu@${srv.ip}`, cmd], { timeout: 60000 });
  console.log(stdout);
  await unlink(keyPath);
}
main().catch(e => { console.error(e.message); process.exit(1); });
