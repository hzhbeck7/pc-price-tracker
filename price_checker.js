import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { generateDashboard } from './generate_dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data', 'prices.json');

// ── 配件清单 ───────────────────────────────────────────────
// qty: 数量，价格会自动乘以此值（默认1）
// minRatio: 最低可接受价格 = refPrice * minRatio，低于此视为异常/二手
const COMPONENTS = [
  { name: 'CPU',   keyword: '英特尔 i5-14400F 盒装',              refPrice: 1000, minRatio: 0.65 },
  { name: '主板',  keyword: '华硕TUF GAMING B660M-PLUS重炮手 新品', refPrice: 580,  minRatio: 0.70 },
  { name: '显卡',  keyword: '映众RTX5060曜夜 8G',                 refPrice: 2299, minRatio: 0.80 },
  { name: '内存',  keyword: '金士顿Beast DDR4 3200 16G*2 套装',    refPrice: 1210, minRatio: 0.65, qty: 2 },
  { name: '硬盘',  keyword: '七彩虹CN600 1T SSD M.2',             refPrice: 820,  minRatio: 0.50 },
  { name: '散热',  keyword: '九州风神AK620 数显 CPU散热器',         refPrice: 280,  minRatio: 0.55 },
  { name: '电源',  keyword: '利民TG650W 金牌全模组 电源',           refPrice: 250,  minRatio: 0.60 },
  { name: '机箱',  keyword: '乔斯伯T7 机箱',                      refPrice: 770,  minRatio: 0.65 },
  { name: '定制线', keyword: '纯黑 模组线 电源定制线',              refPrice: 100,  minRatio: 0.30 },
  { name: '棱镜',  keyword: '棱镜9lROX3 ARGB风扇',                refPrice: 60,   minRatio: 0.40 },
  { name: '延长线', keyword: 'aijs晶森 ARGB显卡供电延长线',         refPrice: 60,   minRatio: 0.30 },
];

const PLATFORMS = ['jd', 'taobao'];

// 二手/翻新关键词黑名单（兜底过滤，jd返回结果也再过一遍）
const BLACKLIST = ['二手', '翻新', '拆机', '散片', '散装', '工程版', '批发', '整箱'];

// ── opencli 调用 ───────────────────────────────────────────
function runOpencli(platform, keyword, limit = 8) {
  const cmd = `opencli ${platform} search "${keyword.replace(/"/g, '')}" --limit ${limit} --format json`;
  try {
    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 60_000 });
    // opencli --format json 可能输出纯数组或带包装的对象
    const parsed = JSON.parse(raw.trim());
    return Array.isArray(parsed) ? parsed : (parsed.rows ?? parsed.data ?? []);
  } catch (err) {
    console.warn(`  [warn] opencli ${platform} search "${keyword}" 失败: ${err.message.split('\n')[0]}`);
    return [];
  }
}

function isBlacklisted(title = '') {
  return BLACKLIST.some(w => title.includes(w));
}

function parsePrice(raw) {
  if (typeof raw === 'number') return raw;
  const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

// ── 主流程 ─────────────────────────────────────────────────
async function main() {
  console.log('🔍 开始抓取价格...\n');

  mkdirSync(path.join(__dirname, 'data'), { recursive: true });

  const snapshot = {
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('zh-CN'),
    items: [],
    total_min: 0,
  };

  for (const comp of COMPONENTS) {
    console.log(`▶ ${comp.name}（${comp.keyword}）`);
    const platforms = {};

    const qty        = comp.qty      ?? 1;
    const priceFloor = comp.minRatio != null ? comp.refPrice * comp.minRatio / qty : 0;

    for (const platform of PLATFORMS) {
      process.stdout.write(`  ${platform}... `);
      const rows = runOpencli(platform, comp.keyword);

      // 过滤黑名单 + 价格异常（太低=二手/套装混入）
      const valid = rows.filter(r => {
        if (isBlacklisted(r.title)) return false;
        const p = parsePrice(r.price);
        if (p === null) return false;
        if (p < priceFloor) return false;
        return true;
      });

      if (valid.length === 0) {
        console.log('无有效结果');
        continue;
      }

      const best = valid.reduce((a, b) => {
        const pa = parsePrice(a.price);
        const pb = parsePrice(b.price);
        if (pa === null) return b;
        if (pb === null) return a;
        return pa <= pb ? a : b;
      });

      const unitPrice = parsePrice(best.price);
      if (unitPrice === null) { console.log('价格解析失败'); continue; }
      const totalPrice = +(unitPrice * qty).toFixed(2);

      platforms[platform] = {
        price:     totalPrice,
        unitPrice: qty > 1 ? unitPrice : undefined,
        qty:       qty > 1 ? qty : undefined,
        title:     (best.title ?? '').slice(0, 60),
        shop:      (best.shop  ?? '').slice(0, 30),
        url:       best.url ?? '',
      };
      const qtyNote = qty > 1 ? ` (单条¥${unitPrice}×${qty})` : '';
      console.log(`¥${totalPrice}${qtyNote} | ${best.shop ?? ''}`);
    }

    // 本配件各平台最低价
    const prices = Object.values(platforms).map(p => p.price).filter(Boolean);
    const minPrice = prices.length ? Math.min(...prices) : null;
    const minPlatform = minPrice != null
      ? Object.keys(platforms).find(k => platforms[k].price === minPrice)
      : null;

    snapshot.items.push({
      name:        comp.name,
      keyword:     comp.keyword,
      refPrice:    comp.refPrice,
      platforms,
      min_price:   minPrice,
      min_platform: minPlatform,
    });

    if (minPrice != null) snapshot.total_min += minPrice;
  }

  console.log(`\n✅ 今日最低总价: ¥${snapshot.total_min.toFixed(0)}`);

  // ── 写入历史数据 ───────────────────────────────────────────
  let history = [];
  if (existsSync(DATA_FILE)) {
    try { history = JSON.parse(readFileSync(DATA_FILE, 'utf-8')); } catch (_) {}
  }
  history.push(snapshot);
  writeFileSync(DATA_FILE, JSON.stringify(history, null, 2), 'utf-8');
  console.log(`💾 已保存到 data/prices.json（共 ${history.length} 条记录）`);

  // ── 生成看板 ───────────────────────────────────────────────
  generateDashboard(history, __dirname);
  console.log('📊 dashboard.html 已更新\n');
}

main().catch(err => {
  console.error('致命错误:', err);
  process.exit(1);
});
