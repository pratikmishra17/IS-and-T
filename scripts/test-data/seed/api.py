"""A tiny client for the test backend: logs in as someone and calls the API the way the browser does
(session cookie plus the XSRF token header), so every rule the app has applies to the test data too.

start.sh sets the environment variables read here (from .state/secrets.env)."""
import http.cookiejar
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

PORT = os.environ.get("TEST_BACKEND_PORT", "8090")
BASE = f"http://localhost:{PORT}"
STATE = os.environ.get("TEST_STATE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".state"))


def secret(name):
    """A value from the environment, or from .state/secrets.env when the script is run on its own."""
    if name in os.environ:
        return os.environ[name]
    with open(os.path.join(STATE, "secrets.env")) as f:
        for line in f:
            if line.startswith(name + "="):
                return line.strip().split("=", 1)[1]
    raise KeyError(f"{name} isn't set: run start.sh, which makes .state/secrets.env")


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"{status}: {body}")
        self.status = status
        self.body = body


class Session:
    """One browser: its own cookies, optionally logged in."""

    def __init__(self, email=None, password=None, portal=None):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.call("GET", "/api/auth/me")  # hands out the XSRF-TOKEN cookie
        self.me = None
        if email:
            self.me = self.call("POST", "/api/auth/login", {"email": email, "password": password, "portal": portal})

    def token(self):
        return next((c.value for c in self.jar if c.name == "XSRF-TOKEN"), None)

    def call(self, method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if method != "GET" and self.token():
            req.add_header("X-XSRF-TOKEN", self.token())
        try:
            with self.opener.open(req) as res:
                raw = res.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise ApiError(e.code, e.read().decode()) from None

    def get(self, path):
        return self.call("GET", path)

    def post(self, path, body=None):
        return self.call("POST", path, body if body is not None else {})

    def put(self, path, body):
        return self.call("PUT", path, body)

    def delete(self, path):
        return self.call("DELETE", path)


def admin():
    return Session(secret("ADMIN_EMAIL"), secret("ADMIN_PASSWORD"), "ADMIN")


def student(email):
    return Session(email, secret("STUDENT_PASSWORD"), "STUDENT")


def set_password_from_email(email, password):
    """The test backend has no Gmail password, so it prints emails to its log instead of sending them:
    find the newest set-password link for this address there and use it, like the student would."""
    for _ in range(20):
        with open(os.path.join(STATE, "backend.log")) as f:
            log = f.read()
        blocks = [b for b in log.split("To:") if email in b.split("\n", 1)[0]]
        tokens = re.findall(r"set-password\?token=([A-Za-z0-9%_\-.~]+)", blocks[-1]) if blocks else []
        if tokens:
            Session().post("/api/auth/set-password", {"token": urllib.parse.unquote(tokens[-1]), "password": password})
            return
        time.sleep(0.5)
    raise RuntimeError(f"no set-password email for {email} in the backend log")
