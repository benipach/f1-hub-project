// shared/season-picker.js: the year dropdown (driver page's Season stats
// title, the Results page's sticky bar).
//
// A button + listbox instead of a <select>: a native select can't animate
// its list or flip the chevron while it's open. Keyboard: Enter/Space/↓
// open it, ↑/↓ move, Enter/Space pick, Esc or Tab close. The look lives in
// style.css (.season-picker).
//
// Markup it expects (spans, not a <ul>, because it lives inside a heading):
//   <span class="season-picker">
//       <button type="button" class="season-picker-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Season" disabled>
//           <span class="season-picker-value">2026</span>
//           <svg class="season-picker-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg>
//       </button>
//       <span class="season-picker-list" role="listbox" aria-label="Season"></span>
//   </span>
//
// Classic script (defines globals), like shared/gp.js and shared/teams.js.

// Returns { setYear(year) }: shows another year without calling onChange,
// for when the year is changed from elsewhere on the page.
function setupSeasonPicker(picker, years, initial, onChange) {
    if (!picker) return { setYear() {} };
    const btn = picker.querySelector('.season-picker-btn');
    const value = picker.querySelector('.season-picker-value');
    const list = picker.querySelector('.season-picker-list');
    let current = initial;

    list.innerHTML = years.map(y =>
        `<span class="season-picker-option" role="option" tabindex="-1" data-year="${y}" aria-selected="${y === initial}">${y}</span>`
    ).join('');
    value.textContent = initial;

    const options = [...list.querySelectorAll('.season-picker-option')];
    const setYear = year => {
        current = year;
        value.textContent = year;
        options.forEach(o => o.setAttribute('aria-selected', String(Number(o.dataset.year) === year)));
    };

    btn.disabled = years.length < 2;
    if (btn.disabled) return { setYear };

    const isOpen = () => picker.classList.contains('is-open');

    function open() {
        picker.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
        const selected = options.find(o => Number(o.dataset.year) === current) || options[0];
        selected.scrollIntoView({ block: 'nearest' });
        selected.focus({ preventScroll: true });
    }

    function close(refocus = true) {
        if (!isOpen()) return;
        picker.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
        if (refocus) btn.focus();
    }

    function pick(option) {
        const year = Number(option.dataset.year);
        close();
        if (year === current) return;
        setYear(year);
        onChange(year);
    }

    btn.addEventListener('click', () => isOpen() ? close() : open());
    btn.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' && !isOpen()) { e.preventDefault(); open(); }
    });

    list.addEventListener('click', e => {
        const option = e.target.closest('.season-picker-option');
        if (option) pick(option);
    });

    list.addEventListener('keydown', e => {
        const i = options.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = options[Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), options.length - 1)];
            next.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (i >= 0) pick(options[i]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'Tab') {
            close(false);
        }
    });

    document.addEventListener('click', e => {
        if (!picker.contains(e.target)) close(false);
    });

    return { setYear };
}
