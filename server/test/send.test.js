// sendOrDrop: a page that can't keep up is dropped before its backlog
// grows without limit; one that keeps up gets every message. The last test
// uses a real WebSocket whose reader stops reading, like a phone that
// lost its signal.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer, WebSocket } from "ws";
import { MAX_BACKLOG_BYTES, sendOrDrop } from "../send.js";

function fakeClient(bufferedAmount) {
  return {
    bufferedAmount,
    sent: [],
    terminated: false,
    send(payload) { this.sent.push(payload); },
    terminate() { this.terminated = true; },
  };
}

describe("sendOrDrop", () => {
  it("sends to a page that keeps up", () => {
    const client = fakeClient(0);
    assert.equal(sendOrDrop(client, "x"), true);
    assert.deepEqual(client.sent, ["x"]);
    assert.equal(client.terminated, false);
  });

  it("still sends right at the limit", () => {
    const client = fakeClient(MAX_BACKLOG_BYTES);
    assert.equal(sendOrDrop(client, "x"), true);
    assert.equal(client.terminated, false);
  });

  it("drops a page past the limit instead of queueing more", () => {
    const client = fakeClient(MAX_BACKLOG_BYTES + 1);
    assert.equal(sendOrDrop(client, "x"), false);
    assert.deepEqual(client.sent, []);
    assert.equal(client.terminated, true);
  });

  it("drops a real page that stops reading, and the backlog stops growing", async () => {
    const server = new WebSocketServer({ port: 0 });
    await new Promise((resolve) => server.on("listening", resolve));
    const reader = new WebSocket(`ws://localhost:${server.address().port}`);
    const [client] = await new Promise((resolve) => server.on("connection", (...args) => resolve(args)));
    await new Promise((resolve) => reader.on("open", resolve));
    reader._socket.pause(); // the phone stops reading

    const payload = "x".repeat(27 * 1024); // a whole TimingData, as before deltas
    let sent = 0;
    while (sendOrDrop(client, payload)) {
      sent++;
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(sent < 5000, "never dropped");
    }
    assert.ok(client.bufferedAmount <= MAX_BACKLOG_BYTES + payload.length * 2);
    reader.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
});
