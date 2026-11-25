// Messagerie : envoi sans recharger la page + récupération des nouveaux messages.
(() => {
  const thread = document.getElementById('thread');
  const form = document.getElementById('send-form');
  if (!thread || !form) return;

  const convId = thread.dataset.conv;
  let lastId = Number(thread.dataset.last) || 0;
  const textarea = form.querySelector('textarea');
  const csrf = form.querySelector('[name=_csrf]').value;
  const end = document.getElementById('bas');

  const scrollDown = () => { thread.scrollTop = thread.scrollHeight; };
  scrollDown();

  function add(m) {
    if (thread.querySelector(`[data-id="${m.id}"]`)) return;
    const div = document.createElement('div');
    const system = m.kind === 'reservation';
    div.className = 'msg' + (system ? ' msg-system' : (m.mine ? ' msg-mine' : ''));
    div.dataset.id = m.id;
    const p = document.createElement('p');
    p.textContent = m.body; // textContent : jamais de HTML injecté
    const t = document.createElement('time');
    t.textContent = m.at;
    div.append(p);
    if (system && m.bookingId) {
      const a = document.createElement('a');
      a.href = `/reservations/${Number(m.bookingId)}`;
      a.textContent = 'Voir la réservation →';
      div.append(a);
    }
    div.append(t);
    thread.insertBefore(div, end);
    lastId = Math.max(lastId, m.id);
    scrollDown();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = textarea.value.trim();
    if (!body) return;
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      add(data.message);
      textarea.value = '';
    } catch (err) {
      alert(err.message || "Le message n'a pas pu être envoyé.");
    } finally {
      btn.disabled = false;
      textarea.focus();
    }
  });

  // Entrée = envoyer, Maj+Entrée = retour à la ligne.
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  async function poll() {
    if (document.hidden) return;
    try {
      const res = await fetch(`/messages/${convId}/nouveaux?apres=${lastId}`, { headers: { Accept: 'application/json' } });
      if (res.ok) (await res.json()).messages.forEach(add);
    } catch (_) { /* réseau coupé : on réessaiera */ }
  }
  setInterval(poll, 5000);
})();
