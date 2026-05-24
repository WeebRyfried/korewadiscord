(() => {
  document.querySelectorAll('[data-options-form]').forEach((form) => {
    const template = form.querySelector('[data-option-template]');
    const target = form.querySelector('[data-new-options]');
    const addButton = form.querySelector('[data-add-option]');
    let nextIndex = 0;

    if (!template || !target || !addButton) {
      return;
    }

    addButton.addEventListener('click', () => {
      const rowIndex = `${Date.now()}-${nextIndex}`;
      nextIndex += 1;
      target.insertAdjacentHTML('beforeend', template.innerHTML.replaceAll('__INDEX__', rowIndex));
      const newTextInput = target.lastElementChild?.querySelector('input[type="text"]');
      newTextInput?.focus();
    });
  });
})();
