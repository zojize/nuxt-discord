---
title: Localization
---

# Localization

Discord supports localized command names and descriptions. Nuxt Discord provides two ways to add translations: inline JSDoc tags and JSON locale files.

## Inline JSDoc Tags

The simplest approach — add translations directly in the command file:

```ts
/**
 * A simple ping command
 * @name.ja ピング
 * @description.ja ポンと返すコマンド
 * @description.fr Renvoie pong
 * @description.zh-CN 简单的ping命令
 */
export default () => 'pong!'
```

The format is `@name.<locale>` or `@description.<locale>` followed by the translated text.

## JSON Locale Files

For larger projects, create JSON files in `discord/locales/` named after Discord's locale codes:

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

### JSON Structure

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

## Priority

Inline JSDoc tags take precedence over JSON locale files. Both can coexist — use inline for a few key translations and JSON files for comprehensive coverage.

## Supported Locales

Locale codes must match Discord's locale identifiers exactly:

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

Invalid locale codes are skipped with a warning.
