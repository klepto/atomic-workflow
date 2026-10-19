import { parseArgs } from 'node:util';
import { ServeRepository } from './serve-repository.ts';

/**
 * Serves as the repository server at the address that the argument `--address <address>` names. The process ends
 * when the last session server leaves.
 */
const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { address: { type: 'string' } } });
  if (values.address === undefined) throw new Error('The argument --address <address> is missing');
  await ServeRepository(values.address);
};

await main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
