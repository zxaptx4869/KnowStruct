"""FastAPI 应用入口"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.auth import clear_session_cookie
from app.api.auth import router as auth_router
from app.api.errors import DomainError, NotAuthenticatedError
from app.api.projects import router as projects_router
from app.config import get_settings
from app.database import dispose_engine
from app.middleware.origin import TrustedOriginMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await dispose_engine()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS — 开发环境允许所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.trusted_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TrustedOriginMiddleware, settings=settings)

app.include_router(auth_router)
app.include_router(projects_router)


@app.exception_handler(NotAuthenticatedError)
async def handle_not_authenticated(request: Request, exc: NotAuthenticatedError):
    response = JSONResponse(
        status_code=401,
        content={"detail": {"code": "not_authenticated", "message": "请先登录"}},
    )
    clear_session_cookie(response)
    return response


@app.exception_handler(DomainError)
async def handle_domain_error(request: Request, exc: DomainError):
    detail: dict[str, object] = {"code": exc.code, "message": exc.message}
    detail.update(exc.details)
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION}


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/api/health",
    }
