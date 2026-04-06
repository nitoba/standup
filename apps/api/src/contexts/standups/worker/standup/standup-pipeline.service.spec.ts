import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { StandupPipelineService } from './standup-pipeline.service'

describe('StandupPipelineService', () => {
  function makeLoggerFactory() {
    return {
      create: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    }
  }

  it('reuses the existing daily draft instead of inserting a duplicate standup', async () => {
    const replaceGeneratedForUser = vi.fn().mockResolvedValue(
      Result.ok({
        id: 'standup-1',
      }),
    )
    const create = vi.fn()
    const service = new StandupPipelineService(
      makeLoggerFactory() as never,
      {
        create,
        replaceGeneratedForUser,
      } as never,
      {
        findLatestByUserAndDate: vi.fn().mockResolvedValue(
          Result.ok({
            id: 'standup-1',
            status: 'draft',
          }),
        ),
      } as never,
      {
        emitStandupProgress: vi.fn(),
        notifyUserDm: vi.fn(),
        notifyStandupReady: vi.fn(),
        emitStandupGenerated: vi.fn(),
      } as never,
      {
        execute: vi.fn().mockResolvedValue(
          Result.ok({
            meetingType: 'daily',
            content: 'Standup gerado',
            sourceData: '{"git":[],"board":[]}',
          }),
        ),
      } as never,
      { execute: vi.fn() } as never,
    )

    const result = await service.execute({
      options: {
        userId: 'user-1',
        discordUserId: 'discord-1',
        selectedRepos: ['repo-a'],
        gitAuthor: 'nitoba',
        timezone: 'America/Sao_Paulo',
      },
      runId: 'run-1',
      todayIso: '2026-04-06',
      todayDisplay: '06/04/2026',
      runMode: 'generate',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toBe('standup-1')
    }

    expect(create).not.toHaveBeenCalled()
    expect(replaceGeneratedForUser).toHaveBeenCalledWith(
      'standup-1',
      'user-1',
      {
        meetingType: 'daily',
        content: 'Standup gerado',
        sourceData: '{"git":[],"board":[]}',
      },
    )
  })
})
