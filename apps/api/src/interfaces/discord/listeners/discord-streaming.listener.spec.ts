import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type {
  StandupProgressEvent,
  StandupFailedEvent,
} from '../../../platform/events/standup-events'
import { DiscordStreamingListener } from './discord-streaming.listener'

function mockLoggerFactory() {
  return {
    create: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }
}

function mockMessages() {
  return {
    sendPlaceholderDm: vi.fn().mockResolvedValue({
      isErr: () => false,
      isOk: () => true,
      value: { messageId: 'msg-123' },
    }),
    updateDmMessage: vi.fn().mockResolvedValue({
      isErr: () => false,
      isOk: () => true,
    }),
  }
}

function mockUserRepo() {
  return {
    findDiscordIdByUserId: vi.fn().mockResolvedValue({
      isErr: () => false,
      isOk: () => true,
      value: 'discord-user-456',
    }),
  }
}

function createListener() {
  const loggerFactory = mockLoggerFactory()
  const messages = mockMessages()
  const userRepo = mockUserRepo()
  const listener = new DiscordStreamingListener(
    loggerFactory as never,
    messages as never,
    userRepo as never,
  )
  return { listener, messages, userRepo }
}

function makeProgressEvent(
  overrides: Partial<StandupProgressEvent> = {},
): StandupProgressEvent {
  return {
    userId: 'user-1',
    runId: 'run-1',
    date: '2026-04-02',
    mode: 'generate',
    step: 'queued',
    message: 'Queued',
    ...overrides,
  }
}

function makeFailedEvent(
  overrides: Partial<StandupFailedEvent> = {},
): StandupFailedEvent {
  return {
    userId: 'user-1',
    runId: 'run-1',
    date: '2026-04-02',
    mode: 'generate',
    message: 'Something went wrong',
    ...overrides,
  }
}

describe('DiscordStreamingListener', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('handleProgress — queued step', () => {
    it('sends placeholder DM on queued step', async () => {
      const { listener, messages, userRepo } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      expect(userRepo.findDiscordIdByUserId).toHaveBeenCalledWith('user-1')
      expect(messages.sendPlaceholderDm).toHaveBeenCalledWith({
        discordUserId: 'discord-user-456',
        content: expect.stringContaining('Gerando standup'),
      })
    })

    it('does not create stream if discordUserId is not found', async () => {
      const { listener, messages, userRepo } = createListener()
      userRepo.findDiscordIdByUserId.mockResolvedValue({
        isErr: () => false,
        isOk: () => true,
        value: null,
      })

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      expect(messages.sendPlaceholderDm).not.toHaveBeenCalled()
    })

    it('does not create stream if discordUserId lookup fails', async () => {
      const { listener, messages, userRepo } = createListener()
      userRepo.findDiscordIdByUserId.mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
        error: { message: 'DB error' },
      })

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      expect(messages.sendPlaceholderDm).not.toHaveBeenCalled()
    })

    it('handles sendPlaceholderDm failure gracefully', async () => {
      const { listener, messages } = createListener()
      messages.sendPlaceholderDm.mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
        error: { message: 'Discord error' },
      })

      // Should not throw
      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))
    })
  })

  describe('handleProgress — streaming_content step', () => {
    it('does not edit immediately, respects 2s batch interval', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      await listener.handleProgress(
        makeProgressEvent({
          step: 'streaming_content',
          partialContent: 'Hello world',
        }),
      )

      // Should not have called updateDmMessage yet (only after timer)
      expect(messages.updateDmMessage).not.toHaveBeenCalled()
    })

    it('edits DM after 2s batch interval', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      await listener.handleProgress(
        makeProgressEvent({
          step: 'streaming_content',
          partialContent: 'Hello world',
        }),
      )

      await vi.advanceTimersByTimeAsync(2_000)

      expect(messages.updateDmMessage).toHaveBeenCalledWith({
        discordUserId: 'discord-user-456',
        messageId: 'msg-123',
        payload: {
          content: expect.stringContaining('Hello world'),
          embeds: [],
        },
      })
    })

    it('accumulates content and sends latest on flush', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      await listener.handleProgress(
        makeProgressEvent({
          step: 'streaming_content',
          partialContent: 'First',
        }),
      )

      await listener.handleProgress(
        makeProgressEvent({
          step: 'streaming_content',
          partialContent: 'First and second',
        }),
      )

      await vi.advanceTimersByTimeAsync(2_000)

      expect(messages.updateDmMessage).toHaveBeenCalledTimes(1)
      expect(messages.updateDmMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            content: expect.stringContaining('First and second'),
          }),
        }),
      )
    })

    it('ignores streaming events for unknown runIds', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(
        makeProgressEvent({
          runId: 'unknown-run',
          step: 'streaming_content',
          partialContent: 'Hello',
        }),
      )

      await vi.advanceTimersByTimeAsync(2_000)

      expect(messages.updateDmMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleProgress — completed step', () => {
    it('edits DM with success message on completed', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      await listener.handleProgress(
        makeProgressEvent({ step: 'completed' }),
      )

      expect(messages.updateDmMessage).toHaveBeenCalledWith({
        discordUserId: 'discord-user-456',
        messageId: 'msg-123',
        payload: {
          content: expect.stringContaining('Standup gerado'),
          embeds: [],
        },
      })
    })

    it('edits DM with no activity message on no_activity', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      await listener.handleProgress(
        makeProgressEvent({ step: 'no_activity' }),
      )

      expect(messages.updateDmMessage).toHaveBeenCalledWith({
        discordUserId: 'discord-user-456',
        messageId: 'msg-123',
        payload: {
          content: expect.stringContaining('Nenhuma atividade'),
          embeds: [],
        },
      })
    })

    it('clears pending batch timer on completed', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      // Start streaming to create a batch timer
      await listener.handleProgress(
        makeProgressEvent({
          step: 'streaming_content',
          partialContent: 'content',
        }),
      )

      // Complete before timer fires
      await listener.handleProgress(
        makeProgressEvent({ step: 'completed' }),
      )

      // Advance timer — should NOT trigger a stale edit
      await vi.advanceTimersByTimeAsync(2_000)

      // updateDmMessage should have been called once (the completed message)
      expect(messages.updateDmMessage).toHaveBeenCalledTimes(1)
      expect(messages.updateDmMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            content: expect.stringContaining('Standup gerado'),
          }),
        }),
      )
    })
  })

  describe('handleFailed', () => {
    it('edits DM with error message on failure', async () => {
      const { listener, messages } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      await listener.handleFailed(
        makeFailedEvent({ message: 'LLM timeout' }),
      )

      expect(messages.updateDmMessage).toHaveBeenCalledWith({
        discordUserId: 'discord-user-456',
        messageId: 'msg-123',
        payload: {
          content: expect.stringContaining('LLM timeout'),
          embeds: [],
        },
      })
    })

    it('ignores failed events for unknown runIds', async () => {
      const { listener, messages } = createListener()

      await listener.handleFailed(
        makeFailedEvent({ runId: 'unknown-run' }),
      )

      expect(messages.updateDmMessage).not.toHaveBeenCalled()
    })
  })

  describe('onModuleDestroy', () => {
    it('clears all timers and streams', async () => {
      const { listener } = createListener()

      await listener.handleProgress(makeProgressEvent({ step: 'queued' }))

      await listener.handleProgress(
        makeProgressEvent({
          step: 'streaming_content',
          partialContent: 'data',
        }),
      )

      // Should not throw
      listener.onModuleDestroy()

      // Advancing timers should have no effect
      await vi.advanceTimersByTimeAsync(5_000)
    })
  })
})
