import { describe, it, expect } from 'vitest';
import { runShellCommand } from '../../utils/shell';

describe('runShellCommand', () => {
  it('should execute a simple command and return its output', async () => {
    const { output, error } = await runShellCommand('echo', ['hello']);
    expect(output.trim()).toBe('hello');
    expect(error).toBe('');
  });

  it('should return an error for a non-existent command', async () => {
    const { output, error } = await runShellCommand('nonexistent_command_12345', []);
    expect(output).toBe('');
    expect(error).toContain('nonexistent_command_12345');
  });

  it('should return stdout and stderr correctly for commands that produce both', async () => {
    const { output, error } = await runShellCommand('bash', ['-c', 'echo "stdout_test"; echo "stderr_test" >&2']);
    expect(output.trim()).toBe('stdout_test');
    expect(error.trim()).toBe('stderr_test');
  });
});
