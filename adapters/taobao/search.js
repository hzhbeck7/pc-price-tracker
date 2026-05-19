import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'taobao',
  name: 'search',
  access: 'read',
  description: '淘宝天猫商品搜索（仅天猫旗舰店）',
  domain: 's.taobao.com',
  strategy: Strategy.COOKIE,
  args: [
    { name: 'query', positional: true, required: true, help: '搜索关键词' },
    { name: 'limit', type: 'int', default: 10, help: '返回结果数量 (max 30)' },
  ],
  columns: ['rank', 'title', 'price', 'shop', 'url'],
  navigateBefore: false,
  func: async (page, kwargs) => {
    const query = kwargs.query?.trim();
    if (!query) throw new Error('query must not be empty');
    const limit = Math.min(Math.max(kwargs.limit ?? 10, 1), 30);

    // 天猫旗舰店筛选：tab=mall
    await page.goto(
      `https://s.taobao.com/search?q=${encodeURIComponent(query)}&tab=mall&sort=price-asc`
    );
    // 等待页面渲染，天猫搜索页加载较慢
    await page.wait(6);
    await page.autoScroll({ times: 2, delayMs: 2000 });

    const BLACKLIST = ['二手', '翻新', '拆机', '散片', '散装', '工程版', '批发', '整箱'];

    const data = await page.evaluate(`
      (() => {
        const BLACKLIST = ${JSON.stringify(BLACKLIST)};
        const results = [];

        // 尝试多套选择器以应对页面改版
        const selectors = [
          '.item.J_MouserOnverReq',
          '[class*="doubleCardWrapper"]',
          '[class*="CardContainer"]',
          '[data-item-id]',
        ];

        let cards = [];
        for (const sel of selectors) {
          cards = Array.from(document.querySelectorAll(sel));
          if (cards.length > 0) break;
        }

        for (const card of cards) {
          try {
            // 价格
            const priceEl =
              card.querySelector('[class*="price"]') ||
              card.querySelector('.price') ||
              card.querySelector('strong');
            if (!priceEl) continue;
            const priceText = priceEl.textContent.replace(/[^0-9.]/g, '');
            const price = parseFloat(priceText);
            if (!price || price <= 0) continue;

            // 标题
            const titleEl =
              card.querySelector('[class*="title"]') ||
              card.querySelector('a[title]') ||
              card.querySelector('a');
            const title = (titleEl?.title || titleEl?.textContent || '').trim().slice(0, 80);
            if (!title) continue;

            // 黑名单过滤（二手/翻新等）
            if (BLACKLIST.some(w => title.includes(w))) continue;

            // 店铺
            const shopEl =
              card.querySelector('[class*="shopName"]') ||
              card.querySelector('[class*="shop"]') ||
              card.querySelector('.shopname');
            const shop = (shopEl?.textContent || '').trim().slice(0, 40);

            // 链接
            const linkEl = card.querySelector('a[href*="item.taobao.com"], a[href*="detail.tmall.com"]') ||
              card.querySelector('a');
            let url = linkEl?.href || '';
            if (url.startsWith('//')) url = 'https:' + url;

            results.push({ title, price, shop, url });
          } catch (_) {}
        }

        return results;
      })()
    `);

    if (!Array.isArray(data)) return [];

    return data.slice(0, limit).map((item, i) => ({
      rank: i + 1,
      title: item.title,
      price: item.price,
      shop: item.shop,
      url: item.url,
    }));
  },
});
