import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { generateDashboard } from './generate_dashboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data', 'prices.json');

// ── 配件清单 ───────────────────────────────────────────────
const COMPONENTS = [
  { name: 'CPU',  keyword: '英特尔14400F',             refPrice: 1000 },
  { name: '主板', keyword: '华硕B660M重炮手',           refPrice: 580  },
  { name: '显卡', keyword: '映众5060曜夜',              refPrice: 2299 },
  { name: '内存', keyword: '金士顿Beast OC3200 16G套装', refPrice: 1210 },
  { name: '硬盘', keyword: '七彩虹CN600 1T',            refPrice: 820  },
  { name: '散热', keyword: '九州风神AK620数显',          refPrice: 280  },
  { name: '电源', keyword: '利民TG650W金牌全模组',       refPrice: 250  },
  { name: '机箱', keyword: '乔斯伯T7',                  refPrice: 770  },
  { name: '定制线', keyword: '纯黑电源定制线模组线',     refPrice: 100  },
  { name: '棱镜',  keyword: '棱镜9lROX3 ARGB',          refPrice: 60   },
  { name: '延长线', keyword: 'aijs晶森ARGB显卡供电延长线', refPrice: 60 },
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

    for (const platform of PLATFORMS) {
      process.stdout.write(`  ${platform}... `);
      const rows = runOpencli(platform, comp.keyword);

      // 过滤黑名单，取最低价
      const valid = rows.filter(r => !isBlacklisted(r.title));
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

      const price = parsePrice(best.price);
      if (price === null) { console.log('价格解析失败'); continue; }

      platforms[platform] = {
        price,
        title: (best.title ?? '').slice(0, 60),
        shop:  (best.shop  ?? '').slice(0, 30),
        url:   best.url ?? '',
      };
      console.log(`¥${price} | ${best.shop ?? ''}`);
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
