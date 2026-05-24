(function () {
  const boot = window.EXAM_BOOTSTRAP;
  const panel = document.getElementById('questionPanel');
  const timerSeconds = document.getElementById('timerSeconds');
  const progressText = document.getElementById('progressText');
  const progressBar = document.getElementById('progressBar');
  const nextButton = document.getElementById('nextButton');
  const submitButton = document.getElementById('submitButton');

  const answersByQuestion = new Map((boot.answers || []).map((answer) => [answer.question_id, answer]));
  let index = boot.questions.findIndex((question) => !answersByQuestion.has(question.id));
  if (index < 0) {
    index = boot.questions.length - 1;
  }
  let remaining = boot.timerSeconds;
  let timerId = null;
  let saving = false;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function currentQuestion() {
    return boot.questions[index];
  }

  function allQuestionsComplete() {
    return boot.questions.every((question) => answersByQuestion.has(question.id));
  }

  function updateActionButtons() {
    const complete = allQuestionsComplete();
    const isLastQuestion = index === boot.questions.length - 1;

    nextButton.hidden = complete;
    nextButton.textContent = isLastQuestion ? 'Save final answer' : 'Save and next';
    submitButton.hidden = !complete;
    submitButton.disabled = !complete;
  }

  function showDangerNotice(message) {
    panel.querySelectorAll('.notice.danger').forEach((notice) => notice.remove());
    panel.insertAdjacentHTML('beforeend', `<p class="notice danger">${escapeHtml(message)}</p>`);
  }

  function renderQuestion() {
    const question = currentQuestion();
    const answer = answersByQuestion.get(question.id) || {};
    const questionNumber = index + 1;
    const progress = Math.round((questionNumber / boot.questions.length) * 100);

    progressText.textContent = `Question ${questionNumber} of ${boot.questions.length}`;
    progressBar.style.width = `${progress}%`;
    updateActionButtons();

    if (question.question_type === 'MULTIPLE_CHOICE') {
      const options = question.options.map((option) => {
        const checked = Number(answer.selected_option_id) === Number(option.id) ? 'checked' : '';
        return `
          <label class="answer-option">
            <input type="radio" name="selected_option_id" value="${option.id}" ${checked}>
            <span>${escapeHtml(option.option_text)}</span>
          </label>
        `;
      }).join('');

      panel.innerHTML = `
        <p class="eyebrow">${escapeHtml(question.question_type)}</p>
        <h2>${escapeHtml(question.question_text)}</h2>
        <div class="answer-options">${options}</div>
      `;
    } else {
      panel.innerHTML = `
        <p class="eyebrow">${escapeHtml(question.question_type)}</p>
        <h2>${escapeHtml(question.question_text)}</h2>
        <textarea id="essayAnswer" rows="8" maxlength="8000" placeholder="Type your answer here">${escapeHtml(answer.essay_answer || '')}</textarea>
      `;
    }

    resetTimer();
  }

  function resetTimer() {
    clearInterval(timerId);
    remaining = boot.timerSeconds;
    timerSeconds.textContent = remaining;
    timerId = setInterval(() => {
      remaining -= 1;
      timerSeconds.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(timerId);
        saveAndAdvance();
      }
    }, 1000);
  }

  function collectAnswer() {
    const question = currentQuestion();
    const payload = { question_id: question.id };

    if (question.question_type === 'MULTIPLE_CHOICE') {
      const checked = panel.querySelector('input[name="selected_option_id"]:checked');
      payload.selected_option_id = checked ? checked.value : null;
    } else {
      payload.essay_answer = document.getElementById('essayAnswer')?.value || '';
    }

    return payload;
  }

  async function saveCurrentAnswer() {
    const question = currentQuestion();
    const payload = collectAnswer();

    const response = await fetch(boot.saveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': boot.csrfToken
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Could not save answer.');
    }

    answersByQuestion.set(question.id, {
      question_id: question.id,
      selected_option_id: payload.selected_option_id,
      essay_answer: payload.essay_answer
    });
  }

  async function saveAndAdvance() {
    if (saving) {
      return;
    }

    saving = true;
    nextButton.disabled = true;
    submitButton.disabled = true;

    try {
      await saveCurrentAnswer();
      if (index < boot.questions.length - 1) {
        index += 1;
        renderQuestion();
      } else {
        clearInterval(timerId);
        updateActionButtons();
      }
    } catch (error) {
      showDangerNotice('Your answer could not be saved. Check the connection and try again.');
    } finally {
      saving = false;
      nextButton.disabled = false;
      updateActionButtons();
    }
  }

  async function submitAttempt() {
    if (saving) {
      return;
    }

    if (!allQuestionsComplete()) {
      showDangerNotice('Answer or wait out every question before submitting.');
      updateActionButtons();
      return;
    }

    saving = true;
    nextButton.disabled = true;
    submitButton.disabled = true;
    clearInterval(timerId);

    try {
      await saveCurrentAnswer();
      const response = await fetch(boot.submitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': boot.csrfToken
        },
        credentials: 'same-origin',
        body: JSON.stringify({})
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || 'Could not submit attempt.');
      }
      window.location.assign(body.redirect);
    } catch (error) {
      showDangerNotice('Your attempt could not be submitted. Please try again.');
    } finally {
      saving = false;
      nextButton.disabled = false;
      updateActionButtons();
    }
  }

  nextButton.addEventListener('click', saveAndAdvance);
  submitButton.addEventListener('click', submitAttempt);
  renderQuestion();
})();
