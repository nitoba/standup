// apps/api/src/test/discord/mock-interaction.ts
import { vi, type Mock } from 'vitest'

type MockOpts = {
  userId?: string
  deferred?: boolean
  replied?: boolean
  commandName?: string
}

export type ChatInputInteractionMock = {
  commandName: string
  user: { id: string }
  deferred: boolean
  replied: boolean
  isRepliable: () => boolean
  reply: Mock
  deferReply: Mock
  editReply: Mock
  followUp: Mock
  showModal: Mock
}

export type ButtonInteractionMock = {
  user: { id: string }
  deferred: boolean
  replied: boolean
  isRepliable: () => boolean
  reply: Mock
  deferUpdate: Mock
  update: Mock
  editReply: Mock
  followUp: Mock
  showModal: Mock
  message: {
    react: Mock
    edit: Mock
  }
}

export type ModalInteractionMock = {
  user: { id: string }
  deferred: boolean
  replied: boolean
  isRepliable: () => boolean
  deferUpdate: Mock
  update: Mock
  editReply: Mock
  followUp: Mock
  fields: {
    getTextInputValue: Mock
  }
  message: {
    react: Mock
  }
}

export function makeChatInputInteraction(opts: MockOpts = {}): ChatInputInteractionMock {
  return {
    commandName: opts.commandName ?? 'test-command',
    user: { id: opts.userId ?? 'user-1' },
    deferred: opts.deferred ?? false,
    replied: opts.replied ?? false,
    isRepliable: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  }
}

export function makeButtonInteraction(opts: MockOpts = {}): ButtonInteractionMock {
  return {
    user: { id: opts.userId ?? 'user-1' },
    deferred: opts.deferred ?? false,
    replied: opts.replied ?? false,
    isRepliable: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    message: {
      react: vi.fn().mockResolvedValue(undefined),
      edit: vi.fn().mockResolvedValue(undefined),
    },
  }
}

export function makeModalInteraction(
  fields: Record<string, string> = {},
  opts: MockOpts = {},
): ModalInteractionMock {
  return {
    user: { id: opts.userId ?? 'user-1' },
    deferred: opts.deferred ?? false,
    replied: opts.replied ?? false,
    isRepliable: () => true,
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    fields: {
      getTextInputValue: vi.fn((name: string) => fields[name] ?? ''),
    },
    message: {
      react: vi.fn().mockResolvedValue(undefined),
    },
  }
}
