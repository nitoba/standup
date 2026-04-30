// apps/api/src/test/discord/mock-interaction.ts
import { vi, type MockInstance } from 'vitest'

type MockOpts = {
  userId?: string
  deferred?: boolean
  replied?: boolean
}

type ChatInputInteractionMock = {
  user: { id: string }
  deferred: boolean
  replied: boolean
  isRepliable: () => boolean
  reply: MockInstance
  deferReply: MockInstance
  editReply: MockInstance
  followUp: MockInstance
  showModal: MockInstance
}

type ButtonInteractionMock = {
  user: { id: string }
  deferred: boolean
  replied: boolean
  isRepliable: () => boolean
  deferUpdate: MockInstance
  update: MockInstance
  editReply: MockInstance
  followUp: MockInstance
  showModal: MockInstance
  message: {
    react: MockInstance
    edit: MockInstance
  }
}

type ModalInteractionMock = {
  user: { id: string }
  deferred: boolean
  replied: boolean
  isRepliable: () => boolean
  deferUpdate: MockInstance
  editReply: MockInstance
  followUp: MockInstance
  fields: {
    getTextInputValue: MockInstance
  }
  message: {
    react: MockInstance
  }
}

export function makeChatInputInteraction(opts: MockOpts = {}): ChatInputInteractionMock {
  return {
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
