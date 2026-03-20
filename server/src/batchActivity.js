/**
 * 자산 수집 API가 한 번이라도 호출된 뒤에만 배치 스케줄러(5초 머클)가 동작합니다.
 * 일정 시간(기본 30초) 동안 수집 요청이 없으면 스케줄러는 아무 것도 하지 않습니다.
 */
let lastIngestAt = 0;

export function touchBatchActivity() {
  lastIngestAt = Date.now();
}

export function shouldRunBatchScheduler() {
  const idleMs = Number(process.env.BATCH_SCHEDULER_IDLE_MS || 30_000);
  if (lastIngestAt === 0) return false;
  return Date.now() - lastIngestAt <= idleMs;
}
