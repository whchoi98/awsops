import { NextRequest, NextResponse } from 'next/server';
import {
  BedrockAgentCoreClient,
  StartCodeInterpreterSessionCommand,
  InvokeCodeInterpreterCommand,
  StopCodeInterpreterSessionCommand,
} from '@aws-sdk/client-bedrock-agentcore';

const CODE_INTERPRETER_REGION = 'ap-northeast-2';
const CODE_INTERPRETER_ID = 'awsops_code_interpreter-z8d1fmh5Nf';

const client = new BedrockAgentCoreClient({ region: CODE_INTERPRETER_REGION });

/**
 * Execute Python code via Bedrock AgentCore Code Interpreter.
 *
 * POST /api/code
 * Body: { code: string }
 * Response: { output: string, exitCode: number }
 */
export async function POST(request: NextRequest) {
  let sessionId: string | undefined;

  try {
    const body = await request.json();
    const { code } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "code" field. Expected a string.' },
        { status: 400 }
      );
    }

    // 1. Start a Code Interpreter session
    const startResponse = await client.send(
      new StartCodeInterpreterSessionCommand({
        codeInterpreterIdentifier: CODE_INTERPRETER_ID,
      })
    );
    sessionId = startResponse.sessionId;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Failed to start Code Interpreter session: no sessionId returned' },
        { status: 500 }
      );
    }

    // 2. Execute code
    const invokeResponse = await client.send(
      new InvokeCodeInterpreterCommand({
        codeInterpreterIdentifier: CODE_INTERPRETER_ID,
        sessionId,
        name: 'executeCode',
        arguments: { code, language: 'python' } as any,
      })
    );

    // 3. Read the event stream for results
    let output = '';
    let exitCode = 0;

    if (invokeResponse.stream) {
      try {
        for await (const event of invokeResponse.stream) {
          if (event.result) {
            // event.result.content is an array of content blocks
            const content = event.result.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.text) {
                  output += block.text;
                }
              }
            }
          }
          if ('error' in event) {
            output += `Error: ${JSON.stringify((event as any).error)}`;
            exitCode = 1;
          }
        }
      } catch (streamError: any) {
        // Some stream implementations may throw on iteration
        output += `Stream error: ${streamError.message || String(streamError)}`;
        exitCode = 1;
      }
    }

    // If no output was captured, check for non-stream response patterns
    if (!output && 'result' in invokeResponse) {
      const result = (invokeResponse as any).result;
      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.text) {
            output += block.text;
          }
        }
      }
    }

    // 4. Stop the session to release resources
    await stopSession(sessionId);
    sessionId = undefined; // Mark as stopped

    return NextResponse.json({
      output: output || '(no output)',
      exitCode,
    });
  } catch (err: any) {
    console.error('[Code Interpreter Error]', err?.message || err);

    // Ensure session cleanup on error
    if (sessionId) {
      await stopSession(sessionId);
    }

    return NextResponse.json(
      {
        error: err.message || 'Code execution failed',
        output: '',
        exitCode: 1,
      },
      { status: 500 }
    );
  }
}

async function stopSession(sessionId: string): Promise<void> {
  try {
    await client.send(
      new StopCodeInterpreterSessionCommand({
        codeInterpreterIdentifier: CODE_INTERPRETER_ID,
        sessionId,
      })
    );
  } catch (e: any) {
    console.error('[Code Interpreter] Failed to stop session:', e?.message || e);
  }
}
