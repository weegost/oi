import time
from functools import lru_cache
from typing import Literal

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from .config import settings


class LLMNotConfigured(RuntimeError):
    pass


# Client 必須保留參照；臨時建立的 Client 被回收時會關閉連線
@lru_cache
def get_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise LLMNotConfigured("尚未設定 GEMINI_API_KEY，請在專案根目錄的 .env 填入。")
    # 逾時單位為毫秒；避免模型忙碌時請求無限等待
    return genai.Client(api_key=settings.gemini_api_key, http_options=types.HttpOptions(timeout=30_000))


RETRYABLE = {429, 500, 503, 504}


def _call(contents: str, config: types.GenerateContentConfig | None = None):
    """主模型忙碌時依序改用備援模型；回傳 (response, 實際使用的模型)。"""
    models = [settings.gemini_model, *settings.gemini_fallback_models]
    last_error: errors.APIError | None = None
    for i, model in enumerate(models):
        try:
            return get_client().models.generate_content(model=model, contents=contents, config=config), model
        except errors.APIError as e:
            if e.code not in RETRYABLE:
                raise
            last_error = e
            time.sleep(min(2**i, 4))
    assert last_error is not None
    raise last_error


def generate(prompt: str, system: str | None = None) -> tuple[str, str]:
    """回傳 (回覆文字, 實際使用的模型)。"""
    config = types.GenerateContentConfig(system_instruction=system) if system else None
    response, model = _call(prompt, config)
    return response.text or "", model


def generate_json[T: BaseModel](prompt: str, schema: type[T], system: str | None = None) -> T:
    """要求模型依 Pydantic schema 輸出結構化 JSON。"""
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_schema=schema,
    )
    response, _ = _call(prompt, config)
    if isinstance(response.parsed, schema):
        return response.parsed
    return schema.model_validate_json(response.text or "{}")


EmbedTask = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]


def embed(texts: list[str], task: EmbedTask, dim: int) -> list[list[float]]:
    """把多段文字轉成向量。每段要包成獨立的 Content，否則 gemini-embedding-2 會合併成一個向量。"""
    vectors: list[list[float]] = []
    for i in range(0, len(texts), 100):  # 單次請求上限 100 段
        batch = [types.Content(parts=[types.Part(text=t)]) for t in texts[i : i + 100]]
        r = get_client().models.embed_content(
            model=settings.gemini_embedding_model,
            contents=batch,
            config=types.EmbedContentConfig(task_type=task, output_dimensionality=dim),
        )
        vectors += [list(e.values or []) for e in r.embeddings or []]
    return vectors
