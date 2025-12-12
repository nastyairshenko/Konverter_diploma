from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple, Set
from openpyxl import Workbook
import tempfile
import os
import re
import hashlib
from collections import deque, defaultdict

# ---------------- Models ----------------

class DocInfo(BaseModel):
    id: str = ""
    page: str = ""
    uur: str = ""
    udd: str = ""
    text: str = ""


class Node(BaseModel):
    id: str
    label: str = ""
    value: Optional[str] = None
    note: Optional[str] = None   # уточнение (опционально)
    type: str = "criteria"       # root | method | criteria | logic
    x: float = 0
    y: float = 0
    w: float = 0
    h: float = 0
    collapsed: bool = False


class Link(BaseModel):
    source: str
    target: str
    predicate: str = ""          # предикат ребра (важно для logic->criteria)


class Graph(BaseModel):
    doc: DocInfo
    nodes: List[Node]
    links: List[Link]


class Triple(BaseModel):
    subject: str
    predicate: str
    object: str


# ---------------- Constants ----------------

# фиксированные предикаты (как ты просил — не меняем)
P_DIAGNOSIS = "диагноз"
P_RECOMMENDED = "рекомендуется"
P_USED = "используется"
P_VALUE = "значение"
P_NOTE = "уточнение"

P_AND = "связь И"
P_OR = "связь ИЛИ"
P_NOT = "связь НЕТ"

ROLE_PREDS = {
    "критерий пациент",
    "критерий симптом",
    "критерий время",
    "критерий возможность",
}

# ---------------- Helpers: ID / IRI ----------------

def _norm(s: Optional[str]) -> str:
    if s is None:
        return ""
    s = str(s).strip().lower()
    s = s.replace("ё", "е")
    s = re.sub(r"\s+", " ", s)
    return s

def stable_id(doc_id: str, node_type: str, label: str, value: Optional[str], note: Optional[str]) -> str:
    """
    Детерминированный ID сущности (стабильный в рамках документа):
    prefix_slug_hash8
    """
    prefix = {
        "root": "diag",
        "method": "method",
        "criteria": "crit",
        "logic": "grp"
    }.get(node_type, "ent")

    slug = re.sub(r"[^0-9a-zA-Zа-яА-Я_]+", "_", _norm(label))[:40].strip("_")
    base = f"{doc_id}|{node_type}|{_norm(label)}|{_norm(value)}|{_norm(note)}"
    h = hashlib.sha1(base.encode("utf-8")).hexdigest()[:8]
    if not slug:
        slug = "x"
    return f"{prefix}_{slug}_{h}"

def predicate_to_local_name(pred: str) -> str:
    return (
        pred.strip()
        .replace(" ", "_")
        .replace("ё", "е")
        .replace("Ё", "Е")
    )

def escape_literal(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

def node_class(node_type: str) -> str:
    if node_type == "root":
        return "ex:Диагноз"
    if node_type == "method":
        return "ex:МетодЛечения"
    if node_type == "criteria":
        return "ex:Критерий"
    if node_type == "logic":
        return "ex:ЛогическаяГруппа"
    return "ex:Сущность"


# ---------------- AST ----------------

class Expr:
    pass

class Leaf(Expr):
    def __init__(self, crit_node_id: str):
        self.crit_node_id = crit_node_id

class Op(Expr):
    def __init__(self, op: str, args: List[Expr], logic_node_id: str):
        self.op = op          # AND/OR/NOT
        self.args = args
        self.logic_node_id = logic_node_id  # чтобы сохранить связь с узлом графа


def normalize_op(label: str) -> str:
    s = (label or "").strip().upper()
    if s in ("И", "ALL"):
        return "AND"
    if s in ("ИЛИ", "ANY", "OR"):
        return "OR"
    if s in ("НЕТ", "NOT"):
        return "NOT"
    # по умолчанию — AND
    return "AND"


def nnf(expr: Expr) -> Expr:
    """
    Negation Normal Form:
    NOT остается только над Leaf.
    """
    if isinstance(expr, Leaf):
        return expr

    if isinstance(expr, Op):
        op = expr.op
        args = [nnf(a) for a in expr.args]

        if op != "NOT":
            return Op(op, args, expr.logic_node_id)

        # NOT case
        if len(args) == 0:
            return Op("NOT", [], expr.logic_node_id)

        if len(args) > 1:
            # автопочинка: NOT(AND(args...))
            return nnf(Op("NOT", [Op("AND", args, expr.logic_node_id)], expr.logic_node_id))

        x = args[0]
        if isinstance(x, Leaf):
            return Op("NOT", [x], expr.logic_node_id)

        if isinstance(x, Op):
            if x.op == "NOT":
                # NOT NOT X
                return nnf(x.args[0])
            if x.op == "AND":
                # NOT(AND ...) => OR(NOT ..)
                return Op("OR", [nnf(Op("NOT", [a], expr.logic_node_id)) for a in x.args], expr.logic_node_id)
            if x.op == "OR":
                # NOT(OR ...) => AND(NOT ..)
                return Op("AND", [nnf(Op("NOT", [a], expr.logic_node_id)) for a in x.args], expr.logic_node_id)

        return Op("NOT", [x], expr.logic_node_id)

    return expr


# ---------------- Graph analysis ----------------

def build_index(graph: Graph):
    nodes_by_id: Dict[str, Node] = {n.id: n for n in graph.nodes}
    out_edges: Dict[str, List[Link]] = defaultdict(list)
    in_edges: Dict[str, List[Link]] = defaultdict(list)
    for l in graph.links:
        out_edges[l.source].append(l)
        in_edges[l.target].append(l)
    return nodes_by_id, out_edges, in_edges

def find_root(nodes_by_id: Dict[str, Node]) -> Optional[Node]:
    roots = [n for n in nodes_by_id.values() if n.type == "root"]
    return roots[0] if roots else None

def descendants_of(start_id: str, out_edges: Dict[str, List[Link]]) -> Set[str]:
    seen = set()
    q = deque([start_id])
    while q:
        x = q.popleft()
        for e in out_edges.get(x, []):
            if e.target not in seen:
                seen.add(e.target)
                q.append(e.target)
    return seen

def distance_bfs(start_id: str, out_edges: Dict[str, List[Link]]) -> Dict[str, int]:
    dist = {start_id: 0}
    q = deque([start_id])
    while q:
        x = q.popleft()
        for e in out_edges.get(x, []):
            if e.target not in dist:
                dist[e.target] = dist[x] + 1
                q.append(e.target)
    return dist

def find_methods_anchor(root: Node, nodes_by_id, out_edges) -> Optional[Node]:
    """
    Ищем ближайший logic-узел под root, который ведёт к method.
    Если нет — вернем root (значит методы висят напрямую).
    """
    dist = distance_bfs(root.id, out_edges)
    methods = {n.id for n in nodes_by_id.values() if n.type == "method"}
    candidates = []
    for n in nodes_by_id.values():
        if n.type != "logic":
            continue
        desc = descendants_of(n.id, out_edges)
        if desc & methods:
            candidates.append(n)
    if not candidates:
        return root

    candidates.sort(key=lambda n: dist.get(n.id, 10**9))
    return candidates[0]

def find_criteria_anchor(methods_anchor: Node, nodes_by_id, out_edges) -> Optional[Node]:
    """
    Ищем logic-узел (внутри поддерева methods_anchor), который содержит criteria-потомков.
    Если criteria висят прямо на methods_anchor — criteria_anchor = methods_anchor.
    """
    dist = distance_bfs(methods_anchor.id, out_edges)
    criteria = {n.id for n in nodes_by_id.values() if n.type == "criteria"}

    # если сам anchor уже ведет к criteria
    if descendants_of(methods_anchor.id, out_edges) & criteria:
        # попробуем найти более “нижний” logic, который уже про критерии
        candidates = []
        for n in nodes_by_id.values():
            if n.type != "logic":
                continue
            if n.id not in dist:
                continue
            desc = descendants_of(n.id, out_edges)
            if desc & criteria:
                candidates.append(n)
        if candidates:
            candidates.sort(key=lambda n: dist.get(n.id, 10**9))
            return candidates[0]
        return methods_anchor

    return None

def build_criteria_expr(criteria_anchor: Node, nodes_by_id, out_edges) -> Optional[Expr]:
    """
    Строим AST только по ветке criteria: logic -> (logic|criteria).
    """
    def build(node_id: str) -> Optional[Expr]:
        node = nodes_by_id.get(node_id)
        if not node:
            return None
        if node.type == "criteria":
            return Leaf(node_id)
        if node.type != "logic":
            return None

        op = normalize_op(node.label)

        # operands: только logic/criteria по исходящим ребрам
        children_ids = []
        for e in out_edges.get(node_id, []):
            tnode = nodes_by_id.get(e.target)
            if not tnode:
                continue
            if tnode.type in ("logic", "criteria"):
                children_ids.append(e.target)

        args = []
        for cid in children_ids:
            ex = build(cid)
            if ex:
                args.append(ex)

        # если NOT и аргументов 0 — допустим
        return Op(op, args, node_id)

    return build(criteria_anchor.id)


# ---------------- Triples generation (STRUCTURAL) ----------------

def op_pred(op: str) -> str:
    if op == "AND":
        return P_AND
    if op == "OR":
        return P_OR
    if op == "NOT":
        return P_NOT
    return P_AND

def generate_structural_triples(graph: Graph) -> Tuple[List[Triple], Dict[str, str], Dict[str, Node]]:
    """
    Возвращает:
    - triples (структурные, без потери AND/OR/NOT)
    - iri_map: node.id -> ex:<stableId>
    - nodes_by_id
    """
    nodes_by_id, out_edges, in_edges = build_index(graph)
    root = find_root(nodes_by_id)
    if not root:
        return [], {}, nodes_by_id

    # IRI map for all nodes
    iri_map: Dict[str, str] = {}
    for n in nodes_by_id.values():
        sid = stable_id(graph.doc.id, n.type, n.label or n.id, n.value, n.note)
        iri_map[n.id] = f"ex:{sid}"

    # determine anchors
    methods_anchor = find_methods_anchor(root, nodes_by_id, out_edges)
    criteria_anchor = find_criteria_anchor(methods_anchor, nodes_by_id, out_edges)

    # collect methods under methods_anchor
    methods = []
    desc = descendants_of(methods_anchor.id, out_edges) | {methods_anchor.id}
    for nid in desc:
        n = nodes_by_id.get(nid)
        if n and n.type == "method":
            methods.append(n)
    # fallback: if no methods found, try all methods
    if not methods:
        methods = [n for n in nodes_by_id.values() if n.type == "method"]

    # map role predicates for logic->criteria edges
    role_by_edge: Dict[Tuple[str, str], str] = {}
    for e in graph.links:
        pred = (e.predicate or "").strip()
        if pred in ROLE_PREDS:
            role_by_edge[(e.source, e.target)] = pred

    triples: List[Triple] = []

    # пациенты диагноз root
    triples.append(Triple(subject="пациенты", predicate=P_DIAGNOSIS, object=(root.label or "Диагноз")))

    # root рекомендуется methods
    for m in methods:
        triples.append(Triple(subject=(root.label or "Диагноз"), predicate=P_RECOMMENDED, object=(m.label or m.id)))

    # if no criteria anchor — return basics
    if not criteria_anchor:
        # add criteria value/note if present anyway
        for n in nodes_by_id.values():
            if n.type == "criteria":
                if n.value:
                    triples.append(Triple(subject=(n.label or n.id), predicate=P_VALUE, object=str(n.value)))
                if n.note:
                    triples.append(Triple(subject=(n.label or n.id), predicate=P_NOTE, object=str(n.note)))
        return triples, iri_map, nodes_by_id

    # build expr & normalize NOT
    expr = build_criteria_expr(criteria_anchor, nodes_by_id, out_edges)
    if expr:
        expr = nnf(expr)

    # structural export:
    # - each logic node is a "group"
    # - group --связь OP--> operand (operand is group or criterion)
    # - group --критерий роль--> criterion  (role from edge label, if available)
    # - method --используется--> criteria_anchor_group
    #
    # We export based on the ORIGINAL graph structure for role edges,
    # but logical OP edges based on expr (NNF-normalized).

    # method uses groupRoot
    group_root_label = nodes_by_id[criteria_anchor.id].label or "Условия"
    for m in methods:
        triples.append(Triple(subject=(m.label or m.id), predicate=P_USED, object=group_root_label))

    # helper: give printable label for group nodes (logic)
    def group_label(logic_id: str) -> str:
        n = nodes_by_id.get(logic_id)
        return (n.label or logic_id)

    # export role edges (logic->criteria) from graph (not from nnf)
    # because role is on edge.
    for (src, tgt), role in role_by_edge.items():
        if src in nodes_by_id and tgt in nodes_by_id:
            g = nodes_by_id[src]
            c = nodes_by_id[tgt]
            if g.type == "logic" and c.type == "criteria":
                triples.append(Triple(subject=group_label(src), predicate=role, object=(c.label or c.id)))

    # export criteria value/note literals
    for n in nodes_by_id.values():
        if n.type == "criteria":
            if n.value not in (None, ""):
                triples.append(Triple(subject=(n.label or n.id), predicate=P_VALUE, object=str(n.value)))
            if n.note not in (None, ""):
                triples.append(Triple(subject=(n.label or n.id), predicate=P_NOTE, object=str(n.note)))

    # export logical structure from NNF expr:
    # Each Op corresponds to a group node. If NNF introduced NOT, it still refers to the same logic_node_id
    # (we reuse expr.logic_node_id, that's enough to name the group label).
    def export_expr(e: Expr, parent_group_id: Optional[str], parent_op: Optional[str]):
        if isinstance(e, Leaf):
            # leaf is operand; if parent is NOT, we want a NOT link from parent-group to leaf criterion
            if parent_group_id and parent_op:
                pred = op_pred(parent_op)
                triples.append(Triple(subject=group_label(parent_group_id), predicate=pred, object=(nodes_by_id[e.crit_node_id].label or e.crit_node_id)))
            return

        if isinstance(e, Op):
            this_gid = e.logic_node_id
            # link parent -> this group, if parent exists
            if parent_group_id and parent_op:
                pred = op_pred(parent_op)
                triples.append(Triple(subject=group_label(parent_group_id), predicate=pred, object=group_label(this_gid)))

            # if this op has args: emit this group -> operands
            for a in e.args:
                if isinstance(a, Leaf):
                    triples.append(Triple(subject=group_label(this_gid), predicate=op_pred(e.op), object=(nodes_by_id[a.crit_node_id].label or a.crit_node_id)))
                elif isinstance(a, Op):
                    triples.append(Triple(subject=group_label(this_gid), predicate=op_pred(e.op), object=group_label(a.logic_node_id)))
                    export_expr(a, None, None)  # its internal edges will be emitted in its own loop
                else:
                    pass

            # recurse to emit deeper op->op structure (already emitted above, but we want inner expansions too)
            for a in e.args:
                if isinstance(a, Op):
                    export_expr(a, None, None)
            return

    if expr:
        export_expr(expr, None, None)

    # dedupe triples (preserve order)
    seen = set()
    out = []
    for t in triples:
        key = (t.subject, t.predicate, t.object)
        if key not in seen:
            seen.add(key)
            out.append(t)

    return out, iri_map, nodes_by_id


# ---------------- TTL generation from structural triples ----------------

def generate_ttl(graph: Graph) -> str:
    triples, iri_map, nodes_by_id = generate_structural_triples(graph)

    # Build label->iri for entities we mention in triples (subjects/objects)
    # For node labels we use stable node IRIs; for "пациенты" make a fixed IRI.
    label_to_iri: Dict[str, str] = {"пациенты": "ex:grp_pacients"}

    # map all node labels to IRIs
    for n in nodes_by_id.values():
        lbl = n.label or n.id
        label_to_iri[lbl] = iri_map.get(n.id, f"ex:{stable_id(graph.doc.id, n.type, lbl, n.value, n.note)}")

    # groups appear by label too; ensure logic labels mapped
    for n in nodes_by_id.values():
        if n.type == "logic":
            lbl = n.label or n.id
            label_to_iri[lbl] = iri_map.get(n.id, label_to_iri.get(lbl))

    lines: List[str] = [
        "@prefix ex: <http://example.org/ontology#> .",
        "@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "",
    ]

    # Document / recommendation entity (optional but useful)
    rec_id = stable_id(graph.doc.id, "rec", graph.doc.id or "Recommendation", None, None)
    lines.append(f"ex:{rec_id} rdf:type ex:Рекомендация .")
    if graph.doc.id:
        lines.append(f'ex:{rec_id} rdfs:label "{escape_literal(graph.doc.id)}" .')
    if graph.doc.page:
        lines.append(f'ex:{rec_id} ex:страница "{escape_literal(graph.doc.page)}" .')
    if graph.doc.uur:
        lines.append(f'ex:{rec_id} ex:УУР "{escape_literal(graph.doc.uur)}" .')
    if graph.doc.udd:
        lines.append(f'ex:{rec_id} ex:УДД "{escape_literal(graph.doc.udd)}" .')
    if graph.doc.text:
        lines.append(f'ex:{rec_id} ex:текст """{escape_literal(graph.doc.text)}""" .')
    lines.append("")

    # Declarations
    # patients
    lines.append('ex:grp_pacients rdf:type ex:ГруппаПациентов .')
    lines.append('ex:grp_pacients rdfs:label "пациенты" .')
    lines.append("")

    for n in nodes_by_id.values():
        iri = iri_map[n.id]
        cls = node_class(n.type)
        lbl = n.label or n.id
        lines.append(f"{iri} rdf:type {cls} .")
        lines.append(f'{iri} rdfs:label "{escape_literal(lbl)}" .')

        if n.type == "criteria":
            if n.value not in (None, ""):
                lines.append(f'{iri} ex:{predicate_to_local_name(P_VALUE)} "{escape_literal(str(n.value))}" .')
            if n.note not in (None, ""):
                lines.append(f'{iri} ex:{predicate_to_local_name(P_NOTE)} "{escape_literal(str(n.note))}" .')

        if n.type == "logic":
            # store operator (AND/OR/NOT) as data property for recovery
            op = normalize_op(n.label)
            lines.append(f'{iri} ex:operator "{op}" .')

        # attach node to recommendation (optional)
        lines.append(f"ex:{rec_id} ex:имеетЭлемент {iri} .")

        lines.append("")

    # Triples
    for t in triples:
        pred_local = predicate_to_local_name(t.predicate)

        subj_iri = label_to_iri.get(t.subject, f'ex:ent_{stable_id(graph.doc.id, "ent", t.subject, None, None)}')
        # literal predicates
        if t.predicate in (P_VALUE, P_NOTE):
            lines.append(f'{subj_iri} ex:{pred_local} "{escape_literal(t.object)}" .')
            continue

        obj_iri = label_to_iri.get(t.object, f'ex:ent_{stable_id(graph.doc.id, "ent", t.object, None, None)}')
        lines.append(f"{subj_iri} ex:{pred_local} {obj_iri} .")

    return "\n".join(lines)


# ---------------- XLSX ----------------

def triples_to_xlsx(triples: List[Triple], graph: Graph) -> str:
    wb = Workbook()
    ws = wb.active
    ws.title = "Triples"
    ws.append(["объект", "субъект", "предикат", "документ", "текст рекомендации", "страница"])

    doc = graph.doc
    for t in triples:
        ws.append([t.object, t.subject, t.predicate, doc.id, doc.text, doc.page])

    fd, path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    wb.save(path)
    return path


# ---------------- FastAPI ----------------

app = FastAPI(title="Guideline converter backend (Unified)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok", "message": "unified converter API is running"}

@app.post("/api/graph/to-triples", response_model=List[Triple])
def api_graph_to_triples(graph: Graph = Body(...)) -> List[Triple]:
    triples, _, _ = generate_structural_triples(graph)
    return triples

@app.post("/api/graph/to-ttl", response_class=PlainTextResponse)
def api_graph_to_ttl(graph: Graph = Body(...)) -> str:
    return generate_ttl(graph)

@app.post("/api/graph/to-triples-xlsx")
def api_graph_to_triples_xlsx(graph: Graph = Body(...)):
    triples, _, _ = generate_structural_triples(graph)
    path = triples_to_xlsx(triples, graph)
    filename = (graph.doc.id or "triples").replace(" ", "_") + ".xlsx"
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )
