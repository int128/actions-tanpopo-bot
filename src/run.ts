import assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { Octokit } from '@octokit/action'
import { Context, getContext, getOctokit } from './github.js'
import { PullRequestEvent, PullRequestReviewCommentEditedEvent } from '@octokit/webhooks-types'

export const run = async (): Promise<void> => {
  const octokit = getOctokit()
  const context = await getContext()
  if ('pull_request' in context.payload && 'number' in context.payload) {
    core.info(`Processing #${context.payload.number}`)
    await processPullRequest(context.payload, octokit)
    return
  }
  if ('pull_request' in context.payload && 'comment' in context.payload && context.payload.action === 'edited') {
    core.info(`Processing the review comment ${context.payload.comment.html_url}`)
    await processPullRequestReviewComment(context.payload, octokit, context)
    return
  }
}

const processPullRequest = async (event: PullRequestEvent, octokit: Octokit) => {
  const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })
  const content = `<!-- actions-tanpopo-bot -->
## :robot: actions-tanpopo-bot
${repositories.map((repo) => `- [ ] ${repo.full_name}`).join('\n')}`

  const { data: files } = await octokit.pulls.listFiles({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    pull_number: event.number,
    per_page: 100,
  })
  const taskFilenames = files.filter((file) => file.filename.startsWith('tasks/')).map((file) => file.filename)

  for (const taskFilename of taskFilenames) {
    await octokit.pulls.createReviewComment({
      owner: event.repository.owner.login,
      repo: event.repository.name,
      pull_number: event.number,
      commit_id: event.pull_request.head.sha,
      subject_type: 'file',
      path: taskFilename,
      body: content,
    })
  }
}

const processPullRequestReviewComment = async (
  event: PullRequestReviewCommentEditedEvent,
  octokit: Octokit,
  context: Context,
) => {
  if (!event.comment.body.startsWith('<!-- actions-tanpopo-bot -->')) {
    return
  }

  const taskFilename = event.comment.path
  const repositories = findCheckedRepositories(event.comment.body)
  for (const repository of repositories) {
    await processRepository(taskFilename, repository, octokit, context)
  }
}

export const findCheckedRepositories = (body: string): string[] => {
  return body
    .split('\n')
    .filter((line) => line.startsWith('- [x]'))
    .map((line) => line.slice('- [x]'.length).trim())
}

export const processRepository = async (
  taskFilename: string,
  repository: string,
  octokit: Octokit,
  context: Context,
) => {
  const workspace = await fs.mkdtemp('actions-tanpopo-bot-')
  core.info(`Created a workspace ${workspace}`)
  process.chdir(workspace)

  const credentials = Buffer.from(`x-access-token:${core.getInput('token')}`).toString('base64')
  core.setSecret(credentials)
  await exec.exec('git', [
    'clone',
    '-c',
    `http.https://github.com/.extraheader=AUTHORIZATION: basic ${credentials}`,
    '--depth=1',
    `${context.serverUrl}/${repository}.git`,
  ])

  await exec.exec('git', ['config', 'user.name', context.actor])
  await exec.exec('git', ['config', 'user.email', `${context.actor}@users.noreply.github.com`])

  await exec.exec('bash', [taskFilename])

  await exec.exec('git', ['status', '--porcelain'])
  assert(octokit)
}
