import { Injectable } from '@nestjs/common'
import { LocalDateService } from '../../../../platform/time/local-date.service'
import type {
  GatheredBoardActivity,
  GenerateStandupInput,
  StandupRecord,
} from '../../../../shared/domain'
import type {
  EnrichedGitActivity,
  EnrichedWorkItem,
} from '../azure-devops/types'
import { loadPromptTemplate } from './prompt-template-loader'

export const MAX_STANDUP_CONTENT_CHARS = 2000

@Injectable()
export class StandupPromptService {
  constructor(private readonly localDateService: LocalDateService) {}

  determineMeetingType(dateString: string): string {
    const weekDay = this.localDateService.getDayOfWeek(dateString)

    if (weekDay === 1) return '📆 (Start of week meeting)'
    if (weekDay === 3) return '📆 (Planing Web)'
    if (weekDay === 5) return '📆 (Encerramento semanal)'
    return ''
  }

  buildSystemPrompt(sources: { hasGit: boolean; hasBoard: boolean }): string {
    if (sources.hasGit && sources.hasBoard) {
      return this.buildHybridSystemPrompt()
    }
    if (sources.hasBoard) {
      return this.buildBoardOnlySystemPrompt()
    }
    return this.buildGitOnlySystemPrompt()
  }

  private buildGitOnlySystemPrompt(): string {
    return this.interpolatePrompt(loadPromptTemplate('git-only-system.md'))
  }

  private buildBoardOnlySystemPrompt(): string {
    return this.interpolatePrompt(loadPromptTemplate('board-only-system.md'))
  }

  private buildHybridSystemPrompt(): string {
    return this.interpolatePrompt(loadPromptTemplate('hybrid-system.md'))
  }

  buildUserMessage(
    input: GenerateStandupInput,
    enrichedActivity?: EnrichedGitActivity,
  ): string {
    const formattedDate = this.localDateService.formatIsoForTimezone(
      input.date,
      'America/Sao_Paulo',
    )
    const meetingType =
      input.meetingType || this.determineMeetingType(input.date)

    const sections: string[] = [
      `Data: ${formattedDate}`,
      `Tipo de reunião: ${meetingType || '(nenhum)'}`,
      '',
    ]

    if (enrichedActivity) {
      this.appendGitSections(sections, enrichedActivity)
    }

    if (input.boardActivity) {
      this.appendBoardSections(sections, input.boardActivity)
    }

    if (enrichedActivity && input.boardActivity) {
      sections.push(
        '## Nota: os dados acima podem conter informações duplicadas entre commits git e atividade do board. Consolide e evite dados duplicados no relatório final.',
      )
      sections.push('')
    }

    if (input.extraContext) {
      sections.push('## Contexto adicional fornecido pelo usuário:')
      sections.push(input.extraContext)
      sections.push('')
    }

    sections.push('---')
    sections.push(
      'Gere o relatório de standup seguindo EXATAMENTE o formato especificado no system prompt.',
    )
    sections.push(
      `Limite obrigatório: "content" deve ter no máximo ${MAX_STANDUP_CONTENT_CHARS} caracteres.`,
    )
    sections.push(
      'Retorne um objeto JSON com "content" (relatório completo em markdown) e "summary" (frase resumo).',
    )

    return sections.join('\n')
  }

  private appendGitSections(
    sections: string[],
    enrichedActivity: EnrichedGitActivity,
  ): void {
    for (const repo of enrichedActivity.repos) {
      sections.push(`## Repositório: ${repo.repoName}`)
      sections.push('')

      if (repo.commits.length > 0) {
        sections.push(`### Commits (${repo.commits.length}):`)
        for (const commit of repo.commits) {
          const branchLabel = commit.sourceBranch
            ? ` (branch: ${commit.sourceBranch})`
            : ''
          sections.push(
            `- [${commit.hash.slice(0, 8)}] ${commit.subject}${branchLabel}`,
          )
          if (commit.body.trim()) {
            sections.push(`  Body: ${commit.body.trim()}`)
          }
          if (commit.files.length > 0) {
            sections.push(`  Arquivos alterados: ${commit.files.join(', ')}`)
          }
        }
        sections.push('')
      }

      if (repo.enrichedItems.length > 0) {
        sections.push('### Work Items enriquecidos:')
        for (const item of repo.enrichedItems) {
          const status = this.determineWorkItemStatus(item)
          const workItemTitle =
            item.workItem?.title ?? '(título não encontrado)'
          const workItemState = item.workItem?.state ?? 'unknown'

          sections.push(`#### Card #${item.cardNumber}`)
          sections.push(`- Título: ${workItemTitle}`)
          sections.push(`- Estado Azure DevOps: ${workItemState}`)
          sections.push(
            `- Status calculado: ${status === 'done' ? 'Done ✅' : 'In Progress 🚧'}`,
          )

          if (item.pullRequests.length > 0) {
            sections.push(`- Pull Requests (${item.pullRequests.length}):`)
            for (const pullRequest of item.pullRequests) {
              sections.push(
                `  - PR #${pullRequest.id}: "${pullRequest.title}" [${pullRequest.status}]`,
              )
            }
          }
          sections.push('')
        }
      } else {
        sections.push(
          '### Nota: estes commits não possuem work items associados. Gere títulos descritivos a partir dos commits e arquivos alterados. Não use prefixo # nem mencione a ausência de cards no texto final.',
        )
        sections.push('')
      }
    }
  }

  private appendBoardSections(
    sections: string[],
    boardActivity: GatheredBoardActivity,
  ): void {
    sections.push('## Atividade no Board do Azure DevOps')
    sections.push('')

    const testTypes = new Set(['Test Case', 'Test Suite', 'Test Plan'])

    for (const item of boardActivity.workItems) {
      const isTestItem = testTypes.has(item.type)
      const actionSummary = item.actions
        .map((a) => `${a.type}: ${a.details}`)
        .join('; ')
      const contextTag = isTestItem
        ? ' ⚠️ [APENAS CONTEXTO — não incluir no texto final]'
        : ''
      sections.push(
        `- **#${item.id}** — ${item.title} [${item.state}] (${item.project})${contextTag}`,
      )
      sections.push(`  Tipo: ${item.type}`)
      sections.push(`  Ações: ${actionSummary}`)
      sections.push('')
    }
  }

  buildRewriteUserMessage(content: string, summary: string): string {
    return `O conteúdo gerado ultrapassou o limite de ${MAX_STANDUP_CONTENT_CHARS} caracteres.

Reescreva o standup mantendo o mesmo idioma, formato e regras do system prompt.
Priorize informações de maior impacto e remova redundâncias.

Regras obrigatórias:
- O campo "content" final deve ter no máximo ${MAX_STANDUP_CONTENT_CHARS} caracteres
- Preserve a estrutura de seções por repositório e status (Done/In Progress), quando houver
- Mantenha o texto em português
- Retorne um objeto JSON com "content" e "summary"

Resumo atual:
${summary}

Conteúdo atual para reescrever:
\`\`\`markdown
${content}
\`\`\``
  }

  buildAdjustUserMessage(
    previousContent: string,
    instruction: string,
    extraContext?: string,
  ): string {
    const sections: string[] = [
      '## Tarefa: edição cirúrgica de standup',
      '',
      'Você receberá um standup já pronto e uma instrução de ajuste pontual.',
      'Sua única tarefa é aplicar EXCLUSIVAMENTE o que a instrução pede — nada mais, nada menos.',
      '',
      '### Regras OBRIGATÓRIAS (leia antes de tudo)',
      '',
      '1. **NÃO reescreva, reformule ou altere seções não mencionadas na instrução.**',
      '   Trate todas as seções não citadas como somente-leitura: copie-as palavra por palavra.',
      '2. **Aplique apenas a mudança descrita na instrução.**',
      '   Se a instrução diz "remova o item X", remova só esse item; o resto fica intacto.',
      '   Se diz "adicione Y em Done", adicione apenas Y nessa seção; nada mais muda.',
      '3. **Preserve 100% da estrutura e formatação originais** (headers, emojis, indentação, `➜`, `---`).',
      '4. **Não melhore, não resuma, não expanda** conteúdo não mencionado.',
      `5. O campo "content" final deve ter no máximo ${MAX_STANDUP_CONTENT_CHARS} caracteres.`,
      '6. Retorne JSON com "content" (standup ajustado em Markdown) e "summary" (frase resumo em português).',
      '',
      '### Instrução de ajuste',
      '',
      instruction,
    ]

    if (extraContext) {
      sections.push('', '### Contexto adicional', '', extraContext)
    }

    sections.push(
      '',
      '### Standup original (somente-leitura exceto onde a instrução pede alteração)',
      '',
      '```markdown',
      previousContent,
      '```',
      '',
      'Aplique a instrução acima de forma cirúrgica e retorne o standup ajustado.',
    )

    return sections.join('\n')
  }

  buildWeeklyInsightsUserMessage(standups: StandupRecord[]): string {
    const lines: string[] = [
      `Analise os ${standups.length} standups aprovados da semana abaixo e gere o resumo executivo:`,
      '',
    ]

    for (const standup of standups) {
      lines.push(
        `### ${this.localDateService.formatIsoForTimezone(standup.date, 'America/Sao_Paulo')} — ${standup.meetingType}`,
      )
      lines.push(standup.content)
      lines.push('')
    }

    return lines.join('\n')
  }

  buildWeeklyInsightsSystemPrompt(): string {
    return loadPromptTemplate('weekly-insights-system.md')
  }

  private interpolatePrompt(template: string): string {
    return template.replaceAll(
      '{{MAX_STANDUP_CONTENT_CHARS}}',
      String(MAX_STANDUP_CONTENT_CHARS),
    )
  }

  private determineWorkItemStatus(
    item: EnrichedWorkItem,
  ): 'done' | 'in_progress' {
    const state = item.workItem?.state ?? ''

    if (state === 'Done') {
      return 'done'
    }

    if (state === 'In Progress' && item.pullRequests.length > 0) {
      const allDoneOrActive = item.pullRequests.every(
        (pullRequest) =>
          pullRequest.status === 'completed' || pullRequest.status === 'active',
      )

      if (allDoneOrActive) {
        return 'done'
      }
    }

    return 'in_progress'
  }
}
