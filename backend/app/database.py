from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import create_engine
import os

RAW_DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:password@localhost:5432/videoclipper")


def _normalize(url: str) -> tuple[str, str]:
    """
    Accepts a Neon/Postgres URL in any common form and returns
    (async_url, sync_url) with the right drivers.
    """
    # Strip driver
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    if "+asyncpg" in url:
        base = url.replace("+asyncpg", "")
    elif "+psycopg" in url:
        base = url.replace("+psycopg", "")
    else:
        base = url  # plain postgresql://

    # asyncpg does NOT understand sslmode=... query params — strip them
    async_url = base.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "?" in async_url:
        head, _, query = async_url.partition("?")
        params = [p for p in query.split("&") if not p.startswith("sslmode=") and not p.startswith("channel_binding=")]
        async_url = head + ("?" + "&".join(params) if params else "")

    sync_url = base.replace("postgresql://", "postgresql+psycopg://", 1)

    return async_url, sync_url


DATABASE_URL, SYNC_DATABASE_URL = _normalize(RAW_DATABASE_URL)

# For Neon (or any managed Postgres) require SSL on asyncpg
connect_args = {}
if "neon.tech" in DATABASE_URL or os.getenv("DB_SSL_REQUIRE") == "1":
    connect_args = {"ssl": True}

engine = create_async_engine(DATABASE_URL, echo=True, connect_args=connect_args)
sync_engine = create_engine(SYNC_DATABASE_URL, echo=True)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=sync_engine)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
