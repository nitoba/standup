# Standup Generation Fixes — Design Spec

**Data:** 2026-04-01
**Problema:** A geracao de standups apresenta tres defeitos recorrentes: (1) status Done/In Progress incorreto, (2) work items duplicados entre projetos, (3) alucinacao de items inexistentes e repeticao de items de geracoes anteriores.

---

## 1. Deduplicacao de work items no collector

### Problema

O `AzureDevopsActivityCollectorService.collect()` itera sobre todos os projetos configurados em `AZURE_DEVOPS_PROJECTS` e concatena os resultados sem deduplicar. Um mesmo work item (ex: #11955) aparece 3x — uma vez para AGROTRACE, CHECKMILK e JASPER-RELATORIOS — porque a query WIQL retorna o mesmo item em cada projeto scope.

Isso gera ruido no prompt e confunde a LLM.

### Solucao

Apos agregar todos os items no metodo `collect()`, deduplicar por `id`. Para o item retido:

- Extrair o projeto real do `AreaPath` (primeiro segmento, ex: `AGROTRACE\Devops` -> `AGROTRACE`)
- Se `AreaPath` nao estiver disponivel nos dados atuais, adicionar `System.AreaPath` ao array `WORK_ITEM_FIELDS` na query
- Fallback: usar o campo `project` da primeira ocorrencia encontrada
- Mesclar as `actions` de todas as ocorrencias (remover duplicatas por `timestamp + details`)

### Arquivo alvo

`apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts`

### Mudancas

1. Adicionar `System.AreaPath` ao `WORK_ITEM_FIELDS`
2. No `buildWorkItemActivity()`, extrair o projeto do `AreaPath` quando disponivel
3. No `collect()`, apos o loop de projetos, deduplicar `allWorkItems` por `id`:
   - Agrupar por `id`
   - Para cada grupo, manter um unico item com projeto extraido do `AreaPath`
   - Mesclar actions sem duplicatas

---

## 2. Periodo de coleta inteligente

### Problema

O `sincePeriod` default e "8 hours ago", calculado como offset a partir de `Date.now()`. Isso causa dois problemas:

1. Se o standup e gerado as 17:30, o periodo cobre desde 09:30 — pode incluir atividade ja reportada num standup anterior do mesmo dia
2. Se o standup e gerado de manha, o periodo pode cobrir atividade do dia anterior que ja foi reportada

### Solucao

O `sinceDate` passa a ser calculado como: **o mais recente entre "meia-noite no timezone do usuario" e "timestamp do ultimo standup aprovado/publicado"**.

#### Calculo

```
midnightUser = meia-noite no timezone do usuario (ex: America/Sao_Paulo)
lastApproved = createdAt do ultimo standup com status 'approved' ou 'published'
sinceDate    = max(midnightUser, lastApproved ?? midnightUser)
```

Se nao existir standup anterior, usa meia-noite como fallback.

#### Onde aplicar

O calculo deve ser feito no **`ExecuteGenerateStrategy`** (`apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`), que e o caller tanto do `gitCollector.collect()` (linha 60) quanto do `boardCollector.collect()` (linha 97). Ambos recebem `options.gitSincePeriod ?? '8 hours ago'` hoje.

A strategy deve:
1. Injetar o repositorio de standups (ou um servico que exponha a query)
2. No inicio do `execute()`, buscar o ultimo standup com status `approved` ou `published` para o `options.userId`
3. Calcular `sinceDate = max(midnightUser, lastApproved?.createdAt ?? midnightUser)` usando `options.timezone`
4. Passar o `sinceDate` (ISO string) para ambos os collectors em vez de `options.gitSincePeriod`

O collector continua recebendo um `sincePeriod` string, mas `resolveSinceDate()` deve aceitar tanto o formato `"X hours ago"` quanto ISO date direto (detectando pelo formato).

**Arquivos alvo:**

- `execute-generate-strategy.ts` — calcular sinceDate inteligente, passar para ambos os collectors
- `azure-devops-activity-collector.service.ts` — ajustar `resolveSinceDate()` para aceitar ISO date
- `git-collector.service.ts` — ajustar para aceitar ISO date (se o metodo de resolucao de periodo for interno)

---

## 3. Mapeamento de estados expandido

### Problema

O metodo `determineWorkItemStatus()` em `StandupPromptService` so reconhece `"Done"` como estado concluido. Estados como `"Test QA"`, `"Closed"`, `"Resolved"` caem para `in_progress`, mesmo que o trabalho de desenvolvimento esteja completo.

### Solucao

Expandir o conjunto de estados reconhecidos como "done":

```typescript
private determineWorkItemStatus(item: EnrichedWorkItem): 'done' | 'in_progress' {
  const DONE_STATES = new Set(['Done', 'Closed', 'Resolved', 'Test QA'])
  const state = item.workItem?.state ?? ''

  if (DONE_STATES.has(state)) return 'done'

  if (state === 'In Progress' && item.pullRequests.length > 0) {
    const allDoneOrActive = item.pullRequests.every(
      pr => pr.status === 'completed' || pr.status === 'active'
    )
    if (allDoneOrActive) return 'done'
  }

  return 'in_progress'
}
```

O `DONE_STATES` pode ser extraido como constante no topo do arquivo para facilitar manutencao futura.

### Arquivo alvo

`apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.ts`

### Testes

Atualizar os testes existentes de `determineWorkItemStatus` (se houver) e adicionar casos para `"Test QA"`, `"Closed"` e `"Resolved"`.

---

## 4. Prompt anti-alucinacao e orientacao de status

### Problema

A LLM gera work items que nao existem nos dados fonte (ex: #11887 apareceu no output sem estar em commits ou board). Alem disso, a LLM ignora o "Status calculado" e infere status por conta propria.

### Solucao

Adicionar instrucoes explicitas nos templates de prompt.

#### Anti-alucinacao

Adicionar na secao "Regras importantes" de ambos os templates (`hybrid-system.md` e `git-only-system.md`):

```
- REGRA CRITICA: NUNCA invente, fabrique ou inclua work items, cards ou numeros de card
  que nao estejam EXPLICITAMENTE presentes nos dados fornecidos abaixo. Se um item nao
  aparece nos commits git ou na atividade do board, ele NAO existe para este standup.
  Incluir items inexistentes e uma falha grave.
```

#### Orientacao de status

Adicionar na secao "Regras importantes":

```
- Para classificar items como Done ou In Progress, use EXCLUSIVAMENTE o campo
  "Status calculado" quando disponivel. Para items do board sem status calculado,
  considere como Done os estados: "Done", "Closed", "Resolved", "Test QA".
  Todos os demais estados sao In Progress.
```

#### Template `board-only-system.md`

Adicionar as mesmas instrucoes de anti-alucinacao e status (adaptadas para contexto board-only).

### Arquivos alvo

- `apps/api/src/contexts/standups/worker/standup-generator/prompts/hybrid-system.md`
- `apps/api/src/contexts/standups/worker/standup-generator/prompts/git-only-system.md`
- `apps/api/src/contexts/standups/worker/standup-generator/prompts/board-only-system.md`

---

## Resumo de arquivos impactados

| Arquivo | Mudanca |
|---------|---------|
| `azure-devops-activity-collector.service.ts` | Deduplicacao por ID + AreaPath, aceitar ISO em sinceDate |
| `execute-generate-strategy.ts` | Calcular sinceDate inteligente (max de meia-noite e ultimo standup aprovado) |
| `standup-prompt.service.ts` | Expandir DONE_STATES no `determineWorkItemStatus` |
| `hybrid-system.md` | Anti-alucinacao + orientacao de status |
| `git-only-system.md` | Anti-alucinacao + orientacao de status |
| `board-only-system.md` | Anti-alucinacao + orientacao de status |
| `git-collector.service.ts` | Aceitar ISO date no sincePeriod (se resolucao for interna) |

## Fora de escopo

- Mudancas no schema do banco de dados
- Mudancas na UI/Discord bot
- Novos endpoints de API
- Refatoracao de arquivos nao listados acima
