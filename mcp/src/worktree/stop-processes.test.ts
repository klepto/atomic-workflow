import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type FoundProcess, processesInside } from './stop-processes.ts';

/**
 * Returns the process `pid` with the command line `commandLine`.
 */
const found = (pid: number, commandLine: string): FoundProcess => ({ pid, commandLine });

describe('processesInside', () => {
  it('returns the processes whose command line names a path inside one of the directories', () => {
    const processes = [found(1, 'node /work/task/main/server.js'), found(2, 'node /other/server.js')];
    assert.deepEqual(processesInside(processes, ['/work/task'], 'linux', 99), [processes[0]]);
  });

  it('leaves out the process that calls it', () => {
    const processes = [found(1, 'node /work/task/main/server.js')];
    assert.deepEqual(processesInside(processes, ['/work/task'], 'linux', 1), []);
  });

  it('leaves out a command line that names only a sibling whose name starts with the name of the directory', () => {
    const processes = [found(1, 'node /work/task-2/server.js')];
    assert.deepEqual(processesInside(processes, ['/work/task'], 'linux', 99), []);
  });

  it('compares the paths of win32 without case and with either slash', () => {
    const processes = [found(1, 'node C:/Work/Task/main/server.js'), found(2, 'node c:\\work\\task\\vite.js')];
    assert.deepEqual(processesInside(processes, ['C:\\work\\task'], 'win32', 99), processes);
  });

  it('counts the form of a path of win32 that a shell of Git Bash writes', () => {
    const processes = [found(1, 'bash -c "cd /c/work/task/main && npm run dev"')];
    assert.deepEqual(processesInside(processes, ['C:\\work\\task'], 'win32', 99), processes);
  });
});
