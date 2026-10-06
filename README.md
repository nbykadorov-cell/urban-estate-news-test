# Urban Estate News — Stage 1

First real integration after the Vercel runtime test.

This version contains only one source:
- 161.RU: https://161.ru/text/realty/

No npm dependencies.
No package.json.
No Google News.
No other sources.

The endpoint is:
GET /api/news
GET /api/news?category=rostov

The function always returns JSON, including when 161.RU is unavailable.
