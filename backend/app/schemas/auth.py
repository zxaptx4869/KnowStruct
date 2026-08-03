"""Authentication API schemas."""

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    account: str = Field(min_length=1, max_length=191)
    password: str = Field(min_length=1, max_length=128)
    remember_me: bool = False


class CurrentUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    login_name: str


class CurrentWorkspace(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str


class AuthResponse(BaseModel):
    user: CurrentUser
    workspace: CurrentWorkspace
