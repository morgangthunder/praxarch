import { BadRequestException } from "@nestjs/common";

/** Normalize PEM line endings before sending to Coolify. */
export function normalizeSshPrivateKey(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() + "\n";
}

/** Compare private key material after normalizing line endings. */
export function sshPrivateKeysMatch(a: string, b: string): boolean {
  return normalizeSshPrivateKey(a) === normalizeSshPrivateKey(b);
}

function isOpenSshPublicKey(key: string): boolean {
  return (
    key.includes("BEGIN PUBLIC KEY") ||
    /ssh-(rsa|ed25519|ecdsa)\s/.test(key) ||
    key.includes("imported-openssh-key")
  );
}

/**
 * Validate SSH private key material before registration.
 * Coolify expects OpenSSH or legacy PEM — not PuTTY .ppk files.
 */
export function assertValidSshPrivateKey(raw: string): string {
  const key = normalizeSshPrivateKey(raw);

  if (!key.trim()) {
    throw new BadRequestException("SSH private key is required.");
  }

  if (isOpenSshPublicKey(key)) {
    throw new BadRequestException(
      "You pasted a public key. In PuTTYgen use Conversions → Export OpenSSH key (private), " +
        "not the public key shown at the top of the window."
    );
  }

  if (key.includes("PuTTY-User-Key-File")) {
    throw new BadRequestException(
      "That looks like a PuTTY .ppk file. Convert it first: in PuTTYgen → Conversions → Export OpenSSH key, " +
        "or run: puttygen key.ppk -O private-openssh -o key.pem"
    );
  }

  if (key.includes("BEGIN OPENSSH PRIVATE KEY") && key.includes("Proc-Type: 4,ENCRYPTED")) {
    throw new BadRequestException(
      "This SSH key is passphrase-encrypted. Export an unencrypted OpenSSH private key for Coolify registration."
    );
  }

  if (
    key.includes("BEGIN RSA PRIVATE KEY") &&
    key.includes("ENCRYPTED") &&
    !key.includes("BEGIN OPENSSH PRIVATE KEY")
  ) {
    throw new BadRequestException(
      "This PEM key is passphrase-encrypted. Use an unencrypted private key for server registration."
    );
  }

  const valid =
    (key.includes("BEGIN OPENSSH PRIVATE KEY") && key.includes("END OPENSSH PRIVATE KEY")) ||
    (key.includes("BEGIN RSA PRIVATE KEY") && key.includes("END RSA PRIVATE KEY")) ||
    (key.includes("BEGIN EC PRIVATE KEY") && key.includes("END EC PRIVATE KEY")) ||
    (key.includes("BEGIN PRIVATE KEY") && key.includes("END PRIVATE KEY"));

  if (!valid) {
    throw new BadRequestException(
      "SSH private key must be PEM or OpenSSH format (-----BEGIN … PRIVATE KEY-----). " +
        "In PuTTYgen use Conversions → Export OpenSSH key — not the public key box at the top."
    );
  }

  return key;
}

/** Pull a human-readable message from a Coolify API error body. */
export function coolifyErrorMessage(detail: string, fallback: string): string {
  if (!detail) return fallback;
  try {
    const parsed = JSON.parse(detail) as { message?: string; errors?: Record<string, string[]> };
    if (parsed.message) return parsed.message;
    if (parsed.errors) {
      const first = Object.values(parsed.errors).flat()[0];
      if (first) return first;
    }
  } catch {
    if (detail.length < 300) return detail;
  }
  return fallback;
}
