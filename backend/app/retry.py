def compute_delay_seconds(policy: str, attempt: int) -> int:
    """
    Compute the delay in seconds before the next retry, based on the policy and attempt number.
    attempt is the 1-based index of the *next* attempt.
    For example, if attempt_count=1 just failed, we compute delay for attempt=2.
    Wait, the prompt says `compute_delay_seconds(job.retry_policy, job.attempt_count)`.
    So if attempt_count=1 just failed, we pass 1.
    - fixed: always 5
    - linear: 5 * attempt  (5, 10, 15, 20...)
    - exponential: 5 * (2 ** (attempt - 1))  (5, 10, 20, 40...)
    """
    if policy == "fixed":
        return 5
    elif policy == "linear":
        return 5 * attempt
    elif policy == "exponential":
        return 5 * (2 ** (attempt - 1))
    else:
        # Default fallback
        return 5
