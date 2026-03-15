import type { ProcessEnvOptions } from 'node:child_process'
import { type ExecFileException, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const MAX_BUFFER_SIZE = 10 * 1024 * 1024

type GitCommandResult = {
  exitCode: number
  stderr: Buffer
  stdout: Buffer
}

type RunGitCommandOptions = {
  env?: ProcessEnvOptions['env']
}

function toBuffer(output: string | Buffer | undefined): Buffer {
  if (output instanceof Buffer) {
    return output
  }

  return Buffer.from(output ?? '')
}

export async function runGitCommand(
  args: string[],
  options?: RunGitCommandOptions,
): Promise<GitCommandResult> {
  try {
    const result = await execFileAsync('git', args, {
      encoding: 'buffer',
      env: options?.env,
      maxBuffer: MAX_BUFFER_SIZE,
    })

    return {
      exitCode: 0,
      stderr: toBuffer(result.stderr),
      stdout: toBuffer(result.stdout),
    }
  } catch (error) {
    const execError = error as ExecFileException & {
      stderr?: Buffer | string
      stdout?: Buffer | string
    }

    return {
      exitCode: typeof execError.code === 'number' ? execError.code : 1,
      stderr: toBuffer(execError.stderr),
      stdout: toBuffer(execError.stdout),
    }
  }
}
