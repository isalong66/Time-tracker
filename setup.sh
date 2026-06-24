#!/bin/bash
# ============================================================
#  Time Tracker — 一键安装脚本（macOS）
#  用法: bash setup.sh
# ============================================================
set -e

echo "🚀 Time Tracker 安装向导"
echo "========================="
echo ""

# 1. 检查 Node.js
check_node() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node -v)
    echo "✅ Node.js 已安装: $NODE_VER"
    return 0
  fi

  # Try nvm
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    if command -v node &>/dev/null; then
      echo "✅ Node.js 已安装 (via nvm): $(node -v)"
      return 0
    fi
  fi

  # Try homebrew
  if [ -x "/opt/homebrew/bin/node" ]; then
    export PATH="/opt/homebrew/bin:$PATH"
    echo "✅ Node.js 已安装 (via homebrew): $(node -v)"
    return 0
  fi

  echo "❌ 未找到 Node.js，请先安装："
  echo "   方式1: brew install node"
  echo "   方式2: 从 https://nodejs.org 下载安装包"
  exit 1
}
check_node

# 2. 确定安装目录
INSTALL_DIR="$HOME/time-tracker"
if [ -d "$INSTALL_DIR" ]; then
  echo "⚠️  $INSTALL_DIR 已存在，将覆盖安装"
  read -p "   继续? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
  fi
fi

# 3. 复制文件到 ~/time-tracker
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  echo "📂 复制文件到 $INSTALL_DIR ..."
  mkdir -p "$INSTALL_DIR"
  # 复制核心文件（排除 data/ node_modules/ .git/ 敏感文件）
  rsync -av --exclude='node_modules' --exclude='data' --exclude='.git' \
    --exclude='email-config.json' --exclude='.tracker.pid' \
    --exclude='launchd*.log' --exclude='schedule.log' \
    "$SCRIPT_DIR/" "$INSTALL_DIR/"
fi

cd "$INSTALL_DIR"

# 4. 安装依赖
echo "📦 安装 npm 依赖..."
npm install

# 5. 配置邮箱
if [ ! -f email-config.json ]; then
  echo ""
  echo "📧 配置 Gmail 邮件发送"
  echo "─────────────────────────────"
  echo "  需要 Gmail 应用专用密码（不是登录密码）："
  echo "  1. 打开 https://myaccount.google.com/apppasswords"
  echo "  2. 选择「邮件」+「Mac」，生成 16 位密码"
  echo ""
  read -p "  Gmail 地址 (例: xxx@gmail.com): " GMAIL_USER
  read -p "  Gmail 应用密码 (16位，不加空格): " GMAIL_PASS
  read -p "  报告发送到 (例: boss@company.com): " REPORT_TO

  cat > email-config.json <<EOF
{
  "user": "$GMAIL_USER",
  "pass": "$GMAIL_PASS",
  "to": "$REPORT_TO"
}
EOF
  chmod 600 email-config.json
  echo "✅ 邮箱配置已保存 (email-config.json)"
else
  echo "✅ email-config.json 已存在，跳过"
fi

# 6. 安装 launchd 定时任务
echo ""
echo "⏰ 安装定时任务..."
USERNAME=$(whoami)

# Daily report — 7:30 / 8:30 / 9:30 + RunAtLoad
cat > "$HOME/Library/LaunchAgents/com.time-tracker.daily.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.time-tracker.daily</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$INSTALL_DIR/schedule.sh</string>
        <string>daily</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key><integer>7</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
        <dict>
            <key>Hour</key><integer>8</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
        <dict>
            <key>Hour</key><integer>9</integer>
            <key>Minute</key><integer>30</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/launchd-daily.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/launchd-daily.log</string>
</dict>
</plist>
PLIST

# Weekly report — Monday 7:00
cat > "$HOME/Library/LaunchAgents/com.time-tracker.weekly.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.time-tracker.weekly</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$INSTALL_DIR/schedule.sh</string>
        <string>weekly</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key><integer>2</integer>
        <key>Hour</key><integer>7</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/launchd-weekly.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/launchd-weekly.log</string>
</dict>
</plist>
PLIST

# Monthly report — 1st at 8:00
cat > "$HOME/Library/LaunchAgents/com.time-tracker.monthly.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.time-tracker.monthly</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$INSTALL_DIR/schedule.sh</string>
        <string>monthly</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Day</key><integer>1</integer>
        <key>Hour</key><integer>8</integer>
        <key>Minute</key><integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$INSTALL_DIR/launchd-monthly.log</string>
    <key>StandardErrorPath</key>
    <string>$INSTALL_DIR/launchd-monthly.log</string>
</dict>
</plist>
PLIST

echo "✅ launchd 定时任务已创建"

# 7. 启动追踪器
echo ""
echo "🔌 启动时间追踪器..."
node tracker.js --daemon

# 8. 加载 launchd 任务
launchctl unload "$HOME/Library/LaunchAgents/com.time-tracker.daily.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/com.time-tracker.daily.plist"

launchctl unload "$HOME/Library/LaunchAgents/com.time-tracker.weekly.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/com.time-tracker.weekly.plist"

launchctl unload "$HOME/Library/LaunchAgents/com.time-tracker.monthly.plist" 2>/dev/null || true
launchctl load "$HOME/Library/LaunchAgents/com.time-tracker.monthly.plist"

# 9. 完成
echo ""
echo "========================="
echo "✅ 安装完成！"
echo ""
echo "📊 查看今天报告:   node $INSTALL_DIR/tracker.js --report"
echo "📧 手动发日报:     node $INSTALL_DIR/send-report.js daily"
echo "🛑 停止追踪:       node $INSTALL_DIR/tracker.js --stop"
echo "🔄 重启追踪:       node $INSTALL_DIR/tracker.js --daemon"
echo ""
echo "⚠️  下一步：编辑 $INSTALL_DIR/config.json 来自定义你的工作类目"
echo "   然后重启追踪器使配置生效"
echo ""
