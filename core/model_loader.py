# core/model_loader.py
from .model import *

def load_from_raw(doc_key: str, disease_key: str, raw: dict) -> GuidelineDocument:
    d_obj = raw[doc_key][disease_key]

    disease = Disease(
        id="ПереломНадколенника",
        label=disease_key.replace("(ПН)", "ПН").strip(),
        mkb_code=d_obj.get("кодМКБ", ""),
        recommendations=[],
    )

    for rec_raw in d_obj["рекомендации"]:
        gm_raw = rec_raw["группаМетодовЛечения"]

        # методы
        subgroups = []
        for sub in gm_raw.get("подгруппыМетодов", []):
            methods = [
                TreatmentMethod(id=m["id"], label=m.get("label", m["id"]))
                for m in sub.get("методыЛечения", [])
            ]
            subgroups.append(
                MethodSubgroup(
                    id=sub["id"],
                    rule=sub.get("правилоВыбора", "ANY"),
                    methods=methods,
                )
            )

        # критерии – рекурсивно
        def parse_group(gr_raw) -> CriteriaGroup:
            return CriteriaGroup(
                id=gr_raw["id"],
                rule=gr_raw.get("правилоВыбора", "ALL"),
                criteria=[
                    Criterion(
                        id=c["id"],
                        type=c.get("тип", ""),
                        name=c.get("имя", c["id"]),
                        value=c.get("значение"),
                    )
                    for c in gr_raw.get("критерии", [])
                ],
                subgroups=[parse_group(g) for g in gr_raw.get("подгруппыКритериев", [])],
            )

        cg = gm_raw.get("группаКритериев")
        criteria_group = parse_group(cg) if cg else None

        mg = MethodsGroup(
            id=gm_raw["id"],
            criteria_group=criteria_group,
            subgroups=subgroups,
        )

        rec = Recommendation(
            id=rec_raw["id"],
            type=rec_raw.get("тип", ""),
            udd=rec_raw.get("УДД"),
            uur=str(rec_raw.get("УУР")) if rec_raw.get("УУР") else None,
            page=int(rec_raw.get("номерСтраницы", 0) or 0),
            text=rec_raw.get("оригинальныйТекст", ""),
            methods_group=mg,
        )

        disease.recommendations.append(rec)

    return GuidelineDocument(
        id=doc_key,
        title=doc_key,
        diseases=[disease],
        raw=raw,
    )
