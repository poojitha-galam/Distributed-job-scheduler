"""
verify_phase4.py -- Complete Phase 4 verification suite (5 tests + regression)

Tests:
  1. Concurrency limit enforced (queue with limit=2, 10 jobs, never > 2 active)
  2. Other queues unaffected (default queue works while limited queue is full)
  3. Pause stops claiming; resume restarts it
  4. Priority ordering (high-priority queue jobs claimed first)
  5. Delete guard (can't delete queue with active jobs; can delete empty)
  Regression: DLQ still works, scheduling still works
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
    deadline = time.time() + timeout
    while time.time() < deadline:
        j = get_job(job_id)
        if j["status"] == target:
            return j
        time.sleep(poll)
    return get_job(job_id)


def create_queue(name, priority=0, concurrency_limit=10):
    res = requests.post(f"{API}/queues", json={
        "name": name, "priority": priority, "concurrency_limit": concurrency_limit
    })
    if res.status_code == 409:
        # already exists, fetch it
        queues = requests.get(f"{API}/queues").json()
        for q in queues:
            if q["name"] == name:
                return q
    return res.json()


def delete_queue_api(queue_id):
    return requests.delete(f"{API}/queues/{queue_id}")


def get_queue_stats(queue_id):
    return requests.get(f"{API}/queues/{queue_id}").json()


# ---------------------------------------------------------------
# Test 1: Concurrency limit enforced
# ---------------------------------------------------------------
def test_1_concurrency_limit():
    header("Test 1: Concurrency limit enforced")

    q = create_queue("test-conc", priority=0, concurrency_limit=2)
    q_id = q["id"]
    print(f"  Created queue 'test-conc' (id={q_id[:8]}, limit=2)")

    # Submit 6 jobs with 5s work each
    job_ids = []
    for i in range(6):
        res = requests.post(f"{API}/jobs", json={
            "name": f"conc-job-{i}",
            "payload": {"work_seconds": 5},
            "queue_name": "test-conc"
        })
        job_ids.append(res.json()["id"])
    print(f"  Submitted 6 jobs with work_seconds=5")

    # Poll for 45s, check that at no point > 2 are CLAIMED+RUNNING
    max_active_seen = 0
    violation = False
    deadline = time.time() + 45
    while time.time() < deadline:
        stats = get_queue_stats(q_id)["stats"]
        active = stats["claimed"] + stats["running"]
        if active > max_active_seen:
            max_active_seen = active
        if active > 2:
            violation = True
            print(f"    VIOLATION: {active} active at once")
            break
        # Check if all done
        if stats["completed"] + stats["failed"] >= 6:
            break
        time.sleep(1)

    check("Never more than 2 CLAIMED+RUNNING simultaneously",
          not violation,
          f"max active seen: {max_active_seen}")

    # Wait for all to complete
    time.sleep(10)
    final_stats = get_queue_stats(q_id)["stats"]
    check(f"All 6 jobs completed (got {final_stats['completed']})",
          final_stats["completed"] >= 6,
          f"stats: {final_stats}")

    return q_id


# ---------------------------------------------------------------
# Test 2: Other queues unaffected
# ---------------------------------------------------------------
def test_2_other_queues_unaffected():
    header("Test 2: Other queues unaffected")

    # Submit a job to 'default' queue
    res = requests.post(f"{API}/jobs", json={
        "name": "default-queue-test",
        "payload": {"work_seconds": 2},
        "queue_name": "default"
    })
    job = res.json()
    job_id = job["id"]
    print(f"  Submitted job {job_id[:8]} to 'default' queue")

    j = wait_for_status(job_id, "COMPLETED", timeout=20)
    check("Default queue job completed normally",
          j["status"] == "COMPLETED",
          f"got {j['status']}")
    check("Job has queue_name='default'",
          j.get("queue_name") == "default",
          f"got queue_name={j.get('queue_name')}")


# ---------------------------------------------------------------
# Test 3: Pause stops claiming; resume restarts
# ---------------------------------------------------------------
def test_3_pause_resume():
    header("Test 3: Pause stops claiming; resume restarts")

    q = create_queue("test-pause-q", priority=0, concurrency_limit=10)
    q_id = q["id"]
    print(f"  Created queue 'test-pause-q' (id={q_id[:8]})")

    # Pause it
    res = requests.post(f"{API}/queues/{q_id}/pause")
    check("Queue paused", res.json()["paused"] is True)

    # Submit 3 jobs
    job_ids = []
    for i in range(3):
        res = requests.post(f"{API}/jobs", json={
            "name": f"pause-job-{i}",
            "payload": {"work_seconds": 2},
            "queue_name": "test-pause-q"
        })
        job_ids.append(res.json()["id"])
    print(f"  Submitted 3 jobs to paused queue")

    # Wait 10s, confirm none claimed
    time.sleep(10)
    statuses = [get_job(jid)["status"] for jid in job_ids]
    all_queued = all(s == "QUEUED" for s in statuses)
    check("All jobs still QUEUED while paused",
          all_queued,
          f"statuses: {statuses}")

    # Resume
    res = requests.post(f"{API}/queues/{q_id}/resume")
    check("Queue resumed", res.json()["paused"] is False)

    # Wait for jobs to complete
    print("  Waiting for jobs to complete after resume...")
    time.sleep(15)
    statuses = [get_job(jid)["status"] for jid in job_ids]
    all_done = all(s == "COMPLETED" for s in statuses)
    check("All jobs COMPLETED after resume",
          all_done,
          f"statuses: {statuses}")


# ---------------------------------------------------------------
# Test 4: Priority ordering
# ---------------------------------------------------------------
def test_4_priority():
    header("Test 4: Priority ordering")

    # Create high and low priority queues
    q_high = create_queue("test-high", priority=10, concurrency_limit=10)
    q_low = create_queue("test-low", priority=0, concurrency_limit=10)
    print(f"  Created 'test-high' (priority=10) and 'test-low' (priority=0)")

    # Submit low-priority jobs first, then high-priority
    low_ids = []
    for i in range(3):
        res = requests.post(f"{API}/jobs", json={
            "name": f"low-prio-{i}",
            "payload": {"work_seconds": 2},
            "queue_name": "test-low"
        })
        low_ids.append(res.json()["id"])

    high_ids = []
    for i in range(3):
        res = requests.post(f"{API}/jobs", json={
            "name": f"high-prio-{i}",
            "payload": {"work_seconds": 2},
            "queue_name": "test-high"
        })
        high_ids.append(res.json()["id"])

    print(f"  Submitted 3 low-priority then 3 high-priority jobs")

    # Wait for all to finish
    time.sleep(20)

    # Check: high-priority jobs should generally have been claimed earlier
    high_jobs = [get_job(jid) for jid in high_ids]
    low_jobs = [get_job(jid) for jid in low_ids]

    # Use started_at to determine claim order
    high_starts = [j["started_at"] for j in high_jobs if j["started_at"]]
    low_starts = [j["started_at"] for j in low_jobs if j["started_at"]]

    if high_starts and low_starts:
        earliest_high = min(high_starts)
        earliest_low = min(low_starts)
        check("High-priority jobs started before or around same time as low-priority",
              earliest_high <= earliest_low,
              f"earliest high: {earliest_high}, earliest low: {earliest_low}")
    else:
        check("Both queues had started_at timestamps", False,
              f"high_starts: {high_starts}, low_starts: {low_starts}")

    all_completed = all(j["status"] == "COMPLETED" for j in high_jobs + low_jobs)
    check("All priority test jobs completed", all_completed)


# ---------------------------------------------------------------
# Test 5: Delete guard
# ---------------------------------------------------------------
def test_5_delete_guard():
    header("Test 5: Delete guard")

    # Create queue with an active job
    q = create_queue("test-delete-guard", priority=0, concurrency_limit=10)
    q_id = q["id"]

    res = requests.post(f"{API}/jobs", json={
        "name": "delete-guard-job",
        "payload": {"work_seconds": 8},
        "queue_name": "test-delete-guard"
    })
    job_id = res.json()["id"]
    print(f"  Created queue 'test-delete-guard' with a running job")

    time.sleep(3)  # give it time to be claimed

    # Try to delete -- should fail
    del_res = delete_queue_api(q_id)
    check("DELETE rejected with active job",
          del_res.status_code == 409,
          f"got HTTP {del_res.status_code}")

    # Wait for job to finish
    wait_for_status(job_id, "COMPLETED", timeout=20)

    # Now delete should succeed
    del_res = delete_queue_api(q_id)
    check("DELETE succeeds after job completes",
          del_res.status_code == 204,
          f"got HTTP {del_res.status_code}")

    # Confirm it's gone
    get_res = requests.get(f"{API}/queues/{q_id}")
    check("Queue no longer exists",
          get_res.status_code == 404)


# ---------------------------------------------------------------
# Regression: DLQ
# ---------------------------------------------------------------
def test_regression_dlq():
    header("Regression: DLQ (fail_times=10, max_attempts=3)")

    res = requests.post(f"{API}/jobs", json={
        "name": "dlq-regression-p4",
        "payload": {"fail_times": 10, "work_seconds": 1}
    })
    job = res.json()
    job_id = job["id"]
    print(f"  Created job {job_id[:8]}")

    j = wait_for_status(job_id, "FAILED", timeout=45)
    check("Job is FAILED", j["status"] == "FAILED", f"got {j['status']}")

    time.sleep(2)
    dlq = requests.get(f"{API}/dlq").json()
    matching = [d for d in dlq if d["job_id"] == job_id]
    check("Job in DLQ", len(matching) == 1, f"found {len(matching)}")


# ---------------------------------------------------------------
# Regression: Scheduling
# ---------------------------------------------------------------
def test_regression_scheduling():
    header("Regression: Delayed job still works")

    run_at = datetime.now(timezone.utc) + timedelta(seconds=6)
    res = requests.post(f"{API}/jobs/scheduled", json={
        "name": "sched-regression-p4",
        "payload": {"work_seconds": 1},
        "scheduled_at": run_at.isoformat()
    })
    job = res.json()
    job_id = job["id"]
    print(f"  Created delayed job {job_id[:8]}")

    time.sleep(3)
    j = get_job(job_id)
    check("Still QUEUED before scheduled_at", j["status"] == "QUEUED", f"got {j['status']}")

    j = wait_for_status(job_id, "COMPLETED", timeout=20)
    check("COMPLETED after scheduled_at", j["status"] == "COMPLETED", f"got {j['status']}")


# ---------------------------------------------------------------
# Main
# ---------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 64)
    print("  Phase 4 -- Full Verification Suite")
    print("=" * 64)

    test_1_concurrency_limit()
    test_2_other_queues_unaffected()
    test_3_pause_resume()
    test_4_priority()
    test_5_delete_guard()
    test_regression_dlq()
    test_regression_scheduling()

    header("RESULTS")
    total = PASS_COUNT + FAIL_COUNT
    print(f"  {PASS_COUNT}/{total} checks passed")
    if FAIL_COUNT > 0:
        print(f"  {FAIL_COUNT} FAILED")
        sys.exit(1)
    else:
        print("  ALL CHECKS PASSED")
        sys.exit(0)
