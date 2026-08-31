"""Backfill the default-language (en) translation columns.

0004 added the *_en/*_lt/*_lv/*_et columns empty; existing rows carry
their content in the legacy base columns. modeltranslation resolves the
active language's column directly, so without this backfill every
pre-existing category/listing would render blank titles under 'en'.
"""

from django.db import migrations

BACKFILL_SQL = """
UPDATE products_app_category
SET name_en = name
WHERE name_en IS NULL;

UPDATE products_app_productlisting
SET title_en = title
WHERE title_en IS NULL;

UPDATE products_app_productlisting
SET description_en = description
WHERE description_en IS NULL AND description <> '';
"""


class Migration(migrations.Migration):

    dependencies = [
        ("products_app", "0004_translation_columns"),
    ]

    operations = [
        migrations.RunSQL(BACKFILL_SQL, reverse_sql=migrations.RunSQL.noop),
    ]
