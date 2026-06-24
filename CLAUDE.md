# Time Tracker — 时间追踪器

## 项目位置
~/time-tracker/

## 功能
- 每 5 秒检测当前 App + 窗口标题 + Chrome URL
- 自动归类（Bridge Marketing / 滇南米线 / AI学习 / 内容创作 / 邮件沟通 / 其他）
- 每天早上 7:30 发日报邮件
- 每周一发周报邮件
- 每月 1 号发月报邮件
- 报告包含 Google Ads 账号操作明细

## 核心文件
| 文件 | 作用 |
|------|------|
| tracker.js | 后台追踪进程 |
| report-generator.js | 生成日报/周报/月报 |
| send-report.js | 邮件发送 |
| config.json | 类目规则 |
| email-config.json | 邮箱配置（含 Gmail 密码） |
| data/ | 原始追踪数据（JSON） |
| reports/ | 生成的报告（Markdown） |

## 常用命令
```
# 看今天的报告
node ~/time-tracker/tracker.js --report

# 手动发日报
node ~/time-tracker/send-report.js daily

# 手动发周报
node ~/time-tracker/send-report.js weekly 2026-06-23

# 手动发月报
node ~/time-tracker/send-report.js monthly 2026-06

# 停止/启动追踪器
node ~/time-tracker/tracker.js --stop
node ~/time-tracker/tracker.js --daemon

# 定时任务注册
launchctl load ~/Library/LaunchAgents/com.isama.time-tracker-report.plist
launchctl load ~/Library/LaunchAgents/com.isama.time-tracker-weekly.plist
launchctl load ~/Library/LaunchAgents/com.isama.time-tracker-monthly.plist
```

## 修改入口
- 改邮箱/收件人 → email-config.json
- 改类目 → config.json
- 改发送时间 → ~/Library/LaunchAgents/ 下对应 .plist
- 改功能 → 告诉 Claude 要改什么
