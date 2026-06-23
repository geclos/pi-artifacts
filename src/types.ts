export type PublishTarget = "cloudflare-auto" | "cloudflare-temporary" | "cloudflare-permanent";

export interface PublishedInfo {
  target: PublishTarget | "local";
  url: string;
  claimUrl?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface ArtifactVersion {
  version: number;
  createdAt: string;
  path: string;
  published?: PublishedInfo;
}

export interface ArtifactMetadata {
  id: string;
  title: string;
  emoji?: string;
  kind?: string;
  format?: "html" | "md";
  designSystem?: {
    scope: "project" | "user" | "built-in";
    path?: string;
    fingerprint?: string;
  };
  createdAt: string;
  updatedAt: string;
  entry: string;
  versions: ArtifactVersion[];
  latestPublishedUrl?: string;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  file?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  fileCount: number;
  totalBytes: number;
}
