import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { parseJson } from '../transcript/claude-entry.ts';
import type { RefreshUsageFunction } from './usage-refresh.ts';

/**
 * Arguments of the `claude` command that runs the local command `/usage` in print mode. `/usage` fetches the usage
 * limits and caches them without a request to a model. The other arguments keep the run apart from every session:
 * no MCP server starts, so no session server of atomic-workflow attaches, no hook runs, and no transcript is saved.
 * The cheapest model and one turn bound the cost, should Claude Code ever send `/usage` to a model as a prompt.
 */
const ARGUMENTS = [
  '--print',
  '/usage',
  '--output-format',
  'json',
  '--model',
  'haiku',
  '--max-turns',
  '1',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--settings',
  JSON.stringify({ disableAllHooks: true }),
];

/**
 * Time in ms after which a run of `claude` that has not ended is killed.
 */
const TIMEOUT = 60_000;

/**
 * Schema of the result that `claude` prints with `--output-format json`, with the fields that are read.
 */
const RESULT = z.object({
  is_error: z.boolean(),
  num_turns: z.number(),
});

/**
 * `RefreshUsageFunction` that runs `claude --print /usage` in the temporary directory of the system, with the
 * arguments of `ARGUMENTS`. Rejects when `claude` does not start, ends with another exit code than 0, runs longer than
 * `TIMEOUT`, prints no result, prints an error, or took a turn of a model.
 */
export const claudeRefreshUsage: RefreshUsageFunction = async () => {
  const output = await runClaude();
  const result = RESULT.safeParse(parseJson(output));
  if (!result.success) throw new Error('The command claude --print /usage printed no result');
  if (result.data.is_error) throw new Error('The command claude --print /usage failed');
  if (result.data.num_turns > 0) throw new Error('The command claude --print /usage took a turn of a model');
};

/**
 * Runs `claude` with the arguments of `ARGUMENTS`, and resolves with its standard output once it ended with the exit
 * code 0. Rejects when it does not start, or ends otherwise.
 */
const runClaude = async (): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('claude', ARGUMENTS, {
      cwd: tmpdir(),
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: TIMEOUT,
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`The command claude --print /usage ended with ${signal ?? `the exit code ${code}`}`));
    });
  });
