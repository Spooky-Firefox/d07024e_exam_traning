# 10 · Go concurrency (and processes vs threads)

Sources: [2026 L2 Building distributed systems in Go](../D7024E_Lectures_2026/D7024E_L2_Practical_Lesson_v1.pdf), [2025 L2 Lab assignment, Kademlia and actors](../D7024E%20Lecture%20slides/D7024E_L2_kademlia_and_actors.pdf) (actor model in Elixir), [2025 Practical lesson](../D7024E%20Lecture%20slides/D7024E_PracticalLesson.pdf), the processes/threads slides of [2025 L1](../D7024E%20Lecture%20slides/D7024E_L1_Introduction.pdf).

## Core ideas

### Distributed systems fail in many ways (2026 L2)

| Area | Failures | Defences |
|---|---|---|
| Process | crash, restart, pause | supervision, durable state, idempotent recovery |
| Network | lost, late, duplicated, reordered | deadlines, retries, IDs, deduplication |
| Time | clock skew, stale data, expired work | monotonic time, leases, explicit freshness |
| Load | bursts, full queues, exhaustion | bounds, back-pressure, load shedding |
| Data | partial writes, schema mismatch | validation, transactions, versioned formats |
| Code and ops | races, deadlocks, bad config | ownership, CI, observability, rollback |

One message has six possible stories: delivered, lost, delayed, duplicated, reordered, or the receiver crashed after acting on it. Every resilience strategy is a trade-off: a timeout limits waiting but does not stop remote work; a retry recovers loss but may duplicate effects and amplify overload; replication survives a machine but introduces consistency problems; a queue absorbs bursts but adds delay and a backlog to bound.

**How to start: shrink the world.** Contract → pure logic (no network, no clock) → one node handling one message → simulation of many nodes with chosen faults → real transport (encoding, sockets) → real system (processes, deployment). When a later stage fails, the earlier evidence tells you where to look.

### Goroutines

- A **goroutine** is a lightweight task scheduled by the **Go runtime**, multiplexed onto a smaller set of OS threads (M:N). Starting one (`go f()`) is cheap (KB of stack); you can run hundreds of thousands.
- Goroutines are not threads, but they **can still race** on shared memory.
- When `main` returns the program exits and all other goroutines die, even if unfinished. "How long is long enough to sleep?" is the wrong question: wait for them explicitly.
- **Every goroutine needs an owner, a stop signal and a join:** the owner starts it, decides when it stops (close its input channel or cancel its context) and waits for it to finish (`WaitGroup` or a done channel). Unowned goroutines leak and cannot be stopped.

### Channels

- A **typed, FIFO conduit plus synchronization**. A send/receive transfers a value *and* is a scheduling decision.
- **Unbuffered** (`make(chan T)`): a **rendezvous**; the send blocks until a receiver takes it.
- **Buffered** (`make(chan T, n)`): a bounded queue; send blocks only when full, receive only when empty.
- **Closed** (`close(ch)`): no more values; receivers drain then get the zero value with `ok == false`; `range ch` ends; **sending on a closed channel panics**. The producer that owns completion closes; receivers normally do not. Close is not cancellation (use `context`).
- `select` waits on several channel operations; with `default` it does not block.
- **A full channel forces an overload decision**: wait (with context cancellation; propagates back-pressure), **reject** (`default: return ErrOverloaded`, fail fast), or **drop** (only if the contract allows loss, e.g. metrics). Buffer size and full-queue behaviour are part of the API contract.

**Benefits of the channel abstraction (2025 Q4f), from local to global:**

- **Locally (inside a process):** communicate by passing values instead of sharing memory, so there is no data race on the passed value and ownership is explicit ("Don't communicate by sharing memory; share memory by communicating"). Synchronization and data transfer in one primitive. Bounded buffers give **back-pressure**. Pipelines, worker pools, fan-in/fan-out, event loops become simple to express. `select` plus `context` gives timeouts and cancellation.
- **Between processes / across the network:** the same abstraction appears as message passing: actors with mailboxes, sockets, message queues, Kafka topics, pub-sub channels. Immutable messages, FIFO order per channel, decoupled producers and consumers, explicit buffering and loss decisions: all the reasons channels work locally carry over to distributed systems, which have no shared memory at all.
- **In the lab:** a single goroutine owns the routing table and serves requests from a channel (actor style), so no locks are needed; a UDP read loop delivers replies into per-request channels (the pending-call map); α parallel FIND_NODE requests in a lookup each report back on a channel and the lookup `select`s on replies or the context deadline; and an **in-memory channel network** implements the same `Network` interface as UDP so hundreds of nodes run deterministically in one test with injected loss and delay.

### The actor model (2025 L2, Elixir/Erlang)

- An **actor** has private state and a **mailbox**; actors communicate only by sending **immutable messages asynchronously**. No shared memory.
- `spawn` starts a process, `send` enqueues, `receive` pattern-matches the first matching message (with an optional timeout).
- The mailbox **serializes** concurrent requests: many processes send in parallel, but each actor handles one message at a time, so its state needs no lock.
- Pattern: encapsulate state in one process, loop over messages, synchronous requests carry a reply address. Generalized as GenServer; plus supervision trees (restart crashed processes), distribution and hot code upgrade on the BEAM.
- The same idea works in Go: one goroutine owns the state and receives requests on a channel.

### Mutexes and other sync tools

- `sync.Mutex` protects an **invariant** ("this map is only touched while mu is held"), not just a line. Keep critical sections short and in-memory.
- **Never wait on the network while holding a lock**: copy what you need, unlock, then send. A mutex must not turn into a distributed lock.
- `sync.WaitGroup`: `Add(1)` before `go`, `defer Done()` inside, `Wait()` in the owner. Context asks workers to stop; the WaitGroup lets the owner see that they have stopped.
- **Channel or mutex? Choose by ownership.** Mutex: several goroutines share a small in-memory invariant (cache, map, counter). Channel: transfer work or ownership to another goroutine (event loop, bounded worker queue). Do not force channels on everything; do not use a channel as a disguised global.
- The classic race: `counter += 1` is read-then-write; 1 000 000 goroutines lose about 16 % of increments. Fix with a mutex, an atomic, or a single owning goroutine.
- Run tests with **`go test -race`**. But "data-race-free" is not "correct": the lecture's pending-map example has no data race, yet a reply arriving just as the caller times out can **send on a channel the caller just closed** and panic. Fix: transfer ownership exactly once (a `take` that removes and returns the entry under the lock), give the reply channel a buffer of 1, and never close it.

### context.Context

- Carries a **deadline**, a **cancellation** signal (`Done()` channel) and request-scoped values (trace IDs, not optional parameters).
- Pass it explicitly as the first parameter; never store it in a struct; never pass nil (use `context.TODO`); always `defer cancel()`.
- `WithTimeout`/`WithCancel` create a tree: cancelling a parent cancels every child; a child can expire sooner than its parent.
- A deadline limits *waiting*; it does not stop work already running on a remote node.

### Deadlocks in Go

- **Send with no receiver** on an unbuffered channel in the only goroutine: `fatal error: all goroutines are asleep - deadlock!`. The runtime only detects it when *every* goroutine is blocked; otherwise it hangs silently. Fix: a receiving goroutine or a buffer.
- **Two locks in opposite order** (transfer a→b and b→a concurrently): a cycle. Fix: **lock in a global order** (lowest ID first) or give the state a single owner goroutine.
- Every deadlock is a cycle of waiting (Coffman: mutual exclusion, hold-and-wait, no preemption, circular wait). Break one condition.

### Architecture for testability (hexagonal / ports and adapters)

- Keep the **Kademlia core** (routing table, lookup logic, message rules) free of sockets, clocks and storage. It talks to the world through **ports** (interfaces) like `Network{Send, Close}` and `Storage`.
- **Adapters:** a UDP adapter that owns the socket and a read loop (bytes → messages → `node.Deliver`); a **channel adapter** (a map of in-memory channels) with the same interface; in-memory or PostgreSQL storage.
- Choose the adapter once in `main` from configuration; everything after is adapter-blind.
- **What the fake network buys:** no ports or privileges, no wall-clock waits (a cluster boots and runs in milliseconds), **fault injection** (drop, delay, duplicate, reorder, partition on demand), hundreds of nodes in one process, deterministic reruns in CI. It cannot catch encoding bugs, MTU limits, kernel buffers or real latency, so replace exactly one adapter at a time.
- Testing advice (both years): **test early**, table-driven tests, arrange–act–assert, tests as executable documentation. Repo layout: `cmd/` (thin wiring), `internal/` (compiler-enforced boundary), `pkg/` only for intentional public APIs.

### Process switching vs thread switching (2025 Q4e)

| Aspect | Process switch | Thread switch (same process) |
|---|---|---|
| What changes | address space, page tables, registers, kernel state | registers and stack only; address space shared |
| Cost | high: TLB flush (unless tagged), cold caches, possibly page faults | low: no TLB flush, caches stay warm |
| Isolation / security | strong: memory protection, a crash or bug stays inside the process | weak: any thread can corrupt shared memory; one crash kills all |
| Communication | IPC (pipes, sockets, shared memory segments): explicit, slower | shared memory: fast but needs synchronization (locks, races, deadlocks) |
| Generality | can run different programs, languages, users | same program |
| Development | simpler reasoning per process, explicit interfaces | harder: races, lock ordering, memory model |
| Scalability | across machines too (same model as distributed systems) | limited to one machine |

Going further down: **goroutine switches** are cheaper still (user-space, managed by the Go runtime, tiny stacks), and Erlang processes are similar. Trade-off summary: processes buy isolation and fault containment with switching cost and IPC overhead; threads buy speed and easy sharing with the risk of races; message passing between isolated units (processes, actors, goroutines with channels) is the pattern that scales out to distributed systems.

## Likely essay angles

- Process vs thread switching (2025 Q4e).
- Benefits of channels from local to global and in the lab (2025 Q4f).
- Testing concurrent Kademlia code is covered in [04](04-kademlia-dhts.md) (2025 Q4g and re-exam).

## Old exam questions

### Essay questions

- **2025 Q4e**: compare process switching and thread switching.
- **2025 Q4f**: key benefits of the channel abstraction, locally to globally, and in the lab.

There are no true/false statements specifically about Go yet; related statements on semaphores and shared memory are in [01](01-fundamentals.md).
