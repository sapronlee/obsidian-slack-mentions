# Slack Mentions

Mention your Slack teammates in Obsidian notes, the way you would in Slack.

Type `@`, pick a person, and the mention renders as an avatar chip. Click it to open that person in Slack; hover it to see their profile card: title, email, local time, Slack status, and the other notes that mention them.

[简体中文说明](README.zh-CN.md)

## Features

- **@ suggestions** while typing. Search by name, username, email or your own aliases (nicknames, romanized names…).
- **Avatar chips** in both Reading view and Live Preview. Put the cursor inside a chip to edit the underlying link.
- **Profile card** on hover: title, email, local time, Slack status, a “Message in Slack” button, and the notes that mention this person.
- **Directory sync** from your Slack workspace: daily automatic sync or on demand. Bots are skipped; deactivated people are kept so old mentions still show their names. On Enterprise Grid, where the member list only covers the token's workspace, people mentioned in your notes or added by email are looked up individually across the organization.
- **Add by email** for people outside the synced directory.
- **Maintenance check** that lists mentions of deactivated people or people missing from the directory.
- English and Simplified Chinese UI, following Obsidian's language setting.

## How mentions are stored

A mention is a plain Markdown link:

```markdown
[@Jane Doe](slack://user?team=T0123ABCD&id=U0123ABCD)
```

Your notes stay portable: without the plugin it's still an ordinary link that opens Slack.

## Setup

### 1. Create a Slack token

The plugin needs a token with two **read-only** scopes: `users:read` and `users:read.email`. Create a dedicated token with only these two rather than reusing a token that can do more.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**, and pick your workspace.
2. Open **OAuth & Permissions**. Under **User Token Scopes**, add `users:read` and `users:read.email`.
3. Click **Install to Workspace** and approve. On Enterprise Grid, or if your workspace restricts apps, an admin may need to approve the app.
4. Copy the **User OAuth Token**, which starts with `xoxp-`.

A bot token (`xoxb-`) with the same two scopes also works.

### 2. Save it in Obsidian

Open **Settings → Slack Mentions**, paste the token into **Slack token** and click **Save**. Then click **Test connection**: it shows the workspace, the token type, and the scopes the token actually has, with a warning if anything is missing or broader than needed.

Finally click **Sync now**, or leave **Sync daily** on.

You can use the plugin without a token too. Mentions still render, and you can maintain the directory by hand, but sync, add-by-email and Slack status won't be available.

## Usage

- Type `@` in the editor, then a few letters, and pick a person. The command **Slack Mentions: Insert person** does the same.
- Click a chip to open Slack. You can switch the click action to “Show profile card” in settings.
- **Settings → Directory** lists everyone, with how many notes mention them. Add aliases there.

## Privacy and security

- **Network use.** The plugin talks only to the Slack Web API (`https://slack.com/api/`). It calls `auth.test`, `users.list`, `users.lookupByEmail` and `users.info`, all read-only. Nothing else is sent anywhere, and there is no telemetry.
- **Token.** Stored in Obsidian's keychain (Settings → Keychain) under the ID `slack-mentions`, encrypted by your operating system. It is never written to your vault or to `data.json`. If OS encryption is unavailable, the plugin refuses to store or use a token instead of falling back to plain text. To remove the token, delete `slack-mentions` in Settings → Keychain.
- **Directory.** The synced directory (names, emails, titles, time zones, avatar URLs) is cached in `.obsidian/plugins/slack-mentions/people.json` inside your vault. **If you sync or commit your `.obsidian` folder (Git, Obsidian Sync, cloud drives), this file goes with it.** Exclude it if your colleagues' details shouldn't leave your machine. For Git:

  ```gitignore
  .obsidian/plugins/slack-mentions/people.json
  ```

- **Avatars** are loaded from Slack's image CDN when shown.

## Requirements

- Obsidian 1.11.4 or later (for the keychain API). Desktop only, since opening Slack links uses the OS URL handler.
- A Slack account, and a token as described above for sync features.

## License

[MIT](LICENSE)
