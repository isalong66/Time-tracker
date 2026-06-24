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
