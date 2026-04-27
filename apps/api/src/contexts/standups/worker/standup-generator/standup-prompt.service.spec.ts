import { describe, expect, it } from 'vitest'
import type {
  GatheredBoardActivity,
  GenerateStandupInput,
} from '../../../../shared/domain'
import type { EnrichedGitActivity } from '../azure-devops/types'
import { StandupPromptService } from './standup-prompt.service'

type LocalDateServiceMockOptions = {
  formattedDateByIso?: Record<string, string>
  meetingTypeByDate?: Record<string, string>
}

function createService(
  options: LocalDateServiceMockOptions = {},
): StandupPromptService {
  const localDateService = {
    formatIsoForTimezone: (iso: string, _tz: string) =>
      options.formattedDateByIso?.[iso] ?? '16/03/2026',
  }
  const meetingSchedule = {
    getMeetingType: (iso: string) => options.meetingTypeByDate?.[iso] ?? '',
  }

  return new StandupPromptService(
    localDateService as never,
    meetingSchedule as never,
  )
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

    it('uses automatic meeting type when input does not provide one', () => {
      const service = createService({
        formattedDateByIso: { '2026-05-01': '01/05/2026' },
        meetingTypeByDate: { '2026-05-01': '📆 (Spotlight - Web)' },
      })
      const input: GenerateStandupInput = {
        date: '2026-05-01',
        meetingType: '',
        boardActivity: baseBoardActivity,
      }

      const message = service.buildUserMessage(input)

      expect(message).toContain('Data: 01/05/2026')
      expect(message).toContain('Tipo de reunião: 📆 (Spotlight - Web)')
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

    it('all system prompts contain test card exclusion rule', () => {
      const service = createService()
      const gitOnly = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: false,
      })
      const boardOnly = service.buildSystemPrompt({
        hasGit: false,
        hasBoard: true,
      })
      const hybrid = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: true,
      })

      for (const prompt of [gitOnly, boardOnly, hybrid]) {
        expect(prompt).toContain('Test Case')
        expect(prompt).toContain('NÃO devem aparecer como itens no texto final')
      }
    })

    it('marks Test Case board items as context-only in user message', () => {
      const service = createService()
      const input: GenerateStandupInput = {
        date: '2026-03-16',
        meetingType: '',
        boardActivity: {
          timestamp: '2026-03-16T17:00:00.000Z',
          workItems: [
            {
              id: 9999,
              title: 'Validar fluxo de cadastro',
              type: 'Test Case',
              state: 'Active',
              assignedTo: 'dev@company.com',
              project: 'AGROTRACE',
              actions: [
                {
                  type: 'state_change',
                  timestamp: '2026-03-16T14:00:00.000Z',
                  details: 'New → Active',
                },
              ],
            },
            {
              id: 1000,
              title: 'Implementar busca',
              type: 'User Story',
              state: 'Active',
              assignedTo: 'dev@company.com',
              project: 'AGROTRACE',
              actions: [
                {
                  type: 'state_change',
                  timestamp: '2026-03-16T15:00:00.000Z',
                  details: 'New → Active',
                },
              ],
            },
          ],
        },
      }

      const message = service.buildUserMessage(input)

      expect(message).toContain('#9999')
      expect(message).toContain('APENAS CONTEXTO')
      expect(message).toContain('#1000')

      // Test Case should be tagged, User Story should not
      const lines = message.split('\n')
      const testCaseLine = lines.find((l) => l.includes('#9999'))
      const userStoryLine = lines.find((l) => l.includes('#1000'))
      expect(testCaseLine).toContain('APENAS CONTEXTO')
      expect(userStoryLine).not.toContain('APENAS CONTEXTO')
    })

    it('all system prompts contain status grouping rule', () => {
      const service = createService()
      const gitOnly = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: false,
      })
      const boardOnly = service.buildSystemPrompt({
        hasGit: false,
        hasBoard: true,
      })
      const hybrid = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: true,
      })

      for (const prompt of [gitOnly, boardOnly, hybrid]) {
        expect(prompt).toContain('NO MÁXIMO uma seção')
        expect(prompt).toContain('NUNCA repita o header de status')
      }
    })

    it('all system prompts contain anti-hallucination rule', () => {
      const service = createService()
      const gitOnly = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: false,
      })
      const boardOnly = service.buildSystemPrompt({
        hasGit: false,
        hasBoard: true,
      })
      const hybrid = service.buildSystemPrompt({ hasGit: true, hasBoard: true })

      for (const prompt of [gitOnly, boardOnly, hybrid]) {
        expect(prompt).toContain('NUNCA invente')
        expect(prompt).toContain('falha grave')
      }
    })

    it('all system prompts list Test QA as a done state', () => {
      const service = createService()
      const gitOnly = service.buildSystemPrompt({
        hasGit: true,
        hasBoard: false,
      })
      const boardOnly = service.buildSystemPrompt({
        hasGit: false,
        hasBoard: true,
      })
      const hybrid = service.buildSystemPrompt({ hasGit: true, hasBoard: true })

      for (const prompt of [gitOnly, boardOnly, hybrid]) {
        expect(prompt).toContain('Test QA')
      }
    })
  })
})

describe('determineWorkItemStatus (via buildUserMessage)', () => {
  function buildInputWithEnrichedItem(
    state: string,
    pullRequests: {
      id: number
      title: string
      status: 'active' | 'completed' | 'abandoned'
      repoId: string
      creatorId: string
    }[] = [],
  ) {
    const enrichedActivity: EnrichedGitActivity = {
      timestamp: '2026-03-16T17:00:00.000Z',
      userUuid: 'user-uuid',
      repos: [
        {
          repoName: 'my-repo',
          repoPath: '/path/to/repo',
          commits: [
            {
              hash: 'abc12345',
              subject: 'fix: something',
              body: '',
              sourceBranch: 'feat/1234-feature',
              filesChanged: 1,
              insertions: 1,
              deletions: 0,
              files: ['src/file.ts'],
            },
          ],
          cardNumbers: ['1234'],
          enrichedItems: [
            {
              cardNumber: '1234',
              workItem: {
                id: '1234',
                title: 'Some task',
                state,
                assignedTo: 'dev@company.com',
              },
              pullRequests,
            },
          ],
        },
      ],
    }

    const input: GenerateStandupInput = {
      date: '2026-03-16',
      meetingType: '',
      gitActivity: { timestamp: '2026-03-16T17:00:00.000Z', repos: [] },
    }

    return { input, enrichedActivity }
  }

  it.each([
    ['Done', 'Done ✅'],
    ['Closed', 'Done ✅'],
    ['Resolved', 'Done ✅'],
    ['Test QA', 'Done ✅'],
  ])('maps Azure DevOps state "%s" to "%s"', (state, expectedLabel) => {
    const service = createService()
    const { input, enrichedActivity } = buildInputWithEnrichedItem(state)
    const message = service.buildUserMessage(input, enrichedActivity)
    expect(message).toContain(`Status calculado: ${expectedLabel}`)
  })

  it.each([
    ['New'],
    ['Committed'],
    ['Active'],
    ['In Progress'],
  ])('maps Azure DevOps state "%s" to "In Progress 🚧"', (state) => {
    const service = createService()
    const { input, enrichedActivity } = buildInputWithEnrichedItem(state)
    const message = service.buildUserMessage(input, enrichedActivity)
    expect(message).toContain('Status calculado: In Progress 🚧')
  })

  it('maps "In Progress" with all completed/active PRs to Done', () => {
    const service = createService()
    const { input, enrichedActivity } = buildInputWithEnrichedItem(
      'In Progress',
      [
        {
          id: 1,
          title: 'PR 1',
          status: 'completed',
          repoId: 'r1',
          creatorId: 'u1',
        },
      ],
    )
    const message = service.buildUserMessage(input, enrichedActivity)
    expect(message).toContain('Status calculado: Done ✅')
  })
})
