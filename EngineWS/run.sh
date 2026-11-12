#!/usr/bin/env bash
cd -- "$(dirname -- "$0")" || exit 1
exec uvicorn main:app --host 127.0.0.1 --port 8000
