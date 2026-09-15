import uuid
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone


class Event(models.Model):
    class Status(models.TextChoices):
        TENTATIVE = "TENTATIVE", "未確定"
        CONFIRMED = "CONFIRMED", "確定"
        COMPLETED = "COMPLETED", "完了"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=200)
    memo = models.TextField(blank=True, max_length=10000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.TENTATIVE)
    date = models.DateField(null=True, blank=True)
    time = models.TimeField(null=True, blank=True)
    duration = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(24)])
    created_at = models.DateTimeField(default=timezone.now)
    reminded_on = models.DateField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    legacy_id = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["user", "date"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(duration__gte=1, duration__lte=24), name="valid_duration"),
            models.CheckConstraint(condition=models.Q(status__in=["TENTATIVE", "CONFIRMED", "COMPLETED"]), name="valid_status"),
            models.CheckConstraint(condition=models.Q(time__isnull=True) | models.Q(date__isnull=False), name="time_requires_date"),
            models.UniqueConstraint(fields=["user", "legacy_id"], name="unique_user_legacy_event"),
        ]

    def as_dict(self):
        return {
            "id": str(self.id), "title": self.title, "memo": self.memo, "status": self.status,
            "date": self.date.isoformat() if self.date else None,
            "time": self.time.strftime("%H:%M") if self.time else None,
            "duration": self.duration, "createdAt": int(self.created_at.timestamp() * 1000),
            "remindedOn": self.reminded_on.isoformat() if self.reminded_on else None,
            "version": self.version,
        }
