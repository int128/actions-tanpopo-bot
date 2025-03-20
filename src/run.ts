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
  const { data: files } = await octokit.pulls.listFiles({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    pull_number: event.number,
    per_page: 100,
  })
  const taskFilenames = files.filter((file) => file.filename.startsWith('tasks/')).map((file) => file.filename)
  const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })
  for (const taskFilename of taskFilenames) {
    await octokit.pulls.createReview({
      owner: event.repository.owner.login,
      repo: event.repository.name,
      pull_number: event.number,
      commit_id: event.pull_request.head.sha,
      event: 'COMMENT',
      body: '',
      comments: repositories.map((repository) => {
        const metadata = { repository: repository.full_name }
        return {
          path: taskFilename,
          position: 0,
          body: `<!-- actions-tanpopo-bot ${JSON.stringify(metadata)} -->
- [ ] Apply to ${repository.full_name}
`,
        }
      }),
    })
  }
}

const processPullRequestReviewComment = async (
  event: PullRequestReviewCommentEditedEvent,
  octokit: Octokit,
  context: Context,
) => {
  const metadataMatcher = /<!-- actions-tanpopo-bot (.+?) -->/.exec(event.comment.body)
  if (!metadataMatcher) {
    return
  }
  const metadata = JSON.parse(metadataMatcher[1]) as unknown
  assert(typeof metadata === 'object')
  assert(metadata !== null)
  assert('repository' in metadata)
  assert(typeof metadata.repository === 'string')

  const taskFilename = event.comment.path

  await octokit.rest.pulls.createReplyForReviewComment({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    pull_number: event.pull_request.number,
    comment_id: event.comment.id,
    body: `@${context.actor} Applying ${taskFilename} to ${metadata.repository} in [GitHub Actions](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`,
  })
  await processRepository(taskFilename, metadata.repository, octokit, context)
}

export const processRepository = async (
  taskFilename: string,
  repository: string,
  octokit: Octokit,
  context: Context,
) => {
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
  await exec.exec('git', ['config', 'user.name', context.actor], { cwd: workspace })
  await exec.exec('git', ['config', 'user.email', `${context.actor}@users.noreply.github.com`], { cwd: workspace })

  await exec.exec('bash', ['-eux', '-opipefail', `${context.workspace}/${taskFilename}`], { cwd: workspace })

  const { stdout: gitStatus } = await exec.getExecOutput('git', ['status', '--porcelain'], { cwd: workspace })
  if (gitStatus === '') {
    return
  }
  await exec.exec('git', ['add', '.'], { cwd: workspace })
  await exec.exec(
    'git',
    [
      'commit',
      '--quiet',
      '-m',
      `Run ${taskFilename}`,
      '-m',
      `GitHub Actions: ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
    ],
    { cwd: workspace },
  )
  await exec.exec('git', ['rev-parse', 'HEAD'], { cwd: workspace })

  const headBranch = `bot--${taskFilename.replaceAll(/[^\w]/, '-')}`
  await exec.exec('git', ['push', '--quiet', '-f', 'origin', `HEAD:${headBranch}`], {
    cwd: workspace,
  })
  const [owner, repo] = repository.split('/')
  const { data: pull } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `Apply ${taskFilename}`,
    head: headBranch,
    base: 'main',
    body: `From ${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
  })
  core.info(`Created ${pull.html_url}`)
}
