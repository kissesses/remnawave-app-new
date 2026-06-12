from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    ok: bool = True
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int


class RefreshRequest(BaseModel):
    refresh_token: str


class UserProfileResponse(BaseModel):
    ok: bool = True
    user_id: int
    email: str | None
    display_name: str | None
    subscription_status: str | None
    active_keys: int = 0


class PlanResponse(BaseModel):
    id: int
    slug: str
    name: str
    price_usd: float
    popular: bool
    features: list[str]


class SubscribeRequest(BaseModel):
    plan_id: int


class SubscribeResponse(BaseModel):
    ok: bool = True
    subscription_id: int
    payment_required: bool = True
    message: str


class ServerResponse(BaseModel):
    country: str
    country_code: str
    host_name: str
    ping_ms: int
    load_pct: int
    status: str
    lat: float
    lng: float


class ServerStatusResponse(BaseModel):
    ok: bool = True
    total_servers: int
    online_servers: int
    countries: int
    uptime_pct: float
