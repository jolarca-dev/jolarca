"""Public storefront fields for the seller profile (GAP-V05)."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("sellers_app", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="sellerprofile",
            name="public_description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="sellerprofile",
            name="city",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
    ]
