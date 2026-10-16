
import { api, demoControls } from "./api.js";
import { showEdge, startOver } from "./flow.js";
import { icons } from "./ui.js";

const PREVIEWS = [
  { kind: "codeUsed", label: "Code already used", hint: "409" },
  { kind: "votingClosed", label: "Polls closed", hint: "403" },
  { kind: "sessionExpired", label: "Session expired", hint: "401" },
  { kind: "networkFailure", label: "Network failure", hint: "Retry" },
];

function renderMenu(host) {
  const armed = demoControls.isFailureArmed();
  host.innerHTML = `
    <button type="button" class="demo-tools_toggle" aria-expanded="false" aria-controls="demoPanel" data-demo="toggle">
      <span>Demo states</span> ${icons.chevronDown("icon--sm")}
    </button>
    <div class="demo-tools_panel" id="demoPanel" hidden>
      <div class="demo-tools_heading">Preview screens</div>
      ${PREVIEWS.map(
        (
          item,
        ) => `<button type="button" class="demo-tools_item" data-demo="preview" data-kind="${item.kind}">
          <span>${item.label}</span><span class="demo-tools_hint">${item.hint}</span></button>`,
      ).join("")}
      <div class="demo-tools_divider"></div>
      <div class="demo-tools_heading">Make the next cast fail</div>
      <button type="button" class="demo-tools_item" data-demo="arm" data-failure="network" aria-pressed="${armed === "network"}">
        <span>Network error</span><span class="demo-tools_hint">${armed === "network" ? "armed" : "once"}</span></button>
      <button type="button" class="demo-tools_item" data-demo="arm" data-failure="server" aria-pressed="${armed === "server"}">
        <span>Server error (500)</span><span class="demo-tools_hint">${armed === "server" ? "armed" : "once"}</span></button>
      <div class="demo-tools_divider"></div>
      <button type="button" class="demo-tools_item demo-tools_item--accent" data-demo="reset">↺ Reset prototype</button>
    </div>`;
}

export function initDemoTools() {
  const host = document.getElementById("demoTools");
  const badge = document.getElementById("demoBadge");
  if (!host) return;
  host.hidden = false;
  if (badge) badge.hidden = false;
  renderMenu(host);

  host.addEventListener("click", (event) => {
    const item = event.target.closest("[data-demo]");
    if (!item) return;
    switch (item.dataset.demo) {
      case "toggle": {
        const panel = host.querySelector("#demoPanel");
        panel.hidden = !panel.hidden;
        item.setAttribute("aria-expanded", String(!panel.hidden));
        break;
      }
      case "preview":
        showEdge(item.dataset.kind, { preview: true });
        host.querySelector("#demoPanel").hidden = true;
        break;
      case "arm": {
        const alreadyArmed =
          demoControls.isFailureArmed() === item.dataset.failure;
        demoControls.failNextSubmit(alreadyArmed ? null : item.dataset.failure);
        renderMenu(host);
        break;
      }
      case "reset":
        demoControls.failNextSubmit(null);
        api.reset();
        startOver();
        break;
    }
  });
}
