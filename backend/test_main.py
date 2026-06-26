from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message":"Welcome to the dashboard"}


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
