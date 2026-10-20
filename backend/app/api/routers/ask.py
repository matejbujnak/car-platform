"""Market assistant API: ask questions in natural language."""

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.assistant import extract_filters, generate_answer, parse_question, search_listings
from app.core.rate_limit import limiter
from app.db.session import get_session

router = APIRouter(prefix="/api/ask", tags=["ask"])


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@router.post("/parse")
@limiter.limit("20/minute")
def ask_parse(request: Request, body: Question) -> dict:
    """Natural language -> structured search filters (LLM experiment, with a
    rule-based fallback). The filters use the same keys as the listing filters."""
    filters, source = extract_filters(body.question)
    return {"question": body.question, "filters": filters, "source": source}


@router.post("/search")
@limiter.limit("20/minute")
def ask_search(
    request: Request,
    body: Question,
    session: Session = Depends(get_session),
) -> dict:
    """Parse the question and return matching listings (fast, no LLM)."""
    filters = parse_question(body.question)
    matches, summary = search_listings(session, filters)
    return {
        "question": body.question,
        "filters": {k: v for k, v in filters.items() if k != "limit" and v},
        "matches": matches,
        "summary": summary,
    }


@router.post("/answer")
@limiter.limit("10/minute")
def ask_answer(
    request: Request,
    body: Question,
    session: Session = Depends(get_session),
) -> dict:
    """Full pipeline: parse -> query -> grounded answer written by the LLM.

    Slower (the local model thinks); the frontend can show the matches from
    /api/ask/search first and the answer when it arrives.
    """
    filters = parse_question(body.question)
    matches, summary = search_listings(session, filters)
    answer, used_llm = generate_answer(body.question, filters, matches, summary)
    return {
        "question": body.question,
        "answer": answer,
        "used_llm": used_llm,
        "summary": summary,
    }
