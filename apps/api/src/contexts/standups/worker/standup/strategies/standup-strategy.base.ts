import type { StrategyExecutionInput } from '../types'

export abstract class StandupStrategyBase {
  protected async reportStage(
    reportProgress: StrategyExecutionInput['reportProgress'],
    step: 'collecting_git' | 'enriching_data' | 'generating_standup',
    message: string,
  ): Promise<void> {
    await reportProgress?.({ step, message })
  }
}
