import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function generateDashboard(history, baseDir = __dirname) {
  if (!history || history.length === 0) {
    console.warn('没有历史数据，跳过看板生成');
    return;
  }

  const latest = history[history.length - 1];
  const prev   = history.length >= 2 ? history[history.length - 2] : null;
  const allTotals = history.map(h => h.total_min).filter(Boolean);
  const historyMin = Math.min(...allTotals);
  const diffFromPrev = prev ? latest.total_min - prev.total_min : null;
  const diffFromHistMin = latest.total_min - historyMin;

  // 近30条记录用于图表
  const chartData = history.slice(-30);

  const platformLabel = { jd: '京东', taobao: '淘宝天猫' };
  const platformColor = { jd: '#e74c3c', taobao: '#f39c12' };

  // ── 配件表格行 ──────────────────────────────────────────
  function renderItemRows(items) {
    return items.map(item => {
      const platforms = item.platforms ?? {};
      const jd      = platforms.jd;
      const taobao  = platforms.taobao;

      function cell(p, key) {
        if (!p) return '<td class="na">—</td>';
        const isMin = p.price === item.min_price;
        const cls = isMin ? 'price best' : 'price';
        const badge = isMin ? '<span class="badge">最低</span>' : '';
        return `<td class="${cls}">
          ${p.url ? `<a href="${escHtml(p.url)}" target="_blank">¥${p.price}</a>` : `¥${p.price}`}
          ${badge}
          <div class="shop">${escHtml(p.shop || '')}</div>
        </td>`;
      }

      const refDiff = item.min_price != null
        ? `<span class="diff ${item.min_price <= item.refPrice ? 'down' : 'up'}">
             ${item.min_price <= item.refPrice ? '▼' : '▲'}¥${Math.abs(item.min_price - item.refPrice)}
           </span>`
        : '';

      return `<tr>
        <td class="comp-name"><strong>${escHtml(item.name)}</strong><div class="keyword">${escHtml(item.keyword)}</div></td>
        ${cell(jd, 'jd')}
        ${cell(taobao, 'taobao')}
        <td class="ref">¥${item.refPrice} ${refDiff}</td>
      </tr>`;
    }).join('\n');
  }

  // ── 历史记录列表 ─────────────────────────────────────────
  function renderHistory() {
    if (history.length <= 1) return '<p class="no-history">还没有历史记录，查询第二次后这里会显示对比趋势。</p>';
    return history.slice().reverse().map((h, i) => {
      const prev2 = history[history.length - 2 - i];
      const diff = prev2 ? h.total_min - prev2.total_min : null;
      const diffHtml = diff != null
        ? `<span class="diff ${diff <= 0 ? 'down' : 'up'}">${diff <= 0 ? '▼' : '▲'}¥${Math.abs(diff)}</span>`
        : '';
      const isLatest = i === 0;
      return `<div class="hist-row ${isLatest ? 'latest' : ''}">
        <span class="hist-date">${h.date} ${h.time}</span>
        <span class="hist-price">¥${h.total_min.toFixed(0)} ${diffHtml}</span>
        ${isLatest ? '<span class="tag">最新</span>' : ''}
      </div>`;
    }).join('\n');
  }

  const diffHtml = diffFromPrev != null
    ? `<span class="diff ${diffFromPrev <= 0 ? 'down' : 'up'}">${diffFromPrev <= 0 ? '▼' : '▲'} ¥${Math.abs(diffFromPrev)} 较上次</span>`
    : '<span class="diff neutral">首次记录</span>';

  const distFromHistMin = diffFromHistMin > 0
    ? `<span class="dist-min">距历史最低还差 ¥${diffFromHistMin.toFixed(0)}</span>`
    : `<span class="dist-min green">已达历史最低！</span>`;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PC配件比价看板</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; background: #f4f6f9; color: #333; }
  a { color: #e74c3c; text-decoration: none; }
  a:hover { text-decoration: underline; }

  .header { background: linear-gradient(135deg, #c0392b, #e74c3c); color: #fff; padding: 24px 20px 20px; }
  .header h1 { font-size: 1.4rem; margin-bottom: 8px; }
  .header .updated { font-size: 0.8rem; opacity: .8; margin-bottom: 16px; }

  .kpi-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .kpi { background: rgba(255,255,255,.15); border-radius: 10px; padding: 12px 16px; flex: 1; min-width: 130px; }
  .kpi .label { font-size: 0.72rem; opacity: .85; margin-bottom: 4px; }
  .kpi .value { font-size: 1.5rem; font-weight: 700; }
  .kpi .sub   { font-size: 0.8rem; margin-top: 4px; }

  .diff { font-weight: 600; }
  .diff.down { color: #2ecc71; }
  .diff.up   { color: #ff6b6b; }
  .diff.neutral { color: rgba(255,255,255,.7); }
  .dist-min  { font-size: 0.8rem; color: rgba(255,255,255,.85); }
  .dist-min.green { color: #2ecc71; font-weight: 700; }

  .section { max-width: 900px; margin: 20px auto; padding: 0 12px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.07); overflow: hidden; margin-bottom: 20px; }
  .card-title { padding: 14px 16px 0; font-size: 1rem; font-weight: 700; color: #555; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px; margin-bottom: 0; }

  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th { background: #fafafa; padding: 10px 12px; text-align: left; font-weight: 600; color: #666; border-bottom: 2px solid #eee; }
  td { padding: 10px 12px; border-bottom: 1px solid #f2f2f2; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fef9f9; }

  td.comp-name { min-width: 90px; }
  .keyword { font-size: 0.72rem; color: #999; margin-top: 2px; }
  td.price { min-width: 110px; }
  td.price.best { background: #f0fff4; }
  td.na { color: #ccc; }
  .price a { font-weight: 700; font-size: 1rem; }
  .shop { font-size: 0.7rem; color: #999; margin-top: 3px; }
  .badge { display: inline-block; background: #2ecc71; color: #fff; font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; margin-left: 4px; vertical-align: middle; }
  td.ref { color: #888; font-size: 0.85rem; min-width: 100px; }

  .chart-wrap { padding: 16px; }
  canvas { max-height: 220px; }

  .hist-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid #f4f4f4; font-size: 0.87rem; }
  .hist-row:last-child { border-bottom: none; }
  .hist-row.latest { background: #fef9f9; }
  .hist-date { color: #888; flex: 1; }
  .hist-price { font-weight: 700; }
  .tag { background: #e74c3c; color: #fff; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px; }
  .no-history { padding: 20px; color: #aaa; text-align: center; font-size: 0.9rem; }

  .total-row td { font-weight: 700; background: #fff8f8; font-size: 0.95rem; }

  @media (max-width: 600px) {
    .kpi-row { gap: 8px; }
    .kpi { min-width: 120px; }
    table { font-size: 0.8rem; }
    th, td { padding: 8px; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>🖥️ PC配件比价看板</h1>
  <div class="updated">最后更新：${latest.date} ${latest.time}</div>
  <div class="kpi-row">
    <div class="kpi">
      <div class="label">今日最低总价</div>
      <div class="value">¥${latest.total_min.toFixed(0)}</div>
      <div class="sub">${diffHtml}</div>
    </div>
    <div class="kpi">
      <div class="label">参考总价</div>
      <div class="value">¥7429</div>
      <div class="sub">
        <span class="diff ${latest.total_min <= 7429 ? 'down' : 'up'}">
          ${latest.total_min <= 7429 ? '▼' : '▲'}¥${Math.abs(latest.total_min - 7429).toFixed(0)}
        </span>
      </div>
    </div>
    <div class="kpi">
      <div class="label">历史最低总价</div>
      <div class="value">¥${historyMin.toFixed(0)}</div>
      <div class="sub">${distFromHistMin}</div>
    </div>
    <div class="kpi">
      <div class="label">查询次数</div>
      <div class="value">${history.length}</div>
      <div class="sub">次</div>
    </div>
  </div>
</div>

<div class="section">

  <!-- 配件价格表 -->
  <div class="card">
    <div class="card-title">📦 各配件今日最低价</div>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>配件</th>
            <th>京东</th>
            <th>淘宝天猫</th>
            <th>参考价</th>
          </tr>
        </thead>
        <tbody>
          ${renderItemRows(latest.items)}
          <tr class="total-row">
            <td>合计</td>
            <td colspan="2">最低总价 ¥${latest.total_min.toFixed(0)}</td>
            <td>¥7429</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 历史趋势图 -->
  ${chartData.length >= 2 ? `
  <div class="card">
    <div class="card-title">📈 总价历史走势</div>
    <div class="chart-wrap">
      <canvas id="priceChart"></canvas>
    </div>
  </div>` : ''}

  <!-- 历史记录列表 -->
  <div class="card">
    <div class="card-title">🕐 查询历史</div>
    ${renderHistory()}
  </div>

</div>

<script>
${chartData.length >= 2 ? `
const labels = ${JSON.stringify(chartData.map(h => h.date + ' ' + h.time.slice(0,5)))};
const totals = ${JSON.stringify(chartData.map(h => h.total_min))};
const minVal = Math.min(...totals);
const minIdx = totals.indexOf(minVal);

new Chart(document.getElementById('priceChart'), {
  type: 'line',
  data: {
    labels,
    datasets: [{
      label: '最低总价 (¥)',
      data: totals,
      borderColor: '#e74c3c',
      backgroundColor: 'rgba(231,76,60,.08)',
      tension: 0.3,
      fill: true,
      pointRadius: 5,
      pointBackgroundColor: totals.map((v, i) => i === minIdx ? '#2ecc71' : '#e74c3c'),
    }],
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => '¥' + ctx.parsed.y }
      },
    },
    scales: {
      y: {
        ticks: { callback: v => '¥' + v },
        suggestedMin: Math.min(...totals) - 200,
      },
      x: { ticks: { maxRotation: 45 } },
    },
  },
});
` : ''}
</script>

</body>
</html>`;

  const outPath = path.join(baseDir, 'index.html');
  writeFileSync(outPath, html, 'utf-8');
}

// ── 支持直接运行 ───────────────────────────────────────────
function escHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataFile = path.join(__dirname, 'data', 'prices.json');
  if (!existsSync(dataFile)) { console.error('data/prices.json 不存在，请先运行 price_checker.js'); process.exit(1); }
  const history = JSON.parse(readFileSync(dataFile, 'utf-8'));
  generateDashboard(history, __dirname);
  console.log('dashboard.html 已生成');
}
