import { describe, it, expect, vi } from 'vitest';
import * as os from 'os';
import * as fs from 'fs/promises';
import { runShellCommand } from '../../utils/shell';
import { discoverCommands, getCommandParameters } from '../../tools/powershell';

vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('../../utils/shell', () => ({
  runShellCommand: vi.fn(),
}));

describe('PowerShell Tools', () => {
  describe('discoverCommands', () => {
    it('should find commands with matching topic in synopsis', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['SVH.Ad.psm1', 'SVH.Exchange.psm1'] as any);
      vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
        if ((filePath as string).includes('SVH.Ad.psm1')) {
          return `<#
.SYNOPSIS
Gets AD user info
#>
function Get-ADUser {}` as any;
        }
        if ((filePath as string).includes('SVH.Exchange.psm1')) {
          return `<#
.SYNOPSIS
Gets Exchange mailbox info
#>
function Get-Mailbox {}` as any;
        }
        return '' as any;
      });

      const result = await discoverCommands('AD user');
      expect(result).toEqual([
        { name: 'Get-ADUser', synopsis: 'Gets AD user info', module: 'SVH.Ad.psm1' },
      ]);
    });

    it('should find commands with matching topic in function name', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['SVH.Ad.psm1'] as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(`<#
.SYNOPSIS
Some AD function
#>
function Find-ADObject {}` as any);

      const result = await discoverCommands('Find');
      expect(result).toEqual([
        { name: 'Find-ADObject', synopsis: 'Some AD function', module: 'SVH.Ad.psm1' },
      ]);
    });

    it('should return empty array if no commands match', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['SVH.Ad.psm1'] as any);
      vi.mocked(fs.readFile).mockResolvedValueOnce(`<#
.SYNOPSIS
Gets AD user info
#>
function Get-ADUser {}` as any);

      const result = await discoverCommands('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('getCommandParameters', () => {
    it('should parse parameters from Get-Help output', async () => {
      const mockGetHelpOutput = `
NAME
    Get-ADUser

SYNOPSIS
    Gets AD user info.

SYNTAX
    Get-ADUser [-Identity] <ADUser> [-Properties <String[]>] [<CommonParameters>]


DESCRIPTION
    Long description here.


PARAMETERS
    -Identity <ADUser>
        User identity.

        Required?                    True
        Position?                    0
        Default value

    -Properties <String[]>
        Additional properties to retrieve.

        Required?                    False
        Position?                    Named
        Default value

    <CommonParameters>
        This cmdlet supports the common parameters: Verbose, Debug,
        ErrorAction, ErrorVariable, WarningAction, WarningVariable,
        OutBuffer, PipelineVariable, OutVariable, ReportCimError, and
        PsDbgContext. For more information, see
        about_CommonParameters (https://go.microsoft.com/fwlink/?LinkID=113216).

INPUTS
    None

OUTPUTS
    Microsoft.ActiveDirectory.Management.ADUser

NOTES

      `+os.EOL;

      vi.mocked(runShellCommand).mockResolvedValueOnce({ output: mockGetHelpOutput, error: '' });

      const result = await getCommandParameters('Get-ADUser');
      expect(result).toEqual([
        { name: 'Identity', type: 'ADUser', required: true, description: 'User identity.' },
        { name: 'Properties', type: 'String[]', required: false, description: 'Additional properties to retrieve.' },
      ]);
    });

    it('should handle commands with no specific parameters', async () => {
      const mockGetHelpOutput = `
NAME
    Restart-Service

SYNOPSIS
    Restarts a stopped service.

SYNTAX
    Restart-Service [-Name] <String[]> [<CommonParameters>]


DESCRIPTION
    Restarts a stopped service.


PARAMETERS
    -Name <String[]>
        Specifies the service names.

        Required?                    True
        Position?                    0
        Default value
        Accept pipeline input?       True (ByPropertyName, ByValue)
        Accept wildcard characters?  False

    <CommonParameters>
        This cmdlet supports the common parameters: Verbose, Debug,
        ErrorAction, ErrorVariable, WarningAction, WarningVariable,
        OutBuffer, PipelineVariable, OutVariable, ReportCimError, and
        PsDbgContext. For more information, see
        about_CommonParameters (https://go.microsoft.com/fwlink/?LinkID=113216).

INPUTS
    None

OUTPUTS
    System.ServiceProcess.ServiceController

NOTES

      `+os.EOL;

      vi.mocked(runShellCommand).mockResolvedValueOnce({ output: mockGetHelpOutput, error: '' });

      const result = await getCommandParameters('Restart-Service');
      expect(result).toEqual([
        { name: 'Name', type: 'String[]', required: true, description: 'Specifies the service names.' },
      ]);
    });

    it('should return empty array if no parameters are found', async () => {
      const mockGetHelpOutput = `
NAME
    Test-Command

SYNOPSIS
    A command with no specific parameters.

SYNTAX
    Test-Command [<CommonParameters>]

PARAMETERS
    <CommonParameters>
        ...

INPUTS
    None

OUTPUTS
    None
      `+os.EOL;

      vi.mocked(runShellCommand).mockResolvedValueOnce({ output: mockGetHelpOutput, error: '' });

      const result = await getCommandParameters('Test-Command');
      expect(result).toEqual([]);
    });
  });
});
