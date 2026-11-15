(function (root) {
  "use strict";

  function formatResult(result, expectedOutput) {
    const labels = {
      pass: "PASS", fail: "FAIL - output did not match", compile_error: "COMPILE ERROR",
      runtime_error: "RUNTIME ERROR", timed_out: "TIME LIMIT EXCEEDED", error: "COMPILER ERROR",
    };
    const parts = [labels[result.state] || result.status || "Unknown compiler result"];
    if (result.compileOutput) parts.push(`Compiler output:\n${result.compileOutput}`);
    if (result.stderr) parts.push(`Standard error:\n${result.stderr}`);
    if (result.stdout || result.state === "fail") parts.push(`Actual output:\n${result.stdout || ""}`);
    if (result.time != null) parts.push(`Time: ${result.time}s`);
    if (result.memory != null) parts.push(`Memory: ${result.memory} KB`);
    parts.push(`Expected output:\n${expectedOutput}`);
    parts.push("Result for the submitted code and test input, not hidden judge tests. Rerun after editing.");
    return parts.join("\n\n");
  }

  function createRunner({ fetch: request = root.fetch.bind(root), onOutput, onBusy,
    delay = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
    let active;
    function cancel() {
      active?.abort();
      active = null;
      onBusy(false);
    }
    async function run(snapshot) {
      cancel();
      const current = new AbortController();
      active = current;
      const submitted = { ...snapshot };
      const output = (text, state = "") => {
        if (active === current) onOutput(text, state);
      };
      if (!submitted.expectedOutput.trim()) {
        output("Enter the expected output for this test case before running.", "fail");
        return;
      }
      onBusy(true);
      try {
        const options = { cache: "no-store", credentials: "same-origin", signal: current.signal };
        output("Checking compiler configuration...");
        const configResponse = await request("/api/config", options);
        if (!configResponse.ok) throw new Error("Could not check compiler configuration. Try again later.");
        const config = await configResponse.json();
        if (active !== current) return;
        if (!config.compilerConfigured) throw new Error("Compiler is not configured on this deployment yet. The owner must configure Judge0 before code can run.");
        output("Submitting to Judge0...");
        const submissionResponse = await request("/api/compile", {
          ...options, method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitted),
        });
        const submission = await submissionResponse.json();
        if (active !== current) return;
        if (!submissionResponse.ok) throw new Error(submission.error || "Compiler request was rejected.");
        const deadline = now() + 20000;
        let result = submission;
        for (let attempts = 0; result.state === "pending" && now() < deadline && attempts < 27; attempts++) {
          await delay(750);
          if (active !== current) return;
          const response = await request(`/api/compile?token=${encodeURIComponent(submission.token)}`, options);
          result = await response.json();
          if (active !== current) return;
          if (!response.ok) throw new Error(result.error || "Could not retrieve compiler result.");
        }
        if (result.state === "pending") {
          output("The submission is still queued. No result is available yet. Try again later.");
          return;
        }
        output(formatResult(result, submitted.expectedOutput), result.state === "pass" ? "pass" : "fail");
      } catch (error) {
        if (active === current && !current.signal.aborted) {
          output(error.message || "Compiler request could not be completed.", "fail");
        }
      } finally {
        if (active === current) {
          active = null;
          onBusy(false);
        }
      }
    }
    return { run, cancel };
  }

  const api = { createRunner, formatResult };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.KR7Coding = api;
})(typeof window !== "undefined" ? window : globalThis);
