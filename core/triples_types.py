# core/triples_types.py
from dataclasses import dataclass

@dataclass
class TripleRow:
    subject: str
    predicate: str
    object: str
    doc: str
    page: int
    rec_text: str
