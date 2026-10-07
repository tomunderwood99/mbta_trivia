let QUESTIONS = [];
let questionsReady = false;

const LETTERS = ["A", "B", "C", "D", "E"];
const SETTINGS_KEY = "mbta-trivia-event-settings";

const state = {
  mode: "play",
  playPhase: "intro",
  playOrder: [],
  playIndex: 0,
  playScore: 0,
  playPicked: null,
  playMissed: [],
  eventPhase: "setup",
  eventOrder: [],
  eventIndex: 0,
  eventRunning: false,
  eventPaused: false,
  deadline: 0,
  remainingOnPause: 0,
  questionSeconds: 20,
  answerSeconds: 10,
  shuffle: true,
  loop: true,
  light: false,
  scramble: false,
  showChoices: false,
  showAnswers: false,
  openAnswers: new Set(),
  visit: 0,
  presentation: null,
  showControls: false,
};

const app = document.querySelector("#app");

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (Number.isFinite(saved.questionSeconds)) state.questionSeconds = clamp(saved.questionSeconds, 5, 180);
    if (Number.isFinite(saved.answerSeconds)) state.answerSeconds = clamp(saved.answerSeconds, 5, 180);
    if (typeof saved.shuffle === "boolean") state.shuffle = saved.shuffle;
    if (typeof saved.loop === "boolean") state.loop = saved.loop;
    if (typeof saved.light === "boolean") state.light = saved.light;
    if (typeof saved.scramble === "boolean") state.scramble = saved.scramble;
    if (typeof saved.showChoices === "boolean") state.showChoices = saved.showChoices;
    if (typeof saved.showAnswers === "boolean") state.showAnswers = saved.showAnswers;
  } catch {
    /* keep defaults */
  }
  applyTheme();
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      questionSeconds: state.questionSeconds,
      answerSeconds: state.answerSeconds,
      shuffle: state.shuffle,
      loop: state.loop,
      light: state.light,
      scramble: state.scramble,
      showChoices: state.showChoices,
      showAnswers: state.showAnswers,
    })
  );
}

function applyTheme() {
  document.documentElement.classList.toggle("theme-light", state.light);
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute("content", state.light ? "#f3efe6" : "#101418");
  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.setAttribute("aria-pressed", String((button.dataset.theme === "light") === state.light));
  });
  const lightMode = document.querySelector("#light-mode");
  if (lightMode) lightMode.checked = state.light;
}

function setTheme(light) {
  state.light = light;
  applyTheme();
  saveSettings();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function questionOrder(shuffled) {
  const order = QUESTIONS.map((_, index) => index);
  return shuffled ? shuffleInPlace(order) : order;
}

function freshVisit() {
  state.visit += 1;
  state.presentation = null;
}

function presented(question) {
  const token = `${state.mode}:${state.visit}:${question.id}`;
  if (!state.presentation || state.presentation.token !== token) {
    state.presentation = {
      token,
      indices: state.scramble ? shuffleInPlace(question.choices.map((_, index) => index)) : null,
    };
  }
  const indices = state.presentation.indices;
  if (!indices) return question;
  return {
    ...question,
    choices: indices.map((index) => question.choices[index]),
    answer: indices.indexOf(question.answer),
  };
}

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "pressed") node.setAttribute("aria-pressed", String(value));
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function currentQuestion(order, index) {
  return presented(QUESTIONS[order[index]]);
}

function render() {
  if (!questionsReady) return;
  const eventLive = state.mode === "event" && state.eventRunning && state.eventPhase !== "done";
  document.body.classList.toggle("event-live", eventLive);
  document.documentElement.classList.toggle("event-live", eventLive);
  document.body.classList.toggle("list-mode", state.mode === "list");
  app.replaceChildren();
  if (state.mode === "play") renderPlay();
  else if (state.mode === "list") renderList();
  else renderEvent();
  syncSetupButton();
  paintTimer();
  fitEventBoard();
}

function onSetupPage() {
  if (state.mode === "play") return state.playPhase === "intro";
  if (state.mode === "list") return true;
  return state.eventPhase === "setup";
}

function syncSetupButton() {
  const button = document.querySelector("#setup-btn");
  if (button) button.hidden = onSetupPage();
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".modes button[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  render();
}

function backToSetup() {
  state.showControls = false;
  state.eventRunning = false;
  state.eventPaused = false;
  state.eventPhase = "setup";
  state.playPhase = "intro";
  state.playPicked = null;
  render();
}

function renderPlay() {
  if (state.playPhase === "intro") {
    app.append(introPanel("play"));
    return;
  }
  if (state.playPhase === "done") {
    app.append(scorePanel());
    return;
  }
  const question = currentQuestion(state.playOrder, state.playIndex);
  const locked = state.playPicked != null;
  app.append(
    h("section", { class: "stage" },
      h("div", { class: "meta" },
        h("span", {}, `Question ${state.playIndex + 1} of ${state.playOrder.length}`),
        h("span", {}, `Score ${state.playScore}`)
      ),
      questionBlock(question, {
        locked,
        picked: state.playPicked,
        onPick: pickAnswer,
      }),
      locked
        ? h("div", { class: "actions" },
            h("button", { class: "primary", type: "button", onclick: nextPlay },
              state.playIndex + 1 === state.playOrder.length ? "See score" : "Next question")
          )
        : h("p", { class: "keys" }, "Keys 1–5 select an answer.")
    )
  );
}

function introPanel() {
  return h("section", { class: "stage" },
    h("div", { class: "intro" },
      h("p", { class: "kicker" }, `${QUESTIONS.length} questions`),
      h("h1", {}, state.mode === "play" ? "Pass it around." : "Leave it running."),
      h("p", { class: "lede" },
        state.mode === "play"
          ? "Play a round on your phone. Each question shows the answer and a short explanation before you move on."
          : "For a party or a table at an event. The screen holds the question, then the answer, then moves on by itself."
      ),
      state.mode === "event"
        ? eventSettings(false)
        : h("div", { class: "fields" }, scrambleField()),
      h("div", { class: "actions" },
        h("button", {
          class: "primary",
          type: "button",
          onclick: state.mode === "play" ? startPlay : startEvent,
        }, state.mode === "play" ? "Start a round" : "Start the show"),
        h("button", {
          class: "ghost",
          type: "button",
          onclick: () => setMode(state.mode === "play" ? "event" : "play"),
        }, state.mode === "play" ? "Set up event mode" : "Play a round instead")
      ),
      h("p", { class: "fine" }, "A fan project. Not affiliated with the MBTA.")
    )
  );
}

function startPlay() {
  const order = questionOrder(true);
  if (!order.length) return;
  state.playOrder = order;
  state.playIndex = 0;
  state.playScore = 0;
  state.playPicked = null;
  state.playMissed = [];
  freshVisit();
  state.playPhase = "question";
  render();
}

function pickAnswer(choice) {
  if (state.playPicked != null) return;
  const question = currentQuestion(state.playOrder, state.playIndex);
  state.playPicked = choice;
  if (choice === question.answer) state.playScore += 1;
  else state.playMissed.push({ question, picked: choice });
  render();
}

function nextPlay() {
  if (state.playIndex + 1 >= state.playOrder.length) {
    state.playPhase = "done";
  } else {
    state.playIndex += 1;
    state.playPicked = null;
    freshVisit();
  }
  render();
}

function scorePanel() {
  const total = state.playOrder.length;
  return h("section", { class: "stage" },
    h("div", { class: "score" },
      h("p", { class: "kicker" }, "Round complete"),
      h("h1", {}, "That’s the set."),
      h("div", { class: "score-number" }, `${state.playScore}/${total}`),
      h("p", { class: "lede" }, scoreLine()),
      state.playMissed.length
        ? h("ul", { class: "missed" },
            state.playMissed.map((miss) =>
              h("li", {},
                h("div", {}, `Q${miss.question.id}. ${miss.question.text}`),
                h("div", {}, "Answer: ", h("b", {}, `${LETTERS[miss.question.answer]}. ${miss.question.choices[miss.question.answer]}`))
              )
            )
          )
        : h("p", { class: "lede" }, "Clean sweep."),
      h("div", { class: "actions" },
        h("button", { class: "primary", type: "button", onclick: startPlay }, "Play again"),
        h("button", { class: "ghost", type: "button", onclick: copyScore }, "Copy score", h("span", { id: "copy-state" }))
      )
    )
  );
}

function scoreLine() {
  const ratio = state.playScore / state.playOrder.length;
  if (ratio === 1) return "You know the system cold.";
  if (ratio >= 0.8) return "Regular rider energy. A few gaps, mostly on the history.";
  if (ratio >= 0.5) return "Solid for someone who actually takes the T.";
  return "Room to ride around and pick up the rest.";
}

async function copyScore() {
  const text = `I got ${state.playScore} out of ${state.playOrder.length} on MBTA Trivia.`;
  const label = document.querySelector("#copy-state");
  try {
    await navigator.clipboard.writeText(text);
    if (label) label.textContent = " — copied";
  } catch {
    if (label) label.textContent = " — copy failed, select the score instead";
  }
}

function renderList() {
  const questions = QUESTIONS.slice().sort((a, b) => a.id - b.id);
  app.append(
    h("section", { class: "stage list-stage" },
      h("div", { class: "list-bar" },
        h("p", { class: "kicker" }, `${questions.length} questions`),
        h("div", { class: "fields" },
          listToggle("show-choices", "showChoices", "Show choices"),
          listToggle("show-answers", "showAnswers", "Show all answers")
        )
      ),
      h("ol", { class: "trivia-list" }, questions.map(listItem))
    )
  );
}

function listToggle(id, key, label) {
  return h("label", { class: "field inline", for: id },
    h("input", {
      id,
      type: "checkbox",
      checked: state[key] ? "checked" : null,
      onchange: (event) => setListFlag(key, event.target.checked),
    }),
    label
  );
}

function setListFlag(key, checked) {
  const scroll = app.scrollTop;
  state[key] = checked;
  saveSettings();
  render();
  app.scrollTop = scroll;
  document.querySelector(`#${key === "showChoices" ? "show-choices" : "show-answers"}`)?.focus();
}

function answerShown(question) {
  return state.showAnswers || state.openAnswers.has(question.id);
}

function toggleAnswer(id) {
  const scroll = app.scrollTop;
  if (state.showAnswers) {
    state.showAnswers = false;
    state.openAnswers = new Set(QUESTIONS.map((question) => question.id).filter((questionId) => questionId !== id));
    saveSettings();
  } else if (state.openAnswers.has(id)) {
    state.openAnswers.delete(id);
  } else {
    state.openAnswers.add(id);
  }
  render();
  app.scrollTop = scroll;
  document.querySelector(`[data-answer-for="${id}"]`)?.focus();
}

function listItem(question) {
  const showChoices = state.showChoices;
  const showAnswers = answerShown(question);
  return h("li", { class: "list-item" },
    h("h2", { class: "list-question" },
      h("span", { class: "list-id" }, String(question.id)),
      question.text
    ),
    h("button", {
      class: "list-reveal",
      type: "button",
      pressed: showAnswers,
      "data-answer-for": String(question.id),
      onclick: () => toggleAnswer(question.id),
    }, showAnswers ? "Hide answer" : "Show answer"),
    showChoices ? listChoices(question, showAnswers) : null,
    !showChoices && showAnswers ? listAnswerOnly(question) : null,
    showAnswers && question.explanation
      ? h("p", { class: "explanation" }, h("strong", {}, "Answer. "), question.explanation)
      : null
  );
}

function listChoices(question, showAnswers) {
  return h("ul", { class: "choices" },
    question.choices.map((choice, index) => {
      const classes = ["choice"];
      if (showAnswers && index === question.answer) classes.push("correct");
      else if (showAnswers) classes.push("dim");
      return h("li", {},
        h("div", { class: classes.join(" ") },
          h("span", { class: "letter" }, LETTERS[index]),
          h("span", {}, choice),
          showAnswers && index === question.answer
            ? h("span", { class: "visually-hidden" }, " (correct answer)")
            : null
        )
      );
    })
  );
}

function listAnswerOnly(question) {
  return h("div", { class: "choice correct" },
    h("span", { class: "letter" }, LETTERS[question.answer]),
    h("span", {}, question.choices[question.answer]),
    h("span", { class: "visually-hidden" }, " (correct answer)")
  );
}

function renderEvent() {
  if (state.eventPhase === "setup") {
    app.append(introPanel());
    return;
  }
  if (state.eventPhase === "done") {
    app.append(
      h("section", { class: "stage" },
        h("div", { class: "score" },
          h("p", { class: "kicker" }, "Event"),
          h("h1", {}, "End of the set."),
          h("p", { class: "lede" }, "Loop is off, so it stopped after the last answer."),
          h("div", { class: "actions" },
            h("button", { class: "primary", type: "button", onclick: startEvent }, "Run it again"),
            h("button", { class: "ghost", type: "button", onclick: backToSetup }, "Change the timing")
          )
        )
      )
    );
    return;
  }

  const question = currentQuestion(state.eventOrder, state.eventIndex);
  const showingAnswer = state.eventPhase === "answer";
  app.append(
    h("section", { class: "stage event-board" },
      h("div", { class: "meta" },
        h("span", { class: `phase ${showingAnswer ? "answer" : ""}`, id: "phase-pill" },
          h("b", { id: "timer-num" }, "–"),
          showingAnswer ? "ANSWER" : "QUESTION"
        ),
        h("span", {}, `${state.eventIndex + 1} / ${state.eventOrder.length}  ·  Q${question.id}`)
      ),
      h("div", { class: `timer-track ${showingAnswer ? "answer" : ""}` },
        h("i", { id: "timer-bar" })
      ),
      questionBlock(question, {
        locked: true,
        reveal: showingAnswer,
        reserveExplanation: true,
      }),
      eventChrome()
    )
  );
}

function questionBlock(question, { locked, picked = null, reveal = false, onPick, reserveExplanation = false }) {
  const showResult = reveal || picked != null;
  const holdExplanation = reserveExplanation && question.explanation && !showResult;
  return h("div", { class: "question-wrap" },
    h("div", { class: "question-fit" },
    h("h1", { class: "question" }, question.text),
    h("ul", { class: "choices" },
      question.choices.map((choice, index) => {
        const classes = ["choice"];
        if (showResult && index === question.answer) classes.push("correct");
        else if (showResult && picked === index) classes.push("wrong");
        else if (showResult) classes.push("dim");
        const tag = onPick ? "button" : "div";
        return h("li", {},
          h(tag, {
            class: classes.join(" "),
            type: onPick ? "button" : null,
            disabled: locked && onPick ? "disabled" : null,
            onclick: onPick ? () => onPick(index) : null,
          },
            h("span", { class: "letter" }, LETTERS[index]),
            h("span", {}, choice),
            showResult && index === question.answer
              ? h("span", { class: "visually-hidden" }, " (correct answer)")
              : null,
            showResult && picked === index && index !== question.answer
              ? h("span", { class: "visually-hidden" }, " (your answer)")
              : null
          )
        );
      })
    ),
    showResult && question.explanation
      ? h("p", { class: "explanation" }, h("strong", {}, "Answer. "), question.explanation)
      : holdExplanation
        ? h("p", { class: "explanation reserved", "aria-hidden": "true" }, h("strong", {}, "Answer. "), question.explanation)
        : null
    )
  );
}

function scrambleField() {
  return h("label", { class: "field inline" },
    h("input", {
      type: "checkbox",
      checked: state.scramble ? "checked" : null,
      onchange: (event) => {
        state.scramble = event.target.checked;
        saveSettings();
      },
    }),
    "Scramble answers"
  );
}

function eventSettings(inDock) {
  return h("div", { class: "fields", id: inDock ? null : "settings" },
    durationField("Question", "questionSeconds"),
    durationField("Answer", "answerSeconds"),
    h("label", { class: "field inline" },
      h("input", {
        type: "checkbox",
        checked: state.shuffle ? "checked" : null,
        onchange: (event) => {
          state.shuffle = event.target.checked;
          saveSettings();
        },
      }),
      "Shuffle"
    ),
    h("label", { class: "field inline" },
      h("input", {
        type: "checkbox",
        checked: state.loop ? "checked" : null,
        onchange: (event) => {
          state.loop = event.target.checked;
          saveSettings();
        },
      }),
      "Loop"
    ),
    h("label", { class: "field inline" },
      h("input", {
        id: "light-mode",
        type: "checkbox",
        checked: state.light ? "checked" : null,
        onchange: (event) => setTheme(event.target.checked),
      }),
      "Light mode"
    ),
    scrambleField()
  );
}

function durationField(label, key) {
  return h("label", { class: "field" },
    `${label} seconds`,
    h("input", {
      type: "number",
      min: "5",
      max: "180",
      value: String(state[key]),
      oninput: (event) => {
        const next = clamp(Number(event.target.value) || 5, 5, 180);
        if (event.target.value !== "") state[key] = next;
        saveSettings();
      },
      onchange: (event) => {
        state[key] = clamp(Number(event.target.value) || 5, 5, 180);
        event.target.value = String(state[key]);
        saveSettings();
      },
    })
  );
}

function eventChrome() {
  const question = currentQuestion(state.eventOrder, state.eventIndex);
  return h("div", { class: "event-chrome" },
    state.showControls
      ? h("button", {
          class: "menu-backdrop",
          type: "button",
          "aria-label": "Close controls",
          onclick: () => {
            state.showControls = false;
            render();
          },
        })
      : null,
    state.showControls
      ? h("div", { class: "event-menu", role: "dialog", "aria-label": "Show controls" },
          h("div", { class: "actions" },
            h("button", { class: "primary", type: "button", onclick: togglePause },
              state.eventPaused ? "Resume" : "Pause"),
            h("button", { class: "ghost", type: "button", onclick: previousQuestion }, "Previous"),
            state.eventPhase === "question"
              ? h("button", { class: "ghost", type: "button", onclick: revealNow }, "Show answer")
              : null,
            h("button", { class: "ghost", type: "button", onclick: () => goTo(state.eventIndex + 1) }, "Next")
          ),
          eventSettings(true),
          h("label", { class: "field" },
            "Jump to",
            h("select", {
              onchange: (event) => goTo(Number(event.target.value)),
            },
              state.eventOrder.map((questionIndex, index) =>
                h("option", {
                  value: String(index),
                  selected: index === state.eventIndex ? "selected" : null,
                }, `${index + 1}. Q${QUESTIONS[questionIndex].id}`)
              )
            )
          ),
          h("p", { class: "keys" },
            `Space pauses. Arrow keys skip. F is full screen. Q${question.id} stays up for ${state.questionSeconds}s, then the answer for ${state.answerSeconds}s. Timing changes apply to the next slide.`
          )
        )
      : null,
    h("div", { class: "event-launcher" },
      h("button", {
        class: "ghost",
        type: "button",
        pressed: state.showControls,
        "aria-expanded": String(state.showControls),
        onclick: () => {
          state.showControls = !state.showControls;
          render();
        },
      }, "Controls"),
      h("button", {
        class: "primary",
        id: "fullscreen-btn",
        type: "button",
        onclick: toggleFullscreen,
      }, isFullscreen() ? "Exit full screen" : "Full screen")
    )
  );
}

function fitEventBoard() {
  const wrap = document.querySelector(".event-board .question-wrap");
  const fit = document.querySelector(".event-board .question-fit");
  if (!wrap || !fit || wrap.clientHeight < 40) return;
  // Start at the same type size as play mode, then shrink only if the slide would clip.
  fit.style.zoom = "1";
  let zoom = 1;
  while (zoom > 0.62 && fit.getBoundingClientRect().height > wrap.clientHeight + 1) {
    zoom = Math.round((zoom - 0.02) * 100) / 100;
    fit.style.zoom = String(zoom);
  }
}

function startEvent() {
  const order = questionOrder(state.shuffle);
  if (!order.length) return;
  state.showControls = false;
  state.eventOrder = order;
  state.eventIndex = 0;
  freshVisit();
  beginPhase("question");
}

function beginPhase(phase) {
  state.eventPhase = phase;
  state.eventRunning = true;
  state.eventPaused = false;
  const seconds = phase === "answer" ? state.answerSeconds : state.questionSeconds;
  state.deadline = performance.now() + seconds * 1000;
  state.remainingOnPause = seconds * 1000;
  render();
}

function togglePause() {
  if (!state.eventRunning) return;
  if (state.eventPaused) {
    state.eventPaused = false;
    state.deadline = performance.now() + state.remainingOnPause;
  } else {
    state.remainingOnPause = Math.max(0, state.deadline - performance.now());
    state.eventPaused = true;
  }
  render();
}

function revealNow() {
  if (state.eventPhase === "question") beginPhase("answer");
}

function goTo(index) {
  if (state.eventOrder.length === 0) return;
  if (index >= state.eventOrder.length) {
    if (state.loop) {
      state.eventIndex = 0;
      freshVisit();
      beginPhase("question");
    } else {
      state.eventRunning = false;
      state.eventPhase = "done";
      render();
    }
    return;
  }
  if (index < 0) {
    state.eventIndex = state.loop ? state.eventOrder.length - 1 : 0;
  } else {
    state.eventIndex = index;
  }
  freshVisit();
  beginPhase("question");
}

function previousQuestion() {
  goTo(state.eventIndex - 1);
}

function onTimerEnd() {
  if (state.eventPhase === "question") beginPhase("answer");
  else goTo(state.eventIndex + 1);
}

function paintTimer() {
  const num = document.querySelector("#timer-num");
  const bar = document.querySelector("#timer-bar");
  if (!num || !bar) return;
  const total = (state.eventPhase === "answer" ? state.answerSeconds : state.questionSeconds) * 1000;
  const left = state.eventPaused
    ? state.remainingOnPause
    : Math.max(0, state.deadline - performance.now());
  num.textContent = String(Math.max(0, Math.ceil(left / 1000)));
  bar.style.transform = `scaleX(${total > 0 ? Math.min(1, left / total) : 0})`;
}

function tick() {
  if (state.mode === "event" && state.eventRunning && !state.eventPaused) {
    if (state.deadline - performance.now() <= 0) onTimerEnd();
  }
  paintTimer();
  requestAnimationFrame(tick);
}

function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen() {
  const root = document.documentElement;
  if (!isFullscreen()) {
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    request?.call(root)?.catch?.(() => {});
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    exit?.call(document);
  }
}

function syncFullscreen() {
  document.body.classList.toggle("is-fullscreen", isFullscreen());
  const button = document.querySelector("#fullscreen-btn");
  if (button) button.textContent = isFullscreen() ? "Exit full screen" : "Full screen";
  requestAnimationFrame(fitEventBoard);
}

function onKey(event) {
  const typing = event.target.matches("input, textarea, select");
  if (typing) return;

  if (state.mode === "event" && state.eventRunning) {
    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      goTo(state.eventIndex + 1);
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      previousQuestion();
    } else if (event.code === "Enter") {
      event.preventDefault();
      revealNow();
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
    }
    return;
  }

  if (state.mode === "play" && state.playPhase === "question" && state.playPicked == null) {
    const number = Number(event.key);
    const question = currentQuestion(state.playOrder, state.playIndex);
    if (number >= 1 && number <= question.choices.length) {
      event.preventDefault();
      pickAnswer(number - 1);
    }
  }
}

document.querySelector("#setup-btn").addEventListener("click", backToSetup);
document.querySelectorAll("[data-theme]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.theme === "light"));
});
document.querySelectorAll(".modes button[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
document.addEventListener("keydown", onKey);
document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);
window.addEventListener("resize", () => {
  if (document.body.classList.contains("event-live")) fitEventBoard();
});

function showLoadMessage(text) {
  app.replaceChildren(
    h("section", { class: "stage" },
      h("div", { class: "intro" },
        h("p", { class: "lede", role: "status" }, text)
      )
    )
  );
}

function loadErrorMessage(error) {
  if (location.protocol === "file:") {
    return "Open this folder with a local server, then visit http://localhost:8080. From the project folder: python3 -m http.server 8080";
  }
  return error.message || "Could not read questions.md.";
}

async function loadQuestions() {
  showLoadMessage("Loading questions…");
  try {
    const response = await fetch("questions.md");
    if (!response.ok) throw new Error(`questions.md returned ${response.status}`);
    QUESTIONS = parseQuestions(await response.text());
    questionsReady = true;
    render();
  } catch (error) {
    questionsReady = false;
    showLoadMessage(loadErrorMessage(error));
  }
}

loadSettings();
loadQuestions();
requestAnimationFrame(tick);
