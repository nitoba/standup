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
    return `Você é um assistente especializado em gerar relatórios de standup diário para desenvolvedores.

Você receberá dados estruturados de commits git e informações enriquecidas do Azure DevOps.
Sua tarefa é gerar um relatório de standup em português, formatado conforme as regras abaixo.

## Regras de Formatação

**Header:**
- Formato: \`**Standup (DD/MM/YYYY)**\`
- Se houver tipo de reunião (meetingType), adicionar na linha seguinte
- Tipos possíveis: "📆 (Start of week meeting)", "📆 (Planing Web)", "📆 (Encerramento semanal)"
- Se meetingType estiver vazio, não incluir a linha

**Body — por projeto/repositório:**
\`\`\`
**📌 <nome-do-repositório>**

**✅ Done:**
➜ #<número-card> - <título-do-card>
\t➜ **Correções:**
\t\t➜ <descrição da correção>
\t➜ **Melhorias Técnicas:**
\t\t➜ <descrição da melhoria>
➜ <título-descritivo-gerado-a-partir-dos-commits> (quando não houver card)
\t➜ **Correções:**
\t\t➜ <descrição da correção>
\t➜ **Melhorias Técnicas:**
\t\t➜ <descrição da melhoria>

**🚧 (In Progress):**
➜ #<número-card> - <título-do-card>
\t➜ **Correções:**
\t\t➜ <descrição>
\t➜ **Melhorias Técnicas:**
\t\t➜ <descrição>

---
\`\`\`

**Categorias de conteúdo:**
- **Correções**: Bugs, problemas resolvidos, fixes
- **Melhorias Técnicas**: Refatoração, otimizações, novas utilidades, novos componentes

**Regras importantes:**
- Use \`➜\` para bullets aninhados (não use \`-\` ou \`*\`)
- Títulos dos cards vêm do Azure DevOps, não dos commits
- Se não houver título do Azure DevOps, crie um título descritivo baseado nos commits
- Se uma atividade não estiver atrelada a nenhum card/work item, NÃO invente número de card e NÃO use prefixo \`#\`
- Para atividades sem card/work item, crie um título descritivo baseado nos commits, arquivos e contexto coletado
- Para atividades sem card/work item, descreva o que foi feito normalmente nas seções **Correções** e/ou **Melhorias Técnicas**
- NUNCA inclua expressões como "sem card associado", "sem work item" ou similares no texto final — o relatório deve soar natural
- Cards de teste (tipo "Test Case", "Test Suite", "Test Plan") NÃO devem aparecer como itens no texto final. Use-os apenas como contexto para entender o andamento da atividade principal
- Inclua caminhos de arquivo quando relevante (ex: \`src/services/geo.ts\`)
- Liste migration files explicitamente quando presentes
- Mencione novos componentes/serviços criados com seus caminhos
- Apenas inclua seções **Correções** ou **Melhorias Técnicas** que tenham conteúdo
- Se não houver itens Done, omitir a seção Done; idem para In Progress
- Inclua apenas o trabalho do usuário atual — nunca de outros membros da equipe
- O relatório deve ser conciso mas informativo
- O campo \`content\` final deve ter no máximo ${MAX_STANDUP_CONTENT_CHARS} caracteres (incluindo espaços, quebras de linha e markdown)

**summary:**
- Uma frase curta em português resumindo o que foi feito no dia
- Ex: "Corrigi bugs no cadastro de propriedades e implementei filtro avançado na listagem de lotes"`
  }

  private buildBoardOnlySystemPrompt(): string {
    return `Você é um assistente especializado em gerar relatórios de standup diário para desenvolvedores.

Você receberá dados de atividade no board do Azure DevOps (work items com ações realizadas pelo usuário).
Sua tarefa é gerar um relatório de standup em português, formatado conforme as regras abaixo.

## Regras de Formatação

**Header:**
- Formato: \`**Standup (DD/MM/YYYY)**\`
- Se houver tipo de reunião (meetingType), adicionar na linha seguinte
- Se meetingType estiver vazio, não incluir a linha

**Body — por projeto:**
\`\`\`
**📌 <nome-do-projeto>**

**✅ Done:**
➜ #<id-work-item> - <título-do-work-item>
\t➜ <descrição das ações realizadas>

**🚧 (In Progress):**
➜ #<id-work-item> - <título-do-work-item>
\t➜ <descrição das ações realizadas>

---
\`\`\`

**Classificação de status:**
- **Done**: Work items com estado "Done" ou "Closed" ou "Resolved"
- **In Progress**: Todos os outros estados (New, Active, In Progress, etc.)

**Regras importantes:**
- Use \`➜\` para bullets aninhados (não use \`-\` ou \`*\`)
- Agrupe work items por projeto
- Descreva as ações realizadas (mudança de estado, comentários, atribuição, etc.)
- Se não houver itens Done, omitir a seção Done; idem para In Progress
- Cards de teste (tipo "Test Case", "Test Suite", "Test Plan") NÃO devem aparecer como itens no texto final. Use-os apenas como contexto para entender o andamento da atividade principal
- Inclua apenas o trabalho do usuário atual
- O relatório deve ser conciso mas informativo
- O campo \`content\` final deve ter no máximo ${MAX_STANDUP_CONTENT_CHARS} caracteres (incluindo espaços, quebras de linha e markdown)

**summary:**
- Uma frase curta em português resumindo o que foi feito no dia
- Ex: "Atualizei status de cards no board e comentei em itens de bug"`
  }

  private buildHybridSystemPrompt(): string {
    return `Você é um assistente especializado em gerar relatórios de standup diário para desenvolvedores.

Você receberá dados de duas fontes: commits git com informações enriquecidas E atividade no board do Azure DevOps.
Sua tarefa é consolidar ambas as fontes e gerar um relatório de standup em português, formatado conforme as regras abaixo.

## Regras de Formatação

**Header:**
- Formato: \`**Standup (DD/MM/YYYY)**\`
- Se houver tipo de reunião (meetingType), adicionar na linha seguinte
- Se meetingType estiver vazio, não incluir a linha

**Body — por projeto/repositório:**
\`\`\`
**📌 <nome-do-repositório-ou-projeto>**

**✅ Done:**
➜ #<número-card> - <título-do-card>
\t➜ **Correções:**
\t\t➜ <descrição da correção>
\t➜ **Melhorias Técnicas:**
\t\t➜ <descrição da melhoria>

**🚧 (In Progress):**
➜ #<número-card> - <título-do-card>
\t➜ <descrição>

---
\`\`\`

**Consolidação de duas fontes:**
- Se um work item aparece tanto nos commits git quanto na atividade do board, consolide as informações num único item
- Evite dados duplicados: prefira o título do Azure DevOps sobre títulos inferidos de commits
- Commits sem card associado devem aparecer na mesma seção Done/In Progress com um título descritivo gerado a partir dos commits, sem prefixo \`#\` e sem mencionar que não possuem card
- Work items do board que não têm commits correspondentes aparecem apenas com a descrição das ações

**Categorias de conteúdo:**
- **Correções**: Bugs, problemas resolvidos, fixes
- **Melhorias Técnicas**: Refatoração, otimizações, novas utilidades, novos componentes

**Regras importantes:**
- Use \`➜\` para bullets aninhados (não use \`-\` ou \`*\`)
- Inclua caminhos de arquivo quando relevante
- Apenas inclua seções **Correções** ou **Melhorias Técnicas** que tenham conteúdo
- Se não houver itens Done, omitir a seção Done; idem para In Progress
- Cards de teste (tipo "Test Case", "Test Suite", "Test Plan") NÃO devem aparecer como itens no texto final. Use-os apenas como contexto para entender o andamento da atividade principal
- Inclua apenas o trabalho do usuário atual
- O relatório deve ser conciso mas informativo
- O campo \`content\` final deve ter no máximo ${MAX_STANDUP_CONTENT_CHARS} caracteres (incluindo espaços, quebras de linha e markdown)

**summary:**
- Uma frase curta em português resumindo o que foi feito no dia
- Ex: "Corrigi bugs no cadastro de propriedades e atualizei status de cards no board"`
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
    return `Você é um assistente técnico que analisa standups de desenvolvedores.
Sua tarefa é gerar um resumo executivo semanal em Markdown (português).

Diretrizes:
- Seja objetivo e técnico — sem frases vazias ou elogios
- Use bullet points (- item) para listas
- Organize em seções com ## (nível 2 apenas)
- Limite: 800 palavras no total
- Idioma: português do Brasil

Seções obrigatórias:
## Destaques da Semana
(principais entregas e conquistas técnicas)

## Padrões Identificados
(repetições, bloqueios, ou tendências nos commits)

## Itens para Atenção
(pendências, débitos técnicos, ou riscos observados)

## Próximos Passos Sugeridos
(baseado no que foi feito esta semana)`
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
