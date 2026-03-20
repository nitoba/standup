import { describe, expect, it } from 'vitest'
import type {
  GatheredBoardActivity,
  GenerateStandupInput,
} from '../../../../shared/domain'
import type { EnrichedGitActivity } from '../azure-devops/types'
import { StandupPromptService } from './standup-prompt.service'

function createService(): StandupPromptService {
  const localDateService = {
    getDayOfWeek: () => 2,
    formatIsoForTimezone: (_iso: string, _tz: string) => '16/03/2026',
  }
  return new StandupPromptService(localDateService as never)
}

const baseBoardActivity: GatheredBoardActivity = {
  timestamp: '2026-03-16T17:00:00.000Z',
  workItems: [
    {
      id: 1234,
      title: 'Implementar filtro avançado',
      type: 'User Story',
      state: 'Done',
      assignedTo: 'dev@company.com',
      project: 'AGROTRACE',
      actions: [
        {
          type: 'state_change',
          timestamp: '2026-03-16T15:00:00.000Z',
          details: 'Active → Done',
        },
      ],
    },
    {
      id: 5678,
      title: 'Corrigir bug no mapa',
      type: 'Bug',
      state: 'Active',
      assignedTo: 'dev@company.com',
      project: 'AGROTRACE',
      actions: [
        {
          type: 'commented',
          timestamp: '2026-03-16T14:00:00.000Z',
          details: 'Added a comment',
        },
      ],
    },
  ],
}

const baseEnrichedActivity: EnrichedGitActivity = {
  timestamp: '2026-03-16T17:00:00.000Z',
  userUuid: 'user-uuid',
  repos: [
    {
      repoName: 'my-repo',
      repoPath: '/path/to/repo',
      commits: [
        {
          hash: 'abc12345',
          subject: 'fix: correct map rendering',
          body: '',
          sourceBranch: 'main',
          filesChanged: 1,
          insertions: 5,
          deletions: 2,
          files: ['src/map.ts'],
        },
      ],
      cardNumbers: ['5678'],
      enrichedItems: [],
    },
  ],
}

describe('StandupPromptService', () => {
  describe('buildSystemPrompt', () => {
    it('returns git-only prompt when only hasGit is true', () => {
      const service = createService()
      const prompt = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: false,
      })

      expect(prompt).toContain('commits git')
      expect(prompt).not.toContain('board')
      expect(prompt).not.toContain('duas fontes')
    })

    it('returns board-only prompt when only hasBoard is true', () => {
      const service = createService()
      const prompt = service.buildSystemPrompt({
        hasGit: false,
        hasBoard: true,
      })

      expect(prompt).toContain('board')
      expect(prompt).not.toContain('commits git')
      expect(prompt).not.toContain('duas fontes')
    })

    it('returns hybrid prompt when both sources are present', () => {
      const service = createService()
      const prompt = service.buildSystemPrompt({ hasGit: true, hasBoard: true })

      expect(prompt).toContain('duas fontes')
    })
  })

  describe('buildUserMessage', () => {
    it('includes board section when boardActivity is present', () => {
      const service = createService()
      const input: GenerateStandupInput = {
        date: '2026-03-16',
        meetingType: '',
        boardActivity: baseBoardActivity,
      }

      const message = service.buildUserMessage(input)

      expect(message).toContain('Atividade no Board')
      expect(message).toContain('#1234')
      expect(message).toContain('Implementar filtro avançado')
      expect(message).toContain('#5678')
      expect(message).toContain('Corrigir bug no mapa')
    })

    it('includes git section when enrichedActivity is provided', () => {
      const service = createService()
      const input: GenerateStandupInput = {
        date: '2026-03-16',
        meetingType: '',
        gitActivity: {
          timestamp: '2026-03-16T17:00:00.000Z',
          repos: [],
        },
      }

      const message = service.buildUserMessage(input, baseEnrichedActivity)

      expect(message).toContain('Repositório: my-repo')
      expect(message).toContain('abc12345')
      expect(message).not.toContain('Atividade no Board')
    })

    it('includes deduplication note when both sources are present', () => {
      const service = createService()
      const input: GenerateStandupInput = {
        date: '2026-03-16',
        meetingType: '',
        gitActivity: {
          timestamp: '2026-03-16T17:00:00.000Z',
          repos: [],
        },
        boardActivity: baseBoardActivity,
      }

      const message = service.buildUserMessage(input, baseEnrichedActivity)

      expect(message).toContain('dados duplicados')
      expect(message).toContain('Atividade no Board')
      expect(message).toContain('Repositório: my-repo')
    })

    it('does not include "sem card associado" in user message for repos without work items', () => {
      const service = createService()
      const input: GenerateStandupInput = {
        date: '2026-03-16',
        meetingType: '',
        gitActivity: {
          timestamp: '2026-03-16T17:00:00.000Z',
          repos: [],
        },
      }

      const message = service.buildUserMessage(input, baseEnrichedActivity)

      expect(message).not.toContain('sem card associado')
      expect(message).not.toContain('Sem work items associados')
      expect(message).toContain('Repositório: my-repo')
    })

    it('git-only system prompt does not contain "sem card associado" as a section header', () => {
      const service = createService()
      const prompt = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: false,
      })

      expect(prompt).not.toContain('(sem card associado)')
      expect(prompt).toContain(
        'NUNCA inclua expressões como "sem card associado"',
      )
    })

    it('works with only board activity (no enrichedActivity)', () => {
      const service = createService()
      const input: GenerateStandupInput = {
        date: '2026-03-16',
        meetingType: '',
        boardActivity: baseBoardActivity,
      }

      const message = service.buildUserMessage(input)

      expect(message).toContain('Atividade no Board')
      expect(message).not.toContain('Repositório')
      expect(message).not.toContain('dados duplicados')
    })
  })
})
