from fastapi import APIRouter

from shop_bot.webapp.stealthx.backend.core.deps import DbSession
from shop_bot.webapp.stealthx.backend.schemas import ServerResponse, ServerStatusResponse
from shop_bot.webapp.stealthx.backend.services.server_service import get_server_status, sync_servers_from_hosts

router = APIRouter(tags=["stealthx-servers"])


@router.get("/servers", response_model=list[ServerResponse])
def api_servers(db: DbSession):
    servers = sync_servers_from_hosts(db)
    return [
        ServerResponse(
            country=s.country,
            country_code=s.country_code,
            host_name=s.host_name,
            ping_ms=s.ping_ms,
            load_pct=s.load_pct,
            status=s.status,
            lat=s.lat,
            lng=s.lng,
        )
        for s in servers
    ]


@router.get("/server-status", response_model=ServerStatusResponse)
def api_server_status(db: DbSession):
    data = get_server_status(db)
    return ServerStatusResponse(**data)
