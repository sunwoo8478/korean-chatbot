from fastapi import APIRouter, Query
from ..core.database import db_cursor

router = APIRouter()

@router.get("/term")
def get_term(name: str = Query(...)):
    with db_cursor() as cur:
        cur.execute("""
            SELECT t.term_name, t.term_abbr, t.term_desc, t.domain_name,
                   d.data_type, d.data_length, d.data_decimal,
                   d.storage_format, d.display_format
            FROM std_term t
            LEFT JOIN std_domain d ON d.domain_name ILIKE t.domain_name || '%'
            WHERE t.term_name ILIKE %s
            ORDER BY t.term_name LIMIT 10
        """, (f"%{name}%",))
        rows = cur.fetchall()
    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    return [dict(r) for r in rows]

@router.get("/domain")
def get_domain(name: str = Query(...)):
    with db_cursor() as cur:
        cur.execute("""
            SELECT domain_name, domain_desc, data_type, data_length,
                   data_decimal, storage_format, display_format
            FROM std_domain
            WHERE domain_name ILIKE %s
            ORDER BY domain_name LIMIT 10
        """, (f"%{name}%",))
        rows = cur.fetchall()
    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    return [dict(r) for r in rows]

@router.get("/dictionary")
def get_dictionary(word: str = Query(...)):
    with db_cursor() as cur:
        cur.execute("""
            SELECT e.word, e.word_type, e.pronunciation,
                   s.pos, s.definition, s.sense_type, s.category
            FROM dict_entries e
            JOIN dict_senses s ON e.id = s.entry_id
            WHERE e.word ILIKE %s
            ORDER BY e.word, s.id
            LIMIT 10
        """, (f"%{word}%",))
        rows = cur.fetchall()
    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    return [dict(r) for r in rows]
