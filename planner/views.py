import json
from datetime import date, time
from functools import wraps

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from login.authentication import token_required
from .models import Event


class ApiError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def api(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except ApiError as error:
            return JsonResponse({"error": error.message}, status=error.status)
        except ValidationError as error:
            return JsonResponse({"error": " / ".join(error.messages)}, status=400)
    return csrf_exempt(never_cache(token_required(wrapped)))


def body(request):
    if request.content_type != "application/json":
        raise ApiError("JSON形式で送信してください。", 415)
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        raise ApiError("JSONを読み込めませんでした。")
    if not isinstance(data, dict):
        raise ApiError("入力形式が正しくありません。")
    return data


def apply_fields(event, data):
    allowed = {"title", "memo", "status", "date", "time", "duration", "remindedOn"}
    if set(data) - allowed:
        raise ApiError("対応していない項目が含まれています。")
    for key, value in data.items():
        if key in {"title", "memo", "status"}:
            if not isinstance(value, str):
                raise ApiError("タイトル・メモ・ステータスは文字列にしてください。")
            setattr(event, key, value.strip() if key == "title" else value)
        elif key == "duration":
            if type(value) is not int or not 1 <= value <= 24:
                raise ApiError("所要時間は1〜24の整数にしてください。")
            event.duration = value
        else:
            parsed = None
            if value is not None:
                try:
                    if not isinstance(value, str):
                        raise ValueError
                    parsed = time.fromisoformat(value) if key == "time" else date.fromisoformat(value)
                    if key == "time" and (len(value) != 5 or parsed.minute != 0 or parsed.second != 0 or parsed.tzinfo):
                        raise ValueError
                    if key != "time" and parsed.isoformat() != value:
                        raise ValueError
                except ValueError:
                    raise ApiError("日付はYYYY-MM-DD、時刻はHH:00で入力してください。")
            setattr(event, "reminded_on" if key == "remindedOn" else key, parsed)
    if event.date is None:
        event.time = None
    if event.time and event.time.hour + event.duration > 24:
        event.duration = 24 - event.time.hour
    event.full_clean()


def own_event(request, event_id):
    try:
        return Event.objects.get(id=event_id, user=request.user)
    except Event.DoesNotExist:
        raise ApiError("予定が見つかりません。", 404)


def expected_version(data):
    value = data.pop("version", None)
    if type(value) is not int or value < 1:
        raise ApiError("予定の更新番号が必要です。")
    return value


@api
@require_http_methods(["GET", "POST"])
def events(request):
    if request.method == "GET":
        return JsonResponse({"events": [event.as_dict() for event in Event.objects.filter(user=request.user)]})
    event = Event(user=request.user)
    apply_fields(event, body(request))
    event.save()
    return JsonResponse({"event": event.as_dict()}, status=201)


@api
@require_http_methods(["GET", "PATCH", "DELETE"])
def event_detail(request, event_id):
    event = own_event(request, event_id)
    if request.method == "GET":
        return JsonResponse({"event": event.as_dict()})
    data = body(request)
    version = expected_version(data)
    if request.method == "DELETE":
        if data:
            raise ApiError("削除リクエストの形式が正しくありません。")
        deleted, _ = Event.objects.filter(id=event.id, user=request.user, version=version).delete()
        if not deleted:
            raise ApiError("別の画面で変更されています。最新の予定を読み直してください。", 409)
        return JsonResponse({"deleted": str(event.id)})
    apply_fields(event, data)
    updated = Event.objects.filter(id=event.id, user=request.user, version=version).update(
        title=event.title, memo=event.memo, status=event.status, date=event.date, time=event.time,
        duration=event.duration, reminded_on=event.reminded_on, version=version + 1,
    )
    if not updated:
        raise ApiError("別の画面で変更されています。最新の予定を読み直してください。", 409)
    event.version = version + 1
    return JsonResponse({"event": event.as_dict()})


@api
@require_http_methods(["POST"])
@transaction.atomic
def import_events(request):
    from datetime import datetime, timezone as datetime_timezone
    import math

    payload = body(request)
    records = payload.get("events")
    if set(payload) != {"events"} or not isinstance(records, list) or len(records) > 1000:
        raise ApiError("予定の配列を指定してください。1回に取り込めるのは1000件までです。")
    imported = skipped = 0
    for record in records:
        if not isinstance(record, dict) or set(record) - {
            "id", "title", "memo", "status", "date", "time", "duration", "createdAt", "remindedOn"
        }:
            raise ApiError("予定ファイルの形式が正しくありません。")
        legacy_id = record.get("id")
        if not isinstance(legacy_id, str) or not 1 <= len(legacy_id) <= 100:
            raise ApiError("各予定には元のIDが必要です。")
        if Event.objects.filter(user=request.user, legacy_id=legacy_id).exists():
            skipped += 1
            continue
        event = Event(user=request.user, legacy_id=legacy_id)
        timestamp = record.get("createdAt")
        if timestamp is not None:
            if type(timestamp) not in (int, float) or not math.isfinite(timestamp) or not 0 <= timestamp < 253402300799000:
                raise ApiError("予定の作成日時が正しくありません。")
            event.created_at = datetime.fromtimestamp(timestamp / 1000, tz=datetime_timezone.utc)
        apply_fields(event, {key: value for key, value in record.items() if key not in {"id", "createdAt"}})
        event.save()
        imported += 1
    return JsonResponse({"imported": imported, "skipped": skipped})
