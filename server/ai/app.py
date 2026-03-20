import base64
import os
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import onnxruntime as ort


class PredictRequest(BaseModel):
    imageBase64: str


class PredictResponse(BaseModel):
    spoofProbability: float
    model: str


# [각주1] 학습된 ONNX 모델 경로를 환경변수로 받습니다.
MODEL_PATH = os.getenv("MODEL_PATH", "./models/silent_face.onnx")
MODEL_NAME = os.getenv("MODEL_NAME", "Silent-Face-Anti-Spoofing")
INPUT_SIZE = int(os.getenv("MODEL_INPUT_SIZE", "80"))
NORM_MODE = os.getenv("MODEL_NORM_MODE", "minus1_1")  # minus1_1 | zero_one
CONF_THRESHOLD = float(os.getenv("SPOOF_THRESHOLD", "0.5"))

if not os.path.exists(MODEL_PATH):
    raise RuntimeError(
        f"모델 파일을 찾을 수 없습니다: {MODEL_PATH}\n"
        "학습된 ONNX 파일을 server/ai/models/ 경로에 두고 MODEL_PATH를 맞춰주세요."
    )

session = ort.InferenceSession(
    MODEL_PATH,
    providers=["CPUExecutionProvider"],
)
input_meta = session.get_inputs()[0]
input_name = input_meta.name
input_shape = input_meta.shape  # e.g. [1,3,80,80] or [1,80,80,3]

app = FastAPI(title="Verity Anti-Spoof API", version="1.0.0")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "verity-anti-spoof",
        "model": MODEL_NAME,
        "modelPath": MODEL_PATH,
        "threshold": CONF_THRESHOLD,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    try:
        image = decode_image(payload.imageBase64)
        tensor = preprocess(image)
        raw = session.run(None, {input_name: tensor})
        spoof_prob = postprocess(raw)
        return PredictResponse(spoofProbability=spoof_prob, model=MODEL_NAME)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"추론 실패: {exc}") from exc


def decode_image(image_b64: str) -> np.ndarray:
    try:
        image_bytes = base64.b64decode(image_b64)
        np_buf = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("이미지 디코딩 실패")
        return image
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"잘못된 imageBase64 입력: {exc}") from exc


def preprocess(image_bgr: np.ndarray) -> np.ndarray:
    # [각주2] Silent-Face 계열 모델에서 흔한 전처리(리사이즈 + RGB + 정규화)를 적용합니다.
    img = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (INPUT_SIZE, INPUT_SIZE), interpolation=cv2.INTER_LINEAR)
    img = img.astype(np.float32) / 255.0
    if NORM_MODE == "minus1_1":
        img = (img - 0.5) / 0.5

    if len(input_shape) != 4:
        raise RuntimeError(f"지원하지 않는 입력 shape: {input_shape}")

    # shape이 NCHW인지 NHWC인지 자동 대응
    ch_first = input_shape[1] == 3 or input_shape[1] is None
    if ch_first:
        img = np.transpose(img, (2, 0, 1))  # HWC -> CHW
    tensor = np.expand_dims(img, axis=0).astype(np.float32)
    return tensor


def postprocess(outputs: list[np.ndarray]) -> float:
    # [각주3] 출력 형태(1 logit / 2 class logits)에 따라 spoof 확률을 안전하게 계산합니다.
    if not outputs:
        raise RuntimeError("모델 출력이 비어 있습니다.")
    out = np.array(outputs[0]).reshape(-1)
    if out.size == 1:
        # 단일 logit 또는 prob
        val = float(out[0])
        if val < 0.0 or val > 1.0:
            prob = 1.0 / (1.0 + np.exp(-val))  # sigmoid
        else:
            prob = val
    else:
        # 다중 클래스 로짓이면 class1(스푸핑) 확률 사용
        exps = np.exp(out - np.max(out))
        probs = exps / np.sum(exps)
        prob = float(probs[1] if probs.size > 1 else probs[0])

    prob = max(0.0, min(1.0, prob))
    return prob

