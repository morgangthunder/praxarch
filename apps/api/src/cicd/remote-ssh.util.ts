import { execFile } from "child_process";
import { randomBytes } from "crypto";
import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Official Docker install script — same approach as Coolify's UI installer. */
export const INSTALL_DOCKER_REMOTE_COMMAND = `set -e
if command -v docker >/dev/null 2>&1; then
  echo "Docker already installed: $(docker --version)"
  docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || true
  exit 0
fi
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$(whoami)" 2>/dev/null || true
echo "Installed: $(docker --version)"
docker compose version 2>/dev/null || docker-compose --version 2>/dev/null || true
`;

export async function runSshCommand(options: {
  host: string;
  port: number;
  user: string;
  privateKey: string;
  command: string;
  timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string }> {
  const keyPath = join(tmpdir(), `praxarch-ssh-${randomBytes(8).toString("hex")}`);
  await writeFile(keyPath, options.privateKey, { mode: 0o600 });
  try {
    const result = await execFileAsync(
      "ssh",
      [
        "-i",
        keyPath,
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "ConnectTimeout=20",
        "-p",
        String(options.port),
        `${options.user}@${options.host}`,
        options.command,
      ],
      { timeout: options.timeoutMs ?? 300_000, maxBuffer: 2 * 1024 * 1024 }
    );
    return {
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
    };
  } finally {
    await unlink(keyPath).catch(() => undefined);
  }
}
