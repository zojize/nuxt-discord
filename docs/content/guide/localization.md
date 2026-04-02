---
title: Localization
---

# Localization

Discord supports localized command names and descriptions. Nuxt Discord loads translations from JSON files in the `discord/locales/` directory.

## Locale Files

Create JSON files named after Discord's locale codes:

```json
// discord/locales/ja.json
{
  "ping": {
    "name": "ピング",
    "description": "ポンと返すコマンド"
  },
  "add": {
    "description": "2つの数を足す",
    "options": {
      "a": { "description": "最初の数" },
      "b": { "description": "2番目の数" }
    }
  }
}
```

## Structure

Each locale file is a flat map of command names to their translations:

```json
{
  "command-name": {
    "name": "localized name (optional)",
    "description": "localized description (optional)",
    "options": {
      "option-name": {
        "name": "localized option name (optional)",
        "description": "localized option description (optional)"
      }
    }
  }
}
```

All fields are optional — only provide what you want to translate.

## Supported Locales

File names must match Discord's locale codes exactly:

| Code | Language |
| --- | --- |
| `en-US` | English (US) |
| `en-GB` | English (UK) |
| `ja` | Japanese |
| `ko` | Korean |
| `zh-CN` | Chinese (Simplified) |
| `zh-TW` | Chinese (Traditional) |
| `fr` | French |
| `de` | German |
| `es-ES` | Spanish |
| `pt-BR` | Portuguese (Brazil) |
| `ru` | Russian |
| `uk` | Ukrainian |
| `pl` | Polish |
| `nl` | Dutch |
| `it` | Italian |
| `sv-SE` | Swedish |
| `no` | Norwegian |
| `da` | Danish |
| `fi` | Finnish |
| `hu` | Hungarian |
| `cs` | Czech |
| `ro` | Romanian |
| `el` | Greek |
| `bg` | Bulgarian |
| `th` | Thai |
| `vi` | Vietnamese |
| `hi` | Hindi |
| `tr` | Turkish |
| `id` | Indonesian |
| `hr` | Croatian |
| `lt` | Lithuanian |

Invalid locale file names are skipped with a warning.

## How It Works

During command collection, locale files are loaded and merged into the command metadata as `nameLocalizations` and `descriptionLocalizations`. These are passed directly to Discord's `setNameLocalizations()` and `setDescriptionLocalizations()` builder methods.
