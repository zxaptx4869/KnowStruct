"""Password authentication API."""

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import Auth, DbSession
from app.config import get_settings
from app.models import User
from app.schemas.auth import AuthResponse, LoginRequest
from app.services.auth import (
    DUMMY_PASSWORD_HASH,
    create_auth_session,
    normalize_account,
    revoke_session,
    verify_password,
)
from app.services.rate_limit import SlidingWindowRateLimiter

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()
login_limiter = SlidingWindowRateLimiter(
    settings.LOGIN_RATE_LIMIT,
    settings.LOGIN_RATE_WINDOW_SECONDS,
)


def set_session_cookie(response: Response, token: str, remember_me: bool) -> None:
    max_age = settings.REMEMBER_SESSION_DAYS * 24 * 60 * 60 if remember_me else None
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def auth_response(user: User) -> AuthResponse:
    return AuthResponse.model_validate(
        {
            "user": user,
            "workspace": user.workspace,
        }
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = await login_limiter.check(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "rate_limited", "message": "登录请求过于频繁，请稍后再试"},
            headers={"Retry-After": str(retry_after)},
        )

    try:
        login_name = normalize_account(payload.account)
    except ValueError:
        login_name = ""
    user = await db.scalar(
        select(User)
        .where(User.login_name == login_name)
        .options(selectinload(User.workspace))
    )
    encoded_hash = user.password_hash if user else DUMMY_PASSWORD_HASH
    password_valid = verify_password(payload.password, encoded_hash)
    if user is None or not password_valid or user.workspace is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials", "message": "账号或密码错误，请重新输入"},
        )

    lifetime = (
        timedelta(days=settings.REMEMBER_SESSION_DAYS)
        if payload.remember_me
        else timedelta(hours=settings.SESSION_TTL_HOURS)
    )
    _, raw_token = await create_auth_session(db, user.id, lifetime)
    await db.commit()
    set_session_cookie(response, raw_token, payload.remember_me)
    return auth_response(user)


@router.get("/me", response_model=AuthResponse)
async def me(auth: Auth) -> AuthResponse:
    return auth_response(auth.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, db: DbSession) -> Response:
    raw_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    await revoke_session(db, raw_token)
    await db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response)
    return response
