#!/usr/bin/env python3
"""
Минимальный телеграм-бот VOLUME.

Что умеет:
  /start — отвечает, что бот на связи (обязательный шаг: без этого
           Telegram не разрешает боту писать вам первым)
  /id    — показывает chat_id текущего чата. Именно его нужно
           прописать в /etc/volume/bot.env как CHAT_ID.

Зависимостей нет — только стандартная библиотека Python 3.
Токен читается из /etc/volume/bot.env, в коде его нет.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ENV_PATH = os.environ.get("VOLUME_ENV_FILE", "/etc/volume/bot.env")


def load_env(path):
    """Читает файл вида КЛЮЧ=значение и возвращает словарь."""
    values = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


try:
    CONFIG = load_env(ENV_PATH)
    TOKEN = CONFIG["BOT_TOKEN"]
except (OSError, KeyError) as error:
    print(f"Не могу прочитать BOT_TOKEN из {ENV_PATH}: {error}", file=sys.stderr)
    sys.exit(1)

API = f"https://api.telegram.org/bot{TOKEN}/"


def call(method, **params):
    """Вызов метода Telegram API."""
    request = urllib.request.Request(
        API + method,
        data=urllib.parse.urlencode(params).encode("utf-8"),
    )
    with urllib.request.urlopen(request, timeout=65) as response:
        return json.load(response)


def main():
    offset = 0
    print("Бот запущен, жду сообщения…", flush=True)

    while True:
        try:
            # long polling: висим до 50 секунд в ожидании нового сообщения
            result = call("getUpdates", offset=offset, timeout=50)

            for update in result.get("result", []):
                offset = update["update_id"] + 1
                message = update.get("message") or {}
                chat_id = (message.get("chat") or {}).get("id")
                text = (message.get("text") or "").strip()

                if not chat_id:
                    continue

                if text.startswith("/start"):
                    call("sendMessage", chat_id=chat_id,
                         text="Бот VOLUME на связи. Сюда будут приходить заявки с сайта.")
                elif text.startswith("/id"):
                    call("sendMessage", chat_id=chat_id,
                         text=f"chat_id этого чата: {chat_id}")

        except KeyboardInterrupt:
            print("Остановлен вручную", flush=True)
            return
        except Exception as error:  # сеть моргнула, Telegram недоступен и т.п.
            print(f"Ошибка: {error}", file=sys.stderr, flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
