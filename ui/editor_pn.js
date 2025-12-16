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

function redrawLinks() {
  linkGroup
    .selectAll("line")
    .attr("x1", d => d.source.x)
    .attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x)
    .attr("y2", d => d.target.y);

  linkLabelGroup
    .selectAll("text")
    .attr("x", d => (d.source.x + d.target.x) / 2)
    .attr("y", d => (d.source.y + d.target.y) / 2 - 4);
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

      if (d.type === "criteria") {
        let val = prompt("Значение критерия (опционально):", d.value || "");
        if (val !== null) {
          val = val.trim();
          d.value = val || null;
        }
        let nt = prompt("Уточнение (опционально):", d.note || "");
        if (nt !== null) {
          nt = nt.trim();
          d.note = nt || null;
        }
      }

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
    .text(d => {
      if (d.type !== "criteria") return "";
      const v = d.value ? String(d.value) : "";
      const n = d.note ? String(d.note) : "";
      if (v && n) return v + " · " + n;
      return v || n || "";
    });

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

  if (type === "criteria") {
    let val = prompt("Значение критерия (опционально):", "");
    if (val !== null) {
      val = val.trim();
      if (val) value = val;
    }
    let nt = prompt("Уточнение (опционально):", "");
    if (nt !== null) {
      nt = nt.trim();
      if (nt) note = nt;
    }
  }

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
  const nodesById = new Map((graph.nodes || []).map(n => [n.id, n]));
  const labelOf = (id) => (nodesById.get(id)?.label || id || "").trim();
  const typeOf = (id) => (nodesById.get(id)?.type || "").trim();

  // outgoing links by source
  const out = new Map();
  (graph.links || []).forEach(l => {
    if (!out.has(l.source)) out.set(l.source, []);
    out.get(l.source).push(l);
  });

  const triples = [];

  // 0) диагноз: (ПН -> пациенты -> диагноз)
  // если не нужно — просто удали этот блок
  const root = (graph.nodes || []).find(n => n.type === "root") || (graph.nodes || [])[0];
  if (root) {
    triples.push({ объект: labelOf(root.id), субъект: "пациенты", предикат: "диагноз" });
  }

  // helper: find container method for any node (logic or method)
  // Идея: поднимаемся вверх по входящим ребрам, пока не найдём method,
  // который "рекомендуется" от root (или просто первый method)
  const incoming = new Map();
  (graph.links || []).forEach(l => {
    if (!incoming.has(l.target)) incoming.set(l.target, []);
    incoming.get(l.target).push(l);
  });

  function findRecommendedMethodAbove(startId) {
    const seen = new Set();
    const q = [startId];
    while (q.length) {
      const cur = q.shift();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);

      const inc = incoming.get(cur) || [];
      for (const l of inc) {
        const s = l.source;
        if (typeOf(s) === "method") {
          // если этот method "рекомендуется" от root — приоритет
          const inc2 = incoming.get(s) || [];
          const hasRec = inc2.some(x => (x.predicate || x.label || "").trim().toLowerCase().includes("рекомендуется"));
          if (hasRec) return s;
          // иначе запомним как fallback
          return s;
        }
        // идём дальше вверх
        q.push(s);
      }
    }
    return null;
  }

  // 1) Рекомендуется: root -> method  ==>  (method, root, рекомендуется)
  (graph.links || []).forEach(l => {
    const pred = (l.predicate || l.label || "").trim();
    if (!pred) return;

    if (pred.toLowerCase().includes("рекомендуется")) {
      triples.push({
        объект: labelOf(l.target),
        субъект: labelOf(l.source),
        предикат: "рекомендуется"
      });
    }
  });

  // 2) Критерии: method -> criteria (критерий пациент/симптом/время/возможность/для/при)
  (graph.links || []).forEach(l => {
    const pred = (l.predicate || l.label || "").trim();
    if (!pred) return;

    const sType = typeOf(l.source);
    const tType = typeOf(l.target);

    if (tType === "criteria" && pred.toLowerCase().includes("критерий")) {
      // ожидаемый формат: критерий (объект) -> метод (субъект)
      triples.push({
        объект: labelOf(l.target),
        субъект: labelOf(l.source),
        предикат: pred
      });
    }
  });

  // 3) Используется: все method-листья под логикой должны ссылаться на "контейнерный method"
  // Пример из твоего graph: n_sdfacqn(И) -> n_770foib(остеосинтез) используется (контейнер)
  // А n_vz4q4vw(ИЛИ) -> методы используется (они должны стать: метод -> остеосинтез используется)
  function collectLeafMethodsUnder(nodeId) {
    const seen = new Set();
    const res = new Set();
    const st = [nodeId];
    while (st.length) {
      const cur = st.pop();
      if (!cur || seen.has(cur)) continue;
      seen.add(cur);

      const links = out.get(cur) || [];
      for (const l of links) {
        const pred = (l.predicate || l.label || "").trim().toLowerCase();
        if (!pred.includes("используется")) continue;

        const tgt = l.target;
        const tType = typeOf(tgt);
        if (tType === "method") res.add(tgt);
        if (tType === "logic") st.push(tgt);
      }
    }
    return [...res];
  }

  // для каждого логического узла найдём его container method и добавим "используется" для всех листьев
  (graph.nodes || []).filter(n => n.type === "logic").forEach(ln => {
    const containerMethodId = findRecommendedMethodAbove(ln.id);
    if (!containerMethodId) return;

    const leaves = collectLeafMethodsUnder(ln.id);
    leaves.forEach(mId => {
      // не дублируем: если уже есть прямой "method->criteria" и т.п. — это другое
      triples.push({
        объект: labelOf(mId),
        субъект: labelOf(containerMethodId),
        предикат: "используется"
      });
    });
  });

  // 4) Логические связи между методами:
  // для каждой logic-вершины берём дочерние "ветки" (method или logic),
  // собираем листья, и делаем связи МЕЖДУ ветками (кросс-продукт)
  function logicPredicate(label) {
    const s = (label || "").trim().toUpperCase();
    if (s === "И") return "связь И";
    if (s === "ИЛИ") return "связь ИЛИ";
    if (s === "НЕТ") return "связь НЕТ";
    return null;
  }

  function leafGroupsOfLogic(logicId) {
    const links = out.get(logicId) || [];
    const groups = [];
    for (const l of links) {
      const pred = (l.predicate || l.label || "").trim().toLowerCase();
      if (!pred.includes("используется")) continue;

      const t = l.target;
      const tType = typeOf(t);
      if (tType === "method") groups.push([t]);
      else if (tType === "logic") groups.push(collectLeafMethodsUnder(t));
    }
    return groups.filter(g => g.length);
  }

  (graph.nodes || []).filter(n => n.type === "logic").forEach(ln => {
    const p = logicPredicate(ln.label);
    if (!p) return;

    const groups = leafGroupsOfLogic(ln.id);
    // связи только между группами (не внутри одной)
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        for (const a of groups[i]) {
          for (const b of groups[j]) {
            triples.push({ объект: labelOf(a), субъект: labelOf(b), предикат: p });
          }
        }
      }
    }
  });

  // 5) Удалим дубли
  const uniq = new Map();
  for (const t of triples) {
    const key = `${t.объект}||${t.субъект}||${t.предикат}`;
    if (!uniq.has(key)) uniq.set(key, t);
  }
  return [...uniq.values()];
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


