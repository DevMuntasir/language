FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app app
RUN useradd --create-home --uid 10002 translator && chown -R translator:translator /app
USER translator
CMD ["python", "-m", "app.agent", "start"]
