// Turns questions.md into the list the page plays.
// A question is a numbered block:
//
// 12. **Question text**
//    A. First  B. Second  C. Third  D. Fourth
//    **Lines:** Red, Green
//    **Answer: B — optional label.** Explanation shown with the answer.
//
// **Lines:** is optional. Commas separate multiple lines.

function parseQuestions(markdown) {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let current = null;
  let inFence = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const start = line.match(/^(\d+)\.\s+\*\*(.+)\*\*\s*$/);
    if (start) {
      if (current) blocks.push(current);
      current = { id: Number(start[1]), text: start[2].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  if (!blocks.length) {
    throw new Error("questions.md has no numbered questions.");
  }

  const questions = blocks.map(parseQuestionBlock);
  const seen = new Set();
  for (const question of questions) {
    if (seen.has(question.id)) {
      throw new Error(`Question ${question.id} is numbered twice in questions.md.`);
    }
    seen.add(question.id);
  }
  return questions;
}

function parseLineTags(lines) {
  const tags = [];
  for (const line of lines) {
    const match = line.match(/^\s*\*\*Lines:\*\*\s*(.*?)\s*$/);
    if (!match) continue;
    for (const part of match[1].split(",")) {
      const tag = part.trim();
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
  }
  return tags;
}

function parseQuestionBlock(block) {
  const lines = parseLineTags(block.lines);
  const body = block.lines
    .filter((line) => !/^\s*\*\*Lines:\*\*/.test(line))
    .join("\n")
    .trim();
  const answerMatch = body.match(/\*\*Answer:\s*([A-E])\b([\s\S]*)$/);
  if (!answerMatch) {
    throw new Error(`Question ${block.id} is missing an **Answer:** line.`);
  }

  const answer = answerMatch[1].charCodeAt(0) - 65;
  const choiceText = body.slice(0, answerMatch.index).replace(/\s+/g, " ").trim();
  const choices = choiceText
    .split(/\s+(?=[A-E]\.\s)/)
    .map((part) => part.replace(/^[A-E]\.\s*/, "").trim())
    .filter(Boolean);

  if (choices.length < 2) {
    throw new Error(`Question ${block.id} needs at least two choices.`);
  }
  if (answer >= choices.length) {
    throw new Error(`Question ${block.id} answers ${answerMatch[1]}, but that choice is missing.`);
  }

  const remainder = answerMatch[2];
  const closed = remainder.match(/^(?:\s*[—–-]\s*([^*]*?))?\s*\.?\s*\*\*\.?\s*([\s\S]*)$/);
  if (!closed) {
    throw new Error(`Question ${block.id} has an answer line that does not close with **.`);
  }

  const label = (closed[1] || "").replace(/\.\s*$/, "").trim();
  const explanation = cleanExplanation(closed[2]) || label;

  return {
    id: block.id,
    text: block.text,
    choices,
    answer,
    explanation,
    lines,
  };
}

function cleanExplanation(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\*\(([\s\S]*?)\)\*/g, "($1)")
    .replace(/\*/g, "")
    .trim();
}
