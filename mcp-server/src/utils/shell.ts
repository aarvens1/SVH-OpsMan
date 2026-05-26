import { run } from 'node:test';
import { McpServer, ToolDefinition, createTool } from '@modelcontextprotocol/sdk/server';

export async function runShellCommand(command: string, args: string[]): Promise<{ output: string; error?: string }> {
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const process = spawn(command, args);
      let output = '';
      let error = '';
      process.stdout.on('data', (data) => (output += data.toString()));
      process.stderr.on('data', (data) => (error += data.toString()));
      process.on('close', () => resolve({ output, error }));
    });
}
