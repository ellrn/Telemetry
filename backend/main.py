import os
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from io import StringIO
import math
import logging
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
logger = logging.getLogger(__name__)

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

def extract_metadata(lines):
    metadata = {}
    for line in lines[:10]:
        if "," in line:
            key, value = line.strip().split(",", 1)
            metadata[key.strip()] = value.strip()
    return metadata

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

def load_telemetry_data_from_lines(lines):
    """Finds telemetry data from split text lines in memory."""
    if not lines:
        raise ValueError("CSV file is empty.")

    start_idx = None
    for i, line in enumerate(lines):
        if line.strip().lower().startswith("time"):
            start_idx = i
            break

    if start_idx is None:
        raise ValueError("Telemetry header ('Time') not found in the file.")

    telemetry_block = "\n".join(lines[start_idx:])

    try:
        df = pd.read_csv(
            StringIO(telemetry_block),
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
    df = df.dropna(axis=1, how="all")

    if df.empty or len(df.columns) == 0:
        raise ValueError("CSV file does not contain telemetry rows.")

    return df

def make_json_safe(obj):
    """Replace NaN / Inf with None"""
    if isinstance(obj, dict):
        return {k: make_json_safe(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_safe(v) for v in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj

@app.post("/telemetry")
async def get_telemetry(file: UploadFile = File(...)):
    """
    Accepts a telemetry CSV file via upload and returns filtered data.
    """
    validate_upload_file(file)

    # 1. Read file stream from memory
    try:
        contents = await read_upload_limited(file)
        # Decode binary bytes to a clean list of text lines
        lines = contents.decode("utf-8").splitlines()
    except HTTPException:
        raise
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Uploaded CSV file must be UTF-8 encoded.")
    except Exception:
        logger.exception("Failed to read uploaded telemetry file.")
        raise HTTPException(status_code=400, detail="Failed to read uploaded file.")

    # 2. Extract telemetry dataframe using memory-lines
    try:
        df = load_telemetry_data_from_lines(lines)
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
    df = df.dropna(subset=["time"])

    if df.empty:
        raise HTTPException(status_code=400, detail="CSV file does not contain valid telemetry time values.")

    # Sort by time
    df = df.sort_values("time").reset_index(drop=True)

    # 3. CONVERT TO JSON
    table_data = df.to_dict(orient="records")

    table_data_safe = []
    for row in table_data:
        clean_row = {}
        for k, v in row.items():
            if isinstance(v, float):
                if math.isnan(v) or math.isinf(v):
                    clean_row[k] = None
                else:
                    clean_row[k] = v
            else:
                clean_row[k] = v
        table_data_safe.append(clean_row)

    # 4. DYNAMICALLY EXTRACT METADATA FROM UPLOADED CSV
    parsed_metadata = extract_metadata(lines)

    # Check your CSV file structure; adjust keys below matching your CSV header labels
    car_name = parsed_metadata.get("Car") or parsed_metadata.get("Vehicle") or "Unknown Car"
    track_name = parsed_metadata.get("Track") or parsed_metadata.get("Venue") or "Unknown Track"

    metadata_safe = make_json_safe({
        "Format": "AC pyTelemetry CSV",
        "Venue": track_name,
        "Vehicle": car_name,
        "Driver": "Ellis",
        "Sample Rate": "50",
        "Duration": table_data_safe[-1]["time"] if table_data_safe else None
    })

    return {
        "file": file.filename,
        "car": car_name,
        "track": track_name,
        "rows": len(df),
        "columns": list(df.columns),
        "data": table_data_safe,
        "metadata": metadata_safe
    }
