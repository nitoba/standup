import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
        target: 'es2023',
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
