// apps/api/src/interfaces/discord/features/list/list.dto.ts
import { IntegerOption, StringOption } from 'necord'

const STATUS_CHOICES = [
  { name: 'Rascunho', value: 'draft' },
  { name: 'Aguardando DM', value: 'delivery_pending' },
  { name: 'Pendente de Revisão', value: 'pending_review' },
  { name: 'Aprovado', value: 'approved' },
  { name: 'Rejeitado', value: 'rejected' },
]

export class ListDto {
  @StringOption({
    name: 'status',
    description: 'Filtrar por status',
    required: false,
    choices: STATUS_CHOICES,
  })
  status?: string

  @StringOption({
    name: 'search',
    description: 'Buscar por ID, data ou conteúdo',
    required: false,
  })
  search?: string

  @IntegerOption({
    name: 'page',
    description: 'Página da listagem',
    required: false,
    min_value: 1,
  })
  page?: number
}
