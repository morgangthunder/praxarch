import { Injectable, Logger } from "@nestjs/common";
import { GitHubService } from "../common/secrets/github.service";
import { SecretsService } from "../common/secrets/secrets.service";

/** GitHub Actions workflow that builds container images before registry-based deploys. */
export const ECR_BUILD_WORKFLOW = "ecr-build-push.yml";

export type CiReadinessState = "ready" | "skipped" | "blocked";

export type CiReadinessResult =
  | { state: "ready"; commitSha: string; shortSha: string; branch: string }
  | { state: "skipped"; reason: "no_workflow" | "no_github_token" }
  | {
      state: "blocked";
      reason: "in_progress" | "not_started" | "failed";
      commitSha: string;
      shortSha: string;
      branch: string;
      message: string;
      runUrl?: string;
    };

type WorkflowRun = {
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  path?: string;
  created_at?: string;
};

@Injectable()
export class EcrCiReadinessService {
  private readonly logger = new Logger(EcrCiReadinessService.name);

  constructor(
    private readonly github: GitHubService,
    private readonly secrets: SecretsService
  ) {}

  async check(tenantId: string, repo: string, branch: string): Promise<CiReadinessResult> {
    let token: string | null;
    try {
      token = await this.secrets.get(tenantId, "github.provisioning");
    } catch {
      token = null;
    }
    if (!token?.trim()) {
      return { state: "skipped", reason: "no_github_token" };
    }

    const { owner, name } = this.github.parseRepo(repo);
    const workflow = await this.fetchWorkflow(owner, name, token);
    if (!workflow) {
      return { state: "skipped", reason: "no_workflow" };
    }

    const commitSha = await this.github.getBranchCommitSha(repo, branch, token);
    const shortSha = commitSha.slice(0, 7);
    const runs = await this.fetchRunsForCommit(owner, name, commitSha, token);
    const ecrRuns = runs.filter((r) => r.path?.includes(ECR_BUILD_WORKFLOW));

    if (!ecrRuns.length) {
      return {
        state: "blocked",
        reason: "not_started",
        commitSha,
        shortSha,
        branch,
        message:
          `No container image has been built for the latest ${branch} commit (${shortSha}). ` +
          `Push your branch and wait for the GitHub Actions **Build and push to ECR** workflow to finish ` +
          `(about 30 minutes), then deploy. Deploying now would only re-run the previous image.`,
      };
    }

    const latest = ecrRuns.sort(
      (a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "")
    )[0];

    if (latest.status === "queued" || latest.status === "in_progress" || latest.status === "waiting") {
      return {
        state: "blocked",
        reason: "in_progress",
        commitSha,
        shortSha,
        branch,
        runUrl: latest.html_url,
        message:
          `GitHub Actions is still building the container image for ${shortSha} on ${branch}. ` +
          `Wait for CI to finish before deploying — otherwise you'll redeploy the previous image.`,
      };
    }

    if (latest.status === "completed" && latest.conclusion === "success") {
      return { state: "ready", commitSha, shortSha, branch };
    }

    return {
      state: "blocked",
      reason: "failed",
      commitSha,
      shortSha,
      branch,
      runUrl: latest.html_url,
      message:
        `The GitHub Actions image build failed for ${shortSha} on ${branch}. ` +
        `Fix the workflow or re-run it on GitHub before deploying.`,
    };
  }

  private async fetchWorkflow(
    owner: string,
    repo: string,
    token: string
  ): Promise<{ id: number } | null> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${ECR_BUILD_WORKFLOW}`,
      {
        headers: this.githubHeaders(token),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.warn(`GitHub workflow lookup failed (${res.status}): ${detail}`);
      return null;
    }
    const body = (await res.json()) as { id?: number };
    return body.id != null ? { id: body.id } : null;
  }

  private async fetchRunsForCommit(
    owner: string,
    repo: string,
    headSha: string,
    token: string
  ): Promise<WorkflowRun[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=10`,
      {
        headers: this.githubHeaders(token),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      this.logger.warn(`GitHub actions runs lookup failed (${res.status}): ${detail}`);
      return [];
    }
    const body = (await res.json()) as { workflow_runs?: WorkflowRun[] };
    return body.workflow_runs ?? [];
  }

  private githubHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}
