import os
import requests
from dotenv import load_dotenv

# 1. Load API Key
dotenv_path = "app/.env" if os.path.exists("app/.env") else ".env"
load_dotenv(dotenv_path)

api_key = os.getenv("GOOGLE_API_KEY")
groq_key = os.getenv("GROQ_API_KEY")

print("="*50)
print("🔍 ĐANG QUÉT TẤT CẢ MODEL TƯƠNG THÍCH VỚI KEY CỦA BẠN")
print("="*50)

# Kiểm tra Google Gemini
if api_key:
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        models = list(client.models.list())
        
        print("\n[1] --- CÁC MODEL GEMINI DÙNG ĐỂ CHAT (LLM_MODEL) ---")
        for m in models:
            if 'generateContent' in m.supported_actions:
                print(f"ID: {m.name} | Tên: {m.display_name}")

        print("\n[2] --- CÁC MODEL GEMINI DÙNG ĐỂ NHÚNG VECTOR (EMBEDDING_MODEL) ---")
        for m in models:
            if 'embedContent' in m.supported_actions:
                print(f"ID: {m.name} | Tên: {m.display_name}")
    except Exception as e:
        print(f"\nLỗi khi quét danh sách Gemini: {e}")
else:
    print("\n[!] Không tìm thấy GOOGLE_API_KEY trong .env")

# Kiểm tra Groq
if groq_key:
    try:
        url = "https://api.groq.com/openai/v1/models"
        headers = {"Authorization": f"Bearer {groq_key}"}
        res = requests.get(url, headers=headers)
        if res.status_code == 200:
            print("\n[3] --- CÁC MODEL GROQ DÙNG ĐỂ CHAT (LLM_MODEL) ---")
            for m in res.json().get("data", []):
                print(f"ID: {m['id']} | Context Window: {m.get('context_window', 'N/A')}")
        else:
            print(f"\nLỗi khi quét danh sách Groq: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"\nLỗi kết nối tới Groq: {e}")
else:
    print("\n[!] Không tìm thấy GROQ_API_KEY trong .env")

print("\n" + "="*50)
print("LƯU Ý: Hãy copy chính xác phần 'ID' (ví dụ: qwen/qwen3-32b) dán vào config.py")
print("="*50)
