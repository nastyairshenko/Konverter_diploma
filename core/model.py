# core/model.py
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

@dataclass
class Criterion:
    id: str
    type: str           # "КритерийПациент", "КритерийСимптом", "для", ...
    name: str
    value: Optional[str] = None

@dataclass
class CriteriaGroup:
    id: str
    rule: str                          # "ALL", "ANY", "NOT"
    criteria: List[Criterion] = field(default_factory=list)
    subgroups: List["CriteriaGroup"] = field(default_factory=list)

@dataclass
class TreatmentMethod:
    id: str
    label: str

@dataclass
class MethodSubgroup:
    id: str
    rule: str                          # "ALL"/"ANY" – как выбирать методы
    methods: List[TreatmentMethod]

@dataclass
class MethodsGroup:
    id: str
    criteria_group: Optional[CriteriaGroup]
    subgroups: List[MethodSubgroup]

@dataclass
class Recommendation:
    id: str
    type: str
    udd: Optional[int]
    uur: Optional[str]
    page: int
    text: str
    methods_group: MethodsGroup

@dataclass
class Disease:
    id: str          # "ПереломНадколенника"
    label: str       # "ПН" и т.п.
    mkb_code: str
    recommendations: List[Recommendation]

@dataclass
class GuidelineDocument:
    id: str              # doc_key
    title: str
    diseases: List[Disease]
    raw: Dict[str, Any]  # исходный JSON при желании
