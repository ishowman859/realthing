# Verity Anti-Spoof Inference

학습된 `Silent-Face-Anti-Spoofing` ONNX 모델을 로드해 추론하는 서비스입니다.

## 1) 모델 파일 넣기

다음 경로에 ONNX 파일을 둡니다.

- `server/ai/models/silent_face.onnx`

다른 파일명을 쓰려면 `MODEL_PATH` 환경변수를 바꾸세요.

## 2) 로컬 실행

```bash
cd server/ai
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export MODEL_PATH=./models/silent_face.onnx
uvicorn app:app --host 0.0.0.0 --port 8001
```

## 3) API

- `GET /health`
- `POST /predict`
  - body: `{ "imageBase64": "..." }`
  - response: `{ "spoofProbability": 0.0~1.0, "model": "Silent-Face-Anti-Spoofing" }`

## 4) 서버 연동

`server/.env`에 아래를 설정하면 앱 -> server -> ai 추론이 연결됩니다.

```env
SILENT_FACE_API_URL=http://localhost:8001/predict
```

