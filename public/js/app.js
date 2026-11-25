// Menu mobile, champs conditionnels des formulaires, confirmations.
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Formulaire élève : champs "parent" et "moins de 15 ans".
  const form = document.querySelector('[data-signup]');
  if (form) {
    const birth = form.querySelector('[data-age-check]');
    const radios = form.querySelectorAll('[data-toggle-parent]');
    const parentOnly = form.querySelectorAll('[data-parent-only]');
    const minorOnly = form.querySelectorAll('[data-minor-only]');
    const update = () => {
      const isParent = form.querySelector('[data-toggle-parent]:checked')?.value === 'parent';
      parentOnly.forEach((el) => { el.hidden = !isParent; });
      let minor = false;
      if (birth && birth.value) {
        const d = new Date(birth.value);
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
        minor = age < 15;
      }
      minorOnly.forEach((el) => { el.hidden = isParent || !minor; });
    };
    radios.forEach((r) => r.addEventListener('change', update));
    if (birth) birth.addEventListener('change', update);
    update();
  }

  document.querySelectorAll('form[data-confirm]').forEach((f) => {
    f.addEventListener('submit', (e) => {
      if (!window.confirm(f.dataset.confirm)) e.preventDefault();
    });
  });
});
