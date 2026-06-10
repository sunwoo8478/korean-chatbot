from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx, json, re
from anthropic import AsyncAnthropic
from ..rag.pipeline import run
from ..rag.context_manager import preprocess, anchor_user_message
from ..rag.summarizer import maybe_summarize, build_history_with_summary
from ..core.config import settings
from .skills import get_active_tools, execute_skill

router = APIRouter()

class HistoryMessage(BaseModel):
    role: str    # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    message: str
    model: str = "qwen"
    qwen_model: str = "35b"
    api_key: str = ""
    conv_id: str = ""
    history: list[HistoryMessage] = []   # 직전 대화 히스토리 (최대 6턴)

# ── Qwen 토큰 스트림 ────────────────────────────────────────────────────────
def _qwen_config(qwen_model: str) -> tuple[str, str]:
    """모델 선택에 따라 (url, model_name) 반환"""
    if qwen_model == "27b":
        return settings.vllm_url_dense, settings.vllm_model_dense
    return settings.vllm_url, settings.vllm_model

async def _stream_qwen(rag: dict, qwen_model: str = "35b", history: list = None):
    url, model_name = _qwen_config(qwen_model)
    is_ollama = "11434" in url or "11435" in url or qwen_model == "27b"

    # 시스템 프롬프트 → 히스토리(최대 6턴) → 현재 질문 순서로 메시지 구성
    messages = [{"role": "system", "content": rag["system_prompt"]}]
    if history:
        for h in history[-6:]:   # 최근 6턴만 (토큰 절약)
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": rag["user_message"]})

    # 활성 스킬 — vLLM tool calling 또는 프롬프트 주입 방식
    tools = [] if is_ollama else get_active_tools()
    # _skill_id는 내부용 — vLLM에 보내기 전 제거
    clean_tools = [{k: v for k, v in t.items() if k != "_skill_id"} for t in tools]
    skill_map   = {t["function"]["name"]: t["_skill_id"] for t in tools}

    payload = {
        "model": model_name,
        "messages": messages,
        "max_tokens": settings.vllm_max_tokens,
        "temperature": settings.vllm_temperature,
        "stream": True,
    }
    if clean_tools:
        payload["tools"] = clean_tools
        payload["tool_choice"] = "auto"
    if is_ollama:
        payload["options"] = {"think": False, "temperature": 0.3}
    else:
        payload["chat_template_kwargs"] = {"enable_thinking": False}

    in_think = False

    async def _call_llm(msgs, pld):
        """LLM 한 번 호출 — tool_call이 있으면 (tool_name, args) 반환, 없으면 None"""
        tool_call_buf = {}
        async with httpx.AsyncClient(timeout=300) as c:
            async with c.stream("POST", f"{url}/chat/completions", json={**pld, "messages": msgs}) as r:
                async for line in r.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    try: d = json.loads(line[6:])
                    except: continue
                    choice = d["choices"][0]
                    delta  = choice.get("delta", {})
                    # tool_call 스트리밍 조각 누적
                    for tc in delta.get("tool_calls", []):
                        idx = tc.get("index", 0)
                        if idx not in tool_call_buf:
                            tool_call_buf[idx] = {"name": "", "args": ""}
                        if tc.get("function", {}).get("name"):
                            tool_call_buf[idx]["name"] += tc["function"]["name"]
                        if tc.get("function", {}).get("arguments"):
                            tool_call_buf[idx]["args"] += tc["function"]["arguments"]
                    # finish_reason이 tool_calls면 반환
                    if choice.get("finish_reason") == "tool_calls" and tool_call_buf:
                        return tool_call_buf
        return None

    # 1차 호출
    tool_calls = await _call_llm(messages, payload)

    if tool_calls and skill_map:
        # 스킬 실행 → 결과를 메시지에 추가 → 2차 호출
        messages.append({"role": "assistant", "tool_calls": [
            {"id": f"call_{i}", "type": "function",
             "function": {"name": tc["name"], "arguments": tc["args"]}}
            for i, tc in tool_calls.items()
        ]})
        for i, tc in tool_calls.items():
            skill_id = skill_map.get(tc["name"])
            try: args = json.loads(tc["args"]) if tc["args"] else {}
            except: args = {}
            result = await execute_skill(skill_id, args) if skill_id else "스킬 없음"
            messages.append({
                "role": "tool",
                "tool_call_id": f"call_{i}",
                "content": result,
            })
        # 스킬 결과를 포함한 2차 스트리밍
        new_payload = {**payload}
        new_payload.pop("tools", None)
        new_payload.pop("tool_choice", None)
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", f"{url}/chat/completions",
                                     json={**new_payload, "messages": messages}) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        try: data = json.loads(line[6:])
                        except: continue
                        delta = data["choices"][0]["delta"].get("content", "")
                        if delta: yield delta
    else:
        # 스킬 없음 — 일반 스트리밍
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", f"{url}/chat/completions", json=payload) as resp:
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        try: data = json.loads(line[6:])
                        except: continue
                        delta = data["choices"][0]["delta"].get("content", "")
                        if not delta: continue
                        if "<think>" in delta: in_think = True
                        if in_think:
                            if "</think>" in delta:
                                in_think = False
                                after = delta.split("</think>", 1)[-1]
                                if after.strip(): yield after
                            continue
                        skip = ["Here's a thinking","Let me think","thinking process",
                                "Analyze User","Step 1:","Step 2:","Step 3:",
                                "Synthesize","Draft ","Verify against"]
                        if any(p in delta for p in skip): continue
                        yield delta

# ── Claude 토큰 스트림 ──────────────────────────────────────────────────────
async def _stream_claude(rag: dict, api_key: str = ""):
    key = api_key or settings.anthropic_api_key
    if not key:
        yield "Claude API 키가 설정되지 않았습니다. 우측 상단 **'Claude 비교 연결'** 버튼을 클릭해 API 키를 입력해주세요."
        return
    client = AsyncAnthropic(api_key=key)
    async with client.messages.stream(
        model=settings.claude_model,
        max_tokens=settings.claude_max_tokens,
        thinking={"type": "adaptive"},
        system=[{
            "type": "text",
            "text": rag["system_prompt"],
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": rag["user_message"]}],
    ) as stream:
        async for text in stream.text_stream:
            yield text

# ── SSE 스트리밍 엔드포인트 ─────────────────────────────────────────────────
# 소스 먼저 → 토큰 스트림 → done 순서로 전송
@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    # ① 누적 요약 + 최근 4턴으로 히스토리 구성
    history_raw = [h.dict() for h in req.history] if req.history else []
    conv_id = req.conv_id or None
    history_with_summary = build_history_with_summary(conv_id, history_raw)

    # ② 쿼리 재작성 (지시어 해소)
    rewritten_query, compressed_history = preprocess(req.message, history_with_summary)

    rag = run(rewritten_query, conv_id=req.conv_id or None)

    # ③ user_message는 RAG 컨텍스트만 — 앵커링은 시스템 프롬프트에서 처리
    # (anchor_user_message 제거: 히스토리와 충돌 방지)
    if "질문:" in rag["user_message"]:
        ctx_part = rag["user_message"].rsplit("질문:", 1)[0].strip()
    else:
        ctx_part = rag["user_message"]
    rag["user_message"] = ctx_part + f"\n\n질문: {rewritten_query}"

    sources = [{"source": d["source"], "title": d["title"], "content": d.get("content", "")} for d in rag["docs"]]

    # 프롬프트 주입 스킬
    from ..core.database import db_cursor as _dbc
    try:
        with _dbc() as cur:
            cur.execute("SELECT config FROM skills WHERE is_active=true AND skill_type='prompt'")
            prompt_skills = cur.fetchall()
        if prompt_skills:
            extra = "\n\n## 적용 중인 스킬 규칙\n"
            extra += "\n".join(row["config"].get("content","") for row in prompt_skills if row["config"])
            rag["system_prompt"] = rag["system_prompt"] + extra
    except Exception:
        pass

    # 답변 품질 평가
    std_sources = [d for d in rag["docs"] if d["source"] in ("공통표준용어","공통표준단어","공통표준도메인")]
    dict_sources = [d for d in rag["docs"] if d["source"] == "사전"]
    quality = {
        "total_sources": len(rag["docs"]),
        "std_count": len(std_sources),
        "dict_count": len(dict_sources),
        "has_std": len(std_sources) > 0,
        "has_dict": len(dict_sources) > 0,
        "grade": "high" if len(std_sources) >= 2 else "medium" if len(rag["docs"]) > 0 else "low",
    }

    async def generate():
        yield f"data: {json.dumps({'type':'sources','data':sources}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type':'quality','data':quality}, ensure_ascii=False)}\n\n"
        stream = (
            _stream_claude(rag, req.api_key)
            if req.model == "claude"
            else _stream_qwen(rag, req.qwen_model, compressed_history)
        )
        async for token in stream:
            yield f"data: {json.dumps({'type':'token','text':token}, ensure_ascii=False)}\n\n"
        yield 'data: {"type":"done"}\n\n'

        # 답변 완료 후 백그라운드에서 누적 요약 실행 (4턴마다)
        if conv_id:
            import asyncio
            asyncio.get_event_loop().run_in_executor(None, maybe_summarize, conv_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# ── 기존 full 엔드포인트 (하위 호환) ────────────────────────────────────────
@router.post("/chat/full")
async def chat_full(req: ChatRequest):
    rag = run(req.message, conv_id=req.conv_id or None)

    if req.model == "claude":
        key = req.api_key or settings.anthropic_api_key
        if not key:
            return {"answer": "Claude API 키가 없습니다. 상단 'Claude 비교 연결' 버튼에서 키를 입력해주세요.",
                    "model": "claude", "sources": []}
        client = AsyncAnthropic(api_key=key)
        async with client.messages.stream(
            model=settings.claude_model,
            max_tokens=settings.claude_max_tokens,
            thinking={"type": "adaptive"},
            system=[{"type": "text", "text": rag["system_prompt"],
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": rag["user_message"]}],
        ) as stream:
            message = await stream.get_final_message()
        answer = next((b.text for b in message.content if b.type == "text"), "")
        return {"answer": answer, "model": "claude",
                "sources": [{"source": d["source"], "title": d["title"], "content": d.get("content", "")} for d in rag["docs"]]}

    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(
            f"{settings.vllm_url}/chat/completions",
            json={
                "model": settings.vllm_model,
                "messages": [
                    {"role": "system", "content": rag["system_prompt"]},
                    {"role": "user",   "content": rag["user_message"]},
                ],
                "max_tokens": settings.vllm_max_tokens,
                "temperature": settings.vllm_temperature,
                "chat_template_kwargs": {"enable_thinking": False},
            }
        )
    result = resp.json()
    return {"answer": result["choices"][0]["message"]["content"], "model": "qwen",
            "sources": [{"source": d["source"], "title": d["title"], "content": d.get("content", "")} for d in rag["docs"]]}
