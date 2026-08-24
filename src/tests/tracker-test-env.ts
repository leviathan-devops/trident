// THE TEST-DB ISOLATION (2026-08-24 — the production-wipe incident): sets the
// tracker override BEFORE wave-tracker's module body runs. MUST be the FIRST
// import of any test file touching WaveTracker (module bodies execute in
// import order — this side-effect lands first).
process.env.TRIDENT_TRACKER_DB = '/tmp/opencode/test-trident-waves.sqlite';
