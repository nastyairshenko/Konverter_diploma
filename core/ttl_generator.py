# core/ttl_generator.py
from typing import List
from .model import *
import json
from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
PROPS = json.loads((CONFIG_DIR / "properties.json").read_text(encoding="utf-8"))
CLASSES = json.loads((CONFIG_DIR / "classes.json").read_text(encoding="utf-8"))

NS = PROPS["ns"]
P = PROPS["properties"]

def iri(local: str) -> str:
    return f"ex:{local}"

def lit(s: str) -> str:
    s = str(s).replace("\\", "\\\\").replace('"', '\\"')
    return f"\"{s}\"@ru"


def disease_to_ttl(d: Disease, doc_id: str) -> List[str]:
    lines = []
    lines.append(f"{iri(d.id)} a ex:{PROPS['classes']['Disease']} ;")
    lines.append(f"    {P['mkb']} \"{d.mkb_code}\" .")
    lines.append("")
    return lines


def recommendation_to_ttl(d: Disease, r: Recommendation, doc_id: str) -> List[str]:
    lines: List[str] = []

    # индивид рекомендации
    lines.append(f"{iri(r.id)} a ex:{PROPS['classes']['Recommendation']} ;")
    lines.append(f"    {P['source']} {lit(doc_id)} ;")
    lines.append(f"    {P['appliesTo']} {iri(d.id)} ;")
    if r.udd is not None:
        lines.append(f"    {P['udd']} {r.udd} ;")
    if r.uur is not None:
        lines.append(f"    {P['uur']} {lit(r.uur)} ;")
    lines.append(f"    {P['page']} {r.page} ;")
    lines.append(f"    {P['originalText']} {lit(r.text)} ;")
    lines.append(
        f"    {P['hasMethodsGroup']} {iri(r.methods_group.id)} ."
    )
    lines.append("")

    # MethodsGroup
    mg = r.methods_group
    lines.append(f"{iri(mg.id)} a ex:{PROPS['classes']['MethodsGroup']} ;")
    if mg.criteria_group:
        lines.append(
            f"    {P['hasCriteriaGroup']} {iri(mg.criteria_group.id)} ;"
        )
    if mg.subgroups:
        subs = ", ".join(iri(sg.id) for sg in mg.subgroups)
        lines.append(f"    {P['hasMethodSubgroup']} {subs} .")
    else:
        lines[-1] = lines[-1].rstrip(" ;") + " ."
    lines.append("")

    # Подгруппы и методы
    for sg in mg.subgroups:
        lines.append(
            f"{iri(sg.id)} a ex:ПодгруппаМетодовЛечения ;"
        )
        lines.append(
            f"    {P['selectionRule']} {lit(sg.rule)} ;"
        )
        mids = ", ".join(iri(m.id) for m in sg.methods)
        lines.append(f"    {P['hasMethod']} {mids} .")
        lines.append("")
        for m in sg.methods:
            lines.append(f"{iri(m.id)} a ex:{PROPS['classes']['Method']} ;")
            lines.append(f"    rdfs:label {lit(m.label)} .")
            lines.append("")

    # Criteria
    def emit_group(g: CriteriaGroup, root: bool):
        cls = PROPS["classes"]["CriteriaGroup"] if root else PROPS["classes"]["CriteriaSubgroup"]
        lines.append(f"{iri(g.id)} a ex:{cls} ;")
        lines.append(f"    {P['selectionRule']} {lit(g.rule)} ;")

        if g.criteria:
            cids = ", ".join(iri(c.id) for c in g.criteria)
            lines.append(f"    {P['hasCriterion']} {cids} ;")

        if g.subgroups:
            sids = ", ".join(iri(sg.id) for sg in g.subgroups)
            lines.append(f"    {P['hasCriteriaSubgroup']} {sids} .")
        else:
            lines[-1] = lines[-1].rstrip(" ;") + " ."
        lines.append("")

        # сами критерии
        for c in g.criteria:
            cls_name = CLASSES["criterion_type_to_class"].get(c.type, "Критерий")
            lines.append(f"{iri(c.id)} a ex:{cls_name} ;")
            lines.append(f"    {P['label']} {lit(c.name)} ;")
            if c.value is not None:
                lines.append(f"    {P['value']} {lit(c.value)} .")
            else:
                lines[-1] = lines[-1].rstrip(" ;") + " ."
            lines.append("")

        for sg in g.subgroups:
            emit_group(sg, root=False)

    if mg.criteria_group:
        emit_group(mg.criteria_group, root=True)

    return lines


def document_to_ttl(doc: GuidelineDocument) -> str:
    lines = [
        '@prefix ex: <http://example.org/ontology#> .',
        '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
        '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
        ""
    ]
    for d in doc.diseases:
        lines.extend(disease_to_ttl(d, doc.id))
        for r in d.recommendations:
            lines.extend(recommendation_to_ttl(d, r, doc.id))
    return "\n".join(lines)
