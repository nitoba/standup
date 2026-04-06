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
  cwd?: string
}

function toBuffer(output: string | Buffer | undefined): Buffer {
  if (output instanceof Buffer) {
    return output
  }

  return Buffer.from(output ?? '')
}

function buildGitConfigEnv(reposRootPath: string): Record<string, string> {
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: reposRootPath,
  }
}

export async function runGitCommand(
  args: string[],
  options?: RunGitCommandOptions,
): Promise<GitCommandResult> {
  const baseEnv: Record<string, string> = {
    GIT_TERMINAL_PROMPT: '0',
  }

  if (options?.env) {
    for (const [key, value] of Object.entries(options.env)) {
      if (value !== undefined) {
        baseEnv[key] = value
      }
    }
  } else {
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        baseEnv[key] = value
      }
    }
  }

  const reposRootPath = options?.env?.REPOS_ROOT_PATH ?? baseEnv.REPOS_ROOT_PATH
  if (reposRootPath) {
    Object.assign(baseEnv, buildGitConfigEnv(reposRootPath))
  }

  try {
    const result = await execFileAsync('git', args, {
      encoding: 'buffer',
      env: baseEnv,
      maxBuffer: MAX_BUFFER_SIZE,
      cwd: options?.cwd,
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
