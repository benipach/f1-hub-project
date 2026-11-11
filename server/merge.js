/**
 * Recursively merges a partial update into the local state.
 * F1's feed sends deltas: only the fields that changed, nested
 * the same way as the full snapshot (e.g. Lines["44"].GapToLeader).
 * Arrays are replaced wholesale (F1 doesn't send array deltas).
 */
export function mergeState(target, patch) {
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    const current = target[key];

    // CAREFUL with arrays: F1 sends some collections as arrays in the
    // initial snapshot (e.g. TimingAppData.Lines[n].Stints = [{Compound:
    // "SOFT", ...}]) and their deltas as indexed objects ({"0": {TotalLaps:
    // 4}}). The previous version excluded arrays from the merge, so the
    // first delta REPLACED the whole stint and the Compound was lost,
    // which is why tyres showed up as "unknown" in the table.
    // Now an object patch is also merged onto an array (numeric indexes
    // work the same as keys); only a patch that IS an array
    // replaces it outright, which is how F1 sends complete lists.
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object"
    ) {
      mergeState(current, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}
