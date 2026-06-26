import os
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from io import StringIO
import json
import math
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

allowed_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", os.getenv("FRONTEND_URL", "*")).split(",")
    if origin.strip()
]

@app.get("/")
def root():
    return {"message": "Welcome to the dashboard"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

def extract_metadata(lines):
    metadata = {}
    for line in lines[:10]:
        if "," in line:
            key, value = line.strip().split(",", 1)
            metadata[key.strip()] = value.strip()
    return metadata

def extract_vehicle_params(lines):
    params = {}
    header = lines[10].strip().split(",")
    units = lines[11].strip().split(",")
    values = lines[12].strip().split(",")
    for h, u, v in zip(header, units, values):
        params[h] = {"unit": u, "value": v}
    return params

def extract_car_setup(lines):
    setup = {}
    header = lines[14].strip().split(",")
    units = lines[15].strip().split(",")
    values = lines[16].strip().split(",")
    for h, u, v in zip(header, units, values):
        setup[h] = {"unit": u, "value": v}
    return setup

def load_telemetry_data_from_lines(lines):
    """Finds telemetry data from split text lines in memory."""
    start_idx = None
    for i, line in enumerate(lines):
        if line.strip().lower().startswith("time"):
            start_idx = i
            break

    if start_idx is None:
        raise ValueError("Telemetry header ('Time') not found in the file.")

    telemetry_block = "\n".join(lines[start_idx:])

    df = pd.read_csv(
        StringIO(telemetry_block),
        sep=",",
        engine="python",
        on_bad_lines="skip"
    )

    # Clean column names
    df.columns = [c.strip() for c in df.columns]

    # Remove completely empty columns
    df = df.dropna(axis=1, how="all")

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
async def get_telemetry(file: UploadFile = File(...), window: int = Query(30)):
    """
    Accepts a telemetry CSV file via upload and returns filtered data.
    """
    # 1. Read file stream from memory
    try:
        contents = await file.read()
        # Decode binary bytes to a clean list of text lines
        lines = contents.decode("utf-8").splitlines()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    # 2. Extract telemetry dataframe using memory-lines
    try:
        df = load_telemetry_data_from_lines(lines)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Ensure time column exists
    if "time" not in df.columns:
        df.rename(columns={df.columns[0]: "time"}, inplace=True)

    # FORCE NUMERIC TIME
    df["time"] = pd.to_numeric(df["time"], errors="coerce")
    df = df.dropna(subset=["time"])

    # Sort by time
    df = df.sort_values("time").reset_index(drop=True)

    # 3. TIME WINDOW FILTER (RELATIVE START)
    if not df.empty:
        start_time = df["time"].iloc[0]
        end_time = start_time + window
        df = df[(df["time"] >= start_time) & (df["time"] <= end_time)]

    # 4. CONVERT TO JSON
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

    # 5. DYNAMICALLY EXTRACT METADATA FROM UPLOADED CSV
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
