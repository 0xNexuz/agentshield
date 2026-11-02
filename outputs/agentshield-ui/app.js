import { setupDemo } from "./demo-ui.mjs";

(() => {
  const views = ["overview", "policy", "activity", "controls", "demo", "testnet"];
  const labels = { overview: "01 / THE THESIS", policy: "02 / MANDATE DRAFT", activity: "03 / EVIDENCE", controls: "04 / CONTROL", demo: "05 / INSTANT DEMO", testnet: "06 / TEST LAB" };
  const nav = [...document.querySelectorAll("[data-view]")];
  const forms = document.getElementById("policy-form");
  const message = document.getElementById("form-message");
  const storageKey = "agentshield-pre-event-policy-draft-v1";
  const fields = ["owner", "agent", "recipient", "perPayment", "daily", "total", "expiry"];

  function showView(name) {
    if (!views.includes(name)) return;
    if (name === "testnet") {
      prefillTestnetFields();
      ensureWallet().catch(error => { walletStatus.textContent = `Wallet setup unavailable: ${error.message}`; walletStatus.classList.add("is-error"); });
    }
    if (name === "activity") { loadLiveProof(); loadNegativeGallery(); }
    for (const view of views) document.getElementById(`view-${view}`).hidden = view !== name;
    for (const item of nav) {
      const active = item.dataset.view === name;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    const pageIndex = document.getElementById("page-index");
    if (pageIndex) pageIndex.textContent = labels[name];
    const heading = document.querySelector(`#view-${name} h1`);
    if (heading) heading.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  nav.forEach(item => item.addEventListener("click", () => showView(item.dataset.view)));
  document.querySelectorAll("[data-open-view]").forEach(item => item.addEventListener("click", event => {
    event.preventDefault();
    showView(item.dataset.openView);
  }));

  function nearUnits(value) {
    if (value.length > 60) return null;
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,24})?$/.test(value)) return null;
    const [whole, fractional = ""] = value.split(".");
    const units = BigInt(whole) * (10n ** 24n) + BigInt((fractional + "0".repeat(24)).slice(0, 24));
    return units > 0n && units <= (1n << 128n) - 1n ? units : null;
  }
  function account(value) { return /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/.test(value) && value.length <= 64; }
  function feedback(text, kind) { message.textContent = text; message.className = `form-message ${kind}`; }

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const draft = JSON.parse(raw);
      for (const field of fields) if (typeof draft[field] === "string") document.getElementById(field).value = draft[field];
      feedback("Local draft loaded. It has no onchain effect.", "success");
    }
  } catch { feedback("Local storage is unavailable. You can still explore the form.", "error"); }

  forms.addEventListener("submit", event => {
    event.preventDefault();
    const draft = Object.fromEntries(fields.map(field => [field, document.getElementById(field).value.trim()]));
    if (![draft.owner, draft.agent, draft.recipient].every(account)) return feedback("Enter account IDs ending in .testnet for owner, agent, and recipient.", "error");
    if (draft.owner === draft.agent) return feedback("The owner and agent must use different accounts.", "error");
    const per = nearUnits(draft.perPayment), daily = nearUnits(draft.daily), total = nearUnits(draft.total);
    if (per === null || daily === null || total === null) return feedback("Enter positive NEAR amounts with at most 24 decimal places.", "error");
    if (daily < per || total < per) return feedback("The day and total budgets must each cover at least one maximum payment.", "error");
    if (!draft.expiry || new Date(`${draft.expiry}T23:59:59Z`).getTime() <= Date.now()) return feedback("Choose a future expiration date.", "error");
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); feedback("Draft saved in this browser only. No mandate was created or authorized.", "success"); }
    catch { feedback("This browser blocked local storage, so the draft was not saved.", "error"); }
  });
  document.getElementById("clear-draft").addEventListener("click", () => {
    forms.reset();
    try { localStorage.removeItem(storageKey); feedback("Local draft cleared.", "success"); }
    catch { feedback("Form cleared. Browser storage could not be cleared.", "error"); }
  });

  setupDemo();

  const testnetForm = document.getElementById("testnet-form");
  const testnetNetwork = document.getElementById("testnet-network");
  const testnetResults = document.getElementById("testnet-results");
  const testnetRoles = ["owner", "agent", "recipient", "vault"];
  const testnetAccountPattern = /^(?:[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet|[0-9a-f]{64})$/;
  const ownerInput = testnetForm.elements.namedItem("owner");
  const walletDialog = document.getElementById("wallet-dialog");
  const walletOptions = document.getElementById("wallet-options");
  const walletDialogStatus = document.getElementById("wallet-dialog-status");
  const walletStatus = document.getElementById("wallet-status");
  const walletAccount = document.getElementById("wallet-account");
  const walletOpen = document.getElementById("wallet-open");
  const deployedOwner = "agentshield-mag-1d2f78801994.testnet";
  let walletBridge;
  let walletLoading;

  function updateWallet(state) {
    const accountId = state.accountId && testnetAccountPattern.test(state.accountId) ? state.accountId : null;
    if (accountId === deployedOwner) ownerInput.value = accountId;
    walletAccount.textContent = accountId || "NOT CONNECTED";
    walletOpen.firstChild.textContent = accountId ? `${accountId} ` : "CONNECT WALLET ";
    walletStatus.textContent = state.error || (accountId === deployedOwner
      ? "Connected deployed vault owner. No transaction has been signed."
      : accountId ? `Connected ${accountId}; this is not the deployed vault owner. No transaction has been signed.`
        : "Wallet connection identifies your public account. No transaction is sent.");
    walletStatus.classList.toggle("is-error", !!state.error);
    if (walletDialog.open) renderWalletOptions(state);
  }

  function renderWalletOptions(state) {
    walletOptions.replaceChildren();
    if (state.accountId) {
      const connected = document.createElement("p");
      connected.textContent = `CONNECTED / ${state.accountId}`;
      walletOptions.append(connected);
      const disconnect = document.createElement("button");
      disconnect.type = "button";
      disconnect.textContent = "DISCONNECT WALLET ↗";
      disconnect.addEventListener("click", async () => {
        disconnect.disabled = true;
        try { await walletBridge.disconnect(); walletDialogStatus.textContent = "Wallet disconnected."; }
        catch (error) { walletDialogStatus.textContent = `Could not disconnect: ${error.message}`; }
        finally { disconnect.disabled = false; }
      });
      walletOptions.append(disconnect);
      return;
    }
    if (!state.modules.length) {
      const note = document.createElement("p");
      note.textContent = "No supported testnet wallets are available in this browser.";
      walletOptions.append(note);
    }
    for (const module of state.modules) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.textContent = `${module.name} ↗`;
      choice.addEventListener("click", async () => {
        choice.disabled = true;
        walletDialogStatus.textContent = `Opening ${module.name}…`;
        try {
          const connected = await walletBridge.connect(module.id, testnetForm.elements.namedItem("vault").value.trim());
          walletDialogStatus.textContent = connected.accountId === deployedOwner
            ? "Deployed vault owner connected. No transaction was sent."
            : "Wallet connected, but this account is not the deployed vault owner. No transaction was sent.";
        } catch (error) {
          walletDialogStatus.textContent = `Connection failed: ${error.message}`;
        } finally { choice.disabled = false; }
      });
      walletOptions.append(choice);
    }
  }

  async function ensureWallet() {
    if (walletBridge) return walletBridge;
    if (!walletLoading) walletLoading = import("./wallet-bundle.js")
      .then(module => module.createWalletBridge(updateWallet))
      .then(bridge => { walletBridge = bridge; updateWallet(bridge.snapshot()); return bridge; })
      .catch(error => { walletLoading = null; throw error; });
    return walletLoading;
  }

  async function openWalletDialog() {
    walletDialogStatus.textContent = "Loading NEAR testnet wallets…";
    walletDialog.showModal();
    try {
      const bridge = await ensureWallet();
      renderWalletOptions(bridge.snapshot());
      walletDialogStatus.textContent = "Select a wallet. No transaction is sent by connecting.";
    } catch (error) {
      walletDialogStatus.textContent = `Wallet setup failed: ${error.message}`;
    }
  }
  walletOpen.addEventListener("click", openWalletDialog);
  document.getElementById("lab-wallet-open").addEventListener("click", openWalletDialog);
  document.getElementById("wallet-close").addEventListener("click", () => walletDialog.close());

  function prefillTestnetFields() {
    for (const role of ["agent", "recipient"]) {
      const target = testnetForm.elements.namedItem(role);
      if (!target.value) target.value = document.getElementById(role).value.trim();
    }
  }

  async function readTestnet(path) {
    const response = await fetch(path, { signal: AbortSignal.timeout(16000), cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Local testnet check returned HTTP ${response.status}`);
    return data;
  }

  async function loadLiveProof() {
    const panel = document.getElementById("live-proof");
    if (!panel) return;
    panel.replaceChildren();
    const status = document.createElement("p");
    status.textContent = "Checking the finalized Testnet transaction and contract state…";
    panel.append(status);
    try {
      const response = await fetch("/api/testnet/proof", { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const proof = await response.json();
      if (!response.ok || proof.verification !== "PASS" || proof.settlement !== "SETTLED") {
        throw new Error(proof.error || "The proof did not pass every check.");
      }
      panel.replaceChildren();
      const title = document.createElement("h2");
      title.textContent = "One payment. Independently verified.";
      const summary = document.createElement("p");
      summary.textContent = `${proof.amountNear} test NEAR reached ${proof.recipient} through the vault. Finalized contract decision: ${proof.decision}. Settlement: ${proof.settlement}.`;
      const details = document.createElement("dl");
      for (const [label, value] of [
        ["TRANSACTION", proof.transactionHash], ["TRANSFER RECEIPT", proof.recipientReceiptId],
        ["REQUEST ID", proof.requestId], ["VAULT CODE HASH", proof.codeHash],
        ["PAYMENT MANDATE VERSION", proof.mandateVersion],
        ["CURRENT VAULT PENDING", `${proof.pendingTotalYocto} yoctoNEAR`],
      ]) {
        const dt = document.createElement("dt"); dt.textContent = label;
        const dd = document.createElement("dd"); dd.textContent = value;
        details.append(dt, dd);
      }
      const link = document.createElement("a");
      link.href = proof.explorerUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = "OPEN PUBLIC TRANSACTION ↗";
      const record = document.createElement("a");
      record.href = "/api/testnet/proof"; record.target = "_blank"; record.rel = "noopener noreferrer";
      record.textContent = "VIEW LIVE JSON PROOF ↗";
      const checked = document.createElement("small");
      checked.textContent = `Rechecked against public Testnet RPC ${new Date(proof.checkedAt).toLocaleString()}. Verification may become unavailable if the RPC is down.`;
      panel.append(title, summary, details, link, record, checked);
    } catch (error) {
      status.textContent = `VERIFICATION UNAVAILABLE / ${error.message}. No settlement conclusion is drawn from this check.`;
      status.classList.add("is-error");
    }
  }

  async function loadNegativeGallery() {
    const activity = document.getElementById("view-activity");
    let gallery = document.getElementById("live-gallery");
    if (!gallery) {
      gallery = document.createElement("section");
      gallery.id = "live-gallery";
      gallery.setAttribute("aria-label", "Live Security Lab proof gallery");
      activity.append(gallery);
    }
    gallery.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "The boundary, tested live.";
    const intro = document.createElement("p");
    intro.textContent = "These are signed Testnet contract calls. A rejected request counts only when its final result is genuine and the vault issued no payout receipt.";
    const status = document.createElement("p");
    status.textContent = "Checking three finalized rejection proofs…";
    gallery.append(heading, intro, status);
    try {
      const response = await fetch("/api/testnet/gallery", { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const proofs = await response.json();
      if (!response.ok || !Array.isArray(proofs) || proofs.length !== 3 ||
        proofs.some(item => item.verification !== "PASS" || item.decision !== "REJECTED" || item.vaultTransferReceiptCount !== 0)) {
        throw new Error(proofs.error || "The scenario proofs did not all pass.");
      }
      status.remove();
      const grid = document.createElement("div");
      grid.className = "live-gallery-grid";
      const titles = {
        overspend: "Spending limit", unauthorizedRecipient: "Recipient allowlist", replay: "Replay protection",
      };
      for (const proof of proofs) {
        const card = document.createElement("article");
        const label = document.createElement("span");
        label.textContent = "REJECTED / ONCHAIN";
        const title = document.createElement("h3");
        title.textContent = titles[proof.scenario] || proof.scenario;
        const reason = document.createElement("p");
        reason.textContent = `Contract reason: ${proof.reason}. Vault payout receipts: ${proof.vaultTransferReceiptCount}.`;
        const hash = document.createElement("code");
        hash.textContent = proof.transactionHash;
        const link = document.createElement("a");
        link.href = proof.explorerUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = "INSPECT TRANSACTION ↗";
        card.append(label, title, reason, hash, link);
        grid.append(card);
      }
      const pending = document.createElement("article");
      const pendingLabel = document.createElement("span");
      pendingLabel.textContent = "NOT VERIFIED / LIVE";
      const pendingTitle = document.createElement("h3");
      pendingTitle.textContent = "Revocation";
      const pendingText = document.createElement("p");
      pendingText.textContent = "No live revocation proof yet. Revoking the current mandate would permanently disable further requests on this vault.";
      pending.append(pendingLabel, pendingTitle, pendingText);
      grid.append(pending);
      const proofLink = document.createElement("a");
      proofLink.href = "/api/testnet/gallery"; proofLink.target = "_blank"; proofLink.rel = "noopener noreferrer";
      proofLink.textContent = "VIEW LIVE JSON SCENARIO PROOFS ↗";
      gallery.append(grid, proofLink);
    } catch (error) {
      status.textContent = `VERIFICATION UNAVAILABLE / ${error.message}. No live rejection conclusion is drawn from this check.`;
      status.classList.add("is-error");
    }
  }

  function makeResult(role, headline, detail, code) {
    const card = document.createElement("article");
    card.className = "testnet-result";
    const label = document.createElement("span");
    label.textContent = `${role.toUpperCase()} / TESTNET`;
    const title = document.createElement("strong");
    title.textContent = headline;
    const description = document.createElement("p");
    description.textContent = detail;
    card.append(label, title, description);
    if (code) {
      const extra = document.createElement("code");
      extra.textContent = code;
      card.append(extra);
    }
    return card;
  }

  function nearBalance(yocto) {
    const value = BigInt(yocto);
    if (value > 0n && value < 10n ** 18n) return "less than 0.000001 NEAR";
    const whole = value / (10n ** 24n);
    const fraction = String(value % (10n ** 24n)).padStart(24, "0").slice(0, 6).replace(/0+$/, "");
    return `${value % (10n ** 18n) === 0n ? "" : "about "}${whole}${fraction ? `.${fraction}` : ""} NEAR`;
  }

  testnetForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = testnetForm.querySelector('button[type="submit"]');
    const ids = Object.fromEntries(testnetRoles.map(role => [role, testnetForm.elements.namedItem(role).value.trim()]));
    button.disabled = true;
    testnetNetwork.className = "testnet-network";
    testnetNetwork.textContent = "NETWORK / CHECKING LIVE TESTNET…";
    testnetResults.replaceChildren();
    try {
      const status = await readTestnet("/api/testnet/status");
      if (status.chainId !== "testnet" || !status.healthy) throw new Error("The testnet RPC is not synced or its latest block is stale. Try again shortly.");
      testnetNetwork.classList.add("is-good");
      testnetNetwork.textContent = `TESTNET LIVE / BLOCK ${status.latestBlockHeight} / ${status.ageSeconds}s OLD`;
      const grid = document.createElement("div");
      grid.className = "testnet-results-grid";
      const checks = await Promise.all(testnetRoles.map(async role => {
        const id = ids[role];
        if (!id) return makeResult(role, "Not entered.", role === "vault" ? "Optional until a vault account exists." : "Enter this account ID to check it.");
        if (id.length > 64 || !testnetAccountPattern.test(id)) return makeResult(role, "Invalid ID.", "Use a .testnet account or a 64-character lowercase implicit account ID.");
        try {
          const account = await readTestnet(`/api/testnet/account?id=${encodeURIComponent(id)}`);
          if (!account.found) return makeResult(role, "Not found.", `${id} does not exist in finalized testnet state.`);
          if (role === "vault") return makeResult(role, account.hasContract ? "Code deployed." : "No code.", `${id} exists at finalized block ${account.blockHeight}. A code hash does not identify this as AgentShield.`, `Code hash: ${account.codeHash}`);
          const sameIdentity = role === "agent" && id === ids.owner;
          return makeResult(role, sameIdentity ? "Same as owner." : "Account found.", `${id} · ${nearBalance(account.balanceYocto)} · finalized block ${account.blockHeight}.${sameIdentity ? " Use a separate agent account." : ""}`);
        } catch (error) {
          return makeResult(role, "Check failed.", error.message);
        }
      }));
      grid.append(...checks);
      testnetResults.append(grid);
    } catch (error) {
      testnetNetwork.classList.add("is-error");
      testnetNetwork.textContent = `NETWORK / CHECK FAILED: ${error.message}`;
      const note = document.createElement("p");
      note.textContent = "No account conclusions were drawn because the network check failed.";
      testnetResults.append(note);
    } finally {
      button.disabled = false;
    }
  });
})();
