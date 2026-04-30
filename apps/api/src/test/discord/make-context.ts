// apps/api/src/test/discord/make-context.ts
import type {
  ButtonContext,
  ModalContext,
  SlashCommandContext,
} from 'necord'

export function asSlashContext(interaction: unknown): SlashCommandContext {
  return [interaction] as unknown as SlashCommandContext
}

export function asButtonContext(interaction: unknown): ButtonContext {
  return [interaction] as unknown as ButtonContext
}

export function asModalContext(interaction: unknown): ModalContext {
  return [interaction] as unknown as ModalContext
}
