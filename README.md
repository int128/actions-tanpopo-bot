# actions-tanpopo [![ts](https://github.com/int128/actions-tanpopo/actions/workflows/ts.yaml/badge.svg)](https://github.com/int128/actions-tanpopo/actions/workflows/ts.yaml)

This is the action to automate a routine task for each repository.

## Purpose

If you have a lot of repositories, you may want to automate a routine task for each repository.
For example,

- Update dependency versions in configuration files
- Migrate from one tool to another (e.g., from npm to yarn)
- Apply consistent security policies
- Update documentations
- Convert file formats
- Apply organizational best practices

This action handles the repetitive work of updating multiple repositories, similar to "刺身にたんぽぽを乗せる仕事" (placing dandelions on sashimi) in Japanese - a routine yet precise task that benefits from automation.

## Getting started

### Create a GitHub App

Create your GitHub App from [this link](https://github.com/settings/apps/new?webhook_active=false&url=https://github.com/int128/actions-tanpopo&contents=write&issues=write&pull_requests=write&workflows=write).
Here are the required permissions:

- Contents: read and write
- Pull Requests: read and write
- Workflows: read and write

Install the GitHub App to your repositories.

### Run the bot

Create a workflow to run this action.

```yaml
name: bot

on:
  pull_request:
    paths:
      - tasks/**
      - .github/workflows/bot.yaml

concurrency:
  cancel-in-progress: true
  group: ${{ github.workflow }}--${{ github.event.pull_request.id }}--${{ github.actor }}

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/create-github-app-token@df432ceedc7162793a195dd1713ff69aefc7379e # v2.0.6
        id: token
        with:
          app-id: ${{ secrets.BOT_APP_ID }}
          private-key: ${{ secrets.BOT_APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}
      - uses: int128/actions-tanpopo@v0
        with:
          token: ${{ steps.token.outputs.token }}
```

### Create a pull request with a task

Create a pull request with the following changes:

- `tasks/<task-name>/README.md`
  - Write the description of the task.
- `tasks/<task-name>/repositories`
  - Write the list of repositories to be updated.
  - Each line should be in the format of `owner/repo`.
