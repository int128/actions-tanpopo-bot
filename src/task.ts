import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Context } from './github.js'
import { ContentListUnion, FunctionCall, FunctionDeclaration, GoogleGenAI, Type } from '@google/genai'
import { WebhookEvent } from '@octokit/webhooks-types'
import assert from 'assert'

const systemInstruction = `
You are an agent for the software development task.

There are the following constraints:

- The current working directory contains the repository to apply the task.
- If any command fails, stop the task and return the error.
- Do not dump the environment variables.
`

export const applyTask = async (taskDir: string, workspace: string, context: Context<WebhookEvent>) => {
  const ai = new GoogleGenAI({ apiKey: process.env.BOT_GEMINI_API_KEY })
  const taskReadme = await fs.readFile(path.join(taskDir, 'README.md'), 'utf-8')
  const contents: ContentListUnion = [
    {
      role: 'user',
      parts: [
        {
          text: `
Please follow the task instruction.
The next part of this message contains the task instruction.
The task directory is located at ${context.workspace}/${taskDir}.
`,
        },
        { text: taskReadme },
      ],
    },
  ]

  for (;;) {
    core.info('🤖 Thinking...')
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: [systemInstruction],
        tools: [{ functionDeclarations: [execFunctionDeclaration] }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: {
              type: Type.STRING,
              description: 'The message to send to the user',
            },
            failure: {
              type: Type.BOOLEAN,
              description: 'Whether the task failed',
            },
          },
        },
      },
    })
    const responseObject: unknown = JSON.parse(response.text ?? '{}')
    assert(typeof responseObject === 'object', `responseObject must be an object but got ${typeof responseObject}`)
    assert(responseObject !== null, 'responseObject must not be null')
    assert('message' in responseObject, 'responseObject must have a message property')
    assert(
      typeof responseObject.message === 'string',
      `message must be a string but got ${typeof responseObject.message}`,
    )
    assert('failure' in responseObject, 'responseObject must have a failure property')
    assert(
      typeof responseObject.failure === 'boolean',
      `failure must be a boolean but got ${typeof responseObject.failure}`,
    )
    core.info(`Response: ${responseObject.message}`)
    if (responseObject.failure) {
      throw new Error(`Task failed: ${responseObject.message}`)
    }
    if (response.functionCalls === undefined) {
      break
    }
    for (const functionCall of response.functionCalls) {
      if (functionCall.name === execFunctionDeclaration.name) {
        contents.push({ role: 'model', parts: [{ functionCall }] })
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: functionCall.id,
                name: functionCall.name,
                response: await execFunction(functionCall, workspace),
              },
            },
          ],
        })
      }
    }
  }
}

const execFunctionDeclaration: FunctionDeclaration = {
  description: 'Run a shell command in the workspace. Typical Linux commands are available such as grep or awk.',
  name: 'exec',
  parameters: {
    type: Type.OBJECT,
    properties: {
      command: {
        type: Type.STRING,
        description: 'The command to run',
      },
      args: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          description: 'The arguments to the command',
        },
      },
    },
    required: ['command'],
  },
  response: {
    type: Type.OBJECT,
    properties: {
      stdout: {
        type: Type.STRING,
        description: 'The standard output of the command',
      },
      stderr: {
        type: Type.STRING,
        description: 'The standard error of the command',
      },
      exitCode: {
        type: Type.NUMBER,
        description: 'The exit code of the command',
      },
    },
  },
}

const execFunction = async (functionCall: FunctionCall, workspace: string) => {
  assert(functionCall.args)
  const { command, args } = functionCall.args
  assert(typeof command === 'string', `command must be a string but got ${typeof command}`)
  if (args !== undefined) {
    assert(Array.isArray(args), `args must be an array but got ${typeof args}`)
    assert(
      args.every((arg) => typeof arg === 'string'),
      `args must be strings but got ${args.join()}`,
    )
  }
  const { stdout, stderr, exitCode } = await exec.getExecOutput(command, args, {
    cwd: workspace,
    ignoreReturnCode: true,
  })
  return { stdout, stderr, exitCode }
}
