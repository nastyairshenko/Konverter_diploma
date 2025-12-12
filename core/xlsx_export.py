# core/xlsx_export.py
from typing import List
from openpyxl import Workbook
from .triples_types import TripleRow

def export_triples_to_xlsx(triples: List[TripleRow], path: str) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Triples"

    # заголовки
    ws.append(["subject", "predicate", "object", "doc", "page", "rec_text"])

    for t in triples:
        ws.append([t.subject, t.predicate, t.object, t.doc, t.page, t.rec_text])

    wb.save(path)
