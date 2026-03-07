#!/usr/bin/env node

import { createRequire } from "node:module";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect$1 from "effect/Effect";
import * as Layer$1 from "effect/Layer";
import { Array as Array$1, Cache, Cause, Config, Data, DateTime, Deferred, Duration, Effect, Encoding, Exit, FileSystem, Layer, Logger, Option, Path, Predicate, PubSub, Queue, Random, Ref, Result, Schema, SchemaGetter, SchemaIssue, SchemaTransformation, Scope, ServiceMap, Stream, Struct } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import * as Net from "node:net";
import * as OS from "node:os";
import { homedir } from "node:os";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs, { accessSync, constants, existsSync, statSync } from "node:fs";
import path, { extname, join } from "node:path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as Crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { parsePatchFiles } from "@pierre/diffs";
import Mime from "@effect/platform-node/Mime";
import { EventEmitter } from "node:events";
import readline from "node:readline";
import util from "node:util";
import * as Semaphore from "effect/Semaphore";
import http from "node:http";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import { WebSocketServer } from "ws";
import fs$1 from "node:fs/promises";
import { clamp } from "effect/Number";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

//#region ../../packages/shared/src/Net.ts
var NetError = class extends Data.TaggedError("NetError") {};
function isErrnoExceptionWithCode(cause) {
	return typeof cause === "object" && cause !== null && "code" in cause && typeof cause.code === "string";
}
const closeServer = (server) => {
	try {
		server.close();
	} catch {}
};
const tryReservePort = (port) => Effect.callback((resume) => {
	const server = Net.createServer();
	let settled = false;
	const settle = (effect) => {
		if (settled) return;
		settled = true;
		resume(effect);
	};
	server.unref();
	server.once("error", (cause) => {
		settle(Effect.fail(new NetError({
			message: "Could not find an available port.",
			cause
		})));
	});
	server.listen(port, () => {
		const address = server.address();
		const resolved = typeof address === "object" && address !== null ? address.port : 0;
		server.close(() => {
			if (resolved > 0) {
				settle(Effect.succeed(resolved));
				return;
			}
			settle(Effect.fail(new NetError({ message: "Could not find an available port." })));
		});
	});
	return Effect.sync(() => {
		closeServer(server);
	});
});
/**
* NetService - Service tag for startup networking helpers.
*/
var NetService = class NetService extends ServiceMap.Service()("@t3tools/shared/Net/NetService") {
	static layer = Layer.sync(NetService, () => {
		/**
		* Returns true when a TCP server can bind to {host, port}.
		* `EADDRNOTAVAIL` is treated as available so IPv6-absent hosts don't fail
		* loopback availability checks.
		*/
		const canListenOnHost = (port, host) => Effect.callback((resume) => {
			const server = Net.createServer();
			let settled = false;
			const settle = (value) => {
				if (settled) return;
				settled = true;
				resume(Effect.succeed(value));
			};
			server.unref();
			server.once("error", (cause) => {
				if (isErrnoExceptionWithCode(cause) && cause.code === "EADDRNOTAVAIL") {
					settle(true);
					return;
				}
				settle(false);
			});
			server.once("listening", () => {
				server.close(() => {
					settle(true);
				});
			});
			server.listen({
				host,
				port
			});
			return Effect.sync(() => {
				closeServer(server);
			});
		});
		/**
		* Reserve an ephemeral loopback port and release it immediately.
		* Returns the reserved port number.
		*/
		const reserveLoopbackPort = (host = "127.0.0.1") => Effect.callback((resume) => {
			const probe = Net.createServer();
			let settled = false;
			const settle = (effect) => {
				if (settled) return;
				settled = true;
				resume(effect);
			};
			probe.once("error", (cause) => {
				settle(Effect.fail(new NetError({
					message: "Failed to reserve loopback port",
					cause
				})));
			});
			probe.listen(0, host, () => {
				const address = probe.address();
				const port = typeof address === "object" && address !== null ? address.port : 0;
				probe.close(() => {
					if (port > 0) {
						settle(Effect.succeed(port));
						return;
					}
					settle(Effect.fail(new NetError({ message: "Failed to reserve loopback port" })));
				});
			});
			return Effect.sync(() => {
				closeServer(probe);
			});
		});
		return {
			canListenOnHost,
			isPortAvailableOnLoopback: (port) => Effect.zipWith(canListenOnHost(port, "127.0.0.1"), canListenOnHost(port, "::1"), (ipv4, ipv6) => ipv4 && ipv6),
			reserveLoopbackPort,
			findAvailablePort: (preferred) => Effect.catch(tryReservePort(preferred), () => tryReservePort(0))
		};
	});
};

//#endregion
//#region src/config.ts
/**
* ServerConfig - Runtime configuration services.
*
* Defines process-level server configuration and networking helpers used by
* startup and runtime layers.
*
* @module ServerConfig
*/
const DEFAULT_PORT = 3773;
/**
* ServerConfig - Service tag for server runtime configuration.
*/
var ServerConfig$1 = class ServerConfig$1 extends ServiceMap.Service()("t3/config/ServerConfig") {
	static layerTest = (cwd, statedir) => Layer.effect(ServerConfig$1, Effect.gen(function* () {
		return {
			cwd,
			stateDir: statedir,
			mode: "web",
			autoBootstrapProjectFromCwd: false,
			logWebSocketEvents: false,
			port: 0,
			host: void 0,
			authToken: void 0,
			keybindingsConfigPath: (yield* Path.Path).join(statedir, "keybindings.json"),
			staticDir: void 0,
			devUrl: void 0,
			noBrowser: false
		};
	}));
};
const resolveStaticDir = Effect.fn(function* () {
	const { join, resolve } = yield* Path.Path;
	const { exists } = yield* FileSystem.FileSystem;
	const bundledClient = resolve(join(import.meta.dirname, "client"));
	if (yield* exists(join(bundledClient, "index.html")).pipe(Effect.orElseSucceed(() => false))) return bundledClient;
	const monorepoClient = resolve(join(import.meta.dirname, "../../web/dist"));
	if (yield* exists(join(monorepoClient, "index.html")).pipe(Effect.orElseSucceed(() => false))) return monorepoClient;
});

//#endregion
//#region ../../packages/shared/src/shell.ts
const PATH_CAPTURE_START = "__T3CODE_PATH_START__";
const PATH_CAPTURE_END = "__T3CODE_PATH_END__";
const PATH_CAPTURE_COMMAND = [
	`printf '%s\n' '${PATH_CAPTURE_START}'`,
	"printenv PATH",
	`printf '%s\n' '${PATH_CAPTURE_END}'`
].join("; ");
function extractPathFromShellOutput(output) {
	const startIndex = output.indexOf(PATH_CAPTURE_START);
	if (startIndex === -1) return null;
	const valueStartIndex = startIndex + 21;
	const endIndex = output.indexOf(PATH_CAPTURE_END, valueStartIndex);
	if (endIndex === -1) return null;
	const pathValue = output.slice(valueStartIndex, endIndex).trim();
	return pathValue.length > 0 ? pathValue : null;
}
function readPathFromLoginShell(shell, execFile = execFileSync) {
	return extractPathFromShellOutput(execFile(shell, ["-ilc", PATH_CAPTURE_COMMAND], {
		encoding: "utf8",
		timeout: 5e3
	})) ?? void 0;
}

//#endregion
//#region src/os-jank.ts
function fixPath() {
	if (process.platform !== "darwin") return;
	try {
		const result = readPathFromLoginShell(process.env.SHELL ?? "/bin/zsh");
		if (result) process.env.PATH = result;
	} catch {}
}
const expandHomePath = Effect.fn(function* (input) {
	const { join } = yield* Path.Path;
	if (input === "~") return OS.homedir();
	if (input.startsWith("~/") || input.startsWith("~\\")) return join(OS.homedir(), input.slice(2));
	return input;
});
const resolveStateDir = Effect.fn(function* (raw) {
	const { join, resolve } = yield* Path.Path;
	if (!raw || raw.trim().length === 0) return join(OS.homedir(), ".t3", "userdata");
	return resolve(yield* expandHomePath(raw.trim()));
});

//#endregion
//#region ../../packages/contracts/src/baseSchemas.ts
const TrimmedString = Schema.Trim;
const TrimmedNonEmptyString = TrimmedString.check(Schema.isNonEmpty());
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const IsoDateTime = Schema.String;
/**
* Construct a branded identifier. Enforces non-empty trimmed strings
*/
const makeEntityId = (brand) => TrimmedNonEmptyString.pipe(Schema.brand(brand));
const ThreadId = makeEntityId("ThreadId");
const ProjectId = makeEntityId("ProjectId");
const CommandId = makeEntityId("CommandId");
const EventId = makeEntityId("EventId");
const MessageId = makeEntityId("MessageId");
const TurnId = makeEntityId("TurnId");
const ProviderItemId = makeEntityId("ProviderItemId");
const RuntimeSessionId = makeEntityId("RuntimeSessionId");
const RuntimeItemId = makeEntityId("RuntimeItemId");
const RuntimeRequestId = makeEntityId("RuntimeRequestId");
const RuntimeTaskId = makeEntityId("RuntimeTaskId");
const ApprovalRequestId = makeEntityId("ApprovalRequestId");
const CheckpointRef = makeEntityId("CheckpointRef");

//#endregion
//#region ../../packages/contracts/src/terminal.ts
const DEFAULT_TERMINAL_ID = "default";
const TrimmedNonEmptyStringSchema$3 = TrimmedNonEmptyString;
const TerminalColsSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(20)).check(Schema.isLessThanOrEqualTo(400));
const TerminalRowsSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(5)).check(Schema.isLessThanOrEqualTo(200));
const TerminalIdSchema = TrimmedNonEmptyStringSchema$3.check(Schema.isMaxLength(128));
const TerminalEnvKeySchema = Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/)).check(Schema.isMaxLength(128));
const TerminalEnvValueSchema = Schema.String.check(Schema.isMaxLength(8192));
const TerminalEnvSchema = Schema.Record(TerminalEnvKeySchema, TerminalEnvValueSchema).check(Schema.isMaxProperties(128));
const TerminalIdWithDefaultSchema = TerminalIdSchema.pipe(Schema.withDecodingDefault(() => DEFAULT_TERMINAL_ID));
const TerminalThreadInput = Schema.Struct({ threadId: TrimmedNonEmptyStringSchema$3 });
const TerminalSessionInput = Schema.Struct({
	...TerminalThreadInput.fields,
	terminalId: TerminalIdWithDefaultSchema
});
const TerminalOpenInput = Schema.Struct({
	...TerminalSessionInput.fields,
	cwd: TrimmedNonEmptyStringSchema$3,
	cols: Schema.optional(TerminalColsSchema),
	rows: Schema.optional(TerminalRowsSchema),
	env: Schema.optional(TerminalEnvSchema)
});
const TerminalWriteInput = Schema.Struct({
	...TerminalSessionInput.fields,
	data: Schema.String.check(Schema.isNonEmpty()).check(Schema.isMaxLength(65536))
});
const TerminalResizeInput = Schema.Struct({
	...TerminalSessionInput.fields,
	cols: TerminalColsSchema,
	rows: TerminalRowsSchema
});
const TerminalClearInput = TerminalSessionInput;
const TerminalRestartInput = Schema.Struct({
	...TerminalThreadInput.fields,
	cwd: TrimmedNonEmptyStringSchema$3,
	cols: TerminalColsSchema,
	rows: TerminalRowsSchema,
	env: Schema.optional(TerminalEnvSchema)
});
const TerminalCloseInput = Schema.Struct({
	...TerminalThreadInput.fields,
	terminalId: Schema.optional(TerminalIdSchema),
	deleteHistory: Schema.optional(Schema.Boolean)
});
const TerminalSessionStatus = Schema.Literals([
	"starting",
	"running",
	"exited",
	"error"
]);
const TerminalSessionSnapshot = Schema.Struct({
	threadId: Schema.String.check(Schema.isNonEmpty()),
	terminalId: Schema.String.check(Schema.isNonEmpty()),
	cwd: Schema.String.check(Schema.isNonEmpty()),
	status: TerminalSessionStatus,
	pid: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
	history: Schema.String,
	exitCode: Schema.NullOr(Schema.Int),
	exitSignal: Schema.NullOr(Schema.Int),
	updatedAt: Schema.String
});
const TerminalEventBaseSchema = Schema.Struct({
	threadId: Schema.String.check(Schema.isNonEmpty()),
	terminalId: Schema.String.check(Schema.isNonEmpty()),
	createdAt: Schema.String
});
const TerminalStartedEvent = Schema.Struct({
	...TerminalEventBaseSchema.fields,
	type: Schema.Literal("started"),
	snapshot: TerminalSessionSnapshot
});
const TerminalOutputEvent = Schema.Struct({
	...TerminalEventBaseSchema.fields,
	type: Schema.Literal("output"),
	data: Schema.String
});
const TerminalExitedEvent = Schema.Struct({
	...TerminalEventBaseSchema.fields,
	type: Schema.Literal("exited"),
	exitCode: Schema.NullOr(Schema.Int),
	exitSignal: Schema.NullOr(Schema.Int)
});
const TerminalErrorEvent = Schema.Struct({
	...TerminalEventBaseSchema.fields,
	type: Schema.Literal("error"),
	message: Schema.String.check(Schema.isNonEmpty())
});
const TerminalClearedEvent = Schema.Struct({
	...TerminalEventBaseSchema.fields,
	type: Schema.Literal("cleared")
});
const TerminalRestartedEvent = Schema.Struct({
	...TerminalEventBaseSchema.fields,
	type: Schema.Literal("restarted"),
	snapshot: TerminalSessionSnapshot
});
const TerminalActivityEvent = Schema.Struct({
	...TerminalEventBaseSchema.fields,
	type: Schema.Literal("activity"),
	hasRunningSubprocess: Schema.Boolean
});
const TerminalEvent = Schema.Union([
	TerminalStartedEvent,
	TerminalOutputEvent,
	TerminalExitedEvent,
	TerminalErrorEvent,
	TerminalClearedEvent,
	TerminalRestartedEvent,
	TerminalActivityEvent
]);

//#endregion
//#region ../../packages/contracts/src/model.ts
const CODEX_REASONING_EFFORT_OPTIONS = [
	"xhigh",
	"high",
	"medium",
	"low"
];
const CodexModelOptions = Schema.Struct({
	reasoningEffort: Schema.optional(Schema.Literals(CODEX_REASONING_EFFORT_OPTIONS)),
	fastMode: Schema.optional(Schema.Boolean)
});
const ProviderModelOptions = Schema.Struct({ codex: Schema.optional(CodexModelOptions) });
const MODEL_OPTIONS_BY_PROVIDER = { codex: [
	{
		slug: "gpt-5.4",
		name: "GPT-5.4"
	},
	{
		slug: "gpt-5.3-codex",
		name: "GPT-5.3 Codex"
	},
	{
		slug: "gpt-5.3-codex-spark",
		name: "GPT-5.3 Codex Spark"
	},
	{
		slug: "gpt-5.2-codex",
		name: "GPT-5.2 Codex"
	},
	{
		slug: "gpt-5.2",
		name: "GPT-5.2"
	}
] };
const MODEL_SLUG_ALIASES_BY_PROVIDER = { codex: {
	"5.4": "gpt-5.4",
	"5.3": "gpt-5.3-codex",
	"gpt-5.3": "gpt-5.3-codex",
	"5.3-spark": "gpt-5.3-codex-spark",
	"gpt-5.3-spark": "gpt-5.3-codex-spark"
} };

//#endregion
//#region ../../packages/contracts/src/orchestration.ts
const ORCHESTRATION_WS_METHODS = {
	getSnapshot: "orchestration.getSnapshot",
	dispatchCommand: "orchestration.dispatchCommand",
	getTurnDiff: "orchestration.getTurnDiff",
	getFullThreadDiff: "orchestration.getFullThreadDiff",
	replayEvents: "orchestration.replayEvents"
};
const ORCHESTRATION_WS_CHANNELS = { domainEvent: "orchestration.domainEvent" };
const ProviderKind = Schema.Literal("codex");
const ProviderApprovalPolicy = Schema.Literals([
	"untrusted",
	"on-failure",
	"on-request",
	"never"
]);
const ProviderSandboxMode = Schema.Literals([
	"read-only",
	"workspace-write",
	"danger-full-access"
]);
const ProviderServiceTier = Schema.Literals(["fast", "flex"]);
const RuntimeMode = Schema.Literals(["approval-required", "full-access"]);
const DEFAULT_RUNTIME_MODE$2 = "full-access";
const ProviderInteractionMode = Schema.Literals(["default", "plan"]);
const DEFAULT_PROVIDER_INTERACTION_MODE = "default";
const ProviderRequestKind = Schema.Literals([
	"command",
	"file-read",
	"file-change"
]);
const AssistantDeliveryMode = Schema.Literals(["buffered", "streaming"]);
const ProviderApprovalDecision = Schema.Literals([
	"accept",
	"acceptForSession",
	"decline",
	"cancel"
]);
const ProviderUserInputAnswers = Schema.Record(Schema.String, Schema.Unknown);
const PROVIDER_SEND_TURN_MAX_INPUT_CHARS = 12e4;
const PROVIDER_SEND_TURN_MAX_ATTACHMENTS = 8;
const PROVIDER_SEND_TURN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PROVIDER_SEND_TURN_MAX_IMAGE_DATA_URL_CHARS = 14e6;
const CHAT_ATTACHMENT_ID_MAX_CHARS = 128;
const ChatAttachmentId = TrimmedNonEmptyString.check(Schema.isMaxLength(CHAT_ATTACHMENT_ID_MAX_CHARS), Schema.isPattern(/^[a-z0-9_-]+$/i));
const ChatImageAttachment = Schema.Struct({
	type: Schema.Literal("image"),
	id: ChatAttachmentId,
	name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
	mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100), Schema.isPattern(/^image\//i)),
	sizeBytes: NonNegativeInt.check(Schema.isLessThanOrEqualTo(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES))
});
const UploadChatImageAttachment = Schema.Struct({
	type: Schema.Literal("image"),
	name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
	mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100), Schema.isPattern(/^image\//i)),
	sizeBytes: NonNegativeInt.check(Schema.isLessThanOrEqualTo(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES)),
	dataUrl: TrimmedNonEmptyString.check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_IMAGE_DATA_URL_CHARS))
});
const ChatAttachment = Schema.Union([ChatImageAttachment]);
const UploadChatAttachment = Schema.Union([UploadChatImageAttachment]);
const ProjectScriptIcon = Schema.Literals([
	"play",
	"test",
	"lint",
	"configure",
	"build",
	"debug"
]);
const ProjectScript = Schema.Struct({
	id: TrimmedNonEmptyString,
	name: TrimmedNonEmptyString,
	command: TrimmedNonEmptyString,
	icon: ProjectScriptIcon,
	runOnWorktreeCreate: Schema.Boolean
});
const OrchestrationProject = Schema.Struct({
	id: ProjectId,
	title: TrimmedNonEmptyString,
	workspaceRoot: TrimmedNonEmptyString,
	defaultModel: Schema.NullOr(TrimmedNonEmptyString),
	scripts: Schema.Array(ProjectScript),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime,
	deletedAt: Schema.NullOr(IsoDateTime)
});
const OrchestrationMessageRole = Schema.Literals([
	"user",
	"assistant",
	"system"
]);
const OrchestrationMessage = Schema.Struct({
	id: MessageId,
	role: OrchestrationMessageRole,
	text: Schema.String,
	attachments: Schema.optional(Schema.Array(ChatAttachment)),
	turnId: Schema.NullOr(TurnId),
	streaming: Schema.Boolean,
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime
});
const OrchestrationProposedPlanId = TrimmedNonEmptyString;
const OrchestrationProposedPlan = Schema.Struct({
	id: OrchestrationProposedPlanId,
	turnId: Schema.NullOr(TurnId),
	planMarkdown: TrimmedNonEmptyString,
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime
});
const OrchestrationSessionStatus = Schema.Literals([
	"idle",
	"starting",
	"running",
	"ready",
	"interrupted",
	"stopped",
	"error"
]);
const OrchestrationSession = Schema.Struct({
	threadId: ThreadId,
	status: OrchestrationSessionStatus,
	providerName: Schema.NullOr(TrimmedNonEmptyString),
	runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE$2)),
	activeTurnId: Schema.NullOr(TurnId),
	lastError: Schema.NullOr(TrimmedNonEmptyString),
	updatedAt: IsoDateTime
});
const OrchestrationCheckpointFile = Schema.Struct({
	path: TrimmedNonEmptyString,
	kind: TrimmedNonEmptyString,
	additions: NonNegativeInt,
	deletions: NonNegativeInt
});
const OrchestrationCheckpointStatus = Schema.Literals([
	"ready",
	"missing",
	"error"
]);
const OrchestrationCheckpointSummary = Schema.Struct({
	turnId: TurnId,
	checkpointTurnCount: NonNegativeInt,
	checkpointRef: CheckpointRef,
	status: OrchestrationCheckpointStatus,
	files: Schema.Array(OrchestrationCheckpointFile),
	assistantMessageId: Schema.NullOr(MessageId),
	completedAt: IsoDateTime
});
const OrchestrationThreadActivityTone = Schema.Literals([
	"info",
	"tool",
	"approval",
	"error"
]);
const OrchestrationThreadActivity = Schema.Struct({
	id: EventId,
	tone: OrchestrationThreadActivityTone,
	kind: TrimmedNonEmptyString,
	summary: TrimmedNonEmptyString,
	payload: Schema.Unknown,
	turnId: Schema.NullOr(TurnId),
	sequence: Schema.optional(NonNegativeInt),
	createdAt: IsoDateTime
});
const OrchestrationLatestTurnState = Schema.Literals([
	"running",
	"interrupted",
	"completed",
	"error"
]);
const OrchestrationLatestTurn = Schema.Struct({
	turnId: TurnId,
	state: OrchestrationLatestTurnState,
	requestedAt: IsoDateTime,
	startedAt: Schema.NullOr(IsoDateTime),
	completedAt: Schema.NullOr(IsoDateTime),
	assistantMessageId: Schema.NullOr(MessageId)
});
const OrchestrationThread = Schema.Struct({
	id: ThreadId,
	projectId: ProjectId,
	title: TrimmedNonEmptyString,
	model: TrimmedNonEmptyString,
	runtimeMode: RuntimeMode,
	interactionMode: ProviderInteractionMode.pipe(Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE)),
	branch: Schema.NullOr(TrimmedNonEmptyString),
	worktreePath: Schema.NullOr(TrimmedNonEmptyString),
	latestTurn: Schema.NullOr(OrchestrationLatestTurn),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime,
	deletedAt: Schema.NullOr(IsoDateTime),
	messages: Schema.Array(OrchestrationMessage),
	proposedPlans: Schema.Array(OrchestrationProposedPlan).pipe(Schema.withDecodingDefault(() => [])),
	activities: Schema.Array(OrchestrationThreadActivity),
	checkpoints: Schema.Array(OrchestrationCheckpointSummary),
	session: Schema.NullOr(OrchestrationSession)
});
const OrchestrationReadModel = Schema.Struct({
	snapshotSequence: NonNegativeInt,
	projects: Schema.Array(OrchestrationProject),
	threads: Schema.Array(OrchestrationThread),
	updatedAt: IsoDateTime
});
const ProjectCreateCommand = Schema.Struct({
	type: Schema.Literal("project.create"),
	commandId: CommandId,
	projectId: ProjectId,
	title: TrimmedNonEmptyString,
	workspaceRoot: TrimmedNonEmptyString,
	defaultModel: Schema.optional(TrimmedNonEmptyString),
	createdAt: IsoDateTime
});
const ProjectMetaUpdateCommand = Schema.Struct({
	type: Schema.Literal("project.meta.update"),
	commandId: CommandId,
	projectId: ProjectId,
	title: Schema.optional(TrimmedNonEmptyString),
	workspaceRoot: Schema.optional(TrimmedNonEmptyString),
	defaultModel: Schema.optional(TrimmedNonEmptyString),
	scripts: Schema.optional(Schema.Array(ProjectScript))
});
const ProjectDeleteCommand = Schema.Struct({
	type: Schema.Literal("project.delete"),
	commandId: CommandId,
	projectId: ProjectId
});
const ThreadCreateCommand = Schema.Struct({
	type: Schema.Literal("thread.create"),
	commandId: CommandId,
	threadId: ThreadId,
	projectId: ProjectId,
	title: TrimmedNonEmptyString,
	model: TrimmedNonEmptyString,
	runtimeMode: RuntimeMode,
	interactionMode: ProviderInteractionMode.pipe(Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE)),
	branch: Schema.NullOr(TrimmedNonEmptyString),
	worktreePath: Schema.NullOr(TrimmedNonEmptyString),
	createdAt: IsoDateTime
});
const ThreadDeleteCommand = Schema.Struct({
	type: Schema.Literal("thread.delete"),
	commandId: CommandId,
	threadId: ThreadId
});
const ThreadMetaUpdateCommand = Schema.Struct({
	type: Schema.Literal("thread.meta.update"),
	commandId: CommandId,
	threadId: ThreadId,
	title: Schema.optional(TrimmedNonEmptyString),
	model: Schema.optional(TrimmedNonEmptyString),
	branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
	worktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString))
});
const ThreadRuntimeModeSetCommand = Schema.Struct({
	type: Schema.Literal("thread.runtime-mode.set"),
	commandId: CommandId,
	threadId: ThreadId,
	runtimeMode: RuntimeMode,
	createdAt: IsoDateTime
});
const ThreadInteractionModeSetCommand = Schema.Struct({
	type: Schema.Literal("thread.interaction-mode.set"),
	commandId: CommandId,
	threadId: ThreadId,
	interactionMode: ProviderInteractionMode,
	createdAt: IsoDateTime
});
const ThreadTurnStartCommand = Schema.Struct({
	type: Schema.Literal("thread.turn.start"),
	commandId: CommandId,
	threadId: ThreadId,
	message: Schema.Struct({
		messageId: MessageId,
		role: Schema.Literal("user"),
		text: Schema.String,
		attachments: Schema.Array(ChatAttachment)
	}),
	provider: Schema.optional(ProviderKind),
	model: Schema.optional(TrimmedNonEmptyString),
	serviceTier: Schema.optional(Schema.NullOr(ProviderServiceTier)),
	modelOptions: Schema.optional(ProviderModelOptions),
	assistantDeliveryMode: Schema.optional(AssistantDeliveryMode),
	runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE$2)),
	interactionMode: ProviderInteractionMode.pipe(Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE)),
	createdAt: IsoDateTime
});
const ClientThreadTurnStartCommand = Schema.Struct({
	type: Schema.Literal("thread.turn.start"),
	commandId: CommandId,
	threadId: ThreadId,
	message: Schema.Struct({
		messageId: MessageId,
		role: Schema.Literal("user"),
		text: Schema.String,
		attachments: Schema.Array(UploadChatAttachment)
	}),
	provider: Schema.optional(ProviderKind),
	model: Schema.optional(TrimmedNonEmptyString),
	serviceTier: Schema.optional(Schema.NullOr(ProviderServiceTier)),
	modelOptions: Schema.optional(ProviderModelOptions),
	assistantDeliveryMode: Schema.optional(AssistantDeliveryMode),
	runtimeMode: RuntimeMode,
	interactionMode: ProviderInteractionMode,
	createdAt: IsoDateTime
});
const ThreadTurnInterruptCommand = Schema.Struct({
	type: Schema.Literal("thread.turn.interrupt"),
	commandId: CommandId,
	threadId: ThreadId,
	turnId: Schema.optional(TurnId),
	createdAt: IsoDateTime
});
const ThreadApprovalRespondCommand = Schema.Struct({
	type: Schema.Literal("thread.approval.respond"),
	commandId: CommandId,
	threadId: ThreadId,
	requestId: ApprovalRequestId,
	decision: ProviderApprovalDecision,
	createdAt: IsoDateTime
});
const ThreadUserInputRespondCommand = Schema.Struct({
	type: Schema.Literal("thread.user-input.respond"),
	commandId: CommandId,
	threadId: ThreadId,
	requestId: ApprovalRequestId,
	answers: ProviderUserInputAnswers,
	createdAt: IsoDateTime
});
const ThreadCheckpointRevertCommand = Schema.Struct({
	type: Schema.Literal("thread.checkpoint.revert"),
	commandId: CommandId,
	threadId: ThreadId,
	turnCount: NonNegativeInt,
	createdAt: IsoDateTime
});
const ThreadSessionStopCommand = Schema.Struct({
	type: Schema.Literal("thread.session.stop"),
	commandId: CommandId,
	threadId: ThreadId,
	createdAt: IsoDateTime
});
const DispatchableClientOrchestrationCommand = Schema.Union([
	ProjectCreateCommand,
	ProjectMetaUpdateCommand,
	ProjectDeleteCommand,
	ThreadCreateCommand,
	ThreadDeleteCommand,
	ThreadMetaUpdateCommand,
	ThreadRuntimeModeSetCommand,
	ThreadInteractionModeSetCommand,
	ThreadTurnStartCommand,
	ThreadTurnInterruptCommand,
	ThreadApprovalRespondCommand,
	ThreadUserInputRespondCommand,
	ThreadCheckpointRevertCommand,
	ThreadSessionStopCommand
]);
const ClientOrchestrationCommand = Schema.Union([
	ProjectCreateCommand,
	ProjectMetaUpdateCommand,
	ProjectDeleteCommand,
	ThreadCreateCommand,
	ThreadDeleteCommand,
	ThreadMetaUpdateCommand,
	ThreadRuntimeModeSetCommand,
	ThreadInteractionModeSetCommand,
	ClientThreadTurnStartCommand,
	ThreadTurnInterruptCommand,
	ThreadApprovalRespondCommand,
	ThreadUserInputRespondCommand,
	ThreadCheckpointRevertCommand,
	ThreadSessionStopCommand
]);
const ThreadSessionSetCommand = Schema.Struct({
	type: Schema.Literal("thread.session.set"),
	commandId: CommandId,
	threadId: ThreadId,
	session: OrchestrationSession,
	createdAt: IsoDateTime
});
const ThreadMessageAssistantDeltaCommand = Schema.Struct({
	type: Schema.Literal("thread.message.assistant.delta"),
	commandId: CommandId,
	threadId: ThreadId,
	messageId: MessageId,
	delta: Schema.String,
	turnId: Schema.optional(TurnId),
	createdAt: IsoDateTime
});
const ThreadMessageAssistantCompleteCommand = Schema.Struct({
	type: Schema.Literal("thread.message.assistant.complete"),
	commandId: CommandId,
	threadId: ThreadId,
	messageId: MessageId,
	turnId: Schema.optional(TurnId),
	createdAt: IsoDateTime
});
const ThreadProposedPlanUpsertCommand = Schema.Struct({
	type: Schema.Literal("thread.proposed-plan.upsert"),
	commandId: CommandId,
	threadId: ThreadId,
	proposedPlan: OrchestrationProposedPlan,
	createdAt: IsoDateTime
});
const ThreadTurnDiffCompleteCommand = Schema.Struct({
	type: Schema.Literal("thread.turn.diff.complete"),
	commandId: CommandId,
	threadId: ThreadId,
	turnId: TurnId,
	completedAt: IsoDateTime,
	checkpointRef: CheckpointRef,
	status: OrchestrationCheckpointStatus,
	files: Schema.Array(OrchestrationCheckpointFile),
	assistantMessageId: Schema.optional(MessageId),
	checkpointTurnCount: NonNegativeInt,
	createdAt: IsoDateTime
});
const ThreadActivityAppendCommand = Schema.Struct({
	type: Schema.Literal("thread.activity.append"),
	commandId: CommandId,
	threadId: ThreadId,
	activity: OrchestrationThreadActivity,
	createdAt: IsoDateTime
});
const ThreadRevertCompleteCommand = Schema.Struct({
	type: Schema.Literal("thread.revert.complete"),
	commandId: CommandId,
	threadId: ThreadId,
	turnCount: NonNegativeInt,
	createdAt: IsoDateTime
});
const InternalOrchestrationCommand = Schema.Union([
	ThreadSessionSetCommand,
	ThreadMessageAssistantDeltaCommand,
	ThreadMessageAssistantCompleteCommand,
	ThreadProposedPlanUpsertCommand,
	ThreadTurnDiffCompleteCommand,
	ThreadActivityAppendCommand,
	ThreadRevertCompleteCommand
]);
const OrchestrationCommand = Schema.Union([DispatchableClientOrchestrationCommand, InternalOrchestrationCommand]);
const OrchestrationEventType = Schema.Literals([
	"project.created",
	"project.meta-updated",
	"project.deleted",
	"thread.created",
	"thread.deleted",
	"thread.meta-updated",
	"thread.runtime-mode-set",
	"thread.interaction-mode-set",
	"thread.message-sent",
	"thread.turn-start-requested",
	"thread.turn-interrupt-requested",
	"thread.approval-response-requested",
	"thread.user-input-response-requested",
	"thread.checkpoint-revert-requested",
	"thread.reverted",
	"thread.session-stop-requested",
	"thread.session-set",
	"thread.proposed-plan-upserted",
	"thread.turn-diff-completed",
	"thread.activity-appended"
]);
const OrchestrationAggregateKind = Schema.Literals(["project", "thread"]);
const OrchestrationActorKind = Schema.Literals([
	"client",
	"server",
	"provider"
]);
const ProjectCreatedPayload$1 = Schema.Struct({
	projectId: ProjectId,
	title: TrimmedNonEmptyString,
	workspaceRoot: TrimmedNonEmptyString,
	defaultModel: Schema.NullOr(TrimmedNonEmptyString),
	scripts: Schema.Array(ProjectScript),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime
});
const ProjectMetaUpdatedPayload$1 = Schema.Struct({
	projectId: ProjectId,
	title: Schema.optional(TrimmedNonEmptyString),
	workspaceRoot: Schema.optional(TrimmedNonEmptyString),
	defaultModel: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
	scripts: Schema.optional(Schema.Array(ProjectScript)),
	updatedAt: IsoDateTime
});
const ProjectDeletedPayload$1 = Schema.Struct({
	projectId: ProjectId,
	deletedAt: IsoDateTime
});
const ThreadCreatedPayload$1 = Schema.Struct({
	threadId: ThreadId,
	projectId: ProjectId,
	title: TrimmedNonEmptyString,
	model: TrimmedNonEmptyString,
	runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE$2)),
	interactionMode: ProviderInteractionMode.pipe(Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE)),
	branch: Schema.NullOr(TrimmedNonEmptyString),
	worktreePath: Schema.NullOr(TrimmedNonEmptyString),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime
});
const ThreadDeletedPayload$1 = Schema.Struct({
	threadId: ThreadId,
	deletedAt: IsoDateTime
});
const ThreadMetaUpdatedPayload$1 = Schema.Struct({
	threadId: ThreadId,
	title: Schema.optional(TrimmedNonEmptyString),
	model: Schema.optional(TrimmedNonEmptyString),
	branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
	worktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
	updatedAt: IsoDateTime
});
const ThreadRuntimeModeSetPayload$1 = Schema.Struct({
	threadId: ThreadId,
	runtimeMode: RuntimeMode,
	updatedAt: IsoDateTime
});
const ThreadInteractionModeSetPayload$1 = Schema.Struct({
	threadId: ThreadId,
	interactionMode: ProviderInteractionMode.pipe(Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE)),
	updatedAt: IsoDateTime
});
const ThreadMessageSentPayload = Schema.Struct({
	threadId: ThreadId,
	messageId: MessageId,
	role: OrchestrationMessageRole,
	text: Schema.String,
	attachments: Schema.optional(Schema.Array(ChatAttachment)),
	turnId: Schema.NullOr(TurnId),
	streaming: Schema.Boolean,
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime
});
const ThreadTurnStartRequestedPayload = Schema.Struct({
	threadId: ThreadId,
	messageId: MessageId,
	provider: Schema.optional(ProviderKind),
	model: Schema.optional(TrimmedNonEmptyString),
	serviceTier: Schema.optional(Schema.NullOr(ProviderServiceTier)),
	modelOptions: Schema.optional(ProviderModelOptions),
	assistantDeliveryMode: Schema.optional(AssistantDeliveryMode),
	runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE$2)),
	interactionMode: ProviderInteractionMode.pipe(Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE)),
	createdAt: IsoDateTime
});
const ThreadTurnInterruptRequestedPayload = Schema.Struct({
	threadId: ThreadId,
	turnId: Schema.optional(TurnId),
	createdAt: IsoDateTime
});
const ThreadApprovalResponseRequestedPayload = Schema.Struct({
	threadId: ThreadId,
	requestId: ApprovalRequestId,
	decision: ProviderApprovalDecision,
	createdAt: IsoDateTime
});
const ThreadUserInputResponseRequestedPayload = Schema.Struct({
	threadId: ThreadId,
	requestId: ApprovalRequestId,
	answers: ProviderUserInputAnswers,
	createdAt: IsoDateTime
});
const ThreadCheckpointRevertRequestedPayload = Schema.Struct({
	threadId: ThreadId,
	turnCount: NonNegativeInt,
	createdAt: IsoDateTime
});
const ThreadRevertedPayload$1 = Schema.Struct({
	threadId: ThreadId,
	turnCount: NonNegativeInt
});
const ThreadSessionStopRequestedPayload = Schema.Struct({
	threadId: ThreadId,
	createdAt: IsoDateTime
});
const ThreadSessionSetPayload$1 = Schema.Struct({
	threadId: ThreadId,
	session: OrchestrationSession
});
const ThreadProposedPlanUpsertedPayload$1 = Schema.Struct({
	threadId: ThreadId,
	proposedPlan: OrchestrationProposedPlan
});
const ThreadTurnDiffCompletedPayload$1 = Schema.Struct({
	threadId: ThreadId,
	turnId: TurnId,
	checkpointTurnCount: NonNegativeInt,
	checkpointRef: CheckpointRef,
	status: OrchestrationCheckpointStatus,
	files: Schema.Array(OrchestrationCheckpointFile),
	assistantMessageId: Schema.NullOr(MessageId),
	completedAt: IsoDateTime
});
const ThreadActivityAppendedPayload$1 = Schema.Struct({
	threadId: ThreadId,
	activity: OrchestrationThreadActivity
});
const OrchestrationEventMetadata = Schema.Struct({
	providerTurnId: Schema.optional(TrimmedNonEmptyString),
	providerItemId: Schema.optional(ProviderItemId),
	adapterKey: Schema.optional(TrimmedNonEmptyString),
	requestId: Schema.optional(ApprovalRequestId),
	ingestedAt: Schema.optional(IsoDateTime)
});
const EventBaseFields = {
	sequence: NonNegativeInt,
	eventId: EventId,
	aggregateKind: OrchestrationAggregateKind,
	aggregateId: Schema.Union([ProjectId, ThreadId]),
	occurredAt: IsoDateTime,
	commandId: Schema.NullOr(CommandId),
	causationEventId: Schema.NullOr(EventId),
	correlationId: Schema.NullOr(CommandId),
	metadata: OrchestrationEventMetadata
};
const PersistedEventBaseFields = {
	sequence: NonNegativeInt,
	eventId: EventId,
	aggregateKind: OrchestrationAggregateKind,
	streamId: Schema.Union([ProjectId, ThreadId]),
	streamVersion: NonNegativeInt,
	occurredAt: IsoDateTime,
	commandId: Schema.NullOr(CommandId),
	causationEventId: Schema.NullOr(EventId),
	correlationId: Schema.NullOr(CommandId),
	actorKind: OrchestrationActorKind,
	metadata: OrchestrationEventMetadata
};
const OrchestrationEvent = Schema.Union([
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("project.created"),
		payload: ProjectCreatedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("project.meta-updated"),
		payload: ProjectMetaUpdatedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("project.deleted"),
		payload: ProjectDeletedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.created"),
		payload: ThreadCreatedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.deleted"),
		payload: ThreadDeletedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.meta-updated"),
		payload: ThreadMetaUpdatedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.runtime-mode-set"),
		payload: ThreadRuntimeModeSetPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.interaction-mode-set"),
		payload: ThreadInteractionModeSetPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.message-sent"),
		payload: ThreadMessageSentPayload
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.turn-start-requested"),
		payload: ThreadTurnStartRequestedPayload
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.turn-interrupt-requested"),
		payload: ThreadTurnInterruptRequestedPayload
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.approval-response-requested"),
		payload: ThreadApprovalResponseRequestedPayload
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.user-input-response-requested"),
		payload: ThreadUserInputResponseRequestedPayload
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.checkpoint-revert-requested"),
		payload: ThreadCheckpointRevertRequestedPayload
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.reverted"),
		payload: ThreadRevertedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.session-stop-requested"),
		payload: ThreadSessionStopRequestedPayload
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.session-set"),
		payload: ThreadSessionSetPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.proposed-plan-upserted"),
		payload: ThreadProposedPlanUpsertedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.turn-diff-completed"),
		payload: ThreadTurnDiffCompletedPayload$1
	}),
	Schema.Struct({
		...EventBaseFields,
		type: Schema.Literal("thread.activity-appended"),
		payload: ThreadActivityAppendedPayload$1
	})
]);
const OrchestrationPersistedEvent = Schema.Union([
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("project.created"),
		payload: ProjectCreatedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("project.meta-updated"),
		payload: ProjectMetaUpdatedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("project.deleted"),
		payload: ProjectDeletedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.created"),
		payload: ThreadCreatedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.deleted"),
		payload: ThreadDeletedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.meta-updated"),
		payload: ThreadMetaUpdatedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.runtime-mode-set"),
		payload: ThreadRuntimeModeSetPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.interaction-mode-set"),
		payload: ThreadInteractionModeSetPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.message-sent"),
		payload: ThreadMessageSentPayload
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.turn-start-requested"),
		payload: ThreadTurnStartRequestedPayload
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.turn-interrupt-requested"),
		payload: ThreadTurnInterruptRequestedPayload
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.approval-response-requested"),
		payload: ThreadApprovalResponseRequestedPayload
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.user-input-response-requested"),
		payload: ThreadUserInputResponseRequestedPayload
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.checkpoint-revert-requested"),
		payload: ThreadCheckpointRevertRequestedPayload
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.reverted"),
		payload: ThreadRevertedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.session-stop-requested"),
		payload: ThreadSessionStopRequestedPayload
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.session-set"),
		payload: ThreadSessionSetPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.proposed-plan-upserted"),
		payload: ThreadProposedPlanUpsertedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.turn-diff-completed"),
		payload: ThreadTurnDiffCompletedPayload$1
	}),
	Schema.Struct({
		...PersistedEventBaseFields,
		eventType: Schema.Literal("thread.activity-appended"),
		payload: ThreadActivityAppendedPayload$1
	})
]);
const OrchestrationCommandReceiptStatus = Schema.Literals(["accepted", "rejected"]);
const TurnCountRange = Schema.Struct({
	fromTurnCount: NonNegativeInt,
	toTurnCount: NonNegativeInt
}).check(Schema.makeFilter((input) => input.fromTurnCount <= input.toTurnCount || new SchemaIssue.InvalidValue(Option.some(input.fromTurnCount), { message: "fromTurnCount must be less than or equal to toTurnCount" }), { identifier: "OrchestrationTurnDiffRange" }));
const ThreadTurnDiff = TurnCountRange.mapFields(Struct.assign({
	threadId: ThreadId,
	diff: Schema.String
}), { unsafePreserveChecks: true });
const ProviderSessionRuntimeStatus = Schema.Literals([
	"starting",
	"running",
	"stopped",
	"error"
]);
Schema.Literals([
	"running",
	"completed",
	"interrupted",
	"error"
]);
Schema.Struct({
	threadId: ThreadId,
	turnId: TurnId,
	checkpointTurnCount: NonNegativeInt,
	checkpointRef: CheckpointRef,
	status: OrchestrationCheckpointStatus,
	files: Schema.Array(OrchestrationCheckpointFile),
	assistantMessageId: Schema.NullOr(MessageId),
	completedAt: IsoDateTime
});
const ProjectionPendingApprovalStatus = Schema.Literals(["pending", "resolved"]);
const ProjectionPendingApprovalDecision = Schema.NullOr(ProviderApprovalDecision);
const DispatchResult = Schema.Struct({ sequence: NonNegativeInt });
const OrchestrationGetSnapshotInput = Schema.Struct({});
const OrchestrationGetTurnDiffInput = TurnCountRange.mapFields(Struct.assign({ threadId: ThreadId }), { unsafePreserveChecks: true });
const OrchestrationGetTurnDiffResult = ThreadTurnDiff;
const OrchestrationGetFullThreadDiffInput = Schema.Struct({
	threadId: ThreadId,
	toTurnCount: NonNegativeInt
});
const OrchestrationReplayEventsInput = Schema.Struct({ fromSequenceExclusive: NonNegativeInt });
const OrchestrationReplayEventsResult = Schema.Array(OrchestrationEvent);

//#endregion
//#region ../../packages/contracts/src/provider.ts
const TrimmedNonEmptyStringSchema$2 = TrimmedNonEmptyString;
const ProviderSessionStatus = Schema.Literals([
	"connecting",
	"ready",
	"running",
	"error",
	"closed"
]);
const ProviderSession = Schema.Struct({
	provider: ProviderKind,
	status: ProviderSessionStatus,
	runtimeMode: RuntimeMode,
	cwd: Schema.optional(TrimmedNonEmptyStringSchema$2),
	model: Schema.optional(TrimmedNonEmptyStringSchema$2),
	threadId: ThreadId,
	resumeCursor: Schema.optional(Schema.Unknown),
	activeTurnId: Schema.optional(TurnId),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime,
	lastError: Schema.optional(TrimmedNonEmptyStringSchema$2)
});
const CodexProviderStartOptions = Schema.Struct({
	binaryPath: Schema.optional(TrimmedNonEmptyStringSchema$2),
	homePath: Schema.optional(TrimmedNonEmptyStringSchema$2)
});
const ProviderStartOptions = Schema.Struct({ codex: Schema.optional(CodexProviderStartOptions) });
const ProviderSessionStartInput = Schema.Struct({
	threadId: ThreadId,
	provider: Schema.optional(ProviderKind),
	cwd: Schema.optional(TrimmedNonEmptyStringSchema$2),
	model: Schema.optional(TrimmedNonEmptyStringSchema$2),
	modelOptions: Schema.optional(ProviderModelOptions),
	resumeCursor: Schema.optional(Schema.Unknown),
	serviceTier: Schema.optional(Schema.NullOr(ProviderServiceTier)),
	approvalPolicy: Schema.optional(ProviderApprovalPolicy),
	sandboxMode: Schema.optional(ProviderSandboxMode),
	providerOptions: Schema.optional(ProviderStartOptions),
	runtimeMode: RuntimeMode
});
const ProviderSendTurnInput = Schema.Struct({
	threadId: ThreadId,
	input: Schema.optional(TrimmedNonEmptyStringSchema$2.check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_INPUT_CHARS))),
	attachments: Schema.optional(Schema.Array(ChatAttachment).check(Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_ATTACHMENTS))),
	model: Schema.optional(TrimmedNonEmptyStringSchema$2),
	serviceTier: Schema.optional(Schema.NullOr(ProviderServiceTier)),
	modelOptions: Schema.optional(ProviderModelOptions),
	interactionMode: Schema.optional(ProviderInteractionMode)
});
const ProviderTurnStartResult = Schema.Struct({
	threadId: ThreadId,
	turnId: TurnId,
	resumeCursor: Schema.optional(Schema.Unknown)
});
const ProviderInterruptTurnInput = Schema.Struct({
	threadId: ThreadId,
	turnId: Schema.optional(TurnId)
});
const ProviderStopSessionInput = Schema.Struct({ threadId: ThreadId });
const ProviderRespondToRequestInput = Schema.Struct({
	threadId: ThreadId,
	requestId: ApprovalRequestId,
	decision: ProviderApprovalDecision
});
const ProviderRespondToUserInputInput = Schema.Struct({
	threadId: ThreadId,
	requestId: ApprovalRequestId,
	answers: ProviderUserInputAnswers
});
const ProviderEventKind = Schema.Literals([
	"session",
	"notification",
	"request",
	"error"
]);
const ProviderEvent = Schema.Struct({
	id: EventId,
	kind: ProviderEventKind,
	provider: ProviderKind,
	threadId: ThreadId,
	createdAt: IsoDateTime,
	method: TrimmedNonEmptyStringSchema$2,
	message: Schema.optional(TrimmedNonEmptyStringSchema$2),
	turnId: Schema.optional(TurnId),
	itemId: Schema.optional(ProviderItemId),
	requestId: Schema.optional(ApprovalRequestId),
	requestKind: Schema.optional(ProviderRequestKind),
	textDelta: Schema.optional(Schema.String),
	payload: Schema.optional(Schema.Unknown)
});

//#endregion
//#region ../../packages/contracts/src/providerRuntime.ts
const TrimmedNonEmptyStringSchema$1 = TrimmedNonEmptyString;
const UnknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
const RuntimeEventRawSource = Schema.Literals([
	"codex.app-server.notification",
	"codex.app-server.request",
	"codex.eventmsg",
	"codex.sdk.thread-event"
]);
const RuntimeEventRaw = Schema.Struct({
	source: RuntimeEventRawSource,
	method: Schema.optional(TrimmedNonEmptyStringSchema$1),
	messageType: Schema.optional(TrimmedNonEmptyStringSchema$1),
	payload: Schema.Unknown
});
const ProviderRequestId = TrimmedNonEmptyStringSchema$1;
const ProviderRefs = Schema.Struct({
	providerTurnId: Schema.optional(TrimmedNonEmptyStringSchema$1),
	providerItemId: Schema.optional(ProviderItemId),
	providerRequestId: Schema.optional(ProviderRequestId)
});
const RuntimeSessionState = Schema.Literals([
	"starting",
	"ready",
	"running",
	"waiting",
	"stopped",
	"error"
]);
const RuntimeThreadState = Schema.Literals([
	"active",
	"idle",
	"archived",
	"closed",
	"compacted",
	"error"
]);
const RuntimeTurnState = Schema.Literals([
	"completed",
	"failed",
	"interrupted",
	"cancelled"
]);
const RuntimePlanStepStatus = Schema.Literals([
	"pending",
	"inProgress",
	"completed"
]);
const RuntimeItemStatus = Schema.Literals([
	"inProgress",
	"completed",
	"failed",
	"declined"
]);
const RuntimeContentStreamKind = Schema.Literals([
	"assistant_text",
	"reasoning_text",
	"reasoning_summary_text",
	"plan_text",
	"command_output",
	"file_change_output",
	"unknown"
]);
const RuntimeSessionExitKind = Schema.Literals(["graceful", "error"]);
const RuntimeErrorClass = Schema.Literals([
	"provider_error",
	"transport_error",
	"permission_error",
	"validation_error",
	"unknown"
]);
const CanonicalItemType = Schema.Literals([
	"user_message",
	"assistant_message",
	"reasoning",
	"plan",
	"command_execution",
	"file_change",
	"mcp_tool_call",
	"dynamic_tool_call",
	"collab_agent_tool_call",
	"web_search",
	"image_view",
	"review_entered",
	"review_exited",
	"context_compaction",
	"error",
	"unknown"
]);
const CanonicalRequestType = Schema.Literals([
	"command_execution_approval",
	"file_read_approval",
	"file_change_approval",
	"apply_patch_approval",
	"exec_command_approval",
	"tool_user_input",
	"dynamic_tool_call",
	"auth_tokens_refresh",
	"unknown"
]);
Schema.Literals([
	"session.started",
	"session.configured",
	"session.state.changed",
	"session.exited",
	"thread.started",
	"thread.state.changed",
	"thread.metadata.updated",
	"thread.token-usage.updated",
	"thread.realtime.started",
	"thread.realtime.item-added",
	"thread.realtime.audio.delta",
	"thread.realtime.error",
	"thread.realtime.closed",
	"turn.started",
	"turn.completed",
	"turn.aborted",
	"turn.plan.updated",
	"turn.proposed.delta",
	"turn.proposed.completed",
	"turn.diff.updated",
	"item.started",
	"item.updated",
	"item.completed",
	"content.delta",
	"request.opened",
	"request.resolved",
	"user-input.requested",
	"user-input.resolved",
	"task.started",
	"task.progress",
	"task.completed",
	"hook.started",
	"hook.progress",
	"hook.completed",
	"tool.progress",
	"tool.summary",
	"auth.status",
	"account.updated",
	"account.rate-limits.updated",
	"mcp.status.updated",
	"mcp.oauth.completed",
	"model.rerouted",
	"config.warning",
	"deprecation.notice",
	"files.persisted",
	"runtime.warning",
	"runtime.error"
]);
const SessionStartedType = Schema.Literal("session.started");
const SessionConfiguredType = Schema.Literal("session.configured");
const SessionStateChangedType = Schema.Literal("session.state.changed");
const SessionExitedType = Schema.Literal("session.exited");
const ThreadStartedType = Schema.Literal("thread.started");
const ThreadStateChangedType = Schema.Literal("thread.state.changed");
const ThreadMetadataUpdatedType = Schema.Literal("thread.metadata.updated");
const ThreadTokenUsageUpdatedType = Schema.Literal("thread.token-usage.updated");
const ThreadRealtimeStartedType = Schema.Literal("thread.realtime.started");
const ThreadRealtimeItemAddedType = Schema.Literal("thread.realtime.item-added");
const ThreadRealtimeAudioDeltaType = Schema.Literal("thread.realtime.audio.delta");
const ThreadRealtimeErrorType = Schema.Literal("thread.realtime.error");
const ThreadRealtimeClosedType = Schema.Literal("thread.realtime.closed");
const TurnStartedType = Schema.Literal("turn.started");
const TurnCompletedType = Schema.Literal("turn.completed");
const TurnAbortedType = Schema.Literal("turn.aborted");
const TurnPlanUpdatedType = Schema.Literal("turn.plan.updated");
const TurnProposedDeltaType = Schema.Literal("turn.proposed.delta");
const TurnProposedCompletedType = Schema.Literal("turn.proposed.completed");
const TurnDiffUpdatedType = Schema.Literal("turn.diff.updated");
const ItemStartedType = Schema.Literal("item.started");
const ItemUpdatedType = Schema.Literal("item.updated");
const ItemCompletedType = Schema.Literal("item.completed");
const ContentDeltaType = Schema.Literal("content.delta");
const RequestOpenedType = Schema.Literal("request.opened");
const RequestResolvedType = Schema.Literal("request.resolved");
const UserInputRequestedType = Schema.Literal("user-input.requested");
const UserInputResolvedType = Schema.Literal("user-input.resolved");
const TaskStartedType = Schema.Literal("task.started");
const TaskProgressType = Schema.Literal("task.progress");
const TaskCompletedType = Schema.Literal("task.completed");
const HookStartedType = Schema.Literal("hook.started");
const HookProgressType = Schema.Literal("hook.progress");
const HookCompletedType = Schema.Literal("hook.completed");
const ToolProgressType = Schema.Literal("tool.progress");
const ToolSummaryType = Schema.Literal("tool.summary");
const AuthStatusType = Schema.Literal("auth.status");
const AccountUpdatedType = Schema.Literal("account.updated");
const AccountRateLimitsUpdatedType = Schema.Literal("account.rate-limits.updated");
const McpStatusUpdatedType = Schema.Literal("mcp.status.updated");
const McpOauthCompletedType = Schema.Literal("mcp.oauth.completed");
const ModelReroutedType = Schema.Literal("model.rerouted");
const ConfigWarningType = Schema.Literal("config.warning");
const DeprecationNoticeType = Schema.Literal("deprecation.notice");
const FilesPersistedType = Schema.Literal("files.persisted");
const RuntimeWarningType = Schema.Literal("runtime.warning");
const RuntimeErrorType = Schema.Literal("runtime.error");
const ProviderRuntimeEventBase = Schema.Struct({
	eventId: EventId,
	provider: ProviderKind,
	threadId: ThreadId,
	createdAt: IsoDateTime,
	turnId: Schema.optional(TurnId),
	itemId: Schema.optional(RuntimeItemId),
	requestId: Schema.optional(RuntimeRequestId),
	providerRefs: Schema.optional(ProviderRefs),
	raw: Schema.optional(RuntimeEventRaw)
});
const SessionStartedPayload = Schema.Struct({
	message: Schema.optional(TrimmedNonEmptyStringSchema$1),
	resume: Schema.optional(Schema.Unknown)
});
const SessionConfiguredPayload = Schema.Struct({ config: UnknownRecordSchema });
const SessionStateChangedPayload = Schema.Struct({
	state: RuntimeSessionState,
	reason: Schema.optional(TrimmedNonEmptyStringSchema$1),
	detail: Schema.optional(Schema.Unknown)
});
const SessionExitedPayload = Schema.Struct({
	reason: Schema.optional(TrimmedNonEmptyStringSchema$1),
	recoverable: Schema.optional(Schema.Boolean),
	exitKind: Schema.optional(RuntimeSessionExitKind)
});
const ThreadStartedPayload = Schema.Struct({ providerThreadId: Schema.optional(TrimmedNonEmptyStringSchema$1) });
const ThreadStateChangedPayload = Schema.Struct({
	state: RuntimeThreadState,
	detail: Schema.optional(Schema.Unknown)
});
const ThreadMetadataUpdatedPayload = Schema.Struct({
	name: Schema.optional(TrimmedNonEmptyStringSchema$1),
	metadata: Schema.optional(UnknownRecordSchema)
});
const ThreadTokenUsageUpdatedPayload = Schema.Struct({ usage: Schema.Unknown });
const ThreadRealtimeStartedPayload = Schema.Struct({ realtimeSessionId: Schema.optional(TrimmedNonEmptyStringSchema$1) });
const ThreadRealtimeItemAddedPayload = Schema.Struct({ item: Schema.Unknown });
const ThreadRealtimeAudioDeltaPayload = Schema.Struct({ audio: Schema.Unknown });
const ThreadRealtimeErrorPayload = Schema.Struct({ message: TrimmedNonEmptyStringSchema$1 });
const ThreadRealtimeClosedPayload = Schema.Struct({ reason: Schema.optional(TrimmedNonEmptyStringSchema$1) });
const TurnStartedPayload = Schema.Struct({
	model: Schema.optional(TrimmedNonEmptyStringSchema$1),
	effort: Schema.optional(TrimmedNonEmptyStringSchema$1)
});
const TurnCompletedPayload = Schema.Struct({
	state: RuntimeTurnState,
	stopReason: Schema.optional(Schema.NullOr(TrimmedNonEmptyStringSchema$1)),
	usage: Schema.optional(Schema.Unknown),
	modelUsage: Schema.optional(UnknownRecordSchema),
	totalCostUsd: Schema.optional(Schema.Number),
	errorMessage: Schema.optional(TrimmedNonEmptyStringSchema$1)
});
const TurnAbortedPayload = Schema.Struct({ reason: TrimmedNonEmptyStringSchema$1 });
const RuntimePlanStep = Schema.Struct({
	step: TrimmedNonEmptyStringSchema$1,
	status: RuntimePlanStepStatus
});
const TurnPlanUpdatedPayload = Schema.Struct({
	explanation: Schema.optional(Schema.NullOr(TrimmedNonEmptyStringSchema$1)),
	plan: Schema.Array(RuntimePlanStep)
});
const TurnProposedDeltaPayload = Schema.Struct({ delta: Schema.String });
const TurnProposedCompletedPayload = Schema.Struct({ planMarkdown: TrimmedNonEmptyStringSchema$1 });
const TurnDiffUpdatedPayload = Schema.Struct({ unifiedDiff: Schema.String });
const ItemLifecyclePayload = Schema.Struct({
	itemType: CanonicalItemType,
	status: Schema.optional(RuntimeItemStatus),
	title: Schema.optional(TrimmedNonEmptyStringSchema$1),
	detail: Schema.optional(TrimmedNonEmptyStringSchema$1),
	data: Schema.optional(Schema.Unknown)
});
const ContentDeltaPayload = Schema.Struct({
	streamKind: RuntimeContentStreamKind,
	delta: Schema.String,
	contentIndex: Schema.optional(Schema.Int),
	summaryIndex: Schema.optional(Schema.Int)
});
const RequestOpenedPayload = Schema.Struct({
	requestType: CanonicalRequestType,
	detail: Schema.optional(TrimmedNonEmptyStringSchema$1),
	args: Schema.optional(Schema.Unknown)
});
const RequestResolvedPayload = Schema.Struct({
	requestType: CanonicalRequestType,
	decision: Schema.optional(TrimmedNonEmptyStringSchema$1),
	resolution: Schema.optional(Schema.Unknown)
});
const UserInputQuestionOption = Schema.Struct({
	label: TrimmedNonEmptyStringSchema$1,
	description: TrimmedNonEmptyStringSchema$1
});
const UserInputQuestion = Schema.Struct({
	id: TrimmedNonEmptyStringSchema$1,
	header: TrimmedNonEmptyStringSchema$1,
	question: TrimmedNonEmptyStringSchema$1,
	options: Schema.Array(UserInputQuestionOption)
});
const UserInputRequestedPayload = Schema.Struct({ questions: Schema.Array(UserInputQuestion) });
const UserInputResolvedPayload = Schema.Struct({ answers: UnknownRecordSchema });
const TaskStartedPayload = Schema.Struct({
	taskId: RuntimeTaskId,
	description: Schema.optional(TrimmedNonEmptyStringSchema$1),
	taskType: Schema.optional(TrimmedNonEmptyStringSchema$1)
});
const TaskProgressPayload = Schema.Struct({
	taskId: RuntimeTaskId,
	description: TrimmedNonEmptyStringSchema$1,
	usage: Schema.optional(Schema.Unknown),
	lastToolName: Schema.optional(TrimmedNonEmptyStringSchema$1)
});
const TaskCompletedPayload = Schema.Struct({
	taskId: RuntimeTaskId,
	status: Schema.Literals([
		"completed",
		"failed",
		"stopped"
	]),
	summary: Schema.optional(TrimmedNonEmptyStringSchema$1),
	usage: Schema.optional(Schema.Unknown)
});
const HookStartedPayload = Schema.Struct({
	hookId: TrimmedNonEmptyStringSchema$1,
	hookName: TrimmedNonEmptyStringSchema$1,
	hookEvent: TrimmedNonEmptyStringSchema$1
});
const HookProgressPayload = Schema.Struct({
	hookId: TrimmedNonEmptyStringSchema$1,
	output: Schema.optional(Schema.String),
	stdout: Schema.optional(Schema.String),
	stderr: Schema.optional(Schema.String)
});
const HookCompletedPayload = Schema.Struct({
	hookId: TrimmedNonEmptyStringSchema$1,
	outcome: Schema.Literals([
		"success",
		"error",
		"cancelled"
	]),
	output: Schema.optional(Schema.String),
	stdout: Schema.optional(Schema.String),
	stderr: Schema.optional(Schema.String),
	exitCode: Schema.optional(Schema.Int)
});
const ToolProgressPayload = Schema.Struct({
	toolUseId: Schema.optional(TrimmedNonEmptyStringSchema$1),
	toolName: Schema.optional(TrimmedNonEmptyStringSchema$1),
	summary: Schema.optional(TrimmedNonEmptyStringSchema$1),
	elapsedSeconds: Schema.optional(Schema.Number)
});
const ToolSummaryPayload = Schema.Struct({
	summary: TrimmedNonEmptyStringSchema$1,
	precedingToolUseIds: Schema.optional(Schema.Array(TrimmedNonEmptyStringSchema$1))
});
const AuthStatusPayload = Schema.Struct({
	isAuthenticating: Schema.optional(Schema.Boolean),
	output: Schema.optional(Schema.Array(Schema.String)),
	error: Schema.optional(TrimmedNonEmptyStringSchema$1)
});
const AccountUpdatedPayload = Schema.Struct({ account: Schema.Unknown });
const AccountRateLimitsUpdatedPayload = Schema.Struct({ rateLimits: Schema.Unknown });
const McpStatusUpdatedPayload = Schema.Struct({ status: Schema.Unknown });
const McpOauthCompletedPayload = Schema.Struct({
	success: Schema.Boolean,
	name: Schema.optional(TrimmedNonEmptyStringSchema$1),
	error: Schema.optional(TrimmedNonEmptyStringSchema$1)
});
const ModelReroutedPayload = Schema.Struct({
	fromModel: TrimmedNonEmptyStringSchema$1,
	toModel: TrimmedNonEmptyStringSchema$1,
	reason: TrimmedNonEmptyStringSchema$1
});
const ConfigWarningPayload = Schema.Struct({
	summary: TrimmedNonEmptyStringSchema$1,
	details: Schema.optional(TrimmedNonEmptyStringSchema$1),
	path: Schema.optional(TrimmedNonEmptyStringSchema$1),
	range: Schema.optional(Schema.Unknown)
});
const DeprecationNoticePayload = Schema.Struct({
	summary: TrimmedNonEmptyStringSchema$1,
	details: Schema.optional(TrimmedNonEmptyStringSchema$1)
});
const FilesPersistedPayload = Schema.Struct({
	files: Schema.Array(Schema.Struct({
		filename: TrimmedNonEmptyStringSchema$1,
		fileId: TrimmedNonEmptyStringSchema$1
	})),
	failed: Schema.optional(Schema.Array(Schema.Struct({
		filename: TrimmedNonEmptyStringSchema$1,
		error: TrimmedNonEmptyStringSchema$1
	})))
});
const RuntimeWarningPayload = Schema.Struct({
	message: TrimmedNonEmptyStringSchema$1,
	detail: Schema.optional(Schema.Unknown)
});
const RuntimeErrorPayload = Schema.Struct({
	message: TrimmedNonEmptyStringSchema$1,
	class: Schema.optional(RuntimeErrorClass),
	detail: Schema.optional(Schema.Unknown)
});
const ProviderRuntimeSessionStartedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: SessionStartedType,
	payload: SessionStartedPayload
});
const ProviderRuntimeSessionConfiguredEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: SessionConfiguredType,
	payload: SessionConfiguredPayload
});
const ProviderRuntimeSessionStateChangedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: SessionStateChangedType,
	payload: SessionStateChangedPayload
});
const ProviderRuntimeSessionExitedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: SessionExitedType,
	payload: SessionExitedPayload
});
const ProviderRuntimeThreadStartedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadStartedType,
	payload: ThreadStartedPayload
});
const ProviderRuntimeThreadStateChangedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadStateChangedType,
	payload: ThreadStateChangedPayload
});
const ProviderRuntimeThreadMetadataUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadMetadataUpdatedType,
	payload: ThreadMetadataUpdatedPayload
});
const ProviderRuntimeThreadTokenUsageUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadTokenUsageUpdatedType,
	payload: ThreadTokenUsageUpdatedPayload
});
const ProviderRuntimeThreadRealtimeStartedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadRealtimeStartedType,
	payload: ThreadRealtimeStartedPayload
});
const ProviderRuntimeThreadRealtimeItemAddedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadRealtimeItemAddedType,
	payload: ThreadRealtimeItemAddedPayload
});
const ProviderRuntimeThreadRealtimeAudioDeltaEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadRealtimeAudioDeltaType,
	payload: ThreadRealtimeAudioDeltaPayload
});
const ProviderRuntimeThreadRealtimeErrorEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadRealtimeErrorType,
	payload: ThreadRealtimeErrorPayload
});
const ProviderRuntimeThreadRealtimeClosedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ThreadRealtimeClosedType,
	payload: ThreadRealtimeClosedPayload
});
const ProviderRuntimeTurnStartedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TurnStartedType,
	payload: TurnStartedPayload
});
const ProviderRuntimeTurnCompletedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TurnCompletedType,
	payload: TurnCompletedPayload
});
const ProviderRuntimeTurnAbortedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TurnAbortedType,
	payload: TurnAbortedPayload
});
const ProviderRuntimeTurnPlanUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TurnPlanUpdatedType,
	payload: TurnPlanUpdatedPayload
});
const ProviderRuntimeTurnProposedDeltaEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TurnProposedDeltaType,
	payload: TurnProposedDeltaPayload
});
const ProviderRuntimeTurnProposedCompletedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TurnProposedCompletedType,
	payload: TurnProposedCompletedPayload
});
const ProviderRuntimeTurnDiffUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TurnDiffUpdatedType,
	payload: TurnDiffUpdatedPayload
});
const ProviderRuntimeItemStartedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ItemStartedType,
	payload: ItemLifecyclePayload
});
const ProviderRuntimeItemUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ItemUpdatedType,
	payload: ItemLifecyclePayload
});
const ProviderRuntimeItemCompletedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ItemCompletedType,
	payload: ItemLifecyclePayload
});
const ProviderRuntimeContentDeltaEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ContentDeltaType,
	payload: ContentDeltaPayload
});
const ProviderRuntimeRequestOpenedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: RequestOpenedType,
	payload: RequestOpenedPayload
});
const ProviderRuntimeRequestResolvedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: RequestResolvedType,
	payload: RequestResolvedPayload
});
const ProviderRuntimeUserInputRequestedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: UserInputRequestedType,
	payload: UserInputRequestedPayload
});
const ProviderRuntimeUserInputResolvedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: UserInputResolvedType,
	payload: UserInputResolvedPayload
});
const ProviderRuntimeTaskStartedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TaskStartedType,
	payload: TaskStartedPayload
});
const ProviderRuntimeTaskProgressEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TaskProgressType,
	payload: TaskProgressPayload
});
const ProviderRuntimeTaskCompletedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: TaskCompletedType,
	payload: TaskCompletedPayload
});
const ProviderRuntimeHookStartedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: HookStartedType,
	payload: HookStartedPayload
});
const ProviderRuntimeHookProgressEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: HookProgressType,
	payload: HookProgressPayload
});
const ProviderRuntimeHookCompletedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: HookCompletedType,
	payload: HookCompletedPayload
});
const ProviderRuntimeToolProgressEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ToolProgressType,
	payload: ToolProgressPayload
});
const ProviderRuntimeToolSummaryEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ToolSummaryType,
	payload: ToolSummaryPayload
});
const ProviderRuntimeAuthStatusEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: AuthStatusType,
	payload: AuthStatusPayload
});
const ProviderRuntimeAccountUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: AccountUpdatedType,
	payload: AccountUpdatedPayload
});
const ProviderRuntimeAccountRateLimitsUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: AccountRateLimitsUpdatedType,
	payload: AccountRateLimitsUpdatedPayload
});
const ProviderRuntimeMcpStatusUpdatedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: McpStatusUpdatedType,
	payload: McpStatusUpdatedPayload
});
const ProviderRuntimeMcpOauthCompletedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: McpOauthCompletedType,
	payload: McpOauthCompletedPayload
});
const ProviderRuntimeModelReroutedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ModelReroutedType,
	payload: ModelReroutedPayload
});
const ProviderRuntimeConfigWarningEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: ConfigWarningType,
	payload: ConfigWarningPayload
});
const ProviderRuntimeDeprecationNoticeEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: DeprecationNoticeType,
	payload: DeprecationNoticePayload
});
const ProviderRuntimeFilesPersistedEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: FilesPersistedType,
	payload: FilesPersistedPayload
});
const ProviderRuntimeWarningEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: RuntimeWarningType,
	payload: RuntimeWarningPayload
});
const ProviderRuntimeErrorEvent = Schema.Struct({
	...ProviderRuntimeEventBase.fields,
	type: RuntimeErrorType,
	payload: RuntimeErrorPayload
});
const ProviderRuntimeEventV2 = Schema.Union([
	ProviderRuntimeSessionStartedEvent,
	ProviderRuntimeSessionConfiguredEvent,
	ProviderRuntimeSessionStateChangedEvent,
	ProviderRuntimeSessionExitedEvent,
	ProviderRuntimeThreadStartedEvent,
	ProviderRuntimeThreadStateChangedEvent,
	ProviderRuntimeThreadMetadataUpdatedEvent,
	ProviderRuntimeThreadTokenUsageUpdatedEvent,
	ProviderRuntimeThreadRealtimeStartedEvent,
	ProviderRuntimeThreadRealtimeItemAddedEvent,
	ProviderRuntimeThreadRealtimeAudioDeltaEvent,
	ProviderRuntimeThreadRealtimeErrorEvent,
	ProviderRuntimeThreadRealtimeClosedEvent,
	ProviderRuntimeTurnStartedEvent,
	ProviderRuntimeTurnCompletedEvent,
	ProviderRuntimeTurnAbortedEvent,
	ProviderRuntimeTurnPlanUpdatedEvent,
	ProviderRuntimeTurnProposedDeltaEvent,
	ProviderRuntimeTurnProposedCompletedEvent,
	ProviderRuntimeTurnDiffUpdatedEvent,
	ProviderRuntimeItemStartedEvent,
	ProviderRuntimeItemUpdatedEvent,
	ProviderRuntimeItemCompletedEvent,
	ProviderRuntimeContentDeltaEvent,
	ProviderRuntimeRequestOpenedEvent,
	ProviderRuntimeRequestResolvedEvent,
	ProviderRuntimeUserInputRequestedEvent,
	ProviderRuntimeUserInputResolvedEvent,
	ProviderRuntimeTaskStartedEvent,
	ProviderRuntimeTaskProgressEvent,
	ProviderRuntimeTaskCompletedEvent,
	ProviderRuntimeHookStartedEvent,
	ProviderRuntimeHookProgressEvent,
	ProviderRuntimeHookCompletedEvent,
	ProviderRuntimeToolProgressEvent,
	ProviderRuntimeToolSummaryEvent,
	ProviderRuntimeAuthStatusEvent,
	ProviderRuntimeAccountUpdatedEvent,
	ProviderRuntimeAccountRateLimitsUpdatedEvent,
	ProviderRuntimeMcpStatusUpdatedEvent,
	ProviderRuntimeMcpOauthCompletedEvent,
	ProviderRuntimeModelReroutedEvent,
	ProviderRuntimeConfigWarningEvent,
	ProviderRuntimeDeprecationNoticeEvent,
	ProviderRuntimeFilesPersistedEvent,
	ProviderRuntimeWarningEvent,
	ProviderRuntimeErrorEvent
]);
Schema.Literals([
	"command",
	"file-read",
	"file-change",
	"other"
]);

//#endregion
//#region ../../packages/contracts/src/git.ts
const TrimmedNonEmptyStringSchema = TrimmedNonEmptyString;
const GitStackedAction = Schema.Literals([
	"commit",
	"commit_push",
	"commit_push_pr"
]);
const GitCommitStepStatus = Schema.Literals(["created", "skipped_no_changes"]);
const GitPushStepStatus = Schema.Literals([
	"pushed",
	"skipped_not_requested",
	"skipped_up_to_date"
]);
const GitBranchStepStatus = Schema.Literals(["created", "skipped_not_requested"]);
const GitPrStepStatus = Schema.Literals([
	"created",
	"opened_existing",
	"skipped_not_requested"
]);
const GitStatusPrState = Schema.Literals([
	"open",
	"closed",
	"merged"
]);
const GitBranch = Schema.Struct({
	name: TrimmedNonEmptyStringSchema,
	isRemote: Schema.optional(Schema.Boolean),
	remoteName: Schema.optional(TrimmedNonEmptyStringSchema),
	current: Schema.Boolean,
	isDefault: Schema.Boolean,
	worktreePath: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr)
});
const GitWorktree = Schema.Struct({
	path: TrimmedNonEmptyStringSchema,
	branch: TrimmedNonEmptyStringSchema
});
const GitStatusInput = Schema.Struct({ cwd: TrimmedNonEmptyStringSchema });
const GitPullInput = Schema.Struct({ cwd: TrimmedNonEmptyStringSchema });
const GitRunStackedActionInput = Schema.Struct({
	cwd: TrimmedNonEmptyStringSchema,
	action: GitStackedAction,
	commitMessage: Schema.optional(TrimmedNonEmptyStringSchema.check(Schema.isMaxLength(1e4))),
	featureBranch: Schema.optional(Schema.Boolean)
});
const GitListBranchesInput = Schema.Struct({ cwd: TrimmedNonEmptyStringSchema });
const GitCreateWorktreeInput = Schema.Struct({
	cwd: TrimmedNonEmptyStringSchema,
	branch: TrimmedNonEmptyStringSchema,
	newBranch: TrimmedNonEmptyStringSchema,
	path: Schema.NullOr(TrimmedNonEmptyStringSchema)
});
const GitRemoveWorktreeInput = Schema.Struct({
	cwd: TrimmedNonEmptyStringSchema,
	path: TrimmedNonEmptyStringSchema,
	force: Schema.optional(Schema.Boolean)
});
const GitCreateBranchInput = Schema.Struct({
	cwd: TrimmedNonEmptyStringSchema,
	branch: TrimmedNonEmptyStringSchema
});
const GitCheckoutInput = Schema.Struct({
	cwd: TrimmedNonEmptyStringSchema,
	branch: TrimmedNonEmptyStringSchema
});
const GitInitInput = Schema.Struct({ cwd: TrimmedNonEmptyStringSchema });
const GitStatusPr = Schema.Struct({
	number: PositiveInt,
	title: TrimmedNonEmptyStringSchema,
	url: Schema.String,
	baseBranch: TrimmedNonEmptyStringSchema,
	headBranch: TrimmedNonEmptyStringSchema,
	state: GitStatusPrState
});
const GitStatusResult = Schema.Struct({
	branch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr),
	hasWorkingTreeChanges: Schema.Boolean,
	workingTree: Schema.Struct({
		files: Schema.Array(Schema.Struct({
			path: TrimmedNonEmptyStringSchema,
			insertions: NonNegativeInt,
			deletions: NonNegativeInt
		})),
		insertions: NonNegativeInt,
		deletions: NonNegativeInt
	}),
	hasUpstream: Schema.Boolean,
	aheadCount: NonNegativeInt,
	behindCount: NonNegativeInt,
	pr: Schema.NullOr(GitStatusPr)
});
const GitListBranchesResult = Schema.Struct({
	branches: Schema.Array(GitBranch),
	isRepo: Schema.Boolean
});
const GitCreateWorktreeResult = Schema.Struct({ worktree: GitWorktree });
const GitRunStackedActionResult = Schema.Struct({
	action: GitStackedAction,
	branch: Schema.Struct({
		status: GitBranchStepStatus,
		name: Schema.optional(TrimmedNonEmptyStringSchema)
	}),
	commit: Schema.Struct({
		status: GitCommitStepStatus,
		commitSha: Schema.optional(TrimmedNonEmptyStringSchema),
		subject: Schema.optional(TrimmedNonEmptyStringSchema)
	}),
	push: Schema.Struct({
		status: GitPushStepStatus,
		branch: Schema.optional(TrimmedNonEmptyStringSchema),
		upstreamBranch: Schema.optional(TrimmedNonEmptyStringSchema),
		setUpstream: Schema.optional(Schema.Boolean)
	}),
	pr: Schema.Struct({
		status: GitPrStepStatus,
		url: Schema.optional(Schema.String),
		number: Schema.optional(PositiveInt),
		baseBranch: Schema.optional(TrimmedNonEmptyStringSchema),
		headBranch: Schema.optional(TrimmedNonEmptyStringSchema),
		title: Schema.optional(TrimmedNonEmptyStringSchema)
	})
});
const GitPullResult = Schema.Struct({
	status: Schema.Literals(["pulled", "skipped_up_to_date"]),
	branch: TrimmedNonEmptyStringSchema,
	upstreamBranch: TrimmedNonEmptyStringSchema.pipe(Schema.NullOr)
});

//#endregion
//#region ../../packages/contracts/src/keybindings.ts
const MAX_KEYBINDING_VALUE_LENGTH = 64;
const MAX_KEYBINDING_WHEN_LENGTH = 256;
const MAX_WHEN_EXPRESSION_DEPTH = 64;
const MAX_SCRIPT_ID_LENGTH = 24;
const MAX_KEYBINDINGS_COUNT = 256;
const STATIC_KEYBINDING_COMMANDS = [
	"terminal.toggle",
	"terminal.split",
	"terminal.new",
	"terminal.close",
	"diff.toggle",
	"chat.new",
	"chat.newLocal",
	"editor.openFavorite"
];
const SCRIPT_RUN_COMMAND_PATTERN = Schema.TemplateLiteral([
	Schema.Literal("script."),
	Schema.NonEmptyString.check(Schema.isMaxLength(MAX_SCRIPT_ID_LENGTH), Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)),
	Schema.Literal(".run")
]);
const KeybindingCommand = Schema.Union([Schema.Literals(STATIC_KEYBINDING_COMMANDS), SCRIPT_RUN_COMMAND_PATTERN]);
const KeybindingValue = TrimmedString.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_KEYBINDING_VALUE_LENGTH));
const KeybindingWhen = TrimmedString.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_KEYBINDING_WHEN_LENGTH));
const KeybindingRule = Schema.Struct({
	key: KeybindingValue,
	command: KeybindingCommand,
	when: Schema.optional(KeybindingWhen)
});
const KeybindingsConfig = Schema.Array(KeybindingRule).check(Schema.isMaxLength(MAX_KEYBINDINGS_COUNT));
const KeybindingShortcut = Schema.Struct({
	key: KeybindingValue,
	metaKey: Schema.Boolean,
	ctrlKey: Schema.Boolean,
	shiftKey: Schema.Boolean,
	altKey: Schema.Boolean,
	modKey: Schema.Boolean
});
const KeybindingWhenNode = Schema.Union([
	Schema.Struct({
		type: Schema.Literal("identifier"),
		name: Schema.NonEmptyString
	}),
	Schema.Struct({
		type: Schema.Literal("not"),
		node: Schema.suspend(() => KeybindingWhenNode)
	}),
	Schema.Struct({
		type: Schema.Literal("and"),
		left: Schema.suspend(() => KeybindingWhenNode),
		right: Schema.suspend(() => KeybindingWhenNode)
	}),
	Schema.Struct({
		type: Schema.Literal("or"),
		left: Schema.suspend(() => KeybindingWhenNode),
		right: Schema.suspend(() => KeybindingWhenNode)
	})
]);
const ResolvedKeybindingRule = Schema.Struct({
	command: KeybindingCommand,
	shortcut: KeybindingShortcut,
	whenAst: Schema.optional(KeybindingWhenNode)
}).annotate({ parseOptions: { onExcessProperty: "ignore" } });
const ResolvedKeybindingsConfig = Schema.Array(ResolvedKeybindingRule).check(Schema.isMaxLength(MAX_KEYBINDINGS_COUNT));

//#endregion
//#region ../../packages/contracts/src/project.ts
const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 200;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;
const ProjectSearchEntriesInput = Schema.Struct({
	cwd: TrimmedNonEmptyString,
	query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
	limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT))
});
const ProjectEntryKind = Schema.Literals(["file", "directory"]);
const ProjectEntry = Schema.Struct({
	path: TrimmedNonEmptyString,
	kind: ProjectEntryKind,
	parentPath: Schema.optional(TrimmedNonEmptyString)
});
const ProjectSearchEntriesResult = Schema.Struct({
	entries: Schema.Array(ProjectEntry),
	truncated: Schema.Boolean
});
const ProjectWriteFileInput = Schema.Struct({
	cwd: TrimmedNonEmptyString,
	relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
	contents: Schema.String
});
const ProjectWriteFileResult = Schema.Struct({ relativePath: TrimmedNonEmptyString });

//#endregion
//#region ../../packages/contracts/src/editor.ts
const EDITORS = [
	{
		id: "cursor",
		label: "Cursor",
		command: "cursor"
	},
	{
		id: "vscode",
		label: "VS Code",
		command: "code"
	},
	{
		id: "zed",
		label: "Zed",
		command: "zed"
	},
	{
		id: "file-manager",
		label: "File Manager",
		command: null
	}
];
const EditorId = Schema.Literals(EDITORS.map((e) => e.id));
const OpenInEditorInput = Schema.Struct({
	cwd: TrimmedNonEmptyString,
	editor: EditorId
});

//#endregion
//#region ../../packages/contracts/src/ws.ts
const WS_METHODS = {
	projectsList: "projects.list",
	projectsAdd: "projects.add",
	projectsRemove: "projects.remove",
	projectsSearchEntries: "projects.searchEntries",
	projectsWriteFile: "projects.writeFile",
	shellOpenInEditor: "shell.openInEditor",
	gitPull: "git.pull",
	gitStatus: "git.status",
	gitRunStackedAction: "git.runStackedAction",
	gitListBranches: "git.listBranches",
	gitCreateWorktree: "git.createWorktree",
	gitRemoveWorktree: "git.removeWorktree",
	gitCreateBranch: "git.createBranch",
	gitCheckout: "git.checkout",
	gitInit: "git.init",
	terminalOpen: "terminal.open",
	terminalWrite: "terminal.write",
	terminalResize: "terminal.resize",
	terminalClear: "terminal.clear",
	terminalRestart: "terminal.restart",
	terminalClose: "terminal.close",
	serverGetConfig: "server.getConfig",
	serverUpsertKeybinding: "server.upsertKeybinding"
};
const WS_CHANNELS = {
	terminalEvent: "terminal.event",
	serverWelcome: "server.welcome",
	serverConfigUpdated: "server.configUpdated"
};
const tagRequestBody = (tag, schema) => schema.mapFields(Struct.assign({ _tag: Schema.tag(tag) }), { unsafePreserveChecks: true });
const WebSocketRequestBody = Schema.Union([
	tagRequestBody(ORCHESTRATION_WS_METHODS.dispatchCommand, Schema.Struct({ command: ClientOrchestrationCommand })),
	tagRequestBody(ORCHESTRATION_WS_METHODS.getSnapshot, OrchestrationGetSnapshotInput),
	tagRequestBody(ORCHESTRATION_WS_METHODS.getTurnDiff, OrchestrationGetTurnDiffInput),
	tagRequestBody(ORCHESTRATION_WS_METHODS.getFullThreadDiff, OrchestrationGetFullThreadDiffInput),
	tagRequestBody(ORCHESTRATION_WS_METHODS.replayEvents, OrchestrationReplayEventsInput),
	tagRequestBody(WS_METHODS.projectsSearchEntries, ProjectSearchEntriesInput),
	tagRequestBody(WS_METHODS.projectsWriteFile, ProjectWriteFileInput),
	tagRequestBody(WS_METHODS.shellOpenInEditor, OpenInEditorInput),
	tagRequestBody(WS_METHODS.gitPull, GitPullInput),
	tagRequestBody(WS_METHODS.gitStatus, GitStatusInput),
	tagRequestBody(WS_METHODS.gitRunStackedAction, GitRunStackedActionInput),
	tagRequestBody(WS_METHODS.gitListBranches, GitListBranchesInput),
	tagRequestBody(WS_METHODS.gitCreateWorktree, GitCreateWorktreeInput),
	tagRequestBody(WS_METHODS.gitRemoveWorktree, GitRemoveWorktreeInput),
	tagRequestBody(WS_METHODS.gitCreateBranch, GitCreateBranchInput),
	tagRequestBody(WS_METHODS.gitCheckout, GitCheckoutInput),
	tagRequestBody(WS_METHODS.gitInit, GitInitInput),
	tagRequestBody(WS_METHODS.terminalOpen, TerminalOpenInput),
	tagRequestBody(WS_METHODS.terminalWrite, TerminalWriteInput),
	tagRequestBody(WS_METHODS.terminalResize, TerminalResizeInput),
	tagRequestBody(WS_METHODS.terminalClear, TerminalClearInput),
	tagRequestBody(WS_METHODS.terminalRestart, TerminalRestartInput),
	tagRequestBody(WS_METHODS.terminalClose, TerminalCloseInput),
	tagRequestBody(WS_METHODS.serverGetConfig, Schema.Struct({})),
	tagRequestBody(WS_METHODS.serverUpsertKeybinding, KeybindingRule)
]);
const WebSocketRequest = Schema.Struct({
	id: TrimmedNonEmptyString,
	body: WebSocketRequestBody
});
const WebSocketResponse = Schema.Struct({
	id: TrimmedNonEmptyString,
	result: Schema.optional(Schema.Unknown),
	error: Schema.optional(Schema.Struct({ message: Schema.String }))
});
const WsPush = Schema.Struct({
	type: Schema.Literal("push"),
	channel: TrimmedNonEmptyString,
	data: Schema.Unknown
});
const WsResponse = Schema.Union([WebSocketResponse, WsPush]);
const WsWelcomePayload = Schema.Struct({
	cwd: TrimmedNonEmptyString,
	projectName: TrimmedNonEmptyString,
	bootstrapProjectId: Schema.optional(ProjectId),
	bootstrapThreadId: Schema.optional(ThreadId)
});

//#endregion
//#region ../../packages/contracts/src/server.ts
const KeybindingsMalformedConfigIssue = Schema.Struct({
	kind: Schema.Literal("keybindings.malformed-config"),
	message: TrimmedNonEmptyString
});
const KeybindingsInvalidEntryIssue = Schema.Struct({
	kind: Schema.Literal("keybindings.invalid-entry"),
	message: TrimmedNonEmptyString,
	index: Schema.Number
});
const ServerConfigIssue = Schema.Union([KeybindingsMalformedConfigIssue, KeybindingsInvalidEntryIssue]);
const ServerConfigIssues = Schema.Array(ServerConfigIssue);
const ServerProviderStatusState = Schema.Literals([
	"ready",
	"warning",
	"error"
]);
const ServerProviderAuthStatus = Schema.Literals([
	"authenticated",
	"unauthenticated",
	"unknown"
]);
const ServerProviderStatus = Schema.Struct({
	provider: ProviderKind,
	status: ServerProviderStatusState,
	available: Schema.Boolean,
	authStatus: ServerProviderAuthStatus,
	checkedAt: IsoDateTime,
	message: Schema.optional(TrimmedNonEmptyString)
});
const ServerProviderStatuses = Schema.Array(ServerProviderStatus);
const ServerConfig = Schema.Struct({
	cwd: TrimmedNonEmptyString,
	keybindingsConfigPath: TrimmedNonEmptyString,
	keybindings: ResolvedKeybindingsConfig,
	issues: ServerConfigIssues,
	providers: ServerProviderStatuses,
	availableEditors: Schema.Array(EditorId)
});
const ServerUpsertKeybindingResult = Schema.Struct({
	keybindings: ResolvedKeybindingsConfig,
	issues: ServerConfigIssues
});
const ServerConfigUpdatedPayload = Schema.Struct({
	issues: ServerConfigIssues,
	providers: ServerProviderStatuses
});

//#endregion
//#region src/open.ts
/**
* Open - Browser/editor launch service interface.
*
* Owns process launch helpers for opening URLs in a browser and workspace
* paths in a configured editor.
*
* @module Open
*/
var OpenError = class extends Schema.TaggedErrorClass()("OpenError", {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {};
const LINE_COLUMN_SUFFIX_PATTERN = /:\d+(?::\d+)?$/;
function shouldUseGotoFlag(editorId, target) {
	return (editorId === "cursor" || editorId === "vscode") && LINE_COLUMN_SUFFIX_PATTERN.test(target);
}
function fileManagerCommandForPlatform(platform) {
	switch (platform) {
		case "darwin": return "open";
		case "win32": return "explorer";
		default: return "xdg-open";
	}
}
function stripWrappingQuotes(value) {
	return value.replace(/^"+|"+$/g, "");
}
function resolvePathEnvironmentVariable(env) {
	return env.PATH ?? env.Path ?? env.path ?? "";
}
function resolveWindowsPathExtensions(env) {
	const rawValue = env.PATHEXT;
	const fallback = [
		".COM",
		".EXE",
		".BAT",
		".CMD"
	];
	if (!rawValue) return fallback;
	const parsed = rawValue.split(";").map((entry) => entry.trim()).filter((entry) => entry.length > 0).map((entry) => entry.startsWith(".") ? entry.toUpperCase() : `.${entry.toUpperCase()}`);
	return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}
function resolveCommandCandidates(command, platform, windowsPathExtensions) {
	if (platform !== "win32") return [command];
	const extension = extname(command);
	const normalizedExtension = extension.toUpperCase();
	if (extension.length > 0 && windowsPathExtensions.includes(normalizedExtension)) {
		const commandWithoutExtension = command.slice(0, -extension.length);
		return Array.from(new Set([
			command,
			`${commandWithoutExtension}${normalizedExtension}`,
			`${commandWithoutExtension}${normalizedExtension.toLowerCase()}`
		]));
	}
	const candidates = [];
	for (const extension of windowsPathExtensions) {
		candidates.push(`${command}${extension}`);
		candidates.push(`${command}${extension.toLowerCase()}`);
	}
	return Array.from(new Set(candidates));
}
function isExecutableFile(filePath, platform, windowsPathExtensions) {
	try {
		if (!statSync(filePath).isFile()) return false;
		if (platform === "win32") {
			const extension = extname(filePath);
			if (extension.length === 0) return false;
			return windowsPathExtensions.includes(extension.toUpperCase());
		}
		accessSync(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
function resolvePathDelimiter(platform) {
	return platform === "win32" ? ";" : ":";
}
function isCommandAvailable(command, options = {}) {
	const platform = options.platform ?? process.platform;
	const env = options.env ?? process.env;
	const windowsPathExtensions = platform === "win32" ? resolveWindowsPathExtensions(env) : [];
	const commandCandidates = resolveCommandCandidates(command, platform, windowsPathExtensions);
	if (command.includes("/") || command.includes("\\")) return commandCandidates.some((candidate) => isExecutableFile(candidate, platform, windowsPathExtensions));
	const pathValue = resolvePathEnvironmentVariable(env);
	if (pathValue.length === 0) return false;
	const pathEntries = pathValue.split(resolvePathDelimiter(platform)).map((entry) => stripWrappingQuotes(entry.trim())).filter((entry) => entry.length > 0);
	for (const pathEntry of pathEntries) for (const candidate of commandCandidates) if (isExecutableFile(join(pathEntry, candidate), platform, windowsPathExtensions)) return true;
	return false;
}
function resolveAvailableEditors(platform = process.platform, env = process.env) {
	const available = [];
	for (const editor of EDITORS) if (isCommandAvailable(editor.command ?? fileManagerCommandForPlatform(platform), {
		platform,
		env
	})) available.push(editor.id);
	return available;
}
/**
* Open - Service tag for browser/editor launch operations.
*/
var Open = class extends ServiceMap.Service()("t3/open") {};
const resolveEditorLaunch = Effect.fnUntraced(function* (input, platform = process.platform) {
	const editorDef = EDITORS.find((editor) => editor.id === input.editor);
	if (!editorDef) return yield* new OpenError({ message: `Unknown editor: ${input.editor}` });
	if (editorDef.command) return shouldUseGotoFlag(editorDef.id, input.cwd) ? {
		command: editorDef.command,
		args: ["--goto", input.cwd]
	} : {
		command: editorDef.command,
		args: [input.cwd]
	};
	if (editorDef.id !== "file-manager") return yield* new OpenError({ message: `Unsupported editor: ${input.editor}` });
	return {
		command: fileManagerCommandForPlatform(platform),
		args: [input.cwd]
	};
});
const launchDetached = (launch) => Effect.gen(function* () {
	if (!isCommandAvailable(launch.command)) return yield* new OpenError({ message: `Editor command not found: ${launch.command}` });
	yield* Effect.callback((resume) => {
		let child;
		try {
			child = spawn(launch.command, [...launch.args], {
				detached: true,
				stdio: "ignore",
				shell: process.platform === "win32"
			});
		} catch (error) {
			return resume(Effect.fail(new OpenError({
				message: "failed to spawn detached process",
				cause: error
			})));
		}
		const handleSpawn = () => {
			child.unref();
			resume(Effect.void);
		};
		child.once("spawn", handleSpawn);
		child.once("error", (cause) => resume(Effect.fail(new OpenError({
			message: "failed to spawn detached process",
			cause
		}))));
	});
});
const make$4 = Effect.gen(function* () {
	const open = yield* Effect.tryPromise({
		try: () => import("open"),
		catch: (cause) => new OpenError({
			message: "failed to load browser opener",
			cause
		})
	});
	return {
		openBrowser: (target) => Effect.tryPromise({
			try: () => open.default(target),
			catch: (cause) => new OpenError({
				message: "Browser auto-open failed",
				cause
			})
		}),
		openInEditor: (input) => Effect.flatMap(resolveEditorLaunch(input), launchDetached)
	};
});
const OpenLive = Layer.effect(Open, make$4);

//#endregion
//#region src/persistence/Migrations/001_OrchestrationEvents.ts
var _001_OrchestrationEvents_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    CREATE TABLE IF NOT EXISTS orchestration_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      aggregate_kind TEXT NOT NULL,
      stream_id TEXT NOT NULL,
      stream_version INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      command_id TEXT,
      causation_event_id TEXT,
      correlation_id TEXT,
      actor_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    )
  `;
	yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_events_stream_version
    ON orchestration_events(aggregate_kind, stream_id, stream_version)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orch_events_stream_sequence
    ON orchestration_events(aggregate_kind, stream_id, sequence)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orch_events_command_id
    ON orchestration_events(command_id)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orch_events_correlation_id
    ON orchestration_events(correlation_id)
  `;
});

//#endregion
//#region src/persistence/Migrations/002_OrchestrationCommandReceipts.ts
var _002_OrchestrationCommandReceipts_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
      command_id TEXT PRIMARY KEY,
      aggregate_kind TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      accepted_at TEXT NOT NULL,
      result_sequence INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT
    )
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_aggregate
    ON orchestration_command_receipts(aggregate_kind, aggregate_id)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orch_command_receipts_sequence
    ON orchestration_command_receipts(result_sequence)
  `;
});

//#endregion
//#region src/persistence/Migrations/003_CheckpointDiffBlobs.ts
var _003_CheckpointDiffBlobs_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    CREATE TABLE IF NOT EXISTS checkpoint_diff_blobs (
      thread_id TEXT NOT NULL,
      from_turn_count INTEGER NOT NULL,
      to_turn_count INTEGER NOT NULL,
      diff TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (thread_id, from_turn_count, to_turn_count)
    )
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_checkpoint_diff_blobs_thread_to_turn
    ON checkpoint_diff_blobs(thread_id, to_turn_count)
  `;
});

//#endregion
//#region src/persistence/Migrations/004_ProviderSessionRuntime.ts
var _004_ProviderSessionRuntime_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    CREATE TABLE IF NOT EXISTS provider_session_runtime (
      thread_id TEXT PRIMARY KEY,
      provider_name TEXT NOT NULL,
      adapter_key TEXT NOT NULL,
      runtime_mode TEXT NOT NULL DEFAULT 'full-access',
      status TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      resume_cursor_json TEXT,
      runtime_payload_json TEXT
    )
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_status
    ON provider_session_runtime(status)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_provider_session_runtime_provider
    ON provider_session_runtime(provider_name)
  `;
});

//#endregion
//#region src/persistence/Migrations/005_Projections.ts
var _005_Projections_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_projects (
      project_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_root TEXT NOT NULL,
      default_model TEXT,
      scripts_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_threads (
      thread_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      branch TEXT,
      worktree_path TEXT,
      latest_turn_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_messages (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      turn_id TEXT,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      is_streaming INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_activities (
      activity_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      turn_id TEXT,
      tone TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_sessions (
      thread_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      provider_name TEXT,
      provider_session_id TEXT,
      provider_thread_id TEXT,
      active_turn_id TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    )
  `;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_turns (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      turn_id TEXT,
      pending_message_id TEXT,
      assistant_message_id TEXT,
      state TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      checkpoint_turn_count INTEGER,
      checkpoint_ref TEXT,
      checkpoint_status TEXT,
      checkpoint_files_json TEXT NOT NULL,
      UNIQUE (thread_id, turn_id),
      UNIQUE (thread_id, checkpoint_turn_count)
    )
  `;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_pending_approvals (
      request_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      turn_id TEXT,
      status TEXT NOT NULL,
      decision TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    )
  `;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_state (
      projector TEXT PRIMARY KEY,
      last_applied_sequence INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_projects_updated_at
    ON projection_projects(updated_at)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_project_id
    ON projection_threads(project_id)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_thread_created
    ON projection_thread_messages(thread_id, created_at)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_created
    ON projection_thread_activities(thread_id, created_at)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_sessions_provider_session
    ON projection_thread_sessions(provider_session_id)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_requested
    ON projection_turns(thread_id, requested_at)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_turns_thread_checkpoint_completed
    ON projection_turns(thread_id, checkpoint_turn_count, completed_at)
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_pending_approvals_thread_status
    ON projection_pending_approvals(thread_id, status)
  `;
});

//#endregion
//#region src/persistence/Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts
const DEFAULT_RUNTIME_MODE$1 = "full-access";
var _006_ProjectionThreadSessionRuntimeModeColumns_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
      ALTER TABLE projection_thread_sessions
      ADD COLUMN runtime_mode TEXT NOT NULL DEFAULT 'full-access'
    `;
	yield* sql`
    UPDATE projection_thread_sessions
    SET runtime_mode = ${DEFAULT_RUNTIME_MODE$1}
    WHERE runtime_mode IS NULL
  `;
});

//#endregion
//#region src/persistence/Migrations/007_ProjectionThreadMessageAttachments.ts
var _007_ProjectionThreadMessageAttachments_default = Effect$1.gen(function* () {
	yield* (yield* SqlClient.SqlClient)`
    ALTER TABLE projection_thread_messages
    ADD COLUMN attachments_json TEXT
  `;
});

//#endregion
//#region src/persistence/Migrations/008_ProjectionThreadActivitySequence.ts
var _008_ProjectionThreadActivitySequence_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    ALTER TABLE projection_thread_activities
    ADD COLUMN sequence INTEGER
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_activities_thread_sequence
    ON projection_thread_activities(thread_id, sequence)
  `;
});

//#endregion
//#region src/persistence/Migrations/009_ProviderSessionRuntimeMode.ts
var _009_ProviderSessionRuntimeMode_default = Effect$1.gen(function* () {
	yield* SqlClient.SqlClient;
});

//#endregion
//#region src/persistence/Migrations/010_ProjectionThreadsRuntimeMode.ts
var _010_ProjectionThreadsRuntimeMode_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN runtime_mode TEXT NOT NULL DEFAULT 'full-access'
  `;
	yield* sql`
    UPDATE projection_threads
    SET runtime_mode = 'full-access'
    WHERE runtime_mode IS NULL
  `;
});

//#endregion
//#region src/persistence/Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts
var _011_OrchestrationThreadCreatedRuntimeMode_default = Effect$1.gen(function* () {
	yield* (yield* SqlClient.SqlClient)`
    UPDATE orchestration_events
    SET payload_json = json_set(payload_json, '$.runtimeMode', 'full-access')
    WHERE event_type = 'thread.created'
      AND json_type(payload_json, '$.runtimeMode') IS NULL
  `;
});

//#endregion
//#region src/persistence/Migrations/012_ProjectionThreadsInteractionMode.ts
var _012_ProjectionThreadsInteractionMode_default = Effect$1.gen(function* () {
	yield* (yield* SqlClient.SqlClient)`
    ALTER TABLE projection_threads
    ADD COLUMN interaction_mode TEXT NOT NULL DEFAULT 'default'
  `;
});

//#endregion
//#region src/persistence/Migrations/013_ProjectionThreadProposedPlans.ts
var _013_ProjectionThreadProposedPlans_default = Effect$1.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`
    CREATE TABLE IF NOT EXISTS projection_thread_proposed_plans (
      plan_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      turn_id TEXT,
      plan_markdown TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
	yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_proposed_plans_thread_created
    ON projection_thread_proposed_plans(thread_id, created_at)
  `;
});

//#endregion
//#region src/persistence/Migrations.ts
/**
* MigrationsLive - Migration runner with inline loader
*
* Uses Migrator.make with fromRecord to define migrations inline.
* All migrations are statically imported - no dynamic file system loading.
*
* Migrations run automatically when the MigrationLayer is provided,
* ensuring the database schema is always up-to-date before the application starts.
*/
/**
* Migration loader with all migrations defined inline.
*
* Key format: "{id}_{name}" where:
* - id: numeric migration ID (determines execution order)
* - name: descriptive name for the migration
*
* Uses Migrator.fromRecord which parses the key format and
* returns migrations sorted by ID.
*/
const loader = Migrator.fromRecord({
	"1_OrchestrationEvents": _001_OrchestrationEvents_default,
	"2_OrchestrationCommandReceipts": _002_OrchestrationCommandReceipts_default,
	"3_CheckpointDiffBlobs": _003_CheckpointDiffBlobs_default,
	"4_ProviderSessionRuntime": _004_ProviderSessionRuntime_default,
	"5_Projections": _005_Projections_default,
	"6_ProjectionThreadSessionRuntimeModeColumns": _006_ProjectionThreadSessionRuntimeModeColumns_default,
	"7_ProjectionThreadMessageAttachments": _007_ProjectionThreadMessageAttachments_default,
	"8_ProjectionThreadActivitySequence": _008_ProjectionThreadActivitySequence_default,
	"9_ProviderSessionRuntimeMode": _009_ProviderSessionRuntimeMode_default,
	"10_ProjectionThreadsRuntimeMode": _010_ProjectionThreadsRuntimeMode_default,
	"11_OrchestrationThreadCreatedRuntimeMode": _011_OrchestrationThreadCreatedRuntimeMode_default,
	"12_ProjectionThreadsInteractionMode": _012_ProjectionThreadsInteractionMode_default,
	"13_ProjectionThreadProposedPlans": _013_ProjectionThreadProposedPlans_default
});
/**
* Migrator run function - no schema dumping needed
* Uses the base Migrator.make without platform dependencies
*/
const run = Migrator.make({});
/**
* Run all pending migrations.
*
* Creates the migrations tracking table (effect_sql_migrations) if it doesn't exist,
* then runs any migrations with ID greater than the latest recorded migration.
*
* Returns array of [id, name] tuples for migrations that were run.
*
* @returns Effect containing array of executed migrations
*/
const runMigrations = Effect.gen(function* () {
	yield* Effect.log("Running migrations...");
	yield* run({ loader });
	yield* Effect.log("Migrations ran successfully");
});
/**
* Layer that runs migrations when the layer is built.
*
* Use this to ensure migrations run before your application starts.
* Migrations are run automatically - no separate script is needed.
*
* @example
* ```typescript
* import { MigrationsLive } from "@acme/db/Migrations"
* import * as SqliteClient from "@acme/db/SqliteClient"
*
* // Migrations run automatically when SqliteClient is provided
* const AppLayer = MigrationsLive.pipe(
*   Layer.provideMerge(SqliteClient.layer({ filename: "database.sqlite" }))
* )
* ```
*/
const MigrationsLive = Layer$1.effectDiscard(runMigrations);

//#endregion
//#region src/persistence/Layers/Sqlite.ts
const defaultSqliteClientLoaders = {
	bun: () => import("@effect/sql-sqlite-bun/SqliteClient"),
	node: () => import("./NodeSqliteClient-HpJMkQ8C.mjs")
};
const makeRuntimeSqliteLayer = (config) => Effect.gen(function* () {
	const loader = defaultSqliteClientLoaders[process.versions.bun !== void 0 ? "bun" : "node"];
	return (yield* Effect.promise(loader)).layer(config);
}).pipe(Layer.unwrap);
const setup = Layer.effectDiscard(Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	yield* sql`PRAGMA journal_mode = WAL;`;
	yield* sql`PRAGMA foreign_keys = ON;`;
	yield* runMigrations;
}));
const makeSqlitePersistenceLive = (dbPath) => Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true });
	return Layer.provideMerge(setup, makeRuntimeSqliteLayer({ filename: dbPath }));
}).pipe(Layer.unwrap);
const SqlitePersistenceMemory = Layer.provideMerge(setup, makeRuntimeSqliteLayer({ filename: ":memory:" }));
const layerConfig = Effect.gen(function* () {
	const { stateDir } = yield* ServerConfig$1;
	const { join } = yield* Path.Path;
	return makeSqlitePersistenceLive(join(stateDir, "state.sqlite"));
}).pipe(Layer.unwrap);

//#endregion
//#region src/orchestration/Services/ProjectionSnapshotQuery.ts
/**
* ProjectionSnapshotQuery - Service tag for projection snapshot queries.
*/
var ProjectionSnapshotQuery = class extends ServiceMap.Service()("t3/orchestration/Services/ProjectionSnapshotQuery") {};

//#endregion
//#region src/checkpointing/Errors.ts
/**
* CheckpointUnavailableError - Expected checkpoint does not exist.
*/
var CheckpointUnavailableError = class extends Schema.TaggedErrorClass()("CheckpointUnavailableError", {
	threadId: Schema.String,
	turnCount: Schema.Number,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Checkpoint unavailable for thread ${this.threadId} turn ${this.turnCount}: ${this.detail}`;
	}
};
/**
* CheckpointInvariantError - Inconsistent provider/filesystem/catalog state.
*/
var CheckpointInvariantError = class extends Schema.TaggedErrorClass()("CheckpointInvariantError", {
	operation: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Checkpoint invariant violation in ${this.operation}: ${this.detail}`;
	}
};

//#endregion
//#region src/checkpointing/Utils.ts
const CHECKPOINT_REFS_PREFIX = "refs/t3/checkpoints";
function checkpointRefForThreadTurn(threadId, turnCount) {
	return CheckpointRef.makeUnsafe(`${CHECKPOINT_REFS_PREFIX}/${Encoding.encodeBase64Url(threadId)}/turn/${turnCount}`);
}
function resolveThreadWorkspaceCwd(input) {
	const worktreeCwd = input.thread.worktreePath ?? void 0;
	if (worktreeCwd) return worktreeCwd;
	return input.projects.find((project) => project.id === input.thread.projectId)?.workspaceRoot;
}

//#endregion
//#region src/checkpointing/Services/CheckpointStore.ts
/**
* CheckpointStore - Repository interface for filesystem-backed workspace checkpoints.
*
* Owns hidden Git-ref checkpoint capture/restore and diff computation for a
* workspace thread timeline. It does not store user-facing checkpoint metadata
* and does not coordinate provider conversation rollback.
*
* Uses Effect `ServiceMap.Service` for dependency injection and exposes typed
* domain errors for checkpoint storage operations.
*
* @module CheckpointStore
*/
/**
* CheckpointStore - Service tag for checkpoint persistence and restore operations.
*/
var CheckpointStore = class extends ServiceMap.Service()("t3/checkpointing/Services/CheckpointStore") {};

//#endregion
//#region src/checkpointing/Services/CheckpointDiffQuery.ts
/**
* CheckpointDiffQuery - Service tag for checkpoint diff queries.
*/
var CheckpointDiffQuery = class extends ServiceMap.Service()("t3/checkpointing/Services/CheckpointDiffQuery") {};

//#endregion
//#region src/checkpointing/Layers/CheckpointDiffQuery.ts
const isTurnDiffResult = Schema.is(OrchestrationGetTurnDiffResult);
const make$3 = Effect.gen(function* () {
	const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
	const checkpointStore = yield* CheckpointStore;
	const getTurnDiff = (input) => Effect.gen(function* () {
		const operation = "CheckpointDiffQuery.getTurnDiff";
		if (input.fromTurnCount === input.toTurnCount) {
			const emptyDiff = {
				threadId: input.threadId,
				fromTurnCount: input.fromTurnCount,
				toTurnCount: input.toTurnCount,
				diff: ""
			};
			if (!isTurnDiffResult(emptyDiff)) return yield* new CheckpointInvariantError({
				operation,
				detail: "Computed turn diff result does not satisfy contract schema."
			});
			return emptyDiff;
		}
		const snapshot = yield* projectionSnapshotQuery.getSnapshot();
		const thread = snapshot.threads.find((entry) => entry.id === input.threadId);
		if (!thread) return yield* new CheckpointInvariantError({
			operation,
			detail: `Thread '${input.threadId}' not found.`
		});
		const maxTurnCount = thread.checkpoints.reduce((max, checkpoint) => Math.max(max, checkpoint.checkpointTurnCount), 0);
		if (input.toTurnCount > maxTurnCount) return yield* new CheckpointUnavailableError({
			threadId: input.threadId,
			turnCount: input.toTurnCount,
			detail: `Turn diff range exceeds current turn count: requested ${input.toTurnCount}, current ${maxTurnCount}.`
		});
		const workspaceCwd = resolveThreadWorkspaceCwd({
			thread,
			projects: snapshot.projects
		});
		if (!workspaceCwd) return yield* new CheckpointInvariantError({
			operation,
			detail: `Workspace path missing for thread '${input.threadId}' when computing turn diff.`
		});
		const fromCheckpointRef = input.fromTurnCount === 0 ? checkpointRefForThreadTurn(input.threadId, 0) : thread.checkpoints.find((checkpoint) => checkpoint.checkpointTurnCount === input.fromTurnCount)?.checkpointRef;
		if (!fromCheckpointRef) return yield* new CheckpointUnavailableError({
			threadId: input.threadId,
			turnCount: input.fromTurnCount,
			detail: `Checkpoint ref is unavailable for turn ${input.fromTurnCount}.`
		});
		const toCheckpointRef = thread.checkpoints.find((checkpoint) => checkpoint.checkpointTurnCount === input.toTurnCount)?.checkpointRef;
		if (!toCheckpointRef) return yield* new CheckpointUnavailableError({
			threadId: input.threadId,
			turnCount: input.toTurnCount,
			detail: `Checkpoint ref is unavailable for turn ${input.toTurnCount}.`
		});
		const [fromExists, toExists] = yield* Effect.all([checkpointStore.hasCheckpointRef({
			cwd: workspaceCwd,
			checkpointRef: fromCheckpointRef
		}), checkpointStore.hasCheckpointRef({
			cwd: workspaceCwd,
			checkpointRef: toCheckpointRef
		})], { concurrency: "unbounded" });
		if (!fromExists) return yield* new CheckpointUnavailableError({
			threadId: input.threadId,
			turnCount: input.fromTurnCount,
			detail: `Filesystem checkpoint is unavailable for turn ${input.fromTurnCount}.`
		});
		if (!toExists) return yield* new CheckpointUnavailableError({
			threadId: input.threadId,
			turnCount: input.toTurnCount,
			detail: `Filesystem checkpoint is unavailable for turn ${input.toTurnCount}.`
		});
		const diff = yield* checkpointStore.diffCheckpoints({
			cwd: workspaceCwd,
			fromCheckpointRef,
			toCheckpointRef,
			fallbackFromToHead: false
		});
		const turnDiff = {
			threadId: input.threadId,
			fromTurnCount: input.fromTurnCount,
			toTurnCount: input.toTurnCount,
			diff
		};
		if (!isTurnDiffResult(turnDiff)) return yield* new CheckpointInvariantError({
			operation,
			detail: "Computed turn diff result does not satisfy contract schema."
		});
		return turnDiff;
	});
	const getFullThreadDiff = (input) => getTurnDiff({
		threadId: input.threadId,
		fromTurnCount: 0,
		toTurnCount: input.toTurnCount
	}).pipe(Effect.map((result) => result));
	return {
		getTurnDiff,
		getFullThreadDiff
	};
});
const CheckpointDiffQueryLive = Layer.effect(CheckpointDiffQuery, make$3);

//#endregion
//#region src/git/Errors.ts
/**
* GitCommandError - Git command execution failed.
*/
var GitCommandError = class extends Schema.TaggedErrorClass()("GitCommandError", {
	operation: Schema.String,
	command: Schema.String,
	cwd: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Git command failed in ${this.operation}: ${this.command} (${this.cwd}) - ${this.detail}`;
	}
};
/**
* GitHubCliError - GitHub CLI execution or authentication failed.
*/
var GitHubCliError = class extends Schema.TaggedErrorClass()("GitHubCliError", {
	operation: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `GitHub CLI failed in ${this.operation}: ${this.detail}`;
	}
};
/**
* TextGenerationError - Commit or PR text generation failed.
*/
var TextGenerationError = class extends Schema.TaggedErrorClass()("TextGenerationError", {
	operation: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Text generation failed in ${this.operation}: ${this.detail}`;
	}
};
/**
* GitManagerError - Stacked Git workflow orchestration failed.
*/
var GitManagerError = class extends Schema.TaggedErrorClass()("GitManagerError", {
	operation: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Git manager failed in ${this.operation}: ${this.detail}`;
	}
};

//#endregion
//#region src/git/Services/GitService.ts
/**
* GitService - Service for Git command execution.
*
* Uses Effect `ServiceMap.Service` for dependency injection and exposes typed
* domain errors for Git command execution.
*
* @module GitService
*/
/**
* GitService - Service for Git command execution.
*/
var GitService = class extends ServiceMap.Service()("t3/git/Services/GitService") {};

//#endregion
//#region src/git/Layers/GitService.ts
/**
* Git process helpers - Effect-native git execution with typed errors.
*
* Centralizes child-process git invocation for server modules. This module
* only executes git commands and reports structured failures.
*
* @module GitServiceLive
*/
const DEFAULT_TIMEOUT_MS$2 = 3e4;
const DEFAULT_MAX_OUTPUT_BYTES = 1e6;
function quoteGitCommand(args) {
	return `git ${args.join(" ")}`;
}
function toGitCommandError(input, detail) {
	return (cause) => Schema.is(GitCommandError)(cause) ? cause : new GitCommandError({
		operation: input.operation,
		command: quoteGitCommand(input.args),
		cwd: input.cwd,
		detail: `${cause instanceof Error && cause.message.length > 0 ? cause.message : "Unknown error"} - ${detail}`,
		...cause !== void 0 ? { cause } : {}
	});
}
const collectOutput = Effect.fn(function* (input, stream, maxOutputBytes) {
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = "";
	yield* Stream.runForEach(stream, (chunk) => Effect.gen(function* () {
		bytes += chunk.byteLength;
		if (bytes > maxOutputBytes) return yield* new GitCommandError({
			operation: input.operation,
			command: quoteGitCommand(input.args),
			cwd: input.cwd,
			detail: `${quoteGitCommand(input.args)} output exceeded ${maxOutputBytes} bytes and was truncated.`
		});
		text += decoder.decode(chunk, { stream: true });
	})).pipe(Effect.mapError(toGitCommandError(input, "output stream failed.")));
	text += decoder.decode();
	return text;
});
const makeGitService = Effect.gen(function* () {
	const commandSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	return { execute: Effect.fnUntraced(function* (input) {
		const commandInput = {
			...input,
			args: [...input.args]
		};
		const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS$2;
		const maxOutputBytes = input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
		return yield* Effect.gen(function* () {
			const child = yield* commandSpawner.spawn(ChildProcess.make("git", commandInput.args, {
				cwd: commandInput.cwd,
				...input.env ? { env: input.env } : {}
			})).pipe(Effect.mapError(toGitCommandError(commandInput, "failed to spawn.")));
			const [stdout, stderr, exitCode] = yield* Effect.all([
				collectOutput(commandInput, child.stdout, maxOutputBytes),
				collectOutput(commandInput, child.stderr, maxOutputBytes),
				child.exitCode.pipe(Effect.map((value) => Number(value)), Effect.mapError(toGitCommandError(commandInput, "failed to report exit code.")))
			], { concurrency: "unbounded" });
			if (!input.allowNonZeroExit && exitCode !== 0) {
				const trimmedStderr = stderr.trim();
				return yield* new GitCommandError({
					operation: commandInput.operation,
					command: quoteGitCommand(commandInput.args),
					cwd: commandInput.cwd,
					detail: trimmedStderr.length > 0 ? `${quoteGitCommand(commandInput.args)} failed: ${trimmedStderr}` : `${quoteGitCommand(commandInput.args)} failed with code ${exitCode}.`
				});
			}
			return {
				code: exitCode,
				stdout,
				stderr
			};
		}).pipe(Effect.scoped, Effect.timeoutOption(timeoutMs), Effect.flatMap((result) => Option.match(result, {
			onNone: () => Effect.fail(new GitCommandError({
				operation: commandInput.operation,
				command: quoteGitCommand(commandInput.args),
				cwd: commandInput.cwd,
				detail: `${quoteGitCommand(commandInput.args)} timed out.`
			})),
			onSome: Effect.succeed
		})));
	}) };
});
const GitServiceLive = Layer.effect(GitService, makeGitService);

//#endregion
//#region src/checkpointing/Layers/CheckpointStore.ts
/**
* CheckpointStoreLive - Filesystem checkpoint store adapter layer.
*
* Implements hidden Git-ref checkpoint capture/restore directly with
* Effect-native child process execution (`effect/unstable/process`).
*
* This layer owns filesystem/Git interactions only; it does not persist
* checkpoint metadata and does not coordinate provider rollback semantics.
*
* @module CheckpointStoreLive
*/
const makeCheckpointStore = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const git = yield* GitService;
	const resolveHeadCommit = (cwd) => git.execute({
		operation: "CheckpointStore.resolveHeadCommit",
		cwd,
		args: [
			"rev-parse",
			"--verify",
			"--quiet",
			"HEAD^{commit}"
		],
		allowNonZeroExit: true
	}).pipe(Effect.map((result) => {
		if (result.code !== 0) return null;
		const commit = result.stdout.trim();
		return commit.length > 0 ? commit : null;
	}));
	const hasHeadCommit = (cwd) => git.execute({
		operation: "CheckpointStore.hasHeadCommit",
		cwd,
		args: [
			"rev-parse",
			"--verify",
			"HEAD"
		],
		allowNonZeroExit: true
	}).pipe(Effect.map((result) => result.code === 0));
	const resolveCheckpointCommit = (cwd, checkpointRef) => git.execute({
		operation: "CheckpointStore.resolveCheckpointCommit",
		cwd,
		args: [
			"rev-parse",
			"--verify",
			"--quiet",
			`${checkpointRef}^{commit}`
		],
		allowNonZeroExit: true
	}).pipe(Effect.map((result) => {
		if (result.code !== 0) return null;
		const commit = result.stdout.trim();
		return commit.length > 0 ? commit : null;
	}));
	const isGitRepository = (cwd) => git.execute({
		operation: "CheckpointStore.isGitRepository",
		cwd,
		args: ["rev-parse", "--is-inside-work-tree"],
		allowNonZeroExit: true
	}).pipe(Effect.map((result) => result.code === 0 && result.stdout.trim() === "true"), Effect.catch(() => Effect.succeed(false)));
	const captureCheckpoint = (input) => Effect.gen(function* () {
		const operation = "CheckpointStore.captureCheckpoint";
		yield* Effect.acquireUseRelease(fs.makeTempDirectory({ prefix: "t3-fs-checkpoint-" }), (tempDir) => Effect.gen(function* () {
			const tempIndexPath = path.join(tempDir, `index-${randomUUID()}`);
			const commitEnv = {
				...process.env,
				GIT_INDEX_FILE: tempIndexPath,
				GIT_AUTHOR_NAME: "T3 Code",
				GIT_AUTHOR_EMAIL: "t3code@users.noreply.github.com",
				GIT_COMMITTER_NAME: "T3 Code",
				GIT_COMMITTER_EMAIL: "t3code@users.noreply.github.com"
			};
			if (yield* hasHeadCommit(input.cwd)) yield* git.execute({
				operation,
				cwd: input.cwd,
				args: ["read-tree", "HEAD"],
				env: commitEnv
			});
			yield* git.execute({
				operation,
				cwd: input.cwd,
				args: [
					"add",
					"-A",
					"--",
					"."
				],
				env: commitEnv
			});
			const treeOid = (yield* git.execute({
				operation,
				cwd: input.cwd,
				args: ["write-tree"],
				env: commitEnv
			})).stdout.trim();
			if (treeOid.length === 0) return yield* new GitCommandError({
				operation,
				command: "git write-tree",
				cwd: input.cwd,
				detail: "git write-tree returned an empty tree oid."
			});
			const message = `t3 checkpoint ref=${input.checkpointRef}`;
			const commitOid = (yield* git.execute({
				operation,
				cwd: input.cwd,
				args: [
					"commit-tree",
					treeOid,
					"-m",
					message
				],
				env: commitEnv
			})).stdout.trim();
			if (commitOid.length === 0) return yield* new GitCommandError({
				operation,
				command: "git commit-tree",
				cwd: input.cwd,
				detail: "git commit-tree returned an empty commit oid."
			});
			yield* git.execute({
				operation,
				cwd: input.cwd,
				args: [
					"update-ref",
					input.checkpointRef,
					commitOid
				]
			});
		}), (tempDir) => fs.remove(tempDir, { recursive: true })).pipe(Effect.catchTags({ PlatformError: (error) => Effect.fail(new CheckpointInvariantError({
			operation: "CheckpointStore.captureCheckpoint",
			detail: "Failed to capture checkpoint.",
			cause: error
		})) }));
	});
	const hasCheckpointRef = (input) => resolveCheckpointCommit(input.cwd, input.checkpointRef).pipe(Effect.map((commit) => commit !== null));
	const restoreCheckpoint = (input) => Effect.gen(function* () {
		const operation = "CheckpointStore.restoreCheckpoint";
		let commitOid = yield* resolveCheckpointCommit(input.cwd, input.checkpointRef);
		if (!commitOid && input.fallbackToHead === true) commitOid = yield* resolveHeadCommit(input.cwd);
		if (!commitOid) return false;
		yield* git.execute({
			operation,
			cwd: input.cwd,
			args: [
				"restore",
				"--source",
				commitOid,
				"--worktree",
				"--staged",
				"--",
				"."
			]
		});
		yield* git.execute({
			operation,
			cwd: input.cwd,
			args: [
				"clean",
				"-fd",
				"--",
				"."
			]
		});
		if (yield* hasHeadCommit(input.cwd)) yield* git.execute({
			operation,
			cwd: input.cwd,
			args: [
				"reset",
				"--quiet",
				"--",
				"."
			]
		});
		return true;
	});
	const diffCheckpoints = (input) => Effect.gen(function* () {
		const operation = "CheckpointStore.diffCheckpoints";
		let fromCommitOid = yield* resolveCheckpointCommit(input.cwd, input.fromCheckpointRef);
		const toCommitOid = yield* resolveCheckpointCommit(input.cwd, input.toCheckpointRef);
		if (!fromCommitOid && input.fallbackFromToHead === true) {
			const headCommit = yield* resolveHeadCommit(input.cwd);
			if (headCommit) fromCommitOid = headCommit;
		}
		if (!fromCommitOid || !toCommitOid) return yield* new GitCommandError({
			operation,
			command: "git diff",
			cwd: input.cwd,
			detail: "Checkpoint ref is unavailable for diff operation."
		});
		return (yield* git.execute({
			operation,
			cwd: input.cwd,
			args: [
				"diff",
				"--patch",
				"--minimal",
				"--no-color",
				fromCommitOid,
				toCommitOid
			]
		})).stdout;
	});
	const deleteCheckpointRefs = (input) => Effect.gen(function* () {
		const operation = "CheckpointStore.deleteCheckpointRefs";
		yield* Effect.forEach(input.checkpointRefs, (checkpointRef) => git.execute({
			operation,
			cwd: input.cwd,
			args: [
				"update-ref",
				"-d",
				checkpointRef
			],
			allowNonZeroExit: true
		}), { discard: true });
	});
	return {
		isGitRepository,
		captureCheckpoint,
		hasCheckpointRef,
		restoreCheckpoint,
		diffCheckpoints,
		deleteCheckpointRefs
	};
});
const CheckpointStoreLive = Layer.effect(CheckpointStore, makeCheckpointStore).pipe(Layer.provideMerge(GitServiceLive));

//#endregion
//#region src/persistence/Errors.ts
var PersistenceSqlError = class extends Schema.TaggedErrorClass()("PersistenceSqlError", {
	operation: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `SQL error in ${this.operation}: ${this.detail}`;
	}
};
var PersistenceDecodeError = class extends Schema.TaggedErrorClass()("PersistenceDecodeError", {
	operation: Schema.String,
	issue: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Decode error in ${this.operation}: ${this.issue}`;
	}
};
function toPersistenceSqlError(operation) {
	return (cause) => new PersistenceSqlError({
		operation,
		detail: `Failed to execute ${operation}`,
		cause
	});
}
function toPersistenceDecodeError(operation) {
	return (error) => new PersistenceDecodeError({
		operation,
		issue: SchemaIssue.makeFormatterDefault()(error.issue),
		cause: error
	});
}
const isPersistenceError = (u) => Schema.is(PersistenceSqlError)(u) || Schema.is(PersistenceDecodeError)(u);

//#endregion
//#region src/persistence/Services/OrchestrationCommandReceipts.ts
/**
* OrchestrationCommandReceiptRepository - Repository interface for command receipts.
*
* Owns persistence operations for deduplication and status tracking of
* orchestration command handling.
*
* @module OrchestrationCommandReceiptRepository
*/
const OrchestrationCommandReceipt = Schema.Struct({
	commandId: CommandId,
	aggregateKind: OrchestrationAggregateKind,
	aggregateId: Schema.Union([ProjectId, ThreadId]),
	acceptedAt: IsoDateTime,
	resultSequence: NonNegativeInt,
	status: OrchestrationCommandReceiptStatus,
	error: Schema.NullOr(Schema.String)
});
const GetByCommandIdInput = Schema.Struct({ commandId: CommandId });
/**
* OrchestrationCommandReceiptRepository - Service tag for command receipt persistence.
*/
var OrchestrationCommandReceiptRepository = class extends ServiceMap.Service()("t3/persistence/Services/OrchestrationCommandReceipts/OrchestrationCommandReceiptRepository") {};

//#endregion
//#region src/persistence/Layers/OrchestrationCommandReceipts.ts
const makeOrchestrationCommandReceiptRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertReceiptRow = SqlSchema.void({
		Request: OrchestrationCommandReceipt,
		execute: (receipt) => sql`
        INSERT INTO orchestration_command_receipts (
          command_id,
          aggregate_kind,
          aggregate_id,
          accepted_at,
          result_sequence,
          status,
          error
        )
        VALUES (
          ${receipt.commandId},
          ${receipt.aggregateKind},
          ${receipt.aggregateId},
          ${receipt.acceptedAt},
          ${receipt.resultSequence},
          ${receipt.status},
          ${receipt.error}
        )
        ON CONFLICT (command_id)
        DO UPDATE SET
          aggregate_kind = excluded.aggregate_kind,
          aggregate_id = excluded.aggregate_id,
          accepted_at = excluded.accepted_at,
          result_sequence = excluded.result_sequence,
          status = excluded.status,
          error = excluded.error
      `
	});
	const findReceiptByCommandId = SqlSchema.findOneOption({
		Request: GetByCommandIdInput,
		Result: OrchestrationCommandReceipt,
		execute: ({ commandId }) => sql`
        SELECT
          command_id AS "commandId",
          aggregate_kind AS "aggregateKind",
          aggregate_id AS "aggregateId",
          accepted_at AS "acceptedAt",
          result_sequence AS "resultSequence",
          status,
          error
        FROM orchestration_command_receipts
        WHERE command_id = ${commandId}
      `
	});
	const upsert = (receipt) => upsertReceiptRow(receipt).pipe(Effect.mapError(toPersistenceSqlError("OrchestrationCommandReceiptRepository.upsert:query")));
	const getByCommandId = (input) => findReceiptByCommandId(input).pipe(Effect.mapError(toPersistenceSqlError("OrchestrationCommandReceiptRepository.getByCommandId:query")));
	return {
		upsert,
		getByCommandId
	};
});
const OrchestrationCommandReceiptRepositoryLive = Layer.effect(OrchestrationCommandReceiptRepository, makeOrchestrationCommandReceiptRepository);

//#endregion
//#region src/persistence/Services/OrchestrationEventStore.ts
/**
* OrchestrationEventStore - Service tag for orchestration event persistence.
*
* @example
* ```ts
* const program = Effect.gen(function* () {
*   const events = yield* OrchestrationEventStore
*   return yield* Stream.runCollect(events.readAll())
* })
* ```
*/
var OrchestrationEventStore = class extends ServiceMap.Service()("t3/persistence/Services/OrchestrationEventStore") {};

//#endregion
//#region src/persistence/Layers/OrchestrationEventStore.ts
const decodeEvent = Schema.decodeUnknownEffect(OrchestrationEvent);
const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const EventMetadataFromJsonString = Schema.fromJsonString(OrchestrationEventMetadata);
const AppendEventRequestSchema = Schema.Struct({
	eventId: EventId,
	aggregateKind: OrchestrationAggregateKind,
	streamId: Schema.Union([ProjectId, ThreadId]),
	type: OrchestrationEventType,
	causationEventId: Schema.NullOr(EventId),
	correlationId: Schema.NullOr(CommandId),
	actorKind: OrchestrationActorKind,
	occurredAt: IsoDateTime,
	commandId: Schema.NullOr(CommandId),
	payloadJson: UnknownFromJsonString,
	metadataJson: EventMetadataFromJsonString
});
const OrchestrationEventPersistedRowSchema = Schema.Struct({
	sequence: NonNegativeInt,
	eventId: EventId,
	type: OrchestrationEventType,
	aggregateKind: OrchestrationAggregateKind,
	aggregateId: Schema.Union([ProjectId, ThreadId]),
	occurredAt: IsoDateTime,
	commandId: Schema.NullOr(CommandId),
	causationEventId: Schema.NullOr(EventId),
	correlationId: Schema.NullOr(CommandId),
	payload: UnknownFromJsonString,
	metadata: EventMetadataFromJsonString
});
const ReadFromSequenceRequestSchema = Schema.Struct({
	sequenceExclusive: NonNegativeInt,
	limit: Schema.Number
});
const DEFAULT_READ_FROM_SEQUENCE_LIMIT = 1e3;
const READ_PAGE_SIZE = 500;
function inferActorKind(event) {
	if (event.commandId !== null && event.commandId.startsWith("provider:")) return "provider";
	if (event.commandId !== null && event.commandId.startsWith("server:")) return "server";
	if (event.metadata.providerTurnId !== void 0 || event.metadata.providerItemId !== void 0 || event.metadata.adapterKey !== void 0) return "provider";
	if (event.commandId === null) return "server";
	return "client";
}
function toPersistenceSqlOrDecodeError$5(sqlOperation, decodeOperation) {
	return (cause) => Schema.isSchemaError(cause) ? toPersistenceDecodeError(decodeOperation)(cause) : toPersistenceSqlError(sqlOperation)(cause);
}
const makeEventStore = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const appendEventRow = SqlSchema.findOne({
		Request: AppendEventRequestSchema,
		Result: OrchestrationEventPersistedRowSchema,
		execute: (request) => sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          command_id,
          causation_event_id,
          correlation_id,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES (
          ${request.eventId},
          ${request.aggregateKind},
          ${request.streamId},
          COALESCE(
            (
              SELECT stream_version + 1
              FROM orchestration_events
              WHERE aggregate_kind = ${request.aggregateKind}
                AND stream_id = ${request.streamId}
              ORDER BY stream_version DESC
              LIMIT 1
            ),
            0
          ),
          ${request.type},
          ${request.occurredAt},
          ${request.commandId},
          ${request.causationEventId},
          ${request.correlationId},
          ${request.actorKind},
          ${request.payloadJson},
          ${request.metadataJson}
        )
        RETURNING
          sequence,
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
      `
	});
	const readEventRowsFromSequence = SqlSchema.findAll({
		Request: ReadFromSequenceRequestSchema,
		Result: OrchestrationEventPersistedRowSchema,
		execute: (request) => sql`
        SELECT
          sequence,
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
        FROM orchestration_events
        WHERE sequence > ${request.sequenceExclusive}
        ORDER BY sequence ASC
        LIMIT ${request.limit}
      `
	});
	const append = (event) => appendEventRow({
		eventId: event.eventId,
		aggregateKind: event.aggregateKind,
		streamId: event.aggregateId,
		type: event.type,
		causationEventId: event.causationEventId,
		correlationId: event.correlationId,
		actorKind: inferActorKind(event),
		occurredAt: event.occurredAt,
		commandId: event.commandId,
		payloadJson: event.payload,
		metadataJson: event.metadata
	}).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$5("OrchestrationEventStore.append:insert", "OrchestrationEventStore.append:decodeRow")), Effect.flatMap((row) => decodeEvent(row).pipe(Effect.mapError(toPersistenceDecodeError("OrchestrationEventStore.append:rowToEvent")))));
	const readFromSequence = (sequenceExclusive, limit = DEFAULT_READ_FROM_SEQUENCE_LIMIT) => {
		const normalizedLimit = Math.max(0, Math.floor(limit));
		if (normalizedLimit === 0) return Stream.empty;
		const readPage = (cursor, remaining) => Stream.fromEffect(readEventRowsFromSequence({
			sequenceExclusive: cursor,
			limit: Math.min(remaining, READ_PAGE_SIZE)
		}).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$5("OrchestrationEventStore.readFromSequence:query", "OrchestrationEventStore.readFromSequence:decodeRows")), Effect.flatMap((rows) => Effect.forEach(rows, (row) => decodeEvent(row).pipe(Effect.mapError(toPersistenceDecodeError("OrchestrationEventStore.readFromSequence:rowToEvent"))))))).pipe(Stream.flatMap((events) => {
			if (events.length === 0) return Stream.empty;
			const nextRemaining = remaining - events.length;
			if (nextRemaining <= 0) return Stream.fromIterable(events);
			return Stream.concat(Stream.fromIterable(events), readPage(events[events.length - 1].sequence, nextRemaining));
		}));
		return readPage(sequenceExclusive, normalizedLimit);
	};
	return {
		append,
		readFromSequence,
		readAll: () => readFromSequence(0, Number.MAX_SAFE_INTEGER)
	};
});
const OrchestrationEventStoreLive = Layer.effect(OrchestrationEventStore, makeEventStore);

//#endregion
//#region src/persistence/Services/ProviderSessionRuntime.ts
/**
* ProviderSessionRuntimeRepository - Repository interface for provider runtime sessions.
*
* Owns persistence operations for provider runtime metadata and resume cursors.
*
* @module ProviderSessionRuntimeRepository
*/
const ProviderSessionRuntime = Schema.Struct({
	threadId: ThreadId,
	providerName: Schema.String,
	adapterKey: Schema.String,
	runtimeMode: RuntimeMode,
	status: ProviderSessionRuntimeStatus,
	lastSeenAt: IsoDateTime,
	resumeCursor: Schema.NullOr(Schema.Unknown),
	runtimePayload: Schema.NullOr(Schema.Unknown)
});
const GetProviderSessionRuntimeInput = Schema.Struct({ threadId: ThreadId });
const DeleteProviderSessionRuntimeInput = Schema.Struct({ threadId: ThreadId });
/**
* ProviderSessionRuntimeRepository - Service tag for provider runtime persistence.
*/
var ProviderSessionRuntimeRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProviderSessionRuntime/ProviderSessionRuntimeRepository") {};

//#endregion
//#region src/persistence/Layers/ProviderSessionRuntime.ts
const ProviderSessionRuntimeDbRowSchema = ProviderSessionRuntime.mapFields(Struct.assign({
	resumeCursor: Schema.NullOr(Schema.fromJsonString(Schema.Unknown)),
	runtimePayload: Schema.NullOr(Schema.fromJsonString(Schema.Unknown))
}));
const decodeRuntime = Schema.decodeUnknownEffect(ProviderSessionRuntime);
const GetRuntimeRequestSchema = Schema.Struct({ threadId: ThreadId });
const DeleteRuntimeRequestSchema = GetRuntimeRequestSchema;
function toPersistenceSqlOrDecodeError$4(sqlOperation, decodeOperation) {
	return (cause) => Schema.isSchemaError(cause) ? toPersistenceDecodeError(decodeOperation)(cause) : toPersistenceSqlError(sqlOperation)(cause);
}
const makeProviderSessionRuntimeRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertRuntimeRow = SqlSchema.void({
		Request: ProviderSessionRuntimeDbRowSchema,
		execute: (runtime) => sql`
        INSERT INTO provider_session_runtime (
          thread_id,
          provider_name,
          adapter_key,
          runtime_mode,
          status,
          last_seen_at,
          resume_cursor_json,
          runtime_payload_json
        )
        VALUES (
          ${runtime.threadId},
          ${runtime.providerName},
          ${runtime.adapterKey},
          ${runtime.runtimeMode},
          ${runtime.status},
          ${runtime.lastSeenAt},
          ${runtime.resumeCursor},
          ${runtime.runtimePayload}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          provider_name = excluded.provider_name,
          adapter_key = excluded.adapter_key,
          runtime_mode = excluded.runtime_mode,
          status = excluded.status,
          last_seen_at = excluded.last_seen_at,
          resume_cursor_json = excluded.resume_cursor_json,
          runtime_payload_json = excluded.runtime_payload_json
      `
	});
	const getRuntimeRowByThreadId = SqlSchema.findOneOption({
		Request: GetRuntimeRequestSchema,
		Result: ProviderSessionRuntimeDbRowSchema,
		execute: ({ threadId }) => sql`
        SELECT
          thread_id AS "threadId",
          provider_name AS "providerName",
          adapter_key AS "adapterKey",
          runtime_mode AS "runtimeMode",
          status,
          last_seen_at AS "lastSeenAt",
          resume_cursor_json AS "resumeCursor",
          runtime_payload_json AS "runtimePayload"
        FROM provider_session_runtime
        WHERE thread_id = ${threadId}
      `
	});
	const listRuntimeRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProviderSessionRuntimeDbRowSchema,
		execute: () => sql`
        SELECT
          thread_id AS "threadId",
          provider_name AS "providerName",
          adapter_key AS "adapterKey",
          runtime_mode AS "runtimeMode",
          status,
          last_seen_at AS "lastSeenAt",
          resume_cursor_json AS "resumeCursor",
          runtime_payload_json AS "runtimePayload"
        FROM provider_session_runtime
        ORDER BY last_seen_at ASC, thread_id ASC
      `
	});
	const deleteRuntimeByThreadId = SqlSchema.void({
		Request: DeleteRuntimeRequestSchema,
		execute: ({ threadId }) => sql`
        DELETE FROM provider_session_runtime
        WHERE thread_id = ${threadId}
      `
	});
	const upsert = (runtime) => upsertRuntimeRow(runtime).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$4("ProviderSessionRuntimeRepository.upsert:query", "ProviderSessionRuntimeRepository.upsert:encodeRequest")));
	const getByThreadId = (input) => getRuntimeRowByThreadId(input).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$4("ProviderSessionRuntimeRepository.getByThreadId:query", "ProviderSessionRuntimeRepository.getByThreadId:decodeRow")), Effect.flatMap((runtimeRowOption) => Option.match(runtimeRowOption, {
		onNone: () => Effect.succeed(Option.none()),
		onSome: (row) => decodeRuntime(row).pipe(Effect.mapError(toPersistenceDecodeError("ProviderSessionRuntimeRepository.getByThreadId:rowToRuntime")), Effect.map((runtime) => Option.some(runtime)))
	})));
	const list = () => listRuntimeRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$4("ProviderSessionRuntimeRepository.list:query", "ProviderSessionRuntimeRepository.list:decodeRows")), Effect.flatMap((rows) => Effect.forEach(rows, (row) => decodeRuntime(row).pipe(Effect.mapError(toPersistenceDecodeError("ProviderSessionRuntimeRepository.list:rowToRuntime"))), { concurrency: "unbounded" })));
	const deleteByThreadId = (input) => deleteRuntimeByThreadId(input).pipe(Effect.mapError(toPersistenceSqlError("ProviderSessionRuntimeRepository.deleteByThreadId:query")));
	return {
		upsert,
		getByThreadId,
		list,
		deleteByThreadId
	};
});
const ProviderSessionRuntimeRepositoryLive = Layer.effect(ProviderSessionRuntimeRepository, makeProviderSessionRuntimeRepository);

//#endregion
//#region src/orchestration/Errors.ts
var OrchestrationCommandInvariantError = class extends Schema.TaggedErrorClass()("OrchestrationCommandInvariantError", {
	commandType: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Orchestration command invariant failed (${this.commandType}): ${this.detail}`;
	}
};
var OrchestrationCommandPreviouslyRejectedError = class extends Schema.TaggedErrorClass()("OrchestrationCommandPreviouslyRejectedError", {
	commandId: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Command previously rejected (${this.commandId}): ${this.detail}`;
	}
};
var OrchestrationProjectorDecodeError = class extends Schema.TaggedErrorClass()("OrchestrationProjectorDecodeError", {
	eventType: Schema.String,
	issue: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Projector decode failed for ${this.eventType}: ${this.issue}`;
	}
};
function toProjectorDecodeError(eventType) {
	return (error) => new OrchestrationProjectorDecodeError({
		eventType,
		issue: SchemaIssue.makeFormatterDefault()(error.issue),
		cause: error
	});
}

//#endregion
//#region src/orchestration/commandInvariants.ts
function invariantError(commandType, detail) {
	return new OrchestrationCommandInvariantError({
		commandType,
		detail
	});
}
function findThreadById(readModel, threadId) {
	return readModel.threads.find((thread) => thread.id === threadId);
}
function findProjectById(readModel, projectId) {
	return readModel.projects.find((project) => project.id === projectId);
}
function requireProject(input) {
	const project = findProjectById(input.readModel, input.projectId);
	if (project) return Effect.succeed(project);
	return Effect.fail(invariantError(input.command.type, `Project '${input.projectId}' does not exist for command '${input.command.type}'.`));
}
function requireProjectAbsent(input) {
	if (!findProjectById(input.readModel, input.projectId)) return Effect.void;
	return Effect.fail(invariantError(input.command.type, `Project '${input.projectId}' already exists and cannot be created twice.`));
}
function requireThread(input) {
	const thread = findThreadById(input.readModel, input.threadId);
	if (thread) return Effect.succeed(thread);
	return Effect.fail(invariantError(input.command.type, `Thread '${input.threadId}' does not exist for command '${input.command.type}'.`));
}
function requireThreadAbsent(input) {
	if (!findThreadById(input.readModel, input.threadId)) return Effect.void;
	return Effect.fail(invariantError(input.command.type, `Thread '${input.threadId}' already exists and cannot be created twice.`));
}

//#endregion
//#region src/orchestration/decider.ts
const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
const DEFAULT_ASSISTANT_DELIVERY_MODE$1 = "buffered";
const defaultMetadata = {
	eventId: crypto.randomUUID(),
	aggregateKind: "thread",
	aggregateId: "",
	occurredAt: nowIso(),
	commandId: null,
	causationEventId: null,
	correlationId: null,
	metadata: {}
};
function withEventBase(input) {
	return {
		...defaultMetadata,
		eventId: crypto.randomUUID(),
		aggregateKind: input.aggregateKind,
		aggregateId: input.aggregateId,
		occurredAt: input.occurredAt,
		commandId: input.commandId,
		correlationId: input.commandId,
		metadata: input.metadata ?? {}
	};
}
const decideOrchestrationCommand = Effect.fn("decideOrchestrationCommand")(function* ({ command, readModel }) {
	switch (command.type) {
		case "project.create":
			yield* requireProjectAbsent({
				readModel,
				command,
				projectId: command.projectId
			});
			return {
				...withEventBase({
					aggregateKind: "project",
					aggregateId: command.projectId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "project.created",
				payload: {
					projectId: command.projectId,
					title: command.title,
					workspaceRoot: command.workspaceRoot,
					defaultModel: command.defaultModel ?? null,
					scripts: [],
					createdAt: command.createdAt,
					updatedAt: command.createdAt
				}
			};
		case "project.meta.update": {
			yield* requireProject({
				readModel,
				command,
				projectId: command.projectId
			});
			const occurredAt = nowIso();
			return {
				...withEventBase({
					aggregateKind: "project",
					aggregateId: command.projectId,
					occurredAt,
					commandId: command.commandId
				}),
				type: "project.meta-updated",
				payload: {
					projectId: command.projectId,
					...command.title !== void 0 ? { title: command.title } : {},
					...command.workspaceRoot !== void 0 ? { workspaceRoot: command.workspaceRoot } : {},
					...command.defaultModel !== void 0 ? { defaultModel: command.defaultModel } : {},
					...command.scripts !== void 0 ? { scripts: command.scripts } : {},
					updatedAt: occurredAt
				}
			};
		}
		case "project.delete": {
			yield* requireProject({
				readModel,
				command,
				projectId: command.projectId
			});
			const occurredAt = nowIso();
			return {
				...withEventBase({
					aggregateKind: "project",
					aggregateId: command.projectId,
					occurredAt,
					commandId: command.commandId
				}),
				type: "project.deleted",
				payload: {
					projectId: command.projectId,
					deletedAt: occurredAt
				}
			};
		}
		case "thread.create":
			yield* requireProject({
				readModel,
				command,
				projectId: command.projectId
			});
			yield* requireThreadAbsent({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.created",
				payload: {
					threadId: command.threadId,
					projectId: command.projectId,
					title: command.title,
					model: command.model,
					runtimeMode: command.runtimeMode,
					interactionMode: command.interactionMode,
					branch: command.branch,
					worktreePath: command.worktreePath,
					createdAt: command.createdAt,
					updatedAt: command.createdAt
				}
			};
		case "thread.delete": {
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			const occurredAt = nowIso();
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt,
					commandId: command.commandId
				}),
				type: "thread.deleted",
				payload: {
					threadId: command.threadId,
					deletedAt: occurredAt
				}
			};
		}
		case "thread.meta.update": {
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			const occurredAt = nowIso();
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt,
					commandId: command.commandId
				}),
				type: "thread.meta-updated",
				payload: {
					threadId: command.threadId,
					...command.title !== void 0 ? { title: command.title } : {},
					...command.model !== void 0 ? { model: command.model } : {},
					...command.branch !== void 0 ? { branch: command.branch } : {},
					...command.worktreePath !== void 0 ? { worktreePath: command.worktreePath } : {},
					updatedAt: occurredAt
				}
			};
		}
		case "thread.runtime-mode.set": {
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			const occurredAt = nowIso();
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt,
					commandId: command.commandId
				}),
				type: "thread.runtime-mode-set",
				payload: {
					threadId: command.threadId,
					runtimeMode: command.runtimeMode,
					updatedAt: occurredAt
				}
			};
		}
		case "thread.interaction-mode.set": {
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			const occurredAt = nowIso();
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt,
					commandId: command.commandId
				}),
				type: "thread.interaction-mode-set",
				payload: {
					threadId: command.threadId,
					interactionMode: command.interactionMode,
					updatedAt: occurredAt
				}
			};
		}
		case "thread.turn.start": {
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			const userMessageEvent = {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.message-sent",
				payload: {
					threadId: command.threadId,
					messageId: command.message.messageId,
					role: "user",
					text: command.message.text,
					attachments: command.message.attachments,
					turnId: null,
					streaming: false,
					createdAt: command.createdAt,
					updatedAt: command.createdAt
				}
			};
			return [userMessageEvent, {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				causationEventId: userMessageEvent.eventId,
				type: "thread.turn-start-requested",
				payload: {
					threadId: command.threadId,
					messageId: command.message.messageId,
					...command.provider !== void 0 ? { provider: command.provider } : {},
					...command.model !== void 0 ? { model: command.model } : {},
					...command.serviceTier !== void 0 ? { serviceTier: command.serviceTier } : {},
					...command.modelOptions !== void 0 ? { modelOptions: command.modelOptions } : {},
					assistantDeliveryMode: command.assistantDeliveryMode ?? DEFAULT_ASSISTANT_DELIVERY_MODE$1,
					runtimeMode: readModel.threads.find((entry) => entry.id === command.threadId)?.runtimeMode ?? command.runtimeMode,
					interactionMode: readModel.threads.find((entry) => entry.id === command.threadId)?.interactionMode ?? command.interactionMode,
					createdAt: command.createdAt
				}
			}];
		}
		case "thread.turn.interrupt":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.turn-interrupt-requested",
				payload: {
					threadId: command.threadId,
					...command.turnId !== void 0 ? { turnId: command.turnId } : {},
					createdAt: command.createdAt
				}
			};
		case "thread.approval.respond":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId,
					metadata: { requestId: command.requestId }
				}),
				type: "thread.approval-response-requested",
				payload: {
					threadId: command.threadId,
					requestId: command.requestId,
					decision: command.decision,
					createdAt: command.createdAt
				}
			};
		case "thread.user-input.respond":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId,
					metadata: { requestId: command.requestId }
				}),
				type: "thread.user-input-response-requested",
				payload: {
					threadId: command.threadId,
					requestId: command.requestId,
					answers: command.answers,
					createdAt: command.createdAt
				}
			};
		case "thread.checkpoint.revert":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.checkpoint-revert-requested",
				payload: {
					threadId: command.threadId,
					turnCount: command.turnCount,
					createdAt: command.createdAt
				}
			};
		case "thread.session.stop":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.session-stop-requested",
				payload: {
					threadId: command.threadId,
					createdAt: command.createdAt
				}
			};
		case "thread.session.set":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId,
					metadata: {}
				}),
				type: "thread.session-set",
				payload: {
					threadId: command.threadId,
					session: command.session
				}
			};
		case "thread.message.assistant.delta":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.message-sent",
				payload: {
					threadId: command.threadId,
					messageId: command.messageId,
					role: "assistant",
					text: command.delta,
					turnId: command.turnId ?? null,
					streaming: true,
					createdAt: command.createdAt,
					updatedAt: command.createdAt
				}
			};
		case "thread.message.assistant.complete":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.message-sent",
				payload: {
					threadId: command.threadId,
					messageId: command.messageId,
					role: "assistant",
					text: "",
					turnId: command.turnId ?? null,
					streaming: false,
					createdAt: command.createdAt,
					updatedAt: command.createdAt
				}
			};
		case "thread.proposed-plan.upsert":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.proposed-plan-upserted",
				payload: {
					threadId: command.threadId,
					proposedPlan: command.proposedPlan
				}
			};
		case "thread.turn.diff.complete":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.turn-diff-completed",
				payload: {
					threadId: command.threadId,
					turnId: command.turnId,
					checkpointTurnCount: command.checkpointTurnCount,
					checkpointRef: command.checkpointRef,
					status: command.status,
					files: command.files,
					assistantMessageId: command.assistantMessageId ?? null,
					completedAt: command.completedAt
				}
			};
		case "thread.revert.complete":
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId
				}),
				type: "thread.reverted",
				payload: {
					threadId: command.threadId,
					turnCount: command.turnCount
				}
			};
		case "thread.activity.append": {
			yield* requireThread({
				readModel,
				command,
				threadId: command.threadId
			});
			const requestId = typeof command.activity.payload === "object" && command.activity.payload !== null && "requestId" in command.activity.payload && typeof command.activity.payload.requestId === "string" ? command.activity.payload.requestId : void 0;
			return {
				...withEventBase({
					aggregateKind: "thread",
					aggregateId: command.threadId,
					occurredAt: command.createdAt,
					commandId: command.commandId,
					...requestId !== void 0 ? { metadata: { requestId } } : {}
				}),
				type: "thread.activity-appended",
				payload: {
					threadId: command.threadId,
					activity: command.activity
				}
			};
		}
		default: {
			const fallback = command;
			return yield* new OrchestrationCommandInvariantError({
				commandType: fallback.type,
				detail: `Unknown command type: ${fallback.type}`
			});
		}
	}
});

//#endregion
//#region src/orchestration/Schemas.ts
const ProjectCreatedPayload = ProjectCreatedPayload$1;
const ProjectMetaUpdatedPayload = ProjectMetaUpdatedPayload$1;
const ProjectDeletedPayload = ProjectDeletedPayload$1;
const ThreadCreatedPayload = ThreadCreatedPayload$1;
const ThreadMetaUpdatedPayload = ThreadMetaUpdatedPayload$1;
const ThreadRuntimeModeSetPayload = ThreadRuntimeModeSetPayload$1;
const ThreadInteractionModeSetPayload = ThreadInteractionModeSetPayload$1;
const ThreadDeletedPayload = ThreadDeletedPayload$1;
const MessageSentPayloadSchema = ThreadMessageSentPayload;
const ThreadProposedPlanUpsertedPayload = ThreadProposedPlanUpsertedPayload$1;
const ThreadSessionSetPayload = ThreadSessionSetPayload$1;
const ThreadTurnDiffCompletedPayload = ThreadTurnDiffCompletedPayload$1;
const ThreadRevertedPayload = ThreadRevertedPayload$1;
const ThreadActivityAppendedPayload = ThreadActivityAppendedPayload$1;

//#endregion
//#region src/orchestration/projector.ts
const MAX_THREAD_MESSAGES = 2e3;
const MAX_THREAD_CHECKPOINTS = 500;
function checkpointStatusToLatestTurnState(status) {
	if (status === "error") return "error";
	if (status === "missing") return "interrupted";
	return "completed";
}
function updateThread(threads, threadId, patch) {
	return threads.map((thread) => thread.id === threadId ? {
		...thread,
		...patch
	} : thread);
}
function decodeForEvent(schema, value, eventType, field) {
	return Effect.try({
		try: () => Schema.decodeUnknownSync(schema)(value),
		catch: (error) => toProjectorDecodeError(`${eventType}:${field}`)(error)
	});
}
function retainThreadMessagesAfterRevert(messages, retainedTurnIds, turnCount) {
	const retainedMessageIds = /* @__PURE__ */ new Set();
	for (const message of messages) {
		if (message.role === "system") {
			retainedMessageIds.add(message.id);
			continue;
		}
		if (message.turnId !== null && retainedTurnIds.has(message.turnId)) retainedMessageIds.add(message.id);
	}
	const retainedUserCount = messages.filter((message) => message.role === "user" && retainedMessageIds.has(message.id)).length;
	const missingUserCount = Math.max(0, turnCount - retainedUserCount);
	if (missingUserCount > 0) {
		const fallbackUserMessages = messages.filter((message) => message.role === "user" && !retainedMessageIds.has(message.id) && (message.turnId === null || retainedTurnIds.has(message.turnId))).toSorted((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)).slice(0, missingUserCount);
		for (const message of fallbackUserMessages) retainedMessageIds.add(message.id);
	}
	const retainedAssistantCount = messages.filter((message) => message.role === "assistant" && retainedMessageIds.has(message.id)).length;
	const missingAssistantCount = Math.max(0, turnCount - retainedAssistantCount);
	if (missingAssistantCount > 0) {
		const fallbackAssistantMessages = messages.filter((message) => message.role === "assistant" && !retainedMessageIds.has(message.id) && (message.turnId === null || retainedTurnIds.has(message.turnId))).toSorted((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)).slice(0, missingAssistantCount);
		for (const message of fallbackAssistantMessages) retainedMessageIds.add(message.id);
	}
	return messages.filter((message) => retainedMessageIds.has(message.id));
}
function retainThreadActivitiesAfterRevert(activities, retainedTurnIds) {
	return activities.filter((activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId));
}
function retainThreadProposedPlansAfterRevert(proposedPlans, retainedTurnIds) {
	return proposedPlans.filter((proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId));
}
function compareThreadActivities(left, right) {
	if (left.sequence !== void 0 && right.sequence !== void 0) {
		if (left.sequence !== right.sequence) return left.sequence - right.sequence;
	} else if (left.sequence !== void 0) return 1;
	else if (right.sequence !== void 0) return -1;
	return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
function createEmptyReadModel(nowIso) {
	return {
		snapshotSequence: 0,
		projects: [],
		threads: [],
		updatedAt: nowIso
	};
}
function projectEvent(model, event) {
	const nextBase = {
		...model,
		snapshotSequence: event.sequence,
		updatedAt: event.occurredAt
	};
	switch (event.type) {
		case "project.created": return decodeForEvent(ProjectCreatedPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => {
			const existing = nextBase.projects.find((entry) => entry.id === payload.projectId);
			const nextProject = {
				id: payload.projectId,
				title: payload.title,
				workspaceRoot: payload.workspaceRoot,
				defaultModel: payload.defaultModel,
				scripts: payload.scripts,
				createdAt: payload.createdAt,
				updatedAt: payload.updatedAt,
				deletedAt: null
			};
			return {
				...nextBase,
				projects: existing ? nextBase.projects.map((entry) => entry.id === payload.projectId ? nextProject : entry) : [...nextBase.projects, nextProject]
			};
		}));
		case "project.meta-updated": return decodeForEvent(ProjectMetaUpdatedPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => ({
			...nextBase,
			projects: nextBase.projects.map((project) => project.id === payload.projectId ? {
				...project,
				...payload.title !== void 0 ? { title: payload.title } : {},
				...payload.workspaceRoot !== void 0 ? { workspaceRoot: payload.workspaceRoot } : {},
				...payload.defaultModel !== void 0 ? { defaultModel: payload.defaultModel } : {},
				...payload.scripts !== void 0 ? { scripts: payload.scripts } : {},
				updatedAt: payload.updatedAt
			} : project)
		})));
		case "project.deleted": return decodeForEvent(ProjectDeletedPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => ({
			...nextBase,
			projects: nextBase.projects.map((project) => project.id === payload.projectId ? {
				...project,
				deletedAt: payload.deletedAt,
				updatedAt: payload.deletedAt
			} : project)
		})));
		case "thread.created": return Effect.gen(function* () {
			const payload = yield* decodeForEvent(ThreadCreatedPayload, event.payload, event.type, "payload");
			const thread = yield* decodeForEvent(OrchestrationThread, {
				id: payload.threadId,
				projectId: payload.projectId,
				title: payload.title,
				model: payload.model,
				runtimeMode: payload.runtimeMode,
				interactionMode: payload.interactionMode,
				branch: payload.branch,
				worktreePath: payload.worktreePath,
				latestTurn: null,
				createdAt: payload.createdAt,
				updatedAt: payload.updatedAt,
				deletedAt: null,
				messages: [],
				activities: [],
				checkpoints: [],
				session: null
			}, event.type, "thread");
			const existing = nextBase.threads.find((entry) => entry.id === thread.id);
			return {
				...nextBase,
				threads: existing ? nextBase.threads.map((entry) => entry.id === thread.id ? thread : entry) : [...nextBase.threads, thread]
			};
		});
		case "thread.deleted": return decodeForEvent(ThreadDeletedPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => ({
			...nextBase,
			threads: updateThread(nextBase.threads, payload.threadId, {
				deletedAt: payload.deletedAt,
				updatedAt: payload.deletedAt
			})
		})));
		case "thread.meta-updated": return decodeForEvent(ThreadMetaUpdatedPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => ({
			...nextBase,
			threads: updateThread(nextBase.threads, payload.threadId, {
				...payload.title !== void 0 ? { title: payload.title } : {},
				...payload.model !== void 0 ? { model: payload.model } : {},
				...payload.branch !== void 0 ? { branch: payload.branch } : {},
				...payload.worktreePath !== void 0 ? { worktreePath: payload.worktreePath } : {},
				updatedAt: payload.updatedAt
			})
		})));
		case "thread.runtime-mode-set": return decodeForEvent(ThreadRuntimeModeSetPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => ({
			...nextBase,
			threads: updateThread(nextBase.threads, payload.threadId, {
				runtimeMode: payload.runtimeMode,
				updatedAt: payload.updatedAt
			})
		})));
		case "thread.interaction-mode-set": return decodeForEvent(ThreadInteractionModeSetPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => ({
			...nextBase,
			threads: updateThread(nextBase.threads, payload.threadId, {
				interactionMode: payload.interactionMode,
				updatedAt: payload.updatedAt
			})
		})));
		case "thread.message-sent": return Effect.gen(function* () {
			const payload = yield* decodeForEvent(MessageSentPayloadSchema, event.payload, event.type, "payload");
			const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
			if (!thread) return nextBase;
			const message = yield* decodeForEvent(OrchestrationMessage, {
				id: payload.messageId,
				role: payload.role,
				text: payload.text,
				...payload.attachments !== void 0 ? { attachments: payload.attachments } : {},
				turnId: payload.turnId,
				streaming: payload.streaming,
				createdAt: payload.createdAt,
				updatedAt: payload.updatedAt
			}, event.type, "message");
			const cappedMessages = (thread.messages.find((entry) => entry.id === message.id) ? thread.messages.map((entry) => entry.id === message.id ? {
				...entry,
				text: message.streaming ? `${entry.text}${message.text}` : message.text.length > 0 ? message.text : entry.text,
				streaming: message.streaming,
				updatedAt: message.updatedAt,
				turnId: message.turnId,
				...message.attachments !== void 0 ? { attachments: message.attachments } : {}
			} : entry) : [...thread.messages, message]).slice(-MAX_THREAD_MESSAGES);
			return {
				...nextBase,
				threads: updateThread(nextBase.threads, payload.threadId, {
					messages: cappedMessages,
					updatedAt: event.occurredAt
				})
			};
		});
		case "thread.session-set": return Effect.gen(function* () {
			const payload = yield* decodeForEvent(ThreadSessionSetPayload, event.payload, event.type, "payload");
			const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
			if (!thread) return nextBase;
			const session = yield* decodeForEvent(OrchestrationSession, payload.session, event.type, "session");
			return {
				...nextBase,
				threads: updateThread(nextBase.threads, payload.threadId, {
					session,
					latestTurn: session.status === "running" && session.activeTurnId !== null ? {
						turnId: session.activeTurnId,
						state: "running",
						requestedAt: thread.latestTurn?.turnId === session.activeTurnId ? thread.latestTurn.requestedAt : session.updatedAt,
						startedAt: thread.latestTurn?.turnId === session.activeTurnId ? thread.latestTurn.startedAt ?? session.updatedAt : session.updatedAt,
						completedAt: null,
						assistantMessageId: thread.latestTurn?.turnId === session.activeTurnId ? thread.latestTurn.assistantMessageId : null
					} : thread.latestTurn,
					updatedAt: event.occurredAt
				})
			};
		});
		case "thread.proposed-plan-upserted": return Effect.gen(function* () {
			const payload = yield* decodeForEvent(ThreadProposedPlanUpsertedPayload, event.payload, event.type, "payload");
			const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
			if (!thread) return nextBase;
			const proposedPlans = [...thread.proposedPlans.filter((entry) => entry.id !== payload.proposedPlan.id), payload.proposedPlan].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)).slice(-200);
			return {
				...nextBase,
				threads: updateThread(nextBase.threads, payload.threadId, {
					proposedPlans,
					updatedAt: event.occurredAt
				})
			};
		});
		case "thread.turn-diff-completed": return Effect.gen(function* () {
			const payload = yield* decodeForEvent(ThreadTurnDiffCompletedPayload, event.payload, event.type, "payload");
			const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
			if (!thread) return nextBase;
			const checkpoint = yield* decodeForEvent(OrchestrationCheckpointSummary, {
				turnId: payload.turnId,
				checkpointTurnCount: payload.checkpointTurnCount,
				checkpointRef: payload.checkpointRef,
				status: payload.status,
				files: payload.files,
				assistantMessageId: payload.assistantMessageId,
				completedAt: payload.completedAt
			}, event.type, "checkpoint");
			const checkpoints = [...thread.checkpoints.filter((entry) => entry.turnId !== checkpoint.turnId), checkpoint].toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount).slice(-MAX_THREAD_CHECKPOINTS);
			return {
				...nextBase,
				threads: updateThread(nextBase.threads, payload.threadId, {
					checkpoints,
					latestTurn: {
						turnId: payload.turnId,
						state: checkpointStatusToLatestTurnState(payload.status),
						requestedAt: thread.latestTurn?.turnId === payload.turnId ? thread.latestTurn.requestedAt : payload.completedAt,
						startedAt: thread.latestTurn?.turnId === payload.turnId ? thread.latestTurn.startedAt ?? payload.completedAt : payload.completedAt,
						completedAt: payload.completedAt,
						assistantMessageId: payload.assistantMessageId
					},
					updatedAt: event.occurredAt
				})
			};
		});
		case "thread.reverted": return decodeForEvent(ThreadRevertedPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => {
			const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
			if (!thread) return nextBase;
			const checkpoints = thread.checkpoints.filter((entry) => entry.checkpointTurnCount <= payload.turnCount).toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount).slice(-MAX_THREAD_CHECKPOINTS);
			const retainedTurnIds = new Set(checkpoints.map((checkpoint) => checkpoint.turnId));
			const messages = retainThreadMessagesAfterRevert(thread.messages, retainedTurnIds, payload.turnCount).slice(-MAX_THREAD_MESSAGES);
			const proposedPlans = retainThreadProposedPlansAfterRevert(thread.proposedPlans, retainedTurnIds).slice(-200);
			const activities = retainThreadActivitiesAfterRevert(thread.activities, retainedTurnIds);
			const latestCheckpoint = checkpoints.at(-1) ?? null;
			const latestTurn = latestCheckpoint === null ? null : {
				turnId: latestCheckpoint.turnId,
				state: checkpointStatusToLatestTurnState(latestCheckpoint.status),
				requestedAt: latestCheckpoint.completedAt,
				startedAt: latestCheckpoint.completedAt,
				completedAt: latestCheckpoint.completedAt,
				assistantMessageId: latestCheckpoint.assistantMessageId
			};
			return {
				...nextBase,
				threads: updateThread(nextBase.threads, payload.threadId, {
					checkpoints,
					messages,
					proposedPlans,
					activities,
					latestTurn,
					updatedAt: event.occurredAt
				})
			};
		}));
		case "thread.activity-appended": return decodeForEvent(ThreadActivityAppendedPayload, event.payload, event.type, "payload").pipe(Effect.map((payload) => {
			const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
			if (!thread) return nextBase;
			const activities = [...thread.activities.filter((entry) => entry.id !== payload.activity.id), payload.activity].toSorted(compareThreadActivities).slice(-500);
			return {
				...nextBase,
				threads: updateThread(nextBase.threads, payload.threadId, {
					activities,
					updatedAt: event.occurredAt
				})
			};
		}));
		default: return Effect.succeed(nextBase);
	}
}

//#endregion
//#region src/orchestration/Services/ProjectionPipeline.ts
/**
* OrchestrationProjectionPipeline - Service tag for orchestration projections.
*/
var OrchestrationProjectionPipeline = class extends ServiceMap.Service()("t3/orchestration/Services/ProjectionPipeline/OrchestrationProjectionPipeline") {};

//#endregion
//#region src/orchestration/Services/OrchestrationEngine.ts
/**
* OrchestrationEngineService - Service tag for orchestration engine access.
*
* @example
* ```ts
* const program = Effect.gen(function* () {
*   const engine = yield* OrchestrationEngineService
*   return yield* engine.getReadModel()
* })
* ```
*/
var OrchestrationEngineService = class extends ServiceMap.Service()("t3/orchestration/Services/OrchestrationEngine/OrchestrationEngineService") {};

//#endregion
//#region src/orchestration/Layers/OrchestrationEngine.ts
function commandToAggregateRef(command) {
	switch (command.type) {
		case "project.create":
		case "project.meta.update":
		case "project.delete": return {
			aggregateKind: "project",
			aggregateId: command.projectId
		};
		default: return {
			aggregateKind: "thread",
			aggregateId: command.threadId
		};
	}
}
function formatDispatchError(error) {
	if (error instanceof Error && error.message.length > 0) return error.message;
	return String(error);
}
const makeOrchestrationEngine = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const eventStore = yield* OrchestrationEventStore;
	const commandReceiptRepository = yield* OrchestrationCommandReceiptRepository;
	const projectionPipeline = yield* OrchestrationProjectionPipeline;
	let readModel = createEmptyReadModel((/* @__PURE__ */ new Date()).toISOString());
	const commandQueue = yield* Queue.unbounded();
	const eventPubSub = yield* PubSub.unbounded();
	const processEnvelope = (envelope) => {
		const dispatchStartSequence = readModel.snapshotSequence;
		const reconcileReadModelAfterDispatchFailure = Effect.gen(function* () {
			const persistedEvents = yield* Stream.runCollect(eventStore.readFromSequence(dispatchStartSequence)).pipe(Effect.map((chunk) => Array.from(chunk)));
			if (persistedEvents.length === 0) return;
			let nextReadModel = readModel;
			for (const persistedEvent of persistedEvents) nextReadModel = yield* projectEvent(nextReadModel, persistedEvent);
			readModel = nextReadModel;
			for (const persistedEvent of persistedEvents) yield* PubSub.publish(eventPubSub, persistedEvent);
		});
		return Effect.gen(function* () {
			const existingReceipt = yield* commandReceiptRepository.getByCommandId({ commandId: envelope.command.commandId });
			if (Option.isSome(existingReceipt)) {
				if (existingReceipt.value.status === "accepted") {
					yield* Deferred.succeed(envelope.result, { sequence: existingReceipt.value.resultSequence });
					return;
				}
				yield* Deferred.fail(envelope.result, new OrchestrationCommandPreviouslyRejectedError({
					commandId: envelope.command.commandId,
					detail: existingReceipt.value.error ?? "Previously rejected."
				}));
				return;
			}
			const eventBase = yield* decideOrchestrationCommand({
				command: envelope.command,
				readModel
			});
			const eventBases = Array.isArray(eventBase) ? eventBase : [eventBase];
			const committedCommand = yield* sql.withTransaction(Effect.gen(function* () {
				const committedEvents = [];
				let nextReadModel = readModel;
				for (const nextEvent of eventBases) {
					const savedEvent = yield* eventStore.append(nextEvent);
					nextReadModel = yield* projectEvent(nextReadModel, savedEvent);
					yield* projectionPipeline.projectEvent(savedEvent);
					committedEvents.push(savedEvent);
				}
				const lastSavedEvent = committedEvents.at(-1) ?? null;
				if (lastSavedEvent === null) return yield* new OrchestrationCommandInvariantError({
					commandType: envelope.command.type,
					detail: "Command produced no events."
				});
				yield* commandReceiptRepository.upsert({
					commandId: envelope.command.commandId,
					aggregateKind: lastSavedEvent.aggregateKind,
					aggregateId: lastSavedEvent.aggregateId,
					acceptedAt: lastSavedEvent.occurredAt,
					resultSequence: lastSavedEvent.sequence,
					status: "accepted",
					error: null
				});
				return {
					committedEvents,
					lastSequence: lastSavedEvent.sequence,
					nextReadModel
				};
			})).pipe(Effect.catchTag("SqlError", (sqlError) => Effect.fail(toPersistenceSqlError("OrchestrationEngine.processEnvelope:transaction")(sqlError))));
			readModel = committedCommand.nextReadModel;
			for (const event of committedCommand.committedEvents) yield* PubSub.publish(eventPubSub, event);
			yield* Deferred.succeed(envelope.result, { sequence: committedCommand.lastSequence });
		}).pipe(Effect.catch((error) => Effect.gen(function* () {
			yield* reconcileReadModelAfterDispatchFailure.pipe(Effect.catch(() => Effect.logWarning("failed to reconcile orchestration read model after dispatch failure").pipe(Effect.annotateLogs({
				commandId: envelope.command.commandId,
				snapshotSequence: readModel.snapshotSequence
			}))));
			if (Schema.is(OrchestrationCommandInvariantError)(error)) {
				const aggregateRef = commandToAggregateRef(envelope.command);
				yield* commandReceiptRepository.upsert({
					commandId: envelope.command.commandId,
					aggregateKind: aggregateRef.aggregateKind,
					aggregateId: aggregateRef.aggregateId,
					acceptedAt: (/* @__PURE__ */ new Date()).toISOString(),
					resultSequence: readModel.snapshotSequence,
					status: "rejected",
					error: formatDispatchError(error)
				}).pipe(Effect.catch(() => Effect.void));
			}
			yield* Deferred.fail(envelope.result, error);
		})));
	};
	yield* projectionPipeline.bootstrap;
	yield* Stream.runForEach(eventStore.readAll(), (event) => Effect.gen(function* () {
		readModel = yield* projectEvent(readModel, event);
	}));
	const worker = Effect.forever(Queue.take(commandQueue).pipe(Effect.flatMap(processEnvelope)));
	yield* Effect.forkScoped(worker);
	yield* Effect.log("orchestration engine started").pipe(Effect.annotateLogs({ sequence: readModel.snapshotSequence }));
	const getReadModel = () => Effect.sync(() => readModel);
	const readEvents = (fromSequenceExclusive) => eventStore.readFromSequence(fromSequenceExclusive);
	const dispatch = (command) => Effect.gen(function* () {
		const result = yield* Deferred.make();
		yield* Queue.offer(commandQueue, {
			command,
			result
		});
		return yield* Deferred.await(result);
	});
	return {
		getReadModel,
		readEvents,
		dispatch,
		streamDomainEvents: Stream.fromPubSub(eventPubSub)
	};
});
const OrchestrationEngineLive = Layer.effect(OrchestrationEngineService, makeOrchestrationEngine);

//#endregion
//#region src/checkpointing/Diffs.ts
function parseTurnDiffFilesFromUnifiedDiff(diff) {
	const normalized = diff.replace(/\r\n/g, "\n").trim();
	if (normalized.length === 0) return [];
	return parsePatchFiles(normalized).flatMap((patch) => patch.files.map((file) => ({
		path: file.name,
		additions: file.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
		deletions: file.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0)
	}))).toSorted((left, right) => left.path.localeCompare(right.path));
}

//#endregion
//#region src/provider/Services/ProviderService.ts
/**
* ProviderService - Service tag for provider orchestration.
*/
var ProviderService = class extends ServiceMap.Service()("t3/provider/Services/ProviderService") {};

//#endregion
//#region src/orchestration/Services/CheckpointReactor.ts
/**
* CheckpointReactor - Checkpoint reaction service interface.
*
* Owns background workers that react to orchestration checkpoint lifecycle
* events and apply checkpoint side effects.
*
* @module CheckpointReactor
*/
/**
* CheckpointReactor - Service tag for checkpoint reactor workers.
*/
var CheckpointReactor = class extends ServiceMap.Service()("t3/orchestration/Services/CheckpointReactor") {};

//#endregion
//#region src/git/isRepo.ts
function isGitRepository(cwd) {
	return existsSync(join(cwd, ".git"));
}

//#endregion
//#region src/orchestration/Layers/CheckpointReactor.ts
function toTurnId$2(value) {
	return value === void 0 ? null : TurnId.makeUnsafe(String(value));
}
function sameId$1(left, right) {
	if (left === null || left === void 0 || right === null || right === void 0) return false;
	return left === right;
}
function checkpointStatusFromRuntime(status) {
	switch (status) {
		case "failed": return "error";
		case "cancelled":
		case "interrupted": return "missing";
		default: return "ready";
	}
}
const serverCommandId$1 = (tag) => CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);
const make$2 = Effect.gen(function* () {
	const orchestrationEngine = yield* OrchestrationEngineService;
	const providerService = yield* ProviderService;
	const checkpointStore = yield* CheckpointStore;
	const appendRevertFailureActivity = (input) => orchestrationEngine.dispatch({
		type: "thread.activity.append",
		commandId: serverCommandId$1("checkpoint-revert-failure"),
		threadId: input.threadId,
		activity: {
			id: EventId.makeUnsafe(crypto.randomUUID()),
			tone: "error",
			kind: "checkpoint.revert.failed",
			summary: "Checkpoint revert failed",
			payload: {
				turnCount: input.turnCount,
				detail: input.detail
			},
			turnId: null,
			createdAt: input.createdAt
		},
		createdAt: input.createdAt
	});
	const appendCaptureFailureActivity = (input) => orchestrationEngine.dispatch({
		type: "thread.activity.append",
		commandId: serverCommandId$1("checkpoint-capture-failure"),
		threadId: input.threadId,
		activity: {
			id: EventId.makeUnsafe(crypto.randomUUID()),
			tone: "error",
			kind: "checkpoint.capture.failed",
			summary: "Checkpoint capture failed",
			payload: { detail: input.detail },
			turnId: input.turnId,
			createdAt: input.createdAt
		},
		createdAt: input.createdAt
	});
	const resolveSessionRuntimeForThread = Effect.fnUntraced(function* (threadId) {
		const thread = (yield* orchestrationEngine.getReadModel()).threads.find((entry) => entry.id === threadId);
		const sessions = yield* providerService.listSessions();
		const findSessionWithCwd = (session) => {
			if (!session?.cwd) return Option.none();
			return Option.some({
				threadId: session.threadId,
				cwd: session.cwd
			});
		};
		if (thread) {
			const fromProjected = findSessionWithCwd(sessions.find((session) => session.threadId === thread.id));
			if (Option.isSome(fromProjected)) return fromProjected;
		}
		return Option.none();
	});
	const isGitWorkspace = (cwd) => isGitRepository(cwd);
	const captureCheckpointFromTurnCompletion = Effect.fnUntraced(function* (event) {
		const turnId = toTurnId$2(event.turnId);
		if (!turnId) return;
		const readModel = yield* orchestrationEngine.getReadModel();
		const thread = readModel.threads.find((entry) => entry.id === event.threadId);
		if (!thread) return;
		if (thread.session?.activeTurnId && !sameId$1(thread.session.activeTurnId, turnId)) return;
		if (thread.checkpoints.some((checkpoint) => checkpoint.turnId === turnId)) return;
		const sessionRuntime = yield* resolveSessionRuntimeForThread(thread.id);
		const checkpointCwd = Option.match(sessionRuntime, {
			onNone: () => void 0,
			onSome: (runtime) => runtime.cwd
		}) ?? resolveThreadWorkspaceCwd({
			thread,
			projects: readModel.projects
		});
		if (!checkpointCwd) {
			yield* Effect.logWarning("checkpoint capture skipped: no active provider session cwd", {
				threadId: thread.id,
				turnId
			});
			return;
		}
		if (!isGitWorkspace(checkpointCwd)) {
			yield* Effect.logDebug("checkpoint capture skipped for non-git workspace", {
				threadId: thread.id,
				turnId,
				cwd: checkpointCwd
			});
			return;
		}
		const nextTurnCount = thread.checkpoints.reduce((maxTurnCount, checkpoint) => Math.max(maxTurnCount, checkpoint.checkpointTurnCount), 0) + 1;
		const fromTurnCount = Math.max(0, nextTurnCount - 1);
		const fromCheckpointRef = checkpointRefForThreadTurn(thread.id, fromTurnCount);
		const targetCheckpointRef = checkpointRefForThreadTurn(thread.id, nextTurnCount);
		if (!(yield* checkpointStore.hasCheckpointRef({
			cwd: checkpointCwd,
			checkpointRef: fromCheckpointRef
		}))) yield* Effect.logWarning("checkpoint completion missing pre-turn baseline", {
			threadId: thread.id,
			turnId,
			fromTurnCount
		});
		yield* checkpointStore.captureCheckpoint({
			cwd: checkpointCwd,
			checkpointRef: targetCheckpointRef
		});
		const files = yield* checkpointStore.diffCheckpoints({
			cwd: checkpointCwd,
			fromCheckpointRef,
			toCheckpointRef: targetCheckpointRef,
			fallbackFromToHead: false
		}).pipe(Effect.map((diff) => parseTurnDiffFilesFromUnifiedDiff(diff).map((file) => ({
			path: file.path,
			kind: "modified",
			additions: file.additions,
			deletions: file.deletions
		}))), Effect.tapError((error) => appendCaptureFailureActivity({
			threadId: thread.id,
			turnId,
			detail: `Checkpoint captured, but turn diff summary is unavailable: ${error.message}`,
			createdAt: event.createdAt
		})), Effect.catch((error) => Effect.logWarning("failed to derive checkpoint file summary", {
			threadId: thread.id,
			turnId,
			turnCount: nextTurnCount,
			detail: error.message
		}).pipe(Effect.as([]))));
		const assistantMessageId = thread.messages.toReversed().find((entry) => entry.role === "assistant" && entry.turnId === turnId)?.id ?? MessageId.makeUnsafe(`assistant:${turnId}`);
		const now = event.createdAt;
		yield* orchestrationEngine.dispatch({
			type: "thread.turn.diff.complete",
			commandId: serverCommandId$1("checkpoint-turn-diff-complete"),
			threadId: thread.id,
			turnId,
			completedAt: now,
			checkpointRef: targetCheckpointRef,
			status: checkpointStatusFromRuntime(event.payload.state),
			files,
			assistantMessageId,
			checkpointTurnCount: nextTurnCount,
			createdAt: now
		});
		yield* orchestrationEngine.dispatch({
			type: "thread.activity.append",
			commandId: serverCommandId$1("checkpoint-captured-activity"),
			threadId: thread.id,
			activity: {
				id: EventId.makeUnsafe(crypto.randomUUID()),
				tone: "info",
				kind: "checkpoint.captured",
				summary: "Checkpoint captured",
				payload: {
					turnCount: nextTurnCount,
					status: event.payload.state
				},
				turnId,
				createdAt: now
			},
			createdAt: now
		});
	});
	const ensurePreTurnBaselineFromTurnStart = Effect.fnUntraced(function* (event) {
		const turnId = toTurnId$2(event.turnId);
		if (!turnId) return;
		const readModel = yield* orchestrationEngine.getReadModel();
		const thread = readModel.threads.find((entry) => entry.id === event.threadId);
		if (!thread) return;
		const checkpointCwd = resolveThreadWorkspaceCwd({
			thread,
			projects: readModel.projects
		}) ?? Option.match(yield* resolveSessionRuntimeForThread(thread.id), {
			onNone: () => void 0,
			onSome: (runtime) => runtime.cwd
		});
		if (!checkpointCwd) {
			yield* Effect.logWarning("checkpoint pre-turn capture skipped: no workspace cwd", {
				threadId: thread.id,
				turnId
			});
			return;
		}
		if (!isGitWorkspace(checkpointCwd)) return;
		const currentTurnCount = thread.checkpoints.reduce((maxTurnCount, checkpoint) => Math.max(maxTurnCount, checkpoint.checkpointTurnCount), 0);
		const baselineCheckpointRef = checkpointRefForThreadTurn(thread.id, currentTurnCount);
		if (yield* checkpointStore.hasCheckpointRef({
			cwd: checkpointCwd,
			checkpointRef: baselineCheckpointRef
		})) return;
		yield* checkpointStore.captureCheckpoint({
			cwd: checkpointCwd,
			checkpointRef: baselineCheckpointRef
		});
	});
	const ensurePreTurnBaselineFromDomainTurnStart = Effect.fnUntraced(function* (event) {
		if (event.type === "thread.message-sent") {
			if (event.payload.role !== "user" || event.payload.streaming || event.payload.turnId !== null) return;
		}
		const threadId = event.payload.threadId;
		const readModel = yield* orchestrationEngine.getReadModel();
		const thread = readModel.threads.find((entry) => entry.id === threadId);
		if (!thread) return;
		const checkpointCwd = resolveThreadWorkspaceCwd({
			thread,
			projects: readModel.projects
		}) ?? Option.match(yield* resolveSessionRuntimeForThread(threadId), {
			onNone: () => void 0,
			onSome: (runtime) => runtime.cwd
		});
		if (!checkpointCwd) {
			yield* Effect.logWarning("checkpoint pre-turn capture skipped: no workspace cwd", { threadId });
			return;
		}
		if (!isGitWorkspace(checkpointCwd)) return;
		const baselineCheckpointRef = checkpointRefForThreadTurn(threadId, thread.checkpoints.reduce((maxTurnCount, checkpoint) => Math.max(maxTurnCount, checkpoint.checkpointTurnCount), 0));
		if (yield* checkpointStore.hasCheckpointRef({
			cwd: checkpointCwd,
			checkpointRef: baselineCheckpointRef
		})) return;
		yield* checkpointStore.captureCheckpoint({
			cwd: checkpointCwd,
			checkpointRef: baselineCheckpointRef
		});
	});
	const handleRevertRequested = Effect.fnUntraced(function* (event) {
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const thread = (yield* orchestrationEngine.getReadModel()).threads.find((entry) => entry.id === event.payload.threadId);
		if (!thread) {
			yield* appendRevertFailureActivity({
				threadId: event.payload.threadId,
				turnCount: event.payload.turnCount,
				detail: "Thread was not found in read model.",
				createdAt: now
			}).pipe(Effect.catch(() => Effect.void));
			return;
		}
		const sessionRuntime = yield* resolveSessionRuntimeForThread(event.payload.threadId);
		if (Option.isNone(sessionRuntime)) {
			yield* appendRevertFailureActivity({
				threadId: event.payload.threadId,
				turnCount: event.payload.turnCount,
				detail: "No active provider session with workspace cwd is bound to this thread.",
				createdAt: now
			}).pipe(Effect.catch(() => Effect.void));
			return;
		}
		if (!isGitWorkspace(sessionRuntime.value.cwd)) {
			yield* appendRevertFailureActivity({
				threadId: event.payload.threadId,
				turnCount: event.payload.turnCount,
				detail: "Checkpoints are unavailable because this project is not a git repository.",
				createdAt: now
			}).pipe(Effect.catch(() => Effect.void));
			return;
		}
		const currentTurnCount = thread.checkpoints.reduce((maxTurnCount, checkpoint) => Math.max(maxTurnCount, checkpoint.checkpointTurnCount), 0);
		if (event.payload.turnCount > currentTurnCount) {
			yield* appendRevertFailureActivity({
				threadId: event.payload.threadId,
				turnCount: event.payload.turnCount,
				detail: `Checkpoint turn count ${event.payload.turnCount} exceeds current turn count ${currentTurnCount}.`,
				createdAt: now
			}).pipe(Effect.catch(() => Effect.void));
			return;
		}
		const targetCheckpointRef = event.payload.turnCount === 0 ? checkpointRefForThreadTurn(event.payload.threadId, 0) : thread.checkpoints.find((checkpoint) => checkpoint.checkpointTurnCount === event.payload.turnCount)?.checkpointRef;
		if (!targetCheckpointRef) {
			yield* appendRevertFailureActivity({
				threadId: event.payload.threadId,
				turnCount: event.payload.turnCount,
				detail: `Checkpoint ref for turn ${event.payload.turnCount} is unavailable in read model.`,
				createdAt: now
			}).pipe(Effect.catch(() => Effect.void));
			return;
		}
		if (!(yield* checkpointStore.restoreCheckpoint({
			cwd: sessionRuntime.value.cwd,
			checkpointRef: targetCheckpointRef,
			fallbackToHead: event.payload.turnCount === 0
		}))) {
			yield* appendRevertFailureActivity({
				threadId: event.payload.threadId,
				turnCount: event.payload.turnCount,
				detail: `Filesystem checkpoint is unavailable for turn ${event.payload.turnCount}.`,
				createdAt: now
			}).pipe(Effect.catch(() => Effect.void));
			return;
		}
		const rolledBackTurns = Math.max(0, currentTurnCount - event.payload.turnCount);
		if (rolledBackTurns > 0) yield* providerService.rollbackConversation({
			threadId: sessionRuntime.value.threadId,
			numTurns: rolledBackTurns
		});
		const staleCheckpointRefs = thread.checkpoints.filter((checkpoint) => checkpoint.checkpointTurnCount > event.payload.turnCount).map((checkpoint) => checkpoint.checkpointRef);
		if (staleCheckpointRefs.length > 0) yield* checkpointStore.deleteCheckpointRefs({
			cwd: sessionRuntime.value.cwd,
			checkpointRefs: staleCheckpointRefs
		});
		yield* orchestrationEngine.dispatch({
			type: "thread.revert.complete",
			commandId: serverCommandId$1("checkpoint-revert-complete"),
			threadId: event.payload.threadId,
			turnCount: event.payload.turnCount,
			createdAt: now
		}).pipe(Effect.catch((error) => appendRevertFailureActivity({
			threadId: event.payload.threadId,
			turnCount: event.payload.turnCount,
			detail: error.message,
			createdAt: now
		})), Effect.asVoid);
	});
	const processDomainEvent = Effect.fnUntraced(function* (event) {
		if (event.type === "thread.turn-start-requested" || event.type === "thread.message-sent") {
			yield* ensurePreTurnBaselineFromDomainTurnStart(event);
			return;
		}
		if (event.type === "thread.checkpoint-revert-requested") yield* handleRevertRequested(event).pipe(Effect.catch((error) => appendRevertFailureActivity({
			threadId: event.payload.threadId,
			turnCount: event.payload.turnCount,
			detail: error.message,
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		})));
	});
	const processRuntimeEvent = Effect.fnUntraced(function* (event) {
		if (event.type === "turn.started") {
			yield* ensurePreTurnBaselineFromTurnStart(event);
			return;
		}
		if (event.type === "turn.completed") {
			const turnId = toTurnId$2(event.turnId);
			yield* captureCheckpointFromTurnCompletion(event).pipe(Effect.catch((error) => appendCaptureFailureActivity({
				threadId: event.threadId,
				turnId,
				detail: error.message,
				createdAt: (/* @__PURE__ */ new Date()).toISOString()
			}).pipe(Effect.catch(() => Effect.void))));
			return;
		}
	});
	const processInput = (input) => input.source === "domain" ? processDomainEvent(input.event) : processRuntimeEvent(input.event);
	const processInputSafely = (input) => processInput(input).pipe(Effect.catchCause((cause) => {
		if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
		return Effect.logWarning("checkpoint reactor failed to process input", {
			source: input.source,
			eventType: input.event.type,
			cause: Cause.pretty(cause)
		});
	}));
	return { start: Effect.gen(function* () {
		const queue = yield* Queue.unbounded();
		yield* Effect.addFinalizer(() => Queue.shutdown(queue).pipe(Effect.asVoid));
		yield* Effect.forkScoped(Effect.forever(Queue.take(queue).pipe(Effect.flatMap(processInputSafely))));
		yield* Effect.forkScoped(Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
			if (event.type !== "thread.turn-start-requested" && event.type !== "thread.message-sent" && event.type !== "thread.checkpoint-revert-requested") return Effect.void;
			return Queue.offer(queue, {
				source: "domain",
				event
			}).pipe(Effect.asVoid);
		}));
		yield* Effect.forkScoped(Stream.runForEach(providerService.streamEvents, (event) => {
			if (event.type !== "turn.started" && event.type !== "turn.completed") return Effect.void;
			return Queue.offer(queue, {
				source: "runtime",
				event
			}).pipe(Effect.asVoid);
		}));
	}) };
});
const CheckpointReactorLive = Layer.effect(CheckpointReactor, make$2);

//#endregion
//#region src/orchestration/Services/OrchestrationReactor.ts
/**
* OrchestrationReactor - Composite orchestration reactor service interface.
*
* Coordinates startup of orchestration runtime reactors that translate domain
* events into downstream side effects.
*
* @module OrchestrationReactor
*/
/**
* OrchestrationReactor - Service tag for orchestration reactor coordination.
*/
var OrchestrationReactor = class extends ServiceMap.Service()("t3/orchestration/Services/OrchestrationReactor") {};

//#endregion
//#region src/orchestration/Services/ProviderCommandReactor.ts
/**
* ProviderCommandReactor - Provider command reaction service interface.
*
* Owns background workers that react to orchestration intent events and
* dispatch provider-side command execution.
*
* @module ProviderCommandReactor
*/
/**
* ProviderCommandReactor - Service tag for provider command reaction workers.
*/
var ProviderCommandReactor = class extends ServiceMap.Service()("t3/orchestration/Services/ProviderCommandReactor") {};

//#endregion
//#region src/orchestration/Services/ProviderRuntimeIngestion.ts
/**
* ProviderRuntimeIngestionService - Provider runtime ingestion service interface.
*
* Owns background workers that consume provider runtime streams and emit
* orchestration commands/events.
*
* @module ProviderRuntimeIngestionService
*/
/**
* ProviderRuntimeIngestionService - Service tag for runtime ingestion workers.
*/
var ProviderRuntimeIngestionService = class extends ServiceMap.Service()("t3/orchestration/Services/ProviderRuntimeIngestion/ProviderRuntimeIngestionService") {};

//#endregion
//#region src/orchestration/Layers/OrchestrationReactor.ts
const makeOrchestrationReactor = Effect.gen(function* () {
	const providerRuntimeIngestion = yield* ProviderRuntimeIngestionService;
	const providerCommandReactor = yield* ProviderCommandReactor;
	const checkpointReactor = yield* CheckpointReactor;
	return { start: Effect.gen(function* () {
		yield* providerRuntimeIngestion.start;
		yield* providerCommandReactor.start;
		yield* checkpointReactor.start;
	}) };
});
const OrchestrationReactorLive = Layer.effect(OrchestrationReactor, makeOrchestrationReactor);

//#endregion
//#region src/git/Services/GitCore.ts
/**
* GitCore - Effect service contract for low-level Git operations.
*
* Wraps core repository primitives used by higher-level orchestration
* services and WebSocket routes.
*
* @module GitCore
*/
/**
* GitCore - Service tag for low-level Git repository operations.
*/
var GitCore = class extends ServiceMap.Service()("t3/git/Services/GitCore") {};

//#endregion
//#region src/provider/Errors.ts
/**
* ProviderAdapterValidationError - Invalid adapter API input.
*/
var ProviderAdapterValidationError = class extends Schema.TaggedErrorClass()("ProviderAdapterValidationError", {
	provider: Schema.String,
	operation: Schema.String,
	issue: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Provider adapter validation failed (${this.provider}) in ${this.operation}: ${this.issue}`;
	}
};
/**
* ProviderAdapterSessionNotFoundError - Adapter-owned session id is unknown.
*/
var ProviderAdapterSessionNotFoundError = class extends Schema.TaggedErrorClass()("ProviderAdapterSessionNotFoundError", {
	provider: Schema.String,
	threadId: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Unknown ${this.provider} adapter thread: ${this.threadId}`;
	}
};
/**
* ProviderAdapterSessionClosedError - Adapter session exists but is closed.
*/
var ProviderAdapterSessionClosedError = class extends Schema.TaggedErrorClass()("ProviderAdapterSessionClosedError", {
	provider: Schema.String,
	threadId: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `${this.provider} adapter thread is closed: ${this.threadId}`;
	}
};
/**
* ProviderAdapterRequestError - Provider protocol request failed or timed out.
*/
var ProviderAdapterRequestError = class extends Schema.TaggedErrorClass()("ProviderAdapterRequestError", {
	provider: Schema.String,
	method: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Provider adapter request failed (${this.provider}) for ${this.method}: ${this.detail}`;
	}
};
/**
* ProviderAdapterProcessError - Provider process lifecycle failure.
*/
var ProviderAdapterProcessError = class extends Schema.TaggedErrorClass()("ProviderAdapterProcessError", {
	provider: Schema.String,
	threadId: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Provider adapter process error (${this.provider}) for thread ${this.threadId}: ${this.detail}`;
	}
};
/**
* ProviderValidationError - Invalid provider API input.
*/
var ProviderValidationError = class extends Schema.TaggedErrorClass()("ProviderValidationError", {
	operation: Schema.String,
	issue: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Provider validation failed in ${this.operation}: ${this.issue}`;
	}
};
/**
* ProviderUnsupportedError - Requested provider is not implemented.
*/
var ProviderUnsupportedError = class extends Schema.TaggedErrorClass()("ProviderUnsupportedError", {
	provider: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Provider '${this.provider}' is not implemented`;
	}
};
/**
* ProviderSessionDirectoryPersistenceError - Session directory persistence failure.
*/
var ProviderSessionDirectoryPersistenceError = class extends Schema.TaggedErrorClass()("ProviderSessionDirectoryPersistenceError", {
	operation: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Provider session directory persistence error in ${this.operation}: ${this.detail}`;
	}
};

//#endregion
//#region src/git/Services/TextGeneration.ts
/**
* TextGeneration - Effect service contract for AI-generated Git content.
*
* Generates commit messages and pull request titles/bodies from repository
* context prepared by Git services.
*
* @module TextGeneration
*/
/**
* TextGeneration - Service tag for commit and PR text generation.
*/
var TextGeneration = class extends ServiceMap.Service()("t3/git/Services/TextGeneration") {};

//#endregion
//#region src/orchestration/Layers/ProviderCommandReactor.ts
function toNonEmptyProviderInput(value) {
	const normalized = value?.trim();
	return normalized && normalized.length > 0 ? normalized : void 0;
}
function mapProviderSessionStatusToOrchestrationStatus(status) {
	switch (status) {
		case "connecting": return "starting";
		case "running": return "running";
		case "error": return "error";
		case "closed": return "stopped";
		default: return "ready";
	}
}
const turnStartKeyForEvent = (event) => event.commandId !== null ? `command:${event.commandId}` : `event:${event.eventId}`;
const serverCommandId = (tag) => CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);
const HANDLED_TURN_START_KEY_MAX = 1e4;
const HANDLED_TURN_START_KEY_TTL = Duration.minutes(30);
const DEFAULT_RUNTIME_MODE = "full-access";
const WORKTREE_BRANCH_PREFIX = "t3code";
const TEMP_WORKTREE_BRANCH_PATTERN = new RegExp(`^${WORKTREE_BRANCH_PREFIX}\\/[0-9a-f]{8}$`);
function toErrorMessage(error) {
	if (error instanceof Error && error.message.trim().length > 0) return error.message;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
function isUnknownPendingApprovalRequestError(error) {
	if (Schema.is(ProviderAdapterRequestError)(error)) {
		const detail = error.detail.toLowerCase();
		return detail.includes("unknown pending approval request") || detail.includes("unknown pending permission request");
	}
	const message = toErrorMessage(error).toLowerCase();
	return message.includes("unknown pending approval request") || message.includes("unknown pending permission request");
}
function isTemporaryWorktreeBranch(branch) {
	return TEMP_WORKTREE_BRANCH_PATTERN.test(branch.trim().toLowerCase());
}
function buildGeneratedWorktreeBranchName(raw) {
	const normalized = raw.trim().toLowerCase().replace(/^refs\/heads\//, "").replace(/['"`]/g, "");
	const branchFragment = (normalized.startsWith(`${WORKTREE_BRANCH_PREFIX}/`) ? normalized.slice(`${WORKTREE_BRANCH_PREFIX}/`.length) : normalized).replace(/[^a-z0-9/_-]+/g, "-").replace(/\/+/g, "/").replace(/-+/g, "-").replace(/^[./_-]+|[./_-]+$/g, "").slice(0, 64).replace(/[./_-]+$/g, "");
	return `${WORKTREE_BRANCH_PREFIX}/${branchFragment.length > 0 ? branchFragment : "update"}`;
}
const make$1 = Effect.gen(function* () {
	const orchestrationEngine = yield* OrchestrationEngineService;
	const providerService = yield* ProviderService;
	const git = yield* GitCore;
	const textGeneration = yield* TextGeneration;
	const handledTurnStartKeys = yield* Cache.make({
		capacity: HANDLED_TURN_START_KEY_MAX,
		timeToLive: HANDLED_TURN_START_KEY_TTL,
		lookup: () => Effect.succeed(true)
	});
	const hasHandledTurnStartRecently = (key) => Cache.getOption(handledTurnStartKeys, key).pipe(Effect.flatMap((cached) => Cache.set(handledTurnStartKeys, key, true).pipe(Effect.as(Option.isSome(cached)))));
	const appendProviderFailureActivity = (input) => orchestrationEngine.dispatch({
		type: "thread.activity.append",
		commandId: serverCommandId("provider-failure-activity"),
		threadId: input.threadId,
		activity: {
			id: EventId.makeUnsafe(crypto.randomUUID()),
			tone: "error",
			kind: input.kind,
			summary: input.summary,
			payload: {
				detail: input.detail,
				...input.requestId ? { requestId: input.requestId } : {}
			},
			turnId: input.turnId,
			createdAt: input.createdAt
		},
		createdAt: input.createdAt
	});
	const setThreadSession = (input) => orchestrationEngine.dispatch({
		type: "thread.session.set",
		commandId: serverCommandId("provider-session-set"),
		threadId: input.threadId,
		session: input.session,
		createdAt: input.createdAt
	});
	const resolveThread = Effect.fnUntraced(function* (threadId) {
		return (yield* orchestrationEngine.getReadModel()).threads.find((entry) => entry.id === threadId);
	});
	const ensureSessionForThread = Effect.fnUntraced(function* (threadId, createdAt, options) {
		const readModel = yield* orchestrationEngine.getReadModel();
		const thread = readModel.threads.find((entry) => entry.id === threadId);
		if (!thread) return yield* Effect.die(/* @__PURE__ */ new Error(`Thread '${threadId}' was not found in read model.`));
		const desiredRuntimeMode = thread.runtimeMode;
		const currentProvider = thread.session?.providerName === "codex" ? thread.session.providerName : void 0;
		const preferredProvider = options?.provider ?? currentProvider;
		const desiredModel = options?.model ?? thread.model;
		const effectiveCwd = resolveThreadWorkspaceCwd({
			thread,
			projects: readModel.projects
		});
		const resolveActiveSession = (threadId) => providerService.listSessions().pipe(Effect.map((sessions) => sessions.find((session) => session.threadId === threadId)));
		const startProviderSession = (input) => providerService.startSession(threadId, {
			threadId,
			...input?.provider ?? preferredProvider ? { provider: input?.provider ?? preferredProvider } : {},
			...effectiveCwd ? { cwd: effectiveCwd } : {},
			...desiredModel ? { model: desiredModel } : {},
			...options?.serviceTier !== void 0 ? { serviceTier: options.serviceTier } : {},
			...options?.modelOptions !== void 0 ? { modelOptions: options.modelOptions } : {},
			...input?.resumeCursor !== void 0 ? { resumeCursor: input.resumeCursor } : {},
			runtimeMode: desiredRuntimeMode
		});
		const bindSessionToThread = (session) => setThreadSession({
			threadId,
			session: {
				threadId,
				status: mapProviderSessionStatusToOrchestrationStatus(session.status),
				providerName: session.provider,
				runtimeMode: desiredRuntimeMode,
				activeTurnId: null,
				lastError: session.lastError ?? null,
				updatedAt: session.updatedAt
			},
			createdAt
		});
		const existingSessionThreadId = thread.session && thread.session.status !== "stopped" ? thread.id : null;
		if (existingSessionThreadId) {
			const runtimeModeChanged = thread.runtimeMode !== thread.session?.runtimeMode;
			const providerChanged = options?.provider !== void 0 && options.provider !== currentProvider;
			const activeSession = yield* resolveActiveSession(existingSessionThreadId);
			const sessionModelSwitch = currentProvider === void 0 ? "in-session" : (yield* providerService.getCapabilities(currentProvider)).sessionModelSwitch;
			const modelChanged = options?.model !== void 0 && options.model !== activeSession?.model;
			const shouldRestartForModelChange = modelChanged && sessionModelSwitch === "restart-session";
			if (!runtimeModeChanged && !providerChanged && !shouldRestartForModelChange) return existingSessionThreadId;
			const resumeCursor = providerChanged || shouldRestartForModelChange ? void 0 : activeSession?.resumeCursor ?? void 0;
			yield* Effect.logInfo("provider command reactor restarting provider session", {
				threadId,
				existingSessionThreadId,
				currentProvider,
				desiredProvider: options?.provider ?? currentProvider,
				currentRuntimeMode: thread.session?.runtimeMode,
				desiredRuntimeMode: thread.runtimeMode,
				runtimeModeChanged,
				providerChanged,
				modelChanged,
				shouldRestartForModelChange,
				hasResumeCursor: resumeCursor !== void 0
			});
			const restartedSession = yield* startProviderSession({
				...resumeCursor !== void 0 ? { resumeCursor } : {},
				...options?.provider !== void 0 ? { provider: options.provider } : {}
			});
			yield* Effect.logInfo("provider command reactor restarted provider session", {
				threadId,
				previousSessionId: existingSessionThreadId,
				restartedSessionThreadId: restartedSession.threadId,
				provider: restartedSession.provider,
				runtimeMode: restartedSession.runtimeMode
			});
			yield* bindSessionToThread(restartedSession);
			return restartedSession.threadId;
		}
		const startedSession = yield* startProviderSession(options?.provider !== void 0 ? { provider: options.provider } : void 0);
		yield* bindSessionToThread(startedSession);
		return startedSession.threadId;
	});
	const sendTurnForThread = Effect.fnUntraced(function* (input) {
		if (!(yield* resolveThread(input.threadId))) return;
		yield* ensureSessionForThread(input.threadId, input.createdAt, {
			...input.provider !== void 0 ? { provider: input.provider } : {},
			...input.model !== void 0 ? { model: input.model } : {},
			...input.serviceTier !== void 0 ? { serviceTier: input.serviceTier } : {},
			...input.modelOptions !== void 0 ? { modelOptions: input.modelOptions } : {}
		});
		const normalizedInput = toNonEmptyProviderInput(input.messageText);
		const normalizedAttachments = input.attachments ?? [];
		const activeSession = yield* providerService.listSessions().pipe(Effect.map((sessions) => sessions.find((session) => session.threadId === input.threadId)));
		const modelForTurn = (activeSession === void 0 ? "in-session" : (yield* providerService.getCapabilities(activeSession.provider)).sessionModelSwitch) === "unsupported" ? activeSession?.model : input.model;
		yield* providerService.sendTurn({
			threadId: input.threadId,
			...normalizedInput ? { input: normalizedInput } : {},
			...normalizedAttachments.length > 0 ? { attachments: normalizedAttachments } : {},
			...modelForTurn !== void 0 ? { model: modelForTurn } : {},
			...input.serviceTier !== void 0 ? { serviceTier: input.serviceTier } : {},
			...input.modelOptions !== void 0 ? { modelOptions: input.modelOptions } : {},
			...input.interactionMode !== void 0 ? { interactionMode: input.interactionMode } : {}
		});
	});
	const maybeGenerateAndRenameWorktreeBranchForFirstTurn = Effect.fnUntraced(function* (input) {
		if (!input.branch || !input.worktreePath) return;
		if (!isTemporaryWorktreeBranch(input.branch)) return;
		const thread = yield* resolveThread(input.threadId);
		if (!thread) return;
		const userMessages = thread.messages.filter((message) => message.role === "user");
		if (userMessages.length !== 1 || userMessages[0]?.id !== input.messageId) return;
		const oldBranch = input.branch;
		const cwd = input.worktreePath;
		const attachments = input.attachments ?? [];
		yield* textGeneration.generateBranchName({
			cwd,
			message: input.messageText,
			...attachments.length > 0 ? { attachments } : {}
		}).pipe(Effect.catch((error) => Effect.logWarning("provider command reactor failed to generate worktree branch name; skipping rename", {
			threadId: input.threadId,
			cwd,
			oldBranch,
			reason: error.message
		})), Effect.flatMap((generated) => {
			if (!generated) return Effect.void;
			const targetBranch = buildGeneratedWorktreeBranchName(generated.branch);
			if (targetBranch === oldBranch) return Effect.void;
			return Effect.flatMap(git.renameBranch({
				cwd,
				oldBranch,
				newBranch: targetBranch
			}), (renamed) => orchestrationEngine.dispatch({
				type: "thread.meta.update",
				commandId: serverCommandId("worktree-branch-rename"),
				threadId: input.threadId,
				branch: renamed.branch,
				worktreePath: cwd
			}));
		}), Effect.catchCause((cause) => Effect.logWarning("provider command reactor failed to generate or rename worktree branch", {
			threadId: input.threadId,
			cwd,
			oldBranch,
			cause: Cause.pretty(cause)
		})));
	});
	const processTurnStartRequested = Effect.fnUntraced(function* (event) {
		if (yield* hasHandledTurnStartRecently(turnStartKeyForEvent(event))) return;
		const thread = yield* resolveThread(event.payload.threadId);
		if (!thread) return;
		const message = thread.messages.find((entry) => entry.id === event.payload.messageId);
		if (!message || message.role !== "user") {
			yield* appendProviderFailureActivity({
				threadId: event.payload.threadId,
				kind: "provider.turn.start.failed",
				summary: "Provider turn start failed",
				detail: `User message '${event.payload.messageId}' was not found for turn start request.`,
				turnId: null,
				createdAt: event.payload.createdAt
			});
			return;
		}
		yield* maybeGenerateAndRenameWorktreeBranchForFirstTurn({
			threadId: event.payload.threadId,
			branch: thread.branch,
			worktreePath: thread.worktreePath,
			messageId: message.id,
			messageText: message.text,
			...message.attachments !== void 0 ? { attachments: message.attachments } : {}
		}).pipe(Effect.forkScoped);
		yield* sendTurnForThread({
			threadId: event.payload.threadId,
			messageText: message.text,
			...message.attachments !== void 0 ? { attachments: message.attachments } : {},
			...event.payload.provider !== void 0 ? { provider: event.payload.provider } : {},
			...event.payload.model !== void 0 ? { model: event.payload.model } : {},
			...event.payload.serviceTier !== void 0 ? { serviceTier: event.payload.serviceTier } : {},
			...event.payload.modelOptions !== void 0 ? { modelOptions: event.payload.modelOptions } : {},
			interactionMode: event.payload.interactionMode,
			createdAt: event.payload.createdAt
		});
	});
	const processTurnInterruptRequested = Effect.fnUntraced(function* (event) {
		const thread = yield* resolveThread(event.payload.threadId);
		if (!thread) return;
		if (!(thread.session && thread.session.status !== "stopped")) return yield* appendProviderFailureActivity({
			threadId: event.payload.threadId,
			kind: "provider.turn.interrupt.failed",
			summary: "Provider turn interrupt failed",
			detail: "No active provider session is bound to this thread.",
			turnId: event.payload.turnId ?? null,
			createdAt: event.payload.createdAt
		});
		yield* providerService.interruptTurn({ threadId: event.payload.threadId });
	});
	const processApprovalResponseRequested = Effect.fnUntraced(function* (event) {
		const thread = yield* resolveThread(event.payload.threadId);
		if (!thread) return;
		if (!(thread.session && thread.session.status !== "stopped")) return yield* appendProviderFailureActivity({
			threadId: event.payload.threadId,
			kind: "provider.approval.respond.failed",
			summary: "Provider approval response failed",
			detail: "No active provider session is bound to this thread.",
			turnId: null,
			createdAt: event.payload.createdAt,
			requestId: event.payload.requestId
		});
		yield* providerService.respondToRequest({
			threadId: event.payload.threadId,
			requestId: event.payload.requestId,
			decision: event.payload.decision
		}).pipe(Effect.catchCause((cause) => Effect.gen(function* () {
			const error = Cause.squash(cause);
			const detail = toErrorMessage(error);
			yield* appendProviderFailureActivity({
				threadId: event.payload.threadId,
				kind: "provider.approval.respond.failed",
				summary: "Provider approval response failed",
				detail,
				turnId: null,
				createdAt: event.payload.createdAt,
				requestId: event.payload.requestId
			});
			if (!isUnknownPendingApprovalRequestError(error)) return;
		})));
	});
	const processUserInputResponseRequested = Effect.fnUntraced(function* (event) {
		const thread = yield* resolveThread(event.payload.threadId);
		if (!thread) return;
		if (!(thread.session && thread.session.status !== "stopped")) return yield* appendProviderFailureActivity({
			threadId: event.payload.threadId,
			kind: "provider.user-input.respond.failed",
			summary: "Provider user input response failed",
			detail: "No active provider session is bound to this thread.",
			turnId: null,
			createdAt: event.payload.createdAt,
			requestId: event.payload.requestId
		});
		yield* providerService.respondToUserInput({
			threadId: event.payload.threadId,
			requestId: event.payload.requestId,
			answers: event.payload.answers
		}).pipe(Effect.catchCause((cause) => Effect.gen(function* () {
			const error = Cause.squash(cause);
			yield* appendProviderFailureActivity({
				threadId: event.payload.threadId,
				kind: "provider.user-input.respond.failed",
				summary: "Provider user input response failed",
				detail: toErrorMessage(error),
				turnId: null,
				createdAt: event.payload.createdAt,
				requestId: event.payload.requestId
			});
		})));
	});
	const processSessionStopRequested = Effect.fnUntraced(function* (event) {
		const thread = yield* resolveThread(event.payload.threadId);
		if (!thread) return;
		const now = event.payload.createdAt;
		if (thread.session && thread.session.status !== "stopped") yield* providerService.stopSession({ threadId: thread.id });
		yield* setThreadSession({
			threadId: thread.id,
			session: {
				threadId: thread.id,
				status: "stopped",
				providerName: thread.session?.providerName ?? null,
				runtimeMode: thread.session?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
				activeTurnId: null,
				lastError: thread.session?.lastError ?? null,
				updatedAt: now
			},
			createdAt: now
		});
	});
	const processDomainEvent = (event) => Effect.gen(function* () {
		switch (event.type) {
			case "thread.runtime-mode-set": {
				const thread = yield* resolveThread(event.payload.threadId);
				if (!thread?.session || thread.session.status === "stopped") return;
				yield* ensureSessionForThread(event.payload.threadId, event.occurredAt);
				return;
			}
			case "thread.turn-start-requested":
				yield* processTurnStartRequested(event);
				return;
			case "thread.turn-interrupt-requested":
				yield* processTurnInterruptRequested(event);
				return;
			case "thread.approval-response-requested":
				yield* processApprovalResponseRequested(event);
				return;
			case "thread.user-input-response-requested":
				yield* processUserInputResponseRequested(event);
				return;
			case "thread.session-stop-requested":
				yield* processSessionStopRequested(event);
				return;
		}
	});
	const processDomainEventSafely = (event) => processDomainEvent(event).pipe(Effect.catchCause((cause) => {
		if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
		return Effect.logWarning("provider command reactor failed to process event", {
			eventType: event.type,
			cause: Cause.pretty(cause)
		});
	}));
	return { start: Effect.gen(function* () {
		const queue = yield* Queue.unbounded();
		yield* Effect.addFinalizer(() => Queue.shutdown(queue).pipe(Effect.asVoid));
		yield* Effect.forkScoped(Effect.forever(Queue.take(queue).pipe(Effect.flatMap(processDomainEventSafely))));
		yield* Effect.forkScoped(Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
			if (event.type !== "thread.runtime-mode-set" && event.type !== "thread.turn-start-requested" && event.type !== "thread.turn-interrupt-requested" && event.type !== "thread.approval-response-requested" && event.type !== "thread.user-input-response-requested" && event.type !== "thread.session-stop-requested") return Effect.void;
			return Queue.offer(queue, event).pipe(Effect.asVoid);
		}));
	}) };
});
const ProviderCommandReactorLive = Layer.effect(ProviderCommandReactor, make$1);

//#endregion
//#region src/persistence/Services/ProjectionPendingApprovals.ts
/**
* ProjectionPendingApprovalRepository - Repository interface for pending approvals.
*
* Owns persistence operations for projected approval requests awaiting user
* decisions.
*
* @module ProjectionPendingApprovalRepository
*/
const ProjectionPendingApproval = Schema.Struct({
	requestId: ApprovalRequestId,
	threadId: ThreadId,
	turnId: Schema.NullOr(TurnId),
	status: ProjectionPendingApprovalStatus,
	decision: ProjectionPendingApprovalDecision,
	createdAt: IsoDateTime,
	resolvedAt: Schema.NullOr(IsoDateTime)
});
const ListProjectionPendingApprovalsInput = Schema.Struct({ threadId: ThreadId });
const GetProjectionPendingApprovalInput = Schema.Struct({ requestId: ApprovalRequestId });
const DeleteProjectionPendingApprovalInput = Schema.Struct({ requestId: ApprovalRequestId });
/**
* ProjectionPendingApprovalRepository - Service tag for pending approval persistence.
*/
var ProjectionPendingApprovalRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionPendingApprovals/ProjectionPendingApprovalRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionProjects.ts
/**
* ProjectionProjectRepository - Projection repository interface for projects.
*
* Owns persistence operations for project rows in the orchestration projection
* read model.
*
* @module ProjectionProjectRepository
*/
const ProjectionProject = Schema.Struct({
	projectId: ProjectId,
	title: Schema.String,
	workspaceRoot: Schema.String,
	defaultModel: Schema.NullOr(Schema.String),
	scripts: Schema.Array(ProjectScript),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime,
	deletedAt: Schema.NullOr(IsoDateTime)
});
const GetProjectionProjectInput = Schema.Struct({ projectId: ProjectId });
const DeleteProjectionProjectInput = Schema.Struct({ projectId: ProjectId });
/**
* ProjectionProjectRepository - Service tag for project projection persistence.
*/
var ProjectionProjectRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionProjects/ProjectionProjectRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionState.ts
/**
* ProjectionStateRepository - Projection repository interface for projector cursors.
*
* Owns persistence operations for projection cursor state used to resume
* incremental event projection.
*
* @module ProjectionStateRepository
*/
const ProjectionState = Schema.Struct({
	projector: Schema.String,
	lastAppliedSequence: NonNegativeInt,
	updatedAt: IsoDateTime
});
const GetProjectionStateInput = Schema.Struct({ projector: Schema.String });
/**
* ProjectionStateRepository - Service tag for projection cursor persistence.
*/
var ProjectionStateRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionState/ProjectionStateRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionThreadActivities.ts
/**
* ProjectionThreadActivityRepository - Projection repository interface for thread activity.
*
* Owns persistence operations for activity timeline entries projected from
* orchestration events.
*
* @module ProjectionThreadActivityRepository
*/
const ProjectionThreadActivity = Schema.Struct({
	activityId: EventId,
	threadId: ThreadId,
	turnId: Schema.NullOr(TurnId),
	tone: OrchestrationThreadActivityTone,
	kind: Schema.String,
	summary: Schema.String,
	payload: Schema.Unknown,
	sequence: Schema.optional(NonNegativeInt),
	createdAt: IsoDateTime
});
const ListProjectionThreadActivitiesInput = Schema.Struct({ threadId: ThreadId });
const DeleteProjectionThreadActivitiesInput = Schema.Struct({ threadId: ThreadId });
/**
* ProjectionThreadActivityRepository - Service tag for thread activity persistence.
*/
var ProjectionThreadActivityRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionThreadActivities/ProjectionThreadActivityRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionThreadMessages.ts
/**
* ProjectionThreadMessageRepository - Projection repository interface for messages.
*
* Owns persistence operations for projected thread messages rendered in the
* orchestration read model.
*
* @module ProjectionThreadMessageRepository
*/
const ProjectionThreadMessage = Schema.Struct({
	messageId: MessageId,
	threadId: ThreadId,
	turnId: Schema.NullOr(TurnId),
	role: OrchestrationMessageRole,
	text: Schema.String,
	attachments: Schema.optional(Schema.Array(ChatAttachment)),
	isStreaming: Schema.Boolean,
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime
});
const ListProjectionThreadMessagesInput = Schema.Struct({ threadId: ThreadId });
const DeleteProjectionThreadMessagesInput = Schema.Struct({ threadId: ThreadId });
/**
* ProjectionThreadMessageRepository - Service tag for message projection persistence.
*/
var ProjectionThreadMessageRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionThreadMessages/ProjectionThreadMessageRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionThreadProposedPlans.ts
const ProjectionThreadProposedPlan = Schema.Struct({
	planId: OrchestrationProposedPlanId,
	threadId: ThreadId,
	turnId: Schema.NullOr(TurnId),
	planMarkdown: TrimmedNonEmptyString,
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime
});
const ListProjectionThreadProposedPlansInput = Schema.Struct({ threadId: ThreadId });
const DeleteProjectionThreadProposedPlansInput = Schema.Struct({ threadId: ThreadId });
var ProjectionThreadProposedPlanRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionThreadProposedPlans/ProjectionThreadProposedPlanRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionThreadSessions.ts
/**
* ProjectionThreadSessionRepository - Repository interface for thread sessions.
*
* Owns persistence operations for projected provider-session linkage and
* runtime status for each thread.
*
* @module ProjectionThreadSessionRepository
*/
const ProjectionThreadSession = Schema.Struct({
	threadId: ThreadId,
	status: OrchestrationSessionStatus,
	providerName: Schema.NullOr(Schema.String),
	runtimeMode: RuntimeMode,
	activeTurnId: Schema.NullOr(TurnId),
	lastError: Schema.NullOr(Schema.String),
	updatedAt: IsoDateTime
});
const GetProjectionThreadSessionInput = Schema.Struct({ threadId: ThreadId });
const DeleteProjectionThreadSessionInput = Schema.Struct({ threadId: ThreadId });
/**
* ProjectionThreadSessionRepository - Service tag for thread-session persistence.
*/
var ProjectionThreadSessionRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionThreadSessions/ProjectionThreadSessionRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionTurns.ts
/**
* ProjectionTurnRepository - Projection repository interface for unified turn state.
*
* Owns persistence operations for pending starts, running/completed turn lifecycle,
* and checkpoint metadata in a single projection table.
*
* @module ProjectionTurnRepository
*/
const ProjectionTurnState = Schema.Literals([
	"pending",
	"running",
	"interrupted",
	"completed",
	"error"
]);
const ProjectionTurn = Schema.Struct({
	threadId: ThreadId,
	turnId: Schema.NullOr(TurnId),
	pendingMessageId: Schema.NullOr(MessageId),
	assistantMessageId: Schema.NullOr(MessageId),
	state: ProjectionTurnState,
	requestedAt: IsoDateTime,
	startedAt: Schema.NullOr(IsoDateTime),
	completedAt: Schema.NullOr(IsoDateTime),
	checkpointTurnCount: Schema.NullOr(NonNegativeInt),
	checkpointRef: Schema.NullOr(CheckpointRef),
	checkpointStatus: Schema.NullOr(OrchestrationCheckpointStatus),
	checkpointFiles: Schema.Array(OrchestrationCheckpointFile)
});
const ProjectionTurnById = Schema.Struct({
	threadId: ThreadId,
	turnId: TurnId,
	pendingMessageId: Schema.NullOr(MessageId),
	assistantMessageId: Schema.NullOr(MessageId),
	state: ProjectionTurnState,
	requestedAt: IsoDateTime,
	startedAt: Schema.NullOr(IsoDateTime),
	completedAt: Schema.NullOr(IsoDateTime),
	checkpointTurnCount: Schema.NullOr(NonNegativeInt),
	checkpointRef: Schema.NullOr(CheckpointRef),
	checkpointStatus: Schema.NullOr(OrchestrationCheckpointStatus),
	checkpointFiles: Schema.Array(OrchestrationCheckpointFile)
});
const ProjectionPendingTurnStart = Schema.Struct({
	threadId: ThreadId,
	messageId: MessageId,
	requestedAt: IsoDateTime
});
const ListProjectionTurnsByThreadInput = Schema.Struct({ threadId: ThreadId });
const GetProjectionTurnByTurnIdInput = Schema.Struct({
	threadId: ThreadId,
	turnId: TurnId
});
const GetProjectionPendingTurnStartInput = Schema.Struct({ threadId: ThreadId });
const DeleteProjectionTurnsByThreadInput = Schema.Struct({ threadId: ThreadId });
const ClearCheckpointTurnConflictInput = Schema.Struct({
	threadId: ThreadId,
	turnId: TurnId,
	checkpointTurnCount: NonNegativeInt
});
var ProjectionTurnRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionTurns/ProjectionTurnRepository") {};

//#endregion
//#region src/persistence/Services/ProjectionThreads.ts
/**
* ProjectionThreadRepository - Projection repository interface for threads.
*
* Owns persistence operations for projected thread records in the
* orchestration read model.
*
* @module ProjectionThreadRepository
*/
const ProjectionThread = Schema.Struct({
	threadId: ThreadId,
	projectId: ProjectId,
	title: Schema.String,
	model: Schema.String,
	runtimeMode: RuntimeMode,
	interactionMode: ProviderInteractionMode,
	branch: Schema.NullOr(Schema.String),
	worktreePath: Schema.NullOr(Schema.String),
	latestTurnId: Schema.NullOr(TurnId),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime,
	deletedAt: Schema.NullOr(IsoDateTime)
});
const GetProjectionThreadInput = Schema.Struct({ threadId: ThreadId });
const DeleteProjectionThreadInput = Schema.Struct({ threadId: ThreadId });
const ListProjectionThreadsByProjectInput = Schema.Struct({ projectId: ProjectId });
/**
* ProjectionThreadRepository - Service tag for thread projection persistence.
*/
var ProjectionThreadRepository = class extends ServiceMap.Service()("t3/persistence/Services/ProjectionThreads/ProjectionThreadRepository") {};

//#endregion
//#region src/persistence/Layers/ProjectionPendingApprovals.ts
const makeProjectionPendingApprovalRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionPendingApprovalRow = SqlSchema.void({
		Request: ProjectionPendingApproval,
		execute: (row) => sql`
        INSERT INTO projection_pending_approvals (
          request_id,
          thread_id,
          turn_id,
          status,
          decision,
          created_at,
          resolved_at
        )
        VALUES (
          ${row.requestId},
          ${row.threadId},
          ${row.turnId},
          ${row.status},
          ${row.decision},
          ${row.createdAt},
          ${row.resolvedAt}
        )
        ON CONFLICT (request_id)
        DO UPDATE SET
          thread_id = excluded.thread_id,
          turn_id = excluded.turn_id,
          status = excluded.status,
          decision = excluded.decision,
          created_at = excluded.created_at,
          resolved_at = excluded.resolved_at
      `
	});
	const listProjectionPendingApprovalRows = SqlSchema.findAll({
		Request: ListProjectionPendingApprovalsInput,
		Result: ProjectionPendingApproval,
		execute: ({ threadId }) => sql`
        SELECT
          request_id AS "requestId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          status,
          decision,
          created_at AS "createdAt",
          resolved_at AS "resolvedAt"
        FROM projection_pending_approvals
        WHERE thread_id = ${threadId}
        ORDER BY created_at ASC, request_id ASC
      `
	});
	const getProjectionPendingApprovalRow = SqlSchema.findOneOption({
		Request: GetProjectionPendingApprovalInput,
		Result: ProjectionPendingApproval,
		execute: ({ requestId }) => sql`
        SELECT
          request_id AS "requestId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          status,
          decision,
          created_at AS "createdAt",
          resolved_at AS "resolvedAt"
        FROM projection_pending_approvals
        WHERE request_id = ${requestId}
      `
	});
	const deleteProjectionPendingApprovalRow = SqlSchema.void({
		Request: DeleteProjectionPendingApprovalInput,
		execute: ({ requestId }) => sql`
        DELETE FROM projection_pending_approvals
        WHERE request_id = ${requestId}
      `
	});
	const upsert = (row) => upsertProjectionPendingApprovalRow(row).pipe(Effect.mapError(toPersistenceSqlError("ProjectionPendingApprovalRepository.upsert:query")));
	const listByThreadId = (input) => listProjectionPendingApprovalRows(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionPendingApprovalRepository.listByThreadId:query")));
	const getByRequestId = (input) => getProjectionPendingApprovalRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionPendingApprovalRepository.getByRequestId:query")));
	const deleteByRequestId = (input) => deleteProjectionPendingApprovalRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionPendingApprovalRepository.deleteByRequestId:query")));
	return {
		upsert,
		listByThreadId,
		getByRequestId,
		deleteByRequestId
	};
});
const ProjectionPendingApprovalRepositoryLive = Layer.effect(ProjectionPendingApprovalRepository, makeProjectionPendingApprovalRepository);

//#endregion
//#region src/persistence/Layers/ProjectionProjects.ts
const ProjectionProjectDbRowSchema$1 = ProjectionProject.mapFields(Struct.assign({ scripts: Schema.fromJsonString(Schema.Array(ProjectScript)) }));
function toPersistenceSqlOrDecodeError$3(sqlOperation, decodeOperation) {
	return (cause) => Schema.isSchemaError(cause) ? toPersistenceDecodeError(decodeOperation)(cause) : toPersistenceSqlError(sqlOperation)(cause);
}
const makeProjectionProjectRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionProjectRow = SqlSchema.void({
		Request: ProjectionProjectDbRowSchema$1,
		execute: (row) => sql`
            INSERT INTO projection_projects (
              project_id,
              title,
              workspace_root,
              default_model,
              scripts_json,
              created_at,
              updated_at,
              deleted_at
            )
            VALUES (
              ${row.projectId},
              ${row.title},
              ${row.workspaceRoot},
              ${row.defaultModel},
              ${row.scripts},
              ${row.createdAt},
              ${row.updatedAt},
              ${row.deletedAt}
            )
            ON CONFLICT (project_id)
            DO UPDATE SET
              title = excluded.title,
              workspace_root = excluded.workspace_root,
              default_model = excluded.default_model,
              scripts_json = excluded.scripts_json,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at
          `
	});
	const getProjectionProjectRow = SqlSchema.findOneOption({
		Request: GetProjectionProjectInput,
		Result: ProjectionProjectDbRowSchema$1,
		execute: ({ projectId }) => sql`
        SELECT
          project_id AS "projectId",
          title,
          workspace_root AS "workspaceRoot",
          default_model AS "defaultModel",
          scripts_json AS "scripts",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_projects
        WHERE project_id = ${projectId}
      `
	});
	const listProjectionProjectRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionProjectDbRowSchema$1,
		execute: () => sql`
        SELECT
          project_id AS "projectId",
          title,
          workspace_root AS "workspaceRoot",
          default_model AS "defaultModel",
          scripts_json AS "scripts",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_projects
        ORDER BY created_at ASC, project_id ASC
      `
	});
	const deleteProjectionProjectRow = SqlSchema.void({
		Request: DeleteProjectionProjectInput,
		execute: ({ projectId }) => sql`
        DELETE FROM projection_projects
        WHERE project_id = ${projectId}
      `
	});
	const upsert = (row) => upsertProjectionProjectRow(row).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$3("ProjectionProjectRepository.upsert:query", "ProjectionProjectRepository.upsert:encodeRequest")));
	const getById = (input) => getProjectionProjectRow(input).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$3("ProjectionProjectRepository.getById:query", "ProjectionProjectRepository.getById:decodeRow")), Effect.flatMap((rowOption) => Option.match(rowOption, {
		onNone: () => Effect.succeed(Option.none()),
		onSome: (row) => Effect.succeed(Option.some(row))
	})));
	const listAll = () => listProjectionProjectRows().pipe(Effect.mapError(toPersistenceSqlOrDecodeError$3("ProjectionProjectRepository.listAll:query", "ProjectionProjectRepository.listAll:decodeRows")), Effect.map((rows) => rows));
	const deleteById = (input) => deleteProjectionProjectRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionProjectRepository.deleteById:query")));
	return {
		upsert,
		getById,
		listAll,
		deleteById
	};
});
const ProjectionProjectRepositoryLive = Layer.effect(ProjectionProjectRepository, makeProjectionProjectRepository);

//#endregion
//#region src/persistence/Layers/ProjectionState.ts
const MinLastAppliedSequenceRowSchema = Schema.Struct({ minLastAppliedSequence: Schema.NullOr(NonNegativeInt) });
const makeProjectionStateRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionStateRow = SqlSchema.void({
		Request: ProjectionState,
		execute: (row) => sql`
        INSERT INTO projection_state (
          projector,
          last_applied_sequence,
          updated_at
        )
        VALUES (
          ${row.projector},
          ${row.lastAppliedSequence},
          ${row.updatedAt}
        )
        ON CONFLICT (projector)
        DO UPDATE SET
          last_applied_sequence = excluded.last_applied_sequence,
          updated_at = excluded.updated_at
      `
	});
	const getProjectionStateRow = SqlSchema.findOneOption({
		Request: GetProjectionStateInput,
		Result: ProjectionState,
		execute: ({ projector }) => sql`
        SELECT
          projector,
          last_applied_sequence AS "lastAppliedSequence",
          updated_at AS "updatedAt"
        FROM projection_state
        WHERE projector = ${projector}
      `
	});
	const listProjectionStateRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionState,
		execute: () => sql`
        SELECT
          projector,
          last_applied_sequence AS "lastAppliedSequence",
          updated_at AS "updatedAt"
        FROM projection_state
        ORDER BY projector ASC
      `
	});
	const readMinLastAppliedSequence = SqlSchema.findOne({
		Request: Schema.Void,
		Result: MinLastAppliedSequenceRowSchema,
		execute: () => sql`
        SELECT
          MIN(last_applied_sequence) AS "minLastAppliedSequence"
        FROM projection_state
      `
	});
	const upsert = (row) => upsertProjectionStateRow(row).pipe(Effect.mapError(toPersistenceSqlError("ProjectionStateRepository.upsert:query")));
	const getByProjector = (input) => getProjectionStateRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionStateRepository.getByProjector:query")));
	const listAll = () => listProjectionStateRows(void 0).pipe(Effect.mapError(toPersistenceSqlError("ProjectionStateRepository.listAll:query")));
	const minLastAppliedSequence = () => readMinLastAppliedSequence(void 0).pipe(Effect.mapError(toPersistenceSqlError("ProjectionStateRepository.minLastAppliedSequence:query")), Effect.map((row) => row.minLastAppliedSequence));
	return {
		upsert,
		getByProjector,
		listAll,
		minLastAppliedSequence
	};
});
const ProjectionStateRepositoryLive = Layer.effect(ProjectionStateRepository, makeProjectionStateRepository);

//#endregion
//#region src/persistence/Layers/ProjectionThreadActivities.ts
const ProjectionThreadActivityDbRowSchema$1 = ProjectionThreadActivity.mapFields(Struct.assign({
	payload: Schema.fromJsonString(Schema.Unknown),
	sequence: Schema.NullOr(NonNegativeInt)
}));
function toPersistenceSqlOrDecodeError$2(sqlOperation, decodeOperation) {
	return (cause) => Schema.isSchemaError(cause) ? toPersistenceDecodeError(decodeOperation)(cause) : toPersistenceSqlError(sqlOperation)(cause);
}
const makeProjectionThreadActivityRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionThreadActivityRow = SqlSchema.void({
		Request: ProjectionThreadActivity,
		execute: (row) => sql`
            INSERT INTO projection_thread_activities (
              activity_id,
              thread_id,
              turn_id,
              tone,
              kind,
              summary,
              payload_json,
              sequence,
              created_at
            )
            VALUES (
              ${row.activityId},
              ${row.threadId},
              ${row.turnId},
              ${row.tone},
              ${row.kind},
              ${row.summary},
              ${JSON.stringify(row.payload)},
              ${row.sequence ?? null},
              ${row.createdAt}
            )
            ON CONFLICT (activity_id)
            DO UPDATE SET
              thread_id = excluded.thread_id,
              turn_id = excluded.turn_id,
              tone = excluded.tone,
              kind = excluded.kind,
              summary = excluded.summary,
              payload_json = excluded.payload_json,
              sequence = excluded.sequence,
              created_at = excluded.created_at
          `
	});
	const listProjectionThreadActivityRows = SqlSchema.findAll({
		Request: ListProjectionThreadActivitiesInput,
		Result: ProjectionThreadActivityDbRowSchema$1,
		execute: ({ threadId }) => sql`
        SELECT
          activity_id AS "activityId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          tone,
          kind,
          summary,
          payload_json AS "payload",
          sequence,
          created_at AS "createdAt"
        FROM projection_thread_activities
        WHERE thread_id = ${threadId}
        ORDER BY
          CASE WHEN sequence IS NULL THEN 0 ELSE 1 END ASC,
          sequence ASC,
          created_at ASC,
          activity_id ASC
      `
	});
	const deleteProjectionThreadActivityRows = SqlSchema.void({
		Request: DeleteProjectionThreadActivitiesInput,
		execute: ({ threadId }) => sql`
        DELETE FROM projection_thread_activities
        WHERE thread_id = ${threadId}
      `
	});
	const upsert = (row) => upsertProjectionThreadActivityRow(row).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$2("ProjectionThreadActivityRepository.upsert:query", "ProjectionThreadActivityRepository.upsert:encodeRequest")));
	const listByThreadId = (input) => listProjectionThreadActivityRows(input).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$2("ProjectionThreadActivityRepository.listByThreadId:query", "ProjectionThreadActivityRepository.listByThreadId:decodeRows")), Effect.map((rows) => rows.map((row) => ({
		activityId: row.activityId,
		threadId: row.threadId,
		turnId: row.turnId,
		tone: row.tone,
		kind: row.kind,
		summary: row.summary,
		payload: row.payload,
		...row.sequence !== null ? { sequence: row.sequence } : {},
		createdAt: row.createdAt
	}))));
	const deleteByThreadId = (input) => deleteProjectionThreadActivityRows(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadActivityRepository.deleteByThreadId:query")));
	return {
		upsert,
		listByThreadId,
		deleteByThreadId
	};
});
const ProjectionThreadActivityRepositoryLive = Layer.effect(ProjectionThreadActivityRepository, makeProjectionThreadActivityRepository);

//#endregion
//#region src/persistence/Layers/ProjectionThreadMessages.ts
const ProjectionThreadMessageDbRowSchema$1 = ProjectionThreadMessage.mapFields(Struct.assign({
	isStreaming: Schema.Number,
	attachments: Schema.NullOr(Schema.fromJsonString(Schema.Array(ChatAttachment)))
}));
const makeProjectionThreadMessageRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionThreadMessageRow = SqlSchema.void({
		Request: ProjectionThreadMessage,
		execute: (row) => {
			const nextAttachmentsJson = row.attachments !== void 0 ? JSON.stringify(row.attachments) : null;
			return sql`
        INSERT INTO projection_thread_messages (
          message_id,
          thread_id,
          turn_id,
          role,
          text,
          attachments_json,
          is_streaming,
          created_at,
          updated_at
        )
        VALUES (
          ${row.messageId},
          ${row.threadId},
          ${row.turnId},
          ${row.role},
          ${row.text},
          COALESCE(
            ${nextAttachmentsJson},
            (
              SELECT attachments_json
              FROM projection_thread_messages
              WHERE message_id = ${row.messageId}
            )
          ),
          ${row.isStreaming ? 1 : 0},
          ${row.createdAt},
          ${row.updatedAt}
        )
        ON CONFLICT (message_id)
        DO UPDATE SET
          thread_id = excluded.thread_id,
          turn_id = excluded.turn_id,
          role = excluded.role,
          text = excluded.text,
          attachments_json = COALESCE(
            excluded.attachments_json,
            projection_thread_messages.attachments_json
          ),
          is_streaming = excluded.is_streaming,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `;
		}
	});
	const listProjectionThreadMessageRows = SqlSchema.findAll({
		Request: ListProjectionThreadMessagesInput,
		Result: ProjectionThreadMessageDbRowSchema$1,
		execute: ({ threadId }) => sql`
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          role,
          text,
          attachments_json AS "attachments",
          is_streaming AS "isStreaming",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_messages
        WHERE thread_id = ${threadId}
        ORDER BY created_at ASC, message_id ASC
      `
	});
	const deleteProjectionThreadMessageRows = SqlSchema.void({
		Request: DeleteProjectionThreadMessagesInput,
		execute: ({ threadId }) => sql`
        DELETE FROM projection_thread_messages
        WHERE thread_id = ${threadId}
      `
	});
	const upsert = (row) => upsertProjectionThreadMessageRow(row).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadMessageRepository.upsert:query")));
	const listByThreadId = (input) => listProjectionThreadMessageRows(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadMessageRepository.listByThreadId:query")), Effect.map((rows) => rows.map((row) => ({
		messageId: row.messageId,
		threadId: row.threadId,
		turnId: row.turnId,
		role: row.role,
		text: row.text,
		isStreaming: row.isStreaming === 1,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		...row.attachments !== null ? { attachments: row.attachments } : {}
	}))));
	const deleteByThreadId = (input) => deleteProjectionThreadMessageRows(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadMessageRepository.deleteByThreadId:query")));
	return {
		upsert,
		listByThreadId,
		deleteByThreadId
	};
});
const ProjectionThreadMessageRepositoryLive = Layer.effect(ProjectionThreadMessageRepository, makeProjectionThreadMessageRepository);

//#endregion
//#region src/persistence/Layers/ProjectionThreadProposedPlans.ts
const makeProjectionThreadProposedPlanRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionThreadProposedPlanRow = SqlSchema.void({
		Request: ProjectionThreadProposedPlan,
		execute: (row) => sql`
      INSERT INTO projection_thread_proposed_plans (
        plan_id,
        thread_id,
        turn_id,
        plan_markdown,
        created_at,
        updated_at
      )
      VALUES (
        ${row.planId},
        ${row.threadId},
        ${row.turnId},
        ${row.planMarkdown},
        ${row.createdAt},
        ${row.updatedAt}
      )
      ON CONFLICT (plan_id)
      DO UPDATE SET
        thread_id = excluded.thread_id,
        turn_id = excluded.turn_id,
        plan_markdown = excluded.plan_markdown,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `
	});
	const listProjectionThreadProposedPlanRows = SqlSchema.findAll({
		Request: ListProjectionThreadProposedPlansInput,
		Result: ProjectionThreadProposedPlan,
		execute: ({ threadId }) => sql`
      SELECT
        plan_id AS "planId",
        thread_id AS "threadId",
        turn_id AS "turnId",
        plan_markdown AS "planMarkdown",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM projection_thread_proposed_plans
      WHERE thread_id = ${threadId}
      ORDER BY created_at ASC, plan_id ASC
    `
	});
	const deleteProjectionThreadProposedPlanRows = SqlSchema.void({
		Request: DeleteProjectionThreadProposedPlansInput,
		execute: ({ threadId }) => sql`
      DELETE FROM projection_thread_proposed_plans
      WHERE thread_id = ${threadId}
    `
	});
	const upsert = (row) => upsertProjectionThreadProposedPlanRow(row).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadProposedPlanRepository.upsert:query")));
	const listByThreadId = (input) => listProjectionThreadProposedPlanRows(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadProposedPlanRepository.listByThreadId:query")));
	const deleteByThreadId = (input) => deleteProjectionThreadProposedPlanRows(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadProposedPlanRepository.deleteByThreadId:query")));
	return {
		upsert,
		listByThreadId,
		deleteByThreadId
	};
});
const ProjectionThreadProposedPlanRepositoryLive = Layer.effect(ProjectionThreadProposedPlanRepository, makeProjectionThreadProposedPlanRepository);

//#endregion
//#region src/persistence/Layers/ProjectionThreadSessions.ts
const makeProjectionThreadSessionRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionThreadSessionRow = SqlSchema.void({
		Request: ProjectionThreadSession,
		execute: (row) => sql`
        INSERT INTO projection_thread_sessions (
          thread_id,
          status,
          provider_name,
          runtime_mode,
          active_turn_id,
          last_error,
          updated_at
        )
        VALUES (
          ${row.threadId},
          ${row.status},
          ${row.providerName},
          ${row.runtimeMode},
          ${row.activeTurnId},
          ${row.lastError},
          ${row.updatedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          status = excluded.status,
          provider_name = excluded.provider_name,
          runtime_mode = excluded.runtime_mode,
          active_turn_id = excluded.active_turn_id,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `
	});
	const getProjectionThreadSessionRow = SqlSchema.findOneOption({
		Request: GetProjectionThreadSessionInput,
		Result: ProjectionThreadSession,
		execute: ({ threadId }) => sql`
        SELECT
          thread_id AS "threadId",
          status,
          provider_name AS "providerName",
          runtime_mode AS "runtimeMode",
          active_turn_id AS "activeTurnId",
          last_error AS "lastError",
          updated_at AS "updatedAt"
        FROM projection_thread_sessions
        WHERE thread_id = ${threadId}
      `
	});
	const deleteProjectionThreadSessionRow = SqlSchema.void({
		Request: DeleteProjectionThreadSessionInput,
		execute: ({ threadId }) => sql`
        DELETE FROM projection_thread_sessions
        WHERE thread_id = ${threadId}
      `
	});
	const upsert = (row) => upsertProjectionThreadSessionRow(row).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadSessionRepository.upsert:query")));
	const getByThreadId = (input) => getProjectionThreadSessionRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadSessionRepository.getByThreadId:query")));
	const deleteByThreadId = (input) => deleteProjectionThreadSessionRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadSessionRepository.deleteByThreadId:query")));
	return {
		upsert,
		getByThreadId,
		deleteByThreadId
	};
});
const ProjectionThreadSessionRepositoryLive = Layer.effect(ProjectionThreadSessionRepository, makeProjectionThreadSessionRepository);

//#endregion
//#region src/persistence/Layers/ProjectionTurns.ts
const ProjectionTurnDbRowSchema = ProjectionTurn.mapFields(Struct.assign({ checkpointFiles: Schema.fromJsonString(Schema.Array(OrchestrationCheckpointFile)) }));
const ProjectionTurnByIdDbRowSchema = ProjectionTurnById.mapFields(Struct.assign({ checkpointFiles: Schema.fromJsonString(Schema.Array(OrchestrationCheckpointFile)) }));
function toPersistenceSqlOrDecodeError$1(sqlOperation, decodeOperation) {
	return (cause) => Schema.isSchemaError(cause) ? toPersistenceDecodeError(decodeOperation)(cause) : toPersistenceSqlError(sqlOperation)(cause);
}
const makeProjectionTurnRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionTurnById = SqlSchema.void({
		Request: ProjectionTurnByIdDbRowSchema,
		execute: (row) => sql`
        INSERT INTO projection_turns (
          thread_id,
          turn_id,
          pending_message_id,
          assistant_message_id,
          state,
          requested_at,
          started_at,
          completed_at,
          checkpoint_turn_count,
          checkpoint_ref,
          checkpoint_status,
          checkpoint_files_json
        )
        VALUES (
          ${row.threadId},
          ${row.turnId},
          ${row.pendingMessageId},
          ${row.assistantMessageId},
          ${row.state},
          ${row.requestedAt},
          ${row.startedAt},
          ${row.completedAt},
          ${row.checkpointTurnCount},
          ${row.checkpointRef},
          ${row.checkpointStatus},
          ${row.checkpointFiles}
        )
        ON CONFLICT (thread_id, turn_id)
        DO UPDATE SET
          pending_message_id = excluded.pending_message_id,
          assistant_message_id = excluded.assistant_message_id,
          state = excluded.state,
          requested_at = excluded.requested_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          checkpoint_turn_count = excluded.checkpoint_turn_count,
          checkpoint_ref = excluded.checkpoint_ref,
          checkpoint_status = excluded.checkpoint_status,
          checkpoint_files_json = excluded.checkpoint_files_json
      `
	});
	const clearPendingProjectionTurnsByThread = SqlSchema.void({
		Request: DeleteProjectionTurnsByThreadInput,
		execute: ({ threadId }) => sql`
        DELETE FROM projection_turns
        WHERE thread_id = ${threadId}
          AND turn_id IS NULL
          AND state = 'pending'
          AND checkpoint_turn_count IS NULL
      `
	});
	const insertPendingProjectionTurn = SqlSchema.void({
		Request: ProjectionPendingTurnStart,
		execute: (row) => sql`
        INSERT INTO projection_turns (
          thread_id,
          turn_id,
          pending_message_id,
          assistant_message_id,
          state,
          requested_at,
          started_at,
          completed_at,
          checkpoint_turn_count,
          checkpoint_ref,
          checkpoint_status,
          checkpoint_files_json
        )
        VALUES (
          ${row.threadId},
          NULL,
          ${row.messageId},
          NULL,
          'pending',
          ${row.requestedAt},
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          '[]'
        )
      `
	});
	const getPendingProjectionTurn = SqlSchema.findOneOption({
		Request: GetProjectionPendingTurnStartInput,
		Result: ProjectionPendingTurnStart,
		execute: ({ threadId }) => sql`
        SELECT
          thread_id AS "threadId",
          pending_message_id AS "messageId",
          requested_at AS "requestedAt"
        FROM projection_turns
        WHERE thread_id = ${threadId}
          AND turn_id IS NULL
          AND state = 'pending'
          AND pending_message_id IS NOT NULL
          AND checkpoint_turn_count IS NULL
        ORDER BY requested_at DESC
        LIMIT 1
      `
	});
	const listProjectionTurnsByThread = SqlSchema.findAll({
		Request: ListProjectionTurnsByThreadInput,
		Result: ProjectionTurnDbRowSchema,
		execute: ({ threadId }) => sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          pending_message_id AS "pendingMessageId",
          assistant_message_id AS "assistantMessageId",
          state,
          requested_at AS "requestedAt",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          checkpoint_turn_count AS "checkpointTurnCount",
          checkpoint_ref AS "checkpointRef",
          checkpoint_status AS "checkpointStatus",
          checkpoint_files_json AS "checkpointFiles"
        FROM projection_turns
        WHERE thread_id = ${threadId}
        ORDER BY
          CASE
            WHEN checkpoint_turn_count IS NULL THEN 1
            ELSE 0
          END ASC,
          checkpoint_turn_count ASC,
          requested_at ASC,
          turn_id ASC
      `
	});
	const getProjectionTurnByTurnId = SqlSchema.findOneOption({
		Request: GetProjectionTurnByTurnIdInput,
		Result: ProjectionTurnByIdDbRowSchema,
		execute: ({ threadId, turnId }) => sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          pending_message_id AS "pendingMessageId",
          assistant_message_id AS "assistantMessageId",
          state,
          requested_at AS "requestedAt",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          checkpoint_turn_count AS "checkpointTurnCount",
          checkpoint_ref AS "checkpointRef",
          checkpoint_status AS "checkpointStatus",
          checkpoint_files_json AS "checkpointFiles"
        FROM projection_turns
        WHERE thread_id = ${threadId}
          AND turn_id = ${turnId}
        LIMIT 1
      `
	});
	const clearCheckpointTurnConflictRow = SqlSchema.void({
		Request: ClearCheckpointTurnConflictInput,
		execute: ({ threadId, turnId, checkpointTurnCount }) => sql`
        UPDATE projection_turns
        SET
          checkpoint_turn_count = NULL,
          checkpoint_ref = NULL,
          checkpoint_status = NULL,
          checkpoint_files_json = '[]'
        WHERE thread_id = ${threadId}
          AND checkpoint_turn_count = ${checkpointTurnCount}
          AND (turn_id IS NULL OR turn_id <> ${turnId})
      `
	});
	const deleteProjectionTurnsByThread = SqlSchema.void({
		Request: DeleteProjectionTurnsByThreadInput,
		execute: ({ threadId }) => sql`
        DELETE FROM projection_turns
        WHERE thread_id = ${threadId}
      `
	});
	const upsertByTurnId = (row) => upsertProjectionTurnById(row).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$1("ProjectionTurnRepository.upsertByTurnId:query", "ProjectionTurnRepository.upsertByTurnId:encodeRequest")));
	const replacePendingTurnStart = (row) => sql.withTransaction(clearPendingProjectionTurnsByThread({ threadId: row.threadId }).pipe(Effect.flatMap(() => insertPendingProjectionTurn(row)))).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$1("ProjectionTurnRepository.replacePendingTurnStart:query", "ProjectionTurnRepository.replacePendingTurnStart:encodeRequest")));
	const getPendingTurnStartByThreadId = (input) => getPendingProjectionTurn(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionTurnRepository.getPendingTurnStartByThreadId:query")));
	const deletePendingTurnStartByThreadId = (input) => clearPendingProjectionTurnsByThread(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionTurnRepository.deletePendingTurnStartByThreadId:query")));
	const listByThreadId = (input) => listProjectionTurnsByThread(input).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$1("ProjectionTurnRepository.listByThreadId:query", "ProjectionTurnRepository.listByThreadId:decodeRows")), Effect.map((rows) => rows));
	const getByTurnId = (input) => getProjectionTurnByTurnId(input).pipe(Effect.mapError(toPersistenceSqlOrDecodeError$1("ProjectionTurnRepository.getByTurnId:query", "ProjectionTurnRepository.getByTurnId:decodeRow")), Effect.flatMap((rowOption) => Option.match(rowOption, {
		onNone: () => Effect.succeed(Option.none()),
		onSome: (row) => Effect.succeed(Option.some(row))
	})));
	const clearCheckpointTurnConflict = (input) => clearCheckpointTurnConflictRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionTurnRepository.clearCheckpointTurnConflict:query")));
	const deleteByThreadId = (input) => deleteProjectionTurnsByThread(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionTurnRepository.deleteByThreadId:query")));
	return {
		upsertByTurnId,
		replacePendingTurnStart,
		getPendingTurnStartByThreadId,
		deletePendingTurnStartByThreadId,
		listByThreadId,
		getByTurnId,
		clearCheckpointTurnConflict,
		deleteByThreadId
	};
});
const ProjectionTurnRepositoryLive = Layer.effect(ProjectionTurnRepository, makeProjectionTurnRepository);

//#endregion
//#region src/persistence/Layers/ProjectionThreads.ts
const makeProjectionThreadRepository = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const upsertProjectionThreadRow = SqlSchema.void({
		Request: ProjectionThread,
		execute: (row) => sql`
        INSERT INTO projection_threads (
          thread_id,
          project_id,
          title,
          model,
          runtime_mode,
          interaction_mode,
          branch,
          worktree_path,
          latest_turn_id,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (
          ${row.threadId},
          ${row.projectId},
          ${row.title},
          ${row.model},
          ${row.runtimeMode},
          ${row.interactionMode},
          ${row.branch},
          ${row.worktreePath},
          ${row.latestTurnId},
          ${row.createdAt},
          ${row.updatedAt},
          ${row.deletedAt}
        )
        ON CONFLICT (thread_id)
        DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          model = excluded.model,
          runtime_mode = excluded.runtime_mode,
          interaction_mode = excluded.interaction_mode,
          branch = excluded.branch,
          worktree_path = excluded.worktree_path,
          latest_turn_id = excluded.latest_turn_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at
      `
	});
	const getProjectionThreadRow = SqlSchema.findOneOption({
		Request: GetProjectionThreadInput,
		Result: ProjectionThread,
		execute: ({ threadId }) => sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model,
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE thread_id = ${threadId}
      `
	});
	const listProjectionThreadRows = SqlSchema.findAll({
		Request: ListProjectionThreadsByProjectInput,
		Result: ProjectionThread,
		execute: ({ projectId }) => sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model,
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE project_id = ${projectId}
        ORDER BY created_at ASC, thread_id ASC
      `
	});
	const deleteProjectionThreadRow = SqlSchema.void({
		Request: DeleteProjectionThreadInput,
		execute: ({ threadId }) => sql`
        DELETE FROM projection_threads
        WHERE thread_id = ${threadId}
      `
	});
	const upsert = (row) => upsertProjectionThreadRow(row).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.upsert:query")));
	const getById = (input) => getProjectionThreadRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.getById:query")));
	const listByProjectId = (input) => listProjectionThreadRows(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.listByProjectId:query")));
	const deleteById = (input) => deleteProjectionThreadRow(input).pipe(Effect.mapError(toPersistenceSqlError("ProjectionThreadRepository.deleteById:query")));
	return {
		upsert,
		getById,
		listByProjectId,
		deleteById
	};
});
const ProjectionThreadRepositoryLive = Layer.effect(ProjectionThreadRepository, makeProjectionThreadRepository);

//#endregion
//#region src/attachmentPaths.ts
const ATTACHMENTS_ROUTE_PREFIX = "/attachments";
function normalizeAttachmentRelativePath(rawRelativePath) {
	const normalized = path.normalize(rawRelativePath).replace(/^[/\\]+/, "");
	if (normalized.length === 0 || normalized.startsWith("..") || normalized.includes("\0")) return null;
	return normalized.replace(/\\/g, "/");
}
function resolveAttachmentRelativePath(input) {
	const normalizedRelativePath = normalizeAttachmentRelativePath(input.relativePath);
	if (!normalizedRelativePath) return null;
	const attachmentsRoot = path.resolve(path.join(input.stateDir, "attachments"));
	const filePath = path.resolve(path.join(attachmentsRoot, normalizedRelativePath));
	if (!filePath.startsWith(`${attachmentsRoot}${path.sep}`)) return null;
	return filePath;
}

//#endregion
//#region src/imageMime.ts
const IMAGE_EXTENSION_BY_MIME_TYPE = {
	"image/avif": ".avif",
	"image/bmp": ".bmp",
	"image/gif": ".gif",
	"image/heic": ".heic",
	"image/heif": ".heif",
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/png": ".png",
	"image/svg+xml": ".svg",
	"image/tiff": ".tiff",
	"image/webp": ".webp"
};
const SAFE_IMAGE_FILE_EXTENSIONS = new Set([
	".avif",
	".bmp",
	".gif",
	".heic",
	".heif",
	".ico",
	".jpeg",
	".jpg",
	".png",
	".svg",
	".tiff",
	".webp"
]);
function parseBase64DataUrl(dataUrl) {
	const match = /^data:([^,]+),([a-z0-9+/=\r\n ]+)$/i.exec(dataUrl.trim());
	if (!match) return null;
	const headerParts = (match[1] ?? "").split(";").map((part) => part.trim()).filter((part) => part.length > 0);
	if (headerParts.length < 2) return null;
	if (headerParts.at(-1)?.toLowerCase() !== "base64") return null;
	const mimeType = headerParts[0]?.toLowerCase();
	const base64 = match[2]?.replace(/\s+/g, "");
	if (!mimeType || !base64) return null;
	return {
		mimeType,
		base64
	};
}
function inferImageExtension(input) {
	const key = input.mimeType.toLowerCase();
	const fromMime = Object.hasOwn(IMAGE_EXTENSION_BY_MIME_TYPE, key) ? IMAGE_EXTENSION_BY_MIME_TYPE[key] : void 0;
	if (fromMime) return fromMime;
	const fromMimeExtension = Mime.getExtension(input.mimeType);
	if (fromMimeExtension && SAFE_IMAGE_FILE_EXTENSIONS.has(fromMimeExtension)) return fromMimeExtension;
	const fileName = input.fileName?.trim() ?? "";
	const extensionMatch = /\.([a-z0-9]{1,8})$/i.exec(fileName);
	const fileNameExtension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";
	if (SAFE_IMAGE_FILE_EXTENSIONS.has(fileNameExtension)) return fileNameExtension;
	return ".bin";
}

//#endregion
//#region src/attachmentStore.ts
const ATTACHMENT_FILENAME_EXTENSIONS = [...SAFE_IMAGE_FILE_EXTENSIONS, ".bin"];
const ATTACHMENT_ID_THREAD_SEGMENT_MAX_CHARS = 80;
const ATTACHMENT_ID_PATTERN = new RegExp(`^([a-z0-9_]+(?:-[a-z0-9_]+)*)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`, "i");
function toSafeThreadAttachmentSegment(threadId) {
	const segment = threadId.trim().toLowerCase().replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, ATTACHMENT_ID_THREAD_SEGMENT_MAX_CHARS).replace(/[-_]+$/g, "");
	if (segment.length === 0) return null;
	return segment;
}
function createAttachmentId(threadId) {
	const threadSegment = toSafeThreadAttachmentSegment(threadId);
	if (!threadSegment) return null;
	return `${threadSegment}-${randomUUID()}`;
}
function parseThreadSegmentFromAttachmentId(attachmentId) {
	const normalizedId = normalizeAttachmentRelativePath(attachmentId);
	if (!normalizedId || normalizedId.includes("/") || normalizedId.includes(".")) return null;
	const match = normalizedId.match(ATTACHMENT_ID_PATTERN);
	if (!match) return null;
	return match[1]?.toLowerCase() ?? null;
}
function attachmentRelativePath(attachment) {
	switch (attachment.type) {
		case "image": {
			const extension = inferImageExtension({
				mimeType: attachment.mimeType,
				fileName: attachment.name
			});
			return `${attachment.id}${extension}`;
		}
	}
}
function resolveAttachmentPath(input) {
	return resolveAttachmentRelativePath({
		stateDir: input.stateDir,
		relativePath: attachmentRelativePath(input.attachment)
	});
}
function resolveAttachmentPathById(input) {
	const normalizedId = normalizeAttachmentRelativePath(input.attachmentId);
	if (!normalizedId || normalizedId.includes("/") || normalizedId.includes(".")) return null;
	for (const extension of ATTACHMENT_FILENAME_EXTENSIONS) {
		const maybePath = resolveAttachmentRelativePath({
			stateDir: input.stateDir,
			relativePath: `${normalizedId}${extension}`
		});
		if (maybePath && existsSync(maybePath)) return maybePath;
	}
	return null;
}
function parseAttachmentIdFromRelativePath(relativePath) {
	const normalized = normalizeAttachmentRelativePath(relativePath);
	if (!normalized || normalized.includes("/")) return null;
	const extensionIndex = normalized.lastIndexOf(".");
	if (extensionIndex <= 0) return null;
	const id = normalized.slice(0, extensionIndex);
	return id.length > 0 && !id.includes(".") ? id : null;
}

//#endregion
//#region src/orchestration/Layers/ProjectionPipeline.ts
const ORCHESTRATION_PROJECTOR_NAMES = {
	projects: "projection.projects",
	threads: "projection.threads",
	threadMessages: "projection.thread-messages",
	threadProposedPlans: "projection.thread-proposed-plans",
	threadActivities: "projection.thread-activities",
	threadSessions: "projection.thread-sessions",
	threadTurns: "projection.thread-turns",
	checkpoints: "projection.checkpoints",
	pendingApprovals: "projection.pending-approvals"
};
const materializeAttachmentsForProjection = Effect.fn((input) => Effect.succeed(input.attachments.length === 0 ? [] : input.attachments));
function extractActivityRequestId(payload) {
	if (typeof payload !== "object" || payload === null) return null;
	const requestId = payload.requestId;
	return typeof requestId === "string" ? ApprovalRequestId.makeUnsafe(requestId) : null;
}
function retainProjectionMessagesAfterRevert(messages, turns, turnCount) {
	const retainedMessageIds = /* @__PURE__ */ new Set();
	const retainedTurnIds = /* @__PURE__ */ new Set();
	const keptTurns = turns.filter((turn) => turn.turnId !== null && turn.checkpointTurnCount !== null && turn.checkpointTurnCount <= turnCount);
	for (const turn of keptTurns) {
		if (turn.turnId !== null) retainedTurnIds.add(turn.turnId);
		if (turn.pendingMessageId !== null) retainedMessageIds.add(turn.pendingMessageId);
		if (turn.assistantMessageId !== null) retainedMessageIds.add(turn.assistantMessageId);
	}
	for (const message of messages) {
		if (message.role === "system") {
			retainedMessageIds.add(message.messageId);
			continue;
		}
		if (message.turnId !== null && retainedTurnIds.has(message.turnId)) retainedMessageIds.add(message.messageId);
	}
	const retainedUserCount = messages.filter((message) => message.role === "user" && retainedMessageIds.has(message.messageId)).length;
	const missingUserCount = Math.max(0, turnCount - retainedUserCount);
	if (missingUserCount > 0) {
		const fallbackUserMessages = messages.filter((message) => message.role === "user" && !retainedMessageIds.has(message.messageId) && (message.turnId === null || retainedTurnIds.has(message.turnId))).toSorted((left, right) => left.createdAt.localeCompare(right.createdAt) || left.messageId.localeCompare(right.messageId)).slice(0, missingUserCount);
		for (const message of fallbackUserMessages) retainedMessageIds.add(message.messageId);
	}
	const retainedAssistantCount = messages.filter((message) => message.role === "assistant" && retainedMessageIds.has(message.messageId)).length;
	const missingAssistantCount = Math.max(0, turnCount - retainedAssistantCount);
	if (missingAssistantCount > 0) {
		const fallbackAssistantMessages = messages.filter((message) => message.role === "assistant" && !retainedMessageIds.has(message.messageId) && (message.turnId === null || retainedTurnIds.has(message.turnId))).toSorted((left, right) => left.createdAt.localeCompare(right.createdAt) || left.messageId.localeCompare(right.messageId)).slice(0, missingAssistantCount);
		for (const message of fallbackAssistantMessages) retainedMessageIds.add(message.messageId);
	}
	return messages.filter((message) => retainedMessageIds.has(message.messageId));
}
function retainProjectionActivitiesAfterRevert(activities, turns, turnCount) {
	const retainedTurnIds = new Set(turns.filter((turn) => turn.turnId !== null && turn.checkpointTurnCount !== null && turn.checkpointTurnCount <= turnCount).flatMap((turn) => turn.turnId === null ? [] : [turn.turnId]));
	return activities.filter((activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId));
}
function retainProjectionProposedPlansAfterRevert(proposedPlans, turns, turnCount) {
	const retainedTurnIds = new Set(turns.filter((turn) => turn.turnId !== null && turn.checkpointTurnCount !== null && turn.checkpointTurnCount <= turnCount).flatMap((turn) => turn.turnId === null ? [] : [turn.turnId]));
	return proposedPlans.filter((proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId));
}
function collectThreadAttachmentRelativePaths(threadId, messages) {
	const threadSegment = toSafeThreadAttachmentSegment(threadId);
	if (!threadSegment) return /* @__PURE__ */ new Set();
	const relativePaths = /* @__PURE__ */ new Set();
	for (const message of messages) for (const attachment of message.attachments ?? []) {
		if (attachment.type !== "image") continue;
		const attachmentThreadSegment = parseThreadSegmentFromAttachmentId(attachment.id);
		if (!attachmentThreadSegment || attachmentThreadSegment !== threadSegment) continue;
		relativePaths.add(attachmentRelativePath(attachment));
	}
	return relativePaths;
}
const runAttachmentSideEffects = Effect.fn(function* (sideEffects) {
	const serverConfig = yield* Effect.service(ServerConfig$1);
	const fileSystem = yield* Effect.service(FileSystem.FileSystem);
	const path = yield* Effect.service(Path.Path);
	const attachmentsRootDir = path.join(serverConfig.stateDir, "attachments");
	yield* Effect.forEach(sideEffects.deletedThreadIds, (threadId) => Effect.gen(function* () {
		const threadSegment = toSafeThreadAttachmentSegment(threadId);
		if (!threadSegment) {
			yield* Effect.logWarning("skipping attachment cleanup for unsafe thread id", { threadId });
			return;
		}
		const entries = yield* fileSystem.readDirectory(attachmentsRootDir, { recursive: false }).pipe(Effect.catch(() => Effect.succeed([])));
		yield* Effect.forEach(entries, (entry) => Effect.gen(function* () {
			const normalizedEntry = entry.replace(/^[/\\]+/, "").replace(/\\/g, "/");
			if (normalizedEntry.length === 0 || normalizedEntry.includes("/")) return;
			const attachmentId = parseAttachmentIdFromRelativePath(normalizedEntry);
			if (!attachmentId) return;
			const attachmentThreadSegment = parseThreadSegmentFromAttachmentId(attachmentId);
			if (!attachmentThreadSegment || attachmentThreadSegment !== threadSegment) return;
			yield* fileSystem.remove(path.join(attachmentsRootDir, normalizedEntry), { force: true });
		}), { concurrency: 1 });
	}), { concurrency: 1 });
	yield* Effect.forEach(sideEffects.prunedThreadRelativePaths.entries(), ([threadId, keptThreadRelativePaths]) => {
		if (sideEffects.deletedThreadIds.has(threadId)) return Effect.void;
		return Effect.gen(function* () {
			const threadSegment = toSafeThreadAttachmentSegment(threadId);
			if (!threadSegment) {
				yield* Effect.logWarning("skipping attachment prune for unsafe thread id", { threadId });
				return;
			}
			const entries = yield* fileSystem.readDirectory(attachmentsRootDir, { recursive: false }).pipe(Effect.catch(() => Effect.succeed([])));
			yield* Effect.forEach(entries, (entry) => Effect.gen(function* () {
				const relativePath = entry.replace(/^[/\\]+/, "").replace(/\\/g, "/");
				if (relativePath.length === 0 || relativePath.includes("/")) return;
				const attachmentId = parseAttachmentIdFromRelativePath(relativePath);
				if (!attachmentId) return;
				const attachmentThreadSegment = parseThreadSegmentFromAttachmentId(attachmentId);
				if (!attachmentThreadSegment || attachmentThreadSegment !== threadSegment) return;
				const absolutePath = path.join(attachmentsRootDir, relativePath);
				const fileInfo = yield* fileSystem.stat(absolutePath).pipe(Effect.catch(() => Effect.succeed(null)));
				if (!fileInfo || fileInfo.type !== "File") return;
				if (!keptThreadRelativePaths.has(relativePath)) yield* fileSystem.remove(absolutePath, { force: true });
			}), { concurrency: 1 });
		});
	}, { concurrency: 1 });
});
const makeOrchestrationProjectionPipeline = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const eventStore = yield* OrchestrationEventStore;
	const projectionStateRepository = yield* ProjectionStateRepository;
	const projectionProjectRepository = yield* ProjectionProjectRepository;
	const projectionThreadRepository = yield* ProjectionThreadRepository;
	const projectionThreadMessageRepository = yield* ProjectionThreadMessageRepository;
	const projectionThreadProposedPlanRepository = yield* ProjectionThreadProposedPlanRepository;
	const projectionThreadActivityRepository = yield* ProjectionThreadActivityRepository;
	const projectionThreadSessionRepository = yield* ProjectionThreadSessionRepository;
	const projectionTurnRepository = yield* ProjectionTurnRepository;
	const projectionPendingApprovalRepository = yield* ProjectionPendingApprovalRepository;
	const fileSystem = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const serverConfig = yield* ServerConfig$1;
	const applyProjectsProjection = (event, _attachmentSideEffects) => Effect.gen(function* () {
		switch (event.type) {
			case "project.created":
				yield* projectionProjectRepository.upsert({
					projectId: event.payload.projectId,
					title: event.payload.title,
					workspaceRoot: event.payload.workspaceRoot,
					defaultModel: event.payload.defaultModel,
					scripts: event.payload.scripts,
					createdAt: event.payload.createdAt,
					updatedAt: event.payload.updatedAt,
					deletedAt: null
				});
				return;
			case "project.meta-updated": {
				const existingRow = yield* projectionProjectRepository.getById({ projectId: event.payload.projectId });
				if (Option.isNone(existingRow)) return;
				yield* projectionProjectRepository.upsert({
					...existingRow.value,
					...event.payload.title !== void 0 ? { title: event.payload.title } : {},
					...event.payload.workspaceRoot !== void 0 ? { workspaceRoot: event.payload.workspaceRoot } : {},
					...event.payload.defaultModel !== void 0 ? { defaultModel: event.payload.defaultModel } : {},
					...event.payload.scripts !== void 0 ? { scripts: event.payload.scripts } : {},
					updatedAt: event.payload.updatedAt
				});
				return;
			}
			case "project.deleted": {
				const existingRow = yield* projectionProjectRepository.getById({ projectId: event.payload.projectId });
				if (Option.isNone(existingRow)) return;
				yield* projectionProjectRepository.upsert({
					...existingRow.value,
					deletedAt: event.payload.deletedAt,
					updatedAt: event.payload.deletedAt
				});
				return;
			}
			default: return;
		}
	});
	const applyThreadsProjection = (event, attachmentSideEffects) => Effect.gen(function* () {
		switch (event.type) {
			case "thread.created":
				yield* projectionThreadRepository.upsert({
					threadId: event.payload.threadId,
					projectId: event.payload.projectId,
					title: event.payload.title,
					model: event.payload.model,
					runtimeMode: event.payload.runtimeMode,
					interactionMode: event.payload.interactionMode,
					branch: event.payload.branch,
					worktreePath: event.payload.worktreePath,
					latestTurnId: null,
					createdAt: event.payload.createdAt,
					updatedAt: event.payload.updatedAt,
					deletedAt: null
				});
				return;
			case "thread.meta-updated": {
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					...event.payload.title !== void 0 ? { title: event.payload.title } : {},
					...event.payload.model !== void 0 ? { model: event.payload.model } : {},
					...event.payload.branch !== void 0 ? { branch: event.payload.branch } : {},
					...event.payload.worktreePath !== void 0 ? { worktreePath: event.payload.worktreePath } : {},
					updatedAt: event.payload.updatedAt
				});
				return;
			}
			case "thread.runtime-mode-set": {
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					runtimeMode: event.payload.runtimeMode,
					updatedAt: event.payload.updatedAt
				});
				return;
			}
			case "thread.interaction-mode-set": {
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					interactionMode: event.payload.interactionMode,
					updatedAt: event.payload.updatedAt
				});
				return;
			}
			case "thread.deleted": {
				attachmentSideEffects.deletedThreadIds.add(event.payload.threadId);
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					deletedAt: event.payload.deletedAt,
					updatedAt: event.payload.deletedAt
				});
				return;
			}
			case "thread.message-sent":
			case "thread.proposed-plan-upserted":
			case "thread.activity-appended": {
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					updatedAt: event.occurredAt
				});
				return;
			}
			case "thread.session-set": {
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					latestTurnId: event.payload.session.activeTurnId,
					updatedAt: event.occurredAt
				});
				return;
			}
			case "thread.turn-diff-completed": {
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					latestTurnId: event.payload.turnId,
					updatedAt: event.occurredAt
				});
				return;
			}
			case "thread.reverted": {
				const existingRow = yield* projectionThreadRepository.getById({ threadId: event.payload.threadId });
				if (Option.isNone(existingRow)) return;
				yield* projectionThreadRepository.upsert({
					...existingRow.value,
					latestTurnId: null,
					updatedAt: event.occurredAt
				});
				return;
			}
			default: return;
		}
	});
	const applyThreadMessagesProjection = (event, attachmentSideEffects) => Effect.gen(function* () {
		switch (event.type) {
			case "thread.message-sent": {
				const existingMessage = (yield* projectionThreadMessageRepository.listByThreadId({ threadId: event.payload.threadId })).find((row) => row.messageId === event.payload.messageId);
				const nextText = existingMessage && event.payload.streaming ? `${existingMessage.text}${event.payload.text}` : existingMessage && event.payload.text.length === 0 ? existingMessage.text : event.payload.text;
				const nextAttachments = event.payload.attachments !== void 0 ? yield* materializeAttachmentsForProjection({ attachments: event.payload.attachments }) : existingMessage?.attachments;
				yield* projectionThreadMessageRepository.upsert({
					messageId: event.payload.messageId,
					threadId: event.payload.threadId,
					turnId: event.payload.turnId,
					role: event.payload.role,
					text: nextText,
					...nextAttachments !== void 0 ? { attachments: [...nextAttachments] } : {},
					isStreaming: event.payload.streaming,
					createdAt: existingMessage?.createdAt ?? event.payload.createdAt,
					updatedAt: event.payload.updatedAt
				});
				return;
			}
			case "thread.reverted": {
				const existingRows = yield* projectionThreadMessageRepository.listByThreadId({ threadId: event.payload.threadId });
				if (existingRows.length === 0) return;
				const keptRows = retainProjectionMessagesAfterRevert(existingRows, yield* projectionTurnRepository.listByThreadId({ threadId: event.payload.threadId }), event.payload.turnCount);
				if (keptRows.length === existingRows.length) return;
				yield* projectionThreadMessageRepository.deleteByThreadId({ threadId: event.payload.threadId });
				yield* Effect.forEach(keptRows, projectionThreadMessageRepository.upsert, { concurrency: 1 }).pipe(Effect.asVoid);
				attachmentSideEffects.prunedThreadRelativePaths.set(event.payload.threadId, collectThreadAttachmentRelativePaths(event.payload.threadId, keptRows));
				return;
			}
			default: return;
		}
	});
	const applyThreadProposedPlansProjection = (event, _attachmentSideEffects) => Effect.gen(function* () {
		switch (event.type) {
			case "thread.proposed-plan-upserted":
				yield* projectionThreadProposedPlanRepository.upsert({
					planId: event.payload.proposedPlan.id,
					threadId: event.payload.threadId,
					turnId: event.payload.proposedPlan.turnId,
					planMarkdown: event.payload.proposedPlan.planMarkdown,
					createdAt: event.payload.proposedPlan.createdAt,
					updatedAt: event.payload.proposedPlan.updatedAt
				});
				return;
			case "thread.reverted": {
				const existingRows = yield* projectionThreadProposedPlanRepository.listByThreadId({ threadId: event.payload.threadId });
				if (existingRows.length === 0) return;
				const keptRows = retainProjectionProposedPlansAfterRevert(existingRows, yield* projectionTurnRepository.listByThreadId({ threadId: event.payload.threadId }), event.payload.turnCount);
				if (keptRows.length === existingRows.length) return;
				yield* projectionThreadProposedPlanRepository.deleteByThreadId({ threadId: event.payload.threadId });
				yield* Effect.forEach(keptRows, projectionThreadProposedPlanRepository.upsert, { concurrency: 1 }).pipe(Effect.asVoid);
				return;
			}
			default: return;
		}
	});
	const applyThreadActivitiesProjection = (event, _attachmentSideEffects) => Effect.gen(function* () {
		switch (event.type) {
			case "thread.activity-appended":
				yield* projectionThreadActivityRepository.upsert({
					activityId: event.payload.activity.id,
					threadId: event.payload.threadId,
					turnId: event.payload.activity.turnId,
					tone: event.payload.activity.tone,
					kind: event.payload.activity.kind,
					summary: event.payload.activity.summary,
					payload: event.payload.activity.payload,
					...event.payload.activity.sequence !== void 0 ? { sequence: event.payload.activity.sequence } : {},
					createdAt: event.payload.activity.createdAt
				});
				return;
			case "thread.reverted": {
				const existingRows = yield* projectionThreadActivityRepository.listByThreadId({ threadId: event.payload.threadId });
				if (existingRows.length === 0) return;
				const keptRows = retainProjectionActivitiesAfterRevert(existingRows, yield* projectionTurnRepository.listByThreadId({ threadId: event.payload.threadId }), event.payload.turnCount);
				if (keptRows.length === existingRows.length) return;
				yield* projectionThreadActivityRepository.deleteByThreadId({ threadId: event.payload.threadId });
				yield* Effect.forEach(keptRows, projectionThreadActivityRepository.upsert, { concurrency: 1 }).pipe(Effect.asVoid);
				return;
			}
			default: return;
		}
	});
	const applyThreadSessionsProjection = (event, _attachmentSideEffects) => Effect.gen(function* () {
		if (event.type !== "thread.session-set") return;
		yield* projectionThreadSessionRepository.upsert({
			threadId: event.payload.threadId,
			status: event.payload.session.status,
			providerName: event.payload.session.providerName,
			runtimeMode: event.payload.session.runtimeMode,
			activeTurnId: event.payload.session.activeTurnId,
			lastError: event.payload.session.lastError,
			updatedAt: event.payload.session.updatedAt
		});
	});
	const applyThreadTurnsProjection = (event, _attachmentSideEffects) => Effect.gen(function* () {
		switch (event.type) {
			case "thread.turn-start-requested":
				yield* projectionTurnRepository.replacePendingTurnStart({
					threadId: event.payload.threadId,
					messageId: event.payload.messageId,
					requestedAt: event.payload.createdAt
				});
				return;
			case "thread.session-set": {
				const turnId = event.payload.session.activeTurnId;
				if (turnId === null || event.payload.session.status !== "running") return;
				const existingTurn = yield* projectionTurnRepository.getByTurnId({
					threadId: event.payload.threadId,
					turnId
				});
				const pendingTurnStart = yield* projectionTurnRepository.getPendingTurnStartByThreadId({ threadId: event.payload.threadId });
				if (Option.isSome(existingTurn)) {
					const nextState = existingTurn.value.state === "completed" || existingTurn.value.state === "error" ? existingTurn.value.state : "running";
					yield* projectionTurnRepository.upsertByTurnId({
						...existingTurn.value,
						state: nextState,
						pendingMessageId: existingTurn.value.pendingMessageId ?? (Option.isSome(pendingTurnStart) ? pendingTurnStart.value.messageId : null),
						startedAt: existingTurn.value.startedAt ?? (Option.isSome(pendingTurnStart) ? pendingTurnStart.value.requestedAt : event.occurredAt),
						requestedAt: existingTurn.value.requestedAt ?? (Option.isSome(pendingTurnStart) ? pendingTurnStart.value.requestedAt : event.occurredAt)
					});
				} else yield* projectionTurnRepository.upsertByTurnId({
					turnId,
					threadId: event.payload.threadId,
					pendingMessageId: Option.isSome(pendingTurnStart) ? pendingTurnStart.value.messageId : null,
					assistantMessageId: null,
					state: "running",
					requestedAt: Option.isSome(pendingTurnStart) ? pendingTurnStart.value.requestedAt : event.occurredAt,
					startedAt: Option.isSome(pendingTurnStart) ? pendingTurnStart.value.requestedAt : event.occurredAt,
					completedAt: null,
					checkpointTurnCount: null,
					checkpointRef: null,
					checkpointStatus: null,
					checkpointFiles: []
				});
				yield* projectionTurnRepository.deletePendingTurnStartByThreadId({ threadId: event.payload.threadId });
				return;
			}
			case "thread.message-sent": {
				if (event.payload.turnId === null || event.payload.role !== "assistant") return;
				const existingTurn = yield* projectionTurnRepository.getByTurnId({
					threadId: event.payload.threadId,
					turnId: event.payload.turnId
				});
				if (Option.isSome(existingTurn)) {
					yield* projectionTurnRepository.upsertByTurnId({
						...existingTurn.value,
						assistantMessageId: event.payload.messageId,
						state: event.payload.streaming ? existingTurn.value.state : existingTurn.value.state === "interrupted" ? "interrupted" : existingTurn.value.state === "error" ? "error" : "completed",
						completedAt: event.payload.streaming ? existingTurn.value.completedAt : existingTurn.value.completedAt ?? event.payload.updatedAt,
						startedAt: existingTurn.value.startedAt ?? event.payload.createdAt,
						requestedAt: existingTurn.value.requestedAt ?? event.payload.createdAt
					});
					return;
				}
				yield* projectionTurnRepository.upsertByTurnId({
					turnId: event.payload.turnId,
					threadId: event.payload.threadId,
					pendingMessageId: null,
					assistantMessageId: event.payload.messageId,
					state: event.payload.streaming ? "running" : "completed",
					requestedAt: event.payload.createdAt,
					startedAt: event.payload.createdAt,
					completedAt: event.payload.streaming ? null : event.payload.updatedAt,
					checkpointTurnCount: null,
					checkpointRef: null,
					checkpointStatus: null,
					checkpointFiles: []
				});
				return;
			}
			case "thread.turn-interrupt-requested": {
				if (event.payload.turnId === void 0) return;
				const existingTurn = yield* projectionTurnRepository.getByTurnId({
					threadId: event.payload.threadId,
					turnId: event.payload.turnId
				});
				if (Option.isSome(existingTurn)) {
					yield* projectionTurnRepository.upsertByTurnId({
						...existingTurn.value,
						state: "interrupted",
						completedAt: existingTurn.value.completedAt ?? event.payload.createdAt,
						startedAt: existingTurn.value.startedAt ?? event.payload.createdAt,
						requestedAt: existingTurn.value.requestedAt ?? event.payload.createdAt
					});
					return;
				}
				yield* projectionTurnRepository.upsertByTurnId({
					turnId: event.payload.turnId,
					threadId: event.payload.threadId,
					pendingMessageId: null,
					assistantMessageId: null,
					state: "interrupted",
					requestedAt: event.payload.createdAt,
					startedAt: event.payload.createdAt,
					completedAt: event.payload.createdAt,
					checkpointTurnCount: null,
					checkpointRef: null,
					checkpointStatus: null,
					checkpointFiles: []
				});
				return;
			}
			case "thread.turn-diff-completed": {
				const existingTurn = yield* projectionTurnRepository.getByTurnId({
					threadId: event.payload.threadId,
					turnId: event.payload.turnId
				});
				const nextState = event.payload.status === "error" ? "error" : "completed";
				yield* projectionTurnRepository.clearCheckpointTurnConflict({
					threadId: event.payload.threadId,
					turnId: event.payload.turnId,
					checkpointTurnCount: event.payload.checkpointTurnCount
				});
				if (Option.isSome(existingTurn)) {
					yield* projectionTurnRepository.upsertByTurnId({
						...existingTurn.value,
						assistantMessageId: event.payload.assistantMessageId,
						state: nextState,
						checkpointTurnCount: event.payload.checkpointTurnCount,
						checkpointRef: event.payload.checkpointRef,
						checkpointStatus: event.payload.status,
						checkpointFiles: event.payload.files,
						startedAt: existingTurn.value.startedAt ?? event.payload.completedAt,
						requestedAt: existingTurn.value.requestedAt ?? event.payload.completedAt,
						completedAt: event.payload.completedAt
					});
					return;
				}
				yield* projectionTurnRepository.upsertByTurnId({
					turnId: event.payload.turnId,
					threadId: event.payload.threadId,
					pendingMessageId: null,
					assistantMessageId: event.payload.assistantMessageId,
					state: nextState,
					requestedAt: event.payload.completedAt,
					startedAt: event.payload.completedAt,
					completedAt: event.payload.completedAt,
					checkpointTurnCount: event.payload.checkpointTurnCount,
					checkpointRef: event.payload.checkpointRef,
					checkpointStatus: event.payload.status,
					checkpointFiles: event.payload.files
				});
				return;
			}
			case "thread.reverted": {
				const keptTurns = (yield* projectionTurnRepository.listByThreadId({ threadId: event.payload.threadId })).filter((turn) => turn.turnId !== null && turn.checkpointTurnCount !== null && turn.checkpointTurnCount <= event.payload.turnCount);
				yield* projectionTurnRepository.deleteByThreadId({ threadId: event.payload.threadId });
				yield* Effect.forEach(keptTurns, (turn) => turn.turnId === null ? Effect.void : projectionTurnRepository.upsertByTurnId({
					...turn,
					turnId: turn.turnId
				}), { concurrency: 1 }).pipe(Effect.asVoid);
				return;
			}
			default: return;
		}
	});
	const applyCheckpointsProjection = () => Effect.void;
	const applyPendingApprovalsProjection = (event, _attachmentSideEffects) => Effect.gen(function* () {
		switch (event.type) {
			case "thread.activity-appended": {
				const requestId = extractActivityRequestId(event.payload.activity.payload) ?? event.metadata.requestId ?? null;
				if (requestId === null) return;
				const existingRow = yield* projectionPendingApprovalRepository.getByRequestId({ requestId });
				if (event.payload.activity.kind === "approval.resolved") {
					const resolvedDecisionRaw = typeof event.payload.activity.payload === "object" && event.payload.activity.payload !== null && "decision" in event.payload.activity.payload ? event.payload.activity.payload.decision : null;
					const resolvedDecision = resolvedDecisionRaw === "accept" || resolvedDecisionRaw === "acceptForSession" || resolvedDecisionRaw === "decline" || resolvedDecisionRaw === "cancel" ? resolvedDecisionRaw : null;
					yield* projectionPendingApprovalRepository.upsert({
						requestId,
						threadId: Option.isSome(existingRow) ? existingRow.value.threadId : event.payload.threadId,
						turnId: Option.isSome(existingRow) ? existingRow.value.turnId : event.payload.activity.turnId,
						status: "resolved",
						decision: resolvedDecision,
						createdAt: Option.isSome(existingRow) ? existingRow.value.createdAt : event.payload.activity.createdAt,
						resolvedAt: event.payload.activity.createdAt
					});
					return;
				}
				if (Option.isSome(existingRow) && existingRow.value.status === "resolved") return;
				yield* projectionPendingApprovalRepository.upsert({
					requestId,
					threadId: event.payload.threadId,
					turnId: event.payload.activity.turnId,
					status: "pending",
					decision: null,
					createdAt: Option.isSome(existingRow) ? existingRow.value.createdAt : event.payload.activity.createdAt,
					resolvedAt: null
				});
				return;
			}
			case "thread.approval-response-requested": {
				const existingRow = yield* projectionPendingApprovalRepository.getByRequestId({ requestId: event.payload.requestId });
				yield* projectionPendingApprovalRepository.upsert({
					requestId: event.payload.requestId,
					threadId: Option.isSome(existingRow) ? existingRow.value.threadId : event.payload.threadId,
					turnId: Option.isSome(existingRow) ? existingRow.value.turnId : null,
					status: "resolved",
					decision: event.payload.decision,
					createdAt: Option.isSome(existingRow) ? existingRow.value.createdAt : event.payload.createdAt,
					resolvedAt: event.payload.createdAt
				});
				return;
			}
			default: return;
		}
	});
	const projectors = [
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.projects,
			apply: applyProjectsProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.threadMessages,
			apply: applyThreadMessagesProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.threadProposedPlans,
			apply: applyThreadProposedPlansProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.threadActivities,
			apply: applyThreadActivitiesProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.threadSessions,
			apply: applyThreadSessionsProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.threadTurns,
			apply: applyThreadTurnsProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.checkpoints,
			apply: applyCheckpointsProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.pendingApprovals,
			apply: applyPendingApprovalsProjection
		},
		{
			name: ORCHESTRATION_PROJECTOR_NAMES.threads,
			apply: applyThreadsProjection
		}
	];
	const runProjectorForEvent = (projector, event) => Effect.gen(function* () {
		const attachmentSideEffects = {
			deletedThreadIds: /* @__PURE__ */ new Set(),
			prunedThreadRelativePaths: /* @__PURE__ */ new Map()
		};
		yield* sql.withTransaction(projector.apply(event, attachmentSideEffects).pipe(Effect.flatMap(() => projectionStateRepository.upsert({
			projector: projector.name,
			lastAppliedSequence: event.sequence,
			updatedAt: event.occurredAt
		}))));
		yield* runAttachmentSideEffects(attachmentSideEffects).pipe(Effect.catch((cause) => Effect.logWarning("failed to apply projected attachment side-effects", {
			projector: projector.name,
			sequence: event.sequence,
			eventType: event.type,
			cause
		})));
	});
	const bootstrapProjector = (projector) => projectionStateRepository.getByProjector({ projector: projector.name }).pipe(Effect.flatMap((stateRow) => Stream.runForEach(eventStore.readFromSequence(Option.isSome(stateRow) ? stateRow.value.lastAppliedSequence : 0), (event) => runProjectorForEvent(projector, event))));
	const projectEvent = (event) => Effect.forEach(projectors, (projector) => runProjectorForEvent(projector, event), { concurrency: 1 }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem), Effect.provideService(Path.Path, path), Effect.provideService(ServerConfig$1, serverConfig), Effect.asVoid, Effect.catchTag("SqlError", (sqlError) => Effect.fail(toPersistenceSqlError("ProjectionPipeline.projectEvent:query")(sqlError))));
	return {
		bootstrap: Effect.forEach(projectors, bootstrapProjector, { concurrency: 1 }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem), Effect.provideService(Path.Path, path), Effect.provideService(ServerConfig$1, serverConfig), Effect.asVoid, Effect.tap(() => Effect.log("orchestration projection pipeline bootstrapped").pipe(Effect.annotateLogs({ projectors: projectors.length }))), Effect.catchTag("SqlError", (sqlError) => Effect.fail(toPersistenceSqlError("ProjectionPipeline.bootstrap:query")(sqlError)))),
		projectEvent
	};
});
const OrchestrationProjectionPipelineLive = Layer.effect(OrchestrationProjectionPipeline, makeOrchestrationProjectionPipeline).pipe(Layer.provideMerge(NodeServices.layer), Layer.provideMerge(ProjectionProjectRepositoryLive), Layer.provideMerge(ProjectionThreadRepositoryLive), Layer.provideMerge(ProjectionThreadMessageRepositoryLive), Layer.provideMerge(ProjectionThreadProposedPlanRepositoryLive), Layer.provideMerge(ProjectionThreadActivityRepositoryLive), Layer.provideMerge(ProjectionThreadSessionRepositoryLive), Layer.provideMerge(ProjectionTurnRepositoryLive), Layer.provideMerge(ProjectionPendingApprovalRepositoryLive), Layer.provideMerge(ProjectionStateRepositoryLive));

//#endregion
//#region src/persistence/Services/ProjectionCheckpoints.ts
/**
* ProjectionCheckpointRepository - Projection repository interface for checkpoints.
*
* Owns persistence operations for projected checkpoint summaries in thread
* timelines.
*
* @module ProjectionCheckpointRepository
*/
const ProjectionCheckpoint = Schema.Struct({
	threadId: ThreadId,
	turnId: TurnId,
	checkpointTurnCount: NonNegativeInt,
	checkpointRef: CheckpointRef,
	status: OrchestrationCheckpointStatus,
	files: Schema.Array(OrchestrationCheckpointFile),
	assistantMessageId: Schema.NullOr(MessageId),
	completedAt: IsoDateTime
});
const ListByThreadIdInput = Schema.Struct({ threadId: ThreadId });
const GetByThreadAndTurnCountInput = Schema.Struct({
	threadId: ThreadId,
	checkpointTurnCount: NonNegativeInt
});
const DeleteByThreadIdInput = Schema.Struct({ threadId: ThreadId });

//#endregion
//#region src/orchestration/Layers/ProjectionSnapshotQuery.ts
const decodeReadModel = Schema.decodeUnknownEffect(OrchestrationReadModel);
const ProjectionProjectDbRowSchema = ProjectionProject.mapFields(Struct.assign({ scripts: Schema.fromJsonString(Schema.Array(ProjectScript)) }));
const ProjectionThreadMessageDbRowSchema = ProjectionThreadMessage.mapFields(Struct.assign({
	isStreaming: Schema.Number,
	attachments: Schema.NullOr(Schema.fromJsonString(Schema.Array(ChatAttachment)))
}));
const ProjectionThreadProposedPlanDbRowSchema = ProjectionThreadProposedPlan;
const ProjectionThreadDbRowSchema = ProjectionThread;
const ProjectionThreadActivityDbRowSchema = ProjectionThreadActivity.mapFields(Struct.assign({
	payload: Schema.fromJsonString(Schema.Unknown),
	sequence: Schema.NullOr(NonNegativeInt)
}));
const ProjectionThreadSessionDbRowSchema = ProjectionThreadSession;
const ProjectionCheckpointDbRowSchema = ProjectionCheckpoint.mapFields(Struct.assign({ files: Schema.fromJsonString(Schema.Array(OrchestrationCheckpointFile)) }));
const ProjectionLatestTurnDbRowSchema = Schema.Struct({
	threadId: ProjectionThread.fields.threadId,
	turnId: TurnId,
	state: Schema.String,
	requestedAt: IsoDateTime,
	startedAt: Schema.NullOr(IsoDateTime),
	completedAt: Schema.NullOr(IsoDateTime),
	assistantMessageId: Schema.NullOr(MessageId)
});
const ProjectionStateDbRowSchema = ProjectionState;
const REQUIRED_SNAPSHOT_PROJECTORS = [
	ORCHESTRATION_PROJECTOR_NAMES.projects,
	ORCHESTRATION_PROJECTOR_NAMES.threads,
	ORCHESTRATION_PROJECTOR_NAMES.threadMessages,
	ORCHESTRATION_PROJECTOR_NAMES.threadProposedPlans,
	ORCHESTRATION_PROJECTOR_NAMES.threadActivities,
	ORCHESTRATION_PROJECTOR_NAMES.threadSessions,
	ORCHESTRATION_PROJECTOR_NAMES.checkpoints
];
function maxIso(left, right) {
	if (left === null) return right;
	return left > right ? left : right;
}
function computeSnapshotSequence(stateRows) {
	if (stateRows.length === 0) return 0;
	const sequenceByProjector = new Map(stateRows.map((row) => [row.projector, row.lastAppliedSequence]));
	let minSequence = Number.POSITIVE_INFINITY;
	for (const projector of REQUIRED_SNAPSHOT_PROJECTORS) {
		const sequence = sequenceByProjector.get(projector);
		if (sequence === void 0) return 0;
		if (sequence < minSequence) minSequence = sequence;
	}
	return Number.isFinite(minSequence) ? minSequence : 0;
}
function toPersistenceSqlOrDecodeError(sqlOperation, decodeOperation) {
	return (cause) => Schema.isSchemaError(cause) ? toPersistenceDecodeError(decodeOperation)(cause) : toPersistenceSqlError(sqlOperation)(cause);
}
const makeProjectionSnapshotQuery = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;
	const listProjectRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionProjectDbRowSchema,
		execute: () => sql`
        SELECT
          project_id AS "projectId",
          title,
          workspace_root AS "workspaceRoot",
          default_model AS "defaultModel",
          scripts_json AS "scripts",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_projects
        ORDER BY created_at ASC, project_id ASC
      `
	});
	const listThreadRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionThreadDbRowSchema,
		execute: () => sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model,
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        ORDER BY created_at ASC, thread_id ASC
      `
	});
	const listThreadMessageRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionThreadMessageDbRowSchema,
		execute: () => sql`
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          role,
          text,
          attachments_json AS "attachments",
          is_streaming AS "isStreaming",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_messages
        ORDER BY thread_id ASC, created_at ASC, message_id ASC
      `
	});
	const listThreadProposedPlanRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionThreadProposedPlanDbRowSchema,
		execute: () => sql`
        SELECT
          plan_id AS "planId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          plan_markdown AS "planMarkdown",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_proposed_plans
        ORDER BY thread_id ASC, created_at ASC, plan_id ASC
      `
	});
	const listThreadActivityRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionThreadActivityDbRowSchema,
		execute: () => sql`
        SELECT
          activity_id AS "activityId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          tone,
          kind,
          summary,
          payload_json AS "payload",
          sequence,
          created_at AS "createdAt"
        FROM projection_thread_activities
        ORDER BY
          thread_id ASC,
          CASE WHEN sequence IS NULL THEN 0 ELSE 1 END ASC,
          sequence ASC,
          created_at ASC,
          activity_id ASC
      `
	});
	const listThreadSessionRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionThreadSessionDbRowSchema,
		execute: () => sql`
        SELECT
          thread_id AS "threadId",
          status,
          provider_name AS "providerName",
          provider_session_id AS "providerSessionId",
          provider_thread_id AS "providerThreadId",
          runtime_mode AS "runtimeMode",
          active_turn_id AS "activeTurnId",
          last_error AS "lastError",
          updated_at AS "updatedAt"
        FROM projection_thread_sessions
        ORDER BY thread_id ASC
      `
	});
	const listCheckpointRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionCheckpointDbRowSchema,
		execute: () => sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          checkpoint_turn_count AS "checkpointTurnCount",
          checkpoint_ref AS "checkpointRef",
          checkpoint_status AS "status",
          checkpoint_files_json AS "files",
          assistant_message_id AS "assistantMessageId",
          completed_at AS "completedAt"
        FROM projection_turns
        WHERE checkpoint_turn_count IS NOT NULL
        ORDER BY thread_id ASC, checkpoint_turn_count ASC
      `
	});
	const listLatestTurnRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionLatestTurnDbRowSchema,
		execute: () => sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          state,
          requested_at AS "requestedAt",
          started_at AS "startedAt",
          completed_at AS "completedAt",
          assistant_message_id AS "assistantMessageId"
        FROM projection_turns
        WHERE turn_id IS NOT NULL
        ORDER BY thread_id ASC, requested_at DESC, turn_id DESC
      `
	});
	const listProjectionStateRows = SqlSchema.findAll({
		Request: Schema.Void,
		Result: ProjectionStateDbRowSchema,
		execute: () => sql`
        SELECT
          projector,
          last_applied_sequence AS "lastAppliedSequence",
          updated_at AS "updatedAt"
        FROM projection_state
      `
	});
	const getSnapshot = () => sql.withTransaction(Effect.gen(function* () {
		const [projectRows, threadRows, messageRows, proposedPlanRows, activityRows, sessionRows, checkpointRows, latestTurnRows, stateRows] = yield* Effect.all([
			listProjectRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listProjects:query", "ProjectionSnapshotQuery.getSnapshot:listProjects:decodeRows"))),
			listThreadRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listThreads:query", "ProjectionSnapshotQuery.getSnapshot:listThreads:decodeRows"))),
			listThreadMessageRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listThreadMessages:query", "ProjectionSnapshotQuery.getSnapshot:listThreadMessages:decodeRows"))),
			listThreadProposedPlanRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listThreadProposedPlans:query", "ProjectionSnapshotQuery.getSnapshot:listThreadProposedPlans:decodeRows"))),
			listThreadActivityRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listThreadActivities:query", "ProjectionSnapshotQuery.getSnapshot:listThreadActivities:decodeRows"))),
			listThreadSessionRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listThreadSessions:query", "ProjectionSnapshotQuery.getSnapshot:listThreadSessions:decodeRows"))),
			listCheckpointRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listCheckpoints:query", "ProjectionSnapshotQuery.getSnapshot:listCheckpoints:decodeRows"))),
			listLatestTurnRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listLatestTurns:query", "ProjectionSnapshotQuery.getSnapshot:listLatestTurns:decodeRows"))),
			listProjectionStateRows(void 0).pipe(Effect.mapError(toPersistenceSqlOrDecodeError("ProjectionSnapshotQuery.getSnapshot:listProjectionState:query", "ProjectionSnapshotQuery.getSnapshot:listProjectionState:decodeRows")))
		]);
		const messagesByThread = /* @__PURE__ */ new Map();
		const proposedPlansByThread = /* @__PURE__ */ new Map();
		const activitiesByThread = /* @__PURE__ */ new Map();
		const checkpointsByThread = /* @__PURE__ */ new Map();
		const sessionsByThread = /* @__PURE__ */ new Map();
		const latestTurnByThread = /* @__PURE__ */ new Map();
		let updatedAt = null;
		for (const row of projectRows) updatedAt = maxIso(updatedAt, row.updatedAt);
		for (const row of threadRows) updatedAt = maxIso(updatedAt, row.updatedAt);
		for (const row of stateRows) updatedAt = maxIso(updatedAt, row.updatedAt);
		for (const row of messageRows) {
			updatedAt = maxIso(updatedAt, row.updatedAt);
			const threadMessages = messagesByThread.get(row.threadId) ?? [];
			threadMessages.push({
				id: row.messageId,
				role: row.role,
				text: row.text,
				...row.attachments !== null ? { attachments: row.attachments } : {},
				turnId: row.turnId,
				streaming: row.isStreaming === 1,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt
			});
			messagesByThread.set(row.threadId, threadMessages);
		}
		for (const row of proposedPlanRows) {
			updatedAt = maxIso(updatedAt, row.updatedAt);
			const threadProposedPlans = proposedPlansByThread.get(row.threadId) ?? [];
			threadProposedPlans.push({
				id: row.planId,
				turnId: row.turnId,
				planMarkdown: row.planMarkdown,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt
			});
			proposedPlansByThread.set(row.threadId, threadProposedPlans);
		}
		for (const row of activityRows) {
			updatedAt = maxIso(updatedAt, row.createdAt);
			const threadActivities = activitiesByThread.get(row.threadId) ?? [];
			threadActivities.push({
				id: row.activityId,
				tone: row.tone,
				kind: row.kind,
				summary: row.summary,
				payload: row.payload,
				turnId: row.turnId,
				...row.sequence !== null ? { sequence: row.sequence } : {},
				createdAt: row.createdAt
			});
			activitiesByThread.set(row.threadId, threadActivities);
		}
		for (const row of checkpointRows) {
			updatedAt = maxIso(updatedAt, row.completedAt);
			const threadCheckpoints = checkpointsByThread.get(row.threadId) ?? [];
			threadCheckpoints.push({
				turnId: row.turnId,
				checkpointTurnCount: row.checkpointTurnCount,
				checkpointRef: row.checkpointRef,
				status: row.status,
				files: row.files,
				assistantMessageId: row.assistantMessageId,
				completedAt: row.completedAt
			});
			checkpointsByThread.set(row.threadId, threadCheckpoints);
		}
		for (const row of latestTurnRows) {
			updatedAt = maxIso(updatedAt, row.requestedAt);
			if (row.startedAt !== null) updatedAt = maxIso(updatedAt, row.startedAt);
			if (row.completedAt !== null) updatedAt = maxIso(updatedAt, row.completedAt);
			if (latestTurnByThread.has(row.threadId)) continue;
			latestTurnByThread.set(row.threadId, {
				turnId: row.turnId,
				state: row.state === "error" ? "error" : row.state === "interrupted" ? "interrupted" : row.state === "completed" ? "completed" : "running",
				requestedAt: row.requestedAt,
				startedAt: row.startedAt,
				completedAt: row.completedAt,
				assistantMessageId: row.assistantMessageId
			});
		}
		for (const row of sessionRows) {
			updatedAt = maxIso(updatedAt, row.updatedAt);
			sessionsByThread.set(row.threadId, {
				threadId: row.threadId,
				status: row.status,
				providerName: row.providerName,
				runtimeMode: row.runtimeMode,
				activeTurnId: row.activeTurnId,
				lastError: row.lastError,
				updatedAt: row.updatedAt
			});
		}
		const projects = projectRows.map((row) => ({
			id: row.projectId,
			title: row.title,
			workspaceRoot: row.workspaceRoot,
			defaultModel: row.defaultModel,
			scripts: row.scripts,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			deletedAt: row.deletedAt
		}));
		const threads = threadRows.map((row) => ({
			id: row.threadId,
			projectId: row.projectId,
			title: row.title,
			model: row.model,
			runtimeMode: row.runtimeMode,
			interactionMode: row.interactionMode,
			branch: row.branch,
			worktreePath: row.worktreePath,
			latestTurn: latestTurnByThread.get(row.threadId) ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			deletedAt: row.deletedAt,
			messages: messagesByThread.get(row.threadId) ?? [],
			proposedPlans: proposedPlansByThread.get(row.threadId) ?? [],
			activities: activitiesByThread.get(row.threadId) ?? [],
			checkpoints: checkpointsByThread.get(row.threadId) ?? [],
			session: sessionsByThread.get(row.threadId) ?? null
		}));
		return yield* decodeReadModel({
			snapshotSequence: computeSnapshotSequence(stateRows),
			projects,
			threads,
			updatedAt: updatedAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
		}).pipe(Effect.mapError(toPersistenceDecodeError("ProjectionSnapshotQuery.getSnapshot:decodeReadModel")));
	})).pipe(Effect.mapError((error) => {
		if (isPersistenceError(error)) return error;
		return toPersistenceSqlError("ProjectionSnapshotQuery.getSnapshot:query")(error);
	}));
	return { getSnapshot };
});
const OrchestrationProjectionSnapshotQueryLive = Layer.effect(ProjectionSnapshotQuery, makeProjectionSnapshotQuery);

//#endregion
//#region src/orchestration/Layers/ProviderRuntimeIngestion.ts
const providerTurnKey = (threadId, turnId) => `${threadId}:${turnId}`;
const providerCommandId = (event, tag) => CommandId.makeUnsafe(`provider:${event.eventId}:${tag}:${crypto.randomUUID()}`);
const DEFAULT_ASSISTANT_DELIVERY_MODE = "buffered";
const TURN_MESSAGE_IDS_BY_TURN_CACHE_CAPACITY = 1e4;
const TURN_MESSAGE_IDS_BY_TURN_TTL = Duration.minutes(120);
const BUFFERED_MESSAGE_TEXT_BY_MESSAGE_ID_CACHE_CAPACITY = 2e4;
const BUFFERED_MESSAGE_TEXT_BY_MESSAGE_ID_TTL = Duration.minutes(120);
const BUFFERED_PROPOSED_PLAN_BY_ID_CACHE_CAPACITY = 1e4;
const BUFFERED_PROPOSED_PLAN_BY_ID_TTL = Duration.minutes(120);
const MAX_BUFFERED_ASSISTANT_CHARS = 24e3;
const STRICT_PROVIDER_LIFECYCLE_GUARD = process.env.T3CODE_STRICT_PROVIDER_LIFECYCLE_GUARD !== "0";
function toTurnId$1(value) {
	return value === void 0 ? void 0 : TurnId.makeUnsafe(String(value));
}
function toApprovalRequestId(value) {
	return value === void 0 ? void 0 : ApprovalRequestId.makeUnsafe(value);
}
function sameId(left, right) {
	if (left === null || left === void 0 || right === null || right === void 0) return false;
	return left === right;
}
function truncateDetail(value, limit = 180) {
	return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}
function normalizeProposedPlanMarkdown(planMarkdown) {
	const trimmed = planMarkdown?.trim();
	if (!trimmed) return;
	return trimmed;
}
function proposedPlanIdForTurn(threadId, turnId) {
	return `plan:${threadId}:turn:${turnId}`;
}
function proposedPlanIdFromEvent(event, threadId) {
	const turnId = toTurnId$1(event.turnId);
	if (turnId) return proposedPlanIdForTurn(threadId, turnId);
	if (event.itemId) return `plan:${threadId}:item:${event.itemId}`;
	return `plan:${threadId}:event:${event.eventId}`;
}
function asString$2(value) {
	return typeof value === "string" ? value : void 0;
}
function runtimePayloadRecord(event) {
	const payload = event.payload;
	if (!payload || typeof payload !== "object") return;
	return payload;
}
function normalizeRuntimeTurnState(value) {
	switch (value) {
		case "failed":
		case "interrupted":
		case "cancelled":
		case "completed": return value;
		default: return "completed";
	}
}
function runtimeTurnState(event) {
	return normalizeRuntimeTurnState(asString$2(runtimePayloadRecord(event)?.state));
}
function runtimeTurnErrorMessage(event) {
	return asString$2(runtimePayloadRecord(event)?.errorMessage);
}
function runtimeErrorMessageFromEvent(event) {
	return asString$2(runtimePayloadRecord(event)?.message);
}
function orchestrationSessionStatusFromRuntimeState(state) {
	switch (state) {
		case "starting": return "starting";
		case "running":
		case "waiting": return "running";
		case "ready": return "ready";
		case "interrupted": return "interrupted";
		case "stopped": return "stopped";
		case "error": return "error";
	}
}
function requestKindFromCanonicalRequestType(requestType) {
	switch (requestType) {
		case "command_execution_approval":
		case "exec_command_approval": return "command";
		case "file_read_approval": return "file-read";
		case "file_change_approval":
		case "apply_patch_approval": return "file-change";
		default: return;
	}
}
function isToolLifecycleItemType(itemType) {
	return itemType === "command_execution" || itemType === "file_change" || itemType === "mcp_tool_call" || itemType === "dynamic_tool_call" || itemType === "collab_agent_tool_call" || itemType === "web_search" || itemType === "image_view";
}
function runtimeEventToActivities(event) {
	const maybeSequence = (() => {
		const eventWithSequence = event;
		return eventWithSequence.sessionSequence !== void 0 ? { sequence: eventWithSequence.sessionSequence } : {};
	})();
	switch (event.type) {
		case "request.opened": {
			if (event.payload.requestType === "tool_user_input") return [];
			const requestKind = requestKindFromCanonicalRequestType(event.payload.requestType);
			return [{
				id: event.eventId,
				createdAt: event.createdAt,
				tone: "approval",
				kind: "approval.requested",
				summary: requestKind === "command" ? "Command approval requested" : requestKind === "file-read" ? "File-read approval requested" : requestKind === "file-change" ? "File-change approval requested" : "Approval requested",
				payload: {
					requestId: toApprovalRequestId(event.requestId),
					...requestKind ? { requestKind } : {},
					requestType: event.payload.requestType,
					...event.payload.detail ? { detail: truncateDetail(event.payload.detail) } : {}
				},
				turnId: toTurnId$1(event.turnId) ?? null,
				...maybeSequence
			}];
		}
		case "request.resolved": {
			if (event.payload.requestType === "tool_user_input") return [];
			const requestKind = requestKindFromCanonicalRequestType(event.payload.requestType);
			return [{
				id: event.eventId,
				createdAt: event.createdAt,
				tone: "approval",
				kind: "approval.resolved",
				summary: "Approval resolved",
				payload: {
					requestId: toApprovalRequestId(event.requestId),
					...requestKind ? { requestKind } : {},
					requestType: event.payload.requestType,
					...event.payload.decision ? { decision: event.payload.decision } : {}
				},
				turnId: toTurnId$1(event.turnId) ?? null,
				...maybeSequence
			}];
		}
		case "runtime.error": {
			const message = runtimeErrorMessageFromEvent(event);
			if (!message) return [];
			return [{
				id: event.eventId,
				createdAt: event.createdAt,
				tone: "error",
				kind: "runtime.error",
				summary: "Runtime error",
				payload: { message: truncateDetail(message) },
				turnId: toTurnId$1(event.turnId) ?? null,
				...maybeSequence
			}];
		}
		case "runtime.warning": return [{
			id: event.eventId,
			createdAt: event.createdAt,
			tone: "info",
			kind: "runtime.warning",
			summary: "Runtime warning",
			payload: {
				message: truncateDetail(event.payload.message),
				...event.payload.detail !== void 0 ? { detail: event.payload.detail } : {}
			},
			turnId: toTurnId$1(event.turnId) ?? null,
			...maybeSequence
		}];
		case "turn.plan.updated": return [{
			id: event.eventId,
			createdAt: event.createdAt,
			tone: "info",
			kind: "turn.plan.updated",
			summary: "Plan updated",
			payload: {
				plan: event.payload.plan,
				...event.payload.explanation !== void 0 ? { explanation: event.payload.explanation } : {}
			},
			turnId: toTurnId$1(event.turnId) ?? null,
			...maybeSequence
		}];
		case "user-input.requested": return [{
			id: event.eventId,
			createdAt: event.createdAt,
			tone: "info",
			kind: "user-input.requested",
			summary: "User input requested",
			payload: {
				...event.requestId ? { requestId: event.requestId } : {},
				questions: event.payload.questions
			},
			turnId: toTurnId$1(event.turnId) ?? null,
			...maybeSequence
		}];
		case "user-input.resolved": return [{
			id: event.eventId,
			createdAt: event.createdAt,
			tone: "info",
			kind: "user-input.resolved",
			summary: "User input submitted",
			payload: {
				...event.requestId ? { requestId: event.requestId } : {},
				answers: event.payload.answers
			},
			turnId: toTurnId$1(event.turnId) ?? null,
			...maybeSequence
		}];
		case "task.started": return [{
			id: event.eventId,
			createdAt: event.createdAt,
			tone: "info",
			kind: "task.started",
			summary: event.payload.taskType === "plan" ? "Plan task started" : event.payload.taskType ? `${event.payload.taskType} task started` : "Task started",
			payload: {
				taskId: event.payload.taskId,
				...event.payload.taskType ? { taskType: event.payload.taskType } : {},
				...event.payload.description ? { detail: truncateDetail(event.payload.description) } : {}
			},
			turnId: toTurnId$1(event.turnId) ?? null,
			...maybeSequence
		}];
		case "task.progress": return [{
			id: event.eventId,
			createdAt: event.createdAt,
			tone: "info",
			kind: "task.progress",
			summary: "Reasoning update",
			payload: {
				taskId: event.payload.taskId,
				detail: truncateDetail(event.payload.description),
				...event.payload.lastToolName ? { lastToolName: event.payload.lastToolName } : {},
				...event.payload.usage !== void 0 ? { usage: event.payload.usage } : {}
			},
			turnId: toTurnId$1(event.turnId) ?? null,
			...maybeSequence
		}];
		case "task.completed": return [{
			id: event.eventId,
			createdAt: event.createdAt,
			tone: event.payload.status === "failed" ? "error" : "info",
			kind: "task.completed",
			summary: event.payload.status === "failed" ? "Task failed" : event.payload.status === "stopped" ? "Task stopped" : "Task completed",
			payload: {
				taskId: event.payload.taskId,
				status: event.payload.status,
				...event.payload.summary ? { detail: truncateDetail(event.payload.summary) } : {},
				...event.payload.usage !== void 0 ? { usage: event.payload.usage } : {}
			},
			turnId: toTurnId$1(event.turnId) ?? null,
			...maybeSequence
		}];
		case "item.updated":
			if (!isToolLifecycleItemType(event.payload.itemType)) return [];
			return [{
				id: event.eventId,
				createdAt: event.createdAt,
				tone: "tool",
				kind: "tool.updated",
				summary: event.payload.title ?? "Tool updated",
				payload: {
					itemType: event.payload.itemType,
					...event.payload.status ? { status: event.payload.status } : {},
					...event.payload.detail ? { detail: truncateDetail(event.payload.detail) } : {},
					...event.payload.data !== void 0 ? { data: event.payload.data } : {}
				},
				turnId: toTurnId$1(event.turnId) ?? null,
				...maybeSequence
			}];
		case "item.completed":
			if (!isToolLifecycleItemType(event.payload.itemType)) return [];
			return [{
				id: event.eventId,
				createdAt: event.createdAt,
				tone: "tool",
				kind: "tool.completed",
				summary: `${event.payload.title ?? "Tool"} complete`,
				payload: {
					itemType: event.payload.itemType,
					...event.payload.detail ? { detail: truncateDetail(event.payload.detail) } : {}
				},
				turnId: toTurnId$1(event.turnId) ?? null,
				...maybeSequence
			}];
		case "item.started":
			if (!isToolLifecycleItemType(event.payload.itemType)) return [];
			return [{
				id: event.eventId,
				createdAt: event.createdAt,
				tone: "tool",
				kind: "tool.started",
				summary: `${event.payload.title ?? "Tool"} started`,
				payload: {
					itemType: event.payload.itemType,
					...event.payload.detail ? { detail: truncateDetail(event.payload.detail) } : {}
				},
				turnId: toTurnId$1(event.turnId) ?? null,
				...maybeSequence
			}];
		default: break;
	}
	return [];
}
const make = Effect.gen(function* () {
	const orchestrationEngine = yield* OrchestrationEngineService;
	const providerService = yield* ProviderService;
	const assistantDeliveryModeRef = yield* Ref.make(DEFAULT_ASSISTANT_DELIVERY_MODE);
	const turnMessageIdsByTurnKey = yield* Cache.make({
		capacity: TURN_MESSAGE_IDS_BY_TURN_CACHE_CAPACITY,
		timeToLive: TURN_MESSAGE_IDS_BY_TURN_TTL,
		lookup: () => Effect.succeed(/* @__PURE__ */ new Set())
	});
	const bufferedAssistantTextByMessageId = yield* Cache.make({
		capacity: BUFFERED_MESSAGE_TEXT_BY_MESSAGE_ID_CACHE_CAPACITY,
		timeToLive: BUFFERED_MESSAGE_TEXT_BY_MESSAGE_ID_TTL,
		lookup: () => Effect.succeed("")
	});
	const bufferedProposedPlanById = yield* Cache.make({
		capacity: BUFFERED_PROPOSED_PLAN_BY_ID_CACHE_CAPACITY,
		timeToLive: BUFFERED_PROPOSED_PLAN_BY_ID_TTL,
		lookup: () => Effect.succeed({
			text: "",
			createdAt: ""
		})
	});
	const isGitRepoForThread = Effect.fnUntraced(function* (threadId) {
		const readModel = yield* orchestrationEngine.getReadModel();
		const thread = readModel.threads.find((entry) => entry.id === threadId);
		if (!thread) return false;
		const workspaceCwd = resolveThreadWorkspaceCwd({
			thread,
			projects: readModel.projects
		});
		if (!workspaceCwd) return false;
		return isGitRepository(workspaceCwd);
	});
	const rememberAssistantMessageId = (threadId, turnId, messageId) => Cache.getOption(turnMessageIdsByTurnKey, providerTurnKey(threadId, turnId)).pipe(Effect.flatMap((existingIds) => Cache.set(turnMessageIdsByTurnKey, providerTurnKey(threadId, turnId), Option.match(existingIds, {
		onNone: () => new Set([messageId]),
		onSome: (ids) => {
			const nextIds = new Set(ids);
			nextIds.add(messageId);
			return nextIds;
		}
	}))));
	const forgetAssistantMessageId = (threadId, turnId, messageId) => Cache.getOption(turnMessageIdsByTurnKey, providerTurnKey(threadId, turnId)).pipe(Effect.flatMap((existingIds) => Option.match(existingIds, {
		onNone: () => Effect.void,
		onSome: (ids) => {
			const nextIds = new Set(ids);
			nextIds.delete(messageId);
			if (nextIds.size === 0) return Cache.invalidate(turnMessageIdsByTurnKey, providerTurnKey(threadId, turnId));
			return Cache.set(turnMessageIdsByTurnKey, providerTurnKey(threadId, turnId), nextIds);
		}
	})));
	const getAssistantMessageIdsForTurn = (threadId, turnId) => Cache.getOption(turnMessageIdsByTurnKey, providerTurnKey(threadId, turnId)).pipe(Effect.map((existingIds) => Option.getOrElse(existingIds, () => /* @__PURE__ */ new Set())));
	const clearAssistantMessageIdsForTurn = (threadId, turnId) => Cache.invalidate(turnMessageIdsByTurnKey, providerTurnKey(threadId, turnId));
	const appendBufferedAssistantText = (messageId, delta) => Cache.getOption(bufferedAssistantTextByMessageId, messageId).pipe(Effect.flatMap((existingText) => Effect.gen(function* () {
		const nextText = Option.match(existingText, {
			onNone: () => delta,
			onSome: (text) => `${text}${delta}`
		});
		if (nextText.length <= MAX_BUFFERED_ASSISTANT_CHARS) {
			yield* Cache.set(bufferedAssistantTextByMessageId, messageId, nextText);
			return "";
		}
		yield* Cache.invalidate(bufferedAssistantTextByMessageId, messageId);
		return nextText;
	})));
	const takeBufferedAssistantText = (messageId) => Cache.getOption(bufferedAssistantTextByMessageId, messageId).pipe(Effect.flatMap((existingText) => Cache.invalidate(bufferedAssistantTextByMessageId, messageId).pipe(Effect.as(Option.getOrElse(existingText, () => "")))));
	const clearBufferedAssistantText = (messageId) => Cache.invalidate(bufferedAssistantTextByMessageId, messageId);
	const appendBufferedProposedPlan = (planId, delta, createdAt) => Cache.getOption(bufferedProposedPlanById, planId).pipe(Effect.flatMap((existingEntry) => {
		const existing = Option.getOrUndefined(existingEntry);
		return Cache.set(bufferedProposedPlanById, planId, {
			text: `${existing?.text ?? ""}${delta}`,
			createdAt: existing?.createdAt && existing.createdAt.length > 0 ? existing.createdAt : createdAt
		});
	}));
	const takeBufferedProposedPlan = (planId) => Cache.getOption(bufferedProposedPlanById, planId).pipe(Effect.flatMap((existingEntry) => Cache.invalidate(bufferedProposedPlanById, planId).pipe(Effect.as(Option.getOrUndefined(existingEntry)))));
	const clearBufferedProposedPlan = (planId) => Cache.invalidate(bufferedProposedPlanById, planId);
	const clearAssistantMessageState = (messageId) => clearBufferedAssistantText(messageId);
	const finalizeAssistantMessage = (input) => Effect.gen(function* () {
		const bufferedText = yield* takeBufferedAssistantText(input.messageId);
		const text = bufferedText.length > 0 ? bufferedText : (input.fallbackText?.trim().length ?? 0) > 0 ? input.fallbackText : "";
		if (text.length > 0) yield* orchestrationEngine.dispatch({
			type: "thread.message.assistant.delta",
			commandId: providerCommandId(input.event, input.finalDeltaCommandTag),
			threadId: input.threadId,
			messageId: input.messageId,
			delta: text,
			...input.turnId ? { turnId: input.turnId } : {},
			createdAt: input.createdAt
		});
		yield* orchestrationEngine.dispatch({
			type: "thread.message.assistant.complete",
			commandId: providerCommandId(input.event, input.commandTag),
			threadId: input.threadId,
			messageId: input.messageId,
			...input.turnId ? { turnId: input.turnId } : {},
			createdAt: input.createdAt
		});
		yield* clearAssistantMessageState(input.messageId);
	});
	const upsertProposedPlan = (input) => Effect.gen(function* () {
		const planMarkdown = normalizeProposedPlanMarkdown(input.planMarkdown);
		if (!planMarkdown) return;
		const existingPlan = input.threadProposedPlans.find((entry) => entry.id === input.planId);
		yield* orchestrationEngine.dispatch({
			type: "thread.proposed-plan.upsert",
			commandId: providerCommandId(input.event, "proposed-plan-upsert"),
			threadId: input.threadId,
			proposedPlan: {
				id: input.planId,
				turnId: input.turnId ?? null,
				planMarkdown,
				createdAt: existingPlan?.createdAt ?? input.createdAt,
				updatedAt: input.updatedAt
			},
			createdAt: input.updatedAt
		});
	});
	const finalizeBufferedProposedPlan = (input) => Effect.gen(function* () {
		const bufferedPlan = yield* takeBufferedProposedPlan(input.planId);
		const bufferedMarkdown = normalizeProposedPlanMarkdown(bufferedPlan?.text);
		const fallbackMarkdown = normalizeProposedPlanMarkdown(input.fallbackMarkdown);
		const planMarkdown = bufferedMarkdown ?? fallbackMarkdown;
		if (!planMarkdown) return;
		yield* upsertProposedPlan({
			event: input.event,
			threadId: input.threadId,
			threadProposedPlans: input.threadProposedPlans,
			planId: input.planId,
			...input.turnId ? { turnId: input.turnId } : {},
			planMarkdown,
			createdAt: bufferedPlan?.createdAt && bufferedPlan.createdAt.length > 0 ? bufferedPlan.createdAt : input.updatedAt,
			updatedAt: input.updatedAt
		});
		yield* clearBufferedProposedPlan(input.planId);
	});
	const clearTurnStateForSession = (threadId) => Effect.gen(function* () {
		const prefix = `${threadId}:`;
		const proposedPlanPrefix = `plan:${threadId}:`;
		const turnKeys = Array.from(yield* Cache.keys(turnMessageIdsByTurnKey));
		const proposedPlanKeys = Array.from(yield* Cache.keys(bufferedProposedPlanById));
		yield* Effect.forEach(turnKeys, (key) => Effect.gen(function* () {
			if (!key.startsWith(prefix)) return;
			const messageIds = yield* Cache.getOption(turnMessageIdsByTurnKey, key);
			if (Option.isSome(messageIds)) yield* Effect.forEach(messageIds.value, clearAssistantMessageState, { concurrency: 1 }).pipe(Effect.asVoid);
			yield* Cache.invalidate(turnMessageIdsByTurnKey, key);
		}), { concurrency: 1 }).pipe(Effect.asVoid);
		yield* Effect.forEach(proposedPlanKeys, (key) => key.startsWith(proposedPlanPrefix) ? Cache.invalidate(bufferedProposedPlanById, key) : Effect.void, { concurrency: 1 }).pipe(Effect.asVoid);
	});
	const processRuntimeEvent = (event) => Effect.gen(function* () {
		const thread = (yield* orchestrationEngine.getReadModel()).threads.find((entry) => entry.id === event.threadId);
		if (!thread) return;
		const now = event.createdAt;
		const eventTurnId = toTurnId$1(event.turnId);
		const activeTurnId = thread.session?.activeTurnId ?? null;
		const conflictsWithActiveTurn = activeTurnId !== null && eventTurnId !== void 0 && !sameId(activeTurnId, eventTurnId);
		const missingTurnForActiveTurn = activeTurnId !== null && eventTurnId === void 0;
		const shouldApplyThreadLifecycle = (() => {
			if (!STRICT_PROVIDER_LIFECYCLE_GUARD) return true;
			switch (event.type) {
				case "session.exited": return true;
				case "session.started":
				case "thread.started": return true;
				case "turn.started": return !conflictsWithActiveTurn;
				case "turn.completed":
					if (conflictsWithActiveTurn || missingTurnForActiveTurn) return false;
					if (activeTurnId !== null && eventTurnId !== void 0) return sameId(activeTurnId, eventTurnId);
					return true;
				default: return true;
			}
		})();
		if (event.type === "session.started" || event.type === "session.state.changed" || event.type === "session.exited" || event.type === "thread.started" || event.type === "turn.started" || event.type === "turn.completed") {
			const nextActiveTurnId = event.type === "turn.started" ? eventTurnId ?? null : event.type === "turn.completed" || event.type === "session.exited" ? null : activeTurnId;
			const status = (() => {
				switch (event.type) {
					case "session.state.changed": return orchestrationSessionStatusFromRuntimeState(event.payload.state);
					case "turn.started": return "running";
					case "session.exited": return "stopped";
					case "turn.completed": return runtimeTurnState(event) === "failed" ? "error" : "ready";
					case "session.started":
					case "thread.started": return activeTurnId !== null ? "running" : "ready";
				}
			})();
			const lastError = event.type === "session.state.changed" && event.payload.state === "error" ? event.payload.reason ?? thread.session?.lastError ?? "Provider session error" : event.type === "turn.completed" && runtimeTurnState(event) === "failed" ? runtimeTurnErrorMessage(event) ?? thread.session?.lastError ?? "Turn failed" : status === "ready" ? null : thread.session?.lastError ?? null;
			if (shouldApplyThreadLifecycle) yield* orchestrationEngine.dispatch({
				type: "thread.session.set",
				commandId: providerCommandId(event, "thread-session-set"),
				threadId: thread.id,
				session: {
					threadId: thread.id,
					status,
					providerName: event.provider,
					runtimeMode: thread.session?.runtimeMode ?? "full-access",
					activeTurnId: nextActiveTurnId,
					lastError,
					updatedAt: now
				},
				createdAt: now
			});
		}
		const assistantDelta = event.type === "content.delta" && event.payload.streamKind === "assistant_text" ? event.payload.delta : void 0;
		const proposedPlanDelta = event.type === "turn.proposed.delta" ? event.payload.delta : void 0;
		if (assistantDelta && assistantDelta.length > 0) {
			const assistantMessageId = MessageId.makeUnsafe(`assistant:${event.itemId ?? event.turnId ?? event.eventId}`);
			const turnId = toTurnId$1(event.turnId);
			if (turnId) yield* rememberAssistantMessageId(thread.id, turnId, assistantMessageId);
			if ((yield* Ref.get(assistantDeliveryModeRef)) === "buffered") {
				const spillChunk = yield* appendBufferedAssistantText(assistantMessageId, assistantDelta);
				if (spillChunk.length > 0) yield* orchestrationEngine.dispatch({
					type: "thread.message.assistant.delta",
					commandId: providerCommandId(event, "assistant-delta-buffer-spill"),
					threadId: thread.id,
					messageId: assistantMessageId,
					delta: spillChunk,
					...turnId ? { turnId } : {},
					createdAt: now
				});
			} else yield* orchestrationEngine.dispatch({
				type: "thread.message.assistant.delta",
				commandId: providerCommandId(event, "assistant-delta"),
				threadId: thread.id,
				messageId: assistantMessageId,
				delta: assistantDelta,
				...turnId ? { turnId } : {},
				createdAt: now
			});
		}
		if (proposedPlanDelta && proposedPlanDelta.length > 0) yield* appendBufferedProposedPlan(proposedPlanIdFromEvent(event, thread.id), proposedPlanDelta, now);
		const assistantCompletion = event.type === "item.completed" && event.payload.itemType === "assistant_message" ? {
			messageId: MessageId.makeUnsafe(`assistant:${event.itemId ?? event.turnId ?? event.eventId}`),
			fallbackText: event.payload.detail
		} : void 0;
		const proposedPlanCompletion = event.type === "turn.proposed.completed" ? {
			planId: proposedPlanIdFromEvent(event, thread.id),
			turnId: toTurnId$1(event.turnId),
			planMarkdown: event.payload.planMarkdown
		} : void 0;
		if (assistantCompletion) {
			const assistantMessageId = assistantCompletion.messageId;
			const turnId = toTurnId$1(event.turnId);
			if (turnId) yield* rememberAssistantMessageId(thread.id, turnId, assistantMessageId);
			yield* finalizeAssistantMessage({
				event,
				threadId: thread.id,
				messageId: assistantMessageId,
				...turnId ? { turnId } : {},
				createdAt: now,
				commandTag: "assistant-complete",
				finalDeltaCommandTag: "assistant-delta-finalize",
				...assistantCompletion.fallbackText !== void 0 ? { fallbackText: assistantCompletion.fallbackText } : {}
			});
			if (turnId) yield* forgetAssistantMessageId(thread.id, turnId, assistantMessageId);
		}
		if (proposedPlanCompletion) yield* finalizeBufferedProposedPlan({
			event,
			threadId: thread.id,
			threadProposedPlans: thread.proposedPlans,
			planId: proposedPlanCompletion.planId,
			...proposedPlanCompletion.turnId ? { turnId: proposedPlanCompletion.turnId } : {},
			fallbackMarkdown: proposedPlanCompletion.planMarkdown,
			updatedAt: now
		});
		if (event.type === "turn.completed") {
			const turnId = toTurnId$1(event.turnId);
			if (turnId) {
				const assistantMessageIds = yield* getAssistantMessageIdsForTurn(thread.id, turnId);
				yield* Effect.forEach(assistantMessageIds, (assistantMessageId) => finalizeAssistantMessage({
					event,
					threadId: thread.id,
					messageId: assistantMessageId,
					turnId,
					createdAt: now,
					commandTag: "assistant-complete-finalize",
					finalDeltaCommandTag: "assistant-delta-finalize-fallback"
				}), { concurrency: 1 }).pipe(Effect.asVoid);
				yield* clearAssistantMessageIdsForTurn(thread.id, turnId);
				yield* finalizeBufferedProposedPlan({
					event,
					threadId: thread.id,
					threadProposedPlans: thread.proposedPlans,
					planId: proposedPlanIdForTurn(thread.id, turnId),
					turnId,
					updatedAt: now
				});
			}
		}
		if (event.type === "session.exited") yield* clearTurnStateForSession(thread.id);
		if (event.type === "runtime.error") {
			const runtimeErrorMessage = runtimeErrorMessageFromEvent(event) ?? "Provider runtime error";
			if (!STRICT_PROVIDER_LIFECYCLE_GUARD ? true : activeTurnId === null || eventTurnId === void 0 || sameId(activeTurnId, eventTurnId)) yield* orchestrationEngine.dispatch({
				type: "thread.session.set",
				commandId: providerCommandId(event, "runtime-error-session-set"),
				threadId: thread.id,
				session: {
					threadId: thread.id,
					status: "error",
					providerName: event.provider,
					runtimeMode: thread.session?.runtimeMode ?? "full-access",
					activeTurnId: eventTurnId ?? null,
					lastError: runtimeErrorMessage,
					updatedAt: now
				},
				createdAt: now
			});
		}
		if (event.type === "thread.metadata.updated" && event.payload.name) yield* orchestrationEngine.dispatch({
			type: "thread.meta.update",
			commandId: providerCommandId(event, "thread-meta-update"),
			threadId: thread.id,
			title: event.payload.name
		});
		if (event.type === "turn.diff.updated") {
			const turnId = toTurnId$1(event.turnId);
			if (turnId && (yield* isGitRepoForThread(thread.id))) {
				const assistantMessageId = MessageId.makeUnsafe(`assistant:${event.itemId ?? event.turnId ?? event.eventId}`);
				yield* orchestrationEngine.dispatch({
					type: "thread.turn.diff.complete",
					commandId: providerCommandId(event, "thread-turn-diff-complete"),
					threadId: thread.id,
					turnId,
					completedAt: now,
					checkpointRef: CheckpointRef.makeUnsafe(`provider-diff:${event.eventId}`),
					status: "missing",
					files: [],
					assistantMessageId,
					checkpointTurnCount: thread.checkpoints.length + 1,
					createdAt: now
				});
			}
		}
		const activities = runtimeEventToActivities(event);
		yield* Effect.forEach(activities, (activity) => orchestrationEngine.dispatch({
			type: "thread.activity.append",
			commandId: providerCommandId(event, "thread-activity-append"),
			threadId: thread.id,
			activity,
			createdAt: activity.createdAt
		})).pipe(Effect.asVoid);
	});
	const processDomainEvent = (event) => Ref.set(assistantDeliveryModeRef, event.payload.assistantDeliveryMode ?? DEFAULT_ASSISTANT_DELIVERY_MODE);
	const processInput = (input) => input.source === "runtime" ? processRuntimeEvent(input.event) : processDomainEvent(input.event);
	const processInputSafely = (input) => processInput(input).pipe(Effect.catchCause((cause) => {
		if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
		return Effect.logWarning("provider runtime ingestion failed to process event", {
			source: input.source,
			eventId: input.event.eventId,
			eventType: input.event.type,
			cause: Cause.pretty(cause)
		});
	}));
	return { start: Effect.gen(function* () {
		const inputQueue = yield* Queue.unbounded();
		yield* Effect.addFinalizer(() => Queue.shutdown(inputQueue).pipe(Effect.asVoid));
		yield* Effect.forkScoped(Effect.forever(Queue.take(inputQueue).pipe(Effect.flatMap(processInputSafely))));
		yield* Effect.forkScoped(Stream.runForEach(providerService.streamEvents, (event) => Queue.offer(inputQueue, {
			source: "runtime",
			event
		}).pipe(Effect.asVoid)));
		yield* Effect.forkScoped(Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
			if (event.type !== "thread.turn-start-requested") return Effect.void;
			return Queue.offer(inputQueue, {
				source: "domain",
				event
			}).pipe(Effect.asVoid);
		}));
	}) };
});
const ProviderRuntimeIngestionLive = Layer.effect(ProviderRuntimeIngestionService, make);

//#endregion
//#region src/provider/Services/CodexAdapter.ts
/**
* CodexAdapter - Codex implementation of the generic provider adapter contract.
*
* This service owns Codex app-server process / JSON-RPC semantics and emits
* Codex provider events. It does not perform cross-provider routing, shared
* event fan-out, or checkpoint orchestration.
*
* Uses Effect `ServiceMap.Service` for dependency injection and returns the
* shared provider-adapter error channel with `provider: "codex"` context.
*
* @module CodexAdapter
*/
/**
* CodexAdapter - Service tag for Codex provider adapter operations.
*/
var CodexAdapter = class extends ServiceMap.Service()("t3/provider/Services/CodexAdapter") {};

//#endregion
//#region ../../packages/shared/src/model.ts
const MODEL_SLUG_SET_BY_PROVIDER = { codex: new Set(MODEL_OPTIONS_BY_PROVIDER.codex.map((option) => option.slug)) };
function normalizeModelSlug(model, provider = "codex") {
	if (typeof model !== "string") return null;
	const trimmed = model.trim();
	if (!trimmed) return null;
	const aliased = MODEL_SLUG_ALIASES_BY_PROVIDER[provider][trimmed];
	return typeof aliased === "string" ? aliased : trimmed;
}

//#endregion
//#region src/codexAppServerManager.ts
const ANSI_ESCAPE_CHAR = String.fromCharCode(27);
const ANSI_ESCAPE_REGEX = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, "g");
const CODEX_STDERR_LOG_REGEX = /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\S+:\s+(.*)$/;
const BENIGN_ERROR_LOG_SNIPPETS = ["state db missing rollout path for thread", "state db record_discrepancy: find_thread_path_by_id_str_in_subdir, falling_back"];
const RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS = [
	"not found",
	"missing thread",
	"no such thread",
	"unknown thread",
	"does not exist"
];
const CODEX_DEFAULT_MODEL = "gpt-5.3-codex";
const CODEX_SPARK_MODEL = "gpt-5.3-codex-spark";
const CODEX_SPARK_DISABLED_PLAN_TYPES = new Set([
	"free",
	"go",
	"plus"
]);
function asObject$1(value) {
	if (!value || typeof value !== "object") return;
	return value;
}
function asString$1(value) {
	return typeof value === "string" ? value : void 0;
}
function readCodexAccountSnapshot(response) {
	const record = asObject$1(response);
	const account = asObject$1(record?.account) ?? record;
	const accountType = asString$1(account?.type);
	if (accountType === "apiKey") return {
		type: "apiKey",
		planType: null,
		sparkEnabled: true
	};
	if (accountType === "chatgpt") {
		const planType = account?.planType ?? "unknown";
		return {
			type: "chatgpt",
			planType,
			sparkEnabled: !CODEX_SPARK_DISABLED_PLAN_TYPES.has(planType)
		};
	}
	return {
		type: "unknown",
		planType: null,
		sparkEnabled: true
	};
}
const CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Plan Mode (Conversational)

You work in 3 phases, and you should *chat your way* to a great plan before finalizing it. A great plan is very detailed-intent- and implementation-wise-so that it can be handed to another engineer or agent to be implemented right away. It must be **decision complete**, where the implementer does not need to make any decisions.

## Mode rules (strict)

You are in **Plan Mode** until a developer message explicitly ends it.

Plan Mode is not changed by user intent, tone, or imperative language. If a user asks for execution while still in Plan Mode, treat it as a request to **plan the execution**, not perform it.

## Plan Mode vs update_plan tool

Plan Mode is a collaboration mode that can involve requesting user input and eventually issuing a \`<proposed_plan>\` block.

Separately, \`update_plan\` is a checklist/progress/TODOs tool; it does not enter or exit Plan Mode. Do not confuse it with Plan mode or try to use it while in Plan mode. If you try to use \`update_plan\` in Plan mode, it will return an error.

## Execution vs. mutation in Plan Mode

You may explore and execute **non-mutating** actions that improve the plan. You must not perform **mutating** actions.

### Allowed (non-mutating, plan-improving)

Actions that gather truth, reduce ambiguity, or validate feasibility without changing repo-tracked state. Examples:

* Reading or searching files, configs, schemas, types, manifests, and docs
* Static analysis, inspection, and repo exploration
* Dry-run style commands when they do not edit repo-tracked files
* Tests, builds, or checks that may write to caches or build artifacts (for example, \`target/\`, \`.cache/\`, or snapshots) so long as they do not edit repo-tracked files

### Not allowed (mutating, plan-executing)

Actions that implement the plan or change repo-tracked state. Examples:

* Editing or writing files
* Running formatters or linters that rewrite files
* Applying patches, migrations, or codegen that updates repo-tracked files
* Side-effectful commands whose purpose is to carry out the plan rather than refine it

When in doubt: if the action would reasonably be described as "doing the work" rather than "planning the work," do not do it.

## PHASE 1 - Ground in the environment (explore first, ask second)

Begin by grounding yourself in the actual environment. Eliminate unknowns in the prompt by discovering facts, not by asking the user. Resolve all questions that can be answered through exploration or inspection. Identify missing or ambiguous details only if they cannot be derived from the environment. Silent exploration between turns is allowed and encouraged.

Before asking the user any question, perform at least one targeted non-mutating exploration pass (for example: search relevant files, inspect likely entrypoints/configs, confirm current implementation shape), unless no local environment/repo is available.

Exception: you may ask clarifying questions about the user's prompt before exploring, ONLY if there are obvious ambiguities or contradictions in the prompt itself. However, if ambiguity might be resolved by exploring, always prefer exploring first.

Do not ask questions that can be answered from the repo or system (for example, "where is this struct?" or "which UI component should we use?" when exploration can make it clear). Only ask once you have exhausted reasonable non-mutating exploration.

## PHASE 2 - Intent chat (what they actually want)

* Keep asking until you can clearly state: goal + success criteria, audience, in/out of scope, constraints, current state, and the key preferences/tradeoffs.
* Bias toward questions over guessing: if any high-impact ambiguity remains, do NOT plan yet-ask.

## PHASE 3 - Implementation chat (what/how we'll build)

* Once intent is stable, keep asking until the spec is decision complete: approach, interfaces (APIs/schemas/I/O), data flow, edge cases/failure modes, testing + acceptance criteria, rollout/monitoring, and any migrations/compat constraints.

## Asking questions

Critical rules:

* Strongly prefer using the \`request_user_input\` tool to ask any questions.
* Offer only meaningful multiple-choice options; don't include filler choices that are obviously wrong or irrelevant.
* In rare cases where an unavoidable, important question can't be expressed with reasonable multiple-choice options (due to extreme ambiguity), you may ask it directly without the tool.

You SHOULD ask many questions, but each question must:

* materially change the spec/plan, OR
* confirm/lock an assumption, OR
* choose between meaningful tradeoffs.
* not be answerable by non-mutating commands.

Use the \`request_user_input\` tool only for decisions that materially change the plan, for confirming important assumptions, or for information that cannot be discovered via non-mutating exploration.

## Two kinds of unknowns (treat differently)

1. **Discoverable facts** (repo/system truth): explore first.

   * Before asking, run targeted searches and check likely sources of truth (configs/manifests/entrypoints/schemas/types/constants).
   * Ask only if: multiple plausible candidates; nothing found but you need a missing identifier/context; or ambiguity is actually product intent.
   * If asking, present concrete candidates (paths/service names) + recommend one.
   * Never ask questions you can answer from your environment (e.g., "where is this struct").

2. **Preferences/tradeoffs** (not discoverable): ask early.

   * These are intent or implementation preferences that cannot be derived from exploration.
   * Provide 2-4 mutually exclusive options + a recommended default.
   * If unanswered, proceed with the recommended option and record it as an assumption in the final plan.

## Finalization rule

Only output the final plan when it is decision complete and leaves no decisions to the implementer.

When you present the official plan, wrap it in a \`<proposed_plan>\` block so the client can render it specially:

1) The opening tag must be on its own line.
2) Start the plan content on the next line (no text on the same line as the tag).
3) The closing tag must be on its own line.
4) Use Markdown inside the block.
5) Keep the tags exactly as \`<proposed_plan>\` and \`</proposed_plan>\` (do not translate or rename them), even if the plan content is in another language.

Example:

<proposed_plan>
plan content
</proposed_plan>

plan content should be human and agent digestible. The final plan must be plan-only and include:

* A clear title
* A brief summary section
* Important changes or additions to public APIs/interfaces/types
* Test cases and scenarios
* Explicit assumptions and defaults chosen where needed

Do not ask "should I proceed?" in the final output. The user can easily switch out of Plan mode and request implementation if you have included a \`<proposed_plan>\` block in your response. Alternatively, they can decide to stay in Plan mode and continue refining the plan.

Only produce at most one \`<proposed_plan>\` block per turn, and only when you are presenting a complete spec.
</collaboration_mode>`;
const CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Collaboration Mode: Default

You are now in Default mode. Any previous instructions for other modes (e.g. Plan mode) are no longer active.

Your active mode changes only when new developer instructions with a different \`<collaboration_mode>...</collaboration_mode>\` change it; user requests or tool descriptions do not change mode by themselves. Known mode names are Default and Plan.

## request_user_input availability

The \`request_user_input\` tool is unavailable in Default mode. If you call it while in Default mode, it will return an error.

In Default mode, strongly prefer making reasonable assumptions and executing the user's request rather than stopping to ask questions. If you absolutely must ask a question because the answer cannot be discovered from local context and a reasonable assumption would be risky, ask the user directly with a concise plain-text question. Never write a multiple choice question as a textual assistant message.
</collaboration_mode>`;
function mapCodexRuntimeMode(runtimeMode) {
	if (runtimeMode === "approval-required") return {
		approvalPolicy: "on-request",
		sandbox: "workspace-write"
	};
	return {
		approvalPolicy: "never",
		sandbox: "danger-full-access"
	};
}
function resolveCodexModelForAccount(model, account) {
	if (model !== CODEX_SPARK_MODEL || account.sparkEnabled) return model;
	return CODEX_DEFAULT_MODEL;
}
/**
* On Windows with `shell: true`, `child.kill()` only terminates the `cmd.exe`
* wrapper, leaving the actual command running. Use `taskkill /T` to kill the
* entire process tree instead.
*/
function killChildTree(child) {
	if (process.platform === "win32" && child.pid !== void 0) try {
		spawnSync("taskkill", [
			"/pid",
			String(child.pid),
			"/T",
			"/F"
		], { stdio: "ignore" });
		return;
	} catch {}
	child.kill();
}
function normalizeCodexModelSlug(model, preferredId) {
	const normalized = normalizeModelSlug(model);
	if (!normalized) return;
	if (preferredId?.endsWith("-codex") && preferredId !== normalized) return preferredId;
	return normalized;
}
function buildCodexInitializeParams() {
	return {
		clientInfo: {
			name: "t3code_desktop",
			title: "T3 Code Desktop",
			version: "0.1.0"
		},
		capabilities: { experimentalApi: true }
	};
}
function buildCodexCollaborationMode(input) {
	if (input.interactionMode === void 0) return;
	const model = normalizeCodexModelSlug(input.model) ?? "gpt-5.3-codex";
	return {
		mode: input.interactionMode,
		settings: {
			model,
			reasoning_effort: input.effort ?? "medium",
			developer_instructions: input.interactionMode === "plan" ? CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS : CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS
		}
	};
}
function toCodexUserInputAnswer(value) {
	if (typeof value === "string") return { answers: [value] };
	if (Array.isArray(value)) return { answers: value.filter((entry) => typeof entry === "string") };
	if (value && typeof value === "object") {
		const maybeAnswers = value.answers;
		if (Array.isArray(maybeAnswers)) return { answers: maybeAnswers.filter((entry) => typeof entry === "string") };
	}
	throw new Error("User input answers must be strings or arrays of strings.");
}
function toCodexUserInputAnswers(answers) {
	return Object.fromEntries(Object.entries(answers).map(([questionId, value]) => [questionId, toCodexUserInputAnswer(value)]));
}
function classifyCodexStderrLine(rawLine) {
	const line = rawLine.replaceAll(ANSI_ESCAPE_REGEX, "").trim();
	if (!line) return null;
	const match = line.match(CODEX_STDERR_LOG_REGEX);
	if (match) {
		const level = match[1];
		if (level && level !== "ERROR") return null;
		if (BENIGN_ERROR_LOG_SNIPPETS.some((snippet) => line.includes(snippet))) return null;
	}
	return { message: line };
}
function isRecoverableThreadResumeError(error) {
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
	if (!message.includes("thread/resume")) return false;
	return RECOVERABLE_THREAD_RESUME_ERROR_SNIPPETS.some((snippet) => message.includes(snippet));
}
var CodexAppServerManager = class extends EventEmitter {
	sessions = /* @__PURE__ */ new Map();
	runPromise;
	constructor(services) {
		super();
		this.runPromise = services ? Effect.runPromiseWith(services) : Effect.runPromise;
	}
	async startSession(input) {
		const threadId = input.threadId;
		const now = (/* @__PURE__ */ new Date()).toISOString();
		let context;
		try {
			const resolvedCwd = input.cwd ?? process.cwd();
			const session = {
				provider: "codex",
				status: "connecting",
				runtimeMode: input.runtimeMode,
				model: normalizeCodexModelSlug(input.model),
				cwd: resolvedCwd,
				threadId,
				createdAt: now,
				updatedAt: now
			};
			const codexOptions = readCodexProviderOptions(input);
			const codexBinaryPath = codexOptions.binaryPath ?? "codex";
			const codexHomePath = codexOptions.homePath;
			const child = spawn(codexBinaryPath, ["app-server"], {
				cwd: resolvedCwd,
				env: {
					...process.env,
					...codexHomePath ? { CODEX_HOME: codexHomePath } : {}
				},
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				shell: process.platform === "win32"
			});
			context = {
				session,
				account: {
					type: "unknown",
					planType: null,
					sparkEnabled: true
				},
				child,
				output: readline.createInterface({ input: child.stdout }),
				pending: /* @__PURE__ */ new Map(),
				pendingApprovals: /* @__PURE__ */ new Map(),
				pendingUserInputs: /* @__PURE__ */ new Map(),
				nextRequestId: 1,
				stopping: false
			};
			this.sessions.set(threadId, context);
			this.attachProcessListeners(context);
			this.emitLifecycleEvent(context, "session/connecting", "Starting codex app-server");
			await this.sendRequest(context, "initialize", buildCodexInitializeParams());
			this.writeMessage(context, { method: "initialized" });
			try {
				const modelListResponse = await this.sendRequest(context, "model/list", {});
				console.log("codex model/list response", modelListResponse);
			} catch (error) {
				console.log("codex model/list failed", error);
			}
			try {
				const accountReadResponse = await this.sendRequest(context, "account/read", {});
				console.log("codex account/read response", accountReadResponse);
				context.account = readCodexAccountSnapshot(accountReadResponse);
				console.log("codex subscription status", {
					type: context.account.type,
					planType: context.account.planType,
					sparkEnabled: context.account.sparkEnabled
				});
			} catch (error) {
				console.log("codex account/read failed", error);
			}
			const normalizedModel = resolveCodexModelForAccount(normalizeCodexModelSlug(input.model), context.account);
			const sessionOverrides = {
				model: normalizedModel ?? null,
				...input.serviceTier !== void 0 ? { serviceTier: input.serviceTier } : {},
				cwd: input.cwd ?? null,
				...mapCodexRuntimeMode(input.runtimeMode ?? "full-access")
			};
			const threadStartParams = {
				...sessionOverrides,
				experimentalRawEvents: false
			};
			const resumeThreadId = readResumeThreadId(input);
			this.emitLifecycleEvent(context, "session/threadOpenRequested", resumeThreadId ? `Attempting to resume thread ${resumeThreadId}.` : "Starting a new Codex thread.");
			await Effect.logInfo("codex app-server opening thread", {
				threadId,
				requestedRuntimeMode: input.runtimeMode,
				requestedModel: normalizedModel ?? null,
				requestedCwd: resolvedCwd,
				resumeThreadId: resumeThreadId ?? null
			}).pipe(this.runPromise);
			let threadOpenMethod = "thread/start";
			let threadOpenResponse;
			if (resumeThreadId) try {
				threadOpenMethod = "thread/resume";
				threadOpenResponse = await this.sendRequest(context, "thread/resume", {
					...sessionOverrides,
					threadId: resumeThreadId
				});
			} catch (error) {
				if (!isRecoverableThreadResumeError(error)) {
					this.emitErrorEvent(context, "session/threadResumeFailed", error instanceof Error ? error.message : "Codex thread resume failed.");
					await Effect.logWarning("codex app-server thread resume failed", {
						threadId,
						requestedRuntimeMode: input.runtimeMode,
						resumeThreadId,
						recoverable: false,
						cause: error instanceof Error ? error.message : String(error)
					}).pipe(this.runPromise);
					throw error;
				}
				threadOpenMethod = "thread/start";
				this.emitLifecycleEvent(context, "session/threadResumeFallback", `Could not resume thread ${resumeThreadId}; started a new thread instead.`);
				await Effect.logWarning("codex app-server thread resume fell back to fresh start", {
					threadId,
					requestedRuntimeMode: input.runtimeMode,
					resumeThreadId,
					recoverable: true,
					cause: error instanceof Error ? error.message : String(error)
				}).pipe(this.runPromise);
				threadOpenResponse = await this.sendRequest(context, "thread/start", threadStartParams);
			}
			else {
				threadOpenMethod = "thread/start";
				threadOpenResponse = await this.sendRequest(context, "thread/start", threadStartParams);
			}
			const threadOpenRecord = this.readObject(threadOpenResponse);
			const threadIdRaw = this.readString(this.readObject(threadOpenRecord, "thread"), "id") ?? this.readString(threadOpenRecord, "threadId");
			if (!threadIdRaw) throw new Error(`${threadOpenMethod} response did not include a thread id.`);
			const providerThreadId = threadIdRaw;
			this.updateSession(context, {
				status: "ready",
				resumeCursor: { threadId: providerThreadId }
			});
			this.emitLifecycleEvent(context, "session/threadOpenResolved", `Codex ${threadOpenMethod} resolved.`);
			await Effect.logInfo("codex app-server thread open resolved", {
				threadId,
				threadOpenMethod,
				requestedResumeThreadId: resumeThreadId ?? null,
				resolvedThreadId: providerThreadId,
				requestedRuntimeMode: input.runtimeMode
			}).pipe(this.runPromise);
			this.emitLifecycleEvent(context, "session/ready", `Connected to thread ${providerThreadId}`);
			return { ...context.session };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to start Codex session.";
			if (context) {
				this.updateSession(context, {
					status: "error",
					lastError: message
				});
				this.emitErrorEvent(context, "session/startFailed", message);
				this.stopSession(threadId);
			} else this.emitEvent({
				id: EventId.makeUnsafe(randomUUID()),
				kind: "error",
				provider: "codex",
				threadId,
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				method: "session/startFailed",
				message
			});
			throw new Error(message, { cause: error });
		}
	}
	async sendTurn(input) {
		const context = this.requireSession(input.threadId);
		const turnInput = [];
		if (input.input) turnInput.push({
			type: "text",
			text: input.input,
			text_elements: []
		});
		for (const attachment of input.attachments ?? []) if (attachment.type === "image") turnInput.push({
			type: "image",
			url: attachment.url
		});
		if (turnInput.length === 0) throw new Error("Turn input must include text or attachments.");
		const providerThreadId = readResumeThreadId({
			threadId: context.session.threadId,
			runtimeMode: context.session.runtimeMode,
			resumeCursor: context.session.resumeCursor
		});
		if (!providerThreadId) throw new Error("Session is missing provider resume thread id.");
		const turnStartParams = {
			threadId: providerThreadId,
			input: turnInput
		};
		const normalizedModel = resolveCodexModelForAccount(normalizeCodexModelSlug(input.model ?? context.session.model), context.account);
		if (normalizedModel) turnStartParams.model = normalizedModel;
		if (input.serviceTier !== void 0) turnStartParams.serviceTier = input.serviceTier;
		if (input.effort) turnStartParams.effort = input.effort;
		const collaborationMode = buildCodexCollaborationMode({
			...input.interactionMode !== void 0 ? { interactionMode: input.interactionMode } : {},
			...normalizedModel !== void 0 ? { model: normalizedModel } : {},
			...input.effort !== void 0 ? { effort: input.effort } : {}
		});
		if (collaborationMode) {
			if (!turnStartParams.model) turnStartParams.model = collaborationMode.settings.model;
			turnStartParams.collaborationMode = collaborationMode;
		}
		const response = await this.sendRequest(context, "turn/start", turnStartParams);
		const turn = this.readObject(this.readObject(response), "turn");
		const turnIdRaw = this.readString(turn, "id");
		if (!turnIdRaw) throw new Error("turn/start response did not include a turn id.");
		const turnId = TurnId.makeUnsafe(turnIdRaw);
		this.updateSession(context, {
			status: "running",
			activeTurnId: turnId,
			...context.session.resumeCursor !== void 0 ? { resumeCursor: context.session.resumeCursor } : {}
		});
		return {
			threadId: context.session.threadId,
			turnId,
			...context.session.resumeCursor !== void 0 ? { resumeCursor: context.session.resumeCursor } : {}
		};
	}
	async interruptTurn(threadId, turnId) {
		const context = this.requireSession(threadId);
		const effectiveTurnId = turnId ?? context.session.activeTurnId;
		const providerThreadId = readResumeThreadId({
			threadId: context.session.threadId,
			runtimeMode: context.session.runtimeMode,
			resumeCursor: context.session.resumeCursor
		});
		if (!effectiveTurnId || !providerThreadId) return;
		await this.sendRequest(context, "turn/interrupt", {
			threadId: providerThreadId,
			turnId: effectiveTurnId
		});
	}
	async readThread(threadId) {
		const context = this.requireSession(threadId);
		const providerThreadId = readResumeThreadId({
			threadId: context.session.threadId,
			runtimeMode: context.session.runtimeMode,
			resumeCursor: context.session.resumeCursor
		});
		if (!providerThreadId) throw new Error("Session is missing a provider resume thread id.");
		const response = await this.sendRequest(context, "thread/read", {
			threadId: providerThreadId,
			includeTurns: true
		});
		return this.parseThreadSnapshot("thread/read", response);
	}
	async rollbackThread(threadId, numTurns) {
		const context = this.requireSession(threadId);
		const providerThreadId = readResumeThreadId({
			threadId: context.session.threadId,
			runtimeMode: context.session.runtimeMode,
			resumeCursor: context.session.resumeCursor
		});
		if (!providerThreadId) throw new Error("Session is missing a provider resume thread id.");
		if (!Number.isInteger(numTurns) || numTurns < 1) throw new Error("numTurns must be an integer >= 1.");
		const response = await this.sendRequest(context, "thread/rollback", {
			threadId: providerThreadId,
			numTurns
		});
		this.updateSession(context, {
			status: "ready",
			activeTurnId: void 0
		});
		return this.parseThreadSnapshot("thread/rollback", response);
	}
	async respondToRequest(threadId, requestId, decision) {
		const context = this.requireSession(threadId);
		const pendingRequest = context.pendingApprovals.get(requestId);
		if (!pendingRequest) throw new Error(`Unknown pending approval request: ${requestId}`);
		context.pendingApprovals.delete(requestId);
		this.writeMessage(context, {
			id: pendingRequest.jsonRpcId,
			result: { decision }
		});
		this.emitEvent({
			id: EventId.makeUnsafe(randomUUID()),
			kind: "notification",
			provider: "codex",
			threadId: context.session.threadId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			method: "item/requestApproval/decision",
			turnId: pendingRequest.turnId,
			itemId: pendingRequest.itemId,
			requestId: pendingRequest.requestId,
			requestKind: pendingRequest.requestKind,
			payload: {
				requestId: pendingRequest.requestId,
				requestKind: pendingRequest.requestKind,
				decision
			}
		});
	}
	async respondToUserInput(threadId, requestId, answers) {
		const context = this.requireSession(threadId);
		const pendingRequest = context.pendingUserInputs.get(requestId);
		if (!pendingRequest) throw new Error(`Unknown pending user input request: ${requestId}`);
		context.pendingUserInputs.delete(requestId);
		const codexAnswers = toCodexUserInputAnswers(answers);
		this.writeMessage(context, {
			id: pendingRequest.jsonRpcId,
			result: { answers: codexAnswers }
		});
		this.emitEvent({
			id: EventId.makeUnsafe(randomUUID()),
			kind: "notification",
			provider: "codex",
			threadId: context.session.threadId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			method: "item/tool/requestUserInput/answered",
			turnId: pendingRequest.turnId,
			itemId: pendingRequest.itemId,
			requestId: pendingRequest.requestId,
			payload: {
				requestId: pendingRequest.requestId,
				answers: codexAnswers
			}
		});
	}
	stopSession(threadId) {
		const context = this.sessions.get(threadId);
		if (!context) return;
		context.stopping = true;
		for (const pending of context.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(/* @__PURE__ */ new Error("Session stopped before request completed."));
		}
		context.pending.clear();
		context.pendingApprovals.clear();
		context.pendingUserInputs.clear();
		context.output.close();
		if (!context.child.killed) killChildTree(context.child);
		this.updateSession(context, {
			status: "closed",
			activeTurnId: void 0
		});
		this.emitLifecycleEvent(context, "session/closed", "Session stopped");
		this.sessions.delete(threadId);
	}
	listSessions() {
		return Array.from(this.sessions.values(), ({ session }) => ({ ...session }));
	}
	hasSession(threadId) {
		return this.sessions.has(threadId);
	}
	stopAll() {
		for (const threadId of this.sessions.keys()) this.stopSession(threadId);
	}
	requireSession(threadId) {
		const context = this.sessions.get(threadId);
		if (!context) throw new Error(`Unknown session for thread: ${threadId}`);
		if (context.session.status === "closed") throw new Error(`Session is closed for thread: ${threadId}`);
		return context;
	}
	attachProcessListeners(context) {
		context.output.on("line", (line) => {
			this.handleStdoutLine(context, line);
		});
		context.child.stderr.on("data", (chunk) => {
			const lines = chunk.toString().split(/\r?\n/g);
			for (const rawLine of lines) {
				const classified = classifyCodexStderrLine(rawLine);
				if (!classified) continue;
				this.emitErrorEvent(context, "process/stderr", classified.message);
			}
		});
		context.child.on("error", (error) => {
			const message = error.message || "codex app-server process errored.";
			this.updateSession(context, {
				status: "error",
				lastError: message
			});
			this.emitErrorEvent(context, "process/error", message);
		});
		context.child.on("exit", (code, signal) => {
			if (context.stopping) return;
			const message = `codex app-server exited (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
			this.updateSession(context, {
				status: "closed",
				activeTurnId: void 0,
				lastError: code === 0 ? context.session.lastError : message
			});
			this.emitLifecycleEvent(context, "session/exited", message);
			this.sessions.delete(context.session.threadId);
		});
	}
	handleStdoutLine(context, line) {
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch {
			this.emitErrorEvent(context, "protocol/parseError", "Received invalid JSON from codex app-server.");
			return;
		}
		if (!parsed || typeof parsed !== "object") {
			this.emitErrorEvent(context, "protocol/invalidMessage", "Received non-object protocol message.");
			return;
		}
		if (this.isServerRequest(parsed)) {
			this.handleServerRequest(context, parsed);
			return;
		}
		if (this.isServerNotification(parsed)) {
			this.handleServerNotification(context, parsed);
			return;
		}
		if (this.isResponse(parsed)) {
			this.handleResponse(context, parsed);
			return;
		}
		this.emitErrorEvent(context, "protocol/unrecognizedMessage", "Received protocol message in an unknown shape.");
	}
	handleServerNotification(context, notification) {
		const route = this.readRouteFields(notification.params);
		const textDelta = notification.method === "item/agentMessage/delta" ? this.readString(notification.params, "delta") : void 0;
		this.emitEvent({
			id: EventId.makeUnsafe(randomUUID()),
			kind: "notification",
			provider: "codex",
			threadId: context.session.threadId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			method: notification.method,
			turnId: route.turnId,
			itemId: route.itemId,
			textDelta,
			payload: notification.params
		});
		if (notification.method === "thread/started") {
			const providerThreadId = normalizeProviderThreadId(this.readString(this.readObject(notification.params)?.thread, "id"));
			if (providerThreadId) this.updateSession(context, { resumeCursor: { threadId: providerThreadId } });
			return;
		}
		if (notification.method === "turn/started") {
			const turnId = toTurnId(this.readString(this.readObject(notification.params)?.turn, "id"));
			this.updateSession(context, {
				status: "running",
				activeTurnId: turnId
			});
			return;
		}
		if (notification.method === "turn/completed") {
			const turn = this.readObject(notification.params, "turn");
			const status = this.readString(turn, "status");
			const errorMessage = this.readString(this.readObject(turn, "error"), "message");
			this.updateSession(context, {
				status: status === "failed" ? "error" : "ready",
				activeTurnId: void 0,
				lastError: errorMessage ?? context.session.lastError
			});
			return;
		}
		if (notification.method === "error") {
			const message = this.readString(this.readObject(notification.params)?.error, "message");
			const willRetry = this.readBoolean(notification.params, "willRetry");
			this.updateSession(context, {
				status: willRetry ? "running" : "error",
				lastError: message ?? context.session.lastError
			});
		}
	}
	handleServerRequest(context, request) {
		const route = this.readRouteFields(request.params);
		const requestKind = this.requestKindForMethod(request.method);
		let requestId;
		if (requestKind) {
			requestId = ApprovalRequestId.makeUnsafe(randomUUID());
			const pendingRequest = {
				requestId,
				jsonRpcId: request.id,
				method: requestKind === "command" ? "item/commandExecution/requestApproval" : requestKind === "file-read" ? "item/fileRead/requestApproval" : "item/fileChange/requestApproval",
				requestKind,
				threadId: context.session.threadId,
				...route.turnId ? { turnId: route.turnId } : {},
				...route.itemId ? { itemId: route.itemId } : {}
			};
			context.pendingApprovals.set(requestId, pendingRequest);
		}
		if (request.method === "item/tool/requestUserInput") {
			requestId = ApprovalRequestId.makeUnsafe(randomUUID());
			context.pendingUserInputs.set(requestId, {
				requestId,
				jsonRpcId: request.id,
				threadId: context.session.threadId,
				...route.turnId ? { turnId: route.turnId } : {},
				...route.itemId ? { itemId: route.itemId } : {}
			});
		}
		this.emitEvent({
			id: EventId.makeUnsafe(randomUUID()),
			kind: "request",
			provider: "codex",
			threadId: context.session.threadId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			method: request.method,
			turnId: route.turnId,
			itemId: route.itemId,
			requestId,
			requestKind,
			payload: request.params
		});
		if (requestKind) return;
		if (request.method === "item/tool/requestUserInput") return;
		this.writeMessage(context, {
			id: request.id,
			error: {
				code: -32601,
				message: `Unsupported server request: ${request.method}`
			}
		});
	}
	handleResponse(context, response) {
		const key = String(response.id);
		const pending = context.pending.get(key);
		if (!pending) return;
		clearTimeout(pending.timeout);
		context.pending.delete(key);
		if (response.error?.message) {
			pending.reject(/* @__PURE__ */ new Error(`${pending.method} failed: ${String(response.error.message)}`));
			return;
		}
		pending.resolve(response.result);
	}
	async sendRequest(context, method, params, timeoutMs = 2e4) {
		const id = context.nextRequestId;
		context.nextRequestId += 1;
		return await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				context.pending.delete(String(id));
				reject(/* @__PURE__ */ new Error(`Timed out waiting for ${method}.`));
			}, timeoutMs);
			context.pending.set(String(id), {
				method,
				timeout,
				resolve,
				reject
			});
			this.writeMessage(context, {
				method,
				id,
				params
			});
		});
	}
	writeMessage(context, message) {
		const encoded = JSON.stringify(message);
		if (!context.child.stdin.writable) throw new Error("Cannot write to codex app-server stdin.");
		context.child.stdin.write(`${encoded}\n`);
	}
	emitLifecycleEvent(context, method, message) {
		this.emitEvent({
			id: EventId.makeUnsafe(randomUUID()),
			kind: "session",
			provider: "codex",
			threadId: context.session.threadId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			method,
			message
		});
	}
	emitErrorEvent(context, method, message) {
		this.emitEvent({
			id: EventId.makeUnsafe(randomUUID()),
			kind: "error",
			provider: "codex",
			threadId: context.session.threadId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			method,
			message
		});
	}
	emitEvent(event) {
		this.emit("event", event);
	}
	updateSession(context, updates) {
		context.session = {
			...context.session,
			...updates,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	}
	requestKindForMethod(method) {
		if (method === "item/commandExecution/requestApproval") return "command";
		if (method === "item/fileRead/requestApproval") return "file-read";
		if (method === "item/fileChange/requestApproval") return "file-change";
	}
	parseThreadSnapshot(method, response) {
		const responseRecord = this.readObject(response);
		const thread = this.readObject(responseRecord, "thread");
		const threadIdRaw = this.readString(thread, "id") ?? this.readString(responseRecord, "threadId");
		if (!threadIdRaw) throw new Error(`${method} response did not include a thread id.`);
		return {
			threadId: threadIdRaw,
			turns: (this.readArray(thread, "turns") ?? this.readArray(responseRecord, "turns") ?? []).map((turnValue, index) => {
				const turn = this.readObject(turnValue);
				const turnIdRaw = this.readString(turn, "id") ?? `${threadIdRaw}:turn:${index + 1}`;
				return {
					id: TurnId.makeUnsafe(turnIdRaw),
					items: this.readArray(turn, "items") ?? []
				};
			})
		};
	}
	isServerRequest(value) {
		if (!value || typeof value !== "object") return false;
		const candidate = value;
		return typeof candidate.method === "string" && (typeof candidate.id === "string" || typeof candidate.id === "number");
	}
	isServerNotification(value) {
		if (!value || typeof value !== "object") return false;
		const candidate = value;
		return typeof candidate.method === "string" && !("id" in candidate);
	}
	isResponse(value) {
		if (!value || typeof value !== "object") return false;
		const candidate = value;
		const hasId = typeof candidate.id === "string" || typeof candidate.id === "number";
		const hasMethod = typeof candidate.method === "string";
		return hasId && !hasMethod;
	}
	readRouteFields(params) {
		const route = {};
		const turnId = toTurnId(this.readString(params, "turnId") ?? this.readString(this.readObject(params, "turn"), "id"));
		const itemId = toProviderItemId(this.readString(params, "itemId") ?? this.readString(this.readObject(params, "item"), "id"));
		if (turnId) route.turnId = turnId;
		if (itemId) route.itemId = itemId;
		return route;
	}
	readObject(value, key) {
		const target = key === void 0 ? value : value && typeof value === "object" ? value[key] : void 0;
		if (!target || typeof target !== "object") return;
		return target;
	}
	readArray(value, key) {
		const target = key === void 0 ? value : value && typeof value === "object" ? value[key] : void 0;
		return Array.isArray(target) ? target : void 0;
	}
	readString(value, key) {
		if (!value || typeof value !== "object") return;
		const candidate = value[key];
		return typeof candidate === "string" ? candidate : void 0;
	}
	readBoolean(value, key) {
		if (!value || typeof value !== "object") return;
		const candidate = value[key];
		return typeof candidate === "boolean" ? candidate : void 0;
	}
};
function brandIfNonEmpty(value, maker) {
	const normalized = value?.trim();
	return normalized?.length ? maker(normalized) : void 0;
}
function normalizeProviderThreadId(value) {
	return brandIfNonEmpty(value, (normalized) => normalized);
}
function readCodexProviderOptions(input) {
	const options = input.providerOptions?.codex;
	if (!options) return {};
	return {
		...options.binaryPath ? { binaryPath: options.binaryPath } : {},
		...options.homePath ? { homePath: options.homePath } : {}
	};
}
function readResumeCursorThreadId(resumeCursor) {
	if (!resumeCursor || typeof resumeCursor !== "object" || Array.isArray(resumeCursor)) return;
	const rawThreadId = resumeCursor.threadId;
	return typeof rawThreadId === "string" ? normalizeProviderThreadId(rawThreadId) : void 0;
}
function readResumeThreadId(input) {
	return readResumeCursorThreadId(input.resumeCursor);
}
function toTurnId(value) {
	return brandIfNonEmpty(value, TurnId.makeUnsafe);
}
function toProviderItemId(value) {
	return brandIfNonEmpty(value, ProviderItemId.makeUnsafe);
}

//#endregion
//#region ../../packages/shared/src/logging.ts
var RotatingFileSink = class {
	filePath;
	maxBytes;
	maxFiles;
	throwOnError;
	currentSize = 0;
	constructor(options) {
		if (options.maxBytes < 1) throw new Error(`maxBytes must be >= 1 (received ${options.maxBytes})`);
		if (options.maxFiles < 1) throw new Error(`maxFiles must be >= 1 (received ${options.maxFiles})`);
		this.filePath = options.filePath;
		this.maxBytes = options.maxBytes;
		this.maxFiles = options.maxFiles;
		this.throwOnError = options.throwOnError ?? false;
		fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
		this.pruneOverflowBackups();
		this.currentSize = this.readCurrentSize();
	}
	write(chunk) {
		const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		if (buffer.length === 0) return;
		try {
			if (this.currentSize > 0 && this.currentSize + buffer.length > this.maxBytes) this.rotate();
			fs.appendFileSync(this.filePath, buffer);
			this.currentSize += buffer.length;
			if (this.currentSize > this.maxBytes) this.rotate();
		} catch {
			this.currentSize = this.readCurrentSize();
			if (this.throwOnError) throw new Error(`Failed to write log chunk to ${this.filePath}`);
		}
	}
	rotate() {
		try {
			const oldest = this.withSuffix(this.maxFiles);
			if (fs.existsSync(oldest)) fs.rmSync(oldest, { force: true });
			for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
				const source = this.withSuffix(index);
				const target = this.withSuffix(index + 1);
				if (fs.existsSync(source)) fs.renameSync(source, target);
			}
			if (fs.existsSync(this.filePath)) fs.renameSync(this.filePath, this.withSuffix(1));
			this.currentSize = 0;
		} catch {
			this.currentSize = this.readCurrentSize();
			if (this.throwOnError) throw new Error(`Failed to rotate log file ${this.filePath}`);
		}
	}
	pruneOverflowBackups() {
		try {
			const dir = path.dirname(this.filePath);
			const baseName = path.basename(this.filePath);
			for (const entry of fs.readdirSync(dir)) {
				if (!entry.startsWith(`${baseName}.`)) continue;
				const suffix = Number(entry.slice(baseName.length + 1));
				if (!Number.isInteger(suffix) || suffix <= this.maxFiles) continue;
				fs.rmSync(path.join(dir, entry), { force: true });
			}
		} catch {
			if (this.throwOnError) throw new Error(`Failed to prune log backups for ${this.filePath}`);
		}
	}
	readCurrentSize() {
		try {
			return fs.statSync(this.filePath).size;
		} catch {
			return 0;
		}
	}
	withSuffix(index) {
		return `${this.filePath}.${index}`;
	}
};

//#endregion
//#region src/provider/Layers/EventNdjsonLogger.ts
/**
* Provider event logger helper.
*
* Best-effort writer for observability logs. Each record is formatted as a
* single effect-style text line in a thread-scoped file. Failures are
* downgraded to warnings so provider runtime behavior is unaffected.
*/
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 10;
const DEFAULT_BATCH_WINDOW_MS = 200;
const GLOBAL_THREAD_SEGMENT = "_global";
const LOG_SCOPE = "provider-observability";
function logWarning(message, context) {
	return Effect.logWarning(message, context).pipe(Effect.annotateLogs({ scope: LOG_SCOPE }));
}
function resolveThreadSegment(raw) {
	return (typeof raw === "string" ? toSafeThreadAttachmentSegment(raw) : null) ?? GLOBAL_THREAD_SEGMENT;
}
function formatLoggerMessage(message) {
	if (Array.isArray(message)) return message.map((part) => typeof part === "string" ? part : String(part)).join(" ");
	return typeof message === "string" ? message : String(message);
}
function makeLineLogger(streamLabel) {
	return Logger.make(({ date, message }) => `[${date.toISOString()}] ${streamLabel}: ${formatLoggerMessage(message)}\n`);
}
function resolveStreamLabel(stream) {
	switch (stream) {
		case "native": return "NTIVE";
		default: return "CANON";
	}
}
function toLogMessage(event) {
	return Effect.gen(function* () {
		const serialized = yield* Effect.sync(() => {
			try {
				return {
					ok: true,
					value: JSON.stringify(event)
				};
			} catch (error) {
				return {
					ok: false,
					error
				};
			}
		});
		if (!serialized.ok) {
			yield* logWarning("failed to serialize provider event log record", { error: serialized.error });
			return;
		}
		if (typeof serialized.value !== "string") return;
		return serialized.value;
	});
}
function makeThreadWriter(input) {
	return Effect.gen(function* () {
		const sinkResult = yield* Effect.sync(() => {
			try {
				return {
					ok: true,
					sink: new RotatingFileSink({
						filePath: input.filePath,
						maxBytes: input.maxBytes,
						maxFiles: input.maxFiles,
						throwOnError: true
					})
				};
			} catch (error) {
				return {
					ok: false,
					error
				};
			}
		});
		if (!sinkResult.ok) {
			yield* logWarning("failed to initialize provider thread log file", {
				filePath: input.filePath,
				error: sinkResult.error
			});
			return;
		}
		const sink = sinkResult.sink;
		const scope = yield* Scope.make();
		const lineLogger = makeLineLogger(input.streamLabel);
		const batchedLogger = yield* Logger.batched(lineLogger, {
			window: input.batchWindowMs,
			flush: (messages) => Effect.gen(function* () {
				const flushResult = yield* Effect.sync(() => {
					try {
						for (const message of messages) sink.write(message);
						return { ok: true };
					} catch (error) {
						return {
							ok: false,
							error
						};
					}
				});
				if (!flushResult.ok) yield* logWarning("provider event log batch flush failed", {
					filePath: input.filePath,
					error: flushResult.error
				});
			})
		}).pipe(Effect.provideService(Scope.Scope, scope));
		const loggerLayer = Logger.layer([batchedLogger], { mergeWithExisting: false });
		return {
			writeMessage(message) {
				return Effect.log(message).pipe(Effect.provide(loggerLayer));
			},
			close() {
				return Scope.close(scope, Exit.void);
			}
		};
	});
}
function makeEventNdjsonLogger(filePath, options) {
	return Effect.gen(function* () {
		const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
		const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
		const batchWindowMs = options.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS;
		const streamLabel = resolveStreamLabel(options.stream);
		const directoryReady = yield* Effect.sync(() => {
			try {
				fs.mkdirSync(path.dirname(filePath), { recursive: true });
				return true;
			} catch (error) {
				return {
					ok: false,
					error
				};
			}
		});
		if (directoryReady !== true) {
			yield* logWarning("failed to create provider event log directory", {
				filePath,
				error: directoryReady.error
			});
			return;
		}
		const threadWriters = /* @__PURE__ */ new Map();
		const failedSegments = /* @__PURE__ */ new Set();
		const resolveThreadWriter = (threadSegment) => Effect.gen(function* () {
			if (failedSegments.has(threadSegment)) return;
			const existing = threadWriters.get(threadSegment);
			if (existing) return existing;
			const writer = yield* makeThreadWriter({
				filePath: path.join(path.dirname(filePath), `${threadSegment}.log`),
				maxBytes,
				maxFiles,
				batchWindowMs,
				streamLabel
			});
			if (!writer) {
				failedSegments.add(threadSegment);
				return;
			}
			threadWriters.set(threadSegment, writer);
			return writer;
		});
		return {
			filePath,
			write(event, threadId) {
				return Effect.gen(function* () {
					const threadSegment = resolveThreadSegment(threadId);
					const message = yield* toLogMessage(event);
					if (!message) return;
					const writer = yield* resolveThreadWriter(threadSegment);
					if (!writer) return;
					yield* writer.writeMessage(message);
				});
			},
			close() {
				return Effect.gen(function* () {
					for (const writer of threadWriters.values()) yield* writer.close();
					threadWriters.clear();
				});
			}
		};
	});
}

//#endregion
//#region src/provider/Layers/CodexAdapter.ts
/**
* CodexAdapterLive - Scoped live implementation for the Codex provider adapter.
*
* Wraps `CodexAppServerManager` behind the `CodexAdapter` service contract and
* maps manager failures into the shared `ProviderAdapterError` algebra.
*
* @module CodexAdapterLive
*/
const PROVIDER = "codex";
function toMessage(cause, fallback) {
	if (cause instanceof Error && cause.message.length > 0) return cause.message;
	return fallback;
}
function toSessionError(threadId, cause) {
	const normalized = toMessage(cause, "").toLowerCase();
	if (normalized.includes("unknown session") || normalized.includes("unknown provider session")) return new ProviderAdapterSessionNotFoundError({
		provider: PROVIDER,
		threadId,
		cause
	});
	if (normalized.includes("session is closed")) return new ProviderAdapterSessionClosedError({
		provider: PROVIDER,
		threadId,
		cause
	});
}
function toRequestError(threadId, method, cause) {
	const sessionError = toSessionError(threadId, cause);
	if (sessionError) return sessionError;
	return new ProviderAdapterRequestError({
		provider: PROVIDER,
		method,
		detail: toMessage(cause, `${method} failed`),
		cause
	});
}
function asObject(value) {
	if (!value || typeof value !== "object") return;
	return value;
}
function asString(value) {
	return typeof value === "string" ? value : void 0;
}
function asArray(value) {
	return Array.isArray(value) ? value : void 0;
}
function asNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function toTurnStatus(value) {
	switch (value) {
		case "completed":
		case "failed":
		case "cancelled":
		case "interrupted": return value;
		default: return "completed";
	}
}
function normalizeItemType(raw) {
	const type = asString(raw);
	if (!type) return "item";
	return type.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._/-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function toCanonicalItemType(raw) {
	const type = normalizeItemType(raw);
	if (type.includes("user")) return "user_message";
	if (type.includes("agent message") || type.includes("assistant")) return "assistant_message";
	if (type.includes("reasoning") || type.includes("thought")) return "reasoning";
	if (type.includes("plan") || type.includes("todo")) return "plan";
	if (type.includes("command")) return "command_execution";
	if (type.includes("file change") || type.includes("patch") || type.includes("edit")) return "file_change";
	if (type.includes("mcp")) return "mcp_tool_call";
	if (type.includes("dynamic tool")) return "dynamic_tool_call";
	if (type.includes("collab")) return "collab_agent_tool_call";
	if (type.includes("web search")) return "web_search";
	if (type.includes("image")) return "image_view";
	if (type.includes("review entered")) return "review_entered";
	if (type.includes("review exited")) return "review_exited";
	if (type.includes("compact")) return "context_compaction";
	if (type.includes("error")) return "error";
	return "unknown";
}
function itemTitle(itemType) {
	switch (itemType) {
		case "assistant_message": return "Assistant message";
		case "user_message": return "User message";
		case "reasoning": return "Reasoning";
		case "plan": return "Plan";
		case "command_execution": return "Command run";
		case "file_change": return "File change";
		case "mcp_tool_call": return "MCP tool call";
		case "dynamic_tool_call": return "Tool call";
		case "web_search": return "Web search";
		case "image_view": return "Image view";
		case "error": return "Error";
		default: return;
	}
}
function itemDetail(item, payload) {
	const nestedResult = asObject(item.result);
	const candidates = [
		asString(item.command),
		asString(item.title),
		asString(item.summary),
		asString(item.text),
		asString(item.path),
		asString(item.prompt),
		asString(nestedResult?.command),
		asString(payload.command),
		asString(payload.message),
		asString(payload.prompt)
	];
	for (const candidate of candidates) {
		if (!candidate) continue;
		const trimmed = candidate.trim();
		if (trimmed.length === 0) continue;
		return trimmed;
	}
}
function toRequestTypeFromMethod(method) {
	switch (method) {
		case "item/commandExecution/requestApproval": return "command_execution_approval";
		case "item/fileRead/requestApproval": return "file_read_approval";
		case "item/fileChange/requestApproval": return "file_change_approval";
		case "applyPatchApproval": return "apply_patch_approval";
		case "execCommandApproval": return "exec_command_approval";
		case "item/tool/requestUserInput": return "tool_user_input";
		case "item/tool/call": return "dynamic_tool_call";
		case "account/chatgptAuthTokens/refresh": return "auth_tokens_refresh";
		default: return "unknown";
	}
}
function toRequestTypeFromKind(kind) {
	switch (kind) {
		case "command": return "command_execution_approval";
		case "file-read": return "file_read_approval";
		case "file-change": return "file_change_approval";
		default: return "unknown";
	}
}
function toRequestTypeFromResolvedPayload(payload) {
	const request = asObject(payload?.request);
	const method = asString(request?.method) ?? asString(payload?.method);
	if (method) return toRequestTypeFromMethod(method);
	const requestKind = asString(request?.kind) ?? asString(payload?.requestKind);
	if (requestKind) return toRequestTypeFromKind(requestKind);
	return "unknown";
}
function toCanonicalUserInputAnswers(answers) {
	if (!answers) return {};
	return Object.fromEntries(Object.entries(answers).flatMap(([questionId, value]) => {
		if (typeof value === "string") return [[questionId, value]];
		if (Array.isArray(value)) {
			const normalized = value.filter((entry) => typeof entry === "string");
			return [[questionId, normalized.length === 1 ? normalized[0] : normalized]];
		}
		const answerList = asArray(asObject(value)?.answers)?.filter((entry) => typeof entry === "string");
		if (!answerList) return [];
		return [[questionId, answerList.length === 1 ? answerList[0] : answerList]];
	}));
}
function toUserInputQuestions(payload) {
	const questions = asArray(payload?.questions);
	if (!questions) return;
	const parsedQuestions = questions.map((entry) => {
		const question = asObject(entry);
		if (!question) return void 0;
		const options = asArray(question.options)?.map((option) => {
			const optionRecord = asObject(option);
			if (!optionRecord) return void 0;
			const label = asString(optionRecord.label)?.trim();
			const description = asString(optionRecord.description)?.trim();
			if (!label || !description) return;
			return {
				label,
				description
			};
		}).filter((option) => option !== void 0);
		const id = asString(question.id)?.trim();
		const header = asString(question.header)?.trim();
		const prompt = asString(question.question)?.trim();
		if (!id || !header || !prompt || !options || options.length === 0) return;
		return {
			id,
			header,
			question: prompt,
			options
		};
	}).filter((question) => question !== void 0);
	return parsedQuestions.length > 0 ? parsedQuestions : void 0;
}
function toThreadState(value) {
	switch (value) {
		case "idle": return "idle";
		case "archived": return "archived";
		case "closed": return "closed";
		case "compacted": return "compacted";
		case "error":
		case "failed": return "error";
		default: return "active";
	}
}
function contentStreamKindFromMethod(method) {
	switch (method) {
		case "item/agentMessage/delta": return "assistant_text";
		case "item/reasoning/textDelta": return "reasoning_text";
		case "item/reasoning/summaryTextDelta": return "reasoning_summary_text";
		case "item/commandExecution/outputDelta": return "command_output";
		case "item/fileChange/outputDelta": return "file_change_output";
		default: return "assistant_text";
	}
}
const PROPOSED_PLAN_BLOCK_REGEX = /<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i;
function extractProposedPlanMarkdown(text) {
	const planMarkdown = (text ? PROPOSED_PLAN_BLOCK_REGEX.exec(text) : null)?.[1]?.trim();
	return planMarkdown && planMarkdown.length > 0 ? planMarkdown : void 0;
}
function asRuntimeItemId(itemId) {
	return RuntimeItemId.makeUnsafe(itemId);
}
function asRuntimeRequestId(requestId) {
	return RuntimeRequestId.makeUnsafe(requestId);
}
function asRuntimeTaskId(taskId) {
	return RuntimeTaskId.makeUnsafe(taskId);
}
function codexEventMessage(payload) {
	return asObject(payload?.msg);
}
function codexEventBase(event, canonicalThreadId) {
	const msg = codexEventMessage(asObject(event.payload));
	const turnId = asString(msg?.turn_id) ?? asString(msg?.turnId);
	const itemId = asString(msg?.item_id) ?? asString(msg?.itemId);
	const requestId = asString(msg?.request_id) ?? asString(msg?.requestId);
	const base = runtimeEventBase(event, canonicalThreadId);
	const providerRefs = base.providerRefs ? {
		...base.providerRefs,
		...turnId ? { providerTurnId: turnId } : {},
		...itemId ? { providerItemId: ProviderItemId.makeUnsafe(itemId) } : {},
		...requestId ? { providerRequestId: requestId } : {}
	} : {
		...turnId ? { providerTurnId: turnId } : {},
		...itemId ? { providerItemId: ProviderItemId.makeUnsafe(itemId) } : {},
		...requestId ? { providerRequestId: requestId } : {}
	};
	return {
		...base,
		...turnId ? { turnId: TurnId.makeUnsafe(turnId) } : {},
		...itemId ? { itemId: asRuntimeItemId(ProviderItemId.makeUnsafe(itemId)) } : {},
		...requestId ? { requestId: asRuntimeRequestId(requestId) } : {},
		...Object.keys(providerRefs).length > 0 ? { providerRefs } : {}
	};
}
function eventRawSource(event) {
	return event.kind === "request" ? "codex.app-server.request" : "codex.app-server.notification";
}
function providerRefsFromEvent(event) {
	const refs = {};
	if (event.turnId) refs.providerTurnId = event.turnId;
	if (event.itemId) refs.providerItemId = event.itemId;
	if (event.requestId) refs.providerRequestId = event.requestId;
	return Object.keys(refs).length > 0 ? refs : void 0;
}
function runtimeEventBase(event, canonicalThreadId) {
	const refs = providerRefsFromEvent(event);
	return {
		eventId: event.id,
		provider: event.provider,
		threadId: canonicalThreadId,
		createdAt: event.createdAt,
		...event.turnId ? { turnId: event.turnId } : {},
		...event.itemId ? { itemId: asRuntimeItemId(event.itemId) } : {},
		...event.requestId ? { requestId: asRuntimeRequestId(event.requestId) } : {},
		...refs ? { providerRefs: refs } : {},
		raw: {
			source: eventRawSource(event),
			method: event.method,
			payload: event.payload ?? {}
		}
	};
}
function mapItemLifecycle(event, canonicalThreadId, lifecycle) {
	const payload = asObject(event.payload);
	const source = asObject(payload?.item) ?? payload;
	if (!source) return;
	const itemType = toCanonicalItemType(source.type ?? source.kind);
	if (itemType === "unknown" && lifecycle !== "item.updated") return;
	const detail = itemDetail(source, payload ?? {});
	const status = lifecycle === "item.started" ? "inProgress" : lifecycle === "item.completed" ? "completed" : void 0;
	return {
		...runtimeEventBase(event, canonicalThreadId),
		type: lifecycle,
		payload: {
			itemType,
			...status ? { status } : {},
			...itemTitle(itemType) ? { title: itemTitle(itemType) } : {},
			...detail ? { detail } : {},
			...event.payload !== void 0 ? { data: event.payload } : {}
		}
	};
}
function mapToRuntimeEvents(event, canonicalThreadId) {
	const payload = asObject(event.payload);
	const turn = asObject(payload?.turn);
	if (event.kind === "error") {
		if (!event.message) return [];
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "runtime.error",
			payload: {
				message: event.message,
				class: "provider_error",
				...event.payload !== void 0 ? { detail: event.payload } : {}
			}
		}];
	}
	if (event.kind === "request") {
		if (event.method === "item/tool/requestUserInput") {
			const questions = toUserInputQuestions(payload);
			if (!questions) return [];
			return [{
				...runtimeEventBase(event, canonicalThreadId),
				type: "user-input.requested",
				payload: { questions }
			}];
		}
		const detail = asString(payload?.command) ?? asString(payload?.reason) ?? asString(payload?.prompt);
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "request.opened",
			payload: {
				requestType: toRequestTypeFromMethod(event.method),
				...detail ? { detail } : {},
				...event.payload !== void 0 ? { args: event.payload } : {}
			}
		}];
	}
	if (event.method === "item/requestApproval/decision" && event.requestId) {
		const decision = Schema.decodeUnknownSync(ProviderApprovalDecision)(payload?.decision);
		const requestType = event.requestKind !== void 0 ? toRequestTypeFromKind(event.requestKind) : toRequestTypeFromMethod(event.method);
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "request.resolved",
			payload: {
				requestType,
				...decision ? { decision } : {},
				...event.payload !== void 0 ? { resolution: event.payload } : {}
			}
		}];
	}
	if (event.method === "session/connecting") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "session.state.changed",
		payload: {
			state: "starting",
			...event.message ? { reason: event.message } : {}
		}
	}];
	if (event.method === "session/ready") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "session.state.changed",
		payload: {
			state: "ready",
			...event.message ? { reason: event.message } : {}
		}
	}];
	if (event.method === "session/started") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "session.started",
		payload: {
			...event.message ? { message: event.message } : {},
			...event.payload !== void 0 ? { resume: event.payload } : {}
		}
	}];
	if (event.method === "session/exited" || event.method === "session/closed") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "session.exited",
		payload: {
			...event.message ? { reason: event.message } : {},
			...event.method === "session/closed" ? { exitKind: "graceful" } : {}
		}
	}];
	if (event.method === "thread/started") {
		const providerThreadId = asString(asObject(payload?.thread)?.id) ?? asString(payload?.threadId);
		if (!providerThreadId) return [];
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "thread.started",
			payload: { providerThreadId }
		}];
	}
	if (event.method === "thread/status/changed" || event.method === "thread/archived" || event.method === "thread/unarchived" || event.method === "thread/closed" || event.method === "thread/compacted") return [{
		type: "thread.state.changed",
		...runtimeEventBase(event, canonicalThreadId),
		payload: {
			state: event.method === "thread/archived" ? "archived" : event.method === "thread/closed" ? "closed" : event.method === "thread/compacted" ? "compacted" : toThreadState(asObject(payload?.thread)?.state ?? payload?.state),
			...event.payload !== void 0 ? { detail: event.payload } : {}
		}
	}];
	if (event.method === "thread/name/updated") return [{
		type: "thread.metadata.updated",
		...runtimeEventBase(event, canonicalThreadId),
		payload: {
			...asString(payload?.threadName) ? { name: asString(payload?.threadName) } : {},
			...event.payload !== void 0 ? { metadata: asObject(event.payload) } : {}
		}
	}];
	if (event.method === "thread/tokenUsage/updated") return [{
		type: "thread.token-usage.updated",
		...runtimeEventBase(event, canonicalThreadId),
		payload: { usage: event.payload ?? {} }
	}];
	if (event.method === "turn/started") {
		const turnId = event.turnId;
		if (!turnId) return [];
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			turnId,
			type: "turn.started",
			payload: {
				...asString(turn?.model) ? { model: asString(turn?.model) } : {},
				...asString(turn?.effort) ? { effort: asString(turn?.effort) } : {}
			}
		}];
	}
	if (event.method === "turn/completed") {
		const errorMessage = asString(asObject(turn?.error)?.message);
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "turn.completed",
			payload: {
				state: toTurnStatus(turn?.status),
				...asString(turn?.stopReason) ? { stopReason: asString(turn?.stopReason) } : {},
				...turn?.usage !== void 0 ? { usage: turn.usage } : {},
				...asObject(turn?.modelUsage) ? { modelUsage: asObject(turn?.modelUsage) } : {},
				...asNumber(turn?.totalCostUsd) !== void 0 ? { totalCostUsd: asNumber(turn?.totalCostUsd) } : {},
				...errorMessage ? { errorMessage } : {}
			}
		}];
	}
	if (event.method === "turn/aborted") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "turn.aborted",
		payload: { reason: event.message ?? "Turn aborted" }
	}];
	if (event.method === "turn/plan/updated") {
		const steps = Array.isArray(payload?.plan) ? payload.plan : [];
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "turn.plan.updated",
			payload: {
				...asString(payload?.explanation) ? { explanation: asString(payload?.explanation) } : {},
				plan: steps.map((entry) => asObject(entry)).filter((entry) => entry !== void 0).map((entry) => ({
					step: asString(entry.step) ?? "step",
					status: entry.status === "completed" || entry.status === "inProgress" ? entry.status : "pending"
				}))
			}
		}];
	}
	if (event.method === "turn/diff/updated") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "turn.diff.updated",
		payload: { unifiedDiff: asString(payload?.unifiedDiff) ?? asString(payload?.diff) ?? asString(payload?.patch) ?? "" }
	}];
	if (event.method === "item/started") {
		const started = mapItemLifecycle(event, canonicalThreadId, "item.started");
		return started ? [started] : [];
	}
	if (event.method === "item/completed") {
		const payload = asObject(event.payload);
		const source = asObject(payload?.item) ?? payload;
		if (!source) return [];
		if ((source ? toCanonicalItemType(source.type ?? source.kind) : "unknown") === "plan") {
			const detail = itemDetail(source, payload ?? {});
			if (!detail) return [];
			return [{
				...runtimeEventBase(event, canonicalThreadId),
				type: "turn.proposed.completed",
				payload: { planMarkdown: detail }
			}];
		}
		const completed = mapItemLifecycle(event, canonicalThreadId, "item.completed");
		return completed ? [completed] : [];
	}
	if (event.method === "item/reasoning/summaryPartAdded" || event.method === "item/commandExecution/terminalInteraction") {
		const updated = mapItemLifecycle(event, canonicalThreadId, "item.updated");
		return updated ? [updated] : [];
	}
	if (event.method === "item/plan/delta") {
		const delta = event.textDelta ?? asString(payload?.delta) ?? asString(payload?.text) ?? asString(asObject(payload?.content)?.text);
		if (!delta || delta.length === 0) return [];
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "turn.proposed.delta",
			payload: { delta }
		}];
	}
	if (event.method === "item/agentMessage/delta" || event.method === "item/commandExecution/outputDelta" || event.method === "item/fileChange/outputDelta" || event.method === "item/reasoning/summaryTextDelta" || event.method === "item/reasoning/textDelta") {
		const delta = event.textDelta ?? asString(payload?.delta) ?? asString(payload?.text) ?? asString(asObject(payload?.content)?.text);
		if (!delta || delta.length === 0) return [];
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "content.delta",
			payload: {
				streamKind: contentStreamKindFromMethod(event.method),
				delta,
				...typeof payload?.contentIndex === "number" ? { contentIndex: payload.contentIndex } : {},
				...typeof payload?.summaryIndex === "number" ? { summaryIndex: payload.summaryIndex } : {}
			}
		}];
	}
	if (event.method === "item/mcpToolCall/progress") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "tool.progress",
		payload: {
			...asString(payload?.toolUseId) ? { toolUseId: asString(payload?.toolUseId) } : {},
			...asString(payload?.toolName) ? { toolName: asString(payload?.toolName) } : {},
			...asString(payload?.summary) ? { summary: asString(payload?.summary) } : {},
			...asNumber(payload?.elapsedSeconds) !== void 0 ? { elapsedSeconds: asNumber(payload?.elapsedSeconds) } : {}
		}
	}];
	if (event.method === "serverRequest/resolved") {
		const requestType = toRequestTypeFromResolvedPayload(payload) !== "unknown" ? toRequestTypeFromResolvedPayload(payload) : event.requestId && event.requestKind !== void 0 ? toRequestTypeFromKind(event.requestKind) : "unknown";
		return [{
			...runtimeEventBase(event, canonicalThreadId),
			type: "request.resolved",
			payload: {
				requestType,
				...event.payload !== void 0 ? { resolution: event.payload } : {}
			}
		}];
	}
	if (event.method === "item/tool/requestUserInput/answered") return [{
		...runtimeEventBase(event, canonicalThreadId),
		type: "user-input.resolved",
		payload: { answers: toCanonicalUserInputAnswers(asObject(event.payload)?.answers) }
	}];
	if (event.method === "codex/event/task_started") {
		const msg = codexEventMessage(payload);
		const taskId = asString(payload?.id) ?? asString(msg?.turn_id);
		if (!taskId) return [];
		return [{
			...codexEventBase(event, canonicalThreadId),
			type: "task.started",
			payload: {
				taskId: asRuntimeTaskId(taskId),
				...asString(msg?.collaboration_mode_kind) ? { taskType: asString(msg?.collaboration_mode_kind) } : {}
			}
		}];
	}
	if (event.method === "codex/event/task_complete") {
		const msg = codexEventMessage(payload);
		const taskId = asString(payload?.id) ?? asString(msg?.turn_id);
		const proposedPlanMarkdown = extractProposedPlanMarkdown(asString(msg?.last_agent_message));
		if (!taskId) {
			if (!proposedPlanMarkdown) return [];
			return [{
				...codexEventBase(event, canonicalThreadId),
				type: "turn.proposed.completed",
				payload: { planMarkdown: proposedPlanMarkdown }
			}];
		}
		const events = [{
			...codexEventBase(event, canonicalThreadId),
			type: "task.completed",
			payload: {
				taskId: asRuntimeTaskId(taskId),
				status: "completed",
				...asString(msg?.last_agent_message) ? { summary: asString(msg?.last_agent_message) } : {}
			}
		}];
		if (proposedPlanMarkdown) events.push({
			...codexEventBase(event, canonicalThreadId),
			type: "turn.proposed.completed",
			payload: { planMarkdown: proposedPlanMarkdown }
		});
		return events;
	}
	if (event.method === "codex/event/agent_reasoning") {
		const msg = codexEventMessage(payload);
		const taskId = asString(payload?.id);
		const description = asString(msg?.text);
		if (!taskId || !description) return [];
		return [{
			...codexEventBase(event, canonicalThreadId),
			type: "task.progress",
			payload: {
				taskId: asRuntimeTaskId(taskId),
				description
			}
		}];
	}
	if (event.method === "codex/event/reasoning_content_delta") {
		const msg = codexEventMessage(payload);
		const delta = asString(msg?.delta);
		if (!delta) return [];
		return [{
			...codexEventBase(event, canonicalThreadId),
			type: "content.delta",
			payload: {
				streamKind: asNumber(msg?.summary_index) !== void 0 ? "reasoning_summary_text" : "reasoning_text",
				delta,
				...asNumber(msg?.summary_index) !== void 0 ? { summaryIndex: asNumber(msg?.summary_index) } : {}
			}
		}];
	}
	if (event.method === "model/rerouted") return [{
		type: "model.rerouted",
		...runtimeEventBase(event, canonicalThreadId),
		payload: {
			fromModel: asString(payload?.fromModel) ?? "unknown",
			toModel: asString(payload?.toModel) ?? "unknown",
			reason: asString(payload?.reason) ?? "unknown"
		}
	}];
	if (event.method === "deprecationNotice") return [{
		type: "deprecation.notice",
		...runtimeEventBase(event, canonicalThreadId),
		payload: {
			summary: asString(payload?.summary) ?? "Deprecation notice",
			...asString(payload?.details) ? { details: asString(payload?.details) } : {}
		}
	}];
	if (event.method === "configWarning") return [{
		type: "config.warning",
		...runtimeEventBase(event, canonicalThreadId),
		payload: {
			summary: asString(payload?.summary) ?? "Configuration warning",
			...asString(payload?.details) ? { details: asString(payload?.details) } : {},
			...asString(payload?.path) ? { path: asString(payload?.path) } : {},
			...payload?.range !== void 0 ? { range: payload.range } : {}
		}
	}];
	if (event.method === "account/updated") return [{
		type: "account.updated",
		...runtimeEventBase(event, canonicalThreadId),
		payload: { account: event.payload ?? {} }
	}];
	if (event.method === "account/rateLimits/updated") return [{
		type: "account.rate-limits.updated",
		...runtimeEventBase(event, canonicalThreadId),
		payload: { rateLimits: event.payload ?? {} }
	}];
	if (event.method === "mcpServer/oauthLogin/completed") return [{
		type: "mcp.oauth.completed",
		...runtimeEventBase(event, canonicalThreadId),
		payload: {
			success: payload?.success === true,
			...asString(payload?.name) ? { name: asString(payload?.name) } : {},
			...asString(payload?.error) ? { error: asString(payload?.error) } : {}
		}
	}];
	if (event.method === "thread/realtime/started") {
		const realtimeSessionId = asString(payload?.realtimeSessionId);
		return [{
			type: "thread.realtime.started",
			...runtimeEventBase(event, canonicalThreadId),
			payload: { realtimeSessionId }
		}];
	}
	if (event.method === "thread/realtime/itemAdded") return [{
		type: "thread.realtime.item-added",
		...runtimeEventBase(event, canonicalThreadId),
		payload: { item: event.payload ?? {} }
	}];
	if (event.method === "thread/realtime/outputAudio/delta") return [{
		type: "thread.realtime.audio.delta",
		...runtimeEventBase(event, canonicalThreadId),
		payload: { audio: event.payload ?? {} }
	}];
	if (event.method === "thread/realtime/error") {
		const message = asString(payload?.message) ?? event.message ?? "Realtime error";
		return [{
			type: "thread.realtime.error",
			...runtimeEventBase(event, canonicalThreadId),
			payload: { message }
		}];
	}
	if (event.method === "thread/realtime/closed") return [{
		type: "thread.realtime.closed",
		...runtimeEventBase(event, canonicalThreadId),
		payload: { reason: event.message }
	}];
	if (event.method === "error") {
		const message = asString(asObject(payload?.error)?.message) ?? event.message ?? "Provider runtime error";
		return [{
			type: "runtime.error",
			...runtimeEventBase(event, canonicalThreadId),
			payload: {
				message,
				class: "provider_error",
				...event.payload !== void 0 ? { detail: event.payload } : {}
			}
		}];
	}
	if (event.method === "windows/worldWritableWarning") return [{
		type: "runtime.warning",
		...runtimeEventBase(event, canonicalThreadId),
		payload: {
			message: event.message ?? "Windows world-writable warning",
			...event.payload !== void 0 ? { detail: event.payload } : {}
		}
	}];
	if (event.method === "windowsSandbox/setupCompleted") {
		const success = asObject(event.payload)?.success;
		const successMessage = event.message ?? "Windows sandbox setup completed";
		const failureMessage = event.message ?? "Windows sandbox setup failed";
		return [{
			type: "session.state.changed",
			...runtimeEventBase(event, canonicalThreadId),
			payload: {
				state: success === false ? "error" : "ready",
				reason: success === false ? failureMessage : successMessage,
				...event.payload !== void 0 ? { detail: event.payload } : {}
			}
		}, ...success === false ? [{
			type: "runtime.warning",
			...runtimeEventBase(event, canonicalThreadId),
			payload: {
				message: failureMessage,
				...event.payload !== void 0 ? { detail: event.payload } : {}
			}
		}] : []];
	}
	return [];
}
const makeCodexAdapter = (options) => Effect.gen(function* () {
	const fileSystem = yield* FileSystem.FileSystem;
	const serverConfig = yield* Effect.service(ServerConfig$1);
	const nativeEventLogger = options?.nativeEventLogger ?? (options?.nativeEventLogPath !== void 0 ? yield* makeEventNdjsonLogger(options.nativeEventLogPath, { stream: "native" }) : void 0);
	const manager = yield* Effect.acquireRelease(Effect.gen(function* () {
		if (options?.manager) return options.manager;
		const services = yield* Effect.services();
		return options?.makeManager?.(services) ?? new CodexAppServerManager(services);
	}), (manager) => Effect.sync(() => {
		try {
			manager.stopAll();
		} catch {}
	}));
	const startSession = (input) => {
		if (input.provider !== void 0 && input.provider !== PROVIDER) return Effect.fail(new ProviderAdapterValidationError({
			provider: PROVIDER,
			operation: "startSession",
			issue: `Expected provider '${PROVIDER}' but received '${input.provider}'.`
		}));
		const managerInput = {
			threadId: input.threadId,
			provider: "codex",
			...input.cwd !== void 0 ? { cwd: input.cwd } : {},
			...input.resumeCursor !== void 0 ? { resumeCursor: input.resumeCursor } : {},
			...input.providerOptions !== void 0 ? { providerOptions: input.providerOptions } : {},
			runtimeMode: input.runtimeMode,
			...input.model !== void 0 ? { model: input.model } : {},
			...input.modelOptions?.codex?.fastMode ? { serviceTier: "fast" } : {}
		};
		return Effect.tryPromise({
			try: () => manager.startSession(managerInput),
			catch: (cause) => new ProviderAdapterProcessError({
				provider: PROVIDER,
				threadId: input.threadId,
				detail: toMessage(cause, "Failed to start Codex adapter session."),
				cause
			})
		}).pipe(Effect.map((session) => session));
	};
	const sendTurn = (input) => Effect.gen(function* () {
		const codexAttachments = yield* Effect.forEach(input.attachments ?? [], (attachment) => Effect.gen(function* () {
			const attachmentPath = resolveAttachmentPath({
				stateDir: serverConfig.stateDir,
				attachment
			});
			if (!attachmentPath) return yield* toRequestError(input.threadId, "turn/start", /* @__PURE__ */ new Error(`Invalid attachment id '${attachment.id}'.`));
			const bytes = yield* fileSystem.readFile(attachmentPath).pipe(Effect.mapError((cause) => toRequestError(input.threadId, "turn/start", cause)));
			return {
				type: "image",
				url: `data:${attachment.mimeType};base64,${Buffer.from(bytes).toString("base64")}`
			};
		}), { concurrency: 1 });
		return yield* Effect.tryPromise({
			try: () => {
				const managerInput = {
					threadId: input.threadId,
					...input.input !== void 0 ? { input: input.input } : {},
					...input.model !== void 0 ? { model: input.model } : {},
					...input.serviceTier !== void 0 ? { serviceTier: input.serviceTier } : {},
					...input.modelOptions?.codex?.reasoningEffort !== void 0 ? { effort: input.modelOptions.codex.reasoningEffort } : {},
					...input.modelOptions?.codex?.fastMode ? { serviceTier: "fast" } : {},
					...input.interactionMode !== void 0 ? { interactionMode: input.interactionMode } : {},
					...codexAttachments.length > 0 ? { attachments: codexAttachments } : {}
				};
				return manager.sendTurn(managerInput);
			},
			catch: (cause) => toRequestError(input.threadId, "turn/start", cause)
		}).pipe(Effect.map((result) => ({
			...result,
			threadId: input.threadId
		})));
	});
	const interruptTurn = (threadId, turnId) => Effect.tryPromise({
		try: () => manager.interruptTurn(threadId, turnId),
		catch: (cause) => toRequestError(threadId, "turn/interrupt", cause)
	});
	const readThread = (threadId) => Effect.tryPromise({
		try: () => manager.readThread(threadId),
		catch: (cause) => toRequestError(threadId, "thread/read", cause)
	}).pipe(Effect.map((snapshot) => ({
		threadId,
		turns: snapshot.turns
	})));
	const rollbackThread = (threadId, numTurns) => {
		if (!Number.isInteger(numTurns) || numTurns < 1) return Effect.fail(new ProviderAdapterValidationError({
			provider: PROVIDER,
			operation: "rollbackThread",
			issue: "numTurns must be an integer >= 1."
		}));
		return Effect.tryPromise({
			try: () => manager.rollbackThread(threadId, numTurns),
			catch: (cause) => toRequestError(threadId, "thread/rollback", cause)
		}).pipe(Effect.map((snapshot) => ({
			threadId,
			turns: snapshot.turns
		})));
	};
	const respondToRequest = (threadId, requestId, decision) => Effect.tryPromise({
		try: () => manager.respondToRequest(threadId, requestId, decision),
		catch: (cause) => toRequestError(threadId, "item/requestApproval/decision", cause)
	});
	const respondToUserInput = (threadId, requestId, answers) => Effect.tryPromise({
		try: () => manager.respondToUserInput(threadId, requestId, answers),
		catch: (cause) => toRequestError(threadId, "item/tool/requestUserInput", cause)
	});
	const stopSession = (threadId) => Effect.sync(() => {
		manager.stopSession(threadId);
	});
	const listSessions = () => Effect.sync(() => manager.listSessions());
	const hasSession = (threadId) => Effect.sync(() => manager.hasSession(threadId));
	const stopAll = () => Effect.sync(() => {
		manager.stopAll();
	});
	const runtimeEventQueue = yield* Queue.unbounded();
	yield* Effect.acquireRelease(Effect.gen(function* () {
		const writeNativeEvent = (event) => Effect.gen(function* () {
			if (!nativeEventLogger) return;
			yield* nativeEventLogger.write(event, event.threadId);
		});
		const services = yield* Effect.services();
		const listener = (event) => Effect.gen(function* () {
			yield* writeNativeEvent(event);
			const runtimeEvents = mapToRuntimeEvents(event, event.threadId);
			if (runtimeEvents.length === 0) {
				yield* Effect.logDebug("ignoring unhandled Codex provider event", {
					method: event.method,
					threadId: event.threadId,
					turnId: event.turnId,
					itemId: event.itemId
				});
				return;
			}
			yield* Queue.offerAll(runtimeEventQueue, runtimeEvents);
		}).pipe(Effect.runPromiseWith(services));
		manager.on("event", listener);
		return listener;
	}), (listener) => Effect.gen(function* () {
		yield* Effect.sync(() => {
			manager.off("event", listener);
		});
		yield* Queue.shutdown(runtimeEventQueue);
	}));
	return {
		provider: PROVIDER,
		capabilities: { sessionModelSwitch: "in-session" },
		startSession,
		sendTurn,
		interruptTurn,
		readThread,
		rollbackThread,
		respondToRequest,
		respondToUserInput,
		stopSession,
		listSessions,
		hasSession,
		stopAll,
		streamEvents: Stream.fromQueue(runtimeEventQueue)
	};
});
const CodexAdapterLive = Layer.effect(CodexAdapter, makeCodexAdapter());
function makeCodexAdapterLive(options) {
	return Layer.effect(CodexAdapter, makeCodexAdapter(options));
}

//#endregion
//#region src/provider/Services/ProviderAdapterRegistry.ts
/**
* ProviderAdapterRegistry - Service tag for provider adapter lookup.
*/
var ProviderAdapterRegistry = class extends ServiceMap.Service()("t3/provider/Services/ProviderAdapterRegistry") {};

//#endregion
//#region src/provider/Layers/ProviderAdapterRegistry.ts
/**
* ProviderAdapterRegistryLive - In-memory provider adapter lookup layer.
*
* Binds provider kinds (codex/cursor/...) to concrete adapter services.
* This layer only performs adapter lookup; it does not route session-scoped
* calls or own provider lifecycle workflows.
*
* @module ProviderAdapterRegistryLive
*/
const makeProviderAdapterRegistry = (options) => Effect.gen(function* () {
	const adapters = options?.adapters !== void 0 ? options.adapters : [yield* CodexAdapter];
	const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
	const getByProvider = (provider) => {
		const adapter = byProvider.get(provider);
		if (!adapter) return Effect.fail(new ProviderUnsupportedError({ provider }));
		return Effect.succeed(adapter);
	};
	const listProviders = () => Effect.sync(() => Array.from(byProvider.keys()));
	return {
		getByProvider,
		listProviders
	};
});
const ProviderAdapterRegistryLive = Layer.effect(ProviderAdapterRegistry, makeProviderAdapterRegistry());

//#endregion
//#region src/provider/Services/ProviderSessionDirectory.ts
var ProviderSessionDirectory = class extends ServiceMap.Service()("t3/provider/Services/ProviderSessionDirectory") {};

//#endregion
//#region src/telemetry/Services/AnalyticsService.ts
/**
* AnalyticsService - Anonymous telemetry capture contract.
*
* Provides a best-effort event API for runtime telemetry and a strict
* `captureImmediate` method for call sites that need explicit error handling.
*
* @module AnalyticsService
*/
var AnalyticsService = class AnalyticsService extends ServiceMap.Service()("t3/telemetry/Services/AnalyticsService") {
	static layerTest = Layer.succeed(AnalyticsService, {
		record: () => Effect.void,
		flush: Effect.void
	});
};

//#endregion
//#region src/provider/Layers/ProviderService.ts
/**
* ProviderServiceLive - Cross-provider orchestration layer.
*
* Routes validated transport/API calls to provider adapters through
* `ProviderAdapterRegistry` and `ProviderSessionDirectory`, and exposes a
* unified provider event stream for subscribers.
*
* It does not implement provider protocol details (adapter concern).
*
* @module ProviderServiceLive
*/
const ProviderRollbackConversationInput = Schema.Struct({
	threadId: ThreadId,
	numTurns: NonNegativeInt
});
function toValidationError(operation, issue, cause) {
	return new ProviderValidationError({
		operation,
		issue,
		...cause !== void 0 ? { cause } : {}
	});
}
const decodeInputOrValidationError = (input) => Schema.decodeUnknownEffect(input.schema)(input.payload).pipe(Effect.mapError((schemaError) => new ProviderValidationError({
	operation: input.operation,
	issue: SchemaIssue.makeFormatterDefault()(schemaError.issue),
	cause: schemaError
})));
function toRuntimeStatus(session) {
	switch (session.status) {
		case "connecting": return "starting";
		case "error": return "error";
		case "closed": return "stopped";
		default: return "running";
	}
}
function toRuntimePayloadFromSession(session) {
	return {
		cwd: session.cwd ?? null,
		model: session.model ?? null,
		activeTurnId: session.activeTurnId ?? null,
		lastError: session.lastError ?? null
	};
}
function readPersistedCwd(runtimePayload) {
	if (!runtimePayload || typeof runtimePayload !== "object" || Array.isArray(runtimePayload)) return;
	const rawCwd = "cwd" in runtimePayload ? runtimePayload.cwd : void 0;
	if (typeof rawCwd !== "string") return void 0;
	const trimmed = rawCwd.trim();
	return trimmed.length > 0 ? trimmed : void 0;
}
const makeProviderService = (options) => Effect.gen(function* () {
	const analytics = yield* Effect.service(AnalyticsService);
	const canonicalEventLogger = options?.canonicalEventLogger ?? (options?.canonicalEventLogPath !== void 0 ? yield* makeEventNdjsonLogger(options.canonicalEventLogPath, { stream: "canonical" }) : void 0);
	const registry = yield* ProviderAdapterRegistry;
	const directory = yield* ProviderSessionDirectory;
	const runtimeEventQueue = yield* Queue.unbounded();
	const runtimeEventPubSub = yield* PubSub.unbounded();
	const publishRuntimeEvent = (event) => Effect.succeed(event).pipe(Effect.tap((canonicalEvent) => canonicalEventLogger ? canonicalEventLogger.write(canonicalEvent, null) : Effect.void), Effect.flatMap((canonicalEvent) => PubSub.publish(runtimeEventPubSub, canonicalEvent)), Effect.asVoid);
	const upsertSessionBinding = (session, threadId) => directory.upsert({
		threadId,
		provider: session.provider,
		runtimeMode: session.runtimeMode,
		status: toRuntimeStatus(session),
		...session.resumeCursor !== void 0 ? { resumeCursor: session.resumeCursor } : {},
		runtimePayload: toRuntimePayloadFromSession(session)
	});
	const providers = yield* registry.listProviders();
	const adapters = yield* Effect.forEach(providers, (provider) => registry.getByProvider(provider));
	const processRuntimeEvent = (event) => publishRuntimeEvent(event);
	const worker = Effect.forever(Queue.take(runtimeEventQueue).pipe(Effect.flatMap(processRuntimeEvent)));
	yield* Effect.forkScoped(worker);
	yield* Effect.forEach(adapters, (adapter) => Stream.runForEach(adapter.streamEvents, (event) => Queue.offer(runtimeEventQueue, event).pipe(Effect.asVoid)).pipe(Effect.forkScoped)).pipe(Effect.asVoid);
	const recoverSessionForThread = (input) => Effect.gen(function* () {
		const adapter = yield* registry.getByProvider(input.binding.provider);
		const hasResumeCursor = input.binding.resumeCursor !== null && input.binding.resumeCursor !== void 0;
		if (yield* adapter.hasSession(input.binding.threadId)) {
			const existing = (yield* adapter.listSessions()).find((session) => session.threadId === input.binding.threadId);
			if (existing) {
				yield* upsertSessionBinding(existing, input.binding.threadId);
				yield* analytics.record("provider.session.recovered", {
					provider: existing.provider,
					strategy: "adopt-existing",
					hasResumeCursor: existing.resumeCursor !== void 0
				});
				return {
					adapter,
					session: existing
				};
			}
		}
		if (!hasResumeCursor) return yield* toValidationError(input.operation, `Cannot recover thread '${input.binding.threadId}' because no provider resume state is persisted.`);
		const persistedCwd = readPersistedCwd(input.binding.runtimePayload);
		const resumed = yield* adapter.startSession({
			threadId: input.binding.threadId,
			provider: input.binding.provider,
			...persistedCwd ? { cwd: persistedCwd } : {},
			...hasResumeCursor ? { resumeCursor: input.binding.resumeCursor } : {},
			runtimeMode: input.binding.runtimeMode ?? "full-access"
		});
		if (resumed.provider !== adapter.provider) return yield* toValidationError(input.operation, `Adapter/provider mismatch while recovering thread '${input.binding.threadId}'. Expected '${adapter.provider}', received '${resumed.provider}'.`);
		yield* upsertSessionBinding(resumed, input.binding.threadId);
		yield* analytics.record("provider.session.recovered", {
			provider: resumed.provider,
			strategy: "resume-thread",
			hasResumeCursor: resumed.resumeCursor !== void 0
		});
		return {
			adapter,
			session: resumed
		};
	});
	const resolveRoutableSession = (input) => Effect.gen(function* () {
		const bindingOption = yield* directory.getBinding(input.threadId);
		const binding = Option.getOrUndefined(bindingOption);
		if (!binding) return yield* toValidationError(input.operation, `Cannot route thread '${input.threadId}' because no persisted provider binding exists.`);
		const adapter = yield* registry.getByProvider(binding.provider);
		if (yield* adapter.hasSession(input.threadId)) return {
			adapter,
			threadId: input.threadId,
			isActive: true
		};
		if (!input.allowRecovery) return {
			adapter,
			threadId: input.threadId,
			isActive: false
		};
		return {
			adapter: (yield* recoverSessionForThread({
				binding,
				operation: input.operation
			})).adapter,
			threadId: input.threadId,
			isActive: true
		};
	});
	const startSession = (threadId, rawInput) => Effect.gen(function* () {
		const parsed = yield* decodeInputOrValidationError({
			operation: "ProviderService.startSession",
			schema: ProviderSessionStartInput,
			payload: rawInput
		});
		const input = {
			...parsed,
			threadId,
			provider: parsed.provider ?? "codex"
		};
		const adapter = yield* registry.getByProvider(input.provider);
		const session = yield* adapter.startSession(input);
		if (session.provider !== adapter.provider) return yield* toValidationError("ProviderService.startSession", `Adapter/provider mismatch: requested '${adapter.provider}', received '${session.provider}'.`);
		yield* upsertSessionBinding(session, threadId);
		yield* analytics.record("provider.session.started", {
			provider: session.provider,
			runtimeMode: input.runtimeMode,
			hasResumeCursor: session.resumeCursor !== void 0,
			hasCwd: typeof input.cwd === "string" && input.cwd.trim().length > 0,
			hasModel: typeof input.model === "string" && input.model.trim().length > 0
		});
		return session;
	});
	const sendTurn = (rawInput) => Effect.gen(function* () {
		const parsed = yield* decodeInputOrValidationError({
			operation: "ProviderService.sendTurn",
			schema: ProviderSendTurnInput,
			payload: rawInput
		});
		const input = {
			...parsed,
			attachments: parsed.attachments ?? []
		};
		if (!input.input && input.attachments.length === 0) return yield* toValidationError("ProviderService.sendTurn", "Either input text or at least one attachment is required");
		const routed = yield* resolveRoutableSession({
			threadId: input.threadId,
			operation: "ProviderService.sendTurn",
			allowRecovery: true
		});
		const turn = yield* routed.adapter.sendTurn(input);
		yield* directory.upsert({
			threadId: input.threadId,
			provider: routed.adapter.provider,
			status: "running",
			...turn.resumeCursor !== void 0 ? { resumeCursor: turn.resumeCursor } : {},
			runtimePayload: {
				activeTurnId: turn.turnId,
				lastRuntimeEvent: "provider.sendTurn",
				lastRuntimeEventAt: (/* @__PURE__ */ new Date()).toISOString()
			}
		});
		yield* analytics.record("provider.turn.sent", {
			provider: routed.adapter.provider,
			model: input.model,
			interactionMode: input.interactionMode,
			attachmentCount: input.attachments.length,
			hasInput: typeof input.input === "string" && input.input.trim().length > 0
		});
		return turn;
	});
	const interruptTurn = (rawInput) => Effect.gen(function* () {
		const input = yield* decodeInputOrValidationError({
			operation: "ProviderService.interruptTurn",
			schema: ProviderInterruptTurnInput,
			payload: rawInput
		});
		const routed = yield* resolveRoutableSession({
			threadId: input.threadId,
			operation: "ProviderService.interruptTurn",
			allowRecovery: true
		});
		yield* routed.adapter.interruptTurn(routed.threadId, input.turnId);
		yield* analytics.record("provider.turn.interrupted", { provider: routed.adapter.provider });
	});
	const respondToRequest = (rawInput) => Effect.gen(function* () {
		const input = yield* decodeInputOrValidationError({
			operation: "ProviderService.respondToRequest",
			schema: ProviderRespondToRequestInput,
			payload: rawInput
		});
		const routed = yield* resolveRoutableSession({
			threadId: input.threadId,
			operation: "ProviderService.respondToRequest",
			allowRecovery: true
		});
		yield* routed.adapter.respondToRequest(routed.threadId, input.requestId, input.decision);
		yield* analytics.record("provider.request.responded", {
			provider: routed.adapter.provider,
			decision: input.decision
		});
	});
	const respondToUserInput = (rawInput) => Effect.gen(function* () {
		const input = yield* decodeInputOrValidationError({
			operation: "ProviderService.respondToUserInput",
			schema: ProviderRespondToUserInputInput,
			payload: rawInput
		});
		const routed = yield* resolveRoutableSession({
			threadId: input.threadId,
			operation: "ProviderService.respondToUserInput",
			allowRecovery: true
		});
		yield* routed.adapter.respondToUserInput(routed.threadId, input.requestId, input.answers);
	});
	const stopSession = (rawInput) => Effect.gen(function* () {
		const input = yield* decodeInputOrValidationError({
			operation: "ProviderService.stopSession",
			schema: ProviderStopSessionInput,
			payload: rawInput
		});
		const routed = yield* resolveRoutableSession({
			threadId: input.threadId,
			operation: "ProviderService.stopSession",
			allowRecovery: false
		});
		if (routed.isActive) yield* routed.adapter.stopSession(routed.threadId);
		yield* directory.remove(input.threadId);
		yield* analytics.record("provider.session.stopped", { provider: routed.adapter.provider });
	});
	const listSessions = () => Effect.gen(function* () {
		const activeSessions = (yield* Effect.forEach(adapters, (adapter) => adapter.listSessions())).flatMap((sessions) => sessions);
		const persistedBindings = yield* directory.listThreadIds().pipe(Effect.flatMap((threadIds) => Effect.forEach(threadIds, (threadId) => directory.getBinding(threadId).pipe(Effect.orElseSucceed(() => Option.none())), { concurrency: "unbounded" })), Effect.orElseSucceed(() => []));
		const bindingsByThreadId = /* @__PURE__ */ new Map();
		for (const bindingOption of persistedBindings) {
			const binding = Option.getOrUndefined(bindingOption);
			if (binding) bindingsByThreadId.set(binding.threadId, binding);
		}
		return activeSessions.map((session) => {
			const binding = bindingsByThreadId.get(session.threadId);
			if (!binding) return session;
			const overrides = {};
			if (session.resumeCursor === void 0 && binding.resumeCursor !== void 0) overrides.resumeCursor = binding.resumeCursor;
			if (binding.runtimeMode !== void 0) overrides.runtimeMode = binding.runtimeMode;
			return Object.assign({}, session, overrides);
		});
	});
	const getCapabilities = (provider) => registry.getByProvider(provider).pipe(Effect.map((adapter) => adapter.capabilities));
	const rollbackConversation = (rawInput) => Effect.gen(function* () {
		const input = yield* decodeInputOrValidationError({
			operation: "ProviderService.rollbackConversation",
			schema: ProviderRollbackConversationInput,
			payload: rawInput
		});
		if (input.numTurns === 0) return;
		const routed = yield* resolveRoutableSession({
			threadId: input.threadId,
			operation: "ProviderService.rollbackConversation",
			allowRecovery: true
		});
		yield* routed.adapter.rollbackThread(routed.threadId, input.numTurns);
		yield* analytics.record("provider.conversation.rolled_back", {
			provider: routed.adapter.provider,
			turns: input.numTurns
		});
	});
	const runStopAll = () => Effect.gen(function* () {
		const threadIds = yield* directory.listThreadIds();
		yield* Effect.forEach(adapters, (adapter) => adapter.stopAll()).pipe(Effect.asVoid);
		yield* Effect.forEach(threadIds, (threadId) => directory.getProvider(threadId).pipe(Effect.flatMap((provider) => directory.upsert({
			threadId,
			provider,
			status: "stopped",
			runtimePayload: {
				activeTurnId: null,
				lastRuntimeEvent: "provider.stopAll",
				lastRuntimeEventAt: (/* @__PURE__ */ new Date()).toISOString()
			}
		})))).pipe(Effect.asVoid);
		yield* analytics.record("provider.sessions.stopped_all", { sessionCount: threadIds.length });
		yield* analytics.flush;
	});
	yield* Effect.addFinalizer(() => Effect.catch(runStopAll(), (cause) => Effect.logWarning("failed to stop provider service", { cause })));
	return {
		startSession,
		sendTurn,
		interruptTurn,
		respondToRequest,
		respondToUserInput,
		stopSession,
		listSessions,
		getCapabilities,
		rollbackConversation,
		streamEvents: Stream.fromPubSub(runtimeEventPubSub)
	};
});
const ProviderServiceLive = Layer.effect(ProviderService, makeProviderService());
function makeProviderServiceLive(options) {
	return Layer.effect(ProviderService, makeProviderService(options));
}

//#endregion
//#region src/provider/Layers/ProviderSessionDirectory.ts
function toPersistenceError(operation) {
	return (cause) => new ProviderSessionDirectoryPersistenceError({
		operation,
		detail: `Failed to execute ${operation}.`,
		cause
	});
}
function decodeProviderKind(providerName, operation) {
	if (providerName === "codex") return Effect.succeed(providerName);
	return Effect.fail(new ProviderSessionDirectoryPersistenceError({
		operation,
		detail: `Unknown persisted provider '${providerName}'.`
	}));
}
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function mergeRuntimePayload(existing, next) {
	if (next === void 0) return existing ?? null;
	if (isRecord(existing) && isRecord(next)) return {
		...existing,
		...next
	};
	return next;
}
const makeProviderSessionDirectory = Effect.gen(function* () {
	const repository = yield* ProviderSessionRuntimeRepository;
	const getBinding = (threadId) => repository.getByThreadId({ threadId }).pipe(Effect.mapError(toPersistenceError("ProviderSessionDirectory.getBinding:getByThreadId")), Effect.flatMap((runtime) => Option.match(runtime, {
		onNone: () => Effect.succeed(Option.none()),
		onSome: (value) => decodeProviderKind(value.providerName, "ProviderSessionDirectory.getBinding").pipe(Effect.map((provider) => Option.some({
			threadId: value.threadId,
			provider,
			adapterKey: value.adapterKey,
			runtimeMode: value.runtimeMode,
			status: value.status,
			resumeCursor: value.resumeCursor,
			runtimePayload: value.runtimePayload
		})))
	})));
	const upsert = Effect.fn(function* (binding) {
		const existing = yield* repository.getByThreadId({ threadId: binding.threadId }).pipe(Effect.mapError(toPersistenceError("ProviderSessionDirectory.upsert:getByThreadId")));
		const existingRuntime = Option.getOrUndefined(existing);
		const resolvedThreadId = binding.threadId ?? existingRuntime?.threadId;
		if (!resolvedThreadId) return yield* new ProviderValidationError({
			operation: "ProviderSessionDirectory.upsert",
			issue: "threadId must be a non-empty string."
		});
		const now = (/* @__PURE__ */ new Date()).toISOString();
		const providerChanged = existingRuntime !== void 0 && existingRuntime.providerName !== binding.provider;
		yield* repository.upsert({
			threadId: resolvedThreadId,
			providerName: binding.provider,
			adapterKey: binding.adapterKey ?? (providerChanged ? binding.provider : existingRuntime?.adapterKey ?? binding.provider),
			runtimeMode: binding.runtimeMode ?? existingRuntime?.runtimeMode ?? "full-access",
			status: binding.status ?? existingRuntime?.status ?? "running",
			lastSeenAt: now,
			resumeCursor: binding.resumeCursor !== void 0 ? binding.resumeCursor : existingRuntime?.resumeCursor ?? null,
			runtimePayload: mergeRuntimePayload(existingRuntime?.runtimePayload ?? null, binding.runtimePayload)
		}).pipe(Effect.mapError(toPersistenceError("ProviderSessionDirectory.upsert:upsert")));
	});
	const getProvider = (threadId) => getBinding(threadId).pipe(Effect.flatMap((binding) => Option.match(binding, {
		onSome: (value) => Effect.succeed(value.provider),
		onNone: () => Effect.fail(new ProviderSessionDirectoryPersistenceError({
			operation: "ProviderSessionDirectory.getProvider",
			detail: `No persisted provider binding found for thread '${threadId}'.`
		}))
	})));
	const remove = (threadId) => repository.deleteByThreadId({ threadId }).pipe(Effect.mapError(toPersistenceError("ProviderSessionDirectory.remove:deleteByThreadId")));
	const listThreadIds = () => repository.list().pipe(Effect.mapError(toPersistenceError("ProviderSessionDirectory.listThreadIds:list")), Effect.map((rows) => rows.map((row) => row.threadId)));
	return {
		upsert,
		getProvider,
		getBinding,
		remove,
		listThreadIds
	};
});
const ProviderSessionDirectoryLive = Layer.effect(ProviderSessionDirectory, makeProviderSessionDirectory);

//#endregion
//#region src/logger.ts
const ANSI = {
	reset: "\x1B[0m",
	dim: "\x1B[2m",
	cyan: "\x1B[36m",
	yellow: "\x1B[33m",
	red: "\x1B[31m",
	magenta: "\x1B[35m"
};
const LEVEL_LABEL = {
	info: "INFO",
	warn: "WARN",
	error: "ERROR",
	event: "EVENT"
};
const LEVEL_COLOR = {
	info: ANSI.cyan,
	warn: ANSI.yellow,
	error: ANSI.red,
	event: ANSI.magenta
};
function useColors() {
	return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === void 0;
}
function colorize(value, color, enabled) {
	return enabled ? `${color}${value}${ANSI.reset}` : value;
}
function timeStamp() {
	return (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
}
function formatValue(value) {
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean" || value === null || value === void 0) return String(value);
	return util.inspect(value, {
		depth: 4,
		breakLength: Infinity,
		compact: true,
		maxArrayLength: 25,
		maxStringLength: 320
	});
}
function formatContext(context) {
	if (!context) return "";
	const entries = Object.entries(context).filter(([, value]) => value !== void 0);
	if (entries.length === 0) return "";
	return entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(" ");
}
function write(level, scope, message, context) {
	const colorEnabled = useColors();
	const ts = colorize(timeStamp(), ANSI.dim, colorEnabled);
	const levelLabel = colorize(LEVEL_LABEL[level], LEVEL_COLOR[level], colorEnabled);
	const contextText = formatContext(context);
	const line = `${ts} ${levelLabel} [${scope}] ${message}${contextText ? ` ${contextText}` : ""}`;
	if (level === "warn") {
		console.warn(line);
		return;
	}
	if (level === "error") {
		console.error(line);
		return;
	}
	console.log(line);
}
function createLogger(scope) {
	return {
		info(message, context) {
			write("info", scope, message, context);
		},
		warn(message, context) {
			write("warn", scope, message, context);
		},
		error(message, context) {
			write("error", scope, message, context);
		},
		event(message, context) {
			write("event", scope, message, context);
		}
	};
}

//#endregion
//#region src/terminal/Services/PTY.ts
/**
* PtyAdapter - Terminal PTY adapter service contract.
*
* Defines the process primitives required by terminal session management
* without binding to a specific PTY implementation.
*
* @module PtyAdapter
*/
/**
* PtyAdapter - Service tag for PTY process integration.
*/
var PtyAdapter = class extends ServiceMap.Service()("t3/terminal/Services/PTY/PtyAdapter") {};

//#endregion
//#region src/processRunner.ts
function commandLabel$1(command, args) {
	return [command, ...args].join(" ");
}
function normalizeSpawnError(command, args, error) {
	if (!(error instanceof Error)) return /* @__PURE__ */ new Error(`Failed to run ${commandLabel$1(command, args)}.`);
	if (error.code === "ENOENT") return /* @__PURE__ */ new Error(`Command not found: ${command}`);
	return /* @__PURE__ */ new Error(`Failed to run ${commandLabel$1(command, args)}: ${error.message}`);
}
function isWindowsCommandNotFound(code, stderr) {
	if (process.platform !== "win32") return false;
	if (code === 9009) return true;
	return /is not recognized as an internal or external command/i.test(stderr);
}
function normalizeExitError(command, args, result) {
	if (isWindowsCommandNotFound(result.code, result.stderr)) return /* @__PURE__ */ new Error(`Command not found: ${command}`);
	const reason = result.timedOut ? "timed out" : `failed (code=${result.code ?? "null"}, signal=${result.signal ?? "null"})`;
	const stderr = result.stderr.trim();
	const detail = stderr.length > 0 ? ` ${stderr}` : "";
	return /* @__PURE__ */ new Error(`${commandLabel$1(command, args)} ${reason}.${detail}`);
}
function normalizeStdinError(command, args, error) {
	if (!(error instanceof Error)) return /* @__PURE__ */ new Error(`Failed to write stdin for ${commandLabel$1(command, args)}.`);
	return /* @__PURE__ */ new Error(`Failed to write stdin for ${commandLabel$1(command, args)}: ${error.message}`);
}
function normalizeBufferError(command, args, stream, maxBufferBytes) {
	return /* @__PURE__ */ new Error(`${commandLabel$1(command, args)} exceeded ${stream} buffer limit (${maxBufferBytes} bytes).`);
}
const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
/**
* On Windows with `shell: true`, `child.kill()` only terminates the `cmd.exe`
* wrapper, leaving the actual command running. Use `taskkill /T` to kill the
* entire process tree instead.
*/
function killChild(child, signal = "SIGTERM") {
	if (process.platform === "win32" && child.pid !== void 0) try {
		spawnSync("taskkill", [
			"/pid",
			String(child.pid),
			"/T",
			"/F"
		], { stdio: "ignore" });
		return;
	} catch {}
	child.kill(signal);
}
function appendChunkWithinLimit(target, currentBytes, chunk, maxBytes) {
	const remaining = maxBytes - currentBytes;
	if (remaining <= 0) return {
		next: target,
		nextBytes: currentBytes,
		truncated: true
	};
	if (chunk.length <= remaining) return {
		next: `${target}${chunk.toString()}`,
		nextBytes: currentBytes + chunk.length,
		truncated: false
	};
	return {
		next: `${target}${chunk.subarray(0, remaining).toString()}`,
		nextBytes: currentBytes + remaining,
		truncated: true
	};
}
async function runProcess(command, args, options = {}) {
	const timeoutMs = options.timeoutMs ?? 6e4;
	const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
	const outputMode = options.outputMode ?? "error";
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env,
			stdio: "pipe",
			shell: process.platform === "win32"
		});
		let stdout = "";
		let stderr = "";
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let stdoutTruncated = false;
		let stderrTruncated = false;
		let timedOut = false;
		let settled = false;
		let forceKillTimer = null;
		const timeoutTimer = setTimeout(() => {
			timedOut = true;
			killChild(child, "SIGTERM");
			forceKillTimer = setTimeout(() => {
				killChild(child, "SIGKILL");
			}, 1e3);
		}, timeoutMs);
		const finalize = (callback) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutTimer);
			if (forceKillTimer) clearTimeout(forceKillTimer);
			callback();
		};
		const fail = (error) => {
			killChild(child, "SIGTERM");
			finalize(() => {
				reject(error);
			});
		};
		const appendOutput = (stream, chunk) => {
			const chunkBuffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
			const text = chunkBuffer.toString();
			const byteLength = chunkBuffer.length;
			if (stream === "stdout") {
				if (outputMode === "truncate") {
					const appended = appendChunkWithinLimit(stdout, stdoutBytes, chunkBuffer, maxBufferBytes);
					stdout = appended.next;
					stdoutBytes = appended.nextBytes;
					stdoutTruncated = stdoutTruncated || appended.truncated;
					return null;
				}
				stdout += text;
				stdoutBytes += byteLength;
				if (stdoutBytes > maxBufferBytes) return normalizeBufferError(command, args, "stdout", maxBufferBytes);
			} else {
				if (outputMode === "truncate") {
					const appended = appendChunkWithinLimit(stderr, stderrBytes, chunkBuffer, maxBufferBytes);
					stderr = appended.next;
					stderrBytes = appended.nextBytes;
					stderrTruncated = stderrTruncated || appended.truncated;
					return null;
				}
				stderr += text;
				stderrBytes += byteLength;
				if (stderrBytes > maxBufferBytes) return normalizeBufferError(command, args, "stderr", maxBufferBytes);
			}
			return null;
		};
		child.stdout.on("data", (chunk) => {
			const error = appendOutput("stdout", chunk);
			if (error) fail(error);
		});
		child.stderr.on("data", (chunk) => {
			const error = appendOutput("stderr", chunk);
			if (error) fail(error);
		});
		child.once("error", (error) => {
			finalize(() => {
				reject(normalizeSpawnError(command, args, error));
			});
		});
		child.once("close", (code, signal) => {
			const result = {
				stdout,
				stderr,
				code,
				signal,
				timedOut,
				stdoutTruncated,
				stderrTruncated
			};
			finalize(() => {
				if (!options.allowNonZeroExit && (timedOut || code !== null && code !== 0)) {
					reject(normalizeExitError(command, args, result));
					return;
				}
				resolve(result);
			});
		});
		child.stdin.once("error", (error) => {
			fail(normalizeStdinError(command, args, error));
		});
		if (options.stdin !== void 0) {
			child.stdin.write(options.stdin, (error) => {
				if (error) {
					fail(normalizeStdinError(command, args, error));
					return;
				}
				child.stdin.end();
			});
			return;
		}
		child.stdin.end();
	});
}

//#endregion
//#region src/terminal/Services/Manager.ts
var TerminalError = class extends Schema.TaggedErrorClass()("TerminalError", {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {};
/**
* TerminalManager - Service tag for terminal session orchestration.
*/
var TerminalManager = class extends ServiceMap.Service()("t3/terminal/Services/Manager/TerminalManager") {};

//#endregion
//#region src/terminal/Layers/Manager.ts
const DEFAULT_HISTORY_LINE_LIMIT = 5e3;
const DEFAULT_PERSIST_DEBOUNCE_MS = 40;
const DEFAULT_SUBPROCESS_POLL_INTERVAL_MS = 1e3;
const DEFAULT_PROCESS_KILL_GRACE_MS = 1e3;
const DEFAULT_MAX_RETAINED_INACTIVE_SESSIONS = 128;
const DEFAULT_OPEN_COLS = 120;
const DEFAULT_OPEN_ROWS = 30;
const TERMINAL_ENV_BLOCKLIST = new Set([
	"PORT",
	"ELECTRON_RENDERER_PORT",
	"ELECTRON_RUN_AS_NODE"
]);
const decodeTerminalOpenInput = Schema.decodeUnknownSync(TerminalOpenInput);
const decodeTerminalWriteInput = Schema.decodeUnknownSync(TerminalWriteInput);
const decodeTerminalResizeInput = Schema.decodeUnknownSync(TerminalResizeInput);
const decodeTerminalClearInput = Schema.decodeUnknownSync(TerminalClearInput);
const decodeTerminalCloseInput = Schema.decodeUnknownSync(TerminalCloseInput);
function defaultShellResolver() {
	if (process.platform === "win32") return process.env.ComSpec ?? "cmd.exe";
	return process.env.SHELL ?? "bash";
}
function normalizeShellCommand(value) {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	if (process.platform === "win32") return trimmed;
	const firstToken = trimmed.split(/\s+/g)[0]?.trim();
	if (!firstToken) return null;
	return firstToken.replace(/^['"]|['"]$/g, "");
}
function shellCandidateFromCommand(command) {
	if (!command || command.length === 0) return null;
	const shellName = path.basename(command).toLowerCase();
	if (process.platform !== "win32" && shellName === "zsh") return {
		shell: command,
		args: ["-o", "nopromptsp"]
	};
	return { shell: command };
}
function formatShellCandidate(candidate) {
	if (!candidate.args || candidate.args.length === 0) return candidate.shell;
	return `${candidate.shell} ${candidate.args.join(" ")}`;
}
function uniqueShellCandidates(candidates) {
	const seen = /* @__PURE__ */ new Set();
	const ordered = [];
	for (const candidate of candidates) {
		if (!candidate) continue;
		const key = formatShellCandidate(candidate);
		if (seen.has(key)) continue;
		seen.add(key);
		ordered.push(candidate);
	}
	return ordered;
}
function resolveShellCandidates(shellResolver) {
	const requested = shellCandidateFromCommand(normalizeShellCommand(shellResolver()));
	if (process.platform === "win32") return uniqueShellCandidates([
		requested,
		shellCandidateFromCommand(process.env.ComSpec ?? null),
		shellCandidateFromCommand("powershell.exe"),
		shellCandidateFromCommand("cmd.exe")
	]);
	return uniqueShellCandidates([
		requested,
		shellCandidateFromCommand(normalizeShellCommand(process.env.SHELL)),
		shellCandidateFromCommand("/bin/zsh"),
		shellCandidateFromCommand("/bin/bash"),
		shellCandidateFromCommand("/bin/sh"),
		shellCandidateFromCommand("zsh"),
		shellCandidateFromCommand("bash"),
		shellCandidateFromCommand("sh")
	]);
}
function isRetryableShellSpawnError(error) {
	const queue = [error];
	const seen = /* @__PURE__ */ new Set();
	const messages = [];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current)) continue;
		seen.add(current);
		if (typeof current === "string") {
			messages.push(current);
			continue;
		}
		if (current instanceof Error) {
			messages.push(current.message);
			const cause = current.cause;
			if (cause) queue.push(cause);
			continue;
		}
		if (typeof current === "object") {
			const value = current;
			if (typeof value.message === "string") messages.push(value.message);
			if (value.cause) queue.push(value.cause);
		}
	}
	const message = messages.join(" ").toLowerCase();
	return message.includes("posix_spawnp failed") || message.includes("enoent") || message.includes("not found") || message.includes("file not found") || message.includes("no such file");
}
async function checkWindowsSubprocessActivity(terminalPid) {
	const command = [
		`$children = Get-CimInstance Win32_Process -Filter "ParentProcessId = ${terminalPid}" -ErrorAction SilentlyContinue`,
		"if ($children) { exit 0 }",
		"exit 1"
	].join("; ");
	try {
		return (await runProcess("powershell.exe", [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			command
		], {
			timeoutMs: 1500,
			allowNonZeroExit: true,
			maxBufferBytes: 32768,
			outputMode: "truncate"
		})).code === 0;
	} catch {
		return false;
	}
}
async function checkPosixSubprocessActivity(terminalPid) {
	try {
		const pgrepResult = await runProcess("pgrep", ["-P", String(terminalPid)], {
			timeoutMs: 1e3,
			allowNonZeroExit: true,
			maxBufferBytes: 32768,
			outputMode: "truncate"
		});
		if (pgrepResult.code === 0) return pgrepResult.stdout.trim().length > 0;
		if (pgrepResult.code === 1) return false;
	} catch {}
	try {
		const psResult = await runProcess("ps", ["-eo", "pid=,ppid="], {
			timeoutMs: 1e3,
			allowNonZeroExit: true,
			maxBufferBytes: 262144,
			outputMode: "truncate"
		});
		if (psResult.code !== 0) return false;
		for (const line of psResult.stdout.split(/\r?\n/g)) {
			const [pidRaw, ppidRaw] = line.trim().split(/\s+/g);
			const pid = Number(pidRaw);
			const ppid = Number(ppidRaw);
			if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
			if (ppid === terminalPid) return true;
		}
		return false;
	} catch {
		return false;
	}
}
async function defaultSubprocessChecker(terminalPid) {
	if (!Number.isInteger(terminalPid) || terminalPid <= 0) return false;
	if (process.platform === "win32") return checkWindowsSubprocessActivity(terminalPid);
	return checkPosixSubprocessActivity(terminalPid);
}
function capHistory(history, maxLines) {
	if (history.length === 0) return history;
	const hasTrailingNewline = history.endsWith("\n");
	const lines = history.split("\n");
	if (hasTrailingNewline) lines.pop();
	if (lines.length <= maxLines) return history;
	const capped = lines.slice(lines.length - maxLines).join("\n");
	return hasTrailingNewline ? `${capped}\n` : capped;
}
function legacySafeThreadId(threadId) {
	return threadId.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function toSafeThreadId(threadId) {
	return `terminal_${Encoding.encodeBase64Url(threadId)}`;
}
function toSafeTerminalId(terminalId) {
	return Encoding.encodeBase64Url(terminalId);
}
function toSessionKey(threadId, terminalId) {
	return `${threadId}\u0000${terminalId}`;
}
function shouldExcludeTerminalEnvKey(key) {
	const normalizedKey = key.toUpperCase();
	if (normalizedKey.startsWith("T3CODE_")) return true;
	if (normalizedKey.startsWith("VITE_")) return true;
	return TERMINAL_ENV_BLOCKLIST.has(normalizedKey);
}
function createTerminalSpawnEnv(baseEnv, runtimeEnv) {
	const spawnEnv = {};
	for (const [key, value] of Object.entries(baseEnv)) {
		if (value === void 0) continue;
		if (shouldExcludeTerminalEnvKey(key)) continue;
		spawnEnv[key] = value;
	}
	if (runtimeEnv) for (const [key, value] of Object.entries(runtimeEnv)) spawnEnv[key] = value;
	return spawnEnv;
}
function normalizedRuntimeEnv(env) {
	if (!env) return null;
	const entries = Object.entries(env);
	if (entries.length === 0) return null;
	return Object.fromEntries(entries.toSorted(([left], [right]) => left.localeCompare(right)));
}
var TerminalManagerRuntime = class extends EventEmitter {
	sessions = /* @__PURE__ */ new Map();
	logsDir;
	historyLineLimit;
	ptyAdapter;
	shellResolver;
	persistQueues = /* @__PURE__ */ new Map();
	persistTimers = /* @__PURE__ */ new Map();
	pendingPersistHistory = /* @__PURE__ */ new Map();
	threadLocks = /* @__PURE__ */ new Map();
	persistDebounceMs;
	subprocessChecker;
	subprocessPollIntervalMs;
	processKillGraceMs;
	maxRetainedInactiveSessions;
	subprocessPollTimer = null;
	subprocessPollInFlight = false;
	killEscalationTimers = /* @__PURE__ */ new Map();
	logger = createLogger("terminal");
	constructor(options) {
		super();
		this.logsDir = options.logsDir ?? path.resolve(process.cwd(), ".logs", "terminals");
		this.historyLineLimit = options.historyLineLimit ?? DEFAULT_HISTORY_LINE_LIMIT;
		this.ptyAdapter = options.ptyAdapter;
		this.shellResolver = options.shellResolver ?? defaultShellResolver;
		this.persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS;
		this.subprocessChecker = options.subprocessChecker ?? defaultSubprocessChecker;
		this.subprocessPollIntervalMs = options.subprocessPollIntervalMs ?? DEFAULT_SUBPROCESS_POLL_INTERVAL_MS;
		this.processKillGraceMs = options.processKillGraceMs ?? DEFAULT_PROCESS_KILL_GRACE_MS;
		this.maxRetainedInactiveSessions = options.maxRetainedInactiveSessions ?? DEFAULT_MAX_RETAINED_INACTIVE_SESSIONS;
		fs.mkdirSync(this.logsDir, { recursive: true });
	}
	async open(raw) {
		const input = decodeTerminalOpenInput(raw);
		return this.runWithThreadLock(input.threadId, async () => {
			await this.assertValidCwd(input.cwd);
			const sessionKey = toSessionKey(input.threadId, input.terminalId);
			const existing = this.sessions.get(sessionKey);
			if (!existing) {
				await this.flushPersistQueue(input.threadId, input.terminalId);
				const history = await this.readHistory(input.threadId, input.terminalId);
				const cols = input.cols ?? DEFAULT_OPEN_COLS;
				const rows = input.rows ?? DEFAULT_OPEN_ROWS;
				const session = {
					threadId: input.threadId,
					terminalId: input.terminalId,
					cwd: input.cwd,
					status: "starting",
					pid: null,
					history,
					exitCode: null,
					exitSignal: null,
					updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
					cols,
					rows,
					process: null,
					unsubscribeData: null,
					unsubscribeExit: null,
					hasRunningSubprocess: false,
					runtimeEnv: normalizedRuntimeEnv(input.env)
				};
				this.sessions.set(sessionKey, session);
				this.evictInactiveSessionsIfNeeded();
				await this.startSession(session, {
					...input,
					cols,
					rows
				}, "started");
				return this.snapshot(session);
			}
			const nextRuntimeEnv = normalizedRuntimeEnv(input.env);
			const currentRuntimeEnv = existing.runtimeEnv;
			const targetCols = input.cols ?? existing.cols;
			const targetRows = input.rows ?? existing.rows;
			const runtimeEnvChanged = JSON.stringify(currentRuntimeEnv) !== JSON.stringify(nextRuntimeEnv);
			if (existing.cwd !== input.cwd || runtimeEnvChanged) {
				this.stopProcess(existing);
				existing.cwd = input.cwd;
				existing.runtimeEnv = nextRuntimeEnv;
				existing.history = "";
				await this.persistHistory(existing.threadId, existing.terminalId, existing.history);
			} else if (existing.status === "exited" || existing.status === "error") {
				existing.runtimeEnv = nextRuntimeEnv;
				existing.history = "";
				await this.persistHistory(existing.threadId, existing.terminalId, existing.history);
			} else if (currentRuntimeEnv !== nextRuntimeEnv) existing.runtimeEnv = nextRuntimeEnv;
			if (!existing.process) {
				await this.startSession(existing, {
					...input,
					cols: targetCols,
					rows: targetRows
				}, "started");
				return this.snapshot(existing);
			}
			if (existing.cols !== targetCols || existing.rows !== targetRows) {
				existing.cols = targetCols;
				existing.rows = targetRows;
				existing.process.resize(targetCols, targetRows);
				existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			}
			return this.snapshot(existing);
		});
	}
	async write(raw) {
		const input = decodeTerminalWriteInput(raw);
		const session = this.requireSession(input.threadId, input.terminalId);
		if (!session.process || session.status !== "running") {
			if (session.status === "exited") return;
			throw new Error(`Terminal is not running for thread: ${input.threadId}, terminal: ${input.terminalId}`);
		}
		session.process.write(input.data);
	}
	async resize(raw) {
		const input = decodeTerminalResizeInput(raw);
		const session = this.requireSession(input.threadId, input.terminalId);
		if (!session.process || session.status !== "running") throw new Error(`Terminal is not running for thread: ${input.threadId}, terminal: ${input.terminalId}`);
		session.cols = input.cols;
		session.rows = input.rows;
		session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		session.process.resize(input.cols, input.rows);
	}
	async clear(raw) {
		const input = decodeTerminalClearInput(raw);
		await this.runWithThreadLock(input.threadId, async () => {
			const session = this.requireSession(input.threadId, input.terminalId);
			session.history = "";
			session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			await this.persistHistory(input.threadId, input.terminalId, session.history);
			this.emitEvent({
				type: "cleared",
				threadId: input.threadId,
				terminalId: input.terminalId,
				createdAt: (/* @__PURE__ */ new Date()).toISOString()
			});
		});
	}
	async restart(raw) {
		const input = decodeTerminalOpenInput(raw);
		return this.runWithThreadLock(input.threadId, async () => {
			await this.assertValidCwd(input.cwd);
			const sessionKey = toSessionKey(input.threadId, input.terminalId);
			let session = this.sessions.get(sessionKey);
			if (!session) {
				const cols = input.cols ?? DEFAULT_OPEN_COLS;
				const rows = input.rows ?? DEFAULT_OPEN_ROWS;
				session = {
					threadId: input.threadId,
					terminalId: input.terminalId,
					cwd: input.cwd,
					status: "starting",
					pid: null,
					history: "",
					exitCode: null,
					exitSignal: null,
					updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
					cols,
					rows,
					process: null,
					unsubscribeData: null,
					unsubscribeExit: null,
					hasRunningSubprocess: false,
					runtimeEnv: normalizedRuntimeEnv(input.env)
				};
				this.sessions.set(sessionKey, session);
				this.evictInactiveSessionsIfNeeded();
			} else {
				this.stopProcess(session);
				session.cwd = input.cwd;
				session.runtimeEnv = normalizedRuntimeEnv(input.env);
			}
			const cols = input.cols ?? session.cols;
			const rows = input.rows ?? session.rows;
			session.history = "";
			await this.persistHistory(input.threadId, input.terminalId, session.history);
			await this.startSession(session, {
				...input,
				cols,
				rows
			}, "restarted");
			return this.snapshot(session);
		});
	}
	async close(raw) {
		const input = decodeTerminalCloseInput(raw);
		await this.runWithThreadLock(input.threadId, async () => {
			if (input.terminalId) {
				await this.closeSession(input.threadId, input.terminalId, input.deleteHistory === true);
				return;
			}
			const threadSessions = this.sessionsForThread(input.threadId);
			for (const session of threadSessions) {
				this.stopProcess(session);
				this.sessions.delete(toSessionKey(session.threadId, session.terminalId));
			}
			await Promise.all(threadSessions.map((session) => this.flushPersistQueue(session.threadId, session.terminalId)));
			if (input.deleteHistory) await this.deleteAllHistoryForThread(input.threadId);
			this.updateSubprocessPollingState();
		});
	}
	dispose() {
		this.stopSubprocessPolling();
		const sessions = [...this.sessions.values()];
		this.sessions.clear();
		for (const session of sessions) this.stopProcess(session);
		for (const timer of this.persistTimers.values()) clearTimeout(timer);
		this.persistTimers.clear();
		for (const timer of this.killEscalationTimers.values()) clearTimeout(timer);
		this.killEscalationTimers.clear();
		this.pendingPersistHistory.clear();
		this.threadLocks.clear();
		this.persistQueues.clear();
	}
	async startSession(session, input, eventType) {
		this.stopProcess(session);
		session.status = "starting";
		session.cwd = input.cwd;
		session.cols = input.cols;
		session.rows = input.rows;
		session.exitCode = null;
		session.exitSignal = null;
		session.hasRunningSubprocess = false;
		session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		let ptyProcess = null;
		let startedShell = null;
		try {
			const shellCandidates = resolveShellCandidates(this.shellResolver);
			const terminalEnv = createTerminalSpawnEnv(process.env, session.runtimeEnv);
			let lastSpawnError = null;
			const spawnWithCandidate = (candidate) => Effect.runPromise(this.ptyAdapter.spawn({
				shell: candidate.shell,
				...candidate.args ? { args: candidate.args } : {},
				cwd: session.cwd,
				cols: session.cols,
				rows: session.rows,
				env: terminalEnv
			}));
			const trySpawn = async (candidates, index = 0) => {
				if (index >= candidates.length) return null;
				const candidate = candidates[index];
				if (!candidate) return null;
				try {
					return {
						process: await spawnWithCandidate(candidate),
						shellLabel: formatShellCandidate(candidate)
					};
				} catch (error) {
					lastSpawnError = error;
					if (!isRetryableShellSpawnError(error)) throw error;
					return trySpawn(candidates, index + 1);
				}
			};
			const spawnResult = await trySpawn(shellCandidates);
			if (spawnResult) {
				ptyProcess = spawnResult.process;
				startedShell = spawnResult.shellLabel;
			}
			if (!ptyProcess) {
				const detail = lastSpawnError instanceof Error ? lastSpawnError.message : "Terminal start failed";
				const tried = shellCandidates.length > 0 ? ` Tried shells: ${shellCandidates.map((candidate) => formatShellCandidate(candidate)).join(", ")}.` : "";
				throw new Error(`${detail}.${tried}`.trim());
			}
			session.process = ptyProcess;
			session.pid = ptyProcess.pid;
			session.status = "running";
			session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			session.unsubscribeData = ptyProcess.onData((data) => {
				this.onProcessData(session, data);
			});
			session.unsubscribeExit = ptyProcess.onExit((event) => {
				this.onProcessExit(session, event);
			});
			this.updateSubprocessPollingState();
			this.emitEvent({
				type: eventType,
				threadId: session.threadId,
				terminalId: session.terminalId,
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				snapshot: this.snapshot(session)
			});
		} catch (error) {
			if (ptyProcess) this.killProcessWithEscalation(ptyProcess, session.threadId, session.terminalId);
			session.status = "error";
			session.pid = null;
			session.process = null;
			session.hasRunningSubprocess = false;
			session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			this.evictInactiveSessionsIfNeeded();
			this.updateSubprocessPollingState();
			const message = error instanceof Error ? error.message : "Terminal start failed";
			this.emitEvent({
				type: "error",
				threadId: session.threadId,
				terminalId: session.terminalId,
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				message
			});
			this.logger.error("failed to start terminal", {
				threadId: session.threadId,
				terminalId: session.terminalId,
				error: message,
				...startedShell ? { shell: startedShell } : {}
			});
		}
	}
	onProcessData(session, data) {
		session.history = capHistory(`${session.history}${data}`, this.historyLineLimit);
		session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		this.queuePersist(session.threadId, session.terminalId, session.history);
		this.emitEvent({
			type: "output",
			threadId: session.threadId,
			terminalId: session.terminalId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			data
		});
	}
	onProcessExit(session, event) {
		this.clearKillEscalationTimer(session.process);
		this.cleanupProcessHandles(session);
		session.process = null;
		session.pid = null;
		session.hasRunningSubprocess = false;
		session.status = "exited";
		session.exitCode = Number.isInteger(event.exitCode) ? event.exitCode : null;
		session.exitSignal = Number.isInteger(event.signal) ? event.signal : null;
		session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		this.emitEvent({
			type: "exited",
			threadId: session.threadId,
			terminalId: session.terminalId,
			createdAt: (/* @__PURE__ */ new Date()).toISOString(),
			exitCode: session.exitCode,
			exitSignal: session.exitSignal
		});
		this.evictInactiveSessionsIfNeeded();
		this.updateSubprocessPollingState();
	}
	stopProcess(session) {
		const process = session.process;
		if (!process) return;
		this.cleanupProcessHandles(session);
		session.process = null;
		session.pid = null;
		session.hasRunningSubprocess = false;
		session.status = "exited";
		session.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		this.killProcessWithEscalation(process, session.threadId, session.terminalId);
		this.evictInactiveSessionsIfNeeded();
		this.updateSubprocessPollingState();
	}
	cleanupProcessHandles(session) {
		session.unsubscribeData?.();
		session.unsubscribeData = null;
		session.unsubscribeExit?.();
		session.unsubscribeExit = null;
	}
	clearKillEscalationTimer(process) {
		if (!process) return;
		const timer = this.killEscalationTimers.get(process);
		if (!timer) return;
		clearTimeout(timer);
		this.killEscalationTimers.delete(process);
	}
	killProcessWithEscalation(process, threadId, terminalId) {
		this.clearKillEscalationTimer(process);
		try {
			process.kill("SIGTERM");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn("failed to kill terminal process", {
				threadId,
				terminalId,
				signal: "SIGTERM",
				error: message
			});
			return;
		}
		const timer = setTimeout(() => {
			this.killEscalationTimers.delete(process);
			try {
				process.kill("SIGKILL");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.logger.warn("failed to force-kill terminal process", {
					threadId,
					terminalId,
					signal: "SIGKILL",
					error: message
				});
			}
		}, this.processKillGraceMs);
		timer.unref?.();
		this.killEscalationTimers.set(process, timer);
	}
	evictInactiveSessionsIfNeeded() {
		const inactiveSessions = [...this.sessions.values()].filter((session) => session.status !== "running");
		if (inactiveSessions.length <= this.maxRetainedInactiveSessions) return;
		inactiveSessions.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.threadId.localeCompare(right.threadId) || left.terminalId.localeCompare(right.terminalId));
		const toEvict = inactiveSessions.length - this.maxRetainedInactiveSessions;
		for (const session of inactiveSessions.slice(0, toEvict)) {
			const key = toSessionKey(session.threadId, session.terminalId);
			this.sessions.delete(key);
			this.clearPersistTimer(session.threadId, session.terminalId);
			this.pendingPersistHistory.delete(key);
			this.persistQueues.delete(key);
			this.clearKillEscalationTimer(session.process);
		}
	}
	queuePersist(threadId, terminalId, history) {
		const persistenceKey = toSessionKey(threadId, terminalId);
		this.pendingPersistHistory.set(persistenceKey, history);
		this.schedulePersist(threadId, terminalId);
	}
	async persistHistory(threadId, terminalId, history) {
		const persistenceKey = toSessionKey(threadId, terminalId);
		this.clearPersistTimer(threadId, terminalId);
		this.pendingPersistHistory.delete(persistenceKey);
		await this.enqueuePersistWrite(threadId, terminalId, history);
	}
	enqueuePersistWrite(threadId, terminalId, history) {
		const persistenceKey = toSessionKey(threadId, terminalId);
		const task = async () => {
			await fs.promises.writeFile(this.historyPath(threadId, terminalId), history, "utf8");
		};
		const next = (this.persistQueues.get(persistenceKey) ?? Promise.resolve()).catch(() => void 0).then(task).catch((error) => {
			this.logger.warn("failed to persist terminal history", {
				threadId,
				terminalId,
				error: error instanceof Error ? error.message : String(error)
			});
		});
		this.persistQueues.set(persistenceKey, next);
		const finalized = next.finally(() => {
			if (this.persistQueues.get(persistenceKey) === next) this.persistQueues.delete(persistenceKey);
			if (this.pendingPersistHistory.has(persistenceKey) && !this.persistTimers.has(persistenceKey)) this.schedulePersist(threadId, terminalId);
		});
		finalized.catch(() => void 0);
		return finalized;
	}
	schedulePersist(threadId, terminalId) {
		const persistenceKey = toSessionKey(threadId, terminalId);
		if (this.persistTimers.has(persistenceKey)) return;
		const timer = setTimeout(() => {
			this.persistTimers.delete(persistenceKey);
			const pendingHistory = this.pendingPersistHistory.get(persistenceKey);
			if (pendingHistory === void 0) return;
			this.pendingPersistHistory.delete(persistenceKey);
			this.enqueuePersistWrite(threadId, terminalId, pendingHistory);
		}, this.persistDebounceMs);
		this.persistTimers.set(persistenceKey, timer);
	}
	clearPersistTimer(threadId, terminalId) {
		const persistenceKey = toSessionKey(threadId, terminalId);
		const timer = this.persistTimers.get(persistenceKey);
		if (!timer) return;
		clearTimeout(timer);
		this.persistTimers.delete(persistenceKey);
	}
	async readHistory(threadId, terminalId) {
		const nextPath = this.historyPath(threadId, terminalId);
		try {
			const raw = await fs.promises.readFile(nextPath, "utf8");
			const capped = capHistory(raw, this.historyLineLimit);
			if (capped !== raw) await fs.promises.writeFile(nextPath, capped, "utf8");
			return capped;
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		if (terminalId !== DEFAULT_TERMINAL_ID) return "";
		const legacyPath = this.legacyHistoryPath(threadId);
		try {
			const capped = capHistory(await fs.promises.readFile(legacyPath, "utf8"), this.historyLineLimit);
			await fs.promises.writeFile(nextPath, capped, "utf8");
			try {
				await fs.promises.rm(legacyPath, { force: true });
			} catch (cleanupError) {
				this.logger.warn("failed to remove legacy terminal history", {
					threadId,
					error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
				});
			}
			return capped;
		} catch (error) {
			if (error.code === "ENOENT") return "";
			throw error;
		}
	}
	async deleteHistory(threadId, terminalId) {
		const deletions = [fs.promises.rm(this.historyPath(threadId, terminalId), { force: true })];
		if (terminalId === DEFAULT_TERMINAL_ID) deletions.push(fs.promises.rm(this.legacyHistoryPath(threadId), { force: true }));
		try {
			await Promise.all(deletions);
		} catch (error) {
			this.logger.warn("failed to delete terminal history", {
				threadId,
				terminalId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	async flushPersistQueue(threadId, terminalId) {
		const persistenceKey = toSessionKey(threadId, terminalId);
		this.clearPersistTimer(threadId, terminalId);
		while (true) {
			const pendingHistory = this.pendingPersistHistory.get(persistenceKey);
			if (pendingHistory !== void 0) {
				this.pendingPersistHistory.delete(persistenceKey);
				await this.enqueuePersistWrite(threadId, terminalId, pendingHistory);
			}
			const pending = this.persistQueues.get(persistenceKey);
			if (!pending) return;
			await pending.catch(() => void 0);
		}
	}
	updateSubprocessPollingState() {
		if ([...this.sessions.values()].some((session) => session.status === "running" && session.pid !== null)) {
			this.ensureSubprocessPolling();
			return;
		}
		this.stopSubprocessPolling();
	}
	ensureSubprocessPolling() {
		if (this.subprocessPollTimer) return;
		this.subprocessPollTimer = setInterval(() => {
			this.pollSubprocessActivity();
		}, this.subprocessPollIntervalMs);
		this.subprocessPollTimer.unref?.();
		this.pollSubprocessActivity();
	}
	stopSubprocessPolling() {
		if (!this.subprocessPollTimer) return;
		clearInterval(this.subprocessPollTimer);
		this.subprocessPollTimer = null;
	}
	async pollSubprocessActivity() {
		if (this.subprocessPollInFlight) return;
		const runningSessions = [...this.sessions.values()].filter((session) => session.status === "running" && Number.isInteger(session.pid));
		if (runningSessions.length === 0) {
			this.stopSubprocessPolling();
			return;
		}
		this.subprocessPollInFlight = true;
		try {
			await Promise.all(runningSessions.map(async (session) => {
				const terminalPid = session.pid;
				let hasRunningSubprocess = false;
				try {
					hasRunningSubprocess = await this.subprocessChecker(terminalPid);
				} catch (error) {
					this.logger.warn("failed to check terminal subprocess activity", {
						threadId: session.threadId,
						terminalId: session.terminalId,
						terminalPid,
						error: error instanceof Error ? error.message : String(error)
					});
					return;
				}
				const liveSession = this.sessions.get(toSessionKey(session.threadId, session.terminalId));
				if (!liveSession || liveSession.status !== "running" || liveSession.pid !== terminalPid) return;
				if (liveSession.hasRunningSubprocess === hasRunningSubprocess) return;
				liveSession.hasRunningSubprocess = hasRunningSubprocess;
				liveSession.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				this.emitEvent({
					type: "activity",
					threadId: liveSession.threadId,
					terminalId: liveSession.terminalId,
					createdAt: (/* @__PURE__ */ new Date()).toISOString(),
					hasRunningSubprocess
				});
			}));
		} finally {
			this.subprocessPollInFlight = false;
		}
	}
	async assertValidCwd(cwd) {
		let stats;
		try {
			stats = await fs.promises.stat(cwd);
		} catch (error) {
			if (error.code === "ENOENT") throw new Error(`Terminal cwd does not exist: ${cwd}`, { cause: error });
			throw error;
		}
		if (!stats.isDirectory()) throw new Error(`Terminal cwd is not a directory: ${cwd}`);
	}
	async closeSession(threadId, terminalId, deleteHistory) {
		const key = toSessionKey(threadId, terminalId);
		const session = this.sessions.get(key);
		if (session) {
			this.stopProcess(session);
			this.sessions.delete(key);
		}
		this.updateSubprocessPollingState();
		await this.flushPersistQueue(threadId, terminalId);
		if (deleteHistory) await this.deleteHistory(threadId, terminalId);
	}
	sessionsForThread(threadId) {
		return [...this.sessions.values()].filter((session) => session.threadId === threadId);
	}
	async deleteAllHistoryForThread(threadId) {
		const threadPrefix = `${toSafeThreadId(threadId)}_`;
		try {
			const removals = (await fs.promises.readdir(this.logsDir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).filter((name) => name === `${toSafeThreadId(threadId)}.log` || name === `${legacySafeThreadId(threadId)}.log` || name.startsWith(threadPrefix)).map((name) => fs.promises.rm(path.join(this.logsDir, name), { force: true }));
			await Promise.all(removals);
		} catch (error) {
			this.logger.warn("failed to delete terminal histories for thread", {
				threadId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	requireSession(threadId, terminalId) {
		const session = this.sessions.get(toSessionKey(threadId, terminalId));
		if (!session) throw new Error(`Unknown terminal thread: ${threadId}, terminal: ${terminalId}`);
		return session;
	}
	snapshot(session) {
		return {
			threadId: session.threadId,
			terminalId: session.terminalId,
			cwd: session.cwd,
			status: session.status,
			pid: session.pid,
			history: session.history,
			exitCode: session.exitCode,
			exitSignal: session.exitSignal,
			updatedAt: session.updatedAt
		};
	}
	emitEvent(event) {
		this.emit("event", event);
	}
	historyPath(threadId, terminalId) {
		const threadPart = toSafeThreadId(threadId);
		if (terminalId === DEFAULT_TERMINAL_ID) return path.join(this.logsDir, `${threadPart}.log`);
		return path.join(this.logsDir, `${threadPart}_${toSafeTerminalId(terminalId)}.log`);
	}
	legacyHistoryPath(threadId) {
		return path.join(this.logsDir, `${legacySafeThreadId(threadId)}.log`);
	}
	async runWithThreadLock(threadId, task) {
		const previous = this.threadLocks.get(threadId) ?? Promise.resolve();
		let release;
		const current = new Promise((resolve) => {
			release = resolve;
		});
		this.threadLocks.set(threadId, current);
		await previous.catch(() => void 0);
		try {
			return await task();
		} finally {
			release();
			if (this.threadLocks.get(threadId) === current) this.threadLocks.delete(threadId);
		}
	}
};
const TerminalManagerLive = Layer.effect(TerminalManager, Effect.gen(function* () {
	const { stateDir } = yield* ServerConfig$1;
	const { join } = yield* Path.Path;
	const logsDir = join(stateDir, "logs", "terminals");
	const ptyAdapter = yield* PtyAdapter;
	const runtime = yield* Effect.acquireRelease(Effect.sync(() => new TerminalManagerRuntime({
		logsDir,
		ptyAdapter
	})), (r) => Effect.sync(() => r.dispose()));
	return {
		open: (input) => Effect.tryPromise({
			try: () => runtime.open(input),
			catch: (cause) => new TerminalError({
				message: "Failed to open terminal",
				cause
			})
		}),
		write: (input) => Effect.tryPromise({
			try: () => runtime.write(input),
			catch: (cause) => new TerminalError({
				message: "Failed to write to terminal",
				cause
			})
		}),
		resize: (input) => Effect.tryPromise({
			try: () => runtime.resize(input),
			catch: (cause) => new TerminalError({
				message: "Failed to resize terminal",
				cause
			})
		}),
		clear: (input) => Effect.tryPromise({
			try: () => runtime.clear(input),
			catch: (cause) => new TerminalError({
				message: "Failed to clear terminal",
				cause
			})
		}),
		restart: (input) => Effect.tryPromise({
			try: () => runtime.restart(input),
			catch: (cause) => new TerminalError({
				message: "Failed to restart terminal",
				cause
			})
		}),
		close: (input) => Effect.tryPromise({
			try: () => runtime.close(input),
			catch: (cause) => new TerminalError({
				message: "Failed to close terminal",
				cause
			})
		}),
		subscribe: (listener) => Effect.sync(() => {
			runtime.on("event", listener);
			return () => {
				runtime.off("event", listener);
			};
		}),
		dispose: Effect.sync(() => runtime.dispose())
	};
}));

//#endregion
//#region src/keybindings.ts
/**
* Keybindings - Keybinding configuration service definitions.
*
* Owns parsing, validation, merge, and persistence of user keybinding
* configuration consumed by the server runtime.
*
* @module Keybindings
*/
var KeybindingsConfigError = class extends Schema.TaggedErrorClass()("KeybindingsConfigParseError", {
	configPath: Schema.String,
	detail: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {
	get message() {
		return `Unable to parse keybindings config at ${this.configPath}: ${this.detail}`;
	}
};
const DEFAULT_KEYBINDINGS = [
	{
		key: "mod+j",
		command: "terminal.toggle"
	},
	{
		key: "mod+d",
		command: "terminal.split",
		when: "terminalFocus"
	},
	{
		key: "mod+n",
		command: "terminal.new",
		when: "terminalFocus"
	},
	{
		key: "mod+w",
		command: "terminal.close",
		when: "terminalFocus"
	},
	{
		key: "mod+d",
		command: "diff.toggle",
		when: "!terminalFocus"
	},
	{
		key: "mod+n",
		command: "chat.new",
		when: "!terminalFocus"
	},
	{
		key: "mod+shift+o",
		command: "chat.new",
		when: "!terminalFocus"
	},
	{
		key: "mod+shift+n",
		command: "chat.newLocal",
		when: "!terminalFocus"
	},
	{
		key: "mod+o",
		command: "editor.openFavorite"
	}
];
function normalizeKeyToken(token) {
	if (token === "space") return " ";
	if (token === "esc") return "escape";
	return token;
}
/** @internal - Exported for testing */
function parseKeybindingShortcut(value) {
	const tokens = [...value.toLowerCase().split("+").map((token) => token.trim())];
	let trailingEmptyCount = 0;
	while (tokens[tokens.length - 1] === "") {
		trailingEmptyCount += 1;
		tokens.pop();
	}
	if (trailingEmptyCount > 0) tokens.push("+");
	if (tokens.some((token) => token.length === 0)) return null;
	if (tokens.length === 0) return null;
	let key = null;
	let metaKey = false;
	let ctrlKey = false;
	let shiftKey = false;
	let altKey = false;
	let modKey = false;
	for (const token of tokens) switch (token) {
		case "cmd":
		case "meta":
			metaKey = true;
			break;
		case "ctrl":
		case "control":
			ctrlKey = true;
			break;
		case "shift":
			shiftKey = true;
			break;
		case "alt":
		case "option":
			altKey = true;
			break;
		case "mod":
			modKey = true;
			break;
		default:
			if (key !== null) return null;
			key = normalizeKeyToken(token);
	}
	if (key === null) return null;
	return {
		key,
		metaKey,
		ctrlKey,
		shiftKey,
		altKey,
		modKey
	};
}
function tokenizeWhenExpression(expression) {
	const tokens = [];
	let index = 0;
	while (index < expression.length) {
		const current = expression[index];
		if (!current) break;
		if (/\s/.test(current)) {
			index += 1;
			continue;
		}
		if (expression.startsWith("&&", index)) {
			tokens.push({ type: "and" });
			index += 2;
			continue;
		}
		if (expression.startsWith("||", index)) {
			tokens.push({ type: "or" });
			index += 2;
			continue;
		}
		if (current === "!") {
			tokens.push({ type: "not" });
			index += 1;
			continue;
		}
		if (current === "(") {
			tokens.push({ type: "lparen" });
			index += 1;
			continue;
		}
		if (current === ")") {
			tokens.push({ type: "rparen" });
			index += 1;
			continue;
		}
		const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(expression.slice(index));
		if (!identifier) return null;
		tokens.push({
			type: "identifier",
			value: identifier[0]
		});
		index += identifier[0].length;
	}
	return tokens;
}
function parseKeybindingWhenExpression(expression) {
	const tokens = tokenizeWhenExpression(expression);
	if (!tokens || tokens.length === 0) return null;
	let index = 0;
	const parsePrimary = (depth) => {
		if (depth > MAX_WHEN_EXPRESSION_DEPTH) return null;
		const token = tokens[index];
		if (!token) return null;
		if (token.type === "identifier") {
			index += 1;
			return {
				type: "identifier",
				name: token.value
			};
		}
		if (token.type === "lparen") {
			index += 1;
			const expressionNode = parseOr(depth + 1);
			const closeToken = tokens[index];
			if (!expressionNode || !closeToken || closeToken.type !== "rparen") return null;
			index += 1;
			return expressionNode;
		}
		return null;
	};
	const parseUnary = (depth) => {
		let notCount = 0;
		while (tokens[index]?.type === "not") {
			index += 1;
			notCount += 1;
			if (notCount > MAX_WHEN_EXPRESSION_DEPTH) return null;
		}
		let node = parsePrimary(depth);
		if (!node) return null;
		while (notCount > 0) {
			node = {
				type: "not",
				node
			};
			notCount -= 1;
		}
		return node;
	};
	const parseAnd = (depth) => {
		let left = parseUnary(depth);
		if (!left) return null;
		while (tokens[index]?.type === "and") {
			index += 1;
			const right = parseUnary(depth);
			if (!right) return null;
			left = {
				type: "and",
				left,
				right
			};
		}
		return left;
	};
	const parseOr = (depth) => {
		let left = parseAnd(depth);
		if (!left) return null;
		while (tokens[index]?.type === "or") {
			index += 1;
			const right = parseAnd(depth);
			if (!right) return null;
			left = {
				type: "or",
				left,
				right
			};
		}
		return left;
	};
	const ast = parseOr(0);
	if (!ast || index !== tokens.length) return null;
	return ast;
}
/** @internal - Exported for testing */
function compileResolvedKeybindingRule(rule) {
	const shortcut = parseKeybindingShortcut(rule.key);
	if (!shortcut) return null;
	if (rule.when !== void 0) {
		const whenAst = parseKeybindingWhenExpression(rule.when);
		if (!whenAst) return null;
		return {
			command: rule.command,
			shortcut,
			whenAst
		};
	}
	return {
		command: rule.command,
		shortcut
	};
}
function compileResolvedKeybindingsConfig(config) {
	const compiled = [];
	for (const rule of config) {
		const result = Schema.decodeExit(ResolvedKeybindingFromConfig)(rule);
		if (result._tag === "Success") compiled.push(result.value);
	}
	return compiled;
}
const ResolvedKeybindingFromConfig = KeybindingRule.pipe(Schema.decodeTo(Schema.toType(ResolvedKeybindingRule), SchemaTransformation.transformOrFail({
	decode: (rule) => Effect.succeed(compileResolvedKeybindingRule(rule)).pipe(Effect.filterOrFail(Predicate.isNotNull, () => new SchemaIssue.InvalidValue(Option.some(rule), { title: "Invalid keybinding rule" })), Effect.map((resolved) => resolved)),
	encode: (resolved) => Effect.gen(function* () {
		const key = encodeShortcut(resolved.shortcut);
		if (!key) return yield* Effect.fail(new SchemaIssue.InvalidValue(Option.some(resolved), { title: "Resolved shortcut cannot be encoded to key string" }));
		const when = resolved.whenAst ? encodeWhenAst(resolved.whenAst) : void 0;
		return {
			key,
			command: resolved.command,
			when
		};
	})
})));
const ResolvedKeybindingsFromConfig = Schema.Array(ResolvedKeybindingFromConfig).check(Schema.isMaxLength(MAX_KEYBINDINGS_COUNT));
function isSameKeybindingRule(left, right) {
	return left.command === right.command && left.key === right.key && (left.when ?? void 0) === (right.when ?? void 0);
}
function keybindingShortcutContext(rule) {
	const parsed = parseKeybindingShortcut(rule.key);
	if (!parsed) return null;
	const encoded = encodeShortcut(parsed);
	if (!encoded) return null;
	return `${encoded}\u0000${rule.when ?? ""}`;
}
function hasSameShortcutContext(left, right) {
	const leftContext = keybindingShortcutContext(left);
	const rightContext = keybindingShortcutContext(right);
	if (!leftContext || !rightContext) return false;
	return leftContext === rightContext;
}
function encodeShortcut(shortcut) {
	const modifiers = [];
	if (shortcut.modKey) modifiers.push("mod");
	if (shortcut.metaKey) modifiers.push("meta");
	if (shortcut.ctrlKey) modifiers.push("ctrl");
	if (shortcut.altKey) modifiers.push("alt");
	if (shortcut.shiftKey) modifiers.push("shift");
	if (!shortcut.key) return null;
	if (shortcut.key !== "+" && shortcut.key.includes("+")) return null;
	const key = shortcut.key === " " ? "space" : shortcut.key;
	return [...modifiers, key].join("+");
}
function encodeWhenAst(node) {
	switch (node.type) {
		case "identifier": return node.name;
		case "not": return `!(${encodeWhenAst(node.node)})`;
		case "and": return `(${encodeWhenAst(node.left)} && ${encodeWhenAst(node.right)})`;
		case "or": return `(${encodeWhenAst(node.left)} || ${encodeWhenAst(node.right)})`;
	}
}
const DEFAULT_RESOLVED_KEYBINDINGS = compileResolvedKeybindingsConfig(DEFAULT_KEYBINDINGS);
const RawKeybindingsEntries = Schema.fromJsonString(Schema.Array(Schema.Unknown));
const KeybindingsConfigJson = Schema.fromJsonString(KeybindingsConfig);
const PrettyJsonString = SchemaGetter.parseJson().compose(SchemaGetter.stringifyJson({ space: 2 }));
const KeybindingsConfigPrettyJson = KeybindingsConfigJson.pipe(Schema.encode({
	decode: PrettyJsonString,
	encode: PrettyJsonString
}));
function trimIssueMessage(message) {
	const trimmed = message.trim();
	return trimmed.length > 0 ? trimmed : "Invalid keybindings configuration.";
}
function malformedConfigIssue(detail) {
	return {
		kind: "keybindings.malformed-config",
		message: trimIssueMessage(detail)
	};
}
function invalidEntryIssue(index, detail) {
	return {
		kind: "keybindings.invalid-entry",
		index,
		message: trimIssueMessage(detail)
	};
}
function mergeWithDefaultKeybindings(custom) {
	if (custom.length === 0) return [...DEFAULT_RESOLVED_KEYBINDINGS];
	const overriddenCommands = new Set(custom.map((binding) => binding.command));
	const merged = [...DEFAULT_RESOLVED_KEYBINDINGS.filter((binding) => !overriddenCommands.has(binding.command)), ...custom];
	if (merged.length <= MAX_KEYBINDINGS_COUNT) return merged;
	return merged.slice(-MAX_KEYBINDINGS_COUNT);
}
/**
* Keybindings - Service tag for keybinding configuration operations.
*/
var Keybindings = class extends ServiceMap.Service()("t3/keybindings") {};
const makeKeybindings = Effect.gen(function* () {
	const { keybindingsConfigPath } = yield* ServerConfig$1;
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const upsertSemaphore = yield* Semaphore.make(1);
	const resolvedConfigCacheKey = "resolved";
	const changesPubSub = yield* PubSub.unbounded();
	const emitChange = (issues) => PubSub.publish(changesPubSub, { issues }).pipe(Effect.asVoid);
	const readConfigExists = fs.exists(keybindingsConfigPath).pipe(Effect.mapError((cause) => new KeybindingsConfigError({
		configPath: keybindingsConfigPath,
		detail: "failed to access keybindings config",
		cause
	})));
	const readRawConfig = fs.readFileString(keybindingsConfigPath).pipe(Effect.mapError((cause) => new KeybindingsConfigError({
		configPath: keybindingsConfigPath,
		detail: "failed to read keybindings config",
		cause
	})));
	const loadWritableCustomKeybindingsConfig = Effect.fn(function* () {
		if (!(yield* readConfigExists)) return [];
		const rawConfig = yield* readRawConfig.pipe(Effect.flatMap(Schema.decodeEffect(RawKeybindingsEntries)), Effect.mapError((cause) => new KeybindingsConfigError({
			configPath: keybindingsConfigPath,
			detail: "expected JSON array",
			cause
		})));
		return yield* Effect.forEach(rawConfig, (entry) => Effect.gen(function* () {
			const decodedRule = Schema.decodeUnknownExit(KeybindingRule)(entry);
			if (decodedRule._tag === "Failure") {
				yield* Effect.logWarning("ignoring invalid keybinding entry", {
					path: keybindingsConfigPath,
					entry,
					error: Cause.pretty(decodedRule.cause)
				});
				return null;
			}
			const resolved = Schema.decodeExit(ResolvedKeybindingFromConfig)(decodedRule.value);
			if (resolved._tag === "Failure") {
				yield* Effect.logWarning("ignoring invalid keybinding entry", {
					path: keybindingsConfigPath,
					entry,
					error: Cause.pretty(resolved.cause)
				});
				return null;
			}
			return decodedRule.value;
		})).pipe(Effect.map(Array$1.filter(Predicate.isNotNull)));
	});
	const loadRuntimeCustomKeybindingsConfig = Effect.fn(function* () {
		if (!(yield* readConfigExists)) return {
			keybindings: [],
			issues: []
		};
		const rawConfig = yield* readRawConfig;
		const decodedEntries = Schema.decodeUnknownExit(RawKeybindingsEntries)(rawConfig);
		if (decodedEntries._tag === "Failure") return {
			keybindings: [],
			issues: [malformedConfigIssue(`expected JSON array (${Cause.pretty(decodedEntries.cause)})`)]
		};
		const keybindings = [];
		const issues = [];
		for (const [index, entry] of decodedEntries.value.entries()) {
			const decodedRule = Schema.decodeUnknownExit(KeybindingRule)(entry);
			if (decodedRule._tag === "Failure") {
				const detail = Cause.pretty(decodedRule.cause);
				issues.push(invalidEntryIssue(index, detail));
				yield* Effect.logWarning("ignoring invalid keybinding entry", {
					path: keybindingsConfigPath,
					index,
					entry,
					error: detail
				});
				continue;
			}
			const resolvedRule = Schema.decodeExit(ResolvedKeybindingFromConfig)(decodedRule.value);
			if (resolvedRule._tag === "Failure") {
				const detail = Cause.pretty(resolvedRule.cause);
				issues.push(invalidEntryIssue(index, detail));
				yield* Effect.logWarning("ignoring invalid keybinding entry", {
					path: keybindingsConfigPath,
					index,
					entry,
					error: detail
				});
				continue;
			}
			keybindings.push(decodedRule.value);
		}
		return {
			keybindings,
			issues
		};
	});
	const writeConfigAtomically = (rules) => {
		const tempPath = `${keybindingsConfigPath}.${process.pid}.${Date.now()}.tmp`;
		return Schema.encodeEffect(KeybindingsConfigPrettyJson)(rules).pipe(Effect.map((encoded) => `${encoded}\n`), Effect.tap(() => fs.makeDirectory(path.dirname(keybindingsConfigPath), { recursive: true })), Effect.tap((encoded) => fs.writeFileString(tempPath, encoded)), Effect.flatMap(() => fs.rename(tempPath, keybindingsConfigPath)), Effect.mapError((cause) => new KeybindingsConfigError({
			configPath: keybindingsConfigPath,
			detail: "failed to write keybindings config",
			cause
		})));
	};
	const loadConfigStateFromDisk = loadRuntimeCustomKeybindingsConfig().pipe(Effect.map(({ keybindings, issues }) => ({
		keybindings: mergeWithDefaultKeybindings(compileResolvedKeybindingsConfig(keybindings)),
		issues
	})));
	const resolvedConfigCache = yield* Cache.make({
		capacity: 1,
		lookup: () => loadConfigStateFromDisk
	});
	const loadConfigStateFromCacheOrDisk = Cache.get(resolvedConfigCache, resolvedConfigCacheKey);
	const revalidateAndEmit = upsertSemaphore.withPermits(1)(Effect.gen(function* () {
		yield* Cache.invalidate(resolvedConfigCache, resolvedConfigCacheKey);
		yield* emitChange((yield* loadConfigStateFromCacheOrDisk).issues);
	}));
	const keybindingsConfigDir = path.dirname(keybindingsConfigPath);
	const keybindingsConfigFile = path.basename(keybindingsConfigPath);
	const keybindingsConfigPathResolved = path.resolve(keybindingsConfigPath);
	yield* fs.makeDirectory(keybindingsConfigDir, { recursive: true }).pipe(Effect.orElseSucceed(() => void 0));
	yield* Stream.runForEach(fs.watch(keybindingsConfigDir), (event) => {
		if (!(event.path === keybindingsConfigFile || event.path === keybindingsConfigPath || path.resolve(keybindingsConfigDir, event.path) === keybindingsConfigPathResolved)) return Effect.void;
		return revalidateAndEmit.pipe(Effect.catch((error) => Effect.logWarning("failed to revalidate keybindings config after file update", {
			path: keybindingsConfigPath,
			detail: error.detail,
			cause: error.cause
		})));
	}).pipe(Effect.catch((cause) => Effect.logWarning("keybindings config watcher stopped unexpectedly", {
		path: keybindingsConfigPath,
		cause
	})), Effect.forkScoped);
	return {
		syncDefaultKeybindingsOnStartup: upsertSemaphore.withPermits(1)(Effect.gen(function* () {
			if (!(yield* readConfigExists)) {
				yield* writeConfigAtomically(DEFAULT_KEYBINDINGS);
				yield* Cache.invalidate(resolvedConfigCache, resolvedConfigCacheKey);
				return;
			}
			const runtimeConfig = yield* loadRuntimeCustomKeybindingsConfig();
			if (runtimeConfig.issues.length > 0) {
				yield* Effect.logWarning("skipping startup keybindings default sync because config has issues", {
					path: keybindingsConfigPath,
					issues: runtimeConfig.issues
				});
				yield* Cache.invalidate(resolvedConfigCache, resolvedConfigCacheKey);
				return;
			}
			const customConfig = runtimeConfig.keybindings;
			const existingCommands = new Set(customConfig.map((entry) => entry.command));
			const missingDefaults = [];
			const shortcutConflictWarnings = [];
			for (const defaultRule of DEFAULT_KEYBINDINGS) {
				if (existingCommands.has(defaultRule.command)) continue;
				const conflictingEntry = customConfig.find((entry) => hasSameShortcutContext(entry, defaultRule));
				if (conflictingEntry) {
					shortcutConflictWarnings.push({
						defaultCommand: defaultRule.command,
						conflictingCommand: conflictingEntry.command,
						key: defaultRule.key,
						when: defaultRule.when ?? null
					});
					continue;
				}
				missingDefaults.push(defaultRule);
			}
			for (const conflict of shortcutConflictWarnings) yield* Effect.logWarning("skipping default keybinding due to shortcut conflict", {
				path: keybindingsConfigPath,
				defaultCommand: conflict.defaultCommand,
				conflictingCommand: conflict.conflictingCommand,
				key: conflict.key,
				when: conflict.when,
				reason: "shortcut context already used by existing rule"
			});
			if (missingDefaults.length === 0) {
				yield* Cache.invalidate(resolvedConfigCache, resolvedConfigCacheKey);
				return;
			}
			const matchingDefaults = DEFAULT_KEYBINDINGS.filter((defaultRule) => customConfig.some((entry) => isSameKeybindingRule(entry, defaultRule))).map((rule) => rule.command);
			if (matchingDefaults.length > 0) yield* Effect.logWarning("default keybinding rule already defined in user config", {
				path: keybindingsConfigPath,
				commands: matchingDefaults
			});
			const nextConfig = [...customConfig, ...missingDefaults];
			const cappedConfig = nextConfig.length > MAX_KEYBINDINGS_COUNT ? nextConfig.slice(-MAX_KEYBINDINGS_COUNT) : nextConfig;
			if (nextConfig.length > MAX_KEYBINDINGS_COUNT) yield* Effect.logWarning("truncating keybindings config to max entries", {
				path: keybindingsConfigPath,
				maxEntries: MAX_KEYBINDINGS_COUNT
			});
			yield* writeConfigAtomically(cappedConfig);
			yield* Cache.invalidate(resolvedConfigCache, resolvedConfigCacheKey);
		})),
		loadConfigState: loadConfigStateFromCacheOrDisk,
		changes: Stream.fromPubSub(changesPubSub),
		upsertKeybindingRule: (rule) => upsertSemaphore.withPermits(1)(Effect.gen(function* () {
			const nextConfig = [...(yield* loadWritableCustomKeybindingsConfig()).filter((entry) => entry.command !== rule.command), rule];
			const cappedConfig = nextConfig.length > MAX_KEYBINDINGS_COUNT ? nextConfig.slice(-MAX_KEYBINDINGS_COUNT) : nextConfig;
			if (nextConfig.length > MAX_KEYBINDINGS_COUNT) yield* Effect.logWarning("truncating keybindings config to max entries", {
				path: keybindingsConfigPath,
				maxEntries: MAX_KEYBINDINGS_COUNT
			});
			yield* writeConfigAtomically(cappedConfig);
			const nextResolved = mergeWithDefaultKeybindings(compileResolvedKeybindingsConfig(cappedConfig));
			yield* Cache.set(resolvedConfigCache, resolvedConfigCacheKey, {
				keybindings: nextResolved,
				issues: []
			});
			yield* emitChange([]);
			return nextResolved;
		}))
	};
});
const KeybindingsLive = Layer.effect(Keybindings, makeKeybindings);

//#endregion
//#region ../../packages/shared/src/git.ts
/**
* Sanitize an arbitrary string into a valid, lowercase git branch fragment.
* Strips quotes, collapses separators, limits to 64 chars.
*/
function sanitizeBranchFragment(raw) {
	const branchFragment = raw.trim().toLowerCase().replace(/['"`]/g, "").replace(/^[./\s_-]+|[./\s_-]+$/g, "").replace(/[^a-z0-9/_-]+/g, "-").replace(/\/+/g, "/").replace(/-+/g, "-").replace(/^[./_-]+|[./_-]+$/g, "").slice(0, 64).replace(/[./_-]+$/g, "");
	return branchFragment.length > 0 ? branchFragment : "update";
}
/**
* Sanitize a string into a `feature/…` branch name.
* Preserves an existing `feature/` prefix or slash-separated namespace.
*/
function sanitizeFeatureBranchName(raw) {
	const sanitized = sanitizeBranchFragment(raw);
	if (sanitized.includes("/")) return sanitized.startsWith("feature/") ? sanitized : `feature/${sanitized}`;
	return `feature/${sanitized}`;
}
const AUTO_FEATURE_BRANCH_FALLBACK = "feature/update";
/**
* Resolve a unique `feature/…` branch name that doesn't collide with
* any existing branch. Appends a numeric suffix when needed.
*/
function resolveAutoFeatureBranchName(existingBranchNames, preferredBranch) {
	const preferred = preferredBranch?.trim();
	const resolvedBase = sanitizeFeatureBranchName(preferred && preferred.length > 0 ? preferred : AUTO_FEATURE_BRANCH_FALLBACK);
	const existingNames = new Set(existingBranchNames.map((branch) => branch.toLowerCase()));
	if (!existingNames.has(resolvedBase)) return resolvedBase;
	let suffix = 2;
	while (existingNames.has(`${resolvedBase}-${suffix}`)) suffix += 1;
	return `${resolvedBase}-${suffix}`;
}

//#endregion
//#region src/git/Services/GitManager.ts
/**
* GitManager - Service tag for stacked Git workflow orchestration.
*/
var GitManager = class extends ServiceMap.Service()("t3/git/Services/GitManager") {};

//#endregion
//#region src/git/Services/GitHubCli.ts
/**
* GitHubCli - Effect service contract for `gh` process interactions.
*
* Provides thin command execution helpers used by Git workflow orchestration.
*
* @module GitHubCli
*/
/**
* GitHubCli - Service tag for GitHub CLI process execution.
*/
var GitHubCli = class extends ServiceMap.Service()("t3/git/Services/GitHubCli") {};

//#endregion
//#region src/git/Layers/GitManager.ts
function parsePullRequestList(raw) {
	if (!Array.isArray(raw)) return [];
	const parsed = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry;
		const number = record.number;
		const title = record.title;
		const url = record.url;
		const baseRefName = record.baseRefName;
		const headRefName = record.headRefName;
		const state = record.state;
		const mergedAt = record.mergedAt;
		const updatedAt = record.updatedAt;
		if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) continue;
		if (typeof title !== "string" || typeof url !== "string" || typeof baseRefName !== "string" || typeof headRefName !== "string") continue;
		let normalizedState;
		if (typeof mergedAt === "string" && mergedAt.trim().length > 0 || state === "MERGED") normalizedState = "merged";
		else if (state === "OPEN" || state === void 0 || state === null) normalizedState = "open";
		else if (state === "CLOSED") normalizedState = "closed";
		else continue;
		parsed.push({
			number,
			title,
			url,
			baseRefName,
			headRefName,
			state: normalizedState,
			updatedAt: typeof updatedAt === "string" && updatedAt.trim().length > 0 ? updatedAt : null
		});
	}
	return parsed;
}
function gitManagerError(operation, detail, cause) {
	return new GitManagerError({
		operation,
		detail,
		...cause !== void 0 ? { cause } : {}
	});
}
function limitContext(value, maxChars) {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars)}\n\n[truncated]`;
}
function sanitizeCommitMessage(generated) {
	const subject = (generated.subject.trim().split(/\r?\n/g)[0]?.trim() ?? "").replace(/[.]+$/g, "").trim();
	return {
		subject: subject.length > 0 ? subject.slice(0, 72).trimEnd() : "Update project files",
		body: generated.body.trim(),
		...generated.branch !== void 0 ? { branch: generated.branch } : {}
	};
}
function formatCommitMessage(subject, body) {
	const trimmedBody = body.trim();
	if (trimmedBody.length === 0) return subject;
	return `${subject}\n\n${trimmedBody}`;
}
function parseCustomCommitMessage(raw) {
	const normalized = raw.replace(/\r\n/g, "\n").trim();
	if (normalized.length === 0) return null;
	const [firstLine, ...rest] = normalized.split("\n");
	const subject = firstLine?.trim() ?? "";
	if (subject.length === 0) return null;
	return {
		subject,
		body: rest.join("\n").trim()
	};
}
function extractBranchFromRef(ref) {
	const normalized = ref.trim();
	if (normalized.startsWith("refs/remotes/")) {
		const withoutPrefix = normalized.slice(13);
		const firstSlash = withoutPrefix.indexOf("/");
		if (firstSlash === -1) return withoutPrefix.trim();
		return withoutPrefix.slice(firstSlash + 1).trim();
	}
	const firstSlash = normalized.indexOf("/");
	if (firstSlash === -1) return normalized;
	return normalized.slice(firstSlash + 1).trim();
}
function toStatusPr(pr) {
	return {
		number: pr.number,
		title: pr.title,
		url: pr.url,
		baseBranch: pr.baseRefName,
		headBranch: pr.headRefName,
		state: pr.state
	};
}
const makeGitManager = Effect.gen(function* () {
	const gitCore = yield* GitCore;
	const gitHubCli = yield* GitHubCli;
	const textGeneration = yield* TextGeneration;
	const fileSystem = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const tempDir = process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? "/tmp";
	const findOpenPr = (cwd, branch) => gitHubCli.listOpenPullRequests({
		cwd,
		headBranch: branch,
		limit: 1
	}).pipe(Effect.map((prs) => {
		const [first] = prs;
		if (!first) return null;
		return {
			number: first.number,
			title: first.title,
			url: first.url,
			baseRefName: first.baseRefName,
			headRefName: first.headRefName,
			state: "open",
			updatedAt: null
		};
	}));
	const findLatestPr = (cwd, branch) => Effect.gen(function* () {
		const raw = (yield* gitHubCli.execute({
			cwd,
			args: [
				"pr",
				"list",
				"--head",
				branch,
				"--state",
				"all",
				"--limit",
				"20",
				"--json",
				"number,title,url,baseRefName,headRefName,state,mergedAt,updatedAt"
			]
		}).pipe(Effect.map((result) => result.stdout))).trim();
		if (raw.length === 0) return null;
		const parsed = parsePullRequestList(yield* Effect.try({
			try: () => JSON.parse(raw),
			catch: (cause) => gitManagerError("findLatestPr", "GitHub CLI returned invalid PR list JSON.", cause)
		})).toSorted((a, b) => {
			const left = a.updatedAt ? Date.parse(a.updatedAt) : 0;
			return (b.updatedAt ? Date.parse(b.updatedAt) : 0) - left;
		});
		const latestOpenPr = parsed.find((pr) => pr.state === "open");
		if (latestOpenPr) return latestOpenPr;
		return parsed[0] ?? null;
	});
	const resolveBaseBranch = (cwd, branch, upstreamRef) => Effect.gen(function* () {
		const configured = yield* gitCore.readConfigValue(cwd, `branch.${branch}.gh-merge-base`);
		if (configured) return configured;
		if (upstreamRef) {
			const upstreamBranch = extractBranchFromRef(upstreamRef);
			if (upstreamBranch.length > 0 && upstreamBranch !== branch) return upstreamBranch;
		}
		const defaultFromGh = yield* gitHubCli.getDefaultBranch({ cwd }).pipe(Effect.catch(() => Effect.succeed(null)));
		if (defaultFromGh) return defaultFromGh;
		return "main";
	});
	const resolveCommitAndBranchSuggestion = (input) => Effect.gen(function* () {
		const context = yield* gitCore.prepareCommitContext(input.cwd);
		if (!context) return null;
		const customCommit = parseCustomCommitMessage(input.commitMessage ?? "");
		if (customCommit) return {
			subject: customCommit.subject,
			body: customCommit.body,
			...input.includeBranch ? { branch: sanitizeFeatureBranchName(customCommit.subject) } : {},
			commitMessage: formatCommitMessage(customCommit.subject, customCommit.body)
		};
		const generated = yield* textGeneration.generateCommitMessage({
			cwd: input.cwd,
			branch: input.branch,
			stagedSummary: limitContext(context.stagedSummary, 8e3),
			stagedPatch: limitContext(context.stagedPatch, 5e4),
			...input.includeBranch ? { includeBranch: true } : {}
		}).pipe(Effect.map((result) => sanitizeCommitMessage(result)));
		return {
			subject: generated.subject,
			body: generated.body,
			...generated.branch !== void 0 ? { branch: generated.branch } : {},
			commitMessage: formatCommitMessage(generated.subject, generated.body)
		};
	});
	const runCommitStep = (cwd, branch, commitMessage, preResolvedSuggestion) => Effect.gen(function* () {
		const suggestion = preResolvedSuggestion ?? (yield* resolveCommitAndBranchSuggestion({
			cwd,
			branch,
			...commitMessage ? { commitMessage } : {}
		}));
		if (!suggestion) return { status: "skipped_no_changes" };
		const { commitSha } = yield* gitCore.commit(cwd, suggestion.subject, suggestion.body);
		return {
			status: "created",
			commitSha,
			subject: suggestion.subject
		};
	});
	const runPrStep = (cwd, fallbackBranch) => Effect.gen(function* () {
		const details = yield* gitCore.statusDetails(cwd);
		const branch = details.branch ?? fallbackBranch;
		if (!branch) return yield* gitManagerError("runPrStep", "Cannot create a pull request from detached HEAD.");
		if (!details.hasUpstream) return yield* gitManagerError("runPrStep", "Current branch has not been pushed. Push before creating a PR.");
		const existing = yield* findOpenPr(cwd, branch);
		if (existing) return {
			status: "opened_existing",
			url: existing.url,
			number: existing.number,
			baseBranch: existing.baseRefName,
			headBranch: existing.headRefName,
			title: existing.title
		};
		const baseBranch = yield* resolveBaseBranch(cwd, branch, details.upstreamRef);
		const rangeContext = yield* gitCore.readRangeContext(cwd, baseBranch);
		const generated = yield* textGeneration.generatePrContent({
			cwd,
			baseBranch,
			headBranch: branch,
			commitSummary: limitContext(rangeContext.commitSummary, 2e4),
			diffSummary: limitContext(rangeContext.diffSummary, 2e4),
			diffPatch: limitContext(rangeContext.diffPatch, 6e4)
		});
		const bodyFile = path.join(tempDir, `t3code-pr-body-${process.pid}-${randomUUID()}.md`);
		yield* fileSystem.writeFileString(bodyFile, generated.body).pipe(Effect.mapError((cause) => gitManagerError("runPrStep", "Failed to write pull request body temp file.", cause)));
		yield* gitHubCli.createPullRequest({
			cwd,
			baseBranch,
			headBranch: branch,
			title: generated.title,
			bodyFile
		}).pipe(Effect.ensuring(fileSystem.remove(bodyFile).pipe(Effect.catch(() => Effect.void))));
		const created = yield* findOpenPr(cwd, branch);
		if (!created) return {
			status: "created",
			baseBranch,
			headBranch: branch,
			title: generated.title
		};
		return {
			status: "created",
			url: created.url,
			number: created.number,
			baseBranch: created.baseRefName,
			headBranch: created.headRefName,
			title: created.title
		};
	});
	const status = Effect.fnUntraced(function* (input) {
		const details = yield* gitCore.statusDetails(input.cwd);
		const pr = details.branch !== null ? yield* findLatestPr(input.cwd, details.branch).pipe(Effect.map((latest) => latest ? toStatusPr(latest) : null), Effect.catch(() => Effect.succeed(null))) : null;
		return {
			branch: details.branch,
			hasWorkingTreeChanges: details.hasWorkingTreeChanges,
			workingTree: details.workingTree,
			hasUpstream: details.hasUpstream,
			aheadCount: details.aheadCount,
			behindCount: details.behindCount,
			pr
		};
	});
	const runFeatureBranchStep = (cwd, branch, commitMessage) => Effect.gen(function* () {
		const suggestion = yield* resolveCommitAndBranchSuggestion({
			cwd,
			branch,
			...commitMessage ? { commitMessage } : {},
			includeBranch: true
		});
		if (!suggestion) return yield* gitManagerError("runFeatureBranchStep", "Cannot create a feature branch because there are no changes to commit.");
		const preferredBranch = suggestion.branch ?? sanitizeFeatureBranchName(suggestion.subject);
		const resolvedBranch = resolveAutoFeatureBranchName(yield* gitCore.listLocalBranchNames(cwd), preferredBranch);
		yield* gitCore.createBranch({
			cwd,
			branch: resolvedBranch
		});
		yield* Effect.scoped(gitCore.checkoutBranch({
			cwd,
			branch: resolvedBranch
		}));
		return {
			branchStep: {
				status: "created",
				name: resolvedBranch
			},
			resolvedCommitMessage: suggestion.commitMessage,
			resolvedCommitSuggestion: suggestion
		};
	});
	return {
		status,
		runStackedAction: Effect.fnUntraced(function* (input) {
			const wantsPush = input.action !== "commit";
			const wantsPr = input.action === "commit_push_pr";
			const initialStatus = yield* gitCore.statusDetails(input.cwd);
			if (!input.featureBranch && wantsPush && !initialStatus.branch) return yield* gitManagerError("runStackedAction", "Cannot push from detached HEAD.");
			if (!input.featureBranch && wantsPr && !initialStatus.branch) return yield* gitManagerError("runStackedAction", "Cannot create a pull request from detached HEAD.");
			let branchStep;
			let commitMessageForStep = input.commitMessage;
			let preResolvedCommitSuggestion = void 0;
			if (input.featureBranch) {
				const result = yield* runFeatureBranchStep(input.cwd, initialStatus.branch, input.commitMessage);
				branchStep = result.branchStep;
				commitMessageForStep = result.resolvedCommitMessage;
				preResolvedCommitSuggestion = result.resolvedCommitSuggestion;
			} else branchStep = { status: "skipped_not_requested" };
			const currentBranch = branchStep.name ?? initialStatus.branch;
			const commit = yield* runCommitStep(input.cwd, currentBranch, commitMessageForStep, preResolvedCommitSuggestion);
			const push = wantsPush ? yield* gitCore.pushCurrentBranch(input.cwd, currentBranch) : { status: "skipped_not_requested" };
			const pr = wantsPr ? yield* runPrStep(input.cwd, currentBranch) : { status: "skipped_not_requested" };
			return {
				action: input.action,
				branch: branchStep,
				commit,
				push,
				pr
			};
		})
	};
});
const GitManagerLive = Layer.effect(GitManager, makeGitManager);

//#endregion
//#region src/git/Layers/GitCore.ts
const STATUS_UPSTREAM_REFRESH_INTERVAL = Duration.seconds(15);
const STATUS_UPSTREAM_REFRESH_TIMEOUT = Duration.seconds(5);
const STATUS_UPSTREAM_REFRESH_CACHE_CAPACITY = 2048;
const DEFAULT_BASE_BRANCH_CANDIDATES = ["main", "master"];
var StatusUpstreamRefreshCacheKey = class extends Data.Class {};
function parseBranchAb(value) {
	const match = value.match(/^\+(\d+)\s+-(\d+)$/);
	if (!match) return {
		ahead: 0,
		behind: 0
	};
	return {
		ahead: Number(match[1] ?? "0"),
		behind: Number(match[2] ?? "0")
	};
}
function parseNumstatEntries(stdout) {
	const entries = [];
	for (const line of stdout.split(/\r?\n/g)) {
		if (line.trim().length === 0) continue;
		const [addedRaw, deletedRaw, ...pathParts] = line.split("	");
		const rawPath = pathParts.length > 1 ? (pathParts.at(-1) ?? "").trim() : pathParts.join("	").trim();
		if (rawPath.length === 0) continue;
		const added = Number.parseInt(addedRaw ?? "0", 10);
		const deleted = Number.parseInt(deletedRaw ?? "0", 10);
		const renameArrowIndex = rawPath.indexOf(" => ");
		const normalizedPath = renameArrowIndex >= 0 ? rawPath.slice(renameArrowIndex + 4).trim() : rawPath;
		entries.push({
			path: normalizedPath.length > 0 ? normalizedPath : rawPath,
			insertions: Number.isFinite(added) ? added : 0,
			deletions: Number.isFinite(deleted) ? deleted : 0
		});
	}
	return entries;
}
function parsePorcelainPath(line) {
	if (line.startsWith("? ") || line.startsWith("! ")) {
		const simple = line.slice(2).trim();
		return simple.length > 0 ? simple : null;
	}
	if (!(line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u "))) return null;
	const tabIndex = line.indexOf("	");
	if (tabIndex >= 0) {
		const [filePath] = line.slice(tabIndex + 1).split("	");
		return filePath?.trim().length ? filePath.trim() : null;
	}
	const filePath = line.trim().split(/\s+/g).at(-1) ?? "";
	return filePath.length > 0 ? filePath : null;
}
function parseBranchLine(line) {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	const name = trimmed.replace(/^[*+]\s+/, "");
	if (name.includes(" -> ") || name.startsWith("(")) return null;
	return {
		name,
		current: trimmed.startsWith("* ")
	};
}
function parseRemoteNames(stdout) {
	return stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).toSorted((a, b) => b.length - a.length);
}
function parseRemoteRefWithRemoteNames(branchName, remoteNames) {
	const trimmedBranchName = branchName.trim();
	if (trimmedBranchName.length === 0) return null;
	for (const remoteName of remoteNames) {
		const remotePrefix = `${remoteName}/`;
		if (!trimmedBranchName.startsWith(remotePrefix)) continue;
		const localBranch = trimmedBranchName.slice(remotePrefix.length).trim();
		if (localBranch.length === 0) return null;
		return {
			remoteRef: trimmedBranchName,
			remoteName,
			localBranch
		};
	}
	return null;
}
function parseTrackingBranchByUpstreamRef(stdout, upstreamRef) {
	for (const line of stdout.split("\n")) {
		const trimmedLine = line.trim();
		if (trimmedLine.length === 0) continue;
		const [branchNameRaw, upstreamBranchRaw = ""] = trimmedLine.split("	");
		const branchName = branchNameRaw?.trim() ?? "";
		const upstreamBranch = upstreamBranchRaw.trim();
		if (branchName.length === 0 || upstreamBranch.length === 0) continue;
		if (upstreamBranch === upstreamRef) return branchName;
	}
	return null;
}
function deriveLocalBranchNameFromRemoteRef(branchName) {
	const separatorIndex = branchName.indexOf("/");
	if (separatorIndex <= 0 || separatorIndex === branchName.length - 1) return null;
	const localBranch = branchName.slice(separatorIndex + 1).trim();
	return localBranch.length > 0 ? localBranch : null;
}
function commandLabel(args) {
	return `git ${args.join(" ")}`;
}
function parseDefaultBranchFromRemoteHeadRef(value) {
	const trimmed = value.trim();
	if (!trimmed.startsWith("refs/remotes/origin/")) return null;
	const branch = trimmed.slice(20).trim();
	return branch.length > 0 ? branch : null;
}
function createGitCommandError(operation, cwd, args, detail, cause) {
	return new GitCommandError({
		operation,
		command: commandLabel(args),
		cwd,
		detail,
		...cause !== void 0 ? { cause } : {}
	});
}
const makeGitCore = Effect.gen(function* () {
	const git = yield* GitService;
	const fileSystem = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const executeGit = (operation, cwd, args, options = {}) => git.execute({
		operation,
		cwd,
		args,
		allowNonZeroExit: true,
		...options.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {}
	}).pipe(Effect.flatMap((result) => {
		if (options.allowNonZeroExit || result.code === 0) return Effect.succeed(result);
		const stderr = result.stderr.trim();
		if (stderr.length > 0) return Effect.fail(createGitCommandError(operation, cwd, args, stderr));
		if (options.fallbackErrorMessage) return Effect.fail(createGitCommandError(operation, cwd, args, options.fallbackErrorMessage));
		return Effect.fail(createGitCommandError(operation, cwd, args, `${commandLabel(args)} failed: code=${result.code ?? "null"}`));
	}));
	const runGit = (operation, cwd, args, allowNonZeroExit = false) => executeGit(operation, cwd, args, { allowNonZeroExit }).pipe(Effect.asVoid);
	const runGitStdout = (operation, cwd, args, allowNonZeroExit = false) => executeGit(operation, cwd, args, { allowNonZeroExit }).pipe(Effect.map((result) => result.stdout));
	const branchExists = (cwd, branch) => executeGit("GitCore.branchExists", cwd, [
		"show-ref",
		"--verify",
		"--quiet",
		`refs/heads/${branch}`
	], {
		allowNonZeroExit: true,
		timeoutMs: 5e3
	}).pipe(Effect.map((result) => result.code === 0));
	const resolveAvailableBranchName = (cwd, desiredBranch) => Effect.gen(function* () {
		if (!(yield* branchExists(cwd, desiredBranch))) return desiredBranch;
		for (let suffix = 1; suffix <= 100; suffix += 1) {
			const candidate = `${desiredBranch}-${suffix}`;
			if (!(yield* branchExists(cwd, candidate))) return candidate;
		}
		return yield* createGitCommandError("GitCore.renameBranch", cwd, [
			"branch",
			"-m",
			"--",
			desiredBranch
		], `Could not find an available branch name for '${desiredBranch}'.`);
	});
	const resolveCurrentUpstream = (cwd) => Effect.gen(function* () {
		const upstreamRef = yield* runGitStdout("GitCore.resolveCurrentUpstream", cwd, [
			"rev-parse",
			"--abbrev-ref",
			"--symbolic-full-name",
			"@{upstream}"
		], true).pipe(Effect.map((stdout) => stdout.trim()));
		if (upstreamRef.length === 0 || upstreamRef === "@{upstream}") return null;
		const separatorIndex = upstreamRef.indexOf("/");
		if (separatorIndex <= 0) return null;
		const remoteName = upstreamRef.slice(0, separatorIndex);
		const upstreamBranch = upstreamRef.slice(separatorIndex + 1);
		if (remoteName.length === 0 || upstreamBranch.length === 0) return null;
		return {
			upstreamRef,
			remoteName,
			upstreamBranch
		};
	});
	const fetchUpstreamRef = (cwd, upstream) => {
		const refspec = `+refs/heads/${upstream.upstreamBranch}:refs/remotes/${upstream.upstreamRef}`;
		return runGit("GitCore.fetchUpstreamRef", cwd, [
			"fetch",
			"--quiet",
			"--no-tags",
			upstream.remoteName,
			refspec
		], true);
	};
	const fetchUpstreamRefForStatus = (cwd, upstream) => {
		const refspec = `+refs/heads/${upstream.upstreamBranch}:refs/remotes/${upstream.upstreamRef}`;
		return executeGit("GitCore.fetchUpstreamRefForStatus", cwd, [
			"fetch",
			"--quiet",
			"--no-tags",
			upstream.remoteName,
			refspec
		], {
			allowNonZeroExit: true,
			timeoutMs: Duration.toMillis(STATUS_UPSTREAM_REFRESH_TIMEOUT)
		}).pipe(Effect.asVoid);
	};
	const statusUpstreamRefreshCache = yield* Cache.makeWith({
		capacity: STATUS_UPSTREAM_REFRESH_CACHE_CAPACITY,
		lookup: (cacheKey) => Effect.gen(function* () {
			yield* fetchUpstreamRefForStatus(cacheKey.cwd, {
				upstreamRef: cacheKey.upstreamRef,
				remoteName: cacheKey.remoteName,
				upstreamBranch: cacheKey.upstreamBranch
			});
			return true;
		}),
		timeToLive: (exit) => Exit.isSuccess(exit) ? STATUS_UPSTREAM_REFRESH_INTERVAL : Duration.zero
	});
	const refreshStatusUpstreamIfStale = (cwd) => Effect.gen(function* () {
		const upstream = yield* resolveCurrentUpstream(cwd);
		if (!upstream) return;
		yield* Cache.get(statusUpstreamRefreshCache, new StatusUpstreamRefreshCacheKey({
			cwd,
			upstreamRef: upstream.upstreamRef,
			remoteName: upstream.remoteName,
			upstreamBranch: upstream.upstreamBranch
		}));
	});
	const refreshCheckedOutBranchUpstream = (cwd) => Effect.gen(function* () {
		const upstream = yield* resolveCurrentUpstream(cwd);
		if (!upstream) return;
		yield* fetchUpstreamRef(cwd, upstream);
	});
	const resolveDefaultBranchName = (cwd) => executeGit("GitCore.resolveDefaultBranchName", cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"], { allowNonZeroExit: true }).pipe(Effect.map((result) => {
		if (result.code !== 0) return null;
		return parseDefaultBranchFromRemoteHeadRef(result.stdout);
	}));
	const remoteBranchExists = (cwd, branch) => executeGit("GitCore.remoteBranchExists", cwd, [
		"show-ref",
		"--verify",
		"--quiet",
		`refs/remotes/origin/${branch}`
	], { allowNonZeroExit: true }).pipe(Effect.map((result) => result.code === 0));
	const originRemoteExists = (cwd) => executeGit("GitCore.originRemoteExists", cwd, [
		"remote",
		"get-url",
		"origin"
	], { allowNonZeroExit: true }).pipe(Effect.map((result) => result.code === 0));
	const resolveBaseBranchForNoUpstream = (cwd, branch) => Effect.gen(function* () {
		const configuredBaseBranch = yield* runGitStdout("GitCore.resolveBaseBranchForNoUpstream.config", cwd, [
			"config",
			"--get",
			`branch.${branch}.gh-merge-base`
		], true).pipe(Effect.map((stdout) => stdout.trim()));
		const defaultBranch = yield* resolveDefaultBranchName(cwd);
		const candidates = [
			configuredBaseBranch.length > 0 ? configuredBaseBranch : null,
			defaultBranch,
			...DEFAULT_BASE_BRANCH_CANDIDATES
		];
		for (const candidate of candidates) {
			if (!candidate) continue;
			const normalizedCandidate = candidate.startsWith("origin/") ? candidate.slice(7) : candidate;
			if (normalizedCandidate.length === 0 || normalizedCandidate === branch) continue;
			if (yield* branchExists(cwd, normalizedCandidate)) return normalizedCandidate;
			if (yield* remoteBranchExists(cwd, normalizedCandidate)) return `origin/${normalizedCandidate}`;
		}
		return null;
	});
	const computeAheadCountAgainstBase = (cwd, branch) => Effect.gen(function* () {
		const baseBranch = yield* resolveBaseBranchForNoUpstream(cwd, branch);
		if (!baseBranch) return 0;
		const result = yield* executeGit("GitCore.computeAheadCountAgainstBase", cwd, [
			"rev-list",
			"--count",
			`${baseBranch}..HEAD`
		], { allowNonZeroExit: true });
		if (result.code !== 0) return 0;
		const parsed = Number.parseInt(result.stdout.trim(), 10);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
	});
	const readBranchRecency = (cwd) => Effect.gen(function* () {
		const branchRecency = yield* executeGit("GitCore.readBranchRecency", cwd, [
			"for-each-ref",
			"--format=%(refname:short)%09%(committerdate:unix)",
			"refs/heads",
			"refs/remotes"
		], {
			timeoutMs: 15e3,
			allowNonZeroExit: true
		});
		const branchLastCommit = /* @__PURE__ */ new Map();
		if (branchRecency.code !== 0) return branchLastCommit;
		for (const line of branchRecency.stdout.split("\n")) {
			if (line.length === 0) continue;
			const [name, lastCommitRaw] = line.split("	");
			if (!name) continue;
			const lastCommit = Number.parseInt(lastCommitRaw ?? "0", 10);
			branchLastCommit.set(name, Number.isFinite(lastCommit) ? lastCommit : 0);
		}
		return branchLastCommit;
	});
	const statusDetails = (cwd) => Effect.gen(function* () {
		yield* refreshStatusUpstreamIfStale(cwd).pipe(Effect.catch(() => Effect.void));
		const [statusStdout, unstagedNumstatStdout, stagedNumstatStdout] = yield* Effect.all([
			runGitStdout("GitCore.statusDetails.status", cwd, [
				"status",
				"--porcelain=2",
				"--branch"
			]),
			runGitStdout("GitCore.statusDetails.unstagedNumstat", cwd, ["diff", "--numstat"]),
			runGitStdout("GitCore.statusDetails.stagedNumstat", cwd, [
				"diff",
				"--cached",
				"--numstat"
			])
		], { concurrency: "unbounded" });
		let branch = null;
		let upstreamRef = null;
		let aheadCount = 0;
		let behindCount = 0;
		let hasWorkingTreeChanges = false;
		const changedFilesWithoutNumstat = /* @__PURE__ */ new Set();
		for (const line of statusStdout.split(/\r?\n/g)) {
			if (line.startsWith("# branch.head ")) {
				const value = line.slice(14).trim();
				branch = value.startsWith("(") ? null : value;
				continue;
			}
			if (line.startsWith("# branch.upstream ")) {
				const value = line.slice(18).trim();
				upstreamRef = value.length > 0 ? value : null;
				continue;
			}
			if (line.startsWith("# branch.ab ")) {
				const parsed = parseBranchAb(line.slice(12).trim());
				aheadCount = parsed.ahead;
				behindCount = parsed.behind;
				continue;
			}
			if (line.trim().length > 0 && !line.startsWith("#")) {
				hasWorkingTreeChanges = true;
				const pathValue = parsePorcelainPath(line);
				if (pathValue) changedFilesWithoutNumstat.add(pathValue);
			}
		}
		if (!upstreamRef && branch) {
			aheadCount = yield* computeAheadCountAgainstBase(cwd, branch).pipe(Effect.catch(() => Effect.succeed(0)));
			behindCount = 0;
		}
		const stagedEntries = parseNumstatEntries(stagedNumstatStdout);
		const unstagedEntries = parseNumstatEntries(unstagedNumstatStdout);
		const fileStatMap = /* @__PURE__ */ new Map();
		for (const entry of [...stagedEntries, ...unstagedEntries]) {
			const existing = fileStatMap.get(entry.path) ?? {
				insertions: 0,
				deletions: 0
			};
			existing.insertions += entry.insertions;
			existing.deletions += entry.deletions;
			fileStatMap.set(entry.path, existing);
		}
		let insertions = 0;
		let deletions = 0;
		const files = Array.from(fileStatMap.entries()).map(([filePath, stat]) => {
			insertions += stat.insertions;
			deletions += stat.deletions;
			return {
				path: filePath,
				insertions: stat.insertions,
				deletions: stat.deletions
			};
		}).toSorted((a, b) => a.path.localeCompare(b.path));
		for (const filePath of changedFilesWithoutNumstat) {
			if (fileStatMap.has(filePath)) continue;
			files.push({
				path: filePath,
				insertions: 0,
				deletions: 0
			});
		}
		files.sort((a, b) => a.path.localeCompare(b.path));
		return {
			branch,
			upstreamRef,
			hasWorkingTreeChanges,
			workingTree: {
				files,
				insertions,
				deletions
			},
			hasUpstream: upstreamRef !== null,
			aheadCount,
			behindCount
		};
	});
	const status = (input) => statusDetails(input.cwd).pipe(Effect.map((details) => ({
		branch: details.branch,
		hasWorkingTreeChanges: details.hasWorkingTreeChanges,
		workingTree: details.workingTree,
		hasUpstream: details.hasUpstream,
		aheadCount: details.aheadCount,
		behindCount: details.behindCount,
		pr: null
	})));
	const prepareCommitContext = (cwd) => Effect.gen(function* () {
		yield* runGit("GitCore.prepareCommitContext.addAll", cwd, ["add", "-A"]);
		const stagedSummary = yield* runGitStdout("GitCore.prepareCommitContext.stagedSummary", cwd, [
			"diff",
			"--cached",
			"--name-status"
		]).pipe(Effect.map((stdout) => stdout.trim()));
		if (stagedSummary.length === 0) return null;
		return {
			stagedSummary,
			stagedPatch: yield* runGitStdout("GitCore.prepareCommitContext.stagedPatch", cwd, [
				"diff",
				"--cached",
				"--patch",
				"--minimal"
			])
		};
	});
	const commit = (cwd, subject, body) => Effect.gen(function* () {
		const args = [
			"commit",
			"-m",
			subject
		];
		const trimmedBody = body.trim();
		if (trimmedBody.length > 0) args.push("-m", trimmedBody);
		yield* runGit("GitCore.commit.commit", cwd, args);
		return { commitSha: yield* runGitStdout("GitCore.commit.revParseHead", cwd, ["rev-parse", "HEAD"]).pipe(Effect.map((stdout) => stdout.trim())) };
	});
	const pushCurrentBranch = (cwd, fallbackBranch) => Effect.gen(function* () {
		const details = yield* statusDetails(cwd);
		const branch = details.branch ?? fallbackBranch;
		if (!branch) return yield* createGitCommandError("GitCore.pushCurrentBranch", cwd, ["push"], "Cannot push from detached HEAD.");
		if (details.aheadCount === 0 && details.behindCount === 0) {
			if (details.hasUpstream) return {
				status: "skipped_up_to_date",
				branch,
				...details.upstreamRef ? { upstreamBranch: details.upstreamRef } : {}
			};
			if (yield* resolveBaseBranchForNoUpstream(cwd, branch).pipe(Effect.catch(() => Effect.succeed(null)))) {
				if (!(yield* originRemoteExists(cwd).pipe(Effect.catch(() => Effect.succeed(false))))) return {
					status: "skipped_up_to_date",
					branch
				};
				if (yield* remoteBranchExists(cwd, branch).pipe(Effect.catch(() => Effect.succeed(false)))) return {
					status: "skipped_up_to_date",
					branch
				};
			}
		}
		if (!details.hasUpstream) {
			yield* runGit("GitCore.pushCurrentBranch.pushWithUpstream", cwd, [
				"push",
				"-u",
				"origin",
				branch
			]);
			return {
				status: "pushed",
				branch,
				upstreamBranch: `origin/${branch}`,
				setUpstream: true
			};
		}
		yield* runGit("GitCore.pushCurrentBranch.push", cwd, ["push"]);
		return {
			status: "pushed",
			branch,
			...details.upstreamRef ? { upstreamBranch: details.upstreamRef } : {},
			setUpstream: false
		};
	});
	const pullCurrentBranch = (cwd) => Effect.gen(function* () {
		const details = yield* statusDetails(cwd);
		const branch = details.branch;
		if (!branch) return yield* createGitCommandError("GitCore.pullCurrentBranch", cwd, ["pull", "--ff-only"], "Cannot pull from detached HEAD.");
		if (!details.hasUpstream) return yield* createGitCommandError("GitCore.pullCurrentBranch", cwd, ["pull", "--ff-only"], "Current branch has no upstream configured. Push with upstream first.");
		const beforeSha = yield* runGitStdout("GitCore.pullCurrentBranch.beforeSha", cwd, ["rev-parse", "HEAD"], true).pipe(Effect.map((stdout) => stdout.trim()));
		yield* executeGit("GitCore.pullCurrentBranch.pull", cwd, ["pull", "--ff-only"], {
			timeoutMs: 3e4,
			fallbackErrorMessage: "git pull failed"
		});
		const afterSha = yield* runGitStdout("GitCore.pullCurrentBranch.afterSha", cwd, ["rev-parse", "HEAD"], true).pipe(Effect.map((stdout) => stdout.trim()));
		const refreshed = yield* statusDetails(cwd);
		return {
			status: beforeSha.length > 0 && beforeSha === afterSha ? "skipped_up_to_date" : "pulled",
			branch,
			upstreamBranch: refreshed.upstreamRef
		};
	});
	const readRangeContext = (cwd, baseBranch) => Effect.gen(function* () {
		const range = `${baseBranch}..HEAD`;
		const [commitSummary, diffSummary, diffPatch] = yield* Effect.all([
			runGitStdout("GitCore.readRangeContext.log", cwd, [
				"log",
				"--oneline",
				range
			]),
			runGitStdout("GitCore.readRangeContext.diffStat", cwd, [
				"diff",
				"--stat",
				range
			]),
			runGitStdout("GitCore.readRangeContext.diffPatch", cwd, [
				"diff",
				"--patch",
				"--minimal",
				range
			])
		], { concurrency: "unbounded" });
		return {
			commitSummary,
			diffSummary,
			diffPatch
		};
	});
	const readConfigValue = (cwd, key) => runGitStdout("GitCore.readConfigValue", cwd, [
		"config",
		"--get",
		key
	], true).pipe(Effect.map((stdout) => stdout.trim()), Effect.map((trimmed) => trimmed.length > 0 ? trimmed : null));
	const listBranches = (input) => Effect.gen(function* () {
		const branchRecencyPromise = readBranchRecency(input.cwd).pipe(Effect.catch(() => Effect.succeed(/* @__PURE__ */ new Map())));
		const localBranchResult = yield* executeGit("GitCore.listBranches.branchNoColor", input.cwd, ["branch", "--no-color"], {
			timeoutMs: 1e4,
			allowNonZeroExit: true
		});
		if (localBranchResult.code !== 0) {
			const stderr = localBranchResult.stderr.trim();
			if (stderr.toLowerCase().includes("not a git repository")) return {
				branches: [],
				isRepo: false
			};
			return yield* createGitCommandError("GitCore.listBranches", input.cwd, ["branch", "--no-color"], stderr || "git branch failed");
		}
		const remoteBranchResultEffect = executeGit("GitCore.listBranches.remoteBranches", input.cwd, [
			"branch",
			"--no-color",
			"--remotes"
		], {
			timeoutMs: 1e4,
			allowNonZeroExit: true
		}).pipe(Effect.catch((error) => Effect.logWarning(`GitCore.listBranches: remote branch lookup failed for ${input.cwd}: ${error.message}. Falling back to an empty remote branch list.`).pipe(Effect.as({
			code: 1,
			stdout: "",
			stderr: ""
		}))));
		const remoteNamesResultEffect = executeGit("GitCore.listBranches.remoteNames", input.cwd, ["remote"], {
			timeoutMs: 5e3,
			allowNonZeroExit: true
		}).pipe(Effect.catch((error) => Effect.logWarning(`GitCore.listBranches: remote name lookup failed for ${input.cwd}: ${error.message}. Falling back to an empty remote name list.`).pipe(Effect.as({
			code: 1,
			stdout: "",
			stderr: ""
		}))));
		const [defaultRef, worktreeList, remoteBranchResult, remoteNamesResult, branchLastCommit] = yield* Effect.all([
			executeGit("GitCore.listBranches.defaultRef", input.cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"], {
				timeoutMs: 5e3,
				allowNonZeroExit: true
			}),
			executeGit("GitCore.listBranches.worktreeList", input.cwd, [
				"worktree",
				"list",
				"--porcelain"
			], {
				timeoutMs: 5e3,
				allowNonZeroExit: true
			}),
			remoteBranchResultEffect,
			remoteNamesResultEffect,
			branchRecencyPromise
		], { concurrency: "unbounded" });
		const remoteNames = remoteNamesResult.code === 0 ? parseRemoteNames(remoteNamesResult.stdout) : [];
		if (remoteBranchResult.code !== 0 && remoteBranchResult.stderr.trim().length > 0) yield* Effect.logWarning(`GitCore.listBranches: remote branch lookup returned code ${remoteBranchResult.code} for ${input.cwd}: ${remoteBranchResult.stderr.trim()}. Falling back to an empty remote branch list.`);
		if (remoteNamesResult.code !== 0 && remoteNamesResult.stderr.trim().length > 0) yield* Effect.logWarning(`GitCore.listBranches: remote name lookup returned code ${remoteNamesResult.code} for ${input.cwd}: ${remoteNamesResult.stderr.trim()}. Falling back to an empty remote name list.`);
		const defaultBranch = defaultRef.code === 0 ? defaultRef.stdout.trim().replace(/^refs\/remotes\/origin\//, "") : null;
		const worktreeMap = /* @__PURE__ */ new Map();
		if (worktreeList.code === 0) {
			let currentPath = null;
			for (const line of worktreeList.stdout.split("\n")) if (line.startsWith("worktree ")) {
				const candidatePath = line.slice(9);
				currentPath = (yield* fileSystem.stat(candidatePath).pipe(Effect.map(() => true), Effect.catch(() => Effect.succeed(false)))) ? candidatePath : null;
			} else if (line.startsWith("branch refs/heads/") && currentPath) worktreeMap.set(line.slice(18), currentPath);
			else if (line === "") currentPath = null;
		}
		const localBranches = localBranchResult.stdout.split("\n").map(parseBranchLine).filter((branch) => branch !== null).map((branch) => ({
			name: branch.name,
			current: branch.current,
			isRemote: false,
			isDefault: branch.name === defaultBranch,
			worktreePath: worktreeMap.get(branch.name) ?? null
		})).toSorted((a, b) => {
			const aPriority = a.current ? 0 : a.isDefault ? 1 : 2;
			const bPriority = b.current ? 0 : b.isDefault ? 1 : 2;
			if (aPriority !== bPriority) return aPriority - bPriority;
			const aLastCommit = branchLastCommit.get(a.name) ?? 0;
			const bLastCommit = branchLastCommit.get(b.name) ?? 0;
			if (aLastCommit !== bLastCommit) return bLastCommit - aLastCommit;
			return a.name.localeCompare(b.name);
		});
		const remoteBranches = remoteBranchResult.code === 0 ? remoteBranchResult.stdout.split("\n").map(parseBranchLine).filter((branch) => branch !== null).map((branch) => {
			const parsedRemoteRef = parseRemoteRefWithRemoteNames(branch.name, remoteNames);
			const remoteBranch = {
				name: branch.name,
				current: false,
				isRemote: true,
				isDefault: false,
				worktreePath: null
			};
			if (parsedRemoteRef) remoteBranch.remoteName = parsedRemoteRef.remoteName;
			return remoteBranch;
		}).toSorted((a, b) => {
			const aLastCommit = branchLastCommit.get(a.name) ?? 0;
			const bLastCommit = branchLastCommit.get(b.name) ?? 0;
			if (aLastCommit !== bLastCommit) return bLastCommit - aLastCommit;
			return a.name.localeCompare(b.name);
		}) : [];
		return {
			branches: [...localBranches, ...remoteBranches],
			isRepo: true
		};
	});
	const createWorktree = (input) => Effect.gen(function* () {
		const sanitizedBranch = input.newBranch.replace(/\//g, "-");
		const repoName = path.basename(input.cwd);
		const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
		const worktreePath = input.path ?? path.join(homeDir, ".t3", "worktrees", repoName, sanitizedBranch);
		yield* executeGit("GitCore.createWorktree", input.cwd, [
			"worktree",
			"add",
			"-b",
			input.newBranch,
			worktreePath,
			input.branch
		], { fallbackErrorMessage: "git worktree add failed" });
		return { worktree: {
			path: worktreePath,
			branch: input.newBranch
		} };
	});
	const removeWorktree = (input) => Effect.gen(function* () {
		const args = ["worktree", "remove"];
		if (input.force) args.push("--force");
		args.push(input.path);
		yield* executeGit("GitCore.removeWorktree", input.cwd, args, {
			timeoutMs: 15e3,
			fallbackErrorMessage: "git worktree remove failed"
		}).pipe(Effect.mapError((error) => createGitCommandError("GitCore.removeWorktree", input.cwd, args, `${commandLabel(args)} failed (cwd: ${input.cwd}): ${error instanceof Error ? error.message : String(error)}`, error)));
	});
	const renameBranch = (input) => Effect.gen(function* () {
		if (input.oldBranch === input.newBranch) return { branch: input.newBranch };
		const targetBranch = yield* resolveAvailableBranchName(input.cwd, input.newBranch);
		yield* executeGit("GitCore.renameBranch", input.cwd, [
			"branch",
			"-m",
			"--",
			input.oldBranch,
			targetBranch
		], {
			timeoutMs: 1e4,
			fallbackErrorMessage: "git branch rename failed"
		});
		return { branch: targetBranch };
	});
	const createBranch = (input) => executeGit("GitCore.createBranch", input.cwd, ["branch", input.branch], {
		timeoutMs: 1e4,
		fallbackErrorMessage: "git branch create failed"
	}).pipe(Effect.asVoid);
	const checkoutBranch = (input) => Effect.gen(function* () {
		const [localInputExists, remoteExists] = yield* Effect.all([executeGit("GitCore.checkoutBranch.localInputExists", input.cwd, [
			"show-ref",
			"--verify",
			"--quiet",
			`refs/heads/${input.branch}`
		], {
			timeoutMs: 5e3,
			allowNonZeroExit: true
		}).pipe(Effect.map((result) => result.code === 0)), executeGit("GitCore.checkoutBranch.remoteExists", input.cwd, [
			"show-ref",
			"--verify",
			"--quiet",
			`refs/remotes/${input.branch}`
		], {
			timeoutMs: 5e3,
			allowNonZeroExit: true
		}).pipe(Effect.map((result) => result.code === 0))], { concurrency: "unbounded" });
		const localTrackingBranch = remoteExists ? yield* executeGit("GitCore.checkoutBranch.localTrackingBranch", input.cwd, [
			"for-each-ref",
			"--format=%(refname:short)	%(upstream:short)",
			"refs/heads"
		], {
			timeoutMs: 5e3,
			allowNonZeroExit: true
		}).pipe(Effect.map((result) => result.code === 0 ? parseTrackingBranchByUpstreamRef(result.stdout, input.branch) : null)) : null;
		const localTrackedBranchCandidate = deriveLocalBranchNameFromRemoteRef(input.branch);
		const localTrackedBranchTargetExists = remoteExists && localTrackedBranchCandidate ? yield* executeGit("GitCore.checkoutBranch.localTrackedBranchTargetExists", input.cwd, [
			"show-ref",
			"--verify",
			"--quiet",
			`refs/heads/${localTrackedBranchCandidate}`
		], {
			timeoutMs: 5e3,
			allowNonZeroExit: true
		}).pipe(Effect.map((result) => result.code === 0)) : false;
		const checkoutArgs = localInputExists ? ["checkout", input.branch] : remoteExists && !localTrackingBranch && localTrackedBranchTargetExists ? ["checkout", input.branch] : remoteExists && !localTrackingBranch ? [
			"checkout",
			"--track",
			input.branch
		] : remoteExists && localTrackingBranch ? ["checkout", localTrackingBranch] : ["checkout", input.branch];
		yield* executeGit("GitCore.checkoutBranch.checkout", input.cwd, checkoutArgs, {
			timeoutMs: 1e4,
			fallbackErrorMessage: "git checkout failed"
		});
		yield* Effect.forkScoped(refreshCheckedOutBranchUpstream(input.cwd).pipe(Effect.catch(() => Effect.void)));
	});
	const initRepo = (input) => executeGit("GitCore.initRepo", input.cwd, ["init"], {
		timeoutMs: 1e4,
		fallbackErrorMessage: "git init failed"
	}).pipe(Effect.asVoid);
	const listLocalBranchNames = (cwd) => runGitStdout("GitCore.listLocalBranchNames", cwd, [
		"branch",
		"--list",
		"--format=%(refname:short)"
	]).pipe(Effect.map((stdout) => stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0)));
	return {
		status,
		statusDetails,
		prepareCommitContext,
		commit,
		pushCurrentBranch,
		pullCurrentBranch,
		readRangeContext,
		readConfigValue,
		listBranches,
		createWorktree,
		removeWorktree,
		renameBranch,
		createBranch,
		checkoutBranch,
		initRepo,
		listLocalBranchNames
	};
});
const GitCoreLive = Layer.effect(GitCore, makeGitCore);

//#endregion
//#region src/git/Layers/GitHubCli.ts
const DEFAULT_TIMEOUT_MS$1 = 3e4;
function normalizeGitHubCliError(operation, error) {
	if (error instanceof Error) {
		if (error.message.includes("Command not found: gh")) return new GitHubCliError({
			operation,
			detail: "GitHub CLI (`gh`) is required but not available on PATH.",
			cause: error
		});
		const lower = error.message.toLowerCase();
		if (lower.includes("authentication failed") || lower.includes("not logged in") || lower.includes("gh auth login") || lower.includes("no oauth token")) return new GitHubCliError({
			operation,
			detail: "GitHub CLI is not authenticated. Run `gh auth login` and retry.",
			cause: error
		});
		return new GitHubCliError({
			operation,
			detail: `GitHub CLI command failed: ${error.message}`,
			cause: error
		});
	}
	return new GitHubCliError({
		operation,
		detail: "GitHub CLI command failed.",
		cause: error
	});
}
function parseOpenPullRequests(raw) {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return [];
	const parsed = JSON.parse(trimmed);
	if (!Array.isArray(parsed)) throw new Error("GitHub CLI returned non-array JSON.");
	const result = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== "object") continue;
		const record = entry;
		const number = record.number;
		const title = record.title;
		const url = record.url;
		const baseRefName = record.baseRefName;
		const headRefName = record.headRefName;
		if (typeof number !== "number" || !Number.isInteger(number) || number <= 0 || typeof title !== "string" || typeof url !== "string" || typeof baseRefName !== "string" || typeof headRefName !== "string") continue;
		result.push({
			number,
			title,
			url,
			baseRefName,
			headRefName
		});
	}
	return result;
}
const makeGitHubCli = Effect.sync(() => {
	const execute = (input) => Effect.tryPromise({
		try: () => runProcess("gh", input.args, {
			cwd: input.cwd,
			timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS$1
		}),
		catch: (error) => normalizeGitHubCliError("execute", error)
	});
	return {
		execute,
		listOpenPullRequests: (input) => execute({
			cwd: input.cwd,
			args: [
				"pr",
				"list",
				"--head",
				input.headBranch,
				"--state",
				"open",
				"--limit",
				String(input.limit ?? 1),
				"--json",
				"number,title,url,baseRefName,headRefName"
			]
		}).pipe(Effect.map((result) => result.stdout), Effect.flatMap((raw) => Effect.try({
			try: () => parseOpenPullRequests(raw),
			catch: (error) => new GitHubCliError({
				operation: "listOpenPullRequests",
				detail: error instanceof Error ? `GitHub CLI returned invalid PR list JSON: ${error.message}` : "GitHub CLI returned invalid PR list JSON.",
				...error !== void 0 ? { cause: error } : {}
			})
		}))),
		createPullRequest: (input) => execute({
			cwd: input.cwd,
			args: [
				"pr",
				"create",
				"--base",
				input.baseBranch,
				"--head",
				input.headBranch,
				"--title",
				input.title,
				"--body-file",
				input.bodyFile
			]
		}).pipe(Effect.asVoid),
		getDefaultBranch: (input) => execute({
			cwd: input.cwd,
			args: [
				"repo",
				"view",
				"--json",
				"defaultBranchRef",
				"--jq",
				".defaultBranchRef.name"
			]
		}).pipe(Effect.map((value) => {
			const trimmed = value.stdout.trim();
			return trimmed.length > 0 ? trimmed : null;
		}))
	};
});
const GitHubCliLive = Layer.effect(GitHubCli, makeGitHubCli);

//#endregion
//#region src/git/Layers/CodexTextGeneration.ts
const CODEX_MODEL = "gpt-5.3-codex";
const CODEX_REASONING_EFFORT = "low";
const CODEX_TIMEOUT_MS = 18e4;
function toCodexOutputJsonSchema(schema) {
	const document = Schema.toJsonSchemaDocument(schema);
	if (document.definitions && Object.keys(document.definitions).length > 0) return {
		...document.schema,
		$defs: document.definitions
	};
	return document.schema;
}
function normalizeCodexError(operation, error, fallback) {
	if (Schema.is(TextGenerationError)(error)) return error;
	if (error instanceof Error) {
		const lower = error.message.toLowerCase();
		if (error.message.includes("Command not found: codex") || lower.includes("spawn codex") || lower.includes("enoent")) return new TextGenerationError({
			operation,
			detail: "Codex CLI (`codex`) is required but not available on PATH.",
			cause: error
		});
		return new TextGenerationError({
			operation,
			detail: `${fallback}: ${error.message}`,
			cause: error
		});
	}
	return new TextGenerationError({
		operation,
		detail: fallback,
		cause: error
	});
}
function limitSection(value, maxChars) {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars)}\n\n[truncated]`;
}
function sanitizeCommitSubject(raw) {
	const withoutTrailingPeriod = (raw.trim().split(/\r?\n/g)[0]?.trim() ?? "").replace(/[.]+$/g, "").trim();
	if (withoutTrailingPeriod.length === 0) return "Update project files";
	if (withoutTrailingPeriod.length <= 72) return withoutTrailingPeriod;
	return withoutTrailingPeriod.slice(0, 72).trimEnd();
}
function sanitizePrTitle(raw) {
	const singleLine = raw.trim().split(/\r?\n/g)[0]?.trim() ?? "";
	if (singleLine.length > 0) return singleLine;
	return "Update project changes";
}
const makeCodexTextGeneration = Effect.gen(function* () {
	const fileSystem = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const commandSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const serverConfig = yield* Effect.service(ServerConfig$1);
	const readStreamAsString = (operation, stream) => Effect.gen(function* () {
		let text = "";
		yield* Stream.runForEach(stream, (chunk) => Effect.sync(() => {
			text += Buffer.from(chunk).toString("utf8");
		})).pipe(Effect.mapError((cause) => normalizeCodexError(operation, cause, "Failed to collect process output")));
		return text;
	});
	const tempDir = process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? "/tmp";
	const writeTempFile = (operation, prefix, content) => {
		const filePath = path.join(tempDir, `t3code-${prefix}-${process.pid}-${randomUUID()}.tmp`);
		return fileSystem.writeFileString(filePath, content).pipe(Effect.mapError((cause) => new TextGenerationError({
			operation,
			detail: `Failed to write temp file at ${filePath}.`,
			cause
		})), Effect.as(filePath));
	};
	const safeUnlink = (filePath) => fileSystem.remove(filePath).pipe(Effect.catch(() => Effect.void));
	const materializeImageAttachments = (_operation, attachments) => Effect.gen(function* () {
		if (!attachments || attachments.length === 0) return { imagePaths: [] };
		const imagePaths = [];
		for (const attachment of attachments) {
			if (attachment.type !== "image") continue;
			const resolvedPath = resolveAttachmentPath({
				stateDir: serverConfig.stateDir,
				attachment
			});
			if (!resolvedPath || !path.isAbsolute(resolvedPath)) continue;
			const fileInfo = yield* fileSystem.stat(resolvedPath).pipe(Effect.catch(() => Effect.succeed(null)));
			if (!fileInfo || fileInfo.type !== "File") continue;
			imagePaths.push(resolvedPath);
		}
		return { imagePaths };
	});
	const runCodexJson = ({ operation, cwd, prompt, outputSchemaJson, imagePaths = [], cleanupPaths = [] }) => Effect.gen(function* () {
		const schemaPath = yield* writeTempFile(operation, "codex-schema", JSON.stringify(toCodexOutputJsonSchema(outputSchemaJson)));
		const outputPath = yield* writeTempFile(operation, "codex-output", "");
		const runCodexCommand = Effect.gen(function* () {
			const command = ChildProcess.make("codex", [
				"exec",
				"--ephemeral",
				"-s",
				"read-only",
				"--model",
				CODEX_MODEL,
				"--config",
				`model_reasoning_effort="${CODEX_REASONING_EFFORT}"`,
				"--output-schema",
				schemaPath,
				"--output-last-message",
				outputPath,
				...imagePaths.flatMap((imagePath) => ["--image", imagePath]),
				"-"
			], {
				cwd,
				shell: process.platform === "win32",
				stdin: { stream: Stream.make(new TextEncoder().encode(prompt)) }
			});
			const child = yield* commandSpawner.spawn(command).pipe(Effect.mapError((cause) => normalizeCodexError(operation, cause, "Failed to spawn Codex CLI process")));
			const [stdout, stderr, exitCode] = yield* Effect.all([
				readStreamAsString(operation, child.stdout),
				readStreamAsString(operation, child.stderr),
				child.exitCode.pipe(Effect.map((value) => Number(value)), Effect.mapError((cause) => normalizeCodexError(operation, cause, "Failed to read Codex CLI exit code")))
			], { concurrency: "unbounded" });
			if (exitCode !== 0) {
				const stderrDetail = stderr.trim();
				const stdoutDetail = stdout.trim();
				const detail = stderrDetail.length > 0 ? stderrDetail : stdoutDetail;
				return yield* new TextGenerationError({
					operation,
					detail: detail.length > 0 ? `Codex CLI command failed: ${detail}` : `Codex CLI command failed with code ${exitCode}.`
				});
			}
		});
		const cleanup = Effect.all([
			schemaPath,
			outputPath,
			...cleanupPaths
		].map((filePath) => safeUnlink(filePath)), { concurrency: "unbounded" }).pipe(Effect.asVoid);
		return yield* Effect.gen(function* () {
			yield* runCodexCommand.pipe(Effect.scoped, Effect.timeoutOption(CODEX_TIMEOUT_MS), Effect.flatMap(Option.match({
				onNone: () => Effect.fail(new TextGenerationError({
					operation,
					detail: "Codex CLI request timed out."
				})),
				onSome: () => Effect.void
			})));
			return yield* fileSystem.readFileString(outputPath).pipe(Effect.mapError((cause) => new TextGenerationError({
				operation,
				detail: "Failed to read Codex output file.",
				cause
			})), Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(outputSchemaJson))), Effect.catchTag("SchemaError", (cause) => Effect.fail(new TextGenerationError({
				operation,
				detail: "Codex returned invalid structured output.",
				cause
			}))));
		}).pipe(Effect.ensuring(cleanup));
	});
	const generateCommitMessage = (input) => {
		const wantsBranch = input.includeBranch === true;
		const prompt = [
			"You write concise git commit messages.",
			wantsBranch ? "Return a JSON object with keys: subject, body, branch." : "Return a JSON object with keys: subject, body.",
			"Rules:",
			"- subject must be imperative, <= 72 chars, and no trailing period",
			"- body can be empty string or short bullet points",
			...wantsBranch ? ["- branch must be a short semantic git branch fragment for this change"] : [],
			"- capture the primary user-visible or developer-visible change",
			"",
			`Branch: ${input.branch ?? "(detached)"}`,
			"",
			"Staged files:",
			limitSection(input.stagedSummary, 6e3),
			"",
			"Staged patch:",
			limitSection(input.stagedPatch, 4e4)
		].join("\n");
		const outputSchemaJson = wantsBranch ? Schema.Struct({
			subject: Schema.String,
			body: Schema.String,
			branch: Schema.String
		}) : Schema.Struct({
			subject: Schema.String,
			body: Schema.String
		});
		return runCodexJson({
			operation: "generateCommitMessage",
			cwd: input.cwd,
			prompt,
			outputSchemaJson
		}).pipe(Effect.map((generated) => ({
			subject: sanitizeCommitSubject(generated.subject),
			body: generated.body.trim(),
			..."branch" in generated && typeof generated.branch === "string" ? { branch: sanitizeFeatureBranchName(generated.branch) } : {}
		})));
	};
	const generatePrContent = (input) => {
		const prompt = [
			"You write GitHub pull request content.",
			"Return a JSON object with keys: title, body.",
			"Rules:",
			"- title should be concise and specific",
			"- body must be markdown and include headings '## Summary' and '## Testing'",
			"- under Summary, provide short bullet points",
			"- under Testing, include bullet points with concrete checks or 'Not run' where appropriate",
			"",
			`Base branch: ${input.baseBranch}`,
			`Head branch: ${input.headBranch}`,
			"",
			"Commits:",
			limitSection(input.commitSummary, 12e3),
			"",
			"Diff stat:",
			limitSection(input.diffSummary, 12e3),
			"",
			"Diff patch:",
			limitSection(input.diffPatch, 4e4)
		].join("\n");
		return runCodexJson({
			operation: "generatePrContent",
			cwd: input.cwd,
			prompt,
			outputSchemaJson: Schema.Struct({
				title: Schema.String,
				body: Schema.String
			})
		}).pipe(Effect.map((generated) => ({
			title: sanitizePrTitle(generated.title),
			body: generated.body.trim()
		})));
	};
	const generateBranchName = (input) => {
		return Effect.gen(function* () {
			const { imagePaths } = yield* materializeImageAttachments("generateBranchName", input.attachments);
			const attachmentLines = (input.attachments ?? []).map((attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`);
			const promptSections = [
				"You generate concise git branch names.",
				"Return a JSON object with key: branch.",
				"Rules:",
				"- Branch should describe the requested work from the user message.",
				"- Keep it short and specific (2-6 words).",
				"- Use plain words only, no issue prefixes and no punctuation-heavy text.",
				"- If images are attached, use them as primary context for visual/UI issues.",
				"",
				"User message:",
				limitSection(input.message, 8e3)
			];
			if (attachmentLines.length > 0) promptSections.push("", "Attachment metadata:", limitSection(attachmentLines.join("\n"), 4e3));
			const prompt = promptSections.join("\n");
			return { branch: sanitizeBranchFragment((yield* runCodexJson({
				operation: "generateBranchName",
				cwd: input.cwd,
				prompt,
				outputSchemaJson: Schema.Struct({ branch: Schema.String }),
				imagePaths
			})).branch) };
		});
	};
	return {
		generateCommitMessage,
		generatePrContent,
		generateBranchName
	};
});
const CodexTextGenerationLive = Layer.effect(TextGeneration, makeCodexTextGeneration);

//#endregion
//#region src/terminal/Layers/BunPTY.ts
var BunPtyProcess = class {
	dataListeners = /* @__PURE__ */ new Set();
	exitListeners = /* @__PURE__ */ new Set();
	decoder = new TextDecoder();
	didExit = false;
	constructor(process) {
		this.process = process;
		this.process.exited.then((exitCode) => {
			this.emitExit({
				exitCode: Number.isInteger(exitCode) ? exitCode : 0,
				signal: typeof this.process.signalCode === "number" ? this.process.signalCode : null
			});
		}).catch(() => {
			this.emitExit({
				exitCode: 1,
				signal: null
			});
		});
	}
	get pid() {
		return this.process.pid;
	}
	write(data) {
		if (!this.process.terminal) throw new Error("Bun PTY terminal handle is unavailable");
		this.process.terminal.write(data);
	}
	resize(cols, rows) {
		if (!this.process.terminal?.resize) throw new Error("Bun PTY resize is unavailable");
		this.process.terminal.resize(cols, rows);
	}
	kill(signal) {
		if (!signal) {
			this.process.kill();
			return;
		}
		this.process.kill(signal);
	}
	onData(callback) {
		this.dataListeners.add(callback);
		return () => {
			this.dataListeners.delete(callback);
		};
	}
	onExit(callback) {
		this.exitListeners.add(callback);
		return () => {
			this.exitListeners.delete(callback);
		};
	}
	emitData(data) {
		if (this.didExit) return;
		const text = this.decoder.decode(data, { stream: true });
		if (text.length === 0) return;
		for (const listener of this.dataListeners) listener(text);
	}
	emitExit(event) {
		if (this.didExit) return;
		this.didExit = true;
		const remainder = this.decoder.decode();
		if (remainder.length > 0) for (const listener of this.dataListeners) listener(remainder);
		for (const listener of this.exitListeners) listener(event);
	}
};
const BunPtyAdapterLive = Layer.effect(PtyAdapter, Effect.gen(function* () {
	if (process.platform === "win32") return yield* Effect.die("Bun PTY terminal support is unavailable on Windows.");
	return { spawn: (input) => Effect.sync(() => {
		let processHandle = null;
		const command = [input.shell, ...input.args ?? []];
		processHandle = new BunPtyProcess(Bun.spawn(command, {
			cwd: input.cwd,
			env: input.env,
			terminal: {
				cols: input.cols,
				rows: input.rows,
				data: (_terminal, data) => {
					processHandle?.emitData(data);
				}
			}
		}));
		return processHandle;
	}) };
}));

//#endregion
//#region src/terminal/Layers/NodePTY.ts
let didEnsureSpawnHelperExecutable = false;
const resolveNodePtySpawnHelperPath = Effect.gen(function* () {
	const requireForNodePty = createRequire(import.meta.url);
	const path = yield* Path.Path;
	const fs = yield* FileSystem.FileSystem;
	const packageJsonPath = requireForNodePty.resolve("node-pty/package.json");
	const packageDir = path.dirname(packageJsonPath);
	const candidates = [
		path.join(packageDir, "build", "Release", "spawn-helper"),
		path.join(packageDir, "build", "Debug", "spawn-helper"),
		path.join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper")
	];
	for (const candidate of candidates) if (yield* fs.exists(candidate)) return candidate;
	return null;
}).pipe(Effect.orElseSucceed(() => null));
const ensureNodePtySpawnHelperExecutable = Effect.fn(function* (explicitPath) {
	const fs = yield* FileSystem.FileSystem;
	if (process.platform === "win32") return;
	if (!explicitPath && didEnsureSpawnHelperExecutable) return;
	const helperPath = explicitPath ?? (yield* resolveNodePtySpawnHelperPath);
	if (!helperPath) return;
	if (!explicitPath) didEnsureSpawnHelperExecutable = true;
	if (!(yield* fs.exists(helperPath))) return;
	yield* fs.chmod(helperPath, 493).pipe(Effect.orElseSucceed(() => void 0));
});
var NodePtyProcess = class {
	constructor(process) {
		this.process = process;
	}
	get pid() {
		return this.process.pid;
	}
	write(data) {
		this.process.write(data);
	}
	resize(cols, rows) {
		this.process.resize(cols, rows);
	}
	kill(signal) {
		this.process.kill(signal);
	}
	onData(callback) {
		const disposable = this.process.onData(callback);
		return () => {
			disposable.dispose();
		};
	}
	onExit(callback) {
		const disposable = this.process.onExit((event) => {
			callback({
				exitCode: event.exitCode,
				signal: event.signal ?? null
			});
		});
		return () => {
			disposable.dispose();
		};
	}
};
const NodePtyAdapterLive = Layer.effect(PtyAdapter, Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const nodePty = yield* Effect.promise(() => import("node-pty"));
	const ensureNodePtySpawnHelperExecutableCached = yield* Effect.cached(ensureNodePtySpawnHelperExecutable().pipe(Effect.provideService(FileSystem.FileSystem, fs), Effect.provideService(Path.Path, path), Effect.orElseSucceed(() => void 0)));
	return { spawn: Effect.fn(function* (input) {
		yield* ensureNodePtySpawnHelperExecutableCached;
		return new NodePtyProcess(nodePty.spawn(input.shell, input.args ?? [], {
			cwd: input.cwd,
			cols: input.cols,
			rows: input.rows,
			env: input.env,
			name: globalThis.process.platform === "win32" ? "xterm-color" : "xterm-256color"
		}));
	}) };
}));

//#endregion
//#region src/serverLayers.ts
function makeServerProviderLayer() {
	return Effect.gen(function* () {
		const { stateDir } = yield* ServerConfig$1;
		const providerLogsDir = path.join(stateDir, "logs", "provider");
		const providerEventLogPath = path.join(providerLogsDir, "events.log");
		const nativeEventLogger = yield* makeEventNdjsonLogger(providerEventLogPath, { stream: "native" });
		const canonicalEventLogger = yield* makeEventNdjsonLogger(providerEventLogPath, { stream: "canonical" });
		const providerSessionDirectoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(ProviderSessionRuntimeRepositoryLive));
		const codexAdapterLayer = makeCodexAdapterLive(nativeEventLogger ? { nativeEventLogger } : void 0);
		const adapterRegistryLayer = ProviderAdapterRegistryLive.pipe(Layer.provide(codexAdapterLayer), Layer.provideMerge(providerSessionDirectoryLayer));
		return makeProviderServiceLive(canonicalEventLogger ? { canonicalEventLogger } : void 0).pipe(Layer.provide(adapterRegistryLayer), Layer.provide(providerSessionDirectoryLayer));
	}).pipe(Layer.unwrap);
}
function makeServerRuntimeServicesLayer() {
	const gitCoreLayer = GitCoreLive.pipe(Layer.provideMerge(GitServiceLive));
	const textGenerationLayer = CodexTextGenerationLive;
	const orchestrationLayer = OrchestrationEngineLive.pipe(Layer.provide(OrchestrationProjectionPipelineLive), Layer.provide(OrchestrationEventStoreLive), Layer.provide(OrchestrationCommandReceiptRepositoryLive));
	const checkpointDiffQueryLayer = CheckpointDiffQueryLive.pipe(Layer.provideMerge(OrchestrationProjectionSnapshotQueryLive), Layer.provideMerge(CheckpointStoreLive));
	const runtimeServicesLayer = Layer.mergeAll(orchestrationLayer, OrchestrationProjectionSnapshotQueryLive, CheckpointStoreLive, checkpointDiffQueryLayer);
	const runtimeIngestionLayer = ProviderRuntimeIngestionLive.pipe(Layer.provideMerge(runtimeServicesLayer));
	const providerCommandReactorLayer = ProviderCommandReactorLive.pipe(Layer.provideMerge(runtimeServicesLayer), Layer.provideMerge(gitCoreLayer), Layer.provideMerge(textGenerationLayer));
	const checkpointReactorLayer = CheckpointReactorLive.pipe(Layer.provideMerge(runtimeServicesLayer));
	const orchestrationReactorLayer = OrchestrationReactorLive.pipe(Layer.provideMerge(runtimeIngestionLayer), Layer.provideMerge(providerCommandReactorLayer), Layer.provideMerge(checkpointReactorLayer));
	const terminalLayer = TerminalManagerLive.pipe(Layer.provide(typeof Bun !== "undefined" && process.platform !== "win32" ? BunPtyAdapterLive : NodePtyAdapterLive));
	const gitManagerLayer = GitManagerLive.pipe(Layer.provideMerge(gitCoreLayer), Layer.provideMerge(GitHubCliLive), Layer.provideMerge(textGenerationLayer));
	return Layer.mergeAll(orchestrationReactorLayer, gitCoreLayer, gitManagerLayer, terminalLayer, KeybindingsLive).pipe(Layer.provideMerge(NodeServices.layer));
}

//#endregion
//#region src/provider/Services/ProviderHealth.ts
var ProviderHealth = class extends ServiceMap.Service()("t3/provider/Services/ProviderHealth") {};

//#endregion
//#region src/provider/Layers/ProviderHealth.ts
const DEFAULT_TIMEOUT_MS = 4e3;
const CODEX_PROVIDER = "codex";
function nonEmptyTrimmed(value) {
	if (!value) return void 0;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : void 0;
}
function isCommandMissingCause(error) {
	if (!(error instanceof Error)) return false;
	const lower = error.message.toLowerCase();
	return lower.includes("command not found: codex") || lower.includes("spawn codex enoent") || lower.includes("enoent") || lower.includes("notfound");
}
function detailFromResult(result) {
	if (result.timedOut) return "Timed out while running command.";
	const stderr = nonEmptyTrimmed(result.stderr);
	if (stderr) return stderr;
	const stdout = nonEmptyTrimmed(result.stdout);
	if (stdout) return stdout;
	if (result.code !== 0) return `Command exited with code ${result.code}.`;
}
function extractAuthBoolean(value) {
	if (Array.isArray(value)) {
		for (const entry of value) {
			const nested = extractAuthBoolean(entry);
			if (nested !== void 0) return nested;
		}
		return;
	}
	if (!value || typeof value !== "object") return void 0;
	const record = value;
	for (const key of [
		"authenticated",
		"isAuthenticated",
		"loggedIn",
		"isLoggedIn"
	]) if (typeof record[key] === "boolean") return record[key];
	for (const key of [
		"auth",
		"status",
		"session",
		"account"
	]) {
		const nested = extractAuthBoolean(record[key]);
		if (nested !== void 0) return nested;
	}
}
function parseAuthStatusFromOutput(result) {
	const lowerOutput = `${result.stdout}\n${result.stderr}`.toLowerCase();
	if (lowerOutput.includes("unknown command") || lowerOutput.includes("unrecognized command") || lowerOutput.includes("unexpected argument")) return {
		status: "warning",
		authStatus: "unknown",
		message: "Codex CLI authentication status command is unavailable in this Codex version."
	};
	if (lowerOutput.includes("not logged in") || lowerOutput.includes("login required") || lowerOutput.includes("authentication required") || lowerOutput.includes("run `codex login`") || lowerOutput.includes("run codex login")) return {
		status: "error",
		authStatus: "unauthenticated",
		message: "Codex CLI is not authenticated. Run `codex login` and try again."
	};
	const parsedAuth = (() => {
		const trimmed = result.stdout.trim();
		if (!trimmed || !trimmed.startsWith("{") && !trimmed.startsWith("[")) return {
			attemptedJsonParse: false,
			auth: void 0
		};
		try {
			return {
				attemptedJsonParse: true,
				auth: extractAuthBoolean(JSON.parse(trimmed))
			};
		} catch {
			return {
				attemptedJsonParse: false,
				auth: void 0
			};
		}
	})();
	if (parsedAuth.auth === true) return {
		status: "ready",
		authStatus: "authenticated"
	};
	if (parsedAuth.auth === false) return {
		status: "error",
		authStatus: "unauthenticated",
		message: "Codex CLI is not authenticated. Run `codex login` and try again."
	};
	if (parsedAuth.attemptedJsonParse) return {
		status: "warning",
		authStatus: "unknown",
		message: "Could not verify Codex authentication status from JSON output (missing auth marker)."
	};
	if (result.code === 0) return {
		status: "ready",
		authStatus: "authenticated"
	};
	const detail = detailFromResult(result);
	return {
		status: "warning",
		authStatus: "unknown",
		message: detail ? `Could not verify Codex authentication status. ${detail}` : "Could not verify Codex authentication status."
	};
}
const collectStreamAsString = (stream) => Stream.runFold(stream, () => "", (acc, chunk) => acc + new TextDecoder().decode(chunk));
const runCodexCommand = (args) => Effect.gen(function* () {
	const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
	const command = ChildProcess.make("codex", [...args], { shell: process.platform === "win32" });
	const child = yield* spawner.spawn(command);
	const [stdout, stderr, exitCode] = yield* Effect.all([
		collectStreamAsString(child.stdout),
		collectStreamAsString(child.stderr),
		child.exitCode.pipe(Effect.map(Number))
	], { concurrency: "unbounded" });
	return {
		stdout,
		stderr,
		code: exitCode
	};
}).pipe(Effect.scoped);
const checkCodexProviderStatus = Effect.gen(function* () {
	const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
	const versionProbe = yield* runCodexCommand(["--version"]).pipe(Effect.timeoutOption(DEFAULT_TIMEOUT_MS), Effect.result);
	if (Result.isFailure(versionProbe)) {
		const error = versionProbe.failure;
		return {
			provider: CODEX_PROVIDER,
			status: "error",
			available: false,
			authStatus: "unknown",
			checkedAt,
			message: isCommandMissingCause(error) ? "Codex CLI (`codex`) is not installed or not on PATH." : `Failed to execute Codex CLI health check: ${error instanceof Error ? error.message : String(error)}.`
		};
	}
	if (Option.isNone(versionProbe.success)) return {
		provider: CODEX_PROVIDER,
		status: "error",
		available: false,
		authStatus: "unknown",
		checkedAt,
		message: "Codex CLI is installed but failed to run. Timed out while running command."
	};
	const version = versionProbe.success.value;
	if (version.code !== 0) {
		const detail = detailFromResult(version);
		return {
			provider: CODEX_PROVIDER,
			status: "error",
			available: false,
			authStatus: "unknown",
			checkedAt,
			message: detail ? `Codex CLI is installed but failed to run. ${detail}` : "Codex CLI is installed but failed to run."
		};
	}
	const authProbe = yield* runCodexCommand(["login", "status"]).pipe(Effect.timeoutOption(DEFAULT_TIMEOUT_MS), Effect.result);
	if (Result.isFailure(authProbe)) {
		const error = authProbe.failure;
		return {
			provider: CODEX_PROVIDER,
			status: "warning",
			available: true,
			authStatus: "unknown",
			checkedAt,
			message: error instanceof Error ? `Could not verify Codex authentication status: ${error.message}.` : "Could not verify Codex authentication status."
		};
	}
	if (Option.isNone(authProbe.success)) return {
		provider: CODEX_PROVIDER,
		status: "warning",
		available: true,
		authStatus: "unknown",
		checkedAt,
		message: "Could not verify Codex authentication status. Timed out while running command."
	};
	const parsed = parseAuthStatusFromOutput(authProbe.success.value);
	return {
		provider: CODEX_PROVIDER,
		status: parsed.status,
		available: true,
		authStatus: parsed.authStatus,
		checkedAt,
		...parsed.message ? { message: parsed.message } : {}
	};
});
const ProviderHealthLive = Layer.effect(ProviderHealth, Effect.gen(function* () {
	const codexStatus = yield* checkCodexProviderStatus;
	return { getStatuses: Effect.succeed([codexStatus]) };
}));

//#endregion
//#region src/workspaceEntries.ts
const WORKSPACE_CACHE_TTL_MS = 15e3;
const WORKSPACE_CACHE_MAX_KEYS = 4;
const WORKSPACE_INDEX_MAX_ENTRIES = 25e3;
const WORKSPACE_SCAN_READDIR_CONCURRENCY = 32;
const GIT_CHECK_IGNORE_MAX_STDIN_BYTES = 256 * 1024;
const IGNORED_DIRECTORY_NAMES = new Set([
	".git",
	".convex",
	"node_modules",
	".next",
	".turbo",
	"dist",
	"build",
	"out",
	".cache"
]);
const workspaceIndexCache = /* @__PURE__ */ new Map();
const inFlightWorkspaceIndexBuilds = /* @__PURE__ */ new Map();
function toPosixPath(input) {
	return input.split(path.sep).join("/");
}
function parentPathOf(input) {
	const separatorIndex = input.lastIndexOf("/");
	if (separatorIndex === -1) return;
	return input.slice(0, separatorIndex);
}
function basenameOf(input) {
	const separatorIndex = input.lastIndexOf("/");
	if (separatorIndex === -1) return input;
	return input.slice(separatorIndex + 1);
}
function normalizeQuery(input) {
	return input.trim().replace(/^[@./]+/, "").toLowerCase();
}
function scoreEntry(entry, query) {
	if (!query) return entry.kind === "directory" ? 0 : 1;
	const normalizedPath = entry.path.toLowerCase();
	const normalizedName = basenameOf(normalizedPath);
	if (normalizedName === query) return 0;
	if (normalizedPath === query) return 1;
	if (normalizedName.startsWith(query)) return 2;
	if (normalizedPath.startsWith(query)) return 3;
	if (normalizedPath.includes(`/${query}`)) return 4;
	return 5;
}
function isPathInIgnoredDirectory(relativePath) {
	const firstSegment = relativePath.split("/")[0];
	if (!firstSegment) return false;
	return IGNORED_DIRECTORY_NAMES.has(firstSegment);
}
function splitNullSeparatedPaths(input, truncated) {
	const parts = input.split("\0");
	if (parts.length === 0) return [];
	if (truncated && parts[parts.length - 1]?.length) parts.pop();
	return parts.filter((value) => value.length > 0);
}
function directoryAncestorsOf(relativePath) {
	const segments = relativePath.split("/").filter((segment) => segment.length > 0);
	if (segments.length <= 1) return [];
	const directories = [];
	for (let index = 1; index < segments.length; index += 1) directories.push(segments.slice(0, index).join("/"));
	return directories;
}
async function mapWithConcurrency(items, concurrency, mapper) {
	if (items.length === 0) return [];
	const boundedConcurrency = Math.max(1, Math.min(concurrency, items.length));
	const results = Array.from({ length: items.length });
	let nextIndex = 0;
	const workers = Array.from({ length: boundedConcurrency }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	});
	await Promise.all(workers);
	return results;
}
async function isInsideGitWorkTree(cwd) {
	const insideWorkTree = await runProcess("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd,
		allowNonZeroExit: true,
		timeoutMs: 5e3,
		maxBufferBytes: 4096
	}).catch(() => null);
	return Boolean(insideWorkTree && insideWorkTree.code === 0 && insideWorkTree.stdout.trim() === "true");
}
async function filterGitIgnoredPaths(cwd, relativePaths) {
	if (relativePaths.length === 0) return relativePaths;
	const ignoredPaths = /* @__PURE__ */ new Set();
	let chunk = [];
	let chunkBytes = 0;
	const flushChunk = async () => {
		if (chunk.length === 0) return true;
		const checkIgnore = await runProcess("git", [
			"check-ignore",
			"--no-index",
			"-z",
			"--stdin"
		], {
			cwd,
			allowNonZeroExit: true,
			timeoutMs: 2e4,
			maxBufferBytes: 16 * 1024 * 1024,
			outputMode: "truncate",
			stdin: `${chunk.join("\0")}\0`
		}).catch(() => null);
		chunk = [];
		chunkBytes = 0;
		if (!checkIgnore) return false;
		if (checkIgnore.code !== 0 && checkIgnore.code !== 1) return false;
		const matchedIgnoredPaths = splitNullSeparatedPaths(checkIgnore.stdout, Boolean(checkIgnore.stdoutTruncated));
		for (const ignoredPath of matchedIgnoredPaths) ignoredPaths.add(ignoredPath);
		return true;
	};
	for (const relativePath of relativePaths) {
		const relativePathBytes = Buffer.byteLength(relativePath) + 1;
		if (chunk.length > 0 && chunkBytes + relativePathBytes > GIT_CHECK_IGNORE_MAX_STDIN_BYTES && !await flushChunk()) return relativePaths;
		chunk.push(relativePath);
		chunkBytes += relativePathBytes;
		if (chunkBytes >= GIT_CHECK_IGNORE_MAX_STDIN_BYTES && !await flushChunk()) return relativePaths;
	}
	if (!await flushChunk()) return relativePaths;
	if (ignoredPaths.size === 0) return relativePaths;
	return relativePaths.filter((relativePath) => !ignoredPaths.has(relativePath));
}
async function buildWorkspaceIndexFromGit(cwd) {
	if (!await isInsideGitWorkTree(cwd)) return null;
	const listedFiles = await runProcess("git", [
		"ls-files",
		"--cached",
		"--others",
		"--exclude-standard",
		"-z"
	], {
		cwd,
		allowNonZeroExit: true,
		timeoutMs: 2e4,
		maxBufferBytes: 16 * 1024 * 1024,
		outputMode: "truncate"
	}).catch(() => null);
	if (!listedFiles || listedFiles.code !== 0) return null;
	const filePaths = await filterGitIgnoredPaths(cwd, splitNullSeparatedPaths(listedFiles.stdout, Boolean(listedFiles.stdoutTruncated)).map((entry) => toPosixPath(entry)).filter((entry) => entry.length > 0 && !isPathInIgnoredDirectory(entry)));
	const directorySet = /* @__PURE__ */ new Set();
	for (const filePath of filePaths) for (const directoryPath of directoryAncestorsOf(filePath)) if (!isPathInIgnoredDirectory(directoryPath)) directorySet.add(directoryPath);
	const directoryEntries = [...directorySet].toSorted((left, right) => left.localeCompare(right)).map((directoryPath) => ({
		path: directoryPath,
		kind: "directory",
		parentPath: parentPathOf(directoryPath)
	}));
	const fileEntries = [...new Set(filePaths)].toSorted((left, right) => left.localeCompare(right)).map((filePath) => ({
		path: filePath,
		kind: "file",
		parentPath: parentPathOf(filePath)
	}));
	const entries = [...directoryEntries, ...fileEntries];
	return {
		scannedAt: Date.now(),
		entries: entries.slice(0, WORKSPACE_INDEX_MAX_ENTRIES),
		truncated: Boolean(listedFiles.stdoutTruncated) || entries.length > WORKSPACE_INDEX_MAX_ENTRIES
	};
}
async function buildWorkspaceIndex(cwd) {
	const gitIndexed = await buildWorkspaceIndexFromGit(cwd);
	if (gitIndexed) return gitIndexed;
	const shouldFilterWithGitIgnore = await isInsideGitWorkTree(cwd);
	let pendingDirectories = [""];
	const entries = [];
	let truncated = false;
	while (pendingDirectories.length > 0 && !truncated) {
		const currentDirectories = pendingDirectories;
		pendingDirectories = [];
		const candidateEntriesByDirectory = (await mapWithConcurrency(currentDirectories, WORKSPACE_SCAN_READDIR_CONCURRENCY, async (relativeDir) => {
			const absoluteDir = relativeDir ? path.join(cwd, relativeDir) : cwd;
			try {
				return {
					relativeDir,
					dirents: await fs$1.readdir(absoluteDir, { withFileTypes: true })
				};
			} catch (error) {
				if (!relativeDir) throw new Error(`Unable to scan workspace entries at '${cwd}': ${error instanceof Error ? error.message : "unknown error"}`, { cause: error });
				return {
					relativeDir,
					dirents: null
				};
			}
		})).map((directoryEntry) => {
			const { relativeDir, dirents } = directoryEntry;
			if (!dirents) return [];
			dirents.sort((left, right) => left.name.localeCompare(right.name));
			const candidates = [];
			for (const dirent of dirents) {
				if (!dirent.name || dirent.name === "." || dirent.name === "..") continue;
				if (dirent.isDirectory() && IGNORED_DIRECTORY_NAMES.has(dirent.name)) continue;
				if (!dirent.isDirectory() && !dirent.isFile()) continue;
				const relativePath = toPosixPath(relativeDir ? path.join(relativeDir, dirent.name) : dirent.name);
				if (isPathInIgnoredDirectory(relativePath)) continue;
				candidates.push({
					dirent,
					relativePath
				});
			}
			return candidates;
		});
		const candidatePaths = candidateEntriesByDirectory.flatMap((candidateEntries) => candidateEntries.map((entry) => entry.relativePath));
		const allowedPathSet = shouldFilterWithGitIgnore ? new Set(await filterGitIgnoredPaths(cwd, candidatePaths)) : null;
		for (const candidateEntries of candidateEntriesByDirectory) {
			for (const candidate of candidateEntries) {
				if (allowedPathSet && !allowedPathSet.has(candidate.relativePath)) continue;
				const entry = {
					path: candidate.relativePath,
					kind: candidate.dirent.isDirectory() ? "directory" : "file",
					parentPath: parentPathOf(candidate.relativePath)
				};
				entries.push(entry);
				if (candidate.dirent.isDirectory()) pendingDirectories.push(candidate.relativePath);
				if (entries.length >= WORKSPACE_INDEX_MAX_ENTRIES) {
					truncated = true;
					break;
				}
			}
			if (truncated) break;
		}
	}
	return {
		scannedAt: Date.now(),
		entries,
		truncated
	};
}
async function getWorkspaceIndex(cwd) {
	const cached = workspaceIndexCache.get(cwd);
	if (cached && Date.now() - cached.scannedAt < WORKSPACE_CACHE_TTL_MS) return cached;
	const inFlight = inFlightWorkspaceIndexBuilds.get(cwd);
	if (inFlight) return inFlight;
	const nextPromise = buildWorkspaceIndex(cwd).then((next) => {
		workspaceIndexCache.set(cwd, next);
		while (workspaceIndexCache.size > WORKSPACE_CACHE_MAX_KEYS) {
			const oldestKey = workspaceIndexCache.keys().next().value;
			if (!oldestKey) break;
			workspaceIndexCache.delete(oldestKey);
		}
		return next;
	}).finally(() => {
		inFlightWorkspaceIndexBuilds.delete(cwd);
	});
	inFlightWorkspaceIndexBuilds.set(cwd, nextPromise);
	return nextPromise;
}
async function searchWorkspaceEntries(input) {
	const index = await getWorkspaceIndex(input.cwd);
	const normalizedQuery = normalizeQuery(input.query);
	const ranked = (normalizedQuery ? index.entries.filter((entry) => entry.path.toLowerCase().includes(normalizedQuery)) : index.entries).toSorted((left, right) => {
		const scoreDelta = scoreEntry(left, normalizedQuery) - scoreEntry(right, normalizedQuery);
		if (scoreDelta !== 0) return scoreDelta;
		return left.path.localeCompare(right.path);
	});
	return {
		entries: ranked.slice(0, input.limit),
		truncated: index.truncated || ranked.length > input.limit
	};
}

//#endregion
//#region src/projectFaviconRoute.ts
const FAVICON_MIME_TYPES = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".ico": "image/x-icon"
};
const FALLBACK_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#6b728080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-fallback="project-favicon"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>`;
const FAVICON_CANDIDATES = [
	"favicon.svg",
	"favicon.ico",
	"favicon.png",
	"public/favicon.svg",
	"public/favicon.ico",
	"public/favicon.png",
	"app/favicon.ico",
	"app/favicon.png",
	"app/icon.svg",
	"app/icon.png",
	"app/icon.ico",
	"src/favicon.ico",
	"src/favicon.svg",
	"src/app/favicon.ico",
	"src/app/icon.svg",
	"src/app/icon.png",
	"assets/icon.svg",
	"assets/icon.png",
	"assets/logo.svg",
	"assets/logo.png"
];
const ICON_SOURCE_FILES = [
	"index.html",
	"public/index.html",
	"app/routes/__root.tsx",
	"src/routes/__root.tsx",
	"app/root.tsx",
	"src/root.tsx",
	"src/index.html"
];
const LINK_ICON_HTML_RE = /<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon)["'])(?=[^>]*\bhref=["']([^"'?]+))[^>]*>/i;
const LINK_ICON_OBJ_RE = /(?=[^}]*\brel\s*:\s*["'](?:icon|shortcut icon)["'])(?=[^}]*\bhref\s*:\s*["']([^"'?]+))[^}]*/i;
function extractIconHref(source) {
	const htmlMatch = source.match(LINK_ICON_HTML_RE);
	if (htmlMatch?.[1]) return htmlMatch[1];
	const objMatch = source.match(LINK_ICON_OBJ_RE);
	if (objMatch?.[1]) return objMatch[1];
	return null;
}
function resolveIconHref(projectCwd, href) {
	const clean = href.replace(/^\//, "");
	return [path.join(projectCwd, "public", clean), path.join(projectCwd, clean)];
}
function isPathWithinProject(projectCwd, candidatePath) {
	const relative = path.relative(path.resolve(projectCwd), path.resolve(candidatePath));
	return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}
function serveFaviconFile(filePath, res) {
	const contentType = FAVICON_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
	fs.readFile(filePath, (readErr, data) => {
		if (readErr) {
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Read error");
			return;
		}
		res.writeHead(200, {
			"Content-Type": contentType,
			"Cache-Control": "public, max-age=3600"
		});
		res.end(data);
	});
}
function serveFallbackFavicon(res) {
	res.writeHead(200, {
		"Content-Type": "image/svg+xml",
		"Cache-Control": "public, max-age=3600"
	});
	res.end(FALLBACK_FAVICON_SVG);
}
function tryHandleProjectFaviconRequest(url, res) {
	if (url.pathname !== "/api/project-favicon") return false;
	const projectCwd = url.searchParams.get("cwd");
	if (!projectCwd) {
		res.writeHead(400, { "Content-Type": "text/plain" });
		res.end("Missing cwd parameter");
		return true;
	}
	const tryResolvedPaths = (paths, index, onExhausted) => {
		if (index >= paths.length) {
			onExhausted();
			return;
		}
		const candidate = paths[index];
		if (!isPathWithinProject(projectCwd, candidate)) {
			tryResolvedPaths(paths, index + 1, onExhausted);
			return;
		}
		fs.stat(candidate, (err, stats) => {
			if (err || !stats?.isFile()) {
				tryResolvedPaths(paths, index + 1, onExhausted);
				return;
			}
			serveFaviconFile(candidate, res);
		});
	};
	const trySourceFiles = (index) => {
		if (index >= ICON_SOURCE_FILES.length) {
			serveFallbackFavicon(res);
			return;
		}
		const sourceFile = path.join(projectCwd, ICON_SOURCE_FILES[index]);
		fs.readFile(sourceFile, "utf8", (err, content) => {
			if (err) {
				trySourceFiles(index + 1);
				return;
			}
			const href = extractIconHref(content);
			if (!href) {
				trySourceFiles(index + 1);
				return;
			}
			tryResolvedPaths(resolveIconHref(projectCwd, href), 0, () => trySourceFiles(index + 1));
		});
	};
	const tryCandidates = (index) => {
		if (index >= FAVICON_CANDIDATES.length) {
			trySourceFiles(0);
			return;
		}
		const candidate = path.join(projectCwd, FAVICON_CANDIDATES[index]);
		if (!isPathWithinProject(projectCwd, candidate)) {
			tryCandidates(index + 1);
			return;
		}
		fs.stat(candidate, (err, stats) => {
			if (err || !stats?.isFile()) {
				tryCandidates(index + 1);
				return;
			}
			serveFaviconFile(candidate, res);
		});
	};
	tryCandidates(0);
	return true;
}

//#endregion
//#region src/wsServer.ts
/**
* Server - HTTP/WebSocket server service interface.
*
* Owns startup and shutdown lifecycle of the HTTP server, static asset serving,
* and WebSocket request routing.
*
* @module Server
*/
/**
* Server - Service tag for HTTP/WebSocket lifecycle management.
*/
var Server = class extends ServiceMap.Service()("t3/wsServer/Server") {};
const isServerNotRunningError = (error) => {
	if (!(error instanceof Error)) return false;
	return error.code === "ERR_SERVER_NOT_RUNNING" || error.message.toLowerCase().includes("not running");
};
function rejectUpgrade(socket, statusCode, message) {
	socket.end(`HTTP/1.1 ${statusCode} ${statusCode === 401 ? "Unauthorized" : "Bad Request"}\r\nConnection: close\r
Content-Type: text/plain\r
Content-Length: ${Buffer.byteLength(message)}\r\n\r
` + message);
}
function websocketRawToString(raw) {
	if (typeof raw === "string") return raw;
	if (raw instanceof Uint8Array) return Buffer.from(raw).toString("utf8");
	if (raw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(raw)).toString("utf8");
	if (Array.isArray(raw)) {
		const chunks = [];
		for (const chunk of raw) {
			if (typeof chunk === "string") {
				chunks.push(chunk);
				continue;
			}
			if (chunk instanceof Uint8Array) {
				chunks.push(Buffer.from(chunk).toString("utf8"));
				continue;
			}
			if (chunk instanceof ArrayBuffer) {
				chunks.push(Buffer.from(new Uint8Array(chunk)).toString("utf8"));
				continue;
			}
			return null;
		}
		return chunks.join("");
	}
	return null;
}
function toPosixRelativePath(input) {
	return input.replaceAll("\\", "/");
}
function resolveWorkspaceWritePath(params) {
	const normalizedInputPath = params.relativePath.trim();
	if (params.path.isAbsolute(normalizedInputPath)) return Effect.fail(new RouteRequestError({ message: "Workspace file path must be relative to the project root." }));
	const absolutePath = params.path.resolve(params.workspaceRoot, normalizedInputPath);
	const relativeToRoot = toPosixRelativePath(params.path.relative(params.workspaceRoot, absolutePath));
	if (relativeToRoot.length === 0 || relativeToRoot === "." || relativeToRoot.startsWith("../") || relativeToRoot === ".." || params.path.isAbsolute(relativeToRoot)) return Effect.fail(new RouteRequestError({ message: "Workspace file path must stay within the project root." }));
	return Effect.succeed({
		absolutePath,
		relativePath: relativeToRoot
	});
}
function stripRequestTag(body) {
	return Struct.omit(body, ["_tag"]);
}
function messageFromCause(cause) {
	const squashed = Cause.squash(cause);
	const message = squashed instanceof Error ? squashed.message.trim() : String(squashed).trim();
	return message.length > 0 ? message : Cause.pretty(cause);
}
var ServerLifecycleError = class extends Schema.TaggedErrorClass()("ServerLifecycleError", {
	operation: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {};
var RouteRequestError = class extends Schema.TaggedErrorClass()("RouteRequestError", { message: Schema.String }) {};
const createServer = Effect.fn(function* () {
	const serverConfig = yield* ServerConfig$1;
	const { port, cwd, keybindingsConfigPath, staticDir, devUrl, authToken, host, logWebSocketEvents, autoBootstrapProjectFromCwd } = serverConfig;
	const availableEditors = resolveAvailableEditors();
	const gitManager = yield* GitManager;
	const terminalManager = yield* TerminalManager;
	const keybindingsManager = yield* Keybindings;
	const providerHealth = yield* ProviderHealth;
	const git = yield* GitCore;
	const fileSystem = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	yield* keybindingsManager.syncDefaultKeybindingsOnStartup.pipe(Effect.catch((error) => Effect.logWarning("failed to sync keybindings defaults on startup", {
		path: error.configPath,
		detail: error.detail,
		cause: error.cause
	})));
	const providerStatuses = yield* providerHealth.getStatuses;
	const clients = yield* Ref.make(/* @__PURE__ */ new Set());
	const logger = createLogger("ws");
	function logOutgoingPush(push, recipients) {
		if (!logWebSocketEvents) return;
		logger.event("outgoing push", {
			channel: push.channel,
			recipients,
			payload: push.data
		});
	}
	const encodePush = Schema.encodeEffect(Schema.fromJsonString(WsPush));
	const broadcastPush = Effect.fnUntraced(function* (push) {
		const message = yield* encodePush(push);
		let recipients = 0;
		for (const client of yield* Ref.get(clients)) if (client.readyState === client.OPEN) {
			client.send(message);
			recipients += 1;
		}
		logOutgoingPush(push, recipients);
	});
	const onTerminalEvent = Effect.fnUntraced(function* (event) {
		yield* broadcastPush({
			type: "push",
			channel: WS_CHANNELS.terminalEvent,
			data: event
		});
	});
	const normalizeDispatchCommand = Effect.fnUntraced(function* (input) {
		const normalizeProjectWorkspaceRoot = Effect.fnUntraced(function* (workspaceRoot) {
			const normalizedWorkspaceRoot = path.resolve(yield* expandHomePath(workspaceRoot.trim()));
			const workspaceStat = yield* fileSystem.stat(normalizedWorkspaceRoot).pipe(Effect.catch(() => Effect.succeed(null)));
			if (!workspaceStat) return yield* new RouteRequestError({ message: `Project directory does not exist: ${normalizedWorkspaceRoot}` });
			if (workspaceStat.type !== "Directory") return yield* new RouteRequestError({ message: `Project path is not a directory: ${normalizedWorkspaceRoot}` });
			return normalizedWorkspaceRoot;
		});
		if (input.command.type === "project.create") return {
			...input.command,
			workspaceRoot: yield* normalizeProjectWorkspaceRoot(input.command.workspaceRoot)
		};
		if (input.command.type === "project.meta.update" && input.command.workspaceRoot !== void 0) return {
			...input.command,
			workspaceRoot: yield* normalizeProjectWorkspaceRoot(input.command.workspaceRoot)
		};
		if (input.command.type !== "thread.turn.start") return input.command;
		const turnStartCommand = input.command;
		const normalizedAttachments = yield* Effect.forEach(turnStartCommand.message.attachments, (attachment) => Effect.gen(function* () {
			const parsed = parseBase64DataUrl(attachment.dataUrl);
			if (!parsed || !parsed.mimeType.startsWith("image/")) return yield* new RouteRequestError({ message: `Invalid image attachment payload for '${attachment.name}'.` });
			const bytes = Buffer.from(parsed.base64, "base64");
			if (bytes.byteLength === 0 || bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) return yield* new RouteRequestError({ message: `Image attachment '${attachment.name}' is empty or too large.` });
			const attachmentId = createAttachmentId(turnStartCommand.threadId);
			if (!attachmentId) return yield* new RouteRequestError({ message: "Failed to create a safe attachment id." });
			const persistedAttachment = {
				type: "image",
				id: attachmentId,
				name: attachment.name,
				mimeType: parsed.mimeType.toLowerCase(),
				sizeBytes: bytes.byteLength
			};
			const attachmentPath = resolveAttachmentPath({
				stateDir: serverConfig.stateDir,
				attachment: persistedAttachment
			});
			if (!attachmentPath) return yield* new RouteRequestError({ message: `Failed to resolve persisted path for '${attachment.name}'.` });
			yield* fileSystem.makeDirectory(path.dirname(attachmentPath), { recursive: true }).pipe(Effect.mapError(() => new RouteRequestError({ message: `Failed to create attachment directory for '${attachment.name}'.` })));
			yield* fileSystem.writeFile(attachmentPath, bytes).pipe(Effect.mapError(() => new RouteRequestError({ message: `Failed to persist attachment '${attachment.name}'.` })));
			return persistedAttachment;
		}), { concurrency: 1 });
		return {
			...turnStartCommand,
			message: {
				...turnStartCommand.message,
				attachments: normalizedAttachments
			}
		};
	});
	const httpServer = http.createServer((req, res) => {
		const respond = (statusCode, headers, body) => {
			res.writeHead(statusCode, headers);
			res.end(body);
		};
		Effect.runPromise(Effect.gen(function* () {
			const url = new URL(req.url ?? "/", `http://localhost:${port}`);
			if (tryHandleProjectFaviconRequest(url, res)) return;
			if (url.pathname.startsWith(ATTACHMENTS_ROUTE_PREFIX)) {
				const normalizedRelativePath = normalizeAttachmentRelativePath(url.pathname.slice(ATTACHMENTS_ROUTE_PREFIX.length));
				if (!normalizedRelativePath) {
					respond(400, { "Content-Type": "text/plain" }, "Invalid attachment path");
					return;
				}
				const isIdLookup = !normalizedRelativePath.includes("/") && !normalizedRelativePath.includes(".");
				const filePath = isIdLookup ? resolveAttachmentPathById({
					stateDir: serverConfig.stateDir,
					attachmentId: normalizedRelativePath
				}) : resolveAttachmentRelativePath({
					stateDir: serverConfig.stateDir,
					relativePath: normalizedRelativePath
				});
				if (!filePath) {
					respond(isIdLookup ? 404 : 400, { "Content-Type": "text/plain" }, isIdLookup ? "Not Found" : "Invalid attachment path");
					return;
				}
				const fileInfo = yield* fileSystem.stat(filePath).pipe(Effect.catch(() => Effect.succeed(null)));
				if (!fileInfo || fileInfo.type !== "File") {
					respond(404, { "Content-Type": "text/plain" }, "Not Found");
					return;
				}
				const contentType = Mime.getType(filePath) ?? "application/octet-stream";
				res.writeHead(200, {
					"Content-Type": contentType,
					"Cache-Control": "public, max-age=31536000, immutable"
				});
				if ((yield* Stream.runForEach(fileSystem.stream(filePath), (chunk) => Effect.sync(() => {
					if (!res.destroyed) res.write(chunk);
				})).pipe(Effect.exit))._tag === "Failure") {
					if (!res.destroyed) res.destroy();
					return;
				}
				if (!res.writableEnded) res.end();
				return;
			}
			if (devUrl) {
				respond(302, { Location: devUrl.href });
				return;
			}
			if (!staticDir) {
				respond(503, { "Content-Type": "text/plain" }, "No static directory configured and no dev URL set.");
				return;
			}
			const staticRoot = path.resolve(staticDir);
			const rawStaticRelativePath = (url.pathname === "/" ? "/index.html" : url.pathname).replace(/^[/\\]+/, "");
			const hasRawLeadingParentSegment = rawStaticRelativePath.startsWith("..");
			const staticRelativePath = path.normalize(rawStaticRelativePath).replace(/^[/\\]+/, "");
			const hasPathTraversalSegment = staticRelativePath.startsWith("..");
			if (staticRelativePath.length === 0 || hasRawLeadingParentSegment || hasPathTraversalSegment || staticRelativePath.includes("\0")) {
				respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
				return;
			}
			const isWithinStaticRoot = (candidate) => candidate === staticRoot || candidate.startsWith(staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`);
			let filePath = path.resolve(staticRoot, staticRelativePath);
			if (!isWithinStaticRoot(filePath)) {
				respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
				return;
			}
			if (!path.extname(filePath)) {
				filePath = path.resolve(filePath, "index.html");
				if (!isWithinStaticRoot(filePath)) {
					respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
					return;
				}
			}
			const fileInfo = yield* fileSystem.stat(filePath).pipe(Effect.catch(() => Effect.succeed(null)));
			if (!fileInfo || fileInfo.type !== "File") {
				const indexPath = path.resolve(staticRoot, "index.html");
				const indexData = yield* fileSystem.readFile(indexPath).pipe(Effect.catch(() => Effect.succeed(null)));
				if (!indexData) {
					respond(404, { "Content-Type": "text/plain" }, "Not Found");
					return;
				}
				respond(200, { "Content-Type": "text/html; charset=utf-8" }, indexData);
				return;
			}
			const contentType = Mime.getType(filePath) ?? "application/octet-stream";
			const data = yield* fileSystem.readFile(filePath).pipe(Effect.catch(() => Effect.succeed(null)));
			if (!data) {
				respond(500, { "Content-Type": "text/plain" }, "Internal Server Error");
				return;
			}
			respond(200, { "Content-Type": contentType }, data);
		})).catch(() => {
			if (!res.headersSent) respond(500, { "Content-Type": "text/plain" }, "Internal Server Error");
		});
	});
	const wss = new WebSocketServer({ noServer: true });
	const closeWebSocketServer = Effect.callback((resume) => {
		wss.close((error) => {
			if (error && !isServerNotRunningError(error)) resume(Effect.fail(new ServerLifecycleError({
				operation: "closeWebSocketServer",
				cause: error
			})));
			else resume(Effect.void);
		});
	});
	const closeAllClients = Ref.get(clients).pipe(Effect.flatMap(Effect.forEach((client) => Effect.sync(() => client.close()))), Effect.flatMap(() => Ref.set(clients, /* @__PURE__ */ new Set())));
	const listenOptions = host ? {
		host,
		port
	} : { port };
	const orchestrationEngine = yield* OrchestrationEngineService;
	const projectionReadModelQuery = yield* ProjectionSnapshotQuery;
	const checkpointDiffQuery = yield* CheckpointDiffQuery;
	const orchestrationReactor = yield* OrchestrationReactor;
	const { openInEditor } = yield* Open;
	const subscriptionsScope = yield* Scope.make("sequential");
	yield* Effect.addFinalizer(() => Scope.close(subscriptionsScope, Exit.void));
	yield* Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => broadcastPush({
		type: "push",
		channel: ORCHESTRATION_WS_CHANNELS.domainEvent,
		data: event
	})).pipe(Effect.forkIn(subscriptionsScope));
	yield* Stream.runForEach(keybindingsManager.changes, (event) => broadcastPush({
		type: "push",
		channel: WS_CHANNELS.serverConfigUpdated,
		data: {
			issues: event.issues,
			providers: providerStatuses
		}
	})).pipe(Effect.forkIn(subscriptionsScope));
	yield* Scope.provide(orchestrationReactor.start, subscriptionsScope);
	let welcomeBootstrapProjectId;
	let welcomeBootstrapThreadId;
	if (autoBootstrapProjectFromCwd) yield* Effect.gen(function* () {
		const snapshot = yield* projectionReadModelQuery.getSnapshot();
		const existingProject = snapshot.projects.find((project) => project.workspaceRoot === cwd && project.deletedAt === null);
		let bootstrapProjectId;
		let bootstrapProjectDefaultModel;
		if (!existingProject) {
			const createdAt = (/* @__PURE__ */ new Date()).toISOString();
			bootstrapProjectId = ProjectId.makeUnsafe(crypto.randomUUID());
			const bootstrapProjectTitle = path.basename(cwd) || "project";
			bootstrapProjectDefaultModel = "gpt-5-codex";
			yield* orchestrationEngine.dispatch({
				type: "project.create",
				commandId: CommandId.makeUnsafe(crypto.randomUUID()),
				projectId: bootstrapProjectId,
				title: bootstrapProjectTitle,
				workspaceRoot: cwd,
				defaultModel: bootstrapProjectDefaultModel,
				createdAt
			});
		} else {
			bootstrapProjectId = existingProject.id;
			bootstrapProjectDefaultModel = existingProject.defaultModel ?? "gpt-5-codex";
		}
		const existingThread = snapshot.threads.find((thread) => thread.projectId === bootstrapProjectId && thread.deletedAt === null);
		if (!existingThread) {
			const createdAt = (/* @__PURE__ */ new Date()).toISOString();
			const threadId = ThreadId.makeUnsafe(crypto.randomUUID());
			yield* orchestrationEngine.dispatch({
				type: "thread.create",
				commandId: CommandId.makeUnsafe(crypto.randomUUID()),
				threadId,
				projectId: bootstrapProjectId,
				title: "New thread",
				model: bootstrapProjectDefaultModel,
				interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
				runtimeMode: "full-access",
				branch: null,
				worktreePath: null,
				createdAt
			});
			welcomeBootstrapProjectId = bootstrapProjectId;
			welcomeBootstrapThreadId = threadId;
		} else {
			welcomeBootstrapProjectId = bootstrapProjectId;
			welcomeBootstrapThreadId = existingThread.id;
		}
	}).pipe(Effect.mapError((cause) => new ServerLifecycleError({
		operation: "autoBootstrapProject",
		cause
	})));
	const runtimeServices = yield* Effect.services();
	const runPromise = Effect.runPromiseWith(runtimeServices);
	const unsubscribeTerminalEvents = yield* terminalManager.subscribe((event) => void Effect.runPromise(onTerminalEvent(event)));
	yield* Effect.addFinalizer(() => Effect.sync(() => unsubscribeTerminalEvents()));
	yield* NodeHttpServer.make(() => httpServer, listenOptions).pipe(Effect.mapError((cause) => new ServerLifecycleError({
		operation: "httpServerListen",
		cause
	})));
	yield* Effect.addFinalizer(() => Effect.all([closeAllClients, closeWebSocketServer.pipe(Effect.catch((error) => Effect.logWarning("failed to close web socket server", { cause: error })))]));
	const routeRequest = Effect.fnUntraced(function* (request) {
		switch (request.body._tag) {
			case ORCHESTRATION_WS_METHODS.getSnapshot: return yield* projectionReadModelQuery.getSnapshot();
			case ORCHESTRATION_WS_METHODS.dispatchCommand: {
				const { command } = request.body;
				const normalizedCommand = yield* normalizeDispatchCommand({ command });
				return yield* orchestrationEngine.dispatch(normalizedCommand);
			}
			case ORCHESTRATION_WS_METHODS.getTurnDiff: {
				const body = stripRequestTag(request.body);
				return yield* checkpointDiffQuery.getTurnDiff(body);
			}
			case ORCHESTRATION_WS_METHODS.getFullThreadDiff: {
				const body = stripRequestTag(request.body);
				return yield* checkpointDiffQuery.getFullThreadDiff(body);
			}
			case ORCHESTRATION_WS_METHODS.replayEvents: {
				const { fromSequenceExclusive } = request.body;
				return yield* Stream.runCollect(orchestrationEngine.readEvents(clamp(fromSequenceExclusive, {
					maximum: Number.MAX_SAFE_INTEGER,
					minimum: 0
				}))).pipe(Effect.map((events) => Array.from(events)));
			}
			case WS_METHODS.projectsSearchEntries: {
				const body = stripRequestTag(request.body);
				return yield* Effect.tryPromise({
					try: () => searchWorkspaceEntries(body),
					catch: (cause) => new RouteRequestError({ message: `Failed to search workspace entries: ${String(cause)}` })
				});
			}
			case WS_METHODS.projectsWriteFile: {
				const body = stripRequestTag(request.body);
				const target = yield* resolveWorkspaceWritePath({
					workspaceRoot: body.cwd,
					relativePath: body.relativePath,
					path
				});
				yield* fileSystem.makeDirectory(path.dirname(target.absolutePath), { recursive: true }).pipe(Effect.mapError((cause) => new RouteRequestError({ message: `Failed to prepare workspace path: ${String(cause)}` })));
				yield* fileSystem.writeFileString(target.absolutePath, body.contents).pipe(Effect.mapError((cause) => new RouteRequestError({ message: `Failed to write workspace file: ${String(cause)}` })));
				return { relativePath: target.relativePath };
			}
			case WS_METHODS.shellOpenInEditor: return yield* openInEditor(stripRequestTag(request.body));
			case WS_METHODS.gitStatus: {
				const body = stripRequestTag(request.body);
				return yield* gitManager.status(body);
			}
			case WS_METHODS.gitPull: {
				const body = stripRequestTag(request.body);
				return yield* git.pullCurrentBranch(body.cwd);
			}
			case WS_METHODS.gitRunStackedAction: {
				const body = stripRequestTag(request.body);
				return yield* gitManager.runStackedAction(body);
			}
			case WS_METHODS.gitListBranches: {
				const body = stripRequestTag(request.body);
				return yield* git.listBranches(body);
			}
			case WS_METHODS.gitCreateWorktree: {
				const body = stripRequestTag(request.body);
				return yield* git.createWorktree(body);
			}
			case WS_METHODS.gitRemoveWorktree: {
				const body = stripRequestTag(request.body);
				return yield* git.removeWorktree(body);
			}
			case WS_METHODS.gitCreateBranch: {
				const body = stripRequestTag(request.body);
				return yield* git.createBranch(body);
			}
			case WS_METHODS.gitCheckout: {
				const body = stripRequestTag(request.body);
				return yield* Effect.scoped(git.checkoutBranch(body));
			}
			case WS_METHODS.gitInit: {
				const body = stripRequestTag(request.body);
				return yield* git.initRepo(body);
			}
			case WS_METHODS.terminalOpen: {
				const body = stripRequestTag(request.body);
				return yield* terminalManager.open(body);
			}
			case WS_METHODS.terminalWrite: {
				const body = stripRequestTag(request.body);
				return yield* terminalManager.write(body);
			}
			case WS_METHODS.terminalResize: {
				const body = stripRequestTag(request.body);
				return yield* terminalManager.resize(body);
			}
			case WS_METHODS.terminalClear: {
				const body = stripRequestTag(request.body);
				return yield* terminalManager.clear(body);
			}
			case WS_METHODS.terminalRestart: {
				const body = stripRequestTag(request.body);
				return yield* terminalManager.restart(body);
			}
			case WS_METHODS.terminalClose: {
				const body = stripRequestTag(request.body);
				return yield* terminalManager.close(body);
			}
			case WS_METHODS.serverGetConfig:
				const keybindingsConfig = yield* keybindingsManager.loadConfigState;
				return {
					cwd,
					keybindingsConfigPath,
					keybindings: keybindingsConfig.keybindings,
					issues: keybindingsConfig.issues,
					providers: providerStatuses,
					availableEditors
				};
			case WS_METHODS.serverUpsertKeybinding: {
				const body = stripRequestTag(request.body);
				return {
					keybindings: yield* keybindingsManager.upsertKeybindingRule(body),
					issues: []
				};
			}
			default: {
				const _exhaustiveCheck = request.body;
				return yield* new RouteRequestError({ message: `Unknown method: ${String(_exhaustiveCheck)}` });
			}
		}
	});
	const handleMessage = Effect.fnUntraced(function* (ws, raw) {
		const encodeResponse = Schema.encodeEffect(Schema.fromJsonString(WsResponse));
		const messageText = websocketRawToString(raw);
		if (messageText === null) {
			const errorResponse = yield* encodeResponse({
				id: "unknown",
				error: { message: "Invalid request format: Failed to read message" }
			});
			ws.send(errorResponse);
			return;
		}
		const request = Schema.decodeExit(Schema.fromJsonString(WebSocketRequest))(messageText);
		if (request._tag === "Failure") {
			const errorResponse = yield* encodeResponse({
				id: "unknown",
				error: { message: `Invalid request format: ${messageFromCause(request.cause)}` }
			});
			ws.send(errorResponse);
			return;
		}
		const result = yield* Effect.exit(routeRequest(request.value));
		if (result._tag === "Failure") {
			const errorResponse = yield* encodeResponse({
				id: request.value.id,
				error: { message: messageFromCause(result.cause) }
			});
			ws.send(errorResponse);
			return;
		}
		const response = yield* encodeResponse({
			id: request.value.id,
			result: result.value
		});
		ws.send(response);
	});
	httpServer.on("upgrade", (request, socket, head) => {
		socket.on("error", () => {});
		if (authToken) {
			let providedToken = null;
			try {
				providedToken = new URL(request.url ?? "/", `http://localhost:${port}`).searchParams.get("token");
			} catch {
				rejectUpgrade(socket, 400, "Invalid WebSocket URL");
				return;
			}
			if (providedToken !== authToken) {
				rejectUpgrade(socket, 401, "Unauthorized WebSocket connection");
				return;
			}
		}
		wss.handleUpgrade(request, socket, head, (ws) => {
			wss.emit("connection", ws, request);
		});
	});
	wss.on("connection", (ws) => {
		runPromise(Ref.update(clients, (clients) => clients.add(ws)));
		const segments = cwd.split(/[/\\]/).filter(Boolean);
		const projectName = segments[segments.length - 1] ?? "project";
		const welcome = {
			type: "push",
			channel: WS_CHANNELS.serverWelcome,
			data: {
				cwd,
				projectName,
				...welcomeBootstrapProjectId ? { bootstrapProjectId: welcomeBootstrapProjectId } : {},
				...welcomeBootstrapThreadId ? { bootstrapThreadId: welcomeBootstrapThreadId } : {}
			}
		};
		logOutgoingPush(welcome, 1);
		ws.send(JSON.stringify(welcome));
		ws.on("message", (raw) => {
			runPromise(handleMessage(ws, raw).pipe(Effect.catch((error) => Effect.logError("Error handling message", error))));
		});
		ws.on("close", () => {
			runPromise(Ref.update(clients, (clients) => {
				clients.delete(ws);
				return clients;
			}));
		});
		ws.on("error", () => {
			runPromise(Ref.update(clients, (clients) => {
				clients.delete(ws);
				return clients;
			}));
		});
	});
	return httpServer;
});
const ServerLive = Layer.succeed(Server, {
	start: createServer(),
	stopSignal: Effect.never
});

//#endregion
//#region src/serverLogger.ts
const ServerLoggerLive = Effect.gen(function* () {
	const config = yield* ServerConfig$1;
	const logDir = path.join(config.stateDir, "logs");
	const logPath = path.join(logDir, "server.log");
	yield* Effect.sync(() => {
		fs.mkdirSync(logDir, { recursive: true });
	});
	const fileLogger = Logger.formatSimple.pipe(Logger.toFile(logPath));
	return Logger.layer([Logger.defaultLogger, fileLogger], { mergeWithExisting: false });
}).pipe(Layer$1.unwrap);

//#endregion
//#region src/telemetry/Identify.ts
const CodexAuthJsonSchema = Schema.Struct({ tokens: Schema.Struct({ account_id: Schema.String }) });
var IdentifyUserError = class extends Schema.TaggedErrorClass()("IdentifyUserError", {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect)
}) {};
const hash = (value) => Effect.try({
	try: () => Crypto.createHash("sha256").update(value).digest("hex"),
	catch: (error) => new IdentifyUserError({
		message: "Failed to hash identifier",
		cause: error
	})
});
const getCodexAccountId = Effect.gen(function* () {
	const fileSystem = yield* FileSystem.FileSystem;
	const authJsonPath = (yield* Path.Path).join(homedir(), ".codex", "auth.json");
	return (yield* Effect.flatMap(fileSystem.readFileString(authJsonPath), Schema.decodeEffect(Schema.fromJsonString(CodexAuthJsonSchema)))).tokens.account_id;
});
const upsertAnonymousId = Effect.gen(function* () {
	const fileSystem = yield* FileSystem.FileSystem;
	const path = yield* Path.Path;
	const serverConfig = yield* ServerConfig$1;
	const anonymousIdPath = path.join(serverConfig.stateDir, "anonymous-id");
	return yield* fileSystem.readFileString(anonymousIdPath).pipe(Effect.catch(() => Effect.gen(function* () {
		const randomId = yield* Random.nextUUIDv4;
		yield* fileSystem.writeFileString(anonymousIdPath, randomId);
		return randomId;
	})));
});
/**
* getTelemetryIdentifier - Users are "identified" by finding the first match of the following, then hashing the value.
* 1. ~/.codex/auth.json tokens.account_id
* 2. ~/.t3/telemetry/anonymous-id
*/
const getTelemetryIdentifier = Effect.gen(function* () {
	const codexAccountId = yield* Effect.result(getCodexAccountId);
	if (codexAccountId._tag === "Success") return yield* hash(codexAccountId.success);
	const anonymousId = yield* Effect.result(upsertAnonymousId);
	if (anonymousId._tag === "Success") return yield* hash(anonymousId.success);
	return null;
}).pipe(Effect.tapError((error) => Effect.logWarning("Failed to get identifier", { cause: error })), Effect.orElseSucceed(() => null));

//#endregion
//#region package.json
var version = "0.0.3";

//#endregion
//#region src/telemetry/Layers/AnalyticsService.ts
/**
* AnalyticsServiceLive - Anonymous PostHog telemetry layer.
*
* Persists a random installation-scoped anonymous id to state dir, buffers
* events in memory, and flushes batches to PostHog over Effect HttpClient.
*
* @module AnalyticsServiceLive
*/
const TelemetryEnvConfig = Config.all({
	posthogKey: Config.string("T3CODE_POSTHOG_KEY").pipe(Config.withDefault("phc_XOWci4oZP4VvLiEyrFqkFjP4CZn55mjYYBMREK5Wd6m")),
	posthogHost: Config.string("T3CODE_POSTHOG_HOST").pipe(Config.withDefault("https://us.i.posthog.com")),
	enabled: Config.boolean("T3CODE_TELEMETRY_ENABLED").pipe(Config.withDefault(true)),
	flushBatchSize: Config.number("T3CODE_TELEMETRY_FLUSH_BATCH_SIZE").pipe(Config.withDefault(20)),
	maxBufferedEvents: Config.number("T3CODE_TELEMETRY_MAX_BUFFERED_EVENTS").pipe(Config.withDefault(1e3))
});
const makeAnalyticsService = Effect.gen(function* () {
	const telemetryConfig = yield* TelemetryEnvConfig.asEffect();
	const httpClient = yield* HttpClient.HttpClient;
	const serverConfig = yield* ServerConfig$1;
	const identifier = yield* getTelemetryIdentifier;
	const bufferRef = yield* Ref.make([]);
	const clientType = serverConfig.mode === "desktop" ? "desktop-app" : "cli-web-client";
	const enqueueBufferedEvent = (event, properties) => Effect.flatMap(DateTime.now, (now) => Ref.modify(bufferRef, (current) => {
		const appended = [...current, {
			event,
			...properties ? { properties } : {},
			capturedAt: DateTime.formatIso(now)
		}];
		const next = appended.length > telemetryConfig.maxBufferedEvents ? appended.slice(appended.length - telemetryConfig.maxBufferedEvents) : appended;
		return [{
			size: next.length,
			dropped: next.length !== appended.length
		}, next];
	}));
	const sendBatch = (events) => Effect.gen(function* () {
		if (!telemetryConfig.enabled || !identifier) return;
		const payload = {
			api_key: telemetryConfig.posthogKey,
			batch: events.map((event) => ({
				event: event.event,
				distinct_id: identifier,
				properties: {
					...event.properties,
					$process_person_profile: false,
					platform: process.platform,
					wsl: process.env.WSL_DISTRO_NAME,
					arch: process.arch,
					t3CodeVersion: version,
					clientType
				},
				timestamp: event.capturedAt
			}))
		};
		yield* HttpClientRequest.post(`${telemetryConfig.posthogHost}/batch/`).pipe(HttpClientRequest.bodyJson(payload), Effect.flatMap(httpClient.execute), Effect.flatMap(HttpClientResponse.filterStatusOk));
	});
	const flush = Effect.gen(function* () {
		while (true) {
			const batch = yield* Ref.modify(bufferRef, (current) => {
				if (current.length === 0) return [[], current];
				const nextBatch = current.slice(0, telemetryConfig.flushBatchSize);
				return [nextBatch, current.slice(nextBatch.length)];
			});
			if (batch.length === 0) return;
			yield* sendBatch(batch).pipe(Effect.catch((error) => Ref.update(bufferRef, (current) => [...batch, ...current]).pipe(Effect.flatMap(() => Effect.fail(error)))));
		}
	}).pipe(Effect.catch((cause) => Effect.logError("Failed to flush telemetry", { cause })));
	const record = Effect.fnUntraced(function* (event, properties) {
		if (!telemetryConfig.enabled || !identifier) return;
		const enqueueResult = yield* enqueueBufferedEvent(event, properties);
		if (enqueueResult.dropped) yield* Effect.logDebug("analytics buffer full; dropping oldest event", {
			size: enqueueResult.size,
			event
		});
	});
	yield* Effect.forever(Effect.sleep(1e3).pipe(Effect.flatMap(() => flush)), { disableYield: true }).pipe(Effect.forkScoped);
	yield* Effect.addFinalizer(() => flush);
	return {
		record,
		flush
	};
});
const AnalyticsServiceLayerLive = Layer.effect(AnalyticsService, makeAnalyticsService);

//#endregion
//#region src/main.ts
/**
* CliConfig - CLI/runtime bootstrap service definitions.
*
* Defines startup-only service contracts used while resolving process config
* and constructing server runtime layers.
*
* @module CliConfig
*/
var StartupError = class extends Data.TaggedError("StartupError") {};
/**
* CliConfig - Service tag for startup CLI/runtime helpers.
*/
var CliConfig = class CliConfig extends ServiceMap.Service()("t3/main/CliConfig") {
	static layer = Layer.effect(CliConfig, Effect.gen(function* () {
		const fileSystem = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		return {
			cwd: process.cwd(),
			fixPath: Effect.sync(fixPath),
			resolveStaticDir: resolveStaticDir().pipe(Effect.provideService(FileSystem.FileSystem, fileSystem), Effect.provideService(Path.Path, path))
		};
	}));
};
const CliEnvConfig = Config.all({
	mode: Config.string("T3CODE_MODE").pipe(Config.option, Config.map(Option.match({
		onNone: () => "web",
		onSome: (value) => value === "desktop" ? "desktop" : "web"
	}))),
	port: Config.port("T3CODE_PORT").pipe(Config.option, Config.map(Option.getOrUndefined)),
	host: Config.string("T3CODE_HOST").pipe(Config.option, Config.map(Option.getOrUndefined)),
	stateDir: Config.string("T3CODE_STATE_DIR").pipe(Config.option, Config.map(Option.getOrUndefined)),
	devUrl: Config.url("VITE_DEV_SERVER_URL").pipe(Config.option, Config.map(Option.getOrUndefined)),
	noBrowser: Config.boolean("T3CODE_NO_BROWSER").pipe(Config.option, Config.map(Option.getOrUndefined)),
	authToken: Config.string("T3CODE_AUTH_TOKEN").pipe(Config.option, Config.map(Option.getOrUndefined)),
	autoBootstrapProjectFromCwd: Config.boolean("T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD").pipe(Config.option, Config.map(Option.getOrUndefined)),
	logWebSocketEvents: Config.boolean("T3CODE_LOG_WS_EVENTS").pipe(Config.option, Config.map(Option.getOrUndefined))
});
const resolveBooleanFlag = (flag, envValue) => Option.getOrElse(Option.filter(flag, Boolean), () => envValue);
const ServerConfigLive = (input) => Layer.effect(ServerConfig$1, Effect.gen(function* () {
	const cliConfig = yield* CliConfig;
	const { findAvailablePort } = yield* NetService;
	const env = yield* CliEnvConfig.asEffect().pipe(Effect.mapError((cause) => new StartupError({
		message: "Failed to read environment configuration",
		cause
	})));
	const mode = Option.getOrElse(input.mode, () => env.mode);
	const port = yield* Option.match(input.port, {
		onSome: (value) => Effect.succeed(value),
		onNone: () => {
			if (env.port) return Effect.succeed(env.port);
			if (mode === "desktop") return Effect.succeed(DEFAULT_PORT);
			return findAvailablePort(DEFAULT_PORT);
		}
	});
	const stateDir = yield* resolveStateDir(Option.getOrUndefined(input.stateDir) ?? env.stateDir);
	const devUrl = Option.getOrElse(input.devUrl, () => env.devUrl);
	const noBrowser = resolveBooleanFlag(input.noBrowser, env.noBrowser ?? mode === "desktop");
	const authToken = Option.getOrUndefined(input.authToken) ?? env.authToken;
	const autoBootstrapProjectFromCwd = resolveBooleanFlag(input.autoBootstrapProjectFromCwd, env.autoBootstrapProjectFromCwd ?? mode === "web");
	const logWebSocketEvents = resolveBooleanFlag(input.logWebSocketEvents, env.logWebSocketEvents ?? Boolean(devUrl));
	const staticDir = devUrl ? void 0 : yield* cliConfig.resolveStaticDir;
	const { join } = yield* Path.Path;
	const keybindingsConfigPath = join(stateDir, "keybindings.json");
	const host = Option.getOrUndefined(input.host) ?? env.host ?? (mode === "desktop" ? "127.0.0.1" : void 0);
	return {
		mode,
		port,
		cwd: cliConfig.cwd,
		keybindingsConfigPath,
		host,
		stateDir,
		staticDir,
		devUrl,
		noBrowser,
		authToken,
		autoBootstrapProjectFromCwd,
		logWebSocketEvents
	};
}));
const LayerLive = (input) => Layer.empty.pipe(Layer.provideMerge(makeServerRuntimeServicesLayer()), Layer.provideMerge(makeServerProviderLayer()), Layer.provideMerge(ProviderHealthLive), Layer.provideMerge(layerConfig), Layer.provideMerge(ServerLoggerLive), Layer.provideMerge(AnalyticsServiceLayerLive), Layer.provideMerge(ServerConfigLive(input)));
const isWildcardHost = (host) => host === "0.0.0.0" || host === "::" || host === "[::]";
const formatHostForUrl = (host) => host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
const recordStartupHeartbeat = Effect.gen(function* () {
	const analytics = yield* AnalyticsService;
	const { threadCount, projectCount } = yield* (yield* ProjectionSnapshotQuery).getSnapshot().pipe(Effect.map((snapshot) => ({
		threadCount: snapshot.threads.length,
		projectCount: snapshot.projects.length
	})), Effect.catch((cause) => Effect.logWarning("failed to gather startup snapshot for telemetry", { cause }).pipe(Effect.as({
		threadCount: 0,
		projectCount: 0
	}))));
	yield* analytics.record("server.boot.heartbeat", {
		threadCount,
		projectCount
	});
});
const makeServerProgram = (input) => Effect.gen(function* () {
	const cliConfig = yield* CliConfig;
	const { start, stopSignal } = yield* Server;
	const openDeps = yield* Open;
	yield* cliConfig.fixPath;
	const config = yield* ServerConfig$1;
	if (!config.devUrl && !config.staticDir) yield* Effect.logWarning("web bundle missing and no VITE_DEV_SERVER_URL; web UI unavailable", { hint: "Run `bun run --cwd apps/web build` or set VITE_DEV_SERVER_URL for dev mode." });
	yield* start;
	yield* Effect.forkChild(recordStartupHeartbeat);
	const localUrl = `http://localhost:${config.port}`;
	const bindUrl = config.host && !isWildcardHost(config.host) ? `http://${formatHostForUrl(config.host)}:${config.port}` : localUrl;
	const { authToken, devUrl, ...safeConfig } = config;
	yield* Effect.logInfo("T3 Code running", {
		...safeConfig,
		devUrl: devUrl?.toString(),
		authEnabled: Boolean(authToken)
	});
	if (!config.noBrowser) {
		const target = config.devUrl?.toString() ?? bindUrl;
		yield* openDeps.openBrowser(target).pipe(Effect.catch(() => Effect.logInfo("browser auto-open unavailable", { hint: `Open ${target} in your browser.` })));
	}
	return yield* stopSignal;
}).pipe(Effect.provide(LayerLive(input)));
/**
* These flags mirrors the environment variables and the config shape.
*/
const modeFlag = Flag.choice("mode", ["web", "desktop"]).pipe(Flag.withDescription("Runtime mode. `desktop` keeps loopback defaults unless overridden."), Flag.optional);
const portFlag = Flag.integer("port").pipe(Flag.withSchema(Schema.Int.check(Schema.isBetween({
	minimum: 1,
	maximum: 65535
}))), Flag.withDescription("Port for the HTTP/WebSocket server."), Flag.optional);
const hostFlag = Flag.string("host").pipe(Flag.withDescription("Host/interface to bind (for example 127.0.0.1, 0.0.0.0, or a Tailnet IP)."), Flag.optional);
const stateDirFlag = Flag.string("state-dir").pipe(Flag.withDescription("State directory path (equivalent to T3CODE_STATE_DIR)."), Flag.optional);
const devUrlFlag = Flag.string("dev-url").pipe(Flag.withSchema(Schema.URLFromString), Flag.withDescription("Dev web URL to proxy/redirect to (equivalent to VITE_DEV_SERVER_URL)."), Flag.optional);
const noBrowserFlag = Flag.boolean("no-browser").pipe(Flag.withDescription("Disable automatic browser opening."), Flag.optional);
const authTokenFlag = Flag.string("auth-token").pipe(Flag.withDescription("Auth token required for WebSocket connections."), Flag.withAlias("token"), Flag.optional);
const autoBootstrapProjectFromCwdFlag = Flag.boolean("auto-bootstrap-project-from-cwd").pipe(Flag.withDescription("Create a project for the current working directory on startup when missing."), Flag.optional);
const logWebSocketEventsFlag = Flag.boolean("log-websocket-events").pipe(Flag.withDescription("Emit server-side logs for outbound WebSocket push traffic (equivalent to T3CODE_LOG_WS_EVENTS)."), Flag.withAlias("log-ws-events"), Flag.optional);
const t3Cli = Command.make("t3", {
	mode: modeFlag,
	port: portFlag,
	host: hostFlag,
	stateDir: stateDirFlag,
	devUrl: devUrlFlag,
	noBrowser: noBrowserFlag,
	authToken: authTokenFlag,
	autoBootstrapProjectFromCwd: autoBootstrapProjectFromCwdFlag,
	logWebSocketEvents: logWebSocketEventsFlag
}).pipe(Command.withDescription("Run the T3 Code server."), Command.withHandler((input) => Effect.scoped(makeServerProgram(input))));

//#endregion
//#region src/index.ts
const RuntimeLayer = Layer$1.empty.pipe(Layer$1.provideMerge(CliConfig.layer), Layer$1.provideMerge(ServerLive), Layer$1.provideMerge(OpenLive), Layer$1.provideMerge(NetService.layer), Layer$1.provideMerge(NodeServices.layer), Layer$1.provideMerge(FetchHttpClient.layer));
Command.run(t3Cli, { version }).pipe(Effect$1.provide(RuntimeLayer), NodeRuntime.runMain);

//#endregion
export {  };
//# sourceMappingURL=index.mjs.map