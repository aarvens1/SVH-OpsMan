import * as os from 'os';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { runShellCommand } from '../utils/shell.js';
import { ok, err } from "../utils/response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

/**
 * Discovers PowerShell commands within the `powershell/modules` directory that match a given topic.
 * @param topic The keyword or topic to search for (e.g., "user", "VM", "replication").
 * @returns Array of objects containing command name, synopsis, and module file.
 */
export async function discoverCommands(topic: string): Promise<{ name: string; synopsis: string; module: string }[]> {
  const modulesDir = path.join(repoRoot, 'powershell', 'modules');
  const files = await fs.readdir(modulesDir);
  const psModules = files.filter((f) => f.endsWith('.psm1'));

  const results: { name: string; synopsis: string; module: string }[] = [];
  const topicRegex = new RegExp(topic, 'i');

  for (const moduleFile of psModules) {
    const filePath = path.join(modulesDir, moduleFile);
    const content = await fs.readFile(filePath, 'utf-8');

    const functionRegex = /<#\s*\.SYNOPSIS\s*([\s\S]*?)#>\s*function\s+([A-Za-z0-9_-]+)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      if (!match || typeof match[1] === 'undefined' || typeof match[2] === 'undefined') {
        continue;
      }
      const synopsis = match[1].trim();
      const functionName = match[2].trim();

      if (topicRegex.test(synopsis) || topicRegex.test(functionName)) {
        results.push({
          name: functionName,
          synopsis: synopsis.replace(/\s+/g, ' '),
          module: moduleFile,
        });
      }
    }
  }
  return results;
}

/**
 * Retrieves the detailed parameters for a given PowerShell command via `Get-Help -Full`.
 * @param commandName The name of the PowerShell command to inspect.
 * @returns Array of objects describing each parameter (name, type, required, description).
 */
export async function getCommandParameters(commandName: string): Promise<{ name: string; type: string; required: boolean; description: string }[]> {
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(commandName)) {
      throw new Error(`Invalid command name "${commandName}" — must be Verb-Noun format (letters, digits, hyphens)`);
    }
    const command = `. ${path.join(repoRoot, 'powershell', 'connect.ps1')}; Get-Help ${commandName} -Full`;
    const { output } = await runShellCommand('pwsh', ['-c', command]);

    const lines = output.split(os.EOL);
    const params: { name: string; type: string; required: boolean; description: string }[] = [];

    let inParamsSection = false;
    let currentParam: { name: string; type: string; required: boolean; description: string } | null = null;

    for (const line of lines) {
      if (line.trim() === 'PARAMETERS') {
        inParamsSection = true;
        continue;
      }
      if (!inParamsSection) continue;
      if (line.trim().startsWith('INPUTS') || line.trim().startsWith('OUTPUTS')) {
        break;
      }
      if (line.trim().startsWith('<CommonParameters>')) break;

      const paramNameMatch = line.match(/^\s*-([A-Za-z0-9_]+)\s+<([A-Za-z0-9\[\]]+)>/);
      if (paramNameMatch) {
        if (currentParam) params.push(currentParam);
        currentParam = {
          name: paramNameMatch[1] as string,
          type: paramNameMatch[2] as string,
          required: false,
          description: '',
        };
      } else if (currentParam && line.trim()) {
        if (line.toLowerCase().includes('required?                    true')) currentParam.required = true;
        if (!line.match(/Required\?|Position\?|Default value|Accept pipeline input|Accept wildcard characters/)) {
            currentParam.description = (currentParam.description + ' ' + line.trim()).trim();
        }
      }
    }
    if (currentParam) params.push(currentParam);

    return params;
}

export function registerPowerShellTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    'powershell_discover_commands',
    {
      description: 'Searches the SVH PowerShell modules for commands related to a specific topic.',
      inputSchema: z.object({
        topic: z.string().describe('The topic or keyword to search for (e.g., "user", "VM", "replication").'),
      }),
      outputSchema: z.object({
        commands: z.array(z.object({
          name: z.string(),
          synopsis: z.string(),
          module: z.string(),
        })),
      }),
    },
    async ({ topic }: { topic: string }) => ok({ commands: await discoverCommands(topic) }),
  );

  server.registerTool(
    'powershell_get_command_parameters',
    {
      description: 'Retrieves the parameters for a specific PowerShell command.',
      inputSchema: z.object({
        commandName: z.string().describe('The name of the command to inspect (e.g., "Get-ADReplicationStatus").'),
      }),
      outputSchema: z.object({
        parameters: z.array(z.object({
            name: z.string(),
            type: z.string(),
            required: z.boolean(),
            description: z.string(),
        }))
      }),
    },
    async ({ commandName }: { commandName: string }) => ok({ parameters: await getCommandParameters(commandName) }),
  );
}
