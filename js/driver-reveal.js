// ── ANIMACIONES DE ENTRADA — del hero al final del contenido ──
//
// Todo el contenido de la página lo inyectan otros scripts cuando llegan los
// datos, así que no se puede marcar en el HTML. Un MutationObserver toma cada
// elemento apenas aparece (antes de que se pinte, así no parpadea) y lo deja
// oculto; un IntersectionObserver lo anima cuando entra en pantalla.
//
// Los que entran en el mismo momento lo hacen en cascada, en el orden del DOM
// (--delay, la demora de cada uno). Las cifras cuentan desde 0, las barras
// crecen y las líneas del gráfico de la temporada se trazan de izquierda a
// derecha.
//
// Terminada la entrada se quitan las clases: cada elemento vuelve a sus propias
// transiciones (los hover de las tarjetas no quedan con la duración de acá).

(function(){
    if(!('IntersectionObserver' in window)) return;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const DURATION = 700;   // igual que la transición de .reveal en driver.css
    const STEP = 90;        // demora entre un elemento y el siguiente de la cascada
    const MAX_STEPS = 12;   // tope: una lista larga no hace esperar de más al final

    // Qué se anima y cómo. El orden de la cascada lo da el DOM, no esta lista.
    const TARGETS = [
        // Hero
        ['.driver-hero-photo', 'zoom'],
        ['.driver-hero-edge, .driver-hero-panel', 'wipe'],
        ['.driver-hero-id, .driver-hero-first, .driver-hero-last, .driver-hero-crown, .driver-hero-stats > div, .driver-hero-since', 'rise'],
        ['.driver-hero-numbox', 'left'],
        // Títulos de sección
        ['.section-title', 'title'],
        // Driver info
        ['.driver-info-visual', 'zoom'],
        ['.driver-info-head, .driver-info-tiles > div', 'rise'],
        ['.driver-info-teams li', 'left'],
        // Temporada
        ['.season-band-cell, .season-racecraft-badge, .season-form, .season-table-wrap', 'rise'],
        ['.season-table tbody tr', 'rise'],
        // Estadísticas de carrera
        ['.career-champion-mark', 'pop'],
        ['.career-champion-title, .career-champion-year, .career-crown-label, .career-stat, .career-board-wrap', 'rise'],
        // Career journey
        ['.jr-ribbon-head', 'rise'],
        ['.jr-year', 'drop'],
        ['.jr-era-id', 'left'],
        ['.jr-stats > div, .jr-moment', 'rise'],
    ];

    // Cifras que cuentan desde 0 cuando aparece el bloque que las contiene.
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
    // Por proporción visible y no con un margen fijo: con margen, lo que está
    // pegado al final de la página (el pie del footer) nunca llegaba a entrar.
    }, { threshold: 0.15 });

    // El hero no pasa por el observer: siempre es lo primero que se ve, y sus
    // textos están dentro del panel que se despliega con clip-path — mientras
    // el recorte no los destapa, el observer los da por invisibles y los iba
    // soltando de a tandas, fuera de orden.
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

    // Cascada con reloj propio: cada elemento sale STEP ms después del anterior,
    // aunque lleguen en tandas distintas (una tanda no reinicia la cuenta y
    // pisa a la anterior). Dentro de una tanda manda el orden del DOM.
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
            // Un frame con el estado oculto ya pintado, así la transición arranca.
            requestAnimationFrame(() => show(el, delay));
        }
    }

    function show(el, delay){
        el.classList.add('is-in');

        // Sólo las cifras cuyo bloque animado más cercano es este.
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

    // Cuenta sobre el primer nodo de texto con número, así no se pierde el marcado
    // de al lado (el "×" de los títulos va en un <i>). Respeta prefijos ("P3"),
    // separadores de miles y decimales ("5,217.5").
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

    // Las líneas del gráfico se trazan de izquierda a derecha (chart.$drawIn lo
    // define driver-season.js). Si el gráfico todavía no existe (espera a las
    // fuentes), driver-season.js lo traza solo al crearlo.
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
