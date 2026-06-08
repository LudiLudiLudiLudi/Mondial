def test_app_boots(app):
    assert app is not None


def test_client_responds_404_on_unknown(client):
    resp = client.get("/no-such-route")
    assert resp.status_code == 404
