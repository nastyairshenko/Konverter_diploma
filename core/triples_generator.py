# core/triples_generator.py
from typing import List
from .model import GuidelineDocument
from .triples_types import TripleRow
from .rules import RULES, Context

def generate_triples(doc: GuidelineDocument) -> List[TripleRow]:
    triples: List[TripleRow] = []
    for disease in doc.diseases:
        for rec in disease.recommendations:
            ctx = Context(doc=doc, disease=disease, rec=rec)
            for rule in RULES:
                triples.extend(rule.apply(ctx))
    return triples
