# core/rules.py
from dataclasses import dataclass
from typing import List, Protocol
from .model import *
from .triples_types import TripleRow
import json
from pathlib import Path

# грузим конфиг
CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"

PREDICATES = json.loads((CONFIG_DIR / "predicates.json").read_text(encoding="utf-8"))
CLASSES = json.loads((CONFIG_DIR / "classes.json").read_text(encoding="utf-8"))

def pred_key(name: str) -> str:
    return PREDICATES[name]

def map_criterion_predicate(ctype: str, negate: bool = False) -> str:
    key = CLASSES["criterion_type_to_predicate"].get(ctype, "criterion_goal")
    base = pred_key(key)
    return base + (PREDICATES["not_suffix"] if negate else "")


@dataclass
class Context:
    doc: GuidelineDocument
    disease: Disease
    rec: Recommendation


class Rule(Protocol):
    def apply(self, ctx: Context) -> List[TripleRow]:
        ...


# --- Конкретные правила ---

class DiagnosisRule:
    """пациенты -> диагноз -> {болезнь}"""

    def apply(self, ctx: Context) -> List[TripleRow]:
        d = ctx.disease
        r = ctx.rec
        return [
            TripleRow(
                subject="пациенты",
                predicate=pred_key("diagnosis"),
                object=d.label,
                doc=ctx.doc.id,
                page=r.page,
                rec_text=r.text,
            )
        ]


class RecommendationRule:
    """{болезнь} -> рекомендуется -> {метод}"""

    def apply(self, ctx: Context) -> List[TripleRow]:
        d = ctx.disease
        r = ctx.rec
        triples = []
        mg = r.methods_group
        for sub in mg.subgroups:
            for m in sub.methods:
                triples.append(
                    TripleRow(
                        subject=d.label,
                        predicate=pred_key("recommended"),
                        object=m.label,
                        doc=ctx.doc.id,
                        page=r.page,
                        rec_text=r.text,
                    )
                )
        return triples


class CriteriaRule:
    """
    Для каждой группы критериев создаём:
    - метод -> критерий {тип}
    - критерий -> значение
    - связь И / ИЛИ внутри группы
    """

    def apply(self, ctx: Context) -> List[TripleRow]:
        triples: List[TripleRow] = []
        r = ctx.rec
        mg = r.methods_group
        methods = [m for sub in mg.subgroups for m in sub.methods]

        def walk_group(g: CriteriaGroup, negate_ctx: bool = False):
            rule = g.rule.upper()
            next_negate = negate_ctx or (rule == "NOT")

            # критерии
            for c in g.criteria:
                pred = map_criterion_predicate(c.type, negate=next_negate)

                for m in methods:
                    triples.append(
                        TripleRow(
                            subject=m.label,
                            predicate=pred,
                            object=c.name,
                            doc=ctx.doc.id,
                            page=r.page,
                            rec_text=r.text,
                        )
                    )

                if c.value is not None:
                    triples.append(
                        TripleRow(
                            subject=c.name,
                            predicate=pred_key("value"),
                            object=str(c.value),
                            doc=ctx.doc.id,
                            page=r.page,
                            rec_text=r.text,
                        )
                    )

            # связь И / ИЛИ в пределах группы
            if len(g.criteria) >= 2 and rule in ("ALL", "ANY"):
                link_pred = pred_key("and") if rule == "ALL" else pred_key("or")
                names = [c.name for c in g.criteria]
                for i in range(len(names)):
                    for j in range(i + 1, len(names)):
                        triples.append(
                            TripleRow(
                                subject=names[i],
                                predicate=link_pred,
                                object=names[j],
                                doc=ctx.doc.id,
                                page=r.page,
                                rec_text=r.text,
                            )
                        )

            # подгруппы
            for sg in g.subgroups:
                walk_group(sg, next_negate)

        if mg.criteria_group:
            walk_group(mg.criteria_group, negate_ctx=False)

        return triples


# РЕЕСТР ПРАВИЛ – сюда можно добавлять новые правила
RULES: List[Rule] = [
    DiagnosisRule(),
    RecommendationRule(),
    CriteriaRule(),
    # В будущем:
    # PlaceRule(), NextStepRule(), ...
]
