import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'commands-register',
})

/**
 * Status choices para /standup list (Padrão 13 do Akita — choices como dropdowns nativos).
 */
const STATUS_CHOICES = [
  { name: 'Draft', value: 'draft' },
  { name: 'Pendente de Revisão', value: 'pending_review' },
  { name: 'Aprovado', value: 'approved' },
  { name: 'Publicado', value: 'published' },
  { name: 'Rejeitado', value: 'rejected' },
] as const

const SERVICE_CHOICES = [
  { name: 'Todos', value: 'all' },
  { name: 'API', value: 'api' },
  { name: 'Worker', value: 'worker' },
  { name: 'Bot', value: 'bot' },
] as const

/**
 * Constrói o SlashCommandBuilder para o comando /login.
 * Abre o link de OAuth para conectar a conta Discord.
 */
export function buildLoginCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('login')
    .setDescription(
      'Conectar sua conta Discord ao Standup Bot',
    ) as SlashCommandBuilder
}

/**
 * Constrói o SlashCommandBuilder para o comando /logout.
 * Encerra a sessão ativa do usuário.
 */
export function buildLogoutCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('logout')
    .setDescription('Encerrar sua sessão no Standup Bot') as SlashCommandBuilder
}

/**
 * Constrói o SlashCommandBuilder para o comando /standup com subcommands.
 * Exportado para reutilização nos testes.
 */
export function buildStandupCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('standup')
    .setDescription('Gerenciar standups diários')
    .addSubcommand((sub) =>
      sub
        .setName('trigger')
        .setDescription('Gerar standup agora')
        .addBooleanOption((opt) =>
          opt
            .setName('force-regenerate')
            .setDescription('Força geração mesmo se já houve sucesso hoje'),
        )
        .addStringOption((opt) =>
          opt
            .setName('extra-context')
            .setDescription('Contexto extra para orientar a geração'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('services')
        .setDescription('Ver status dos serviços')
        .addStringOption((opt) =>
          opt
            .setName('service')
            .setDescription('Filtrar por serviço específico')
            .addChoices(...SERVICE_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Listar últimos standups')
        .addStringOption((opt) =>
          opt
            .setName('status')
            .setDescription('Filtrar por status')
            .addChoices(...STATUS_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('search')
            .setDescription('Buscar por ID, data ou conteúdo'),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('page')
            .setDescription('Página da listagem')
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('approve')
        .setDescription('Aprovar um standup pelo ID')
        .addStringOption((opt) =>
          opt
            .setName('id')
            .setDescription('ID do standup a aprovar')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('settings')
        .setDescription('Ver ou alterar configurações de standup'),
    ) as SlashCommandBuilder
}

/**
 * Registra Application Commands na API do Discord (Padrão 13 do Akita).
 *
 * Idempotente: pode ser chamado no evento ClientReady (inclusive em reconnects).
 * Registra como Guild commands (guild_id) em dev para propagação instantânea.
 * Em produção, trocar para global commands removendo o guildId.
 */
export async function registerApplicationCommands(
  client: Client,
  token: string,
  guildId?: string,
): Promise<void> {
  const clientId = client.user?.id
  if (!clientId) {
    logger.warn('Cannot register commands — client.user.id not available')
    return
  }

  const commands = [
    buildLoginCommand(),
    buildLogoutCommand(),
    buildStandupCommand(),
  ]
  const commandNames = commands.map((c) => c.name)
  const rest = new REST({ version: '10' }).setToken(token)

  try {
    if (guildId) {
      // Guild commands: propagação instantânea (ideal para dev)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands.map((c) => c.toJSON()),
      })
      logger.info('Registered guild application commands', {
        guildId,
        commands: commandNames,
      })
    } else {
      // Global commands: propagação em até 1h (ideal para produção)
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands.map((c) => c.toJSON()),
      })
      logger.info('Registered global application commands', {
        commands: commandNames,
      })
    }
  } catch (err) {
    logger.error('Failed to register application commands', {
      error: err instanceof Error ? err.message : String(err),
    })
    // Non-fatal: comandos slash são um enhancement, não o core flow
  }
}
