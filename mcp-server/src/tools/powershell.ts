import { McpServer, ToolDefinition } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import { promises as fs } from 'fs';
import * as path from 'path';
import { runShellCommand } from '../utils/shell.js';

// Define a utility function to find the project root.
// This is important for locating the `powershell/modules` directory correctly.
function getProjectRoot(): string {
  // Assuming this file is at `mcp-server/src/tools/powershell.ts`
  // The project root is 3 levels up.
  return path.resolve(__dirname, '..', '..', '..');
}

async function discoverCommands(topic: string): Promise<{ name: string; synopsis: string; module: string }[]> {
  const root = getProjectRoot();
  const modulesDir = path.join(root, 'powershell', 'modules');
  const files = await fs.readdir(modulesDir);
  const psModules = files.filter((f) => f.endsWith('.psm1'));

  const results: { name: string; synopsis: string; module: string }[] = [];
  const topicRegex = new RegExp(topic, 'i');

  for (const moduleFile of psModules) {
    const filePath = path.join(modulesDir, moduleFile);
    const content = await fs.readFile(filePath, 'utf-8');

    // Regex to find function blocks and their preceding synopsis
    const functionRegex = /<#\s*\.SYNOPSIS\s*([\s\S]*?)#>\s*function\s+([A-Za-z0-9_-]+)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const synopsis = match[1].trim();
      const functionName = match[2].trim();

      if (topicRegex.test(synopsis) || topicRegex.test(functionName)) {
        results.push({
          name: functionName,
          synopsis: synopsis.replace(/\s+/g, ' '), // Clean up whitespace
          module: moduleFile,
        });
      }
    }
  }
  return results;
}

async function getCommandParameters(commandName: string): Promise<{ name: string; type: string; required: boolean; description: string }[]> {
    const root = getProjectRoot();
    const command = `. ${path.join(root, 'powershell', 'connect.ps1')}; Get-Help ${commandName} -Full`;
    const { output } = await runShellCommand('pwsh', ['-c', command]);
  
    const lines = output.split('
');
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
        break; // End of parameters section
      }
  
      const paramNameMatch = line.match(/^\s*-([A-Za-z0-9_]+)\s+<([A-Za-z0-9\[\]]+)>/);
      if (paramNameMatch) {
        if (currentParam) params.push(currentParam);
        currentParam = {
          name: paramNameMatch[1],
          type: paramNameMatch[2],
          required: false, // We will update this
          description: '',
        };
      } else if (currentParam && line.trim()) {
        if (line.includes('Required?                    true')) currentParam.required = true;
        if (!line.match(/Required\?|Position\?|Default value|Accept pipeline input|Accept wildcard characters/)) {
            currentParam.description = (currentParam.description + ' ' + line.trim()).trim();
        }
      }
    }
    if (currentParam) params.push(currentParam);
  
    return params;
}

const discoverTool: ToolDefinition = {
  name: 'powershell_discover_commands',
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
  execute: async ({ topic }) => ({ commands: await discoverCommands(topic) }),
};

const getParamsTool: ToolDefinition = {
  name: 'powershell_get_command_parameters',
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
  execute: async ({ commandName }) => ({ parameters: await getCommandParameters(commandName) }),
};


export function registerPowerShellTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;
  server.registerTool(discoverTool.name, discoverTool);
  server.registerTool(getParamsTool.name, getParamsTool);
}
