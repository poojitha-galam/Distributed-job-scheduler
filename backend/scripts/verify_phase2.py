"""
Phase 2 Verification Script
Tests: retry with backoff, DLQ landing, and that jobs don't zombie-loop.
"""
import requests
import time
import sys

API_URL = "http://localhost:8000/api/v1"

def p(msg):
    print(f"[*] {msg}")

def test_retry_then_succeed():
    """Submit a job that fails twice then succeeds (fail_times=2, max_attempts=3)."""
    p("--- Test 1: Retry then succeed ---")
    res = requests.post(f"{API_URL}/jobs", json={
        "name": "test-retry-succeed",
        "payload": {"fail_times": 2}
    })
    res.raise_for_status()
    job_id = res.json()["id"]
    p(f"Job created: {job_id}")

    start = time.time()
    while time.time() - start < 90:
        j = requests.get(f"{API_URL}/jobs/{job_id}").json()
        p(f"  Status={j['status']}  attempt={j['attempt_count']}  next_retry={j.get('next_retry_at')}")
        if j["status"] == "COMPLETED":
            p(f"  PASS: completed on attempt {j['attempt_count']}")
            assert j["attempt_count"] == 3, f"Expected attempt 3 but got {j['attempt_count']}"
            return True
        if j["status"] == "FAILED":
            p("  FAIL: should not have failed (only 2 fail_times with 3 max_attempts)")
            return False
        time.sleep(3)

    p("  FAIL: timed out waiting for COMPLETED")
    return False


def test_dlq_landing():
    """Submit a job that fails all 3 attempts and should land in DLQ."""
    p("--- Test 2: DLQ landing ---")
    res = requests.post(f"{API_URL}/jobs", json={
        "name": "test-dlq-landing",
        "payload": {"fail_times": 999}  # always fails
    })
    res.raise_for_status()
    job_id = res.json()["id"]
    p(f"Job created: {job_id}")

    start = time.time()
    while time.time() - start < 90:
        j = requests.get(f"{API_URL}/jobs/{job_id}").json()
        p(f"  Status={j['status']}  attempt={j['attempt_count']}")
        if j["status"] == "FAILED":
            p(f"  Job reached FAILED on attempt {j['attempt_count']}")
            break
        time.sleep(3)
    else:
        p("  FAIL: timed out waiting for FAILED")
        return False

    # Verify it's in DLQ
    dlq = requests.get(f"{API_URL}/dlq").json()
    in_dlq = any(d["job_id"] == job_id for d in dlq)
    if not in_dlq:
        p("  FAIL: Job not found in DLQ!")
        return False
    p("  PASS: Job is in DLQ")

    # Wait 15 seconds and verify it stays FAILED (not zombie-looping)
    p("  Waiting 15s to verify no zombie loop...")
    time.sleep(15)
    j2 = requests.get(f"{API_URL}/jobs/{job_id}").json()
    if j2["status"] != "FAILED":
        p(f"  FAIL: Job status changed to {j2['status']} (zombie loop!)")
        return False
    p(f"  PASS: Job still FAILED after 15s (attempt_count={j2['attempt_count']})")
    return True


def test_dlq_retry():
    """Retry a job from the DLQ and confirm it gets processed."""
    p("--- Test 3: DLQ retry ---")
    dlq = requests.get(f"{API_URL}/dlq").json()
    if not dlq:
        p("  SKIP: No DLQ items to retry")
        return True

    dlq_item = dlq[0]
    dlq_id = dlq_item["id"]
    job_id = dlq_item["job_id"]
    p(f"  Retrying DLQ item {dlq_id[:8]} (job {job_id[:8]})")

    res = requests.post(f"{API_URL}/dlq/{dlq_id}/retry")
    res.raise_for_status()
    p("  Retry request sent")

    # The job has fail_times=999, so it'll fail again — just verify it cycles correctly
    start = time.time()
    while time.time() - start < 90:
        j = requests.get(f"{API_URL}/jobs/{job_id}").json()
        p(f"  Status={j['status']}  attempt={j['attempt_count']}")
        if j["status"] == "FAILED":
            p("  PASS: DLQ-retried job re-failed as expected")
            return True
        time.sleep(3)

    p("  FAIL: timed out")
    return False


if __name__ == "__main__":
    results = []
    results.append(("Retry then succeed", test_retry_then_succeed()))
    results.append(("DLQ landing", test_dlq_landing()))
    results.append(("DLQ retry", test_dlq_retry()))

    p("")
    p("=== RESULTS ===")
    all_pass = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        p(f"  {status}: {name}")
        if not passed:
            all_pass = False

    if not all_pass:
        p("SOME TESTS FAILED")
        sys.exit(1)
    else:
        p("ALL TESTS PASSED")
