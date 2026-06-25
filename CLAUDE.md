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
| fetch-reports.js | 从 Gmail 拉取历史日报，生成趋势总结 |
| setup.sh | 一键安装脚本（macOS） |
| config.json | 类目规则 |
| email-config.json | 邮箱配置（含 Gmail 密码） |
| data/ | 原始追踪数据（JSON）+ 邮件缓存 + 趋势报告 |
| reports/ | 生成的报告（Markdown） |

## 常用命令
```
# 看今天的报告
node ~/time-tracker/tracker.js --report

# 手动发日报
node ~/time-tracker/send-report.js daily

# 手动发日报（指定日期）
node ~/time-tracker/send-report.js daily 2026-06-25

# 手动发周报
node ~/time-tracker/send-report.js weekly 2026-06-23

# 手动发月报
node ~/time-tracker/send-report.js monthly 2026-06

# 从 Gmail 拉取历史日报，生成趋势总结
node ~/time-tracker/fetch-reports.js        # 最近 7 天
node ~/time-tracker/fetch-reports.js 30     # 最近 30 天

# Google Ads API 授权（一次性）
node ~/time-tracker/google-ads/setup-auth.js

# Google Ads 数据拉取
node ~/time-tracker/google-ads/diagnose.js vida-ai      # 拉 7 天数据
node ~/time-tracker/google-ads/diagnose.js vida-ai --days 30

# AI 客户诊断
node ~/time-tracker/scripts/analyze-client.js vida-ai            # API 拉数据→生成 prompt
node ~/time-tracker/scripts/analyze-client.js vida-ai --local    # 用本地缓存

# 客户管理
node ~/time-tracker/scripts/onboard-client.js     # 录入新客户
node ~/time-tracker/scripts/dashboard.js          # 客户一览表

# 时间效率交叉分析
node ~/time-tracker/scripts/correlate.js --client vida-ai --days 7

# 停止/启动追踪器
node ~/time-tracker/tracker.js --stop
node ~/time-tracker/tracker.js --daemon

# 定时任务注册
launchctl load ~/Library/LaunchAgents/com.isama.time-tracker-report.plist
launchctl load ~/Library/LaunchAgents/com.isama.time-tracker-weekly.plist
launchctl load ~/Library/LaunchAgents/com.isama.time-tracker-monthly.plist
```

## Google Ads AI Agent

目录结构：
| 目录 | 作用 |
|------|------|
| `google-ads/` | API 凭证管理 + 数据拉取 |
| `ai/` | AI 分析 prompt 模板 + 分析编排 |
| `profiles/` | 每客户一个档案文件夹（snapshots/analyses/actions） |
| `dash/` | 时间-vs-效果交叉分析 |
| `scripts/` | CLI 入口（analyze-client, onboard-client, dashboard, correlate） |
| `lib/` | 共用工具（GA 账号名解析） |

工作流：
```
新客户 → onboard-client.js → 创建档案
            ↓
拉数据 → diagnose.js → data/ads-data/{client}/
            ↓
诊断   → analyze-client.js → data/analysis-prompts/
            ↓
Claude 读取 prompt → 输出建议
            ↓
效率   → correlate.js → 时间-vs-效果分析
```

## 修改入口
- 改邮箱/收件人 → email-config.json
- 改类目 → config.json
- 改发送时间 → ~/Library/LaunchAgents/ 下对应 .plist
- 改趋势报告范围 → fetch-reports.js 的天数参数
- 改功能 → 告诉 Claude 要改什么

## fetch-reports.js 趋势报告

从 Gmail 自动拉取 Time Tracker 日报邮件，解析后生成趋势总结：

- 支持日期范围（默认 7 天，可传 30 等）
- 同日多封自动去重，保留数据最完整的一封
- 输出内容：每日时间对比、类目汇总、最常用 App、Google Ads 账号排行
- 结构化数据保存在 `data/report-summary.json`，趋势 Markdown 在 `data/trend-report.md`
- 邮件原文缓存于 `data/email-cache/`
- 依赖：imapflow, mailparser — `setup.sh` 或 `npm install` 自动安装

## 分享给同事

同事也是 Mac 的话，三步搞定：

```
# 1. 把项目文件夹复制给她（或用 U 盘 / AirDrop）
# 2. 她在自己电脑上运行：
bash ~/time-tracker/setup.sh

# 3. 按提示输入她的 Gmail 和收件人邮箱，完成。
```

setup.sh 会自动：
- 检测 Node.js 环境（支持 nvm / homebrew / 系统安装）
- 安装 npm 依赖
- 引导配置邮箱
- 创建 launchd 定时任务（日报 7:30/8:30/9:30 + 周报 + 月报）
- 启动追踪器后台进程

### 同事安装后需要做的
1. 编辑 `config.json` 改成自己的工作类目
2. 重启追踪器：`node tracker.js --stop && node tracker.js --daemon`
3. Gmail 需要开启应用专用密码：https://myaccount.google.com/apppasswords

### 技术注意事项
- 所有路径使用 `$HOME/time-tracker`，不硬编码用户名
- schedule.sh 自动探测 node 路径（兼容 Intel M1/M2/M3 架构）
- 哨兵文件在 `data/sent/` 下，防止重复发送日报
