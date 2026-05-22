# Skills Directory

This folder contains the custom integration modules ("skills") used by the MVP application:

- **searchEngine.ts** – Wrapper functions for PubMed, arXiv, and Europe PMC search APIs.
- **telegramBot.ts** – Helper to send messages via a Telegram bot (requires `TELEGRAM_BOT_TOKEN`).
- **downloadManager.ts** – Handles PDF download links and proxying through Vercel serverless functions.
- **envConfig.ts** – Loads environment variables (`ELSEVIER_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`).

These modules are written in TypeScript and are imported by `src/app.ts` / `src/main.ts`.

> **Note:** The actual implementation files will be added later as we flesh out the MVP.
