import { createSimulator, defaultPolicy, fromYocto } from "./simulator.mjs";

const cases = {
  authorized: { number: "01", title: "Authorized payment", expected: "SETTLED" },
  overcap: { number: "02", title: "Spending limit violation", expected: "PER_PAYMENT_LIMIT" },
  recipient: { number: "03", title: "Unauthorized recipient", expected: "RECIPIENT_NOT_ALLOWED" },
  replay: { number: "04", title: "Replay attack", expected: "REPLAY" },
  revoke: { number: "05", title: "Revoked agent", expected: "REVOKED" },
};

function add(parent, tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function policyFromForm(form) {
  return Object.fromEntries(["agent", "recipient", "perPayment", "daily", "total"]
    .map(name => [name, form.elements.namedItem(name).value.trim()]));
}

function scenario(name, policy) {
  const engine = createSimulator(policy);
  const amount = fromYocto(engine.policy.perPayment);
  const request = overrides => engine.request({ amount, nonce: "test-action", ...overrides });
  const steps = [];
  let result;
  if (name === "authorized") {
    const first = request();
    steps.push(`Agent requested ${amount} NEAR to ${policy.recipient}.`);
    steps.push(`Mandate decision: ${first.decision}. Budget reserved before transfer.`);
    result = engine.settle(first.requestId);
    steps.push("Simulated transfer finished; reserved amount became confirmed spend.");
  } else if (name === "overcap") {
    const attempted = fromYocto(engine.policy.perPayment + 1n);
    result = request({ amount: attempted });
    steps.push(`Agent requested ${attempted} NEAR, one yoctoNEAR above the ${amount} NEAR cap.`);
    steps.push(`Mandate decision: ${result.decision} / ${result.reason}. No transfer was scheduled.`);
  } else if (name === "recipient") {
    const destination = policy.recipient === "unauthorized.testnet" ? "other.testnet" : "unauthorized.testnet";
    result = request({ recipient: destination });
    steps.push(`Agent requested ${amount} NEAR to ${destination}.`);
    steps.push(`Mandate decision: ${result.decision} / ${result.reason}. No transfer was scheduled.`);
  } else if (name === "replay") {
    const first = request();
    engine.settle(first.requestId);
    result = request();
    steps.push(`First ${amount} NEAR request was authorized and settled in this simulation.`);
    steps.push("Agent reused the exact same nonce and action.");
    steps.push(`Mandate decision: ${result.decision} / ${result.reason}. No second transfer was scheduled.`);
  } else if (name === "revoke") {
    engine.revoke();
    result = request();
    steps.push("Owner revoked the mandate in this simulation. Policy version increased.");
    steps.push(`Agent tried to request ${amount} NEAR afterward.`);
    steps.push(`Mandate decision: ${result.decision} / ${result.reason}. No transfer was scheduled.`);
  }
  const outcome = result.status || result.reason || result.decision;
  return { steps, outcome, snapshot: engine.snapshot(), pass: outcome === cases[name].expected };
}

function renderResult(root, name, policy, report) {
  const meta = cases[name];
  const article = document.createElement("article");
  article.className = `demo-result ${report.pass ? "is-pass" : "is-fail"}`;
  add(article, "span", `SIMULATION — NO ONCHAIN TRANSACTIONS / TEST ${meta.number}`, "demo-result-kicker");
  const top = add(article, "div", "", "demo-result-top");
  add(top, "h3", meta.title);
  add(top, "strong", report.pass ? "RULE HELD" : "UNEXPECTED RESULT", "demo-outcome");
  const flow = add(article, "div", "", "demo-flow");
  for (const stage of ["AGENT REQUEST", "MANDATE CHECK", report.outcome === "SETTLED" ? "SIMULATED TRANSFER" : "TRANSFER BLOCKED", "LOCAL RESULT"]) {
    add(flow, "span", stage);
  }
  const list = document.createElement("ol");
  for (const step of report.steps) add(list, "li", step);
  article.append(list);
  const state = report.snapshot;
  add(article, "p", `Outcome: ${report.outcome}. Confirmed: ${fromYocto(state.confirmed)} NEAR. Pending: ${fromYocto(state.pending)} NEAR. Policy version: ${state.version}.`, "demo-state");
  add(article, "p", `Allowed recipient: ${policy.recipient}. This is a local model, not a NEAR transaction or security proof.`, "demo-proof-boundary");
  root.prepend(article);
  while (root.childElementCount > 10) root.lastElementChild.remove();
}

export function setupDemo() {
  const form = document.getElementById("demo-policy");
  const feedback = document.getElementById("demo-feedback");
  const results = document.getElementById("demo-results");
  const buttons = [...document.querySelectorAll("[data-demo-test]")];
  const runAll = document.getElementById("demo-run-all");
  let busy = false;

  async function run(names) {
    if (busy) return;
    const policy = policyFromForm(form);
    try { createSimulator(policy); }
    catch (error) { feedback.textContent = error.message; feedback.classList.add("is-error"); return; }
    busy = true;
    feedback.classList.remove("is-error");
    buttons.forEach(button => { button.disabled = true; });
    runAll.disabled = true;
    try {
      for (const name of names) {
        feedback.textContent = `Running local scenario ${cases[name].number} / ${cases[name].title}…`;
        await new Promise(resolve => setTimeout(resolve, 180));
        const report = scenario(name, policy);
        renderResult(results, name, policy, report);
      }
      feedback.textContent = `${names.length} local scenario${names.length === 1 ? "" : "s"} complete. These results are simulation only; no onchain proof exists.`;
    } catch (error) {
      feedback.textContent = `Simulation stopped: ${error.message}`;
      feedback.classList.add("is-error");
    } finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
      runAll.disabled = false;
    }
  }

  buttons.forEach(button => button.addEventListener("click", () => run([button.dataset.demoTest])));
  runAll.addEventListener("click", () => run(Object.keys(cases)));
  form.addEventListener("reset", () => {
    results.replaceChildren();
    feedback.textContent = `Example policy restored: ${defaultPolicy.perPayment} NEAR per payment. Choose a test.`;
    feedback.classList.remove("is-error");
  });
  form.addEventListener("input", () => {
    feedback.textContent = "Policy changed. The next scenario will use these values in a fresh local simulation.";
    feedback.classList.remove("is-error");
  });
}
