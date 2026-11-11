import os
import sys


def pytest_unconfigure(config):
    # На Windows нативные потоки OpenCV иногда не дают интерпретатору завершиться после тестов.
    # Результаты уже выведены, поэтому выходим явно с правильным кодом. На Linux/в Docker не требуется.
    if sys.platform == "win32":
        import ctypes
        sys.stdout.flush()
        sys.stderr.flush()
        k32 = ctypes.windll.kernel32
        k32.TerminateProcess(k32.GetCurrentProcess(), getattr(config, "_picpac_status", 0))
        os._exit(getattr(config, "_picpac_status", 0))


def pytest_sessionfinish(session, exitstatus):
    session.config._picpac_status = int(exitstatus)
