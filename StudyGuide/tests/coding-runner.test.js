"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRunner } = require("../coding-runner");
const result = body => ({ ok: true, json: async () => body });
const sample = { language: "python", sourceCode: "print(2)", stdin: "", expectedOutput: "2" };
const tick = () => new Promise(resolve => setImmediate(resolve));

test("runner submits the captured program and reports the captured expectation after async polling", async () => {
  const output = [], busy = [], calls = [];
  let release;
  const configuration = new Promise(resolve => { release = resolve; });
  const runner = createRunner({
    onOutput: (text, state) => output.push({ text, state }), onBusy: state => busy.push(state),
    delay: async () => {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === "/api/config") return configuration;
      if (options.method === "POST") return result({ state: "pending", token: "submission-1" });
      return result({ state: "pass", stdout: "2\n", time: "0.01", memory: 100 });
    },
  });
  const snapshot = { ...sample };
  const running = runner.run(snapshot);
  snapshot.sourceCode = "changed code";
  snapshot.expectedOutput = "changed expectation";
  release(result({ compilerConfigured: true }));
  await running;
  assert.deepEqual(JSON.parse(calls[1].options.body), sample);
  assert.match(output.at(-1).text, /Expected output:\n2/);
  assert.doesNotMatch(output.at(-1).text, /changed expectation/);
  assert.equal(output.at(-1).state, "pass");
  assert.equal(busy.at(-1), false);
});

test("changing problem/resetting cancels the request and ignores a late compiler response", async () => {
  const output = [], calls = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const runner = createRunner({
    onOutput: text => output.push(text), onBusy() {},
    fetch: async (url, options) => {
      calls.push({ url, options });
      return url === "/api/config" ? result({ compilerConfigured: true }) : pending;
    },
  });
  const running = runner.run(sample);
  await tick();
  assert.equal(calls.length, 2);
  runner.cancel();
  const count = output.length;
  release(result({ state: "pass", stdout: "old result" }));
  await running;
  assert.equal(calls[1].options.signal.aborted, true);
  assert.equal(output.length, count);
});

test("authorization and provider errors remain errors and queued jobs never become a fabricated pass", async () => {
  for (const [submission, expected] of [
    [{ ok: false, json: async () => ({ error: "Pro access is required to run code." }) }, /Pro access is required/],
    [result({ state: "compile_error", compileOutput: "syntax error" }), /COMPILE ERROR/],
    [result({ state: "pending", token: "queued" }), /still queued/],
  ]) {
    const output = [];
    const runner = createRunner({
      onOutput: (text, state) => output.push({ text, state }), onBusy() {}, delay: async () => {},
      fetch: async url => url === "/api/config" ? result({ compilerConfigured: true }) : submission,
    });
    await runner.run(sample);
    assert.match(output.at(-1).text, expected);
    assert.notEqual(output.at(-1).state, "pass");
  }
});
