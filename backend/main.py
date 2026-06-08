import os
import pandas as pd
from fastapi import FastAPI
from io import StringIO
import json
import math
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException

app = FastAPI()

@app.get("/")
def root():
    return{"message":"Welcome to the dashboard"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base folder where all cars are stored
BASE_LOG_DIR = r"C:\Users\ellis\Documents\Assetto Corsa\apps\telemetrick\exported\si3v"

def get_folder_for_car_track(car: str, track: str):
    folder_path = os.path.join(BASE_LOG_DIR, car, track)
    if not os.path.exists(folder_path):
        raise ValueError(f"Folder not found for car '{car}' and track '{track}'")
    return folder_path

@app.get("/cars")
def list_cars():
    """List all available cars (folders in BASE_LOG_DIR)."""
    try:
        cars = [
            name for name in os.listdir(BASE_LOG_DIR)
            if os.path.isdir(os.path.join(BASE_LOG_DIR, name))
        ]
        return {"cars": cars}
    except Exception as e:
        raise HTTPException(status_code=400, detail="...")

@app.get("/tracks")
def list_tracks(car: str):
    """List all tracks for a given car."""
    car_folder = os.path.join(BASE_LOG_DIR, car)
    if not os.path.exists(car_folder):
        raise HTTPException(status_code=400, detail="...")
    
    tracks = [
        name for name in os.listdir(car_folder)
        if os.path.isdir(os.path.join(car_folder, name))
    ]
    return {"tracks": tracks}

def get_latest_csv(folder):
    csv_files = [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.endswith(".csv")
    ]
    if not csv_files:
        return None
    return max(csv_files, key=os.path.getctime)

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

def load_telemetry_data(csv_path):
    with open(csv_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find real telemetry start
    start_idx = None
    for i, line in enumerate(lines):
        if line.strip().lower().startswith("time"):
            start_idx = i
            break

    if start_idx is None:
        raise ValueError("Telemetry header not found")

    telemetry_block = "".join(lines[start_idx:])

    df = pd.read_csv(
        StringIO(telemetry_block),
        sep=",",
        engine="python",
        on_bad_lines="skip"
    )

    # Clean column names
    df.columns = [c.strip() for c in df.columns]

    # 🔥 REMOVE completely empty columns (huge fix)
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

@app.get("/telemetry")
def get_telemetry(car: str, track: str, window: int = 30):
    """
    Returns telemetry data filtered by time window.
    """

    try:
        folder = get_folder_for_car_track(car, track)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="...")

    latest_csv = get_latest_csv(folder)
    if not latest_csv:
        return {"error": f"No telemetry found for car '{car}' and track '{track}'"}

    # -----------------------------
    # LOAD DATAFRAME
    # -----------------------------
    df = load_telemetry_data(latest_csv)

    # Clean column names early
    df.columns = [c.strip() for c in df.columns]

    # Ensure time column exists
    if "time" not in df.columns:
        df.rename(columns={df.columns[0]: "time"}, inplace=True)

    # -----------------------------
    # FORCE NUMERIC TIME (IMPORTANT FIX)
    # -----------------------------
    df["time"] = pd.to_numeric(df["time"], errors="coerce")
    df = df.dropna(subset=["time"])

    # Sort by time (VERY IMPORTANT for charts)
    df = df.sort_values("time").reset_index(drop=True)

    # -----------------------------
    # TIME WINDOW FILTER (RELATIVE START)
    # -----------------------------
    start_time = df["time"].iloc[0]
    end_time = start_time + window

    df = df[(df["time"] >= start_time) & (df["time"] <= end_time)]

    # -----------------------------
    # CONVERT TO JSON
    # -----------------------------
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

    metadata_safe = make_json_safe({
        "Format": "AC pyTelemetry CSV",
        "Venue": track,
        "Vehicle": car,
        "Driver": "Ellis",
        "Sample Rate": "50",
        "Duration": table_data_safe[-1]["time"] if table_data_safe else None
    })

    return {
        "file": os.path.basename(latest_csv),
        "car": car,
        "track": track,
        "rows": len(df),
        "columns": list(df.columns),
        "data": table_data_safe,
        "metadata": metadata_safe
    }
