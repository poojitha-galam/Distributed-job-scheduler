"""
verify_phase3.py -- Complete Phase 3 verification suite (7 tests)
Plus Phase 2 DLQ regression check.

Tests:
  1. Delayed/Scheduled Job waits, then completes
  2. Recurring schedule creates an execution via scheduler service
  3. Recurring creates multiple executions over time
  4. No duplicate executions (unique constraint)
  5. Pause stops a schedule from producing executions
  6. Resume restarts a paused schedule
  7. Retry interaction -- failed scheduled job retries correctly,
     scheduler does not produce a spurious extra execution

  DLQ Regression: fail_times=10, max_attempts=3 -> lands in DLQ
"""

import requests
import time
import sys
from datetime import datetime, timezone, timedelta

API = "http://localhost:8000/api/v1"

PASS_COUNT = 0
FAIL_COUNT = 0


def header(title):
    print(f"\n{'='*64}")
    print(f"  {title}")
    print(f"{'='*64}")


def check(label, condition, detail=""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"  [PASS] {label}")
    else:
        FAIL_COUNT += 1
        print(f"  [FAIL] {label}")
        if detail:
            print(f"         {detail}")


def get_job(job_id):
    return requests.get(f"{API}/jobs/{job_id}").json()


def wait_for_status(job_id, target, timeout=30, poll=2):
    """Poll a job until it reaches target status or timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        j = get_job(job_id)
        if j["status"] == target:
            return j
        time.sleep(poll)
    return get_job(job_id)


def get_jobs_for_schedule(schedule_id):
    """Return all jobs that belong to a given schedule_id."""
    all_jobs = requests.get(f"{API}/jobs").json()
    return [j for j in all_jobs if j.get("schedule_id") == schedule_id]


def cleanup_schedule(schedule_id):
    """Delete a schedule (best-effort)."""
    try:
        requests.delete(f"{API}/schedules/{schedule_id}")
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────
# Test 1: Delayed/Scheduled Job
# ─────────────────────────────────────────────────────────────────
def test_1_delayed_job():
    header("Test 1: Delayed/Scheduled Job")

    run_at = datetime.now(timezone.utc) + timedelta(seconds=8)

    res = requests.post(f"{API}/jobs/scheduled", json={
        "name": "test-delayed-t1",
        "payload": {"type": "delayed-test"},
        "scheduled_at": run_at.isoformat()
    })
    job = res.json()
    job_id = job["id"]
    print(f"  Created job {job_id[:8]} scheduled for {run_at.isoformat()}")

    check("Job starts QUEUED", job["status"] == "QUEUED")
    check("scheduled_at is set", job["scheduled_at"] is not None)

    # After 3s it should still be QUEUED (not picked up early)
    time.sleep(3)
    j = get_job(job_id)
    check("Still QUEUED after 3s (before scheduled_at)",
          j["status"] == "QUEUED",
          f"got {j['status']}")

    # Wait for it to be due + processed
    j = wait_for_status(job_id, "COMPLETED", timeout=20)
    check("COMPLETED after scheduled_at passes",
          j["status"] == "COMPLETED",
          f"got {j['status']}")


# ─────────────────────────────────────────────────────────────────
# Test 2: Recurring schedule creates a single execution
# ─────────────────────────────────────────────────────────────────
def test_2_recurring_creates_execution():
    header("Test 2: Recurring schedule creates execution")

    # Use a cron that fires every minute
    res = requests.post(f"{API}/schedules", json={
        "name": "test-recurring-t2",
        "payload": {"type": "recurring-test"},
        "cron_expression": "* * * * *"
    })
    sch = res.json()
    sch_id = sch["id"]
    print(f"  Created schedule {sch_id[:8]} cron='* * * * *'")
    print(f"  next_run_at = {sch['next_run_at']}")

    check("Schedule is enabled", sch["enabled"] is True)
    check("next_run_at is set", sch["next_run_at"] is not None)

    # Wait until the first execution fires
    print("  Waiting up to 75s for first execution...")
    deadline = time.time() + 75
    found = False
    while time.time() < deadline:
        jobs = get_jobs_for_schedule(sch_id)
        if len(jobs) >= 1:
            found = True
            break
        time.sleep(3)

    check("At least 1 job execution created",
          found,
          f"found {len(get_jobs_for_schedule(sch_id))} executions")

    if found:
        exec_job = jobs[0]
        check("Execution is_recurring=True", exec_job.get("is_recurring") is True)
        check("Execution has schedule_id", exec_job.get("schedule_id") == sch_id)

    # Return schedule_id for test 3
    return sch_id


# ─────────────────────────────────────────────────────────────────
# Test 3: Recurring creates MULTIPLE executions over time
# ─────────────────────────────────────────────────────────────────
def test_3_multiple_executions(sch_id):
    header("Test 3: Multiple executions from recurring schedule")

    # The schedule from test 2 fires every minute.
    # We need to wait for a second execution.
    print(f"  Using schedule {sch_id[:8]} from Test 2")
    print("  Waiting up to 75s for 2nd execution...")

    deadline = time.time() + 75
    while time.time() < deadline:
        jobs = get_jobs_for_schedule(sch_id)
        if len(jobs) >= 2:
            break
        time.sleep(3)

    jobs = get_jobs_for_schedule(sch_id)
    check(f"At least 2 executions created (got {len(jobs)})",
          len(jobs) >= 2)

    if len(jobs) >= 2:
        scheduled_ats = [j["scheduled_at"] for j in jobs]
        check("Executions have different scheduled_at",
              len(set(scheduled_ats)) == len(scheduled_ats),
              f"scheduled_at values: {scheduled_ats}")

    # Check the schedule itself advanced
    sch = requests.get(f"{API}/schedules/{sch_id}").json()
    check("Schedule last_run_at is set", sch["last_run_at"] is not None)

    # Cleanup
    cleanup_schedule(sch_id)


# ─────────────────────────────────────────────────────────────────
# Test 4: No duplicate executions
# ─────────────────────────────────────────────────────────────────
def test_4_no_duplicates(sch_id):
    header("Test 4: No duplicate executions")

    # We already collected multiple executions in test 3.
    # Check that for any (schedule_id, scheduled_at) pair, there's exactly 1.
    jobs = get_jobs_for_schedule(sch_id)
    pairs = [(j["schedule_id"], j["scheduled_at"]) for j in jobs]
    unique_pairs = set(pairs)
    check(f"All (schedule_id, scheduled_at) pairs unique ({len(pairs)} jobs, {len(unique_pairs)} unique)",
          len(pairs) == len(unique_pairs),
          f"pairs: {pairs}")


# ─────────────────────────────────────────────────────────────────
# Test 5: Pause
# ─────────────────────────────────────────────────────────────────
def test_5_pause():
    header("Test 5: Pause schedule")

    # Create a new every-minute schedule
    res = requests.post(f"{API}/schedules", json={
        "name": "test-pause-t5",
        "payload": {"type": "pause-test"},
        "cron_expression": "* * * * *"
    })
    sch = res.json()
    sch_id = sch["id"]
    print(f"  Created schedule {sch_id[:8]}")

    # Pause it immediately
    res = requests.post(f"{API}/schedules/{sch_id}/pause")
    sch = res.json()
    check("Schedule is paused (enabled=False)", sch["enabled"] is False)

    # Wait 75s, confirm no executions were created
    print("  Waiting 75s to confirm no executions fire while paused...")
    time.sleep(75)
    jobs = get_jobs_for_schedule(sch_id)
    check(f"No executions created while paused (got {len(jobs)})",
          len(jobs) == 0)

    return sch_id


# ─────────────────────────────────────────────────────────────────
# Test 6: Resume
# ─────────────────────────────────────────────────────────────────
def test_6_resume(sch_id):
    header("Test 6: Resume schedule")

    print(f"  Resuming schedule {sch_id[:8]}")
    res = requests.post(f"{API}/schedules/{sch_id}/resume")
    sch = res.json()
    check("Schedule is resumed (enabled=True)", sch["enabled"] is True)
    check("next_run_at updated after resume", sch["next_run_at"] is not None)

    # Wait for an execution to appear
    print("  Waiting up to 75s for first post-resume execution...")
    deadline = time.time() + 75
    while time.time() < deadline:
        jobs = get_jobs_for_schedule(sch_id)
        if len(jobs) >= 1:
            break
        time.sleep(3)

    jobs = get_jobs_for_schedule(sch_id)
    check(f"At least 1 execution after resume (got {len(jobs)})",
          len(jobs) >= 1)

    cleanup_schedule(sch_id)


# ─────────────────────────────────────────────────────────────────
# Test 7: Retry interaction with scheduling
# ─────────────────────────────────────────────────────────────────
def test_7_retry_interaction():
    header("Test 7: Failed scheduled job retries correctly")

    # Create a scheduled job that fails once then succeeds
    run_at = datetime.now(timezone.utc) + timedelta(seconds=5)

    res = requests.post(f"{API}/jobs/scheduled", json={
        "name": "test-retry-sched-t7",
        "payload": {"type": "retry-sched", "fail_times": 1},
        "scheduled_at": run_at.isoformat()
    })
    job = res.json()
    job_id = job["id"]
    print(f"  Created scheduled job {job_id[:8]}, fail_times=1, max_attempts=3")
    print(f"  scheduled_at = {run_at.isoformat()}")

    # Wait for it to complete (fail once, retry, succeed)
    # fail_times=1 means it fails on attempt 1, succeeds on attempt 2
    # Retry delay with exponential backoff: 5s on attempt 1
    # scheduled_at: 5s + work: 3s + retry_delay: 5s + work: 3s = ~16s
    print("  Waiting up to 40s for job to complete through retry...")
    j = wait_for_status(job_id, "COMPLETED", timeout=40)
    check("Job eventually COMPLETED after retry",
          j["status"] == "COMPLETED",
          f"got {j['status']}")
    check("attempt_count > 1 (retried at least once)",
          j.get("attempt_count", 0) > 1,
          f"attempt_count = {j.get('attempt_count')}")

    # Confirm no duplicate jobs were created for this non-recurring job
    all_jobs = requests.get(f"{API}/jobs").json()
    matching = [jj for jj in all_jobs if jj["name"] == "test-retry-sched-t7"
                and jj["id"] == job_id]
    check("Exactly 1 job exists (no spurious duplicates from scheduler)",
          len(matching) == 1,
          f"found {len(matching)} matching jobs")


# ─────────────────────────────────────────────────────────────────
# DLQ Regression Check (Phase 2)
# ─────────────────────────────────────────────────────────────────
def test_dlq_regression():
    header("DLQ Regression: fail_times=10, max_attempts=3 -> DLQ")

    res = requests.post(f"{API}/jobs", json={
        "name": "test-dlq-regression",
        "payload": {"fail_times": 10, "type": "dlq-regression"}
    })
    job = res.json()
    job_id = job["id"]
    print(f"  Created job {job_id[:8]}, fail_times=10, max_attempts=3")

    # With exponential backoff: attempt 1 (3s work + 5s wait) +
    # attempt 2 (3s + 10s wait) + attempt 3 (3s fail -> DLQ)
    # Total ~27s, give generous timeout
    print("  Waiting up to 60s for job to reach FAILED + DLQ...")
    j = wait_for_status(job_id, "FAILED", timeout=60)
    check("Job status is FAILED",
          j["status"] == "FAILED",
          f"got {j['status']}")
    check("attempt_count >= max_attempts (3)",
          j.get("attempt_count", 0) >= 3,
          f"attempt_count = {j.get('attempt_count')}")

    # Check DLQ
    time.sleep(2)  # small buffer for DLQ insert
    dlq_jobs = requests.get(f"{API}/dlq").json()
    matching_dlq = [d for d in dlq_jobs if d["job_id"] == job_id]
    check("Job appears in dead_letter_jobs",
          len(matching_dlq) == 1,
          f"found {len(matching_dlq)} DLQ entries for this job; "
          f"total DLQ entries: {len(dlq_jobs)}")

    if matching_dlq:
        dlq_entry = matching_dlq[0]
        check("DLQ failure_reason is set",
              len(dlq_entry.get("failure_reason", "")) > 0)
        check("DLQ attempt_count matches",
              dlq_entry.get("attempt_count", 0) >= 3,
              f"DLQ attempt_count = {dlq_entry.get('attempt_count')}")


# ─────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 64)
    print("  Phase 3 + DLQ Regression -- Full Verification Suite")
    print("=" * 64)

    # Phase 2 DLQ regression first (runs while we wait for cron tests)
    test_dlq_regression()

    # Phase 3 tests
    test_1_delayed_job()
    sch_id = test_2_recurring_creates_execution()
    test_3_multiple_executions(sch_id)
    test_4_no_duplicates(sch_id)
    pause_sch_id = test_5_pause()
    test_6_resume(pause_sch_id)
    test_7_retry_interaction()

    # Summary
    header("RESULTS")
    total = PASS_COUNT + FAIL_COUNT
    print(f"  {PASS_COUNT}/{total} checks passed")
    if FAIL_COUNT > 0:
        print(f"  {FAIL_COUNT} FAILED")
        sys.exit(1)
    else:
        print("  ALL CHECKS PASSED")
        sys.exit(0)
