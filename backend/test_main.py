import importlib
import os

os.environ.setdefault("FRONTEND_ORIGINS", "https://example.com")

from fastapi.testclient import TestClient
from main import MAX_UPLOAD_SIZE_BYTES, PRIORITY_1_FIELDS, app

client = TestClient(app)

PRIORITY_COLUMNS = [
    "time", "Lap Time", "Lap Distance", "Lap Number", "Ground Speed",
    "Throttle Pos", "Brake Pos", "Steering Angle", "Gear", "Engine RPM",
    "Brake Torque FL", "Brake Torque FR", "Brake Torque RL", "Brake Torque RR",
    "Wheel Angular Speed FL", "Wheel Angular Speed FR", "Wheel Angular Speed RL",
    "Wheel Angular Speed RR", "Car Coord X", "Car Coord Y", "Car Coord Z", "Car Heading",
]


def telemetry_csv(rows, extra_columns=None):
    columns = PRIORITY_COLUMNS + (extra_columns or [])
    header = ",".join(columns)
    row_text = []
    for row in rows:
        time, *values = row if isinstance(row, tuple) else (row,)
        values = ["1"] * (len(columns) - 1) if not values else values + ["1"] * (len(columns) - 2)
        row_text.append(",".join([str(time), *map(str, values)]))
    return "\n".join(["Car,Demo Car", "Track,Demo Track", *(["Metadata,Test"] * 8), header, *row_text])


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message":"Welcome to the dashboard"}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_telemetry_endpoint_accepts_csv_upload():
    csv_content = telemetry_csv([0, 1], ["Unneeded Field"])

    response = client.post(
        "/telemetry",
        files={"file": ("telemetry.csv", csv_content, "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["file"] == "telemetry.csv"
    assert payload["car"] == "Demo Car"
    assert payload["track"] == "Demo Track"
    assert payload["rows"] == 2
    assert set(payload["columns"]) == PRIORITY_1_FIELDS
    assert "Unneeded Field" not in payload["columns"]
    assert payload["data"][0]["time"] == 0


def test_telemetry_serializes_non_finite_values_as_null():
    response = client.post(
        "/telemetry",
        files={
            "file": (
                "telemetry.csv",
                telemetry_csv([(0, 100), ("inf", 110), (2, "inf")]),
                "text/csv",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert [row["time"] for row in payload["data"]] == [0, 2, None]
    assert payload["data"][1]["Lap Time"] is None
    assert all(set(row) == PRIORITY_1_FIELDS for row in payload["data"])


def test_cors_preflight_allows_configured_methods():
    response = client.options(
        "/telemetry",
        headers={
            "Origin": "https://example.com",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert "POST" in response.headers["access-control-allow-methods"]


def test_cors_falls_back_to_localhost_when_no_environment_origin_is_configured(monkeypatch):
    monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)
    monkeypatch.delenv("FRONTEND_URL", raising=False)

    import main

    reloaded_main = importlib.reload(main)
    reloaded_client = TestClient(reloaded_main.app)

    response = reloaded_client.options(
        "/telemetry",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_telemetry_rejects_non_csv_extension():
    response = client.post(
        "/telemetry",
        files={"file": ("telemetry.txt", "time,speed\n0,100", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported file type. Please upload a CSV file."


def test_telemetry_rejects_large_upload():
    response = client.post(
        "/telemetry",
        files={"file": ("telemetry.csv", b"x" * (MAX_UPLOAD_SIZE_BYTES + 1), "text/csv")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Uploaded file is too large. Maximum size is 50 MB."


def test_telemetry_rejects_missing_time_header():
    response = client.post(
        "/telemetry",
        files={"file": ("telemetry.csv", "speed,rpm\n100,5000", "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Telemetry header ('Time') not found in the file."


def test_telemetry_rejects_missing_priority_columns():
    response = client.post(
        "/telemetry",
        files={"file": ("telemetry.csv", "time,Ground Speed\n0,100", "text/csv")},
    )

    assert response.status_code == 400
    assert "missing required Priority 1 telemetry columns" in response.json()["detail"]


def test_telemetry_ignores_window_query_and_returns_full_session():
    response = client.post(
        "/telemetry?window=1",
        files={"file": ("telemetry.csv", telemetry_csv([0, 47]), "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rows"] == 2
    assert payload["metadata"]["Duration"] == 47
