(() => {
  const page = document.querySelector('.briefing-roster-page');
  const button = document.getElementById('check-attendance');
  const message = document.getElementById('attendance-message');
  if (!page || !button) return;

  function setDot(dot, present, label) {
    dot.dataset.state = present ? 'present' : 'absent';
    dot.title = `${label}: ${present ? 'present' : 'not present'}`;
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    message.hidden = true;
    try {
      const response = await fetch(`/briefing/${page.dataset.eventId}/check-attendance`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Attendance check failed.');
      document.querySelectorAll('.briefing-player').forEach((player) => {
        const status = data.attendance[player.dataset.playerId] || { discord: false, game: false };
        setDot(player.querySelector('[data-check="discord"]'), status.discord, 'Discord channel');
        setDot(player.querySelector('[data-check="game"]'), status.game, 'Game server');
      });
      if (data.warnings?.length) { message.className = 'error-banner'; message.textContent = data.warnings.join(' '); message.hidden = false; }
    } catch (error) { message.className = 'error-banner'; message.textContent = error.message; message.hidden = false; }
    finally { button.disabled = false; button.textContent = 'Check attendance'; }
  });
})();
