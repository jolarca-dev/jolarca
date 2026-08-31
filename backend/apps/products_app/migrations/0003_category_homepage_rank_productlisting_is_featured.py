from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("products_app", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="category",
            name="homepage_rank",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="productlisting",
            name="is_featured",
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
