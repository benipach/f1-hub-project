// Sending to a page without letting a slow one take the relay down.
//
// ws keeps in memory whatever a page hasn't received yet. A phone on a
// crowded network (at the track, say) can fall behind for good, and that
// backlog grows with no limit: on 8/11/2026, lap 28 of the Brazilian GP,
// the relay died with status 134 (Node out of memory, most likely) after
// ~40 minutes of whole topics at 10–20 messages a second.
//
// So once a page is this far behind, it's dropped. Its data is already
// stale by then; it reconnects on its own two seconds later (see connect()
// in js/live.js) and gets a fresh snapshot, so it jumps back to the present.
export const MAX_BACKLOG_BYTES = 2 * 1024 * 1024;

// Returns false when the page was dropped instead of sent to.
export function sendOrDrop(client, payload) {
  if (client.bufferedAmount > MAX_BACKLOG_BYTES) {
    console.log(`[local] dropping a page ${Math.round(client.bufferedAmount / 1024)} KB behind; it will reconnect`);
    client.terminate();
    return false;
  }
  client.send(payload);
  return true;
}
