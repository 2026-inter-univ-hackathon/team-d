import math
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac

from .models import LoginAttempt


MAX_FAILURES = 5
FAILURE_WINDOW = timedelta(minutes=15)
BLOCK_DURATION = timedelta(minutes=15)


def _identifier_hash(username):
    normalized = username.strip().lower()
    return salted_hmac(
        "login.rate-limit.identifier",
        normalized,
        algorithm="sha256",
    ).hexdigest()


def _remaining_seconds(blocked_until, now):
    return max(1, math.ceil((blocked_until - now).total_seconds()))


def blocked_seconds(username):
    """ブロック中なら残り秒数、対象外なら0を返す。"""
    now = timezone.now()
    blocked_until = (
        LoginAttempt.objects
        .filter(identifier_hash=_identifier_hash(username))
        .values_list("blocked_until", flat=True)
        .first()
    )
    if blocked_until is None or blocked_until <= now:
        return 0
    return _remaining_seconds(blocked_until, now)


def _record_failure(identifier_hash, now):
    with transaction.atomic():
        attempt = (
            LoginAttempt.objects
            .select_for_update()
            .filter(identifier_hash=identifier_hash)
            .first()
        )

        if attempt is None:
            attempt = LoginAttempt.objects.create(
                identifier_hash=identifier_hash,
                failed_count=1,
                window_started_at=now,
            )
            return 0

        if attempt.blocked_until is not None and attempt.blocked_until > now:
            return _remaining_seconds(attempt.blocked_until, now)

        window_expired = now >= attempt.window_started_at + FAILURE_WINDOW
        block_expired = attempt.blocked_until is not None
        if window_expired or block_expired:
            attempt.failed_count = 1
            attempt.window_started_at = now
            attempt.blocked_until = None
        else:
            attempt.failed_count += 1

        if attempt.failed_count >= MAX_FAILURES:
            attempt.blocked_until = now + BLOCK_DURATION

        attempt.save(update_fields=[
            "failed_count",
            "window_started_at",
            "blocked_until",
            "updated_at",
        ])
        if attempt.blocked_until is None:
            return 0
        return _remaining_seconds(attempt.blocked_until, now)


def record_failure(username):
    """失敗を記録し、今回からブロックする場合は残り秒数を返す。"""
    identifier_hash = _identifier_hash(username)
    now = timezone.now()
    try:
        return _record_failure(identifier_hash, now)
    except IntegrityError:
        # 初回の同時リクエストで同じ行を作成した場合、既存行へ記録し直す。
        return _record_failure(identifier_hash, now)


def clear_failures(username):
    LoginAttempt.objects.filter(
        identifier_hash=_identifier_hash(username),
    ).delete()
