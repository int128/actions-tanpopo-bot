import * as core from '@actions/core'
import { run } from './run.js'
import { getContext, getOctokit } from './github.js'

try {
  const octokit = getOctokit()
  const context = await getContext()
  await run(octokit, context)
} catch (e) {
  core.setFailed(e instanceof Error ? e : String(e))
  console.error(e)
}
