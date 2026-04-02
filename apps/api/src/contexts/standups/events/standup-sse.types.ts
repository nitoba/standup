export type StandupSseEvent =
  | {
      type: 'standup_progress'
      runId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
      step:
        | 'queued'
        | 'collecting_git'
        | 'collecting_board'
        | 'enriching_data'
        | 'generating_standup'
        | 'streaming_content'
        | 'saving_draft'
        | 'notifying_review'
        | 'completed'
        | 'no_activity'
      message: string
      standupId?: string
      partialContent?: string
    }
  | {
      type: 'standup_generated'
      runId: string
      standupId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
    }
  | {
      type: 'standup_failed'
      runId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
      message: string
    }
  | {
      type: 'standup_status_changed'
      standupId: string
      newStatus: string
    }
