# Impact Analyzer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/impact-analyzer` — a Bun + Hono app that runs a daily cron job to collect PRs from Azure DevOps repos, analyze diffs with LLM for mobile API impact, and send a consolidated email report to affected teams.

**Architecture:** Standalone Bun app in the monorepo. Hono HTTP server with a cron scheduler. Azure DevOps REST API for PR listing and diff fetching. AI SDK `generateObject` for structured LLM output. nodemailer for SMTP email delivery.

**Tech Stack:** Bun, TypeScript strict, Hono, Zod v4, AI SDK (ai), croner, nodemailer, Vitest, Biome

---

## Chunk 1: App Skeleton + Env Schema

### Task 1: Create package.json

**Files:**
- Create: `apps/impact-analyzer/package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@impact-analyzer",
  "version": "0.0.1",
  "description": "Daily PR impact analyzer for cross-team dependencies",
  "private": true,
  "type": "module",
  "license": "UNLICENSED",
  "scripts": {
    "dev": "bun --env-file=../../.env.local --watch src/main.ts",
    "start": "bun --env-file=../../.env src/main.ts",
    "lint": "biome check src",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "ai": "^6.0.111",
    "better-result": "^2.7.0",
    "croner": "^10.0.1",
    "hono": "^4.12.7",
    "nodemailer": "^8.0.2",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.6",
    "@types/bun": "^1.3.10",
    "@types/nodemailer": "^7.0.11",
    "@vitest/coverage-v8": "^4.1.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 2: Register workspace in root package.json**

Modify `package.json` at root — the `workspaces` array already has `"apps/*"` so `@impact-analyzer` is auto-discovered. No change needed.

- [ ] **Step 3: Install dependencies**

```bash
bun install
```

### Task 2: Create tsconfig.json

**Files:**
- Create: `apps/impact-analyzer/tsconfig.json`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Task 3: Create vitest.config.ts

**Files:**
- Create: `apps/impact-analyzer/vitest.config.ts`

- [ ] **Step 1: Create vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Task 4: Create env schema + tests

**Files:**
- Create: `apps/impact-analyzer/src/shared/env.ts`
- Create: `apps/impact-analyzer/src/shared/env.test.ts`

- [ ] **Step 1: Write tests for env schema**

```ts
// apps/impact-analyzer/src/shared/env.test.ts
import { describe, it, expect } from "vitest";
import { parseImpactRouting, loadEnv } from "./env";

describe("parseImpactRouting", () => {
  it("parses valid routing string", () => {
    const result = parseImpactRouting("agrotrace-api:mobile:alice@x.com,bob@x.com");
    expect(result.get("agrotrace-api")).toEqual({
      teamName: "mobile",
      emails: ["alice@x.com", "bob@x.com"],
    });
  });

  it("parses multiple repos", () => {
    const result = parseImpactRouting(
      "repo-a:team1:a@x.com;repo-b:team2:b@x.com,c@x.com",
    );
    expect(result.size).toBe(2);
    expect(result.get("repo-a")?.teamName).toBe("team1");
    expect(result.get("repo-b")?.emails).toEqual(["b@x.com", "c@x.com"]);
  });

  it("rejects invalid format (missing parts)", () => {
    expect(() => parseImpactRouting("repo:team")).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() => parseImpactRouting("repo:team:not-an-email")).toThrow();
  });

  it("returns empty map for empty string", () => {
    const result = parseImpactRouting("");
    expect(result.size).toBe(0);
  });
});

describe("loadEnv", () => {
  it("validates with minimal required values", () => {
    const env = loadEnv({
      AZURE_DEVOPS_ORG: "myorg",
      AZURE_DEVOPS_PAT: "pat123",
      AI_PROVIDER_API_KEY: "key123",
      SMTP_HOST: "localhost",
      SMTP_FROM: "bot@example.com",
      ANALYZER_API_KEY: "secret",
    });
    expect(env.PORT).toBe(3000);
    expect(env.AI_MODEL).toBe("gpt-4o");
    expect(env.AI_PROVIDER).toBe("openai");
    expect(env.SMTP_PORT).toBe(587);
    expect(env.CRON_SCHEDULE).toBe("0 18 * * 1-5");
    expect(env.CRON_TIMEZONE).toBe("America/Sao_Paulo");
  });

  it("rejects missing required fields", () => {
    expect(() =>
      loadEnv({
        AZURE_DEVOPS_ORG: "myorg",
        // missing AZURE_DEVOPS_PAT
        AI_PROVIDER_API_KEY: "key123",
        SMTP_HOST: "localhost",
        SMTP_FROM: "bot@example.com",
        ANALYZER_API_KEY: "secret",
      }),
    ).toThrow();
  });

  it("rejects invalid IMPACT_ROUTING format", () => {
    expect(() =>
      loadEnv({
        AZURE_DEVOPS_ORG: "myorg",
        AZURE_DEVOPS_PAT: "pat123",
        AI_PROVIDER_API_KEY: "key123",
        SMTP_HOST: "localhost",
        SMTP_FROM: "bot@example.com",
        ANALYZER_API_KEY: "secret",
        IMPACT_ROUTING: "invalid-format",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/shared/env.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Write env.ts implementation**

```ts
// apps/impact-analyzer/src/shared/env.ts
import { z } from "zod";

const impactRoutingSegment = z.string().regex(/^[^:]+:[^:]+:[^:]+$/);

export function parseImpactRouting(
  raw: string,
): Map<string, { teamName: string; emails: string[] }> {
  const result = new Map<string, { teamName: string; emails: string[] }>();
  if (!raw.trim()) return result;

  const segments = raw.split(";").filter(Boolean);
  for (const segment of segments) {
    const parsed = impactRoutingSegment.safeParse(segment.trim());
    if (!parsed.success) {
      throw new Error(
        `Invalid IMPACT_ROUTING segment: "${segment}". Expected format: repo:team_name:email1,email2`,
      );
    }
    const [repo, teamName, emailsRaw] = segment.trim().split(":");
    if (!repo || !teamName || !emailsRaw) {
      throw new Error(
        `Invalid IMPACT_ROUTING segment: "${segment}". Each segment must have exactly 3 parts separated by ":"`,
      );
    }
    const emails = emailsRaw.split(",").map((e) => e.trim());
    for (const email of emails) {
      const emailResult = z.string().email().safeParse(email);
      if (!emailResult.success) {
        throw new Error(
          `Invalid email "${email}" in IMPACT_ROUTING segment "${segment}"`,
        );
      }
    }
    result.set(repo, { teamName, emails });
  }
  return result;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  AZURE_DEVOPS_ORG: z.string().min(1),
  AZURE_DEVOPS_PAT: z.string().min(1),
  AZURE_DEVOPS_DEFAULT_PROJECT: z.string().default("AGROTRACE"),
  AI_PROVIDER_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_PROVIDER: z.enum(["openai", "anthropic", "google"]).default("openai"),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_FROM: z.string().email(),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  IMPACT_ROUTING: z
    .string()
    .default("agrotrace:mobile:dev1@example.com,dev2@example.com"),
  CRON_SCHEDULE: z.string().default("0 18 * * 1-5"),
  CRON_TIMEZONE: z.string().default("America/Sao_Paulo"),
  ANALYZER_API_KEY: z.string().min(1),
});

type EnvInput = Partial<z.input<typeof envSchema>>;

export function loadEnv(input: EnvInput): z.output<typeof envSchema> {
  const parsed = envSchema.parse(input);
  // Validate IMPACT_ROUTING format
  parseImpactRouting(parsed.IMPACT_ROUTING);
  return parsed;
}

export type Env = ReturnType<typeof loadEnv>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/shared/env.test.ts
```
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/package.json apps/impact-analyzer/tsconfig.json apps/impact-analyzer/vitest.config.ts apps/impact-analyzer/src/shared/env.ts apps/impact-analyzer/src/shared/env.test.ts
git commit -m "feat(impact-analyzer): app skeleton + env schema with IMPACT_ROUTING parser"
```

---

## Chunk 2: TaggedErrors + Azure DevOps Client

### Task 5: Create TaggedErrors

**Files:**
- Create: `apps/impact-analyzer/src/shared/errors.ts`

- [ ] **Step 1: Create errors.ts**

```ts
// apps/impact-analyzer/src/shared/errors.ts
import { TaggedError } from "better-result";

export class PrFetchError extends TaggedError("PrFetchError")<{
  message: string;
  cause?: unknown;
}> {}

export class RepoNotRoutedError extends TaggedError("RepoNotRoutedError")<{
  repo: string;
}> {}

export class NoRelevantFilesError extends TaggedError("NoRelevantFilesError")<{
  prId: number;
}> {}

export class ReportGenerationError extends TaggedError("ReportGenerationError")<{
  message: string;
  cause?: unknown;
}> {}

export class EmailSendError extends TaggedError("EmailSendError")<{
  message: string;
  cause?: unknown;
}> {}
```

### Task 6: Create Azure DevOps Client + tests

**Files:**
- Create: `apps/impact-analyzer/src/shared/azure-devops-client.ts`
- Create: `apps/impact-analyzer/src/shared/azure-devops-client.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/shared/azure-devops-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AzureDevOpsClient } from "./azure-devops-client";
import { PrFetchError } from "./errors";

function makeClient(overrides?: { org?: string; pat?: string; project?: string }) {
  return new AzureDevOpsClient({
    org: "testorg",
    pat: "testpat",
    project: "TESTPROJECT",
    ...overrides,
  });
}

describe("AzureDevOpsClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchJson", () => {
    it("makes authenticated GET request", async () => {
      const client = makeClient();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.fetchJson("/test-endpoint");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://dev.azure.com/testorg/test-endpoint",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        }),
      );
    });

    it("throws PrFetchError on non-200 response", async () => {
      const client = makeClient();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }));

      await expect(client.fetchJson("/test")).rejects.toBeInstanceOf(PrFetchError);
    });

    it("throws PrFetchError on network error", async () => {
      const client = makeClient();
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));

      await expect(client.fetchJson("/test")).rejects.toBeInstanceOf(PrFetchError);
    });
  });

  describe("buildUrl", () => {
    it("builds correct URL", () => {
      const client = makeClient();
      expect(client.buildUrl("/_apis/git/repositories/repo1/pullrequests")).toBe(
        "https://dev.azure.com/testorg/TESTPROJECT/_apis/git/repositories/repo1/pullrequests",
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/shared/azure-devops-client.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/shared/azure-devops-client.ts
import { PrFetchError } from "./errors";

export interface AzureDevOpsClientConfig {
  org: string;
  pat: string;
  project: string;
}

export class AzureDevOpsClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(config: AzureDevOpsClientConfig) {
    this.baseUrl = `https://dev.azure.com/${config.org}/${config.project}`;
    const credentials = Buffer.from(`:${config.pat}`).toString("base64");
    this.authHeader = `Basic ${credentials}`;
  }

  buildUrl(path: string): string {
    const separator = path.startsWith("/") ? "" : "/";
    return `${this.baseUrl}${separator}${path}`;
  }

  async fetchJson<T>(path: string, apiVersion = "7.0"): Promise<T> {
    const url = this.buildUrl(path);
    const separator = path.includes("?") ? "&" : "?";
    const fullUrl = `${url}${separator}api-version=${apiVersion}`;

    try {
      const response = await fetch(fullUrl, {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new PrFetchError({
          message: `Azure DevOps API error: ${response.status} ${response.statusText} for ${path}`,
          cause: { status: response.status, statusText: response.statusText },
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof PrFetchError) throw error;
      throw new PrFetchError({
        message: `Failed to fetch ${path}: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/shared/azure-devops-client.test.ts
```
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/shared/errors.ts apps/impact-analyzer/src/shared/azure-devops-client.ts apps/impact-analyzer/src/shared/azure-devops-client.test.ts
git commit -m "feat(impact-analyzer): tagged errors + Azure DevOps client"
```

---

## Chunk 3: PR List Fetcher

### Task 7: Create PR List Fetcher + tests

**Files:**
- Create: `apps/impact-analyzer/src/modules/analyzer/pr-list-fetcher.ts`
- Create: `apps/impact-analyzer/src/modules/analyzer/pr-list-fetcher.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/modules/analyzer/pr-list-fetcher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrListFetcher } from "./pr-list-fetcher";
import type { AzureDevOpsClient } from "../../shared/azure-devops-client";

function makeClient(prs: unknown[]) {
  const fetchJson = vi.fn().mockResolvedValue({ value: prs });
  return {
    client: { fetchJson, buildUrl: (p: string) => `https://test${p}` } as unknown as AzureDevOpsClient,
    fetchJson,
  };
}

const now = new Date();
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

describe("PrListFetcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("separates merged and open PRs from last 24h", async () => {
    const { client, fetchJson } = makeClient([
      { pullRequestId: 1, title: "Merged PR", status: "completed", createdDate: yesterday.toISOString(), closedDate: now.toISOString() },
      { pullRequestId: 2, title: "Open PR", status: "active", createdDate: yesterday.toISOString() },
      { pullRequestId: 3, title: "Old PR", status: "active", createdDate: twoDaysAgo.toISOString() },
    ]);
    const fetcher = new PrListFetcher(client);

    const result = await fetcher.list("myrepo", "MYPROJECT");

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]?.id).toBe(1);
    expect(result.open).toHaveLength(1);
    expect(result.open[0]?.id).toBe(2);
    expect(fetchJson).toHaveBeenCalledWith(
      "/_apis/git/repositories/myrepo/pullrequests?searchCriteria.status=all&$top=100",
    );
  });

  it("returns empty arrays when no PRs in 24h", async () => {
    const { client } = makeClient([
      { pullRequestId: 99, title: "Old", status: "completed", createdDate: twoDaysAgo.toISOString(), closedDate: twoDaysAgo.toISOString() },
    ]);
    const fetcher = new PrListFetcher(client);

    const result = await fetcher.list("myrepo", "MYPROJECT");

    expect(result.merged).toHaveLength(0);
    expect(result.open).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/pr-list-fetcher.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/modules/analyzer/pr-list-fetcher.ts
import type { AzureDevOpsClient } from "../../shared/azure-devops-client";

export interface PrInfo {
  id: number;
  title: string;
  author: string;
  status: "merged" | "open" | "abandoned";
  createdDate: string;
  sourceRefName: string;
  targetRefName: string;
}

export interface PrListResult {
  merged: PrInfo[];
  open: PrInfo[];
}

interface AzurePr {
  pullRequestId: number;
  title: string;
  createdBy: { displayName: string };
  status: string;
  createdDate: string;
  closedDate?: string;
  sourceRefName: string;
  targetRefName: string;
  completionOptions?: { mergeStatus?: string };
}

interface AzurePrListResponse {
  value: AzurePr[];
}

export class PrListFetcher {
  constructor(private client: AzureDevOpsClient) {}

  async list(repo: string, _projectId: string): Promise<PrListResult> {
    const response = await this.client.fetchJson<AzurePrListResponse>(
      `/_apis/git/repositories/${repo}/pullrequests?searchCriteria.status=all&$top=100`,
    );

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const merged: PrInfo[] = [];
    const open: PrInfo[] = [];

    for (const pr of response.value) {
      const createdDate = new Date(pr.createdDate);
      if (createdDate < cutoff) continue;

      const info: PrInfo = {
        id: pr.pullRequestId,
        title: pr.title,
        author: pr.createdBy?.displayName ?? "Unknown",
        status: pr.status === "completed" ? "merged" : pr.status === "abandoned" ? "abandoned" : "open",
        createdDate: pr.createdDate,
        sourceRefName: pr.sourceRefName,
        targetRefName: pr.targetRefName,
      };

      if (pr.status === "completed") {
        merged.push(info);
      } else {
        open.push(info);
      }
    }

    return { merged, open };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/pr-list-fetcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/modules/analyzer/pr-list-fetcher.ts apps/impact-analyzer/src/modules/analyzer/pr-list-fetcher.test.ts
git commit -m "feat(impact-analyzer): PR list fetcher with 24h filter and merged/open separation"
```

---

## Chunk 4: PR Diff Fetcher + File Classifier

### Task 8: Create PR Diff Fetcher + tests

**Files:**
- Create: `apps/impact-analyzer/src/modules/analyzer/pr-diff-fetcher.ts`
- Create: `apps/impact-analyzer/src/modules/analyzer/pr-diff-fetcher.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/modules/analyzer/pr-diff-fetcher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PrDiffFetcher } from "./pr-diff-fetcher";
import type { AzureDevOpsClient } from "../../shared/azure-devops-client";
import { PrFetchError } from "../../shared/errors";

function makeClient(overrides: { iterations?: unknown; changes?: unknown; content?: string } = {}) {
  const fetchJson = vi.fn()
    .mockResolvedValueOnce({ value: overrides.iterations ?? [{ id: 1 }] })
    .mockResolvedValueOnce({ value: overrides.changes ?? [] });
  return {
    client: { fetchJson, buildUrl: (p: string) => `https://test${p}` } as unknown as AzureDevOpsClient,
    fetchJson,
  };
}

describe("PrDiffFetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when no changes", async () => {
    const { client } = makeClient();
    const fetcher = new PrDiffFetcher(client);
    const result = await fetcher.fetch("myrepo", "PROJ", 1);
    expect(result).toEqual([]);
  });

  it("truncates large file diffs to 500 lines", async () => {
    const lines = Array.from({ length: 600 }, (_, i) => `+ line ${i}`).join("\n");
    const { client } = makeClient({
      changes: [{ item: { path: "/src/big.ts" }, changeType: "edit" }],
      content: lines,
    });
    const fetcher = new PrDiffFetcher(client);
    // Note: full implementation test requires mocking content fetch
    // For now, test the truncation helper directly
    const truncated = PrDiffFetcher.truncateContent(lines, 500);
    const lineCount = truncated.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/pr-diff-fetcher.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/modules/analyzer/pr-diff-fetcher.ts
import type { AzureDevOpsClient } from "../../shared/azure-devops-client";
import { PrFetchError } from "../../shared/errors";

export interface FileDiff {
  path: string;
  changeType: "add" | "edit" | "delete";
  content: string;
}

const MAX_LINES_PER_FILE = 500;
const MAX_TOTAL_CHARS = 60000;

export class PrDiffFetcher {
  constructor(private client: AzureDevOpsClient) {}

  static truncateContent(content: string, maxLines: number): string {
    const lines = content.split("\n");
    if (lines.length <= maxLines) return content;

    const half = Math.floor(maxLines / 2);
    const top = lines.slice(0, half);
    const bottom = lines.slice(-half);
    return [...top, `[...${lines.length - maxLines} lines truncated...]`, ...bottom].join("\n");
  }

  async fetch(repo: string, _projectId: string, prId: number): Promise<FileDiff[]> {
    // Get iterations
    const iterations = await this.client.fetchJson<{ value: { id: number }[] }>(
      `/_apis/git/repositories/${repo}/pullRequests/${prId}/iterations`,
    );
    const latestIteration = iterations.value[iterations.value.length - 1];
    if (!latestIteration) {
      throw new PrFetchError({ message: `No iterations found for PR ${prId}` });
    }

    // Get changes
    const changes = await this.client.fetchJson<{
      value: { item: { path: string }; changeType: string }[];
    }>(
      `/_apis/git/repositories/${repo}/pullRequests/${prId}/iterations/${latestIteration.id}/changes`,
    );

    const files: FileDiff[] = [];
    let totalChars = 0;

    for (const change of changes.value) {
      const changeType = change.changeType === "add" ? "add" : change.changeType === "delete" ? "delete" : "edit";

      if (changeType === "delete") {
        files.push({ path: change.item.path, changeType, content: "[DELETED]" });
        continue;
      }

      // Fetch file content
      let content = "";
      try {
        const text = await this.client.fetchJson<string>(
          `/_apis/git/repositories/${repo}/items?path=${encodeURIComponent(change.item.path)}&versionType=commit&$format=text`,
        );
        content = typeof text === "string" ? text : JSON.stringify(text);
      } catch {
        content = "[Failed to fetch content]";
      }

      content = PrDiffFetcher.truncateContent(content, MAX_LINES_PER_FILE);

      if (totalChars + content.length > MAX_TOTAL_CHARS) {
        break; // Budget exhausted
      }

      files.push({ path: change.item.path, changeType, content });
      totalChars += content.length;
    }

    return files;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/pr-diff-fetcher.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/modules/analyzer/pr-diff-fetcher.ts apps/impact-analyzer/src/modules/analyzer/pr-diff-fetcher.test.ts
git commit -m "feat(impact-analyzer): PR diff fetcher with truncation and token budget"
```

### Task 9: Create File Classifier + tests

**Files:**
- Create: `apps/impact-analyzer/src/modules/analyzer/file-classifier.ts`
- Create: `apps/impact-analyzer/src/modules/analyzer/file-classifier.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/modules/analyzer/file-classifier.test.ts
import { describe, it, expect } from "vitest";
import { FileClassifier } from "./file-classifier";
import type { FileDiff } from "./pr-diff-fetcher";

function file(path: string, changeType: "add" | "edit" | "delete" = "edit"): FileDiff {
  return { path, changeType, content: "dummy" };
}

describe("FileClassifier", () => {
  it("classifies migration files", () => {
    const result = FileClassifier.classify([
      file("src/migrations/user.migration.ts"),
      file("drizzle/001_add_users.sql"),
      file("src/shared/database/schema.ts"),
    ]);
    expect(result.migrations).toHaveLength(3);
    expect(result.endpoints).toHaveLength(0);
    expect(result.schemas).toHaveLength(0);
  });

  it("classifies endpoint files", () => {
    const result = FileClassifier.classify([
      file("src/api/users.controller.ts"),
      file("src/routes/auth.route.ts"),
      file("src/handlers/webhook.handler.ts"),
    ]);
    expect(result.endpoints).toHaveLength(3);
    expect(result.migrations).toHaveLength(0);
  });

  it("classifies schema files", () => {
    const result = FileClassifier.classify([
      file("src/dto/create-user.dto.ts"),
      file("src/models/user.model.ts"),
      file("src/contracts/api.contract.ts"),
    ]);
    expect(result.schemas).toHaveLength(3);
  });

  it("ignores irrelevant files", () => {
    const result = FileClassifier.classify([
      file("README.md"),
      file(".gitignore"),
      file("package.json"),
    ]);
    expect(result.migrations).toHaveLength(0);
    expect(result.endpoints).toHaveLength(0);
    expect(result.schemas).toHaveLength(0);
  });

  it("handles mixed file list", () => {
    const result = FileClassifier.classify([
      file("src/api/users.controller.ts"),
      file("src/dto/user.dto.ts"),
      file("drizzle/001.sql"),
      file("README.md"),
    ]);
    expect(result.migrations).toHaveLength(1);
    expect(result.endpoints).toHaveLength(1);
    expect(result.schemas).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/file-classifier.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/modules/analyzer/file-classifier.ts
import type { FileDiff } from "./pr-diff-fetcher";

export interface ClassifiedFiles {
  migrations: FileDiff[];
  endpoints: FileDiff[];
  schemas: FileDiff[];
}

const migrationPatterns = [
  /\.migration\./,
  /\.sql$/,
  /^drizzle\//,
  /^migrations\//,
  /\/schema\.ts$/,
];

const endpointPatterns = [
  /controller/,
  /route/,
  /handler/,
  /\/api\//,
  /\/routes\//,
];

const schemaPatterns = [
  /\.dto\./,
  /schema/,
  /\.model\./,
  /\.entity\./,
  /\.contract\./,
];

function matchesAny(path: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(path));
}

export class FileClassifier {
  static classify(files: FileDiff[]): ClassifiedFiles {
    const result: ClassifiedFiles = {
      migrations: [],
      endpoints: [],
      schemas: [],
    };

    for (const file of files) {
      if (matchesAny(file.path, migrationPatterns)) {
        result.migrations.push(file);
      } else if (matchesAny(file.path, endpointPatterns)) {
        result.endpoints.push(file);
      } else if (matchesAny(file.path, schemaPatterns)) {
        result.schemas.push(file);
      }
      // config and other categories are ignored
    }

    return result;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/file-classifier.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/modules/analyzer/file-classifier.ts apps/impact-analyzer/src/modules/analyzer/file-classifier.test.ts
git commit -m "feat(impact-analyzer): file classifier for migration/endpoint/schema categories"
```

---

## Chunk 5: Report Generator

### Task 10: Create Report Generator + tests

**Files:**
- Create: `apps/impact-analyzer/src/modules/analyzer/report-generator.ts`
- Create: `apps/impact-analyzer/src/modules/analyzer/report-generator.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/modules/analyzer/report-generator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReportGenerator } from "./report-generator";
import { ReportGenerationError } from "../../shared/errors";
import type { PrInfo } from "./pr-list-fetcher";
import type { ClassifiedFiles } from "./file-classifier";

describe("ReportGenerator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("generates structured report via generateObject", async () => {
    const mockGenerateObject = vi.fn().mockResolvedValue({
      object: {
        summary: "Test summary",
        mergedImpacts: [],
        openImpacts: [],
        overallRisk: "LOW",
        totalPrsAnalyzed: 0,
        totalImpactsFound: 0,
      },
    });
    vi.mock("ai", async (importOriginal) => {
      const mod = await importOriginal<typeof import("ai")>();
      return { ...mod, generateObject: mockGenerateObject };
    });

    const generator = new ReportGenerator({
      apiKey: "test-key",
      model: "gpt-4o",
      provider: "openai",
    });

    const result = await generator.generate({
      repo: "myrepo",
      date: "2026-03-31",
      merged: [],
      open: [],
    });

    expect(result.summary).toBe("Test summary");
    expect(result.overallRisk).toBe("LOW");
  });

  it("throws ReportGenerationError on LLM failure", async () => {
    vi.mock("ai", async (importOriginal) => {
      const mod = await importOriginal<typeof import("ai")>();
      return {
        ...mod,
        generateObject: vi.fn().mockRejectedValue(new Error("LLM error")),
      };
    });

    const generator = new ReportGenerator({
      apiKey: "test-key",
      model: "gpt-4o",
      provider: "openai",
    });

    await expect(
      generator.generate({
        repo: "myrepo",
        date: "2026-03-31",
        merged: [],
        open: [],
      }),
    ).rejects.toBeInstanceOf(ReportGenerationError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/report-generator.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/modules/analyzer/report-generator.ts
import { generateObject } from "ai";
import { z } from "zod";
import { ReportGenerationError } from "../../shared/errors";
import type { PrInfo } from "./pr-list-fetcher";
import type { ClassifiedFiles } from "./file-classifier";

const ImpactItemSchema = z.object({
  category: z.enum(["migration", "endpoint", "schema"]),
  file: z.string(),
  description: z.string(),
  affectedResource: z.string(),
  impactType: z.enum(["BREAKING", "COMPATIBLE", "INFORMATIVE"]),
  recommendation: z.string(),
});

const DailyImpactReportSchema = z.object({
  summary: z.string(),
  mergedImpacts: z.array(z.object({
    prId: z.number(),
    prTitle: z.string(),
    impacts: z.array(ImpactItemSchema),
  })),
  openImpacts: z.array(z.object({
    prId: z.number(),
    prTitle: z.string(),
    impacts: z.array(ImpactItemSchema),
  })),
  overallRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  totalPrsAnalyzed: z.number(),
  totalImpactsFound: z.number(),
});

export type DailyImpactReport = z.infer<typeof DailyImpactReportSchema>;

interface PrWithClassification {
  pr: PrInfo;
  classified: ClassifiedFiles;
}

interface DailyData {
  repo: string;
  date: string;
  merged: PrWithClassification[];
  open: PrWithClassification[];
}

function formatDiffs(classified: ClassifiedFiles): string {
  const parts: string[] = [];

  if (classified.migrations.length > 0) {
    parts.push(`### Migrations (${classified.migrations.length} arquivos)`);
    for (const f of classified.migrations) {
      parts.push(`--- ${f.path} (${f.changeType})\n${f.content}\n---`);
    }
  }

  if (classified.endpoints.length > 0) {
    parts.push(`### Endpoints (${classified.endpoints.length} arquivos)`);
    for (const f of classified.endpoints) {
      parts.push(`--- ${f.path} (${f.changeType})\n${f.content}\n---`);
    }
  }

  if (classified.schemas.length > 0) {
    parts.push(`### Schemas (${classified.schemas.length} arquivos)`);
    for (const f of classified.schemas) {
      parts.push(`--- ${f.path} (${f.changeType})\n${f.content}\n---`);
    }
  }

  return parts.join("\n\n");
}

export interface ReportGeneratorConfig {
  apiKey: string;
  model: string;
  provider: string;
}

export class ReportGenerator {
  constructor(private config: ReportGeneratorConfig) {}

  async generate(data: DailyData): Promise<DailyImpactReport> {
    const mergedSection = data.merged.map((p) =>
      `**PR #${p.pr.id} — ${p.pr.title}** (merged)\n\n${formatDiffs(p.classified)}`,
    ).join("\n\n---\n\n");

    const openSection = data.open.map((p) =>
      `**PR #${p.pr.id} — ${p.pr.title}** (open)\n\n${formatDiffs(p.classified)}`,
    ).join("\n\n---\n\n");

    const prompt = `Voce e um analista de impacto de API. Analise os PRs do repositorio ${data.repo} das ultimas 24h e identifique impactos para o time mobile que consome esta API.

Data: ${data.date}

### PRs MERGED (ja incorporados) — ${data.merged.length} PRs
${mergedSection || "Nenhum PR merged nas ultimas 24h."}

### PRs ABERTOS (pendentes de merge) — ${data.open.length} PRs
${openSection || "Nenhum PR aberto nas ultimas 24h."}

Para cada alteracao em cada PR, identifique:
1. O que mudou
2. Qual recurso e afetado (endpoint, tabela, schema)
3. Tipo de impacto: BREAKING, COMPATIBLE, INFORMATIVE
4. Recomendacao para o time mobile

PRs merged representam mudancas que JA estao em producao/staging.
PRs abertos representam mudancas que ENTRARAO em breve.`;

    try {
      const result = await generateObject({
        model: this.config.model as any,
        schema: DailyImpactReportSchema,
        prompt,
      });

      return {
        ...result.object,
        totalPrsAnalyzed: data.merged.length + data.open.length,
        totalImpactsFound: result.object.mergedImpacts.reduce((s, p) => s + p.impacts.length, 0)
          + result.object.openImpacts.reduce((s, p) => s + p.impacts.length, 0),
      };
    } catch (error) {
      throw new ReportGenerationError({
        message: `Failed to generate report: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/modules/analyzer/report-generator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/modules/analyzer/report-generator.ts apps/impact-analyzer/src/modules/analyzer/report-generator.test.ts
git commit -m "feat(impact-analyzer): report generator with generateObject and Zod schema"
```

---

## Chunk 6: Email Template + Sender

### Task 11: Create Email Template + tests

**Files:**
- Create: `apps/impact-analyzer/src/shared/email-template.ts`
- Create: `apps/impact-analyzer/src/shared/email-template.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/shared/email-template.test.ts
import { describe, it, expect } from "vitest";
import { renderDailyReport } from "./email-template";
import type { DailyImpactReport } from "../modules/analyzer/report-generator";

const sampleReport: DailyImpactReport = {
  summary: "Test summary",
  mergedImpacts: [{
    prId: 1,
    prTitle: "Add users endpoint",
    impacts: [{
      category: "endpoint",
      file: "src/api/users.controller.ts",
      description: "Added new endpoint",
      affectedResource: "GET /api/users",
      impactType: "COMPATIBLE",
      recommendation: "Update mobile API client",
    }],
  }],
  openImpacts: [],
  overallRisk: "MEDIUM",
  totalPrsAnalyzed: 1,
  totalImpactsFound: 1,
};

describe("renderDailyReport", () => {
  it("generates HTML with required sections", () => {
    const html = renderDailyReport(sampleReport, "myrepo", "2026-03-31");
    expect(html).toContain("Relatorio Diario de Impacto");
    expect(html).toContain("myrepo");
    expect(html).toContain("2026-03-31");
    expect(html).toContain("Test summary");
    expect(html).toContain("MEDIUM");
    expect(html).toContain("PRs Merged");
    expect(html).toContain("Add users endpoint");
    expect(html).toContain("GET /api/users");
  });

  it("includes metrics", () => {
    const html = renderDailyReport(sampleReport, "myrepo", "2026-03-31");
    expect(html).toContain("1 PRs merged");
    expect(html).toContain("0 PRs abertos");
    expect(html).toContain("1 impactos");
  });

  it("handles empty report", () => {
    const emptyReport: DailyImpactReport = {
      summary: "No impacts found",
      mergedImpacts: [],
      openImpacts: [],
      overallRisk: "LOW",
      totalPrsAnalyzed: 0,
      totalImpactsFound: 0,
    };
    const html = renderDailyReport(emptyReport, "myrepo", "2026-03-31");
    expect(html).toContain("No impacts found");
    expect(html).toContain("LOW");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/shared/email-template.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/shared/email-template.ts
import type { DailyImpactReport } from "../modules/analyzer/report-generator";

const riskColors: Record<string, string> = {
  LOW: "#2ECC71",
  MEDIUM: "#F39C12",
  HIGH: "#E74C3C",
};

function renderImpactTable(
  title: string,
  impacts: { prId: number; prTitle: string; impacts: DailyImpactReport["mergedImpacts"][number]["impacts"] }[],
): string {
  if (impacts.length === 0) {
    return `<h3>${title}</h3><p>Nenhum impacto encontrado.</p>`;
  }

  const rows = impacts.flatMap((pr) =>
    pr.impacts.map((impact) => `
      <tr>
        <td>#${pr.prId} ${escapeHtml(pr.prTitle)}</td>
        <td>${escapeHtml(impact.category)}</td>
        <td><code>${escapeHtml(impact.file)}</code></td>
        <td>${escapeHtml(impact.affectedResource)}</td>
        <td><span style="color:${impact.impactType === "BREAKING" ? "#E74C3C" : impact.impactType === "COMPATIBLE" ? "#2ECC71" : "#3498DB"}">${impact.impactType}</span></td>
        <td>${escapeHtml(impact.recommendation)}</td>
      </tr>
    `),
  ).join("");

  return `
    <h3>${title}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">PR</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Categoria</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Arquivo</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Recurso</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Tipo</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #ddd;">Recomendacao</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderDailyReport(
  report: DailyImpactReport,
  repo: string,
  date: string,
): string {
  const riskColor = riskColors[report.overallRisk] ?? "#95A5A6";
  const mergedCount = report.mergedImpacts.length;
  const openCount = report.openImpacts.length;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:#f9f9f9;">
  <div style="max-width:800px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <h1 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;">Relatorio Diario de Impacto — ${escapeHtml(repo)} — ${escapeHtml(date)}</h1>
      <div style="display:inline-block;padding:4px 12px;border-radius:4px;color:#fff;font-size:13px;font-weight:600;background:${riskColor};">${report.overallRisk}</div>
      <p style="margin:16px 0 8px;color:#666;font-size:14px;">${mergedCount} PRs merged, ${openCount} PRs abertos, ${report.totalImpactsFound} impactos encontrados</p>
      <p style="margin:16px 0;color:#333;font-size:14px;line-height:1.6;">${escapeHtml(report.summary)}</p>
      ${renderImpactTable("PRs Merged (ja incorporados)", report.mergedImpacts)}
      <div style="margin-top:24px;"></div>
      ${renderImpactTable("PRs Abertos (pendentes de merge)", report.openImpacts)}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">
        Gerado automaticamente pelo Impact Analyzer
      </div>
    </div>
  </div>
</body>
</html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/shared/email-template.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/shared/email-template.ts apps/impact-analyzer/src/shared/email-template.test.ts
git commit -m "feat(impact-analyzer): email template with inline CSS and risk badges"
```

### Task 12: Create Email Sender + tests

**Files:**
- Create: `apps/impact-analyzer/src/modules/notifications/email-sender.ts`
- Create: `apps/impact-analyzer/src/modules/notifications/email-sender.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/modules/notifications/email-sender.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailSender } from "./email-sender";
import { EmailSendError } from "../../shared/errors";

describe("EmailSender", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends email to all recipients", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "abc123" });
    vi.mock("nodemailer", () => ({
      default: {
        createTransport: () => ({ sendMail }),
      },
    }));

    const sender = new EmailSender({
      host: "localhost",
      port: 1025,
      secure: false,
      from: "bot@example.com",
    });

    await sender.send(["a@example.com", "b@example.com"], "Test Subject", "<p>Test</p>");

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["a@example.com", "b@example.com"],
        subject: "Test Subject",
        html: "<p>Test</p>",
      }),
    );
  });

  it("throws EmailSendError on failure", async () => {
    vi.mock("nodemailer", () => ({
      default: {
        createTransport: () => ({
          sendMail: vi.fn().mockRejectedValue(new Error("SMTP error")),
        }),
      },
    }));

    const sender = new EmailSender({
      host: "localhost",
      port: 1025,
      secure: false,
      from: "bot@example.com",
    });

    await expect(
      sender.send(["a@example.com"], "Test", "<p>Test</p>"),
    ).rejects.toBeInstanceOf(EmailSendError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/modules/notifications/email-sender.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/modules/notifications/email-sender.ts
import nodemailer from "nodemailer";
import { EmailSendError } from "../../shared/errors";

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  user?: string;
  pass?: string;
}

export class EmailSender {
  private transporter;

  constructor(config: EmailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(to: string[], subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Impact Analyzer" <${this.from}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      throw new EmailSendError({
        message: `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
        cause: error,
      });
    }
  }

  private get from(): string {
    // Access from config — stored in transporter options
    return (this.transporter as any).options?.from?.split("<")[1]?.replace(">", "") ?? "bot@example.com";
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/modules/notifications/email-sender.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/modules/notifications/email-sender.ts apps/impact-analyzer/src/modules/notifications/email-sender.test.ts
git commit -m "feat(impact-analyzer): email sender with nodemailer"
```

---

## Chunk 7: Daily Job Service + Main Entry

### Task 13: Create Daily Job Service + tests

**Files:**
- Create: `apps/impact-analyzer/src/modules/scheduler/daily-job.service.ts`
- Create: `apps/impact-analyzer/src/modules/scheduler/daily-job.service.test.ts`

- [ ] **Step 1: Write tests**

```ts
// apps/impact-analyzer/src/modules/scheduler/daily-job.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DailyJobService } from "./daily-job.service";
import type { PrListFetcher } from "../analyzer/pr-list-fetcher";
import type { PrDiffFetcher } from "../analyzer/pr-diff-fetcher";
import type { FileClassifier } from "../analyzer/file-classifier";
import type { ReportGenerator } from "../analyzer/report-generator";
import type { EmailSender } from "../notifications/email-sender";
import type { Env } from "../../shared/env";

function makeMocks() {
  return {
    listPrs: vi.fn().mockResolvedValue({ merged: [], open: [] }),
    fetchDiff: vi.fn().mockResolvedValue([]),
    classify: vi.fn().mockReturnValue({ migrations: [], endpoints: [], schemas: [] }),
    generateReport: vi.fn().mockResolvedValue({
      summary: "Test",
      mergedImpacts: [],
      openImpacts: [],
      overallRisk: "LOW",
      totalPrsAnalyzed: 0,
      totalImpactsFound: 0,
    }),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    parseRouting: vi.fn().mockReturnValue(new Map([["myrepo", { teamName: "mobile", emails: ["a@x.com"] }]])),
  };
}

describe("DailyJobService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sk repos sem PRs nas ultimas 24h", async () => {
    const m = makeMocks();
    const service = new DailyJobService(
      { list: m.listPrs } as unknown as PrListFetcher,
      { fetch: m.fetchDiff } as unknown as PrDiffFetcher,
      { classify: m.classify } as unknown as typeof FileClassifier,
      { generate: m.generateReport } as unknown as ReportGenerator,
      { send: m.sendEmail } as unknown as EmailSender,
      m.parseRouting as unknown as (r: string) => Map<string, { teamName: string; emails: string[] }>,
      { AZURE_DEVOPS_DEFAULT_PROJECT: "PROJ" } as Env,
    );

    const result = await service.execute();
    expect(result.reposProcessed).toBe(1);
    expect(result.totalPrs).toBe(0);
    expect(m.sendEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/impact-analyzer && bun test src/modules/scheduler/daily-job.service.test.ts
```

- [ ] **Step 3: Write implementation**

```ts
// apps/impact-analyzer/src/modules/scheduler/daily-job.service.ts
import type { PrListFetcher } from "../analyzer/pr-list-fetcher";
import type { PrDiffFetcher } from "../analyzer/pr-diff-fetcher";
import { FileClassifier } from "../analyzer/file-classifier";
import type { ReportGenerator } from "../analyzer/report-generator";
import type { EmailSender } from "../notifications/email-sender";
import { renderDailyReport } from "../../shared/email-template";
import type { Env } from "../../shared/env";
import type { parseImpactRouting } from "../../shared/env";

export interface JobResult {
  reposProcessed: number;
  totalPrs: number;
  totalImpacts: number;
  emailsSent: number;
}

export class DailyJobService {
  constructor(
    private prListFetcher: PrListFetcher,
    private prDiffFetcher: PrDiffFetcher,
    private fileClassifier: typeof FileClassifier,
    private reportGenerator: ReportGenerator,
    private emailSender: EmailSender,
    private parseRouting: typeof parseImpactRouting,
    private env: Env,
  ) {}

  async execute(): Promise<JobResult> {
    const routing = this.parseRouting(this.env.IMPACT_ROUTING);
    let reposProcessed = 0;
    let totalPrs = 0;
    let totalImpacts = 0;
    let emailsSent = 0;

    for (const [repo, team] of routing) {
      try {
        const prList = await this.prListFetcher.list(repo, this.env.AZURE_DEVOPS_DEFAULT_PROJECT);
        const prCount = prList.merged.length + prList.open.length;
        totalPrs += prCount;

        if (prCount === 0) {
          console.log(`[impact-analyzer] No PRs in last 24h for ${repo}`);
          reposProcessed++;
          continue;
        }

        // Fetch diffs and classify
        const mergedWithDiffs = await Promise.all(
          prList.merged.map(async (pr) => ({
            pr,
            classified: this.fileClassifier.classify(
              await this.prDiffFetcher.fetch(repo, this.env.AZURE_DEVOPS_DEFAULT_PROJECT, pr.id),
            ),
          })),
        );

        const openWithDiffs = await Promise.all(
          prList.open.map(async (pr) => ({
            pr,
            classified: this.fileClassifier.classify(
              await this.prDiffFetcher.fetch(repo, this.env.AZURE_DEVOPS_DEFAULT_PROJECT, pr.id),
            ),
          })),
        );

        // Generate report
        const report = await this.reportGenerator.generate({
          repo,
          date: new Date().toISOString().split("T")[0],
          merged: mergedWithDiffs,
          open: openWithDiffs,
        });

        totalImpacts += report.totalImpactsFound;

        // Send email if there are impacts
        if (report.totalImpactsFound > 0) {
          const html = renderDailyReport(report, repo, new Date().toISOString().split("T")[0]);
          const subject = `[Impacto Diario] ${new Date().toISOString().split("T")[0]} — ${repo} → time ${team.teamName} — ${prList.merged.length} merged, ${prList.open.length} abertos`;
          await this.emailSender.send(team.emails, subject, html);
          emailsSent++;
        }

        reposProcessed++;
      } catch (error) {
        console.error(`[impact-analyzer] Error processing repo ${repo}:`, error);
      }
    }

    console.log(`[impact-analyzer] Done: ${reposProcessed} repos, ${totalPrs} PRs, ${totalImpacts} impacts, ${emailsSent} emails sent`);
    return { reposProcessed, totalPrs, totalImpacts, emailsSent };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/impact-analyzer && bun test src/modules/scheduler/daily-job.service.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/impact-analyzer/src/modules/scheduler/daily-job.service.ts apps/impact-analyzer/src/modules/scheduler/daily-job.service.test.ts
git commit -m "feat(impact-analyzer): daily job service orchestrator"
```

### Task 14: Create main.ts with cron + manual endpoint

**Files:**
- Create: `apps/impact-analyzer/src/main.ts`

- [ ] **Step 1: Write main.ts**

```ts
// apps/impact-analyzer/src/main.ts
import { Hono } from "hono";
import { logger } from "hono/logger";
import { Cron } from "croner";
import { AzureDevOpsClient } from "./shared/azure-devops-client";
import { PrListFetcher } from "./modules/analyzer/pr-list-fetcher";
import { PrDiffFetcher } from "./modules/analyzer/pr-diff-fetcher";
import { FileClassifier } from "./modules/analyzer/file-classifier";
import { ReportGenerator } from "./modules/analyzer/report-generator";
import { EmailSender } from "./modules/notifications/email-sender";
import { DailyJobService } from "./modules/scheduler/daily-job.service";
import { loadEnv, parseImpactRouting } from "./shared/env";

const env = loadEnv(process.env as Record<string, string>);

const app = new Hono();
app.use(logger());

// Build dependencies
const adoClient = new AzureDevOpsClient({
  org: env.AZURE_DEVOPS_ORG,
  pat: env.AZURE_DEVOPS_PAT,
  project: env.AZURE_DEVOPS_DEFAULT_PROJECT,
});
const prListFetcher = new PrListFetcher(adoClient);
const prDiffFetcher = new PrDiffFetcher(adoClient);
const reportGenerator = new ReportGenerator({
  apiKey: env.AI_PROVIDER_API_KEY,
  model: env.AI_MODEL,
  provider: env.AI_PROVIDER,
});
const emailSender = new EmailSender({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  from: env.SMTP_FROM,
  user: env.SMTP_USER || undefined,
  pass: env.SMTP_PASS || undefined,
});
const dailyJobService = new DailyJobService(
  prListFetcher,
  prDiffFetcher,
  FileClassifier,
  reportGenerator,
  emailSender,
  parseImpactRouting,
  env,
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Manual trigger
app.post("/run", async (c) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${env.ANALYZER_API_KEY}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await dailyJobService.execute();
    return c.json(result);
  } catch (error) {
    console.error("[impact-analyzer] Manual run failed:", error);
    return c.json({ error: "Job failed", details: String(error) }, 500);
  }
});

// Start server
const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});
console.log(`[impact-analyzer] Server running on port ${env.PORT}`);

// Schedule cron
const cron = new Cron(env.CRON_SCHEDULE, { timezone: env.CRON_TIMEZONE }, async () => {
  console.log("[impact-analyzer] Cron triggered");
  try {
    const result = await dailyJobService.execute();
    console.log("[impact-analyzer] Cron job completed:", result);
  } catch (error) {
    console.error("[impact-analyzer] Cron job failed:", error);
  }
});
console.log(`[impact-analyzer] Cron scheduled: ${env.CRON_SCHEDULE} (${env.CRON_TIMEZONE})`);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[impact-analyzer] Shutting down...");
  cron.stop();
  server.stop();
  process.exit(0);
});
```

- [ ] **Step 2: Verify app starts**

```bash
cd apps/impact-analyzer && bun run dev
```
Expected: Server starts on port 3000, cron scheduled. Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add apps/impact-analyzer/src/main.ts
git commit -m "feat(impact-analyzer): main entry with Hono server, cron scheduler, and manual endpoint"
```

---

## Chunk 8: Dockerfile + docker-compose + turbo.json

### Task 15: Create Dockerfile

**Files:**
- Create: `apps/impact-analyzer/Dockerfile`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM oven/bun:1.3.10 AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY tsconfig.base.json ./
COPY apps/impact-analyzer/package.json apps/impact-analyzer/
COPY apps/impact-analyzer/tsconfig.json apps/impact-analyzer/

RUN bun install --production --filter './apps/impact-analyzer'

COPY apps/impact-analyzer/src apps/impact-analyzer/src

FROM oven/bun:1.3.10-slim AS runtime
LABEL service="impact-analyzer"
WORKDIR /app

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/bun.lock /app/bun.lock
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/impact-analyzer/package.json /app/apps/impact-analyzer/package.json
COPY --from=builder /app/apps/impact-analyzer/node_modules /app/apps/impact-analyzer/node_modules
COPY --from=builder /app/apps/impact-analyzer/src /app/apps/impact-analyzer/src

EXPOSE 3000

CMD ["bun", "run", "apps/impact-analyzer/src/main.ts"]
```

### Task 16: Update docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add impact-analyzer service**

Append to `docker-compose.yml` before the `volumes:` section:

```yaml
  # ---------------------------------------------------------------------------
  # impact-analyzer — Daily PR impact analysis via cron
  # ---------------------------------------------------------------------------
  impact-analyzer:
    container_name: impact-analyzer
    build:
      context: .
      dockerfile: apps/impact-analyzer/Dockerfile
    ports:
      - "3000:3000"
    env_file: .env.local
    environment:
      NODE_ENV: production
      PORT: "3000"
      SMTP_HOST: mailpit
      SMTP_PORT: "1025"
      SMTP_SECURE: "false"
      SMTP_USER: ""
      SMTP_PASS: ""
    networks:
      - internal
    restart: unless-stopped
    depends_on:
      - mailpit
```

### Task 17: Update turbo.json

**Files:**
- Modify: `turbo.json`

- [ ] **Step 1: Add impact-analyzer to turbo pipeline**

No changes needed — turbo already has `build`, `lint`, `typecheck`, `test` tasks defined globally. The `@impact-analyzer` package will be picked up automatically since it has the matching scripts.

### Task 18: Run full CI check

- [ ] **Step 1: Run lint, typecheck, test**

```bash
cd apps/impact-analyzer && bun run lint && bun run typecheck && bun run test
```

- [ ] **Step 2: Commit**

```bash
git add apps/impact-analyzer/Dockerfile docker-compose.yml
git commit -m "feat(impact-analyzer): Dockerfile + docker-compose service"
```

---

Plan complete. 8 chunks, 18 tasks, all with TDD approach.
