from fastapi import APIRouter

from shop_bot.webapp.stealthx.backend.routers import admin, auth, servers, subscription, user

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(user.router)
api_router.include_router(subscription.router)
api_router.include_router(servers.router)
api_router.include_router(admin.router)
