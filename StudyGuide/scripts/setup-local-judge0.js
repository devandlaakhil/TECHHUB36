"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const appEnvironment = path.join(root, ".env.local");
const judgeEnvironment = path.join(root, ".env.judge0");
const baseUrl = "http://127.0.0.1:2358";

function readEnvironment(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean).map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, "$2")]));
}

function writeEnvironment(file, updates) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const current = readEnvironment(file);
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^\\s*${key}\\s*=`);
    if (current[key] && current[key] !== value) {
      throw new Error(`${key} already has a value in ${path.basename(file)}; refusing to replace it.`);
    }
    let replaced = false;
    for (let index = lines.length - 1; index >= 0; index--) {
      if (!pattern.test(lines[index])) continue;
      if (!replaced) {
        lines[index] = `${key}=${value}`;
        replaced = true;
      } else {
        lines.splice(index, 1);
      }
    }
    if (!replaced) lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(file, `${lines.filter((line, index) => line || index < lines.length - 1).join("\n")}\n`,
    { mode: 0o600 });
}

function ensureJudgeEnvironment() {
  const existing = readEnvironment(judgeEnvironment);
  if (fs.existsSync(judgeEnvironment) &&
      ["AUTHN_TOKEN", "REDIS_PASSWORD", "POSTGRES_PASSWORD"].some(key => !existing[key])) {
    throw new Error(`${path.basename(judgeEnvironment)} exists but is incomplete; refusing to overwrite it.`);
  }
  const values = {
    AUTHN_HEADER: "X-Auth-Token",
    AUTHN_TOKEN: existing.AUTHN_TOKEN || crypto.randomBytes(32).toString("hex"),
    REDIS_HOST: "redis",
    REDIS_PASSWORD: existing.REDIS_PASSWORD || crypto.randomBytes(32).toString("hex"),
    POSTGRES_HOST: "db",
    POSTGRES_DB: "judge0",
    POSTGRES_USER: "judge0",
    POSTGRES_PASSWORD: existing.POSTGRES_PASSWORD || crypto.randomBytes(32).toString("hex"),
    COUNT: "1",
    MAX_QUEUE_SIZE: "10",
    JUDGE0_TELEMETRY_ENABLE: "false",
  };
  writeEnvironment(judgeEnvironment, values);
  return values;
}

async function waitForJudge0(token) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/system_info`, {
        headers: { "X-Auth-Token": token },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const languagesResponse = await fetch(`${baseUrl}/languages`, {
          headers: { "X-Auth-Token": token },
          signal: AbortSignal.timeout(3000),
        });
        if (!languagesResponse.ok) throw new Error("Judge0 is running but its language list is unavailable.");
        const languages = await languagesResponse.json();
        const ids = new Set(languages.map(language => language.id));
        if (![51, 71, 62, 63].every(id => ids.has(id))) {
          throw new Error("Judge0 started, but one or more required C#, Python, Java, or JavaScript runtimes are missing.");
        }
        return;
      }
    } catch (error) {
      if (error.message.includes("Judge0")) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error("Judge0 did not become ready within five minutes. Check Docker Desktop and run `docker compose -f docker-compose.judge0.yml logs --tail=80`.");
}

async function main() {
  const appValues = readEnvironment(appEnvironment);
  if (appValues.JUDGE0_API_URL && appValues.JUDGE0_API_URL !== baseUrl) {
    throw new Error("A different JUDGE0_API_URL is already configured in .env.local; refusing to replace it.");
  }
  const config = ensureJudgeEnvironment();
  writeEnvironment(appEnvironment, {
    JUDGE0_API_URL: baseUrl,
    JUDGE0_API_TOKEN: config.AUTHN_TOKEN,
  });
  execFileSync("docker", ["info"], { cwd: root, stdio: "ignore" });
  execFileSync("docker", ["compose", "-f", "docker-compose.judge0.yml", "up", "-d"],
    { cwd: root, stdio: "inherit" });
  await waitForJudge0(config.AUTHN_TOKEN);
  console.log("Local Judge0 is ready at http://127.0.0.1:2358 with C#, Python, Java, and JavaScript.");
  console.log("Restart the StudyGuide Node server so it loads the new .env.local settings.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
