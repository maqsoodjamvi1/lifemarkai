import test from "node:test";
import assert from "node:assert/strict";
import {
answerCurrentClarifyQuestion,
appendLiveClarifyQuestion,
applyClarifyAnswer,
buildClarifyTimeline,
clarifyAckLine,
clarifyOpeningPersistTurns,
clarifyPersistDelta,
clarifySpokenContent,
currentClarifyQuestion,
formatClarifyAnswer,
isClarifyDeferredChoice,
isClarifySkipAllText,
skipAllClarify,
skipCurrentClarifyQuestion,
type ClarifyInterview,
} from "./clarify-turn.ts";

function session(openEnded = true): ClarifyInterview {
  return {
    originalPrompt: "hello",
    openEnded,
    currentIndex: 0,
    questions: [
      {
        id: "product",
        question: "What do you want to create?",
        type: "choice",
        kind: "structure",
        multiple: false,
        options: [{ label: "A website or landing page", value: "website" }],
        answer: "",
      },
      {
        id: "audience",
        question: "Who is it mainly for?",
        type: "choice",
        kind: "audience",
        multiple: false,
        answer: "",
      },
    ],
  };
}

test("typed skip-all phrases are detected", () => {
  assert.equal(isClarifySkipAllText("skip"), true);
  assert.equal(isClarifySkipAllText("just build"), true);
  assert.equal(isClarifySkipAllText("a bakery website"), false);
});

test("one answer advances to the next question instead of completing", () => {
  const result = applyClarifyAnswer(session(), "website");
  assert.equal(result.status, "next");
  if (result.status !== "next") return;
  assert.equal(result.session.questions[0]?.answer, "website");
  assert.equal(currentClarifyQuestion(result.session)?.id, "audience");
});

test("open-ended product pick replaces leftover website questions with matching follow-ups", () => {
  const result = applyClarifyAnswer(session(), "ops");
  assert.equal(result.status, "next");
  if (result.status !== "next") return;
  const ids = result.session.questions.map((q) => q.id);
  assert.ok(ids.includes("modules"));
  assert.ok(ids.includes("auth"));
  assert.ok(!ids.includes("musthave"));
});

test("answering the last question completes with an enriched prompt", () => {
  const first = applyClarifyAnswer(session(false), "website");
  assert.equal(first.status, "next");
  if (first.status !== "next") return;
  const done = applyClarifyAnswer(first.session, "Customers / public visitors");
  assert.equal(done.status, "complete");
  if (done.status !== "complete") return;
  assert.match(done.enrichedPrompt, /website/);
  assert.match(done.enrichedPrompt, /Customers/);
});

test("skip current and skip all do not invent answers", () => {
  const skipped = skipCurrentClarifyQuestion(session());
  assert.equal(skipped.status, "next");
  const all = skipAllClarify(session());
  assert.equal(all.status, "complete");
  if (all.status !== "complete") return;
  assert.equal(all.enrichedPrompt, "hello");
});

test("ack and timeline put the current question last with the previous answer acknowledged", () => {
  const first = applyClarifyAnswer(session(), "website");
  assert.equal(first.status, "next");
  if (first.status !== "next") return;
  assert.equal(formatClarifyAnswer(first.session.questions[0]!), "A website or landing page");
  assert.equal(clarifyAckLine(first.session.questions[0]!), "Got it — A website or landing page.");
  const turns = buildClarifyTimeline(first.session);
  assert.equal(turns.at(-1)?.current, true);
  assert.equal(turns.at(-1)?.ack, "Got it — A website or landing page.");
  assert.match(turns.at(-1)?.content ?? "", /Got it — A website or landing page/);
  assert.match(turns.at(-1)?.content ?? "", /Who is it mainly for/);
});

test("opening persist is just the first question, and something-else chips wait for a typed description", () => {
  const start = session();
  const opening = clarifyOpeningPersistTurns(start);
  assert.equal(opening[0]?.content, "What do you want to create?");
  const other = {
    ...start.questions[0]!,
    options: [{ label: "Something else — I'll describe it", value: "other" }],
  };
  assert.equal(isClarifyDeferredChoice(other, "other"), true);
  assert.equal(isClarifyDeferredChoice(other, "website"), false);
  assert.equal(
    clarifySpokenContent("Who is it mainly for?", { ack: "Got it — a website." }),
    "Got it — a website.\n\nWho is it mainly for?",
  );
});

test("persist delta writes the answer plus the next question, then lead-in on complete", () => {
  const start = session(false);
  assert.equal(clarifyOpeningPersistTurns(start)[0]?.id, "clarify-q-product");
  const first = applyClarifyAnswer(start, "website");
  assert.equal(first.status, "next");
  if (first.status !== "next") return;
  const delta = clarifyPersistDelta(start, first.session, false);
  assert.equal(delta[0]?.role, "user");
  assert.equal(delta[1]?.id, "clarify-q-audience");
  const done = applyClarifyAnswer(first.session, "Customers / public visitors");
  assert.equal(done.status, "complete");
  if (done.status !== "complete") return;
  const last = clarifyPersistDelta(first.session, done.session, true);
  assert.equal(last[0]?.role, "user");
  assert.equal(last[1]?.id, "clarify-build-lead-in");
});

test("skip-all persist delta is only the build lead-in", () => {
  const start = session();
  const all = skipAllClarify(start);
  const delta = clarifyPersistDelta(start, all.session, true);
  assert.deepEqual(delta.map((t) => t.id), ["clarify-build-lead-in"]);
});

test("answering the live current question does not complete from leftover list items", () => {
  const after = answerCurrentClarifyQuestion(session(), "website");
  assert.equal(after.questions[0]?.answer, "website");
  assert.equal(after.currentIndex, 1);
  assert.equal(currentClarifyQuestion(after)?.id, "audience");
  const oneQuestion: ClarifyInterview = {
    ...session(),
    questions: [session().questions[0]!],
  };
  const stepped = answerCurrentClarifyQuestion(oneQuestion, "website");
  assert.equal(currentClarifyQuestion(stepped), null);
  assert.equal(stepped.questions.length, 1);
});

test("appendLiveClarifyQuestion adds the model's next question as current", () => {
  const answered = answerCurrentClarifyQuestion(
    { ...session(), questions: [session().questions[0]!] },
    "website",
  );
  const next = appendLiveClarifyQuestion(answered, {
    id: "audience",
    question: "Who is it mainly for?",
    type: "choice",
    kind: "audience",
    multiple: false,
  });
  assert.equal(currentClarifyQuestion(next)?.id, "audience");
  assert.equal(next.questions.length, 2);
});
