import os
from collections.abc import AsyncIterator
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.auth import login_limiter
from app.database import get_db
from app.main import app
from app.models import AuthSession, Base, User, Workspace

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "sqlite+aiosqlite:///:memory:",
)


def assert_test_database(url: str) -> None:
    if url.startswith("sqlite+"):
        return
    database_name = urlparse(url.replace("mysql+aiomysql", "mysql")).path.lstrip("/")
    if not database_name.endswith("_test"):
        raise RuntimeError("TEST_DATABASE_URL must point to a database ending in _test")


assert_test_database(TEST_DATABASE_URL)
engine_options = {"poolclass": NullPool} if not TEST_DATABASE_URL.startswith("sqlite+") else {}
test_engine = create_async_engine(TEST_DATABASE_URL, pool_pre_ping=True, **engine_options)
TestSessionFactory = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def database_schema() -> AsyncIterator[None]:
    async with test_engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def clean_database() -> AsyncIterator[None]:
    async with TestSessionFactory.begin() as db:
        await db.execute(delete(AuthSession))
        await db.execute(delete(Workspace))
        await db.execute(delete(User))
    await login_limiter.reset()
    yield


@pytest_asyncio.fixture
async def db() -> AsyncIterator[AsyncSession]:
    async with TestSessionFactory() as session:
        yield session


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with TestSessionFactory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Origin": "http://localhost:5174"},
    ) as async_client:
        yield async_client
    app.dependency_overrides.clear()


@pytest.fixture
def trusted_origin() -> str:
    return "http://localhost:5174"
