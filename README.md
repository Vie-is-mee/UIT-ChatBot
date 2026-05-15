# UIT Chatbot v2.3

Chatbot RAG kỷ niệm 20 năm UIT — hỗ trợ session đa lượt & Web RAG fallback thông minh.

## Changelog v2.3 (Fixes)

### Bug Fixes
| # | Vấn đề | File | Giải pháp |
|---|--------|------|-----------|
| 1 | CNPM index không tồn tại → crash log | `retrieval.py` | Phân biệt FileNotFoundError, log hướng dẫn `--scope cnpm` |
| 2 | Web RAG chỉ trigger khi context rỗng | `rag.py` | Thêm **Web RAG Pass 2**: nếu LLM báo "không có dữ liệu" + chưa dùng web → tự động tìm web + sinh lại câu trả lời |
| 3 | DuckDuckGo parser sai selector | `web_search.py` | `a.result__url` là `<span>`, không phải `<a>` → sửa thành `a.result__a` |
| 4 | Không có fallback khi search engine thất bại | `web_search.py` | Thêm Google scrape fallback + **direct page heuristic** theo từ khoá |
| 5 | Timeout quá ngắn (8s) | `config.py` | Tăng lên 10s; `WEB_SEARCH_MAX_RESULTS` tăng lên 3 |

### Ví dụ: Hỏi về Hiệu trưởng hiện tại UIT
**Trước v2.3:** LLM trả lời "không có dữ liệu" (dù web RAG được bật) vì:
  - Vector DB UIT trả về context (nhưng không liên quan)
  - Web RAG pass 1 không trigger (context không rỗng)
  - Kết quả: "không có thông tin"

**Sau v2.3:**
  1. Vector DB trả về context không liên quan → LLM báo "không có dữ liệu"
  2. **Web RAG Pass 2** tự động kích hoạt
  3. DuckDuckGo tìm trên `uit.edu.vn` → scrape `uit.edu.vn/gioi-thieu/ban-lanh-dao` (direct heuristic)
  4. LLM sinh lại câu trả lời với nội dung từ trang ban lãnh đạo UIT

---

## Cài đặt

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
```

Tạo file `.env`:
```env
GOOGLE_API_KEY=your-gemini-api-key-here
```

### 2. Tạo Vector Database

```bash
# Tạo cả hai DB (lần đầu):
python scripts/init_data.py

# Chỉ tạo CNPM (nếu UIT đã có):
python scripts/init_data.py --scope cnpm

# Chỉ tạo UIT:
python scripts/init_data.py --scope uit
```

### 3. Chạy Server

```bash
uvicorn app.main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Kiến trúc RAG v2.3

```
Câu hỏi người dùng
      │
      ▼
  detect_scope() → UIT | CNPM
      │
      ▼
  Cache check (Redis)
      │
      ▼
  Embedding → FAISS search
      │
      ├── context có → LLM generate
      │                    │
      │             LLM báo "không có dữ liệu"?
      │                    │
      │              YES ──┤
      │                    ▼
      │              Web RAG Pass 2
      │              (DuckDuckGo → Google → Direct heuristic)
      │                    │
      │              LLM generate lại
      │
      └── context rỗng → Web RAG Pass 1
                          │
                        LLM generate
```

---

## Cấu trúc thư mục

```
backend/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── api/
│   │   ├── chat.py
│   │   ├── feedback.py
│   │   └── session.py
│   ├── services/
│   │   ├── rag.py          
│   │   ├── web_search.py   
│   │   ├── retrieval.py    
│   │   ├── llm.py
│   │   ├── embedding.py
│   │   ├── cache.py
│   │   └── session.py
│   └── utils/
│       ├── logger.py
│       └── sanitize.py
├── data/
│   ├── raw/
│   │   ├── uit/data_uit.json
│   │   └── cnpm/data_cnpm.json
│   ├── processed/
│   │   ├── uit/chunks.json
│   │   └── cnpm/chunks.json
│   └── vector_db/          ← Tạo bởi init_data.py
│       ├── uit_index/index.faiss
│       └── cnpm_index/index.faiss
└── scripts/
    └── init_data.py        
```
