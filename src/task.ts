import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Context } from './github.js'
import { ContentListUnion, FunctionCall, FunctionDeclaration, GoogleGenAI, Type } from '@google/genai'
import { WebhookEvent } from '@octokit/webhooks-types'
import assert from 'assert'

export const applyTask = async (taskDir: string, workspace: string, context: Context<WebhookEvent>) => {
  await exec.exec('bash', ['-eux', '-o', 'pipefail', `${context.workspace}/${taskDir}/task.sh`], { cwd: workspace })

  const ai = new GoogleGenAI({ apiKey: process.env.BOT_GEMINI_API_KEY })
  const taskReadme = await fs.readFile(path.join(taskDir, 'README.md'), 'utf-8')
  const contents: ContentListUnion = [
    {
      role: 'user',
      parts: [
        {
          text: `
You are an agent for the software development tasks.
Follow the task instruction of the next part.
`,
        },
        { text: taskReadme },
      ],
    },
  ]

  for (;;) {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        tools: [
          {
            functionDeclarations: [execFunctionDeclaration],
          },
        ],
      },
    })
    core.info(`Response: ${response.text}`)
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
  description: 'Run a shell command in the workspace',
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
    },
  },
}

const execFunction = async (functionCall: FunctionCall, workspace: string) => {
  assert(functionCall.args)
  const { command, args } = functionCall.args
  assert(typeof command === 'string')
  assert(Array.isArray(args))
  assert(args.every((arg) => typeof arg === 'string'))
  const { stdout, stderr } = await exec.getExecOutput(command, args, { cwd: workspace })
  return { stdout, stderr }
}
