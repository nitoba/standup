## Why

The current terminal interface only displays basic console logs without a proper UI, making it difficult for users to understand the workflow progress and status. OpenTUI/react provides powerful components for creating rich terminal interfaces that can significantly improve user experience.

## What Changes

- Transform the current log-based terminal interface into a rich React-based UI using OpenTUI/react
- Replace console.log statements in [`src/cli/terminal/index.ts`](src/cli/terminal/index.ts:1) with a beautiful terminal interface
- Create intuitive workflow visualization with progress indicators, status displays, and real-time updates
- Implement proper layout distribution with monospace fonts and well-designed UI/UX
- Add interactive elements for better user engagement

## Impact

- Affected specs: New capability for terminal UI
- Affected code: [`src/cli/ui/app.tsx`](src/cli/ui/app.tsx:1), [`src/cli/terminal/index.ts`](src/cli/terminal/index.ts:1), [`src/cli/ui/index.tsx`](src/cli/ui/index.tsx:1)
- Breaking changes: None (adds new UI capability while preserving functionality)