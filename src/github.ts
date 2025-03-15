import assert from 'assert'
import * as fs from 'fs/promises'
import { Octokit } from '@octokit/rest'
import { WebhookEvent } from '@octokit/webhooks-types'
import { createAppAuth, StrategyOptions } from '@octokit/auth-app'

export const getOctokit = (auth: StrategyOptions) =>
  new Octokit({
    authStrategy: createAppAuth,
    auth,
  })

export type Context = {
  repo: {
    owner: string
    repo: string
  }
  eventName: string
  payload: WebhookEvent
}

export const getContext = async (): Promise<Context> => {
  // https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables#default-environment-variables
  return {
    repo: getRepo(),
    eventName: getEnv('GITHUB_EVENT_NAME'),
    payload: JSON.parse(await fs.readFile(getEnv('GITHUB_EVENT_PATH'), 'utf-8')) as WebhookEvent,
  }
}

const getRepo = () => {
  const [owner, repo] = getEnv('GITHUB_REPOSITORY').split('/')
  return { owner, repo }
}

const getEnv = (name: string): string => {
  assert(process.env[name], `${name} is required`)
  return process.env[name]
}
