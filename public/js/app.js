// Keeps each dropdown's "N selected" summary in sync as checkboxes are toggled.
document.querySelectorAll('.role-checklist').forEach((list) => {
  const group = list.dataset.group;
  const counter = document.querySelector(`[data-count-for="${group}"]`);
  const update = () => {
    const count = list.querySelectorAll('input[type="checkbox"]:checked').length;
    counter.textContent = `${count} selected`;
  };
  list.addEventListener('change', update);
});

// Opens the Steam ID popup for the clicked member row.
document.querySelectorAll('[data-dialog]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.dialog)?.showModal();
  });
});

document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog')?.close());
});

// Filters the Members table rows as you type.
const memberSearch = document.getElementById('member-search');
if (memberSearch) {
  const rows = [...document.querySelectorAll('#member-rows .member-card, #member-rows tr')];
  const emptyMessage = document.getElementById('member-search-empty');

  memberSearch.addEventListener('input', () => {
    const query = memberSearch.value.trim().toLowerCase();
    let visibleCount = 0;

    rows.forEach((row) => {
      const matches = !query || row.textContent.toLowerCase().includes(query);
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    if (emptyMessage) emptyMessage.hidden = visibleCount !== 0;
  });
}

// Sort the members directory without a round trip. Missing data always stays last.
const memberRows = document.getElementById('member-rows');
if (memberRows) {
  const directions = new Map();
  document.querySelectorAll('.member-sort').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sortKey;
      const direction = directions.get(key) === 'asc' ? 'desc' : 'asc';
      directions.clear();
      directions.set(key, direction);
      const multiplier = direction === 'asc' ? 1 : -1;
      const rows = [...memberRows.querySelectorAll('tr')];
      rows.sort((left, right) => {
        const leftValue = left.dataset[key];
        const rightValue = right.dataset[key];
        if (key === 'member') return leftValue.localeCompare(rightValue) * multiplier;
        const leftNumber = Number(leftValue);
        const rightNumber = Number(rightValue);
        if (leftNumber < 0) return 1;
        if (rightNumber < 0) return -1;
        return (leftNumber - rightNumber) * multiplier;
      });
      rows.forEach((row) => memberRows.appendChild(row));
      document.querySelectorAll('.member-sort').forEach((header) => {
        header.classList.toggle('is-sorted', header === button);
        header.setAttribute('aria-sort', header === button ? (direction === 'asc' ? 'ascending' : 'descending') : 'none');
      });
    });
  });
}

// Visual guild-emoji pickers used by the Discord roster settings.
document.querySelectorAll('[data-emoji-picker]').forEach((picker) => {
  const trigger = picker.querySelector('.emoji-picker-trigger');
  const options = picker.querySelector('.emoji-picker-options');
  const input = picker.querySelector('input[type="hidden"]');
  trigger.addEventListener('click', () => {
    const opening = options.hidden;
    document.querySelectorAll('.emoji-picker-options').forEach((item) => { item.hidden = true; });
    options.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
  });
  options.addEventListener('click', (event) => {
    const option = event.target.closest('.emoji-picker-option');
    if (!option) return;
    input.value = option.dataset.emojiId;
    trigger.innerHTML = option.dataset.emojiSrc
      ? `<img src="${option.dataset.emojiSrc}" alt="" /><span>${option.dataset.emojiName}</span><b>⌄</b>`
      : '<span class="emoji-picker-default">Default emoji</span><b>⌄</b>';
    options.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });
});

