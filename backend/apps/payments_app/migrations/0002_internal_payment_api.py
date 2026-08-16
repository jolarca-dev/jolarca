"""Internal payment API — Model A (ADR-0005, STEP 20).

Adds the cross-product intent/refund ledgers with revenue attribution
(product field) and retrofits PaymentRecord with the same attribution.
"""

import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("payments_app", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentrecord",
            name="product",
            field=models.CharField(default="marketplace", max_length=16, db_index=True),
        ),
        migrations.CreateModel(
            name="InternalPaymentIntent",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("modified_at", models.DateTimeField(auto_now=True)),
                ("caller", models.CharField(help_text="Authenticated service-account id", max_length=64)),
                (
                    "product",
                    models.CharField(
                        choices=[("hub", "hub"), ("marketplace", "marketplace")],
                        db_index=True,
                        max_length=16,
                    ),
                ),
                ("amount_cents", models.PositiveIntegerField()),
                ("currency", models.CharField(default="EUR", max_length=3)),
                (
                    "metadata",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="Sanctioned attribution keys only; PII-free",
                    ),
                ),
                (
                    "customer_ref",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Pseudonymized caller-side reference",
                        max_length=128,
                    ),
                ),
                ("status", models.CharField(db_index=True, default="requires_payment_method", max_length=32)),
                ("stripe_payment_intent_id", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                (
                    "client_secret",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Never serialized after create",
                        max_length=255,
                    ),
                ),
                ("refunded_cents", models.PositiveIntegerField(default=0)),
                ("finalized_at", models.DateTimeField(blank=True, null=True)),
            ],
        ),
        migrations.AddIndex(
            model_name="internalpaymentintent",
            index=models.Index(fields=["product", "status"], name="payments_pr_product_idx"),
        ),
        migrations.CreateModel(
            name="InternalRefund",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("modified_at", models.DateTimeField(auto_now=True)),
                ("amount_cents", models.PositiveIntegerField()),
                ("reason", models.CharField(max_length=64)),
                ("reason_detail", models.CharField(blank=True, default="", max_length=255)),
                ("status", models.CharField(default="succeeded", max_length=16)),
                (
                    "intent",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="refunds",
                        to="payments_app.internalpaymentintent",
                    ),
                ),
            ],
        ),
    ]
