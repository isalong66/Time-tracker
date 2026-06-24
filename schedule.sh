#!/bin/bash
export PATH="/Users/isama/.nvm/versions/node/v24.13.0/bin:$PATH"
cd /Users/isama/time-tracker

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
