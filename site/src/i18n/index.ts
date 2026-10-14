// The site's languages (_design/DESIGN.md, "Languages"). English is the base
// and lives at the root, without a prefix (/drivers/…); every other locale
// gets its own prefix (/es/…), set in astro.config.ts.
//
// Adding a language (the steps are in DESIGN.md, "Languages"): write its
// dictionary (es.ts, `export default { … } satisfies Dict`, so a missing key
// fails the type check), add it to LOCALES, DICTIONARIES and INTL_TAGS and to
// `i18n.locales` in astro.config.ts, then give each page a src/pages/[lang]/
// twin and make internal links keep the locale. Components read the page's
// locale from Astro.currentLocale, so they need no changes.
import { href } from '../lib/paths';
import en from './en';
import es from './es';
import { fill } from './fill';

export { fill };

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language named in itself, so a visitor finds their own. */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

/** Path of a page in a locale: localePath('es', 'home-preview/') → "/f1-hub-project/es/home-preview/". */
export function localePath(locale: Locale, path: string): string {
    const clean = path.replace(/^\//, '');
    return href(locale === DEFAULT_LOCALE ? clean : `${locale}/${clean}`);
}

/** A page's path inside the site with no locale: "/f1-hub-project/es/home-preview/" → "home-preview/". */
export function pathWithoutLocale(pathname: string): string {
    const inSite = pathname.replace(/^\//, '').slice(href('').replace(/^\//, '').length);
    const [first, ...rest] = inSite.split('/');
    return (LOCALES as readonly string[]).includes(first ?? '') ? rest.join('/') : inSite;
}

/** en.ts's shape with plain strings: what every dictionary must match. */
type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dict = Widen<typeof en>;
export type Plural = { readonly one: string; readonly other: string };

const DICTIONARIES: Record<Locale, Dict> = { en, es };

/** The BCP 47 tag for Intl: dates, numbers and plural rules. */
const INTL_TAGS: Record<Locale, string> = { en: 'en-GB', es: 'es' };

/** The locale of a page (Astro.currentLocale), falling back to English. */
export function toLocale(value: string | undefined): Locale {
    return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}

/** The part of a dictionary the hero's browser script needs, sent as JSON. */
function heroWords(t: Dict) {
    return {
        ...t.live,
        nextRace: t.hero.nextRace,
        raceWeekend: t.hero.raceWeekend,
        raceFinished: t.hero.raceFinished,
        liveNow: t.hero.liveNow,
        resultsOnTheWay: t.hero.resultsOnTheWay,
        weekendComplete: t.hero.weekendComplete,
        done: t.hero.done,
        leader: t.table.leader,
        lightsOutIn: t.calendar.lightsOutIn,
        fastest: t.table.fastest,
    };
}
export type HeroWords = ReturnType<typeof heroWords>;

/** Everything a component needs for one locale. */
export function useI18n(value: string | undefined) {
    const locale = toLocale(value);
    const intl = INTL_TAGS[locale];
    const rules = new Intl.PluralRules(intl);
    return {
        locale,
        /** The dictionary. */
        t: DICTIONARIES[locale],
        /** The Intl tag, for date and number formats. */
        intl,
        fill,
        /** The words the hero's browser script writes (hero-state.ts). */
        heroWords: () => heroWords(DICTIONARIES[locale]),
        /** The right plural form, filled: plural(t.standings.points, 3) → "3 points". */
        plural: (forms: Plural, n: number, values: Record<string, string | number> = {}) =>
            fill(rules.select(n) === 'one' ? forms.one : forms.other, { n, ...values }),
    };
}
