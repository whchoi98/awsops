/**
 * Reactive Presentation - Interactive Quiz Component
 *
 * Usage:
 *   <div class="quiz" data-quiz="q1">
 *     <div class="quiz-question">Question text?</div>
 *     <div class="quiz-options">
 *       <button class="quiz-option" data-correct="false">A) Wrong</button>
 *       <button class="quiz-option" data-correct="true">B) Right</button>
 *       <button class="quiz-option" data-correct="false">C) Wrong</button>
 *     </div>
 *     <div class="quiz-feedback"></div>
 *   </div>
 */

class QuizManager {
  constructor() {
    this.quizzes = new Map();
    document.addEventListener('DOMContentLoaded', () => this.init());
  }

  init() {
    document.querySelectorAll('.quiz').forEach(quiz => {
      const id = quiz.dataset.quiz;
      const options = quiz.querySelectorAll('.quiz-option');
      const feedback = quiz.querySelector('.quiz-feedback');
      const state = { answered: false, correct: false };
      this.quizzes.set(id, state);

      options.forEach(opt => {
        opt.addEventListener('click', () => {
          if (state.answered) return;
          state.answered = true;
          const isCorrect = opt.dataset.correct === 'true';
          state.correct = isCorrect;

          // Mark all options
          options.forEach(o => {
            o.classList.add('disabled');
            if (o.dataset.correct === 'true' && isCorrect) {
              o.classList.add('correct');
            } else if (o === opt && !isCorrect) {
              o.classList.add('wrong');
            }
          });

          // Show feedback
          if (feedback) {
            const explanation = opt.dataset.explain || quiz.dataset.explain || '';
            if (isCorrect) {
              feedback.innerHTML = `<div class="quiz-result correct">
                <span class="quiz-icon">&#10003;</span> 정답입니다!
                ${explanation ? `<div class="quiz-explain">${explanation}</div>` : ''}
              </div>`;
            } else {
              feedback.innerHTML = `<div class="quiz-result wrong">
                <span class="quiz-icon">&#10007;</span> 오답입니다. 다시 생각해보세요.
                ${explanation ? `<div class="quiz-explain">${explanation}</div>` : ''}
              </div>`;
            }
            feedback.classList.add('show');
          }

          // Wrong answer: allow retry after brief feedback
          if (!isCorrect) {
            setTimeout(() => {
              state.answered = false;
              state.correct = false;
              options.forEach(o => {
                o.classList.remove('disabled', 'correct');
                // Keep wrong class on selected option briefly visible, then remove
                if (o === opt) {
                  o.classList.add('wrong-fade');
                  setTimeout(() => o.classList.remove('wrong', 'wrong-fade'), 300);
                } else {
                  o.classList.remove('wrong');
                }
              });
              if (feedback) {
                feedback.classList.remove('show');
              }
            }, 1500);
          }
        });
      });
    });
  }

  reset(quizId) {
    const quiz = document.querySelector(`.quiz[data-quiz="${quizId}"]`);
    if (!quiz) return;
    const state = this.quizzes.get(quizId);
    if (state) { state.answered = false; state.correct = false; }
    quiz.querySelectorAll('.quiz-option').forEach(o => {
      o.classList.remove('disabled', 'correct', 'wrong');
    });
    const fb = quiz.querySelector('.quiz-feedback');
    if (fb) { fb.innerHTML = ''; fb.classList.remove('show'); }
  }

  resetAll() {
    this.quizzes.forEach((_, id) => this.reset(id));
  }

  getScore() {
    let total = 0, correct = 0;
    this.quizzes.forEach(s => {
      if (s.answered) { total++; if (s.correct) correct++; }
    });
    return { total, correct, pct: total ? Math.round(correct / total * 100) : 0 };
  }
}

// Singleton
const quizManager = new QuizManager();

/* ── Quiz Styles (injected) ── */
(function injectQuizStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .quiz {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin: 8px 0;
    }
    .quiz-question {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 14px;
      line-height: 1.5;
    }
    .quiz-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .quiz-option {
      display: block;
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      font-family: var(--font-main);
      font-size: .95rem;
      text-align: left;
      cursor: pointer;
      transition: all 200ms ease;
    }
    .quiz-option:hover:not(.disabled) {
      border-color: var(--accent);
      background: var(--surface);
      color: var(--text-primary);
    }
    .quiz-option.disabled {
      cursor: default;
      opacity: .7;
    }
    .quiz-option.correct {
      border-color: var(--green) !important;
      background: var(--green-bg) !important;
      color: var(--green) !important;
      opacity: 1 !important;
    }
    .quiz-option.wrong {
      border-color: var(--red) !important;
      background: var(--red-bg) !important;
      color: var(--red) !important;
      opacity: 1 !important;
    }
    .quiz-option.wrong-fade {
      transition: all 300ms ease-out;
      opacity: 0.5 !important;
    }
    .quiz-feedback {
      overflow: hidden;
      max-height: 0;
      transition: max-height 300ms ease;
    }
    .quiz-feedback.show {
      max-height: 200px;
      margin-top: 12px;
    }
    .quiz-result {
      padding: 12px 16px;
      border-radius: 10px;
      font-size: .95rem;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .quiz-result.correct {
      background: var(--green-bg);
      color: var(--green);
    }
    .quiz-result.wrong {
      background: var(--red-bg);
      color: var(--red);
    }
    .quiz-icon {
      font-size: 1.2rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    .quiz-explain {
      margin-top: 6px;
      font-size: .88rem;
      color: var(--text-secondary);
    }

    /* Summary score card */
    .quiz-summary {
      text-align: center;
      padding: 20px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
    }
    .quiz-score {
      font-size: 2.5rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: var(--accent-light);
    }
    .quiz-score-label {
      font-size: .9rem;
      color: var(--text-muted);
      margin-top: 4px;
    }
  `;
  document.head.appendChild(style);
})();
