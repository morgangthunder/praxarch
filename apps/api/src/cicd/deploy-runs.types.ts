export type DeployRunStatus = "queued" | "building" | "success" | "failed";

export interface DeployRunRecord {
  id: string;
  tenantId: string;
  project: string;
  serviceId: string | null;
  environment: "staging" | "production";
  status: DeployRunStatus;
  tag: string;
  actor: string;
  driver: "simulate" | "coolify" | "ssh-build" | "ecr-release";
  commitSha: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
