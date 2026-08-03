"""Origin validation for browser requests that can mutate state."""

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.config import Settings

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class TrustedOriginMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings) -> None:
        super().__init__(app)
        self.cookie_name = settings.SESSION_COOKIE_NAME
        self.trusted_origins = set(settings.trusted_origins)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        is_api_mutation = request.url.path.startswith("/api/") and request.method in UNSAFE_METHODS
        requires_check = bool(request.cookies.get(self.cookie_name)) or request.url.path == "/api/auth/login"
        if is_api_mutation and requires_check:
            origin = request.headers.get("origin", "").rstrip("/")
            if origin not in self.trusted_origins:
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": {
                            "code": "untrusted_origin",
                            "message": "请求来源不受信任",
                        }
                    },
                )
        return await call_next(request)
