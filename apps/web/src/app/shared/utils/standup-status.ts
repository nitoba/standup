import type { StandupStatus } from '../models/standup-models'

export function normalizeStandupStatus(status: string): StandupStatus {
  switch (status) {
    case 'draft':
      return 'draft'
    case 'pending_review':
      return 'pending_review'
    case 'approved':
      return 'approved'
    case 'rejected':
      return 'rejected'
    case 'published':
      return 'published'
    default:
      return 'pending_review'
  }
}

export function formatStandupStatus(status: StandupStatus): string {
  switch (status) {
    case 'draft':
      return '[rascunho]'
    case 'pending_review':
      return '[pendente]'
    case 'approved':
      return '[aprovado]'
    case 'rejected':
      return '[rejeitado]'
    case 'published':
      return '[publicado]'
  }
}

export function getStandupStatusDotClass(status: StandupStatus): string {
  switch (status) {
    case 'draft':
      return 'bg-muted-foreground/50'
    case 'pending_review':
      return 'bg-[var(--accent-yellow)]'
    case 'approved':
      return 'bg-primary'
    case 'rejected':
      return 'bg-[var(--accent-red)]'
    case 'published':
      return 'bg-cyan-400'
  }
}

export function getStandupStatusTextClass(status: StandupStatus): string {
  switch (status) {
    case 'draft':
      return 'text-muted-foreground'
    case 'pending_review':
      return 'text-[var(--accent-yellow)]'
    case 'approved':
      return 'text-primary'
    case 'rejected':
      return 'text-[var(--accent-red)]'
    case 'published':
      return 'text-cyan-400'
  }
}

export function getStandupStatusBadgeClass(status: StandupStatus): string {
  switch (status) {
    case 'draft':
      return 'text-muted-foreground'
    case 'pending_review':
      return 'text-[var(--accent-yellow)]'
    case 'approved':
      return 'text-primary'
    case 'rejected':
      return 'text-[var(--accent-red)]'
    case 'published':
      return 'text-cyan-400'
  }
}

export function isPendingReviewStandup(status: StandupStatus): boolean {
  return status === 'pending_review'
}

export function isApprovedStandup(status: StandupStatus): boolean {
  return status === 'approved'
}

export function canRegenerateStandup(status: StandupStatus): boolean {
  return status === 'pending_review' || status === 'rejected'
}
