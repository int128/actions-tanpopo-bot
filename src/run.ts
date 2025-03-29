import assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Octokit } from '@octokit/action'
import { Context, getContext, getOctokit } from './github.js'
import { PullRequestEvent } from '@octokit/webhooks-types'

export const run = async (): Promise<void> => {
  const octokit = getOctokit()
  const context = await getContext()
  if ('pull_request' in context.payload && 'number' in context.payload) {
    core.info(`Processing #${context.payload.number}`)
    await processPullRequest(context.payload, octokit, context)
    return
  }
}

const processPullRequest = async (event: PullRequestEvent, octokit: Octokit, context: Context) => {
  const { data: files } = await octokit.pulls.listFiles({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    pull_number: event.number,
    per_page: 100,
  })
  const taskDirs = new Set(files.map((file) => path.dirname(file.filename)).filter((dir) => dir.startsWith('tasks/')))
  core.info(`Found task directories: ${[...taskDirs].join(', ')}`)

  for (const taskDir of taskDirs) {
    const repositories = parseRepositoriesFile(await fs.readFile(path.join(taskDir, 'repositories'), 'utf-8'))
    for (const repository of repositories) {
      await applyTask(taskDir, repository, octokit, context)
    }
  }
}

const parseRepositoriesFile = (repositories: string): string[] => [
  ...new Set(
    repositories
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#')),
  ),
]

const applyTask = async (taskDir: string, repository: string, octokit: Octokit, context: Context) => {
  const workflowRunUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`

  const readme = await fs.readFile(path.join(taskDir, 'README.md'), 'utf-8')
  const taskName = readme.match(/# (.+)/)?.[1]
  assert(taskName, 'README.md must have a title')

  const workspace = await fs.mkdtemp(`${context.runnerTemp}/actions-tanpopo-bot-`)
  core.info(`Created a workspace at ${workspace}`)

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

  await exec.exec('bash', ['-eux', '-o', 'pipefail', `${context.workspace}/${taskDir}/task.sh`], { cwd: workspace })

  const { stdout: gitStatus } = await exec.getExecOutput('git', ['status', '--porcelain'], { cwd: workspace })
  if (gitStatus === '') {
    return
  }
  await exec.exec('git', ['add', '.'], { cwd: workspace })
  await exec.exec('git', ['config', 'user.name', context.actor], { cwd: workspace })
  await exec.exec('git', ['config', 'user.email', `${context.actor}@users.noreply.github.com`], { cwd: workspace })
  await exec.exec('git', ['commit', '--quiet', '-m', `Apply ${taskDir}`, '-m', `GitHub Actions: ${workflowRunUrl}`], {
    cwd: workspace,
  })
  await exec.exec('git', ['rev-parse', 'HEAD'], { cwd: workspace })

  const headBranch = `bot--${taskDir.replaceAll(/[^\w]/g, '-')}`
  await exec.exec('git', ['push', '--quiet', '-f', 'origin', `HEAD:${headBranch}`], {
    cwd: workspace,
  })

  const { stdout: defaultBranchRef } = await exec.getExecOutput(
    'git',
    ['rev-parse', '--symbolic-full-name', 'origin/HEAD'],
    { cwd: workspace },
  )
  const defaultBranch = defaultBranchRef.trim().split('/').pop() ?? 'main'
  const [owner, repo] = repository.split('/')
  const { data: pull } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: taskName,
    head: headBranch,
    base: defaultBranch,
    body: readme,
  })
  core.info(`Created ${pull.html_url}`)
}
