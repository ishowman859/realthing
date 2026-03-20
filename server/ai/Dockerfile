FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app.py /app/app.py
COPY models /app/models

ENV MODEL_PATH=/app/models/silent_face.onnx
ENV MODEL_NAME=Silent-Face-Anti-Spoofing
ENV MODEL_INPUT_SIZE=80
ENV MODEL_NORM_MODE=minus1_1
ENV SPOOF_THRESHOLD=0.5

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
