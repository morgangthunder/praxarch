import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  sshUrl: string;
  httpsUrl: string;
  isPrivate: boolean;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);

  parseRepo(repo: string): { owner: string; name: string } {
    const trimmed = repo.trim().replace(/\.git$/, "");
    const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/i);
    if (ssh) return { owner: ssh[1], name: ssh[2] };
    const https = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/(.+)$/i);
    if (https) return { owner: https[1], name: https[2] };
    const slash = trimmed.match(/^([^/]+)\/([^/]+)$/);
    if (slash) return { owner: slash[1], name: slash[2] };
    throw new HttpException(`Invalid GitHub repo: ${repo}`, HttpStatus.BAD_REQUEST);
  }

  toSshUrl(repo: string): string {
    const { owner, name } = this.parseRepo(repo);
    return `git@github.com:${owner}/${name}.git`;
  }

  /** Check that a PAT can read the repo (used by the deployment wizard Access step). */
  async verifyRepoAccess(repo: string, token: string): Promise<{ ok: true; private: boolean }> {
    const { owner, name } = this.parseRepo(repo);
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) {
      throw new HttpException(
        "Repository not found or token lacks access",
        HttpStatus.BAD_REQUEST
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.error(`GitHub repo verify failed (${res.status}): ${detail}`);
      throw new HttpException(
        "Failed to verify GitHub access",
        HttpStatus.BAD_GATEWAY
      );
    }
    const body = (await res.json()) as { private?: boolean };
    return { ok: true, private: Boolean(body.private) };
  }

  async addDeployKey(input: {
    repo: string;
    publicKey: string;
    token: string;
    title?: string;
  }): Promise<void> {
    const { owner, name } = this.parseRepo(input.repo);
    const key = input.publicKey.trim();
    if (!key.startsWith("ssh-")) {
      throw new HttpException("Invalid SSH public key for deploy key", HttpStatus.BAD_REQUEST);
    }

    const res = await fetch(`https://api.github.com/repos/${owner}/${name}/keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: input.title ?? `praxarch-deploy-${Date.now()}`,
        key,
        read_only: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 422) {
      const body = await res.text().catch(() => "");
      if (body.includes("already exists") || body.includes("key is already in use")) {
        this.logger.log(`Deploy key already present on ${owner}/${name}`);
        return;
      }
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.error(`GitHub deploy key failed (${res.status}): ${detail}`);
      throw new HttpException(
        { message: "Failed to add GitHub deploy key", upstreamStatus: res.status },
        HttpStatus.BAD_GATEWAY
      );
    }
  }

  async getBranchCommitSha(repo: string, branch: string, token: string): Promise<string> {
    const { owner, name } = this.parseRepo(repo);
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${name}/commits/${encodeURIComponent(branch)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.error(`GitHub commit resolve failed (${res.status}): ${detail}`);
      throw new HttpException("Failed to resolve git branch on GitHub", HttpStatus.BAD_GATEWAY);
    }
    const body = (await res.json()) as { sha?: string };
    if (!body.sha) throw new HttpException("GitHub commit response missing sha", HttpStatus.BAD_GATEWAY);
    return body.sha;
  }

  /** Update docker-compose.yml image pin on GitHub (Contents API). */
  async updateComposeImagePin(input: {
    repo: string;
    branch: string;
    token: string;
    imageRef: string;
    composePath?: string;
    commitMessage?: string;
  }): Promise<{ sha: string; changed: boolean }> {
    const { owner, name } = this.parseRepo(input.repo);
    const path = input.composePath ?? "docker-compose.yml";
    const getRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(input.branch)}`,
      {
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!getRes.ok) {
      const detail = await getRes.text().catch(() => "");
      this.logger.error(`GitHub get ${path} failed (${getRes.status}): ${detail}`);
      throw new HttpException(`Failed to read ${path} on GitHub`, HttpStatus.BAD_GATEWAY);
    }
    const file = (await getRes.json()) as { content?: string; sha?: string };
    if (!file.content || !file.sha) {
      throw new HttpException(`GitHub file ${path} missing content`, HttpStatus.BAD_GATEWAY);
    }
    const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    const imageLine = `image: ${input.imageRef}`;
    const updated = decoded.replace(
      /(  app:\n(?:    .+\n)*?    )image:\s*.+/m,
      `$1${imageLine}`
    );
    if (updated === decoded && decoded.includes(imageLine)) {
      return { sha: file.sha, changed: false };
    }
    if (updated === decoded) {
      throw new HttpException(`Could not find app image line in ${path}`, HttpStatus.BAD_REQUEST);
    }
    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${input.token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          message: input.commitMessage ?? `chore(deploy): pin ${input.imageRef} via Praxarch`,
          content: Buffer.from(updated, "utf8").toString("base64"),
          sha: file.sha,
          branch: input.branch,
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => "");
      this.logger.error(`GitHub put ${path} failed (${putRes.status}): ${detail}`);
      throw new HttpException(`Failed to update ${path} on GitHub`, HttpStatus.BAD_GATEWAY);
    }
    const putBody = (await putRes.json()) as { commit?: { sha?: string } };
    return { sha: putBody.commit?.sha ?? file.sha, changed: true };
  }
}
