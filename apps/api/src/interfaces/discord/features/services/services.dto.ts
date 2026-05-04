// apps/api/src/interfaces/discord/features/services/services.dto.ts
import { StringOption } from 'necord'

const SERVICE_CHOICES = [
  { name: 'Todos', value: 'all' },
  { name: 'API', value: 'api' },
  { name: 'Worker', value: 'worker' },
  { name: 'Bot', value: 'bot' },
]

export class ServicesDto {
  @StringOption({
    name: 'service',
    description: 'Filtrar por serviço específico',
    required: false,
    choices: SERVICE_CHOICES,
  })
  service?: 'all' | 'api' | 'worker' | 'bot'
}
