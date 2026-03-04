import { randomUUID } from 'node:crypto'

// Vitest roda em ambiente Node, não Bun — expõe o global Bun mínimo necessário
if (typeof globalThis.Bun === 'undefined') {
  Object.assign(globalThis, {
    Bun: {
      randomUUIDv7: (): string => randomUUID(),
    },
  })
}
