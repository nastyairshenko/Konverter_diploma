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

// ======= предикаты: автоподбор =======
const PRED_ROLE_OPTIONS = [
  "критерий пациент",
  "критерий симптом",
  "критерий время",
  "критерий возможность",
  "для",
  "значение",
  "уточнение",
  "" // пусто (операнд логики)
];

function normalizeLogicLabel(lbl) {
  const s = (lbl || "").trim().toUpperCase();
  if (s === "ANY") return "ИЛИ";
  if (s === "ALL") return "И";
  if (s === "NOT") return "НЕТ";
  return lbl || "";
}

function pickPredicateFromList(defaultPred = "") {
  const items = PRED_ROLE_OPTIONS
    .map((p, i) => `${i + 1}) ${p === "" ? "(пусто)" : p}`)
    .join("\n");

  const msg =
    `Выберите предикат для связи:\n${items}\n\n` +
    `Введите номер (1-${PRED_ROLE_OPTIONS.length}) или текст предиката вручную:`;

  const input = prompt(msg, defaultPred || "1");
  if (input === null) return null;

  const t = input.trim();
  if (!t) return "";

  const num = parseInt(t, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= PRED_ROLE_OPTIONS.length) {
    return PRED_ROLE_OPTIONS[num - 1];
  }
  return t;
}

function autoPredicateForEdge(sourceNode, targetNode) {
  // root -> method => рекомендуется
  if (sourceNode.type === "root" && targetNode.type === "method") return "рекомендуется";

  // root -> logic => рекомендуется (группа методов)
  if (sourceNode.type === "root" && targetNode.type === "logic") return "рекомендуется";

  // method -> logic => используется (привязка условий/групп)
  if (sourceNode.type === "method" && targetNode.type === "logic") return "используется";

  // logic -> criteria => роль/для/значение/уточнение (выбор)
  if (sourceNode.type === "logic" && targetNode.type === "criteria") {
    return pickPredicateFromList("критерий пациент");
  }

  // logic -> logic => операнд (пусто)
  if (sourceNode.type === "logic" && targetNode.type === "logic") return "";

  // method -> criteria (если рисуют напрямую) => выбор
  if (sourceNode.type === "method" && targetNode.type === "criteria") {
    return pickPredicateFromList("для");
  }

  // criteria -> criteria => выбор
  if (sourceNode.type === "criteria" && targetNode.type === "criteria") {
    return pickPredicateFromList("");
  }

  return "";
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
      label: l.label || ""
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
        label: l.label
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
  const idMap = rebuildIdMap();
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
    .on("dblclick", (event, d) => {
      event.stopPropagation();
      const pred = prompt("Предикат для ребра:", d.predicate || d.label || "");
      if (pred === null) return;
      const trimmed = pred.trim();
      pushHistory();
      d.predicate = trimmed;
      d.label = trimmed;
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
    .on("dblclick", (event, d) => {
      event.stopPropagation();
      const pred = prompt("Предикат для ребра:", d.predicate || d.label || "");
      if (pred === null) return;
      const trimmed = pred.trim();
      pushHistory();
      d.predicate = trimmed;
      d.label = trimmed;
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
    .on("click", (event, d) => {
      event.stopPropagation();

      if (edgeMode) {
        if (!edgeStartNode) {
          edgeStartNode = d;
          selectedNode = d;
          redrawSelection();
        } else if (edgeStartNode !== d) {
          const pred = autoPredicateForEdge(edgeStartNode, d);
          if (pred === null) {
            edgeStartNode = null;
            selectedNode = null;
            redrawSelection();
            return;
          }
          pushHistory();
          links.push({
            source: edgeStartNode,
            target: d,
            predicate: (pred || "").trim(),
            label: (pred || "").trim()
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

// ======= авторазмещение =======
function autoLayoutKonverter(rootId, saveHistory = false) {
  if (!nodes.length) return;
  if (saveHistory) pushHistory();

  const idMap = rebuildIdMap();

  const children = new Map();
  nodes.forEach(n => children.set(n.id, []));
  links.forEach(l => {
    const p = l.source.id;
    const c = l.target.id;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(c);
  });

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

  const visited = new Set();
  const marginX = 140;
  const marginY = 80;
  const nodeSpacingX = 320;
  const levelHeight = 150;

  let xCounter = 0;
  let maxDepth = 0;

  function dfs(id, depth) {
    if (!id || visited.has(id)) return;
    visited.add(id);

    const node = idMap.get(id);
    if (!node) return;

    maxDepth = Math.max(maxDepth, depth);
    node.y = marginY + depth * levelHeight;

    const kids = (children.get(id) || []).filter(cid => idMap.has(cid));
    kids.forEach(cid => dfs(cid, depth + 1));

    if (kids.length === 0) {
      node.x = marginX + xCounter * nodeSpacingX;
      xCounter++;
    } else {
      const xs = kids.map(cid => idMap.get(cid)?.x).filter(v => typeof v === "number");
      node.x = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : marginX + xCounter * nodeSpacingX;
      if (!xs.length) xCounter++;
    }
  }

  dfs(rootId, 0);

  const freeY = marginY + (maxDepth + 1) * levelHeight;
  nodes.filter(n => !visited.has(n.id)).forEach(n => {
    n.y = freeY;
    n.x = marginX + xCounter * nodeSpacingX;
    xCounter++;
  });

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
    label: (l.label || "").trim()
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

const saveGraphBtn = document.getElementById("save-graph-json-btn");
if (saveGraphBtn) {
  saveGraphBtn.onclick = () => {
    if (!nodes.length) {
      alert("Сначала нарисуйте или загрузите граф.");
      return;
    }
    const graph = buildGraphJSON();
    const filename =
      "graph_" +
      (graph.doc.id || "rec") +
      "_" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      ".json";
    downloadFile(filename, JSON.stringify(graph, null, 2), "application/json;charset=utf-8");
  };
}

// ======= PN.json -> граф (как konverter) =======
function buildGraphFromPN(pnData) {
  const docKey = Object.keys(pnData)[0];
  const diseaseKey = Object.keys(pnData[docKey])[0];
  const disease = pnData[docKey][diseaseKey];

  const rec = disease["рекомендации"][0];
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

  const root = addNode("root_PN", "root", "ПН", null, null);
  rootNodeId = root.id;

  const subs = gm["подгруппыМетодов"] || [];
  let methodChoice = null;

  if (subs.length === 1) {
    const sg = subs[0];
    methodChoice = addNode(sg.id || "methods_rule", "logic", normalizeLogicLabel("ИЛИ"), null, null);
    links.push({ source: root, target: methodChoice, label: "рекомендуется", predicate: "рекомендуется" });

    (sg["методыЛечения"] || []).forEach(m => {
      const mn = addNode(m.id, "method", m.label || m.id, null, null);
      links.push({ source: methodChoice, target: mn, label: "", predicate: "" });
    });
  } else {
    methodChoice = addNode("methods_choice", "logic", "ИЛИ", null, null);
    links.push({ source: root, target: methodChoice, label: "рекомендуется", predicate: "рекомендуется" });

    subs.forEach((sg, idx) => {
      const sgNode = addNode(sg.id || ("sg_" + idx), "logic", normalizeLogicLabel(sg["правилоВыбора"] || "ИЛИ"), null, null);
      links.push({ source: methodChoice, target: sgNode, label: "", predicate: "" });

      (sg["методыЛечения"] || []).forEach(m => {
        const mn = addNode(m.id, "method", m.label || m.id, null, null);
        links.push({ source: sgNode, target: mn, label: "", predicate: "" });
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
    return rawType;
  }

  function processCriteriaGroup(groupObj, parentNode) {
    const gNode = addNode(groupObj.id, "logic", normalizeLogicLabel(groupObj["правилоВыбора"] || "И"), null, null);
    links.push({ source: parentNode, target: gNode, label: "", predicate: "" });

    (groupObj["критерии"] || []).forEach(c => {
      const cid = c.id;
      const clabel = c["имя"] || cid;
      const cvalue = c["значение"] ? String(c["значение"]) : null;
      const cn = addNode(cid, "criteria", clabel, cvalue, null);

      const edgeLabel = mapCriteriaEdgeLabel(c["тип"] || "");
      links.push({ source: gNode, target: cn, label: edgeLabel, predicate: edgeLabel });
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
      label: lbl
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

const generateBtn = document.getElementById("generate-btn");
if (generateBtn) {
  generateBtn.onclick = async () => {
    if (!nodes.length) {
      alert("Сначала нарисуйте или загрузите граф.");
      return;
    }
    try {
      const graph = buildGraphJSON();
      const ttl = await backendToTTL(graph);
      const triples = await backendToTriples(graph);

      const payload = {
        doc_id: graph.doc.id,
        page: graph.doc.page,
        uur: graph.doc.uur,
        udd: graph.doc.udd,
        text: graph.doc.text,
        triples,
        graph
      };

      downloadFile("recommendation.ttl", ttl, "text/turtle;charset=utf-8");
      downloadFile("triples.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    } catch (e) {
      console.error(e);
      alert(e.message || "Ошибка при работе с backend");
    }
  };
}

const exportXlsxBtn = document.getElementById("export-xlsx-btn");
if (exportXlsxBtn) {
  exportXlsxBtn.onclick = async () => {
    if (!nodes.length) {
      alert("Сначала нарисуйте или загрузите граф.");
      return;
    }
    try {
      const graph = buildGraphJSON();
      const resp = await fetch(`${API_BASE}/api/graph/to-triples-xlsx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graph)
      });
      if (!resp.ok) throw new Error("Ошибка backend при формировании XLSX");

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (graph.doc.id || "triples") + ".xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(e.message || "Ошибка при скачивании XLSX");
    }
  };
}

// старт
updateGraph();
