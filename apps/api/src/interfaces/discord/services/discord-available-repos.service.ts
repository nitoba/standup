import { Injectable } from '@nestjs/common'
import { ListWorkerReposService } from '../../../contexts/standups/worker/repos/list-worker-repos.service'
import { AppLoggerFactory } from '../../../platform/logger'
import { Result } from '../../../shared/domain'

const CACHE_TTL_MS = 5 * 60 * 1000

export interface DiscordRepoInfo {
  name: string
  id: string
  project: string
}

@Injectable()
export class DiscordAvailableReposService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private cachedRepos: DiscordRepoInfo[] = []
  private cacheExpiresAt = 0

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly listWorkerRepos: ListWorkerReposService,
  ) {
    this.logger = this.loggerFactory.create('discord-available-repos')
  }

  getCachedRepos(): DiscordRepoInfo[] {
    if (Date.now() < this.cacheExpiresAt && this.cachedRepos.length > 0) {
      return this.cachedRepos
    }

    return []
  }

  async fetchAvailableRepos(): Promise<DiscordRepoInfo[]> {
    const cached = this.getCachedRepos()
    if (cached.length > 0) {
      return cached
    }

    const result = (await this.listWorkerRepos.listRepos()) as Result<
      DiscordRepoInfo[],
      { message: string }
    >

    if (!result || result.isErr()) {
      this.logger.warn('Failed to fetch repos for Discord settings', {
        error: result?.error.message ?? 'no listener handled the repo request',
      })
      return []
    }

    this.cachedRepos = result.value
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS

    return result.value
  }
}
