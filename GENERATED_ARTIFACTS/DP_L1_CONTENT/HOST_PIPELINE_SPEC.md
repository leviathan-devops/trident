# HOST PIPELINE SPEC

## Purpose

The `host-pipeline` action simulates a full host deployment using two containers. It **sets up the environment only** — spawns containers, installs dependencies, deploys the plugin dist, seeds test data, and returns container names. The **caller** then runs the actual tool tests (connect, read, etc.) through the full tool dispatch path.

This separation ensures:
- The pipeline action does ONE job: environment setup
- The read tool is tested through its NORMAL dispatch path (schema validation → dispatch → JSON response)
- Tests can be re-run without re-spawning containers

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ CALLER (this session)                                      │
│ 1. trident-container-test action=host-pipeline distPath=.. │
│ 2. trident-container-test action=connect containerName=..  │
│ 3. trident-container-test action=read offset=0 limit=50    │
└──────────────────────────┬─────────────────────────────────┘
                           │
              spawns 2 containers (step 1)
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌──────────────────────┐        ┌──────────────────────────┐
│ host-sim             │        │ target                   │
│ - docker socket      │        │ - tmux + pipe-pane       │
│ - plugin dist        │        │ - /tmp/stream.txt        │
│ - opencode agent     │        │ - N lines seed data      │
│ - docker CLI + tmux  │        │ - sleep infinity in tmux │
└──────────────────────┘        └──────────────────────────┘
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `distPath` | string | required | Path to plugin dist directory on host |
| `image` | string | runtime-grade-container-sandbox:master | Container image for both containers |
| `targetLines` | number | 100 | Number of test data lines to seed |
| `cleanup` | boolean | true | Remove containers after pipeline completes |

## Flow

### 1. Spawn host-sim container
- `docker run -d --name host-sim-xxx -v /var/run/docker.sock runtime-grade-container-sandbox:master tail -f /dev/null`
- Docker socket mounted so host-sim can access docker (used for verification, not for pipeline testing)

### 2. Spawn target container
- `docker run -d --name target-xxx runtime-grade-container-sandbox:master tail -f /dev/null`

### 3. Install tmux in target, start stream, keep command in pane
- `apt-get install -y tmux`
- `tmux new-session -d -s test -x 240 -y 60`
- `tmux pipe-pane -t test -o "cat >> /tmp/stream.txt"`
- `tmux send-keys -t test "sleep infinity" Enter`
- `sleep infinity` keeps a command running so `assertContainerAlive()` passes for connect

### 4. Seed test data
- Generate N lines via `fs.writeFileSync()` on host
- `docker cp` seed file to target's `/tmp/stream.txt`
- Verify line count with `wc -l`

### 5. Deploy dist to host-sim (optional, for agent-in-container tests)
- `docker cp dist/. host-sim-xxx:/root/OPENCODE_WORKSPACE/dist`
- Create plugin symlink at `/root/.config/opencode/plugins/trident/dist`
- Patch `config.json` with plugin path + permissions

### 6. Install tmux + docker CLI in host-sim, launch opencode
- `apt-get install -y tmux docker.io`
- `tmux new-session -d -s test -x 240 -y 60`
- `tmux pipe-pane -t test -o "cat >> /tmp/stream.txt"`
- `opencode --agent trident` via `tmux send-keys`
- Wait 12s for opencode to be ready

### 7. Cleanup (if cleanup=true)
- `docker rm -f host-sim-xxx target-xxx`

## Return Value

```typescript
{
  hostContainer: string,   // Host-sim container name
  targetContainer: string, // Target container name
  targetLines: number,     // Lines seeded in target stream
  distDeployed: boolean,   // Dist was deployed to host-sim
}
```

## Caller Test Sequence

After `host-pipeline` returns, the caller runs:

```
connect → adopt target
  trident-container-test action=connect containerName=target-xxx
  → { connected: true, containerName: "target-xxx", streamPos: N }

read(0, 50) → test normal offset/limit
  trident-container-test action=read offset=0 limit=50
  → { text: "...50 lines...", lineCount: 50, nextOffset: 50 }

read(50, 30) → test offset navigation
  trident-container-test action=read offset=50 limit=30
  → { text: "...30 lines...", lineCount: 30, nextOffset: 80 }

read(0, 5) → test floor enforcement
  trident-container-test action=read offset=0 limit=5
  → { text: "...20 lines...", lineCount: 20, nextOffset: 20 }  ← floor=20

cleanup → remove containers
  trident-container-test action=stop remove=true containerName=target-xxx
  trident-container-test action=stop remove=true containerName=host-sim-xxx
```

This tests the FULL tool dispatch chain:
1. **Schema validation** — offset/limit accepted as number params
2. **`assertContainerAlive()`** — docker ps + tmux display-message
3. **`execInContainer()`** — docker exec cat reads target's stream
4. **`cleanEscapeCodes()`** — strip ANSI from raw terminal output
5. **`split('\n')`** — correct line boundaries
6. **`slice(offset, offset + limit)`** — precision offset navigation
7. **`Math.max(20, limit)`** — floor enforcement
8. **JSON response** — lineCount, nextOffset, truncated fields

## Design Decisions

1. **Pipeline sets up, caller tests**: Separating environment setup from test execution ensures the read tool is tested through its NORMAL dispatch path. The pipeline should NOT re-implement read logic internally.

2. **STATE manipulation is wrong**: The earlier approach of setting `STATE.containerName` to bypass tool dispatch was incorrect. It tested the JavaScript method but not the full tool chain (schema → dispatch → response).

3. **`sleep infinity` in target tmux**: `assertContainerAlive()` checks `tmux display-message` to verify TUI is alive. The target needs a running command in its tmux pane for this check to pass. Without this, `connect` returns `tui_dead`.

4. **`fs.writeFileSync` + `docker cp` for seeding**: Avoids shell escaping issues. Node.js writes the file natively, then docker cp transfers it byte-identical. Inline bash/python seed commands had recurring escaping bugs.

