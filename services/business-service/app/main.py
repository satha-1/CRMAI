from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.v1.router import api_router
from app.core.errors import register_error_handlers

app = FastAPI(title="CRMAI Business Service")
register_error_handlers(app)
app.include_router(api_router)


# Kong has no route to this. Docker uses it to check the service and its database.
@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "business"}
