import type { Agent } from '@mariozechner/pi-agent-core'
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'

interface AgentSession {
  agent: Agent
  lastAccessedAt: number
}

const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

@Injectable()
export class AgentSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, AgentSession>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  onModuleInit(): void {
    this.cleanupInterval = setInterval(
      () => this.removeExpiredSessions(),
      CLEANUP_INTERVAL_MS,
    )
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.sessions.clear()
  }

  create(standupId: string, agent: Agent): void {
    this.sessions.set(standupId, {
      agent,
      lastAccessedAt: Date.now(),
    })
  }

  get(standupId: string): Agent | null {
    const session = this.sessions.get(standupId)
    if (!session) return null

    if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
      this.sessions.delete(standupId)
      return null
    }

    session.lastAccessedAt = Date.now()
    return session.agent
  }

  destroy(standupId: string): void {
    this.sessions.delete(standupId)
  }

  has(standupId: string): boolean {
    return this.get(standupId) !== null
  }

  private removeExpiredSessions(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt > SESSION_TTL_MS) {
        this.sessions.delete(id)
      }
    }
  }
}
