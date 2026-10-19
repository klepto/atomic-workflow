import { spawn } from 'node:child_process';
import type { LaunchFunction } from './launch.ts';

/**
 * Script of the Node.js program that starts a program as a detached process without a window and exits. The program
 * then has no living parent, so a kill of the process tree of the caller does not reach it on Windows.
 */
const LAUNCHER_SCRIPT = [
  "const { spawn } = require('node:child_process');",
  'const [program, ...commandLine] = JSON.parse(process.argv[1]);',
  "const child = spawn(program, commandLine, { detached: true, stdio: 'ignore', windowsHide: true });",
  "child.once('error', (error) => { process.stderr.write(error.message); process.exitCode = 1; });",
  "child.once('spawn', () => child.unref());",
].join('\n');

/**
 * `LaunchFunction` that starts the program through a short-lived launcher process, which starts the program as a
 * detached process and exits.
 */
export const detachedLaunch: LaunchFunction = (commandLine) => {
  return new Promise((resolve, reject) => {
    const launcher = spawn(process.execPath, ['--eval', LAUNCHER_SCRIPT, JSON.stringify(commandLine)], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    let errorText = '';
    launcher.stderr.on('data', (chunk: Buffer) => {
      errorText += chunk.toString();
    });
    launcher.once('error', reject);
    launcher.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`The launcher of ${commandLine[0]} failed: ${errorText}`));
    });
  });
};
