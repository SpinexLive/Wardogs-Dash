(() => {
  const { event: match, savedRoster } = window.rosterBootstrap;
  const templates = {
    infantry: { label: 'Infantry Squad', leaderSlots: 1, playerSlots: 4, fixedSlots: 0, icon: '/images/infantry.png', showLeaderControl: true, showPlayerControl: true },
    armour: { label: 'Armour Crew', leaderSlots: 1, playerSlots: 1, fixedSlots: 0, icon: '/images/armour.png', showLeaderControl: false, showPlayerControl: true, playerMin: 0, playerMax: 2 },
    fob: { label: 'FOB Team', leaderSlots: 1, playerSlots: 1, fixedSlots: 1, icon: '/images/FOB.png', showLeaderControl: false, showPlayerControl: true, playerMin: 0, showMortarControl: true, mortarMin: 0, mortarMax: 33 },
    pilot: { label: 'Pilot Crew', leaderSlots: 0, playerSlots: 3, fixedSlots: 0, icon: '/images/pilot.png', showLeaderControl: false, showPlayerControl: true },
    recon: { label: 'Recon Team', leaderSlots: 0, playerSlots: 1, fixedSlots: 0, icon: '/images/recon.png', showLeaderControl: false, showPlayerControl: true },
    commander: { label: 'Commander', leaderSlots: 0, playerSlots: 0, fixedSlots: 1, icon: '/images/wardogs.png', showLeaderControl: false, showPlayerControl: false },
  };
  const roleIcons = { infantry: '/images/infantry.png', armour: '/images/armour.png', fob: '/images/FOB.png', pilot: '/images/pilot.png', commander: '/images/wardogs.png' };
  const squadLeaderIcon = '/images/squad leader.png';
  const state = { query: '', role: 'all', squads: [] };
  let draggedPlayer = null;

  function fromSaved() {
    if (!savedRoster) return;
    state.squads = savedRoster.squads.map((savedSquad, index) => {
      const squad = normaliseSquad({
        key: `saved-${savedSquad.id}-${index}`, name: savedSquad.name, template: savedSquad.template, leaderSlots: savedSquad.leader_slots, playerSlots: savedSquad.player_slots, fixedSlots: savedSquad.fixed_slots, assignments: [],
      });
      squad.assignments = Array(capacity(squad)).fill(null);
      savedSquad.assignments.forEach((assignment, position) => {
        const slot = Number.isInteger(assignment.position) ? assignment.position : position;
        if (slot < capacity(squad)) squad.assignments[slot] = match.players.find((player) => player.id === assignment.player_id) || { id: assignment.player_id, name: assignment.player_name, role: assignment.player_role };
      });
      return squad;
    });
  }
  function normaliseSquad(squad) {
    const spec = templates[squad.template];
    if (!spec) return squad;
    if (!spec.showLeaderControl) squad.leaderSlots = spec.leaderSlots;
    if (!spec.showPlayerControl) squad.playerSlots = spec.playerSlots;
    if (spec.playerMin !== undefined) squad.playerSlots = Math.max(spec.playerMin, Number(squad.playerSlots) || spec.playerMin);
    if (spec.playerMax !== undefined) squad.playerSlots = Math.min(spec.playerMax, Number(squad.playerSlots) || spec.playerMax);
    if (!spec.showMortarControl) squad.fixedSlots = spec.fixedSlots;
    if (spec.mortarMin !== undefined) squad.fixedSlots = Math.max(spec.mortarMin, Number(squad.fixedSlots) || spec.mortarMin);
    if (spec.mortarMax !== undefined) squad.fixedSlots = Math.min(spec.mortarMax, Number(squad.fixedSlots) || spec.mortarMax);
    squad.assignments = (squad.assignments || []).slice(0, capacity(squad));
    return squad;
  }
  function capacity(squad) { return Number(squad.leaderSlots) + Number(squad.playerSlots) + Number(squad.fixedSlots); }
  function totalSlots() { return state.squads.reduce((total, squad) => total + capacity(squad), 0); }
  function assigned() { return state.squads.reduce((total, squad) => total + squad.assignments.filter(Boolean).length, 0); }
  function unassign(playerId) { state.squads.forEach((squad) => { squad.assignments = squad.assignments.map((player) => player?.id === playerId ? null : player); }); }
  function addTemplate(template) {
    const spec = templates[template];
    if (totalSlots() + spec.leaderSlots + spec.playerSlots + spec.fixedSlots > 33) return render();
    state.squads.push(normaliseSquad({ key: `${template}-${Date.now()}-${Math.random()}`, name: spec.label, template, leaderSlots: spec.leaderSlots, playerSlots: spec.playerSlots, fixedSlots: spec.fixedSlots, assignments: [] }));
    render();
  }
  function playerItem(player, compact = false, slotIcon = null) {
    const icon = slotIcon || roleIcons[player.role] || roleIcons.infantry;
    const performance = !compact
      ? `<div class="roster-player-stats"><span>K/D <strong>${player.performance?.kd || '—'}</strong></span><span>KPM <strong>${player.performance?.kpm || '—'}</strong></span></div>`
      : '';
    return `<div class="roster-player ${compact ? 'roster-player--compact' : ''}" draggable="true" data-player-id="${player.id}" title="${compact ? 'Double-click to return this player to the player list' : 'Drag to a squad slot'}"><img src="${icon}" alt="" /><div class="roster-player-identity"><span>${escapeHtml(player.name)}</span><small>${player.role}</small></div>${performance}<b aria-hidden="true">⠿</b></div>`;
  }
  function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; }
  function renderPlayers() {
    const assignedIds = new Set(state.squads.flatMap((squad) => squad.assignments.filter(Boolean).map((player) => player.id)));
    const players = match.players.filter((player) => (state.role === 'all' || player.role === state.role) && player.name.toLowerCase().includes(state.query.toLowerCase()));
    document.getElementById('player-list').innerHTML = players.map((player) => `<div class="${assignedIds.has(player.id) ? 'is-assigned' : ''}">${playerItem(player)}${assignedIds.has(player.id) ? '<em>Assigned</em>' : ''}</div>`).join('') || '<p class="empty-state">No players match.</p>';
  }
  function squadCard(squad, index) {
    const spec = templates[squad.template];
    const slotIcon = (slot) => {
      if (slot < squad.leaderSlots) return squadLeaderIcon;
      if (squad.template === 'fob' && slot >= squad.leaderSlots + squad.playerSlots) return '/images/artillery.png';
      return squad.template === 'commander' ? roleIcons.commander : spec.icon;
    };
    const slots = Array.from({ length: capacity(squad) }, (_, slot) => `<div class="squad-slot-wrapper ${squad.assignments[slot] ? 'is-filled' : ''}" data-slot="${slot}">${squad.assignments[slot]
      ? playerItem(squad.assignments[slot], true, slotIcon(slot))
      : `<div class="squad-slot"><img src="${slotIcon(slot)}" alt="" /><span>Drop player here</span></div>`}</div>`).join('');
    const controls = [
      spec.showLeaderControl ? `<label>Squad Leaders<input type="number" min="0" max="33" value="${squad.leaderSlots}" data-field="leaderSlots" data-index="${index}" /></label>` : '',
      spec.showPlayerControl ? `<label>Players<input type="number" min="${spec.playerMin ?? 0}" max="${spec.playerMax ?? 33}" value="${squad.playerSlots}" data-field="playerSlots" data-index="${index}" /></label>` : '',
      spec.showMortarControl ? `<label>Mortars<input type="number" min="${spec.mortarMin}" max="${spec.mortarMax}" value="${squad.fixedSlots}" data-field="fixedSlots" data-index="${index}" /></label>` : '',
    ].join('');
    const controlsMarkup = controls ? `<div class="squad-controls">${controls}<span>${capacity(squad)} slots</span></div>` : `<div class="squad-controls squad-controls--fixed"><span>${capacity(squad)} slot${capacity(squad) === 1 ? '' : 's'}</span></div>`;
    return `<article class="squad-card" data-squad-key="${squad.key}"><header><img src="${spec.icon}" alt="" /><input class="squad-name" value="${escapeHtml(squad.name)}" data-index="${index}" aria-label="Squad name" /><button class="remove-squad" data-index="${index}" aria-label="Remove squad">×</button></header>${controlsMarkup}<div class="squad-slot-list" data-drop-squad="${squad.key}">${slots}</div></article>`;
  }
  function renderSquads() { document.getElementById('squad-list').innerHTML = state.squads.map(squadCard).join('') || '<p class="empty-state">Choose a template to add your first squad.</p>'; }
  function renderCounter() {
    const slots = totalSlots(); const count = assigned(); const invalid = slots > 33 || count > 33;
    document.getElementById('slot-counter').textContent = `${count} / ${slots}`;
    document.getElementById('slot-remaining').textContent = `${Math.max(0, 33 - slots)} squad slot${33 - slots === 1 ? '' : 's'} available`;
    const warning = document.getElementById('slot-warning'); warning.hidden = !invalid; warning.textContent = invalid ? 'This roster exceeds the 33-player limit. Reduce squad slots before saving.' : '';
    document.getElementById('save-roster').disabled = invalid;
  }
  function bindDrag() {
    document.querySelectorAll('.roster-player[draggable]').forEach((element) => {
      element.addEventListener('dragstart', () => { draggedPlayer = match.players.find((player) => player.id === element.dataset.playerId); element.classList.add('is-dragging'); });
      element.addEventListener('dragend', () => element.classList.remove('is-dragging'));
    });
    document.querySelectorAll('.squad-slot-wrapper').forEach((zone) => {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-drop-target'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault(); zone.classList.remove('is-drop-target'); if (!draggedPlayer) return;
        const squad = state.squads.find((item) => item.key === zone.closest('[data-squad-key]').dataset.squadKey);
        unassign(draggedPlayer.id);
        squad.assignments[Number(zone.dataset.slot)] = draggedPlayer;
        render();
      });
    });
    document.querySelectorAll('.squad-slot-wrapper .roster-player').forEach((element) => {
      element.addEventListener('dblclick', () => { unassign(element.dataset.playerId); render(); });
    });
    const playerList = document.getElementById('player-list');
    playerList.addEventListener('dragover', (e) => e.preventDefault());
    playerList.addEventListener('drop', (e) => { e.preventDefault(); if (draggedPlayer) { unassign(draggedPlayer.id); render(); } });
  }
  function render() { renderPlayers(); renderSquads(); renderCounter(); bindDrag(); }
  document.getElementById('event-time').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(match.startTime * 1000)) + ' (Europe/London)';
  document.getElementById('player-search').addEventListener('input', (e) => { state.query = e.target.value; renderPlayers(); bindDrag(); });
  document.getElementById('role-filter').addEventListener('click', (e) => { const button = e.target.closest('[data-role]'); if (!button) return; state.role = button.dataset.role; document.querySelectorAll('[data-role]').forEach((item) => item.classList.toggle('active', item === button)); renderPlayers(); bindDrag(); });
  document.getElementById('template-bar').addEventListener('click', (e) => { const button = e.target.closest('[data-template]'); if (button) addTemplate(button.dataset.template); });
  document.getElementById('squad-list').addEventListener('input', (e) => { const index = Number(e.target.dataset.index); const squad = state.squads[index]; if (!squad) return; if (e.target.classList.contains('squad-name')) squad.name = e.target.value; if (e.target.dataset.field) { squad[e.target.dataset.field] = Math.max(0, Number(e.target.value)); normaliseSquad(squad); } render(); });
  document.getElementById('squad-list').addEventListener('click', (e) => { const button = e.target.closest('.remove-squad'); if (button) { state.squads.splice(Number(button.dataset.index), 1); render(); } });
  document.getElementById('save-roster').addEventListener('click', async () => {
    const message = document.getElementById('roster-message'); message.hidden = true;
    try { const response = await fetch(`/roster/${match.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: match, squads: state.squads.map((squad) => ({ ...squad, capacity: capacity(squad), assignments: squad.assignments.map((player, slot) => player && ({ ...player, slot })).filter(Boolean) })) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save roster.'); message.textContent = 'Roster saved.'; message.hidden = false; } catch (error) { message.className = 'error-banner'; message.textContent = error.message; message.hidden = false; }
  });
  fromSaved(); render();
})();
