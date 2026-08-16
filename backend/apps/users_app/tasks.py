"""users_app async work — routed to the `email` queue (settings)."""

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail


@shared_task(queue="email", max_retries=5, default_retry_delay=60)
def send_welcome_email(user_id: str) -> None:
    from .models import User

    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return  # erasure may have raced the task — silently skip
    send_mail(
        subject="Welcome to JOL Marketplace",
        message="Your account has been created.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
