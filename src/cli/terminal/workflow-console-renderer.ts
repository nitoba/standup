/**
 * Console colors and formatting utilities
 */
const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",

	// Colors
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	gray: "\x1b[90m",
};

/**
 * Emoji indicators for different states
 */
const indicators = {
	start: "🚀",
	stepStart: "▶️ ",
	stepSuccess: "✅",
	stepError: "❌",
	finish: "🎉",
	info: "ℹ️ ",
	warning: "⚠️ ",
};

/**
 * Step name formatting - converts kebab-case to Title Case
 */
function formatStepName(stepName: string): string {
	return stepName
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Prints a section header
 */
function printHeader(text: string, icon: string = indicators.info) {
	console.log(`\n${colors.bright}${colors.cyan}${icon} ${text}${colors.reset}`);
	console.log(colors.gray + "─".repeat(50) + colors.reset);
}

/**
 * Prints step start information
 */
function printStepStart(stepName: string, spinner?: ProgressSpinner) {
	const formattedName = formatStepName(stepName);

	if (spinner) {
		// If there's a spinner, start it with the step name
		spinner.updateMessage(formattedName);
		spinner.start();
	} else {
		console.log(
			`\n${colors.blue}${indicators.stepStart}${colors.bright}${formattedName}${colors.reset}`,
		);
	}
}

/**
 * Prints step completion information
 */
function printStepFinish(stepName: string, status: string, duration?: number) {
	const formattedName = formatStepName(stepName);
	const statusColor = status === "success" ? colors.green : colors.red;
	const statusIcon =
		status === "success" ? indicators.stepSuccess : indicators.stepError;

	let message = `${statusColor}${statusIcon} ${formattedName} ${colors.dim}(${status})`;

	if (duration) {
		message += ` - ${duration}ms`;
	}

	message += colors.reset;
	console.log(message);
}

/**
 * Prints workflow start
 */
function printWorkflowStart(workflowName: string) {
	printHeader(`Starting Workflow: ${workflowName}`, indicators.start);
}

/**
 * Prints workflow completion
 */
function printWorkflowFinish(status: string, duration?: number) {
	console.log(`${colors.gray}\n${"─".repeat(50)}${colors.reset}`);

	const statusColor = status === "success" ? colors.green : colors.red;
	let message = `${colors.bright}${statusColor}${indicators.finish} Workflow ${status}${colors.reset}`;

	if (duration) {
		message += ` ${colors.dim}(${duration}ms)${colors.reset}`;
	}

	console.log(message);
}

/**
 * Prints custom events from steps
 */
function printCustomEvent(event: any) {
	console.log(`${colors.dim}  → ${JSON.stringify(event)}${colors.reset}`);
}

/**
 * Main renderer for workflow streaming events
 */
export async function renderWorkflowStream(
	stream: ReadableStream,
	options: {
		showInputData?: boolean;
		showCustomEvents?: boolean;
		workflowName?: string;
	} = {},
) {
	const { showCustomEvents = false, workflowName = "Workflow" } = options;

	const startTime = Date.now();
	const stepTimings = new Map<string, number>();
	const spinner = new ProgressSpinner();

	try {
		for await (const chunk of stream) {
			switch (chunk.type) {
				case "workflow-start":
					printWorkflowStart(workflowName);
					break;

				case "workflow-step-start":
					if (chunk.payload?.id) {
						const stepId = chunk.payload.id;
						stepTimings.set(stepId, Date.now());
						printStepStart(stepId, spinner);
					}
					break;

				case "workflow-step-result":
					if (chunk.payload?.id) {
						const stepId = chunk.payload.id;
						const startTime = stepTimings.get(stepId);
						const duration = startTime ? Date.now() - startTime : undefined;

						// Stop the spinner before printing result
						spinner.stop();

						printStepFinish(
							stepId,
							chunk.payload.status || "unknown",
							duration,
						);
					}
					break;

				case "workflow-finish": {
					const totalDuration = Date.now() - startTime;
					const status = chunk.payload?.workflowStatus || "completed";
					printWorkflowFinish(status, totalDuration);
					break;
				}

				default:
					// Handle custom events from steps
					if (showCustomEvents) {
						printCustomEvent(chunk);
					}
					break;
			}
		}
	} catch (error) {
		spinner.stop();
		console.error(
			`\n${colors.red}${indicators.stepError} Error during workflow execution:${colors.reset}`,
			error,
		);
		throw error;
	}
}

/**
 * Simple progress spinner for async operations
 */
export class ProgressSpinner {
	private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private currentFrame = 0;
	private interval: Timer | null = null;
	private message: string;
	private isTTY: boolean;
	private hasStarted = false;

	constructor(message = "") {
		this.message = message;
		this.isTTY = process.stdout.isTTY ?? false;
	}

	updateMessage(message: string) {
		this.message = message;
	}

	start() {
		if (!this.isTTY) {
			// For non-TTY environments, just print once
			console.log(
				`\n${colors.cyan}${this.frames[0]}${colors.reset} ${colors.bright}${this.message}${colors.reset}`,
			);
			this.hasStarted = true;
			return;
		}

		this.hasStarted = true;
		this.interval = setInterval(() => {
			const frame = this.frames[this.currentFrame];
			process.stdout.write(
				`\r${colors.cyan}${frame}${colors.reset} ${colors.bright}${this.message}${colors.reset}`,
			);
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
		}, 80);
	}

	stop(finalMessage?: string) {
		if (!this.hasStarted) return;

		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}

		if (this.isTTY) {
			process.stdout.write("\r\x1b[K"); // Clear line
		}

		if (finalMessage) {
			console.log(finalMessage);
		}

		this.hasStarted = false;
		this.currentFrame = 0;
	}
}
