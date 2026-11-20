// The homepage's summary (home.js): the same shape in every session, with
// what doesn't apply left null.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { homeSummary, startHomeChannel } from "../home.js";

const drivers = {
  1: { LastName: "Norris", TeamName: "McLaren", Tla: "NOR" },
  16: { LastName: "Leclerc", TeamName: "Ferrari", Tla: "LEC" },
  63: { LastName: "Russell", TeamName: "Mercedes", Tla: "RUS" },
};
const weather = { AirTemp: "13.9", TrackTemp: "21.4", WindSpeed: "1.1", WindDirection: "225", Rainfall: "0" };
const tyres = { Lines: { 1: { Stints: [{ Compound: "MEDIUM" }, { Compound: "SOFT" }] }, 16: { Stints: [{ Compound: "SOFT" }] }, 63: { Stints: [] } } };

describe("homeSummary", () => {
  it("gives nothing before the feed has a session", () => {
    assert.equal(homeSummary({}), null);
  });

  it("practice: the clock, cars on track, best laps and gaps to the fastest", () => {
    const s = homeSummary({
      SessionInfo: { Key: 11414, Name: "Practice 2", Type: "Practice" },
      SessionStatus: { Status: "Started" },
      ExtrapolatedClock: { Utc: "2026-11-20T04:20:00Z", Remaining: "00:41:52", Extrapolating: true },
      TrackStatus: { Status: "1" },
      WeatherData: weather,
      DriverList: drivers,
      TimingAppData: tyres,
      TimingData: { Lines: {
        1: { Position: "1", BestLapTime: { Value: "1:34.876" }, TimeDiffToFastest: "", InPit: false },
        16: { Position: "2", BestLapTime: { Value: "1:34.988" }, TimeDiffToFastest: "+0.112", InPit: true },
        63: { Position: "3", BestLapTime: { Value: "" }, TimeDiffToFastest: "", InPit: false, Retired: false },
      } },
    });
    assert.deepEqual(s.session, { key: 11414, name: "Practice 2", type: "practice", status: "Started" });
    assert.deepEqual(s.clock, { remaining: 2512, utc: "2026-11-20T04:20:00Z", running: true });
    assert.equal(s.part, null);
    assert.equal(s.lap, null);
    assert.equal(s.track, "green");
    assert.deepEqual(s.weather, { air: 13.9, track: 21.4, wind: 1.1, windDir: 225, rain: false });
    assert.deepEqual(s.fastest, { time: "1:34.876", name: "Norris" });
    assert.deepEqual(s.cars, { onTrack: 2, running: 3 });
    assert.deepEqual(s.rows.map((r) => [r.pos, r.name, r.team, r.time, r.gap, r.tyre, r.fastest]), [
      [1, "Norris", "McLaren", "1:34.876", "", "soft", true],
      [2, "Leclerc", "Ferrari", "1:34.988", "+0.112", "soft", false],
      [3, "Russell", "Mercedes", "", "", null, false],
    ]);
  });

  it("qualifying: the part, that part's best laps and who's out", () => {
    const s = homeSummary({
      SessionInfo: { Name: "Qualifying", Type: "Qualifying" },
      ExtrapolatedClock: { Utc: "2026-11-21T04:30:00Z", Remaining: "00:07:24", Extrapolating: false },
      TrackStatus: { Status: "5" },
      DriverList: drivers,
      TimingData: { SessionPart: 2, Lines: {
        16: { Position: "1", BestLapTimes: [{ Value: "1:33.100" }, { Value: "1:32.540" }], TimeDiffToFastest: "" },
        1: { Position: "2", BestLapTimes: [{ Value: "1:33.000" }, { Value: "1:32.627" }], TimeDiffToFastest: "+0.087" },
        63: { Position: "17", BestLapTimes: [{ Value: "1:34.000" }, { Value: "" }], KnockedOut: true },
      } },
    });
    assert.equal(s.part, 2);
    assert.equal(s.track, "red");
    assert.deepEqual(s.clock, { remaining: 444, utc: "2026-11-21T04:30:00Z", running: false });
    assert.deepEqual(s.rows.map((r) => [r.pos, r.time, r.gap, r.out]), [
      [1, "1:32.540", "", false],
      [2, "1:32.627", "+0.087", false],
      [17, "", "", true],
    ]);
    assert.deepEqual(s.fastest, { time: "1:32.540", name: "Leclerc" });
    assert.deepEqual(s.cars, { onTrack: 2, running: 2 });
  });

  it("race: the lap, intervals, the fastest lap of anyone, no clock nor cars", () => {
    const s = homeSummary({
      SessionInfo: { Name: "Race", Type: "Race" },
      LapCount: { CurrentLap: 34, TotalLaps: 50 },
      ExtrapolatedClock: { Utc: "x", Remaining: "01:10:00", Extrapolating: true },
      TrackStatus: { Status: "4" },
      DriverList: drivers,
      TimingData: { Lines: {
        63: { Position: "1", GapToLeader: "", IntervalToPositionAhead: { Value: "" }, BestLapTime: { Value: "1:35.990" } },
        1: { Position: "2", GapToLeader: "+1.842", IntervalToPositionAhead: { Value: "+1.842" }, BestLapTime: { Value: "1:35.802" } },
        16: { Position: "3", GapToLeader: "+4.949", IntervalToPositionAhead: { Value: "+3.107" }, BestLapTime: { Value: "1:36.100" } },
      } },
    });
    assert.deepEqual(s.lap, { current: 34, total: 50 });
    assert.equal(s.clock, null);
    assert.equal(s.cars, null);
    assert.equal(s.track, "sc");
    assert.deepEqual(s.rows.map((r) => [r.name, r.gap, r.fastest]), [["Russell", "", false], ["Norris", "+1.842", true], ["Leclerc", "+3.107", false]]);
    assert.deepEqual(s.fastest, { time: "1:35.802", name: "Norris" });
  });

  it("drops a car the feed left behind from the previous session (two cars on one line)", () => {
    const s = homeSummary({
      SessionInfo: { Name: "Practice 2", Type: "Practice" },
      DriverList: { ...drivers, 50: { LastName: "Hirakawa", TeamName: "Haas F1 Team" } },
      TimingData: { Lines: {
        1: { Line: 1, NumberOfLaps: 12, BestLapTime: { Value: "1:50.930" } },
        50: { Line: 2, BestLapTime: { Value: "" } },
        81: { Line: 2, NumberOfLaps: 10, BestLapTime: { Value: "1:51.482" }, TimeDiffToFastest: "+0.552" },
      } },
    });
    assert.deepEqual(s.rows.map((r) => [r.pos, r.number]), [[1, 1], [2, 81]]);
    assert.deepEqual(s.cars, { onTrack: 2, running: 2 });
  });

  it("a sprint is a race", () => {
    assert.equal(homeSummary({ SessionInfo: { Name: "Sprint", Type: "Race" } }).session.type, "race");
    assert.equal(homeSummary({ SessionInfo: { Name: "Sprint Qualifying", Type: "Qualifying" } }).session.type, "quali");
  });
});

describe("startHomeChannel", () => {
  it("sends only when the summary changed, and nothing without pages", async () => {
    const state = { SessionInfo: { Name: "Practice 1", Type: "Practice" } };
    const sent = [];
    let pages = [];
    const channel = startHomeChannel({ getState: () => state, clients: () => pages, send: (_c, text) => sent.push(text), everyMs: 10 });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(sent.length, 0);
    pages = [{}];
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(sent.length, 1);
    state.TrackStatus = { Status: "2" };
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(sent.length, 2);
    assert.equal(JSON.parse(sent[1]).data.track, "yellow");
    channel.stop();
  });
});
