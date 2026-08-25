"""
Phase 1 Verification Script

Submits 50 jobs, waits for completion, and proves every job was claimed
exactly once by exactly one worker with attempt_count == 1.
"""

import sys
import time
from collections import Counter

import requests

API_URL = "http://localhost:8000/api/v1/jobs"
NUM_JOBS = 50
TIMEOUT = 120  # seconds


def submit_jobs():
    print(f"Submitting {NUM_JOBS} jobs...")
    job_ids = []
    for i in range(NUM_JOBS):
        resp = requests.post(
            API_URL,
            json={"name": f"phase1-verify-{i}", "payload": {"idx": i}},
        )
        resp.raise_for_status()
        job_ids.append(resp.json()["id"])
    print(f"Submitted {len(job_ids)} jobs.\n")
    return job_ids


def poll_until_done(job_ids, timeout=TIMEOUT):
    print("Waiting for all jobs to reach a terminal state...")
    id_set = set(job_ids)
    start = time.time()

    while time.time() - start < timeout:
        resp = requests.get(API_URL)
        resp.raise_for_status()
        all_jobs = resp.json()

        target = [j for j in all_jobs if j["id"] in id_set]
        remaining = [j for j in target if j["status"] not in ("COMPLETED", "FAILED")]

        elapsed = int(time.time() - start)
        print(f"  [{elapsed:>3d}s] {len(remaining):>2d} / {NUM_JOBS} still pending")

        if not remaining:
            return target

        time.sleep(2)

    raise TimeoutError(f"Jobs did not finish within {timeout}s")


def verify(jobs):
    print("\n" + "=" * 56)
    print("  PHASE 1 VERIFICATION RESULTS")
    print("=" * 56)

    # --- Count check ---
    print(f"\n  Submitted:  {NUM_JOBS}")
    print(f"  Returned:   {len(jobs)}")

    completed = [j for j in jobs if j["status"] == "COMPLETED"]
    failed = [j for j in jobs if j["status"] == "FAILED"]
    print(f"  Completed:  {len(completed)}")
    print(f"  Failed:     {len(failed)}")

    errors = []

    if len(jobs) != NUM_JOBS:
        errors.append(f"Expected {NUM_JOBS} jobs, got {len(jobs)}")

    # --- Per-job checks ---
    worker_counts = Counter()

    for j in jobs:
        jid = j["id"][:8]
        worker = j.get("claimed_by")
        attempts = j.get("attempt_count", 0)

        if not worker:
            errors.append(f"Job {jid}  claimed_by is NULL")
        else:
            worker_counts[worker] += 1

        if attempts != 1:
            errors.append(f"Job {jid}  attempt_count = {attempts} (expected 1)")

    # --- Summary ---
    print("\n  Worker distribution:")
    for w in sorted(worker_counts):
        print(f"    {w}: {worker_counts[w]}")
    total = sum(worker_counts.values())
    print(f"    {'-' * 20}")
    print(f"    Total: {total}")

    if errors:
        print(f"\n  ERRORS ({len(errors)}):")
        for e in errors:
            print(f"    - {e}")
        print("\n  RESULT: FAIL")
        return False

    print("\n  All jobs claimed exactly once.")
    print("  All attempt_count values = 1.")
    print("  No duplicate claims detected.")
    print("\n  RESULT: PASS")
    return True


if __name__ == "__main__":
    job_ids = submit_jobs()
    try:
        done_jobs = poll_until_done(job_ids)
        ok = verify(done_jobs)
        sys.exit(0 if ok else 1)
    except Exception as exc:
        print(f"\nFATAL: {exc}")
        sys.exit(1)
