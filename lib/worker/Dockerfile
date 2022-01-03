# PyTroch GPU Enabled Inference Image
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt ./

RUN apt-get update && \
    apt-get upgrade -y && \
    pip install -r requirements.txt

COPY . .