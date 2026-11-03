// AgentShield preloader. Stays until the hero artwork, fonts and page have loaded (at least long
// enough to see the run on a first visit), never longer than five seconds, and can be skipped.
(() => {
  const root = document.documentElement;
  const loader = document.getElementById("preloader");
  if (!loader) return;
  const shell = document.querySelector(".site-shell");
  const bar = loader.querySelector(".pre-bar span");
  const status = loader.querySelector(".pre-status");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let seen = false;
  try { seen = sessionStorage.getItem("agentshield-intro-seen") === "1"; } catch { /* storage blocked */ }
  const started = performance.now();
  const minimum = reduced ? 250 : seen ? 600 : 1800;
  const maximum = 5000;

  root.classList.add("is-preloading");
  shell?.setAttribute("inert", "");

  const hero = document.querySelector(".hero-art img");
  const tasks = [
    hero && !hero.complete ? new Promise(resolve => { hero.addEventListener("load", resolve, { once: true }); hero.addEventListener("error", resolve, { once: true }); }) : Promise.resolve(),
    document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve(),
    document.readyState === "complete" ? Promise.resolve() : new Promise(resolve => window.addEventListener("load", resolve, { once: true })),
  ];
  let loaded = 0;
  tasks.forEach(task => task.then(() => { loaded += 1; bar.style.transform = `scaleX(${Math.max(0.06, loaded / tasks.length)})`; }));

  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    bar.style.transform = "scaleX(1)";
    status.textContent = "Ready";
    loader.classList.add("is-leaving");
    root.dataset.preload = "leaving";
    root.classList.remove("is-preloading");
    shell?.removeAttribute("inert");
    try { sessionStorage.setItem("agentshield-intro-seen", "1"); } catch { /* storage blocked */ }
    window.removeEventListener("keydown", onKey);
    window.setTimeout(() => {
      loader.remove();
      root.dataset.preload = "done";
      document.dispatchEvent(new CustomEvent("agentshield:preloaded"));
    }, reduced ? 250 : 950);
  }
  function onKey(event) { if (event.key === "Escape") finish(); }

  Promise.all(tasks).then(() => window.setTimeout(finish, Math.max(0, minimum - (performance.now() - started))));
  window.setTimeout(finish, maximum);
  window.addEventListener("keydown", onKey);
  loader.addEventListener("click", finish);
})();
