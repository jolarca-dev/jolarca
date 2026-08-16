#!/usr/bin/env python
"""Django management entry point.

Default settings module is DEV. Production and CI must set
DJANGO_SETTINGS_MODULE explicitly (see docker-compose files and workflows).
"""

import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Activate the project venv (make bootstrap)."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
