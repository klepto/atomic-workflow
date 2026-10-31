import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RpcCallError } from '@/api/rpc.ts';
import type { Ticket } from '@/api/types.ts';
import { approveTicket } from '@/tasks/approve-ticket.ts';
import { fakeCall } from '@/testing/fake-call.ts';

/**
 * Returns a ticket with the id `id` and the status `status`.
 */
const ticket = (id: number, status: Ticket['status']): Pick<Ticket, 'id' | 'status'> => ({ id, status });

describe('approveTicket', () => {
  it('sets the ticket done and stops while another ticket is not done', async () => {
    const { call, calls } = fakeCall({ taskGet: () => ({ tickets: [ticket(1, 'done'), ticket(2, 'needs-review')] }) });
    assert.equal(await approveTicket(3, 1, { call }), undefined);
    assert.deepEqual(calls, [
      { method: 'ticketSetStatus', params: { taskId: 3, ticketId: 1, status: 'done' } },
      { method: 'taskGet', params: { task: 3 } },
    ]);
  });

  it('lands the task once every ticket is done', async () => {
    const { call, calls } = fakeCall({ taskGet: () => ({ tickets: [ticket(1, 'done'), ticket(2, 'done')] }) });
    assert.equal(await approveTicket(3, 2, { call }), undefined);
    assert.deepEqual(calls.at(-1), { method: 'worktreeMerge', params: { taskId: 3 } });
  });

  it('hands the approval to the orchestrator of the task when the landing stops on a conflict', async () => {
    const { call, calls } = fakeCall({
      taskGet: () => ({ tickets: [ticket(1, 'done')] }),
      worktreeMerge: () => {
        throw new RpcCallError('The merge stopped on a conflict', { kind: 'conflict', files: ['a.ts'] });
      },
      taskOrchestratorDeliver: () => ({ sessionId: 'orchestrator-1' }),
    });
    assert.equal(await approveTicket(3, 1, { call }), 'orchestrator-1');
    assert.deepEqual(calls.at(-1), {
      method: 'taskOrchestratorDeliver',
      params: { taskId: 3, content: '/atomic-workflow:approve 3' },
    });
  });

  it('rejects with the failure of the landing when it is no conflict', async () => {
    const { call } = fakeCall({
      taskGet: () => ({ tickets: [ticket(1, 'done')] }),
      worktreeMerge: () => {
        throw new RpcCallError('The base branch is checked out elsewhere', { kind: 'checkout' });
      },
    });
    await assert.rejects(approveTicket(3, 1, { call }), {
      name: 'RpcCallError',
      message: 'The base branch is checked out elsewhere',
    });
  });

  it('rejects with the refusal of the server to set the ticket done', async () => {
    const { call, calls } = fakeCall({
      ticketSetStatus: () => {
        throw new RpcCallError('The ticket does not need review', undefined);
      },
    });
    await assert.rejects(approveTicket(3, 1, { call }), RpcCallError);
    assert.equal(calls.length, 1);
  });
});
