#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createTransport } from 'nodemailer';

const DIR = join(homedir(), 'time-tracker');
const DATA_DIR = join(DIR, 'data');
const CONFIG_PATH = join(DIR, 'email-config.json');

const CSS = `
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;max-width:620px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:16px;color:#333;margin:28px 0 10px;border-bottom:2px solid #1a1a1a;padding-bottom:4px}
h3{font-size:14px;margin:20px 0 6px;padding:6px 10px;background:#f8f8f8;border-radius:6px}
table{width:100%;border-collapse:collapse;margin:6px 0 14px;font-size:12px}
th{text-align:left;padding:5px 8px;border-bottom:2px solid #ddd;font-size:11px;color:#888;text-transform:uppercase}
td{text-align:left;padding:4px 8px;border-bottom:1px solid #eee}
tr td:last-child{font-family:monospace;font-size:11px;color:#666}
.sub{color:#888;font-size:12px;margin:0 0 20px}
.footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;color:#aaa;font-size:11px}
`;

function ymd(d) { return (d||new Date()).toISOString().slice(0,10); }

function buildHtml(reportText, subject) {
  const lines = reportText.split('\n');
  let html = '', inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^---/.test(line)) { html += '<hr style="border:0;border-top:1px solid #eee;margin:16px 0">'; continue; }

    if (line.startsWith('# ')) { if(inTable){html+='</table>';inTable=false;} html += `<h1>${esc(line.slice(2))}</h1>`; continue; }
    if (line.startsWith('## ')) { if(inTable){html+='</table>';inTable=false;} html += `<h2>${esc(line.slice(3))}</h2>`; continue; }
    if (line.startsWith('### ')) { if(inTable){html+='</table>';inTable=false;} html += `<h3>${esc(line.slice(4))}</h3>`; continue; }

    if (line.startsWith('|')) {
      if (!inTable) { html += '<table>'; inTable = true; }
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      const isHeader = lines[i+1] && lines[i+1].includes('---');
      if (isHeader) {
        html += '<tr>'+cells.map(c=>`<th>${esc(c)}</th>`).join('')+'</tr>';
        i++;
      } else {
        html += '<tr>'+cells.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>';
      }
      continue;
    }

    if (inTable) { html += '</table>'; inTable = false; }
    if (line.trim().startsWith('- ')) {
      const isBold = line.includes('**');
      html += `<li style="margin-left:16px;font-size:13px;${isBold?'font-weight:600;list-style:none;margin-top:8px':''}">${esc(line.slice(2).replace(/\*\*/g,''))}</li>`;
      continue;
    }
    if (line.trim()) html += `<p style="font-size:13px">${esc(line)}</p>`;
  }
  if (inTable) html += '</table>';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<h1>${subject}</h1>
${html}
<div class="footer">Time Tracker 自动生成</div></body></html>`;
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (!existsSync(CONFIG_PATH)) {
    console.log('❌ 未配置 email-config.json');
    return;
  }
  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  if (!cfg.user || !cfg.pass || !cfg.to) { console.log('❌ 配置不完整'); return; }

  const { generateDailyReport, generateWeeklyReport, generateMonthlyReport } = await import('./report-generator.js');

  const mode = args[0] || 'daily'; // daily | weekly | monthly
  // 日报默认用昨天（已完整的一天），周报/月报默认用今天
  let defaultDate = (mode === 'daily' && !args[1])
    ? ymd(new Date(Date.now() - 86400000))
    : ymd();
  let dateStr = args[1] || defaultDate;

  let report, subject;

  if (mode === 'weekly') {
    report = generateWeeklyReport(dateStr);
    subject = `⏱️ 时间周报 — ${dateStr}`;
  } else if (mode === 'monthly') {
    const d = new Date(dateStr);
    report = generateMonthlyReport(d.getFullYear(), d.getMonth()+1);
    subject = `⏱️ 时间月报 — ${dateStr}`;
  } else {
    report = generateDailyReport(dateStr);
    subject = `⏱️ 时间日报 — ${dateStr}`;
  }

  if (!report) { console.log(`❌ ${dateStr} 无数据`); return; }

  const transporter = createTransport({
    host:'smtp.gmail.com', port:587, secure:false,
    auth:{ user:cfg.user, pass:cfg.pass },
  });

  try {
    const html = buildHtml(report, subject);
    const info = await transporter.sendMail({
      from:`"Time Tracker" <${cfg.user}>`,
      to:cfg.to,
      subject,
      text: report.replace(/#+ /g,'').replace(/\*/g,''),
      html,
    });
    console.log(`✅ 已发送: ${subject}`);
  } catch(e) {
    console.error(`❌ ${e.message}`);
  }
}

main();
