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
