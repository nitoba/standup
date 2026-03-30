import { Injectable } from '@nestjs/common'

/** Tempo de cooldown em ms por comando (padrão: 5 minutos) */
const COOLDOWN_MS = 5 * 60 * 1000

@Injectable()
export class CommandCooldownService {
  private readonly cooldowns = new Map<string, number>()

  /**
   * Verifica se o usuário está em cooldown para o comando informado.
   * @returns null se pode prosseguir, ou o número de segundos restantes se em cooldown.
   */
  check(userId: string, command: string): number | null {
    const key = `${userId}:${command}`
    const lastUsed = this.cooldowns.get(key)
    if (lastUsed === undefined) return null

    const elapsed = Date.now() - lastUsed
    if (elapsed >= COOLDOWN_MS) {
      this.cooldowns.delete(key)
      return null
    }
    return Math.ceil((COOLDOWN_MS - elapsed) / 1000)
  }

  /**
   * Registra o uso de um comando para o usuário.
   */
  record(userId: string, command: string): void {
    const key = `${userId}:${command}`
    this.cooldowns.set(key, Date.now())
  }
}
