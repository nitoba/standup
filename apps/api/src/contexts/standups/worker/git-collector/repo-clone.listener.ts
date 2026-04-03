import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  SETTINGS_REPOS_CHANGED_EVENT,
  type SettingsReposChangedEvent,
} from '../../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../../platform/logger'
import { parseRepoIdentifier } from '../../../../shared/repos/parse-selected-repos'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { RepoCloneService } from './repo-clone.service'

@Injectable()
export class RepoCloneListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly repoCloneService: RepoCloneService,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
  ) {
    this.logger = this.loggerFactory.create('repo-clone-listener')
  }

  @OnEvent(SETTINGS_REPOS_CHANGED_EVENT)
  async handleReposChanged(event: SettingsReposChangedEvent): Promise<void> {
    const defaultProject =
      this.runtimeConfig.config.AZURE_DEVOPS_DEFAULT_PROJECT
    const repos = event.selectedRepos.map((id) =>
      parseRepoIdentifier(id, defaultProject),
    )

    const result = await this.repoCloneService.ensureAllCloned(repos)

    for (const { repo, error } of result.failed) {
      this.logger.warn('Background clone failed', {
        userId: event.userId,
        repo: repo.name,
        error: error.message,
      })
    }

    if (result.cloned.length > 0) {
      this.logger.info('Background clone completed', {
        userId: event.userId,
        cloned: result.cloned.map((r) => r.name),
      })
    }
  }
}
