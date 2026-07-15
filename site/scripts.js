// Minimal enhancements: mobile nav toggle, scroll reveal, current-year.
(function () {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  if (toggle && header) {
    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.querySelectorAll('.nav-links a').forEach(a =>
      a.addEventListener('click', () => header.classList.remove('open'))
    );
  }

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    : null;

  document.querySelectorAll('.reveal').forEach(el => {
    if (io) io.observe(el);
    else el.classList.add('in');
  });

  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
