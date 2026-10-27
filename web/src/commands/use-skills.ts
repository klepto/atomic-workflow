import { useCallback, useEffect, useRef, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { Skill } from '@/api/types.ts';
import { workflowSkills } from './skill-commands.ts';

/**
 * The skills of the atomic workflow that a session can run, as the page knows them.
 */
export interface SessionSkills {
  /**
   * The skills of the atomic workflow that the session can run, in the order that its agent lists them, or
   * `undefined` until a read succeeded once.
   */
  skills: readonly Skill[] | undefined;

  /**
   * The message of the latest failed read, or `null` when the latest read succeeded or none ended yet.
   */
  failure: string | null;

  /**
   * Reads the skills again, such as when the menu opens, since the agent may list new skills at any time.
   */
  refresh: () => void;
}

/**
 * Returns the message of the failure `error`.
 */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Returns the skills of the atomic workflow that the session `sessionId` can run, read with `skillList` at mount, each
 * time `sessionId` changes, and on each `refresh`. While `sessionId` is `undefined`, nothing is read. The skills of
 * other plugins, and the personal and project skills, are left out. A failed read keeps the skills of the latest read
 * that succeeded, and so does a change of `sessionId` until its read succeeds. A read that ends after a newer one
 * started is dropped.
 */
export const useSkills = (sessionId: string | undefined): SessionSkills => {
  const [skills, setSkills] = useState<readonly Skill[]>();
  const [failure, setFailure] = useState<string | null>(null);
  const latest = useRef(0);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    if (sessionId === undefined) {
      return;
    }
    latest.current += 1;
    const read = latest.current;

    /**
     * Returns whether the result of this read still counts: the component is mounted and no newer read started.
     */
    const current = () => mounted.current && read === latest.current;

    call<{ skills: readonly Skill[] }>('skillList', { sessionId }).then(
      (result) => {
        if (current()) {
          setSkills(workflowSkills(result.skills));
          setFailure(null);
        }
      },
      (error: unknown) => {
        if (current()) {
          setFailure(messageOf(error));
        }
      },
    );
  }, [sessionId]);

  // Declared before the effect that reads, so that a mount sets `mounted` before the first read starts.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { skills, failure, refresh };
};
