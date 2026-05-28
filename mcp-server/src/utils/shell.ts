/**
 * Executes a shell command and captures its stdout and stderr.
 * @param command The command to execute (e.g., 'pwsh', 'bash', 'echo').
 * @param args An array of string arguments for the command.
 * @returns A promise that resolves to an object containing the captured stdout (`output`) and stderr (`error`).
 */
export async function runShellCommand(command: string, args: string[]): Promise<{ output: string; error?: string }> {
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const proc = spawn(command, args);
      let output = '';
      let error = '';
      proc.stdout.on('data', (data) => (output += data.toString()));
      proc.stderr.on('data', (data) => (error += data.toString()));
      proc.on('error', (e) => (error += e.message));
      proc.on('close', () => resolve({ output, error }));
    });
}
