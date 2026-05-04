// apps/api/src/interfaces/discord/features/approve/approve.dto.ts
import { StringOption } from 'necord'

export class ApproveDto {
  @StringOption({
    name: 'id',
    description: 'ID do standup a aprovar',
    required: true,
    autocomplete: false,
  })
  id!: string
}
