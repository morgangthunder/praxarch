/** Detect OpenSSH one-line public keys (e.g. PuTTYgen "authorized_keys" box). */
function isOpenSshPublicKey(key: string): boolean {
  return (
    key.includes("BEGIN PUBLIC KEY") ||
    /^ssh-(rsa|ed25519|ecdsa)\s+/m.test(key) ||
    /\s+imported-openssh-key\s*$/m.test(key)
  );
}

const PUBLIC_KEY_HINT =
  "That is a public key (the text PuTTYgen shows at the top). Coolify needs the private key: " +
  "in PuTTYgen go to Conversions → Export OpenSSH key (not “Export public key”), save the file, " +
  "open it in Notepad, and paste the contents starting with -----BEGIN … PRIVATE KEY-----.";

/** Client-side SSH private key checks (mirrors API validation messages). */
export function validateSshPrivateKeyClient(raw: string): { ok: true; normalized: string } | { ok: false; error: string } {
  const key = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  if (!key) return { ok: false, error: "SSH private key is required." };

  if (isOpenSshPublicKey(key)) {
    return { ok: false, error: PUBLIC_KEY_HINT };
  }

  if (key.includes("PuTTY-User-Key-File")) {
    return {
      ok: false,
      error:
        "That looks like a PuTTY .ppk file. In PuTTYgen use Conversions → Export OpenSSH key, or run: puttygen key.ppk -O private-openssh -o key.pem",
    };
  }

  if (key.includes("BEGIN OPENSSH PRIVATE KEY") && key.includes("Proc-Type: 4,ENCRYPTED")) {
    return { ok: false, error: "Passphrase-encrypted keys are not supported — export an unencrypted OpenSSH private key." };
  }

  if (key.includes("BEGIN RSA PRIVATE KEY") && key.includes("ENCRYPTED") && !key.includes("BEGIN OPENSSH PRIVATE KEY")) {
    return { ok: false, error: "Passphrase-encrypted PEM keys are not supported — use an unencrypted private key." };
  }

  const valid =
    (key.includes("BEGIN OPENSSH PRIVATE KEY") && key.includes("END OPENSSH PRIVATE KEY")) ||
    (key.includes("BEGIN RSA PRIVATE KEY") && key.includes("END RSA PRIVATE KEY")) ||
    (key.includes("BEGIN EC PRIVATE KEY") && key.includes("END EC PRIVATE KEY")) ||
    (key.includes("BEGIN PRIVATE KEY") && key.includes("END PRIVATE KEY"));

  if (!valid) {
    return {
      ok: false,
      error:
        "Paste a PEM or OpenSSH private key (-----BEGIN … PRIVATE KEY-----). " +
        "In PuTTYgen use Conversions → Export OpenSSH key — not the public key box at the top.",
    };
  }

  return { ok: true, normalized: key + "\n" };
}