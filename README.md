# WoeBot

WoeBot is a Discord bot for exploring Woehammer's competitive Age of Sigmar data in real time. It prioritises transparency, context, and data literacy over tier lists or meta verdicts.

## Data source

WoeBot now uses the same current-battlescroll dataset as the Woehammer Stats website:

- match data: `/aos/games.json` and its chunk files
- army lists: `/aos/lists/july-2026.json`
- default website: `https://woehammer-stats.pages.dev`

The adapter groups the website's match rows into tournament runs so the existing faction, player, event, battleplan and warscroll commands continue to use one canonical dataset.

### Required environment

```env
DISCORD_TOKEN=...
```

### Optional environment

```env
AOS_DATA_SOURCE=website
AOS_STATS_BASE_URL=https://woehammer-stats.pages.dev
AOS_CURRENT_GAMES_PATH=/aos/games.json
AOS_CURRENT_LISTS_PATH=/aos/lists/july-2026.json
AOS_BATTLESCROLL_LABEL=July 2026 Battlescroll
CACHE_TTL_SECONDS=900
```

The former Google Sheet CSV can remain configured temporarily as an automatic fallback:

```env
AOS_BATTLESCROLL_ID=JULY_2026
AOS_DB_SHEET_JULY_2026_CSV_URL=https://...
```

Set `AOS_DATA_SOURCE=csv` only if an explicit rollback is needed.
