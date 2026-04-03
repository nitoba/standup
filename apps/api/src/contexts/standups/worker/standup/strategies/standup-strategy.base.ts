import type { StrategyExecutionInput, StrategyProgressStep } from '../types'

export abstract class StandupStrategyBase {
  protected async reportStage(
    reportProgress: StrategyExecutionInput['reportProgress'],
    step: StrategyProgressStep,
    message: string,
    partialContent?: string,
  ): Promise<void> {
    await reportProgress?.({ step, message, partialContent })
  }
}
