# Time Tracker 安装教程（超级详细版）

> 跟着做，一步步来，5 分钟搞定。

---

## 第一步：打开终端

在 Mac 上按 `Command + 空格键`，输入 **终端**（或 Terminal），回车。

会弹出一个白底黑字的窗口，这就是你要操作的地方。

---

## 第二步：检查 Node.js

把下面这行复制，贴到终端窗口里，回车：

```
node -v
```

- 如果出现 `v22.x.x` 这样的数字 → ✅ 跳过下面，直接去第三步。
- 如果出现 `command not found` → 打开 https://nodejs.org ，点左边那个绿色大按钮下载，下载完双击安装，一路点"继续"，装完回到终端重新跑 `node -v` 确认。

---

## 第三步：准备 Gmail 应用密码

> ⚠️ 不能用你的邮箱登录密码，要单独生成一个。

1. 打开 https://myaccount.google.com/apppasswords （用你的 Gmail 登录）
2. 你会看到 "Select the app" → 选 **Mail**
3. "Select the device" → 选 **Mac**
4. 点 **Generate**
5. 屏幕上会出现 16 个字母的黄色框（比如 `xxxx xxxx xxxx xxxx`）→ **复制下来，别关页面**

---

## 第四步：安装 Time Tracker

把下面这**一整行**复制，贴到终端，回车：

```
git clone https://github.com/isalong66/Time-tracker.git ~/time-tracker && bash ~/time-tracker/setup.sh
```

终端会开始跑，然后会依次问你三个问题：

| 屏幕提示 | 你输入 |
|----------|--------|
| `Gmail 地址:` | 你的 Gmail 邮箱 |
| `Gmail 应用密码:` | 第三步复制的 16 位密码，**不要加空格** |
| `报告发送到:` | 日报要发给谁的邮箱 |

填完终端会继续自动跑，直到出现 **✅ 安装完成！**。

---

## 第五步：改工作类目（重要）

安装完追踪器已经在后台运行了。但类目需要改成你自己的：

1. 终端里跑：`open ~/time-tracker/config.json`
2. 会自动打开一个文本编辑窗口
3. 把里面的 App 名和网址改成你常用的
4. 保存关掉

---

## 第六步：重启追踪器（让新类目生效）

终端里跑：

```
node ~/time-tracker/tracker.js --stop && node ~/time-tracker/tracker.js --daemon
```

---

## 完成！🎉

每天早上 7:30 会自动收到一封时间日报。没收到的话，可以手动试一下：

```
node ~/time-tracker/send-report.js daily
```

---

## 常用命令

| 做什么 | 终端里输入 |
|--------|-----------|
| 看今天的记录 | `node ~/time-tracker/tracker.js --report` |
| 手动发日报 | `node ~/time-tracker/send-report.js daily` |
| 停止追踪 | `node ~/time-tracker/tracker.js --stop` |
| 重启追踪 | `node ~/time-tracker/tracker.js --daemon` |

> 有任何问题截图发我。
