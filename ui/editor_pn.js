// ======= настройки подключения к API =======
const API_BASE = "http://127.0.0.1:8000";

// ======= DOM =======
const recTextEl = document.getElementById("rec-text");

// ======= подсветка текста =======
function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightRecText(node) {
  const text = recTextEl ? (recTextEl.innerText || "") : "";
  if (!recTextEl) return;

  if (!node || (!node.label && !node.value && !node.note) || !text.trim()) {
    recTextEl.innerHTML = escapeHtml(text);
    return;
  }

  const terms = [];
  if (node.label && node.label.trim().length > 1) terms.push(node.label.trim());
  if (node.value && String(node.value).trim().length > 1) terms.push(String(node.value).trim());
  if (node.note && String(node.note).trim().length > 1) terms.push(String(node.note).trim());

  if (!terms.length) {
    recTextEl.innerHTML = escapeHtml(text);
    return;
  }
    // ✅ подтянуть связанные значения/уточнения (как отдельные вершины)
  linkedTermsByPredicates(node, ["значение", "уточнение"]).forEach(t => terms.push(t));
  const pattern = "(" + terms.map(escapeRegex).join("|") + ")";
  const re = new RegExp(pattern, "gi");

  let lastIndex = 0;
  let result = "";
  let m;
  while ((m = re.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, m.index));
    result += '<span class="highlight">' + escapeHtml(m[0]) + "</span>";
    lastIndex = re.lastIndex;
  }
  result += escapeHtml(text.slice(lastIndex));
  recTextEl.innerHTML = result;
}

function linkedTermsByPredicates(node, predicatesLower) {
  if (!node) return [];

  const terms = [];
  const preds = new Set((predicatesLower || []).map(s => String(s).toLowerCase()));

  for (const l of links) {
    const pred = String((l.predicate || l.label || "")).trim().toLowerCase();
    if (!preds.has(pred)) continue;

    // ✅ берем соседа вне зависимости от направления
    let other = null;
    if (l.source?.id === node.id) other = l.target;
    else if (l.target?.id === node.id) other = l.source;

    if (other?.label) terms.push(String(other.label).trim());
  }

  // уникально
  return Array.from(new Set(terms)).filter(t => t && t.length > 1);
}


// ======= данные графа =======
const nodes = [];
const links = [];
let rootNodeId = null;

// ======= большой список предикатов (как ты дала) =======
const BIG_PREDICATES = [
  "следующий шаг",
  "используется",
  "осуществляется с/без",
  "рекомендуется",
  "уточнение",
  "связь И",
  "связь ИЛИ",
  "критерий пациент",
  "критерий симптом",
  "критерий время",
  "критерий возможность",
  "код АТХ",
  "для",
  "группа АТХ",
  "при",
  "связь НЕТ",
  "место проведения",
  "анализ",
  "применяется",
  "значение",
  "" // пусто (если нужно)
];

// ======= normalize logic labels =======
function normalizeLogicLabel(lbl) {
  const s = (lbl || "").trim().toUpperCase();
  if (s === "ANY") return "ИЛИ";
  if (s === "ALL") return "И";
  if (s === "NOT") return "НЕТ";
  return lbl || "";
}

// ======= Edge Wizard (группа/подгруппа + предикат) =======
// Ожидает HTML-блок с id="edge-wizard" (как я давал для editor.html)
const edgeWizardEl = document.getElementById("edge-wizard");
const edgeScopeEl = document.getElementById("edge-scope");
const edgeScopeNameRowEl = document.getElementById("edge-scope-name-row");
const edgeScopeNameEl = document.getElementById("edge-scope-name");
const edgePredicateEl = document.getElementById("edge-predicate");
const edgeOkEl = document.getElementById("edge-ok");
const edgeCancelEl = document.getElementById("edge-cancel");

let _edgeWizardResolve = null;

function wizardAvailable() {
  return !!(edgeWizardEl && edgeScopeEl && edgeScopeNameEl && edgePredicateEl && edgeOkEl && edgeCancelEl);
}

function openEdgeWizard({ forceScope = false, defaultScope = "", defaultScopeName = "", defaultPredicate = "" } = {}) {
  // Если popup нет — fallback через prompt
  if (!wizardAvailable()) {
    const scope = forceScope
      ? (prompt("Контейнер (группа/подгруппа или пусто):", defaultScope || "группа") || "").trim()
      : (prompt("Контейнер (группа/подгруппа или пусто):", defaultScope || "") || "").trim();
    const scopeName = (scope ? (prompt("Название группы/подгруппы:", defaultScopeName || "") || "").trim() : "");
    const pred = (prompt("Предикат:", defaultPredicate || "используется") || "").trim();
    return Promise.resolve({ scope, scopeName, predicate: pred });
  }

  return new Promise((resolve) => {
    _edgeWizardResolve = resolve;

    // fill predicates
    edgePredicateEl.innerHTML = "";
    BIG_PREDICATES.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = (p === "" ? "(пусто)" : p);
      edgePredicateEl.appendChild(opt);
    });

    // defaults
    const scopeVal = forceScope ? (defaultScope || "группа") : (defaultScope || "");
    edgeScopeEl.value = scopeVal;
    edgeScopeNameEl.value = defaultScopeName || "";

    const showName = () => {
      const need = edgeScopeEl.value === "группа" || edgeScopeEl.value === "подгруппа";
      if (edgeScopeNameRowEl) edgeScopeNameRowEl.style.display = need ? "flex" : "none";
      if (!need) edgeScopeNameEl.value = "";
    };
    showName();
    edgeScopeEl.onchange = showName;

    if (defaultPredicate && BIG_PREDICATES.includes(defaultPredicate)) {
      edgePredicateEl.value = defaultPredicate;
    } else {
      edgePredicateEl.value = defaultPredicate || "используется";
    }

    edgeWizardEl.classList.remove("hidden");
  });
}

function closeEdgeWizard() {
  if (wizardAvailable()) edgeWizardEl.classList.add("hidden");
}

if (wizardAvailable()) {
  edgeOkEl.onclick = () => {
    const scope = edgeScopeEl.value || "";
    const scopeName = (edgeScopeNameEl.value || "").trim();
    const predicate = edgePredicateEl.value || "";

    closeEdgeWizard();
    if (_edgeWizardResolve) _edgeWizardResolve({ scope, scopeName, predicate });
    _edgeWizardResolve = null;
  };

  edgeCancelEl.onclick = () => {
    closeEdgeWizard();
    if (_edgeWizardResolve) _edgeWizardResolve(null);
    _edgeWizardResolve = null;
  };

  edgeWizardEl.addEventListener("click", (e) => {
    if (e.target === edgeWizardEl) edgeCancelEl.onclick();
  });
}

// ======= Автодефолты для мастера (но выбор всегда делает пользователь) =======
function defaultsForEdge(sourceNode, targetNode) {
  let defaultPredicate = "используется";
  let defaultScope = "";
  let defaultScopeName = "";

  // root -> method / root -> logic
  if (sourceNode.type === "root" && (targetNode.type === "method" || targetNode.type === "logic")) {
    defaultPredicate = "рекомендуется";
  }

  // method -> logic (часто привязка условий)
  if (sourceNode.type === "method" && targetNode.type === "logic") {
    defaultPredicate = "используется";
    defaultScope = "группа";
    defaultScopeName = "группа критериев";
  }

  // logic -> criteria
  if (sourceNode.type === "logic" && targetNode.type === "criteria") {
    defaultPredicate = "критерий пациент";
    defaultScope = "группа";
    defaultScopeName = "группа критериев";
  }

  // logic -> logic (операнды)
  if (sourceNode.type === "logic" && targetNode.type === "logic") {
    defaultPredicate = "";
    defaultScope = "подгруппа";
    defaultScopeName = "подгруппа";
  }

  // method -> criteria (если вдруг так рисуют)
  if (sourceNode.type === "method" && targetNode.type === "criteria") {
    defaultPredicate = "для";
    defaultScope = "группа";
    defaultScopeName = "группа уточнений";
  }

  // criteria -> criteria (атрибуты)
  if (sourceNode.type === "criteria" && targetNode.type === "criteria") {
    defaultPredicate = "уточнение";
  }

  return { defaultPredicate, defaultScope, defaultScopeName };
}

async function chooseEdgeMeta(sourceNode, targetNode) {
  // Если красная вершина участвует — форсим выбор группы/подгруппы (как ты просила)
  const forceScope = sourceNode.type === "logic" || targetNode.type === "logic";
  const d = defaultsForEdge(sourceNode, targetNode);
  const res = await openEdgeWizard({
    forceScope,
    defaultScope: d.defaultScope,
    defaultScopeName: d.defaultScopeName,
    defaultPredicate: d.defaultPredicate
  });
  return res; // {scope, scopeName, predicate} или null
}

// ======= отображение =======
function defaultNodeSize(type, hasValueOrNote) {
  if (type === "logic") return { w: 42, h: 42 };
  if (type === "root") return { w: 120, h: 40 };
  if (type === "method") return { w: 360, h: 42 };
  return { w: hasValueOrNote ? 280 : 220, h: hasValueOrNote ? 56 : 42 };
}
function ensureNodeSize(n) {
  if (!n.w || !n.h) {
    const hv = n.type === "criteria" && (!!n.value || !!n.note);
    const s = defaultNodeSize(n.type, hv);
    n.w = s.w;
    n.h = s.h;
  }
}

function nodeTypeClass(type) {
  if (type === "criteria") return "node-type-criteria";
  if (type === "method") return "node-type-method";
  if (type === "logic") return "node-type-logic";
  if (type === "root") return "node-type-root";
  return "";
}

function rebuildIdMap() {
  return new Map(nodes.map(n => [n.id, n]));
}

// ======= undo =======
const historyStack = [];
function pushHistory() {
  historyStack.push({
    nodes: nodes.map(n => ({ ...n })),
    links: links.map(l => ({
      source: l.source.id,
      target: l.target.id,
      predicate: l.predicate || "",
      label: l.label || "",
      scope: l.scope || "",
      scopeName: l.scopeName || ""
    })),
    rootNodeId
  });
  if (historyStack.length > 50) historyStack.shift();
}
function undo() {
  if (!historyStack.length) return;
  const st = historyStack.pop();
  nodes.length = 0;
  links.length = 0;
  rootNodeId = st.rootNodeId || null;
  st.nodes.forEach(n => nodes.push({ ...n }));
  const idMap = rebuildIdMap();
  st.links.forEach(l => {
    const s = idMap.get(l.source);
    const t = idMap.get(l.target);
    if (s && t) {
      links.push({
        source: s,
        target: t,
        predicate: l.predicate,
        label: l.label,
        scope: l.scope || "",
        scopeName: l.scopeName || ""
      });
    }
  });
  selectedNode = null;
  selectedEdge = null;
  edgeStartNode = null;
  updateGraph();
}

// ======= SVG / D3 =======
const svg = d3.select("#svg");

const defs = svg.append("defs");
const gridSize = 40;

const pattern = defs
  .append("pattern")
  .attr("id", "grid-pattern")
  .attr("patternUnits", "userSpaceOnUse")
  .attr("width", gridSize)
  .attr("height", gridSize);

pattern.append("rect").attr("width", gridSize).attr("height", gridSize).attr("fill", "#fafafa");
pattern
  .append("path")
  .attr("d", `M ${gridSize} 0 L 0 0 0 ${gridSize}`)
  .attr("fill", "none")
  .attr("stroke", "#e0e0e0")
  .attr("stroke-width", 1);

svg.append("rect").attr("class", "pan-bg").attr("x", -5000).attr("y", -5000).attr("width", 10000).attr("height", 10000);

defs
  .append("marker")
  .attr("id", "arrowHead")
  .attr("viewBox", "0 -5 10 10")
  .attr("refX", 15)
  .attr("refY", 0)
  .attr("markerWidth", 6)
  .attr("markerHeight", 6)
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,-5L10,0L0,5")
  .attr("fill", "#ff9800");

const zoomLayer = svg.append("g").attr("id", "zoom-layer");
const linkGroup = zoomLayer.append("g");
const linkLabelGroup = zoomLayer.append("g");
const nodeGroup = zoomLayer.append("g");

let selectedNode = null;
let selectedEdge = null;
let edgeMode = false;
let edgeStartNode = null;

const edgeModeBtn = document.getElementById("edge-mode-btn");
function updateEdgeModeButton() {
  if (!edgeModeBtn) return;
  edgeModeBtn.textContent = edgeMode ? "Режим стрелки: ВКЛ" : "Режим стрелки: ВЫКЛ";
  edgeModeBtn.style.background = edgeMode ? "#e3f2fd" : "#fff";
}
if (edgeModeBtn) {
  edgeModeBtn.addEventListener("click", () => {
    edgeMode = !edgeMode;
    edgeStartNode = null;
    selectedNode = null;
    selectedEdge = null;
    redrawSelection();
    updateEdgeModeButton();
  });
}
updateEdgeModeButton();

function computeVisible() {
  const children = new Map();
  links.forEach(l => {
    const p = l.source.id;
    const c = l.target.id;
    if (!children.has(p)) children.set(p, []);
    if (!children.get(p).includes(c)) children.get(p).push(c);
  });

  const hidden = new Set();
  function hide(id) {
    const stack = [id];
    while (stack.length) {
      const x = stack.pop();
      if (hidden.has(x)) continue;
      hidden.add(x);
      (children.get(x) || []).forEach(c => stack.push(c));
    }
  }
  nodes.forEach(n => {
    if (n.collapsed) (children.get(n.id) || []).forEach(hide);
  });

  const visibleNodes = nodes.filter(n => !hidden.has(n.id));
  const visIds = new Set(visibleNodes.map(n => n.id));
  const visibleLinks = links.filter(l => visIds.has(l.source.id) && visIds.has(l.target.id));
  return { visibleNodes, visibleLinks };
}

function intersectRect(node, x1, y1, x2, y2) {
  const w = node.w / 2;
  const h = node.h / 2;

  const dx = x2 - x1;
  const dy = y2 - y1;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  let scale;
  if (absDx / w > absDy / h) {
    scale = w / absDx;
  } else {
    scale = h / absDy;
  }

  return {
    x: node.x + dx * scale,
    y: node.y + dy * scale
  };
}


function redrawLinks() {
  linkGroup.selectAll("line")
    .each(function(d) {
      const s = intersectRect(
        d.source,
        d.source.x,
        d.source.y,
        d.target.x,
        d.target.y
      );

      const t = intersectRect(
        d.target,
        d.target.x,
        d.target.y,
        d.source.x,
        d.source.y
      );

      d3.select(this)
        .attr("x1", s.x)
        .attr("y1", s.y)
        .attr("x2", t.x)
        .attr("y2", t.y);
    });

  linkLabelGroup.selectAll("text")
    .attr("x", d => (d.source.x + d.target.x) / 2)
    .attr("y", d => (d.source.y + d.target.y) / 2 - 6);
}



function redrawSelection() {
  nodeGroup.selectAll(".node").classed("selected", d => d === selectedNode);
  linkGroup.selectAll(".link").classed("selected-edge", d => d === selectedEdge);
}

function updateGraph() {
  const { visibleNodes, visibleLinks } = computeVisible();

  // LINKS
  const link = linkGroup
    .selectAll("line")
    .data(visibleLinks, d => d.source.id + "->" + d.target.id);

  link.exit().remove();

  const linkEnter = link
    .enter()
    .append("line")
    .attr("class", "link")
    .on("click", (event, d) => {
      event.stopPropagation();
      selectedEdge = d;
      selectedNode = null;
      redrawSelection();
    })
    .on("dblclick", async (event, d) => {
      event.stopPropagation();

      // редактирование ребра через тот же мастер
      const src = d.source;
      const tgt = d.target;
      const res = await openEdgeWizard({
        forceScope: (src.type === "logic" || tgt.type === "logic"),
        defaultScope: d.scope || "",
        defaultScopeName: d.scopeName || "",
        defaultPredicate: d.predicate || d.label || "используется"
      });
      if (res === null) return;

      pushHistory();
      d.predicate = (res.predicate || "").trim();
      d.label = (res.predicate || "").trim();
      d.scope = res.scope || "";
      d.scopeName = res.scopeName || "";
      updateGraph();
    });

  linkEnter.merge(link);
  redrawLinks();

  // LINK LABELS
  const linkLabels = linkLabelGroup
    .selectAll("text")
    .data(visibleLinks, d => d.source.id + "->" + d.target.id);

  linkLabels.exit().remove();

  const linkLabelsEnter = linkLabels
    .enter()
    .append("text")
    .attr("class", "link-label")
    .attr("text-anchor", "middle")
    .on("click", (event, d) => {
      event.stopPropagation();
      selectedEdge = d;
      selectedNode = null;
      redrawSelection();
    })
    .on("dblclick", async (event, d) => {
      event.stopPropagation();

      const src = d.source;
      const tgt = d.target;
      const res = await openEdgeWizard({
        forceScope: (src.type === "logic" || tgt.type === "logic"),
        defaultScope: d.scope || "",
        defaultScopeName: d.scopeName || "",
        defaultPredicate: d.predicate || d.label || "используется"
      });
      if (res === null) return;

      pushHistory();
      d.predicate = (res.predicate || "").trim();
      d.label = (res.predicate || "").trim();
      d.scope = res.scope || "";
      d.scopeName = res.scopeName || "";
      updateGraph();
    });

  linkLabelsEnter
    .merge(linkLabels)
    .text(d => d.label || "")
    .attr("x", d => (d.source.x + d.target.x) / 2)
    .attr("y", d => (d.source.y + d.target.y) / 2 - 4);

  // NODES
  const node = nodeGroup.selectAll(".node").data(visibleNodes, d => d.id);
  node.exit().remove();

  const nodeEnter = node
    .enter()
    .append("g")
    .attr("class", "node")
    .call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    )
    .on("click", async (event, d) => {
      event.stopPropagation();

      if (edgeMode) {
        if (!edgeStartNode) {
          edgeStartNode = d;
          selectedNode = d;
          redrawSelection();
        } else if (edgeStartNode !== d) {
          const res = await chooseEdgeMeta(edgeStartNode, d);
          if (res === null) {
            edgeStartNode = null;
            selectedNode = null;
            redrawSelection();
            return;
          }

          pushHistory();
          links.push({
            source: edgeStartNode,
            target: d,
            predicate: (res.predicate || "").trim(),
            label: (res.predicate || "").trim(),
            scope: res.scope || "",
            scopeName: res.scopeName || ""
          });

          edgeStartNode = null;
          selectedNode = null;
          updateGraph();
        } else {
          edgeStartNode = null;
          selectedNode = null;
          redrawSelection();
        }
      } else {
        edgeStartNode = null;
        selectedNode = d;
        selectedEdge = null;
        highlightRecText(d);
        redrawSelection();
      }
    })
    .on("dblclick", (event, d) => {
      event.stopPropagation();

      let lbl = prompt("Подпись вершины:", d.label || "");
      if (lbl === null) return;
      lbl = lbl.trim();

      pushHistory();
      d.label = lbl || d.label;
      if (d.type === "logic") d.label = normalizeLogicLabel(d.label);
      updateGraph();
    });

  nodeEnter.append("rect");
  nodeEnter.append("text").attr("class", "label");
  nodeEnter.append("text").attr("class", "value-label");

  const nodeMerge = nodeEnter.merge(node);

  nodeMerge
    .attr("class", d => {
      let cls = "node " + nodeTypeClass(d.type);
      if (d.collapsed) cls += " collapsed";
      if (selectedNode === d) cls += " selected";
      return cls;
    })
    .attr("transform", d => `translate(${d.x},${d.y})`);

  nodeMerge
    .select("rect")
    .attr("x", d => {
      ensureNodeSize(d);
      return -d.w / 2;
    })
    .attr("y", d => -d.h / 2)
    .attr("width", d => d.w)
    .attr("height", d => d.h)
    .attr("transform", d => (d.type === "logic" ? "rotate(45)" : null));

  nodeMerge
    .select("text.label")
    .attr("text-anchor", "middle")
    .attr("dy", d => {
      const hv = d.type === "criteria" && (d.value || d.note);
      return hv ? "-0.2em" : "0.35em";
    })
    .text(d => d.label || "");

  nodeMerge
    .select("text.value-label")
    .attr("text-anchor", "middle")
    .attr("dy", "1.2em")
    .text(d => "");


  redrawSelection();
  redrawLinks();
}

// drag
function dragstarted(event, d) {
  if (event.sourceEvent && event.sourceEvent.stopPropagation) event.sourceEvent.stopPropagation();
  pushHistory();
}
function dragged(event, d) {
  d.x = event.x;
  d.y = event.y;
  d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
  redrawLinks();
}
function dragended(event, d) {
  d.x = event.x;
  d.y = event.y;
  d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
  redrawLinks();
}

// zoom
const zoom = d3
  .zoom()
  .scaleExtent([0.3, 2])
  .on("zoom", event => zoomLayer.attr("transform", event.transform));
svg.call(zoom);

// click empty
svg.on("click", () => {
  selectedNode = null;
  selectedEdge = null;
  edgeStartNode = null;
  highlightRecText(null);
  redrawSelection();
});

// delete / undo hotkeys
function deleteSelected() {
  if (selectedNode) {
    pushHistory();
    const idx = nodes.indexOf(selectedNode);
    if (idx >= 0) nodes.splice(idx, 1);
    for (let i = links.length - 1; i >= 0; i--) {
      if (links[i].source === selectedNode || links[i].target === selectedNode) {
        links.splice(i, 1);
      }
    }
    selectedNode = null;
    selectedEdge = null;
    edgeStartNode = null;
    updateGraph();
  } else if (selectedEdge) {
    pushHistory();
    const i = links.indexOf(selectedEdge);
    if (i >= 0) links.splice(i, 1);
    selectedEdge = null;
    edgeStartNode = null;
    updateGraph();
  }
}
window.addEventListener("keydown", e => {
  if (e.key === "Delete") deleteSelected();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") undo();
});

// ======= кнопки UI =======
function addNodeByType(type) {
  let defaultLabel =
    type === "root" ? "Заболевание" :
    type === "criteria" ? "новый критерий" :
    type === "logic" ? "И" :
    "новый метод";

  let label = prompt("Подпись вершины:", defaultLabel);
  if (label === null) return;
  label = label.trim();
  if (!label) return;

  if (type === "logic") label = normalizeLogicLabel(label);

  let value = null;
  let note = null;

  pushHistory();
  const s = defaultNodeSize(type, type === "criteria" && (!!value || !!note));
  const n = {
    id: "n_" + Math.random().toString(36).slice(2, 9),
    label,
    value,
    note,
    type,
    x: 0,
    y: 0,
    w: s.w,
    h: s.h,
    collapsed: false
  };
  nodes.push(n);
  if (type === "root" && !rootNodeId) rootNodeId = n.id;
  updateGraph();
}


const addRootBtn = document.getElementById("add-root-btn");
const addCriteriaBtn = document.getElementById("add-criteria-btn");
const addLogicBtn = document.getElementById("add-logic-btn");
const addMethodBtn = document.getElementById("add-method-btn");

if (addRootBtn) addRootBtn.onclick = () => addNodeByType("root");
if (addCriteriaBtn) addCriteriaBtn.onclick = () => addNodeByType("criteria");
if (addLogicBtn) addLogicBtn.onclick = () => addNodeByType("logic");
if (addMethodBtn) addMethodBtn.onclick = () => addNodeByType("method");

const delBtn = document.getElementById("delete-selected-btn");
if (delBtn) delBtn.onclick = deleteSelected;

const undoBtn = document.getElementById("undo-btn");
if (undoBtn) undoBtn.onclick = undo;

// ======= авторазмещение (ЭТАЛОН + анти-наложения) =======
// Основа взята из konverter.html / rec1_redactor.html (DFS + уровни),
// но улучшена: 1) считаем "ширину поддерева" 2) раскладываем детей по полосам
// 3) устраняем пересечения по каждому уровню с переносом поддерева

function autoLayoutKonverter(rootId, saveHistory = false) {
  if (!nodes.length) return;
  if (!rootId) rootId = rootNodeId || nodes[0]?.id;
  if (!rootId) return;
  if (saveHistory) pushHistory();

  nodes.forEach(ensureNodeSize);
  const idMap = rebuildIdMap();

  // children (дерево по направлению стрелок)
  const children = new Map();
  nodes.forEach(n => children.set(n.id, []));
  links.forEach(l => {
    const p = l.source?.id;
    const c = l.target?.id;
    if (!p || !c) return;
    if (!children.has(p)) children.set(p, []);
    if (!children.get(p).includes(c)) children.get(p).push(c);
  });

  // сортировка детей (стабильность как в эталоне)
  function typeRank(id) {
    const n = idMap.get(id);
    if (!n) return 99;
    if (n.type === "method") return 0;
    if (n.type === "logic") return 1;
    if (n.type === "criteria") return 2;
    if (n.type === "root") return -1;
    return 10;
  }
  children.forEach(arr => arr.sort((a, b) => typeRank(a) - typeRank(b)));

  // параметры
  const marginX = 140;
  const marginY = 90;
  const levelHeight = 170;
  const gapX = 80;      // разрыв между боксами на уровне
  const leafPad = 40;   // воздух для листа

  // subtree width + depth
  const subtreeWidth = new Map();
  const depthMap = new Map();
  const seen = new Set();

  function computeWidths(id, depth) {
    if (!id || seen.has(id)) return 0;
    seen.add(id);
    depthMap.set(id, depth);

    const n = idMap.get(id);
    if (!n) return 0;

    const kids = (children.get(id) || []).filter(cid => idMap.has(cid));
    if (!kids.length) {
      const w = Math.max(n.w + leafPad, n.w);
      subtreeWidth.set(id, w);
      return w;
    }

    let sum = 0;
    kids.forEach((cid, idx) => {
      const cw = computeWidths(cid, depth + 1);
      sum += cw;
      if (idx > 0) sum += gapX;
    });

    const w = Math.max(n.w, sum);
    subtreeWidth.set(id, w);
    return w;
  }

  function place(id, xLeft) {
    const n = idMap.get(id);
    if (!n) return;

    const depth = depthMap.get(id) || 0;
    n.y = marginY + depth * levelHeight;

    const kids = (children.get(id) || []).filter(cid => idMap.has(cid));
    if (!kids.length) {
      const w = subtreeWidth.get(id) || n.w;
      n.x = marginX + xLeft + w / 2;
      return;
    }

    let cursor = xLeft;
    kids.forEach((cid) => {
      const cw = subtreeWidth.get(cid) || (idMap.get(cid)?.w ?? 120);
      place(cid, cursor);
      cursor += cw + gapX;
    });

    // центр родителя = центр между первым и последним ребенком
    const first = idMap.get(kids[0]);
    const last = idMap.get(kids[kids.length - 1]);
    n.x = (first.x + last.x) / 2;
  }

  // shift subtree (для сдвигов веера и коллизий)
  function shiftSubtree(id, dx) {
    const stack = [id];
    const visited = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || visited.has(cur)) continue;
      visited.add(cur);
      const node = idMap.get(cur);
      if (node) node.x += dx;
      (children.get(cur) || []).forEach(ch => stack.push(ch));
    }
  }

  // группировка по глубине для разруливания коллизий
  function buildByDepth() {
    const byDepth = new Map();
    nodes.forEach(n => {
      const d = depthMap.get(n.id);
      if (d === undefined) return;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d).push(n);
    });
    return byDepth;
  }

  // разруливание пересечений на уровне (двигаем поддеревья вправо)
  function resolveLevelCollisions(byDepth) {
    [...byDepth.keys()].sort((a, b) => a - b).forEach(d => {
      const arr = byDepth.get(d).slice().sort((a, b) => a.x - b.x);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1];
        const cur = arr[i];
        const prevRight = prev.x + prev.w / 2;
        const curLeft = cur.x - cur.w / 2;
        const need = (prevRight + gapX) - curLeft;
        if (need > 0) shiftSubtree(cur.id, need);
      }
    });
  }

  // ======= ГЛАВНОЕ: “как скрин 1” — веер вокруг родителя, но прямые линии =======
  function balanceChildrenAroundParent(parentId) {
    const p = idMap.get(parentId);
    if (!p) return;

    const kidsIds = (children.get(parentId) || []).filter(cid => idMap.has(cid));
    if (kidsIds.length <= 1) return;

    const kids = kidsIds.map(id => idMap.get(id));

    // шаг веера = max ширина ребенка + gap
    const step = Math.max(...kids.map(k => k.w)) + gapX;

    // целевые x вокруг родителя: левый/центр/правый и т.д.
    const center = (kids.length - 1) / 2;

    // сортируем по текущему x, чтобы сохранять порядок
    kids.sort((a, b) => a.x - b.x);

    kids.forEach((k, i) => {
      const targetX = p.x + (i - center) * step;
      const dx = targetX - k.x;
      if (Math.abs(dx) > 1) shiftSubtree(k.id, dx);
    });
  }

  // ======= запуск =======
  seen.clear();
  computeWidths(rootId, 0);
  place(rootId, 0);

  // несколько проходов: (1) коллизии, (2) веер, (3) коллизии
  for (let pass = 0; pass < 4; pass++) {
    const byDepth = buildByDepth();
    resolveLevelCollisions(byDepth);

    // веер сверху вниз (чтобы И/ИЛИ разъезжались как на скрине 1)
    const ordered = nodes
      .slice()
      .filter(n => depthMap.has(n.id))
      .sort((a, b) => (depthMap.get(a.id) - depthMap.get(b.id)) || (a.x - b.x));

    ordered.forEach(n => balanceChildrenAroundParent(n.id));

    // после веера — снова коллизии
    resolveLevelCollisions(byDepth);
  }

  // недостижимые узлы — внизу в ряд
  const placed = new Set(depthMap.keys());
  const free = nodes.filter(n => !placed.has(n.id));
  if (free.length) {
    const maxD = Math.max(...[...depthMap.values()]);
    const baseY = marginY + (maxD + 2) * levelHeight;
    let x = marginX;
    free.forEach(n => {
      n.y = baseY;
      n.x = x + n.w / 2;
      x += n.w + gapX;
    });
  }

  updateGraph();
}

const autolayoutBtn = document.getElementById("autolayout-btn");
if (autolayoutBtn) autolayoutBtn.onclick = () => autoLayoutKonverter(rootNodeId || nodes[0]?.id, true);

// resize selected
function resizeSelected(scale) {
  if (!selectedNode) return;
  ensureNodeSize(selectedNode);
  pushHistory();
  selectedNode.w = Math.max(30, selectedNode.w * scale);
  selectedNode.h = Math.max(30, selectedNode.h * scale);
  updateGraph();
}
const enlargeBtn = document.getElementById("enlarge-node-btn");
const shrinkBtn = document.getElementById("shrink-node-btn");
if (enlargeBtn) enlargeBtn.onclick = () => resizeSelected(1.2);
if (shrinkBtn) shrinkBtn.onclick = () => resizeSelected(0.8);

// ======= очистка =======
function clearAll() {
  nodes.length = 0;
  links.length = 0;
  rootNodeId = null;

  selectedNode = null;
  selectedEdge = null;
  edgeStartNode = null;

  historyStack.length = 0;

  const docName = document.getElementById("doc-name");
  const docPage = document.getElementById("doc-page");
  const docUur = document.getElementById("doc-uur");
  const docUdd = document.getElementById("doc-udd");
  if (docName) docName.value = "";
  if (docPage) docPage.value = "";
  if (docUur) docUur.value = "";
  if (docUdd) docUdd.value = "";
  if (recTextEl) recTextEl.innerText = "";

  const fileInput = document.getElementById("json-input");
  if (fileInput) fileInput.value = "";

  updateGraph();
  highlightRecText(null);
}

const clearBtn = document.getElementById("clear-btn");
if (clearBtn) clearBtn.addEventListener("click", clearAll);

// ======= JSON графа =======
function buildGraphJSON() {
  const docId = (document.getElementById("doc-name")?.value || "");
  const page = (document.getElementById("doc-page")?.value || "");
  const uur = (document.getElementById("doc-uur")?.value || "");
  const udd = (document.getElementById("doc-udd")?.value || "");
  const text = recTextEl ? (recTextEl.innerText || "") : "";

  const nodesJson = nodes.map(n => ({
    id: n.id,
    label: n.label || "",
    value: n.value ?? null,
    note: n.note ?? null,
    type: n.type || "",
    x: n.x || 0,
    y: n.y || 0,
    w: n.w || 0,
    h: n.h || 0,
    collapsed: !!n.collapsed
  }));

  const linksJson = links.map(l => ({
    source: l.source.id,
    target: l.target.id,
    predicate: (l.predicate || l.label || "").trim(),
    label: (l.label || "").trim(),
    scope: l.scope || "",
    scopeName: l.scopeName || ""
  }));

  return {
    doc: { id: docId, page, uur, udd, text },
    nodes: nodesJson,
    links: linksJson
  };
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function genStableId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  // fallback (если randomUUID недоступен)
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeToGraphOnly(payload) {
  return {
    doc: payload.doc || { id:"", page:"", uur:"", udd:"", text:"" },
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    links: Array.isArray(payload.links) ? payload.links : []
  };
}


// ======= PN.json -> граф (как konverter) =======
function buildGraphFromPN(pnData) {
  const docKey = Object.keys(pnData)[0];
  const diseaseKey = Object.keys(pnData[docKey])[0];
  const disease = pnData[docKey][diseaseKey];

  const rec = (disease.рекомендации || [])[0] || {};
  const gm = rec["группаМетодовЛечения"];
  const docName = document.getElementById("doc-name");
  const docPage = document.getElementById("doc-page");
  const docUur = document.getElementById("doc-uur");
  const docUdd = document.getElementById("doc-udd");
  if (docName) docName.value = docKey;
  if (docPage) docPage.value = rec["номерСтраницы"] || "";
  if (docUur) docUur.value = rec["УУР"] || "";
  if (docUdd) docUdd.value = rec["УДД"] || "";
  if (recTextEl) recTextEl.innerText = rec["оригинальныйТекст"] || "";

  nodes.length = 0;
  links.length = 0;
  selectedNode = null;
  selectedEdge = null;
  edgeStartNode = null;

  const nodesMap = new Map();
  function addNode(id, type, label, value, note) {
    if (nodesMap.has(id)) return nodesMap.get(id);
    const s = defaultNodeSize(type, type === "criteria" && (!!value || !!note));
    const n = {
      id,
      type,
      label: label || "",
      value: value ?? null,
      note: note ?? null,
      x: 0,
      y: 0,
      w: s.w,
      h: s.h,
      collapsed: false
    };
    nodesMap.set(id, n);
    nodes.push(n);
    return n;
  }

  const root = addNode("root_PN", "root", diseaseKey, null, null);
  // PN метаданные (чтобы PN -> граф -> PN был 1-в-1)
  root.pn = root.pn || {};
  root.pn.diseaseKey = diseaseKey;
  root.pn.recId = (rec.id && String(rec.id).trim()) ? String(rec.id).trim() : genStableId("rec");
  root.mkb = disease["кодМКБ"] || root.mkb || "";
  root.recType = rec["тип"] || root.recType || "";
  root.pn.methodsGroupId = (gm?.id && String(gm.id).trim()) ? String(gm.id).trim() : genStableId("methodsGroup");
  const cg0 = gm?.["группаКритериев"] || null;
  root.pn.criteriaGroupId = (cg0?.id && String(cg0.id).trim()) ? String(cg0.id).trim() : genStableId("criteriaGroup");
  // синхронизируем поля UI
  const mkbEl = document.getElementById("disease-mkb");
  const rtEl = document.getElementById("rec-type");
  if (mkbEl) mkbEl.value = root.mkb || "";
  if (rtEl) rtEl.value = root.recType || "";
  rootNodeId = root.id;

  const subs = gm["подгруппыМетодов"] || [];
  let methodChoice = null;

  if (subs.length === 1) {
    const sg = subs[0];
    methodChoice = addNode(sg.id || "methods_rule", "logic", normalizeLogicLabel("ИЛИ"), null, null);
    links.push({ source: root, target: methodChoice, label: "рекомендуется", predicate: "рекомендуется", scope: "", scopeName: "" });

    (sg["методыЛечения"] || []).forEach(m => {
      const mn = addNode(m.id, "method", m.label || m.id, null, null);
      links.push({ source: methodChoice, target: mn, label: "", predicate: "", scope: "", scopeName: "" });
    });
  } else {
    methodChoice = addNode("methods_choice", "logic", "ИЛИ", null, null);
    links.push({ source: root, target: methodChoice, label: "рекомендуется", predicate: "рекомендуется", scope: "", scopeName: "" });

    subs.forEach((sg, idx) => {
      const sgNode = addNode(sg.id || ("sg_" + idx), "logic", normalizeLogicLabel(sg["правилоВыбора"] || "ИЛИ"), null, null);
      links.push({ source: methodChoice, target: sgNode, label: "", predicate: "", scope: "", scopeName: "" });

      (sg["методыЛечения"] || []).forEach(m => {
        const mn = addNode(m.id, "method", m.label || m.id, null, null);
        links.push({ source: sgNode, target: mn, label: "", predicate: "", scope: "", scopeName: "" });
      });
    });
  }

  function mapCriteriaEdgeLabel(rawType) {
    const t = (rawType || "").trim().toLowerCase();
    if (!t) return "";
    if (t.includes("пациент")) return "критерий пациент";
    if (t.includes("симптом")) return "критерий симптом";
    if (t.includes("время")) return "критерий время";
    if (t.includes("возмож")) return "критерий возможность";
    if (t === "для") return "для";
    if (t === "при") return "при";
    return rawType;
  }

  function processCriteriaGroup(groupObj, parentNode) {
    const gNode = addNode(groupObj.id, "logic", normalizeLogicLabel(groupObj["правилоВыбора"] || "И"), null, null);
    links.push({ source: parentNode, target: gNode, label: "", predicate: "", scope: "", scopeName: "" });

    (groupObj["критерии"] || []).forEach(c => {
      const cid = c.id;
      const clabel = c["имя"] || cid;
      const cvalue = c["значение"] ? String(c["значение"]) : null;
      const cn = addNode(cid, "criteria", clabel, cvalue, null);

      const edgeLabel = mapCriteriaEdgeLabel(c["тип"] || "");
      links.push({ source: gNode, target: cn, label: edgeLabel, predicate: edgeLabel, scope: "", scopeName: "" });
    });

    (groupObj["подгруппыКритериев"] || []).forEach(sub => processCriteriaGroup(sub, gNode));
  }

  if (gm["группаКритериев"]) {
    processCriteriaGroup(gm["группаКритериев"], methodChoice);
  }

  historyStack.length = 0;
  autoLayoutKonverter(rootNodeId, false);
}

// ======= загрузка JSON =======
const jsonInput = document.getElementById("json-input");
if (jsonInput) {
  jsonInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        if (data.graph && Array.isArray(data.graph.nodes)) {
          loadGraphFromJSON(data.graph);
          alert("Загружен graph.json (обёрнутый в {graph})");
          return;
        }

        if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
          loadGraphFromJSON(data);
          alert("Загружен графовый JSON");
          return;
        }

        buildGraphFromPN(data);
        alert("Загружен PN.json и по нему построен граф.");
      } catch (err) {
        console.error(err);
        alert("Ошибка чтения JSON: " + err);
      }
    };
    reader.readAsText(file);
  });
}

function loadGraphFromJSON(graph) {
  nodes.length = 0;
  links.length = 0;
  selectedNode = null;
  selectedEdge = null;
  edgeStartNode = null;
  rootNodeId = null;

  (graph.nodes || []).forEach(n => {
    const t = n.type || "criteria";
    const hv = t === "criteria" && (!!n.value || !!n.note);
    const size = {
      w: n.w || defaultNodeSize(t, hv).w,
      h: n.h || defaultNodeSize(t, hv).h
    };
    nodes.push({
      id: n.id,
      label: n.label || "",
      value: n.value ?? null,
      note: n.note ?? null,
      type: t,
      x: n.x || 0,
      y: n.y || 0,
      w: size.w,
      h: size.h,
      collapsed: !!n.collapsed
    });
    if (t === "root" && !rootNodeId) rootNodeId = n.id;
  });

  const idMap = rebuildIdMap();

  (graph.links || []).forEach(l => {
    const sid = typeof l.source === "object" ? l.source.id : l.source;
    const tid = typeof l.target === "object" ? l.target.id : l.target;
    const s = idMap.get(sid);
    const t = idMap.get(tid);
    if (!s || !t) return;

    const pred = (l.predicate || l.label || "").trim();
    const lbl = (l.label || pred || "").trim();

    links.push({
      source: s,
      target: t,
      predicate: pred,
      label: lbl,
      scope: l.scope || "",
      scopeName: l.scopeName || ""
    });
  });

  if (graph.doc) {
    const docName = document.getElementById("doc-name");
    const docPage = document.getElementById("doc-page");
    const docUur = document.getElementById("doc-uur");
    const docUdd = document.getElementById("doc-udd");
    if (docName) docName.value = graph.doc.id || "";
    if (docPage) docPage.value = graph.doc.page || "";
    if (docUur) docUur.value = graph.doc.uur || "";
    if (docUdd) docUdd.value = graph.doc.udd || "";
    if (recTextEl) recTextEl.innerText = graph.doc.text || "";
  }

  historyStack.length = 0;
  autoLayoutKonverter(rootNodeId || nodes[0]?.id, false);
}

// ======= backend calls =======
async function backendToTTL(graph) {
  const resp = await fetch(`${API_BASE}/api/graph/to-ttl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph)
  });
  if (!resp.ok) throw new Error("Ошибка backend при формировании TTL");
  return await resp.text();
}
async function backendToTriples(graph) {
  const resp = await fetch(`${API_BASE}/api/graph/to-triples`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph)
  });
  if (!resp.ok) throw new Error("Ошибка backend при формировании троек");
  return await resp.json();
}




const exportXlsxBtn = document.getElementById("export-xlsx-btn");
if (exportXlsxBtn) {
  exportXlsxBtn.onclick = async () => {
    if (!nodes.length) {
      alert("Сначала нарисуйте или загрузите граф.");
      return;
    }

    try {
      const graphWH = buildGraphWithHierarchyJSON();
      const graphOnly = normalizeToGraphOnly(graphWH);
      const triples = buildTriplesFromGraph(graphOnly);

      const rows = [
        ["объект", "субъект", "предикат"],
        ...triples.map(t => [t.объект, t.субъект, t.предикат])
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "triples");

      XLSX.writeFile(wb, (graphOnly.doc.id || "triples") + ".xlsx");
    } catch (e) {
      console.error(e);
      alert(e.message || "Ошибка при выгрузке XLSX");
    }
  };
}


// старт
updateGraph();



// ======= EXPORT: PN.json (иерархия как в примере PN) =======

function logicLabelToRule(lbl) {
  const s = (lbl || "").trim().toUpperCase();
  if (s === "ИЛИ" || s === "ANY") return "ANY";
  if (s === "И" || s === "ALL") return "ALL";
  if (s === "НЕТ" || s === "NOT") return "NOT";
  return "ANY";
}

function predicateToPNCriteriaType(pred) {
  const p = (pred || "").trim().toLowerCase();
  if (!p) return "";
  if (p.includes("критерий пациент")) return "КритерийПациент";
  if (p.includes("критерий симптом")) return "КритерийСимптом";
  if (p.includes("критерий время")) return "КритерийВремя";
  if (p.includes("критерий возмож")) return "КритерийВозможность";
  if (p === "для") return "для";
  if (p === "при") return "при";
  return pred || "";
}

// helper: build outgoing index + link lookup
function buildAdjacency() {
  const out = new Map();
  const linkByST = new Map();
  nodes.forEach(n => out.set(n.id, []));
  links.forEach(l => {
    const s = l.source?.id, t = l.target?.id;
    if (!s || !t) return;
    if (!out.has(s)) out.set(s, []);
    out.get(s).push(t);
    linkByST.set(s + "->" + t, l);
  });
  return { out, linkByST };
}

// choose ONE parent per node (PN is hierarchical)
function buildPrimaryTree(rootId) {
  const idMap = rebuildIdMap();
  const incoming = new Map();
  nodes.forEach(n => incoming.set(n.id, []));
  links.forEach(l => {
    const s = l.source?.id, t = l.target?.id;
    if (!s || !t) return;
    incoming.get(t)?.push(s);
  });

  function parentRank(pid) {
    const n = idMap.get(pid);
    if (!n) return 999;
    if (n.type === "root") return 0;
    if (n.type === "logic") return 1;
    if (n.type === "method") return 2;
    if (n.type === "criteria") return 3;
    return 10;
  }

  const parentOf = new Map();
  nodes.forEach(n => {
    if (n.id === rootId) return;
    const ps = (incoming.get(n.id) || []).filter(x => idMap.has(x));
    if (!ps.length) return;
    ps.sort((a, b) => parentRank(a) - parentRank(b));
    parentOf.set(n.id, ps[0]);
  });

  const childrenOf = new Map();
  nodes.forEach(n => childrenOf.set(n.id, []));
  parentOf.forEach((p, c) => {
    if (!childrenOf.get(p).includes(c)) childrenOf.get(p).push(c);
  });

  return { idMap, parentOf, childrenOf };
}

function buildPNJSONFromCanvas() {
  if (!nodes.length) return null;

  const graph = buildGraphJSON(); // doc fields from sidebar
  const docKey = (graph.doc.id || "document").trim() || "document";

  const { out, linkByST } = buildAdjacency();

  // find root node
  const root = nodes.find(n => n.type === "root") || nodes[0];
  const rootId = root?.id;
  const diseaseKey = (root?.label || "Заболевание").trim() || "Заболевание";

  // build primary tree for hierarchy decisions
  const { idMap, childrenOf } = buildPrimaryTree(rootId);

  // find "start method container": edge root -> method with predicate "рекомендуется" (preferred)
  const rootChildren = (childrenOf.get(rootId) || []).map(id => idMap.get(id)).filter(Boolean);
  let startMethod = null;
  for (const ch of rootChildren) {
    if (ch.type !== "method") continue;
    const l = linkByST.get(rootId + "->" + ch.id);
    const pred = (l?.predicate || l?.label || "").toLowerCase();
    if (pred.includes("рекомендуется")) { startMethod = ch; break; }
  }
  if (!startMethod) startMethod = rootChildren.find(n => n.type === "method") || null;

  // collect method descendants (exclude the container itself)
  function collectDescendantMethods(containerId) {
    const res = [];
    const st = [containerId];
    const seen = new Set();
    while (st.length) {
      const cur = st.pop();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);
      const kids = (childrenOf.get(cur) || []);
      for (const k of kids) {
        const kn = idMap.get(k);
        if (!kn) continue;
        if (kn.type === "criteria") continue; // criteria handled separately
        if (kn.type === "method" && kn.id !== containerId) res.push(kn);
        // go through logic and method nodes to reach methods below
        if (kn.type === "logic" || kn.type === "method") st.push(kn.id);
      }
    }
    // unique by id, stable
    const seenIds = new Set();
    return res.filter(m => (seenIds.has(m.id) ? false : (seenIds.add(m.id), true)));
  }

  // subgroup rule: first logic child under container, else ANY
  function subgroupRule(containerId) {
    const kids = (childrenOf.get(containerId) || []).map(id => idMap.get(id)).filter(Boolean);
    const lg = kids.find(n => n.type === "logic");
    return logicLabelToRule(lg?.label || "ИЛИ");
  }

  const subgroups = [];
  if (startMethod) {
    const ms = collectDescendantMethods(startMethod.id);
    subgroups.push({
      id: (g.pn?.id && String(g.pn.id).trim()) ? String(g.pn.id).trim() : genStableId("subMethods") + (startMethod.id || "1"),
      правилоВыбора: subgroupRule(startMethod.id),
      методыЛечения: ms.map(m => ({ id: m.id, label: m.label || m.id }))
    });
  } else {
    // fallback: all methods directly under root as one subgroup
    const ms = rootChildren.filter(n => n.type === "method");
    subgroups.push({
      id: "подгруппаМетодов_1",
      правилоВыбора: "ANY",
      методыЛечения: ms.map(m => ({ id: m.id, label: m.label || m.id }))
    });
  }

  // ===== Criteria group builder (nested like PN where possible) =====
  function buildCriteriaGroupFromLogic(logicId) {
    const lnNode = idMap.get(logicId);
    const ln = idMap.get(logicId);
    const kids = (childrenOf.get(logicId) || []).map(id => idMap.get(id)).filter(Boolean);

    const group = {
      id: (ln?.pn?.id && String(ln.pn.id).trim()) ? String(ln.pn.id).trim() : (genStableId("subCriteria") + "_" + logicId),
      правилоВыбора: logicLabelToRule(ln?.label || "И"),
      критерии: [],
      подгруппыКритериев: []
    };

    for (const k of kids) {
      const lnk = linkByST.get(logicId + "->" + k.id);
      const pred = (lnk?.predicate || lnk?.label || "").trim();

      if (k.type === "criteria") {
        const c = { id: k.id, тип: predicateToPNCriteriaType(pred), имя: (k.label || k.id) };
        if (k.value != null && String(k.value).trim() !== "") c.значение = String(k.value);
        group.критерии.push(c);
      } else if (k.type === "logic") {
        group.подгруппыКритериев.push(buildCriteriaGroupFromLogic(k.id));
      }
    }
    return group;
  }

  // choose criteria root:
  // 1) if there's a logic node under the startMethod subtree that has criteria children, use it
  function findLogicWithCriteria(startId) {
    const st = [startId];
    const seen = new Set();
    while (st.length) {
      const cur = st.pop();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);
      const kids = (childrenOf.get(cur) || []).map(id => idMap.get(id)).filter(Boolean);
      for (const k of kids) {
        if (k.type === "criteria") continue;
        if (k.type === "logic") {
          // does this logic have direct criteria child?
          const lk = (childrenOf.get(k.id) || []).map(id => idMap.get(id)).filter(Boolean);
          if (lk.some(x => x.type === "criteria")) return k.id;
          st.push(k.id);
        } else if (k.type === "method") {
          st.push(k.id);
        }
      }
    }
    return null;
  }

  const critLogicId = startMethod ? findLogicWithCriteria(startMethod.id) : null;

  // direct criteria linked from the startMethod (or root) -> put into top group
  function collectDirectCriteria(fromId) {
    const arr = [];
    const kids = (childrenOf.get(fromId) || []).map(id => idMap.get(id)).filter(Boolean);
    for (const k of kids) {
      if (k.type !== "criteria") continue;
      const lnk = linkByST.get(fromId + "->" + k.id);
      const pred = (lnk?.predicate || lnk?.label || "").trim();
      const c = { id: k.id, тип: predicateToPNCriteriaType(pred), имя: (k.label || k.id) };
      if (k.value != null && String(k.value).trim() !== "") c.значение = String(k.value);
      arr.push(c);
    }
    return arr;
  }

  const topCriteria = [];
  if (startMethod) topCriteria.push(...collectDirectCriteria(startMethod.id));
  else if (rootId) topCriteria.push(...collectDirectCriteria(rootId));

  const criteriaGroup = {
    id: (root.pn?.criteriaGroupId || genStableId("criteriaGroup")),
    правилоВыбора: "ALL",
    критерии: topCriteria,
    подгруппыКритериев: []
  };

  if (critLogicId) {
    // логические критерии как вложенные подгруппы
    criteriaGroup.подгруппыКритериев.push(buildCriteriaGroupFromLogic(critLogicId));
  }

  // Recommendation + top PN structure
  const pn = {
    [docKey]: {
      [diseaseKey]: {
        кодМКБ: "",
        рекомендации: [
          {
            id: (root.pn?.recId || genStableId("rec")),
            тип: "",
            УДД: graph.doc.udd || "",
            УУР: graph.doc.uur || "",
            номерСтраницы: graph.doc.page || "",
            оригинальныйТекст: graph.doc.text || "",
            группаМетодовЛечения: {
              id: (root.pn?.methodsGroupId || genStableId("methodsGroup")),
              подгруппыМетодов: subgroups,
              группаКритериев: criteriaGroup
            }
          }
        ]
      }
    }
  };

  return pn;
}

const savePnBtn = document.getElementById("save-pn-json-btn");
if (savePnBtn) {
  savePnBtn.onclick = () => {
    if (!nodes.length) {
      alert("Сначала нарисуйте или загрузите граф.");
      return;
    }
    const pn = buildPNJSONFromCanvas();
    downloadFile("PN.json", JSON.stringify(pn, null, 2), "application/json;charset=utf-8");
  };
}


function buildPNJSONFromCanvas_v2() {
  if (!nodes.length) return null;

  // doc
  const docId = (document.getElementById("doc-name")?.value || "").trim();
  const page = (document.getElementById("doc-page")?.value || "");
  const uur = (document.getElementById("doc-uur")?.value || "");
  const udd = (document.getElementById("doc-udd")?.value || "");
  const text = (recTextEl ? (recTextEl.innerText || "") : "");

  const docKey = docId || "document";

  const idMap = rebuildIdMap();
  const norm = (s) => (s || "").trim();
  const up = (s) => norm(s).toUpperCase();

  // root
  const root = nodes.find(n => n.type === "root") || nodes[0];
  if (!root) return null;
  const diseaseKey = norm(root.label) || "Заболевание";

  // edge lookup + outgoing
  const out = new Map();
  const linkByST = new Map();
  nodes.forEach(n => out.set(n.id, []));
  links.forEach(l => {
    const s = l.source?.id, t = l.target?.id;
    if (!s || !t) return;
    if (!out.has(s)) out.set(s, []);
    out.get(s).push(t);
    linkByST.set(s + "->" + t, l);
  });

  const getPred = (s, t) => {
    const l = linkByST.get(s + "->" + t);
    return norm(l?.predicate || l?.label || "");
  };

  function logicLabelToRule(lbl) {
    const s = up(lbl);
    if (s === "ИЛИ" || s === "ANY") return "ANY";
    if (s === "И" || s === "ALL") return "ALL";
    if (s === "НЕТ" || s === "NOT") return "NOT";
    return "ANY";
  }

  function predicateToPNCriteriaType(pred) {
    const p = norm(pred).toLowerCase();
    if (!p) return "";
    if (p.includes("критерий пациент")) return "КритерийПациент";
    if (p.includes("критерий симптом")) return "КритерийСимптом";
    if (p.includes("критерий время")) return "КритерийВремя";
    if (p.includes("критерий возмож")) return "КритерийВозможность";
    if (p === "для") return "для";
    if (p === "при") return "при";
    return pred || "";
  }

  // 1) root -> (logic)? допускаем 0 или 1 логический узел под заболеванием
  const rootKids = (out.get(root.id) || []).map(id => idMap.get(id)).filter(Boolean);
  const rootLogicKids = rootKids.filter(n => n.type === "logic");

  if (rootLogicKids.length > 1) {
    alert("Пока поддерживается либо 0, либо 1 красная вершина (правило выбора) сразу под заболеванием.");
    return null;
  }

  const methodsChoice = (rootLogicKids.length === 1) ? rootLogicKids[0] : null;

  // 2) Методы лечения: все зелёные достижимые из methodsChoice, иначе напрямую от root
  function collectMethodsFrom(startLogicId) {
    const res = [];
    const st = [startLogicId];
    const seen = new Set();

    while (st.length) {
      const cur = st.pop();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);

      const kids = (out.get(cur) || []).map(id => idMap.get(id)).filter(Boolean);
      for (const k of kids) {
        if (k.type === "method") res.push(k);
        if (k.type === "logic") st.push(k.id);
      }
    }

    const ids = new Set();
    return res.filter(m => (ids.has(m.id) ? false : (ids.add(m.id), true)));
  }

  const methods = methodsChoice
    ? collectMethodsFrom(methodsChoice.id)
    : rootKids.filter(n => n.type === "method");

  const methodsRule = methodsChoice
    ? logicLabelToRule(methodsChoice.label || "ИЛИ")
    : "ANY";

  // метаданные связи parent->method (edgeLabel) берём там, где реально висит метод
  function methodParentAndEdge(methodId) {
    // найдём любой входящий родитель (логика/корень) в рамках out/linkByST
    // (в PN всё равно иерархия, так что достаточно первого)
    for (const [key, l] of linkByST.entries()) {
      const [s, t] = key.split("->");
      if (t === methodId) {
        return { parentId: s, edgeLabel: norm(l?.predicate || l?.label || "") };
      }
    }
    return { parentId: "", edgeLabel: "" };
  }

  const subgroups = [{
    id: (methodsChoice?.pn?.id && String(methodsChoice.pn.id).trim())
      ? String(methodsChoice.pn.id).trim()
      : genStableId("subMethods"),

    правилоВыбора: methodsRule,

    // ✅ сохраняем и label, и type, и надпись на связи
    методыЛечения: methods.map(m => {
      const info = methodParentAndEdge(m.id);
      return {
        id: m.id,
        label: m.label || m.id,
        nodeType: m.type || "method",
        edgeLabel: info.edgeLabel || ""   // например "используется"
      };
    })
  }];

  // 3) Критерии: строим PN-группы из логики
  function buildCriteriaGroupFromLogic(logicId) {
    const lnNode = idMap.get(logicId); // ✅ важно: чтобы не было lnNode is not defined
    const ln = lnNode;

    const grp = {
      id: (lnNode?.pn?.id && String(lnNode.pn.id).trim())
        ? String(lnNode.pn.id).trim()
        : (genStableId("subCriteria") + "_" + logicId),

      правилоВыбора: logicLabelToRule(ln?.label || "И"),
      критерии: [],
      подгруппыКритериев: []
    };

    const kids = (out.get(logicId) || []).map(id => idMap.get(id)).filter(Boolean);

    for (const k of kids) {
      const edgeLbl = getPred(logicId, k.id); // надпись на ребре logic -> child

      if (k.type === "criteria") {
        // ✅ сохраняем label/type ребра и label/type вершины
        const c = {
          id: k.id,
          имя: k.label || k.id,
          nodeType: k.type || "criteria",
          edgeLabel: edgeLbl || "",                    // например "критерий пациент"
          тип: predicateToPNCriteriaType(edgeLbl || "") // как раньше (PN-поле)
        };

        if (k.value != null && String(k.value).trim() !== "") c.значение = String(k.value);
        if (k.note != null && String(k.note).trim() !== "") c.уточнение = String(k.note);

        grp.критерии.push(c);

      } else if (k.type === "logic") {
        // ✅ можно тоже сохранить edgeLabel у подгруппы (если хочешь)
        const sub = buildCriteriaGroupFromLogic(k.id);
        sub.edgeLabel = edgeLbl || "";        // надпись на связи logic -> logic (если есть)
        sub.nodeType = k.type || "logic";     // тип дочерней вершины
        sub.label = k.label || "";            // label дочерней вершины
        grp.подгруппыКритериев.push(sub);
      }
    }

    return grp;
  }

  const criteriaGroup = {
    id: (root.pn?.criteriaGroupId || genStableId("criteriaGroup")),
    правилоВыбора: "ALL",
    критерии: [],
    подгруппыКритериев: methodsChoice ? [buildCriteriaGroupFromLogic(methodsChoice.id)] : []
  };

  // 4) Финальный PN
  return {
    [docKey]: {
      [diseaseKey]: {
        кодМКБ: root.mkb || "",
        рекомендации: [{
          id: (root.pn?.recId || genStableId("rec")),
          тип: root.recType || "",
          УДД: udd || "",
          УУР: uur || "",
          номерСтраницы: page || "",
          оригинальныйТекст: text || "",
          группаМетодовЛечения: {
            id: (root.pn?.methodsGroupId || genStableId("methodsGroup")),
            подгруппыМетодов: subgroups,
            группаКритериев: criteriaGroup
          }
        }]
      }
    }
  };
}



(function() {
  const btn = document.getElementById("save-graph-json-btn");
  if (!btn) return;

  btn.onclick = () => {
    if (!nodes.length) {
      alert("Сначала нарисуйте или загрузите граф.");
      return;
    }
    const payload = buildGraphWithHierarchyJSON();
    downloadFile("graph_with_hierarchy.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  };
})();



function buildGraphWithHierarchyJSON() {
  const graph = buildGraphJSON();

  // строим "id" для link как "source->target"
  const linkId = (l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return `${s}->${t}`;
  };

  // groups: группируем связи по (scope + scopeName + owner/source)
  // чтобы было понятно "к какой группе относится критерий/метод"
  const groupsMap = new Map();

  for (const l of graph.links) {
    const scope = (l.scope || "").trim();
    const scopeName = (l.scopeName || "").trim();

    // В иерархии сохраняем только контейнерные ребра: где указаны группа/подгруппа
    if (!(scope === "группа" || scope === "подгруппа")) continue;

    const ownerId = l.source;
    const key = `${scope}||${scopeName}||${ownerId}`;

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        id: `grp_${groupsMap.size + 1}`,
        scope,
        name: scopeName,
        ownerId,
        linkIds: [],
        nodeIds: []
      });
    }

    const g = groupsMap.get(key);
    g.linkIds.push(linkId(l));
    g.nodeIds.push(l.target);
  }

  // чистим дубли
  const groups = [...groupsMap.values()].map(g => ({
    ...g,
    linkIds: [...new Set(g.linkIds)],
    nodeIds: [...new Set(g.nodeIds)]
  }));

  const root = graph.nodes.find(n => n.type === "root") || graph.nodes[0] || null;

  return {
    ...graph,
    hierarchy: {
      rootId: root ? root.id : null,
      groups
    }
  };
}


function normalizeToGraphOnly(payload) {
  // поддержка: {doc,nodes,links,hierarchy...} и любые лишние поля
  return {
    doc: payload.doc || { id:"", page:"", uur:"", udd:"", text:"" },
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    links: Array.isArray(payload.links) ? payload.links : []
  };
}

(function () {
  const fileEl = document.getElementById("graph-file-to-backend");
  const btnEl = document.getElementById("graph-file-to-ttl-btn");
  if (!fileEl || !btnEl) return;

  let lastPayload = null;

  fileEl.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        lastPayload = JSON.parse(r.result);
        alert("JSON загружен. Можно конвертировать в TTL/тройки.");
      } catch (err) {
        console.error(err);
        alert("Ошибка чтения JSON: " + err);
      }
    };
    r.readAsText(f);
  });

  btnEl.onclick = async () => {
    if (!lastPayload) {
      alert("Сначала выберите JSON-файл.");
      return;
    }
    try {
      const graph = normalizeToGraphOnly(lastPayload);

      const ttl = await backendToTTL(graph);         // уже есть у тебя :contentReference[oaicite:2]{index=2}
      const triples = await backendToTriples(graph); // уже есть у тебя :contentReference[oaicite:3]{index=3}

      downloadFile("recommendation.ttl", ttl, "text/turtle;charset=utf-8");
      downloadFile("triples.json", JSON.stringify({ graph, triples }, null, 2), "application/json;charset=utf-8");
    } catch (e) {
      console.error(e);
      alert(e.message || "Ошибка при работе с backend");
    }
  };
})();


// ======= TRIPLES (правильные по graph) =======

function buildTriplesFromGraph(graph) {
  // Универсальный конвертер JSON -> тройки.
  // Ключевое: логика МЕТОДОВ и логика КРИТЕРИЕВ разделены, направление стрелок не важно.
  if (!graph) return [];

  const nodes = graph.nodes || [];
  const links = graph.links || [];
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // индексы рёбер
  const out = new Map();
  const inc = new Map();
  function pushMap(m, k, v) {
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(v);
  }
  links.forEach(l => {
    pushMap(out, l.source, l);
    pushMap(inc, l.target, l);
  });

  function allEdgesOf(id) {
    return [...(out.get(id) || []), ...(inc.get(id) || [])];
  }
  function otherEnd(l, id) {
    return l.source === id ? l.target : l.source;
  }

  function typeOf(id) {
    const n = nodeById.get(id);
    return (n && n.type) ? n.type : "";
  }
  function rawLabelOf(id) {
    const n = nodeById.get(id);
    return (n && n.label != null) ? String(n.label) : String(id);
  }
  function clean(s) {
    return String(s ?? "").replace(/\u00A0/g, " ").trim();
  }
  function predOf(l) {
    return clean(l.predicate || l.label || "");
  }
  function predLow(l) {
    return predOf(l).toLowerCase();
  }

  function rootShortLabel(rootId) {
    const lbl = clean(rawLabelOf(rootId));
    const m = lbl.match(/\(([^)]+)\)/);
    return (m && m[1]) ? clean(m[1]) : lbl;
  }

  const rootId = (graph.hierarchy && graph.hierarchy.rootId)
    ? graph.hierarchy.rootId
    : (nodes.find(n => n.type === "root")?.id || (nodes[0] ? nodes[0].id : null));
  const ROOT_SHORT = rootId ? rootShortLabel(rootId) : "";

  function displayLabel(id) {
    const t = typeOf(id);
    let lbl = clean(rawLabelOf(id));
    if (t === "root") return ROOT_SHORT || lbl;
    if (t === "method" && lbl) return lbl[0].toLowerCase() + lbl.slice(1);
    return lbl;
  }
  function logicOp(id) {
    return clean(displayLabel(id)).toUpperCase(); // И / ИЛИ / НЕТ
  }

  const isMethod = (id) => typeOf(id) === "method";
  const isCriteria = (id) => typeOf(id) === "criteria";
  const isLogic = (id) => typeOf(id) === "logic";

  // ======= ИЕРАРХИЯ (группы/подгруппы) =======
  const groups = (graph.hierarchy && Array.isArray(graph.hierarchy.groups)) ? graph.hierarchy.groups : [];
  const parentOf = new Map(); // childNodeId -> ownerId
  const scopedLinkIds = new Set();
  groups.forEach(g => {
    (g.nodeIds || []).forEach(nid => parentOf.set(nid, g.ownerId));
    (g.linkIds || []).forEach(lid => scopedLinkIds.add(lid));
  });

  function linkIdOf(l) { return `${l.source}->${l.target}`; }
  function isScopedEdge(l) {
    return (l.scope === "группа" || l.scope === "подгруппа" || scopedLinkIds.has(linkIdOf(l)));
  }

  // ======= Разделение рёбер: методы vs критерии =======
  function isCriteriaPredicate(p0) {
    const p = clean(p0).toLowerCase();
    return p === "критерий" || p.startsWith("критерий") || p === "для" || p.startsWith("для") || p === "при" || p.startsWith("при");
  }

  function isStructuralEdge(l) {
    if (isScopedEdge(l)) return true;
    const p = predLow(l);
    if (p === "" || p.includes("рекомендуется")) return true;

    // "используется" — структурное ТОЛЬКО для method<->logic
    if (p.includes("используется")) {
      const sT = typeOf(l.source);
      const tT = typeOf(l.target);
      return (sT === "logic" || tT === "logic");
    }
    return false;
  }

  // методные "структурные" рёбра (обход выражений методов)
  function isMethodEdge(l) {
    const p = predLow(l);
    // Критериальные предикаты исключаем из методного слоя ТОЛЬКО если они реально ведут к criteria-узлу.
    // Предикат "критерий" в методном слое нередко используется как структурная связь logic->logic
    // (контейнер/подконтейнер методов). Если второй конец НЕ criteria — это допустимая методная связь.
    if (isCriteriaPredicate(p)) {
      const aT = typeOf(l.source), bT = typeOf(l.target);
      if (aT === "criteria" || bT === "criteria") return false;
    }

    // scope-ребра могут соединять методную и критериальную логику — это надо разделить
    if (isScopedEdge(l)) {
      const aT = typeOf(l.source), bT = typeOf(l.target);

      // если логический узел "критериальный" — не пускаем его в методный слой
      if (aT === "logic" && logicKind(l.source) === "criteria") return false;
      if (bT === "logic" && logicKind(l.target) === "criteria") return false;

      // если logic-logic — принимаем только если оба logic методные
      if (aT === "logic" && bT === "logic") {
        return logicKind(l.source) === "method" && logicKind(l.target) === "method";
      }

      // scope для методов: допускаем root/method/logic(методный)
      return (
        aT === "root" || bT === "root" ||
        aT === "method" || bT === "method" ||
        aT === "logic" || bT === "logic"
      );
    }

    // legacy: пусто / используется / рекомендуется
    return p === "" || p.includes("используется") || p.includes("рекомендуется");
  }

  // определяем "тип" логического узла по окружению: method|criteria
  const logicKindCache = new Map();
  function logicKind(id) {
    if (!id || typeOf(id) !== "logic") return null;
    if (logicKindCache.has(id)) return logicKindCache.get(id);

    let mScore = 0, cScore = 0;
    for (const e of allEdgesOf(id)) {
      const p = predLow(e);
      const o = otherEnd(e, id);
      const ot = typeOf(o);

      // критерийный сигнал: критерийные предикаты или сосед-criteria
      if (isCriteriaPredicate(p) || ot === "criteria") cScore++;

      // методный сигнал: сосед-method или "структурные" method-предикаты
      if (!isCriteriaPredicate(p) && (ot === "method" || p === "" || p.includes("используется") || p.includes("рекомендуется"))) {
        mScore++;
      }
    }

    // если смешанный — считаем критериальным (безопаснее, чтобы не порождать лишние method-связи)
    const kind = (cScore > 0 && mScore === 0) ? "criteria"
      : (mScore > 0 && cScore === 0) ? "method"
      : (cScore >= mScore) ? "criteria" : "method";

    logicKindCache.set(id, kind);
    return kind;
  }

  // критериальные рёбра (обход дерева критериев)
  function isCriteriaEdge(l) {
    const p0 = predOf(l);
    if (isCriteriaPredicate(p0)) return true;

    if (isScopedEdge(l)) {
      const aT = typeOf(l.source), bT = typeOf(l.target);

      // если логический узел "методный" — не пускаем его в критериальный слой
      if (aT === "logic" && logicKind(l.source) === "method") return false;
      if (bT === "logic" && logicKind(l.target) === "method") return false;

      // scope для критериев: допускаем criteria/logic(критериальный)
      return (
        aT === "criteria" || bT === "criteria" ||
        aT === "logic" || bT === "logic"
      );
    }
    return false;
  }

  // ======= Служебные обходы: методы =======
  function collectLeafMethods(startId, excludeId = null) {
    const res = new Set();
    const q = [startId];
    const seen = new Set();
    while (q.length) {
      const cur = q.shift();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);

      if (isMethod(cur)) {
        if (!excludeId || cur !== excludeId) res.add(cur);
        continue;
      }

      for (const l of allEdgesOf(cur)) {
        if (!isMethodEdge(l)) continue;
        q.push(otherEnd(l, cur));
      }
    }
    return [...res];
  }

  // smart: поддержка "инвертированных" групп, когда ownerId=logic, а method лежит в nodeIds группы
  const logicContainsMethods = new Map(); // logicId -> methodIds
  groups.forEach(g => {
    const owner = g.ownerId;
    if (!isLogic(owner)) return;
    const arr = logicContainsMethods.get(owner) || [];
    (g.nodeIds || []).forEach(nid => { if (isMethod(nid)) arr.push(nid); });
    if (arr.length) logicContainsMethods.set(owner, [...new Set(arr)]);
  });

  function collectLeafMethodsSmart(startId) {
    if (!startId) return [];
    if (isMethod(startId)) {
      const owner = parentOf.get(startId);
      if (owner && isLogic(owner)) {
        const ms = collectLeafMethods(owner, null);
        const others = ms.filter(x => x !== startId);
        if (others.length) return others;
      }
      return [startId];
    }
    return collectLeafMethods(startId, null);
  }

  function containerMethodForLogic(logicId, recommendedMethodsSet) {
    // Возвращает "контейнерный" метод для логического узла (И/ИЛИ/НЕТ) в методном слое.
    // Должно работать при любой ориентации стрелок, и при разных вариантах hierarchy.
    // 1) инверт: logic содержит method (через hierarchy.groups)
    const inside = logicContainsMethods.get(logicId) || [];
    if (inside.length) {
      const pref = inside.find(x => recommendedMethodsSet && recommendedMethodsSet.has(x));
      return pref || inside[0];
    }

    // 2) owner-цепочка в hierarchy.groups (logic -> ... -> method)
    let cur = logicId;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOf.get(cur) || null;
      if (cur && isMethod(cur)) {
        if (recommendedMethodsSet && recommendedMethodsSet.has(cur)) return cur;
        return cur;
      }
    }

    // 3) BFS по methodEdge вокруг logicId (направление не важно)
    // Ищем ближайший method; приоритет - рекомендованный.
    const q = [{ id: logicId, dist: 0 }];
    const seen2 = new Set([logicId]);
    let bestAny = null;

    while (q.length) {
      const { id } = q.shift();
      for (const l of allEdgesOf(id)) {
        if (!isMethodEdge(l)) continue;
        const o = otherEnd(l, id);
        if (!o || seen2.has(o)) continue;
        seen2.add(o);

        if (isMethod(o)) {
          // Контейнером считаем только метод, который реально содержит другие методы (не leaf).
          const sub = collectLeafMethods(o).filter(x => x !== o);
          if (sub.length > 0) {
            if (recommendedMethodsSet && recommendedMethodsSet.has(o)) return o;
            if (!bestAny) bestAny = o;
          }
          // leaf-методы (как "анастезия") контейнером НЕ считаем
        }
        q.push({ id: o, dist: 0 });
      }
    }

    return bestAny;
  }

  // ======= Служебные обходы: критерии =======
  function leafCriteriaUnderWithFlags(startId) {
    // IMPORTANT: это КРИТЕРИАЛЬНЫЙ слой, ходим только по isCriteriaEdge
    const res = [];
    // viaPred: предикат ребра, по которому мы пришли к criteria (важно: не схлопывать несколько "при")
    const q = [{ id: startId, not: false, viaPred: "" }];
    const seen = new Set();
    while (q.length) {
      const { id, not, viaPred } = q.shift();
      // один и тот же criteria может быть достижим по разным предикатам (например, несколько "при")
      const sk = `${id}|||${clean(viaPred).toLowerCase()}|||${not ? 1 : 0}`;
      if (!id || seen.has(sk)) continue;
      seen.add(sk);

      const t = typeOf(id);
      const nextNot = not || (t === "logic" && logicOp(id) === "НЕТ");

      if (t === "criteria") {
        const lbl = clean(displayLabel(id));
        // НИЧЕГО НЕ ИГНОРИРУЕМ: все вершины и критерии должны экспортироваться
        res.push({ id, lbl, not: nextNot, pred: clean(viaPred) });
        continue;
      }

      for (const l of allEdgesOf(id)) {
        if (!isCriteriaEdge(l)) continue;

        // не поднимаемся вверх из подгруппы (НЕТ/другая логика) к родителю через scoped-связь
        // иначе NOT "заражает" соседние критерии, которые не находятся под НЕТ
        const otherTmp = otherEnd(l, id);
        // В некоторых json target/source могут быть как объектами, так и строковыми id.
        // Если проверять только l.target.id, можно не распознать входящую scoped-связь
        // и тогда НЕТ "заражает" соседние критерии, которые не находятся под НЕТ.
        const isIncomingToCurrent = (l.target === id) || (l.target && l.target.id === id);
        if (isScopedEdge(l) && isLogic(otherTmp) && isIncomingToCurrent) continue;

        const nxt = otherEnd(l, id);
        const p = predOf(l);
        // предикат фиксируем на шаге, когда реально попадаем на criteria
        q.push({ id: nxt, not: nextNot, viaPred: (isCriteria(nxt) ? p : viaPred) });
      }
    }
    return res;
  }

  function criterionPredicateFor(criteriaId) {
    // берём по любому критериальному ребру criteria<->(logic|method)
    const cand = [];
    for (const l of allEdgesOf(criteriaId)) {
      if (!isCriteriaEdge(l)) continue;
      const o = otherEnd(l, criteriaId);
      const oT = typeOf(o);
      if (oT === "logic" || oT === "method") cand.push(l);
    }
    if (!cand.length) return "критерий";

    const rank = (p) => {
      const s = clean(p).toLowerCase();
      if (s.startsWith("критерий симптом")) return 1;
      if (s.startsWith("критерий пациент")) return 2;
      if (s.startsWith("для")) return 3;
      if (s.startsWith("при")) return 4;
      if (s.startsWith("критерий")) return 5;
      return 9;
    };
    cand.sort((a, b) => rank(predOf(a)) - rank(predOf(b)));
    return predOf(cand[0]) || "критерий";
  }

  // ======= 0) базовые тройки =======
  const triples = [];
  if (ROOT_SHORT) triples.push({ объект: ROOT_SHORT, субъект: "пациенты", предикат: "диагноз" });

  // ======= 1) рекомендации (направление не важно) =======
  const recommendedTargets = [];
  if (rootId != null) {
    for (const l of allEdgesOf(rootId)) {
      if (!predLow(l).includes("рекомендуется")) continue;
      recommendedTargets.push(otherEnd(l, rootId));
    }
  }

  const recommendedMethods = new Set();
  recommendedTargets.forEach(tgt => {
    if (isMethod(tgt)) recommendedMethods.add(tgt);
    else collectLeafMethodsSmart(tgt).forEach(m => recommendedMethods.add(m));
  });

  // Если в графе нет явных рёбер "рекомендуется" (или root не задан),
  // экспорт всё равно должен работать: берём ВСЕ методы как базовый набор.
  if (recommendedMethods.size === 0) {
    nodes.forEach(n => { if (n.type === "method") recommendedMethods.add(n.id); });
  }

  [...recommendedMethods].forEach(mId => {
    triples.push({ объект: displayLabel(mId), субъект: ROOT_SHORT, предикат: "рекомендуется" });
  });
  // 1.b) Прямые связи между методами (например: "применяется", "осуществляется" и т.п.)
  // Не путать с "используется" (это связи leaf->контейнер), и не включать критерии/служебные предикаты.
  links.forEach(l => {
    const s = l.source, t = l.target;
    if (!isMethod(s) || !isMethod(t)) return;
    const p0 = clean(predOf(l));
    const p = p0.toLowerCase();
    if (!p) return;
    // allow method-method рекомендуется edges
    if (p.startsWith("критерий")) return;
    if (p === "для" || p.startsWith("для ")) return;
    if (p === "при" || p.startsWith("при ")) return;
    if (p === "значение" || p === "уточнение") return;

    triples.push({ объект: displayLabel(t), субъект: displayLabel(s), предикат: p0 });
  });


  // ======= 2) методы: "используется" =======
  function expressionRootsForMethod(methodId) {
    const roots = new Set();

    // method <-> logic по methodEdge
    for (const l of allEdgesOf(methodId)) {
      if (!isMethodEdge(l)) continue;
      const o = otherEnd(l, methodId);
      if (isLogic(o)) roots.add(o);
    }

    // инверт: logic содержит method
    for (const [logicId, ms] of logicContainsMethods.entries()) {
      if (ms.includes(methodId)) roots.add(logicId);
    }

    return [...roots];
  }

  // 2.1 "используется": генерируем ТОЛЬКО если метод действительно контейнер для logic
  [...recommendedMethods].forEach(containerMethodId => {
    const roots = expressionRootsForMethod(containerMethodId);
    roots.forEach(rid => {
      const containerForRid = containerMethodForLogic(rid, recommendedMethods);
      if (containerForRid !== containerMethodId) return; // не контейнер -> не "используется"
      collectLeafMethods(rid, containerMethodId).forEach(childId => {
        triples.push({ объект: displayLabel(childId), субъект: displayLabel(containerMethodId), предикат: "используется" });
      });
    });
  });

  // 2.2 ВАЖНО: больше НЕ строим синтетические связи между методами ("связь И/ИЛИ/НЕТ").
  // Пользовательское правило: "то, что видим на линии — то и выводим".
  // Поэтому в тройки идут только реальные рёбра графа (см. 1.b и 3.*).
  const mmEdges = new Map();

  // релевантные logic для методов: достижимы из выражений рекомендованных методов, и реально имеют method-листья
  const relevantLogicMethods = new Set();
  function walkMethodLogic(startId) {
    const q = [startId];
    const seen = new Set();
    while (q.length) {
      const cur = q.shift();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);

      if (isLogic(cur)) {
        // добавляем только если под ним реально есть методы
        if (collectLeafMethods(cur, null).length) relevantLogicMethods.add(cur);
      }

      for (const l of allEdgesOf(cur)) {
        if (!isMethodEdge(l)) continue;
        q.push(otherEnd(l, cur));
      }
    }
  }

  [...recommendedMethods].forEach(mId => {
    expressionRootsForMethod(mId).forEach(rid => walkMethodLogic(rid));
  });

  // Некоторые шаблоны в json кодируют конструкцию вида:
  //   И( ..., ИЛИ(a,b), c)
  // но эталон ожидает интерпретацию как:
  //   a И b, a И c, b ИЛИ c (pivot = "a" из OR-поддерева)
  // Поэтому для таких случаев мы обрабатываем пару (И + вложенный ИЛИ) вместе
  // и пропускаем обработку вложенного ИЛИ отдельно.
  const skipMethodLogic = new Set();

  /*
  relevantLogicMethods.forEach(logicId => {
    if (skipMethodLogic.has(logicId)) return;
    const op = logicOp(logicId); // "И" | "ИЛИ" | "НЕТ"
    const container = containerMethodForLogic(logicId, recommendedMethods);

    const operands = allEdgesOf(logicId)
      .filter(isMethodEdge)
      .map(l => otherEnd(l, logicId));

    // --- спец-правило для графов типа pn3_1: AND + вложенный OR ---
    if (op === "И") {
      const orChild = operands.find(o => isLogic(o) && logicOp(o) === "ИЛИ");
      if (orChild) {
        // листья OR-поддерева
        const orLeaves = collectLeafMethods(orChild).filter(mid => mid !== container);
        // остальные листья AND (кроме OR-поддерева)
        const otherLeaves = operands
          .filter(o => o !== orChild)
          .flatMap(o => collectLeafMethods(o))
          .filter(mid => mid !== container);

        if (orLeaves.length >= 2 && otherLeaves.length >= 1) {
          // pivot = самый "правый" лист OR-поддерева (если координаты есть)
          const pivot = orLeaves.slice().sort((a, b) => xOf(b) - xOf(a))[0];
          const rest = [...new Set([...orLeaves, ...otherLeaves])].filter(mid => mid !== pivot);

          // AND: все остальные -> pivot
          for (const mid of rest) pushMM(mid, pivot, "связь И");

          // OR: связи между всеми остальными (без pivot) как RIGHT->LEFT
          const restSorted = rest.slice().sort((a, b) => xOf(a) - xOf(b)); // left..right
          for (let i = 0; i < restSorted.length; i++) {
            for (let j = i + 1; j < restSorted.length; j++) {
              // right -> left
              pushMM(restSorted[j], restSorted[i], "связь ИЛИ");
            }
          }

          // пропускаем отдельную обработку OR-узла (иначе добавим лишнюю OR между его листьями)
          skipMethodLogic.add(orChild);
          return;
        }
      }
    }

    const operandSets = operands
      .map(o => collectLeafMethods(o).filter(mid => mid !== container))
      .filter(s => s.length);

    if (operandSets.length < 2) return;

    // координаты для направленности (если их нет, будет 0)
    function xOf(id) {
      const n = nodeById.get(id);
      return (n && typeof n.x === "number") ? n.x : 0;
    }

    if (op === "ИЛИ") {
      // Для методов эталон строится направленно:
      //  - если 2 операнда, берём самые правые листья каждого операнда и связываем RIGHT -> LEFT
      //  - иначе fallback: полный граф по всем листьям (без контейнера)
      if (operandSets.length === 2) {
        const a = operandSets[0].slice().sort((i, j) => xOf(j) - xOf(i))[0];
        const b = operandSets[1].slice().sort((i, j) => xOf(j) - xOf(i))[0];
        const pair = [a, b].sort((i, j) => xOf(i) - xOf(j)); // left, right
        pushMM(pair[1], pair[0], "связь ИЛИ");
      } else {
        const all = [...new Set(operandSets.flat())].filter(mid => mid !== container);
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) {
            // направленно: более правый -> более левый
            const pair = [all[i], all[j]].sort((u, v) => xOf(u) - xOf(v));
            pushMM(pair[1], pair[0], "связь ИЛИ");
          }
        }
      }
      return;
    }

    if (op === "И") {
      const pred = "связь И";

      // ---- Спец-случай: И(..., ИЛИ(a,b), c) ----
      // Эталон для 3 графа: a = "канюлированные винты", (b,c) = ("спицы", "петля").
      // Выводим:
      //   b И a
      //   c И a
      //   c ИЛИ b
      if (pred === "связь И") {
        const orChildren = operands.filter(o => isLogic(o) && logicOp(o) === "ИЛИ");
        if (orChildren.length === 1) {
          const orId = orChildren[0];
          const orLeaves = collectLeafMethods(orId).filter(mid => mid !== container);
          if (orLeaves.length >= 2) {
            const pivot = orLeaves.slice().sort((i, j) => xOf(j) - xOf(i))[0];
            const allLeaves = [...new Set(operandSets.flat())].filter(mid => mid !== container);
            const others = allLeaves.filter(mid => mid && mid !== pivot);

            // AND: все остальные -> pivot
            for (const o of [...new Set(others)]) pushMM(o, pivot, "связь И");

            // OR: между всеми "другими" (исключая pivot)
            const uniq = [...new Set(others)].slice().sort((a, b) => xOf(a) - xOf(b));
            for (let i = 0; i < uniq.length; i++) {
              for (let j = i + 1; j < uniq.length; j++) {
                pushMM(uniq[j], uniq[i], "связь ИЛИ");
              }
            }

            // вложенный ИЛИ уже учтён
            skipMethodLogic.add(orId);
            return;
          }
        }
      }

      // Эталон для AND обычно «стягивает» к одному опорному методу,
      // если один операнд даёт единственный лист.
      const sizes = operandSets.map(s => s.length);
      const singleIdx = sizes.filter(x => x === 1).length === 1 ? sizes.findIndex(x => x === 1) : -1;
      if (singleIdx !== -1) {
        const pivot = operandSets[singleIdx][0];
        const others = operandSets
          .filter((_, idx) => idx !== singleIdx)
          .flat()
          .filter(mid => mid && mid !== pivot && mid !== container);
        for (const o of [...new Set(others)]) pushMM(o, pivot, pred);
        return;
      }

      // fallback: соединяем листья между операндами.
      for (let i = 0; i < operandSets.length; i++) {
        for (let j = i + 1; j < operandSets.length; j++) {
          for (const a of operandSets[i]) {
            for (const b of operandSets[j]) {
              if (a === b) continue;
              if (a === container || b === container) continue;
              pushMM(a, b, pred);
            }
          }
        }
      }
    }
  });
  */


  // ======= 3) критерии =======
  // 3.0) NOT-контейнер: показываем "как видим".
// На графе часто бывает: METHOD --(критерий)--> НЕТ --(критерий X)--> TARGET
// В таблицу хотим: TARGET  METHOD  "критерий X, NOT".
// ВАЖНО: никогда не выводим в "субъект" логические узлы (И/ИЛИ/НЕТ). Если владелец NOT не найден как метод,
// пытаемся вычислить методы-контейнеры через hierarchy/leaf-обход.
const handledNotEdges = new Set();

function methodsOwningCriteriaContainer(startId) {
  // 1) все владельцы по scoped-ребрам "критерий"
  const owners = new Set();
  for (const l of allEdgesOf(startId)) {
    const p = predLow(l);
    if (p !== "критерий") continue;
    if (!isScopedEdge(l)) continue;
    const other = otherEnd(l, startId);
    if (!other) continue;
    if (isMethod(other) || isLogic(other) || typeOf(other) === "root") owners.add(other);
  }

  if (owners.size) {
    const all = new Set();
    owners.forEach(oid => {
      collectLeafMethodsSmart(oid).forEach(mid => all.add(mid));
    });
    const arr = Array.from(all);
    const filtered = arr.filter(mid => recommendedMethods.has(mid));
    return filtered.length ? filtered : arr;
  }

  // 2) fallback: поднимаемся по hierarchy.ownerId
  const seen = new Set();
  let cur = startId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);

    const leaf = collectLeafMethodsSmart(cur);
    if (leaf.length) {
      const filtered = leaf.filter(mid => recommendedMethods.has(mid));
      return filtered.length ? filtered : leaf;
    }

    cur = parentOf.get(cur) || null;
  }
  return [...recommendedMethods];
}

links.forEach(l => {
  const s = l.source, t = l.target;
  if (!isLogic(s) || logicOp(s) !== "НЕТ") return;
  const p0 = predOf(l);
  if (!isCriteriaPredicate(p0)) return;

  const outPred = `${p0}, NOT`;

  // хозяева NOT: scoped входящие связи "критерий" (обычно method -> NOT),
  // но если там логика/контейнер — разворачиваем до leaf методов.
  const incoming = (inc.get(s) || []).filter(x => isScopedEdge(x));
  const ownerCandidates = [];
  for (const inL of incoming) {
    const op = predOf(inL).toLowerCase();
    if (!op.includes("критерий")) continue;
    const cand = otherEnd(inL, s);
    if (cand) ownerCandidates.push(cand);
  }

  let methodIds = [];
  // Сначала берём явные методы среди владельцев
  const directMethods = ownerCandidates.filter(isMethod);
  if (directMethods.length) {
    methodIds = directMethods;
  } else if (ownerCandidates.length) {
    // Разворачиваем логические/контейнерные владельцы до leaf методов
    const all = new Set();
    ownerCandidates.forEach(oid => collectLeafMethodsSmart(oid).forEach(mid => all.add(mid)));
    methodIds = Array.from(all);
  }

  // Если так и не нашли — берём методы "по месту" (подъём по hierarchy от NOT)
  if (!methodIds.length) methodIds = methodsOwningCriteriaContainer(s);

  // На всякий случай фильтруем логические id, оставляем только methods
  methodIds = methodIds.filter(isMethod);

  // Если всё ещё пусто — не выводим странную строку "критерий ... -> ИЛИ"
  if (!methodIds.length) return;

  methodIds.forEach(mId => {
    triples.push({ объект: clean(displayLabel(t)), субъект: displayLabel(mId), предикат: outPred });
  });

  handledNotEdges.add(`${s}|||${t}|||${p0}`);
});

  // 3.a прямые method<->criteria (направление не важно)
  links.forEach(l => {
    const p0 = predOf(l);
    if (!isCriteriaPredicate(p0)) return;

    // если это ребро уже было сколлапсировано через NOT-контейнер — не дублируем его
    if (handledNotEdges.has(`${l.source}|||${l.target}|||${p0}`)) return;

    const sT = typeOf(l.source);
    const tT = typeOf(l.target);
    if (sT === "method" && tT === "criteria") {
      triples.push({ объект: clean(displayLabel(l.target)), субъект: displayLabel(l.source), предикат: p0.trim() || "критерий" });
    } else if (sT === "criteria" && tT === "method") {
      triples.push({ объект: clean(displayLabel(l.source)), субъект: displayLabel(l.target), предикат: p0.trim() || "критерий" });
    }
  });

  // 3.b контейнерные критерии: стартовые logic узлы, где есть критериальные связи (в обе стороны)
  const critGroupStarts = nodes
    .filter(n => n.type === "logic")
    .map(n => n.id)
    .filter(id => allEdgesOf(id).some(l => isCriteriaEdge(l) && (isCriteria(otherEnd(l, id)) || isLogic(otherEnd(l, id)))));

  function normValueForExport(valueStr) {
    return clean(valueStr);
  }

  function methodsForCriteriaContainer(startId) {
    // ✅ ВАЖНО: один и тот же критерий-контейнер (logic) может принадлежать
    // нескольким методам/контейнерам одновременно (см. НЕТ, общий на 2 ветки).
    // Поэтому НЕЛЬЗЯ брать единственного parentOf из hierarchy (он перезапишется).
    // Вместо этого ищем всех владельцев по scoped-ребрам "критерий" и собираем
    // методы для каждого владельца отдельно.

    const owners = new Set();
    for (const l of allEdgesOf(startId)) {
      const p = predLow(l);
      if (p !== "критерий") continue;
      if (!isScopedEdge(l)) continue;
      const other = otherEnd(l, startId);
      if (!other) continue;
      // владельцем может быть method или logic (контейнер методов)
      if (isMethod(other) || isLogic(other) || typeOf(other) === "root") owners.add(other);
    }

    if (owners.size) {
      const all = new Set();
      owners.forEach(oid => {
        collectLeafMethodsSmart(oid).forEach(mid => all.add(mid));
      });
      const arr = Array.from(all);
      const filtered = arr.filter(mid => recommendedMethods.has(mid));
      return filtered.length ? filtered : arr;
    }

    // fallback (старое поведение): поднимаемся по hierarchy.ownerId
    const seen = new Set();
    let cur = startId;
    while (cur && !seen.has(cur)) {
      seen.add(cur);

      const leaf = collectLeafMethodsSmart(cur);
      if (leaf.length) {
        const filtered = leaf.filter(mid => recommendedMethods.has(mid));
        return filtered.length ? filtered : leaf;
      }

      cur = parentOf.get(cur) || null;
    }
    return [...recommendedMethods];
  }

  function exportCriteriaLeaves(startId) {
    const leaves = leafCriteriaUnderWithFlags(startId);
    const methodIds = methodsForCriteriaContainer(startId);

    leaves.forEach(({ id, lbl, not, pred }) => {
      const n = nodeById.get(id) || {};
      // ВАЖНО: не схлопываем предикаты. Если лист достигнут по конкретному ребру (например, "при"),
      // экспортируем именно его. Иначе — fallback к эвристике.
      const basePred = clean(pred) || criterionPredicateFor(id);

      // значение / уточнение
      if (n.value != null && clean(n.value) !== "") {
        const v = clean(n.value);
        if (v === ROOT_SHORT) {
          triples.push({ объект: lbl, субъект: ROOT_SHORT, предикат: "уточнение" });
        } else {
          triples.push({ объект: normValueForExport(v), субъект: lbl, предикат: "значение" });
        }
      }

      let pOut = basePred;
      if (not && basePred.toLowerCase().startsWith("критерий")) pOut = `${basePred}, NOT`;

      methodIds.forEach(mId => {
        triples.push({ объект: lbl, субъект: displayLabel(mId), предикат: pOut });
      });
    });
  }

  critGroupStarts.forEach(startId => exportCriteriaLeaves(startId));

  // ======= 4) логические связи между критериями (pivot по "для" для графа 2) =======
  const ccEdges = new Map();
  function pushCC(aId, bId, pred) {
  // Добавляет "логические" связи между операндами (И / ИЛИ / НЕТ)
  // ВАЖНО: оставляем только ОДНУ тройку на пару (без дубля A->B и B->A),
  // а направление выбираем "по направлению линии" по умолчанию = слева направо (по x).
  const aNode = nodeById.get(aId);
  const bNode = nodeById.get(bId);

  const aLbl = clean(displayLabel(aId));
  const bLbl = clean(displayLabel(bId));
  if (!aLbl || !bLbl) return;

  const p = (pred || "").trim();

  // Для "связь И/ИЛИ" делаем одну запись на пару, но запоминаем выбранное направление.
  // "связь НЕТ" для критериев НЕ экспортируем отдельными тройками: отрицание уже отражается
  // в тройке критерия (например: "критерий симптом, NOT").
  if (p === "связь И" || p === "связь ИЛИ") {
    // ключ пары — по id (стабильно), чтобы не зависеть от алфавита/языка
    const leftId = (String(aId) <= String(bId)) ? String(aId) : String(bId);
    const rightId = (String(aId) <= String(bId)) ? String(bId) : String(aId);
    const k = `${leftId}|||${rightId}|||${p}`;

    // направление "дефолтом": слева направо по координате x (если есть),
    // иначе — как aId -> bId при первом добавлении.
    let subj = aLbl, obj = bLbl;
    if (aNode && bNode && Number.isFinite(aNode.x) && Number.isFinite(bNode.x) && aNode.x !== bNode.x) {
      if (aNode.x <= bNode.x) { subj = aLbl; obj = bLbl; }
      else { subj = bLbl; obj = aLbl; }
    }

    if (!ccEdges.has(k)) {
      ccEdges.set(k, { pred: p, субъект: subj, объект: obj });
    }
    return;
  }

  // Остальные (редкие) — направленные, не дедуплируем
  const k = `${aId}|||${bId}|||${p}`;
  if (!ccEdges.has(k)) ccEdges.set(k, { pred: p, субъект: aLbl, объект: bLbl });
}




  function findPivotForAnd(andId) {
    const neigh = allEdgesOf(andId).filter(isCriteriaEdge);
    const forEdge = neigh.find(l => predLow(l).startsWith("для"));
    if (!forEdge) return null;
    const o = otherEnd(forEdge, andId);
    if (isCriteria(o)) return o;
    const leaves = leafCriteriaUnderWithFlags(o).map(x => x.id);
    return leaves[0] || null;
  }

  function criteriaOperands(logicId) {
    const ops = new Set();

    for (const l of allEdgesOf(logicId)) {
      if (!isCriteriaEdge(l)) continue;

      // защита от подтягивания parent-logic через scope:
      // пропускаем только ВХОДЯЩУЮ scoped-связь (parent -> this),
      // но оставляем исходящие scoped-связи (this -> child), т.к. они могут быть операндами (например, НЕТ).
      const otherTmp = otherEnd(l, logicId);
      // target/source могут быть строковыми id либо объектами {id,...}
      const isIncomingToCurrent = (l.target === logicId) || (l.target && l.target.id === logicId);
      if (isScopedEdge(l) && isLogic(otherTmp) && isIncomingToCurrent) continue;

      const o = otherEnd(l, logicId);
      if (isCriteria(o) || isLogic(o)) ops.add(o);
    }

    return Array.from(ops);
  }


  // строим связи только по критериальному слою
  nodes.forEach(n => {
    if (n.type !== "logic") return;

    const op = logicOp(n.id);
    if (op !== "И" && op !== "ИЛИ" && op !== "НЕТ") return;

    const operands = criteriaOperands(n.id);
    if (operands.length < 2) return;

    // Каждый операнд превращаем в набор ЛИСТЬЕВ-критериев.
    // ВАЖНО: один child = одна "группа".
    const groups = operands
      .map(o => {
        const leaves = leafCriteriaUnderWithFlags(o);
        const ids = Array.from(new Set(leaves.map(x => x.id))).filter(Boolean);
        const negIds = Array.from(new Set(leaves.filter(x => x.not).map(x => x.id))).filter(Boolean);
        return { ids, negIds };
      })
      .filter(g => g.ids.length);

    const groupIds = groups.map(g => g.ids);

    if (groups.length < 2) return;

    // ✅ Правило (сверху-вниз, “как на графе”):
    // - Логика И/ИЛИ распространяется на ВСЕ листья в поддереве (включая листья внутри вложенных логик)
    // - Поэтому для данного логического узла строим полный граф по всем листьям (pairwise)
    // - Вложенные логики также добавят свои связи отдельно (например, ИЛИ внутри И)
    if (op === "И" || op === "ИЛИ") {
      const pred = (op === "И") ? "связь И" : "связь ИЛИ";

      const allIds = Array.from(new Set(groups.flatMap(g => g.ids))).filter(Boolean);
      if (allIds.length < 2) return;

      for (let i = 0; i < allIds.length; i++) {
        for (let j = i + 1; j < allIds.length; j++) {
          const a = allIds[i], b = allIds[j];
          if (a === b) continue;
          pushCC(a, b, pred);
        }
      }
      return;
    }

    // НЕТ как бинарную связь не строим (у тебя так задумано)
  });



  // ======= 4.b логические связи между МЕТОДАМИ (И / ИЛИ) =======
  // Эти связи НЕ заменяют подписи на линиях. Они добавляются дополнительно,
  // чтобы в тройках было видно, что методы состоят в выборе И/ИЛИ.
  function methodOperands(logicId) {
    const ops = new Set();
    for (const l of allEdgesOf(logicId)) {
      // Критерии не трогаем, но связь logic->logic с предикатом "критерий" (контейнер/подконтейнер)
      // должна учитываться как операнд для методов. Поэтому отсекаем только переходы к criteria-узлам.
      const other0 = otherEnd(l, logicId);
      if (isCriteriaEdge(l) && other0 && typeOf(other0) === "criteria") continue;
      // не подтягиваем parent-logic через входящую scoped-связь
      const otherTmp = otherEnd(l, logicId);
      if (isScopedEdge(l) && isLogic(otherTmp) && (l.target === logicId)) continue;

      const o = otherEnd(l, logicId);
      if (!o) continue;
      if (isMethod(o) || isLogic(o)) ops.add(o);
    }
    return Array.from(ops);
  }

  nodes.forEach(n => {
    if (n.type !== "logic") return;
    const op = logicOp(n.id);
    if (op !== "И" && op !== "ИЛИ") return;

    const operands = methodOperands(n.id);
    if (operands.length < 2) return;

    // каждая ветка-операнд = отдельная группа
    const groupsM = operands
      .map(o => {
        const leaf = collectLeafMethodsSmart(o);
        const ids = Array.from(new Set(leaf)).filter(Boolean);
        return { ids };
      })
      .filter(g => g.ids.length);

    if (groupsM.length < 2) return;

    const pred = (op === "И") ? "связь И" : "связь ИЛИ";

        // ✅ “сверху-вниз”: логика И/ИЛИ распространяется на все листья в поддереве
    const allIdsM = Array.from(new Set(groupsM.flatMap(g => g.ids))).filter(Boolean);
    if (allIdsM.length < 2) return;

    for (let i = 0; i < allIdsM.length; i++) {
      for (let j = i + 1; j < allIdsM.length; j++) {
        const a = allIdsM[i], b = allIdsM[j];
        if (a === b) continue;

        // дедуп по паре + предикат, направление "дефолт" по x
        const aNode = nodeById.get(a);
        const bNode = nodeById.get(b);

        const aLbl = clean(displayLabel(a));
        const bLbl = clean(displayLabel(b));
        if (!aLbl || !bLbl) continue;

        const leftId = (String(a) <= String(b)) ? String(a) : String(b);
        const rightId = (String(a) <= String(b)) ? String(b) : String(a);
        const k = `${leftId}|||${rightId}|||${pred}`;

        let subj = aLbl, obj = bLbl;
        if (aNode && bNode && Number.isFinite(aNode.x) && Number.isFinite(bNode.x) && aNode.x !== bNode.x) {
          if (aNode.x <= bNode.x) { subj = aLbl; obj = bLbl; }
          else { subj = bLbl; obj = aLbl; }
        }

        if (!ccEdges.has(k)) ccEdges.set(k, { pred, субъект: subj, объект: obj });
      }
    }

  }); // end nodes.forEach (logic)

  ccEdges.forEach((val, k) => {
    // val: {pred, субъект, объект} или {pred:[...], субъект, объект}
    if (!val) return;
    const subj = (typeof val === "string") ? "" : clean(val.субъект || "");
    const obj  = (typeof val === "string") ? "" : clean(val.объект || "");
    const pred = (typeof val === "string") ? String(val) : val.pred;

    if (Array.isArray(pred)) {
      pred.forEach(p => triples.push({ объект: obj, субъект: subj, предикат: p }));
    } else {
      triples.push({ объект: obj, субъект: subj, предикат: pred });
    }
  });


  // ======= X) значения/уточнения как отдельные вершины (по ребрам) =======
  // Рисуем отдельную вершину-значение и ребро "значение"/"уточнение" -> это должно экспортироваться в тройки.
  // Поддерживаем обе стороны стрелки: criteria <-> (любой узел кроме logic).
  links.forEach(l => {
    const s = l.source, t = l.target;

    const p0 = clean(predOf(l));
    const p = p0.toLowerCase();
    if (p !== "значение" && p !== "уточнение") return;

    const sIsC = isCriteria(s);
    const tIsC = isCriteria(t);
    if (!sIsC && !tIsC) return;

    // не считаем значение к логическим узлам
    const other = sIsC ? t : s;
    const crit  = sIsC ? s : t;
    if (!other || !crit) return;
    if (other.type === "logic") return;

    triples.push({
      объект: clean(displayLabel(other)),
      субъект: clean(displayLabel(crit)),
      предикат: p0
    });
  });

  // ======= 5) дедуп =======
  // 1) обычные тройки: дедуп по направлению (obj->subj->pred)
  // 2) симметричные логические связи (связь И/ИЛИ/НЕТ): дедуп по НЕупорядоченной паре,
  //    чтобы не было дубля A->B и B->A. Оставляем первую встретившуюся (направление "дефолтом").
  const sym = new Set(["связь И", "связь ИЛИ"]);

  const seen = new Set();
  const outTriples = [];
  triples.forEach(t => {
    const pred = String(t.предикат ?? "").trim();
    let k;
    if (sym.has(pred)) {
      const a = String(t.объект ?? "").trim();
      const b = String(t.субъект ?? "").trim();
      const p1 = a <= b ? a : b;
      const p2 = a <= b ? b : a;
      k = `${pred}|||${p1}|||${p2}`;
    } else {
      k = `${t.объект}|||${t.субъект}|||${pred}`;
    }
    if (seen.has(k)) return;
    seen.add(k);
    outTriples.push({ объект: t.объект, субъект: t.субъект, предикат: pred });
  });

  return outTriples;
}


const generateBtn = document.getElementById("generate-btn");
if (generateBtn) {
  generateBtn.onclick = async () => {
    if (!nodes.length) {
      alert("Сначала нарисуйте или загрузите граф.");
      return;
    }

    try {
      const graphWH = buildGraphWithHierarchyJSON();     // твой новый формат
      const graphOnly = normalizeToGraphOnly(graphWH);   // {doc,nodes,links} для backend

      // TTL можно оставить из backend (пока правила TTL не перенесли на фронт)
      const ttl = await backendToTTL(graphOnly);

      // ✅ triples считаем ПРАВИЛЬНО на фронте
      const triples = buildTriplesFromGraph(graphOnly);

      const payload = {
        doc: graphWH.doc,
        graph: graphWH,      // nodes+links+hieararchy
        triples              // правильные
      };

      downloadFile("recommendation.ttl", ttl, "text/turtle;charset=utf-8");
      downloadFile("triples_new.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    } catch (e) {
      console.error(e);
      alert(e.message || "Ошибка при работе с формированием");
    }
  };
}


