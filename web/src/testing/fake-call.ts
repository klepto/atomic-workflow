import type { CallFunction } from '@/api/rpc.ts';

/**
 * Call to the server that a `FakeCall` recorded: its method and its parameters.
 */
interface RecordedCall {
  /**
   * Method of the call.
   */
  readonly method: string;

  /**
   * Parameters of the call, or `undefined` for a call without any.
   */
  readonly params: Record<string, unknown> | undefined;
}

/**
 * `CallFunction` for tests, with the calls that it recorded.
 */
interface FakeCall {
  /**
   * Function to pass where code takes a `CallFunction`.
   */
  readonly call: CallFunction;

  /**
   * Calls in the order in which they came.
   */
  readonly calls: readonly RecordedCall[];
}

/**
 * Returns a `CallFunction` that records each call, and answers it with the result of the handler of its method in
 * `handlers`, which gets the parameters of the call. A handler that throws rejects the call with its error. A method
 * without a handler answers `null`.
 */
export const fakeCall = (
  handlers: Readonly<Record<string, (params: Record<string, unknown> | undefined) => unknown>>,
): FakeCall => {
  const calls: RecordedCall[] = [];
  const call = async <Result>(method: string, params?: Record<string, unknown>): Promise<Result> => {
    calls.push({ method, params });
    // The fake answers what the test names, as the server answers the type that the caller expects.
    return (handlers[method]?.(params) ?? null) as Result;
  };
  return { call, calls };
};
