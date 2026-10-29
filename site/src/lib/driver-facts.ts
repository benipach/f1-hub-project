// Personal facts that aren't in data/ yet (drivers.json has name, birth date
// and nationality only). Written by hand for the four drivers of the mockup
// (_design/driver/index.html, 18/10); the owner decides later where they go
// in data/. A driver without an entry shows the parts that come from data/
// and leaves these cells out. Kept in English: they're names and titles.

export type DriverFacts = {
    readonly fullName?: string;
    readonly birthplace?: string;
    readonly deathPlace?: string;
    /** Before F1: [year, result] */
    readonly junior?: readonly (readonly [string, string])[];
    /** Beyond F1: [year, result] */
    readonly beyond?: readonly (readonly [string, string])[];
};

export const DRIVER_FACTS: Readonly<Record<string, DriverFacts>> = {
    'lando-norris': {
        fullName: 'Lando Norris',
        birthplace: 'Bristol, England',
        junior: [['2016', 'Toyota Racing Series champion'], ['2016', 'Formula Renault Eurocup champion'], ['2017', 'FIA Formula 3 European champion'], ['2018', 'Formula 2 runner-up']],
    },
    'fernando-alonso': {
        fullName: 'Fernando Alonso Díaz',
        birthplace: 'Oviedo, Asturias, Spain',
        junior: [['1999', 'Euro Open by Nissan champion'], ['2000', 'Formula 3000, 4th']],
        // The 2018–19 WEC was one "super season" (May 2018 to June 2019, two Le
        // Mans): one title, named after both years
        beyond: [['2018', 'Le Mans 24 Hours winner'], ['2018–19', 'World Endurance champion'], ['2019', 'Daytona 24 Hours winner'], ['2019', 'Le Mans 24 Hours winner']],
    },
    'ayrton-senna': {
        fullName: 'Ayrton Senna da Silva',
        birthplace: 'São Paulo, Brazil',
        deathPlace: 'Imola, Italy (San Marino Grand Prix)',
        junior: [['1981', 'British Formula Ford 1600 champion'], ['1982', 'British and European Formula Ford 2000 champion'], ['1983', 'British Formula 3 champion']],
    },
    'kimi-antonelli': {
        fullName: 'Andrea Kimi Antonelli',
        birthplace: 'Bologna, Italy',
        junior: [['2022', 'Italian F4 champion'], ['2022', 'ADAC F4 champion'], ['2023', 'Formula Regional Middle East champion'], ['2023', 'Formula Regional European champion']],
    },
};
