// ── HERO ENTRANCE ──
//
// The hero is injected by driver-header.js when the data arrives, so it
// can't be marked in the HTML. A MutationObserver takes each element as soon
// as it appears (before it's painted, so it doesn't flicker), keeps it hidden
// and animates it in.
//
// Elements entering at the same moment do so in a cascade, in DOM order
// (--delay, each one's delay), and the numbers count up from 0.
//
// Once the entrance is done the classes are removed: each element goes back to its own
// transitions.

(function(){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const DURATION = 700;   // same as the .reveal transition in driver.css
    const STEP = 90;        // delay between one element and the next in the cascade
    const MAX_STEPS = 12;   // cap: a long list doesn't make the last items wait too long

    // What gets animated and how. The cascade order comes from the DOM, not this list.
    const TARGETS = [
        ['.driver-hero-photo', 'zoom'],
        ['.driver-hero-edge, .driver-hero-panel', 'wipe'],
        ['.driver-hero-id, .driver-hero-first, .driver-hero-last, .driver-hero-crown, .driver-hero-stats > div, .driver-hero-since', 'rise'],
        ['.driver-hero-numbox', 'left'],
    ];

    // Numbers that count up from 0 when the block containing them appears.
    const COUNTERS = [
        '.driver-hero-stats dd',
        '.driver-hero-crown-count span',
    ].join(', ');

    const HERO = '#driverHero';

    function tag(scope){
        for(const [sel, variant] of TARGETS){
            const found = scope.matches?.(sel) ? [scope] : [];
            found.push(...scope.querySelectorAll(sel));
            for(const el of found){
                if(el.dataset.reveal || !el.closest(HERO)) continue;
                el.dataset.reveal = variant;
                el.classList.add('reveal');
                enqueue(el);
            }
        }
    }

    // A cascade with its own clock: each element comes out STEP ms after the previous one,
    // even if they arrive in different batches (a batch doesn't restart the count and
    // override the previous one). Within a batch, DOM order wins.
    let queue = [];
    let clock = 0;

    function enqueue(el){
        if(!queue.length) requestAnimationFrame(flush);
        queue.push(el);
    }

    function flush(){
        const batch = queue.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
        queue = [];
        const now = performance.now();
        for(const el of batch){
            const slot = Math.max(now, clock);
            const delay = Math.min(slot - now, MAX_STEPS * STEP);
            clock = slot + STEP;
            el.style.setProperty('--delay', `${Math.round(delay)}ms`);
            // One frame with the hidden state already painted, so the transition starts.
            requestAnimationFrame(() => show(el, delay));
        }
    }

    function show(el, delay){
        el.classList.add('is-in');

        // Only the numbers whose closest animated block is this one.
        const counters = [...el.querySelectorAll(COUNTERS)];
        if(el.matches(COUNTERS)) counters.push(el);
        counters
            .filter(n => n.closest('[data-reveal]') === el)
            .forEach(n => countUp(n, delay));

        const done = () => {
            el.classList.remove('reveal', 'is-in');
            el.style.removeProperty('--delay');
        };
        const onEnd = e => {
            if(e.target !== el || e.pseudoElement) return;
            el.removeEventListener('transitionend', onEnd);
            clearTimeout(fallback);
            done();
        };
        el.addEventListener('transitionend', onEnd);
        const fallback = setTimeout(() => { el.removeEventListener('transitionend', onEnd); done(); }, delay + DURATION + 200);
    }

    // Counts on the first text node with a number, so the markup next to it
    // isn't lost. Respects prefixes ("P3"), thousands separators and
    // decimals ("5,217.5").
    function countUp(node, delay){
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text;
        while((text = walker.nextNode()) && !/\d/.test(text.nodeValue)){}
        if(!text) return;

        const m = /^(\D*)([\d,]+(?:\.(\d+))?)(\D*)$/.exec(text.nodeValue);
        if(!m) return;
        const [, before, raw, decimals = '', after] = m;
        const target = Number(raw.replace(/,/g, ''));
        if(!target) return;
        const useCommas = raw.includes(',') || target >= 1000;
        const format = v => before + (useCommas
            ? v.toLocaleString('en-US', { minimumFractionDigits: decimals.length, maximumFractionDigits: decimals.length })
            : v.toFixed(decimals.length)) + after;

        text.nodeValue = format(0);
        const easeOut = t => 1 - Math.pow(1 - t, 3);
        let start = null;
        const tick = now => {
            if(start === null) start = now + delay;
            const t = Math.min(Math.max((now - start) / DURATION, 0), 1);
            const v = target * easeOut(t);
            text.nodeValue = format(decimals ? v : Math.round(v));
            if(t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    tag(document.body);
    new MutationObserver(records => {
        for(const r of records){
            for(const n of r.addedNodes){
                if(n.nodeType === 1) tag(n);
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
})();
