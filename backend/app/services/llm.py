"""
llm.py — Gemini LLM Service (v2.6)

Tính năng:
  - Hỗ trợ hội thoại đa lượt (Conversation History).
  - Tự động fallback sang Server Key nếu User Key bị lỗi.
  - Prompt chuyên nghiệp đại diện cho UIT.
  - [v2.6] Phát hiện response bị cắt do token limit → tự động tóm gọn lại.
"""

import json
import re
from app.config import settings
from app.utils.logger import app_logger
from typing import Optional

_FALLBACK = {
    "answer": "Dạ, mình đang gặp chút sự cố kết nối AI. Bạn thử lại sau nhé!",
    "suggestions": ["Lịch sử UIT?", "Thành tựu UIT?", "Đời sống sinh viên?"],
}

# Các ký tự kết thúc câu hợp lệ
_SENTENCE_ENDINGS = set('.!?。…')
# Ký tự thường xuất hiện khi bị cắt giữa chừng
_TRUNCATION_SIGNALS = set(',;:')


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


def _is_response_truncated(text: str) -> bool:
    """
    Phát hiện response bị cắt giữa chừng do token limit.

    Dấu hiệu bị cắt:
      - Kết thúc bằng dấu phẩy, chấm phẩy, dấu hai chấm (đang liệt kê)
      - Kết thúc bằng chữ/số (câu chưa xong)
      - Đang trong bảng markdown (| ở cuối)
      - Đang trong code block (``` chưa đóng)
      - Kết thúc bằng dấu gạch ngang đơn (list item chưa xong)
    """
    if not text:
        return False

    stripped = text.strip()
    if not stripped:
        return False

    last_char = stripped[-1]

    # Kết thúc hợp lệ
    if last_char in _SENTENCE_ENDINGS:
        return False

    # Các dấu hiệu rõ ràng bị cắt
    if last_char in _TRUNCATION_SIGNALS:
        return True

    # Kết thúc bằng chữ cái hoặc số (câu chưa kết thúc)
    if last_char.isalnum():
        return True

    # Đang trong code block (số lẻ dấu ```)
    if stripped.count('```') % 2 != 0:
        return True

    # Kết thúc trong bảng markdown
    lines = stripped.splitlines()
    last_line = lines[-1].strip() if lines else ''
    if last_line.endswith('|') and last_line.startswith('|'):
        return True

    # Kết thúc bằng gạch ngang list item
    if re.match(r'^[-*+]\s', last_line) and not last_line.endswith(('.', '!', '?')):
        return True

    return False


def _compact_truncated_response(
    original_answer: str,
    query: str,
    api_key: str,
    scope: str,
) -> str:
    """
    Khi phát hiện response bị cắt, gọi LLM với token ít hơn để tóm gọn lại.
    Chỉ dùng ~60% token budget để đảm bảo câu trả lời hoàn chỉnh.
    """
    from google.genai import types

    compact_tokens = max(400, int(settings.MAX_TOKENS * 0.6))
    role_name = (
        "Trường Đại học Công nghệ Thông tin (UIT)"
        if scope == "uit"
        else "Khoa Công nghệ Phần mềm (CNPM) - Trường UIT"
    )

    sys_instruct = (
        f"Bạn là trợ lý AI của {role_name}. "
        "Nhiệm vụ: Tóm gọn câu trả lời sau đây thành phiên bản ngắn hơn nhưng HOÀN CHỈNH. "
        "Câu trả lời PHẢI kết thúc bằng dấu câu đầy đủ (chấm, chấm hỏi, hoặc chấm than). "
        "Giữ lại các thông tin quan trọng nhất. "
        "Trả lời bằng JSON: {\"answer\": \"...\", \"suggestions\": [\"...\", \"...\", \"...\"]}"
    )

    compact_prompt = (
        f"Câu hỏi gốc: {query}\n\n"
        f"Câu trả lời bị cắt cần tóm gọn:\n{original_answer}\n\n"
        "Hãy viết lại ngắn hơn, hoàn chỉnh, không bị cắt giữa chừng."
    )

    try:
        client = _get_client(api_key)
        response = client.models.generate_content(
            model=settings.LLM_MODEL,
            contents=compact_prompt,
            config=types.GenerateContentConfig(
                system_instruction=sys_instruct,
                temperature=0.1,
                max_output_tokens=compact_tokens,
                response_mime_type="application/json",
            ),
        )
        raw = response.text.strip()
        if "```json" in raw:
            raw = raw.split("```json")[1].split("```")[0].strip()
        elif "```" in raw:
            raw = raw.split("```")[1].split("```")[0].strip()
        data = json.loads(raw)
        compacted = str(data.get("answer", "")).strip()
        if compacted and not _is_response_truncated(compacted):
            app_logger.info(f"[LLM] Compact thành công: {len(compacted)} chars")
            return compacted, list(data.get("suggestions", _FALLBACK["suggestions"]))[:3]
    except Exception as e:
        app_logger.warning(f"[LLM] Compact thất bại: {e}")

    # Fallback: cắt tại câu cuối cùng hoàn chỉnh
    return _trim_to_last_sentence(original_answer), _FALLBACK["suggestions"]


def _trim_to_last_sentence(text: str) -> str:
    """
    Fallback: cắt text tại dấu câu hoàn chỉnh cuối cùng tìm được.
    """
    # Tìm vị trí dấu câu cuối cùng
    for i in range(len(text) - 1, max(len(text) - 300, 0), -1):
        if text[i] in _SENTENCE_ENDINGS:
            trimmed = text[:i + 1].strip()
            if len(trimmed) > 50:
                return trimmed + "\n\n*(Câu trả lời đã được rút gọn để phù hợp giới hạn.)*"
    return text.strip()


def generate_text(
    query: str,
    context: str,
    scope: str,
    is_first_message: bool = True,
    conversation_history: Optional[list] = None,
    used_web: bool = False,
    api_key: str = "",
) -> dict:
    """Sinh câu trả lời với đầy đủ ngữ cảnh và cơ chế fallback key."""
    from google.genai import types

    role_name = (
        "Trường Đại học Công nghệ Thông tin (UIT)"
        if scope == "uit"
        else "Khoa Công nghệ Phần mềm (CNPM) - Trường UIT"
    )
    history_block = _build_history_block(conversation_history or [])
    context_note = "Nguồn: Website UIT (Real-time)." if used_web else "Nguồn: Dữ liệu nội bộ UIT."

    # Ước tính số từ tối đa (~1 token ≈ 1.3 từ tiếng Việt)
    approx_max_words = int(settings.MAX_TOKENS * 0.7)

    sys_instruct = f"""Bạn là trợ lý AI chuyên nghiệp của {role_name}.
Nhiệm vụ: Trả lời CHI TIẾT và CHÍNH XÁC dựa trên tài liệu.
Quy tắc:
1. Nếu không có thông tin, trả lời đúng: "Dạ, hiện tại dữ liệu của mình chưa cập nhật thông tin chi tiết về vấn đề này."
2. Luôn xưng "mình" và gọi "bạn", trả lời thân thiện và tự nhiên.
3. {"Chào bạn!" if is_first_message else "Đi thẳng vào nội dung, không chào lại."}
4. Khi câu trả lời liên quan đến yếu tố "điểm" (điểm chuẩn, điểm sàn, điểm xét tuyển, điểm quy đổi, GPA, thang điểm...), BẮT BUỘC trình bày các số liệu điểm dưới dạng bảng Markdown (dùng cú pháp | cột | cột |), không trình bày thành đoạn văn liền mạch.
5. Nếu TÀI LIỆU chứa thông tin ở dạng bảng Markdown, phải giữ nguyên cấu trúc bảng và trình bày lại dưới dạng bảng Markdown trong câu trả lời, không chuyển bảng thành đoạn văn.
6. Trong trường "answer" của JSON, ký tự xuống dòng phải được escape thành \\n để JSON hợp lệ; bảng Markdown phải có dòng trống trước bảng.
7. QUAN TRỌNG VỀ ĐỘ DÀI: Câu trả lời phải vừa đủ, không quá {approx_max_words} từ. Luôn kết thúc bằng dấu câu hoàn chỉnh (. hoặc ! hoặc ?). Nếu không đủ chỗ, hãy tóm tắt và kết thúc đúng câu, tuyệt đối không bỏ dở giữa chừng.
Định dạng JSON: {{"answer": "...", "suggestions": ["...", "...", "..."]}}"""

    prompt = f"{history_block}\n\n{context_note}\nTÀI LIỆU:\n{context}\n\nCÂU HỎI:\n{query}"

    def _call_gemini(target_key):
        client = _get_client(target_key)
        response = client.models.generate_content(
            model=settings.LLM_MODEL,
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

    def _process_result(data: dict, used_key: str) -> dict:
        answer = str(data.get("answer", _FALLBACK["answer"]))
        suggestions = list(data.get("suggestions", _FALLBACK["suggestions"]))[:3]

        # [v2.6] Kiểm tra và fix truncation
        if _is_response_truncated(answer):
            app_logger.warning(
                f"[LLM] Response bị cắt ({len(answer)} chars). Đang compact..."
            )
            answer, suggestions = _compact_truncated_response(
                original_answer=answer,
                query=query,
                api_key=used_key,
                scope=scope,
            )

        return {"answer": answer, "suggestions": suggestions}

    try:
        target_key = api_key or settings.GOOGLE_API_KEY
        key_type = "User Key" if api_key else "Server Key"
        app_logger.info(f"Đang gọi LLM bằng {key_type} (đuôi: ...{target_key[-4:]})")

        data = _call_gemini(api_key)
        return _process_result(data, api_key or settings.GOOGLE_API_KEY)

    except Exception as e:
        # Fallback sang Server Key nếu lỗi và đang dùng User Key
        if api_key and api_key != settings.GOOGLE_API_KEY:
            app_logger.warning(f"User API Key lỗi, thử lại bằng Server Key... {e}")
            try:
                data = _call_gemini(settings.GOOGLE_API_KEY)
                return _process_result(data, settings.GOOGLE_API_KEY)
            except Exception as e2:
                app_logger.error(f"Cả 2 Key đều lỗi LLM: {e2}")

        app_logger.error(f"Lỗi LLM: {e}")
        return _FALLBACK
