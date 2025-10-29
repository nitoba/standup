# Project Context

## Purpose

This project, `standup-volt`, is a [VoltAgent](https://voltagent.com/) application designed to automate the generation of standup reports. It analyzes Git repositories and Azure DevOps boards to create comprehensive summaries of recent work.

## Tech Stack

- **Runtime:** [Bun](https://bun.sh/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Framework:** [VoltAgent](https://voltagent.com/)
- **Server:** [Hono](https://hono.dev/) for the VoltAgent server
- **CLI:** [@opentui/react](https://github.com/OpenTUI/OpenTUI) for building the command-line interface with React
- **Linting/Formatting:** [Biome](https://biomejs.dev/)
- **AI SDKs:** [@ai-sdk/google](https://www.npmjs.com/package/@ai-sdk/google), [@ai-sdk/openai-compatible](https://www.npmjs.com/package/@ai-sdk/openai-compatible)

## Project Conventions

### Code Style

Code style is enforced by [Biome](https://biomejs.dev/). Key conventions include:

- **Indentation:** Tabs
- **Quotes:** Single quotes for JavaScript/TypeScript files.
- **Semicolons:** As needed.
- **Imports:** Automatically organized.
- **File Naming:** kebab-case for files and folders.

### Architecture Patterns

The project follows a VoltAgent-centric architecture, with a clear separation of concerns:

- **Workflows:** The core logic is encapsulated in workflows (e.g., `standupReportWorkflow`).
- **Agents:** Specialized agents handle specific tasks like Git analysis, Azure DevOps integration, and formatting.
- **Tools:** Agents are equipped with tools to interact with external systems or perform specific actions.
- **Server:** A Hono server exposes the VoltAgent workflows.

### Testing Strategy

[TBD: Explain your testing approach and requirements]

### Git Workflow

- **Branching:** `main` for production, feature branches for new development (e.g., `feat/new-feature`, `fix/bug-fix`).
- **Commits:** Conventional Commits standard is preferred (e.g., `feat: add new feature`, `fix: resolve bug`).

## Domain Context

The core domain is AI-powered development tools. Assistants working on this project should be familiar with:

- **VoltAgent:** The concept of agents, workflows, and tools.
- **LLMs:** How Large Language Models are used for analysis and generation.
- **Git & Azure DevOps:** Understanding of branches, commits, work items, etc.

## Important Constraints

- The application is designed to run in a Node.js environment (v20.19.0 or higher).

## External Dependencies

- **Google AI:** For generative AI capabilities.
- **OpenAI Compatible APIs:** For interacting with various AI models.
- **Azure DevOps:** For project management data.
- **Git:** For source code history analysis.
