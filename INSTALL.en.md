# Time Tracker Setup Guide (Step-by-Step)

> Follow along — 5 minutes from start to finish.

---

## Step 1: Open Terminal

Press `Command + Space`, type **Terminal**, hit Enter.

A white window with black text will pop up. This is where you'll run commands.

---

## Step 2: Check Node.js

Copy the line below, paste into Terminal, hit Enter:

```
node -v
```

- If you see a version number like `v22.x.x` → ✅ Good, skip to Step 3.
- If you see `command not found` → Open https://nodejs.org, click the green button on the left to download, double-click the installer, keep clicking "Continue". Once done, go back to Terminal and run `node -v` again to confirm.

---

## Step 3: Generate a Gmail App Password

> ⚠️ Do NOT use your regular Gmail login password. You need a separate app password.

1. Open https://myaccount.google.com/apppasswords (log in with your Gmail)
2. Under "Select the app" → choose **Mail**
3. Under "Select the device" → choose **Mac**
4. Click **Generate**
5. A yellow box with 16 characters will appear (e.g. `xxxx xxxx xxxx xxxx`) → **Copy it, keep the page open**

---

## Step 4: Install Time Tracker

Copy this **entire line**, paste into Terminal, hit Enter:

```
git clone https://github.com/isalong66/Time-tracker.git ~/time-tracker && bash ~/time-tracker/setup.sh
```

Terminal will start running, then ask you three questions one by one:

| Prompt | What to type |
|--------|-------------|
| `Gmail 地址:` | Your Gmail address |
| `Gmail 应用密码:` | The 16-char password from Step 3, **no spaces** |
| `报告发送到:` | Email address to receive daily reports |

After filling these in, Terminal will continue automatically until you see **✅ 安装完成！**.

---

## Step 5: Customize Categories

The tracker is already running. But you need to set up your own work categories:

1. In Terminal run: `open ~/time-tracker/config.json`
2. A text editor window will open
3. Replace the app names and URLs with the ones you use
4. Save and close

---

## Step 6: Restart the Tracker

Run this in Terminal to apply the new categories:

```
node ~/time-tracker/tracker.js --stop && node ~/time-tracker/tracker.js --daemon
```

---

## Done! 🎉

You'll receive a daily time report at 7:30 AM every morning. If you ever want to send one manually:

```
node ~/time-tracker/send-report.js daily
```

---

## Common Commands

| What | Command |
|------|---------|
| View today's log | `node ~/time-tracker/tracker.js --report` |
| Send daily report manually | `node ~/time-tracker/send-report.js daily` |
| Stop tracker | `node ~/time-tracker/tracker.js --stop` |
| Restart tracker | `node ~/time-tracker/tracker.js --daemon` |

> If anything goes wrong, screenshot the error and send it over.
