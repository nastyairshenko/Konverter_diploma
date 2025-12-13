трёшаговый конвейер

JSON → внутренние объекты (core/model.py).

Внутренние объекты →

TTL (через ttl_generator)

Тройки (через rules + triples_generator)

Тройки → XLSX (xlsx_export).

запуск : uvicorn api.main:app --reload --host 127.0.0.1 --port 8000