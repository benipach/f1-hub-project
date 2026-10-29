// English, the site's base language: every other locale must have the same
// keys (Dict in ./index.ts is derived from this file, so a missing or extra
// key fails `astro check`).
//
// "{name}" placeholders are filled by fill(); { one, other } entries are
// plurals, picked with Intl.PluralRules by plural(). Keep values plain strings
// (no functions): the hero's browser script gets part of this as JSON.

export default {
    meta: {
        skip: 'Skip to content',
    },

    // Section names, in the site's one order (DESIGN.md, "Site sections")
    sections: {
        calendar: 'Calendar',
        live: 'Live',
        liveNow: 'now',
        liveTiming: 'Live timing',
        results: 'Results',
        championship: 'Championship',
        drivers: 'Drivers',
        teams: 'Teams',
        archive: 'Archive',
        hallOfFame: 'Hall of Fame',
        soon: 'Soon',
    },

    nav: {
        home: 'F1 Hub, home',
        season: 'Season {year}',
        main: 'Main',
        openMenu: 'Open menu',
        closeMenu: 'Close menu',
        language: 'Language',
    },

    footer: {
        tagline: 'Every Grand Prix in one place: the calendar in your local time, live timing, full results and standings, driver and team profiles. Made by a fan, for fans.',
        timesIn: 'All times shown in',
        localTime: 'your local time',
        label: 'Footer',
        season: 'Season',
        grid: 'The Grid',
        history: 'History',
        resources: 'Resources',
        legal1: 'Unofficial fan project. F1 Hub is not associated in any way with the Formula 1 companies, the FIA or any Formula 1 team. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trade marks of Formula One Licensing B.V.',
        legal2: 'Team names, logos, driver images and other trademarks shown on this site belong to their respective owners. Data comes in part from OpenF1 and is provided for information only, without any guarantee of accuracy.',
        builtBy: 'Designed & built by',
        portfolio: 'Portfolio',
        backToTop: 'Back to top',
    },

    // Session names, by the data's session key
    sessions: {
        fp1: 'Practice 1',
        fp2: 'Practice 2',
        fp3: 'Practice 3',
        sprintQualy: 'Sprint Qualifying',
        sprintRace: 'Sprint',
        qualifying: 'Qualifying',
        race: 'Race',
    },

    // A driver's race outcome after the winner's time
    outcome: {
        lapped: { one: '+{n} Lap', other: '+{n} Laps' },
        dnf: 'DNF',
        dns: 'DNS',
        dsq: 'DSQ',
    },

    table: {
        pos: 'Pos',
        driver: 'Driver',
        team: 'Team',
        gap: 'Gap',
        grid: 'Grid',
        gained: '+/−',
        fastestLapShort: 'FL',
        fastestLap: 'Fastest lap',
        leader: 'Leader',
        fastest: 'Fastest',
    },

    hero: {
        // Upcoming
        nextRace: 'Next race',
        raceWeekend: 'Race weekend',
        raceFinished: 'Race finished',
        roundOf: 'Round {round} / {rounds}',
        kicker: 'Formula 1 · Round {round}',
        sprintWeekend: 'Sprint weekend',
        kmLap: 'km lap',
        turns: 'turns',
        laps: 'laps',
        lapRecord: 'Lap record',
        nextSession: 'Next session',
        startsIn: 'starts in',
        days: 'Days',
        hours: 'Hours',
        minutes: 'Minutes',
        seconds: 'Seconds',
        weekendComplete: 'Weekend complete',
        resultsOnTheWay: 'Results on the way',
        timetable: 'Timetable',
        yourTime: 'Your time',
        local: 'local',
        race: 'Race',
        lightsOutIn: 'Lights out in',
        done: 'Done',
        gpGuide: 'Grand Prix guide',
        // Live
        liveNow: 'Live now',
        liveWord: 'Live',
        // The giant line: the order of the two words ("LIVE RACE", "CARRERA EN VIVO")
        liveLine: '{live} {session}',
        ends: 'Ends',
        weekend: 'The weekend',
        // The weekend's cells on a phone
        sessionShort: { fp1: 'P1', fp2: 'P2', fp3: 'P3', sprintQualy: 'SQ', sprintRace: 'Sprint', qualifying: 'Quali', race: 'Race' },
        watchLive: 'Watch live timing',
        watchLiveText: 'Positions, gaps, sectors and tyres',
        top10: 'Top 10',
        preview: 'Preview',
        upNext: 'Up next',
        timetableLink: 'Weekend timetable',
        // Result
        raceResult: 'Race result',
        winner: 'Winner',
        raceTime: 'Race time',
        started: 'Started',
        fromGrid: 'from P{grid}',
        positions: 'Positions 4–{last}',
        fullClassification: 'Full classification',
        allResults: 'All results',
    },

    // Written by the hero's browser script (hero-state.ts)
    live: {
        // The live hero: its heading, the readout over the progress bar and
        // the bar's scale
        inProgress: '{session} in progress · {gp}',
        yourTime: 'Your time · {zone}',
        lightsOut: 'Lights out',
        started: 'Started',
        ago: '{t} ago',
        inTime: 'in {t}',
        minutes: '{m} min',
        hoursMinutes: '{h} h {m} min',
        lap: 'Lap',
        lapN: 'Lap {n}',
        toGo: '{n} to go',
        raceTime: 'Race time',
        partLeft: '{part} · time left',
        partOf: 'Part {n} of {total}',
        partNext: '{part} next · starts in',
        partDone: '{part} complete',
        sessionClock: 'Session clock',
        sessionLength: '{m} min session',
        gapToLeader: 'Gap to leader',
        bestLap: 'Best lap',
        raceResult: 'Race result',
        afterFlag: 'Here, after the flag',
        srCountdown: '{session} starts in {d} days, {h} hours and {m} minutes',
        inDays: { one: 'In {n} day', other: 'In {n} days' },
        next: 'Next',
        thisWeekend: 'This weekend',
        // Countdown units: "2mo 05d", "17d 04h", "04h 12m"
        unitMonth: 'mo',
        unitDay: 'd',
        unitHour: 'h',
        unitMinute: 'm',
    },

    calendar: {
        sectionNo: '01 — Calendar',
        season: 'Season',
        total: 'Total',
        raced: 'Raced',
        /** A cancelled round's own cell (singular in some languages) */
        cancelledRound: 'Cancelled',
        toGo: 'To go',
        sprint: 'Sprint',
        winner: 'Winner',
        // The round card's fields (DESIGN.md, Calendar)
        lapKm: 'Lap km',
        lightsOutIn: 'Lights out in',
        status: 'Status',
        noLayout: 'No layout',
        legend: 'Sprint = sprint weekend · Dates in your local time',
        archive: 'Seasons archive',
        // The round cells break the name around this phrase: "Chinese / Grand Prix"
        gpPhrase: 'Grand Prix',
    },

    standings: {
        sectionNo: '02 — Championship',
        // The soft hyphen (U+00AD) lets the title break as "STAND-INGS"
        title: 'Stand­ings',
        after: 'After Round {round} of {rounds}.',
        summary: '{driver} leads by {points} with {rounds} to go; {team} are {lead} clear in the constructors’.',
        points: { one: '{n} point', other: '{n} points' },
        rounds: { one: '{n} round', other: '{n} rounds' },
        drivers: 'Drivers, top three',
        pack: 'The chasing pack · P4–P10',
        all: 'All {n} drivers',
        constructors: 'Constructors',
        teams: 'Teams',
        pts: 'pts',
        wins: { one: 'Win', other: 'Wins' },
        podiums: 'Podiums',
        behind: 'Behind',
        lead: 'Lead',
        full: 'Full standings',
    },

    explore: {
        sectionNo: '03 — Explore',
        title: 'Index',
        intro: 'Everything on F1 Hub: live timing, results, standings, profiles and the history of the sport.',
        live: 'Positions, gaps, sectors and tyres from F1’s official feed.',
        results: 'Race, sprint and qualifying classifications, round by round.',
        championship: 'Drivers’ and constructors’ standings after every round.',
        drivers: 'Profiles, numbers and career records of the grid.',
        teams: 'The constructors: line-ups, cars and history.',
        archive: 'The history of the championship, season by season.',
        hallOfFame: 'The greats of the sport, in one place.',
    },
} as const;
