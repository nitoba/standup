# Necord Migration — Design Spec

**Date:** 2026-04-29
**Status:** Draft (awaiting user review)
**Scope:** `apps/api/src/interfaces/discord/`

## Summary

Migrate the Discord interface layer from raw `discord.js` + manual handler dispatch to [Necord](https://necord.org), a NestJS module providing decorator-based interaction handling with full DI/guards/interceptors/filters support.

Migration is a refactor for code quality and to enable planned features (`@necord/pagination` for `/standup list`, multi-step settings modal). Domain layer (`contexts/standups/*`) remains untouched.

## Goals

1. Replace manual slash command registration, gateway boot, and customId switch dispatch with Necord decorators.
2. Reorganize `interfaces/discord/` from "by-type" (`commands/`, `handlers/`, `services/`) to "by-feature" (`features/review/`, `features/trigger/`, `features/list/`, `features/approve/`, `features/settings/`, `features/reminder/`, `features/copy/`).
3. Apply Nest guards/interceptors/filters where they replace ad-hoc service logic (`discord-auth.service.ts` → `DiscordUserLinkedGuard`, `command-cooldown.service.ts` → `CooldownInterceptor`, `TaggedError` handling → `DiscordExceptionFilter`).
4. Rewrite Discord-layer tests using `Test.createTestingModule` patterns.
5. Remove dead infrastructure: `discord-gateway.service.ts`, `command-registration.service.ts`, `slash-command-handler.service.ts` (432 lines, God Object).

## Non-goals

- No changes to `contexts/standups/*` (domain services), `platform/database/*` (repositories), `platform/events/*` (EventBus).
- No changes to outbound notification flow (`DiscordMessagesService`, `StandupNotificationService`) — these remain raw `discord.js` builders.
- No new features in this migration. Pagination and multi-step settings modal are deferred to follow-up PRs.
- No staging smoke test gate (manual, post-merge if needed).

## Success Criteria

- All existing slash commands work, with the same names and option signatures as today:
  - Top-level: `/login`, `/logout`
  - `/standup` command group with subcommands: `trigger` (options: `force-regenerate`, `extra-context`), `services` (option: `service`), `list` (options: `status`, `search`, `page`), `approve` (option: `id`), `settings`, `retry`
- All review buttons (Approve/Reject/Adjust/Regenerate) work, including reactions ✅ ❌ 🔄 ✏️.
- All modals work with dynamic `@ModalParam` (e.g., `adjust-modal/:standupId`).
- Tests pass with coverage equal to or greater than current.
- `discord-gateway.service.ts`, `command-registration.service.ts`, `slash-command-handler.service.ts` deleted (no dead code).

## Rollout

Long feature branch (`feat/necord-migration`) with multiple commits, single final PR. No coexistence between Necord and raw discord.js — atomic switch at module level.

## Architecture

### Boot lifecycle

`NecordModule.forRootAsync({ inject: [EnvService], useFactory: ... })` replaces `DiscordGatewayService` + `CommandRegistrationService`. Necord handles:

- Login on `Client` with token + intents from `EnvService`.
- Auto-registration of slash commands on `ClientReady` event (idempotent — Discord deduplicates by name).
- Dispatch of interactions to providers decorated with `@SlashCommand`, `@Button`, `@Modal`, `@On` via Nest DI.

`DISCORD_GATEWAY_ENABLED=false` is honored via `skipRegistration: true` in factory config (and the module's providers tolerate the disabled state).

### Module skeleton

```typescript
// interfaces/discord/discord.module.ts
@Module({
  imports: [
    NecordModule.forRootAsync({
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        token: env.discordBotToken,
        intents: [
          IntentsBitField.Flags.Guilds,
          IntentsBitField.Flags.DirectMessages,
          IntentsBitField.Flags.GuildMessages,
        ],
        development: env.discordGuildId ? [env.discordGuildId] : undefined,
        skipRegistration: !env.discordGatewayEnabled,
      }),
    }),
    NecordPaginationModule.forRoot({
      allowSkip: true,
      allowTraversal: true,
      buttonsPosition: 'end',
    }),
    DatabaseModule,
    EnvModule,
    EventsModule,
    LoggerModule,
  ],
  providers: [
    // top-level commands
    LoginCommand,
    LogoutCommand,
    // /standup subcommands
    TriggerSubcommand,
    ListSubcommand,
    ApproveSubcommand,
    SettingsSubcommand,
    ServicesSubcommand,
    RetrySubcommand,
    // components
    TriggerConfirmationButtons,
    SettingsModal,
    ReviewButtons,
    AdjustModal,
    ReminderButtons,
    CopyButton,
    // shared
    DiscordUserLinkedGuard,
    CooldownInterceptor,
    { provide: APP_FILTER, useClass: DiscordExceptionFilter },
    // listeners
    DiscordStreamingListener,
    // notifications + services (preserved)
    DiscordMessagesService,
    StandupNotificationService,
    StandupStatusSyncService,
    DiscordTriggerService,
    DiscordAvailableReposService,
    DiscordServiceHealthService,
    DiscordClientService,
    TriggerRequestStore,
  ],
  exports: [
    DiscordMessagesService,
    StandupNotificationService,
    StandupStatusSyncService,
    DiscordTriggerService,
    DiscordAvailableReposService,
    DiscordServiceHealthService,
    DiscordClientService,
  ],
})
export class DiscordModule {}
```

### Communication flow

```
Discord Gateway (NecordModule)
        |
        | interaction event
        v
@SlashCommand / @Button / @Modal decorators
        |
        | Nest DI dispatch
        v
Feature handler (interfaces/discord/features/*/...)
        |
        | injects application service
        v
contexts/standups/* (unchanged)
        |
        | result
        v
EventBusService -> reactions in other contexts
```

All migration touchpoints are confined to `interfaces/discord/`. Domain services, EventBus, repositories, scheduler, embeds, notifications are preserved as-is.

## Components

### Final folder structure

```
interfaces/discord/
  features/
    auth/
      login.command.ts             # @SlashCommand 'login' (top-level)
      logout.command.ts            # @SlashCommand 'logout' (top-level)
      login.command.spec.ts
      logout.command.spec.ts
    review/
      review.buttons.ts            # @Button approve/reject/regenerate/adjust + reactions
      adjust.modal.ts              # @Modal('adjust-modal/:standupId')
      review.embed.ts              # buildReviewEmbed
      update-review-message.ts
      review.buttons.spec.ts
      adjust.modal.spec.ts
    trigger/
      trigger.subcommand.ts        # @StandupCommandGroup + @Subcommand('trigger') with TriggerDto
      trigger.dto.ts               # @StringOption('force-regenerate'), @StringOption('extra-context')
      trigger-confirmation.buttons.ts
      trigger-request.store.ts
      trigger.subcommand.spec.ts
    list/
      list.subcommand.ts           # @Subcommand('list') with ListDto
      list.dto.ts                  # @StringOption('status'), @StringOption('search'), @IntegerOption('page')
      list.subcommand.spec.ts
    approve/
      approve.subcommand.ts        # @Subcommand('approve') with ApproveDto
      approve.dto.ts               # @StringOption('id', { autocomplete: true })
      approve.subcommand.spec.ts
    settings/
      settings.subcommand.ts       # @Subcommand('settings')
      settings.modal.ts            # @Modal('settings-modal')
      settings.subcommand.spec.ts
    services/
      services.subcommand.ts       # @Subcommand('services') with ServicesDto
      services.dto.ts              # @StringOption('service', choices: api|worker|bot)
      services.subcommand.spec.ts
    retry/
      retry.subcommand.ts          # @Subcommand('retry')
      retry.subcommand.spec.ts
    reminder/
      reminder.buttons.ts          # @Button reminder/postpone, reminder/cancel
      reminder.buttons.spec.ts
    copy/
      copy.button.ts               # @Button copy/:standupId
      copy.button.spec.ts
  shared/
    decorators/
      standup-command-group.decorator.ts  # createCommandGroupDecorator({ name: 'standup', ... })
    guards/
      discord-user-linked.guard.ts
      discord-user-linked.guard.spec.ts
    interceptors/
      cooldown.interceptor.ts
      cooldown.interceptor.spec.ts
    filters/
      discord-exception.filter.ts
      discord-exception.filter.spec.ts
    embeds/
      published.embed.ts           # buildPublishedEmbed
      job-failed.embed.ts          # buildJobFailedEmbed
      reminder.embed.ts            # buildReminderEmbed
      index.ts
  notifications/                   # PRESERVED — pure builders/services
    discord-messages.service.ts
    standup-notification.service.ts
    standup-status-sync.service.ts
    discord-trigger.service.ts
    discord-available-repos.service.ts
    discord-service-health.service.ts
  listeners/
    discord-streaming.listener.ts  # @On(Events.X)
    discord-streaming.listener.spec.ts
  discord.module.ts
  discord-client.service.ts        # PRESERVED — wrapper for code outside the module
```

### File-by-file migration map

| Current file | Destination | Notes |
|---|---|---|
| `discord.module.ts` | same path | Switches to `NecordModule.forRootAsync` |
| `listeners/discord-gateway.service.ts` | **DELETED** | Necord handles login + ClientReady |
| `commands/command-registration.service.ts` | **DELETED** | Necord auto-registers |
| `handlers/slash-command-handler.service.ts` (432 LOC) | **EXPLODED** into `features/*/*.command.ts` | God Object dissolved |
| `handlers/button-interaction.service.ts` (215) | **EXPLODED** into `features/{review,reminder,trigger,copy}/*.buttons.ts` | customId dispatch via decorators |
| `handlers/modal-interaction.service.ts` (243) | **EXPLODED** into `features/{review,settings}/*.modal.ts` | `@Modal('id/:param')` + `@ModalParam` |
| `handlers/standup-interaction.service.ts` | merged into `features/review/review.buttons.ts` | Reactions ✅ ❌ 🔄 ✏️ via `interaction.message.react()` |
| `handlers/reminder-interaction.service.ts` | `features/reminder/reminder.buttons.ts` | |
| `handlers/trigger-confirmation.service.ts` | `features/trigger/trigger-confirmation.buttons.ts` | |
| `handlers/copy-interaction.service.ts` | `features/copy/copy.button.ts` | |
| `handlers/settings-interaction.service.ts` (13 KB) | `features/settings/settings.command.ts` + `settings.modal.ts` | Split command from modal handler |
| `handlers/command-cooldown.service.ts` | `shared/interceptors/cooldown.interceptor.ts` | NestInterceptor |
| `handlers/trigger-request-store.ts` | `features/trigger/trigger-request.store.ts` | Same logic, moved |
| `handlers/update-review-message.ts` | `features/review/update-review-message.ts` | Helper local to feature |
| `services/discord-auth.service.ts` | `shared/guards/discord-user-linked.guard.ts` | Check logic becomes guard; any non-guard helpers stay as injectable service |
| `services/standup-notification.service.ts` | `notifications/standup-notification.service.ts` (already there) | Confirm path; unchanged |
| `services/standup-status-sync.service.ts` | unchanged | |
| `services/discord-trigger.service.ts` | unchanged | |
| `services/discord-available-repos.service.ts` | unchanged | |
| `services/discord-service-health.service.ts` | unchanged | |
| `notifications/discord-messages.service.ts` | unchanged | |
| `embeds.ts` | split into `shared/embeds/*.embed.ts` + `features/review/review.embed.ts` | One builder per file |
| `discord-client.service.ts` | unchanged | Exposed for code outside module |
| `listeners/discord-streaming.listener.ts` | preserved, switches to `@On(Events.X)` decorator | |

### Necord conventions applied

- **Top-level slash commands** (`/login`, `/logout`): one class per command, decorated with `@SlashCommand({ name, description })`.
- **`/standup` command group:** defined via `createCommandGroupDecorator({ name: 'standup', description: '...' })` exported from `shared/decorators/standup-command-group.decorator.ts`. Each subcommand handler class is decorated with that group decorator and uses `@Subcommand({ name, description })` on its method (e.g., `trigger`, `list`, `approve`, `settings`, `retry`, `services`).
- **Buttons:** customId pattern `<feature>/<action>/:param` — e.g. `review/approve/:standupId`, `reminder/postpone`, `copy/:standupId`.
- **Modals:** customId pattern `<feature>-modal/:param` — e.g. `adjust-modal/:standupId`, `settings-modal`.
- **Options DTOs:** classes with `@StringOption`, `@IntegerOption`, `@BooleanOption`, `@UserOption` — replace manual parsing in `slash-command-handler.service.ts`. Field names match today's options (`force-regenerate`, `extra-context`, `status`, `search`, `page`, `id`, `service`).
- **Autocomplete:** `AutocompleteInterceptor` extension for fields with `autocomplete: true` (deferred to follow-up; DTOs may declare the flag but no autocomplete handlers ship in this PR).
- **Listeners:** `@On(Events.X)` for gateway events.

## Data flow examples

### Subcommand group decorator

```typescript
// shared/decorators/standup-command-group.decorator.ts
import { createCommandGroupDecorator } from 'necord';

export const StandupCommandGroup = createCommandGroupDecorator({
  name: 'standup',
  description: 'Comandos de standup',
});
```

### `/standup trigger` → confirmation button

```typescript
// features/trigger/trigger.subcommand.ts
@Injectable()
@StandupCommandGroup()
export class TriggerSubcommand {
  constructor(
    private triggerStandup: DiscordTriggerService,
    private triggerStore: TriggerRequestStore,
  ) {}

  @Subcommand({ name: 'trigger', description: 'Disparar standup' })
  @UseGuards(DiscordUserLinkedGuard)
  @UseInterceptors(CooldownInterceptor)
  public async onTrigger(
    @Context() [interaction]: SlashCommandContext,
    @Options() opts: TriggerDto,
  ) {
    const requestId = await this.triggerStore.create(interaction.user.id, opts);
    return interaction.reply({
      content: 'Confirmar disparo?',
      components: [buildTriggerConfirmRow(requestId)],
      ephemeral: true,
    });
  }
}

// features/trigger/trigger.dto.ts
export class TriggerDto {
  @StringOption({ name: 'force-regenerate', description: 'Regenerar mesmo se ja existe', required: false })
  forceRegenerate?: string;

  @StringOption({ name: 'extra-context', description: 'Contexto adicional p/ LLM', required: false })
  extraContext?: string;
}

@Injectable()
export class TriggerConfirmationButtons {
  constructor(
    private triggerStore: TriggerRequestStore,
    private triggerStandup: DiscordTriggerService,
  ) {}

  @Button('trigger/confirm/:requestId')
  public async onConfirm(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('requestId') requestId: string,
  ) {
    await interaction.deferUpdate();
    const request = await this.triggerStore.consume(requestId);
    if (!request) {
      return interaction.editReply({ content: 'Requisição expirada.', components: [] });
    }
    await this.triggerStandup.dispatch(request.userId);
    return interaction.editReply({ content: 'Standup disparado.', components: [] });
  }

  @Button('trigger/cancel/:requestId')
  public async onCancel(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('requestId') requestId: string,
  ) {
    await this.triggerStore.consume(requestId);
    return interaction.update({ content: 'Cancelado.', components: [] });
  }
}
```

### Review approve + adjust modal

```typescript
@Injectable()
export class ReviewButtons {
  constructor(
    private approveStandup: ApproveStandupService,
    private statusSync: StandupStatusSyncService,
  ) {}

  @Button('review/approve/:standupId')
  public async onApprove(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await interaction.deferUpdate();
    const result = await this.approveStandup.execute({ standupId, source: 'discord' });
    if (result.isErr()) {
      return interaction.followUp({ content: `Erro: ${result.error.message}`, ephemeral: true });
    }
    await interaction.message?.react('✅').catch(() => {});
    await this.statusSync.markApproved(interaction, standupId);
  }

  @Button('review/adjust/:standupId')
  public async onAdjust(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    return interaction.showModal(buildAdjustModal(standupId));
  }
}

@Injectable()
export class AdjustModal {
  constructor(private adjustStandup: AdjustStandupService) {}

  @Modal('adjust-modal/:standupId')
  public async onSubmit(
    @Context() [interaction]: ModalContext,
    @ModalParam('standupId') standupId: string,
  ) {
    await interaction.deferUpdate();
    const feedback = interaction.fields.getTextInputValue('feedback');
    const result = await this.adjustStandup.execute({ standupId, feedback });
    if (result.isErr()) {
      return interaction.followUp({ content: `Erro: ${result.error.message}`, ephemeral: true });
    }
    await interaction.message?.react('✏️').catch(() => {});
    return interaction.editReply({ content: 'Ajustando...', components: [] });
  }
}
```

### Listener (preserved logic, decorator switch)

```typescript
@Injectable()
export class DiscordStreamingListener {
  @On(Events.VoiceStateUpdate)
  public async onVoiceState(@Context() [oldState, newState]: ContextOf<'voiceStateUpdate'>) {
    // existing logic preserved verbatim
  }
}
```

### Outbound notifications (unchanged)

`StandupNotificationService` continues calling `client.users.fetch().send({ embeds, components })` directly. Necord imposes nothing on outbound flow. EventBus continues publishing `StandupReadyForReviewEvent`; the listener in `notifications/standup-notification.service.ts` reacts. Zero changes.

### Lock / state machine (unchanged)

`JobRunRepository.acquireLock()` is called by application services outside the Discord layer. DMs for "lock held", "already completed today", "no activity" continue to flow through `DiscordMessagesService`. Reactions ✅ ❌ 🔄 ✏️ are applied manually via `interaction.message?.react()` — Necord has no decorator for reactions (output, not input).

## Error handling

### Global filter for TaggedError

```typescript
@Catch(TaggedError)
export class DiscordExceptionFilter implements ExceptionFilter {
  constructor(private logger: AppLoggerFactory) {}

  async catch(err: TaggedError, host: ArgumentsHost) {
    const log = this.logger.create('DiscordExceptionFilter');
    const ctx = host.getArgByIndex(0);
    const interaction = Array.isArray(ctx) ? ctx[0] : null;

    log.error('Discord handler failed', { tag: err._tag, message: err.message });

    if (!interaction || !('isRepliable' in interaction) || !interaction.isRepliable()) return;

    const payload = { content: `Erro: ${err.message}`, ephemeral: true } as const;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}
```

Registered globally via `APP_FILTER` token in `discord.module.ts`.

### Strategy by error type

| Error | Behavior |
|---|---|
| `TaggedError` (better-result) | Filter responds ephemeral; structured log |
| `LockAlreadyHeldError`, `JobAlreadyCompletedError` | Raised by application services before reaching Necord; already become DMs via `DiscordMessagesService`. Do not enter the filter. |
| Unmapped exception | Nest base filter catches; structured log + generic ephemeral "Falha interna" |
| `react()` / `editReply()` failures (DM channel cache miss, deleted message) | `.catch(() => {})` best-effort — must not break main flow |
| 3-second interaction timeout | Pattern in every handler doing I/O: `await interaction.deferUpdate()` before async work, then `editReply` |

### Pre-condition guards (fail fast)

`DiscordUserLinkedGuard` returning `false` triggers Nest `ForbiddenException` → filter responds "Conta não vinculada" ephemeral. Handler never runs.

### Cooldown silent reject

`CooldownInterceptor` returns `EMPTY` after sending ephemeral "Aguarde Xs" — pipeline aborts cleanly without error.

### Structured logging

All handlers inject `AppLoggerFactory`. Pattern:

```typescript
log.info('command.received', { command: 'trigger', userId: interaction.user.id });
log.error('command.failed', { command: 'trigger', error: err.message });
```

Necord has no built-in reliable logging hook — keep manual.

### Filter does NOT cover

- EventBus events (internal, handled in `contexts/standups/*`)
- `@On()` listeners (gateway events have no interaction → no filter target). Listeners need internal try/catch where needed.
- Outbound (DM publication) — `DiscordMessagesService` has its own handling.

## Testing

### Pattern: `Test.createTestingModule` per handler

Each handler is a Nest provider. Test = compile isolated module, mock dependencies, invoke decorated method directly with synthetic context tuple `[interaction]`.

### Examples

**Subcommand:**

```typescript
describe('TriggerSubcommand', () => {
  let cmd: TriggerSubcommand;
  let triggerStore: TriggerRequestStore;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TriggerSubcommand,
        { provide: TriggerRequestStore, useValue: { create: vi.fn().mockResolvedValue('req-1') } },
        { provide: DiscordTriggerService, useValue: { dispatch: vi.fn() } },
      ],
    }).compile();
    cmd = module.get(TriggerSubcommand);
    triggerStore = module.get(TriggerRequestStore);
  });

  it('replies ephemeral with confirm/cancel buttons', async () => {
    const interaction = {
      user: { id: 'user-1' },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;
    const opts = { forceRegenerate: undefined, extraContext: undefined } as TriggerDto;
    await cmd.onTrigger([interaction] as SlashCommandContext, opts);
    expect(triggerStore.create).toHaveBeenCalledWith('user-1', opts);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, components: expect.any(Array) }),
    );
  });
});
```

**Button with `@ComponentParam`:**

```typescript
it('approve dispatches service and reacts ✅', async () => {
  const approveStandup = { execute: vi.fn().mockResolvedValue(ok({})) };
  const statusSync = { markApproved: vi.fn() };
  const buttons = new ReviewButtons(approveStandup as never, statusSync as never);

  const interaction = {
    deferUpdate: vi.fn(),
    message: { react: vi.fn().mockResolvedValue(undefined) },
    followUp: vi.fn(),
  } as unknown as ButtonInteraction;

  await buttons.onApprove([interaction] as ButtonContext, 'standup-123');

  expect(approveStandup.execute).toHaveBeenCalledWith({ standupId: 'standup-123', source: 'discord' });
  expect(interaction.message.react).toHaveBeenCalledWith('✅');
  expect(statusSync.markApproved).toHaveBeenCalledWith(interaction, 'standup-123');
});
```

**Modal with `@ModalParam`:**

```typescript
it('extracts feedback and dispatches adjust', async () => {
  const adjustStandup = { execute: vi.fn().mockResolvedValue(ok({})) };
  const modal = new AdjustModal(adjustStandup as never);
  const interaction = {
    deferUpdate: vi.fn(),
    fields: { getTextInputValue: vi.fn().mockReturnValue('mais detalhe') },
    message: { react: vi.fn() },
    editReply: vi.fn(),
  } as unknown as ModalSubmitInteraction;

  await modal.onSubmit([interaction] as ModalContext, 'standup-123');

  expect(adjustStandup.execute).toHaveBeenCalledWith({ standupId: 'standup-123', feedback: 'mais detalhe' });
  expect(interaction.message.react).toHaveBeenCalledWith('✏️');
});
```

**Guard:**

```typescript
it('passes when user is linked', async () => {
  const userRepo = { findByDiscordId: vi.fn().mockResolvedValue({ id: 'u-1' }) };
  const guard = new DiscordUserLinkedGuard(userRepo as never);
  const ctx = { getArgByIndex: () => [{ user: { id: 'discord-1' } }] } as unknown as ExecutionContext;
  await expect(guard.canActivate(ctx)).resolves.toBe(true);
});
```

**Interceptor:**

```typescript
it('returns EMPTY and replies ephemeral when on cooldown', async () => {
  const cooldown = { isOnCooldown: vi.fn().mockReturnValue(true), remaining: vi.fn().mockReturnValue(5) };
  const interceptor = new CooldownInterceptor(cooldown as never);
  const interaction = { user: { id: 'u-1' }, commandName: 'trigger', reply: vi.fn() };
  const ctx = { getArgByIndex: () => [interaction] } as never;
  const next = { handle: vi.fn() };

  const result = interceptor.intercept(ctx, next as never);
  await firstValueFrom(result.pipe(defaultIfEmpty(null)));

  expect(interaction.reply).toHaveBeenCalled();
  expect(next.handle).not.toHaveBeenCalled();
});
```

**Filter:**

```typescript
it('uses followUp when interaction is deferred', async () => {
  const logger = { create: () => ({ error: vi.fn() }) };
  const filter = new DiscordExceptionFilter(logger as never);
  const interaction = {
    isRepliable: () => true,
    deferred: true,
    replied: false,
    followUp: vi.fn(),
    reply: vi.fn(),
  };
  const host = { getArgByIndex: () => [interaction] } as never;

  await filter.catch(new ValidationError('boom'), host);

  expect(interaction.followUp).toHaveBeenCalledWith({ content: 'Erro: boom', ephemeral: true });
  expect(interaction.reply).not.toHaveBeenCalled();
});
```

### Coverage targets

- One spec per feature handler (command, button, modal).
- One spec per guard, interceptor, filter.
- `discord-streaming.listener.spec.ts` — adapt the existing test.
- Notification services (`standup-notification.service.spec.ts`, etc) — unchanged, pass as-is.

### Test helpers (new)

`apps/api/src/test/discord/`:

- `mock-interaction.ts` — factory for ChatInputCommand / Button / Modal interactions.
- `make-context.ts` — wrapper returning `[interaction]` tuple in the format Necord expects.

### No gateway E2E

Necord connects to real Discord. E2E would be flaky and require a token. Manual smoke staging is out of scope (not in success criteria); optional post-merge.

## Dependencies

Add to `apps/api/package.json`:

- `necord` (peer: `discord.js`, `@nestjs/common`, `@nestjs/core` already present)
- `@necord/pagination`

Remove: nothing — `discord.js` stays.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Necord auto-registration races with manual flows in dev | Use `development: [guildId]` for fast guild registration; production uses global commands |
| `DISCORD_GATEWAY_ENABLED=false` path breaks | `skipRegistration: true` + module-level conditional; verify with explicit test in CI |
| `interaction.editReply()` vs `update()` semantics differ from current code | Audit each migrated handler against the existing one in the same commit; reviewer verifies parity |
| God Object explosion misses logic during split | Migrate `slash-command-handler.service.ts` last, after all individual command files exist; commit per command for reviewability |
| Tests rewrite drops coverage | Track coverage delta in CI; require ≥ baseline before merging |
| Bun + Necord runtime incompatibility | Necord depends on `discord.js` which is already validated on Bun; Necord itself is pure NestJS — low risk. Smoke-test on first commit. |

## Out of scope

- Pagination feature for `/standup list` (deferred to follow-up PR; module is wired so this is a small addition).
- Multi-step modal in `/standup settings` (deferred).
- Autocomplete handlers for `/standup approve <id>` (deferred; DTO supports the flag).
- Migration of any code outside `interfaces/discord/`.
- Documentation updates beyond what's needed in `CLAUDE.md` to reference the new conventions.
