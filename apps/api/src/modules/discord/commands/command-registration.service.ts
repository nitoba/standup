import { Injectable } from '@nestjs/common'
import type { Client } from 'discord.js'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'
import { EnvService } from '../../../shared/env/env.service'
import { AppLoggerFactory } from '../../../shared/logger'

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

function buildLoginCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('login')
    .setDescription('Conectar sua conta Discord ao Standup Bot')
}

function buildLogoutCommand(): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName('logout')
    .setDescription('Encerrar sua sessão no Standup Bot')
}

function buildStandupCommand(): SlashCommandBuilder {
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

@Injectable()
export class CommandRegistrationService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('discord-command-registration')
  }

  async register(client: Client): Promise<void> {
    if (!this.env.discord.token) {
      this.logger.warn(
        'Discord token missing, slash commands were not registered',
      )
      return
    }

    const clientId = client.user?.id
    if (!clientId) {
      this.logger.warn(
        'Cannot register commands because client.user.id is missing',
      )
      return
    }

    const commands = [
      buildLoginCommand(),
      buildLogoutCommand(),
      buildStandupCommand(),
    ]

    const rest = new REST({ version: '10' }).setToken(this.env.discord.token)

    try {
      if (this.env.discord.guildId) {
        await rest.put(
          Routes.applicationGuildCommands(clientId, this.env.discord.guildId),
          {
            body: commands.map((command) => command.toJSON()),
          },
        )
      } else {
        await rest.put(Routes.applicationCommands(clientId), {
          body: commands.map((command) => command.toJSON()),
        })
      }
    } catch (error) {
      this.logger.error('Failed to register application commands', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
