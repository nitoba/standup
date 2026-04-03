import { describe, expect, it, vi } from 'vitest'
import type { StandupRecordDto } from '../../../api/model'
import {
  buildStandupContentPreview,
  formatStandupSourceData,
  mapStandupRecordDtoToStandup,
  parseStandupSections,
  parseStandupSources,
} from './standup-view-mappers'

describe('standup-view-mappers', () => {
  it('preserves draft when mapping a standup record dto', () => {
    const standup = mapStandupRecordDtoToStandup(
      makeStandupRecordDto({ status: 'draft' }),
    )

    expect(standup.status).toBe('draft')
  })

  it('builds content preview from the first bullet', () => {
    expect(
      buildStandupContentPreview(
        '## o que foi feito\n- delivered dashboard filters\n- fixed retries',
      ),
    ).toBe('delivered dashboard filters')
  })

  it('falls back to trimmed content when no bullet exists', () => {
    expect(buildStandupContentPreview('  resumo sem bullets  ')).toBe(
      'resumo sem bullets',
    )
  })

  it('creates a synthetic resumo section for bullets before headings', () => {
    expect(
      parseStandupSections(
        '- resumo rapido\n## o que foi feito\n- entregou filtros',
      ),
    ).toEqual([
      {
        title: '## resumo',
        tone: 'default',
        items: ['- resumo rapido'],
      },
      {
        title: '## o que foi feito',
        tone: 'default',
        items: ['- entregou filtros'],
      },
    ])
  })

  it('preserves section tone rules for andamento and bloqueio headings', () => {
    expect(
      parseStandupSections(
        '## em andamento\n- lapidando fluxo\n## bloqueios\n- aguardando review',
      ),
    ).toEqual([
      {
        title: '## em andamento',
        tone: 'cyan',
        items: ['- lapidando fluxo'],
      },
      {
        title: '## bloqueios',
        tone: 'muted',
        items: ['- aguardando review'],
      },
    ])
  })

  it('parses standup sources from valid source data', () => {
    expect(
      parseStandupSources(
        JSON.stringify({
          repos: [
            {
              repoName: 'standup-web',
              commits: [
                { hash: 'abc1234', subject: 'feat: ship dashboard filters' },
              ],
            },
          ],
        }),
      ),
    ).toEqual([
      {
        name: 'standup-web/',
        commits: [
          {
            hash: 'abc1234',
            message: 'feat: ship dashboard filters',
          },
        ],
      },
    ])
  })

  it('returns an empty list on malformed source data and keeps console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(parseStandupSources('{ invalid json')).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      '[StandupService] failed to parse source data',
      expect.any(SyntaxError),
    )
  })

  it('pretty prints valid source data and returns raw input on malformed json', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(formatStandupSourceData('{"repos":[]}')).toBe('{\n  "repos": []\n}')
    expect(formatStandupSourceData('{ invalid json')).toBe('{ invalid json')
    expect(warn).toHaveBeenCalledWith(
      '[StandupService] failed to format source data',
      expect.any(SyntaxError),
    )
  })

  it('maps a standup record dto to the shape expected by the service specs', () => {
    expect(mapStandupRecordDtoToStandup(makeStandupRecordDto())).toEqual(
      expect.objectContaining({
        id: 'standup-1',
        date: '09/03/2026',
        status: 'approved',
        content: '## o que foi feito\n- shipped the dashboard filters',
        sourceData:
          '{\n  "repos": [\n    {\n      "repoName": "standup-web",\n      "commits": [\n        {\n          "hash": "abc1234",\n          "subject": "feat: ship dashboard filters"\n        }\n      ]\n    }\n  ]\n}',
        contentPreview: 'shipped the dashboard filters',
        customEntries: null,
        sentToDiscordAt: null,
        sections: [
          {
            title: '## o que foi feito',
            tone: 'default',
            items: ['- shipped the dashboard filters'],
          },
        ],
        sources: [
          {
            name: 'standup-web/',
            commits: [
              {
                hash: 'abc1234',
                message: 'feat: ship dashboard filters',
              },
            ],
          },
        ],
      }),
    )
  })
})

function makeStandupRecordDto(
  overrides: Partial<StandupRecordDto> = {},
): StandupRecordDto {
  return {
    id: 'standup-1',
    date: '09/03/2026',
    meetingType: 'daily',
    content: '## o que foi feito\n- shipped the dashboard filters',
    sourceData: JSON.stringify({
      repos: [
        {
          repoName: 'standup-web',
          commits: [
            { hash: 'abc1234', subject: 'feat: ship dashboard filters' },
          ],
        },
      ],
    }),
    customEntries: null,
    status: 'approved',
    userId: 'user-1',
    createdAt: Date.UTC(2026, 2, 9, 17, 32, 0),
    updatedAt: Date.UTC(2026, 2, 9, 17, 40, 0),
    ...overrides,
  }
}
