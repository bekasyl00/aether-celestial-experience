import "./style.css";
import { createAmbience } from "./audio.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const canvas = $("#realm-canvas");
const reducedMedia = matchMedia("(prefers-reduced-motion: reduce)");
const ambience = createAmbience();
let realm;
let entities = [];
let selectedId = 0;
let filter = "all";
let paused = reducedMedia.matches;
let autoRotate = false;
let quality = matchMedia("(max-width: 760px)").matches ? "balanced" : "high";
let modelStyle = "sculpted";
let toastTimer;
let opener;
let battleActive = false;
const number = new Intl.NumberFormat("ru-RU");
const realmNames = { angel: "CELESTIAL", demon: "INFERNAL" };
const countLabel = (n) =>
  n === 1 ? "ПЕРСОНАЖ" : n > 1 && n < 5 ? "ПЕРСОНАЖА" : "ПЕРСОНАЖЕЙ";
function notify(message) {
  $("#status").textContent = message;
  $("#status").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#status").classList.remove("visible"), 4200);
}
function interact() {
  document.body.classList.add("has-interacted");
}
function updateRealmButtons(value) {
  $$("[data-realm]").forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.realm === value)),
  );
}
function updateSelection(entity) {
  selectedId = entity.id;
  $("#selected-id").textContent =
    `${String(entity.id + 1).padStart(3, "0")} / 1000`;
  $("#selected-realm").textContent = realmNames[entity.kind];
  $("#selected-realm").style.color =
    entity.kind === "angel" ? "var(--gold)" : "var(--red)";
  $("#selected-name").textContent =
    entity.modelStyle === "scanned"
      ? entity.kind === "angel"
        ? "Engel"
        : "Winged guardian"
      : entity.name;
  $("#selected-archetype").textContent =
    entity.modelStyle === "scanned"
      ? "Музейный фотограмметрический скан"
      : entity.archetype ||
        (entity.kind === "angel" ? "Хранитель света" : "Страж бездны");
  $("#detail-count").textContent = entity.detailCount
    ? number.format(entity.detailCount)
    : "3D";
  $("#detail-label").textContent = entity.detailCount
    ? "элементов"
    : "фотограмметрия";
  $("#triangle-count").textContent = entity.triangles
    ? number.format(entity.triangles)
    : "—";
  if (entity.traits?.length)
    $("#selected-archetype").title = entity.traits.join(" · ");
  $$(".character-card").forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.entity) === entity.id),
    ),
  );
  modelStyle = entity.modelStyle || modelStyle;
  syncArchiveButton();
}
function syncArchiveButton() {
  const button = $("#model-style-toggle");
  button.setAttribute("aria-pressed", String(modelStyle === "scanned"));
  button.firstChild.textContent =
    modelStyle === "scanned" ? "Вернуться к коллекции " : "Открыть 3D-сканы ";
}
function updateStats(stats) {
  $("#fps-label").textContent = `${stats.fps} FPS`;
  document.body.dataset.uniqueDesigns = String(stats.uniqueDesignCount ?? 1000);
  document.body.dataset.entities = String(stats.entityCount);
  document.body.dataset.portals = String(stats.portalCount);
  $("#quality-label").textContent =
    stats.quality === "high" ? "ULTRA" : "BALANCED";
  quality = stats.quality;
  modelStyle = stats.modelStyle;
  syncArchiveButton();
}
function updateWorld(world) {
  const value =
    typeof world === "string" ? world : world.world || world.realm || "all";
  updateRealmButtons(value);
  document.body.classList.toggle("in-world", value !== "all");
  document.body.classList.remove("is-inspecting");
  $("#world-back").hidden = value === "all";
  $("#world-back").textContent =
    value === "angel"
      ? "← Покинуть рай"
      : value === "demon"
        ? "← Покинуть ад"
        : "← Между мирами";
  interact();
}
function updateBattle(state) {
  if (!state) return;
  battleActive = ["fighting", "intro", "clash", "finishing"].includes(
    state.status,
  );
  document.body.classList.toggle("is-battling", battleActive);
  $("#battle-hud").hidden = state.status === "idle";
  if (state.status === "idle") $("#battle-result").hidden = true;
  $("#battle-event").hidden = !battleActive;
  $("#battle-start").disabled = battleActive;
  $("#collection-open").disabled = battleActive;
  $("#flip-model").disabled = battleActive;
  $("#auto-rotate").disabled = battleActive;
  if (state.angelName) $("#battle-angel-name").textContent = state.angelName;
  if (state.demonName) $("#battle-demon-name").textContent = state.demonName;
  const angelHP = Math.max(0, state.angelHP ?? state.health?.angel ?? 100);
  const demonHP = Math.max(0, state.demonHP ?? state.health?.demon ?? 100);
  $("#angel-health-label").textContent = Math.ceil(angelHP);
  $("#demon-health-label").textContent = Math.ceil(demonHP);
  $("#angel-health").style.transform = `scaleX(${angelHP / 100})`;
  $("#demon-health").style.transform = `scaleX(${demonHP / 100})`;
  $("#battle-round").textContent =
    `ROUND ${String(state.round || 1).padStart(2, "0")}`;
  $("#battle-event").textContent = state.eventText || "Два мира сходятся.";
}
function finishBattle(result) {
  updateBattle({ ...result, status: "finished" });
  $("#battle-result").hidden = false;
  $("#battle-winner").textContent =
    result.winner === "angel" ? "Свет побеждает." : "Тьма торжествует.";
  $("#battle-summary").textContent =
    `${result.rounds?.length || result.totalRounds || result.round || "Несколько"} раундов. ${result.finisher || "Новая история. Новый исход."}`;
  $("#battle-replay").focus({ preventScroll: true });
}
function startBattle() {
  if (!realm || battleActive) return;
  $("#battle-result").hidden = true;
  $("#battle-hud").hidden = false;
  document.body.classList.remove("is-inspecting", "is-focused");
  interact();
  try {
    realm.startBattle();
  } catch {
    $("#battle-hud").hidden = true;
    notify("Поединок пока не удалось начать. Попробуй ещё раз.");
  }
}
function updateMotion() {
  document.body.classList.toggle("is-reduced-motion", paused);
  $("#pause-motion").setAttribute("aria-pressed", String(paused));
  $("#pause-motion .motion-label").textContent = paused ? "Пауза" : "Движение";
  $("#pause-motion").setAttribute(
    "aria-label",
    paused ? "Возобновить анимацию" : "Приостановить анимацию",
  );
  realm?.setPaused(paused);
  if (paused) {
    autoRotate = false;
    $("#auto-rotate").setAttribute("aria-pressed", "false");
  }
}
updateMotion();
reducedMedia.addEventListener("change", (event) => {
  paused = event.matches;
  updateMotion();
});

async function initialize() {
  try {
    const { createRealm } = await import("./realm.js");
    realm = createRealm({
      canvas,
      reducedMotion: paused,
      onSelect: updateSelection,
      onStats: updateStats,
      onWorldChange: updateWorld,
      onBattleRequest: startBattle,
      onBattleUpdate: updateBattle,
      onBattleComplete: finishBattle,
      onReady(stats) {
        document.body.dataset.renderer = "webgl";
        $("#loading-screen").classList.add("is-ready");
        updateStats(stats);
        entities = realm.getEntities();
        renderCollection();
      },
    });
    // Read-only diagnostics for reproducible browser verification.
    window.__AETHER__ = {
      getSnapshot: () => realm.getSnapshot(),
      getEntities: () => realm.getEntities(),
    };
  } catch (error) {
    console.error("AETHER initialization failed:", error);
    document.body.dataset.renderer = "fallback";
    $("#loading-screen").classList.add("is-ready");
    $("#fallback-panel").hidden = false;
    $$(
      ".realm-switch button, .toolbar button, #collection-open, #inspect-selected, #quality-toggle, #model-style-toggle",
    ).forEach((button) => {
      button.disabled = true;
    });
  }
}
initialize();
$("#retry").addEventListener("click", () => location.reload());
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  $("#fallback-panel").hidden = false;
  document.body.dataset.renderer = "fallback";
  notify("3D-контекст потерян. Обнови страницу, чтобы восстановить сцену.");
});
canvas.addEventListener("pointerdown", interact);
canvas.addEventListener("wheel", interact, { passive: true });
canvas.addEventListener("keydown", (event) => {
  if (!realm) return;
  const map = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };
  if (map[event.key]) {
    realm.rotate(map[event.key]);
    event.preventDefault();
    interact();
  } else if (["+", "="].includes(event.key)) {
    realm.zoom("in");
    event.preventDefault();
    interact();
  } else if (event.key === "-") {
    realm.zoom("out");
    event.preventDefault();
    interact();
  } else if (event.key.toLowerCase() === "r") resetView();
});
$$("[data-realm]").forEach((button) =>
  button.addEventListener("click", () => {
    if (!realm) return;
    realm.setRealm(button.dataset.realm);
    updateRealmButtons(button.dataset.realm);
    document.body.classList.toggle(
      "is-focused",
      button.dataset.realm !== "all",
    );
    interact();
  }),
);
function resetView() {
  if (battleActive || !$("#battle-result").hidden) realm?.cancelBattle?.();
  $("#battle-result").hidden = true;
  $("#battle-hud").hidden = true;
  $("#battle-event").hidden = true;
  battleActive = false;
  document.body.classList.remove("is-battling", "is-inspecting");
  realm?.resetView();
  updateRealmButtons("all");
  document.body.classList.remove("is-focused");
  interact();
}
$("#reset-view").addEventListener("click", resetView);
$("#world-back").addEventListener("click", resetView);
$$("[data-enter-world]").forEach((button) =>
  button.addEventListener("click", () => {
    realm?.setRealm(button.dataset.enterWorld);
    interact();
  }),
);
$("#battle-start").addEventListener("click", startBattle);
$("#battle-replay").addEventListener("click", startBattle);
$("#battle-close").addEventListener("click", resetView);
$("#flip-model").addEventListener("click", () => {
  realm?.flipSelected?.("x");
  interact();
  notify("Модель перевёрнута. Нажми ещё раз, чтобы вернуть её.");
});
$("#rotate-left").addEventListener("click", () => {
  realm?.rotate("left");
  interact();
});
$("#rotate-right").addEventListener("click", () => {
  realm?.rotate("right");
  interact();
});
$("#zoom-in").addEventListener("click", () => {
  realm?.zoom("in");
  interact();
});
$("#zoom-out").addEventListener("click", () => {
  realm?.zoom("out");
  interact();
});
$("#inspect-selected").addEventListener("click", () => {
  realm?.focusEntity(selectedId);
  document.body.classList.add("is-focused");
  document.body.classList.add("is-inspecting");
  interact();
});
$("#auto-rotate").addEventListener("click", () => {
  autoRotate = !autoRotate;
  if (autoRotate && paused) {
    paused = false;
    updateMotion();
  }
  realm?.setAutoRotate(autoRotate);
  $("#auto-rotate").setAttribute("aria-pressed", String(autoRotate));
  interact();
});
$("#pause-motion").addEventListener("click", () => {
  paused = !paused;
  updateMotion();
});
$("#quality-toggle").addEventListener("click", () => {
  quality = quality === "high" ? "balanced" : "high";
  realm?.setQuality(quality);
  $("#quality-label").textContent = quality === "high" ? "ULTRA" : "BALANCED";
  notify(
    quality === "high"
      ? "Высокое качество: свечение и повышенное разрешение."
      : "Сбалансированный режим: меньше нагрузка на устройство.",
  );
});
$(".sound-toggle").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const enabled = await ambience.toggle();
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute(
      "aria-label",
      enabled ? "Выключить атмосферный звук" : "Включить атмосферный звук",
    );
    notify(enabled ? "Атмосферный звук включён." : "Звук выключен.");
  } catch {
    notify("Не удалось запустить звук. Попробуй ещё раз.");
  } finally {
    button.disabled = false;
  }
});
function openDialog(dialog) {
  opener = document.activeElement;
  dialog.showModal();
}
$("#collection-open").addEventListener("click", () => {
  renderCollection();
  openDialog($("#collection-dialog"));
});
$("#info-open").addEventListener("click", () => openDialog($("#info-dialog")));
$$("dialog").forEach((dialog) => {
  dialog
    .querySelector(".close-dialog")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (dialog.returnValue === "entity") canvas.focus({ preventScroll: true });
    else opener?.focus({ preventScroll: true });
    dialog.returnValue = "";
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
});
function renderCollection() {
  const query = $("#collection-search").value.trim().toLocaleLowerCase("ru");
  const matching = entities.filter(
    (entity) =>
      (filter === "all" || entity.kind === filter) &&
      (!query ||
        `${entity.name} ${entity.archetype || ""} ${entity.id + 1} ${(entity.traits || []).join(" ")}`
          .toLocaleLowerCase("ru")
          .includes(query)),
  );
  const fragment = document.createDocumentFragment();
  matching.forEach((entity) => {
    const card = document.createElement("button");
    card.className = `character-card ${entity.kind}`;
    card.dataset.entity = entity.id;
    card.setAttribute("aria-pressed", String(entity.id === selectedId));
    card.setAttribute(
      "aria-label",
      `${entity.name}, ${entity.archetype || realmNames[entity.kind]}, персонаж ${entity.id + 1}`,
    );
    for (const [className, text] of [
      [
        "card-number",
        `${String(entity.id + 1).padStart(3, "0")} / ${realmNames[entity.kind]}`,
      ],
      ["card-sigil", entity.kind === "angel" ? "✧" : "♜"],
      ["card-name", entity.name],
      [
        "card-archetype",
        entity.archetype ||
          (entity.kind === "angel" ? "Хранитель света" : "Страж бездны"),
      ],
    ]) {
      const element = document.createElement("span");
      element.className = className;
      element.textContent = text;
      card.append(element);
    }
    card.addEventListener("click", () => {
      realm.focusEntity(entity.id);
      updateRealmButtons(entity.kind);
      document.body.classList.add("is-focused");
      document.body.classList.add("is-inspecting");
      interact();
      $("#collection-dialog").close("entity");
    });
    fragment.append(card);
  });
  $("#character-list").replaceChildren(fragment);
  $("#no-results").hidden = matching.length > 0;
  $("#collection-result-count").textContent =
    `${matching.length} ${countLabel(matching.length)}`;
  $("#search-clear").hidden = !$("#collection-search").value;
}
$$("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    $$("[data-filter]").forEach((item) =>
      item.setAttribute("aria-pressed", String(item === button)),
    );
    renderCollection();
  }),
);
$("#collection-search").addEventListener("input", (event) => {
  if (!event.isComposing) renderCollection();
});
$("#collection-search").addEventListener("compositionend", renderCollection);
$("#search-clear").addEventListener("click", () => {
  $("#collection-search").value = "";
  renderCollection();
  $("#collection-search").focus();
});
$("#model-style-toggle").addEventListener("click", async () => {
  if (!realm) return;
  const button = $("#model-style-toggle");
  const next = modelStyle === "scanned" ? "sculpted" : "scanned";
  button.disabled = true;
  $("#archive-note").textContent =
    next === "scanned"
      ? "Загружаем обе объёмные модели…"
      : "Возвращаем коллекцию…";
  try {
    await realm.setModelStyle(next);
    modelStyle = next;
    syncArchiveButton();
    realm.setRealm("angel");
    updateRealmButtons("angel");
    document.body.classList.add("is-focused");
    interact();
    $("#info-dialog").close();
    notify(
      next === "scanned"
        ? "Музейный архив открыт. «Небеса» и «Бездна» выбирают скан."
        : "Коллекция 1000 уникальных персонажей открыта.",
    );
  } catch {
    notify(
      "Не удалось загрузить 3D-сканы. Коллекция остаётся доступной; попробуй ещё раз.",
    );
  } finally {
    button.disabled = false;
    $("#archive-note").textContent = "Сканы загружаются по запросу · 22 МБ";
  }
});
