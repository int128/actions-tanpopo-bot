import * as core from '@actions/core'
import * as exec from '@actions/exec'
import { Context } from './github.js'
import { WebhookEvent } from '@octokit/webhooks-types'

export const clone = async (repository: string, workspace: string, context: Context<WebhookEvent>) => {
  const credentials = Buffer.from(`x-access-token:${core.getInput('token')}`).toString('base64')
  core.setSecret(credentials)
  await exec.exec(
    'git',
    [
      'clone',
      '--quiet',
      '-c',
      `http.https://github.com/.extraheader=AUTHORIZATION: basic ${credentials}`,
      '--depth=1',
      `${context.serverUrl}/${repository}.git`,
      '.',
    ],
    { cwd: workspace },
  )
}

export const status = async (workspace: string): Promise<string> => {
  const { stdout } = await exec.getExecOutput('git', ['status', '--porcelain'], { cwd: workspace })
  return stdout
}

export const getDefaultBranch = async (workspace: string): Promise<string | undefined> => {
  const { stdout: defaultBranchRef } = await exec.getExecOutput(
    'git',
    ['rev-parse', '--symbolic-full-name', 'origin/HEAD'],
    { cwd: workspace },
  )
  return defaultBranchRef.trim().split('/').pop()
}
