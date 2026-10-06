# MBTA Trivia

Multiple-choice questions about the MBTA. This is a fan project and is not affiliated with the MBTA. The page has two modes:

- **Play** — a round on a phone, with the answer and a short explanation after each guess.
- **Event** — leave it on a screen. Each question stays up for a set number of seconds, then the answer, then the next question. Pause, skip, shuffle, loop, and full screen are in the controls.

Questions live in `questions.md`. The page reads that file and counts whatever is in it. Add a question by copying the shape at the top of the file and giving it the next number. An optional `**Lines:**` list can name one or more MBTA lines, separated by commas. Scramble, on the setup screen, mixes the choices.

Answers are a snapshot. Service, fares, and station details change, so skim `questions.md` before an event.

## Event controls
Open the page once on the venue’s wifi before an event and leave the tab up. Timing you set is remembered in that browser.

**Controls** opens a menu for pause, skip, timing, shuffle, loop, and jump. **Full screen** hides the browser chrome. Press **F** for the same thing, **Space** to pause, the arrow keys to skip, and **Enter** to show the answer early. Timing changes apply to the next slide. The range is 5–180 seconds.

## Run it locally

From the project folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
