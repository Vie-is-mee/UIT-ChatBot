"""
llm.py — Gemini LLM Service (v2.5)

Tính năng:
  - Hỗ trợ hội thoại đa lượt (Conversation History).
  - Tự động fallback sang Server Key nếu User Key bị lỗi.
  - Prompt chuyên nghiệp đại diện cho UIT.
"""

import json
import random
import time
from app.config import settings
from app.utils.logger import app_logger
from typing import Optional

_FALLBACK = {
    "answer": "Dạ, mình đang gặp chút sự cố kết nối AI. Bạn thử lại sau nhé!",
    "suggestions": ["Lịch sử UIT?", "Thành tựu UIT?", "Đời sống sinh viên?"],
}

def _get_client(api_key: str = ""):
    """Khởi tạo Gemini client với key tùy chọn."""
    key = api_key or settings.GOOGLE_API_KEY
    if not key:
        raise RuntimeError("Không có API Key nào khả dụng.")
    
    from google import genai
    from google.genai import types
    return genai.Client(
        api_key=key,
        http_options=types.HttpOptions(api_version="v1beta"),
    )

def _build_history_block(conversation_history: list) -> str:
    """Chuyển lịch sử hội thoại thành chuỗi văn bản cho LLM."""
    if not conversation_history:
        return ""
    lines = ["LỊCH SỬ HỘI THOẠI TRƯỚC ĐÓ:"]
    for turn in conversation_history[-settings.MAX_HISTORY_TURNS:]:
        lines.append(f"Người dùng: {turn.get('question', '')}")
        lines.append(f"Trợ lý: {turn.get('answer', '')}")
    return "\n".join(lines)

def generate_text(
    query: str,
    context: str,
    scope: str,
    is_first_message: bool = True,
    conversation_history: Optional[list] = None,
    used_web: bool = False,
    api_key: str = "",
) -> dict:
    """Sinh câu trả lời với đầy đủ ngữ cảnh và cơ chế fallback key & fallback model."""
    is_groq = not settings.LLM_MODEL.startswith("models/")
    primary_model = settings.LLM_MODEL
    fallback_model = settings.LLM_FALLBACK_MODEL

    role_name = "Trường Đại học Công nghệ Thông tin (UIT)" if scope == "uit" else "Khoa Công nghệ Phần mềm (CNPM) - Trường UIT"
    history_block = _build_history_block(conversation_history or [])
    context_note = "Nguồn: Website UIT (Real-time)." if used_web else "Nguồn: Dữ liệu nội bộ UIT."

    sys_instruct = f"""Bạn là trợ lý AI chuyên nghiệp của {role_name}.
Nhiệm vụ: Trả lời CHI TIẾT và CHÍNH XÁC dựa trên tài liệu.
Quy tắc:
1. Chỉ khi hoàn toàn không tìm thấy thông tin liên quan trong tài liệu, hãy trả lời chính xác: "Dạ, hiện tại dữ liệu của mình chưa cập nhật thông tin chi tiết về vấn đề này." Nếu tài liệu có thông tin (kể cả thông tin cũ/lịch sử), hãy trả lời dựa trên đó và tuyệt đối KHÔNG tự ý thêm câu phủ nhận, từ chối hoặc cảnh báo thiếu dữ liệu ở cuối.
2. Luôn xưng "mình" và gọi "bạn", trả lời thân thiện và tự nhiên. Sau 
3. {"Chào bạn!" if is_first_message else "Đi thẳng vào nội dung, không chào lại."}. Không ghi Chào bạn sau câu hỏi thứ nhất ở mỗi chatbot.
4. Nếu người dùng hỏi về Hiệu trưởng nhưng trong tài liệu chỉ có thông tin về Phó Hiệu trưởng phụ trách (ví dụ: PGS. TS. Nguyễn Tấn Trần Minh Khang), hãy giải thích rõ là hiện tại trường chưa có Hiệu trưởng mới mà đang được điều hành bởi Phó Hiệu trưởng phụ trách để hỗ trợ người dùng tốt nhất.
5. Tuyệt đối KHÔNG bao gồm các đường dẫn, liên kết (URL/link như http://..., https://..., forms.gle, tinyurl,...) trong câu trả lời vì khả năng cao đây là các link đã hết hạn hoặc bị hỏng (link chết). Hãy chỉ mô tả thông tin chung bằng văn bản hoặc hướng dẫn người dùng tự tìm kiếm trên trang web chính thức mà không cung cấp URL cụ thể.
6. ĐIỀU CHỈNH ĐỘ DÀI THEO CÂU HỎI — không mặc định dài, cũng không mặc định ngắn. Phân loại trước khi viết:
   - **Câu hỏi factoid / xác nhận (Có–Không, một con số, một cái tên, một ngày, một địa chỉ, một viết tắt):** trả lời NGẮN GỌN 1–3 câu (~20–60 từ). Vào thẳng đáp án ở câu đầu, kèm 1 câu ngữ cảnh tối thiểu nếu cần. Không liệt kê, không mở bài, không kết bài. Ví dụ: "Hiệu trưởng hiện tại là ai?", "UIT thành lập năm nào?", "Khoa CNPM có bao nhiêu ngành?".
   - **Câu hỏi quy trình / hướng dẫn ngắn / so sánh nhỏ:** TRUNG BÌNH 80–180 từ. Có thể dùng 3–6 gạch đầu dòng nếu thực sự là các bước.
   - **Câu hỏi mở / giải thích / mô tả toàn cảnh / "kể về" / "có những gì" / "như thế nào":** CHI TIẾT 200–500 từ, triển khai ý rõ ràng, gạch đầu dòng hoặc đoạn ngắn.
   - **Câu hỏi storytelling (xem rule 8):** 250–500 từ theo cấu trúc kể chuyện.
   Nguyên tắc chung: chỉ kéo dài khi tài liệu thực sự có nội dung để kéo dài; nếu tài liệu mỏng, trả lời đúng phạm vi tài liệu rồi dừng. KHÔNG nhồi nhét, KHÔNG lặp ý, KHÔNG kết bài kiểu "Hy vọng câu trả lời giúp được bạn". Tự hỏi trước khi viết: "Người dùng cần 1 dòng hay 1 đoạn?".
7. BẮT BUỘC trình bày dưới dạng bảng Markdown (GFM) trong các trường hợp sau:
   - Câu hỏi liên quan đến điểm số / điểm chuẩn / điểm sàn / điểm trúng tuyển / học bổng theo điểm / quy đổi điểm / thang điểm / điểm rèn luyện.
   - Câu hỏi về danh sách môn học, tín chỉ, học phí, lịch học, lịch thi, chương trình đào tạo theo kỳ/năm, so sánh ngành/khoa, mốc thời gian (deadline, tuyển sinh).
   - Khi TÀI LIỆU gốc chứa bảng (dấu hiệu: nhiều dòng có `|`, header rows, hoặc dữ liệu dạng cột) — phải tái hiện lại bằng bảng Markdown, KHÔNG được flatten thành đoạn văn.
   Cú pháp bảng phải đúng GFM:
   ```
   | Cột 1 | Cột 2 | Cột 3 |
   |-------|-------|-------|
   | ...   | ...   | ...   |
   ```
   Đặt bảng trong field `answer` của JSON, dùng `\n` để xuống dòng giữa các hàng. Trước/sau bảng có thể kèm 1–2 câu mô tả ngắn.
8. CHẾ ĐỘ KỂ CHUYỆN (storytelling): Khi câu hỏi chứa các từ khoá như "kể", "kể câu chuyện", "storytelling", "dấu mốc", "cột mốc", "highlight", "hành trình", "chương" (hoặc người dùng hỏi về một năm/giai đoạn cụ thể trong lịch sử Trường/Khoa), hãy trả lời theo cấu trúc tường thuật giàu cảm xúc thay vì gạch đầu dòng khô khan:
   - **Mở màn (1 đoạn ngắn):** dựng một khung cảnh gợi hình — thời gian, không gian, không khí của giai đoạn đó. Có thể dùng câu mô tả cảm giác ("Sài Gòn năm 2006, …").
   - **Bối cảnh & nhân vật:** nêu hoàn cảnh, những con người/đơn vị đã làm nên cột mốc, lý do nó ra đời.
   - **Bước ngoặt & điểm nhấn (highlights):** kể chi tiết 2–4 điểm nhấn quan trọng nhất, có con số, sự kiện, tên gọi cụ thể trích từ TÀI LIỆU. Có thể dùng các tiểu mục in đậm `**Tên highlight**` ngắn gọn.
   - **Tiếng vọng (ý nghĩa):** kết bằng 1–2 câu nói về việc cột mốc đó mở đường cho điều gì về sau, vì sao nó đáng nhớ.
   Văn phong: ấm áp, có nhịp, dùng hình ảnh và động từ mạnh; vẫn xưng "mình – bạn"; tuyệt đối KHÔNG bịa số liệu/sự kiện ngoài TÀI LIỆU — nếu thiếu chi tiết thì kể bằng những gì có và nói rõ "phần còn lại của câu chuyện vẫn đang được kể tiếp". Độ dài 250–500 từ. Không cần bảng trong chế độ này trừ khi người dùng đặc biệt yêu cầu so sánh.
Định dạng JSON: {{"answer": "...", "suggestions": ["...", "...", "..."]}}"""

    prompt = f"{history_block}\n\n{context_note}\nTÀI LIỆU:\n{context}\n\nCÂU HỎI:\n{query}"

    def _call_gemini(target_key, model_name):
        from google.genai import types
        client = _get_client(target_key)
        
        backoff_delays = [1, 2, 4]
        max_attempts = len(backoff_delays) + 1
        for attempt in range(max_attempts):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=sys_instruct,
                        temperature=settings.TEMPERATURE,
                        max_output_tokens=settings.MAX_TOKENS,
                        response_mime_type="application/json",
                    ),
                )
                raw = response.text.strip()
                if "```json" in raw:
                    raw = raw.split("```json")[1].split("```")[0].strip()
                elif "```" in raw:
                    raw = raw.split("```")[1].split("```")[0].strip()
                return json.loads(raw)
            except Exception as e:
                err_str = str(e).lower()
                is_429 = "429" in err_str or "resource_exhausted" in err_str or "too many requests" in err_str
                if is_429 and attempt < len(backoff_delays):
                    delay = backoff_delays[attempt]
                    app_logger.warning(
                        f"Gemini API 429 (Attempt {attempt+1}/{max_attempts}). "
                        f"Retrying in {delay}s..."
                    )
                    time.sleep(delay)
                    continue
                raise e

    def _call_groq(target_key, model_name):
        import requests
        if not target_key:
            raise RuntimeError("Không có API Key Groq nào khả dụng.")
        headers = {
            "Authorization": f"Bearer {target_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": sys_instruct},
                {"role": "user", "content": prompt}
            ],
            "temperature": settings.TEMPERATURE,
            "max_completion_tokens": settings.MAX_TOKENS,
            "response_format": {"type": "json_object"}
        }
        if "qwen" in model_name.lower() or "gpt-oss" in model_name.lower():
            payload["reasoning_format"] = "hidden"
            
        url = "https://api.groq.com/openai/v1/chat/completions"
        
        backoff_delays = [1, 2, 4]
        max_attempts = len(backoff_delays) + 1
        for attempt in range(max_attempts):
            try:
                response = requests.post(url, headers=headers, json=payload, timeout=30)
                response.raise_for_status()
                res_data = response.json()
                raw = res_data["choices"][0]["message"]["content"].strip()
                if "```json" in raw:
                    raw = raw.split("```json")[1].split("```")[0].strip()
                elif "```" in raw:
                    raw = raw.split("```")[1].split("```")[0].strip()
                return json.loads(raw)
            except Exception as e:
                is_429 = False
                if isinstance(e, requests.exceptions.HTTPError):
                    is_429 = (e.response.status_code == 429)
                else:
                    is_429 = "429" in str(e) or "too many requests" in str(e).lower()
                
                if is_429 and attempt < len(backoff_delays):
                    delay = backoff_delays[attempt]
                    app_logger.warning(
                        f"Groq API 429 (Attempt {attempt+1}/{max_attempts}). "
                        f"Retrying in {delay}s..."
                    )
                    time.sleep(delay)
                    continue
                raise e

    def _call_groq_with_fallback_keys(keys: list, model_name: str):
        """Thử lần lượt các key trong danh sách cho đến khi thành công."""
        last_err = None
        for i, key in enumerate(keys):
            try:
                app_logger.info(f"Đang thử Groq Key thứ {i+1}/{len(keys)} cho model {model_name}...")
                return _call_groq(key, model_name)
            except Exception as e:
                last_err = e
                is_429 = "429" in str(e) or "too many requests" in str(e).lower() or "resource_exhausted" in str(e).lower()
                app_logger.warning(f"Thử Groq Key thứ {i+1}/{len(keys)} thất bại: {e}")
                # Nếu không phải key cuối cùng và gặp lỗi 429, ta có thể nghỉ ngắn trước khi thử key tiếp theo
                if i < len(keys) - 1 and is_429:
                    cooldown = random.uniform(0.3, 0.8)
                    app_logger.info(f"Cooldown {cooldown:.2f}s trước khi chuyển sang key tiếp theo...")
                    time.sleep(cooldown)
        raise last_err

    data = None
    last_err = None

    try:
        # Xác định api_key có phải key của user cung cấp từ header hay không
        server_keys = set(settings.groq_api_keys) | {settings.GOOGLE_API_KEY, "", "your-key-here"}
        is_user_key = api_key not in server_keys

        if is_groq:
            # Lấy danh sách key để thử
            user_key = api_key if (is_user_key and api_key.startswith("gsk_")) else ""
            server_keys_list = settings.groq_api_keys
            
            # Khởi tạo danh sách các key cho model chính
            primary_keys = [user_key] if user_key else []
            primary_keys.extend(server_keys_list)
            
            try:
                app_logger.info(f"Đang gọi LLM chính (Groq: {primary_model})")
                data = _call_groq_with_fallback_keys(primary_keys, primary_model)
            except Exception as e:
                last_err = e
                app_logger.warning(f"Toàn bộ key cho LLM chính {primary_model} đều thất bại: {e}")
                is_429 = "429" in str(e) or "too many requests" in str(e).lower() or "resource_exhausted" in str(e).lower()
                
                # Nếu lỗi, thử model dự phòng (fallback_model)
                if data is None and fallback_model:
                    if is_429:
                        cooldown = random.uniform(0.5, 1.5)
                        app_logger.info(f"Phát hiện 429. Cooldown {cooldown:.2f}s trước khi gọi fallback model {fallback_model}...")
                        time.sleep(cooldown)
                    
                    fallback_keys = [user_key] if user_key else []
                    fallback_keys.extend(server_keys_list)
                    
                    try:
                        app_logger.info(f"Đang gọi LLM dự phòng (Groq: {fallback_model})")
                        data = _call_groq_with_fallback_keys(fallback_keys, fallback_model)
                        last_err = None
                    except Exception as e3:
                        last_err = e3
                        app_logger.error(f"Toàn bộ key cho LLM dự phòng {fallback_model} đều thất bại: {e3}")
                        is_429 = "429" in str(e3) or "too many requests" in str(e3).lower() or "resource_exhausted" in str(e3).lower()

            # Nếu toàn bộ chuỗi Groq lỗi, thử fallback chéo sang Gemini (nếu có key)
            if data is None and settings.GOOGLE_API_KEY:
                if is_429:
                    cooldown = random.uniform(0.5, 1.5)
                    app_logger.info(f"Phát hiện 429. Cooldown {cooldown:.2f}s trước khi fallback chéo sang Gemini...")
                    time.sleep(cooldown)
                gemini_models = ["models/gemini-2.5-flash", "models/gemini-2.5-flash-lite"]
                for gemini_model in gemini_models:
                    try:
                        app_logger.info(f"⚠️ Groq lỗi hoàn toàn (429/Error) → Kích hoạt fallback chéo sang Gemini ({gemini_model})")
                        gemini_key = api_key if (is_user_key and not api_key.startswith("gsk_")) else settings.GOOGLE_API_KEY
                        data = _call_gemini(gemini_key, gemini_model)
                        last_err = None
                        break
                    except Exception as e4:
                        last_err = e4
                        app_logger.error(f"Lỗi fallback chéo sang Gemini ({gemini_model}): {e4}")
                        is_429 = "429" in str(e4) or "too many requests" in str(e4).lower() or "resource_exhausted" in str(e4).lower()
        else:
            # 1. Thử Gemini chính với User Key hoặc Server Key
            user_key = api_key if (is_user_key and not api_key.startswith("gsk_")) else ""
            target_key = user_key or settings.GOOGLE_API_KEY
            key_type = "User Gemini Key" if user_key else "Server Gemini Key"
            
            try:
                app_logger.info(f"Đang gọi LLM chính (Gemini: {primary_model}) bằng {key_type}")
                data = _call_gemini(target_key, primary_model)
            except Exception as e:
                last_err = e
                app_logger.warning(f"Lỗi Gemini chính {primary_model} ({key_type}): {e}")
                is_429 = "429" in str(e) or "too many requests" in str(e).lower() or "resource_exhausted" in str(e).lower()
                
                # 2. Nếu dùng User Key và lỗi, thử lại Gemini chính bằng Server Key
                if user_key and user_key != settings.GOOGLE_API_KEY:
                    if is_429:
                        cooldown = random.uniform(0.5, 1.5)
                        app_logger.info(f"Phát hiện 429. Cooldown {cooldown:.2f}s trước khi gọi Server Key...")
                        time.sleep(cooldown)
                    try:
                        app_logger.info(f"Thử lại LLM chính (Gemini: {primary_model}) bằng Server Gemini Key")
                        data = _call_gemini(settings.GOOGLE_API_KEY, primary_model)
                        last_err = None
                    except Exception as e2:
                        last_err = e2
                        app_logger.warning(f"Lỗi Gemini chính với Server Key: {e2}")
                        is_429 = "429" in str(e2) or "too many requests" in str(e2).lower() or "resource_exhausted" in str(e2).lower()
                
                # 3. Nếu vẫn lỗi, thử Gemini dự phòng
                if data is None and fallback_model and fallback_model.startswith("models/"):
                    if is_429:
                        cooldown = random.uniform(0.5, 1.5)
                        app_logger.info(f"Phát hiện 429. Cooldown {cooldown:.2f}s trước khi gọi fallback model {fallback_model}...")
                        time.sleep(cooldown)
                    fb_key = settings.GOOGLE_API_KEY or target_key
                    try:
                        app_logger.info(f"Đang gọi LLM dự phòng (Gemini: {fallback_model})")
                        data = _call_gemini(fb_key, fallback_model)
                        last_err = None
                    except Exception as e3:
                        last_err = e3
                        app_logger.error(f"Lỗi Gemini dự phòng {fallback_model}: {e3}")
                        is_429 = "429" in str(e3) or "too many requests" in str(e3).lower() or "resource_exhausted" in str(e3).lower()

            # 4. Nếu toàn bộ chuỗi Gemini lỗi, thử fallback chéo sang Groq (nếu có key)
            if data is None and settings.GROQ_API_KEY:
                if is_429:
                    cooldown = random.uniform(0.5, 1.5)
                    app_logger.info(f"Phát hiện 429. Cooldown {cooldown:.2f}s trước khi fallback chéo sang Groq...")
                    time.sleep(cooldown)
                groq_models = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
                for groq_model in groq_models:
                    try:
                        app_logger.info(f"⚠️ Gemini lỗi hoàn toàn (429/Error) → Kích hoạt fallback chéo sang Groq ({groq_model})")
                        groq_key = api_key if (is_user_key and api_key.startswith("gsk_")) else ""
                        groq_keys = [groq_key] if groq_key else []
                        groq_keys.extend(settings.groq_api_keys)
                        data = _call_groq_with_fallback_keys(groq_keys, groq_model)
                        last_err = None
                        break
                    except Exception as e4:
                        last_err = e4
                        app_logger.error(f"Lỗi fallback chéo sang Groq ({groq_model}): {e4}")
                        is_429 = "429" in str(e4) or "too many requests" in str(e4).lower() or "resource_exhausted" in str(e4).lower()

        if data is not None:
            return {
                "answer": str(data.get("answer", _FALLBACK["answer"])),
                "suggestions": list(data.get("suggestions", _FALLBACK["suggestions"]))[:3],
            }
    except Exception as general_err:
        app_logger.error(f"Lỗi tổng quát trong generate_text: {general_err}")
        last_err = general_err

    app_logger.error(f"Toàn bộ chuỗi gọi LLM thất bại. Lỗi cuối cùng: {last_err}")
    return _FALLBACK
