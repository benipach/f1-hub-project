// Requests to the APIs the data scripts use (OpenF1, Jolpica, formula1.com):
// spaced out so they stay within each one's rate limit, and retried, with
// growing pauses, when the server asks to slow down (429) or fails (5xx).

const RETRIES = 5;
const BACKOFF_MS = 1000;

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A fetch whose requests start at least `gapMs` apart.
export function spacedFetch(gapMs: number) {
    let nextStart = 0;
    return async function request(url: string, init?: RequestInit): Promise<Response> {
        for (let attempt = 0; ; attempt++) {
            const wait = nextStart - Date.now();
            nextStart = Math.max(Date.now(), nextStart) + gapMs;
            if (wait > 0) await sleep(wait);

            const res = await fetch(url, init);
            if ((res.status !== 429 && res.status < 500) || attempt === RETRIES) return res;
            const retryAfter = Number(res.headers.get('retry-after'));
            const delay = retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS * 2 ** attempt + Math.random() * BACKOFF_MS;
            console.warn(`⏳ ${res.status} on ${url}, retry ${attempt + 1}/${RETRIES} in ${Math.round(delay)}ms`);
            await sleep(delay);
        }
    };
}
