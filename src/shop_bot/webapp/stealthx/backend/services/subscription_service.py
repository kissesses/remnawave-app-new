import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from shop_bot.webapp.stealthx.backend.models import Payment, Plan, Subscription

COUNTRY_MAP = {
    "usa": ("USA", "US", 40.7, -74.0),
    "us": ("USA", "US", 40.7, -74.0),
    "germany": ("Germany", "DE", 52.5, 13.4),
    "de": ("Germany", "DE", 52.5, 13.4),
    "netherlands": ("Netherlands", "NL", 52.37, 4.9),
    "nl": ("Netherlands", "NL", 52.37, 4.9),
    "singapore": ("Singapore", "SG", 1.35, 103.8),
    "sg": ("Singapore", "SG", 1.35, 103.8),
    "japan": ("Japan", "JP", 35.68, 139.69),
    "jp": ("Japan", "JP", 35.68, 139.69),
    "france": ("France", "FR", 48.85, 2.35),
    "fr": ("France", "FR", 48.85, 2.35),
}


def _resolve_country(host_name: str) -> tuple[str, str, float, float]:
    key = host_name.lower().split("-")[0].split("_")[0].strip()
    for part in host_name.lower().replace("-", " ").split():
        if part in COUNTRY_MAP:
            return COUNTRY_MAP[part]
    return (host_name, "", 0.0, 0.0)


def seed_default_plans(db: Session) -> None:
    if db.query(Plan).count() > 0:
        return
    defaults = [
        Plan(slug="basic", name="Basic", price_usd=4.99, popular=False, features=json.dumps([
            "Безлимитный трафик", "Все страны", "Kill Switch", "AES-256",
        ])),
        Plan(slug="pro", name="Pro", price_usd=8.99, popular=True, features=json.dumps([
            "Безлимитный трафик", "Все страны", "Kill Switch", "AES-256",
        ])),
        Plan(slug="ultimate", name="Ultimate", price_usd=12.99, popular=False, features=json.dumps([
            "Безлимитный трафик", "Все страны", "Kill Switch", "AES-256",
        ])),
    ]
    db.add_all(defaults)
    db.commit()


def list_plans(db: Session) -> list[Plan]:
    seed_default_plans(db)
    return db.query(Plan).filter(Plan.active.is_(True)).order_by(Plan.price_usd).all()


def create_subscription(db: Session, user_id: int, plan_id: int) -> tuple[Subscription, Payment]:
    plan = db.get(Plan, plan_id)
    if not plan:
        raise ValueError("Plan not found")

    sub = Subscription(
        user_id=user_id,
        plan_id=plan_id,
        status="pending",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=30),
    )
    db.add(sub)
    db.flush()

    payment = Payment(
        user_id=user_id,
        plan_id=plan_id,
        amount_usd=plan.price_usd,
        status="pending",
        external_id=f"sx-{sub.id}",
    )
    db.add(payment)
    db.commit()
    db.refresh(sub)
    db.refresh(payment)
    return sub, payment
