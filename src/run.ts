import assert from 'assert'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import * as path from 'path'
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
  const { data: existingReviewComments } = await octokit.rest.pulls.listReviewComments({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    pull_number: event.number,
  })
  for (const existingReviewComment of existingReviewComments) {
    if (existingReviewComment.body.startsWith('<!-- actions-tanpopo-bot')) {
      await octokit.rest.pulls.deleteReviewComment({
        owner: event.repository.owner.login,
        repo: event.repository.name,
        comment_id: existingReviewComment.id,
      })
    }
  }

  const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 })

  const { data: files } = await octokit.pulls.listFiles({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    pull_number: event.number,
    per_page: 100,
  })
  const taskFilenames = files.filter((file) => file.filename.startsWith('tasks/')).map((file) => file.filename)
  for (const taskFilename of taskFilenames) {
    const { data: parentComment } = await octokit.pulls.createReviewComment({
      owner: event.repository.owner.login,
      repo: event.repository.name,
      pull_number: event.number,
      commit_id: event.pull_request.head.sha,
      subject_type: 'file',
      path: taskFilename,
      body: `Click the checkbox to apply the task to the repository.`,
    })

    for (const repository of repositories) {
      const metadata = { repository: repository.full_name }
      await octokit.rest.pulls.createReviewComment({
        owner: event.repository.owner.login,
        repo: event.repository.name,
        pull_number: event.number,
        commit_id: event.pull_request.head.sha,
        subject_type: 'file',
        path: taskFilename,
        in_reply_to: parentComment.id,
        body: `<!-- actions-tanpopo-bot ${JSON.stringify(metadata)} -->
- [ ] Apply to ${repository.full_name}`,
      })
    }
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

  const workflowRunUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`
  const taskDir = path.dirname(event.comment.path)

  const readme = await fs.readFile(path.join(taskDir, 'README.md'), 'utf-8')
  const taskName = readme.match(/# (.+)/)?.[1]
  assert(taskName, 'README.md must have a title')

  await octokit.rest.pulls.updateReviewComment({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    comment_id: event.comment.id,
    body: `[GitHub Actions](${workflowRunUrl}) is applying the task to ${metadata.repository}`,
  })

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
      `${context.serverUrl}/${metadata.repository}.git`,
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
  const defaultBranch = defaultBranchRef.split('/').pop() ?? 'main'
  const [owner, repo] = metadata.repository.split('/')
  const { data: pull } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: taskName,
    head: headBranch,
    base: defaultBranch,
    body: readme,
  })
  core.info(`Created ${pull.html_url}`)

  await octokit.rest.pulls.updateReviewComment({
    owner: event.repository.owner.login,
    repo: event.repository.name,
    comment_id: event.comment.id,
    body: `[GitHub Actions](${workflowRunUrl}) created ${pull.html_url}`,
  })
}
