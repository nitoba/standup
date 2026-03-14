import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ExternalServiceError, Result } from '@standup/domain'
import {
  WORKER_REPOS_REQUESTED_EVENT,
  type WorkerReposRequestedEvent,
} from '../../events/standup-events'
import type { RepoInfo } from '../azure-devops/types'
import { ListWorkerReposService } from './list-worker-repos.service'

@Injectable()
export class WorkerReposRequestedListener {
  constructor(private readonly listWorkerRepos: ListWorkerReposService) {}

  @OnEvent(WORKER_REPOS_REQUESTED_EVENT)
  async handle(
    _event: WorkerReposRequestedEvent,
  ): Promise<Result<RepoInfo[], ExternalServiceError>> {
    return this.listWorkerRepos.listRepos()
  }
}
