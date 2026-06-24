#!/bin/bash
# Time Tracker — launchd 调度入口
# 自动适配：无需修改即可在任何 Mac 上运行

# 自动探测 node 路径（支持 nvm / homebrew / 系统自带）
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
elif [ -x "/opt/homebrew/bin/node" ]; then
  export PATH="/opt/homebrew/bin:$PATH"
elif [ -x "/usr/local/bin/node" ]; then
  export PATH="/usr/local/bin:$PATH"
fi

DIR="$HOME/time-tracker"
cd "$DIR" || exit 1

SENTINEL_DIR="data/sent"
mkdir -p "$SENTINEL_DIR"

case "$1" in
  daily)
    TODAY=$(date +%Y-%m-%d)
    SENTINEL="$SENTINEL_DIR/daily-$TODAY"
    if [ -f "$SENTINEL" ]; then
      echo "[$(date)] 日报今日已发送，跳过" >> schedule.log 2>&1
      exit 0
    fi
    node send-report.js daily >> schedule.log 2>&1
    if [ $? -eq 0 ]; then
      touch "$SENTINEL"
    fi
    ;;
  weekly)
    node send-report.js weekly >> schedule.log 2>&1
    ;;
  monthly)
    node send-report.js monthly >> schedule.log 2>&1
    ;;
  *)
    echo "Usage: $0 {daily|weekly|monthly}" ;;
esac
