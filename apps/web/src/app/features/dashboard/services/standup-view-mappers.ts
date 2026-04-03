import type { StandupRecordDto } from '../../../api/model'
import type {
  Standup,
  StandupCustomEntriesDto,
  StandupSection,
  StandupSourceRepo,
} from '../../../shared/models/standup-models'
import { formatTimestampPtBr } from '../../../shared/utils'
import { normalizeStandupStatus } from '../../../shared/utils/standup-status'

type SourceDataDto = {
  repos?: Array<{
    repoName?: string
    commits?: Array<{ hash?: string; subject?: string; message?: string }>
  }>
}

export function buildStandupContentPreview(content: string) {
  const preview = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('- '))

  return preview ? preview.slice(2) : content.trim()
}

export function parseStandupSections(content: string): StandupSection[] {
  const lines = content.split('\n').map((line) => line.trim())
  const sections: StandupSection[] = []
  let currentSection: StandupSection | null = null

  for (const line of lines) {
    if (!line) continue

    if (line.startsWith('## ')) {
      currentSection = {
        title: line,
        tone: resolveSectionTone(line),
        items: [],
      }
      sections.push(currentSection)
      continue
    }

    if (line.startsWith('- ')) {
      if (!currentSection) {
        currentSection = { title: '## resumo', tone: 'default', items: [] }
        sections.push(currentSection)
      }

      currentSection.items.push(line)
    }
  }

  return sections
}

export function parseStandupSources(sourceData: string): StandupSourceRepo[] {
  try {
    const parsed = JSON.parse(sourceData) as SourceDataDto

    return (parsed.repos ?? []).map((repo) => ({
      name: formatRepoName(repo.repoName),
      commits: (repo.commits ?? []).map((commit) => ({
        hash: commit.hash ?? '',
        message: commit.subject ?? commit.message ?? '',
      })),
    }))
  } catch (error) {
    // Log to aid debugging — corrupt sourceData is invisible otherwise (TAS-65)
    console.warn('[StandupService] failed to parse source data', error)
    return []
  }
}

export function formatStandupSourceData(sourceData: string) {
  try {
    return JSON.stringify(JSON.parse(sourceData), null, 2)
  } catch (error) {
    // Log to aid debugging — corrupt sourceData is invisible otherwise (TAS-65)
    console.warn('[StandupService] failed to format source data', error)
    return sourceData
  }
}

export function mapStandupRecordDtoToStandup(dto: StandupRecordDto): Standup {
  return {
    id: dto.id,
    date: dto.date,
    status: mapStandupRecordStatus(dto.status),
    createdAt: formatTimestampPtBr(dto.createdAt),
    content: dto.content,
    sourceData: formatStandupSourceData(dto.sourceData),
    contentPreview: buildStandupContentPreview(dto.content),
    customEntries: parseCustomEntries(dto.customEntries),
    sentToDiscordAt: dto.sentToDiscordAt ?? null,
    sections: parseStandupSections(dto.content),
    sources: parseStandupSources(dto.sourceData),
  }
}

export function mapStandupRecordStatus(status: StandupRecordDto['status']) {
  return normalizeStandupStatus(status)
}

function parseCustomEntries(
  customEntries: StandupRecordDto['customEntries'],
): StandupCustomEntriesDto | null {
  if (!customEntries || typeof customEntries !== 'object') return null

  const scheduledMeetings = Array.isArray(customEntries.scheduledMeetings)
    ? customEntries.scheduledMeetings.filter(
        (value): value is string => typeof value === 'string',
      )
    : []
  const directCalls = Array.isArray(customEntries.directCalls)
    ? customEntries.directCalls.filter(
        (value): value is string => typeof value === 'string',
      )
    : []

  if (scheduledMeetings.length === 0 && directCalls.length === 0) return null

  return { scheduledMeetings, directCalls }
}

function resolveSectionTone(title: string): StandupSection['tone'] {
  const normalizedTitle = title.toLowerCase()
  if (normalizedTitle.includes('andamento')) return 'cyan'
  if (normalizedTitle.includes('bloqueio')) return 'muted'
  return 'default'
}

function formatRepoName(name?: string) {
  const normalizedName = name?.trim() ?? ''
  if (!normalizedName) return 'unknown/'
  return normalizedName.endsWith('/') ? normalizedName : `${normalizedName}/`
}
