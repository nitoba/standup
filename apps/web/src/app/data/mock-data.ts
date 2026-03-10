import type {
  Standup,
  StandupSection,
  StandupSourceRepo,
  StandupStatus,
} from '../types/standup'

export const METRIC_CHANGES = {
  total: '++ 12 this_week',
  approved: '++ 8 this_week',
  pending: '++ 3 today',
  rejected: '++ 1 today',
} as const

const TARGET_TOTAL = 142
const TARGET_APPROVED = 128
const TARGET_PENDING = 8
const TARGET_REJECTED = 6

export type StandupFilters = {
  status?: string | null
  date?: string | null
  search?: string | null
}

export function buildMockStandups(): Standup[] {
  const featured = buildFeaturedStandups()
  const remaining = TARGET_TOTAL - featured.length
  const featuredCounts = featured.reduce(
    (acc, standup) => {
      if (standup.status === 'approved') acc.approved += 1
      if (standup.status === 'pending_review') acc.pending += 1
      if (standup.status === 'rejected') acc.rejected += 1
      return acc
    },
    { approved: 0, pending: 0, rejected: 0 },
  )
  const statusPool = buildStatusPool(remaining, featuredCounts)

  const filler = Array.from({ length: remaining }, (_, index) => {
    const status = statusPool[index] ?? 'approved'
    const day = String(6 - (index % 5)).padStart(2, '0')

    return {
      id: `auto-${index + 1}`,
      date: `2026-03-${day}`,
      status,
      createdAt: '17:20',
      contentPreview:
        'updated automation flows and reviewed standup generation outputs...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    }
  })

  return [...featured, ...filler]
}

export function filterStandups(
  standups: readonly Standup[],
  filters: StandupFilters,
): Standup[] {
  return standups.filter((standup) => {
    const matchesStatus =
      !filters.status || filters.status === 'all'
        ? true
        : standup.status === filters.status
    const matchesDate =
      !filters.date || filters.date === 'all'
        ? true
        : filters.date === 'this_week'
          ? standup.date >= '2026-03-03'
          : standup.date === filters.date
    const normalizedSearch = filters.search?.trim().toLowerCase()
    const matchesSearch = !normalizedSearch
      ? true
      : [standup.contentPreview, standup.id, standup.date]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)

    return matchesStatus && matchesDate && matchesSearch
  })
}

export function updateStandupStatus(
  standups: readonly Standup[],
  id: string,
  status: StandupStatus,
): Standup | undefined {
  const target = standups.find((standup) => standup.id === id)
  if (!target) return undefined

  return {
    ...target,
    status,
  }
}

function buildStatusPool(
  remaining: number,
  featuredCounts: { approved: number; pending: number; rejected: number },
): StandupStatus[] {
  const approvedNeeded = Math.max(TARGET_APPROVED - featuredCounts.approved, 0)
  const pendingNeeded = Math.max(TARGET_PENDING - featuredCounts.pending, 0)
  const rejectedNeeded = Math.max(TARGET_REJECTED - featuredCounts.rejected, 0)

  const pool: StandupStatus[] = [
    ...Array.from({ length: approvedNeeded }, () => 'approved' as const),
    ...Array.from({ length: pendingNeeded }, () => 'pending_review' as const),
    ...Array.from({ length: rejectedNeeded }, () => 'rejected' as const),
  ]

  return pool.slice(0, remaining)
}

function buildFeaturedStandups(): Standup[] {
  return [
    {
      id: '7f3a2b1c',
      date: '2026-03-09',
      status: 'pending_review',
      createdAt: '17:32',
      contentPreview:
        'implemented retry logic with exponential backoff for standup generation pipeline...',
      sections: buildDetailSections(),
      sources: buildDetailSources(),
    },
    {
      id: 'standup-2026-03-08',
      date: '2026-03-08',
      status: 'pending_review',
      createdAt: '17:31',
      contentPreview:
        'added discord slash commands for standup trigger, list, and approve...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
    {
      id: 'standup-2026-03-07',
      date: '2026-03-07',
      status: 'approved',
      createdAt: '17:30',
      contentPreview:
        'refactored http route handlers into separate modular files for better maintainability...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
    {
      id: 'standup-2026-03-06',
      date: '2026-03-06',
      status: 'rejected',
      createdAt: '17:29',
      contentPreview:
        'added manual trigger endpoint with internal auth validation...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
    {
      id: 'standup-2026-03-05',
      date: '2026-03-05',
      status: 'approved',
      createdAt: '17:28',
      contentPreview:
        'adjusted scheduler recovery logic to prevent duplicate runs...',
      sections: buildDefaultSections(),
      sources: buildDefaultSources(),
    },
  ]
}

function buildDetailSections(): StandupSection[] {
  return [
    {
      title: '## o que foi feito',
      tone: 'default',
      items: [
        '- implementacao do endpoint de trigger manual para standups via api rest, incluindo validacao de autenticacao por session e internal secret',
        '- refatoracao dos handlers http do discord-bot, separando responsabilidades em arquivos individuais conforme convencao do projeto',
        '- correcao de bug no lock distribuido do job runner que permitia execucao duplicada quando recovery cron rodava simultaneamente',
      ],
    },
    {
      title: '## em andamento',
      tone: 'cyan',
      items: [
        '- testes de integracao para o fluxo completo de geracao e publicacao de standups [PBI-4521]',
      ],
    },
    {
      title: '## bloqueios',
      tone: 'muted',
      items: ['- nenhum bloqueio no momento'],
    },
  ]
}

function buildDefaultSections(): StandupSection[] {
  return [
    {
      title: '## o que foi feito',
      tone: 'default',
      items: ['- ajustes de pipeline e melhorias de observabilidade'],
    },
  ]
}

function buildDetailSources(): StandupSourceRepo[] {
  return [
    {
      name: 'agrotrace-api/',
      commits: [
        {
          hash: 'a3f21bc',
          message: 'feat: add manual trigger endpoint with session auth',
        },
        {
          hash: 'e7d4f98',
          message: 'fix: prevent duplicate job execution on concurrent lock',
        },
      ],
    },
    {
      name: 'agrotrace-web/',
      commits: [
        {
          hash: '1b9c3e7',
          message: 'refactor: extract http handlers into separate modules',
        },
      ],
    },
  ]
}

function buildDefaultSources(): StandupSourceRepo[] {
  return [
    {
      name: 'standup-service/',
      commits: [
        {
          hash: 'e10a3d2',
          message: 'chore: update standup generator pipeline',
        },
      ],
    },
  ]
}
