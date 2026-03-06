import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,js}'],
    setupFiles: ['./src/vitest.setup.ts'],
  },
})
