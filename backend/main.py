import os
import json
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from io import StringIO
import math
import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("Telemetry API initialized and ready to accept requests.")
    yield
    logger.info("Telemetry API shutting down.")


app = FastAPI(lifespan=lifespan)

MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024
ALLOWED_CSV_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
}

def get_allowed_origins():
    configured_origins = [
        origin.strip()
        for origin in os.getenv("FRONTEND_ORIGINS", os.getenv("FRONTEND_URL", "")).split(",")
        if origin.strip()
    ]

    fallback_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
    ]

    if configured_origins:
        return configured_origins

    logger.warning("No frontend origins configured. Falling back to local development origins.")
    return fallback_origins


allowed_origins = get_allowed_origins()

@app.get("/")
def root():
    return {"message": "Welcome to the dashboard"}


@app.get("/health")
def health():
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|26\.186\.17\.216)(:\d+)?$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

def validate_upload_file(file: UploadFile):
    filename = file.filename or ""
    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()

    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Unsupported file type. Please upload a CSV file.")

    if content_type and content_type not in ALLOWED_CSV_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file content type. Please upload a CSV file.")

async def read_upload_limited(file: UploadFile):
    contents = await file.read(MAX_UPLOAD_SIZE_BYTES + 1)

    if len(contents) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file is too large. Maximum size is 50 MB.")

    return contents

def split_upload_text(text):
    """Extract metadata and locate the telemetry CSV without copying every line."""
    metadata = {}
    cursor = 0
    line_number = 0

    while cursor < len(text):
        newline_index = text.find("\n", cursor)
        line_end = len(text) if newline_index == -1 else newline_index
        line = text[cursor:line_end].rstrip("\r")

        if line.strip().lower().startswith("time"):
            return metadata, cursor

        if line_number < 10 and "," in line:
            key, value = line.strip().split(",", 1)
            metadata[key.strip()] = value.strip()

        if newline_index == -1:
            break
        cursor = newline_index + 1
        line_number += 1

    raise ValueError("Telemetry header ('Time') not found in the file.")

def extract_vehicle_params(lines):
    if len(lines) < 13:
        raise ValueError("Vehicle parameters section is incomplete.")

    params = {}
    header = lines[10].strip().split(",")
    units = lines[11].strip().split(",")
    values = lines[12].strip().split(",")
    for h, u, v in zip(header, units, values):
        params[h] = {"unit": u, "value": v}
    return params

def extract_car_setup(lines):
    if len(lines) < 17:
        raise ValueError("Car setup section is incomplete.")

    setup = {}
    header = lines[14].strip().split(",")
    units = lines[15].strip().split(",")
    values = lines[16].strip().split(",")
    for h, u, v in zip(header, units, values):
        setup[h] = {"unit": u, "value": v}
    return setup

def load_telemetry_data(text, telemetry_start):
    """Load only the telemetry portion of an uploaded CSV into a DataFrame."""
    if telemetry_start >= len(text):
        raise ValueError("CSV file is empty.")

    try:
        telemetry_stream = StringIO(text)
        telemetry_stream.seek(telemetry_start)
        df = pd.read_csv(
            telemetry_stream,
            sep=",",
            engine="python",
            on_bad_lines="skip"
        )
    except pd.errors.ParserError as exc:
        logger.warning("CSV parser rejected uploaded telemetry file: %s", exc)
        raise ValueError("CSV file could not be parsed.") from exc

    # Clean column names
    df.columns = [c.strip() for c in df.columns]

    # Remove completely empty columns
    df.dropna(axis=1, how="all", inplace=True)

    if df.empty or len(df.columns) == 0:
        raise ValueError("CSV file does not contain telemetry rows.")

    return df

def stream_telemetry_response(file_name, car_name, track_name, df):
    """Serialize DataFrame rows with a bounded output buffer."""
    columns = list(df.columns)
    row_count = len(df)
    duration = df["time"].iloc[-1] if row_count else None
    duration_item = getattr(duration, "item", None)
    if callable(duration_item):
        duration = duration_item()
    metadata = {
        "Format": "AC pyTelemetry CSV",
        "Venue": track_name,
        "Vehicle": car_name,
        "Driver": "Ellis",
        "Sample Rate": "50",
        "Duration": duration,
    }
    header = {
        "file": file_name,
        "car": car_name,
        "track": track_name,
        "rows": row_count,
        "columns": columns,
    }

    yield json.dumps(header, separators=(",", ":"))[:-1].encode("utf-8")
    yield b',"data":['

    buffer = bytearray()
    first_record = True
    for row in df.itertuples(index=False, name=None):
        record = {
            column: _json_value(value)
            for column, value in zip(columns, row)
        }
        if not first_record:
            buffer.extend(b",")
        first_record = False
        buffer.extend(json.dumps(record, separators=(",", ":"), allow_nan=False).encode("utf-8"))

        if len(buffer) >= 64 * 1024:
            yield bytes(buffer)
            buffer.clear()

    if buffer:
        yield bytes(buffer)

    del df
    yield b"]"
    yield b',"metadata":'
    yield json.dumps(metadata, separators=(",", ":"), allow_nan=False).encode("utf-8")
    yield b"}"


def _json_value(value):
    """Convert pandas/numpy scalars to valid JSON values without retaining a row list."""
    value_item = getattr(value, "item", None)
    if callable(value_item):
        value = value_item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value

@app.post("/telemetry")
async def get_telemetry(file: UploadFile = File(...)):
    """
    Accepts a telemetry CSV file via upload and returns filtered data.
    """
    validate_upload_file(file)

    # 1. Read file stream from memory
    try:
        contents = await read_upload_limited(file)
        text = contents.decode("utf-8")
        del contents
    except HTTPException:
        raise
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Uploaded CSV file must be UTF-8 encoded.")
    except Exception:
        logger.exception("Failed to read uploaded telemetry file.")
        raise HTTPException(status_code=400, detail="Failed to read uploaded file.")

    # 2. Extract telemetry dataframe using memory-lines
    try:
        parsed_metadata, telemetry_start = split_upload_text(text)
        df = load_telemetry_data(text, telemetry_start)
        del text
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unexpected error while parsing uploaded telemetry file.")
        raise HTTPException(status_code=400, detail="CSV file could not be parsed.")

    # Ensure time column exists
    if len(df.columns) == 0:
        raise HTTPException(status_code=400, detail="CSV file does not contain telemetry columns.")

    if "time" not in df.columns:
        df.rename(columns={df.columns[0]: "time"}, inplace=True)

    # FORCE NUMERIC TIME
    df["time"] = pd.to_numeric(df["time"], errors="coerce")
    df.dropna(subset=["time"], inplace=True)

    if df.empty:
        raise HTTPException(status_code=400, detail="CSV file does not contain valid telemetry time values.")

    # Sort by time
    df.sort_values("time", inplace=True)
    df.reset_index(drop=True, inplace=True)

    # 3. Replace non-finite values in-place. Pandas serializes NaN as JSON null.
    df.replace([math.inf, -math.inf], math.nan, inplace=True)

    # 4. DYNAMICALLY EXTRACT METADATA FROM UPLOADED CSV
    # Check your CSV file structure; adjust keys below matching your CSV header labels
    car_name = parsed_metadata.get("Car") or parsed_metadata.get("Vehicle") or "Unknown Car"
    track_name = parsed_metadata.get("Track") or parsed_metadata.get("Venue") or "Unknown Track"

    return StreamingResponse(
        stream_telemetry_response(file.filename, car_name, track_name, df),
        media_type="application/json",
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "10000"))
    logger.info("Starting Telemetry API on 0.0.0.0:%d", port)
    uvicorn.run(app, host="0.0.0.0", port=port)
