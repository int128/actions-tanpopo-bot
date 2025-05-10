import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import * as path from 'path'
import { Context } from './github.js'
import { ContentListUnion, FunctionCall, FunctionDeclaration, FunctionResponse, GoogleGenAI, Type } from '@google/genai'
import { WebhookEvent } from '@octokit/webhooks-types'
import assert from 'assert'

const systemInstruction = `
You are a software engineer.
If any command failed, stop the task and return a message with the prefix of "ERROR:".
Use the 'readFile' function to read source files if you need to inspect their content to fix issues.
Use the 'exec' function to run shell commands, for example, to run linters or build tools.
`

export const applyTask = async (taskDir: string, workspace: string, context: Context<WebhookEvent>) => {
  const ai = new GoogleGenAI({ apiKey: process.env.BOT_GEMINI_API_KEY })

  const prompt = `
Follow the task instruction.
The next part of this message contains the task instruction.

- The current working directory contains the code to be modified.
- The task instruction is located at ${context.workspace}/${taskDir}/README.md.
`

  const taskReadme = await fs.readFile(path.join(taskDir, 'README.md'), 'utf-8')
  const contents: ContentListUnion = [
    {
      role: 'user',
      parts: [{ text: prompt }, { text: taskReadme }],
    },
  ]

  for (;;) {
    core.info('🤖 Thinking...')
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: {
        systemInstruction: [systemInstruction],
        tools: [{ functionDeclarations: [execFunctionDeclaration, readFileFunctionDeclaration] }],
      },
    })
    if (response.functionCalls) {
      for (const functionCall of response.functionCalls) {
        if (functionCall.name === execFunctionDeclaration.name) {
          contents.push({ role: 'model', parts: [{ functionCall }] })
          contents.push({ role: 'user', parts: [{ functionResponse: await execFunction(functionCall, workspace) }] })
        } else if (functionCall.name === readFileFunctionDeclaration.name) {
          contents.push({ role: 'model', parts: [{ functionCall }] })
          contents.push({
            role: 'user',
            parts: [{ functionResponse: await readFileFunction(functionCall, workspace) }],
          })
        }
      }
    } else if (response.text) {
      core.info(`🤖: ${response.text}`)
      if (response.text.startsWith('ERROR:')) {
        throw new Error(response.text)
      }
      return
    } else {
      throw new Error(`no content from the model: ${response.promptFeedback?.blockReasonMessage}`)
    }
  }
}

const execFunctionDeclaration: FunctionDeclaration = {
  description: `Run a shell command in the workspace. Typical Linux commands are available, such as grep or sed.`,
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
        description: 'The exit code of the command. 0 means success, non-zero means failure',
      },
    },
  },
}

const readFileFunctionDeclaration: FunctionDeclaration = {
  name: 'readFile',
  description: 'Reads the content of a file in the workspace. Can be used to get context of the source code.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filePath: {
        type: Type.STRING,
        description: 'The relative path to the file from the workspace root.',
      },
      startLine: {
        type: Type.NUMBER,
        description: 'Optional: The 0-based line number to start reading from.',
      },
      endLine: {
        type: Type.NUMBER,
        description: 'Optional: The 0-based line number to end reading at (inclusive).',
      },
    },
    required: ['filePath'],
  },
  response: {
    type: Type.OBJECT,
    properties: {
      content: {
        type: Type.STRING,
        description: 'The content of the file, or the specified portion.',
      },
      error: {
        type: Type.STRING,
        description: 'An error message if reading the file failed.',
      },
    },
  },
}

const readFileFunction = async (functionCall: FunctionCall, workspace: string): Promise<FunctionResponse> => {
  assert(functionCall.args)
  const { filePath, startLine, endLine } = functionCall.args
  assert(typeof filePath === 'string', `filePath must be a string but got ${typeof filePath}`)
  if (startLine !== undefined) {
    assert(typeof startLine === 'number', `startLine must be a number but got ${typeof startLine}`)
  }
  if (endLine !== undefined) {
    assert(typeof endLine === 'number', `endLine must be a number but got ${typeof endLine}`)
  }

  const absoluteFilePath = path.join(workspace, filePath)
  try {
    const fileContent = await fs.readFile(absoluteFilePath, 'utf-8')
    let contentToReturn = fileContent
    if (startLine !== undefined && endLine !== undefined && startLine >= 0 && endLine >= startLine) {
      const lines = fileContent.split('\\n')
      contentToReturn = lines.slice(startLine, endLine + 1).join('\\n')
    } else if (startLine !== undefined && startLine >= 0) {
      const lines = fileContent.split('\\n')
      contentToReturn = lines.slice(startLine).join('\\n')
    } else if (endLine !== undefined && endLine >= 0) {
      const lines = fileContent.split('\\n')
      contentToReturn = lines.slice(0, endLine + 1).join('\\n')
    }

    return {
      id: functionCall.id,
      name: functionCall.name,
      response: { content: contentToReturn },
    }
  } catch (e: unknown) {
    let errorMessage = 'An unknown error occurred'
    if (e instanceof Error) {
      errorMessage = e.message
    }
    return {
      id: functionCall.id,
      name: functionCall.name,
      response: { error: errorMessage },
    }
  }
}

const execFunction = async (functionCall: FunctionCall, workspace: string): Promise<FunctionResponse> => {
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
  return {
    id: functionCall.id,
    name: functionCall.name,
    response: {
      stdout,
      stderr,
      exitCode,
    },
  }
}
