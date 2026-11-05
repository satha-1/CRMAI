import threading
import time


class FailureThrottle:
    """Blocks a key after too many recent failures.

    shortcut: counts live in one process and reset on restart, use Redis or Kong rate limiting with more than one replica.
    """

    def __init__(self, limit: int, window_seconds: int, max_keys: int = 10_000):
        self.limit = limit
        self.window = window_seconds
        self.max_keys = max_keys
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> list[float]:
        recent = [t for t in self._failures.get(key, []) if now - t < self.window]
        if recent:
            self._failures[key] = recent
        else:
            self._failures.pop(key, None)
        return recent

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key, time.monotonic())) >= self.limit

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            recent = self._recent(key, now)
            # Keeps memory bounded when someone tries many different emails.
            if not recent and len(self._failures) >= self.max_keys:
                self._failures.pop(next(iter(self._failures)))
            self._failures[key] = [*recent, now]

    def clear(self, key: str | None = None) -> None:
        with self._lock:
            if key is None:
                self._failures.clear()
            else:
                self._failures.pop(key, None)


login_throttle = FailureThrottle(limit=10, window_seconds=15 * 60)
