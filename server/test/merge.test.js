// mergeState: how a feed delta lands on the relay's state. The cases are
// the shapes F1 actually sends (nested deltas, lists sent whole, list
// items sent as indexed objects), so a change that breaks one of them
// shows up here before a race weekend.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeState } from "../../js/shared/merge.js";

describe("mergeState", () => {
  it("merges a nested delta and keeps the fields it doesn't mention", () => {
    const state = { Lines: { 44: { GapToLeader: "+1.2", Position: "3" } } };
    mergeState(state, { Lines: { 44: { GapToLeader: "+0.9" } } });
    assert.deepEqual(state, { Lines: { 44: { GapToLeader: "+0.9", Position: "3" } } });
  });

  it("adds keys that weren't there", () => {
    const state = { Lines: { 44: { Position: "3" } } };
    mergeState(state, { Lines: { 1: { Position: "1" } } });
    assert.deepEqual(state, { Lines: { 44: { Position: "3" }, 1: { Position: "1" } } });
  });

  it("merges an indexed-object delta onto a list and keeps the tyre compound", () => {
    // Snapshot sends Stints as a list; deltas address items by index.
    const state = { Stints: [{ Compound: "SOFT", TotalLaps: 3 }] };
    mergeState(state, { Stints: { 0: { TotalLaps: 4 } } });
    assert.deepEqual(state, { Stints: [{ Compound: "SOFT", TotalLaps: 4 }] });
  });

  it("appends a new list item sent as an indexed object", () => {
    const state = { Stints: [{ Compound: "SOFT", TotalLaps: 18 }] };
    mergeState(state, { Stints: { 1: { Compound: "HARD", TotalLaps: 0 } } });
    assert.deepEqual(state.Stints, [
      { Compound: "SOFT", TotalLaps: 18 },
      { Compound: "HARD", TotalLaps: 0 },
    ]);
  });

  it("replaces a list sent whole, without leftovers when it gets shorter", () => {
    const state = { Messages: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    mergeState(state, { Messages: [{ id: 9 }] });
    assert.deepEqual(state, { Messages: [{ id: 9 }] });
  });

  it("overwrites with null and with plain values", () => {
    const state = { a: { b: 1 }, c: "x" };
    mergeState(state, { a: null, c: 2 });
    assert.deepEqual(state, { a: null, c: 2 });
  });

  it("puts an object where there was a plain value", () => {
    const state = { a: 1 };
    mergeState(state, { a: { b: 2 } });
    assert.deepEqual(state, { a: { b: 2 } });
  });

  it("changes the target in place and returns it", () => {
    const state = { a: 1 };
    assert.equal(mergeState(state, { b: 2 }), state);
  });
});
