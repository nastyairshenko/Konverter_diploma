
from dataclasses import dataclass
from typing import List, Dict, Any

# ---------- Структура тройки ----------

@dataclass
class TripleRow:
    subject: str      # субъект
    predicate: str    # предикат (из фиксированного списка)
    object: str       # объект
    doc: str          # документ
    page: int         # страница
    rec_text: str     # текст рекомендации


# ---------- Вспомогательные функции ----------

def iri(id_: str) -> str:
    """Очень простое преобразование id -> Turtle-IRI."""
    return f"ex:{id_}"

def ttl_literal(value: Any) -> str:
    """Строковый литерал @ru с экранированием."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s}"@ru'

def map_criterion_type_to_class(typ: str) -> str:
    """
    JSON-тип критерия -> имя класса из base.ttl.
    При необходимости можно подправить (например, для 'для').
    """
    typ = (typ or "").strip()
    if typ.startswith("Критерий"):
        return typ
    if typ == "для":
        # в base.ttl можно завести отдельный класс, пока назовём так
        return "КритерийЦель"
    return "Критерий"

def map_criterion_type_to_predicate(typ: str, negate: bool = False) -> str:
    """
    JSON-тип критерия -> предикат из PDF ('критерий пациент', ...).
    """
    typ = (typ or "").strip()
    if typ == "КритерийПациент":
        base = "критерий пациент"
    elif typ == "КритерийСимптом":
        base = "критерий симптом"
    elif typ == "КритерийВремя":
        base = "критерий время"
    elif typ == "КритерийВозможность":
        base = "критерий возможность"
    elif typ == "для":
        base = "для"
    else:
        base = "критерий"
    return base + ", NOT" if negate else base


# ======================================================================
# 1. JSON -> онтологический TTL (как PN.ttl, на основе base.ttl)
# ======================================================================

def recommendation_to_ttl(
    doc_key: str,
    disease_name: str,
    disease_obj: Dict[str, Any],
    rec: Dict[str, Any],
) -> str:
    """
    Механический конвертер одной рекомендации из pn1_v1.json в TTL, совместимый
    с онтологией (классы/свойства из base.ttl).

    На примере Рекомендации_ПН1 даёт структуру очень близкую к PN.ttl.
    """
    lines: List[str] = []

    # --- префиксы ---
    lines.extend([
        '@prefix ex: <http://example.org/ontology#> .',
        '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
        '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
        '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
        '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
        "",
    ])

    rec_id = rec["id"]
    gm = rec["группаМетодовЛечения"]

    # --- индивид рекомендации ---
    lines.append(f"{iri(rec_id)} a ex:Рекомендация ;")
    lines.append(f"    ex:имеетТип {ttl_literal(rec.get('тип'))} ;")
    lines.append(f"    ex:имеетГруппуМетодовЛечения {iri(gm['id'])} ;")

    # диагноз / заболевание – здесь жёстко кодируем ПН, можно адаптировать
    disease_id = "ПереломНадколенника"
    lines.append(f"    ex:применимоПри {iri(disease_id)} ;")

    if "УДД" in rec:
        lines.append(f"    ex:имеетУДД {rec['УДД']} ;")
    if "УУР" in rec:
        lines.append(f"    ex:имеетУУР {ttl_literal(str(rec['УУР']).strip())} ;")
    if "номерСтраницы" in rec:
        lines.append(f"    ex:номерСтраницы {rec['номерСтраницы']} ;")

    lines.append(f"    ex:источник {ttl_literal(doc_key)} ;")
    if "оригинальныйТекст" in rec:
        lines.append(
            f"    ex:оригинальныйТекст {ttl_literal(rec['оригинальныйТекст'])} ."
        )
    else:
        lines[-1] = lines[-1].rstrip(" ;") + " ."
    lines.append("")

    # --- индивид заболевания (+ код МКБ) ---
    if disease_obj.get("кодМКБ"):
        lines.append(f"{iri(disease_id)} a ex:Заболевание ;")
        lines.append(f"    ex:имеетКодМКБ \"{disease_obj['кодМКБ']}\" .")
        lines.append("")

    # --- группа методов лечения + подгруппы + методы ---
    def emit_group_methods(gm_obj: Dict[str, Any]) -> None:
        gid = gm_obj["id"]
        lines.append(f"{iri(gid)} a ex:ГруппаМетодовЛечения ;")
        if gm_obj.get("группаКритериев"):
            lines.append(
                f"    ex:имеетГруппуКритериев "
                f"{iri(gm_obj['группаКритериев']['id'])} ;"
            )
        if gm_obj.get("подгруппыМетодов"):
            sub_ids = ", ".join(iri(sub["id"]) for sub in gm_obj["подгруппыМетодов"])
            lines.append(
                f"    ex:имеетПодгруппуМетодовЛечения {sub_ids} ."
            )
        else:
            lines[-1] = lines[-1].rstrip(" ;") + " ."
        lines.append("")

        # подгруппы методов
        for sub in gm_obj.get("подгруппыМетодов", []):
            sid = sub["id"]
            lines.append(f"{iri(sid)} a ex:ПодгруппаМетодовЛечения ;")
            if sub.get("правилоВыбора"):
                lines.append(
                    f"    ex:правилоВыбора {ttl_literal(sub['правилоВыбора'])} ;"
                )
            if sub.get("методыЛечения"):
                mids = ", ".join(iri(m["id"]) for m in sub["методыЛечения"])
                lines.append(f"    ex:имеетМетодЛечения {mids} .")
            else:
                lines[-1] = lines[-1].rstrip(" ;") + " ."
            lines.append("")

            # сами методы лечения
            for m in sub.get("методыЛечения", []):
                mid = m["id"]
                label = m.get("label", mid)
                lines.append(f"{iri(mid)} a ex:МетодЛечения ;")
                lines.append(f"    rdfs:label {ttl_literal(label)} .")
                lines.append("")

    # --- группы/подгруппы критериев + сами критерии ---
    def emit_criteria_group(group_obj: Dict[str, Any], is_root: bool) -> None:
        gid = group_obj["id"]
        cls = "ГруппаКритериев" if is_root else "ПодгруппаКритериев"
        lines.append(f"{iri(gid)} a ex:{cls} ;")

        if group_obj.get("правилоВыбора"):
            lines.append(
                f"    ex:правилоВыбора {ttl_literal(group_obj['правилоВыбора'])} ;"
            )

        crit_ids = [c["id"] for c in group_obj.get("критерии", [])]
        if crit_ids:
            ids = ", ".join(iri(cid) for cid in crit_ids)
            lines.append(f"    ex:имеетКритерий {ids} ;")

        sub_ids = [sub["id"] for sub in group_obj.get("подгруппыКритериев", [])]
        if sub_ids:
            ids = ", ".join(iri(sid) for sid in sub_ids)
            lines.append(f"    ex:имеетПодгруппуКритериев {ids} .")
        else:
            lines[-1] = lines[-1].rstrip(" ;") + " ."
        lines.append("")

        # сами критерии
        for c in group_obj.get("критерии", []):
            cid = c["id"]
            ctype = map_criterion_type_to_class(c.get("тип", ""))
            name = c.get("имя", cid)
            val = c.get("значение")
            lines.append(f"{iri(cid)} a ex:{ctype} ;")
            lines.append(f"    ex:имя {ttl_literal(name)} ;")
            if val is not None:
                lines.append(f"    ex:значение {ttl_literal(val)} .")
            else:
                lines[-1] = lines[-1].rstrip(" ;") + " ."
            lines.append("")

        # рекурсивно подгруппы
        for sub in group_obj.get("подгруппыКритериев", []):
            emit_criteria_group(sub, is_root=False)

    emit_group_methods(gm)
    if gm.get("группаКритериев"):
        emit_criteria_group(gm["группаКритериев"], is_root=True)

    return "\n".join(lines)


# ======================================================================
# 2. JSON -> плоские тройки (как в таблице в PDF)
# ======================================================================

def recommendation_to_triples(
    doc_key: str,
    disease_name: str,
    disease_obj: Dict[str, Any],
    rec: Dict[str, Any],
) -> List[TripleRow]:
    """
    Конвертация Рекомендации 1 в таблицу троек.

    Сейчас покрывает основные паттерны, которые есть в примере:
    - диагноз
    - рекомендуется
    - критерий пациент / симптом / для (+ 'значение')
    - связи И / ИЛИ между критериями в пределах одной группы
    - учёт NOT как ', NOT' в предикате.
    """
    triples: List[TripleRow] = []

    page = int(rec.get("номерСтраницы", 0) or 0)
    rec_text = rec.get("оригинальныйТекст", "")
    doc_name = doc_key

    # --- 1. диагноз: пациенты -> ПН ---
    diagnosis_label = disease_name.replace("(ПН)", "ПН").strip()
    triples.append(
        TripleRow(
            subject="пациенты",
            predicate="диагноз",
            object=diagnosis_label,
            doc=doc_name,
            page=page,
            rec_text=rec_text,
        )
    )

    gm = rec["группаМетодовЛечения"]

    # --- собираем методы лечения ---
    methods: List[Dict[str, Any]] = []
    for sub in gm.get("подгруппыМетодов", []):
        for m in sub.get("методыЛечения", []):
            methods.append(m)

    # --- 2. ПН рекомендуется {метод} ---
    for m in methods:
        triples.append(
            TripleRow(
                subject=diagnosis_label,
                predicate="рекомендуется",
                object=m.get("label", m["id"]),
                doc=doc_name,
                page=page,
                rec_text=rec_text,
            )
        )

    # --- 3. Критерии (из группы критериев), навешиваем их на все методы ---
    root_group = gm.get("группаКритериев") or {}

    def attach_criteria(group_obj: Dict[str, Any], negate_ctx: bool = False) -> None:
        rule = (group_obj.get("правилоВыбора") or "").upper()
        next_negate = negate_ctx or (rule == "NOT")

        # 3.1 сами критерии
        for c in group_obj.get("критерии", []):
            ctype = c.get("тип", "")
            predicate = map_criterion_type_to_predicate(ctype, negate=next_negate)
            cname = c.get("имя", c["id"])

            # метод -> критерий XXX (для обоих методов в Примере 1 это корректно)
            for m in methods:
                triples.append(
                    TripleRow(
                        subject=m.get("label", m["id"]),
                        predicate=predicate,
                        object=cname,
                        doc=doc_name,
                        page=page,
                        rec_text=rec_text,
                    )
                )

            # при наличии значения – отдельная тройка 'значение'
            if c.get("значение"):
                triples.append(
                    TripleRow(
                        subject=cname,
                        predicate="значение",
                        object=str(c["значение"]),
                        doc=doc_name,
                        page=page,
                        rec_text=rec_text,
                    )
                )

        # 3.2 связи И / ИЛИ между критериями в группе
        crits = group_obj.get("критерии", [])
        if len(crits) >= 2 and rule in ("ALL", "ANY"):
            pred = "связь И" if rule == "ALL" else "связь ИЛИ"
            names = [c.get("имя", c["id"]) for c in crits]
            for i in range(len(names)):
                for j in range(i + 1, len(names)):
                    triples.append(
                        TripleRow(
                            subject=names[i],
                            predicate=pred,
                            object=names[j],
                            doc=doc_name,
                            page=page,
                            rec_text=rec_text,
                        )
                    )

        # 3.3 рекурсивно подгруппы
        for sub in group_obj.get("подгруппыКритериев", []):
            attach_criteria(sub, negate_ctx=next_negate)

    if root_group:
        attach_criteria(root_group)

    return triples
