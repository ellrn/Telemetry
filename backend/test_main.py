import importlib
import os

os.environ.setdefault("FRONTEND_ORIGINS", "https://example.com")

from fastapi.testclient import TestClient
from main import MAX_UPLOAD_SIZE_BYTES, app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message":"Welcome to the dashboard"}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_telemetry_endpoint_accepts_csv_upload():
    csv_content = "\n".join([
        "Car,Demo Car",
        "Track,Demo Track",
        "Driver,Ellis",
        "Session,Test",
        "Date,2026-06-26",
        "Sample Rate,50",
        "Note,Test",
        "Extra,Test",
        "Extra2,Test",
        "Extra3,Test",
        "time,speed,rpm",
        "s,km/h,rpm",
        "0,100,5000",
        "1,110,5200",
    ])

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
    assert payload["columns"] == ["time", "speed", "rpm"]
    assert payload["data"][0]["time"] == 0


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


def test_telemetry_ignores_window_query_and_returns_full_session():
    response = client.post(
        "/telemetry?window=1",
        files={"file": ("telemetry.csv", "time,speed\n0,100\n47,120", "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rows"] == 2
    assert payload["metadata"]["Duration"] == 47
