from fastapi import FastAPI

app = FastAPI(title="CRMAI Auth Service")


@app.get("/api/v1/auth/health")
def health():
    return {"status": "ok", "service": "auth"}
