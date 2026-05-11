// apps/api/src/interfaces/discord/features/trigger/trigger.dto.ts
import { BooleanOption, StringOption } from 'necord'

export class TriggerDto {
  @BooleanOption({
    name: 'force-regenerate',
    description: 'Força geração mesmo se já houve sucesso hoje',
    required: false,
  })
  forceRegenerate?: boolean

  @StringOption({
    name: 'extra-context',
    description: 'Contexto extra para orientar a geração',
    required: false,
  })
  extraContext?: string
}
