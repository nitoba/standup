import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Injectable } from "@nestjs/common";
import { generateText, Output } from "ai";
import * as z from "zod";
import type {
  GatheredGitActivity,
  GeneratedStandup,
  GenerateStandupInput,
  StandupRecord,
} from "../../../shared/domain";
import { ExternalServiceError, Result } from "../../../shared/domain";
import { AppLoggerFactory } from "../../../shared/module/logger";
import { AzureDevopsEnrichmentService } from "../azure-devops/azure-devops-enrichment.service";
import type { EnrichedGitActivity } from "../azure-devops/types";
import { WorkerRuntimeConfigService } from "../worker-runtime-config.service";
import {
  MAX_STANDUP_CONTENT_CHARS,
  StandupPromptService,
} from "./standup-prompt.service";

const standupOutputSchema = z.object({
  content: z.string(),
  summary: z.string(),
});

type StandupOutput = z.infer<typeof standupOutputSchema>;

type GeneratorStage = "enriching_data" | "generating_standup";

export interface AdjustStandupInput {
  previousContent: string;
  instruction: string;
  extraContext?: string;
}

@Injectable()
export class StandupGeneratorService {
  private readonly logger: ReturnType<AppLoggerFactory["create"]>;

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly azureDevopsEnrichment: AzureDevopsEnrichmentService,
    private readonly standupPrompt: StandupPromptService,
  ) {
    this.logger = this.loggerFactory.create("standup-generator");
  }

  async generateStandup(
    input: GenerateStandupInput,
    onStageChange?: (stage: GeneratorStage) => Promise<void> | void,
  ): Promise<Result<GeneratedStandup, ExternalServiceError>> {
    const apiKey = this.runtimeConfig.config.AI_PROVIDER_API_KEY;

    return Result.gen(
      async function* (this: StandupGeneratorService) {
        await onStageChange?.("enriching_data");
        const enrichedActivity = await this.enrichWithFallback(
          input.gitActivity,
        );

        await onStageChange?.("generating_standup");
        const provider = createGoogleGenerativeAI({ apiKey });
        const systemPrompt = this.standupPrompt.buildSystemPrompt();

        let generated = yield* Result.await(
          this.withRetry(
            () =>
              this.runObjectGeneration(
                provider,
                systemPrompt,
                this.standupPrompt.buildUserMessage(input, enrichedActivity),
                "LLM standup generation failed",
              ),
            "LLM standup generation",
            3,
            2_000,
          ),
        );

        if (generated.content.length > MAX_STANDUP_CONTENT_CHARS) {
          generated = yield* Result.await(
            this.withRetry(
              () =>
                this.runObjectGeneration(
                  provider,
                  systemPrompt,
                  this.standupPrompt.buildRewriteUserMessage(
                    generated.content,
                    generated.summary,
                  ),
                  "LLM standup rewrite failed",
                ),
              "LLM standup rewrite",
              3,
              2_000,
            ),
          );
        }

        if (generated.content.length > MAX_STANDUP_CONTENT_CHARS) {
          yield* Result.err(
            new ExternalServiceError({
              service: "ai-provider",
              message: `Standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${generated.content.length})`,
            }),
          );
        }

        return Result.ok({
          content: generated.content,
          summary: generated.summary,
        });
      }.bind(this),
    );
  }

  async generateAdjustedStandup(
    input: AdjustStandupInput,
    onStageChange?: (stage: GeneratorStage) => Promise<void> | void,
  ): Promise<Result<GeneratedStandup, ExternalServiceError>> {
    const apiKey = this.runtimeConfig.config.AI_PROVIDER_API_KEY;

    return Result.gen(
      async function* (this: StandupGeneratorService) {
        if (!apiKey) {
          yield* Result.err(
            new ExternalServiceError({
              service: "ai-provider",
              message: "No authentication configured: set AI_PROVIDER_API_KEY",
            }),
          );
        }

        if (!input.previousContent.trim()) {
          yield* Result.err(
            new ExternalServiceError({
              service: "ai-provider",
              message: "Cannot adjust standup without previous content",
            }),
          );
        }

        if (!input.instruction.trim()) {
          yield* Result.err(
            new ExternalServiceError({
              service: "ai-provider",
              message: "Cannot adjust standup without user instruction",
            }),
          );
        }

        await onStageChange?.("generating_standup");
        const provider = createGoogleGenerativeAI({ apiKey });
        const systemPrompt = this.standupPrompt.buildSystemPrompt();

        let adjusted = yield* Result.await(
          this.withRetry(
            () =>
              this.runObjectGeneration(
                provider,
                systemPrompt,
                this.standupPrompt.buildAdjustUserMessage(
                  input.previousContent,
                  input.instruction,
                  input.extraContext,
                ),
                "LLM adjust failed",
              ),
            "LLM adjust",
            3,
            2_000,
          ),
        );

        if (adjusted.content.length > MAX_STANDUP_CONTENT_CHARS) {
          adjusted = yield* Result.await(
            this.withRetry(
              () =>
                this.runObjectGeneration(
                  provider,
                  systemPrompt,
                  this.standupPrompt.buildRewriteUserMessage(
                    adjusted.content,
                    adjusted.summary,
                  ),
                  "LLM rewrite after adjust failed",
                ),
              "LLM rewrite after adjust",
              3,
              2_000,
            ),
          );
        }

        if (adjusted.content.length > MAX_STANDUP_CONTENT_CHARS) {
          yield* Result.err(
            new ExternalServiceError({
              service: "ai-provider",
              message: `Adjusted standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${adjusted.content.length})`,
            }),
          );
        }

        return Result.ok({
          content: adjusted.content,
          summary: adjusted.summary,
        });
      }.bind(this),
    );
  }

  async generateWeeklyInsights(
    standups: StandupRecord[],
  ): Promise<Result<string, ExternalServiceError>> {
    if (standups.length === 0) {
      return Result.err(
        new ExternalServiceError({
          service: "ai-provider",
          message: "No standups provided for weekly insights generation",
        }),
      );
    }

    const apiKey = this.runtimeConfig.config.AI_PROVIDER_API_KEY;
    if (!apiKey) {
      return Result.err(
        new ExternalServiceError({
          service: "ai-provider",
          message: "No authentication configured: set AI_PROVIDER_API_KEY",
        }),
      );
    }

    return Result.tryPromise({
      try: async () => {
        const provider = createGoogleGenerativeAI({ apiKey });
        const { text } = await generateText({
          model: provider("gemini-3.1-flash-lite-preview"),
          system: this.standupPrompt.buildWeeklyInsightsSystemPrompt(),
          prompt: this.standupPrompt.buildWeeklyInsightsUserMessage(standups),
        });

        return text;
      },
      catch: (error) =>
        new ExternalServiceError({
          service: "ai-provider",
          message: `Weekly insights generation failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  determineMeetingType(dateString: string): string {
    return this.standupPrompt.determineMeetingType(dateString);
  }

  private async enrichWithFallback(
    gitActivity: GatheredGitActivity,
  ): Promise<EnrichedGitActivity> {
    const enrichmentResult = await this.withRetry(
      () => this.azureDevopsEnrichment.enrichGitActivity(gitActivity),
      "Azure DevOps enrichment",
      2,
      3_000,
    );

    if (enrichmentResult.isOk()) {
      return enrichmentResult.value;
    }

    return {
      timestamp: gitActivity.timestamp,
      userUuid: "unknown",
      repos: gitActivity.repos.map((repo) => ({
        ...repo,
        enrichedItems: [],
      })),
    };
  }

  private async withRetry<T>(
    fn: () => Promise<Result<T, ExternalServiceError>>,
    label: string,
    maxAttempts: number,
    baseDelayMs: number,
  ): Promise<Result<T, ExternalServiceError>> {
    let lastResult: Result<T, ExternalServiceError> | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastResult = await fn();

      if (lastResult.isOk()) {
        return lastResult;
      }

      this.logger.warn(`${label} failed`, {
        attempt,
        maxAttempts,
        error: lastResult.error.message,
      });

      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)),
        );
      }
    }

    // biome-ignore lint/style/noNonNullAssertion: set inside loop
    return lastResult!;
  }

  private runObjectGeneration(
    provider: ReturnType<typeof createGoogleGenerativeAI>,
    system: string,
    prompt: string,
    errorContext: string,
  ): Promise<Result<StandupOutput, ExternalServiceError>> {
    return Result.tryPromise({
      try: async () => {
        const { output } = await generateText({
          model: provider("gemini-3.1-flash-lite-preview"),
          output: Output.object({ schema: standupOutputSchema }),
          system,
          prompt,
        });

        return output;
      },
      catch: (error) =>
        new ExternalServiceError({
          service: "ai-provider",
          message: `${errorContext}: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }
}
