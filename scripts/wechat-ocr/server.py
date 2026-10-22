"""Local-only PP-OCRv5 service. Images never leave this process."""

import asyncio
import io
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import AsyncIterator

os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from paddleocr import PaddleOCR
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("wechat-ocr")
worker_count = int(os.environ.get("WECHAT_OCR_WORKERS", "4"))
if not 1 <= worker_count <= 4:
    raise ValueError("WECHAT_OCR_WORKERS must be between 1 and 4")

workers = ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="wechat-ocr")
local = threading.local()
model_init_lock = threading.Lock()


def initialize(barrier: threading.Barrier) -> None:
    try:
        # Serialize model downloads; each inference thread still owns its predictor.
        with model_init_lock:
            local.model = PaddleOCR(
                lang="ch",
                ocr_version="PP-OCRv5",
                text_detection_model_name="PP-OCRv5_server_det",
                text_recognition_model_name="PP-OCRv5_server_rec",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                device="cpu",
                cpu_threads=2,
                enable_mkldnn=False,
            )
        barrier.wait(timeout=600)
    except Exception:
        barrier.abort()
        raise


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    loop = asyncio.get_running_loop()
    barrier = threading.Barrier(worker_count)
    try:
        await asyncio.gather(
            *(loop.run_in_executor(workers, initialize, barrier) for _ in range(worker_count))
        )
        yield
    finally:
        workers.shutdown(wait=True, cancel_futures=True)


app = FastAPI(lifespan=lifespan)
slots = asyncio.Semaphore(worker_count + 2)


def recognize(data: bytes) -> dict[str, object]:
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError("OCR image exceeds 20 million pixels")
        # PaddleOCR's ndarray input follows OpenCV's BGR channel order.
        pixels = np.asarray(image.convert("RGB"))[:, :, ::-1].copy()
    boxes = []
    for result in local.model.predict(pixels):
        for text, score, polygon in zip(
            result["rec_texts"], result["rec_scores"], result["rec_polys"], strict=True
        ):
            points = np.asarray(polygon)
            boxes.append(
                {
                    "text": str(text),
                    "confidence": float(score),
                    "box": [
                        float(points[:, 0].min()),
                        float(points[:, 1].min()),
                        float(points[:, 0].max()),
                        float(points[:, 1].max()),
                    ],
                }
            )
    return {"boxes": boxes}


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ready": True, "model": "PP-OCRv5_server", "workers": worker_count}


@app.post("/ocr")
async def ocr(request: Request) -> dict[str, object]:
    if request.headers.get("content-type", "").split(";")[0] != "image/png":
        raise HTTPException(status_code=415, detail="Expected image/png")
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 16 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="OCR image exceeds 16 MB")
    try:
        async with slots:
            return await asyncio.get_running_loop().run_in_executor(workers, recognize, bytes(data))
    except (UnidentifiedImageError, ValueError, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        logger.exception("PaddleOCR inference failed")
        raise HTTPException(status_code=500, detail="Local PaddleOCR inference failed; see service logs") from error
