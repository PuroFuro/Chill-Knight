from __future__ import annotations

import bcrypt
from itsdangerous import BadSignature, URLSafeSerializer

from .config import settings

_serializer = URLSafeSerializer(settings.secret_key, salt="chill-knight-auth")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_token(player_id: int, nickname: str) -> str:
    return _serializer.dumps({"id": player_id, "nickname": nickname})


def decode_token(token: str) -> dict | None:
    try:
        data = _serializer.loads(token)
    except BadSignature:
        return None
    if not isinstance(data, dict) or "id" not in data:
        return None
    return data
