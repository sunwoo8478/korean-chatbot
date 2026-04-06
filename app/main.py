from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
import time
from .core.skill_builder import restore_code_skills
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
import os
from .api.chat import router as chat_router
from .api.lookup import router as lookup_router
from .api.conversations import router as conv_router
from .api.skills import router as skills_router
from .api.export import router as export_router
from .api.documents import router as documents_router
from .api.standards_update import router as standards_router
from .api.admin import router as admin_router
from .api.notifications import router as notif_router
from .api.extras import router as extras_router
from .api.column_export import router as column_router
from .api.bookmarks import router as bookmarks_router
from .api.auth import router as auth_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    restore_code_skills()
    yield

app = FastAPI(title="Korean Standard Chatbot", version="1.0.0", lifespan=lifespan)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    error_msg = None
    try:
        response = await call_next(request)
        status = response.status_code
    except Exception as e:
        error_msg = str(e)[:200]
        status = 500
        raise
    finally:
        duration = int((time.time() - start) * 1000)
        path = request.url.path
        if not any(p in path for p in ["/health", "/static", "/admin/logs", "/admin/stats"]):
            try:
                from .core.database import db_cursor
                with db_cursor() as cur:
                    cur.execute(
                        "INSERT INTO request_logs (endpoint, duration_ms, status_code, error_msg) VALUES (%s,%s,%s,%s)",
                        (path, duration, status, error_msg)
                    )
            except Exception:
                pass
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api")
app.include_router(lookup_router, prefix="/api")
app.include_router(conv_router, prefix="/api")
app.include_router(skills_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(standards_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(notif_router, prefix="/api")
app.include_router(extras_router, prefix="/api")
app.include_router(column_router, prefix="/api")
app.include_router(bookmarks_router, prefix="/api")
app.include_router(auth_router, prefix="/api")

static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/share/{share_id}")
def share_page(share_id: str):
    resp = FileResponse(os.path.join(static_dir, "index.html"))
    resp.headers["Cache-Control"] = "no-store"
    return resp

@app.get("/")
def root():
    resp = FileResponse(os.path.join(static_dir, "index.html"))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    return resp

@app.get("/health")
def health():
    return {"status": "ok"}
