// ── ENTRANCE ANIMATIONS: from the hero to the end of the content ──
//
// All of the page's content is injected by other scripts when the data
// arrives, so it can't be marked in the HTML. A MutationObserver takes each
// element as soon as it appears (before it's painted, so it doesn't flicker) and keeps it
// hidden; an IntersectionObserver animates it when it scrolls into view.
//
// Elements entering at the same moment do so in a cascade, in DOM order
// (--delay, each one's delay). Numbers count up from 0, bars
// grow and the season chart's lines are drawn from left to
// right.
//
// Once the entrance is done the classes are removed: each element goes back to its own
// transitions (card hovers don't keep the duration from here).

(function(){
    if(!('IntersectionObserver' in window)) return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const DURATION = 700;   // same as the .reveal transition in driver.css
    const STEP = 90;        // delay between one element and the next in the cascade
    const MAX_STEPS = 12;   // cap: a long list doesn't make the last items wait too long

    // What gets animated and how. The cascade order comes from the DOM, not this list.
    const TARGETS = [
        // Hero
        ['.driver-hero-photo', 'zoom'],
        ['.driver-hero-edge, .driver-hero-panel', 'wipe'],
        ['.driver-hero-id, .driver-hero-first, .driver-hero-last, .driver-hero-crown, .driver-hero-stats > div, .driver-hero-since', 'rise'],
        ['.driver-hero-numbox', 'left'],
        // Section titles
        ['.section-title', 'title'],
        // Driver info
        ['.driver-info-visual', 'zoom'],
        ['.driver-info-head, .driver-info-tiles > div', 'rise'],
        ['.driver-info-teams li', 'left'],
        // Temporada
        ['.season-band-cell, .season-racecraft-badge, .season-form, .season-table-wrap', 'rise'],
        ['.season-table tbody tr', 'rise'],
        // Career stats
        ['.career-champion-mark', 'pop'],
        ['.career-champion-title, .career-champion-year, .career-crown-label, .career-stat, .career-board-wrap', 'rise'],
        // Career journey
        ['.jr-ribbon-head', 'rise'],
        ['.jr-year', 'drop'],
        ['.jr-era-id', 'left'],
        ['.jr-stats > div, .jr-moment', 'rise'],
    ];

    // Numbers that count up from 0 when the block containing them appears.
    const COUNTERS = [
        '.driver-hero-stats dd',
        '.driver-hero-crown-count span',
        '.season-band-pos',
        '.season-band-pts',
        '.career-champion-count',
        '.career-stat-value',
        '.jr-stats dd',
    ].join(', ');

    const io = new IntersectionObserver(entries => {
        for(const e of entries){
            if(!e.isIntersecting) continue;
            io.unobserve(e.target);
            enqueue(e.target);
        }
    // By visible ratio and not a fixed margin: with a margin, whatever sits
    // at the very end of the page (the bottom of the footer) never got to enter.
    }, { threshold: 0.15 });

    // The hero doesn't go through the observer: it's always the first thing you see, and its
    // texts are inside the panel revealed with clip-path; while
    // the clip didn't uncover them, the observer considered them invisible and
    // released them in batches, out of order.
    const HERO = '#driverHero';

    function tag(scope){
        for(const [sel, variant] of TARGETS){
            const found = scope.matches?.(sel) ? [scope] : [];
            found.push(...scope.querySelectorAll(sel));
            for(const el of found){
                if(el.dataset.reveal) continue;
                el.dataset.reveal = variant;
                el.classList.add('reveal');
                if(el.closest(HERO)) enqueue(el);
                else io.observe(el);
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

        if(el.classList.contains('season-form')) replayChart(el, delay);

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
    // isn't lost (the "×" in titles goes in an <i>). Respects prefixes ("P3"),
    // thousands separators and decimals ("5,217.5").
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

    // The chart lines are drawn from left to right (chart.$drawIn is
    // defined by driver-season.js). If the chart doesn't exist yet (it waits for the
    // fonts), driver-season.js draws it by itself when it's created.
    function replayChart(el, delay){
        const canvas = el.querySelector('canvas');
        const chart = canvas && window.Chart?.getChart(canvas);
        chart?.$drawIn?.(delay);
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
