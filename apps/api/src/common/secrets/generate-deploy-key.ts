import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface DeployKeyPair {
  privateKeyOpenSSH: string;
  publicKeyOpenSSH: string;
}

/** Generate an ed25519 deploy key pair (requires openssh-keygen in the container). */
export function generateDeployKeyPair(comment: string): DeployKeyPair {
  const dir = mkdtempSync(join(tmpdir(), "praxarch-key-"));
  const keyPath = join(dir, "id_ed25519");
  try {
    execFileSync(
      "ssh-keygen",
      ["-t", "ed25519", "-f", keyPath, "-N", "", "-C", comment, "-q"],
      { encoding: "utf8" }
    );
    return {
      privateKeyOpenSSH: readFileSync(keyPath, "utf8"),
      publicKeyOpenSSH: readFileSync(`${keyPath}.pub`, "utf8").trim(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
