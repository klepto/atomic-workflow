import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testConnection } from '../testing/test-connection.ts';
import { mapCreateSessionConnections } from './session-connections.map.ts';

describe('mapCreateSessionConnections', () => {
  describe('bind', () => {
    it('binds the session to the connection and returns undefined for a connection that served no session', () => {
      const connections = mapCreateSessionConnections();
      const connection = testConnection();
      assert.equal(connections.bind('session-1', connection), undefined);
      assert.equal(connections.get('session-1'), connection);
    });

    it('returns the session that the connection served before, which it no longer serves', () => {
      const connections = mapCreateSessionConnections();
      const connection = testConnection();
      connections.bind('session-1', connection);
      assert.equal(connections.bind('session-2', connection), 'session-1');
      assert.equal(connections.get('session-1'), undefined);
      assert.equal(connections.get('session-2'), connection);
    });

    it('moves a session that another connection serves to the connection', () => {
      const connections = mapCreateSessionConnections();
      const first = testConnection();
      const second = testConnection();
      connections.bind('session-1', first);
      connections.bind('session-1', second);
      assert.equal(connections.get('session-1'), second);
    });

    it('drops the binding once the connection closes', async () => {
      const connections = mapCreateSessionConnections();
      const connection = testConnection();
      connections.bind('session-1', connection);
      connection.close();
      await connection.closed;
      assert.equal(connections.get('session-1'), undefined);
    });

    it('keeps the binding that another connection took when the first connection closes', async () => {
      const connections = mapCreateSessionConnections();
      const first = testConnection();
      const second = testConnection();
      connections.bind('session-1', first);
      connections.bind('session-1', second);
      first.close();
      await first.closed;
      assert.equal(connections.get('session-1'), second);
    });
  });

  describe('get', () => {
    it('returns undefined for a session that no connection serves', () => {
      assert.equal(mapCreateSessionConnections().get('session-1'), undefined);
    });
  });

  describe('list', () => {
    it('lists the bound sessions in the order of binding, a bound session again last', () => {
      const connections = mapCreateSessionConnections();
      const first = testConnection();
      connections.bind('session-1', first);
      connections.bind('session-2', testConnection());
      connections.bind('session-1', testConnection());
      assert.deepEqual(connections.list(), ['session-2', 'session-1']);
    });
  });
});
