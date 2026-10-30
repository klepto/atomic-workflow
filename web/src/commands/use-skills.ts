import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import { serialReads } from '@/api/serial-reads.ts';
import type { Skill } from '@/api/types.ts';
import { workflowSkills } from '@/commands/skill-commands.ts';
import { errorMessage } from '@/lib/error-message.ts';

/**
 * Skills of the atomic workflow that a session can run, as the page knows them.
 */
interface SessionSkills {
  /**
   * Skills of the atomic workflow that the session can run, in the order that its agent lists them, or `undefined`
   * until a read succeeded once.
   */
  readonly skills: readonly Skill[] | undefined;

  /**
   * Message of the latest failed read, or `null` when the latest read succeeded or none ended yet.
   */
  readonly failure: string | null;

  /**
   * Reads the skills again, such as when the menu opens, since the agent may list new skills at any time.
   */
  readonly refresh: () => void;
}

/**
 * Result of `skillList`.
 */
interface SkillListResult {
  /**
   * Skills that the session can run, in the order that its agent lists them.
   */
  readonly skills: readonly Skill[];
}

/**
 * Returns the skills of the atomic workflow that the session `sessionId` can run, read with `skillList` at mount, each
 * time `sessionId` changes, and on each `refresh`. While `sessionId` is `undefined`, nothing is read. The skills of
 * other plugins, and the personal and project skills, are left out. Reads of one session never overlap: a `refresh`
 * during a read leads to one more read after it. A failed read keeps the skills of the latest read that succeeded, and
 * so does a change of `sessionId` until its read succeeds. A read that ends after `sessionId` changed, or after the
 * component unmounted, is dropped.
 */
export const useSkills = (sessionId: string | undefined): SessionSkills => {
  const [skills, setSkills] = useState<readonly Skill[]>();
  const [failure, setFailure] = useState<string | null>(null);
  const read = useRef<() => Promise<void>>(undefined);

  useEffect(() => {
    if (sessionId === undefined) {
      read.current = undefined;
      return;
    }
    let current = true;
    read.current = serialReads(async () => {
      try {
        const result = await fetchCall<SkillListResult>('skillList', { sessionId });
        if (current) {
          setSkills(workflowSkills(result.skills));
          setFailure(null);
        }
      } catch (error) {
        if (current) {
          setFailure(errorMessage(error));
        }
      }
    });
    void read.current();
    return () => {
      current = false;
    };
  }, [sessionId]);

  const refresh = useCallback(() => {
    void read.current?.();
  }, []);

  return { skills, failure, refresh };
};
