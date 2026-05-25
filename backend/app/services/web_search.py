"""
web_search.py — Web RAG Fallback Service (v2.3 — đã sửa lỗi parser)

FIXES v2.3:
  - Sửa DuckDuckGo parser: selector `a.result__url` không tồn tại → dùng `a.result__a`
  - Thêm Google scrape fallback khi DuckDuckGo thất bại
  - Thêm direct page heuristic theo từ khoá (hiệu trưởng, tuyển sinh, học phí, v.v.)
  - Tăng số trang tải tối thiểu lên 3
"""

import re
import time
import requests
from urllib.parse import quote_plus, unquote, parse_qs, urlparse
from app.config import settings
from app.utils.logger import app_logger

TRUSTED_UIT_DOMAINS = [
    "uit.edu.vn",
    "tuyensinh.uit.edu.vn",
    "daa.uit.edu.vn",
    "sv.uit.edu.vn",
    "cnpm.uit.edu.vn",
    "se.uit.edu.vn",
]

_HEADERS = {
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}

_session = requests.Session()
_session.headers.update(_HEADERS)


# Heuristic: từ khoá → URL UIT trực tiếp (dùng khi search engine thất bại)
_DIRECT_PAGES = [
    (
        ["hiệu trưởng", "ban lãnh đạo", "ban giám hiệu", "lãnh đạo trường",
         "hiệu phó", "rector", "principal", "hiệu"],
        "https://www.uit.edu.vn/bai-viet/ban-giam-hieu",
    ),
    (
        ["lịch sử", "thành lập", "giới thiệu", "tổng quan", "history",
         "overview", "20 năm", "kỷ niệm", "hình thành", "thành tựu", "thành tích", "đạt được"],
        "https://www.uit.edu.vn/gioi-thieu",
    ),
    (
        ["tuyển sinh", "xét tuyển", "điểm chuẩn", "chỉ tiêu", "đăng ký",
         "hồ sơ", "thí sinh", "admission", "nhập học"],
        "https://tuyensinh.uit.edu.vn/",
    ),
    (
        ["học phí", "chi phí học", "học bổng", "miễn giảm", "tuition", "fee"],
        "https://daa.uit.edu.vn",
    ),
    (
        ["chương trình đào tạo", "ngành học", "chuyên ngành", "curriculum"],
        "https://daotao.uit.edu.vn",
    ),
    (
        ["sinh viên", "student", "câu lạc bộ", "hoạt động ngoại khóa",
         "ký túc xá", "dorm"],
        "https://student.uit.edu.vn/",
    ),
    (
        ["cơ sở vật chất", "campus", "địa chỉ", "thư viện", "library",
         "phòng lab", "facility"],
        "https://www.uit.edu.vn/bai-viet/co-so-vat-chat",
    ),
    (
        ["nghiên cứu", "research", "giải thưởng", "award", "công trình khoa học", "huân chương", "huy chương"],
        "https://www.uit.edu.vn/nghien-cuu",
    ),
    (
        ["cnpm", "công nghệ phần mềm", "khoa phần mềm", "software engineering",
         "selab", "se "],
         "https://se.uit.edu.vn/gioi-thieu",
    ),
    (
        ["liên kết quốc tế", "hợp tác quốc tế", "international", "đối tác"],
        "https://www.uit.edu.vn/bai-viet/hop-tac-quoc-te",
    ),
]


def _is_trusted_url(url: str) -> bool:
    lower_url = url.lower()
    
    # Loại bỏ các trang mạng xã hội
    excluded_domains = [
        "facebook.com", "fb.com", "fb.me",
        "youtube.com", "youtu.be",
        "tiktok.com",
        "instagram.com", "instagr.am",
        "twitter.com", "x.com",
        "linkedin.com",
        "pinterest.com",
        "zalo.me",
    ]
    if any(domain in lower_url for domain in excluded_domains):
        return False
        
    return any(domain in lower_url for domain in TRUSTED_UIT_DOMAINS)


def _remove_diacritics(text: str) -> str:
    """Loại bỏ dấu tiếng Việt để phục vụ so khớp từ khoá chính xác."""
    import unicodedata
    normalized = unicodedata.normalize('NFKD', text)
    cleaned = "".join([c for c in normalized if not unicodedata.combining(c)])
    return cleaned.replace('đ', 'd').replace('Đ', 'D')


def _calculate_relevance(title: str, text: str, query: str) -> float:
    """Tính toán độ liên quan của tiêu đề và nội dung trang web với từ khóa câu hỏi."""
    q_norm = _remove_diacritics(query.lower())
    title_norm = _remove_diacritics(title.lower())
    text_norm = _remove_diacritics(text.lower())
    
    words = re.findall(r"\w+", q_norm)
    stop_words = {"va", "hoac", "cua", "cho", "cac", "nhung", "duoc", "boi", "tai", "trong", "voi", "la", "co"}
    keywords = [w for w in words if w not in stop_words and len(w) >= 2]
    
    if not keywords:
        return 0.1
        
    title_matches = sum(1 for kw in keywords if kw in title_norm)
    text_matches = sum(1 for kw in keywords if kw in text_norm)
    
    # Trọng số: Từ khóa trong tiêu đề nhân 10, trong văn bản nhân 1
    score = (title_matches * 10.0) + text_matches
    return score


def _extract_page_date(soup, headers) -> float:
    """Trích xuất thời gian sửa đổi/công bố của trang web (dưới dạng timestamp). Trả về 0.0 nếu không tìm thấy."""
    from datetime import datetime

    def parse_date_str(s: str) -> float:
        s = s.strip()
        # ISO formats like 2026-05-23T22:58:53+07:00 or 2026-05-23
        iso_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2}))?", s)
        if iso_match:
            try:
                parts = iso_match.groups()
                year, month, day = map(int, parts[:3])
                hour = int(parts[3]) if parts[3] is not None else 0
                minute = int(parts[4]) if parts[4] is not None else 0
                second = int(parts[5]) if parts[5] is not None else 0
                return datetime(year, month, day, hour, minute, second).timestamp()
            except ValueError:
                pass
        
        # dd/mm/yyyy or dd-mm-yyyy
        slash_match = re.search(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", s)
        if slash_match:
            try:
                day, month, year = map(int, slash_match.groups())
                return datetime(year, month, day).timestamp()
            except ValueError:
                pass
        return 0.0

    # 1. Thử tìm trong các thẻ meta phổ biến
    meta_tags = [
        ("property", "article:modified_time"),
        ("property", "article:published_time"),
        ("itemprop", "dateModified"),
        ("itemprop", "datePublished"),
        ("name", "pubdate"),
        ("name", "publishdate"),
        ("name", "dcterms.modified"),
        ("name", "dcterms.created"),
    ]
    for attr, value in meta_tags:
        meta = soup.find("meta", {attr: re.compile(f"^{value}$", re.I)})
        if meta and meta.get("content"):
            ts = parse_date_str(meta.get("content"))
            if ts > 0:
                return ts

    # 2. Thử tìm trong Header Last-Modified
    last_mod = headers.get("Last-Modified")
    if last_mod:
        import email.utils
        try:
            dt = email.utils.parsedate_to_datetime(last_mod)
            return dt.timestamp()
        except Exception:
            pass

    # 3. Quét trong nội dung văn bản cho các mẫu ngày tháng tiếng Việt (ví dụ: ngày dd/mm/yyyy hoặc dd-mm-yyyy)
    text_content = soup.get_text()
    # Tìm dạng ngày đăng/cập nhật hoặc ngày/tháng/năm
    date_patterns = [
        r"(?:ngày đăng|cập nhật|đăng ngày|ngày|công bố)\s*[:\-]?\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})",
        r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})"
    ]
    for pattern in date_patterns:
        match = re.search(pattern, text_content, re.I)
        if match:
            try:
                day, month, year = map(int, match.groups())
                return datetime(year, month, day).timestamp()
            except Exception:
                pass

    return 0.0


def _clean_html_text(html_text: str) -> str:
    text = re.sub(r'\n{3,}', '\n\n', html_text)
    text = re.sub(r'[ \t]+', ' ', text)
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln]
    return '\n'.join(lines)


def _fetch_page_text(url: str, max_chars: int = 2500) -> tuple:
    """Tải trang web, trả về (title, cleaned_text, timestamp). Trả về ('', '', 0.0) nếu thất bại."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        app_logger.error("❌ BeautifulSoup4 chưa được cài: pip install beautifulsoup4")
        return "", "", 0.0

    try:
        resp = _session.get(
            url,
            timeout=settings.WEB_SEARCH_TIMEOUT,
            allow_redirects=True,
        )

        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        # Trích xuất thời gian sửa đổi trước khi decompose
        timestamp = _extract_page_date(soup, resp.headers)

        title = soup.title.string.strip() if soup.title and soup.title.string else url

        for tag in soup(["script", "style", "nav", "footer", "header",
                         "noscript", "aside", "iframe", "form"]):
            tag.decompose()

        main_content = (
            soup.find("main") or
            soup.find("article") or
            soup.find(id=re.compile(r"content|main|body", re.I)) or
            soup.find(class_=re.compile(r"content|main|entry|post", re.I)) or
            soup.body
        )

        raw_text = main_content.get_text(separator="\n") if main_content else ""
        if len(raw_text.strip()) < 150:
            raw_text = soup.body.get_text(separator="\n") if soup.body else soup.get_text(separator="\n")

        clean_text = _clean_html_text(raw_text)
        return title, clean_text[:max_chars], timestamp

    except requests.Timeout:
        app_logger.warning(f"⏱️  Timeout khi tải {url}")
        return "", "", 0.0
    except requests.RequestException as e:
        app_logger.warning(f"⚠️  Lỗi HTTP {url}: {e}")
        return "", "", 0.0
    except Exception as e:
        app_logger.error(f"❌ Lỗi khi xử lý {url}: {e}", exc_info=True)
        return "", "", 0.0


def _extract_ddg_url(href: str) -> str:
    """Giải mã URL redirect DuckDuckGo (/l/?uddg=...)."""
    if not href:
        return ""
    if "uddg=" in href:
        parsed = parse_qs(urlparse(href).query)
        uddg = parsed.get("uddg", [""])[0]
        return unquote(uddg) if uddg else ""
    if href.startswith("http"):
        return href
    return ""


def _search_duckduckgo(query: str, site_restrict: str = "uit.edu.vn") -> list:
    """
    Tìm kiếm DuckDuckGo HTML.
    FIX v2.3: Chỉ dùng `a.result__a` (đây là thẻ <a> thực sự có href).
    `a.result__url` KHÔNG đúng — đó là <span>, không phải <a>.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return []

    search_query = f"site:{site_restrict} {query}"
    ddg_url = f"https://html.duckduckgo.com/html/?q={quote_plus(search_query)}&kl=vn-vi"

    try:
        resp = _session.get(ddg_url, timeout=settings.WEB_SEARCH_TIMEOUT)
        soup = BeautifulSoup(resp.text, "html.parser")

        urls = []
        for a in soup.select("a.result__a"):  # FIX: loại bỏ `a.result__url` sai
            href = a.get("href", "")
            real_url = _extract_ddg_url(href)
            if real_url and _is_trusted_url(real_url) and real_url not in urls:
                urls.append(real_url)

        app_logger.info(f"🔎 DuckDuckGo: {len(urls)} URL từ site:{site_restrict}")
        return urls[:settings.WEB_SEARCH_MAX_RESULTS + 3]

    except Exception as e:
        app_logger.warning(f"⚠️  DuckDuckGo lỗi: {e}")
        return []


def _search_google_scrape(query: str, site_restrict: str = "uit.edu.vn") -> list:
    """
    Fallback: Scrape Google (không API key) khi DuckDuckGo thất bại.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return []

    search_query = f"site:{site_restrict} {query}"
    google_url = f"https://www.google.com/search?q={quote_plus(search_query)}&hl=vi&num=5"

    try:
        resp = _session.get(google_url, timeout=settings.WEB_SEARCH_TIMEOUT)
        soup = BeautifulSoup(resp.text, "html.parser")

        urls = []
        for a in soup.select("a[href]"):
            href = a.get("href", "")
            if href.startswith("/url?"):
                parsed = parse_qs(urlparse(href).query)
                real = parsed.get("q", [""])[0]
            elif href.startswith("http"):
                real = href
            else:
                continue

            if real and _is_trusted_url(real) and real not in urls:
                urls.append(real)

        app_logger.info(f"🔎 Google scrape: {len(urls)} URL từ site:{site_restrict}")
        return urls[:settings.WEB_SEARCH_MAX_RESULTS + 3]

    except Exception as e:
        app_logger.warning(f"⚠️  Google scrape lỗi: {e}")
        return []


def _get_direct_pages(query: str) -> list:
    """Dựa trên từ khoá trong câu hỏi → trả về URL UIT trực tiếp (không qua search engine)."""
    query_lower = query.lower()
    matched = []
    for keywords, url in _DIRECT_PAGES:
        # Nếu là trang giới thiệu chung của khoa CNPM, tránh khớp khi hỏi về các chủ đề chuyên sâu
        if url == "https://se.uit.edu.vn/gioi-thieu":
            exclude_kws = ["ban học tập", "bht", "học phí", "tuyển sinh", "điểm chuẩn", "câu lạc bộ", "clb", "hoạt động", "tin tức", "sự kiện"]
            if any(ex in query_lower for ex in exclude_kws):
                continue

        if any(kw in query_lower for kw in keywords):
            if url not in matched:
                matched.append(url)
    return matched


def _get_simplified_query(query: str) -> str:
    """Rút gọn câu hỏi tiếng Việt dài thành cụm từ khóa tìm kiếm (search query) hiệu quả."""
    q_clean = query.strip()
    if not q_clean:
        return ""

    # Nếu câu hỏi ngắn (<= 6 từ), dùng luôn
    words = q_clean.split()
    if len(words) <= 6:
        return q_clean

    # Thử rút gọn bằng Groq (llama-3.1-8b-instant) cực nhanh
    if settings.GROQ_API_KEY:
        try:
            import requests
            headers = {
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {
                        "role": "system",
                        "content": "Bạn là trợ lý rút trích từ khóa tìm kiếm. Hãy chuyển câu hỏi của người dùng thành một câu truy vấn tìm kiếm (search query) ngắn gọn bằng tiếng Việt, chỉ chứa các từ khóa quan trọng nhất để tìm trên Google, không chứa từ chào hỏi, không chứa từ nối dài dòng. Trả về DUY NHẤT câu truy vấn đó (khoảng 3-6 từ), không đặt trong nháy kép, không giải thích."
                    },
                    {"role": "user", "content": q_clean}
                ],
                "temperature": 0.0,
                "max_completion_tokens": 30
            }
            url = "https://api.groq.com/openai/v1/chat/completions"
            resp = requests.post(url, headers=headers, json=payload, timeout=5)
            if resp.status_code == 200:
                simplified = resp.json()["choices"][0]["message"]["content"].strip()
                simplified = simplified.replace('"', '').replace("'", "")
                if simplified and len(simplified.split()) <= 12:
                    app_logger.info(f"Simplified query via Groq: '{query}' -> '{simplified}'")
                    return simplified
        except Exception as e:
            app_logger.warning(f"Không thể rút gọn câu truy vấn bằng Groq: {e}")

    # Thử rút gọn bằng Gemini
    if settings.GOOGLE_API_KEY:
        try:
            from google import genai
            from google.genai import types
            client = genai.Client(api_key=settings.GOOGLE_API_KEY)
            response = client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=f"Rút trích các từ khóa tìm kiếm chính từ câu hỏi này thành 1 cụm từ tìm kiếm ngắn gọn (khoảng 3-6 từ), không thêm lời dẫn hay giải thích: {q_clean}",
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=30,
                ),
            )
            simplified = response.text.strip().replace('"', '').replace("'", "")
            if simplified:
                app_logger.info(f"Simplified query via Gemini: '{query}' -> '{simplified}'")
                return simplified
        except Exception as e:
            app_logger.warning(f"Không thể rút gọn câu truy vấn bằng Gemini: {e}")

    # Fallback heuristic: chỉ loại bỏ các từ chào hỏi phổ biến
    q_lower = q_clean.lower()
    fillers = [
        "bạn có thể", "cho mình hỏi", "cho hỏi", "tìm hiểu thêm về", "tìm hiểu về",
        "hãy giới thiệu", "giới thiệu về", "thông tin về", "chia sẻ về",
        "có liên quan đến", "liên quan đến", "liên quan", "cho biết", "cách thức",
        "làm thế nào để", "làm sao để", "như thế nào", "là gì", "ở đâu", "bao nhiêu"
    ]
    for filler in fillers:
        q_lower = q_lower.replace(filler, " ")
    q_clean_fallback = re.sub(r'[?.,!;:""\'()]', ' ', q_lower)
    words_fallback = [w for w in q_clean_fallback.split() if w]
    return " ".join(words_fallback)


def _search_tavily(query: str, scope: str = "uit") -> list:
    """
    Tìm kiếm thông qua Tavily API (tối ưu cho RAG).
    Trả về danh sách kết quả chứa url, title, content.
    """
    if not settings.TAVILY_API_KEY:
        return []

    try:
        url = "https://api.tavily.com/search"
        domains = ["se.uit.edu.vn"] if scope == "cnpm" else ["uit.edu.vn"]
        if scope == "cnpm":
            domains.append("uit.edu.vn")

        payload = {
            "api_key": settings.TAVILY_API_KEY,
            "query": query,
            "search_depth": "basic",
            "include_domains": domains,
            "exclude_domains": ["facebook.com", "fb.com", "youtube.com", "tiktok.com", "instagram.com", "twitter.com", "x.com"],
            "max_results": settings.WEB_SEARCH_MAX_RESULTS + 3
        }

        if len(domains) == 1:
            payload["query"] = f"site:{domains[0]} {query}"

        resp = requests.post(url, json=payload, timeout=settings.WEB_SEARCH_TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as e:
        app_logger.error(f"⚠️ Tavily Search thất bại: {e}")
        return []


def search_uit_web(query: str, scope: str = "uit") -> tuple:
    """
    Tìm kiếm thông tin trên web UIT theo câu hỏi (v2.5 - hỗ trợ sắp xếp theo ngày sửa đổi và độ liên quan).

    Chiến lược:
      1. Kiểm tra Direct page heuristic trước.
      2. Tải danh sách URLs tìm kiếm từ DuckDuckGo/Google.
      3. Tải nội dung các URL, đo lường độ liên quan và thời gian sửa đổi.
      4. Fallback sang Tavily Search nếu thiếu kết quả.
      5. Sắp xếp kết quả ưu tiên ngày sửa đổi mới nhất và độ liên quan cao nhất.
    """
    if not settings.WEB_SEARCH_ENABLED:
        return "", []

    app_logger.info(f"🌐 Web RAG | scope={scope} | query={query[:60]}")

    pages = []

    # 1. Kiểm tra Direct page heuristic trước
    direct_urls = _get_direct_pages(query)
    for url in direct_urls:
        title, text, timestamp = _fetch_page_text(url)
        if text and len(text) > 100:
            relevance = _calculate_relevance(title, text, query)
            if relevance > 0:
                pages.append({
                    "url": url,
                    "title": title,
                    "text": text,
                    "timestamp": timestamp,
                    "relevance": relevance,
                    "source_type": "web"
                })
                app_logger.info(f"🎯 Direct Page Match: {len(text)} ký tự từ {url} | relevance={relevance}")

    # Rút gọn câu hỏi trước khi tìm kiếm qua search engine
    search_q = _get_simplified_query(query)
    app_logger.info(f"🌐 Web RAG | search_query='{search_q}'")

    site_restrict = "se.uit.edu.vn" if scope == "cnpm" else "uit.edu.vn"

    # 2. Thử DuckDuckGo trước
    candidate_urls = _search_duckduckgo(search_q, site_restrict=site_restrict)

    if not candidate_urls and scope == "cnpm":
        candidate_urls = _search_duckduckgo(search_q, site_restrict="uit.edu.vn")

    # 3. Google Fallback (nếu DDG trống)
    if not candidate_urls:
        app_logger.info("🔄 DuckDuckGo trống → thử Google scrape")
        candidate_urls = _search_google_scrape(search_q, site_restrict=site_restrict)
        if not candidate_urls and scope == "cnpm":
            candidate_urls = _search_google_scrape(search_q, site_restrict="uit.edu.vn")

    # Loại bỏ các url đã fetch từ direct page để tránh fetch trùng
    fetched_urls = {p["url"] for p in pages}
    urls_to_fetch = [u for u in candidate_urls if u not in fetched_urls]

    # 4. Tải nội dung cho các candidate urls từ DDG/Google
    max_fetch = max(settings.WEB_SEARCH_MAX_RESULTS, 3)
    remaining_slots = max_fetch - len(pages)
    
    if remaining_slots > 0 and urls_to_fetch:
        for url in urls_to_fetch[:remaining_slots]:
            title, text, timestamp = _fetch_page_text(url)
            if text and len(text) > 100:
                relevance = _calculate_relevance(title, text, query)
                if relevance > 0:
                    pages.append({
                        "url": url,
                        "title": title,
                        "text": text,
                        "timestamp": timestamp,
                        "relevance": relevance,
                        "source_type": "web"
                    })
                    app_logger.info(f"✅ Web RAG: {len(text)} ký tự từ {url} | relevance={relevance}")
                else:
                    app_logger.info(f"⚪ Web RAG: Bỏ qua {url} vì relevance = 0")
            else:
                app_logger.info(f"⚪ Web RAG: nội dung rỗng/ngắn từ {url}")
            time.sleep(0.3)

    # 5. Fallback sang Tavily nếu vẫn chưa đủ số lượng kết quả
    if len(pages) < settings.WEB_SEARCH_MAX_RESULTS and settings.TAVILY_API_KEY:
        app_logger.info("🔄 Số lượng kết quả chưa đủ → Gọi thêm Tavily Search để tìm ứng viên...")
        tavily_results = _search_tavily(search_q, scope)
        fetched_urls = {p["url"] for p in pages}
        
        for r in tavily_results:
            r_url = r.get("url", "")
            if r_url and r_url not in fetched_urls and _is_trusted_url(r_url):
                title, text, timestamp = _fetch_page_text(r_url)
                if text and len(text) > 100:
                    relevance = _calculate_relevance(title, text, query)
                    if relevance > 0:
                        pages.append({
                            "url": r_url,
                            "title": title,
                            "text": text,
                            "timestamp": timestamp,
                            "relevance": relevance,
                            "source_type": "web"
                        })
                        app_logger.info(f"✅ Tavily Web RAG: {len(text)} ký tự từ {r_url} | relevance={relevance}")
                    else:
                        app_logger.info(f"⚪ Tavily Web RAG: Bỏ qua {r_url} vì relevance = 0")
                else:
                    # Dùng content snippet trực tiếp từ Tavily nếu không cào được trang full
                    content = r.get("content", "")
                    if content and len(content) > 50:
                        relevance = _calculate_relevance(r.get("title", ""), content, query)
                        if relevance > 0:
                            pages.append({
                                "url": r_url,
                                "title": r.get("title", r_url),
                                "text": content,
                                "timestamp": 0.0,
                                "relevance": relevance,
                                "source_type": "web"
                            })
                            app_logger.info(f"✅ Tavily Snippet RAG: {r_url} | relevance={relevance}")

    # Sắp xếp các trang:
    # 1. Ưu tiên trang có ngày sửa đổi/công bố mới nhất (timestamp giảm dần)
    # 2. Ưu tiên trang có độ liên quan cao nhất (relevance giảm dần)
    pages.sort(key=lambda x: (x["timestamp"], x["relevance"]), reverse=True)

    # Chọn tối đa số lượng kết quả cấu hình
    final_pages = pages[:settings.WEB_SEARCH_MAX_RESULTS]

    context_parts = []
    sources = []
    for p in final_pages:
        context_parts.append(f"[Nguồn: {p['url']}]\n{p['text']}")
        sources.append({"url": p["url"], "title": p["title"], "source_type": p["source_type"]})

    if not context_parts:
        app_logger.warning("⚠️  Web RAG: Tất cả trang đều rỗng hoặc không liên quan.")
        return "", []

    urls = [s.get("url") for s in sources]
    app_logger.info(f"🚀 Chọn {len(sources)} nguồn Web tốt nhất (ưu tiên ngày sửa đổi và độ liên quan). Links: {urls}")
    return "\n\n---\n\n".join(context_parts), sources
