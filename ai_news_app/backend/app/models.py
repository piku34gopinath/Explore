from sqlalchemy import Column, String, DateTime, Integer, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class SystemConfig(Base):
    __tablename__ = "system_configs"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class ScriptCache(Base):
    __tablename__ = "script_cache"

    id = Column(Integer, primary_key=True, index=True)
    news_identifier = Column(String, unique=True, index=True) # event_title or hash
    script_data = Column(Text) # JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())
